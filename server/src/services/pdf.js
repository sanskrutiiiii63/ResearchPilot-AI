// Import the inner file: the package entry point runs a debug routine
// that tries to read a test PDF and crashes under ES modules.
import pdfParse from "pdf-parse/lib/pdf-parse.js";

export async function extractPdf(buffer) {
  if (buffer.slice(0, 5).toString("latin1") !== "%PDF-") {
    throw new Error("File is not a valid PDF.");
  }
  const result = await pdfParse(buffer);
  const text = (result.text || "")
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { text, pages: result.numpages || 0 };
}
