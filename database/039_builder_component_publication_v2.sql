-- Publication v2 exact-source freshness. Release storage and the single publication head remain unchanged.

create or replace function builder_release_sources_are_current(requested_release_id uuid)
returns boolean language plpgsql volatile as $$
declare
  release_row book_component_releases%rowtype;
  activity_id text;
  expected jsonb;
  actual_revision bigint;
  actual_sha text;
begin
  select * into release_row from book_component_releases where id = requested_release_id;
  if release_row.id is null then return false; end if;
  if not (
    (release_row.compiler_id = 'ultimate-b2-students-book-v1' and release_row.release_schema_version = '1.0')
    or (release_row.compiler_id = 'ultimate-b2-students-book-v2' and release_row.release_schema_version = '2.0')
  ) then return false; end if;

  select revision, payload_sha256 into actual_revision, actual_sha
  from builder_component_documents
  where book_component_id = release_row.book_component_id and document_type = 'hotspots' and document_key = 'default';
  expected := release_row.source_snapshot->'hotspots';
  if coalesce(actual_revision, 0) <> (expected->>'revision')::bigint
    or coalesce(actual_sha, expected->>'sha256') <> expected->>'sha256' then return false; end if;

  actual_revision := null; actual_sha := null;
  select revision, payload_sha256 into actual_revision, actual_sha
  from builder_component_documents
  where book_component_id = release_row.book_component_id and document_type = 'teacher_ui' and document_key = 'default';
  expected := release_row.source_snapshot->'teacherUi';
  if coalesce(actual_revision, 0) <> (expected->>'revision')::bigint
    or coalesce(actual_sha, expected->>'sha256') <> expected->>'sha256' then return false; end if;

  for activity_id in select jsonb_object_keys(release_row.source_snapshot->'openResponse') loop
    expected := release_row.source_snapshot->'openResponse'->activity_id->'document';
    actual_revision := null; actual_sha := null;
    select revision, payload_sha256 into actual_revision, actual_sha
    from builder_component_documents
    where book_component_id = release_row.book_component_id and document_type = 'open_response' and document_key = activity_id;
    if coalesce(actual_revision, 0) <> (expected->>'revision')::bigint
      or coalesce(actual_sha, expected->>'sha256') <> expected->>'sha256' then return false; end if;

    expected := release_row.source_snapshot->'openResponse'->activity_id->'import';
    actual_revision := null; actual_sha := null;
    select revision, fingerprint_sha256 into actual_revision, actual_sha
    from builder_open_response_imports
    where book_component_id = release_row.book_component_id and activity_key = activity_id;
    if coalesce(actual_revision, 0) <> (expected->>'revision')::bigint
      or (actual_revision is not null and actual_sha <> expected->>'sha256') then return false; end if;
  end loop;

  if release_row.compiler_id = 'ultimate-b2-students-book-v1' then return true; end if;

  expected := release_row.source_snapshot->'nativeIndex';
  actual_revision := null; actual_sha := null;
  select revision, payload_sha256 into actual_revision, actual_sha
  from builder_component_documents
  where book_component_id = release_row.book_component_id and document_type = 'native_activity_index' and document_key = 'default';
  if coalesce(actual_revision, 0) <> (expected->>'revision')::bigint
    or coalesce(actual_sha, expected->>'sha256') <> expected->>'sha256' then return false; end if;

  for activity_id in select jsonb_object_keys(release_row.source_snapshot->'nativeActivities') loop
    expected := release_row.source_snapshot->'nativeActivities'->activity_id->'public';
    actual_revision := null; actual_sha := null;
    select revision, payload_sha256 into actual_revision, actual_sha
    from builder_component_documents
    where book_component_id = release_row.book_component_id and document_type = 'native_activity_public' and document_key = activity_id;
    if coalesce(actual_revision, 0) <> (expected->>'revision')::bigint
      or coalesce(actual_sha, '') <> expected->>'sha256' then return false; end if;

    expected := release_row.source_snapshot->'nativeActivities'->activity_id->'teacher';
    actual_revision := null; actual_sha := null;
    select revision, payload_sha256 into actual_revision, actual_sha
    from builder_component_documents
    where book_component_id = release_row.book_component_id and document_type = 'native_activity_teacher' and document_key = activity_id;
    if coalesce(actual_revision, 0) <> (expected->>'revision')::bigint
      or coalesce(actual_sha, '') <> expected->>'sha256' then return false; end if;
  end loop;

  return true;
end;
$$;
