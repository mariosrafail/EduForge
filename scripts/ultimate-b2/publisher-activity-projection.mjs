import pg from "pg";

import { requireSafeDatabase } from "../_staging-db.mjs";
import {
  createUltimateB2PublisherActivityRecord,
  nextUltimateB2PublisherActivityId,
  normalizeUltimateB2PublisherActivityRecord,
} from "../../src/data/ultimate-b2/publisherCreatedActivities.js";

const { Client } = pg;
const mutationPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;

function lessonSlugForPage(page) {
  if (Number(page.unitNumber) === 1) return "recovered-students-book-activities";
  if (Number(page.unitNumber) === 2 && Number(page.partNumber) === 2) return "unit-2-reading";
  if (Number(page.unitNumber) === 2) return `unit-2-part-${String(page.partNumber).padStart(2, "0")}`;
  throw new Error("Publisher activity page has no deterministic official lesson mapping.");
}

function databaseType(kind) {
  return kind === "image" ? "normalized_students_book" : "teacher_reviewed_response";
}

function instructionsForKind(kind) {
  return kind === "image" ? "View the publisher image." : "Respond to the questions.";
}

async function openClient(environment) {
  const mode = environment.ULTIMATE_B2_PUBLISHER_AUTHORING_DB_MODE;
  if (!['test', 'staging'].includes(mode)) throw new Error("Publisher activity save requires ULTIMATE_B2_PUBLISHER_AUTHORING_DB_MODE=test or staging with its explicitly confirmed isolated database target.");
  const target = requireSafeDatabase(mode, environment);
  const client = new Client({ connectionString: target.connectionString, ssl: target.connectionString.includes("localhost") ? false : { rejectUnauthorized: false } });
  await client.connect();
  return { client, ownsClient: true, target: target.safeLabel };
}

async function resolveOfficialLesson(client, page) {
  const lessonSlug = lessonSlugForPage(page);
  const result = await client.query(`
    select l.id
    from lessons l
    join units u on u.id = l.unit_id
    join book_components bc on bc.id = u.book_component_id
    join book_packages bp on bp.id = bc.book_package_id
    where bp.slug = 'ultimate-b2'
      and bc.slug = 'ultimate-b2-students-book'
      and u.slug = $1
      and l.slug = $2
      and coalesce(l.ownership_type, 'official') = 'official'
    limit 2
  `, [`unit-${page.unitNumber}`, lessonSlug]);
  if (result.rows.length !== 1) throw new Error(`The canonical official publisher lesson ${lessonSlug} could not be resolved uniquely.`);
  return result.rows[0].id;
}

async function syncQuestions(client, activityId, kind, questions) {
  const normalizedQuestions = kind === "open-response" ? questions : [];
  const kept = [];
  for (const [index, question] of normalizedQuestions.entries()) {
    const number = index + 1;
    const result = await client.query(`
      insert into questions(activity_id,question_number,prompt,question_type,content_json,feedback_json,sort_order)
      values($1,$2,$3,'open_response','{}'::jsonb,$4,$2)
      on conflict(activity_id,question_number) do update
      set prompt=excluded.prompt,question_type=excluded.question_type,content_json=excluded.content_json,feedback_json=excluded.feedback_json,sort_order=excluded.sort_order
      returning id
    `, [activityId, number, question.prompt, { acceptedAnswers: [], source: "none-open-or-unscored-response", feedbackSource: "application-generated-neutral" }]);
    kept.push(result.rows[0].id);
  }
  if (kept.length) await client.query("delete from questions where activity_id=$1 and not (id=any($2::uuid[]))", [activityId, kept]);
  else await client.query("delete from questions where activity_id=$1", [activityId]);
}

export async function projectUltimateB2PublisherActivity({
  page,
  authoringKind,
  title,
  occupiedActivityIds,
  questions = [],
  client: suppliedClient = null,
  environment = process.env,
  clientMutationId,
  existingRecord = null,
  filesystemSyncStatus = "pending",
}) {
  if (!mutationPattern.test(String(clientMutationId || ""))) throw new Error("Publisher activity mutation identity is invalid.");
  const connection = suppliedClient ? { client: suppliedClient, ownsClient: false, target: "injected-isolated-test-client" } : await openClient(environment);
  const { client } = connection;
  try {
    await client.query("begin");
    await client.query("select pg_advisory_xact_lock(hashtext($1))", [`ultimate-b2-publisher:${page.unitNumber}:${page.partNumber}`]);
    const lessonId = await resolveOfficialLesson(client, page);
    const priorMutation = await client.query("select slug from activities where lesson_id=$1 and content_json->>'publisherAuthoringMutationId'=$2 limit 2", [lessonId, clientMutationId]);
    if (priorMutation.rows.length > 1) throw new Error("Publisher activity mutation identity is duplicated in the official database.");
    const databaseIds = (await client.query("select slug from activities where lesson_id=$1 and slug like $2", [lessonId, `ultimate-b2-sb-u${page.unitNumber}-p${page.partNumber}-o%`])).rows.map((row) => row.slug);
    const activityId = existingRecord?.activityId || priorMutation.rows[0]?.slug || nextUltimateB2PublisherActivityId(page, [...occupiedActivityIds, ...databaseIds]);
    const record = existingRecord
      ? normalizeUltimateB2PublisherActivityRecord({ ...existingRecord, title })
      : createUltimateB2PublisherActivityRecord({ activityId, page, authoringKind, title });
    if (record.authoringKind !== authoringKind || record.pageId !== page.id) throw new Error("Publisher activity kind or canonical page is immutable.");
    const contentJson = {
      publisherSourceActivityId: activityId,
      stableNormalizedId: activityId,
      publisherAuthoringSource: "ultimate-b2-builder",
      publisherAuthoringMutationId: clientMutationId,
      publisherAuthoringFilesystemSync: filesystemSyncStatus,
      implementationMode: record.runtime.implementationMode,
      authoringKind: record.authoringKind,
      unitNumber: record.unitNumber,
      partNumber: record.partNumber,
      printedPage: record.printedPage,
      pageId: record.pageId,
      pageSpread: record.pageSpread,
    };
    const result = await client.query(`
      insert into activities(lesson_id,slug,title,type,activity_type,instructions,content,content_json,settings_json,sort_order,is_assignable,is_demo_active,ownership_type)
      values($1,$2,$3,$4,$4,$5,$6,$6,'{}'::jsonb,$7,$8,true,'official')
      on conflict(lesson_id,slug) do update
      set title=excluded.title,type=excluded.type,activity_type=excluded.activity_type,instructions=excluded.instructions,content=excluded.content,content_json=excluded.content_json,sort_order=excluded.sort_order,is_assignable=excluded.is_assignable,is_demo_active=true,ownership_type='official'
      returning id,slug
    `, [lessonId, activityId, record.title, databaseType(record.authoringKind), instructionsForKind(record.authoringKind), contentJson, record.partNumber * 100 + Number(activityId.split("-o").at(-1)), record.authoringKind === "open-response"]);
    await syncQuestions(client, result.rows[0].id, record.authoringKind, questions);
    await client.query("commit");
    return { record, databaseActivityId: result.rows[0].id, databaseTarget: connection.target };
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    if (connection.ownsClient) await client.end();
  }
}

export async function markUltimateB2PublisherActivityFilesystemSynced({ activityId, client: suppliedClient = null, environment = process.env }) {
  const connection = suppliedClient ? { client: suppliedClient, ownsClient: false } : await openClient(environment);
  try {
    const result = await connection.client.query(`
      update activities
      set content_json=jsonb_set(content_json,'{publisherAuthoringFilesystemSync}','"synced"'::jsonb,true),content= jsonb_set(content,'{publisherAuthoringFilesystemSync}','"synced"'::jsonb,true)
      where slug=$1 and ownership_type='official' and content_json->>'publisherAuthoringSource'='ultimate-b2-builder'
      returning id
    `, [activityId]);
    if (result.rows.length !== 1) throw new Error("Official publisher activity synchronization state could not be updated uniquely.");
  } finally {
    if (connection.ownsClient) await connection.client.end();
  }
}
