import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "../data");
const file = path.join(dir, "db.json");
fs.mkdirSync(dir, { recursive: true });

// Simple JSON-file persistence so data survives server restarts.
// Replace with Firestore when you add authentication.
const db = { projects: [], papers: [], analyses: [], messages: [] };

try {
  if (fs.existsSync(file)) Object.assign(db, JSON.parse(fs.readFileSync(file, "utf8")));
} catch {
  console.warn("data/db.json could not be read. Starting with an empty database.");
}

let timer = null;
export function save() {
  clearTimeout(timer);
  timer = setTimeout(() => fs.writeFile(file, JSON.stringify(db), () => {}), 200);
}

export default db;
