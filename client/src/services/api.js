import axios from "axios";
import { auth } from "./firebase";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:5000/api",
  timeout: 120000
});

// Attach the signed-in user's Firebase ID token to every request.
api.interceptors.request.use(async (config) => {
  const user = auth?.currentUser;
  if (user) {
    config.headers.Authorization = `Bearer ${await user.getIdToken()}`;
  }
  return config;
});

export function errMsg(error, fallback) {
  if (error.response?.data?.message) return error.response.data.message;
  if (error.code === "ERR_NETWORK") return "Cannot reach the server. Is the backend running on port 5000?";
  return error.message || fallback;
}

export default api;
