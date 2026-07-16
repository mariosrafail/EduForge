async function request(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const text = await response.text();
  let payload = {};
  try { payload = text ? JSON.parse(text) : {}; } catch { payload = {}; }
  if (!response.ok) {
    const error = new Error(payload.error || text || "Book licensing request failed");
    error.status = response.status;
    throw error;
  }
  return payload;
}

export function getLicensingOverview() {
  return request("/.netlify/functions/book-licensing?action=overview");
}

export function getLicensingBatch(batchId) {
  return request(`/.netlify/functions/book-licensing?action=batch&batchId=${encodeURIComponent(batchId)}`);
}

export function generateLicensingBatch(input) {
  return request("/.netlify/functions/book-licensing?action=generate-batch", { method: "POST", body: JSON.stringify(input) });
}

export function revokeUnusedLicenses(batchId, reason = "Unused licenses revoked by school administrator") {
  return request("/.netlify/functions/book-licensing?action=revoke-unused", { method: "POST", body: JSON.stringify({ batchId, reason }) });
}

export function resetRedeemedLicense(codeId) {
  return request("/.netlify/functions/book-licensing?action=reset-code", { method: "POST", body: JSON.stringify({ codeId }) });
}

export function redeemBookLicense(code) {
  return request("/.netlify/functions/book-licensing?action=redeem", { method: "POST", body: JSON.stringify({ code }) });
}

export function downloadLicensingCsv(csv, filename = "book-access-codes.csv") {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
