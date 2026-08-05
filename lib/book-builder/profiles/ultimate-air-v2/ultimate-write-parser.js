import { nestedCandidateId } from "./activity-candidate-contract.js";
import { collectNamed, geometry, parseActivityXml, plainText } from "./activity-xml.js";

export function parseWriteResponses({ xml, activityCandidateId, sourceRelativePath, sourceSha256, provenAlternativeDelimiter = null }) {
  const fields = collectNamed(parseActivityXml(xml), "text"); const responseFields = []; const solutions = []; const issues = [];
  fields.forEach((field, index) => {
    const responseFieldId = nestedCandidateId("response", activityCandidateId, field?.["@_id"] ?? `text-${index + 1}`); const prompt = plainText(field);
    responseFields.push({ id: responseFieldId, publisherId: field?.["@_id"] === undefined ? null : String(field["@_id"]), prompt, promptAvailability: prompt ? "structured" : "raster-only-or-missing", inputModeCandidate: "text", geometry: geometry(field) });
    if (!prompt) issues.push({ reasonCode: "raster_prompt_missing", responseFieldId, sourceRelativePath });
    if (field?.["@_answers"] === undefined || String(field["@_answers"]) === "") return;
    const raw = String(field["@_answers"]); const ambiguousDelimiter = !provenAlternativeDelimiter && /[|,;]/.test(raw);
    const acceptedValues = provenAlternativeDelimiter && raw.includes(provenAlternativeDelimiter) ? raw.split(provenAlternativeDelimiter) : [raw];
    solutions.push({ responseFieldId, solutionType: "publisher-accepted-response", publisherRawValue: raw, acceptedValues, alternativeDelimiter: provenAlternativeDelimiter, confidence: ambiguousDelimiter ? 0.5 : 1, sourceEvidence: [{ sourceRelativePath, sourceSha256 }] });
    if (ambiguousDelimiter) issues.push({ reasonCode: "ambiguous_accepted_answer_delimiter", responseFieldId, sourceRelativePath, evidence: { delimiterPresent: true } });
  });
  return { responseFields, solutions, issues, summary: { responseFieldCount: responseFields.length, explicitAnswerCount: solutions.length, emptyAnswerCount: fields.filter((item) => item?.["@_answers"] !== undefined && String(item["@_answers"]) === "").length, provenAlternativeCount: solutions.filter((item) => item.alternativeDelimiter).reduce((sum, item) => sum + item.acceptedValues.length, 0), ambiguousDelimiterCount: issues.filter((item) => item.reasonCode === "ambiguous_accepted_answer_delimiter").length, structuredPromptCount: responseFields.filter((item) => item.promptAvailability === "structured").length } };
}
