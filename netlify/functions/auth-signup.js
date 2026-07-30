import { json } from "./_auth-utils.js";

const noStore = { "Cache-Control": "no-store" };

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: { "Content-Type": "application/json", ...noStore }, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed" }, noStore);
  }

  return json(403, { error: "School account creation is invitation-only" }, noStore);
}
