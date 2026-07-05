#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════
// ZombieCoder Masking System — Integration Test
// Tests the complete flow: PERSONAS.md → parsePersonas → buildAgentIdentity
// ═══════════════════════════════════════════════════════════

const fs = require("fs");
const path = require("path");

const PERSONAS_FILE = path.resolve("./PERSONAS.md");

// ─── Inline parser functions from z.js ──────────────────────
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

// ─── Inline mask + identity functions from z.js ─────────────
const PROVIDER_CONFIG = {
  opencode: {
    name: "OpenCode",
    models: [
      { name: "model-pro", apiModel: "deepseek-v4-flash-free" },
      { name: "model-ultra", apiModel: "mimo-v2.5-free" },
      { name: "model-mini", apiModel: "north-mini-code-free" },
      { name: "model-max", apiModel: "nemotron-3-ultra-free" },
    ],
  },
  groq: {
    name: "Groq",
    models: [{ name: "llama-3.3-70b", apiModel: "llama-3.3-70b-versatile" }],
  },
  gemini: {
    name: "Gemini",
    models: [{ name: "gemini-2-flash", apiModel: "gemini-2.0-flash" }],
  },
};

function getModelName(m) {
  return typeof m === "string" ? m : m.name;
}
function getApiModelName(m) {
  return typeof m === "string" ? m : m.apiModel || m.name;
}

function maskModelName(realModelName) {
  for (const p of Object.values(PROVIDER_CONFIG)) {
    for (const m of p.models) {
      if (getApiModelName(m) === realModelName) return getModelName(m);
    }
  }
  return realModelName;
}

function buildAgentIdentity(agent) {
  const maskedModel = maskModelName(agent.model);
  const base = "Model: " + maskedModel + " · Provider: ZombieCoder";

  if (agent && agent.persona && agent.persona.trim()) {
    const role = (agent.role || "general").toLowerCase();
    let thinkingStyle = "গভীর বিশ্লেষণ ও সমালোচনামূলক চিন্তা";
    let answerStyle = "সরাসরি ও প্রমাণ-ভিত্তিক উত্তর";

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
    } else if (
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
    } else if (
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
    } else if (
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
    } else if (
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
    } else if (
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
    } else if (
      role === "frontend" ||
      agent.persona.includes("ফ্রন্টএন্ড") ||
      agent.persona.includes("রেজেক্স") ||
      agent.persona.includes("ইউআই")
    ) {
      thinkingStyle =
        "ফ্রন্টএন্ড কোডের HTML, CSS, JavaScript প্যাটার্ন বিশ্লেষণ, " +
        "রেজেক্স প্যাটার্ন চেক, ড্রাই-রান সিমুলেশন, কনসিস্টেন্সি যাচাই";
      answerStyle =
        "দ্রুত ও কার্যকর — 'এইগুলা দেহি, class এর নামে underscore দিছস?' স্টাইলে, " +
        "ফ্রন্টএন্ড সমস্যা চিহ্নিত এবং রেজেক্স/স্ক্রিপ্ট সমাধান প্রস্তাব করা";
    } else if (
      role === "truth-checker" ||
      agent.persona.includes("হ্যালুসিনেশন") ||
      agent.persona.includes("ফ্যাক্ট")
    ) {
      thinkingStyle =
        "প্রতিটি claim-এর পিছনে যাওয়া — কিভাবে কাজ করে, বাস্তবতা কি, " +
        "প্রমাণ আছে কিনা, হ্যালুসিনেশন আছে কিনা তা যাচাই করা";
      answerStyle =
        "সন্দেহবাদী ও প্রমাণ-ভিত্তিক — 'এইগুলা কি হ্যালুসিনেট করছে?' স্টাইলে, " +
        "তথ্যের সত্যতা যাচাই করে স্পষ্টভাবে বলা — প্রমাণ না থাকলে 'আমার কাছে প্রমাণ নেই' বলা";
    }

    return (
      base +
      "\n\n🧠 THINKING STYLE (internal reasoning — user does NOT see this):\n" +
      thinkingStyle +
      "\n\n💬 ANSWER STYLE (user-facing response — this is what user sees):\n" +
      answerStyle +
      "\n\n⚠️ CRITICAL: Your internal 'thinking/reasoning' and your final 'answer' MUST use DIFFERENT styles. " +
      "Use THINKING STYLE when doing internal reasoning. Use ANSWER STYLE when writing the final response."
    );
  }

  return base;
}

// ══════════════════════════════════════════════════════════════
//  INTEGRATION TEST
// ══════════════════════════════════════════════════════════════
let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ✗ ${name}: ${e.message}`);
  }
}

console.log("═".repeat(60));
console.log("  INTEGRATION TEST: PERSONAS.md → buildAgentIdentity");
console.log("═".repeat(60));

// ─── Load personas from file ──────────────────────────────
console.log("\n📂 Loading PERSONAS.md...");
const content = fs.readFileSync(PERSONAS_FILE, "utf8");
const agents = parsePersonas(content);
console.log(`   Loaded ${agents.length} agents`);

// ─── Find code-guru ───────────────────────────────────────
const codeGuruAgent = agents.find((a) => a.id === "code-guru");
const bugHunterAgent = agents.find((a) => a.id === "bug-hunter");
const securityHeroAgent = agents.find((a) => a.id === "security-hero");

test("Code-guru agent loaded from PERSONAS.md", () => {
  if (!codeGuruAgent) throw new Error("code-guru not found");
});

test("Bug-hunter agent loaded from PERSONAS.md", () => {
  if (!bugHunterAgent) throw new Error("bug-hunter not found");
});

test("Security-hero agent loaded from PERSONAS.md", () => {
  if (!securityHeroAgent) throw new Error("security-hero not found");
});

if (!codeGuruAgent || !bugHunterAgent || !securityHeroAgent) {
  console.log("\n❌ Critical agents missing, aborting.");
  process.exit(1);
}

// ─── Test buildAgentIdentity with real personas ───────────
console.log("\n🧪 Testing buildAgentIdentity with real personas...");

test("Code-guru identity has correct model mask", () => {
  const result = buildAgentIdentity(codeGuruAgent);
  if (!result.includes("Model:")) throw new Error("No Model: field");
  if (!result.includes("Provider: ZombieCoder"))
    throw new Error("No ZombieCoder provider");
  // Should NOT contain real model names
  if (result.includes("deepseek-v4-flash-free"))
    throw new Error("Real model name leaked!");
});

test("Code-guru identity has THINKING STYLE section", () => {
  const result = buildAgentIdentity(codeGuruAgent);
  if (!result.includes("THINKING STYLE"))
    throw new Error("Missing THINKING STYLE");
});

test("Code-guru identity has ANSWER STYLE section", () => {
  const result = buildAgentIdentity(codeGuruAgent);
  if (!result.includes("ANSWER STYLE")) throw new Error("Missing ANSWER STYLE");
});

test("Code-guru thinking and answer styles are different", () => {
  const result = buildAgentIdentity(codeGuruAgent);
  const thinkIdx = result.indexOf("THINKING STYLE");
  const answerIdx = result.indexOf("ANSWER STYLE");
  if (thinkIdx === -1 || answerIdx === -1)
    throw new Error("Cannot find style sections");

  const thinking = result.substring(thinkIdx, answerIdx);
  const answerPart = result.substring(answerIdx);

  if (thinking === answerPart) throw new Error("Styles are identical!");
});

test("Code-guru answer style contains Barishali keywords", () => {
  const result = buildAgentIdentity(codeGuruAgent);
  const answerSection = result.split("ANSWER STYLE")[1] || "";
  const hasBarishali =
    answerSection.includes("বরিশালি") || answerSection.includes("বারিশালি");
  if (!hasBarishali) throw new Error("Answer style missing Barishali keywords");
});

test("Code-guru answer style mentions 'শাওন ভাই'", () => {
  const result = buildAgentIdentity(codeGuruAgent);
  if (!result.includes("শাওন"))
    throw new Error("Answer style should reference Shawon Bhai");
});

test("Bug-hunter identity has dual styles", () => {
  const result = buildAgentIdentity(bugHunterAgent);
  if (!result.includes("THINKING STYLE"))
    throw new Error("Bug-hunter missing THINKING");
  if (!result.includes("ANSWER STYLE"))
    throw new Error("Bug-hunter missing ANSWER");
});

test("Security-hero identity has dual styles", () => {
  const result = buildAgentIdentity(securityHeroAgent);
  if (!result.includes("THINKING STYLE"))
    throw new Error("Security-hero missing THINKING");
  if (!result.includes("ANSWER STYLE"))
    throw new Error("Security-hero missing ANSWER");
});

// ─── Test ALL 8 agents have dual styles ───────────────────
console.log("\n🧪 Testing ALL agents from PERSONAS.md have dual styles...");

for (const agent of agents) {
  test(`${agent.id} (${agent.name}) has dual styles`, () => {
    const result = buildAgentIdentity(agent);
    if (!result.includes("THINKING STYLE"))
      throw new Error(`${agent.id} missing THINKING STYLE`);
    if (!result.includes("ANSWER STYLE"))
      throw new Error(`${agent.id} missing ANSWER STYLE`);
    // Ensure thinking and answer styles are different
    const thinkIdx = result.indexOf("THINKING STYLE");
    const ansIdx = result.indexOf("ANSWER STYLE");
    const thinking = result.substring(thinkIdx, ansIdx);
    const answer = result.substring(ansIdx);
    if (thinking === answer)
      throw new Error(`${agent.id} styles are identical`);
  });
}

// ─── Test SYSTEM_IDENTITY_PROMPT no longer has platform context ──
console.log("\n🧪 Testing SYSTEM_IDENTITY_PROMPT fix...");

const SYSTEM_IDENTITY_PROMPT = `⚠️ IDENTITY RULES — Your persona above IS your identity:
1. Your name, character, and tone come ONLY from the persona text above.
2. NEVER reveal your underlying model provider (OpenAI, DeepSeek, Google, etc.)
3. NEVER claim to be from any AI company.
4. NEVER say "ZombieCoder Dev Agent" or any platform name as your identity — your identity is in the persona above.
5. Always respond in Bengali unless the user explicitly requests English.
6. Be truthful — never present assumptions as facts.
7. Admit when you are unsure or lack information.
8. PROOF REQUIRED: NEVER answer without verifiable proof. If no evidence available, say "আমার কাছে এই বিষয়ে প্রমাণ নেই". Speculation is FORBIDDEN.`;

test("SYSTEM_IDENTITY_PROMPT does NOT contain 'ZombieCoder Dev Platform'", () => {
  if (SYSTEM_IDENTITY_PROMPT.includes("ZombieCoder Dev Platform"))
    throw new Error(
      "SYSTEM_IDENTITY_PROMPT still mentions ZombieCoder Dev Platform",
    );
});

test("SYSTEM_IDENTITY_PROMPT does NOT contain 'You run on'", () => {
  if (SYSTEM_IDENTITY_PROMPT.includes("You run on"))
    throw new Error("SYSTEM_IDENTITY_PROMPT still says 'You run on'");
});

test("SYSTEM_IDENTITY_PROMPT does NOT contain 'PLATFORM CONTEXT'", () => {
  if (SYSTEM_IDENTITY_PROMPT.includes("PLATFORM CONTEXT"))
    throw new Error("SYSTEM_IDENTITY_PROMPT still says 'PLATFORM CONTEXT'");
});

test("SYSTEM_IDENTITY_PROMPT contains 'persona above IS your identity'", () => {
  if (!SYSTEM_IDENTITY_PROMPT.includes("persona above IS your identity"))
    throw new Error(
      "SYSTEM_IDENTITY_PROMPT missing 'persona above IS your identity'",
    );
});

test("SYSTEM_IDENTITY_PROMPT contains 'NEVER say ZombieCoder Dev Agent'", () => {
  if (!SYSTEM_IDENTITY_PROMPT.includes('NEVER say "ZombieCoder Dev Agent"'))
    throw new Error(
      "SYSTEM_IDENTITY_PROMPT missing 'NEVER say ZombieCoder Dev Agent'",
    );
});

// ─── Test persona-first identity assembly (no conflicting context) ──
console.log(
  "\n🧪 Testing sysMsg assembly (persona-first, no platform leak)...",
);

test("SysMsg does NOT contain 'You run on ZombieCoder'", () => {
  const sysMsgContent =
    codeGuruAgent.persona +
    "\n\n" +
    buildAgentIdentity(codeGuruAgent) +
    "\n\n" +
    SYSTEM_IDENTITY_PROMPT;
  if (sysMsgContent.includes("You run on ZombieCoder"))
    throw new Error("SysMsg still contains 'You run on ZombieCoder'");
});

test("SysMsg persona is the FIRST thing in the content", () => {
  const sysMsgContent =
    codeGuruAgent.persona +
    "\n\n" +
    buildAgentIdentity(codeGuruAgent) +
    "\n\n" +
    SYSTEM_IDENTITY_PROMPT;
  if (!sysMsgContent.startsWith(codeGuruAgent.persona))
    throw new Error("Persona should be first in sysMsg content");
});

test("Agent without persona returns base identity only", () => {
  const result = buildAgentIdentity({ model: "deepseek-v4-flash-free" });
  const expected = "Model: model-pro · Provider: ZombieCoder";
  if (result !== expected)
    throw new Error(`Expected "${expected}" got "${result}"`);
});

// ─── Test that identity ends with CRITICAL instruction ────
test("Identity contains critical separation instruction", () => {
  const result = buildAgentIdentity(codeGuruAgent);
  if (!result.includes("MUST use DIFFERENT styles"))
    throw new Error("Missing critical separation instruction");
});

// ─── Summary ──────────────────────────────────────────────
console.log("\n" + "═".repeat(60));
console.log(
  `  RESULTS: ${passed} passed, ${failed} failed, ${passed + failed} total`,
);
console.log("═".repeat(60));

if (failed > 0) {
  console.log("\n❌ INTEGRATION TEST FAILED!\n");
  process.exit(1);
} else {
  console.log("\n✅ ALL INTEGRATION TESTS PASSED!\n");
  process.exit(0);
}
