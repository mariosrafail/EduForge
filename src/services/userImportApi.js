async function requestImport(action, rows) {
  const response = await fetch(`/.netlify/functions/user-import?action=${action}`, {
    method: "POST",
    credentials: "include",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rows }),
  });
  let payload = {};
  try {
    payload = await response.json();
  } catch {
    payload = {};
  }
  if (!response.ok) {
    const error = new Error(payload.error || "User import request failed");
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

export function previewUserImport(rows) {
  return requestImport("preview", rows);
}

export function commitUserImport(rows) {
  return requestImport("commit", rows);
}
