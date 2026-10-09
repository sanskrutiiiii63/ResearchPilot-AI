import { useState } from "react";
import { BrainCircuit, Lightbulb, MessageSquare, Sparkles } from "lucide-react";
import { friendlyAuthError, useAuth } from "../context/AuthContext";

const emailOk = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

export default function AuthPage() {
  const { login, register, google, resetPassword } = useAuth();
  const [mode, setMode] = useState("login"); // login | register | reset
  const [form, setForm] = useState({ name: "", email: "", password: "", confirm: "" });
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });
  const switchMode = (next) => { setMode(next); setError(""); setInfo(""); };

  function validate() {
    if (mode === "register" && form.name.trim().length < 2) return "Please enter your full name.";
    if (!emailOk(form.email.trim())) return "Please enter a valid email address.";
    if (mode === "reset") return "";
    if (form.password.length < 6) return "Password must be at least 6 characters.";
    if (mode === "register" && form.password !== form.confirm) return "Passwords do not match.";
    return "";
  }

  async function run(action) {
    setError(""); setInfo("");
    try {
      setBusy(true);
      await action();
    } catch (e) {
      setError(friendlyAuthError(e));
    } finally {
      setBusy(false);
    }
  }

  function submit(event) {
    event.preventDefault();
    const problem = validate();
    if (problem) return setError(problem);
    const email = form.email.trim();
    if (mode === "login") return run(() => login(email, form.password));
    if (mode === "register") return run(() => register(form.name.trim(), email, form.password));
    return run(async () => {
      await resetPassword(email);
      setInfo("If an account exists for this email, a reset link has been sent.");
    });
  }

  const titles = {
    login: ["Welcome back", "Sign in to continue your research."],
    register: ["Create your account", "Start turning papers into project ideas."],
    reset: ["Reset your password", "We will email you a reset link."]
  };

  return (
    <div className="auth-shell">
      <section className="auth-hero">
        <div className="brand">
          <div className="brand-mark"><BrainCircuit size={23} /></div>
          <div><strong>ResearchPilot</strong><span>AI research workspace</span></div>
        </div>
        <h1>Turn research papers into meaningful project ideas.</h1>
        <p>Upload papers, get structured summaries, discover research gaps and ask questions about your literature.</p>
        <ul>
          <li><Sparkles size={18} /> Structured paper summaries</li>
          <li><Lightbulb size={18} /> Evidence-based research gaps</li>
          <li><MessageSquare size={18} /> Chat with your papers</li>
        </ul>
      </section>

      <section className="auth-card-wrap">
        <form className="auth-card" onSubmit={submit} noValidate>
          <h2>{titles[mode][0]}</h2>
          <p className="muted">{titles[mode][1]}</p>

          {error && <div className="auth-error" role="alert">{error}</div>}
          {info && <div className="auth-info">{info}</div>}

          {mode === "register" && (
            <label>Full name
              <input value={form.name} onChange={set("name")} autoComplete="name" placeholder="Your name" />
            </label>
          )}
          <label>Email
            <input type="email" value={form.email} onChange={set("email")} autoComplete="email" placeholder="you@example.com" />
          </label>
          {mode !== "reset" && (
            <label>Password
              <input
                type="password" value={form.password} onChange={set("password")}
                autoComplete={mode === "login" ? "current-password" : "new-password"} placeholder="At least 6 characters"
              />
            </label>
          )}
          {mode === "register" && (
            <label>Confirm password
              <input type="password" value={form.confirm} onChange={set("confirm")} autoComplete="new-password" placeholder="Repeat password" />
            </label>
          )}

          {mode === "login" && (
            <button type="button" className="link-button" onClick={() => switchMode("reset")}>Forgot password?</button>
          )}

          <button className="primary-button wide" disabled={busy}>
            {busy ? "Please wait…" : mode === "login" ? "Sign in" : mode === "register" ? "Create account" : "Send reset link"}
          </button>

          {mode !== "reset" && (
            <>
              <div className="divider"><span>or</span></div>
              <button type="button" className="secondary-button wide google" disabled={busy} onClick={() => run(google)}>
                Continue with Google
              </button>
            </>
          )}

          <p className="switch">
            {mode === "login" ? (
              <>New here? <button type="button" className="link-button" onClick={() => switchMode("register")}>Create an account</button></>
            ) : (
              <>Back to <button type="button" className="link-button" onClick={() => switchMode("login")}>sign in</button></>
            )}
          </p>
        </form>
      </section>
    </div>
  );
}
