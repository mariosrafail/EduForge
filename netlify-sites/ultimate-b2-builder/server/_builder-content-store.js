import { builderDocumentSha256 } from "./_builder-content-security.js";

function rowDocument(row, resource) {
  if (!row) return null;
  if (row.schema_version !== resource.schemaVersion) throw new Error("Stored Builder document schema is unsupported");
  const document = resource.validate(row.payload);
  const checksum = builderDocumentSha256(document);
  if (checksum !== row.payload_sha256) throw new Error("Stored Builder document checksum is invalid");
  const revision = Number(row.revision);
  if (!Number.isSafeInteger(revision) || revision < 1) throw new Error("Stored Builder document revision is invalid");
  return { revision, source: "database", document };
}
export async function loadBuilderComponentDocument(sql, resource) {
  const rows = await sql`
    select document.schema_version, document.revision, document.payload, document.payload_sha256
    from builder_component_documents document
    join book_components component on component.id=document.book_component_id
      and component.book_package_id=document.book_package_id
    join book_packages package on package.id=document.book_package_id
    where package.slug=${resource.bookSlug}
      and component.slug=${resource.componentSlug}
      and document.document_type=${resource.documentType}
      and document.document_key=${resource.documentKey}
    limit 1
  `;
  return rowDocument(rows[0], resource);
}

export async function saveBuilderComponentDocument(sql, {
  resource,
  expectedRevision,
  clientMutationId,
  document,
  payloadSha256,
  builderUserId,
}) {
  if (typeof sql !== "function") throw new Error("Builder content persistence requires PostgreSQL");
  const rows = await sql`
    select * from save_builder_component_document(
      ${resource.bookSlug},
      ${resource.componentSlug},
      ${resource.documentType},
      ${resource.documentKey},
      ${resource.schemaVersion},
      ${expectedRevision},
      ${JSON.stringify(document)}::jsonb,
      ${payloadSha256},
      ${builderUserId}::uuid,
      ${clientMutationId}::uuid
    )
  `;
  const row = rows[0];
  if (!row) throw new Error("Builder content save returned no result");
  return {
    outcome: row.outcome,
    revision: row.saved_revision === null ? null : Number(row.saved_revision),
    currentRevision: row.current_revision === null ? null : Number(row.current_revision),
    document: row.saved_payload || null,
    payloadSha256: row.saved_payload_sha256 || null,
  };
}
