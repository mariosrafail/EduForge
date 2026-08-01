const endpoint = "/.netlify/functions/school-adoption-report";
const fallbackFilename = "hamilton-house-adoption-report.csv";

async function errorFromResponse(response, fallback) {
  let payload = {};
  try { payload = await response.json(); } catch { payload = {}; }
  const error = new Error(payload.error || fallback);
  error.status = response.status;
  throw error;
}

export async function getSchoolAdoptionSummary() {
  const response = await fetch(`${endpoint}?action=summary`, { credentials: "include" });
  if (!response.ok) return errorFromResponse(response, "Adoption data could not be loaded");
  return response.json();
}

export function safeDownloadFilename(disposition) {
  const match = String(disposition || "").match(/filename="([^"]+)"/i);
  const candidate = match?.[1] || "";
  if (
    !/^hamilton-house-adoption-[a-z0-9-]+-\d{4}-\d{2}-\d{2}\.csv$/.test(candidate)
    || candidate.includes("..")
    || /[\\/\r\n]/.test(candidate)
  ) return fallbackFilename;
  return candidate;
}

export async function downloadSchoolAdoptionCsv({
  documentObject = document,
  urlObject = URL,
} = {}) {
  const response = await fetch(`${endpoint}?action=export`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  if (!response.ok) return errorFromResponse(response, "Adoption CSV could not be downloaded");
  const blob = await response.blob();
  const filename = safeDownloadFilename(response.headers.get("Content-Disposition"));
  const url = urlObject.createObjectURL(blob);
  const anchor = documentObject.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  documentObject.body.appendChild(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
    urlObject.revokeObjectURL(url);
  }
  return { filename };
}
