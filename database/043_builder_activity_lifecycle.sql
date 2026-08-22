-- Unified logical lifecycle and relocation for canonical and native Builder activities.
-- Canonical publisher sources and immutable publication releases are never rewritten.

create table if not exists builder_activity_lifecycle_mutations (
  id bigint generated always as identity primary key,
  book_component_id uuid not null references book_components(id) on delete restrict,
  client_mutation_id uuid not null,
  request_sha256 text not null check (request_sha256 ~ '^[a-f0-9]{64}$'),
  activity_id text not null check (activity_id ~ '^[a-z0-9][a-z0-9-]{0,127}$'),
  activity_family text not null check (activity_family in ('canonical','native')),
  operation text not null check (operation in ('retire','move')),
  source_page_id text not null,
  destination_page_id text,
  resulting_lifecycle_revision bigint not null check (resulting_lifecycle_revision >= 0),
  resulting_index_revision bigint not null check (resulting_index_revision >= 0),
  resulting_public_revision bigint not null check (resulting_public_revision >= 0),
  resulting_hotspot_revision bigint not null check (resulting_hotspot_revision >= 0),
  removed_hotspot_count int not null check (removed_hotspot_count >= 0),
  created_by_builder_user_id uuid not null references builder_users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique(book_component_id,client_mutation_id)
);

create index if not exists builder_activity_lifecycle_activity_idx
  on builder_activity_lifecycle_mutations(book_component_id,activity_id,created_at desc);

drop trigger if exists builder_activity_lifecycle_mutations_immutable on builder_activity_lifecycle_mutations;
create trigger builder_activity_lifecycle_mutations_immutable
before update or delete on builder_activity_lifecycle_mutations
for each row execute function reject_builder_component_document_revision_mutation();

create or replace function enforce_active_builder_canonical_document_update()
returns trigger language plpgsql as $$
begin
  if new.document_type='open_response' and exists(
    select 1 from builder_component_documents lifecycle
    where lifecycle.book_component_id=new.book_component_id
      and lifecycle.document_type='activity_lifecycle' and lifecycle.document_key='default'
      and lifecycle.payload->'activities'->new.document_key->>'status'='retired'
  ) then
    raise exception 'canonical activity is not active' using errcode='23514';
  end if;
  return new;
end;
$$;

drop trigger if exists builder_canonical_document_requires_active_lifecycle on builder_component_documents;
create trigger builder_canonical_document_requires_active_lifecycle
before insert or update on builder_component_documents
for each row execute function enforce_active_builder_canonical_document_update();

create or replace function enforce_active_builder_hotspot_targets()
returns trigger language plpgsql as $$
begin
  if new.document_type='hotspots' and exists(
    select 1
    from jsonb_each(coalesce(new.payload->'pages','{}'::jsonb)) page
    cross join lateral jsonb_array_elements(page.value) hotspot
    where exists(
      select 1 from builder_component_documents lifecycle
      where lifecycle.book_component_id=new.book_component_id
        and lifecycle.document_type='activity_lifecycle' and lifecycle.document_key='default'
        and (
          lifecycle.payload->'activities'->(hotspot->>'activityKey')->>'status'='retired'
          or (
            lifecycle.payload->'activities'->(hotspot->>'activityKey')->>'status'='active'
            and lifecycle.payload->'activities'->(hotspot->>'activityKey')->>'pageId'<>page.key
          )
        )
    ) or (
      exists(select 1 from builder_component_documents public
        where public.book_component_id=new.book_component_id and public.document_type='native_activity_public'
          and public.document_key=hotspot->>'activityKey')
      and (
        not builder_native_activity_is_active(new.book_component_id,hotspot->>'activityKey')
        or exists(select 1 from builder_component_documents public
          where public.book_component_id=new.book_component_id and public.document_type='native_activity_public'
            and public.document_key=hotspot->>'activityKey' and public.payload->'placement'->>'pageId'<>page.key)
      )
    )
  ) then
    raise exception 'hotspot target activity is not active' using errcode='23514';
  end if;
  return new;
end;
$$;

drop trigger if exists builder_hotspots_require_active_activity_targets on builder_component_documents;
create trigger builder_hotspots_require_active_activity_targets
before insert or update on builder_component_documents
for each row execute function enforce_active_builder_hotspot_targets();

create or replace function mutate_builder_activity_lifecycle(
  requested_book_slug text,
  requested_component_slug text,
  requested_activity_id text,
  requested_activity_family text,
  requested_operation text,
  expected_source_page_id text,
  authoritative_source_page_id text,
  requested_destination_page_id text,
  expected_lifecycle_revision bigint,
  requested_lifecycle_payload jsonb,
  requested_lifecycle_sha256 text,
  requested_lifecycle_schema_version text,
  expected_index_revision bigint,
  requested_index_payload jsonb,
  requested_index_sha256 text,
  requested_index_schema_version text,
  expected_public_revision bigint,
  requested_public_payload jsonb,
  requested_public_sha256 text,
  requested_public_schema_version text,
  expected_hotspot_revision bigint,
  requested_hotspot_payload jsonb,
  requested_hotspot_sha256 text,
  requested_hotspot_schema_version text,
  requested_hotspot_changed boolean,
  requested_removed_hotspot_count int,
  requested_request_sha256 text,
  actor_builder_user_id uuid,
  requested_client_mutation_id uuid
)
returns table(
  outcome text,
  activity_id text,
  lifecycle_revision bigint,
  index_revision bigint,
  public_revision bigint,
  hotspot_revision bigint,
  removed_hotspot_count int
)
language plpgsql as $$
declare
  resolved_package_id uuid;
  resolved_component_id uuid;
  lifecycle_document builder_component_documents%rowtype;
  index_document builder_component_documents%rowtype;
  public_document builder_component_documents%rowtype;
  hotspot_document builder_component_documents%rowtype;
  replay builder_activity_lifecycle_mutations%rowtype;
  lifecycle_base jsonb;
  current_entry jsonb;
  derived_lifecycle_payload jsonb;
  derived_index_payload jsonb;
  derived_public_payload jsonb;
  next_lifecycle_revision bigint;
  next_index_revision bigint;
  next_public_revision bigint;
  next_hotspot_revision bigint;
begin
  if requested_activity_family not in ('canonical','native')
    or requested_operation not in ('retire','move')
    or (requested_activity_family='native' and requested_operation='retire')
    or expected_source_page_id is null
    or authoritative_source_page_id is null
    or (requested_operation='move' and (requested_destination_page_id is null or requested_destination_page_id=expected_source_page_id))
  then
    return query select 'invalid_request'::text,requested_activity_id,0::bigint,0::bigint,0::bigint,0::bigint,0::int;
    return;
  end if;
  if not exists(select 1 from builder_users where id=actor_builder_user_id and status='active' and role='developer') then
    return query select 'unauthorized_actor'::text,null::text,0::bigint,0::bigint,0::bigint,0::bigint,0::int;
    return;
  end if;

  select package.id,component.id into resolved_package_id,resolved_component_id
  from book_packages package join book_components component on component.book_package_id=package.id
  where package.slug=requested_book_slug and component.slug=requested_component_slug limit 1;
  if resolved_component_id is null then
    return query select 'resource_not_found'::text,null::text,0::bigint,0::bigint,0::bigint,0::bigint,0::int;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('builder-native-activity-component:' || resolved_component_id::text,0));
  perform pg_advisory_xact_lock(hashtextextended('builder-publication-component:' || resolved_component_id::text,0));
  perform pg_advisory_xact_lock(hashtextextended('builder-activity-lifecycle:' || resolved_component_id::text || ':' || requested_activity_id,0));
  perform pg_advisory_xact_lock(hashtextextended(concat_ws(':','builder-document',requested_book_slug,requested_component_slug,'hotspots','default'),0));

  select * into replay from builder_activity_lifecycle_mutations
  where book_component_id=resolved_component_id and client_mutation_id=requested_client_mutation_id;
  if replay.id is not null then
    if replay.request_sha256<>requested_request_sha256 then
      return query select 'mutation_id_conflict'::text,replay.activity_id,replay.resulting_lifecycle_revision,
        replay.resulting_index_revision,replay.resulting_public_revision,replay.resulting_hotspot_revision,replay.removed_hotspot_count;
    else
      return query select 'idempotent'::text,replay.activity_id,replay.resulting_lifecycle_revision,
        replay.resulting_index_revision,replay.resulting_public_revision,replay.resulting_hotspot_revision,replay.removed_hotspot_count;
    end if;
    return;
  end if;

  select * into lifecycle_document from builder_component_documents
  where book_component_id=resolved_component_id and document_type='activity_lifecycle' and document_key='default' for update;
  select * into hotspot_document from builder_component_documents
  where book_component_id=resolved_component_id and document_type='hotspots' and document_key='default' for update;

  next_lifecycle_revision:=coalesce(lifecycle_document.revision,0);
  next_index_revision:=0;
  next_public_revision:=0;
  next_hotspot_revision:=coalesce(hotspot_document.revision,0);

  if coalesce(lifecycle_document.revision,0)<>expected_lifecycle_revision
    or coalesce(hotspot_document.revision,0)<>expected_hotspot_revision then
    return query select 'revision_conflict'::text,requested_activity_id,next_lifecycle_revision,0::bigint,0::bigint,next_hotspot_revision,0::int;
    return;
  end if;

  if requested_activity_family='canonical' then
    lifecycle_base:=coalesce(lifecycle_document.payload,'{"schemaVersion":"1.0","activities":{}}'::jsonb);
    current_entry:=lifecycle_base->'activities'->requested_activity_id;
    if current_entry->>'status'='retired' then
      return query select 'activity_not_active'::text,requested_activity_id,next_lifecycle_revision,0::bigint,0::bigint,next_hotspot_revision,0::int;
      return;
    end if;
    if (current_entry is null and authoritative_source_page_id<>expected_source_page_id)
      or (current_entry is not null and current_entry->>'pageId'<>expected_source_page_id) then
      return query select 'location_conflict'::text,requested_activity_id,next_lifecycle_revision,0::bigint,0::bigint,next_hotspot_revision,0::int;
      return;
    end if;
    derived_lifecycle_payload:=jsonb_set(
      lifecycle_base,
      array['activities',requested_activity_id],
      jsonb_build_object(
        'status',case when requested_operation='retire' then 'retired' else 'active' end,
        'pageId',case when requested_operation='retire' then expected_source_page_id else requested_destination_page_id end
      ),true
    );
    if derived_lifecycle_payload<>requested_lifecycle_payload then raise exception 'activity lifecycle candidate is invalid'; end if;
    next_lifecycle_revision:=next_lifecycle_revision+1;
    if lifecycle_document.id is null then
      insert into builder_component_documents(
        book_package_id,book_component_id,document_type,document_key,schema_version,revision,payload,payload_sha256,
        created_by_builder_user_id,updated_by_builder_user_id
      ) values(
        resolved_package_id,resolved_component_id,'activity_lifecycle','default',requested_lifecycle_schema_version,
        next_lifecycle_revision,requested_lifecycle_payload,requested_lifecycle_sha256,actor_builder_user_id,actor_builder_user_id
      ) returning * into lifecycle_document;
    else
      update builder_component_documents set schema_version=requested_lifecycle_schema_version,revision=next_lifecycle_revision,
        payload=requested_lifecycle_payload,payload_sha256=requested_lifecycle_sha256,
        updated_by_builder_user_id=actor_builder_user_id,updated_at=now() where id=lifecycle_document.id;
    end if;
    insert into builder_component_document_revisions(document_id,revision,payload,payload_sha256,changed_by_builder_user_id,client_mutation_id)
    values(lifecycle_document.id,next_lifecycle_revision,requested_lifecycle_payload,requested_lifecycle_sha256,actor_builder_user_id,requested_client_mutation_id);
  else
    select * into index_document from builder_component_documents
    where book_component_id=resolved_component_id and document_type='native_activity_index' and document_key='default' for update;
    select * into public_document from builder_component_documents
    where book_component_id=resolved_component_id and document_type='native_activity_public' and document_key=requested_activity_id for update;
    next_index_revision:=coalesce(index_document.revision,0);
    next_public_revision:=coalesce(public_document.revision,0);
    if index_document.id is null or public_document.id is null or not builder_native_activity_is_active(resolved_component_id,requested_activity_id) then
      return query select 'activity_not_active'::text,requested_activity_id,next_lifecycle_revision,next_index_revision,next_public_revision,next_hotspot_revision,0::int;
      return;
    end if;
    if index_document.revision<>expected_index_revision or public_document.revision<>expected_public_revision then
      return query select 'revision_conflict'::text,requested_activity_id,next_lifecycle_revision,next_index_revision,next_public_revision,next_hotspot_revision,0::int;
      return;
    end if;
    if public_document.payload->'placement'->>'pageId'<>expected_source_page_id or not exists(
      select 1 from jsonb_array_elements(index_document.payload->'activities') entry
      where entry->>'activityId'=requested_activity_id and entry->'placement'->>'pageId'=expected_source_page_id
    ) then
      return query select 'location_conflict'::text,requested_activity_id,next_lifecycle_revision,next_index_revision,next_public_revision,next_hotspot_revision,0::int;
      return;
    end if;
    select jsonb_set(index_document.payload,'{activities}',jsonb_agg(
      case when entry.value->>'activityId'=requested_activity_id
        then jsonb_set(entry.value,'{placement,pageId}',to_jsonb(requested_destination_page_id),true)
        else entry.value end order by entry.ordinality
    )) into derived_index_payload
    from jsonb_array_elements(index_document.payload->'activities') with ordinality entry(value,ordinality);
    derived_public_payload:=jsonb_set(public_document.payload,'{placement,pageId}',to_jsonb(requested_destination_page_id),true);
    if derived_index_payload<>requested_index_payload or derived_public_payload<>requested_public_payload then
      raise exception 'native activity relocation candidate is invalid';
    end if;
    next_index_revision:=index_document.revision+1;
    next_public_revision:=public_document.revision+1;
    update builder_component_documents set schema_version=requested_index_schema_version,revision=next_index_revision,
      payload=requested_index_payload,payload_sha256=requested_index_sha256,updated_by_builder_user_id=actor_builder_user_id,updated_at=now()
    where id=index_document.id;
    update builder_component_documents set schema_version=requested_public_schema_version,revision=next_public_revision,
      payload=requested_public_payload,payload_sha256=requested_public_sha256,updated_by_builder_user_id=actor_builder_user_id,updated_at=now()
    where id=public_document.id;
    insert into builder_component_document_revisions(document_id,revision,payload,payload_sha256,changed_by_builder_user_id,client_mutation_id)
    values(index_document.id,next_index_revision,requested_index_payload,requested_index_sha256,actor_builder_user_id,requested_client_mutation_id);
    insert into builder_component_document_revisions(document_id,revision,payload,payload_sha256,changed_by_builder_user_id,client_mutation_id)
    values(public_document.id,next_public_revision,requested_public_payload,requested_public_sha256,actor_builder_user_id,requested_client_mutation_id);
  end if;

  if requested_hotspot_changed then
    next_hotspot_revision:=next_hotspot_revision+1;
    if hotspot_document.id is null then
      insert into builder_component_documents(
        book_package_id,book_component_id,document_type,document_key,schema_version,revision,payload,payload_sha256,
        created_by_builder_user_id,updated_by_builder_user_id
      ) values(
        resolved_package_id,resolved_component_id,'hotspots','default',requested_hotspot_schema_version,next_hotspot_revision,
        requested_hotspot_payload,requested_hotspot_sha256,actor_builder_user_id,actor_builder_user_id
      ) returning * into hotspot_document;
    else
      update builder_component_documents set schema_version=requested_hotspot_schema_version,revision=next_hotspot_revision,
        payload=requested_hotspot_payload,payload_sha256=requested_hotspot_sha256,
        updated_by_builder_user_id=actor_builder_user_id,updated_at=now() where id=hotspot_document.id;
    end if;
    insert into builder_component_document_revisions(document_id,revision,payload,payload_sha256,changed_by_builder_user_id,client_mutation_id)
    values(hotspot_document.id,next_hotspot_revision,requested_hotspot_payload,requested_hotspot_sha256,actor_builder_user_id,requested_client_mutation_id);
  end if;

  insert into builder_activity_lifecycle_mutations(
    book_component_id,client_mutation_id,request_sha256,activity_id,activity_family,operation,source_page_id,destination_page_id,
    resulting_lifecycle_revision,resulting_index_revision,resulting_public_revision,resulting_hotspot_revision,removed_hotspot_count,
    created_by_builder_user_id
  ) values(
    resolved_component_id,requested_client_mutation_id,requested_request_sha256,requested_activity_id,requested_activity_family,
    requested_operation,expected_source_page_id,requested_destination_page_id,next_lifecycle_revision,next_index_revision,
    next_public_revision,next_hotspot_revision,requested_removed_hotspot_count,actor_builder_user_id
  );
  insert into builder_audit_log(builder_user_id,action,target_type,target_id,metadata)
  values(actor_builder_user_id,'activity_' || case when requested_operation='retire' then 'retired' else 'moved' end,
    'book_component',resolved_component_id::text,jsonb_build_object(
      'book_slug',requested_book_slug,'component_slug',requested_component_slug,'activity_id',requested_activity_id,
      'activity_family',requested_activity_family,'source_page_id',expected_source_page_id,
      'destination_page_id',requested_destination_page_id,'lifecycle_revision',next_lifecycle_revision,
      'index_revision',next_index_revision,'public_revision',next_public_revision,
      'hotspot_revision',next_hotspot_revision,'removed_hotspot_count',requested_removed_hotspot_count
    ));

  return query select case when requested_operation='retire' then 'retired' else 'moved' end,
    requested_activity_id,next_lifecycle_revision,next_index_revision,next_public_revision,next_hotspot_revision,requested_removed_hotspot_count;
end;
$$;
