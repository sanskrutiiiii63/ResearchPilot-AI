import admin from "firebase-admin";
import fs from "fs";
import path from "path";

function loadCredential() {
  const file = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (file) {
    const full = path.resolve(file);
    if (!fs.existsSync(full)) throw new Error(`Service account file not found: ${full}`);
    return admin.credential.cert(JSON.parse(fs.readFileSync(full, "utf8")));
  }
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n").replace(/^"|"$/g, "");
  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "Firebase is not configured. Set FIREBASE_SERVICE_ACCOUNT_PATH (or FIREBASE_PROJECT_ID, " +
        "FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY) in server/.env. See README.md."
    );
  }
  return admin.credential.cert({ projectId, clientEmail, privateKey });
}

try {
  if (!admin.apps.length) admin.initializeApp({ credential: loadCredential() });
} catch (error) {
  console.error("\nFirebase setup problem:", error.message, "\n");
  process.exit(1);
}

export const auth = admin.auth();
export const firestore = admin.firestore();
firestore.settings({ ignoreUndefinedProperties: true });
