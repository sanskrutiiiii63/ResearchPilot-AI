import "dotenv/config";
import express from "express";
import cors from "cors";
import multer from "multer";
import { v4 as uuid } from "uuid";
import { firestore } from "./config/firebase.js";
import { requireAuth } from "./middleware/auth.js";
import { now, getOwned, listWhere, countWhere, deleteWhere, byNewest, byOldest } from "./db.js";
import { extractPdf } from "./services/pdf.js";
import { aiEnabled, checkGemini, summarizePaper, findGaps, answerQuestion } from "./services/gemini.js";

const app = express();
const port = process.env.PORT || 5000;
const MIN_TEXT = 200;
const STORED_TEXT_CHARS = 100000; // Firestore docs are limited to 1 MB, and the AI only reads ~60k chars

app.use(cors({ origin: (process.env.CLIENT_URL || "http://localhost:5173").split(",") }));
app.use(express.json({ limit: "1mb" }));

/* ---------- helpers ---------- */
const httpError = (status, message) => Object.assign(new Error(message), { status });
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const ok = (res, data, status = 200) => res.status(status).json({ success: true, data });
const clean = ({ ownerId, ...rest }) => rest;

async function ownedProject(req) {
  const project = await getOwned("projects", req.params.projectId, req.user.uid);
  if (!project) throw httpError(404, "Project not found.");
  return project;
}
async function ownedPaper(req) {
  const paper = await getOwned("papers", req.params.paperId, req.user.uid);
  if (!paper) throw httpError(404, "Paper not found.");
  return paper;
}
async function withCounts(project) {
  const f = [["projectId", project.id], ["ownerId", project.ownerId]];
  const [paperCount, analysisCount] = await Promise.all([countWhere("papers", f), countWhere("analyses", f)]);
  return { ...clean(project), paperCount, analysisCount, gapCount: (project.gaps || []).length };
}

// Basic AI rate limit: 12 requests per minute per user
const hits = new Map();
function aiLimiter(req, res, next) {
  const t = Date.now();
  const recent = (hits.get(req.user.uid) || []).filter((x) => t - x < 60000);
  if (recent.length >= 12) {
    return res.status(429).json({ success: false, message: "Too many AI requests. Please wait a minute." });
  }
  recent.push(t);
  hits.set(req.user.uid, recent);
  next();
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 5 },
  fileFilter: (_req, file, cb) =>
    file.mimetype === "application/pdf" ? cb(null, true) : cb(httpError(400, "Only PDF files are allowed."))
});

/* ---------- public ---------- */
app.get("/api/health", (_req, res) =>
  res.json({ success: true, message: "ResearchPilot API is running", aiEnabled })
);

/* ---------- everything below requires a signed-in user ---------- */
app.use("/api", requireAuth);

app.post(
  "/api/me",
  wrap(async (req, res) => {
    const ref = firestore.collection("users").doc(req.user.uid);
    const snap = await ref.get();
    const name = String(req.body?.name || req.user.name || "").slice(0, 100);
    await ref.set(
      {
        uid: req.user.uid,
        name,
        email: req.user.email,
        photoURL: req.user.picture || null,
        lastLoginAt: now(),
        ...(snap.exists ? {} : { createdAt: now() })
      },
      { merge: true }
    );
    ok(res, { uid: req.user.uid });
  })
);

/* ---------- projects ---------- */
app.get(
  "/api/projects",
  wrap(async (req, res) => {
    const projects = (await listWhere("projects", [["ownerId", req.user.uid]])).sort(byNewest);
    ok(res, await Promise.all(projects.map(withCounts)));
  })
);

app.post(
  "/api/projects",
  wrap(async (req, res) => {
    const { title, domain, objective = "", keywords = [] } = req.body || {};
    if (!title?.trim() || !domain?.trim()) throw httpError(400, "Project title and domain are required.");
    const id = uuid();
    const project = {
      ownerId: req.user.uid,
      title: title.trim().slice(0, 200),
      domain: domain.trim().slice(0, 100),
      objective: String(objective).trim().slice(0, 2000),
      keywords: Array.isArray(keywords) ? keywords.slice(0, 20).map(String) : [],
      gaps: [],
      status: "active",
      createdAt: now(),
      updatedAt: now()
    };
    await firestore.collection("projects").doc(id).set(project);
    ok(res, await withCounts({ id, ...project }), 201);
  })
);

app.get(
  "/api/projects/:projectId",
  wrap(async (req, res) => {
    const project = await ownedProject(req);
    const f = [["projectId", project.id], ["ownerId", req.user.uid]];
    const [papers, analyses, messages] = await Promise.all([
      listWhere("papers", f),
      listWhere("analyses", f),
      listWhere("messages", f)
    ]);
    ok(res, {
      project: await withCounts(project),
      papers: papers.sort(byNewest).map(clean),
      analyses: analyses.sort(byOldest).map(clean),
      messages: messages.sort(byOldest).slice(-100).map(clean)
    });
  })
);

app.patch(
  "/api/projects/:projectId",
  wrap(async (req, res) => {
    const project = await ownedProject(req);
    const updates = { updatedAt: now() };
    for (const field of ["title", "domain", "objective"]) {
      if (typeof req.body?.[field] === "string") updates[field] = req.body[field].trim();
    }
    if (updates.title === "" || updates.domain === "") throw httpError(400, "Title and domain cannot be empty.");
    await firestore.collection("projects").doc(project.id).update(updates);
    ok(res, await withCounts({ ...project, ...updates }));
  })
);

app.delete(
  "/api/projects/:projectId",
  wrap(async (req, res) => {
    const project = await ownedProject(req);
    const f = [["projectId", project.id], ["ownerId", req.user.uid]];
    await Promise.all(["papers", "paperTexts", "analyses", "messages"].map((c) => deleteWhere(c, f)));
    await firestore.collection("projects").doc(project.id).delete();
    res.json({ success: true, message: "Project deleted." });
  })
);

/* ---------- papers ---------- */
app.post(
  "/api/projects/:projectId/papers",
  upload.array("papers", 5),
  wrap(async (req, res) => {
    const project = await ownedProject(req);
    if (!req.files?.length) throw httpError(400, "Please choose at least one PDF file.");

    const created = [];
    for (const file of req.files) {
      const id = uuid();
      const paper = {
        ownerId: req.user.uid,
        projectId: project.id,
        fileName: file.originalname,
        pageCount: 0,
        textLength: 0,
        status: "ready",
        error: null,
        createdAt: now()
      };
      let text = "";
      try {
        const extracted = await extractPdf(file.buffer);
        text = extracted.text;
        paper.pageCount = extracted.pages;
        paper.textLength = text.length;
        if (text.length < MIN_TEXT) {
          paper.status = "failed";
          paper.error = "No extractable text. This may be a scanned PDF (OCR is not supported yet).";
        }
      } catch (error) {
        paper.status = "failed";
        paper.error = error.message || "PDF processing failed.";
      }
      await firestore.collection("papers").doc(id).set(paper);
      if (paper.status === "ready") {
        await firestore.collection("paperTexts").doc(id).set({
          ownerId: req.user.uid,
          projectId: project.id,
          text: text.slice(0, STORED_TEXT_CHARS)
        });
      }
      created.push(clean({ id, ...paper }));
    }
    await firestore.collection("projects").doc(project.id).update({ updatedAt: now() });
    ok(res, created, 201);
  })
);

app.delete(
  "/api/papers/:paperId",
  wrap(async (req, res) => {
    const paper = await ownedPaper(req);
    await deleteWhere("analyses", [["paperId", paper.id], ["ownerId", req.user.uid]]);
    await firestore.collection("paperTexts").doc(paper.id).delete();
    await firestore.collection("papers").doc(paper.id).delete();
    res.json({ success: true, message: "Paper deleted." });
  })
);

app.post(
  "/api/papers/:paperId/analyze",
  aiLimiter,
  wrap(async (req, res) => {
    const paper = await ownedPaper(req);
    if (paper.status === "failed") throw httpError(400, paper.error || "This paper cannot be analysed.");
    const textSnap = await firestore.collection("paperTexts").doc(paper.id).get();
    if (!textSnap.exists) throw httpError(400, "Paper text is missing. Please re-upload the PDF.");

    const { result, demo } = await summarizePaper(textSnap.data().text, paper.fileName);

    await deleteWhere("analyses", [["paperId", paper.id], ["ownerId", req.user.uid]]);
    const id = uuid();
    const analysis = {
      ownerId: req.user.uid,
      projectId: paper.projectId,
      paperId: paper.id,
      fileName: paper.fileName,
      type: "summary",
      demo,
      result,
      createdAt: now()
    };
    await firestore.collection("analyses").doc(id).set(analysis);
    ok(res, clean({ id, ...analysis }));
  })
);

/* ---------- research gaps ---------- */
app.post(
  "/api/projects/:projectId/gaps",
  aiLimiter,
  wrap(async (req, res) => {
    const project = await ownedProject(req);
    const analyses = await listWhere("analyses", [["projectId", project.id], ["ownerId", req.user.uid]]);
    if (!analyses.length) throw httpError(400, "Analyze at least one paper first.");
    const items = analyses.map((a) => ({ fileName: a.fileName, ...a.result }));
    const { gaps } = await findGaps(items, project);
    await firestore.collection("projects").doc(project.id).update({ gaps, updatedAt: now() });
    ok(res, gaps);
  })
);

/* ---------- chat ---------- */
app.post(
  "/api/projects/:projectId/chat",
  aiLimiter,
  wrap(async (req, res) => {
    const project = await ownedProject(req);
    const question = String(req.body?.question || "").trim();
    if (!question) throw httpError(400, "Please type a question.");
    if (question.length > 1000) throw httpError(400, "Question is too long (max 1000 characters).");

    const f = [["projectId", project.id], ["ownerId", req.user.uid]];
    const [papers, analyses] = await Promise.all([listWhere("papers", f), listWhere("analyses", f)]);
    const ready = papers.filter((p) => p.status === "ready").slice(0, 15);
    if (!ready.length) throw httpError(400, "Upload at least one paper first.");

    const textRefs = ready.map((p) => firestore.collection("paperTexts").doc(p.id));
    const textSnaps = await firestore.getAll(...textRefs);

    let context = "";
    ready.forEach((paper, i) => {
      const analysis = analyses.find((a) => a.paperId === paper.id);
      const text = textSnaps[i].exists ? textSnaps[i].data().text : "";
      context += `\n=== Paper: ${paper.fileName} ===\n`;
      if (analysis) context += `Summary: ${JSON.stringify(analysis.result)}\n`;
      context += `Excerpt: ${text.slice(0, 4000)}\n`;
    });

    const { answer, citations } = await answerQuestion(question, context.slice(0, 80000));
    const t = Date.now();
    const base = { ownerId: req.user.uid, projectId: project.id };
    const userMsg = { ...base, role: "user", content: question, citations: [], createdAt: new Date(t).toISOString() };
    const aiMsg = { ...base, role: "assistant", content: answer, citations, createdAt: new Date(t + 1).toISOString() };
    const userId = uuid();
    const aiId = uuid();
    const batch = firestore.batch();
    batch.set(firestore.collection("messages").doc(userId), userMsg);
    batch.set(firestore.collection("messages").doc(aiId), aiMsg);
    await batch.commit();
    ok(res, clean({ id: aiId, ...aiMsg }));
  })
);

/* ---------- errors ---------- */
app.use((req, res) =>
  res.status(404).json({ success: false, message: `Route not found: ${req.method} ${req.path}` })
);

app.use((err, _req, res, _next) => {
  let status = err.status || 500;
  let message = err.message || "Request failed.";
  if (err instanceof multer.MulterError) {
    status = 400;
    if (err.code === "LIMIT_FILE_SIZE") message = "File too large (max 15 MB per PDF).";
    if (err.code === "LIMIT_FILE_COUNT" || err.code === "LIMIT_UNEXPECTED_FILE") {
      message = "You can upload up to 5 PDFs at a time.";
    }
  }
  if (status >= 500) {
    console.error(message);
    message = err.status ? message : "Something went wrong on the server. Check the server console.";
  }
  res.status(status).json({ success: false, message });
});

app.listen(port, () => {
  console.log(`ResearchPilot API running at http://localhost:${port}`);
  checkGemini();
});
