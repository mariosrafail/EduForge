import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { handler } from "../../netlify/functions/book-content.js";
import { hashToken, sessionCookieName, setSqlForTests } from "../../netlify/functions/_auth-utils.js";
import { createAssignment } from "../../netlify/functions/_book-content/assignment-actions.js";
import { submitActivity } from "../../netlify/functions/_book-content/submission-actions.js";
import { getPublishedReleaseAsset } from "../../netlify/functions/_book-content/publication-actions.js";
import { historicalUnitExtrasIdentity, historicalUnitExtrasRelease } from "../fixtures/historical-unit-extras.js";

// All persistence and authentication here use the owning test's isolated schema.
// The frozen release is inserted as test data; no hosted release is read/rebuilt.
export async function verifyHistoricalUnitExtrasPersistence({ pool, sql, scope, builderId, teacher, student, classId, insertRelease, publishRelease, fixture = {} }) {
  const original = fixture.release || historicalUnitExtrasRelease();
  const fixtureIdentity = fixture.identity || historicalUnitExtrasIdentity;
  const releaseNumber = fixture.releaseNumber || 101;
  const compiled = {
    compilerId: original.compiler_id, releaseSchemaVersion: original.release_schema_version,
    compatibility: original.runtime_compatibility_sha256, sourceSnapshot: original.source_snapshot,
    sourceSnapshotSha256: original.source_snapshot_sha256, publicProjection: original.public_projection,
    publicProjectionSha256: original.public_projection_sha256, teacherProjection: original.teacher_projection,
    teacherProjectionSha256: original.teacher_projection_sha256, assetManifest: original.asset_manifest,
    releaseSha256: original.release_sha256,
  };
  const common = { packageId: scope.package_id, componentId: scope.component_id, builderId };
  const head = (await pool.query("select release_id,head_revision from book_component_publication_heads where book_component_id=$1", [scope.component_id])).rows[0];
  const historical = await insertRelease(pool, { ...common, releaseNumber, fixture: { compiled } });
  await publishRelease(pool, { ...common, releaseId: historical.releaseId, previousReleaseId: head.release_id, revision: head.head_revision + 1 });
  await fixture.publishFamily?.({ releaseId: historical.releaseId, releaseNumber, compiled });
  const tokenFor = async (user) => {
    const token = randomBytes(32).toString("hex");
    await pool.query("insert into auth_sessions(user_id,token_hash,expires_at) values($1,$2,now()+interval '1 day')", [user.id, hashToken(token)]);
    return token;
  };
  const teacherToken = await tokenFor(teacher);
  const studentToken = await tokenFor(student);
  const request = (token, query) => handler({ httpMethod: "GET", headers: { host: "localhost", cookie: `${sessionCookieName}=${token}` }, queryStringParameters: query });
  const identity = { bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-students-book", releaseId: historical.releaseId, activityId: fixtureIdentity.activityId };
  setSqlForTests(sql);
  try {
    const books = await request(teacherToken, { action: "published-books" });
    assert.equal(books.statusCode, 200, books.body);
    assert.equal(books.headers["Cache-Control"], "private, no-store");
    assert.ok(JSON.parse(books.body).books.some((book) => book.releaseId === historical.releaseId && book.activities.length > 0));
    const targets = await request(teacherToken, { action: "assignment-targets" });
    assert.equal(targets.statusCode, 200, targets.body);
    assert.ok(JSON.parse(targets.body).targets.some((item) => item.target.releaseId === historical.releaseId && item.target.nativeActivityId === identity.activityId && item.assignable));
    fixture.assertReads?.(JSON.parse(books.body), JSON.parse(targets.body));
    assert.equal((await request("", { action: "published-books" })).statusCode, 401);
    const studentBook = await request(studentToken, { action: "active-component-release", ...identity });
    assert.equal(studentBook.statusCode, 200, studentBook.body);
    assert.deepEqual(JSON.parse(studentBook.body).projection.unitExtras, original.public_projection.unitExtras);
    assert.doesNotMatch(studentBook.body, /correctAnswers|correctOptionId|modelAnswers|teacherProjection|SYNTHETIC_COMBINED_/);
    assert.equal((await request(studentToken, { action: "published-native-teacher", ...identity })).statusCode, 403);
    const teacherDocument = await request(teacherToken, { action: "published-native-teacher", ...identity });
    assert.equal(teacherDocument.statusCode, 200, teacherDocument.body);
    assert.equal(teacherDocument.headers["Cache-Control"], "private, no-store");
    if (fixture.allPublicAssets) {
      const unentitled = (await pool.query("insert into app_users(school_id,full_name,role,status) values($1,'Synthetic unentitled teacher','teacher','active') returning id", [teacher.school_id])).rows[0];
      const unentitledToken = await tokenFor(unentitled);
      assert.equal((await request(unentitledToken, { action: "published-native-teacher", ...identity })).statusCode, 403);
      assert.equal((await request(unentitledToken, { action: "active-component-release", ...identity })).statusCode, 403);
      const asset = original.public_projection.assets[0];
      assert.equal((await request(unentitledToken, { action: "published-release-asset", ...identity, sha256: asset.sha256, extension: asset.extension })).statusCode, 403);
    }
    for (const asset of original.public_projection.assets.filter((entry) => entry.role === "unit_extra_video" || fixture.allPublicAssets)) {
      const delivered = await getPublishedReleaseAsset(sql, { ...identity, sha256: asset.sha256, extension: asset.extension }, { storage: { signedGetUrl: async () => "https://synthetic.invalid/asset" } });
      assert.equal(delivered.statusCode, 302);
      assert.equal(delivered.headers["Cache-Control"], "private, no-store");
    }
    const created = await createAssignment(sql, { idempotencyKey: `historical-${releaseNumber}`, classIds: [classId], target: { kind: "published_native", releaseId: historical.releaseId, nativeActivityId: identity.activityId, locator: { pageId: "ub2-sb-unit-1-part-1", hotspotId: "hotspot-native-single-choice" } } }, teacher);
    assert.equal(created.statusCode, 200, created.body);
    const assignmentId = JSON.parse(created.body).assignment.id;
    const newer = await insertRelease(pool, { ...common, releaseNumber: releaseNumber + 1, fixture: {} });
    await publishRelease(pool, { ...common, releaseId: newer.releaseId, previousReleaseId: historical.releaseId, revision: head.head_revision + 2 });
    assert.equal((await request(teacherToken, { action: "published-native-teacher", ...identity })).body, teacherDocument.body);
    const pinned = await request(studentToken, { action: "student-assignment", assignmentId });
    assert.equal(pinned.statusCode, 200, pinned.body);
    assert.equal(JSON.parse(pinned.body).assignment.target.releaseId, historical.releaseId);
    assert.doesNotMatch(pinned.body, /correctAnswers|correctOptionId/);
    const answers = original.teacher_projection.nativeActivities[identity.activityId].document.parts[0].solution.correctAnswers;
    const submission = await submitActivity(sql, { assignmentId, response: { schemaVersion: "native-response.v1", items: answers.map((answer) => ({ id: answer.questionId, value: answer.correctOptionId })) } }, student);
    assert.equal(submission.statusCode, 200, submission.body);
    assert.equal(JSON.parse(submission.body).submission.scorePercent, 100);
    const stored = (await pool.query("select * from book_component_releases where id=$1", [historical.releaseId])).rows[0];
    for (const [key, value] of Object.entries(original)) assert.deepEqual(stored[key], value, key);
    // A deliberately corrupt test artifact, never an UPDATE of immutable data.
    const tampered = structuredClone(compiled);
    if (fixture.tamper) fixture.tamper(tampered);
    else tampered.publicProjection.unitExtras.units[0].categories.audios = [];
    const invalid = await insertRelease(pool, { ...common, releaseNumber: releaseNumber + 2, fixture: { compiled: tampered } });
    await publishRelease(pool, { ...common, releaseId: invalid.releaseId, previousReleaseId: newer.releaseId, revision: head.head_revision + 3 });
    await fixture.publishFamily?.({ releaseId: invalid.releaseId, releaseNumber: releaseNumber + 2, compiled: tampered });
    assert.equal((await request(teacherToken, { action: "published-books" })).statusCode, 503);
    assert.equal((await request(teacherToken, { action: "assignment-targets" })).statusCode, 503);
    assert.equal((await request(studentToken, { action: "student-assignment", assignmentId })).statusCode, 200);
  } finally {
    setSqlForTests(null);
  }
}
