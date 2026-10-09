import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity, ArrowLeft, BookOpen, BrainCircuit, ChevronRight, Download, FileText,
  FolderKanban, LayoutDashboard, Lightbulb, LogOut, MessageSquare, Plus, Search,
  Sparkles, Trash2, Upload, X
} from "lucide-react";
import api, { errMsg } from "./services/api";
import { firebaseReady } from "./services/firebase";
import { useAuth } from "./context/AuthContext";
import AuthPage from "./pages/AuthPage";
import SetupNotice from "./pages/SetupNotice";

const emptyForm = { title: "", domain: "", objective: "", keywords: "" };
const asText = (v) => (Array.isArray(v) ? v.join("; ") : v || "—");

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

/* ============================== Root ============================== */
export default function App() {
  const { user, loading } = useAuth();
  if (!firebaseReady) return <SetupNotice />;
  if (loading) return <div className="splash">Loading…</div>;
  if (!user) return <AuthPage />;
  // key resets all state when a different user signs in
  return <AppShell key={user.uid} />;
}

/* ============================ App shell ============================ */
function AppShell() {
  const { user, name, logout } = useAuth();
  const [projects, setProjects] = useState([]);
  const [page, setPage] = useState("dashboard");
  const [selectedId, setSelectedId] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");

  const loadProjects = useCallback(async () => {
    try {
      const { data } = await api.get("/projects");
      setProjects(data.data);
    } catch (e) {
      setNotice(errMsg(e, "Could not load projects."));
    }
  }, []);

  useEffect(() => { loadProjects(); }, [loadProjects]);

  // Save/refresh the user's profile document in Firestore.
  useEffect(() => {
    api.post("/me", { name }).catch(() => {});
  }, [user.uid, name]);

  async function createProject(event) {
    event.preventDefault();
    if (!form.title.trim() || !form.domain.trim()) {
      setNotice("Project title and domain are required.");
      return;
    }
    try {
      setCreating(true);
      const { data } = await api.post("/projects", {
        ...form,
        keywords: form.keywords.split(",").map((k) => k.trim()).filter(Boolean)
      });
      setProjects((cur) => [data.data, ...cur]);
      setSelectedId(data.data.id);
      setForm(emptyForm);
      setShowModal(false);
      setPage("workspace");
      setNotice("Project created.");
    } catch (e) {
      setNotice(errMsg(e, "Could not create project."));
    } finally {
      setCreating(false);
    }
  }

  async function deleteProject(id) {
    if (!window.confirm("Delete this project and all its papers and analyses?")) return;
    try {
      await api.delete(`/projects/${id}`);
      setProjects((cur) => cur.filter((p) => p.id !== id));
      if (selectedId === id) { setSelectedId(null); setPage("dashboard"); }
      setNotice("Project deleted.");
    } catch (e) {
      setNotice(errMsg(e, "Could not delete project."));
    }
  }

  const visible = projects.filter((p) => p.title.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark"><BrainCircuit size={23} /></div>
          <div><strong>ResearchPilot</strong><span>AI research workspace</span></div>
        </div>
        <button className="primary-button wide" onClick={() => setShowModal(true)}>
          <Plus size={18} /> New project
        </button>
        <nav>
          <button className={page === "dashboard" ? "nav-link active" : "nav-link"} onClick={() => setPage("dashboard")}>
            <LayoutDashboard size={18} /> Dashboard
          </button>
          <button
            className={page === "workspace" ? "nav-link active" : "nav-link"}
            onClick={() => setPage("workspace")}
          >
            <FolderKanban size={18} /> Research workspace
          </button>
        </nav>
        <div className="help-card">
          <Sparkles size={20} />
          <strong>AI-powered discovery</strong>
          <span>Turn scattered papers into clear research directions.</span>
        </div>
        <button className="nav-link" onClick={logout}><LogOut size={18} /> Sign out</button>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="search-box">
            <Search size={18} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search projects..." />
          </div>
          <button className="primary-button mobile-only" onClick={() => setShowModal(true)}>
            <Plus size={16} /> New
          </button>
          <div className="profile">
            <div className="avatar">{name.slice(0, 2).toUpperCase()}</div>
            <div><strong>{name}</strong><span>{user.email}</span></div>
            <button className="icon-button" onClick={logout} aria-label="Sign out" title="Sign out"><LogOut size={17} /></button>
          </div>
        </header>

        {notice && (
          <div className="notice">
            <span>{notice}</span>
            <button onClick={() => setNotice("")} aria-label="Dismiss"><X size={16} /></button>
          </div>
        )}

        {page === "dashboard" && (
          <Dashboard
            name={name}
            projects={visible}
            allProjects={projects}
            onCreate={() => setShowModal(true)}
            onOpen={(p) => { setSelectedId(p.id); setPage("workspace"); }}
            onDelete={deleteProject}
          />
        )}

        {page === "workspace" && (selectedId ? (
          <Workspace
            key={selectedId}
            projectId={selectedId}
            onBack={() => setPage("dashboard")}
            refreshProjects={loadProjects}
            setNotice={setNotice}
          />
        ) : (
          <section className="page">
            <div className="empty-state">
              <div className="empty-icon"><FolderKanban size={28} /></div>
              <h2>Select a project</h2>
              <p>Open a project from your dashboard to begin.</p>
              <button className="primary-button" onClick={() => setPage("dashboard")}>Go to dashboard</button>
            </div>
          </section>
        ))}
      </main>

      {showModal && (
        <ProjectModal
          form={form}
          setForm={setForm}
          onSubmit={createProject}
          onClose={() => setShowModal(false)}
          loading={creating}
        />
      )}
    </div>
  );
}

/* ============================ Dashboard ============================ */
function Dashboard({ name, projects, allProjects, onCreate, onOpen, onDelete }) {
  const sum = (key) => allProjects.reduce((t, p) => t + (p[key] || 0), 0);
  return (
    <section className="page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">OVERVIEW</span>
          <h1>{greeting()}, {name.split(" ")[0]}.</h1>
          <p>Organize your literature and discover what comes next.</p>
        </div>
        <button className="primary-button" onClick={onCreate}><Plus size={18} /> Create project</button>
      </div>

      <div className="stat-grid">
        <Stat icon={<FolderKanban />} label="Projects" value={allProjects.length} color="purple" />
        <Stat icon={<FileText />} label="Uploaded papers" value={sum("paperCount")} color="blue" />
        <Stat icon={<Activity />} label="Analyses ready" value={sum("analysisCount")} color="green" />
        <Stat icon={<Lightbulb />} label="Research gaps found" value={sum("gapCount")} color="orange" />
      </div>

      <div className="section-heading">
        <div><h2>Your research projects</h2><p>Continue where you left off.</p></div>
      </div>

      {projects.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon"><FolderKanban size={28} /></div>
          <h3>{allProjects.length ? "No matching projects" : "No projects yet"}</h3>
          <p>Create a project, then upload a research paper.</p>
          <button className="primary-button" onClick={onCreate}><Plus size={18} /> Create your first project</button>
        </div>
      ) : (
        <div className="project-grid">
          {projects.map((p) => (
            <article className="project-card" key={p.id}>
              <div className="card-top">
                <div className="project-icon"><BookOpen size={20} /></div>
                <button className="icon-button danger" onClick={() => onDelete(p.id)} aria-label="Delete project">
                  <Trash2 size={16} />
                </button>
              </div>
              <span className="project-domain">{p.domain}</span>
              <h3>{p.title}</h3>
              <p>{p.objective || "No objective added yet."}</p>
              <div className="card-footer">
                <span><FileText size={15} /> {p.paperCount} papers</span>
                <button className="text-button" onClick={() => onOpen(p)}>Open <ChevronRight size={16} /></button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function Stat({ icon, label, value, color }) {
  return (
    <div className="stat-card">
      <div className={`stat-icon ${color}`}>{icon}</div>
      <div><span>{label}</span><strong>{value}</strong></div>
    </div>
  );
}

/* ============================ Workspace ============================ */
function Workspace({ projectId, onBack, refreshProjects, setNotice }) {
  const [details, setDetails] = useState(null);
  const [tab, setTab] = useState("overview");
  const [busy, setBusy] = useState({});
  const fileInput = useRef(null);

  const setBusyKey = (key, value) => setBusy((b) => ({ ...b, [key]: value }));

  const load = useCallback(async () => {
    try {
      const { data } = await api.get(`/projects/${projectId}`);
      setDetails(data.data);
    } catch (e) {
      setNotice(errMsg(e, "Could not load project."));
    }
  }, [projectId, setNotice]);

  useEffect(() => { load(); }, [load]);

  if (!details) {
    return <section className="page"><p className="muted">Loading project…</p></section>;
  }

  const { project, papers, analyses, messages } = details;
  const analysisFor = (paperId) => analyses.find((a) => a.paperId === paperId);
  const readyPapers = papers.filter((p) => p.status === "ready");

  async function uploadFiles(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    const bad = files.find((f) => f.type !== "application/pdf" && !f.name.toLowerCase().endsWith(".pdf"));
    if (bad) return setNotice(`"${bad.name}" is not a PDF.`);
    if (files.some((f) => f.size > 15 * 1024 * 1024)) return setNotice("Each PDF must be 15 MB or smaller.");
    if (files.length > 5) return setNotice("You can upload up to 5 PDFs at a time.");

    const formData = new FormData();
    files.forEach((f) => formData.append("papers", f));
    try {
      setBusyKey("upload", true);
      setNotice("Uploading and extracting text…");
      const { data } = await api.post(`/projects/${projectId}/papers`, formData);
      const failed = data.data.filter((p) => p.status === "failed");
      setNotice(failed.length ? `${failed.length} file(s) could not be read: ${failed[0].error}` : "Upload complete.");
      await load();
      refreshProjects();
    } catch (e) {
      setNotice(errMsg(e, "Upload failed."));
    } finally {
      setBusyKey("upload", false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function analyze(paperId) {
    try {
      setBusyKey(paperId, true);
      await api.post(`/papers/${paperId}/analyze`);
      await load();
      refreshProjects();
      return true;
    } catch (e) {
      setNotice(errMsg(e, "Analysis failed."));
      return false;
    } finally {
      setBusyKey(paperId, false);
    }
  }

  async function analyzeAll() {
    const todo = readyPapers.filter((p) => !analysisFor(p.id));
    if (!todo.length) return setNotice("All papers are already analysed.");
    setNotice(`Analysing ${todo.length} paper(s)…`);
    for (const paper of todo) {
      if (!(await analyze(paper.id))) return;
    }
    setNotice("Analysis complete.");
  }

  async function removePaper(paperId) {
    if (!window.confirm("Delete this paper and its analysis?")) return;
    try {
      await api.delete(`/papers/${paperId}`);
      await load();
      refreshProjects();
    } catch (e) {
      setNotice(errMsg(e, "Could not delete paper."));
    }
  }

  async function generateGaps() {
    try {
      setBusyKey("gaps", true);
      setNotice("Finding research gaps…");
      await api.post(`/projects/${projectId}/gaps`);
      await load();
      refreshProjects();
      setTab("gaps");
      setNotice("Research gaps generated. Verify them against the original papers.");
    } catch (e) {
      setNotice(errMsg(e, "Could not generate gaps."));
    } finally {
      setBusyKey("gaps", false);
    }
  }

  function exportReport() {
    const lines = [`# ${project.title}`, `Domain: ${project.domain}`, `Objective: ${project.objective || "—"}`, ""];
    lines.push("> AI-generated content. Verify every claim against the original papers.", "", "## Paper summaries", "");
    analyses.forEach((a) => {
      const paper = papers.find((p) => p.id === a.paperId);
      const r = a.result;
      lines.push(`### ${r.title} (${paper?.fileName || "paper"})`);
      lines.push(`- **Problem:** ${asText(r.researchProblem)}`, `- **Methodology:** ${asText(r.methodology)}`);
      lines.push(`- **Dataset:** ${asText(r.dataset)}`, `- **Findings:** ${asText(r.keyFindings)}`);
      lines.push(`- **Limitations:** ${asText(r.limitations)}`, `- **Future work:** ${asText(r.futureWork)}`, "");
    });
    lines.push("## Research gaps", "");
    (project.gaps || []).forEach((g, i) => {
      lines.push(`### ${i + 1}. ${g.title} (${g.label}, ${g.confidence} confidence)`, g.explanation, "");
      lines.push(`- **Supporting papers:** ${asText(g.supportingPapers)}`, `- **Why it matters:** ${g.whyItMatters}`);
      lines.push(`- **Possible direction:** ${g.possibleProjectDirection}`, "");
    });
    const blob = new Blob([lines.join("\n")], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${project.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "report"}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const tabs = [
    ["overview", "Overview"],
    ["papers", `Papers (${papers.length})`],
    ["summaries", `Summaries (${analyses.length})`],
    ["compare", "Compare"],
    ["gaps", `Research gaps (${(project.gaps || []).length})`],
    ["chat", "Research chat"]
  ];

  return (
    <section className="page">
      <div className="workspace-heading">
        <div>
          <button className="back-button" onClick={onBack}><ArrowLeft size={14} /> All projects</button>
          <span className="eyebrow">{project.domain}</span>
          <h1>{project.title}</h1>
          <p>{project.objective || "No research objective added."}</p>
        </div>
        <div className="heading-actions">
          <button className="secondary-button" onClick={exportReport} disabled={!analyses.length}>
            <Download size={16} /> Export report
          </button>
          <button className="primary-button" onClick={generateGaps} disabled={busy.gaps || !analyses.length}>
            <Sparkles size={18} /> {busy.gaps ? "Analysing…" : "Find research gaps"}
          </button>
        </div>
      </div>

      <div className="tabs">
        {tabs.map(([id, label]) => (
          <button key={id} className={tab === id ? "tab active" : "tab"} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>

      <input
        ref={fileInput}
        type="file"
        accept="application/pdf"
        multiple
        hidden
        onChange={(e) => uploadFiles(e.target.files)}
      />

      {tab === "overview" && (
        <>
          <div className="workspace-grid">
            <Dropzone busy={busy.upload} onBrowse={() => fileInput.current?.click()} onDropFiles={uploadFiles} />
            <div className="panel">
              <span className="eyebrow">PROJECT PROGRESS</span>
              <h2>Research pipeline</h2>
              <Step label="Project created" done />
              <Step label="Papers uploaded" done={readyPapers.length > 0} />
              <Step label="Papers analysed" done={analyses.length > 0} />
              <Step label="Research gaps found" done={(project.gaps || []).length > 0} />
            </div>
          </div>
          <div className="section-heading spaced">
            <div><h2>Papers</h2><p>Analyse each paper to create a structured summary.</p></div>
            {readyPapers.length > 0 && (
              <button className="secondary-button" onClick={analyzeAll}><Sparkles size={16} /> Analyse all</button>
            )}
          </div>
          <PaperList papers={papers} analysisFor={analysisFor} busy={busy} onAnalyze={analyze} onDelete={removePaper} />
        </>
      )}

      {tab === "papers" && (
        <>
          <div className="section-heading">
            <div><h2>Uploaded papers</h2><p>PDFs only, up to 15 MB each, 5 per upload.</p></div>
            <div className="heading-actions">
              {readyPapers.length > 0 && (
                <button className="secondary-button" onClick={analyzeAll}><Sparkles size={16} /> Analyse all</button>
              )}
              <button className="primary-button" onClick={() => fileInput.current?.click()} disabled={busy.upload}>
                <Upload size={17} /> {busy.upload ? "Uploading…" : "Upload papers"}
              </button>
            </div>
          </div>
          <PaperList papers={papers} analysisFor={analysisFor} busy={busy} onAnalyze={analyze} onDelete={removePaper} />
        </>
      )}

      {tab === "summaries" && <Summaries analyses={analyses} papers={papers} />}
      {tab === "compare" && <Compare analyses={analyses} papers={papers} />}
      {tab === "gaps" && <Gaps gaps={project.gaps || []} />}
      {tab === "chat" && (
        <Chat projectId={projectId} initial={messages} hasPapers={readyPapers.length > 0} setNotice={setNotice} />
      )}
    </section>
  );
}

function Dropzone({ busy, onBrowse, onDropFiles }) {
  const [over, setOver] = useState(false);
  return (
    <div
      className={over ? "panel dropzone over" : "panel dropzone"}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); onDropFiles(e.dataTransfer.files); }}
    >
      <div className="panel-icon"><Upload size={22} /></div>
      <h2>Upload research papers</h2>
      <p>Drag and drop PDFs here, or browse. Text is extracted automatically.</p>
      <button className="primary-button" onClick={onBrowse} disabled={busy}>
        <Upload size={17} /> {busy ? "Uploading…" : "Browse files"}
      </button>
      <small>PDF only · max 15 MB each · scanned PDFs are not supported yet</small>
    </div>
  );
}

function Step({ label, done }) {
  return (
    <div className="pipeline-step">
      <div className={done ? "step-dot done" : "step-dot"}>{done && "✓"}</div>
      <span>{label}</span>
    </div>
  );
}

function PaperList({ papers, analysisFor, busy, onAnalyze, onDelete }) {
  if (!papers.length) {
    return (
      <div className="empty-state small">
        <FileText size={26} />
        <h3>No papers uploaded</h3>
        <p>Upload a PDF to begin your literature analysis.</p>
      </div>
    );
  }
  return (
    <div className="paper-list">
      {papers.map((paper) => {
        const analysed = Boolean(analysisFor(paper.id));
        const failed = paper.status === "failed";
        return (
          <div className="paper-row" key={paper.id}>
            <div className="paper-file-icon"><FileText size={21} /></div>
            <div className="paper-info">
              <strong title={paper.fileName}>{paper.fileName}</strong>
              <span>
                {failed
                  ? paper.error
                  : `${paper.pageCount} pages · ${paper.textLength.toLocaleString()} characters extracted`}
              </span>
            </div>
            <span className={`status-badge ${failed ? "red" : analysed ? "green" : "yellow"}`}>
              {failed ? "Failed" : analysed ? "Analysed" : "Ready"}
            </span>
            {!failed && (
              <button className="secondary-button" onClick={() => onAnalyze(paper.id)} disabled={busy[paper.id]}>
                <Sparkles size={16} /> {busy[paper.id] ? "Analysing…" : analysed ? "Re-analyse" : "Analyse"}
              </button>
            )}
            <button className="icon-button danger" onClick={() => onDelete(paper.id)} aria-label="Delete paper">
              <Trash2 size={16} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

function Verify() {
  return (
    <div className="verify">
      AI-generated content can contain mistakes. Verify every result against the original papers.
    </div>
  );
}

function Summaries({ analyses, papers }) {
  if (!analyses.length) {
    return (
      <div className="empty-state">
        <Sparkles size={28} />
        <h3>No summaries yet</h3>
        <p>Open the Papers tab and analyse an uploaded paper.</p>
      </div>
    );
  }
  const blocks = [
    ["Research problem", "researchProblem"], ["Objectives", "objectives"], ["Methodology", "methodology"],
    ["Dataset", "dataset"], ["Evaluation metrics", "evaluationMetrics"], ["Key findings", "keyFindings"],
    ["Limitations", "limitations"], ["Future work", "futureWork"]
  ];
  return (
    <>
      <Verify />
      <div className="summary-list">
        {analyses.map((a) => {
          const paper = papers.find((p) => p.id === a.paperId);
          return (
            <article className="card" key={a.id}>
              <span className="eyebrow">{a.demo ? "DEMO SUMMARY" : "AI SUMMARY"}</span>
              <h2>{a.result.title || paper?.fileName}</h2>
              <p className="muted">{paper?.fileName}</p>
              {blocks.map(([title, key]) => {
                const value = a.result[key];
                const items = Array.isArray(value) ? value : [value];
                if (!items.filter(Boolean).length) return null;
                return (
                  <div className="summary-block" key={key}>
                    <h3>{title}</h3>
                    {items.length > 1 ? <ul>{items.map((t, i) => <li key={i}>{t}</li>)}</ul> : <p>{items[0]}</p>}
                  </div>
                );
              })}
              {a.result.keywords?.length > 0 && (
                <div className="chips">{a.result.keywords.map((k) => <span key={k} className="chip">{k}</span>)}</div>
              )}
            </article>
          );
        })}
      </div>
    </>
  );
}

function Compare({ analyses, papers }) {
  if (analyses.length < 2) {
    return (
      <div className="empty-state">
        <FileText size={28} />
        <h3>Analyse at least two papers</h3>
        <p>The comparison table appears once two or more papers have summaries.</p>
      </div>
    );
  }
  return (
    <>
      <Verify />
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Paper</th><th>Problem</th><th>Method</th><th>Dataset</th><th>Findings</th><th>Limitations</th></tr>
          </thead>
          <tbody>
            {analyses.map((a) => {
              const paper = papers.find((p) => p.id === a.paperId);
              const r = a.result;
              return (
                <tr key={a.id}>
                  <td><strong>{r.title || paper?.fileName}</strong></td>
                  <td>{asText(r.researchProblem)}</td>
                  <td>{asText(r.methodology)}</td>
                  <td>{asText(r.dataset)}</td>
                  <td>{asText(r.keyFindings)}</td>
                  <td>{asText(r.limitations)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Gaps({ gaps }) {
  if (!gaps.length) {
    return (
      <div className="empty-state">
        <Lightbulb size={28} />
        <h3>Research gaps will appear here</h3>
        <p>Analyse your papers, then click “Find research gaps”.</p>
      </div>
    );
  }
  return (
    <>
      <div className="verify">
        These gaps are AI suggestions, not proof of academic novelty. Check them against the original papers and
        current scholarly databases before using them.
      </div>
      <div className="gap-grid">
        {gaps.map((g, i) => (
          <article className="card gap-card" key={`${g.title}-${i}`}>
            <div className="gap-number">{String(i + 1).padStart(2, "0")}</div>
            <div className="chips">
              <span className="chip purple">{g.label}</span>
              <span className={`chip ${g.confidence}`}>{g.confidence} confidence</span>
            </div>
            <h2>{g.title}</h2>
            <p>{g.explanation}</p>
            <h4>Why it matters</h4>
            <p>{g.whyItMatters}</p>
            <h4>Possible direction</h4>
            <p>{g.possibleProjectDirection}</p>
            <h4>Supporting papers</h4>
            {g.supportingPapers?.length
              ? g.supportingPapers.map((p) => <p className="evidence" key={p}>{p}</p>)
              : <p className="muted">None cited.</p>}
          </article>
        ))}
      </div>
    </>
  );
}

function Chat({ projectId, initial, hasPapers, setNotice }) {
  const [messages, setMessages] = useState(initial);
  const [question, setQuestion] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, sending]);

  async function ask(event) {
    event.preventDefault();
    const text = question.trim();
    if (!text || sending) return;
    setQuestion("");
    setMessages((m) => [...m, { id: `u-${Date.now()}`, role: "user", content: text, citations: [] }]);
    try {
      setSending(true);
      const { data } = await api.post(`/projects/${projectId}/chat`, { question: text });
      setMessages((m) => [...m, data.data]);
    } catch (e) {
      setNotice(errMsg(e, "Chat failed."));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="card chat-panel">
      <div className="chat-header">
        <div className="panel-icon"><MessageSquare size={20} /></div>
        <div><h2>Research assistant</h2><p>Answers are based on your uploaded papers.</p></div>
      </div>
      <div className="messages">
        {messages.length === 0 && (
          <div className="message assistant">
            {hasPapers
              ? "Ask me anything about your papers, for example: “Which limitations repeat most often?”"
              : "Upload a paper first, then ask questions about it."}
          </div>
        )}
        {messages.map((m) => (
          <div className={`message ${m.role}`} key={m.id}>
            {m.content}
            {m.citations?.length > 0 && (
              <div className="citations">Sources: {m.citations.join(", ")}</div>
            )}
          </div>
        ))}
        {sending && <div className="message assistant">Thinking…</div>}
        <div ref={endRef} />
      </div>
      <form className="chat-form" onSubmit={ask}>
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask something about your papers…"
          maxLength={1000}
          disabled={!hasPapers}
        />
        <button className="primary-button" disabled={!hasPapers || sending}>Send</button>
      </form>
    </div>
  );
}

/* ============================== Modal ============================== */
function ProjectModal({ form, setForm, onSubmit, onClose, loading }) {
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-heading">
          <div><span className="eyebrow">NEW WORKSPACE</span><h2>Create research project</h2></div>
          <button className="icon-button" onClick={onClose} aria-label="Close"><X size={19} /></button>
        </div>
        <form onSubmit={onSubmit}>
          <label>Project title
            <input value={form.title} onChange={set("title")} placeholder="e.g. AI-based crop disease detection" autoFocus />
          </label>
          <label>Research domain
            <input value={form.domain} onChange={set("domain")} placeholder="e.g. Artificial Intelligence" />
          </label>
          <label>Research objective
            <textarea value={form.objective} onChange={set("objective")} rows="4" placeholder="What do you want to investigate?" />
          </label>
          <label>Keywords
            <input value={form.keywords} onChange={set("keywords")} placeholder="CNN, agriculture, computer vision" />
            <small>Separate keywords with commas.</small>
          </label>
          <div className="modal-actions">
            <button type="button" className="secondary-button" onClick={onClose}>Cancel</button>
            <button className="primary-button" disabled={loading}>{loading ? "Creating…" : "Create project"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
