import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export const SYNTHETIC_TEACHER_SECRET = "HHPLMS_SYNTHETIC_TEACHER_SECRET_M4A_7D3C9F";

const previewPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mP8z8AARAwMjIxoAkwMAGcABfICmR0AAAAASUVORK5CYII=", "base64");

async function writeJson(target, value) {
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function reviewItem(index) {
  const reasonCode = index % 5 === 0 ? "raster_prompt_missing" : index % 3 === 0 ? "ambiguous_activity_type" : "unapproved_component_role";
  const category = reasonCode === "unapproved_component_role" ? "component" : "activity";
  return {
    id: `review_fictional_${String(index).padStart(5, "0")}`,
    reasonCode,
    category,
    severity: index % 11 === 0 ? "blocking" : "review",
    blocking: index % 11 === 0,
    explanation: `Fictional review item ${index} requires a future publisher decision.`,
    sourceRelativeLocator: `Fictional/Books/volume-one/course/${(index % 4) + 1}/part${(index % 8) + 1}/obj${(index % 12) + 1}`,
    dependencyFactIds: [`fact_fictional_${index % 25}`],
    suggestedDecisionKind: category === "activity" ? "future_activity_disposition" : "future_component_role",
    status: "unresolved",
    evidence: [],
  };
}

function baseProject(projectId, profileId, sourceLabel) {
  return {
    schemaVersion: "1.0",
    projectId,
    revision: 3,
    lifecycleStatus: "review_required",
    createdAt: "2026-01-02T10:00:00.000Z",
    updatedAt: "2026-01-04T12:00:00.000Z",
    sourceDescriptor: {
      label: sourceLabel,
      selectedOuterLabel: sourceLabel,
      kind: "air-application",
      applicationId: `fictional.${projectId}`,
      applicationName: sourceLabel,
      applicationVersion: "4.2",
      canonicalAppRelativePath: "Fictional/Application",
      descriptorPath: "META-INF/AIR/application.xml",
      mainSwfPath: "FictionalMain.swf",
    },
    sourceSnapshot: {
      scannedAt: "2026-01-04T12:00:00.000Z",
      fileCount: 42,
      totalBytes: 204800,
      publisherFileCount: 38,
      publisherBytes: 198400,
      deferredHashCount: 0,
      fingerprintKind: "synthetic",
      inventoryFingerprint: "a".repeat(64),
    },
    selectedProfile: {
      id: profileId,
      confidence: profileId === "ultimate-air-v2" ? 0.97 : 0.91,
      detectorVersion: "1.0",
      parserVersion: "1.0",
      matchedEvidence: ["fictional_evidence"],
      missingEvidence: [],
      conflictingEvidence: [],
      importSummary: {
        componentCandidates: profileId === "ultimate-air-v2" ? 2 : 0,
        pageSpreads: profileId === "ultimate-air-v2" ? 2 : 0,
        studentCandidateCount: profileId === "ultimate-air-v2" ? 152 : 0,
        reviewItems: profileId === "ultimate-air-v2" ? 5007 : 0,
        menuButtons: profileId === "ultimate-air-v2" ? 2 : 0,
      },
    },
    detectedFacts: Array.from({ length: 25 }, (_, index) => ({
      id: `fact_fictional_${index}`,
      kind: index % 2 ? "fictional.page" : "fictional.activity",
      confidence: 0.8,
      parserId: "synthetic-fixture",
      parserVersion: "1.0",
      sourceLocator: `Fictional/fact-${index}`,
      value: { synthetic: true },
      diagnostics: [],
      evidence: [],
      evidenceHash: createHash("sha256").update(String(index)).digest("hex"),
    })),
    approvedDecisions: [],
    publicationDraft: {},
    validationSummary: {
      authoringValid: true,
      authoringErrors: [],
      publicationValid: false,
      publicationErrors: ["Fictional publication metadata is incomplete."],
      warnings: ["Synthetic fixture only."],
    },
  };
}

async function createUltimateProject(workspace, sourceRoot) {
  const projectId = "fictional-ultimate-review";
  const projectRoot = path.join(workspace, "projects", projectId);
  const profileRoot = path.join(projectRoot, "profiles", "ultimate-air-v2");
  const sourcePreview = path.join(sourceRoot, "Fictional", "Pages", "page-one.png");
  await fs.mkdir(path.dirname(sourcePreview), { recursive: true });
  await fs.writeFile(sourcePreview, previewPng);
  const pageSha = createHash("sha256").update(previewPng).digest("hex");
  const project = baseProject(projectId, "ultimate-air-v2", "Fictional Ultimate Review Book");
  await writeJson(path.join(projectRoot, "book-project.json"), project);
  await writeJson(path.join(projectRoot, "local-source-binding.json"), {
    schemaVersion: "1.0", bindingId: "fictional-binding", projectId,
    selectedOuterPath: sourceRoot, selectedOuterRealPath: sourceRoot,
    canonicalApplicationRoot: sourceRoot, canonicalApplicationRealPath: sourceRoot,
    sourceKind: "air-application", createdAt: project.createdAt, lastScannedAt: project.updatedAt,
  });
  await writeJson(path.join(projectRoot, "structural-fingerprint.json"), {
    schemaVersion: "1.0", fingerprintKind: "synthetic", fingerprintSha256: "b".repeat(64),
    features: { hasBooksRoot: true, unitDirectoryCount: 4 },
  });
  const reviews = Array.from({ length: 5007 }, (_, index) => reviewItem(index + 1));
  await writeJson(path.join(projectRoot, "review-queue.json"), {
    schemaVersion: "1.0", parserId: "synthetic-review", parserVersion: "1.0", items: reviews,
    summary: {
      total: reviews.length,
      blocking: reviews.filter((item) => item.blocking).length,
      byCategory: { activity: reviews.filter((item) => item.category === "activity").length, component: reviews.filter((item) => item.category === "component").length },
      byReason: Object.fromEntries([...new Set(reviews.map((item) => item.reasonCode))].map((reason) => [reason, reviews.filter((item) => item.reasonCode === reason).length])),
    },
  });
  await writeJson(path.join(projectRoot, "rescan-diff.json"), {
    schemaVersion: "1.0", fromRevision: 2, toRevision: 3,
    added: ["fact_fictional_1", "fact_fictional_2"], changed: ["fact_fictional_3"], removed: ["fact_removed_fictional"], staleDecisions: ["decision_fictional_1"],
  });
  await writeJson(path.join(profileRoot, "structure-candidates.json"), {
    schemaVersion: "1.0", parserId: "synthetic-structure", parserVersion: "1.0",
    components: [
      { name: "course", sourceRelativePath: "Fictional/Books/volume-one/course", proposedSemanticRole: "students-book", roleConfidence: 0.94, unitCount: 4, partCount: 8, objectCount: 152, pageSpreadCount: 2, approvalStatus: "unapproved" },
      { name: "practice", sourceRelativePath: "Fictional/Books/volume-one/practice", proposedSemanticRole: "workbook", roleConfidence: 0.68, unitCount: 2, partCount: 4, objectCount: 0, pageSpreadCount: 0, approvalStatus: "unapproved" },
    ],
    summary: { componentCount: 2, unitCount: 6, partCount: 12, objectCount: 152 },
  });
  await writeJson(path.join(profileRoot, "page-candidates.json"), {
    schemaVersion: "1.0", parserId: "synthetic-pages", parserVersion: "1.0",
    spreads: [
      { component: "course", unit: 1, part: 1, canonicalQualityCandidate: "HD", printedPageCandidate: { numericCandidate: 12, confidence: 0.96, direct: true, rawLabels: ["12"] }, variants: [{ component: "course", unit: 1, part: 1, quality: "HD", width: 2, height: 2, byteSize: previewPng.length, sha256: pageSha, sourceRelativePath: "Fictional/Pages/page-one.png" }] },
      { component: "course", unit: 1, part: 2, canonicalQualityCandidate: null, printedPageCandidate: { numericCandidate: null, confidence: 0.2, direct: false, rawLabels: [] }, variants: [] },
    ],
    summary: { distinctSpreadCount: 2, pageImageFileCount: 1, hdCount: 1, sdCount: 0, specialCount: 0 },
  });
  await writeJson(path.join(profileRoot, "hotspot-candidates.json"), {
    schemaVersion: "1.0", parserId: "synthetic-hotspots", parserVersion: "1.0",
    parts: [{ component: "course", unit: 1, part: 1, exactCardinality: true, buttonCount: 1, objectDirectoryCount: 1, quadCount: 0, sourceRelativePath: "Fictional/Books/volume-one/course/1/part1/part_params.iwb", hotspots: [{ id: "hotspot_fictional_1", candidateTargetObject: 1, mappingConfidence: 0.9, normalizedGeometry: { x: 0.1, y: 0.2, width: 0.3, height: 0.25 }, reviewStatus: "unapproved" }], quads: [] }],
    summary: { normalizedCandidateCount: 1, exactCardinalityCount: 1, mismatchCount: 0 },
  });
  await writeJson(path.join(profileRoot, "menu-model.json"), {
    schemaVersion: "1.0", parserId: "synthetic-menu", parserVersion: "1.0", sourceRelativePath: "Fictional/Menu/home_params.iwb",
    buttons: [
      { id: "menu_fictional_1", name: "Unit 1", sourceRelativePath: "Fictional/Menu/unit-1", proposedDestination: { kind: "unit", component: "course", unit: 1 }, x: 40, y: 80, width: 120, height: 44, textureTriple: ["normal", "hover", "pressed"], confidence: 0.9 },
      { id: "menu_fictional_2", name: "Practice", sourceRelativePath: "Fictional/Menu/practice", proposedDestination: { kind: "component", component: "practice" }, x: 40, y: 140, width: 120, height: 44, textureTriple: ["normal"], confidence: 0.6 },
    ], summary: { buttonCount: 2 },
  });
  await writeJson(path.join(profileRoot, "branding-model.json"), {
    schemaVersion: "1.0", parserId: "synthetic-branding", parserVersion: "1.0", sourceRelativePath: "Fictional/Branding",
    menuTitleKind: "gaf-timeline", startupIntroIsSeparate: true,
    assets: [{ role: "publisher-logo", sourceRelativePath: "Fictional/Branding/publisher-logo.png", width: 320, height: 88, byteSize: 2048 }],
    movieClips: [{ name: "fictional-title", fps: 24, startFrame: 0, play: true, loop: true, x: 120, y: 90, scale: 1 }],
  });
  await writeJson(path.join(profileRoot, "gaf-model.json"), {
    schemaVersion: "1.0", parserId: "synthetic-gaf", parserVersion: "1.0", signature: "GAF", version: "4", stage: { width: 640, height: 360, fps: 24 }, timeline: { linkage: "fictional_title", frames: 48, frameRecords: 48, bounds: { x: 0, y: 0, width: 320, height: 120 }, objects: { count: 6 } },
  });
  await writeJson(path.join(profileRoot, "atlas-inventory.json"), {
    schemaVersion: "1.0", parserId: "synthetic-atlas", parserVersion: "1.0", atlases: [], summary: { familyCount: 2, regionCount: 14, invalidFamilyCount: 0 },
  });
  await writeJson(path.join(profileRoot, "media-candidates.json"), {
    schemaVersion: "1.0", parserId: "synthetic-media", parserVersion: "1.0", candidates: [], descriptors: [],
    intro: { distinctFromMenuTitle: true, descriptorPath: "Fictional/Media/intro.xml", mediaPath: "Fictional/Media/intro.flv", descriptor: { width: 640, height: 360, autoPlay: true } }, summary: { candidateCount: 1 },
  });
  const candidates = Array.from({ length: 152 }, (_, index) => ({
    schemaVersion: "1.0", activityCandidateId: `activity_fictional_${String(index + 1).padStart(3, "0")}`,
    componentCandidateId: "component:course", unit: (index % 4) + 1, part: (index % 8) + 1, object: (index % 12) + 1,
    sourceObjectLocator: `Fictional/Books/volume-one/course/${(index % 4) + 1}/part${(index % 8) + 1}/obj${(index % 12) + 1}`,
    normalizedCandidateType: index % 2 ? "multiple-choice" : "short-answer", publisherExerciseTypes: [index % 2 ? "mc" : "write"],
    disposition: index === 1 ? "structured-activity-with-raster-gaps" : "structured-activity-candidate",
    runtimeSupportStatus: "candidate-only", contentCompleteness: index === 1 ? "raster-gaps" : "structured",
    confidence: 0.9, questions: [{ id: `question_fictional_${index}`, prompt: `Fictional question ${index + 1}`, promptAvailability: "structured", responseKind: "single-option", options: [{ order: 1, text: "Fictional option amber", textAvailability: "structured" }, { order: 2, text: "Fictional option blue", textAvailability: "structured" }] }],
    draggables: [{ label: "Fictional draggable", geometry: { x: 1, y: 2, width: 3, height: 4 } }],
    targets: [{ label: "Fictional target", geometry: { x: 5, y: 6, width: 3, height: 4 } }],
    responseFields: [], mediaCandidateIds: index % 3 ? [] : ["Fictional/Media/audio.mp3"], hotspotCandidateIds: ["hotspot_fictional_1"],
    pageCandidateId: "course/1/part1", reviewItemIds: [`review_fictional_${String(index + 1).padStart(5, "0")}`],
    sourceEvidenceDigests: [{ sourceRelativePath: `Fictional/Evidence/activity-${index + 1}.iwb`, sourceSha256: createHash("sha256").update(`activity-${index + 1}`).digest("hex") }],
  }));
  await writeJson(path.join(profileRoot, "student-activity-candidates.json"), {
    schemaVersion: "1.0", parserId: "synthetic-activities", parserVersion: "1.0", audience: "student-safe", candidates,
    summary: { candidateCount: candidates.length, questionCount: candidates.length, optionCount: candidates.length * 2 },
  });
  await writeJson(path.join(profileRoot, "activity-clusters.json"), {
    schemaVersion: "1.0", parserId: "synthetic-clusters", parserVersion: "1.0",
    clusters: [{ structuralSignatureHash: "c".repeat(64), objectCount: 120, dispositions: { "structured-activity-candidate": 119, "structured-activity-with-raster-gaps": 1 }, examples: candidates.slice(0, 3).map((item) => item.sourceObjectLocator) }], summary: { clusterCount: 1, objectCount: 120 },
  });
  await writeJson(path.join(profileRoot, "activity-extraction-summary.json"), { schemaVersion: "1.0", parserId: "synthetic-summary", parserVersion: "1.0", studentCandidateCount: 152, reviewItemCount: 5007 });
  const materialized = path.join(profileRoot, "review-assets", "menu", "branding", "fictional-menu-preview.png");
  await fs.mkdir(path.dirname(materialized), { recursive: true });
  await fs.writeFile(materialized, previewPng);
  await writeJson(path.join(profileRoot, "internal", "teacher-solution-candidates.json"), { secret: SYNTHETIC_TEACHER_SECRET, correctAnswer: "Never expose this fictional value." });
  await writeJson(path.join(profileRoot, "internal", "answer-evidence-index.json"), { secret: SYNTHETIC_TEACHER_SECRET });
  return { projectId, projectRoot, sourcePreview, pageSha };
}

async function createJourneyProject(workspace) {
  const projectId = "fictional-journey-control";
  const projectRoot = path.join(workspace, "projects", projectId);
  await writeJson(path.join(projectRoot, "book-project.json"), baseProject(projectId, "journey-air-v1", "Fictional Journey Control"));
  await writeJson(path.join(projectRoot, "structural-fingerprint.json"), { schemaVersion: "1.0", fingerprintKind: "synthetic", fingerprintSha256: "d".repeat(64), features: { hasJourneyExerciseTemplates: true } });
  await writeJson(path.join(projectRoot, "rescan-diff.json"), { schemaVersion: "1.0", fromRevision: 2, toRevision: 3, added: [], changed: [], removed: [], staleDecisions: [] });
  return { projectId, projectRoot };
}

export async function createBookBuilderStudioFixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "hhplms-studio-fixture-"));
  const workspace = path.join(root, "workspace");
  const sourceRoot = path.join(root, "source");
  await fs.mkdir(path.join(workspace, "projects"), { recursive: true });
  const ultimate = await createUltimateProject(workspace, sourceRoot);
  const journey = await createJourneyProject(workspace);
  const corruptRoot = path.join(workspace, "projects", "fictional-corrupt-project");
  await fs.mkdir(corruptRoot, { recursive: true });
  await fs.writeFile(path.join(corruptRoot, "book-project.json"), "{not-json", "utf8");
  return {
    root, workspace, sourceRoot, ultimate, journey, corruptRoot,
    async cleanup() { await fs.rm(root, { recursive: true, force: true }); },
  };
}
