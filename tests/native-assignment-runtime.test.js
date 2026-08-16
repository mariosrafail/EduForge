import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  NATIVE_ASSIGNMENT_TARGET_KIND,
  NATIVE_RESPONSE_SCHEMA_VERSION,
  listPublishedNativeAssignmentTargets,
  nativeTargetToStudent,
  nativeAssignmentCapability,
  resolveNativeAssignmentTarget,
} from "../netlify/functions/_book-content/native-assignment-runtime.js";
import { assignmentIdempotencyKey } from "../netlify/functions/_book-content/shared.js";
import { submitActivity } from "../netlify/functions/_book-content/submission-actions.js";
import { createAssignment } from "../netlify/functions/_book-content/assignment-actions.js";
import { compilePublicationV2Fixture, publicationV2Fixture } from "./fixtures/publication-v2.js";

const publicDocument = {
  parts: [{ interaction: { questions: [
    { id: "q-first", prompt: "First prompt" },
    { id: "q-second", prompt: "Second prompt" },
  ] } }],
};

test("native capabilities declare Open Response review and Image display-only policy", () => {
  const openResponse = nativeAssignmentCapability("open-response");
  assert.equal(openResponse.assignable, true);
  assert.equal(openResponse.submittable, true);
  assert.equal(openResponse.reviewMode, "teacher-reviewed");
  assert.equal(openResponse.responseSchemaVersion, NATIVE_RESPONSE_SCHEMA_VERSION);

  const image = nativeAssignmentCapability("image");
  assert.equal(image.assignable, false);
  assert.equal(image.submittable, false);
  assert.equal(image.reviewMode, "display-only");
  assert.equal(nativeAssignmentCapability("future-kind"), null);
});

test("Open Response adapter canonicalizes stable IDs in document order without changing text", () => {
  const capability = nativeAssignmentCapability("open-response");
  const normalized = capability.normalizeResponse(publicDocument, {
    schemaVersion: NATIVE_RESPONSE_SCHEMA_VERSION,
    items: [
      { id: "q-second", value: "  keep my whitespace  " },
      { id: "q-first", value: "First answer" },
    ],
  });
  assert.deepEqual(normalized.payload.items, [
    { id: "q-first", value: "First answer" },
    { id: "q-second", value: "  keep my whitespace  " },
  ]);
  assert.equal(normalized.status, "awaiting_review");
  assert.equal(normalized.scorePercent, null);
});

test("Open Response adapter rejects unknown, duplicate, malformed, and oversized responses", () => {
  const capability = nativeAssignmentCapability("open-response");
  const envelope = (items) => ({ schemaVersion: NATIVE_RESPONSE_SCHEMA_VERSION, items });
  assert.match(capability.normalizeResponse(publicDocument, envelope([{ id: "forged", value: "x" }])).error, /Unexpected response id/);
  assert.match(capability.normalizeResponse(publicDocument, envelope([{ id: "q-first", value: "a" }, { id: "q-first", value: "b" }])).error, /Duplicate response id/);
  assert.match(capability.normalizeResponse(publicDocument, envelope([{ id: "q-first", value: 12 }])).error, /must be text/);
  assert.match(capability.normalizeResponse(publicDocument, envelope([{ id: "q-first", value: "x".repeat(10_001) }])).error, /too long/);
  assert.match(capability.normalizeResponse(publicDocument, { schemaVersion: "forged", items: [] }).error, /schemaVersion/);
  assert.match(capability.normalizeResponse(publicDocument, { schemaVersion: NATIVE_RESPONSE_SCHEMA_VERSION, items: [], modelAnswers: [] }).error, /unsupported fields/);

  const largeDocument = {
    parts: [{ interaction: { questions: Array.from({ length: 11 }, (_, index) => ({ id: `q-${index}`, prompt: `Prompt ${index}` })) } }],
  };
  assert.match(capability.normalizeResponse(largeDocument, envelope(
    largeDocument.parts[0].interaction.questions.map(({ id }) => ({ id, value: "x".repeat(10_000) })),
  )).error, /payload is too large/);
});

test("Teacher review projection combines pinned public prompts and protected Teacher answers", () => {
  const capability = nativeAssignmentCapability("open-response");
  const details = capability.teacherReviewProjection(publicDocument, {
    parts: [{ solution: { modelAnswers: [
      { questionId: "q-first", text: "Private model one" },
      { questionId: "q-second", text: "Private model two" },
    ] } }],
  }, {
    items: [{ id: "q-second", value: "Student two" }, { id: "q-first", value: "Student one" }],
  });
  assert.deepEqual(details.map(({ questionId, prompt, answer, modelAnswer }) => ({ questionId, prompt, answer, modelAnswer })), [
    { questionId: "q-first", prompt: "First prompt", answer: "Student one", modelAnswer: "Private model one" },
    { questionId: "q-second", prompt: "Second prompt", answer: "Student two", modelAnswer: "Private model two" },
  ]);
});

test("native idempotency identity includes the pinned release and activity", () => {
  const common = { idempotencyKey: "assignment-request-1234" };
  const first = assignmentIdempotencyKey({ ...common, target: { kind: "published_native", releaseId: "release-a", nativeActivityId: "activity-a" } }, "teacher", null, "class", "class-a");
  const second = assignmentIdempotencyKey({ ...common, target: { kind: "published_native", releaseId: "release-b", nativeActivityId: "activity-a" } }, "teacher", null, "class", "class-a");
  assert.notEqual(first.value, second.value);
  assert.match(first.value, /published_native:release-a:activity-a$/);
});

test("migration 040 preserves legacy rows and constrains exactly one target family", async () => {
  const migration = await readFile(new URL("../database/040_published_native_assignment_runtime.sql", import.meta.url), "utf8");
  assert.match(migration, /target_kind text not null default 'legacy_activity'/i);
  assert.match(migration, /alter column activity_id drop not null/i);
  assert.match(migration, /target_kind = 'legacy_activity'[\s\S]*activity_id is not null[\s\S]*native_release_id is null/i);
  assert.match(migration, /target_kind = 'published_native'[\s\S]*activity_id is null[\s\S]*native_release_id is not null/i);
  assert.match(migration, /references book_component_releases\(id\) on delete restrict/i);
  assert.match(migration, /response_schema_version text/i);
  assert.match(migration, /response_payload jsonb/i);
});

test("generic endpoint layers delegate per-kind response behavior to the capability boundary", async () => {
  const files = await Promise.all([
    "assignment-actions.js", "submission-actions.js", "class-actions.js",
  ].map((name) => readFile(new URL(`../netlify/functions/_book-content/${name}`, import.meta.url), "utf8")));
  for (const source of files) assert.doesNotMatch(source, /kind\s*===?\s*["']open-response["']/);
});

function immutableReleaseRow({ id = "10000000-0000-4000-8000-000000000090", releaseNumber = 3, fixture = {} } = {}) {
  const compiled = compilePublicationV2Fixture(fixture);
  return {
    id,
    book_package_id: "10000000-0000-4000-8000-000000000091",
    book_component_id: "10000000-0000-4000-8000-000000000092",
    package_slug: "ultimate-b2",
    package_title: "Ultimate B2",
    component_slug: "ultimate-b2-students-book",
    component_title: "Students Book",
    release_number: releaseNumber,
    release_schema_version: compiled.releaseSchemaVersion,
    compiler_id: compiled.compilerId,
    runtime_compatibility_sha256: compiled.compatibility,
    source_snapshot: compiled.sourceSnapshot,
    source_snapshot_sha256: compiled.sourceSnapshotSha256,
    public_projection: compiled.publicProjection,
    public_projection_sha256: compiled.publicProjectionSha256,
    teacher_projection: compiled.teacherProjection,
    teacher_projection_sha256: compiled.teacherProjectionSha256,
    asset_manifest: compiled.assetManifest,
    release_sha256: compiled.releaseSha256,
  };
}

function nativeSql(release) {
  const calls = [];
  const sql = async (strings, ...values) => {
    const text = strings.join("?");
    calls.push({ text, values });
    if (text.includes("from book_component_releases release") || text.includes("from book_component_publication_heads head")) return [release];
    if (text.includes("from book_packages bp")) return [{ id: release.book_package_id }];
    return [];
  };
  sql.calls = calls;
  return sql;
}

test("pinned native resolution verifies an exact published release without requiring the mutable head", async () => {
  const releaseA = immutableReleaseRow();
  const sql = nativeSql(releaseA);
  const target = await resolveNativeAssignmentTarget(sql, {
    id: "student", school_id: "school", role: "student",
  }, {
    kind: NATIVE_ASSIGNMENT_TARGET_KIND,
    releaseId: releaseA.id,
    nativeActivityId: publicationV2Fixture.openResponseId,
  }, { requireActive: false });
  assert.equal(target.row.id, releaseA.id);
  assert.equal(target.publicEntry.kind, "open-response");
  assert.equal(sql.calls[0].values[0], releaseA.id);
  assert.equal(sql.calls[0].values[1], false);

  const studentPayload = nativeTargetToStudent(target, publicationV2Fixture.openResponseId);
  assert.equal(studentPayload.releaseId, releaseA.id);
  assert.equal(studentPayload.entry.document.metadata.title, "Native Open Response");
  assert.doesNotMatch(JSON.stringify(studentPayload), new RegExp(publicationV2Fixture.teacherSentinel));
});

test("authorized active catalog exposes capability metadata but never Teacher documents", async () => {
  const release = immutableReleaseRow();
  const sql = nativeSql(release);
  const targets = await listPublishedNativeAssignmentTargets(sql, {
    id: "teacher", school_id: "school", role: "teacher",
  });
  const open = targets.find((item) => item.target.nativeActivityId === publicationV2Fixture.openResponseId);
  const image = targets.find((item) => item.target.nativeActivityId === publicationV2Fixture.imageId);
  assert.equal(open.assignable, true);
  assert.equal(open.reviewMode, "teacher-reviewed");
  assert.equal(image.assignable, false);
  assert.equal(image.reviewMode, "display-only");
  assert.doesNotMatch(JSON.stringify(targets), new RegExp(publicationV2Fixture.teacherSentinel));
  assert.match(sql.calls[1].text, /book_component_publication_heads/);
  assert.match(sql.calls[1].text, /book_component_publication_events/);
});

test("an assignment pinned to Release A keeps Release A after the publication head moves to Release B", async () => {
  const releaseA = immutableReleaseRow({
    id: "10000000-0000-4000-8000-000000000081",
    releaseNumber: 3,
    fixture: { prompt: "Release A prompt", teacherAnswer: "Release A protected answer" },
  });
  const releaseB = immutableReleaseRow({
    id: "10000000-0000-4000-8000-000000000082",
    releaseNumber: 4,
    fixture: { prompt: "Release B prompt", teacherAnswer: "Release B protected answer" },
  });
  const activeHead = releaseB.id;
  const assignment = { native_release_id: releaseA.id, native_activity_id: publicationV2Fixture.openResponseId };
  const calls = [];
  const sql = async (strings, ...values) => {
    const text = strings.join("?");
    calls.push({ text, values });
    if (text.includes("from book_component_releases release")) return [values[0] === releaseA.id ? releaseA : releaseB];
    if (text.includes("from book_packages bp")) return [{ id: releaseA.book_package_id }];
    return [];
  };
  const resolved = await resolveNativeAssignmentTarget(sql, { id: "student", school_id: "school", role: "student" }, {
    kind: NATIVE_ASSIGNMENT_TARGET_KIND,
    releaseId: assignment.native_release_id,
    nativeActivityId: assignment.native_activity_id,
  }, { requireActive: false });
  assert.equal(activeHead, releaseB.id);
  assert.equal(resolved.row.id, releaseA.id);
  assert.equal(resolved.publicEntry.document.parts[0].interaction.questions[0].prompt, "Release A prompt");
  assert.equal(resolved.teacherEntry.document.parts[0].solution.modelAnswers[0].text, "Release A protected answer");
  assert.equal(calls[0].values[1], false);
});

function nativeSubmissionSql(release, { inserted = true, assignmentOverrides = {}, enrolled = true } = {}) {
  const assignment = {
    id: "10000000-0000-4000-8000-000000000093",
    target_kind: "published_native",
    activity_id: null,
    native_release_id: release.id,
    native_activity_id: publicationV2Fixture.openResponseId,
    status: "assigned",
    student_id: null,
    class_id: "10000000-0000-4000-8000-000000000094",
    school_id: "10000000-0000-4000-8000-000000000095",
    due_at: null,
    ...assignmentOverrides,
  };
  const calls = [];
  const sql = async (strings, ...values) => {
    const text = strings.join("?");
    calls.push({ text, values });
    if (text.includes("with assignment_state as materialized")) return [{
      assignment_exists: true,
      assignment_status: "assigned",
      due_at: null,
      submission: inserted ? { id: "10000000-0000-4000-8000-000000000096", status: "awaiting_review" } : null,
    }];
    if (text.includes("from activity_assignments aa")) return [assignment];
    if (text.includes("from class_students")) return enrolled ? [{ id: "enrollment" }] : [];
    if (text.includes("from book_component_releases release")) return [release];
    if (text.includes("from book_packages bp")) return [{ id: release.book_package_id }];
    return [];
  };
  sql.calls = calls;
  sql.assignmentLifecycleTransaction = async (_assignmentId, callback) => callback(sql);
  return { sql, assignment };
}

test("native submission resolves assignment first, ignores client score, and stores one versioned payload", async () => {
  const release = immutableReleaseRow();
  const { sql, assignment } = nativeSubmissionSql(release);
  const questionId = release.public_projection.nativeActivities[publicationV2Fixture.openResponseId]
    .document.parts[0].interaction.questions[0].id;
  const response = await submitActivity(sql, {
    assignmentId: assignment.id,
    target: { kind: "published_native", releaseId: release.id, nativeActivityId: publicationV2Fixture.openResponseId },
    score: 100,
    response: { schemaVersion: NATIVE_RESPONSE_SCHEMA_VERSION, items: [{ id: questionId, value: "Student text" }] },
  }, { id: "10000000-0000-4000-8000-000000000097", school_id: assignment.school_id, role: "student" });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(JSON.parse(response.body).submission, {
    id: "10000000-0000-4000-8000-000000000096",
    status: "awaiting_review",
    scorePercent: null,
    correctCount: null,
    totalCount: null,
  });
  const insert = sql.calls.find((call) => call.text.includes("response_schema_version, response_payload"));
  assert.ok(insert);
  assert.match(insert.text, /activity_id, student_id, answers/);
  assert.equal(insert.values.includes(100), false);
  assert.equal(sql.calls.some((call) => call.text.includes("insert into student_answers")), false);
});

test("native submission rejects forged target and unknown response before writing", async () => {
  const release = immutableReleaseRow();
  const { sql, assignment } = nativeSubmissionSql(release);
  const user = { id: "10000000-0000-4000-8000-000000000097", school_id: assignment.school_id, role: "student" };
  const forged = await submitActivity(sql, {
    assignmentId: assignment.id,
    target: { kind: "published_native", releaseId: "10000000-0000-4000-8000-000000000099", nativeActivityId: publicationV2Fixture.openResponseId },
    response: { schemaVersion: NATIVE_RESPONSE_SCHEMA_VERSION, items: [] },
  }, user);
  assert.equal(forged.statusCode, 400);
  assert.match(JSON.parse(forged.body).error, /does not match/);

  const second = nativeSubmissionSql(release);
  const unknown = await submitActivity(second.sql, {
    assignmentId: second.assignment.id,
    response: { schemaVersion: NATIVE_RESPONSE_SCHEMA_VERSION, items: [{ id: "forged-question", value: "x" }] },
  }, user);
  assert.equal(unknown.statusCode, 400);
  assert.match(JSON.parse(unknown.body).error, /Unexpected response id/);
  assert.equal(second.sql.calls.some((call) => call.text.includes("insert into activity_submissions")), false);
});

test("native submission preserves closed, deadline, enrollment, and tenant boundaries before writing", async () => {
  const release = immutableReleaseRow();
  const student = { id: "10000000-0000-4000-8000-000000000097", school_id: "10000000-0000-4000-8000-000000000095", role: "student" };
  const request = (assignmentId) => ({
    assignmentId,
    response: { schemaVersion: NATIVE_RESPONSE_SCHEMA_VERSION, items: [] },
  });

  const closed = nativeSubmissionSql(release, { assignmentOverrides: { status: "closed" } });
  const closedResponse = await submitActivity(closed.sql, request(closed.assignment.id), student);
  assert.equal(closedResponse.statusCode, 409);

  const expired = nativeSubmissionSql(release, { assignmentOverrides: { due_at: "2020-01-01T00:00:00.000Z" } });
  const expiredResponse = await submitActivity(expired.sql, request(expired.assignment.id), student);
  assert.equal(expiredResponse.statusCode, 403);

  const unenrolled = nativeSubmissionSql(release, { enrolled: false });
  const unenrolledResponse = await submitActivity(unenrolled.sql, request(unenrolled.assignment.id), student);
  assert.equal(unenrolledResponse.statusCode, 403);

  const crossTenant = nativeSubmissionSql(release);
  const crossTenantResponse = await submitActivity(crossTenant.sql, request(crossTenant.assignment.id), {
    ...student,
    school_id: "10000000-0000-4000-8000-000000000099",
  });
  assert.equal(crossTenantResponse.statusCode, 403);

  for (const candidate of [closed, expired, unenrolled, crossTenant]) {
    assert.equal(candidate.sql.calls.some((call) => call.text.includes("insert into activity_submissions")), false);
    assert.equal(candidate.sql.calls.some((call) => call.text.includes("from book_component_releases release")), false);
  }
});

test("Teacher creation persists the canonical active release target and rejects display-only Image", async () => {
  const release = immutableReleaseRow();
  const calls = [];
  const teacher = { id: "10000000-0000-4000-8000-000000000097", school_id: "10000000-0000-4000-8000-000000000095", role: "teacher" };
  const classId = "10000000-0000-4000-8000-000000000094";
  const sql = async (strings, ...values) => {
    const text = strings.join("?");
    calls.push({ text, values });
    if (text.includes("from book_component_releases release")) return [release];
    if (text.includes("from book_packages bp")) return [{ id: release.book_package_id }];
    if (text.includes("from classes c")) return [{ id: classId, teacher_id: teacher.id, school_id: teacher.school_id }];
    if (text.includes("insert into activity_assignments")) return [{
      id: "10000000-0000-4000-8000-000000000098",
      target_kind: "published_native",
      activity_id: null,
      native_release_id: release.id,
      native_activity_id: publicationV2Fixture.openResponseId,
      teacher_id: teacher.id,
      class_id: classId,
      title: "Native Open Response",
    }];
    return [];
  };
  const body = {
    idempotencyKey: "native-create-request",
    classIds: [classId],
    target: { kind: "published_native", releaseId: release.id, nativeActivityId: publicationV2Fixture.openResponseId },
  };
  const created = await createAssignment(sql, body, teacher);
  assert.equal(created.statusCode, 200);
  assert.equal(JSON.parse(created.body).assignment.nativeReleaseId, release.id);
  const insert = calls.find((call) => call.text.includes("insert into activity_assignments"));
  assert.match(insert.text, /target_kind/);
  assert.ok(insert.values.includes(release.id));
  assert.ok(insert.values.includes(publicationV2Fixture.openResponseId));
  const releaseLookup = calls.find((call) => call.text.includes("from book_component_releases release"));
  assert.equal(releaseLookup.values[1], true);

  const displayOnly = await createAssignment(sql, {
    ...body,
    idempotencyKey: "native-image-request",
    target: { kind: "published_native", releaseId: release.id, nativeActivityId: publicationV2Fixture.imageId },
  }, teacher);
  assert.equal(displayOnly.statusCode, 403);
});
