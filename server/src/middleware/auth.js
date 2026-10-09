import { auth } from "../config/firebase.js";

// Verifies the Firebase ID token sent by the client and attaches req.user.
export async function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ success: false, message: "Please sign in to continue." });
  }
  try {
    const decoded = await auth.verifyIdToken(token);
    req.user = {
      uid: decoded.uid,
      email: decoded.email || "",
      name: decoded.name || "",
      picture: decoded.picture || ""
    };
    next();
  } catch {
    res.status(401).json({ success: false, message: "Your session expired. Please sign in again." });
  }
}
