import { GoogleGenerativeAI } from "@google/generative-ai";

/* ---------- configuration ---------- */
// Tolerate the usual .env mishaps: stray spaces and pasted quotes.
const apiKey = (process.env.GEMINI_API_KEY || "").trim().replace(/^["']|["']$/g, "");
const genAI = apiKey && !/^your_/i.test(apiKey) ? new GoogleGenerativeAI(apiKey) : null;

// Primary model first, then fallbacks. Duplicates removed, blanks ignored.
const MODELS = [
  ...new Set(
    [
      process.env.GEMINI_MODEL || "gemini-3.5-flash",
      ...(process.env.GEMINI_FALLBACK_MODELS || "gemini-3.1-flash-lite,gemini-2.5-flash").split(",")
    ]
      .map((m) => m.trim())
      .filter(Boolean)
  )
];
const ATTEMPTS_PER_MODEL = 2;
const RETRYABLE = new Set([429, 500, 502, 503, 504]);

export const aiEnabled = Boolean(genAI);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const aiError = (status, message) => Object.assign(new Error(message), { status });

/* ---------- startup self-test ---------- */
// Lists the models your key can actually use. Costs no tokens, and tells you
// immediately whether the key or the model name is the problem.
export async function checkGemini() {
  if (!genAI) {
    console.log("Gemini: demo mode (no valid GEMINI_API_KEY in server/.env)");
    return;
  }
  try {
    const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", {
      headers: { "x-goog-api-key": apiKey }
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      console.error(`Gemini key check FAILED (HTTP ${res.status}): ${body.error?.message || "no details"}`);
      if ([400, 401, 403].includes(res.status)) {
        console.error("  The key in server/.env is not accepted. Create a new one at https://aistudio.google.com/apikey");
        console.error("  Then restart this server (nodemon does not watch .env files).");
      }
      return;
    }
    const data = await res.json();
    const available = (data.models || [])
      .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
      .map((m) => m.name.replace(/^models\//, ""));
    console.log(`Gemini key: valid (ends in ...${apiKey.slice(-4)})`);
    for (const name of MODELS) {
      console.log(`  ${name}: ${available.includes(name) ? "available" : "NOT FOUND for this key"}`);
    }
    const flash = available.filter((n) => /^gemini-[\d.]+-flash(-lite)?$/.test(n));
    if (flash.length) console.log(`  stable flash models you can use: ${flash.join(", ")}`);
  } catch (error) {
    console.warn("Could not reach Gemini to verify the key:", error.message);
  }
}

/* ---------- JSON handling ---------- */
function parseJson(raw) {
  const cleaned = raw.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/[\[{][\s\S]*[\]}]/);
    if (match) return JSON.parse(match[0]);
    throw new Error("AI returned invalid JSON.");
  }
}

/* ---------- the call, with retries and model fallback ---------- */
// 503/429/5xx: back off briefly, retry, then move to the next model.
// 404 (model missing): skip straight to the next model.
// 401/403 or invalid key: stop immediately, since retrying a bad key is just noise.
async function askJson(prompt) {
  let lastError;

  for (const modelName of MODELS) {
    for (let attempt = 1; attempt <= ATTEMPTS_PER_MODEL; attempt += 1) {
      try {
        const model = genAI.getGenerativeModel(
          { model: modelName, generationConfig: { responseMimeType: "application/json" } },
          { timeout: 90000 }
        );
        const result = await model.generateContent(prompt);
        const parsed = parseJson(result.response.text());
        if (modelName !== MODELS[0]) console.warn(`Gemini: answered by fallback model ${modelName}`);
        return parsed;
      } catch (error) {
        lastError = error;
        const status = error.status;
        const text = String(error.message || "");
        console.warn(`Gemini ${modelName} attempt ${attempt}/${ATTEMPTS_PER_MODEL} failed: ${status || "no status"} ${text.slice(0, 140)}`);

        const badKey = status === 401 || status === 403 || /API key not valid|API_KEY_INVALID/i.test(text);
        if (badKey) {
          throw aiError(
            502,
            "Gemini rejected your API key. Create a new key at aistudio.google.com/apikey, put it in server/.env as GEMINI_API_KEY=... (no quotes), then restart the server."
          );
        }
        if (status === 404) break; // this model name does not exist for the key
        if (status === 400) {
          throw aiError(502, "Gemini rejected the request (HTTP 400). The paper text may be unusable. Try another paper.");
        }
        const retryable = !status || RETRYABLE.has(status) || /invalid JSON/i.test(text);
        if (!retryable) break;
        if (attempt < ATTEMPTS_PER_MODEL) await sleep(1000 * 2 ** (attempt - 1) + Math.random() * 400);
      }
    }
  }

  const status = lastError?.status;
  if (status === 429) throw aiError(429, "Gemini rate limit or quota reached. Wait a minute and try again.");
  if (status === 404) {
    throw aiError(502, `None of these models exist for your key: ${MODELS.join(", ")}. Check GEMINI_MODEL in server/.env.`);
  }
  if (status === 503 || status === 500 || status === 502 || status === 504) {
    throw aiError(503, "Gemini is overloaded right now (all configured models were busy). Please try again in a minute.");
  }
  throw aiError(502, "The AI request failed. See the server console for details.");
}

const list = (v) => (Array.isArray(v) ? v.map(String) : v ? [String(v)] : []);
const str = (v) => (v ? String(v) : "Not specified in the paper.");

/* ---------- Single-paper summary ---------- */
export async function summarizePaper(text, fileName) {
  if (!genAI) {
    return {
      demo: true,
      result: {
        title: fileName.replace(/\.pdf$/i, ""),
        researchProblem: "Demo mode: add a Gemini API key to get a real analysis.",
        objectives: ["Not available in demo mode."],
        methodology: "Not available in demo mode. First extracted text: " + text.slice(0, 300),
        dataset: "Not available in demo mode.",
        evaluationMetrics: [],
        keyFindings: ["Not available in demo mode."],
        limitations: ["Not available in demo mode."],
        futureWork: [],
        keywords: []
      }
    };
  }
  const prompt = `You are an academic research assistant.
Analyze the research paper below. Use ONLY the paper text. Do not invent information.
If something is missing, write "Not specified in the paper."
Return valid JSON with exactly these fields:
{"title":"","researchProblem":"","objectives":[],"methodology":"","dataset":"","evaluationMetrics":[],"keyFindings":[],"limitations":[],"futureWork":[],"keywords":[]}

Paper filename: ${fileName}
Paper text:
${text.slice(0, 60000)}`;
  const r = await askJson(prompt);
  return {
    demo: false,
    result: {
      title: str(r.title || fileName.replace(/\.pdf$/i, "")),
      researchProblem: str(r.researchProblem),
      objectives: list(r.objectives),
      methodology: str(r.methodology),
      dataset: str(r.dataset),
      evaluationMetrics: list(r.evaluationMetrics),
      keyFindings: list(r.keyFindings),
      limitations: list(r.limitations),
      futureWork: list(r.futureWork),
      keywords: list(r.keywords)
    }
  };
}

/* ---------- Research gaps ---------- */
export async function findGaps(items, project) {
  if (!genAI) {
    return {
      demo: true,
      gaps: [
        {
          title: "Demo gap: limitations repeated across papers",
          explanation: "Demo mode. Add a Gemini API key to generate real, evidence-based gaps.",
          label: "AI-suggested direction",
          supportingPapers: items.map((i) => i.fileName),
          whyItMatters: "Real analysis compares limitations across all analysed papers.",
          possibleProjectDirection: "Configure GEMINI_API_KEY and run the analysis again.",
          confidence: "low"
        }
      ]
    };
  }
  const prompt = `You are analysing a collection of research paper summaries for the project
"${project.title}" (domain: ${project.domain}; objective: ${project.objective || "not given"}).
Identify research gaps supported by these papers. Do NOT claim a gap is definitely novel.
Each gap must have a label, exactly one of:
"Explicitly stated" (authors state it), "Observed across papers" (pattern across 2+ papers),
"AI-suggested direction" (your own inference).
supportingPapers must use the exact fileName values given below.
Return a valid JSON array (3 to 6 items):
[{"title":"","explanation":"","label":"","supportingPapers":[],"whyItMatters":"","possibleProjectDirection":"","confidence":"low|medium|high"}]

Paper summaries:
${JSON.stringify(items)}`;
  const r = await askJson(prompt);
  const arr = Array.isArray(r) ? r : r.gaps || [];
  return {
    demo: false,
    gaps: arr.map((g) => ({
      title: str(g.title),
      explanation: str(g.explanation),
      label: str(g.label),
      supportingPapers: list(g.supportingPapers),
      whyItMatters: str(g.whyItMatters),
      possibleProjectDirection: str(g.possibleProjectDirection),
      confidence: ["low", "medium", "high"].includes(g.confidence) ? g.confidence : "low"
    }))
  };
}

/* ---------- Chat ---------- */
export async function answerQuestion(question, context) {
  if (!genAI) {
    return {
      answer: "Demo mode: add a Gemini API key in server/.env to get answers grounded in your papers.",
      citations: []
    };
  }
  const prompt = `You answer questions about the user's uploaded research papers.
Use ONLY the material below. If the answer is not in it, say so. Name the supporting paper(s).
Return valid JSON: {"answer":"","citations":["exact paper fileName", "..."]}

Material:
${context}

Question: ${question}`;
  const r = await askJson(prompt);
  return { answer: str(r.answer), citations: list(r.citations) };
}
