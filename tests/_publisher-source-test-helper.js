import { existsSync } from "node:fs";

export const publisherSourceEvidenceSkipReason = "publisher source evidence not present in this checkout";

export function publisherSourceEvidenceOptions(sourcePath) {
  return { skip: existsSync(sourcePath) ? false : publisherSourceEvidenceSkipReason };
}
