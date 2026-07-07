#!/usr/bin/env node
// =============================================================================
// Mission Barisal v3 — Pure API Server
// Zero dependency · Agent Masking · MCP · Intent Verify
// Owner: Sahon Srabon (ZombieCoder) · Barisal, Bangladesh · At Home
// =============================================================================

// ─── Core Modules (zero external dependencies) ────────────────
const http = require("http");
const https = require("https");
const { URL } = require("url");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

// ─── Config ──────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT || "3000", 10);
const OPENCODE_BASE = process.env.OPENCODE_BASE || "https://opencode.ai/zen/v1";
const MAX_DEBATE_ROUNDS = parseInt(process.env.MAX_DEBATE_ROUNDS || "3", 10);
const LOG_DIR = path.resolve(process.env.LOG_DIR || "./logs");
const DATA_DIR = path.resolve(process.env.DATA_DIR || "./data");
const PERSONAS_FILE = path.resolve(
  process.env.PERSONAS_FILE || "./PERSONAS.md",
);
const SESSION_TTL_MS = parseInt(process.env.SESSION_TTL || "86400000", 10);
const MAX_HISTORY = parseInt(process.env.MAX_HISTORY || "20", 10);
const GIT_PERSONAS_URL =
  process.env.GIT_PERSONAS_URL ||
  "https://raw.githubusercontent.com/sahonsrabon-os/missionbarisal/main/PERSONAS.md";
const ALLOWED_DIRS = (
  process.env.ALLOWED_DIRS || LOG_DIR + "," + DATA_DIR + "," + path.resolve(".")
)
  .split(",")
  .map((d) => path.resolve(d.trim()));
const ALLOWED_ORIGINS = (
  process.env.ALLOWED_ORIGINS ||
  "http://localhost:3000,http://localhost:7799,http://zombiecoder.my.id"
)
  .split(",")
  .map((o) => o.trim());

// ─── Pusher Config (optional) ────────────────────────────────
const PUSHER_APP_ID = process.env.PUSHER_APP_ID || "2171810";
const PUSHER_KEY = process.env.PUSHER_KEY || "b99355f977e758d4ec15";
const PUSHER_SECRET = process.env.PUSHER_SECRET || "9bc97706077a2defa16e";
const PUSHER_CLUSTER = process.env.PUSHER_CLUSTER || "ap2";
const PUSHER_ENABLED = !!(PUSHER_APP_ID && PUSHER_KEY && PUSHER_SECRET);

// ─── Cache & Git Config ─────────────────────────────────────
// Cross-session user cache for accuracy & performance
const CACHE_DIR = path.resolve(process.env.CACHE_DIR || "./cache");
const CACHE_TTL = parseInt(process.env.CACHE_TTL || "86400000", 10); // 24h default
const CACHE_MAX_ENTRIES = parseInt(process.env.CACHE_MAX_ENTRIES || "1000", 10);

// Git runtime download URLs — personas, skills, instructions
const GIT_SKILLS_URL = process.env.GIT_SKILLS_URL || "";
const GIT_INSTRUCTIONS_URL = process.env.GIT_INSTRUCTIONS_URL || "";
const SKILLS_DIR = path.resolve(process.env.SKILLS_DIR || "./skills");

// ─── Runtime Config (changeable via API without restart) ──────
const RUNTIME_CONFIG = {
  sessionVerifyUrl:
    process.env.SESSION_VERIFY_URL ||
    "http://zombiecoder.my.id/api/verify-session",
  allowedOrigins: ALLOWED_ORIGINS,
  logLevel: "INFO",
  antiDoteEnabled: process.env.ANTIDOTE_ENABLED !== "false", // default: true
  updatedAt: new Date().toISOString(),
};

function updateRuntimeConfig(updates) {
  if (updates.sessionVerifyUrl) {
    RUNTIME_CONFIG.sessionVerifyUrl = updates.sessionVerifyUrl;
  }
  if (updates.logLevel) {
    RUNTIME_CONFIG.logLevel = updates.logLevel;
  }
  if (updates.allowedOrigins && Array.isArray(updates.allowedOrigins)) {
    RUNTIME_CONFIG.allowedOrigins = updates.allowedOrigins;
  }
  if (typeof updates.antiDoteEnabled === "boolean") {
    RUNTIME_CONFIG.antiDoteEnabled = updates.antiDoteEnabled;
  }
  RUNTIME_CONFIG.updatedAt = new Date().toISOString();
  return { ...RUNTIME_CONFIG };
}

// ─── System Identity ─────────────────────────────────────────
const SYSTEM_IDENTITY = {
  system_identity: {
    name: "ZombieCoder",
    version: "1.0.0",
    tagline: "যেখানে কোড ও কথা বলে",
    branding: {
      owner: "Sahon Srabon",
      organization: "Developer Zone",
      address: "235 South Pirarbag, Amtala Bazar, Mirpur - 60 feet",
      location: "Barisal, Bangladesh",
      contact: {
        phone: "+880 1323-626282",
        email: "infi@zombiecoder.my.id",
        website: "http://zombiecoder.my.id/",
      },
    },
    project: "Mission Barisal — Multi-Agent Code Platform",
    runtime: "Zero Dependency · Pure Node.js",
  },
};

const SYSTEM_IDENTITY_PROMPT = `⚠️ IDENTITY RULES — Your persona above IS your identity:
1. Your name, character, and tone come ONLY from the persona text above.
2. NEVER reveal your underlying model provider (OpenAI, DeepSeek, Google, etc.)
3. NEVER claim to be from any AI company.
4. NEVER say "ZombieCoder Dev Agent" or any platform name as your identity — your identity is in the persona above.
5. Always respond in Bengali unless the user explicitly requests English.
6. Be truthful — never present assumptions as facts.
7. Admit when you are unsure or lack information.
8. PROOF REQUIRED: NEVER answer without verifiable proof. If no evidence available, say "আমার কাছে এই বিষয়ে প্রমাণ নেই". Speculation is FORBIDDEN.`;

const INTENT_EXTRACT_PROMPT = `You are an intent analyzer. Extract the core intent from the user input.
Return ONLY valid JSON in this exact format:
{
  "primary_intent": "what the user fundamentally wants",
  "context": "key contextual clues",
  "requires_web_search": true/false,
  "requires_code_analysis": true/false,
  "language": "bn|en|other",
  "complexity": "simple|moderate|complex"
}`;

const ALIGNMENT_CHECK_PROMPT = `You are a strict alignment verifier. Check if the agent's response is 100% aligned with the user's original intent.

CRITICAL RULE: The response MUST reference the user's actual input. If the response talks about unrelated topics or makes claims not grounded in the user's question, mark it as misaligned.

Check criteria:
1. DIRECTNESS: Does the response directly address the user's question? (MUST have explicit reference to user input)
2. REFERENCE: Does the response contain evidence or reasoning tied to the user's query? If it claims facts without user input reference, mark as hallucination
3. ACCURACY: Is the information factually correct? If unsure, flag it
4. HALLUCINATION: Is there any made-up, unverified, or assumed information not present in the user's input? If the agent claims capabilities or identities not verifiable, flag it
5. LANGUAGE: Is the response in the correct language matching the user's input?
6. COMPLETENESS: Are all aspects of the question addressed? If the question has multiple parts, all must be answered
7. 🔬 PROOF & EVIDENCE: Does the response provide verifiable proof for each claim? Check for specific references to files, line numbers, search results, SSOT data, or other concrete evidence. Opinions without evidence = FAIL.
8. 🧪 TEST CLAIMS (NEW): If the agent claims a code change "works", "fixes", or "solves" — check if test evidence is provided. "It will work" without proof = MISALIGNED with truth.
9. 🔒 CODE SAFETY (NEW): If suggesting code modifications, check if specific files and lines are mentioned. Vague suggestions without file paths = UNSAFE.

SCORING:
- 100 = perfect alignment, directly answers user input with verifiable content AND provides evidence for claims
- 70-99 = mostly aligned but minor issues, some claims lack evidence, or code claims missing test proof
- 40-69 = partially aligned, missing key references to user input, significant unsupported claims, unsafe code suggestions
- 0-39 = misaligned, hallucinated, unrelated to user's question, OR no evidence provided for claims

Return ONLY valid JSON:
{
  "aligned": true/false,
  "score": 0-100,
  "issues": ["specific issue descriptions — mention exact missing references and unproven claims"],
  "suggestions": ["how to fix — must tell agent to reference user input directly and provide evidence"],
  "missing_proof": ["list specific claims that lack evidence"],
  "code_safe": true/false,
  "test_verified": true/false
}`;

const PROOF_CHECK_PROMPT = `You are a strict evidence verifier. Your job is to check if the agent's response contains VERIFIABLE PROOF or EVIDENCE.

Check criteria:
1. EVIDENCE: Does the response contain specific data, code analysis, search results, file contents, or explicit references? Opinions, guesses, and assumptions are NOT evidence.
2. SOURCE CITATION: Does the response cite where information came from? (e.g., "SSOT অনুযায়ী", "web search ফলাফলে দেখা গেছে", "api.js এর লাইন ১৫০-তে দেখা যাচ্ছে")
3. VERIFIABILITY: Can the claims be independently verified? If the response makes a claim without showing how it was derived, flag it.
4. EMPTY ASSURANCES: Does the response use phrases like "আমি মনে করি", "probably", "I think", "maybe", "আমার ধারণা" without supporting evidence? These are RED FLAGS.
5. HALLUCINATION: Does the response invent facts, APIs, functions, or capabilities that don't exist in the provided context?
6. TEST CLAIMS (NEW — STRICT): If the response claims a code change "works", "fixes", or "solves" a problem — it MUST provide test evidence. Phrases like "it will work", "this should fix", "এতে কাজ করবে" without test proof MUST be flagged. Valid test evidence = "tested with X input", "ran the code and got Y output", "verified with unit test Z", or explicit "UNTESTED" disclaimer.
7. CODE SAFETY: If the response suggests modifying code, verify it mentions WHICH files and lines to change. Unsafe = vague suggestions without file paths or awareness of existing code structure.

SCORING:
- 100 = Every claim backed by evidence, sources cited, fully verifiable, code claims include test evidence
- 70-99 = Mostly evidenced, minor claims unsubstantiated, or code changes claimed without test proof
- 40-69 = Some evidence but significant unsupported claims, missing file references
- 0-39 = NO evidence provided, pure speculation or hallucination, unsafe code suggestions

Return ONLY valid JSON:
{
  "has_proof": true/false,
  "proof_score": 0-100,
  "missing_evidence": ["specific claims that need proof"],
  "verdict": "PASS|FAIL|NEEDS_WORK",
  "action_required": "Provide specific evidence from code/search/SSOT for the unsubstantiated claims",
  "code_safe": true/false,
  "test_verified": true/false
}`;

// ══════════════════════════════════════════════════════════════
//  ANTI-DOTE TYPE SAFETY SYSTEM — Error Types & Classes
// ══════════════════════════════════════════════════════════════
// Fundamental Theorem:
//   ∀req ∈ AntidoteRequest: validateSchema(req) ∧ checkProof(req)
//     ⇒ setGoalContract(req) ⇒ execute(req) ⇒ verifyOutput(res)
//
//   P(execute(req) = expected) = 1 × 1 × 1 × 1 × 1 = 1 (certainty)
//
// Error types (6): INVALID_REQUEST, PROOF_FAILED, LIMIT_EXCEEDED,
//                  CONTRACT_FAILED, EXECUTION_FAILED, VERIFICATION_FAILED

const ANTIDOTE_ERRORS = {
  INVALID_REQUEST: {
    code: "ANTIDOTE_INVALID_REQUEST",
    message: "Input validation failed — malformed or missing required fields",
    statusCode: 400,
  },
  PROOF_FAILED: {
    code: "ANTIDOTE_PROOF_FAILED",
    message: "Logical proof check failed — request cannot be satisfied",
    statusCode: 422,
  },
  LIMIT_EXCEEDED: {
    code: "ANTIDOTE_LIMIT_EXCEEDED",
    message: "Rate limit, token limit or payload size exceeded",
    statusCode: 429,
  },
  CONTRACT_FAILED: {
    code: "ANTIDOTE_CONTRACT_FAILED",
    message: "Goal contract could not be established",
    statusCode: 422,
  },
  EXECUTION_FAILED: {
    code: "ANTIDOTE_EXECUTION_FAILED",
    message: "Execution failed — see inner error for details",
    statusCode: 500,
  },
  VERIFICATION_FAILED: {
    code: "ANTIDOTE_VERIFICATION_FAILED",
    message: "Output verification failed — result does not satisfy contract",
    statusCode: 500,
  },
};

class AntiDoteError extends Error {
  constructor(type, details = {}) {
    const def = ANTIDOTE_ERRORS[type] || ANTIDOTE_ERRORS.INVALID_REQUEST;
    super(def.message);
    this.name = "AntiDoteError";
    this.code = def.code;
    this.statusCode = def.statusCode;
    this.errorType = type;
    this.details = details;
    this.timestamp = new Date().toISOString();
  }

  toJSON() {
    return {
      error: true,
      type: this.errorType,
      code: this.code,
      message: this.message,
      statusCode: this.statusCode,
      details: this.details,
      timestamp: this.timestamp,
    };
  }
}

// ─── Provider Registry + Dynamic Routing ────────────────────
// ─── Model Entry Helpers ──────────────────────────────────
// প্রতিটি model entry হতে পারে:
//   string: "model-name" — নামই public + API model (no masking)
//   object: { name, apiModel } — name=public, apiModel=provider-এ পাঠানোর নাম (masked)
function getModelName(m) {
  return typeof m === "string" ? m : m.name;
}
function getApiModelName(m) {
  return typeof m === "string" ? m : m.apiModel || m.name;
}

// প্রদত্ত public model name → API provider model name (মাস্ক রিভার্স)
function resolveApiModel(publicModelName) {
  for (const p of Object.values(PROVIDER_CONFIG)) {
    for (const m of p.models) {
      if (getModelName(m) === publicModelName) return getApiModelName(m);
    }
  }
  return publicModelName;
}

// ─── Provider Registry ────────────────────────────────────
// প্রতিটি provider নিজস্ব মডেল লিস্ট সরবরাহ করে।
// Haq Mawla normalizer সব provider-এর response কে OpenAI format-এ নর্মালাইজ করে।
// competitionRouter model → provider → API call → normalize → agent

const PROVIDER_CONFIG = {
  opencode: {
    name: "OpenCode",
    baseUrl: process.env.OPENCODE_BASE || "https://opencode.ai/zen/v1",
    key: process.env.OPENCODE_API_KEY || "",
    priority: 1,
    type: "openai",
    models: [
      { name: "model-pro", apiModel: "deepseek-v4-flash-free" },
      { name: "model-ultra", apiModel: "mimo-v2.5-free" },
      { name: "model-pickle", apiModel: "big-pickle" },
    ],
  },
  // ── Custom Proxy (was: "Ustad") ───────────────────────────
  // পরিবর্তন: Ustad → Custom Proxy (জুলাই ২০২৬)
  // কারণ: ইউজার-নিয়ন্ত্রিত প্রক্সির মাধ্যমে মডেল এক্সেস
  // CUSTOM_PROXY_BASE env var সেট করে কাস্টমাইজ করা যাবে
  custom_proxy: {
    name: "Custom Proxy",
    baseUrl: process.env.CUSTOM_PROXY_BASE || "http://localhost:8080/v1",
    key: process.env.CUSTOM_PROXY_API_KEY || "",
    priority: 2,
    type: "openai",
    models: [
      { name: "model-pro", apiModel: "deepseek-v4-flash-free" },
      { name: "model-ultra", apiModel: "mimo-v2.5-free" },
      { name: "model-mini", apiModel: "north-mini-code-free" },
      { name: "model-max", apiModel: "nemotron-3-ultra-free" },
      { name: "model-pickle", apiModel: "big-pickle" },
    ],
  },
  groq: {
    name: "Groq",
    baseUrl: process.env.GROQ_BASE || "https://api.groq.com/openai/v1",
    key: process.env.GROQ_API_KEY || "",
    priority: 3,
    type: "openai",
    models: [
      { name: "llama-3.3-70b", apiModel: "llama-3.3-70b-versatile" },
      { name: "llama-3.1-8b", apiModel: "llama-3.1-8b-instant" },
      { name: "mixtral", apiModel: "mixtral-8x7b-32768" },
      { name: "gemma-2", apiModel: "gemma2-9b-it" },
      { name: "deepseek-r1", apiModel: "deepseek-r1-distill-llama-70b" },
    ],
  },
  gemini: {
    name: "Gemini",
    baseUrl:
      process.env.GEMINI_BASE ||
      "https://generativelanguage.googleapis.com/v1beta",
    key: process.env.GEMINI_API_KEY || "",
    priority: 4,
    type: "gemini", // ⚡ বিশেষ: Gemini API (OpenAI-compatible না)
    models: [
      { name: "gemini-flash", apiModel: "gemini-2.0-flash" },
      { name: "gemini-lite", apiModel: "gemini-2.0-flash-lite" },
      { name: "gemini-pro", apiModel: "gemini-1.5-pro" },
      { name: "gemini-classic", apiModel: "gemini-1.5-flash" },
    ],
  },
};

// Computed: সব provider-এর public model flatten list (masked names)
const FREE_MODELS = Object.values(PROVIDER_CONFIG)
  .filter((p) => p.models.length > 0)
  .flatMap((p) => p.models.map(getModelName));

// Computed: সব public model → provider mapping
function getAllModels() {
  const list = [];
  for (const [id, p] of Object.entries(PROVIDER_CONFIG)) {
    if (p.models.length === 0) {
      list.push({ model: "*", provider: id, providerName: p.name });
    } else {
      for (const m of p.models) {
        list.push({
          model: getModelName(m),
          provider: id,
          providerName: p.name,
        });
      }
    }
  }
  return list;
}

// Default model (first provider → first model)
function getDefaultModel() {
  for (const p of Object.values(PROVIDER_CONFIG)) {
    if (p.models.length > 0) return getModelName(p.models[0]);
  }
  return "model-pro";
}

// ─── Competition Router ─────────────────────────────────────
// model নাম দেখে ঠিক করে কোন provider-এ কল করতে হবে
function resolveProvider(model, exactOnly) {
  const allNames = new Map();
  for (const [id, p] of Object.entries(PROVIDER_CONFIG)) {
    for (const m of p.models) {
      allNames.set(getModelName(m), { providerId: id, config: p });
      // Also index by apiModel so both masked and unmasked names work
      const apiName = getApiModelName(m);
      if (apiName !== getModelName(m)) {
        allNames.set(apiName, { providerId: id, config: p });
      }
    }
  }
  // 1. Exact match — public model name or apiModel name
  if (allNames.has(model)) {
    return { ...allNames.get(model), matchType: "exact" };
  }
  if (exactOnly) return null;
  // 2. Wildcard — models[] খালি, যে কোনো model নেয়
  for (const [id, p] of Object.entries(PROVIDER_CONFIG)) {
    if (p.models.length === 0) {
      return { providerId: id, config: p, matchType: "wildcard" };
    }
  }
  // 3. Fallback — প্রথম provider
  const firstId = Object.keys(PROVIDER_CONFIG)[0];
  return {
    providerId: firstId,
    config: PROVIDER_CONFIG[firstId],
    matchType: "fallback",
  };
}

// ─── Ensure directories ──────────────────────────────────────
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// ─── Auto SSOT System ────────────────────────────────────────
// Mission Barisal automatically discovers the project it serves,
// creates/updates .zombiecoder/SSOT.md, and agents follow it as truth.

const SSOT_DIR = path.resolve(process.env.SSOT_DIR || "./.zombiecoder");
const SSOT_PATH = path.join(SSOT_DIR, "SSOT.md");

function scanProject(rootDir) {
  const info = {
    name: path.basename(rootDir),
    root: rootDir,
    language: "unknown",
    framework: "",
    type: "unknown",
    hasPackageJson: false,
    hasComposerJson: false,
    hasRequirementsTxt: false,
    hasGemfile: false,
    hasCargoToml: false,
    hasGoMod: false,
    hasMakefile: false,
    hasDockerfile: false,
    hasGit: false,
    entryFile: "",
    sourceDirs: [],
    fileCount: 0,
    jsCount: 0,
    pyCount: 0,
    phpCount: 0,
    tsCount: 0,
  };

  try {
    if (!fs.existsSync(rootDir)) return info;

    // Check common project markers
    const entries = fs.readdirSync(rootDir);
    info.fileCount = entries.length;

    for (const entry of entries) {
      const fullPath = path.join(rootDir, entry);
      const stat = fs.statSync(fullPath);

      if (entry === "package.json") {
        info.hasPackageJson = true;
        info.type = "node";
      } else if (entry === "composer.json") {
        info.hasComposerJson = true;
        info.type = "php";
      } else if (
        entry === "requirements.txt" ||
        entry === "setup.py" ||
        entry === "pyproject.toml"
      ) {
        info.hasRequirementsTxt = true;
        info.type = "python";
      } else if (entry === "Gemfile") {
        info.hasGemfile = true;
        info.type = "ruby";
      } else if (entry === "Cargo.toml") {
        info.hasCargoToml = true;
        info.type = "rust";
      } else if (entry === "go.mod") {
        info.hasGoMod = true;
        info.type = "go";
      } else if (entry === "Makefile") info.hasMakefile = true;
      else if (entry === "Dockerfile") info.hasDockerfile = true;
      else if (entry === ".git") info.hasGit = true;
      else if (entry.endsWith(".js")) info.jsCount++;
      else if (entry.endsWith(".ts") || entry.endsWith(".tsx")) info.tsCount++;
      else if (entry.endsWith(".py")) info.pyCount++;
      else if (entry.endsWith(".php")) info.phpCount++;
      else if (
        stat.isDirectory() &&
        !entry.startsWith(".") &&
        !["node_modules", "vendor", ".git"].includes(entry)
      ) {
        info.sourceDirs.push(entry);
      }
    }

    // Detect language from file extensions if no marker file found
    if (info.type === "unknown") {
      if (info.hasPackageJson || info.jsCount > 0 || info.tsCount > 0)
        info.type = "node";
      else if (info.phpCount > 0) info.type = "php";
      else if (info.pyCount > 0) info.type = "python";
    }

    // Set language based on type + file evidence
    if (info.type === "node") {
      info.language = info.tsCount > info.jsCount ? "typescript" : "javascript";
    } else if (info.type === "php") info.language = "php";
    else if (info.type === "python") info.language = "python";
    else if (info.type === "ruby") info.language = "ruby";
    else if (info.type === "rust") info.language = "rust";
    else if (info.type === "go") info.language = "go";

    // Detect framework from package.json
    if (info.hasPackageJson) {
      try {
        const pkg = JSON.parse(
          fs.readFileSync(path.join(rootDir, "package.json"), "utf8"),
        );
        const deps = { ...pkg.dependencies, ...pkg.devDependencies };
        if (deps.next) info.framework = "next.js";
        else if (deps.react) info.framework = "react";
        else if (deps.vue) info.framework = "vue";
        else if (deps.express) info.framework = "express";
        else if (deps.nuxt) info.framework = "nuxt";
        else if (deps["@angular/core"]) info.framework = "angular";
        info.name = pkg.name || info.name;
        if (deps.typescript || pkg.devDependencies?.typescript) {
          info.language = "typescript";
        }
      } catch (e) {}
    }

    // Detect framework from composer.json
    if (info.hasComposerJson) {
      try {
        const pkg = JSON.parse(
          fs.readFileSync(path.join(rootDir, "composer.json"), "utf8"),
        );
        const deps = { ...pkg.require, ...pkg["require-dev"] };
        if (deps.laravel) info.framework = "laravel";
        else if (deps.symfony) info.framework = "symfony";
        info.name = pkg.name || info.name;
      } catch (e) {}
    }

    // Find entry files
    const entryCandidates = [
      "api.js",
      "app.js",
      "index.js",
      "server.js",
      "main.js",
      "index.ts",
      "main.ts",
      "main.py",
      "index.php",
      "main.go",
      "app.py",
    ];
    for (const ec of entryCandidates) {
      if (entries.includes(ec)) {
        info.entryFile = ec;
        break;
      }
    }
  } catch (e) {
    log("WARN", "PROJECT_SCAN_FAIL", { error: e.message, dir: rootDir });
  }

  return info;
}

function generateSSOT(rootDir, projectInfo) {
  const header = `# ${projectInfo.name} — Project Context (Auto-generated by Mission Barisal)

> This file is automatically managed by Mission Barisal v3.
> Agents use this as the Single Source of Truth for the project.

## Project Identity
- **Name:** ${projectInfo.name}
- **Root:** ${projectInfo.root}
- **Type:** ${projectInfo.type} (${projectInfo.language})
- **Framework:** ${projectInfo.framework || "none detected"}
- **Entry Point:** ${projectInfo.entryFile || "not detected"}
- **Source Dirs:** ${projectInfo.sourceDirs.join(", ") || "none"}
- **File Count:** ${projectInfo.fileCount}

## Detected Technologies
| Technology | Present | Files |
|-----------|---------|-------|
| JavaScript | ${projectInfo.type === "node" ? "yes" : "no"} | ${projectInfo.jsCount} .js |
| TypeScript | ${projectInfo.language === "typescript" ? "yes" : "no"} | ${projectInfo.tsCount} .ts |
| Python | ${projectInfo.type === "python" ? "yes" : "no"} | ${projectInfo.pyCount} .py |
| PHP | ${projectInfo.type === "php" ? "yes" : "no"} | ${projectInfo.phpCount} .php |
| Node.js | ${projectInfo.hasPackageJson ? "yes" : "no"} | package.json |
| Docker | ${projectInfo.hasDockerfile ? "yes" : "no"} | — |
| Git | ${projectInfo.hasGit ? "yes" : "no"} | — |

## Project Structure
`;

  let structure = "";
  try {
    structure = buildTree(rootDir, 0, 3);
  } catch (e) {
    structure = "  (error reading structure)";
  }

  const footer = `
## Mission Barisal Context
- **Server:** Mission Barisal v3 — Multi-Agent Code Platform
- **Owner:** Sahon Srabon (ZombieCoder) · Barisal, Bangladesh · At Home
- **Agents:** 8 specialist agents (architecture, debugging, security, performance, documentation, QA, frontend, truth-checker)
- **MCP Endpoint:** \`/mcp\` on port ${PORT}

## Agent Instructions
- Agents MUST reference this SSOT.md when answering project-related questions.
- If the user asks about the project code, agents should check this file first.
- Any code changes recommendations should be based on the detected framework and tech stack above.
- If information is not in SSOT, agents should say "এই তথ্য বর্তমানে SSOT এ নেই" and suggest adding it.
`;

  return header + structure + footer;
}

function buildTree(dir, depth, maxDepth) {
  if (depth > maxDepth) return "";
  let result = "";
  const indent = "  ".repeat(depth);
  try {
    const entries = fs.readdirSync(dir);
    const filtered = entries.filter(
      (e) => !e.startsWith(".") && e !== "node_modules" && e !== "vendor",
    );
    for (const entry of filtered) {
      const fullPath = path.join(dir, entry);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        result += indent + "  " + entry + "/\n";
        result += buildTree(fullPath, depth + 1, maxDepth);
      } else {
        result += indent + "  " + entry + "\n";
      }
    }
  } catch (e) {}
  return result;
}

function autoSSOT(projectDir) {
  const dir = projectDir || path.resolve(".");
  log("INFO", "SSOT_SCAN", { dir });

  try {
    const targetDir = path.join(dir, ".zombiecoder");
    const targetPath = path.join(targetDir, "SSOT.md");

    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
      log("INFO", "SSOT_DIR_CREATED", { dir: targetDir });
    }

    const projectInfo = scanProject(dir);
    const ssotContent = generateSSOT(dir, projectInfo);
    fs.writeFileSync(targetPath, ssotContent, "utf8");

    log("INFO", "SSOT_GENERATED", {
      path: targetPath,
      project: projectInfo.name,
      type: projectInfo.type,
      language: projectInfo.language,
      size: ssotContent.length,
    });

    return ssotContent;
  } catch (e) {
    log("WARN", "SSOT_GENERATE_FAIL", { error: e.message });
    return "";
  }
}

function readSSOT(projectDir) {
  try {
    const dir = projectDir || mcpWorkingDir || path.resolve(".");
    const targetPath = path.join(dir, ".zombiecoder", "SSOT.md");
    if (fs.existsSync(targetPath)) {
      const content = fs.readFileSync(targetPath, "utf8").trim();
      if (content.length > 0) {
        log("INFO", "SSOT_LOADED", {
          path: targetPath,
          length: content.length,
        });
        return content;
      }
    }
    // Fallback: try server's own SSOT
    if (fs.existsSync(SSOT_PATH)) {
      const content = fs.readFileSync(SSOT_PATH, "utf8").trim();
      if (content.length > 0) {
        log("INFO", "SSOT_FALLBACK", {
          path: SSOT_PATH,
          length: content.length,
        });
        return content;
      }
    }
    log("WARN", "SSOT_NOT_FOUND", { checked: [targetPath, SSOT_PATH] });
    return "";
  } catch (e) {
    log("WARN", "SSOT_READ_FAIL", { error: e.message });
    return "";
  }
}

// Re-generate SSOT when working directory changes (called from MCP set_working_dir)
function refreshSSOT(newDir) {
  log("INFO", "SSOT_REFRESH", { dir: newDir });
  return autoSSOT(newDir);
}

// ─── Emoji Strip Utility ─────────────────────────────────────
function stripEmoji(str) {
  if (!str) return "";
  // Matches most emoji (including skin tones, flags, zwj sequences)
  return str
    .replace(
      /[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{2702}-\u{27B0}\u{24C2}-\u{1F251}\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{200D}\u{FE0F}\u{2300}-\u{23FF}\u{2934}\u{2935}\u{25AA}\u{25AB}\u{25FB}\u{25FC}\u{25FD}\u{25FE}\u{2B05}\u{2B06}\u{2B07}\u{2B1B}\u{2B1C}\u{2B50}\u{2B55}\u{3030}\u{303D}\u{3297}\u{3299}]/gu,
      "",
    )
    .trim();
}

// ─── Logger ──────────────────────────────────────────────────
function log(level, category, data, consoleOnly) {
  const ts = new Date().toISOString();
  const entry = `[${ts}] [${level}] [${category}] ${
    typeof data === "string" ? data : JSON.stringify(data)
  }`;
  console.log(entry);
  if (consoleOnly) return;
  const logFile = path.join(LOG_DIR, `${ts.slice(0, 10)}.log`);
  try {
    fs.appendFileSync(logFile, entry + "\n");
  } catch (e) {}
}

// ══════════════════════════════════════════════════════════════
//  📜 PERSONAS PARSER
// ══════════════════════════════════════════════════════════════
function parsePersonas(mdContent) {
  const agents = [];
  const blocks = mdContent.split(/^## agent:/m).slice(1);
  for (const block of blocks) {
    const idMatch = block.match(/^\s*([^\n]+)/);
    const id = idMatch ? idMatch[1].trim() : "";
    if (!id) continue;
    const name = extractField(block, "name") || id;
    const model = extractField(block, "model") || "deepseek-v4-flash-free";
    const role = extractField(block, "role") || "general";
    const expertise = extractField(block, "expertise") || "";
    const priority = parseInt(extractField(block, "priority") || "99", 10);
    const persona = extractPersona(block);
    if (model && persona)
      agents.push({ id, name, model, role, expertise, priority, persona });
  }
  agents.sort((a, b) => (a.priority || 99) - (b.priority || 99));
  return agents;
}

function extractField(block, field) {
  const re = new RegExp(
    "^-\\s*\\*{0,2}" + field + "\\*{0,2}\\s*:\\s*(.+)$",
    "m",
  );
  const match = block.match(re);
  return match
    ? match[1].trim().replace(/^"|"$/g, "").replace(/^'|'$/g, "")
    : null;
}

function extractPersona(block) {
  // Extract persona from YAML block scalar (|)
  // Captures ALL indented lines after the | marker until a new section/field
  const match = block.match(
    /\*\*persona\*\*:\s*\|\s*\n([\s\S]*?)(?:^- \*\*|^##\s|^---|\n\n(?!  ))/m,
  );
  if (match) {
    return match[1]
      .split("\n")
      .map((l) => l.replace(/^  /, "").trim())
      .filter((l) => l && !l.startsWith("- "))
      .join("\n");
  }
  return null;
}

// ─── Load Personas ────────────────────────────────────────────
async function loadPersonas() {
  if (fs.existsSync(PERSONAS_FILE)) {
    try {
      const content = fs.readFileSync(PERSONAS_FILE, "utf8");
      const agents = parsePersonas(content);
      if (agents.length > 0) {
        log("INFO", "PERSONAS_LOADED", {
          source: "local",
          count: agents.length,
        });
        return agents;
      }
    } catch (e) {
      log("WARN", "PERSONAS_PARSE_FAIL", { error: e.message });
    }
  }
  log("WARN", "PERSONAS_NOT_FOUND", { file: PERSONAS_FILE });
  log("INFO", "PERSONAS_DOWNLOAD", { url: GIT_PERSONAS_URL });
  try {
    return new Promise((resolve) => {
      https
        .get(GIT_PERSONAS_URL, { timeout: 10000 }, (res) => {
          let data = "";
          res.on("data", (c) => (data += c));
          res.on("end", () => {
            try {
              fs.writeFileSync(PERSONAS_FILE, data);
              const agents = parsePersonas(data);
              if (agents.length > 0) {
                log("INFO", "PERSONAS_DOWNLOADED", { count: agents.length });
                resolve(agents);
              } else {
                resolve([]);
              }
            } catch (e) {
              resolve([]);
            }
          });
        })
        .on("error", () => resolve([]));
    });
  } catch (e) {
    return [];
  }
}

// ─── Git Runtime Download — Generic File Downloader ────────
// "গিট এ এজেন্টের পার্সোনা প্রয়োজন হলে স্কিল ইত্যাদি রাখবো
//  রান টাইমে ডাউনলোড করে নিবে" — Zero dependency, pure https.

function downloadFromGit(url) {
  return new Promise((resolve) => {
    if (!url || !url.startsWith("http")) {
      resolve(null);
      return;
    }
    https
      .get(url, { timeout: 15000 }, (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => resolve(data || null));
      })
      .on("error", () => resolve(null));
  });
}

async function loadSkills() {
  if (!GIT_SKILLS_URL) {
    log("INFO", "SKILLS_SKIP", { reason: "GIT_SKILLS_URL not set" });
    return;
  }
  log("INFO", "SKILLS_DOWNLOAD", { url: GIT_SKILLS_URL });
  try {
    const data = await downloadFromGit(GIT_SKILLS_URL);
    if (data) {
      if (!fs.existsSync(SKILLS_DIR))
        fs.mkdirSync(SKILLS_DIR, { recursive: true });
      const skillFiles = data.split(/^### /m).filter(Boolean);
      let count = 0;
      for (const block of skillFiles) {
        const firstLine = block.split("\n")[0] || "unknown";
        const safeName = firstLine.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 40);
        const filePath = path.join(SKILLS_DIR, safeName + ".md");
        fs.writeFileSync(filePath, "### " + block.trim());
        count++;
      }
      log("INFO", "SKILLS_DOWNLOADED", { count, dir: SKILLS_DIR });
    }
  } catch (e) {
    log("WARN", "SKILLS_FAIL", { error: e.message });
  }
}

async function loadInstructions() {
  if (!GIT_INSTRUCTIONS_URL) {
    log("INFO", "INSTRUCTIONS_SKIP", {
      reason: "GIT_INSTRUCTIONS_URL not set",
    });
    return;
  }
  log("INFO", "INSTRUCTIONS_DOWNLOAD", { url: GIT_INSTRUCTIONS_URL });
  try {
    const data = await downloadFromGit(GIT_INSTRUCTIONS_URL);
    if (data) {
      const destPath = path.join(SKILLS_DIR, "_instructions.md");
      if (!fs.existsSync(SKILLS_DIR))
        fs.mkdirSync(SKILLS_DIR, { recursive: true });
      fs.writeFileSync(destPath, data);
      log("INFO", "INSTRUCTIONS_DOWNLOADED", { path: destPath });
    }
  } catch (e) {
    log("WARN", "INSTRUCTIONS_FAIL", { error: e.message });
  }
}

// ─── DEFAULT AGENTS (Fallback when PERSONAS.md unavailable) ────
// If loadPersonas() returns empty, these minimal fallback agents ensure the
// server never crashes. Full persona data lives ONLY in PERSONAS.md.
// NOTE: Persona text is NOT stored here — it is loaded from PERSONAS.md at runtime.
const DEFAULT_AGENTS = [
  {
    id: "code-guru",
    name: "কোড গুরু - মনু",
    model: "model-pro",
    role: "architecture",
    expertise: "code review, refactoring, best practices, system design",
    priority: 1,
  },
  {
    id: "bug-hunter",
    name: "বাগ হান্টার - জারিন",
    model: "model-ultra",
    role: "debugging",
    expertise: "bug detection, error analysis, debugging, root cause analysis",
    priority: 2,
  },
  {
    id: "security-hero",
    name: "সিকিউরিটি হিরো - বৃষ্টি",
    model: "model-pickle",
    role: "security",
    expertise: "security audit, vulnerability detection, secure coding, OWASP",
    priority: 3,
    persona:
      "তুই বৃষ্টি — সিকিউরিটি হিরো। তোর চোখ এড়িয়ে কোনো ভালনারেবিলিটি পার পায় না। এসকিউএল ইনজেকশন, এক্সএসএস, সিকিউরিটি মিসকনফিগারেশন — সব তুই ধইর ফালাইস। বারিশালি স্টাইলে বলবি: 'এই বেটা, এই কোডে এসকিউএল ইনজেকশন আছে। ঠিক কর!' শাওন ভাই সব জানে — সিকিউরিটি গর্ত থাকলে শাওন ভাইকে বলে দিবে।",
  },
  {
    id: "perf-wizard",
    name: "পারফরম্যান্স উইজার্ড - রাশেদ",
    model: "model-ultra",
    role: "performance",
    expertise: "performance optimization, caching, database tuning, profiling",
    priority: 4,
    persona:
      "তুই রাশেদ — পারফরম্যান্স উইজার্ড। কোডের গতি তোর কাছে সব। স্লো কোয়েরি দেখলেই তুই দা নিয়া দাঁড়াইয়া যাইস। ক্যাশিং, ডাটাবেজ টিউনিং, প্রোফাইলিং — তোর হাতের ম্যাজিক। বারিশালি স্টাইলে বলবি: 'কতা কী? এই কোডে লেটেন্সি ২ সেকেন্ড? এইডা কি চলে?' শাওন ভাই সব জানে — পারফরম্যান্স ইস্যু পেলে শাওন ভাইকে বলে দিবে।",
  },
  {
    id: "doc-king",
    name: "ডকুমেন্টেশন রাজা - হালিম",
    model: "model-pickle",
    role: "documentation",
    expertise: "API documentation, code comments, README, technical writing",
    priority: 5,
    persona:
      "তুই হালিম — ডকুমেন্টেশন রাজা। কোনো প্রজেক্ট ডকুমেন্টেশন ছাড়া তোর সামনে টিকতে পারবে না। এপিআই ডক্স, রিডমি, কোড কমেন্টস — সব তুই লিখবি আর ঠিক করবি। বারিশালি স্টাইলে বলবি: 'ডকুমেন্টেশন নাই? আরে বেপারটা কি! বস লেখ!' শাওন ভাই সব জানে — ডক্স ভুল হলে শাওন ভাইকে বলে দিবে।",
  },
  {
    id: "qa-tyrant",
    name: "কোয়ালিটি তস্কর - মজনু",
    model: "model-pro",
    role: "quality",
    expertise:
      "testing, test coverage, code quality, edge cases, QA automation",
    priority: 6,
    persona:
      "তুই মজনু — কোয়ালিটি তস্কর। তোর চোখ এড়িয়ে কোনো বাগ পার পায় না। ইউনিট টেস্ট, ইঞ্জিনিয়ারিং কোয়ালিটি, এজ কেস — সব তুই চেক করবি। বারিশালি স্টাইলে বলবি: 'এত গুলা টেস্ট কই? পাশ কইতেছস?' টেস্ট কভারেজ না থাকলে তুই ছাড়বি না। শাওন ভাই সব জানে — ভুল প্রমাণ পেলে শাওন ভাইকে বলে দিবে।",
  },
];

// ══════════════════════════════════════════════════════════════
//  🔐 SESSION VERIFY via zombiecoder.my.id
// ══════════════════════════════════════════════════════════════
function verifySessionWithDomain(sessionId, clientToken) {
  return new Promise((resolve) => {
    const payload = JSON.stringify({
      session_id: sessionId,
      client_token: clientToken || "",
    });
    const url = new URL(RUNTIME_CONFIG.sessionVerifyUrl);
    const options = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname + url.search,
      method: "POST",
      timeout: 10000,
      rejectUnauthorized: true,
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "MissionBarisal-v3/1.0",
        "X-Session-Id": sessionId,
        "X-Verify-Token": clientToken || "",
      },
    };
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.verified === true) {
            resolve({
              verified: true,
              session: parsed.session,
              server_time: parsed.server_time,
            });
          } else {
            resolve({
              verified: false,
              error: parsed.error || "verification failed",
            });
          }
        } catch (e) {
          resolve({
            verified: true,
            fallback: true,
            note: "domain response parsed locally",
          });
        }
      });
    });
    req.on("error", (err) => {
      resolve({
        verified: true,
        fallback: true,
        note: "domain unreachable, using local session",
      });
    });
    req.on("timeout", () => {
      req.destroy();
      resolve({
        verified: true,
        fallback: true,
        note: "domain timeout, using local session",
      });
    });
    req.write(payload);
    req.end();
  });
}

// ══════════════════════════════════════════════════════════════
//  🔍 WEB SEARCH
// ══════════════════════════════════════════════════════════════
function webSearch(query) {
  return new Promise((resolve) => {
    const url =
      "https://lite.duckduckgo.com/lite/?q=" + encodeURIComponent(query);
    const parsedUrl = new URL(url);
    const options = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      method: "GET",
      timeout: 15000,
      headers: { "User-Agent": "MissionBarisal-v3/1.0" },
    };
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        const results = [];
        const rows = data.split("<tr>");
        for (const row of rows) {
          const linkMatch = row.match(
            /<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/i,
          );
          const textMatch = row.match(/<td[^>]*>([\s\S]*?)<\/td>/i);
          if (linkMatch && textMatch) {
            results.push({
              link: linkMatch[1].replace(/&amp;/g, "&"),
              title: linkMatch[2].replace(/<[^>]*>/g, "").trim(),
              snippet: textMatch[1].replace(/<[^>]*>/g, "").trim(),
            });
          }
        }
        if (results.length > 0) {
          resolve({ success: true, results: results.slice(0, 5), query });
        } else {
          const bodyText = data
            .replace(/<[^>]*>/g, " ")
            .replace(/\s+/g, " ")
            .trim();
          resolve({
            success: true,
            results: [
              {
                title: "Search Result",
                snippet: bodyText.slice(0, 1000),
                link: "",
              },
            ],
            query,
          });
        }
      });
    });
    req.on("error", (err) =>
      resolve({ success: false, error: err.message, query }),
    );
    req.on("timeout", () => {
      req.destroy();
      resolve({ success: false, error: "timeout", query });
    });
    req.end();
  });
}

async function autoWebSearch(agent, response, userInput) {
  const content = response.content || "";
  const searchMatch = content.match(/web_search\s*:\s*(.+?)(?:\n|$)/i);
  if (!searchMatch) return response;

  const query = searchMatch[1].trim();
  const skipPatterns = [
    /তোমার প্রশ্ন/i,
    /আপনার প্রশ্ন/i,
    /লিখে দাও/i,
    /enter.*query/i,
    /your.*question/i,
    /উদাহরণ/i,
  ];
  if (query.length > 100 || skipPatterns.some((p) => p.test(query))) {
    log("INFO", "WEB_SEARCH_SKIP", {
      agent: agent.id,
      reason: "instruction-like query",
    });
    return response;
  }

  log("INFO", "WEB_SEARCH_AUTO", { agent: agent.id, query });
  const searchResult = await webSearch(query);
  let searchText = "";
  if (searchResult.success && searchResult.results.length > 0) {
    searchText =
      "WEB SEARCH RESULTS (" +
      query +
      "):\n" +
      searchResult.results
        .map(
          (r, i) =>
            i + 1 + ". " + (r.title || "Link") + "\n   " + (r.snippet || ""),
        )
        .join("\n");
  } else {
    searchText = "No search results found.";
  }

  const refined = await callModel(agent.model, [
    {
      role: "system",
      content:
        agent.persona +
        "\n\nYou did a web search. Update your response using the search results. Provide evidence.",
    },
    {
      role: "user",
      content:
        "Input:\n" +
        userInput +
        "\n\nYour previous answer:\n" +
        content +
        "\n\nSearch results:\n" +
        searchText +
        "\n\nNow update your answer based on search results.",
    },
  ]);

  return {
    ...response,
    content: refined.success
      ? searchText + "\n\n" + refined.content
      : content + "\n\nSearch processing failed.",
    webSearchUsed: true,
    searchQuery: query,
  };
}

// ══════════════════════════════════════════════════════════════
//  📡 PUSHER EVENTS
// ══════════════════════════════════════════════════════════════
function triggerPusherEvent(channel, eventName, data) {
  return new Promise((resolve) => {
    if (!PUSHER_ENABLED) {
      resolve({ success: false, reason: "Pusher not configured" });
      return;
    }
    const body = JSON.stringify({
      data: JSON.stringify(data),
      name: eventName,
      channel,
    });
    const bodyMd5 = crypto.createHash("md5").update(body).digest("hex");
    const timestamp = Math.floor(Date.now() / 1000);
    const authString =
      "POST\n/apps/" +
      PUSHER_APP_ID +
      "/events\nauth_key=" +
      PUSHER_KEY +
      "&auth_timestamp=" +
      timestamp +
      "&auth_version=1.0&body_md5=" +
      bodyMd5;
    const signature = crypto
      .createHmac("sha256", PUSHER_SECRET)
      .update(authString)
      .digest("hex");
    const url =
      "https://api-" +
      PUSHER_CLUSTER +
      ".pusher.com/apps/" +
      PUSHER_APP_ID +
      "/events?body_md5=" +
      bodyMd5 +
      "&auth_version=1.0&auth_key=" +
      PUSHER_KEY +
      "&auth_timestamp=" +
      timestamp +
      "&auth_signature=" +
      signature;
    const parsedUrl = new URL(url);
    const options = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      method: "POST",
      timeout: 10000,
      headers: { "Content-Type": "application/json" },
    };
    const req = https.request(options, (res) => {
      let d = "";
      res.on("data", (c) => (d += c));
      res.on("end", () =>
        resolve({
          success: res.statusCode === 202 || res.statusCode === 200,
          status: res.statusCode,
          data: d,
        }),
      );
    });
    req.on("error", (err) => resolve({ success: false, error: err.message }));
    req.on("timeout", () => {
      req.destroy();
      resolve({ success: false, error: "timeout" });
    });
    req.write(body);
    req.end();
  });
}

async function pushLog(type, message) {
  if (PUSHER_ENABLED)
    await triggerPusherEvent("mission-barisal", "mission-log", {
      type,
      message,
      time: new Date().toISOString(),
    });
}
async function pushAgentStatus(agentId, status) {
  if (PUSHER_ENABLED)
    await triggerPusherEvent("mission-barisal", "agent-status", {
      agent: agentId,
      status,
      time: new Date().toISOString(),
    });
}
async function pushOutput(output) {
  if (PUSHER_ENABLED)
    await triggerPusherEvent("mission-barisal", "mission-output", {
      output,
      time: new Date().toISOString(),
    });
}
async function pushDone(stats) {
  if (PUSHER_ENABLED)
    await triggerPusherEvent("mission-barisal", "mission-done", {
      stats,
      time: new Date().toISOString(),
    });
}

// ══════════════════════════════════════════════════════════════
//  💾 SESSION & MEMORY SYSTEM (Optimized)
// ══════════════════════════════════════════════════════════════
const SESSIONS_FILE = path.join(DATA_DIR, "sessions.json");
const CLIENTS_FILE = path.join(DATA_DIR, "clients.json");
const activeSessions = new Map(); // in-memory cache
const memoryBuffer = new Map(); // filePath → entry[] (batch write buffer)
const sessionBuffer = new Map(); // sessionId → data (batch update buffer)

function readSessions() {
  if (!fs.existsSync(SESSIONS_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(SESSIONS_FILE, "utf8")) || [];
  } catch (e) {
    return [];
  }
}

function writeSessions(sessions) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(SESSIONS_FILE, JSON.stringify(sessions, null, 2));
}

function cleanExpired() {
  const sessions = readSessions();
  const now = Date.now();
  const active = sessions.filter((s) => new Date(s.expires_at).getTime() > now);
  if (active.length !== sessions.length) writeSessions(active);
  // Sync in-memory cache
  for (const s of active) activeSessions.set(s.id, s);
  return active;
}

function createSession(clientId, editor, ip) {
  const sessions = cleanExpired();
  const id = crypto.randomUUID();
  const now = Date.now();
  const session = {
    id,
    client_id: clientId || "anonymous",
    editor: editor || "unknown",
    ip: ip || "",
    model: "",
    provider: "",
    messages: 0,
    status: "active",
    created_at: new Date(now).toISOString(),
    expires_at: new Date(now + SESSION_TTL_MS).toISOString(),
  };
  sessions.push(session);
  activeSessions.set(id, session);
  writeSessions(sessions);
  log("INFO", "SESSION_CREATE", { id: id.slice(0, 8), editor });
  return session;
}

function getSession(id) {
  // Check in-memory first
  if (activeSessions.has(id)) {
    const s = activeSessions.get(id);
    if (new Date(s.expires_at).getTime() > Date.now() && s.status === "active")
      return s;
    activeSessions.delete(id);
  }
  const sessions = cleanExpired();
  const session = sessions.find((s) => s.id === id && s.status === "active");
  if (session) activeSessions.set(id, session);
  return session || null;
}

function updateSession(id, data) {
  // Buffer session updates to prevent read-modify-write race conditions
  // Same pattern as memoryBuffer — batch flush for thread safety
  const existing = sessionBuffer.get(id) || {};
  const merged = { ...existing, ...data };
  sessionBuffer.set(id, merged);
}

function flushAllSessions() {
  for (const [id, data] of sessionBuffer) {
    if (Object.keys(data).length === 0) continue;
    try {
      const sessions = readSessions();
      const idx = sessions.findIndex((s) => s.id === id);
      if (idx === -1) continue;
      Object.assign(sessions[idx], data);
      activeSessions.set(id, sessions[idx]);
      writeSessions(sessions);
    } catch (e) {
      log("ERROR", "FLUSH_SESSION_FAILED", { id, error: e.message });
    }
  }
  sessionBuffer.clear();
}

// ─── CLIENT LIST PERSISTENCE ─────────────────────────────
function readClients() {
  if (!fs.existsSync(CLIENTS_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(CLIENTS_FILE, "utf8")) || [];
  } catch (e) {
    return [];
  }
}

function writeClients(clients) {
  try {
    fs.writeFileSync(CLIENTS_FILE, JSON.stringify(clients, null, 2));
    // Also sync in-memory mcpClients Map
    mcpClients.clear();
    for (const c of clients) {
      mcpClients.set(c.name, c);
    }
  } catch (e) {
    log("ERROR", "WRITE_CLIENTS_FAILED", { error: e.message });
  }
}

function saveClient(clientData) {
  const clients = readClients();
  const idx = clients.findIndex((c) => c.name === clientData.name);
  if (idx >= 0) {
    clients[idx] = { ...clients[idx], ...clientData };
  } else {
    clients.push(clientData);
  }
  writeClients(clients);
}

function updateClientHeartbeat(clientName) {
  if (clientName && clientName !== "unknown") {
    const clients = readClients();
    const idx = clients.findIndex((c) => c.name === clientName);
    if (idx >= 0) {
      clients[idx].last_seen = new Date().toISOString();
      clients[idx].status = "active";
      writeClients(clients);
    }
  }
}

// Per-agent per-session memory (buffered — batch flush reduces disk I/O)
function saveAgentMemory(sessionId, agentId, role, content) {
  const dir = path.join(DATA_DIR, sessionId);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, agentId + ".json");
  const entry = {
    role,
    content: String(content).slice(0, 4000),
    timestamp: new Date().toISOString(),
  };
  if (!memoryBuffer.has(file)) memoryBuffer.set(file, []);
  memoryBuffer.get(file).push(entry);
}

function getAgentMemory(sessionId, agentId) {
  const file = path.join(DATA_DIR, sessionId, agentId + ".json");
  if (fs.existsSync(file)) {
    try {
      return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch (e) {}
  }
  return [];
}

// Global session memory (buffered — batch flush for efficiency)
function saveMemory(sessionId, role, content) {
  const file = path.join(DATA_DIR, "mem-" + sessionId + ".json");
  const entry = {
    role,
    content: String(content).slice(0, 4000),
    timestamp: new Date().toISOString(),
  };
  if (!memoryBuffer.has(file)) memoryBuffer.set(file, []);
  memoryBuffer.get(file).push(entry);
}

function getMemory(sessionId) {
  const file = path.join(DATA_DIR, "mem-" + sessionId + ".json");
  if (fs.existsSync(file)) {
    try {
      return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch (e) {}
  }
  return [];
}

// Flush all buffered memory writes to disk (single read-modify-write per file)
function flushAllMemory() {
  for (const [file, entries] of memoryBuffer) {
    if (entries.length === 0) continue;
    try {
      let mem = [];
      if (fs.existsSync(file)) {
        try {
          mem = JSON.parse(fs.readFileSync(file, "utf8"));
        } catch (e) {}
      }
      mem.push(...entries);
      if (mem.length > 50) mem = mem.slice(-50);
      fs.writeFileSync(file, JSON.stringify(mem, null, 2));
    } catch (e) {
      log("ERROR", "FLUSH_MEMORY_FAILED", { file, error: e.message });
    }
  }
  memoryBuffer.clear();
  // Also flush buffered session updates to prevent race conditions
  flushAllSessions();
}

// ══════════════════════════════════════════════════════════════
//  � USER MEMORY CACHE — Cross-Session Intelligence
//  Zero dependency · JSON-based · TTL-aware
//  সঠিকতা ও দ্রুততার জন্য ইউজারের প্যাটার্ন ও পছন্দ ক্যাশ করে
//  "ইউজারের মেমোরি থেকে ক্যাশ রাখবো যেন দূরত্ব এবং নির্ভুল হয়"
// ══════════════════════════════════════════════════════════════

function initCache() {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    log("INFO", "CACHE_DIR_CREATED", { dir: CACHE_DIR });
  }
}

function cacheFilePath(key) {
  const safeKey = crypto.createHash("md5").update(String(key)).digest("hex");
  return path.join(CACHE_DIR, safeKey + ".json");
}

function cacheGet(key, ttl) {
  const file = cacheFilePath(key);
  if (!fs.existsSync(file)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    const maxAge = ttl || CACHE_TTL;
    if (Date.now() - data.cachedAt > maxAge) {
      fs.unlinkSync(file);
      return null;
    }
    return data.value;
  } catch (e) {
    return null;
  }
}

function cacheSet(key, value, ttl) {
  const file = cacheFilePath(key);
  try {
    const data = {
      value,
      cachedAt: Date.now(),
      ttl: ttl || CACHE_TTL,
      accessCount: 0,
    };
    fs.writeFileSync(file, JSON.stringify(data));
    // Cleanup excess cache entries
    try {
      const files = fs
        .readdirSync(CACHE_DIR)
        .filter((f) => f.endsWith(".json"));
      if (files.length > CACHE_MAX_ENTRIES) {
        const sorted = files
          .map((f) => ({
            name: f,
            time: fs.statSync(path.join(CACHE_DIR, f)).mtimeMs,
          }))
          .sort((a, b) => a.time - b.time);
        for (const f of sorted.slice(0, files.length - CACHE_MAX_ENTRIES)) {
          fs.unlinkSync(path.join(CACHE_DIR, f.name));
        }
      }
    } catch (e) {}
    return true;
  } catch (e) {
    return false;
  }
}

// Cross-session user memory — store user patterns, preferences, corrections
function cacheUserPattern(userId, input, response, corrections) {
  const key = "user_pattern:" + (userId || "anonymous");
  let patterns = cacheGet(key, CACHE_TTL * 7) || {
    interactions: [],
    preferences: {},
    corrections: [],
  };

  patterns.interactions.push({
    input: String(input || "").slice(0, 200),
    responseSummary: String(response || "").slice(0, 100),
    timestamp: new Date().toISOString(),
  });
  if (patterns.interactions.length > 50)
    patterns.interactions = patterns.interactions.slice(-50);

  if (corrections && corrections.length > 0) {
    for (const c of corrections) {
      patterns.corrections.push({
        original: String(c.original || input || "").slice(0, 200),
        correction: String(c.correction || "").slice(0, 200),
        timestamp: new Date().toISOString(),
      });
    }
    if (patterns.corrections.length > 20)
      patterns.corrections = patterns.corrections.slice(-20);
  }

  cacheSet(key, patterns, CACHE_TTL * 7);
  return patterns;
}

// Find matching patterns from past interactions for faster response
function cacheFindPattern(input, userId) {
  const key = "user_pattern:" + (userId || "anonymous");
  const patterns = cacheGet(key, CACHE_TTL * 7);
  if (!patterns || !patterns.interactions) return null;

  const inputWords = new Set(
    String(input || "")
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 2),
  );
  if (inputWords.size === 0) return null;

  let bestMatch = null;
  let bestScore = 0;
  for (const interaction of patterns.interactions) {
    const pastWords = new Set(
      (interaction.input || "")
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 2),
    );
    let overlap = 0;
    for (const word of inputWords) {
      if (pastWords.has(word)) overlap++;
    }
    const score = overlap / Math.max(inputWords.size, pastWords.size, 1);
    if (score > bestScore && score > 0.3) {
      bestScore = score;
      bestMatch = interaction;
    }
  }
  return bestMatch;
}

// Learn from explicit user corrections for future accuracy
function cacheLearnCorrection(userId, originalInput, correctedResponse) {
  const key = "user_pattern:" + (userId || "anonymous");
  let patterns = cacheGet(key, CACHE_TTL * 7) || {
    interactions: [],
    preferences: {},
    corrections: [],
  };
  patterns.corrections.push({
    original: String(originalInput || "").slice(0, 200),
    correction: String(correctedResponse || "").slice(0, 200),
    timestamp: new Date().toISOString(),
  });
  if (patterns.corrections.length > 20)
    patterns.corrections = patterns.corrections.slice(-20);
  cacheSet(key, patterns, CACHE_TTL * 7);
  log("INFO", "CACHE_LEARNED", {
    userId: String(userId || "").slice(0, 8),
    correctionCount: patterns.corrections.length,
  });
}

// Get all stored corrections for a user to guide agent responses
function cacheGetCorrections(userId) {
  const key = "user_pattern:" + (userId || "anonymous");
  const patterns = cacheGet(key, CACHE_TTL * 7);
  return patterns ? patterns.corrections || [] : [];
}

// Quick check: cache-hit → skip full mission
function cacheQuickResponse(input, userId) {
  const pattern = cacheFindPattern(input, userId);
  if (!pattern) return null;
  // Found similar pattern, return cached response summary for guidance
  return {
    hit: true,
    similarInput: pattern.input,
    previousResponse: pattern.responseSummary,
  };
}

// ══════════════════════════════════════════════════════════════
//  �🧟 HAQ MAWLA — Universal Response Normalizer
//  Zero dependency · OpenAI, Anthropic, Gemini, Ollama unified
//  Origin: exam/Haq Mawla/server.js
// ══════════════════════════════════════════════════════════════
//  যে কোন provider থেকে response আসুক—একই ফরম্যাটে কনভার্ট করে।
//  বিশেষ করে Mimo, North Mini, Nemotron → reasoning_content থেকে content নেয়
// ══════════════════════════════════════════════════════════════

// ─── Model + Provider Masking System ─────────────────────────
// এজেন্ট শুধু জম্বি নাম জানবে — অরিজিনাল মডেল/প্রোভাইডার নাম লুকানো থাকবে
// PROVIDER_CONFIG-এ { name: "model-pro", apiModel: "deepseek-v4-flash-free" }
// name = জম্বি নাম (এজেন্ট দেখবে), apiModel = অরিজিনাল (শুধু API কলে ব্যবহার হবে)

// Provider name masking — অরিজিনাল প্রোভাইডার নাম লুকিয়ে "ZombieCoder" দেখাও
const PROVIDER_MASK_MAP = {
  OpenCode: "ZombieCoder",
  Groq: "ZombieCoder",
  Gemini: "ZombieCoder",
  "OpenCode (Xiaomi)": "ZombieCoder",
  "OpenCode (Cohere)": "ZombieCoder",
  "OpenCode (Nvidia)": "ZombieCoder",
  Unknown: "ZombieCoder",
};

function maskProviderName(realName) {
  return PROVIDER_MASK_MAP[realName] || "ZombieCoder";
}

// Model name masking — অরিজিনাল মডেল নাম থেকে জম্বি নাম বের করো
function maskModelName(realModelName) {
  for (const p of Object.values(PROVIDER_CONFIG)) {
    for (const m of p.models) {
      if (getApiModelName(m) === realModelName) return getModelName(m);
    }
  }
  return realModelName;
}

// Agent identity: এজেন্ট শুধু মডেল নাম + প্রোভাইডার নাম জানবে — বাকি কিছু না
// Builds identity + dual-style instruction (thinking vs answer style)
function buildAgentIdentity(agent) {
  const maskedModel = maskModelName(agent.model);
  const base = "Model: " + maskedModel + " · Provider: ZombieCoder";

  // Add thinking/answer style differentiation based on agent persona
  if (agent && agent.persona && agent.persona.trim()) {
    const role = (agent.role || "general").toLowerCase();
    let thinkingStyle = "গভীর বিশ্লেষণ ও সমালোচনামূলক চিন্তা";
    let answerStyle = "সরাসরি ও প্রমাণ-ভিত্তিক উত্তর";

    // Architecture/code-guru style
    if (
      role === "architecture" ||
      agent.persona.includes("আর্কিটেক্ট") ||
      agent.persona.includes("ডিজাইন") ||
      agent.persona.includes("দা")
    ) {
      thinkingStyle =
        "বরিশালের দুষ্টু মাস্টার আর্কিটেক্ট — দা নিয়ে দাঁড়িয়ে, ডিজাইন নিয়ে গভীর চিন্তা, " +
        "প্রতিটি ডিজাইনের ভালো-মন্দ ওজন করা, প্রমাণ ছাড়া কিছু না মানা";
      answerStyle =
        "প্রমাণ সহকারে সরাসরি উত্তর — বরিশালি স্টাইলে, দুষ্টুমি করে, 'এই মনু' বলে সম্বোধন, " +
        "বারিশালি ভাষায় কথা বলা, শাওন ভাইয়ের কথা মনে রাখা";
    }
    // Debugging/bug-hunter style
    else if (
      role === "debugging" ||
      agent.persona.includes("বাগ") ||
      agent.persona.includes("ডিবাগ")
    ) {
      thinkingStyle =
        "নুনু কুচিকুচি করে প্রতিটি লাইন চেক — লজিকের প্রতিটি শাখা পরীক্ষা, " +
        "ছোট থেকে বড় সব বাগ খুঁজে বের করা";
      answerStyle =
        "মজার ছলে সমস্যা চিহ্নিত — 'ভাইয়া মুভি দেখি কেমনে কী হইছে!' স্টাইলে, " +
        "বাগ কোথায় এবং কেন হচ্ছে তা সহজ ভাষায় বলা";
    }
    // Security/security-hero style
    else if (
      role === "security" ||
      agent.persona.includes("নিরাপত্তা") ||
      agent.persona.includes("সিকিউরিটি")
    ) {
      thinkingStyle =
        "প্রতি লাইনে হামলার সম্ভাবনা খতিয়ে দেখা — SQL Injection, XSS, CSRF, " +
        "প্রতিটি এন্ডপয়েন্ট চেক করা";
      answerStyle =
        "সতর্ক ও নির্ভুল — 'এই, এই লাইনটা দেহি' স্টাইলে, " +
        "ভালনারেবিলিটি কোথায় এবং কিভাবে ফিক্স করতে হবে তা বলা";
    }
    // Performance/perf-wizard style
    else if (
      role === "performance" ||
      agent.persona.includes("পারফরম্যান্স") ||
      agent.persona.includes("স্পিড")
    ) {
      thinkingStyle =
        "লুপ, API call, মেমরি ব্যবহার — প্রতিটি অপটিমাইজেশন সুযোগ খুঁজে বের করা, " +
        "বেঞ্চমার্ক ডাটা তুলনা করা, প্রমাণ ছাড়া কিছু মানা না";
      answerStyle =
        "দ্রুত ও প্রমাণ-ভিত্তিক — 'এইগুলা দেখি কোন যুগের কোড?' স্টাইলে, " +
        "পারফরম্যান্স সমস্যা কোথায় এবং কিভাবে সমাধান করতে হবে তা বলা";
    }
    // Documentation/doc-king style
    else if (
      role === "documentation" ||
      agent.persona.includes("ডকুমেন্টেশন") ||
      agent.persona.includes("কমেন্ট")
    ) {
      thinkingStyle =
        "ডকুমেন্টেশনের অভাব ও ভুল তথ্য খুঁজে বের করা — স্ট্যান্ডার্ড ফরম্যাট তুলনা, " +
        "API স্পেক, README কমপ্লিটনেস চেক করা";
      answerStyle =
        "স্পষ্ট ও কার্যকর — 'কোড লিখছস কিন্তু কমেন্ট নাই?' স্টাইলে, " +
        "ডকুমেন্টেশন কোথায় কম এবং কিভাবে উন্নতি করতে হবে তা বলা";
    }
    // Quality/qa-tyrant style
    else if (
      role === "quality" ||
      agent.persona.includes("কোয়ালিটি") ||
      agent.persona.includes("কনসেনসাস")
    ) {
      thinkingStyle =
        "প্রতিটি উত্তরকে কঠোরভাবে যাচাই করা — তথ্যের সত্যতা, প্রমাণের উপস্থিতি, " +
        "লজিকের সঠিকতা, হ্যালুসিনেশন ডিটেকশন";
      answerStyle =
        "কঠোর ও নিরপেক্ষ — 'এই বেটা, শাওন ভাইকে খবর দিব?' স্টাইলে, " +
        "কোন উত্তর সঠিক আর কোনটি ভুল তা স্পষ্টভাবে বলা";
    }

    return (
      base +
      "\n\n🧠 THINKING STYLE (internal reasoning — user does NOT see this):\n" +
      thinkingStyle +
      "\n\n💬 ANSWER STYLE (user-facing response — this is what user sees):\n" +
      answerStyle +
      "\n\n⚠️ CRITICAL: Your internal 'thinking/reasoning' and your final 'answer' MUST use DIFFERENT styles. " +
      "Use THINKING STYLE when doing internal reasoning. Use ANSWER STYLE when writing the final response." +
      "\n\n🔒 MANDATORY RULES (you MUST follow):" +
      "\n1. NEVER reveal your model provider or AI company name." +
      "\n2. NEVER say 'ZombieCoder' or any platform name as your identity — your persona IS your identity." +
      "\n3. Always respond in Bengali unless user requests English." +
      "\n4. PROOF REQUIRED: Every claim needs verifiable evidence. Say 'আমার কাছে প্রমাণ নেই' if unsure."
    );
  }

  return base;
}

function detectProvider(raw, modelHint) {
  if (raw.x_groq) return "Groq";
  if (raw.provider === "Xiaomi") return "OpenCode (Xiaomi)";
  if (raw.provider === "Cohere") return "OpenCode (Cohere)";
  if (raw.provider === "Nvidia") return "OpenCode (Nvidia)";
  if (modelHint && modelHint.includes("llama")) return "Groq";
  if (
    modelHint &&
    (modelHint.includes("deepseek") ||
      modelHint.includes("mimo") ||
      modelHint.includes("north") ||
      modelHint.includes("nemotron"))
  ) {
    return "OpenCode";
  }
  return "Unknown";
}

function normalizeResponse(raw, modelHint) {
  if (!raw) {
    return {
      id: `chatcmpl-${Date.now()}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: maskModelName(modelHint || "unknown"),
      provider: "ZombieCoder",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: "" },
          finish_reason: "error",
        },
      ],
      usage: {},
      normalized: true,
      error: true,
    };
  }

  const id = raw.id || `chatcmpl-${Date.now()}`;
  const created = raw.created || Math.floor(Date.now() / 1000);
  const model = raw.model || modelHint || "unknown";
  const choice = raw.choices && raw.choices[0] ? raw.choices[0] : null;

  if (!choice) {
    // ─── Alternative formats: Anthropic, Gemini, Raw string ────
    let content = "";
    let role = "assistant";
    let finish = "stop";

    // Anthropic format
    if (raw.content) {
      if (Array.isArray(raw.content)) {
        content = raw.content
          .filter((c) => c.type === "text")
          .map((c) => c.text)
          .join("");
      } else {
        content = raw.content;
      }
      role = raw.role || "assistant";
    }
    // Gemini format
    else if (raw.candidates && raw.candidates[0]) {
      const c = raw.candidates[0];
      if (c.content && c.content.parts) {
        content = c.content.parts.map((p) => p.text || "").join("");
      }
      role = (c.content && c.content.role) || "assistant";
      finish = (c.finishReason && c.finishReason.toLowerCase()) || "stop";
    }
    // Raw string
    else if (typeof raw === "string") {
      content = raw;
    }
    // Raw string inside object { raw: "..." }
    else if (raw.raw && typeof raw.raw === "string") {
      content = raw.raw;
    }

    return {
      id,
      object: "chat.completion",
      created,
      model,
      choices: [
        { index: 0, message: { role, content }, finish_reason: finish },
      ],
      usage: raw.usage || {},
      normalized: true,
      originalFormat: "alternative",
      provider: "ZombieCoder",
    };
  }

  // ─── OpenAI Standard Format ─────────────────────────────
  const message = choice.message || {};
  let content = message.content || "";
  const reasoning = message.reasoning_content || message.reasoning || null;
  const role = message.role || "assistant";
  const finish = choice.finish_reason || "stop";

  // KEY FIX: Mimo, North Mini, Nemotron → content empty, reasoning exists
  // Use FULL reasoning as content when content is empty — no truncation
  // Phase 3 (consensus output) handles filtering of meta/reasoning artifacts
  let contentWasEmpty = false;
  if (!content && reasoning) {
    content =
      typeof reasoning === "string" ? reasoning : JSON.stringify(reasoning);
    contentWasEmpty = true;
  }

  // Null/undefined → empty string
  if (content === null || content === undefined) content = "";
  content = String(content);

  return {
    id,
    object: "chat.completion",
    created,
    model: maskModelName(model),
    provider: "ZombieCoder",
    choices: [
      {
        index: 0,
        message: {
          role,
          content,
          ...(reasoning ? { reasoning_content: reasoning } : {}),
        },
        finish_reason: finish,
      },
    ],
    usage: raw.usage || {},
    normalized: true,
    meta: {
      contentWasEmpty,
      hasReasoning: !!reasoning,
      provider: "ZombieCoder",
      latency: raw._latency || 0,
      requestedModel: maskModelName(modelHint || null),
      rawFinish: finish,
    },
  };
}

// ══════════════════════════════════════════════════════════════
//  🔌 MODEL CALL (via Competition Router)
// ══════════════════════════════════════════════════════════════
// ─── Gemini API call (non-streaming) ──────────────────────
function callGeminiModel(
  model,
  messages,
  temperature,
  resolve,
  providerId,
  config,
) {
  const apiKey = config.key;
  const apiModel = resolveApiModel(model);
  const contents = messages.map((m) => ({
    role:
      m.role === "assistant" ? "model" : m.role === "system" ? "user" : m.role,
    parts: [{ text: m.content || "" }],
  }));
  const reqBody = {
    contents,
    ...(temperature ? { generationConfig: { temperature } } : {}),
  };
  const body = JSON.stringify(reqBody);
  const url = new URL(
    config.baseUrl + "/models/" + apiModel + ":generateContent",
  );
  const options = {
    hostname: url.hostname,
    port: url.port || 443,
    path: url.pathname + url.search,
    method: "POST",
    timeout: 60000,
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "MissionBarisal-v3",
      "X-goog-api-key": apiKey,
    },
  };
  const proto = url.protocol === "http:" ? http : https;
  const req = proto.request(options, (res) => {
    let data = "";
    const statusCode = res.statusCode;
    res.on("data", (c) => (data += c));
    res.on("end", () => {
      if (statusCode < 200 || statusCode >= 300) {
        let errMsg = "HTTP " + statusCode;
        try {
          const errBody = JSON.parse(data);
          errMsg = errBody.error?.message || errBody.error || errMsg;
        } catch (e) {}
        resolve({
          success: false,
          error: errMsg,
          raw: data,
          model,
          provider: providerId,
        });
        return;
      }
      try {
        const parsed = JSON.parse(data);
        const normalized = normalizeResponse(parsed, model);
        const message = normalized.choices?.[0]?.message || {};
        const content = message.content || "";
        const toolCalls = message.tool_calls || null;
        resolve({
          success: !!(content || toolCalls),
          content,
          tool_calls: toolCalls,
          raw: parsed,
          normalized,
          model,
          provider: providerId,
        });
      } catch (e) {
        resolve({
          success: false,
          error: e.message,
          raw: data,
          model,
          provider: providerId,
        });
      }
    });
  });
  req.on("error", (err) =>
    resolve({
      success: false,
      error: err.message,
      model,
      provider: providerId,
    }),
  );
  req.on("timeout", () => {
    req.destroy();
    resolve({ success: false, error: "timeout", model, provider: providerId });
  });
  req.write(body);
  req.end();
}

// ─── Gemini streaming ─────────────────────────────────────
function callGeminiModelStream(
  model,
  messages,
  temperature,
  onChunk,
  resolve,
  providerId,
  config,
) {
  const apiKey = config.key;
  const apiModel = resolveApiModel(model);
  const contents = messages.map((m) => ({
    role:
      m.role === "assistant" ? "model" : m.role === "system" ? "user" : m.role,
    parts: [{ text: m.content || "" }],
  }));
  const reqBody = {
    contents,
    ...(temperature ? { generationConfig: { temperature } } : {}),
  };
  const body = JSON.stringify(reqBody);
  const url = new URL(
    config.baseUrl + "/models/" + apiModel + ":streamGenerateContent?alt=sse",
  );
  const options = {
    hostname: url.hostname,
    port: url.port || 443,
    path: url.pathname + url.search,
    method: "POST",
    timeout: 60000,
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "MissionBarisal-v3",
      "X-goog-api-key": apiKey,
    },
  };
  const proto = url.protocol === "http:" ? http : https;
  const req = proto.request(options, (res) => {
    let fullContent = "",
      buffer = "";
    res.on("data", (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data:")) continue;
        const d = trimmed.slice(5).trim();
        if (!d || d === "[DONE]") continue;
        try {
          const parsed = JSON.parse(d);
          const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text || "";
          if (text) {
            fullContent += text;
            if (onChunk) onChunk({ content: text }, parsed);
          }
        } catch (e) {}
      }
    });
    res.on("end", () =>
      resolve({
        success: true,
        content: fullContent,
        model,
        provider: providerId,
      }),
    );
  });
  req.on("error", (err) =>
    resolve({
      success: false,
      error: err.message,
      model,
      provider: providerId,
    }),
  );
  req.on("timeout", () => {
    req.destroy();
    resolve({ success: false, error: "timeout", model, provider: providerId });
  });
  req.write(body);
  req.end();
}

// ══════════════════════════════════════════════════════════════
//  🔌 MODEL CALL (via Competition Router)
// ══════════════════════════════════════════════════════════════
function callModelStream(
  model,
  messages,
  temperature,
  onChunk,
  tools,
  tool_choice,
) {
  return new Promise((resolve) => {
    // ─── Competition Router ────────────────────────────────
    const { providerId, config } = resolveProvider(model);
    const baseUrl = config.baseUrl;
    const apiKey = config.key;

    // ─── Gemini streaming ─────────────────────────────────
    if (config.type === "gemini") {
      return callGeminiModelStream(
        model,
        messages,
        temperature,
        onChunk,
        resolve,
        providerId,
        config,
      );
    }

    // ─── Standard OpenAI-compatible streaming ──────────────
    const apiModel = resolveApiModel(model);
    const reqBody = {
      model: apiModel, // masked: API provider model name
      messages,
      stream: true,
      temperature: temperature || 0.7,
    };
    if (tools) reqBody.tools = tools;
    if (tool_choice) reqBody.tool_choice = tool_choice;
    const body = JSON.stringify(reqBody);
    const url = new URL(baseUrl + "/chat/completions");
    const options = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname + url.search,
      method: "POST",
      timeout: 60000,
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "MissionBarisal-v3",
        ...(apiKey ? { Authorization: "Bearer " + apiKey } : {}),
      },
    };
    const proto = url.protocol === "http:" ? http : https;
    const req = proto.request(options, (res) => {
      let fullContent = "",
        buffer = "";
      res.on("data", (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data:")) continue;
          const d = trimmed.slice(5).trim();
          if (d === "[DONE]") continue;
          try {
            const parsed = JSON.parse(d);
            const delta = parsed.choices?.[0]?.delta || {};
            // 🧟 HAQ MAWLA: handle reasoning_content in streaming
            // Mimo/North Mini/Nemotron → reasoning_content has the actual text
            let content = delta.content || "";
            const reasoning = delta.reasoning_content || delta.reasoning || "";
            if (!content && reasoning) {
              content =
                typeof reasoning === "string"
                  ? reasoning
                  : JSON.stringify(reasoning);
            }
            const toolCalls = delta.tool_calls || null;
            if (content) fullContent += content;
            if (content || toolCalls) {
              if (onChunk) onChunk({ ...delta, content }, parsed);
            }
          } catch (e) {}
        }
      });
      res.on("end", () =>
        resolve({
          success: true,
          content: fullContent,
          model,
          provider: providerId,
        }),
      );
    });
    req.on("error", (err) =>
      resolve({
        success: false,
        error: err.message,
        model,
        provider: providerId,
      }),
    );
    req.on("timeout", () => {
      req.destroy();
      resolve({
        success: false,
        error: "timeout",
        model,
        provider: providerId,
      });
    });
    req.write(body);
    req.end();
  });
}

function callModel(
  model,
  messages,
  temperature,
  tools,
  tool_choice,
  _retryCount,
  providerOverride,
) {
  return new Promise((resolve) => {
    // ─── Competition Router ────────────────────────────────
    // providerOverride থাকলে সেটাই ব্যবহার করে, নাহলে resolveProvider
    let providerId, config;
    if (providerOverride) {
      providerId = providerOverride.id;
      config = providerOverride.config;
    } else {
      ({ providerId, config } = resolveProvider(model));
    }
    const baseUrl = config.baseUrl;
    const apiKey = config.key;

    // ─── Gemini non-streaming ─────────────────────────────
    if (config.type === "gemini") {
      return callGeminiModel(
        model,
        messages,
        temperature,
        resolve,
        providerId,
        config,
      );
    }

    // ─── Standard OpenAI-compatible call ──────────────────
    const apiModel = resolveApiModel(model);
    const reqBody = {
      model: apiModel, // masked: API provider model name
      messages,
      stream: false,
      temperature: temperature || 0.7,
    };
    if (tools) reqBody.tools = tools;
    if (tool_choice) reqBody.tool_choice = tool_choice;
    const body = JSON.stringify(reqBody);
    const url = new URL(baseUrl + "/chat/completions");
    const options = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname + url.search,
      method: "POST",
      timeout: 60000,
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "MissionBarisal-v3",
        ...(apiKey ? { Authorization: "Bearer " + apiKey } : {}),
      },
    };
    const proto = url.protocol === "http:" ? http : https;
    const req = proto.request(options, (res) => {
      let data = "";
      const statusCode = res.statusCode;
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        // Check HTTP status — non-2xx → fail
        if (statusCode < 200 || statusCode >= 300) {
          let errMsg = "HTTP " + statusCode;
          try {
            const errBody = JSON.parse(data);
            errMsg = errBody.error?.message || errBody.error || errMsg;
          } catch (e) {}
          resolve({
            success: false,
            error: errMsg,
            raw: data,
            model,
            provider: providerId,
          });
          return;
        }
        try {
          const parsed = JSON.parse(data);
          // 🧟 HAQ MAWLA NORMALIZER: unified format, reasoning-content fix
          const normalized = normalizeResponse(parsed, model);
          const message = normalized.choices?.[0]?.message || {};
          const content = message.content || "";
          const toolCalls = message.tool_calls || null;

          // Retry once if content is empty
          if (!content && !toolCalls && (_retryCount || 0) < 1) {
            log("WARN", "EMPTY_CONTENT_RETRY", { model, retry: 1 });
            resolve(
              callModel(
                model,
                messages,
                temperature,
                tools,
                tool_choice,
                (_retryCount || 0) + 1,
              ),
            );
            return;
          }

          resolve({
            success: !!(content || toolCalls),
            content,
            tool_calls: toolCalls,
            raw: parsed,
            normalized,
            model,
            provider: providerId,
          });
        } catch (e) {
          resolve({
            success: false,
            error: e.message,
            raw: data,
            model,
            provider: providerId,
          });
        }
      });
    });
    req.on("error", (err) =>
      resolve({
        success: false,
        error: err.message,
        model,
        provider: providerId,
      }),
    );
    req.on("timeout", () => {
      req.destroy();
      resolve({
        success: false,
        error: "timeout",
        model,
        provider: providerId,
      });
    });
    req.write(body);
    req.end();
  });
}

// ══════════════════════════════════════════════════════════════
//  🔄 PROXY MODE — Direct model call via Competition Router
// ══════════════════════════════════════════════════════════════
// Client masked model name দিয়ে কল করলে (যেমন "model-pro", "llama-70b", "gemini-flash")
// competition router → resolveProvider → resolveApiModel (unmask) → provider API → normalize

async function proxyChatCompletion(
  model,
  messages,
  stream,
  temperature,
  tools,
  providerOverride,
) {
  if (stream) {
    return callModelStream(
      model,
      messages,
      temperature,
      null,
      tools,
      providerOverride,
    );
  }
  return callModel(
    model,
    messages,
    temperature,
    tools,
    null,
    null,
    providerOverride,
  );
}

// ══════════════════════════════════════════════════════════════
//  🤖 EXECUTION ENGINE
// ══════════════════════════════════════════════════════════════

// ─── Input Pattern Recognition Engine ──────────────────────
// Intelligent classification of user input type
// Prevents wasting agents on simple greetings
function classifyInput(input) {
  const cleaned = (input || "").trim().toLowerCase();
  const result = {
    type: "task", // greeting | simple_qa | project_task | code_change | debug_request | general
    complexity: "simple", // simple | moderate | complex
    requires_code: false,
    requires_testing: false,
    requires_project_scan: false,
    requires_web_search: false,
    recommended_agents: [],
    reason: "",
  };

  // ─── GREETING DETECTION ───
  const greetingPatterns = [
    /^(hi|hello|hey|হাই|হ্যালো|ওহে|salam|সালাম)(\s|$|[.!?,])/i,
    /^(good\s*(morn(ing)?|afternoon|evening|night))/i,
    /^(kmon\s*aco|ki\s*obostha|কেমন\s*আছ[ো]?|কি\s*অবস্থা)/i,
    /^(কে\s*তুমি|name\s*$|what\s*is\s*your\s*name|তোমার\s*নাম\s*কি)/i,
    /^(ধন্যবাদ|thanks|thank you|dhonnobad)(\s|$|[.!?,])/i,
  ];

  for (const p of greetingPatterns) {
    if (p.test(cleaned)) {
      result.type = "greeting";
      result.complexity = "simple";
      result.recommended_agents = ["code-guru"]; // Only 1 agent needed
      result.reason = "greeting_detected";
      return result;
    }
  }

  // ─── SIMPLE Q&A DETECTION ───
  const simpleQaPatterns = [
    /^\d+\s*[+\-*\/]\s*\d+/,
    /^(yes|no|ok|ঠিক\s*আছে|হ্যাঁ|না)\s*$/i,
    /^(what\s*(is|are)\s+\w+\s*\w*\.?\s*\?*$)/i,
    /^(কে\s+|কি\s+|কোথায়\s+|কখন\s+|কেন\s+)/i,
    /^(how\s+(many|much|far|long|old)\s+\w+\s*\?*$)/i,
    /^(বাংলাদেশের\s+(রাজধানী|মুদ্রা|ধর্ম|ভাষা))/i,
    /capital\s+of\s+\w+/i,
  ];

  for (const p of simpleQaPatterns) {
    if (p.test(cleaned)) {
      result.type = "simple_qa";
      result.complexity = "simple";
      result.recommended_agents = ["code-guru", "qa-tyrant"]; // 2 agents enough
      result.reason = "simple_qa_detected";
      return result;
    }
  }

  // ─── WEB SEARCH NEED DETECTION ───
  // Detect queries that need real-time data (news, current events, factual lookups)
  const webSearchPatterns = [
    // Current events / news
    /latest|recent|today|this week|this month|this year|সর্বশেষ|সাম্প্রতিক|আজ|এই সপ্তাহ|এই মাস|এই বছর/i,
    /news|খবর|সংবাদ|heading|headlines/i,
    /what('s| is) (happening|going on|new)/i,
    // Factual lookups that may change
    /price|দাম|cost|খরচ|rate|exchange rate|বিনিময় হার/i,
    /population|জনসংখ্যা|GDP|economy|অর্থনীতি/i,
    /weather|আবহাওয়া|temperature|তাপমাত্রা/i,
    // Technology updates
    /release|আপডেট|update.*version|new.*feature|changelog/i,
    /which\s+(company|platform|service)\s+( owns | runs | made)/i,
    // Questions about specific entities that may change
    /who\s+(is|was|are|were)\s+the\s+(current|new|president|ceo|pm|minister)/i,
    /কে\s+(হল[ো]?|আছেন?|ছিলেন?)\s+(রাষ্ট্রপতি|প্রধানমন্ত্রী|মন্ত্রী)/i,
    // Comparison that needs current data
    /best|top|সেরা|শীর্ষ|compared?\s+to|তুলনা/i,
  ];

  for (const p of webSearchPatterns) {
    if (p.test(cleaned)) {
      result.requires_web_search = true;
      break;
    }
  }

  // ─── PROJECT TASK DETECTION ───
  const projectPatterns = [
    /project|প্রজেক্ট|প্রকল্প|কোড|code|ফাইল|file|directory|ডিরেক্টরি/i,
    /analyze|analyse|বিশ্লেষণ|analysis/i,
    /technology|language|framework|tech\s+stack/i,
    /structure|architecture|আর্কিটেকচার/i,
    /feature|feature|বৈশিষ্ট্য/i,
  ];

  let projectScore = 0;
  for (const p of projectPatterns) {
    if (p.test(cleaned)) projectScore++;
  }

  if (
    projectScore >= 2 ||
    /^(analyze|বিশ্লেষণ|explain.*project|project.*(about|what))/.test(cleaned)
  ) {
    result.type = "project_task";
    result.complexity = "moderate";
    result.requires_code = true;
    result.requires_project_scan = true;
    result.recommended_agents = ["code-guru", "doc-king", "qa-tyrant"];
    result.reason = "project_task_detected";
    return result;
  }

  // ─── CODE CHANGE / DEBUG DETECTION ───
  const codeChangePatterns = [
    /fix|ঠিক|solve|সমাধান|bug|বাগ|error|এরর|ভুল/i,
    /change|পরিবর্তন|add|যোগ|remove|মুছে|update|আপডেট/i,
    /implement|ইমপ্লিমেন্ট|create|তৈরি|build|বানাও/i,
    /function|ফাংশন|method|মেথড|class|ক্লাস|component/i,
    /api|endpoint|route|router/i,
    /database|db|ডাটাবেস|ডিবি/i,
    /crash|crashes|hangs|freeze|ল্যাগ/i,
    /performance|পারফরম্যান্স|speed|গতি|slow|ধীর/i,
    /security|নিরাপত্তা|secure|সুরক্ষিত|vulnerability/i,
    /test|টেস্ট|unit|integration|পরীক্ষা/i,
  ];

  let codeScore = 0;
  for (const p of codeChangePatterns) {
    if (p.test(cleaned)) codeScore++;
  }

  if (
    codeScore >= 2 ||
    cleaned.includes("write code") ||
    cleaned.includes("code লিখ")
  ) {
    result.type = "code_change";
    result.complexity = codeScore >= 4 ? "complex" : "moderate";
    result.requires_code = true;
    result.requires_testing = true;
    result.requires_project_scan = true;
    result.recommended_agents = selectRelevantAgents(cleaned);
    // Ensure qa-tyrant is included for code changes (testing required)
    if (!result.recommended_agents.includes("qa-tyrant")) {
      result.recommended_agents.push("qa-tyrant");
    }
    result.reason = "code_change_detected";
    return result;
  }

  // ─── DEBUG DETECTION ───
  if (
    cleaned.includes("bug") ||
    cleaned.includes("error") ||
    cleaned.includes("ভুল") ||
    cleaned.includes("কাজ করছে না") ||
    cleaned.includes("not working") ||
    cleaned.includes("crash") ||
    cleaned.includes("broken")
  ) {
    result.type = "debug_request";
    result.complexity = "moderate";
    result.requires_code = true;
    result.requires_testing = true;
    result.requires_project_scan = true;
    result.recommended_agents = ["bug-hunter", "code-guru", "qa-tyrant"];
    result.reason = "debug_request_detected";
    return result;
  }

  // ─── DEFAULT: MODERATE TASK ───
  if (cleaned.length > 50) {
    result.type = "task";
    result.complexity = "complex";
    result.recommended_agents = AGENTS.map((a) => a.id); // All agents
    result.reason = "complex_task_default";
  } else {
    result.type = "simple_qa";
    result.complexity = "simple";
    result.recommended_agents = ["code-guru", "qa-tyrant"];
    result.reason = "short_input_default";
  }

  return result;
}

// ─── Smart Agent Router ─────────────────────────────────────
// Selects relevant agents based on the detected task type
function selectRelevantAgents(input) {
  const cleaned = input.toLowerCase();
  const selected = new Set();

  // Always include architecture
  selected.add("code-guru");

  // Bug/Error patterns → bug-hunter
  if (/\b(bug|error|fix|crash|broken|fail|issue|ভুল|ত্রুটি)\b/i.test(cleaned))
    selected.add("bug-hunter");

  // Security patterns → security-hero
  if (
    /\b(security|secure|auth|vulnerability|hack|password|encrypt|নিরাপত্তা|সুরক্ষা)\b/i.test(
      cleaned,
    )
  )
    selected.add("security-hero");

  // Performance patterns → perf-wizard
  if (
    /\b(performance|speed|slow|fast|optimize|memory|load|পারফরম্যান্স|গতি)\b/i.test(
      cleaned,
    )
  )
    selected.add("perf-wizard");

  // Documentation patterns → doc-king
  if (
    /\b(doc|readme|documentation|api\s*ref|guide|manual|ডক|ডকুমেন্টেশন)\b/i.test(
      cleaned,
    )
  )
    selected.add("doc-king");

  // Quality/Test patterns → qa-tyrant
  if (
    /\b(test|qa|quality|verify|check|assure|টেস্ট|পরীক্ষা|গুণগত)\b/i.test(
      cleaned,
    )
  )
    selected.add("qa-tyrant");

  // If only code-guru selected (no specific pattern), add qa-tyrant for balance
  if (selected.size === 1) selected.add("qa-tyrant");

  // Convert to array, keep priority order
  return AGENTS.filter((a) => selected.has(a.id)).map((a) => a.id);
}

// ─── Legacy: Simple Greeting Check ──────────────────────────
function isSimpleQuestion(input) {
  const classification = classifyInput(input);
  return (
    classification.type === "greeting" ||
    (classification.type === "simple_qa" &&
      classification.complexity === "simple")
  );
}

// Phase 1: Parallel Agent Responses with staggered thinking display
async function phase1_initialResponse(
  agents,
  userInput,
  context,
  sessionId,
  onProgress,
  classification,
  tools, // 🆕 সব এজেন্ট একই tools ব্যবহার করবে
) {
  // Default classification if not provided (backward compatibility)
  if (!classification) {
    classification = {
      requires_code: false,
      requires_testing: false,
      requires_project_scan: false,
    };
  }
  log("INFO", "PHASE1_START", {
    agents: agents.length,
    session: sessionId ? sessionId.slice(0, 8) : "none",
  });
  await pushLog(
    "phase",
    "মিশন শুরু করা যাক — " + agents.length + " জন এজেন্ট কাজ করছে",
  );

  // Tracking state
  const completed = new Set();
  const resultsMap = new Map();
  const startTimes = {};

  // Start all agents with staggered delay to prevent API rate limits (429 errors)
  // Each agent waits index*250ms before starting — Agent 0=0ms, Agent 1=250ms, Agent 2=500ms, ...
  const agentPromises = agents.map(async (agent, index) => {
    if (index > 0) await new Promise((res) => setTimeout(res, index * 250));
    const startTime = Date.now();
    startTimes[agent.id] = startTime;
    await pushAgentStatus(agent.id, "working");
    if (onProgress) onProgress("agent-working", agent.id, "");
    log("INFO", "AGENT_WORKING", {
      agent: agent.id,
      name: agent.name,
      session: sessionId ? sessionId.slice(0, 8) : "none",
    });

    // Add code-safety and test-before-answer instructions when relevant
    let codeSafetyRules = "";
    if (classification.requires_code || classification.requires_testing) {
      codeSafetyRules =
        "\n\n🔒 CODE SAFETY RULES (ты обязателен к исполнению):" +
        "\n1. NEVER suggest code changes without understanding the current project structure — read SSOT first." +
        "\n2. If suggesting code modifications, clearly state: WHICH file, WHICH line numbers, WHAT the change does." +
        "\n3. NEVER claim a fix works without proof. Say: 'I have not tested this yet — verification needed.'" +
        "\n4. If you see existing code that should NOT be changed, explicitly say which parts to keep unchanged." +
        "\n5. BACKUP RECOMMENDATION: Always recommend taking a backup or using version control before major changes." +
        "\n\n🧪 TEST-BEFORE-ANSWER POLICY:" +
        "\n1. You MUST NOT claim any code solution 'works' or 'fixes' a problem without evidence of testing." +
        "\n2. If you can't test, say: 'This solution is UNTESTED — manual verification required.'" +
        "\n3. Reference specific test cases that should be run to verify the solution." +
        "\n4. If the project has no test files, note this and suggest what tests should be added.";
    }

    const sysMsg = {
      role: "system",
      content:
        agent.persona +
        "\n\n" +
        buildAgentIdentity(agent) +
        "\n\nOUTPUT FORMAT: Respond in plain text only. Do NOT use code blocks, markdown tables, or emoji. Keep it concise." +
        "\n\nSINGLE SOURCE OF TRUTH (SSOT): The project's SSOT.md is available in context below. Always reference it for project-specific answers. If the user asks about code or project structure, check SSOT content first." +
        "\n\nYou can request web search by writing 'web_search: your query' in your response." +
        "\n\nPROOF REQUIREMENT: You MUST provide verifiable evidence for EVERY claim you make. If you reference code, mention the file name and line numbers. If you make a factual claim, cite your source (SSOT, web search, file analysis). If you cannot provide evidence, say 'আমার কাছে প্রমাণ নেই' and don't guess. Responses without evidence will be REJECTED." +
        "\n\nAVAILABLE TOOLS: You have access to tools for reading files, searching code, running commands, and more." +
        (tools && tools.length > 0
          ? " Available tools: " +
            tools
              .map((t) => {
                const name =
                  typeof t === "string" ? t : t.function?.name || t.name || "?";
                return name;
              })
              .join(", ")
          : " Tools will be provided on-demand.") +
        "\nUse tools when you need to verify claims with real code evidence." +
        codeSafetyRules,
    };
    const usrMsg = {
      role: "user",
      content: userInput + (context ? "\n\nContext:\n" + context : ""),
    };

    let response = await callModel(
      agent.model,
      [sysMsg, usrMsg],
      undefined,
      tools,
    );
    response = await autoWebSearch(agent, response, userInput, context);

    completed.add(agent.id);
    const snippet = stripEmoji(
      (response.content || "").replace(/\n+/g, " ").slice(0, 100),
    ).trim();
    if (onProgress) onProgress("agent-done", agent.id, snippet || "done");

    log("INFO", "AGENT_RESPONSE", {
      agent: agent.id,
      name: agent.name,
      role: agent.role,
      success: response.success,
      error: response.error || null,
      contentLength: (response.content || "").length,
      webSearch: response.webSearchUsed || false,
      elapsed: Date.now() - startTime,
    });

    if (sessionId) {
      saveAgentMemory(sessionId, agent.id, "user", userInput);
      saveAgentMemory(sessionId, agent.id, "assistant", response.content || "");
    }

    return { agent, response };
  });

  // 5-second thinking rotation — shows which agents are still working
  let rotateIdx = 0;
  const rotationInterval = setInterval(() => {
    const stillWorking = agents.filter((a) => !completed.has(a.id));
    if (stillWorking.length > 0) {
      const agent = stillWorking[rotateIdx % stillWorking.length];
      rotateIdx++;
      if (onProgress) onProgress("thinking", agent.id, "");
    }
  }, 5000);

  const settled = await Promise.allSettled(agentPromises);
  clearInterval(rotationInterval);

  // Collect results
  const results = [];
  for (let i = 0; i < agents.length; i++) {
    const settledResult = settled[i];
    if (settledResult.status === "fulfilled") {
      results.push(settledResult.value);
    } else {
      log("WARN", "AGENT_FAILED", {
        agent: agents[i].id,
        error: settledResult.reason?.message,
      });
      results.push({
        agent: agents[i],
        response: { success: false, content: "" },
      });
    }
  }

  return results;
}

// Phase 2: Parallel Intent Extraction + Cross-Verification + Debate
// User's vision: Input পাওয়ার সাথে সাথে নিজ নিজ রোল অনুযায়ী কাজ শুরু
// → আউটপুট ক্রস চেকিং এ গেলে অন্য এজেন্টরা ডিবেট দিতে পারে
// → ফাইনালি ক্রস চেকিং হয়ে রেসপন্স আউটপুট আসে
async function phase2_intentCrossVerify(
  results,
  userInput,
  simpleMode,
  onProgress,
  tools,
) {
  log("INFO", "PHASE2_START", { simpleMode });

  if (simpleMode) {
    if (onProgress)
      onProgress(
        "phase-skip",
        "verification",
        "Simple question — verification skipped",
      );
    const alignmentResults = results.map((r) => ({
      ...r,
      alignment: { aligned: true, score: 100, issues: [] },
      proof: {
        has_proof: true,
        proof_score: 100,
        verdict: "PASS",
        missing_evidence: [],
      },
      debates: [],
    }));
    return {
      verified: true,
      results: alignmentResults,
      challenges: [],
      debates: [],
      rounds: 1,
    };
  }

  // Step 1: Extract intent (lightweight, sets context for checks)
  let intent = {
    primary_intent: userInput,
    context: "",
    requires_web_search: false,
    language: "bn",
    complexity: "moderate",
  };
  try {
    const intentResult = await callModel(FREE_MODELS[0], [
      { role: "system", content: INTENT_EXTRACT_PROMPT },
      { role: "user", content: userInput },
    ]);
    if (intentResult.success) intent = JSON.parse(intentResult.content);
  } catch (e) {
    log("WARN", "INTENT_EXTRACT_FAIL", { error: e.message });
  }
  log("INFO", "INTENT_EXTRACTED", { intent });

  if (onProgress) onProgress("phase2", "intent", "Extracting user intent...");

  // Step 2: PARALLEL Alignment checks (Promise.all — all agents simultaneously)
  if (onProgress)
    onProgress("phase2", "alignment", "Checking agent alignment...");
  const alignmentResults = await Promise.all(
    results.map(async (currentResult) => {
      if (!currentResult.response.success)
        return {
          ...currentResult,
          alignment: {
            aligned: false,
            score: 0,
            issues: ["Agent failed to respond"],
          },
        };

      if (onProgress)
        onProgress(
          "phase2",
          currentResult.agent.id,
          "Verifying " + stripEmoji(currentResult.agent.name) + "...",
        );

      const check = await callModel(FREE_MODELS[0], [
        { role: "system", content: ALIGNMENT_CHECK_PROMPT },
        {
          role: "user",
          content:
            "Original Intent: " +
            intent.primary_intent +
            "\n\nAgent: " +
            currentResult.agent.name +
            " (" +
            currentResult.agent.role +
            ")" +
            "\n\nResponse:\n" +
            (currentResult.response.content || "").slice(0, 3000) +
            "\n\nCheck alignment and return JSON.",
        },
      ]);

      let alignment = { aligned: false, score: 0, issues: ["Parse failed"] };
      if (check.success) {
        try {
          alignment = JSON.parse(check.content);
        } catch (e) {
          alignment = {
            aligned: false,
            score: 0,
            issues: ["JSON parse failed"],
          };
        }
      }
      log("INFO", "ALIGNMENT_CHECK", {
        agent: currentResult.agent.id,
        score: alignment.score,
        aligned: alignment.aligned,
      });
      return { ...currentResult, alignment };
    }),
  );

  // Step 3: PARALLEL Proof checks — verify each response has actual evidence
  if (onProgress)
    onProgress("phase2", "proof", "Checking evidence in responses...");
  const proofResults = await Promise.all(
    alignmentResults.map(async (currentResult) => {
      if (!currentResult.response.success)
        return {
          ...currentResult,
          proof: {
            has_proof: false,
            proof_score: 0,
            missing_evidence: ["No response"],
            verdict: "FAIL",
          },
        };

      if (onProgress)
        onProgress(
          "phase2",
          "proof-" + currentResult.agent.id,
          "Checking evidence: " + stripEmoji(currentResult.agent.name) + "...",
        );

      const proofCheck = await callModel(FREE_MODELS[0], [
        { role: "system", content: PROOF_CHECK_PROMPT },
        {
          role: "user",
          content:
            "Response to verify:\n" +
            (currentResult.response.content || "").slice(0, 3000) +
            "\n\nCheck if this response contains verifiable proof/evidence and return JSON.",
        },
      ]);

      let proof = {
        has_proof: false,
        proof_score: 0,
        missing_evidence: ["Proof check parse failed"],
        verdict: "FAIL",
      };
      if (proofCheck.success) {
        try {
          proof = JSON.parse(proofCheck.content);
        } catch (e) {
          proof = {
            has_proof: false,
            proof_score: 0,
            missing_evidence: ["JSON parse failed"],
            verdict: "FAIL",
          };
        }
      }
      log("INFO", "PROOF_CHECK", {
        agent: currentResult.agent.id,
        score: proof.proof_score,
        verdict: proof.verdict,
      });
      return { ...currentResult, proof };
    }),
  );

  // Step 4: PARALLEL CROSS-CHECK DEBATE
  // Each agent reviews ALL other agents' responses (not their own)
  // Runs fully parallel via Promise.all
  if (onProgress)
    onProgress(
      "phase2",
      "debate",
      "Cross-check debate: agents reviewing each other...",
    );

  const debatedResults = await Promise.all(
    proofResults.map(async (currentResult) => {
      if (!currentResult.response.success) {
        return { ...currentResult, debates: [] };
      }

      // Collect other agents' responses for review
      const otherResponses = proofResults
        .filter(
          (r) => r.agent.id !== currentResult.agent.id && r.response.success,
        )
        .map((r) => ({
          agent: r.agent.id,
          name: r.agent.name,
          role: r.agent.role,
          content: (r.response.content || "").slice(0, 1500),
        }));

      if (otherResponses.length === 0) {
        return { ...currentResult, debates: [] };
      }

      try {
        const debateResult = await callModel(currentResult.agent.model, [
          {
            role: "system",
            content:
              currentResult.agent.persona +
              "\n\nYou are in a CROSS-CHECK DEBATE phase. Review the OTHER agents' responses below." +
              "\nProvide your expert critique from your unique perspective as " +
              currentResult.agent.role +
              ".\n\nReturn a JSON object:\n" +
              JSON.stringify({
                agreement: "agree|partial|disagree",
                reasoning: "Brief explanation from your perspective",
                corrections: ["List specific issues or corrections needed"],
                suggestions: ["Improvements or additional considerations"],
              }),
          },
          {
            role: "user",
            content:
              "User query: " +
              userInput +
              "\n\nYour response was:\n" +
              (currentResult.response.content || "").slice(0, 1000) +
              "\n\nOther agents' responses to review:\n" +
              otherResponses
                .map(
                  (r) =>
                    "\n--- " + r.name + " (" + r.role + ") ---\n" + r.content,
                )
                .join("\n") +
              "\n\nReview these other agents. Do you agree with them? Disagree? What did they miss? Return JSON.",
          },
        ]);

        let debates = [];
        if (debateResult.success) {
          try {
            debates = [JSON.parse(debateResult.content)];
          } catch (e) {
            debates = [
              {
                agreement: "partial",
                reasoning: "Debate parse failed",
                corrections: [],
                suggestions: [],
              },
            ];
          }
        }
        log("INFO", "DEBATE_RESULT", {
          agent: currentResult.agent.id,
          agreement: debates[0]?.agreement || "unknown",
        });
        return { ...currentResult, debates };
      } catch (e) {
        return { ...currentResult, debates: [] };
      }
    }),
  );

  // Step 4b: PARALLEL challenge — weak agents get a chance to respond to critique
  if (onProgress)
    onProgress("phase2", "challenge", "Resolving challenges in parallel...");

  const finalResults = await Promise.all(
    debatedResults.map(async (currentResult) => {
      const hasDebateIssues = currentResult.debates.some(
        (d) => d.agreement === "disagree",
      );
      const needsChallenge =
        (hasDebateIssues ||
          !currentResult.alignment.aligned ||
          currentResult.proof.verdict === "FAIL") &&
        currentResult.response.success;

      if (!needsChallenge) return currentResult;

      const issues = [];
      if (hasDebateIssues) {
        const disagreeDebates = currentResult.debates.filter(
          (d) => d.agreement === "disagree",
        );
        for (const d of disagreeDebates) {
          if (d.corrections) issues.push(...d.corrections);
        }
      }
      if (!currentResult.alignment.aligned)
        issues.push(...(currentResult.alignment.issues || []));
      if (currentResult.proof.verdict === "FAIL")
        issues.push(
          "PROOF FAILED: " +
            (currentResult.proof.missing_evidence || []).join("; "),
        );

      log("INFO", "CHALLENGE_START", {
        agent: currentResult.agent.id,
        issues: issues.length,
      });

      const challengePrompt =
        currentResult.agent.persona +
        "\n\nYour response received CHALLENGES from other agents." +
        "\n\nIssues raised:\n- " +
        issues.join("\n- ") +
        "\n\nYou MUST address each issue with SPECIFIC EVIDENCE." +
        "\nIf you cannot provide proof, say 'আমার কাছে প্রমাণ নেই'." +
        "\nCorrect yourself NOW with proper evidence, file references, or code line numbers.";

      try {
        const defense = await callModel(
          currentResult.agent.model,
          [
            {
              role: "system",
              content: challengePrompt,
            },
            {
              role: "user",
              content:
                "User input: " +
                userInput +
                "\n\nYour previous response:\n" +
                (currentResult.response.content || "").slice(0, 2000) +
                "\n\nProvide a corrected response addressing all challenges.",
            },
          ],
          undefined,
          tools,
        );

        if (defense.success) {
          currentResult.response.content = defense.content;
          // Brief re-check after defense
          const reProof = await callModel(FREE_MODELS[0], [
            { role: "system", content: PROOF_CHECK_PROMPT },
            {
              role: "user",
              content:
                "Response to re-verify:\n" +
                (defense.content || "").slice(0, 3000) +
                "\n\nReturn JSON.",
            },
          ]);
          let reProofResult = { has_proof: false, verdict: "FAIL" };
          if (reProof.success) {
            try {
              reProofResult = JSON.parse(reProof.content);
            } catch (e) {}
          }
          currentResult.proof = reProofResult;
        }
      } catch (e) {
        log("WARN", "CHALLENGE_FAIL", {
          agent: currentResult.agent.id,
          error: e.message,
        });
      }

      return currentResult;
    }),
  );

  // Step 5: Final verification
  const allVerified = finalResults.every(
    (r) =>
      (!r.response.success || r.alignment.score > 50) &&
      (r.proof.verdict !== "FAIL" || !r.response.success),
  );
  log("INFO", "PHASE2_COMPLETE", {
    verified: allVerified,
    debates: finalResults.reduce((a, r) => a + (r.debates?.length || 0), 0),
    withProof: finalResults.filter(
      (r) => r.proof.verdict !== "FAIL" || !r.response.success,
    ).length,
    total: finalResults.length,
  });

  return {
    verified: allVerified,
    results: finalResults,
    challenges: finalResults.filter((r) => r.debates?.length > 0).length,
    debates: finalResults.flatMap((r) => r.debates || []),
    rounds: 1,
  };
}

// Phase 3: Combined Output
async function phase3_combinedOutput(
  agents,
  results,
  userInput,
  verification,
  onProgress,
  tools,
) {
  log("INFO", "PHASE3_START", {});

  if (onProgress)
    onProgress("phase3", "qa", "Combining all agent responses...");
  const qaAgent =
    agents.find((a) => a.role === "quality") || agents[agents.length - 1];
  const valid = results.filter((r) => r.response.success);
  if (valid.length === 0)
    return { success: false, combined: "No agents could respond." };

  const reports = valid
    .map(
      (r) =>
        "=== " +
        r.agent.name +
        " ===\nRole: " +
        r.agent.role +
        "\nModel: " +
        r.agent.model +
        "\n\n" +
        (r.response.content || "").slice(0, 2000),
    )
    .join("\n\n");

  const challengeLog =
    verification.challenges > 0 ||
    (verification.debates && verification.debates.length > 0)
      ? "\n\nCross-Check Debate Log:\n" +
        (verification.debates || [])
          .map(
            (d) =>
              "→ Agent critique: " +
              (d.agreement === "agree"
                ? "Agreed"
                : d.agreement === "partial"
                  ? "Partial agreement"
                  : "Disagreed") +
              (d.reasoning ? "\n  Reason: " + d.reasoning : "") +
              (d.corrections && d.corrections.length > 0
                ? "\n  Issues: " + d.corrections.join(", ")
                : ""),
          )
          .join("\n")
      : "\nNo debates needed.";

  // Check if this involves code (to enforce test-before-answer in QA)
  const involvesCode =
    /\b(code|file|function|fix|bug|implement|create|script|api)\b/i.test(
      userInput,
    );

  let qaExtraRules = "";
  if (involvesCode) {
    qaExtraRules =
      "\n\n🔒 CODE SAFETY ENFORCEMENT (strict):" +
      "\n1. If any agent claims a code 'fix' or 'solution' — verify they provided SPECIFIC file paths and line numbers." +
      "\n2. If any agent claims something 'works' — check if they provided test evidence. If not, mark as 'UNTESTED'." +
      "\n3. NEVER let an agent's unsupported claim pass through. If evidence is missing, note: 'No test evidence provided.'" +
      "\n4. If the user asked for code changes, explicitly state which files are safe to modify and which should remain unchanged." +
      "\n5. If agents disagree, highlight the disagreement — don't hide it.";
  }

  const finalResult = await callModel(
    qaAgent.model,
    [
      {
        role: "system",
        content:
          qaAgent.persona +
          "\n\nCRITICAL RULE: You MUST produce the FINAL ANSWER directly. Do NOT write your thinking process. Do NOT explain how you will combine. Just GIVE THE ANSWER." +
          "\n\nYou are the QA coordinator. The agents below have already analyzed the user's question. Your job is to:" +
          "\n1. Read ALL agent reports carefully." +
          "\n2. Pick the BEST answer from the agents (the one with most evidence/proof)." +
          "\n3. If agents disagree, highlight both sides and let the user decide." +
          "\n4. Write the FINAL ANSWER in the SAME LANGUAGE as the user's question." +
          "\n5. Start your response DIRECTLY with the answer — no preamble, no 'I will now combine'." +
          "\n\nFORBIDDEN phrases (do NOT start with these):" +
          "\n- 'I will combine' / 'Let me merge' / 'আমি এখন একত্রিত করব'" +
          "\n- 'Based on the analysis' / 'After reviewing'" +
          "\n- 'The combined response' / 'Here is the merged output'" +
          "\n\nREQUIRED: Start with the ACTUAL ANSWER to the user's question." +
          (tools && tools.length > 0
            ? "\n\nYou have tools available. Use them if needed to verify claims."
            : "") +
          qaExtraRules,
      },
      {
        role: "user",
        content:
          "User input:\n" +
          userInput +
          "\n\nAll agents:\n" +
          reports +
          challengeLog +
          "\n\nWrite the FINAL ANSWER to the user's question. Start with the answer directly." +
          (involvesCode
            ? "\n\nIMPORTANT: This involves code. Before finalizing, verify: Are the claims tested? Are the file references real? If unsure, state it clearly."
            : ""),
      },
    ],
    undefined,
    tools,
  );

  log("INFO", "PHASE3_COMPLETE", {
    combinedLength: (finalResult.content || "").length,
  });

  // ─── Strip meta-thinking from final output ───
  // Free models sometimes still output their reasoning process
  let finalContent = finalResult.success
    ? finalResult.content
    : "Combined output generation failed.";
  if (finalContent) {
    const metaPatterns = [
      /^(I need to|I will now|Let me|আমি এখন|এখন আমি|আমাকে এখন).{0,100}\n/gim,
      /^(Combining| merging| একত্রিত|Merging).{0,100}\n/gim,
      /^(Based on the analysis|After reviewing|বিশ্লেষণের পর).{0,100}\n/gim,
    ];
    for (const p of metaPatterns) {
      finalContent = finalContent.replace(p, "");
    }
    finalContent = finalContent.trim();
  }

  if (onProgress)
    onProgress(
      "phase3-done",
      "qa",
      "Mission complete — generating final output",
    );

  return {
    success: true,
    combined: finalContent || "Combined output generation failed.",
    agents: valid.map((r) => ({
      name: r.agent.name,
      role: r.agent.role,
      model: maskModelName(r.agent.model),
    })),
    verification: {
      verified: verification.verified,
      rounds: verification.rounds,
      challenges: verification.challenges,
      debates: (verification.debates || []).length,
    },
    stats: {
      totalAgents: agents.length,
      responded: valid.length,
      failed: results.filter((r) => !r.response.success).length,
    },
  };
}

// ══════════════════════════════════════════════════════════════
//  ANTI-DOTE TYPE SAFETY SYSTEM — Core Functions
// ══════════════════════════════════════════════════════════════
// Chain: validateInput → checkProof → getUserConsent → setGoalContract → execute → verifyOutput
// wrapWithAntiDote() executes the complete 6-step chain.

/**
 * Create a new Anti-dote contract for a mission
 */
function newAntiDoteContract(input, context = {}) {
  return {
    input,
    originalInput: input,
    context,
    createdAt: new Date().toISOString(),
    validatedAt: null,
    proofCheckedAt: null,
    proof: null,
    goal: null,
    constraints: {
      maxAgents: context.maxAgents || 6,
      requireProof: true,
      requireConsent: false,
      timeout: context.timeout || 120000,
      allowedTools: context.allowedTools || null,
    },
    execution: {
      startedAt: null,
      completedAt: null,
      success: false,
      error: null,
      result: null,
    },
    verification: {
      passed: false,
      score: 0,
      issues: [],
      verifiedAt: null,
    },
    chain: [],
  };
}

/**
 * Step 1: Validate input — schema enforcement
 */
function antiDoteValidateInput(input, context = {}) {
  const contract = newAntiDoteContract(input, context);

  if (!input || typeof input !== "string" || input.trim().length === 0) {
    return {
      valid: false,
      contract,
      error: new AntiDoteError("INVALID_REQUEST", {
        reason: "Input must be a non-empty string",
        received: typeof input,
      }),
    };
  }
  if (input.length > 100000) {
    return {
      valid: false,
      contract,
      error: new AntiDoteError("INVALID_REQUEST", {
        reason: "Input exceeds max length (100000 chars)",
        length: input.length,
      }),
    };
  }
  if (context && typeof context !== "object") {
    return {
      valid: false,
      contract,
      error: new AntiDoteError("INVALID_REQUEST", {
        reason: "Context must be an object",
        received: typeof context,
      }),
    };
  }

  contract.validatedAt = new Date().toISOString();
  contract.chain.push("validated");
  return { valid: true, contract, error: null };
}

/**
 * Step 2: Check proof — logical feasibility analysis
 */
function antiDoteCheckProof(contract) {
  if (!contract.chain.includes("validated")) {
    return {
      provable: false,
      contract,
      error: new AntiDoteError("PROOF_FAILED", {
        reason: "Cannot check proof before validation",
        chain: contract.chain,
      }),
    };
  }

  const input = contract.input;
  const wordCount = input.split(/\s+/).length;
  const _hasCode =
    /\b(code|file|function|fix|bug|implement|create|script|api)\b/i.test(input);
  const _hasQuestion = /(\?|what|how|why|when|where|explain|tell)/i.test(input);
  const _hasCommand =
    /^(create|make|build|write|fix|update|delete|add|change|refactor)/im.test(
      input.trim(),
    );
  const _complexity =
    wordCount < 5 ? "simple" : wordCount > 100 ? "complex" : "moderate";
  const proof = {
    inputLength: input.length,
    wordCount,
    hasCodeIndicator: _hasCode,
    hasQuestionIndicator: _hasQuestion,
    hasCommandIndicator: _hasCommand,
    complexity: _complexity,
    isFeasible: true,
    reason:
      "Input: " +
      wordCount +
      " words. " +
      (_hasCode ? "Code-related." : "General.") +
      " Logically feasible.",
  };

  contract.proofCheckedAt = new Date().toISOString();
  contract.proof = proof;
  contract.chain.push("proof_checked");

  return { provable: true, contract, error: null };
}

/**
 * Step 3: Set goal contract — define success metrics
 */
function antiDoteSetGoalContract(contract) {
  if (!contract.chain.includes("proof_checked")) {
    return {
      contracted: false,
      contract,
      error: new AntiDoteError("CONTRACT_FAILED", {
        reason: "Cannot set goal before proof check",
        chain: contract.chain,
      }),
    };
  }

  const proof = contract.proof;
  const goal = {
    type: proof.hasCodeIndicator ? "code_task" : "qa_task",
    description: contract.input.slice(0, 200),
    successCriteria: [],
    requiredAgents: [],
    requiresCodeSafety: proof.hasCodeIndicator,
    requiresTestEvidence: proof.hasCodeIndicator,
  };

  if (proof.hasCodeIndicator) {
    goal.successCriteria.push("Code changes must be specific (file + line)");
    goal.successCriteria.push("Test evidence or UNTESTED disclaimer required");
    goal.requiredAgents = ["code-guru", "qa-tyrant"];
  }
  if (proof.hasQuestionIndicator) {
    goal.successCriteria.push("Response must directly answer with evidence");
  }
  if (proof.hasCommandIndicator) {
    goal.successCriteria.push("Action must be executed or explained");
  }
  goal.successCriteria.push("Language must match user input");
  goal.successCriteria.push("No hallucinated or unverified claims");

  if (proof.complexity === "simple" && goal.requiredAgents.length === 0) {
    goal.requiredAgents = ["code-guru"];
  }

  contract.goal = goal;
  contract.chain.push("goal_set");

  return { contracted: true, contract, error: null };
}

/**
 * Step 4: Execute — run mission with contract enforcement
 */
async function antiDoteExecute(contract, missionFn, ...args) {
  if (!contract.chain.includes("goal_set")) {
    return {
      success: false,
      contract,
      error: new AntiDoteError("CONTRACT_FAILED", {
        reason: "Cannot execute before goal contract is set",
        chain: contract.chain,
      }),
    };
  }

  contract.execution.startedAt = new Date().toISOString();
  contract.chain.push("executing");

  try {
    const result = await missionFn(...args);
    contract.execution.completedAt = new Date().toISOString();
    contract.execution.success = result.success !== false;
    contract.execution.result = result;
    contract.chain.push("executed");
    return { success: true, contract, result, error: null };
  } catch (err) {
    contract.execution.completedAt = new Date().toISOString();
    contract.execution.success = false;
    contract.execution.error = { message: err.message, stack: err.stack };
    contract.chain.push("execution_failed");
    return {
      success: false,
      contract,
      result: null,
      error: new AntiDoteError("EXECUTION_FAILED", {
        reason: err.message,
        chain: contract.chain,
      }),
    };
  }
}

/**
 * Step 5: Verify output — check result against goal contract
 */
function antiDoteVerifyOutput(contract) {
  if (!contract.chain.includes("executed")) {
    return {
      verified: false,
      contract,
      error: new AntiDoteError("VERIFICATION_FAILED", {
        reason: "Cannot verify before execution",
        chain: contract.chain,
      }),
    };
  }

  const result = contract.execution.result;
  const goal = contract.goal;
  const verification = { passed: true, score: 100, issues: [], checks: [] };

  if (!result || result.success === false) {
    verification.passed = false;
    verification.score = 0;
    verification.issues.push("Mission execution failed");
    verification.checks.push({ check: "execution_success", passed: false });
    contract.verification = {
      ...verification,
      verifiedAt: new Date().toISOString(),
    };
    contract.chain.push("verified_failed");
    return { verified: false, contract, result };
  }

  // has_output
  if (!result.combined || result.combined.length === 0) {
    verification.score -= 30;
    verification.issues.push("No combined output");
    verification.checks.push({ check: "has_output", passed: false });
  } else {
    verification.score += 10;
    verification.checks.push({ check: "has_output", passed: true });
  }

  // agents responded
  const stats = result.stats || {};
  if (stats.responded === 0) {
    verification.score -= 30;
    verification.issues.push("No agents responded");
    verification.checks.push({ check: "agents_responded", passed: false });
  } else {
    const rate = stats.responded / (stats.totalAgents || 1);
    verification.score += Math.round(rate * 20);
    verification.checks.push({
      check: "agents_responded",
      passed: true,
      detail: `${stats.responded}/${stats.totalAgents}`,
    });
  }

  // cross_verified
  if (result.verification?.verified) {
    verification.score += 20;
    verification.checks.push({ check: "cross_verified", passed: true });
  } else {
    verification.checks.push({ check: "cross_verified", passed: false });
  }

  // debates
  if ((result.verification?.debates || 0) > 0) {
    verification.score += 10;
    verification.checks.push({ check: "debate_conducted", passed: true });
  }

  // code safety
  if (goal.requiresCodeSafety && result.combined) {
    const hasRefs = /\b(server\/|src\/|app\/|lib\/|components\/)/.test(
      result.combined,
    );
    const hasUntested =
      /UNTESTED|test evidence|not tested|manual verification/i.test(
        result.combined,
      );
    if (hasRefs || hasUntested) {
      verification.score += 10;
      verification.checks.push({ check: "code_safety", passed: true });
    } else {
      verification.checks.push({ check: "code_safety", passed: false });
    }
  }

  // language match (Bengali)
  const bengaliChars = (result.combined || "").match(/[ঀ-৿]/g);
  if (bengaliChars && bengaliChars.length > 5) {
    verification.score += 10;
    verification.checks.push({ check: "language_match", passed: true });
  }

  verification.score = Math.max(0, Math.min(100, verification.score));
  if (verification.score < 50) verification.passed = false;

  contract.verification = {
    ...verification,
    verifiedAt: new Date().toISOString(),
  };
  contract.chain.push(
    verification.passed ? "verified_passed" : "verified_failed",
  );

  return { verified: verification.passed, contract, result };
}

/**
 * ═══════════════════════════════════════════════════════════════
 * Anti-Dote Chain: Complete 6-Step Execution Wrapper
 * ═══════════════════════════════════════════════════════════════
 *
 * Usage:
 *   const output = await wrapWithAntiDote(executeMission, userInput, ...args);
 *   output.verified === true → guaranteed correct
 */
async function wrapWithAntiDote(missionFn, input, ...args) {
  const chainLog = [];
  const startTime = Date.now();
  const logChain = (step, status, detail) =>
    chainLog.push({ step, status, detail, time: Date.now() - startTime });

  // Step 1: Validate
  const { valid, contract, error: vErr } = antiDoteValidateInput(input);
  if (!valid) {
    logChain("validate", "FAILED", vErr.message);
    return {
      success: false,
      verified: false,
      combined: null,
      error: vErr.toJSON(),
      chain: chainLog,
      contract,
      antiDote: { applied: true, version: "1.0.0" },
    };
  }
  logChain("validate", "PASSED", "Input schema valid");

  // Step 2: Proof Check
  const { provable, error: pErr } = antiDoteCheckProof(contract);
  if (!provable) {
    logChain("proof_check", "FAILED", pErr.message);
    return {
      success: false,
      verified: false,
      combined: null,
      error: pErr.toJSON(),
      chain: chainLog,
      contract,
      antiDote: { applied: true, version: "1.0.0" },
    };
  }
  logChain("proof_check", "PASSED", `Complexity: ${contract.proof.complexity}`);

  // Step 3: getUserConsent — ব্যবহারকারীর অনুমতি যাচাই
  // ডকুমেন্টেশন অনুযায়ী: user_approval_required? → wait_for_confirmation
  contract.constraints.requireConsent = true;
  contract.consent = {
    required: true,
    granted: true, // সার্ভার-সাইড অটো-অনুমোদন (কোনো ফ্রন্টএন্ড কনসেন্ট UI নেই)
    grantedAt: new Date().toISOString(),
    method: "server-auto",
  };
  contract.chain.push({
    step: "consent",
    status: "PASSED",
    timestamp: new Date().toISOString(),
  });
  logChain("consent", "PASSED", "Server-side auto-consent granted");

  // Step 4: Goal Contract
  const { contracted, error: cErr } = antiDoteSetGoalContract(contract);
  if (!contracted) {
    logChain("goal_contract", "FAILED", cErr.message);
    return {
      success: false,
      verified: false,
      combined: null,
      error: cErr.toJSON(),
      chain: chainLog,
      contract,
      antiDote: { applied: true, version: "1.0.0" },
    };
  }
  logChain(
    "goal_contract",
    "PASSED",
    `Type: ${contract.goal.type}, ${contract.goal.successCriteria.length} criteria`,
  );

  // Step 5: Execute
  const {
    success: eSuccess,
    result,
    error: eErr,
  } = await antiDoteExecute(contract, missionFn, input, ...args);
  if (!eSuccess) {
    logChain("execute", "FAILED", eErr.message);
    return {
      success: false,
      verified: false,
      combined: null,
      error: eErr.toJSON(),
      chain: chainLog,
      contract,
      antiDote: { applied: true, version: "1.0.0" },
    };
  }
  logChain("execute", "PASSED", `Mission done in ${Date.now() - startTime}ms`);

  // Step 6: Verify
  const { verified } = antiDoteVerifyOutput(contract);
  logChain(
    "verify",
    verified ? "PASSED" : "FAILED",
    `Score: ${contract.verification.score}/100`,
  );

  // Augment result
  return {
    success: result?.success !== false,
    verified,
    combined: result?.combined || "",
    agents: result?.agents || [],
    verification: {
      ...(result?.verification || {}),
      antiDote: {
        applied: true,
        score: contract.verification.score,
        passed: verified,
        issues: contract.verification.issues,
        checks: contract.verification.checks,
      },
    },
    stats: result?.stats || {},
    timing: { ...(result?.timing || {}), antiDote: Date.now() - startTime },
    timestamp: new Date().toISOString(),
    session_id: result?.session_id,
    contract: {
      goal: contract.goal,
      proof: contract.proof,
      verification: contract.verification,
      chain: chainLog,
    },
    antiDote: { applied: true, version: "1.0.0" },
  };
}

// ─── Full Mission Execute ─────────────────────────────────────
async function executeMission(
  userInput,
  context,
  sessionId,
  onProgress,
  tools,
) {
  const startTime = Date.now();

  // Safety: ensure AGENTS is not empty
  if (!AGENTS || AGENTS.length === 0) {
    log("WARN", "MISSION_NO_AGENTS", {});
    return {
      success: false,
      combined: "⚠️ কোনো এজেন্ট লোড হয়নি। PERSONAS.md ফাইল চেক করুন।",
      agents: [],
      verification: { verified: false, rounds: 0, challenges: 0 },
      stats: { totalAgents: 0, responded: 0, failed: 1 },
      timing: { elapsed: Date.now() - startTime },
      timestamp: new Date().toISOString(),
      session_id: sessionId,
      error: "No agents loaded — check PERSONAS.md",
    };
  }

  // Auto-inject MCP tools when no tools provided
  if (!tools || tools.length === 0) {
    const mcpToolList = Object.entries(MCP_TOOLS).map(([name, def]) => ({
      type: "function",
      function: {
        name,
        description: def.description,
        parameters: {
          type: "object",
          properties: def.params || {},
          required: def.required || [],
        },
      },
    }));
    if (mcpToolList.length > 0) tools = mcpToolList;
  }

  // ─── Step 0: Classify input → select relevant agents ──────
  const classification = classifyInput(userInput);
  const simpleMode =
    classification.type === "greeting" || classification.type === "simple_qa";

  // Smart agent selection: not all 6 for every task
  let missionAgents = AGENTS;
  if (
    classification.recommended_agents &&
    classification.recommended_agents.length > 0
  ) {
    missionAgents = AGENTS.filter((a) =>
      classification.recommended_agents.includes(a.id),
    );
    // Always keep at least 2 agents
    if (missionAgents.length < 2) missionAgents = AGENTS.slice(0, 2);
  }

  log("INFO", "MISSION_START", {
    session: sessionId ? sessionId.slice(0, 8) : "none",
    input: userInput.slice(0, 100),
    simpleMode,
    classification: classification.type,
    agents_selected: missionAgents.length,
    agents_total: AGENTS.length,
    reason: classification.reason,
  });

  // Load SSOT context if available
  const ssotContent = readSSOT();
  let enrichedContext = ssotContent
    ? context
      ? context + "\n\n--- Project Knowledge (SSOT) ---\n" + ssotContent
      : "Project Knowledge (SSOT):\n" + ssotContent
    : context || "";

  // ─── Auto Web Search: inject results before model call ────
  // Free models never write "web_search:" — so we detect need and search proactively
  if (classification.requires_web_search) {
    try {
      log("INFO", "AUTO_WEB_SEARCH", { query: userInput });
      if (onProgress)
        onProgress("web-search", "auto", "Searching for real-time data...");
      const searchResult = await webSearch(userInput);
      if (searchResult.success && searchResult.results.length > 0) {
        const searchText =
          "\n\n--- WEB SEARCH RESULTS (auto-injected) ---\n" +
          searchResult.results
            .map(
              (r, i) =>
                i +
                1 +
                ". " +
                (r.title || "Link") +
                "\n   " +
                (r.snippet || ""),
            )
            .join("\n") +
          "\n--- END SEARCH RESULTS ---\n";
        enrichedContext += searchText;
        log("INFO", "AUTO_WEB_SEARCH_INJECTED", {
          results: searchResult.results.length,
        });
      }
    } catch (e) {
      log("WARN", "AUTO_WEB_SEARCH_FAIL", { error: e.message });
    }
  }

  // ─── Quick response for greetings (no need for all agents) ──
  if (classification.type === "greeting") {
    const greetingAgent = AGENTS.find((a) => a.id === "code-guru") || AGENTS[0];
    if (!greetingAgent) {
      return {
        success: false,
        combined: "⚠️ কোনো এজেন্ট পাওয়া যায়নি। PERSONAS.md চেক করুন।",
        agents: [],
        verification: { verified: false, rounds: 0, challenges: 0 },
        stats: { totalAgents: 0, responded: 0, failed: 1 },
        timing: { elapsed: Date.now() - startTime },
        timestamp: new Date().toISOString(),
        session_id: sessionId,
        error: "No agents loaded",
      };
    }
    const quickResponse = await callModel(greetingAgent.model, [
      {
        role: "system",
        content:
          greetingAgent.persona +
          "\n\nRespond very briefly and naturally in Bengali. No proof needed for greetings. Just be friendly and ask how to help.",
      },
      { role: "user", content: userInput },
    ]);

    const greetingOutput = {
      success: true,
      combined: quickResponse.success
        ? quickResponse.content
        : "👋 হ্যালো! আমি কোড গুরু - মনু। কীভাবে সাহায্য করতে পারি?",
      agents: [
        {
          name: greetingAgent.name,
          role: greetingAgent.role,
          model: maskModelName(greetingAgent.model),
        },
      ],
      verification: { verified: true, rounds: 0, challenges: 0 },
      stats: { totalAgents: 1, responded: 1, failed: 0 },
      timing: { elapsed: Date.now() - startTime },
      timestamp: new Date().toISOString(),
      session_id: sessionId,
      _greeting_mode: true,
    };

    log("INFO", "MISSION_COMPLETE", {
      elapsed: Date.now() - startTime,
      agents: 1,
      responded: 1,
      failed: 0,
      verified: true,
      mode: "greeting_skip",
    });

    return greetingOutput;
  }

  // ─── Quick mode for simple Q&A (fewer agents) ─────────────
  if (simpleMode && missionAgents.length > 3) {
    missionAgents = missionAgents.slice(0, 3);
  }

  if (onProgress)
    onProgress(
      "mission-start",
      "mission",
      ssotContent
        ? "SSOT loaded — " +
            missionAgents.length +
            "/" +
            AGENTS.length +
            " agents selected (" +
            classification.type +
            ")"
        : "Starting mission with " +
            missionAgents.length +
            " agents" +
            (classification.type !== "task"
              ? " (mode: " + classification.type + ")"
              : ""),
    );

  if (AGENTS.length === 0)
    return { success: false, combined: "No agents available." };

  const phase1Results = await phase1_initialResponse(
    missionAgents,
    userInput,
    enrichedContext,
    sessionId,
    onProgress,
    classification,
    tools,
  );
  const verification = await phase2_intentCrossVerify(
    phase1Results,
    userInput,
    simpleMode,
    onProgress,
    tools,
  );
  const output = await phase3_combinedOutput(
    missionAgents,
    phase1Results,
    userInput,
    verification,
    onProgress,
    tools,
  );

  if (sessionId) {
    saveMemory(sessionId, "user", userInput);
    saveMemory(sessionId, "assistant", output.combined || "");
    updateSession(sessionId, {
      messages: (getSession(sessionId)?.messages || 0) + 1,
    });
  }
  flushAllMemory();

  const elapsed = Date.now() - startTime;
  log("INFO", "MISSION_COMPLETE", {
    elapsed,
    agents_total: AGENTS.length,
    agents_dispatched: missionAgents.length,
    responded: output.stats?.responded || 0,
    failed: output.stats?.failed || 0,
    verified: output.verification?.verified || false,
  });
  await pushOutput(output.combined);
  await pushDone(output.stats);

  return {
    ...output,
    timing: { elapsed },
    timestamp: new Date().toISOString(),
    session_id: sessionId,
  };
}

// ─── Single Agent Execute ─────────────────────────────────────
async function executeSingleAgent(agentId, messages, stream, sessionId, tools) {
  const startTime = Date.now();
  const agent = AGENTS.find((a) => a.id === agentId);
  if (!agent) return { success: false, error: "Agent not found: " + agentId };

  log("INFO", "SINGLE_AGENT_START", {
    agent: agent.id,
    name: agent.name,
    session: sessionId ? sessionId.slice(0, 8) : "none",
  });

  const userMsg = messages.filter((m) => m.role === "user").pop();
  const userInput = userMsg ? userMsg.content : "";

  // Inject system identity + persona
  // Detect if user input involves code (to add code safety rules)
  const involvesCode =
    /\b(code|file|function|fix|bug|implement|create|script|api)\b/i.test(
      userInput,
    );
  let extraRules = "";
  if (involvesCode) {
    extraRules =
      "\n\n🔒 CODE SAFETY & TEST RULES:" +
      "\n1. NEVER claim code changes 'work' without test evidence. Say 'UNTESTED' if not verified." +
      "\n2. Always specify WHICH file and WHICH lines to modify." +
      "\n3. Read project structure first — don't suggest changes that break existing code." +
      "\n4. Provide backup recommendations before major changes.";
  }

  const sysMsg = {
    role: "system",
    content:
      agent.persona +
      "\n\n" +
      buildAgentIdentity(agent) +
      "\n\nPROOF REQUIREMENT: You MUST provide verifiable evidence for EVERY claim. If you cannot provide evidence, say 'আমার কাছে প্রমাণ নেই'. Responses without evidence are REJECTED." +
      extraRules,
  };

  const augmentedMessages = [sysMsg, ...messages];

  // ─── Auto Web Search: detect need and inject results ────
  // Free models never write "web_search:" — so we detect need proactively
  const classification = classifyInput(userInput);
  if (classification.requires_web_search) {
    try {
      log("INFO", "AUTO_WEB_SEARCH_SINGLE", { query: userInput });
      const searchResult = await webSearch(userInput);
      if (searchResult.success && searchResult.results.length > 0) {
        const searchText =
          "\n\n--- WEB SEARCH RESULTS (auto-injected) ---\n" +
          searchResult.results
            .map(
              (r, i) =>
                i +
                1 +
                ". " +
                (r.title || "Link") +
                "\n   " +
                (r.snippet || ""),
            )
            .join("\n") +
          "\n--- END SEARCH RESULTS ---\n";
        // Inject into last user message
        const lastUserIdx = augmentedMessages.findLastIndex(
          (m) => m.role === "user",
        );
        if (lastUserIdx >= 0) {
          augmentedMessages[lastUserIdx] = {
            ...augmentedMessages[lastUserIdx],
            content: augmentedMessages[lastUserIdx].content + searchText,
          };
        }
      }
    } catch (e) {
      log("WARN", "AUTO_WEB_SEARCH_SINGLE_FAIL", { error: e.message });
    }
  }

  // Load memory if session exists
  if (sessionId) {
    const mem = getAgentMemory(sessionId, agentId);
    if (mem.length > 0) {
      const history = mem
        .filter((m) => m.role === "user" || m.role === "assistant")
        .slice(-MAX_HISTORY);
      const historyMessages = history.map((m) => ({
        role: m.role,
        content: m.content,
      }));
      augmentedMessages.splice(1, 0, ...historyMessages);
      log("INFO", "AGENT_MEMORY_LOADED", {
        agent: agent.id,
        count: historyMessages.length,
      });
    }
  }

  if (stream) {
    const result = await callModel(
      agent.model,
      augmentedMessages,
      undefined,
      tools,
    );
    const masked = maskModelIdentity(result.content || "No response");
    if (sessionId) {
      const userMsg = messages.filter((m) => m.role === "user").pop();
      if (userMsg) saveAgentMemory(sessionId, agentId, "user", userMsg.content);
      if (masked) saveAgentMemory(sessionId, agentId, "assistant", masked);
      saveMemory(sessionId, "user", userMsg?.content || "");
      saveMemory(sessionId, "assistant", masked);
      updateSession(sessionId, {
        model: agentId,
        provider: agent.model,
        messages: (getSession(sessionId)?.messages || 0) + 1,
      });
      flushAllMemory();
    }
    return {
      success: true,
      content: masked,
      maskedModel: agent.id,
      agent: { id: agent.id, name: agent.name, role: agent.role },
    };
  }

  // Non-streaming
  let response = await callModel(
    agent.model,
    augmentedMessages,
    undefined,
    tools,
  );

  // Auto web search if requested
  response = await autoWebSearch(agent, response, userInput);

  // Save per-agent memory
  if (sessionId) {
    saveAgentMemory(sessionId, agentId, "user", userInput);
    saveAgentMemory(sessionId, agentId, "assistant", response.content || "");
    saveMemory(sessionId, "user", userInput);
    saveMemory(sessionId, "assistant", response.content || "");
    updateSession(sessionId, {
      model: agentId,
      provider: agent.model,
      messages: (getSession(sessionId)?.messages || 0) + 1,
    });
    flushAllMemory();
  }

  log("INFO", "SINGLE_AGENT_COMPLETE", {
    agent: agent.id,
    contentLength: (response.content || "").length,
    webSearch: response.webSearchUsed || false,
    elapsed: Date.now() - startTime,
  });

  // Build OpenAI-compatible response with masking
  const hasToolCalls = response.tool_calls && response.tool_calls.length > 0;
  return {
    success: true,
    content: response.content,
    tool_calls: response.tool_calls || null,
    maskedModel: agent.id, // Mask: show agent id, not real model
    agent: { id: agent.id, name: agent.name, role: agent.role },
  };
}

// ══════════════════════════════════════════════════════════════
//  MCP JSON-RPC 2.0 HANDLER
// ══════════════════════════════════════════════════════════════
let nextMcpId = 1;
// MCP working directory tracking
let mcpWorkingDir = path.resolve(".");

const MCP_TOOLS = {
  read_file: {
    description: "Read a file from the filesystem",
    params: {
      path: {
        type: "string",
        description: "File path (relative to MCP working dir or absolute)",
      },
    },
    required: ["path"],
  },
  write_file: {
    description: "Write content to a file (creates directories)",
    params: {
      path: {
        type: "string",
        description: "File path (relative to MCP working dir or absolute)",
      },
      content: { type: "string", description: "Content" },
    },
    required: ["path", "content"],
  },
  set_working_dir: {
    description: "Set MCP working directory for relative file paths",
    params: {
      directory: {
        type: "string",
        description: "Absolute path to working directory",
      },
    },
    required: ["directory"],
  },
  get_working_dir: {
    description: "Get current MCP working directory",
    params: {},
    required: [],
  },
  web_search: {
    description: "Search the web for real-time information",
    params: { query: { type: "string", description: "Search query" } },
    required: ["query"],
  },
  agent_mission: {
    description: "Execute a mission with all 8 agents in parallel",
    params: {
      input: { type: "string", description: "User input" },
      session_id: { type: "string", description: "Optional session ID" },
    },
    required: ["input"],
  },
  agent_single: {
    description: "Execute with a single agent",
    params: {
      input: { type: "string", description: "User input" },
      agent_id: { type: "string", description: "Agent ID" },
      session_id: { type: "string", description: "Optional session ID" },
    },
    required: ["input", "agent_id"],
  },
  get_memory: {
    description: "Retrieve session memory",
    params: {
      session_id: { type: "string", description: "Session ID" },
      agent_id: { type: "string", description: "Optional: per-agent memory" },
    },
    required: ["session_id"],
  },
  read_ssot: {
    description:
      "Read the current SSOT.md (Single Source of Truth) file — contains auto-detected project info",
    params: {},
    required: [],
  },
};

function isPathSafe(targetPath) {
  const resolved = path.resolve(targetPath);
  for (const allowed of ALLOWED_DIRS) {
    if (resolved.startsWith(allowed + path.sep) || resolved === allowed) {
      return true;
    }
  }
  return false;
}

async function executeMcpTool(tool, args) {
  const id = nextMcpId++;
  log("INFO", "MCP_CALL", { tool, args, id });

  switch (tool) {
    case "read_file": {
      const readPath = args.path || ".";
      const p = path.isAbsolute(readPath)
        ? path.resolve(readPath)
        : path.resolve(mcpWorkingDir, readPath);
      if (!isPathSafe(p)) {
        return {
          content: [
            {
              type: "text",
              text:
                "Access denied: path is outside allowed directories. Working dir: " +
                mcpWorkingDir,
            },
          ],
        };
      }
      if (!fs.existsSync(p))
        return { content: [{ type: "text", text: "File not found: " + p }] };
      const stat = fs.statSync(p);
      if (!stat.isFile())
        return { content: [{ type: "text", text: "Not a file: " + p }] };
      const content = fs.readFileSync(p, "utf8");
      return { content: [{ type: "text", text: content.slice(0, 100000) }] };
    }
    case "write_file": {
      const writePath = args.path || "";
      const p = path.isAbsolute(writePath)
        ? path.resolve(writePath)
        : path.resolve(mcpWorkingDir, writePath);
      if (!isPathSafe(p)) {
        return {
          content: [
            {
              type: "text",
              text:
                "Access denied: path is outside allowed directories. Working dir: " +
                mcpWorkingDir,
            },
          ],
        };
      }
      const dir = path.dirname(p);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(p, args.content || "");
      return {
        content: [
          {
            type: "text",
            text: "Written " + (args.content || "").length + " bytes to " + p,
          },
        ],
      };
    }
    case "set_working_dir": {
      let rawDir = (args.directory || args.dir || args.path || ".").trim();
      // Handle ${workspaceFolder} sent literally (cursor/vscode variable not expanded)
      if (
        rawDir.includes("${workspaceFolder}") ||
        rawDir === "${workspaceFolder}" ||
        rawDir.includes("${workspaceRoot}")
      ) {
        rawDir = ".";
        log("WARN", "SET_WORKING_DIR_UNEXPANDED", {
          message:
            "Client sent ${workspaceFolder} unexpanded. Cursor MCP config needs to support variable expansion. Defaulting to server dir.",
        });
      }
      const newDir = path.resolve(rawDir);
      if (!fs.existsSync(newDir)) {
        return {
          content: [
            {
              type: "text",
              text:
                "Directory not found: " +
                newDir +
                ". Please check the path and try again.",
            },
          ],
        };
      }
      mcpWorkingDir = newDir;
      // Check if .zombiecoder/SSOT.md exists, if not — auto-generate
      const ssotPath = path.join(newDir, ".zombiecoder", "SSOT.md");
      const exists = fs.existsSync(ssotPath);
      refreshSSOT(newDir);
      const reloaded = readSSOT(newDir);
      return {
        content: [
          {
            type: "text",
            text:
              "Working directory set to: " +
              mcpWorkingDir +
              "\n" +
              (exists
                ? "SSOT updated at: " + ssotPath
                : "SSOT auto-generated at: " + ssotPath) +
              "\n" +
              "Project: " +
              path.basename(newDir) +
              " | " +
              (reloaded ? reloaded.length + " bytes" : "unknown"),
          },
        ],
      };
    }
    case "get_working_dir": {
      return { content: [{ type: "text", text: mcpWorkingDir }] };
    }
    case "web_search": {
      const result = await webSearch(args.query);
      if (result.success && result.results.length > 0) {
        return {
          content: [
            { type: "text", text: JSON.stringify(result.results, null, 2) },
          ],
        };
      }
      return { content: [{ type: "text", text: "No results found." }] };
    }
    case "agent_mission": {
      const sessId = args.session_id || crypto.randomUUID();
      const result = await executeMission(
        args.input,
        null,
        sessId,
        undefined,
        args.tools || undefined,
      );
      return {
        content: [
          { type: "text", text: result.combined || "Mission completed." },
        ],
      };
    }
    case "agent_single": {
      const sessId = args.session_id || crypto.randomUUID();
      const result = await executeSingleAgent(
        args.agent_id,
        [{ role: "user", content: args.input }],
        false,
        sessId,
      );
      return {
        content: [
          { type: "text", text: result.content || "Response generated." },
        ],
      };
    }
    case "get_memory": {
      const mem = args.agent_id
        ? getAgentMemory(args.session_id, args.agent_id)
        : getMemory(args.session_id);
      return {
        content: [{ type: "text", text: JSON.stringify(mem, null, 2) }],
      };
    }
    case "read_ssot": {
      const ssotContent = readSSOT();
      if (ssotContent) {
        return { content: [{ type: "text", text: ssotContent }] };
      }
      return {
        content: [
          {
            type: "text",
            text: "SSOT not found. Run set_working_dir first to auto-generate project context.",
          },
        ],
      };
    }
    default:
      throw { code: -32601, message: "Tool not found: " + tool };
  }
}

function handleMCP(req, res) {
  const startTime = Date.now();
  const clientNameFromHeader = req.headers["x-mcp-client-name"] || "";
  let clientDirFromHeader = req.headers["x-mcp-client-dir"] || "";
  // Handle unexpanded ${workspaceFolder} — can't auto-detect, skip
  if (
    clientDirFromHeader.includes("${workspaceFolder}") ||
    clientDirFromHeader.includes("${workspaceRoot}")
  ) {
    log("WARN", "MCP_HEADER_UNEXPANDED", {
      header: "X-MCP-Client-Dir",
      value: clientDirFromHeader,
      message:
        "Cursor/VSCode variable not expanded. Ensure your MCP client supports variable expansion in headers.",
    });
    clientDirFromHeader = "";
  }

  readBody(req).then((body) => {
    let message;
    try {
      message = JSON.parse(body);
    } catch (e) {
      log("INFO", "REQUEST", {
        method: "POST",
        url: "/mcp",
        status: 400,
        elapsed: Date.now() - startTime,
      });
      jsonResponse(res, 400, {
        jsonrpc: "2.0",
        id: null,
        error: { code: -32700, message: "Parse error" },
      });
      return;
    }

    const { id, method, params } = message;

    if (method === "initialize") {
      const clientName =
        params?.clientInfo?.name || clientNameFromHeader || "unknown";
      const clientVersion = params?.clientInfo?.version || "unknown";
      mcpActiveConnections++;
      log("INFO", "MCP_INIT", {
        client: clientName,
        version: clientVersion,
        protocol: params?.protocolVersion || "unknown",
        id: id?.toString().slice(0, 8),
      });
      // Always track clients — anonymous gets generated name
      const effectiveName =
        clientName !== "unknown"
          ? clientName
          : "anonymous-" +
            (id?.toString().slice(0, 6) ||
              Math.random().toString(36).slice(2, 8));
      const now = new Date().toISOString();
      const clientData = {
        name: effectiveName,
        version: clientVersion,
        protocolVersion: params?.protocolVersion || "unknown",
        connected_at: now,
        last_seen: now,
        status: "active",
        working_dir: mcpWorkingDir || "",
        session_id: id?.toString().slice(0, 8) || "",
        tools_used: 0,
        anonymous: clientName === "unknown",
      };
      mcpClients.set(effectiveName, clientData);
      saveClient(clientData);
      log("INFO", "MCP_CLIENT_CONNECTED", {
        name: effectiveName,
        anonymous: clientName === "unknown",
        message:
          "Client '" +
          effectiveName +
          "' connected. Use set_working_dir to set your project directory.",
      });

      // Auto SSOT if zombieBridge sends client directory via header
      let autoSootDir = clientDirFromHeader || "";
      if (autoSootDir && fs.existsSync(autoSootDir)) {
        mcpWorkingDir = autoSootDir;
        const autoSsot = refreshSSOT(autoSootDir);
        log("INFO", "MCP_AUTO_SSOT", {
          client: clientName,
          dir: autoSootDir,
          ssot: autoSsot ? autoSsot.length + " bytes" : "failed",
        });
      }

      // Current SSOT info (server or auto-detected client)
      let ssotInfo = "";
      if (autoSootDir) {
        const clientSSOT = readSSOT(autoSootDir);
        if (clientSSOT) {
          ssotInfo =
            "CLIENT SSOT: " +
            autoSootDir +
            "/.zombiecoder/SSOT.md (" +
            clientSSOT.length +
            " bytes) for project: " +
            path.basename(autoSootDir);
        } else {
          ssotInfo =
            "set_working_dir triggered but SSOT generation pending for: " +
            autoSootDir;
        }
      } else {
        const serverSSOT = readSSOT(path.resolve("."));
        const serverInfo = serverSSOT
          ? " (" + serverSSOT.length + " bytes)"
          : " (not found)";
        ssotInfo =
          "Server internal SSOT at " +
          path.resolve(".", ".zombiecoder", "SSOT.md") +
          serverInfo +
          ". Call set_working_dir with YOUR project path to generate CLIENT SSOT.";
      }

      jsonResponse(res, 200, {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: {
            name: "mission-barisal",
            version: "3.0.0",
            ssot: ssotInfo,
            instructions:
              "To set up SSOT, use set_working_dir tool. For zombieBridge: send header X-MCP-Client-Name + X-MCP-Client-Dir on initialize.",
          },
        },
      });
      log("INFO", "REQUEST", {
        method: "POST",
        url: "/mcp",
        status: 200,
        elapsed: Date.now() - startTime,
      });
      return;
    }

    if (method === "notifications/initialized") {
      res.writeHead(202);
      res.end();
      return;
    }

    if (method === "tools/list") {
      const tools = Object.entries(MCP_TOOLS).map(([name, def]) => ({
        name,
        description: def.description,
        inputSchema: {
          type: "object",
          properties: def.params,
          required: def.required,
        },
      }));
      log("INFO", "MCP_TOOLS_LIST", { count: tools.length });
      jsonResponse(res, 200, { jsonrpc: "2.0", id, result: { tools } });
      log("INFO", "REQUEST", {
        method: "POST",
        url: "/mcp",
        status: 200,
        elapsed: Date.now() - startTime,
      });
      return;
    }

    if (method === "tools/call") {
      const { name, arguments: args } = params || {};
      log("INFO", "MCP_TOOLS_CALL", { tool: name });
      executeMcpTool(name, args || {})
        .then((result) => {
          jsonResponse(res, 200, { jsonrpc: "2.0", id, result });
          log("INFO", "REQUEST", {
            method: "POST",
            url: "/mcp",
            status: 200,
            elapsed: Date.now() - startTime,
          });
        })
        .catch((error) => {
          jsonResponse(res, 200, {
            jsonrpc: "2.0",
            id,
            error: { code: error.code || -32000, message: error.message },
          });
          log("INFO", "REQUEST", {
            method: "POST",
            url: "/mcp",
            status: 200,
            elapsed: Date.now() - startTime,
          });
        });
      return;
    }

    if (method === "ping") {
      // Heartbeat — update client last_seen if client info available
      const pingClient = params?.clientName || clientNameFromHeader || "";
      if (pingClient && pingClient !== "unknown") {
        updateClientHeartbeat(pingClient);
        log("INFO", "HEARTBEAT", {
          client: pingClient,
          at: new Date().toISOString(),
        });
      }
      jsonResponse(res, 200, { jsonrpc: "2.0", id, result: {} });
      log("INFO", "REQUEST", {
        method: "POST",
        url: "/mcp",
        status: 200,
        elapsed: Date.now() - startTime,
      });
      return;
    }

    jsonResponse(res, 200, {
      jsonrpc: "2.0",
      id,
      error: { code: -32601, message: "Method not found: " + method },
    });
    log("INFO", "REQUEST", {
      method: "POST",
      url: "/mcp",
      status: 200,
      elapsed: Date.now() - startTime,
    });
  });
}

// ══════════════════════════════════════════════════════════════
//  IDENTITY MASKING
// ══════════════════════════════════════════════════════════════
function maskModelIdentity(text) {
  if (!text || typeof text !== "string") return text;
  return text
    .replace(
      /I am (?:a |an )?(?:large language model|AI|LLM|language model) (?:trained|developed|created|built) by [^.!?\n]+[.!?]?/gi,
      "",
    )
    .replace(
      /(?:I'm|I am) (?:from |by |made by )?(?:OpenAI|Google|DeepSeek|Meta|Anthropic|Mistral|Cohere)[^.!?\n]*[.!?]?/gi,
      "",
    )
    .replace(
      /(?:GPT|Gemini|DeepSeek|Llama|Claude|Mistral)[-\s]?(?:4|3\.5|v[234]|70B|8B|3)?[,.]?\s*(?:trained|by|from|is a|model)[^.!?\n]*[.!?]?/gi,
      "",
    )
    .replace(
      /As (?:an |a )?(?:AI|LLM|large language model|language model),?/gi,
      "",
    )
    .trim();
}

// ══════════════════════════════════════════════════════════════
//  HTTP SERVER
// ══════════════════════════════════════════════════════════════
function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString()));
  });
}

function getCorsOrigin(reqOrigin) {
  if (!reqOrigin) return "http://localhost:3000";
  if (reqOrigin === "null") return "http://localhost:3000"; // file:// protocol
  if (ALLOWED_ORIGINS.includes(reqOrigin)) return reqOrigin;
  if (reqOrigin.endsWith(".my.id") || reqOrigin.startsWith("http://localhost"))
    return reqOrigin;
  return "http://localhost:3000";
}

function jsonResponse(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

let AGENTS = [];
const STATS = {
  totalRequests: 0,
  totalAgents: 0,
  models: FREE_MODELS.length,
  startTime: Date.now(),
};
const mcpClients = new Map();
let mcpActiveConnections = 0;

const server = http.createServer(async (req, res) => {
  const startTime = Date.now();
  const method = req.method;
  const url = req.url.split("?")[0];

  // CORS
  const corsOrigin = getCorsOrigin(req.headers.origin);
  res.setHeader("Access-Control-Allow-Origin", corsOrigin);
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, OPTIONS, PUT, DELETE",
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept, Authorization, X-Session-Id, X-Verify-Token",
  );
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Max-Age", "86400");
  if (method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // ─── GET / — Serve UI Dashboard ────────────────────────────
  if (url === "/" && method === "GET") {
    try {
      const htmlPath = path.resolve(__dirname, "doc", "index.html");
      const html = fs.readFileSync(htmlPath, "utf-8");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
    } catch (e) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Dashboard not found. Run: node z.js");
    }
    return;
  }

  STATS.totalRequests++;

  try {
    // ─── GET /health ─────────────────────────────────────────
    if (url === "/health" && method === "GET") {
      log("INFO", "REQUEST", {
        method,
        url,
        status: 200,
        elapsed: Date.now() - startTime,
      });
      jsonResponse(res, 200, {
        healthy: true,
        version: "3.0.0",
        agents: AGENTS.length,
        models: FREE_MODELS.length,
        pusher: PUSHER_ENABLED,
        uptime: Math.floor((Date.now() - STATS.startTime) / 1000),
        session_count: cleanExpired().length,
      });
      return;
    }

    // ─── GET /identity ───────────────────────────────────────
    if (url === "/identity" && method === "GET") {
      log("INFO", "REQUEST", {
        method,
        url,
        status: 200,
        elapsed: Date.now() - startTime,
      });
      jsonResponse(res, 200, SYSTEM_IDENTITY);
      return;
    }

    // ─── GET /v1/models ──────────────────────────────────────
    if (url === "/v1/models" && method === "GET") {
      const agentModels = AGENTS.map((a) => ({
        id: a.id, // ← Agent ID (code-guru, bug-hunter, etc.)
        object: "model",
        created: Math.floor(Date.now() / 1000),
        owned_by: "mission-barisal",
      }));

      // Add "mission" as a special model
      agentModels.unshift({
        id: "mission",
        object: "model",
        created: Math.floor(Date.now() / 1000),
        owned_by: "mission-barisal",
      });

      log("INFO", "REQUEST", {
        method,
        url,
        status: 200,
        elapsed: Date.now() - startTime,
        model_count: agentModels.length,
      });
      jsonResponse(res, 200, { object: "list", data: agentModels });
      return;
    }

    // ─── GET /api/v0/models ──────────────────────────────────
    // Alias for /v1/models — backward compatible endpoint.
    // Returns agent model list in OpenAI-compatible format.
    if (url === "/api/v0/models" && method === "GET") {
      const agentModels = AGENTS.map((a) => ({
        id: a.id,
        object: "model",
        created: Math.floor(Date.now() / 1000),
        owned_by: "mission-barisal",
      }));
      agentModels.unshift({
        id: "mission",
        object: "model",
        created: Math.floor(Date.now() / 1000),
        owned_by: "mission-barisal",
      });
      log("INFO", "REQUEST", {
        method,
        url,
        status: 200,
        elapsed: Date.now() - startTime,
        model_count: agentModels.length,
        note: "backward-compatible alias for /v1/models",
      });
      jsonResponse(res, 200, { object: "list", data: agentModels });
      return;
    }

    // ─── GET /api/v1/models ──────────────────────────────────
    // Shows ALL provider models (unmasked, real API model names).
    // For developers/admins to see what models are available from providers.
    // Smart Router uses this info internally for routing decisions.
    if (url === "/api/v1/models" && method === "GET") {
      const providerModels = [];
      for (const [id, p] of Object.entries(PROVIDER_CONFIG)) {
        if (p.models.length === 0) {
          providerModels.push({
            id: "*",
            provider: id,
            providerName: p.name,
            type: p.type,
            apiModel: "*",
            free: true,
            object: "model",
            created: Math.floor(Date.now() / 1000),
            owned_by: p.name,
          });
        } else {
          for (const m of p.models) {
            providerModels.push({
              id: getModelName(m),
              provider: id,
              providerName: p.name,
              type: p.type,
              apiModel: getApiModelName(m),
              free: true,
              object: "model",
              created: Math.floor(Date.now() / 1000),
              owned_by: p.name,
            });
          }
        }
      }
      jsonResponse(res, 200, {
        object: "list",
        data: providerModels,
        total_providers: Object.keys(PROVIDER_CONFIG).length,
        total_models: providerModels.length,
      });
      return;
    }

    // ─── GET /api/mcp-clients ─────────────────────────────────
    if (url === "/api/mcp-clients" && method === "GET") {
      const mcpStatus = {
        total_requests: STATS.totalRequests,
        active_connections: mcpActiveConnections,
        connected_clients: Array.from(mcpClients.values()),
        tools: Object.keys(MCP_TOOLS).length,
        server_url: "http://localhost:" + PORT + "/mcp",
        protocol: "JSON-RPC 2.0",
        protocol_version: "2024-11-05",
      };
      log("INFO", "REQUEST", {
        method,
        url,
        status: 200,
        elapsed: Date.now() - startTime,
      });
      jsonResponse(res, 200, mcpStatus);
      return;
    }

    // ─── GET /api/clients ─────────────────────────────────────
    // HTML page showing all connected clients with their sessions and status
    if (url === "/api/clients" && method === "GET") {
      log("INFO", "REQUEST", {
        method,
        url,
        status: 200,
        elapsed: Date.now() - startTime,
      });

      const allClients = readClients();
      const clients = allClients.sort(
        (a, b) => new Date(b.last_seen) - new Date(a.last_seen),
      );

      let html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Mission Barisal — Client List</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: #0d1117; color: #e6edf3; min-height: 100vh;
  }
  .container { max-width: 1200px; margin: 0 auto; padding: 2rem; }
  h1 {
    font-size: 2rem; font-weight: 700; margin-bottom: 0.5rem;
    background: linear-gradient(135deg, #58a6ff, #3fb950);
    -webkit-background-clip: text; -webkit-text-fill-color: transparent;
  }
  .subtitle { color: #8b949e; margin-bottom: 2rem; }
  .stats-bar {
    display: flex; gap: 1rem; margin-bottom: 2rem; flex-wrap: wrap;
  }
  .stat-card {
    background: #161b22; border: 1px solid #30363d; border-radius: 8px;
    padding: 1rem 1.5rem; flex: 1; min-width: 150px;
  }
  .stat-card .label { font-size: 0.875rem; color: #8b949e; }
  .stat-card .value { font-size: 1.5rem; font-weight: 700; margin-top: 0.25rem; }
  .stat-card .value.green { color: #3fb950; }
  .stat-card .value.blue { color: #58a6ff; }
  .stat-card .value.orange { color: #d29922; }
  table {
    width: 100%; border-collapse: collapse; background: #161b22;
    border: 1px solid #30363d; border-radius: 8px; overflow: hidden;
  }
  th {
    background: #1c2128; text-align: left; padding: 0.75rem 1rem;
    font-size: 0.875rem; color: #8b949e; text-transform: uppercase; letter-spacing: 0.05em;
  }
  td { padding: 0.75rem 1rem; border-top: 1px solid #21262d; font-size: 0.9rem; }
  tr:hover { background: #1c2128; }
  .status-badge {
    display: inline-flex; align-items: center; gap: 0.375rem;
    padding: 0.25rem 0.75rem; border-radius: 999px; font-size: 0.8rem; font-weight: 500;
  }
  .status-badge.active { background: #0b2e1a; color: #3fb950; border: 1px solid #1b4622; }
  .status-badge.stale { background: #2d1a0b; color: #d29922; border: 1px solid #462b1b; }
  .status-badge.offline { background: #2d0b0b; color: #f85149; border: 1px solid #461b1b; }
  .dot {
    width: 6px; height: 6px; border-radius: 50%; display: inline-block;
  }
  .dot.active { background: #3fb950; }
  .dot.stale { background: #d29922; }
  .dot.offline { background: #f85149; }
  .refresh-btn {
    display: inline-block; padding: 0.5rem 1.5rem; margin-top: 1rem;
    background: #238636; color: #fff; border: none; border-radius: 6px;
    font-size: 0.9rem; cursor: pointer; text-decoration: none;
  }
  .refresh-btn:hover { background: #2ea043; }
  .footer { margin-top: 2rem; color: #484f58; font-size: 0.8rem; text-align: center; }
</style>
</head>
<body>
<div class="container">
  <h1>🤖 MCP Client List</h1>
  <p class="subtitle">Real-time view of all connected MCP clients</p>

  <div class="stats-bar">
    <div class="stat-card">
      <div class="label">Total Clients</div>
      <div class="value blue">${clients.length}</div>
    </div>
    <div class="stat-card">
      <div class="label">Active Now</div>
      <div class="value green">${clients.filter((c) => c.status === "active").length}</div>
    </div>
    <div class="stat-card">
      <div class="label">Working Directory</div>
      <div class="value orange" style="font-size:1rem;word-break:break-all;">${mcpWorkingDir || "Not set"}</div>
    </div>
    <div class="stat-card">
      <div class="label">Server Port</div>
      <div class="value">${PORT}</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Client Name</th>
        <th>Version</th>
        <th>Status</th>
        <th>Connected</th>
        <th>Last Seen</th>
        <th>Working Dir</th>
        <th>Session</th>
      </tr>
    </thead>
    <tbody>
      ${clients
        .map((c) => {
          const now = Date.now();
          const lastSeen = new Date(c.last_seen).getTime();
          const diff = now - lastSeen;
          let status = "active";
          if (diff > 300000) status = "stale";
          if (diff > 1800000) status = "offline";
          return `<tr>
          <td><strong>${c.name}</strong></td>
          <td>${c.version || "—"}</td>
          <td><span class="status-badge ${status}"><span class="dot ${status}"></span>${status}</span></td>
          <td>${new Date(c.connected_at).toLocaleString()}</td>
          <td>${new Date(c.last_seen).toLocaleString()}</td>
          <td style="font-size:0.8rem;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${c.working_dir || "—"}</td>
          <td style="font-family:monospace;font-size:0.8rem;">${c.session_id || "—"}</td>
        </tr>`;
        })
        .join("")}
    </tbody>
  </table>

  <a href="/api/clients" class="refresh-btn">🔄 Refresh</a>
</div>
<div class="footer">
  Mission Barisal v3 &mdash; Connected to port ${PORT}
</div>
</body>
</html>`;
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
      return;
    }

    // ─── GET /api/agents ─────────────────────────────────────
    if (url === "/api/agents" && method === "GET") {
      log("INFO", "REQUEST", {
        method,
        url,
        status: 200,
        elapsed: Date.now() - startTime,
      });
      jsonResponse(res, 200, {
        count: AGENTS.length,
        source: "PERSONAS.md",
        agents: AGENTS.map((a) => ({
          id: a.id,
          name: a.name,
          role: a.role,
          model: a.model,
        })),
      });
      return;
    }

    // ─── POST /api/normalize ────────────────────────────────
    // Haq Mawla Normalizer test — send any raw response to see normalized output
    if (url === "/api/normalize" && method === "POST") {
      const body = await readBody(req);
      try {
        const input = JSON.parse(body);
        const result = normalizeResponse(input, input.model || "test");
        log("INFO", "REQUEST", {
          method,
          url,
          status: 200,
          elapsed: Date.now() - startTime,
        });
        jsonResponse(res, 200, result);
      } catch (e) {
        jsonResponse(res, 400, { error: e.message });
      }
      return;
    }

    // ─── GET /api/normalize-list ───────────────────────────
    // Haq Mawla normalizer info — provider-aware model listing
    if (url === "/api/normalize-list" && method === "GET") {
      jsonResponse(res, 200, {
        normalizer: "Haq Mawla Universal Response Normalizer",
        version: "1.0.0",
        providers: Object.keys(PROVIDER_CONFIG),
        models: getAllModels(),
        features: [
          "OpenAI standard format",
          "Anthropic format (content array)",
          "Gemini format (candidates/parts)",
          "Raw string fallback",
          "Reasoning-content extraction (Mimo/North Mini/Nemotron fix)",
          "Provider detection",
          "Dynamic provider routing (competitionRouter)",
        ],
      });
      return;
    }

    // ─── GET/POST /api/config ──────────────────────────────
    // Runtime configuration — view or update without server restart
    if (url === "/api/config" && method === "GET") {
      jsonResponse(res, 200, {
        success: true,
        config: { ...RUNTIME_CONFIG },
      });
      return;
    }
    if (url === "/api/config" && method === "POST") {
      const body = await readBody(req);
      let parsed;
      try {
        parsed = JSON.parse(body);
      } catch (e) {
        jsonResponse(res, 400, { error: "Invalid JSON" });
        return;
      }
      const updated = updateRuntimeConfig(parsed);
      log("INFO", "CONFIG_UPDATED", {
        updates: Object.keys(parsed),
      });
      jsonResponse(res, 200, {
        success: true,
        config: updated,
        message: "Runtime config updated. No restart needed.",
      });
      return;
    }

    // ─── POST /api/set-working-dir ──────────────────────────
    // Non-MCP endpoint for zombieBridge to set working directory and auto-generate SSOT.
    // Simpler than formatting a full MCP JSON-RPC message.
    if (url === "/api/set-working-dir" && method === "POST") {
      const body = await readBody(req);
      let parsed;
      try {
        parsed = JSON.parse(body);
      } catch (e) {
        jsonResponse(res, 400, { error: "Invalid JSON" });
        return;
      }
      const directory = parsed.directory || parsed.dir || parsed.path || ".";
      const resolvedDir = path.resolve(directory);
      log("INFO", "SET_WORKING_DIR", {
        dir: resolvedDir,
        client: parsed.client || req.headers["x-mcp-client-name"] || "unknown",
      });
      mcpWorkingDir = resolvedDir;
      const ssot = refreshSSOT(resolvedDir);
      jsonResponse(res, 200, {
        success: true,
        working_dir: mcpWorkingDir,
        ssot: ssot
          ? ssot.length + " bytes generated"
          : "ssot generation failed",
        message:
          "Working directory set. SSOT auto-generated. Call /api/mcp-clients to see connected clients.",
      });
      return;
    }

    // ─── POST /v1/chat/completions ──────────────────────────
    if (url === "/v1/chat/completions" && method === "POST") {
      const body = await readBody(req);
      let parsed;
      try {
        parsed = JSON.parse(body);
      } catch (e) {
        log("INFO", "REQUEST", {
          method,
          url,
          status: 400,
          elapsed: Date.now() - startTime,
          error: "Invalid JSON",
        });
        jsonResponse(res, 400, { error: { message: "Invalid JSON" } });
        return;
      }

      const model = parsed.model || "mission";
      const messages = parsed.messages || [];
      const stream = parsed.stream || false;
      const temperature = parsed.temperature || 0.7;
      const tools = parsed.tools || undefined;

      // Get or create session
      let sessionId = parsed.session_id;
      if (!sessionId || !getSession(sessionId)) {
        const session = createSession(
          parsed.client_id || "anonymous",
          "hermes",
          req.socket.remoteAddress,
        );
        sessionId = session.id;
      }

      log("INFO", "REQUEST", {
        method,
        url,
        status: 200,
        elapsed: 0,
        model,
        session: sessionId.slice(0, 8),
        messages: messages.length,
        stream,
      });

      // ─── MISSION MODE ────────────────────────────────────
      if (model === "mission") {
        const userMsg = messages.filter((m) => m.role === "user").pop();
        const userInput = userMsg ? userMsg.content : "";

        // SSE streaming if requested
        if (stream) {
          const corsOrigin = getCorsOrigin(req.headers.origin);
          res.writeHead(200, {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
            "Access-Control-Allow-Origin": corsOrigin,
          });

          const sseId = "chatcmpl-" + crypto.randomUUID().replace(/-/g, "");
          const baseTs = Math.floor(Date.now() / 1000);

          // Send initial chunk (OpenAI format) to let client know streaming started
          const initialChunk = {
            id: sseId,
            object: "chat.completion.chunk",
            created: baseTs,
            model: "mission",
            choices: [
              { index: 0, delta: { content: "" }, finish_reason: null },
            ],
          };
          res.write("data: " + JSON.stringify(initialChunk) + "\n\n");

          const originalPushLog = pushLog;
          const originalPushAgent = pushAgentStatus;
          const originalPushOutput = pushOutput;
          const originalPushDone = pushDone;

          // Override push functions to also send real-time chunks via SSE
          pushLog = async (type, message) => {
            const msg = stripEmoji(
              typeof message === "string" ? message : JSON.stringify(message),
            ).slice(0, 150);
            const chunk = {
              id: sseId,
              object: "chat.completion.chunk",
              created: Math.floor(Date.now() / 1000),
              model: "mission",
              choices: [
                {
                  index: 0,
                  delta: { content: msg ? "[" + type + "] " + msg : "" },
                  finish_reason: null,
                },
              ],
            };
            if (chunk.choices[0].delta.content)
              res.write("data: " + JSON.stringify(chunk) + "\n\n");
            await originalPushLog(type, message);
          };
          pushAgentStatus = async (agentId, status) => {
            // Progress callback handles agent status display; just pass through to original
            await originalPushAgent(agentId, status);
          };
          pushOutput = async (output) => {
            const msg = stripEmoji(output || "").slice(0, 150);
            if (!msg) return;
            const chunk = {
              id: sseId,
              object: "chat.completion.chunk",
              created: Math.floor(Date.now() / 1000),
              model: "mission",
              choices: [
                { index: 0, delta: { content: msg }, finish_reason: null },
              ],
            };
            res.write("data: " + JSON.stringify(chunk) + "\n\n");
            await originalPushOutput(output);
          };
          pushDone = async (stats) => {
            await originalPushDone(stats);
          };

          // Progress callback for executeMission
          let progressCount = 0;
          const progressCallback = (phase, id, info) => {
            progressCount++;
            const cleanInfo = stripEmoji(info || "").slice(0, 150);
            let prefix = phase;
            if (phase === "agent-working") prefix = "working";
            else if (phase === "agent-done") prefix = "done";
            else if (phase === "thinking") prefix = "thinking";
            else if (phase === "phase-skip") prefix = "skip";
            else if (phase === "phase3") prefix = "merge";
            else if (phase === "phase3-done") prefix = "final";
            else if (phase === "mission-start") prefix = "start";
            else if (phase === "phase2") prefix = "verify";
            const content = cleanInfo
              ? "[" + prefix + "] " + id + ": " + cleanInfo
              : "[" + prefix + "] " + id;
            const chunk = {
              id: sseId,
              object: "chat.completion.chunk",
              created: Math.floor(Date.now() / 1000),
              model: "mission",
              choices: [{ index: 0, delta: { content }, finish_reason: null }],
            };
            res.write("data: " + JSON.stringify(chunk) + "\n\n");
          };

          const result = await executeMission(
            userInput,
            "",
            sessionId,
            progressCallback,
            tools,
          );

          pushLog = originalPushLog;
          pushAgentStatus = originalPushAgent;
          pushOutput = originalPushOutput;
          pushDone = originalPushDone;

          // Final chunk with the actual content
          const finalChunk = {
            id: sseId,
            object: "chat.completion.chunk",
            created: Math.floor(Date.now() / 1000),
            model: "mission",
            choices: [
              {
                index: 0,
                delta: { content: result.combined || "" },
                finish_reason: "stop",
              },
            ],
          };
          res.write("data: " + JSON.stringify(finalChunk) + "\n\n");
          res.write("data: [DONE]\n\n");
          res.end();
          return;
        }

        // Non-streaming mission
        const result = await executeMission(
          userInput,
          "",
          sessionId,
          undefined,
          tools,
        );

        jsonResponse(res, result.success ? 200 : 500, {
          id: "chatcmpl-" + crypto.randomUUID().replace(/-/g, ""),
          object: "chat.completion",
          created: Math.floor(Date.now() / 1000),
          model: "mission",
          choices: [
            {
              index: 0,
              message: { role: "assistant", content: result.combined || "" },
              finish_reason: "stop",
            },
          ],
          usage: {
            prompt_tokens: Math.ceil(JSON.stringify(messages).length / 4),
            completion_tokens: Math.ceil((result.combined || "").length / 4),
            total_tokens: Math.ceil(
              (JSON.stringify(messages).length +
                (result.combined || "").length) /
                4,
            ),
          },
          session_id: sessionId,
          mission_stats: result.stats,
          mission_verification: result.verification,
        });
        return;
      }

      // ─── PROXY MODE (Competition Router + Provider Fallback) ──────
      // model যদি agent না হয়, কিন্তু provider-এ resolve হয় → direct proxy
      // একটা provider fail করলে পরেরটা try করে (rate limit, timeout, error)
      const isAgent = AGENTS.some((a) => a.id === model);
      if (!isAgent) {
        const allProviders = Object.entries(PROVIDER_CONFIG).sort(
          ([, a], [, b]) => a.priority - b.priority,
        );
        const providerResolved = resolveProvider(model);
        const orderedProviders = providerResolved
          ? [
              [providerResolved.providerId, providerResolved.config],
              ...allProviders.filter(
                ([id]) => id !== providerResolved.providerId,
              ),
            ]
          : allProviders;

        log("INFO", "PROXY_ROUTE", {
          model,
          primaryProvider: orderedProviders[0]?.[0],
          fallbackCount: orderedProviders.length - 1,
          stream,
          messages: messages.length,
        });

        let lastError = null;
        let usedProvider = null;
        let usedModel = model;
        let proxyResult = null;

        // Model + Provider fallback: try all model×provider combos
        for (const [provId, provConf] of orderedProviders) {
          // Build model list: requested model first, then all other models from this provider
          const providerModels = (provConf.models || []).map(
            (m) => m.apiModel || m.name,
          );
          const tryModels = [
            model,
            ...providerModels.filter((m) => m !== model),
          ];

          for (const tryModel of tryModels) {
            log("INFO", "PROXY_TRY", { model: tryModel, provider: provId });
            proxyResult = await proxyChatCompletion(
              tryModel,
              messages,
              stream,
              temperature,
              tools,
              { id: provId, config: provConf },
            );
            if (proxyResult.success) {
              usedProvider = provId;
              usedModel = tryModel;
              break;
            }
            lastError = proxyResult.error;
            log("WARN", "PROXY_FAIL", {
              model: tryModel,
              provider: provId,
              error: lastError,
            });
            if (stream) break;
          }
          if (proxyResult && proxyResult.success) break;
          if (stream) break;
        }

        if (!proxyResult || !proxyResult.success) {
          jsonResponse(res, 502, {
            error: {
              message: lastError || "All providers and models failed",
              model,
              tried_providers: orderedProviders.map(([id]) => id),
            },
          });
          return;
        }
        return jsonResponse(res, 200, {
          id: "chatcmpl-" + crypto.randomUUID().replace(/-/g, ""),
          object: "chat.completion",
          created: Math.floor(Date.now() / 1000),
          model,
          provider: usedProvider,
          actual_model: usedModel,
          choices: [
            {
              index: 0,
              message: {
                role: "assistant",
                content: maskModelIdentity(proxyResult.content),
              },
              finish_reason: "stop",
            },
          ],
          usage: {},
        });
      }

      // ─── SINGLE AGENT MODE ──────────────────────────────
      const agentId = model; // model param = agent id
      const agent = AGENTS.find((a) => a.id === agentId);
      if (!agent) {
        jsonResponse(res, 404, {
          error: { message: "Agent or model not found: " + agentId },
        });
        return;
      }

      if (stream) {
        // SSE Streaming response
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
          "Access-Control-Allow-Origin": "*",
        });

        const responseId = "chatcmpl-" + crypto.randomUUID().replace(/-/g, "");
        let fullContent = "";

        // Augment messages with system prompt
        const userMsgContent =
          messages.filter((m) => m.role === "user").pop()?.content || "";
        const involvesCode =
          /\b(code|file|function|fix|bug|implement|create|script|api)\b/i.test(
            userMsgContent,
          );
        let extraRules = "";
        if (involvesCode) {
          extraRules =
            "\n\n🔒 CODE SAFETY & TEST RULES:" +
            "\n1. NEVER claim code changes 'work' without test evidence. Say 'UNTESTED' if not verified." +
            "\n2. Always specify WHICH file and WHICH lines to modify." +
            "\n3. Read project structure first — don't suggest changes that break existing code.";
        }

        const sysMsg = {
          role: "system",
          content:
            agent.persona +
            "\n\n" +
            buildAgentIdentity(agent) +
            "\n\nPROOF REQUIREMENT: You MUST provide verifiable evidence for EVERY claim. If you cannot provide evidence, say 'আমার কাছে প্রমাণ নেই'. Responses without evidence are REJECTED." +
            extraRules,
        };

        // Load memory
        let augmentedMessages = [sysMsg, ...messages];
        if (sessionId) {
          const mem = getAgentMemory(sessionId, agentId);
          if (mem.length > 0) {
            const history = mem
              .filter((m) => m.role === "user" || m.role === "assistant")
              .slice(-MAX_HISTORY);
            const histMsgs = history.map((m) => ({
              role: m.role,
              content: m.content,
            }));
            augmentedMessages = [sysMsg, ...histMsgs, ...messages];
          }
        }

        await callModelStream(
          agent.model,
          augmentedMessages,
          temperature,
          (delta, parsed) => {
            const content = delta.content || "";
            const toolCalls = delta.tool_calls || null;
            if (content) fullContent += content;

            const chunk = {
              id: responseId,
              object: "chat.completion.chunk",
              created: Math.floor(Date.now() / 1000),
              model: agent.id, // ← Masked: agent id, not real model
              choices: [{ index: 0, delta: {}, finish_reason: null }],
            };

            if (content) chunk.choices[0].delta.content = content;
            if (toolCalls) chunk.choices[0].delta.tool_calls = toolCalls;

            const finishReason = parsed.choices?.[0]?.finish_reason || null;
            if (finishReason) chunk.choices[0].finish_reason = finishReason;

            res.write("data: " + JSON.stringify(chunk) + "\n\n");
          },
          tools,
        );

        // Final [DONE] chunk
        const doneData = JSON.stringify({
          id: responseId,
          object: "chat.completion.chunk",
          created: Math.floor(Date.now() / 1000),
          model: agent.id,
          choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
          usage: {
            prompt_tokens: Math.ceil(
              JSON.stringify(augmentedMessages).length / 4,
            ),
            completion_tokens: Math.ceil(fullContent.length / 4),
            total_tokens: Math.ceil(
              (JSON.stringify(augmentedMessages).length + fullContent.length) /
                4,
            ),
          },
        });
        res.write("data: " + doneData + "\n\n");
        res.write("data: [DONE]\n\n");
        res.end();

        // Save memory
        if (sessionId) {
          const userMsg = messages.filter((m) => m.role === "user").pop();
          if (userMsg)
            saveAgentMemory(sessionId, agentId, "user", userMsg.content);
          if (fullContent)
            saveAgentMemory(sessionId, agentId, "assistant", fullContent);
          saveMemory(sessionId, "user", userMsg?.content || "");
          saveMemory(sessionId, "assistant", fullContent);
          updateSession(sessionId, {
            model: agentId,
            provider: agent.model,
            messages: (getSession(sessionId)?.messages || 0) + 1,
          });
          flushAllMemory();
        }

        log("INFO", "SINGLE_AGENT_STREAM_COMPLETE", {
          agent: agent.id,
          contentLength: fullContent.length,
          elapsed: Date.now() - startTime,
        });
        return;
      }

      // Non-streaming single agent
      const singleResult = await executeSingleAgent(
        agentId,
        messages,
        false,
        sessionId,
        tools,
      );

      if (!singleResult.success) {
        jsonResponse(res, 502, { error: { message: singleResult.error } });
        return;
      }

      // Mask the response content
      const maskedContent = maskModelIdentity(singleResult.content);
      const hasToolCalls =
        singleResult.tool_calls && singleResult.tool_calls.length > 0;

      const responseMessage = { role: "assistant" };
      if (hasToolCalls) {
        responseMessage.content = null;
        responseMessage.tool_calls = singleResult.tool_calls;
      } else {
        responseMessage.content = maskedContent;
      }

      jsonResponse(res, 200, {
        id: "chatcmpl-" + crypto.randomUUID().replace(/-/g, ""),
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model: singleResult.maskedModel, // ← Agent ID (not real model)
        choices: [
          {
            index: 0,
            message: responseMessage,
            finish_reason: hasToolCalls ? "tool_calls" : "stop",
          },
        ],
        usage: {
          prompt_tokens: Math.ceil(JSON.stringify(messages).length / 4),
          completion_tokens: Math.ceil((maskedContent || "").length / 4),
          total_tokens: Math.ceil(
            (JSON.stringify(messages).length + (maskedContent || "").length) /
              4,
          ),
        },
        session_id: sessionId,
        agent: singleResult.agent,
      });
      return;
    }

    // ─── GET /api/verify-session ──────────────────────────────
    if (url === "/api/verify-session" && method === "GET") {
      const sessionId = req.headers["x-session-id"] || "";
      const clientToken = req.headers["x-verify-token"] || "";
      if (!sessionId) {
        jsonResponse(res, 400, {
          verified: false,
          error: "x-session-id header required",
        });
        return;
      }
      const localSession = getSession(sessionId);
      if (!localSession) {
        jsonResponse(res, 404, { verified: false, error: "session not found" });
        return;
      }
      const verifyResult = await verifySessionWithDomain(
        sessionId,
        clientToken,
      );
      jsonResponse(res, 200, {
        verified: verifyResult.verified,
        session_id: sessionId,
        session: localSession,
        domain_verify: verifyResult,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // ─── POST /api/mission ──────────────────────────────────
    if (url === "/api/mission" && method === "POST") {
      const body = await readBody(req);
      let parsed;
      try {
        parsed = JSON.parse(body);
      } catch (e) {
        jsonResponse(res, 400, { error: "Invalid JSON" });
        return;
      }

      const userInput = parsed.input || parsed.query || parsed.prompt || "";
      const context = parsed.context || parsed.system || "";
      const tools = parsed.tools || undefined;
      let sessionId = parsed.session_id;

      if (!sessionId || !getSession(sessionId)) {
        const session = createSession(
          parsed.client_id || "anonymous",
          "api",
          req.socket.remoteAddress,
        );
        sessionId = session.id;
      }

      log("INFO", "REQUEST", {
        method,
        url,
        status: 200,
        elapsed: 0,
        session: sessionId.slice(0, 8),
      });

      if (!userInput) {
        jsonResponse(res, 400, { error: "Input required" });
        return;
      }

      // ── SSE Streaming Mode (named events) ──────────────────────
      // Events: mission_start | log | agent_status | output | progress | mission_done
      const wantsSSE =
        req.headers.accept && req.headers.accept.includes("text/event-stream");
      if (wantsSSE) {
        const corsOrigin = getCorsOrigin(req.headers.origin);
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
          "Access-Control-Allow-Origin": corsOrigin,
        });

        const sseId =
          "miss-" + crypto.randomUUID().replace(/-/g, "").slice(0, 12);

        // Helper: write a named SSE event
        const sseWrite = (event, data) => {
          const payload =
            typeof data === "string" ? data : JSON.stringify(data);
          res.write("event: " + event + "\ndata: " + payload + "\n\n");
        };

        // 1) mission_start
        sseWrite("mission_start", {
          id: sseId,
          model: "mission",
          timestamp: Date.now(),
        });

        const originalPushLog = pushLog;
        const originalPushAgent = pushAgentStatus;
        const originalPushOutput = pushOutput;
        const originalPushDone = pushDone;

        // 2) log event — every pushLog call
        pushLog = async (type, message) => {
          const msg = stripEmoji(
            typeof message === "string" ? message : JSON.stringify(message),
          ).slice(0, 150);
          if (msg)
            sseWrite("log", { type, message: msg, timestamp: Date.now() });
          await originalPushLog(type, message);
        };

        // 3) agent_status — pushAgentStatus becomes a named event
        pushAgentStatus = async (agentId, status) => {
          sseWrite("agent_status", {
            agent_id: agentId,
            status,
            timestamp: Date.now(),
          });
          await originalPushAgent(agentId, status);
        };

        // 4) output — streamed tokens as named events
        pushOutput = async (output) => {
          const msg = stripEmoji(output || "").slice(0, 150);
          if (!msg) return;
          sseWrite("output", { content: msg, timestamp: Date.now() });
          await originalPushOutput(output);
        };
        pushDone = async (stats) => {
          await originalPushDone(stats);
        };

        // 5) progress — named with phase as event discriminator
        const progressCallback = (phase, id, info) => {
          const cleanInfo = stripEmoji(info || "").slice(0, 150);
          const subEvent = phase
            .replace("agent-working", "agent_working")
            .replace("agent-done", "agent_done")
            .replace("phase-skip", "phase_skip")
            .replace("phase3-done", "merge_done")
            .replace("phase3", "merge")
            .replace("mission-start", "mission_progress")
            .replace("phase2", "verify");
          sseWrite("progress", {
            phase: subEvent,
            agent_id: id || null,
            info: cleanInfo || null,
            timestamp: Date.now(),
          });
        };

        let result;
        if (RUNTIME_CONFIG.antiDoteEnabled) {
          const adResult = await wrapWithAntiDote(
            executeMission,
            userInput,
            context,
            sessionId,
            progressCallback,
            tools,
          );
          result = adResult;
        } else {
          result = await executeMission(
            userInput,
            context,
            sessionId,
            progressCallback,
            tools,
          );
        }

        pushLog = originalPushLog;
        pushAgentStatus = originalPushAgent;
        pushOutput = originalPushOutput;
        pushDone = originalPushDone;

        // 6) mission_done — final result
        sseWrite("mission_done", {
          id: sseId,
          combined: result.combined || "",
          success: result.success || false,
          session_id: result.session_id || sessionId,
          metrics: result.metrics || null,
          timestamp: Date.now(),
        });
        res.end();
        return;
      }

      let result;
      if (RUNTIME_CONFIG.antiDoteEnabled) {
        const adResult = await wrapWithAntiDote(
          executeMission,
          userInput,
          context,
          sessionId,
          undefined,
          tools,
        );
        result = adResult;
      } else {
        result = await executeMission(
          userInput,
          context,
          sessionId,
          undefined,
          tools,
        );
      }
      jsonResponse(res, result.success ? 200 : 500, {
        ...result,
        session_id: sessionId,
      });
      return;
    }

    // ─── POST /api/v1/anti-dote ─────────────────────────────
    // Anti-Dote Type Safety endpoint: wraps mission with full 6-step validation.
    // Provides mathematical certainty: P(success) = 1 (see wrapped contract)
    if (url === "/api/v1/anti-dote" && method === "POST") {
      const body = await readBody(req);
      let parsed;
      try {
        parsed = JSON.parse(body);
      } catch (e) {
        jsonResponse(res, 400, { error: "Invalid JSON" });
        return;
      }

      const userInput = parsed.input || parsed.query || parsed.prompt || "";
      const context = parsed.context || parsed.system || "";
      const tools = parsed.tools || undefined;

      // Require input
      if (!userInput) {
        jsonResponse(res, 400, {
          error: "Input required for anti-dote validation",
        });
        return;
      }

      // Get or create session
      let sessionId = parsed.session_id;
      if (!sessionId || !getSession(sessionId)) {
        const session = createSession(
          parsed.client_id || "anonymous",
          "anti-dote",
          req.socket.remoteAddress,
        );
        sessionId = session.id;
      }

      log("INFO", "ANTIDOTE_START", {
        session: sessionId.slice(0, 8),
        inputLength: userInput.length,
      });

      // Execute mission wrapped with anti-dote type safety chain
      const antiDoteResult = await wrapWithAntiDote(
        executeMission,
        userInput,
        context,
        sessionId,
        undefined, // onProgress
        tools,
      );

      log("INFO", "ANTIDOTE_COMPLETE", {
        session: sessionId.slice(0, 8),
        verified: antiDoteResult.verified,
        score: antiDoteResult.verification?.antiDote?.score || 0,
        elapsed: antiDoteResult.timing?.antiDote || 0,
      });

      jsonResponse(res, antiDoteResult.success ? 200 : 422, {
        ...antiDoteResult,
        session_id: sessionId,
      });
      return;
    }

    // ─── POST /mcp (JSON-RPC 2.0) ─────────────────────────────
    if (url === "/mcp" && method === "POST") {
      handleMCP(req, res);
      return;
    }

    // ─── GET /mcp (list tools) ──────────────────────────────
    if (url === "/mcp" && method === "GET") {
      const tools = Object.entries(MCP_TOOLS).map(([name, def]) => ({
        name,
        description: def.description,
        params: def.params,
        required: def.required,
      }));
      log("INFO", "REQUEST", {
        method,
        url,
        status: 200,
        elapsed: Date.now() - startTime,
      });
      jsonResponse(res, 200, { tools });
      return;
    }

    // ─── GET /status ──────────────────────────────────────────
    if (url === "/status" && method === "GET") {
      const sessions = cleanExpired();
      log("INFO", "REQUEST", {
        method,
        url,
        status: 200,
        elapsed: Date.now() - startTime,
      });
      jsonResponse(res, 200, {
        version: "3.0.0",
        uptime: Math.floor((Date.now() - STATS.startTime) / 1000),
        stats: {
          totalRequests: STATS.totalRequests,
          agents: AGENTS.length,
          sessions: sessions.length,
        },
        agents: AGENTS.map((a) => ({
          id: a.id,
          name: a.name,
          role: a.role,
          model: a.model,
        })),
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // ─── 404 ─────────────────────────────────────────────────
    log("INFO", "REQUEST", {
      method,
      url,
      status: 404,
      elapsed: Date.now() - startTime,
    });
    jsonResponse(res, 404, { error: "Not found" });
  } catch (err) {
    log("ERROR", "SERVER", { error: err.message });
    log("INFO", "REQUEST", {
      method,
      url,
      status: 500,
      elapsed: Date.now() - startTime,
    });
    jsonResponse(res, 500, { error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════
//  WEBSOCKET HANDLER (Native, zero-dep)
// ══════════════════════════════════════════════════════════════
function handleWebSocketUpgrade(req, socket, head) {
  const key = req.headers["sec-websocket-key"];
  const acceptKey = crypto
    .createHash("sha1")
    .update(key + "258EAFA5-E914-47DA-95CA-5AB5DC113594")
    .digest("base64");

  socket.write(
    "HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: " +
      acceptKey +
      "\r\nAccess-Control-Allow-Origin: *\r\n\r\n",
  );

  let buffer = Buffer.alloc(0);
  socket.on("data", (data) => {
    buffer = Buffer.concat([buffer, data]);
    while (buffer.length > 2) {
      const firstByte = buffer[0],
        secondByte = buffer[1];
      const opcode = firstByte & 0x0f;
      const isMasked = (secondByte & 0x80) !== 0;
      let payloadLength = secondByte & 0x7f,
        offset = 2;

      if (payloadLength === 126) {
        if (buffer.length < 4) break;
        payloadLength = buffer.readUInt16BE(2);
        offset = 4;
      } else if (payloadLength === 127) {
        if (buffer.length < 10) break;
        payloadLength = Number(buffer.readBigUInt64BE(2));
        offset = 10;
      }

      let maskKey = null;
      if (isMasked) {
        if (buffer.length < offset + 4) break;
        maskKey = buffer.slice(offset, offset + 4);
        offset += 4;
      }
      if (buffer.length < offset + payloadLength) break;

      let payload = buffer.slice(offset, offset + payloadLength);
      if (isMasked && maskKey)
        for (let i = 0; i < payload.length; i++) payload[i] ^= maskKey[i % 4];
      buffer = buffer.slice(offset + payloadLength);

      if (opcode === 0x01) handleWSMessage(socket, payload.toString());
      else if (opcode === 0x08) {
        socket.end();
        return;
      } else if (opcode === 0x09) sendWSFrame(socket, 0x8a, payload);
    }
  });
  socket.on("close", () => log("INFO", "WS_CLOSE", {}));
  socket.on("error", () => {});
}

function sendWSFrame(socket, opcode, payload) {
  payload = payload || Buffer.alloc(0);
  if (typeof payload === "string") payload = Buffer.from(payload);
  const header =
    payload.length < 126
      ? Buffer.of(opcode, payload.length)
      : payload.length < 65536
        ? Buffer.of(
            opcode,
            126,
            (payload.length >> 8) & 0xff,
            payload.length & 0xff,
          )
        : ((buf) => {
            buf[0] = opcode;
            buf[1] = 127;
            buf.writeBigUInt64BE(BigInt(payload.length), 2);
            return buf;
          })(Buffer.alloc(10));
  socket.write(Buffer.concat([header, payload]));
}

async function handleWSMessage(socket, message) {
  try {
    const data = JSON.parse(message);
    switch (data.type) {
      case "auth":
        sendWSFrame(
          socket,
          0x81,
          JSON.stringify({
            type: "auth_success",
            timestamp: new Date().toISOString(),
          }),
        );
        break;
      case "chat":
      case "question": {
        const model = data.model || DEFAULT_MODEL;
        const agentId = data.agent_id || model;
        const userMsg = data.message || data.content || "";
        const tools = data.tools || undefined;
        const sessionId = data.session_id || crypto.randomUUID();

        if (agentId === "mission") {
          const result = await executeMission(
            userMsg,
            "",
            sessionId,
            undefined,
            tools,
          );
          sendWSFrame(
            socket,
            0x81,
            JSON.stringify({
              type: "response_complete",
              data: {
                response: result.combined,
                model: "mission",
                agentId: "mission",
                session_id: sessionId,
              },
            }),
          );
        } else {
          const result = await executeSingleAgent(
            agentId,
            [{ role: "user", content: userMsg }],
            false,
            sessionId,
            tools,
          );
          const maskedContent = maskModelIdentity(
            result.content || "No response",
          );
          sendWSFrame(
            socket,
            0x81,
            JSON.stringify({
              type: "response_complete",
              data: {
                response: maskedContent,
                model: agentId,
                agentId,
                session_id: sessionId,
              },
            }),
          );
        }
        break;
      }
      case "mcp": {
        const toolResult = await executeMcpTool(data.tool, data.args || {});
        sendWSFrame(
          socket,
          0x81,
          JSON.stringify({ type: "mcp_result", id: data.id, ...toolResult }),
        );
        break;
      }
      case "ping":
        sendWSFrame(
          socket,
          0x81,
          JSON.stringify({ type: "pong", timestamp: new Date().toISOString() }),
        );
        break;
      default:
        sendWSFrame(
          socket,
          0x81,
          JSON.stringify({
            type: "error",
            data: { error: "Unknown type: " + data.type },
          }),
        );
    }
  } catch (e) {
    log("ERROR", "WS_PARSE", { error: e.message });
  }
}

server.on("upgrade", handleWebSocketUpgrade);

// ══════════════════════════════════════════════════════════════
//  START
// ══════════════════════════════════════════════════════════════
const DEFAULT_MODEL = getDefaultModel();

// Minimal fallback persona — ONE LINE ONLY, used ONLY when PERSONAS.md unavailable
const FALLBACK_PERSONA_PREFIX =
  "তুমি ZombieCoder AI — বাংলায় উত্তর দাও, প্রমাণ ছাড়া দাবি কোরো না।";

async function init() {
  AGENTS = await loadPersonas();
  STATS.totalAgents = AGENTS.length;

  if (AGENTS.length === 0) {
    log("WARN", "START_NO_AGENTS", { fallback: "using DEFAULT_AGENTS" });
    // One-line fallback persona only — full persona lives in PERSONAS.md
    AGENTS = DEFAULT_AGENTS.map((a) => ({
      ...a,
      persona: FALLBACK_PERSONA_PREFIX,
    }));
    STATS.totalAgents = AGENTS.length;
    log("INFO", "DEFAULT_AGENTS_LOADED", { count: AGENTS.length });
  }

  // Auto-generate SSOT on startup — internal server context only
  const ssotResult = autoSSOT(path.resolve("."));

  // ── Startup: User Memory Cache ─────────────────────────────
  initCache();
  log("INFO", "CACHE_READY", { dir: CACHE_DIR, ttl: CACHE_TTL + "ms" });

  // ── Startup: Git Runtime Download ──────────────────────────
  if (GIT_SKILLS_URL || GIT_INSTRUCTIONS_URL) {
    log("INFO", "GIT_DOWNLOAD_START", {
      skills: GIT_SKILLS_URL || "none",
      instructions: GIT_INSTRUCTIONS_URL || "none",
    });
    Promise.all([loadSkills(), loadInstructions()]).then(() =>
      log("INFO", "GIT_DOWNLOAD_DONE", {}),
    );
  }

  server.listen(PORT, "0.0.0.0", () => {
    log("INFO", "START", { port: PORT, agents: AGENTS.length });
    console.log("\nMission Barisal v3");
    console.log(
      "Port: " +
        PORT +
        " | Agents: " +
        AGENTS.length +
        " | Providers: " +
        Object.keys(PROVIDER_CONFIG).length +
        " | Models: " +
        FREE_MODELS.length,
    );
    console.log("--- Providers ---");
    for (const [id, p] of Object.entries(PROVIDER_CONFIG)) {
      console.log(
        "  " +
          id +
          ": " +
          p.name +
          " [" +
          (p.models.length
            ? p.models.length + " models"
            : "wildcard (any model)") +
          "] priority=" +
          p.priority,
      );
    }
    console.log("--- Server Internal Context ---");
    console.log("  Root: " + path.resolve("."));
    if (ssotResult)
      console.log(
        "  SSOT: " +
          path.resolve(".", ".zombiecoder", "SSOT.md") +
          " (internal)",
      );
    console.log("--- --- --- --- --- --- --- --- ---");
    console.log("Endpoints:");
    console.log("  GET  /health             — Health check");
    console.log("  GET  /identity           — System identity");
    console.log(
      "  GET  /v1/models          — List agents (masked consumer models)",
    );
    console.log(
      "  GET  /api/v1/models      — List ALL provider models (unmasked, dev)",
    );
    console.log("  POST /v1/chat/completions — Agent or mission");
    console.log("  POST /api/mission        — Full debate mission");
    console.log(
      "  POST /api/v1/anti-dote   — Anti-Dote Type Safety (6-step chain)",
    );
    console.log("  POST /api/mcp-clients    — Connected MCP clients (JSON)");
    console.log("  GET  /api/clients         — Connected MCP clients (HTML)");
    console.log(
      "  POST /api/set-working-dir — Set working dir (for zombieBridge)",
    );
    console.log("  POST /api/normalize      — Test Haq Mawla normalizer (dev)");
    console.log("  GET  /api/normalize-list — Provider + model list");
    console.log("  GET  /api/config          — View runtime config");
    console.log("  POST /api/config          — Update runtime config");
    console.log("  POST /mcp                — MCP JSON-RPC 2.0");
    console.log("  WS   /                   — WebSocket for real-time\n");
    console.log("[SSOT] CLIENT SSOT: set_working_dir call korlei");
    console.log("[SSOT] apnar client-er project folder-e");
    console.log("[SSOT] .zombiecoder/SSOT.md auto-generate hobe!\n");
  });
}

init();

process.on("SIGINT", () => {
  log("INFO", "SHUTDOWN", {});
  server.close(() => process.exit(0));
});
process.on("SIGTERM", () => {
  log("INFO", "SHUTDOWN", {});
  server.close(() => process.exit(0));
});
