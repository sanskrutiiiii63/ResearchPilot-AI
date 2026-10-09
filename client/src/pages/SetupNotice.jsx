export default function SetupNotice() {
  return (
    <div className="auth-shell single">
      <div className="auth-card">
        <h2>Firebase is not configured</h2>
        <p className="muted">
          Add your Firebase web app settings to <code>client/.env</code>, then restart <code>npm run dev</code>.
        </p>
        <pre>{`VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_APP_ID=...`}</pre>
        <p className="muted">Find these in Firebase console → Project settings → Your apps → Web app. See README.md.</p>
      </div>
    </div>
  );
}
