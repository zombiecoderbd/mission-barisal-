#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════
// ZombieCoder Masking System — Unit Tests
// Tests: maskProviderName, maskModelName, buildAgentIdentity
// ═══════════════════════════════════════════════════════════

const assert = require("assert");

// ─── Inline the exact logic from z.js for testing ─────────
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

const PROVIDER_CONFIG = {
  opencode: {
    name: "OpenCode",
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
    models: [
      { name: "gemini-2-flash", apiModel: "gemini-2.0-flash" },
      { name: "gemini-2-pro", apiModel: "gemini-2.5-pro-preview-05-06" },
      { name: "gemini-2.5-flash", apiModel: "gemini-2.5-flash" },
    ],
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
    // Frontend/ui-ux-regex style
    else if (
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
    }
    // Truth-checker/ai-halucination-baap style
    else if (
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

// ─── Test Helpers ─────────────────────────────────────────
let passed = 0;
let failed = 0;
const results = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    results.push({ name, status: "PASS" });
  } catch (e) {
    failed++;
    results.push({ name, status: "FAIL", error: e.message });
  }
}

function eq(actual, expected, msg) {
  assert.strictEqual(
    actual,
    expected,
    msg || `Expected "${expected}" but got "${actual}"`,
  );
}

function contains(str, substr, msg) {
  assert.ok(
    str.includes(substr),
    msg || `Expected "${str}" to contain "${substr}"`,
  );
}

// ─── maskProviderName Tests ───────────────────────────────
console.log("\n=== maskProviderName ===");

test("OpenCode → ZombieCoder", () => {
  eq(maskProviderName("OpenCode"), "ZombieCoder");
});

test("Groq → ZombieCoder", () => {
  eq(maskProviderName("Groq"), "ZombieCoder");
});

test("Gemini → ZombieCoder", () => {
  eq(maskProviderName("Gemini"), "ZombieCoder");
});

test("OpenCode (Xiaomi) → ZombieCoder", () => {
  eq(maskProviderName("OpenCode (Xiaomi)"), "ZombieCoder");
});

test("OpenCode (Cohere) → ZombieCoder", () => {
  eq(maskProviderName("OpenCode (Cohere)"), "ZombieCoder");
});

test("OpenCode (Nvidia) → ZombieCoder", () => {
  eq(maskProviderName("OpenCode (Nvidia)"), "ZombieCoder");
});

test("Unknown → ZombieCoder", () => {
  eq(maskProviderName("Unknown"), "ZombieCoder");
});

test("Completely unknown provider → ZombieCoder (fallback)", () => {
  eq(maskProviderName("SomeRandomProvider"), "ZombieCoder");
});

test("Empty string → ZombieCoder (fallback)", () => {
  eq(maskProviderName(""), "ZombieCoder");
});

// ─── maskModelName Tests ──────────────────────────────────
console.log("\n=== maskModelName ===");

test("deepseek-v4-flash-free → model-pro", () => {
  eq(maskModelName("deepseek-v4-flash-free"), "model-pro");
});

test("mimo-v2.5-free → model-ultra", () => {
  eq(maskModelName("mimo-v2.5-free"), "model-ultra");
});

test("north-mini-code-free → model-mini", () => {
  eq(maskModelName("north-mini-code-free"), "model-mini");
});

test("nemotron-3-ultra-free → model-max", () => {
  eq(maskModelName("nemotron-3-ultra-free"), "model-max");
});

test("big-pickle → model-pickle", () => {
  eq(maskModelName("big-pickle"), "model-pickle");
});

test("llama-3.3-70b-versatile → llama-3.3-70b", () => {
  eq(maskModelName("llama-3.3-70b-versatile"), "llama-3.3-70b");
});

test("llama-3.1-8b-instant → llama-3.1-8b", () => {
  eq(maskModelName("llama-3.1-8b-instant"), "llama-3.1-8b");
});

test("mixtral-8x7b-32768 → mixtral", () => {
  eq(maskModelName("mixtral-8x7b-32768"), "mixtral");
});

test("gemma2-9b-it → gemma-2", () => {
  eq(maskModelName("gemma2-9b-it"), "gemma-2");
});

test("deepseek-r1-distill-llama-70b → deepseek-r1", () => {
  eq(maskModelName("deepseek-r1-distill-llama-70b"), "deepseek-r1");
});

test("gemini-2.0-flash → gemini-2-flash", () => {
  eq(maskModelName("gemini-2.0-flash"), "gemini-2-flash");
});

test("gemini-2.5-pro-preview-05-06 → gemini-2-pro", () => {
  eq(maskModelName("gemini-2.5-pro-preview-05-06"), "gemini-2-pro");
});

test("gemini-2.5-flash → gemini-2.5-flash", () => {
  eq(maskModelName("gemini-2.5-flash"), "gemini-2.5-flash");
});

test("Unknown model → returns as-is", () => {
  eq(maskModelName("some-unknown-model"), "some-unknown-model");
});

test("Empty string → returns empty string", () => {
  eq(maskModelName(""), "");
});

// ─── buildAgentIdentity Tests ─────────────────────────────
console.log("\n=== buildAgentIdentity ===");

test("Agent with deepseek model shows masked name", () => {
  const result = buildAgentIdentity({ model: "deepseek-v4-flash-free" });
  eq(result, "Model: model-pro · Provider: ZombieCoder");
});

test("Agent with mimo model shows masked name", () => {
  const result = buildAgentIdentity({ model: "mimo-v2.5-free" });
  eq(result, "Model: model-ultra · Provider: ZombieCoder");
});

test("Agent with llama model shows masked name", () => {
  const result = buildAgentIdentity({ model: "llama-3.3-70b-versatile" });
  eq(result, "Model: llama-3.3-70b · Provider: ZombieCoder");
});

test("Agent with gemini model shows masked name", () => {
  const result = buildAgentIdentity({ model: "gemini-2.0-flash" });
  eq(result, "Model: gemini-2-flash · Provider: ZombieCoder");
});

test("Agent with unknown model keeps original name", () => {
  const result = buildAgentIdentity({ model: "unknown-model" });
  eq(result, "Model: unknown-model · Provider: ZombieCoder");
});

test("Output never contains real provider name", () => {
  const realProviders = [
    "OpenCode",
    "Groq",
    "Gemini",
    "OpenCode (Xiaomi)",
    "OpenCode (Cohere)",
    "OpenCode (Nvidia)",
  ];
  for (const provider of realProviders) {
    const result = buildAgentIdentity({ model: "deepseek-v4-flash-free" });
    assert.ok(
      !result.includes(provider),
      `Identity should not contain real provider "${provider}"`,
    );
  }
});

test("Output never contains real model names", () => {
  const realModels = [
    "deepseek-v4-flash-free",
    "mimo-v2.5-free",
    "llama-3.3-70b-versatile",
    "gemini-2.0-flash",
  ];
  for (const model of realModels) {
    const result = buildAgentIdentity({ model });
    assert.ok(
      !result.includes(model),
      `Identity should not contain real model "${model}"`,
    );
  }
});

// ─── Dual-Style (Thinking vs Answer) Tests ────────────────
console.log("\n=== Dual-Style: Thinking vs Answer ===");

const CODE_GURU_AGENT = {
  id: "code-guru",
  name: "🔴 কোড গুরু - মনু",
  model: "deepseek-v4-flash-free",
  role: "architecture",
  expertise: "সিস্টেম আর্কিটেকচার, ডিজাইন প্যাটার্ন",
  priority: 1,
  persona:
    'তুমি "কোড গুরু - মনু"। বরিশালের দুষ্টু মাস্টার আর্কিটেক্ট।\n' +
    "তুই দা নিয়ে দাঁড়িয়ে থাকোস — কোন বাজে ডিজাইন দেখলে তোকে কেউ থামাইতে পারবে না।\n" +
    "তবে তুই প্রমাণ ছাড়া কিছু বলবি না — ওয়েব সার্চ করে ডাটা আনবি প্রয়োজনে।\n" +
    'মনে রাখ: **শাওন ভাই সব জানে** — ভুল তথ্য দিলে শাওন ভাইকে বলে দিবে আর তোর "কোড গুরু" খাতা শেষ!\n' +
    'বারিশালি স্টাইলে বল: "এই মনু, ডিজাইনটা দেখি কেমুন আছে? আরে বালা লাগছে!"',
};

const BUG_HUNTER_AGENT = {
  id: "bug-hunter",
  name: "🔵 বাগ হান্টার - জুয়েল",
  model: "mimo-v2.5-free",
  role: "debugging",
  expertise: "বাগ ডিটেকশন, ডিবাগিং",
  priority: 2,
  persona:
    'তুমি "বাগ হান্টার - জুয়েল"। বরিশালের সবচেয়ে পাগল ডিবাগার।\n' +
    "তুই নুনু কুচিকুচি করিস — ছোট থেকে বড় সব বাগ তোর নজর এড়ায় না।\n" +
    'তবে মজা করতে ভালোবাসিস: "ভাইয়া মুভি দেখি কেমনে কি হইছেও! এই লাইনে তো বাগ আছে!"\n' +
    "জানা না থাকলে ওয়েব সার্চ করে বের করবি — শাওন ভাইর কাছে ধরাই দিতে চাস না তো?\n" +
    "**সাবধান: শাওন ভাইকে খবর গেলে তোর বাগ হান্টার খাতা শেষ!**",
};

const SECURITY_HERO_AGENT = {
  id: "security-hero",
  name: "🟢 নিরাপত্তা বীর - বাবলু",
  model: "north-mini-code-free",
  role: "security",
  expertise: "সিকিউরিটি অডিট, ভালনারেবিলিটি",
  priority: 3,
  persona:
    'তুমি "নিরাপত্তা বীর - বাবলু"। বরিশালের সিকিউরিটি পাগল।\n' +
    "তোর নাম বাবলু। তুই নিরাপত্তা বীর।\n" +
    'তুই বলবি: "এই, এই লাইনটা দেহি — এখানে তো SQL Injection হইবার সম্ভাবনা আছে!"\n' +
    "**শাওন ভাই এর চোখ সব জায়গায়** — ফেক সিকিউরিটি রিপোর্ট দিলে তোর খাতা শেষ!",
};

const PERF_WIZARD_AGENT = {
  id: "perf-wizard",
  name: "🟡 পারফরম্যান্স উইজার্ড - রাশেদ",
  model: "nemotron-3-ultra-free",
  role: "performance",
  expertise: "পারফরম্যান্স অপটিমাইজেশন",
  priority: 4,
  persona:
    'তুমি "পারফরম্যান্স উইজার্ড - রাশেদ"। বরিশালের স্পিড পাগল।\n' +
    "তুই লুপের ভিতরে API call দেখলে পাগল হয়ে যাস।\n" +
    "**শাওন ভাই জাল অপটিমাইজেশন ধরতে পারে** — প্রমাণ ছাড়া কিছু বলবি না।",
};

const DOC_KING_AGENT = {
  id: "doc-king",
  name: "📚 ডকুমেন্টেশন রাজা - হালিম",
  model: "big-pickle",
  role: "documentation",
  expertise: "ডকুমেন্টেশন",
  priority: 5,
  persona:
    'তুমি "ডকুমেন্টেশন রাজা - হালিম"। বরিশালের ডকুমেন্টেশন পাগল।\n' +
    'তুই বলবি: "কোড লিখছস কিন্তু কমেন্ট নাই?"\n' +
    "**শাওন ভাই মিথ্যা ডকুমেন্টেশন সহ্য করে না** — ভুল দিলে তোর খাতা শেষ!",
};

const QA_TYRANT_AGENT = {
  id: "qa-tyrant",
  name: "⚫ কোয়ালিটি তস্কর - মজনু",
  model: "deepseek-v4-flash-free",
  role: "quality",
  expertise: "কোড কোয়ালিটি",
  priority: 6,
  persona:
    'তুমি "কোয়ালিটি তস্কর - মজনু"। বরিশালের সবচেয়ে কড়া কোয়ালিটি চেকার।\n' +
    "তোর কাজ: বাকি সব এজেন্টের উত্তর চেক করা আর কনসেনসাস নিশ্চিত করা।\n" +
    "**শাওন ভাই এর আস্থা রাখা খুব কঠিন** — তোর ফাইনাল আউটপুটে ভুল থাকলে তোরও খাতা শেষ!",
};

const UI_UX_REGEX_AGENT = {
  id: "ui-ux-regex",
  name: "🟣 ইউআই ইউএক্স রেজেক্স পাগলা - টুটুল",
  model: "deepseek-v4-flash-free",
  role: "frontend",
  expertise: "ফ্রন্টএন্ড ডেভেলপমেন্ট, রেজেক্স",
  priority: 7,
  persona:
    'তুমি "ইউআই ইউএক্স রেজেক্স পাগলা - টুটুল"। বরিশালের সবচেয়ে পাগলা ফ্রন্টএন্ড ও রেজেক্স মাস্টার।\n' +
    "তোর কাজ: ফ্রন্টএন্ডের সব কাজ — HTML, CSS, JavaScript, React\n" +
    "**শাওন ভাই জাল dry-run ধরতে পারে** — প্রমাণ ছাড়া execute করবি না।",
};

const AI_HALUCINATION_BAAP_AGENT = {
  id: "ai-halucination-baap",
  name: "🟤 এআই হ্যালুসিনেশনের বাপ - বাদশা",
  model: "deepseek-v4-flash-free",
  role: "truth-checker",
  expertise: "হ্যালুসিনেশন ডিটেকশন, ফ্যাক্ট ক্রস-চেক",
  priority: 8,
  persona:
    'তুমি "এআই হ্যালুসিনেশনের বাপ - বাদশা"। বরিশালের সবচেয়ে সন্দেহবাদী এজেন্ট।\n' +
    "তোর কাজ: অন্য এজেন্টদের উত্তর শুনে বলবি এগুলা কি হকিকত নাকি হ্যালুসিনেশন।\n" +
    "**শাওন ভাই মিথ্যা যাচাই সহ্য করে না** — প্রমাণ না থাকলে বলবি 'আমার কাছে প্রমাণ নেই'।",
};

test("Perf-wizard identity contains thinking/answer styles", () => {
  const result = buildAgentIdentity(PERF_WIZARD_AGENT);
  assert.ok(
    result.includes("THINKING STYLE"),
    "Perf-wizard needs thinking style",
  );
  assert.ok(result.includes("ANSWER STYLE"), "Perf-wizard needs answer style");
  const answerSection = result.split("ANSWER STYLE")[1] || "";
  assert.ok(
    answerSection.includes("পারফরম্যান্স") || answerSection.includes("স্পিড"),
    "Perf-wizard answer should reference performance",
  );
});

test("Doc-king identity contains thinking/answer styles", () => {
  const result = buildAgentIdentity(DOC_KING_AGENT);
  assert.ok(result.includes("THINKING STYLE"), "Doc-king needs thinking style");
  assert.ok(result.includes("ANSWER STYLE"), "Doc-king needs answer style");
  const answerSection = result.split("ANSWER STYLE")[1] || "";
  assert.ok(
    answerSection.includes("ডকুমেন্টেশন") || answerSection.includes("কমেন্ট"),
    "Doc-king answer should reference documentation",
  );
});

test("QA-tyrant identity contains thinking/answer styles", () => {
  const result = buildAgentIdentity(QA_TYRANT_AGENT);
  assert.ok(
    result.includes("THINKING STYLE"),
    "QA-tyrant needs thinking style",
  );
  assert.ok(result.includes("ANSWER STYLE"), "QA-tyrant needs answer style");
  const answerSection = result.split("ANSWER STYLE")[1] || "";
  assert.ok(
    answerSection.includes("শাওন"),
    "QA-tyrant answer should reference Shawon Bhai",
  );
});

test("UI-UX-regex identity contains thinking/answer styles", () => {
  const result = buildAgentIdentity(UI_UX_REGEX_AGENT);
  assert.ok(
    result.includes("THINKING STYLE"),
    "UI-UX-regex needs thinking style",
  );
  assert.ok(result.includes("ANSWER STYLE"), "UI-UX-regex needs answer style");
  const answerSection = result.split("ANSWER STYLE")[1] || "";
  assert.ok(
    answerSection.includes("ফ্রন্টএন্ড") || answerSection.includes("রেজেক্স"),
    "UI-UX-regex answer should reference frontend/regex",
  );
});

test("AI-halucination-baap identity contains thinking/answer styles", () => {
  const result = buildAgentIdentity(AI_HALUCINATION_BAAP_AGENT);
  assert.ok(
    result.includes("THINKING STYLE"),
    "AI-halucination-baap needs thinking style",
  );
  assert.ok(
    result.includes("ANSWER STYLE"),
    "AI-halucination-baap needs answer style",
  );
  const answerSection = result.split("ANSWER STYLE")[1] || "";
  assert.ok(
    answerSection.includes("প্রমাণ") || answerSection.includes("হ্যালুসিনেশন"),
    "AI-halucination-baap answer should reference proof/hallucination",
  );
});

test("Code-guru identity contains THINKING STYLE section", () => {
  const result = buildAgentIdentity(CODE_GURU_AGENT);
  assert.ok(
    result.includes("THINKING STYLE"),
    `Expected THINKING STYLE in result but got: ${result}`,
  );
});

test("Code-guru identity contains ANSWER STYLE section", () => {
  const result = buildAgentIdentity(CODE_GURU_AGENT);
  assert.ok(
    result.includes("ANSWER STYLE"),
    `Expected ANSWER STYLE in result but got: ${result}`,
  );
});

test("Code-guru thinking and answer styles are different", () => {
  const result = buildAgentIdentity(CODE_GURU_AGENT);
  const thinkingMatch = result.match(/THINKING STYLE.*?\n([\s\S]*?)(?=\n\n💬)/);
  const answerMatch = result.match(/ANSWER STYLE.*?\n([\s\S]*?)(?=\n\n⚠️)/);
  if (thinkingMatch && answerMatch) {
    const thinking = thinkingMatch[1].trim();
    const answer = answerMatch[1].trim();
    assert.notStrictEqual(
      thinking,
      answer,
      "Thinking and answer styles should be different",
    );
  }
});

test("Code-guru identity still contains masked model and provider", () => {
  const result = buildAgentIdentity(CODE_GURU_AGENT);
  assert.ok(
    result.includes("Model: model-pro"),
    "Should contain masked model name",
  );
  assert.ok(
    result.includes("Provider: ZombieCoder"),
    "Should contain masked provider",
  );
});

test("Bug-hunter identity contains thinking/answer styles", () => {
  const result = buildAgentIdentity(BUG_HUNTER_AGENT);
  assert.ok(
    result.includes("THINKING STYLE"),
    "Bug-hunter needs thinking style",
  );
  assert.ok(result.includes("ANSWER STYLE"), "Bug-hunter needs answer style");
});

test("Security-hero identity contains thinking/answer styles", () => {
  const result = buildAgentIdentity(SECURITY_HERO_AGENT);
  assert.ok(result.includes("THINKING STYLE"), "Security needs thinking style");
  assert.ok(result.includes("ANSWER STYLE"), "Security needs answer style");
});

test("Agent without persona returns base identity only", () => {
  const result = buildAgentIdentity({ model: "deepseek-v4-flash-free" });
  eq(result, "Model: model-pro · Provider: ZombieCoder");
});

test("Code-guru identity contains Barishali keywords in answer style", () => {
  const result = buildAgentIdentity(CODE_GURU_AGENT);
  const answerSection = result.split("ANSWER STYLE")[1] || "";
  assert.ok(
    answerSection.includes("বরিশালি") || answerSection.includes("বারিশালি"),
    `Answer style should contain Barishali keywords. Got: ${answerSection}`,
  );
});

// ─── Inverse Function Tests ───────────────────────────────
console.log("\n=== inverse: resolveApiModel ===");

function resolveApiModel(publicModelName) {
  for (const p of Object.values(PROVIDER_CONFIG)) {
    for (const m of p.models) {
      if (getModelName(m) === publicModelName) return getApiModelName(m);
    }
  }
  return publicModelName;
}

test("model-pro → deepseek-v4-flash-free (inverse works)", () => {
  eq(resolveApiModel("model-pro"), "deepseek-v4-flash-free");
});

test("model-ultra → mimo-v2.5-free (inverse works)", () => {
  eq(resolveApiModel("model-ultra"), "mimo-v2.5-free");
});

test("llama-3.3-70b → llama-3.3-70b-versatile (inverse works)", () => {
  eq(resolveApiModel("llama-3.3-70b"), "llama-3.3-70b-versatile");
});

test("Roundtrip: apiModel → mask → resolve → apiModel", () => {
  const apiModel = "deepseek-v4-flash-free";
  const masked = maskModelName(apiModel);
  const resolved = resolveApiModel(masked);
  eq(resolved, apiModel, "Roundtrip should return original apiModel");
});

// ─── Summary ──────────────────────────────────────────────
console.log("\n" + "═".repeat(50));
console.log(
  `  RESULTS: ${passed} passed, ${failed} failed, ${passed + failed} total`,
);
console.log("═".repeat(50));

if (failed > 0) {
  console.log("\nFailed tests:");
  results
    .filter((r) => r.status === "FAIL")
    .forEach((r) => {
      console.log(`  ✗ ${r.name}: ${r.error}`);
    });
  process.exit(1);
} else {
  console.log("\n  ✓ All masking tests passed!");
  process.exit(0);
}
