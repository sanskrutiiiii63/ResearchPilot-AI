import { createContext, useContext, useEffect, useState } from "react";
import {
  createUserWithEmailAndPassword, onAuthStateChanged, sendPasswordResetEmail,
  signInWithEmailAndPassword, signInWithPopup, signOut, updateProfile
} from "firebase/auth";
import { auth, googleProvider } from "../services/firebase";

const AuthContext = createContext(null);

export function friendlyAuthError(error) {
  const messages = {
    "auth/invalid-credential": "Incorrect email or password.",
    "auth/wrong-password": "Incorrect email or password.",
    "auth/user-not-found": "Incorrect email or password.",
    "auth/invalid-email": "Please enter a valid email address.",
    "auth/email-already-in-use": "An account with this email already exists. Try signing in.",
    "auth/weak-password": "Password must be at least 6 characters.",
    "auth/too-many-requests": "Too many attempts. Please wait a few minutes and try again.",
    "auth/network-request-failed": "Network error. Check your internet connection.",
    "auth/popup-closed-by-user": "The Google sign-in window was closed before finishing.",
    "auth/popup-blocked": "Your browser blocked the Google sign-in popup. Allow popups and try again.",
    "auth/operation-not-allowed": "This sign-in method is not enabled in the Firebase console yet."
  };
  return messages[error.code] || error.message || "Something went wrong. Please try again.";
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(auth));
  const [, refresh] = useState(0); // re-render after the display name changes

  useEffect(() => {
    if (!auth) return undefined;
    return onAuthStateChanged(auth, (current) => {
      setUser(current);
      setLoading(false);
    });
  }, []);

  const value = {
    user,
    loading,
    name: user?.displayName || user?.email?.split("@")[0] || "Researcher",
    login: (email, password) => signInWithEmailAndPassword(auth, email, password),
    google: () => signInWithPopup(auth, googleProvider),
    resetPassword: (email) => sendPasswordResetEmail(auth, email),
    logout: () => signOut(auth),
    async register(name, email, password) {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(cred.user, { displayName: name });
      refresh((n) => n + 1);
    }
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
