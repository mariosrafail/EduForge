-- Reordering shares the existing native index and canonical lifecycle documents.
-- Both revisions must commit together; releases and activity payloads are untouched.
create or replace function save_builder_activity_order(
  requested_book_slug text, requested_component_slug text,
  expected_index_revision bigint, expected_lifecycle_revision bigint,
  requested_index jsonb, requested_lifecycle jsonb,
  index_sha256 text, lifecycle_sha256 text,
  actor_builder_user_id uuid, requested_client_mutation_id uuid
) returns table(outcome text, index_revision bigint, lifecycle_revision bigint)
language plpgsql as $$
declare
  component_id uuid;
  saved_index record;
  saved_lifecycle record;
begin
  if not exists(select 1 from builder_users where id=actor_builder_user_id and status='active' and role='developer') then
    return query select 'unauthorized_actor'::text,0::bigint,0::bigint; return;
  end if;
  select component.id into component_id from book_components component
    join book_packages package on package.id=component.book_package_id
    where package.slug=requested_book_slug and component.slug=requested_component_slug;
  if component_id is null then
    return query select 'resource_not_found'::text,0::bigint,0::bigint; return;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('builder-native-activity-component:' || component_id::text,0));
  perform pg_advisory_xact_lock(hashtextextended('builder-publication-component:' || component_id::text,0));
  -- Generic saves preserve the canonical immutable revision and mutation history.
  -- A failure of either save aborts the subtransaction, including the first save.
  begin
    select * into saved_index from save_builder_component_document(
      requested_book_slug,requested_component_slug,'native_activity_index','default','1.0',
      expected_index_revision,requested_index,index_sha256,actor_builder_user_id,requested_client_mutation_id);
    if saved_index.outcome not in ('saved','idempotent') then raise exception 'activity_order_conflict' using errcode='40001'; end if;
    select * into saved_lifecycle from save_builder_component_document(
      requested_book_slug,requested_component_slug,'activity_lifecycle','default','1.0',
      expected_lifecycle_revision,requested_lifecycle,lifecycle_sha256,actor_builder_user_id,requested_client_mutation_id);
    if saved_lifecycle.outcome not in ('saved','idempotent') then raise exception 'activity_order_conflict' using errcode='40001'; end if;
    return query select 'saved'::text,saved_index.saved_revision,saved_lifecycle.saved_revision;
  exception when serialization_failure then
    return query select 'revision_conflict'::text,expected_index_revision,expected_lifecycle_revision;
  end;
end;
$$;

-- Historical snapshots keep their original source checks. New order snapshots
-- also fence the canonical lifecycle revision at publication.
create or replace function builder_release_sources_are_current(requested_release_id uuid)
returns boolean language plpgsql volatile as $$
declare
  release_row book_component_releases%rowtype;
  activity_id text;
  expected jsonb;
  actual_revision bigint;
  actual_sha text;
begin
  select * into release_row from book_component_releases where id=requested_release_id;
  if release_row.id is null then return false; end if;
  if not (
    (release_row.compiler_id = 'ultimate-b2-students-book-v1' and release_row.release_schema_version = '1.0')
    or (release_row.compiler_id = 'ultimate-b2-students-book-v2' and release_row.release_schema_version = '2.0')
  ) then return false; end if;

  select revision,payload_sha256 into actual_revision,actual_sha from builder_component_documents
  where book_component_id=release_row.book_component_id and document_type='hotspots' and document_key='default';
  expected:=release_row.source_snapshot->'hotspots';
  if coalesce(actual_revision,0)<>(expected->>'revision')::bigint or coalesce(actual_sha,expected->>'sha256')<>expected->>'sha256' then return false; end if;

  actual_revision:=null; actual_sha:=null;
  select revision,payload_sha256 into actual_revision,actual_sha from builder_component_documents
  where book_component_id=release_row.book_component_id and document_type='teacher_ui' and document_key='default';
  expected:=release_row.source_snapshot->'teacherUi';
  if coalesce(actual_revision,0)<>(expected->>'revision')::bigint or coalesce(actual_sha,expected->>'sha256')<>expected->>'sha256' then return false; end if;

  for activity_id in select jsonb_object_keys(release_row.source_snapshot->'openResponse') loop
    expected:=release_row.source_snapshot->'openResponse'->activity_id->'document';
    actual_revision:=null; actual_sha:=null;
    select revision,payload_sha256 into actual_revision,actual_sha from builder_component_documents
    where book_component_id=release_row.book_component_id and document_type='open_response' and document_key=activity_id;
    if coalesce(actual_revision,0)<>(expected->>'revision')::bigint or coalesce(actual_sha,expected->>'sha256')<>expected->>'sha256' then return false; end if;
    expected:=release_row.source_snapshot->'openResponse'->activity_id->'import';
    actual_revision:=null; actual_sha:=null;
    select revision,fingerprint_sha256 into actual_revision,actual_sha from builder_open_response_imports
    where book_component_id=release_row.book_component_id and activity_key=activity_id;
    if coalesce(actual_revision,0)<>(expected->>'revision')::bigint or (actual_revision is not null and actual_sha<>expected->>'sha256') then return false; end if;
  end loop;

  if release_row.compiler_id='ultimate-b2-students-book-v1' then return true; end if;

  expected:=release_row.source_snapshot->'nativeIndex';
  actual_revision:=null; actual_sha:=null;
  select revision,payload_sha256 into actual_revision,actual_sha from builder_component_documents
  where book_component_id=release_row.book_component_id and document_type='native_activity_index' and document_key='default';
  if coalesce(actual_revision,0)<>(expected->>'revision')::bigint or coalesce(actual_sha,expected->>'sha256')<>expected->>'sha256' then return false; end if;

  for activity_id in select jsonb_object_keys(release_row.source_snapshot->'nativeActivities') loop
    expected:=release_row.source_snapshot->'nativeActivities'->activity_id->'public';
    actual_revision:=null; actual_sha:=null;
    select revision,payload_sha256 into actual_revision,actual_sha from builder_component_documents
    where book_component_id=release_row.book_component_id and document_type='native_activity_public' and document_key=activity_id;
    if coalesce(actual_revision,0)<>(expected->>'revision')::bigint or coalesce(actual_sha,'')<>expected->>'sha256' then return false; end if;
    expected:=release_row.source_snapshot->'nativeActivities'->activity_id->'teacher';
    actual_revision:=null; actual_sha:=null;
    select revision,payload_sha256 into actual_revision,actual_sha from builder_component_documents
    where book_component_id=release_row.book_component_id and document_type='native_activity_teacher' and document_key=activity_id;
    if coalesce(actual_revision,0)<>(expected->>'revision')::bigint or coalesce(actual_sha,'')<>expected->>'sha256' then return false; end if;
  end loop;

  if release_row.source_snapshot ? 'unitExtras' then
    expected:=release_row.source_snapshot->'unitExtras';
    actual_revision:=null; actual_sha:=null;
    select revision,payload_sha256 into actual_revision,actual_sha from builder_component_documents
    where book_component_id=release_row.book_component_id and document_type='unit_extras' and document_key='default';
    if coalesce(actual_revision,0)<>(expected->>'revision')::bigint or coalesce(actual_sha,expected->>'sha256')<>expected->>'sha256' then return false; end if;
  end if;
  if release_row.source_snapshot ? 'activityLifecycle' then
    expected:=release_row.source_snapshot->'activityLifecycle';
    actual_revision:=null; actual_sha:=null;
    select revision,payload_sha256 into actual_revision,actual_sha from builder_component_documents
    where book_component_id=release_row.book_component_id and document_type='activity_lifecycle' and document_key='default';
    if coalesce(actual_revision,0)<>(expected->>'revision')::bigint or coalesce(actual_sha,expected->>'sha256')<>expected->>'sha256' then return false; end if;
  end if;
  return true;
end;
$$;
