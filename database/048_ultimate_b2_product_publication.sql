-- Atomic Ultimate B2 product releases. Existing component releases remain immutable and are
-- backfilled as truthful Students-only families. Rollback may remove these new product tables
-- only before product publication is used; after product events exist, immutable history must be
-- retained and a forward migration must supersede this contract.

create table if not exists book_product_releases (
  id uuid primary key,
  book_package_id uuid not null references book_packages(id) on delete restrict,
  release_number bigint not null check (release_number >= 1),
  release_schema_version text not null check (release_schema_version ~ '^[0-9]+\.[0-9]+$'),
  compiler_id text not null check (compiler_id ~ '^[a-z0-9][a-z0-9-]{2,127}$'),
  source_snapshot_sha256 text not null check (source_snapshot_sha256 ~ '^[a-f0-9]{64}$'),
  release_sha256 text not null check (release_sha256 ~ '^[a-f0-9]{64}$'),
  request_sha256 text not null check (request_sha256 ~ '^[a-f0-9]{64}$'),
  client_mutation_id uuid not null,
  release_note text check (release_note is null or length(release_note) <= 240),
  created_by_builder_user_id uuid not null references builder_users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint book_product_releases_scope_unique unique (id,book_package_id),
  constraint book_product_releases_number_unique unique (book_package_id,release_number),
  constraint book_product_releases_mutation_unique unique (book_package_id,client_mutation_id)
);

create table if not exists book_product_release_members (
  product_release_id uuid not null,
  book_package_id uuid not null,
  book_component_id uuid not null,
  member_order int not null check (member_order between 1 and 64),
  member_status text not null check (member_status in ('included','unavailable')),
  component_release_id uuid,
  component_compiler_id text,
  component_release_schema_version text,
  component_release_sha256 text,
  runtime_compatibility_sha256 text,
  member_sha256 text not null check (member_sha256 ~ '^[a-f0-9]{64}$'),
  unavailable_reason text check (unavailable_reason is null or unavailable_reason ~ '^[a-z0-9][a-z0-9_]{2,63}$'),
  created_at timestamptz not null default now(),
  primary key(product_release_id,book_component_id),
  constraint book_product_release_members_family_scope_fk foreign key(product_release_id,book_package_id)
    references book_product_releases(id,book_package_id) on delete restrict,
  constraint book_product_release_members_component_scope_fk foreign key(book_component_id,book_package_id)
    references book_components(id,book_package_id) on delete restrict,
  constraint book_product_release_members_release_scope_fk foreign key(component_release_id,book_component_id,book_package_id)
    references book_component_releases(id,book_component_id,book_package_id) on delete restrict,
  constraint book_product_release_members_order_unique unique(product_release_id,member_order),
  constraint book_product_release_members_state_check check (
    (member_status='included' and component_release_id is not null and component_compiler_id is not null
      and component_compiler_id ~ '^[a-z0-9][a-z0-9-]{2,127}$'
      and component_release_schema_version ~ '^[0-9]+\.[0-9]+$'
      and component_release_sha256 ~ '^[a-f0-9]{64}$'
      and runtime_compatibility_sha256 ~ '^[a-f0-9]{64}$' and unavailable_reason is null)
    or
    (member_status='unavailable' and component_release_id is null and component_compiler_id is null
      and component_release_schema_version is null and component_release_sha256 is null
      and runtime_compatibility_sha256 is null and unavailable_reason is not null)
  )
);

create unique index if not exists book_product_release_members_component_release_unique
  on book_product_release_members(component_release_id) where component_release_id is not null;

create table if not exists book_product_publication_heads (
  book_package_id uuid primary key references book_packages(id) on delete restrict,
  product_release_id uuid not null unique,
  head_revision bigint not null check (head_revision >= 1),
  published_by_builder_user_id uuid not null references builder_users(id) on delete restrict,
  published_at timestamptz not null default now(),
  constraint book_product_publication_heads_release_scope_fk foreign key(product_release_id,book_package_id)
    references book_product_releases(id,book_package_id) on delete restrict
);

create table if not exists book_product_publication_events (
  id bigint generated always as identity primary key,
  book_package_id uuid not null references book_packages(id) on delete restrict,
  previous_product_release_id uuid,
  product_release_id uuid not null,
  expected_head_revision bigint not null check (expected_head_revision >= 0),
  resulting_head_revision bigint not null check (resulting_head_revision >= 1),
  request_sha256 text not null check (request_sha256 ~ '^[a-f0-9]{64}$'),
  client_mutation_id uuid not null,
  published_by_builder_user_id uuid not null references builder_users(id) on delete restrict,
  published_at timestamptz not null default now(),
  constraint book_product_publication_events_release_scope_fk foreign key(product_release_id,book_package_id)
    references book_product_releases(id,book_package_id) on delete restrict,
  constraint book_product_publication_events_previous_scope_fk foreign key(previous_product_release_id,book_package_id)
    references book_product_releases(id,book_package_id) on delete restrict,
  constraint book_product_publication_events_mutation_unique unique(book_package_id,client_mutation_id)
);

create table if not exists book_product_publication_mutations (
  id bigint generated always as identity primary key,
  book_package_id uuid not null references book_packages(id) on delete restrict,
  product_release_id uuid not null,
  request_sha256 text not null check (request_sha256 ~ '^[a-f0-9]{64}$'),
  client_mutation_id uuid not null,
  outcome text not null check (outcome in ('published','already_active')),
  resulting_head_revision bigint not null check (resulting_head_revision >= 1),
  previous_product_release_id uuid,
  published_at timestamptz not null,
  constraint book_product_publication_mutations_release_scope_fk foreign key(product_release_id,book_package_id)
    references book_product_releases(id,book_package_id) on delete restrict,
  constraint book_product_publication_mutations_previous_scope_fk foreign key(previous_product_release_id,book_package_id)
    references book_product_releases(id,book_package_id) on delete restrict,
  constraint book_product_publication_mutations_unique unique(book_package_id,client_mutation_id)
);

create or replace function builder_product_member_sha256(
  requested_order int,requested_component_slug text,requested_status text,requested_component_release_id uuid,
  requested_compiler_id text,requested_release_schema_version text,requested_release_sha256 text,
  requested_compatibility text,requested_unavailable_reason text
)
returns text language sql immutable as $$
  select encode(digest(convert_to(array_to_string(array[
    'ultimate-b2-product-member-v1',requested_order::text,requested_component_slug,requested_status,
    coalesce(requested_component_release_id::text,'-'),coalesce(requested_compiler_id,'-'),
    coalesce(requested_release_schema_version,'-'),coalesce(requested_release_sha256,'-'),
    coalesce(requested_compatibility,'-'),coalesce(requested_unavailable_reason,'-')
  ],E'\n'),'UTF8'),'sha256'),'hex')
$$;

create or replace function builder_product_source_sha256(
  requested_book_slug text,requested_release_number bigint,requested_component_slugs text[],requested_member_hashes text[]
)
returns text language plpgsql immutable as $$
declare fingerprint text;
begin
  if cardinality(requested_component_slugs)<>cardinality(requested_member_hashes) then raise exception 'product member hash topology is invalid'; end if;
  fingerprint:=array_to_string(array['ultimate-b2-product-source-v1',requested_book_slug,requested_release_number::text],E'\n');
  for position in 1..cardinality(requested_component_slugs) loop
    fingerprint:=fingerprint||E'\n'||requested_component_slugs[position]||E'\t'||requested_member_hashes[position];
  end loop;
  return encode(digest(convert_to(fingerprint,'UTF8'),'sha256'),'hex');
end;
$$;

create or replace function builder_product_release_sha256(
  requested_compiler_id text,requested_release_schema_version text,requested_book_slug text,requested_release_number bigint,
  requested_source_sha256 text,requested_release_note text,requested_component_slugs text[],requested_member_hashes text[]
)
returns text language plpgsql immutable as $$
declare fingerprint text;
begin
  if cardinality(requested_component_slugs)<>cardinality(requested_member_hashes) then raise exception 'product member hash topology is invalid'; end if;
  fingerprint:=array_to_string(array['ultimate-b2-product-release-v1',requested_compiler_id,requested_release_schema_version,
    requested_book_slug,requested_release_number::text,requested_source_sha256,coalesce(requested_release_note,'')],E'\n');
  for position in 1..cardinality(requested_component_slugs) loop
    fingerprint:=fingerprint||E'\n'||requested_component_slugs[position]||E'\t'||requested_member_hashes[position];
  end loop;
  return encode(digest(convert_to(fingerprint,'UTF8'),'sha256'),'hex');
end;
$$;

create or replace function builder_legacy_product_release_id(component_release_id uuid)
returns uuid language sql immutable strict as $$
  with fingerprint as (
    select encode(digest(convert_to('hhplms-product-release-legacy-v1:'||component_release_id::text,'UTF8'),'sha256'),'hex') value
  )
  select (substr(value,1,8)||'-'||substr(value,9,4)||'-5'||substr(value,14,3)||'-8'||substr(value,18,3)||'-'||substr(value,21,12))::uuid from fingerprint
$$;

do $$
begin
  if exists(
    select 1 from book_component_releases release
    join book_components component on component.id=release.book_component_id
    join book_packages package on package.id=release.book_package_id
    where package.slug='ultimate-b2' and component.slug='ultimate-b2-students-book'
  ) and not exists(
    select 1 from book_packages package
    join book_components students on students.book_package_id=package.id and students.slug='ultimate-b2-students-book'
    join book_components workbook on workbook.book_package_id=package.id and workbook.slug='ultimate-b2-workbook'
    join book_components grammar on grammar.book_package_id=package.id and grammar.slug='ultimate-b2-grammar-book'
    where package.slug='ultimate-b2'
  ) then raise exception 'Ultimate B2 legacy product backfill requires the canonical component set'; end if;
end;
$$;

with legacy as (
  select release.*,package.slug book_slug,
    builder_product_member_sha256(1,students.slug,'included',release.id,release.compiler_id,release.release_schema_version,release.release_sha256,release.runtime_compatibility_sha256,null) students_hash,
    builder_product_member_sha256(2,workbook.slug,'unavailable',null,null,null,null,null,'not_in_legacy_release') workbook_hash,
    builder_product_member_sha256(3,grammar.slug,'unavailable',null,null,null,null,null,'not_in_legacy_release') grammar_hash
  from book_component_releases release
  join book_packages package on package.id=release.book_package_id and package.slug='ultimate-b2'
  join book_components students on students.id=release.book_component_id and students.slug='ultimate-b2-students-book'
  join book_components workbook on workbook.book_package_id=package.id and workbook.slug='ultimate-b2-workbook'
  join book_components grammar on grammar.book_package_id=package.id and grammar.slug='ultimate-b2-grammar-book'
), fingerprinted as (
  select legacy.*,array['ultimate-b2-students-book','ultimate-b2-workbook','ultimate-b2-grammar-book'] component_slugs,
    array[students_hash,workbook_hash,grammar_hash] member_hashes,
    builder_product_source_sha256(book_slug,release_number,array['ultimate-b2-students-book','ultimate-b2-workbook','ultimate-b2-grammar-book'],array[students_hash,workbook_hash,grammar_hash]) product_source_sha256
  from legacy
)
insert into book_product_releases(id,book_package_id,release_number,release_schema_version,compiler_id,source_snapshot_sha256,release_sha256,request_sha256,client_mutation_id,release_note,created_by_builder_user_id,created_at)
select builder_legacy_product_release_id(id),book_package_id,release_number,'1.0','ultimate-b2-product-legacy-v1',product_source_sha256,
  builder_product_release_sha256('ultimate-b2-product-legacy-v1','1.0',book_slug,release_number,product_source_sha256,release_note,component_slugs,member_hashes),
  encode(digest(convert_to('ultimate-b2-legacy-product-request-v1:'||id::text,'UTF8'),'sha256'),'hex'),client_mutation_id,release_note,created_by_builder_user_id,created_at
from fingerprinted on conflict(book_package_id,release_number) do nothing;

with legacy as (
  select product.id product_release_id,product.book_package_id,release.id component_release_id,students.id students_id,workbook.id workbook_id,grammar.id grammar_id,
    students.slug students_slug,workbook.slug workbook_slug,grammar.slug grammar_slug,release.compiler_id,release.release_schema_version,release.release_sha256,release.runtime_compatibility_sha256
  from book_product_releases product
  join book_packages package on package.id=product.book_package_id and package.slug='ultimate-b2'
  join book_components students on students.book_package_id=package.id and students.slug='ultimate-b2-students-book'
  join book_component_releases release on release.book_component_id=students.id and release.release_number=product.release_number
  join book_components workbook on workbook.book_package_id=package.id and workbook.slug='ultimate-b2-workbook'
  join book_components grammar on grammar.book_package_id=package.id and grammar.slug='ultimate-b2-grammar-book'
  where product.compiler_id='ultimate-b2-product-legacy-v1'
), members as (
  select product_release_id,book_package_id,students_id book_component_id,1 member_order,'included' member_status,component_release_id,
    compiler_id component_compiler_id,release_schema_version component_release_schema_version,release_sha256 component_release_sha256,
    runtime_compatibility_sha256,null::text unavailable_reason,students_slug component_slug from legacy
  union all
  select product_release_id,book_package_id,workbook_id,2,'unavailable',null,null,null,null,null,'not_in_legacy_release',workbook_slug from legacy
  union all
  select product_release_id,book_package_id,grammar_id,3,'unavailable',null,null,null,null,null,'not_in_legacy_release',grammar_slug from legacy
)
insert into book_product_release_members(product_release_id,book_package_id,book_component_id,member_order,member_status,component_release_id,component_compiler_id,component_release_schema_version,component_release_sha256,runtime_compatibility_sha256,member_sha256,unavailable_reason)
select product_release_id,book_package_id,book_component_id,member_order,member_status,component_release_id,component_compiler_id,component_release_schema_version,component_release_sha256,runtime_compatibility_sha256,
  builder_product_member_sha256(member_order,component_slug,member_status,component_release_id,component_compiler_id,component_release_schema_version,component_release_sha256,runtime_compatibility_sha256,unavailable_reason),unavailable_reason
from members on conflict(product_release_id,book_component_id) do nothing;

insert into book_product_publication_heads(book_package_id,product_release_id,head_revision,published_by_builder_user_id,published_at)
select head.book_package_id,product.id,head.head_revision,head.published_by_builder_user_id,head.published_at
from book_component_publication_heads head
join book_components component on component.id=head.book_component_id and component.slug='ultimate-b2-students-book'
join book_packages package on package.id=head.book_package_id and package.slug='ultimate-b2'
join book_component_releases release on release.id=head.release_id
join book_product_releases product on product.book_package_id=package.id and product.release_number=release.release_number and product.compiler_id='ultimate-b2-product-legacy-v1'
on conflict(book_package_id) do nothing;

insert into book_product_publication_events(book_package_id,previous_product_release_id,product_release_id,expected_head_revision,resulting_head_revision,request_sha256,client_mutation_id,published_by_builder_user_id,published_at)
select event.book_package_id,previous_product.id,product.id,event.expected_head_revision,event.resulting_head_revision,event.request_sha256,event.client_mutation_id,event.published_by_builder_user_id,event.published_at
from book_component_publication_events event
join book_components component on component.id=event.book_component_id and component.slug='ultimate-b2-students-book'
join book_packages package on package.id=event.book_package_id and package.slug='ultimate-b2'
join book_component_releases release on release.id=event.release_id
join book_product_releases product on product.book_package_id=package.id and product.release_number=release.release_number and product.compiler_id='ultimate-b2-product-legacy-v1'
left join book_component_releases previous_release on previous_release.id=event.previous_release_id
left join book_product_releases previous_product on previous_product.book_package_id=package.id and previous_product.release_number=previous_release.release_number and previous_product.compiler_id='ultimate-b2-product-legacy-v1'
on conflict(book_package_id,client_mutation_id) do nothing;

insert into book_product_publication_mutations(book_package_id,product_release_id,request_sha256,client_mutation_id,outcome,resulting_head_revision,previous_product_release_id,published_at)
select component.book_package_id,product.id,mutation.request_sha256,mutation.client_mutation_id,mutation.outcome,mutation.resulting_head_revision,previous_product.id,mutation.published_at
from book_component_publication_mutations mutation
join book_components component on component.id=mutation.book_component_id and component.slug='ultimate-b2-students-book'
join book_packages package on package.id=component.book_package_id and package.slug='ultimate-b2'
join book_component_releases release on release.id=mutation.release_id
join book_product_releases product on product.book_package_id=package.id and product.release_number=release.release_number and product.compiler_id='ultimate-b2-product-legacy-v1'
left join book_component_releases previous_release on previous_release.id=mutation.previous_release_id
left join book_product_releases previous_product on previous_product.book_package_id=package.id and previous_product.release_number=previous_release.release_number and previous_product.compiler_id='ultimate-b2-product-legacy-v1'
on conflict(book_package_id,client_mutation_id) do nothing;

create or replace function create_builder_product_release(
  requested_product_release_id uuid,requested_book_slug text,requested_release_schema_version text,requested_compiler_id text,
  requested_members jsonb,requested_request_sha256 text,requested_release_note text,actor_builder_user_id uuid,requested_client_mutation_id uuid
)
returns table(outcome text,product_release_id uuid,product_release_number bigint,source_snapshot_sha256 text,release_sha256 text,members jsonb)
language plpgsql as $$
declare
  resolved_package_id uuid; replay book_product_releases%rowtype; inserted_product book_product_releases%rowtype;
  member jsonb; member_position int; component_id uuid; component_release book_component_releases%rowtype;
  next_product_number bigint; next_component_number bigint; member_hashes text[]:='{}'; component_slugs text[]:=array['ultimate-b2-students-book','ultimate-b2-workbook','ultimate-b2-grammar-book'];
  expected_compilers text[]:=array['ultimate-b2-students-book-v2','ultimate-b2-workbook-v1','ultimate-b2-grammar-book-v1'];
  expected_schemas text[]:=array['2.0','1.0','1.0']; product_source_hash text; product_hash text;
begin
  if requested_book_slug<>'ultimate-b2' or requested_release_schema_version<>'1.0' or requested_compiler_id<>'ultimate-b2-product-v1'
    or jsonb_typeof(requested_members)<>'array' or jsonb_array_length(requested_members)<>3
    or requested_request_sha256!~'^[a-f0-9]{64}$' or length(coalesce(requested_release_note,''))>240 then
    return query select 'invalid_request',null::uuid,null::bigint,null::text,null::text,null::jsonb; return;
  end if;
  if not exists(select 1 from builder_users where id=actor_builder_user_id and status='active' and role='developer') then
    return query select 'unauthorized_actor',null::uuid,null::bigint,null::text,null::text,null::jsonb; return;
  end if;
  select id into resolved_package_id from book_packages where slug=requested_book_slug;
  if resolved_package_id is null then return query select 'product_not_found',null::uuid,null::bigint,null::text,null::text,null::jsonb; return; end if;
  perform pg_advisory_xact_lock(hashtextextended('builder-product-publication:'||resolved_package_id::text,0));
  select * into replay from book_product_releases where book_package_id=resolved_package_id and client_mutation_id=requested_client_mutation_id;
  if replay.id is not null then
    return query select case when replay.request_sha256=requested_request_sha256 then 'idempotent' else 'mutation_id_conflict' end,
      replay.id,replay.release_number,replay.source_snapshot_sha256,replay.release_sha256,
      (select jsonb_agg(jsonb_build_object('componentSlug',component.slug,'order',family_member.member_order,'status',family_member.member_status,
        'componentReleaseId',family_member.component_release_id,'compilerId',family_member.component_compiler_id,'releaseSchemaVersion',family_member.component_release_schema_version,
        'releaseSha256',family_member.component_release_sha256,'compatibility',family_member.runtime_compatibility_sha256,'memberSha256',family_member.member_sha256,
        'unavailableReason',family_member.unavailable_reason) order by family_member.member_order)
       from book_product_release_members family_member join book_components component on component.id=family_member.book_component_id where family_member.product_release_id=replay.id);
    return;
  end if;
  for member,member_position in select value,ordinality::int from jsonb_array_elements(requested_members) with ordinality loop
    if member->>'componentSlug'<>component_slugs[member_position] or member->>'compilerId'<>expected_compilers[member_position]
      or member->>'releaseSchemaVersion'<>expected_schemas[member_position] then raise exception 'product member identity is invalid'; end if;
    select id into component_id from book_components where book_package_id=resolved_package_id and slug=component_slugs[member_position];
    if component_id is null then raise exception 'product member component is unavailable'; end if;
    perform pg_advisory_xact_lock(hashtextextended('builder-publication-component:'||component_id::text,0));
  end loop;
  select coalesce(max(release_number),0)+1 into next_product_number from book_product_releases where book_package_id=resolved_package_id;
  for member,member_position in select value,ordinality::int from jsonb_array_elements(requested_members) with ordinality loop
    select id into component_id from book_components where book_package_id=resolved_package_id and slug=component_slugs[member_position];
    select coalesce(max(release_number),0)+1 into next_component_number from book_component_releases where book_component_id=component_id;
    insert into book_component_releases(id,book_package_id,book_component_id,release_number,release_schema_version,compiler_id,runtime_compatibility_sha256,
      source_snapshot,source_snapshot_sha256,public_projection,public_projection_sha256,teacher_projection,teacher_projection_sha256,asset_manifest,
      release_sha256,request_sha256,client_mutation_id,release_note,created_by_builder_user_id)
    values((member->>'releaseId')::uuid,resolved_package_id,component_id,next_component_number,member->>'releaseSchemaVersion',member->>'compilerId',member->>'compatibility',
      member->'sourceSnapshot',member->>'sourceSnapshotSha256',member->'publicProjection',member->>'publicProjectionSha256',member->'teacherProjection',member->>'teacherProjectionSha256',member->'assetManifest',
      member->>'releaseSha256',member->>'requestSha256',requested_client_mutation_id,nullif(trim(requested_release_note),''),actor_builder_user_id)
    returning * into component_release;
    member_hashes:=array_append(member_hashes,builder_product_member_sha256(member_position,component_slugs[member_position],'included',component_release.id,
      component_release.compiler_id,component_release.release_schema_version,component_release.release_sha256,component_release.runtime_compatibility_sha256,null));
  end loop;
  product_source_hash:=builder_product_source_sha256(requested_book_slug,next_product_number,component_slugs,member_hashes);
  product_hash:=builder_product_release_sha256(requested_compiler_id,requested_release_schema_version,requested_book_slug,next_product_number,product_source_hash,requested_release_note,component_slugs,member_hashes);
  insert into book_product_releases(id,book_package_id,release_number,release_schema_version,compiler_id,source_snapshot_sha256,release_sha256,request_sha256,client_mutation_id,release_note,created_by_builder_user_id)
  values(requested_product_release_id,resolved_package_id,next_product_number,requested_release_schema_version,requested_compiler_id,product_source_hash,product_hash,requested_request_sha256,requested_client_mutation_id,nullif(trim(requested_release_note),''),actor_builder_user_id)
  returning * into inserted_product;
  for member,member_position in select value,ordinality::int from jsonb_array_elements(requested_members) with ordinality loop
    insert into book_product_release_members(product_release_id,book_package_id,book_component_id,member_order,member_status,component_release_id,component_compiler_id,
      component_release_schema_version,component_release_sha256,runtime_compatibility_sha256,member_sha256)
    select inserted_product.id,resolved_package_id,component.id,member_position,'included',release.id,release.compiler_id,release.release_schema_version,
      release.release_sha256,release.runtime_compatibility_sha256,member_hashes[member_position]
    from book_components component join book_component_releases release on release.book_component_id=component.id
    where component.book_package_id=resolved_package_id and component.slug=component_slugs[member_position] and release.id=(member->>'releaseId')::uuid;
  end loop;
  insert into builder_audit_log(builder_user_id,action,target_type,target_id,metadata) values(actor_builder_user_id,'product_preview_release_created','book_product_release',inserted_product.id::text,
    jsonb_build_object('book_slug',requested_book_slug,'release_number',inserted_product.release_number,'release_sha256',inserted_product.release_sha256,'components',component_slugs));
  return query select 'created',inserted_product.id,inserted_product.release_number,inserted_product.source_snapshot_sha256,inserted_product.release_sha256,
    (select jsonb_agg(jsonb_build_object('componentSlug',component.slug,'order',family_member.member_order,'status',family_member.member_status,
      'componentReleaseId',family_member.component_release_id,'compilerId',family_member.component_compiler_id,'releaseSchemaVersion',family_member.component_release_schema_version,
      'releaseSha256',family_member.component_release_sha256,'compatibility',family_member.runtime_compatibility_sha256,'memberSha256',family_member.member_sha256,
      'unavailableReason',family_member.unavailable_reason) order by family_member.member_order)
     from book_product_release_members family_member join book_components component on component.id=family_member.book_component_id where family_member.product_release_id=inserted_product.id);
end;
$$;

create or replace function builder_managed_release_sources_are_current(requested_release_id uuid)
returns boolean language plpgsql volatile as $$
declare
  release_row book_component_releases%rowtype; expected jsonb; actual_revision bigint; actual_sha text; activity_id text;
begin
  select * into release_row from book_component_releases where id=requested_release_id;
  if release_row.id is null or not (
    (release_row.compiler_id='ultimate-b2-workbook-v1' and release_row.release_schema_version='1.0')
    or (release_row.compiler_id='ultimate-b2-grammar-book-v1' and release_row.release_schema_version='1.0')
  ) then return false; end if;
  expected:=release_row.source_snapshot->'pages';
  select revision into actual_revision from builder_component_page_revisions where book_component_id=release_row.book_component_id;
  if coalesce(actual_revision,0)<>(expected->>'revision')::bigint then return false; end if;
  for expected in select value from jsonb_array_elements(jsonb_build_array(
    jsonb_build_object('documentType','hotspots','source',release_row.source_snapshot->'hotspots'),
    jsonb_build_object('documentType','activity_lifecycle','source',release_row.source_snapshot->'activityLifecycle'),
    jsonb_build_object('documentType','native_activity_index','source',release_row.source_snapshot->'nativeIndex')
  )) loop
    actual_revision:=null; actual_sha:=null;
    select revision,payload_sha256 into actual_revision,actual_sha from builder_component_documents
    where book_component_id=release_row.book_component_id and document_type=expected->>'documentType' and document_key='default';
    if coalesce(actual_revision,0)<>(expected->'source'->>'revision')::bigint
      or coalesce(actual_sha,expected->'source'->>'sha256')<>expected->'source'->>'sha256' then return false; end if;
  end loop;
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
  return true;
end;
$$;

create or replace function builder_product_release_sources_are_current(requested_product_release_id uuid)
returns boolean language plpgsql volatile as $$
declare member record;
begin
  if not exists(select 1 from book_product_releases where id=requested_product_release_id) then return false; end if;
  for member in select family_member.*,release.compiler_id from book_product_release_members family_member
    left join book_component_releases release on release.id=family_member.component_release_id
    where family_member.product_release_id=requested_product_release_id order by family_member.member_order loop
    if member.member_status='included' and not (
      case when member.compiler_id in ('ultimate-b2-workbook-v1','ultimate-b2-grammar-book-v1')
        then builder_managed_release_sources_are_current(member.component_release_id)
        else builder_release_sources_are_current(member.component_release_id) end
    ) then return false; end if;
  end loop;
  return true;
end;
$$;

create or replace function publish_builder_product_release(
  requested_book_slug text,requested_product_release_id uuid,expected_head_revision bigint,requested_request_sha256 text,
  actor_builder_user_id uuid,requested_client_mutation_id uuid
)
returns table(outcome text,product_release_id uuid,product_release_number bigint,head_revision bigint,previous_product_release_id uuid,published_at timestamptz)
language plpgsql as $$
declare
  resolved_package_id uuid; candidate book_product_releases%rowtype; replay book_product_publication_mutations%rowtype;
  current_head book_product_publication_heads%rowtype; component_head book_component_publication_heads%rowtype; member record;
  next_head_revision bigint; next_component_revision bigint; publication_time timestamptz:=now(); included_count int;
begin
  if not exists(select 1 from builder_users where id=actor_builder_user_id and status='active' and role='developer') then
    return query select 'unauthorized_actor',null::uuid,null::bigint,null::bigint,null::uuid,null::timestamptz; return; end if;
  select id into resolved_package_id from book_packages where slug=requested_book_slug;
  if resolved_package_id is null then return query select 'product_not_found',null::uuid,null::bigint,null::bigint,null::uuid,null::timestamptz; return; end if;
  perform pg_advisory_xact_lock(hashtextextended('builder-product-publication:'||resolved_package_id::text,0));
  select * into replay from book_product_publication_mutations where book_package_id=resolved_package_id and client_mutation_id=requested_client_mutation_id;
  if replay.id is not null then
    select * into candidate from book_product_releases where id=replay.product_release_id;
    return query select case when replay.product_release_id=requested_product_release_id and replay.request_sha256=requested_request_sha256 then 'idempotent' else 'mutation_id_conflict' end,
      replay.product_release_id,candidate.release_number,replay.resulting_head_revision,replay.previous_product_release_id,replay.published_at; return;
  end if;
  select * into candidate from book_product_releases where id=requested_product_release_id and book_package_id=resolved_package_id;
  if candidate.id is null then return query select 'release_not_found',null::uuid,null::bigint,null::bigint,null::uuid,null::timestamptz; return; end if;
  select count(*) into included_count from book_product_release_members family_member
  where family_member.product_release_id=candidate.id and family_member.member_status='included';
  if candidate.compiler_id<>'ultimate-b2-product-v1' or included_count<>3 then return query select 'incomplete_product_release',candidate.id,candidate.release_number,null::bigint,null::uuid,null::timestamptz; return; end if;
  for member in select family_member.*,component.slug from book_product_release_members family_member join book_components component on component.id=family_member.book_component_id
    where family_member.product_release_id=candidate.id and family_member.member_status='included' order by component.slug loop
    perform pg_advisory_xact_lock(hashtextextended('builder-publication-component:'||member.book_component_id::text,0));
  end loop;
  select * into current_head from book_product_publication_heads where book_package_id=resolved_package_id for update;
  if coalesce(current_head.head_revision,0)<>expected_head_revision then return query select 'head_conflict',candidate.id,candidate.release_number,coalesce(current_head.head_revision,0),current_head.product_release_id,current_head.published_at; return; end if;
  if current_head.product_release_id=candidate.id then
    insert into book_product_publication_mutations(book_package_id,product_release_id,request_sha256,client_mutation_id,outcome,resulting_head_revision,previous_product_release_id,published_at)
    values(resolved_package_id,candidate.id,requested_request_sha256,requested_client_mutation_id,'already_active',current_head.head_revision,current_head.product_release_id,current_head.published_at);
    return query select 'already_active',candidate.id,candidate.release_number,current_head.head_revision,current_head.product_release_id,current_head.published_at; return;
  end if;
  if not builder_product_release_sources_are_current(candidate.id) then return query select 'stale_release_preview',candidate.id,candidate.release_number,coalesce(current_head.head_revision,0),current_head.product_release_id,current_head.published_at; return; end if;
  for member in select family_member.*,component.slug from book_product_release_members family_member join book_components component on component.id=family_member.book_component_id
    where family_member.product_release_id=candidate.id and family_member.member_status='included' order by component.slug loop
    select * into component_head from book_component_publication_heads where book_component_id=member.book_component_id for update;
    next_component_revision:=coalesce(component_head.head_revision,0)+1;
    insert into book_component_publication_heads(book_component_id,book_package_id,release_id,head_revision,published_by_builder_user_id,published_at)
    values(member.book_component_id,resolved_package_id,member.component_release_id,next_component_revision,actor_builder_user_id,publication_time)
    on conflict(book_component_id) do update set release_id=excluded.release_id,head_revision=excluded.head_revision,published_by_builder_user_id=excluded.published_by_builder_user_id,published_at=excluded.published_at;
    insert into book_component_publication_events(book_package_id,book_component_id,previous_release_id,release_id,expected_head_revision,resulting_head_revision,request_sha256,client_mutation_id,published_by_builder_user_id,published_at)
    values(resolved_package_id,member.book_component_id,component_head.release_id,member.component_release_id,coalesce(component_head.head_revision,0),next_component_revision,requested_request_sha256,requested_client_mutation_id,actor_builder_user_id,publication_time);
    insert into book_component_publication_mutations(book_component_id,release_id,request_sha256,client_mutation_id,outcome,resulting_head_revision,previous_release_id,published_at)
    values(member.book_component_id,member.component_release_id,requested_request_sha256,requested_client_mutation_id,'published',next_component_revision,component_head.release_id,publication_time);
  end loop;
  next_head_revision:=coalesce(current_head.head_revision,0)+1;
  insert into book_product_publication_heads(book_package_id,product_release_id,head_revision,published_by_builder_user_id,published_at)
  values(resolved_package_id,candidate.id,next_head_revision,actor_builder_user_id,publication_time)
  on conflict(book_package_id) do update set product_release_id=excluded.product_release_id,head_revision=excluded.head_revision,published_by_builder_user_id=excluded.published_by_builder_user_id,published_at=excluded.published_at;
  insert into book_product_publication_events(book_package_id,previous_product_release_id,product_release_id,expected_head_revision,resulting_head_revision,request_sha256,client_mutation_id,published_by_builder_user_id,published_at)
  values(resolved_package_id,current_head.product_release_id,candidate.id,expected_head_revision,next_head_revision,requested_request_sha256,requested_client_mutation_id,actor_builder_user_id,publication_time);
  insert into book_product_publication_mutations(book_package_id,product_release_id,request_sha256,client_mutation_id,outcome,resulting_head_revision,previous_product_release_id,published_at)
  values(resolved_package_id,candidate.id,requested_request_sha256,requested_client_mutation_id,'published',next_head_revision,current_head.product_release_id,publication_time);
  insert into builder_audit_log(builder_user_id,action,target_type,target_id,metadata) values(actor_builder_user_id,'product_release_published','book_product_release',candidate.id::text,
    jsonb_build_object('book_slug',requested_book_slug,'release_number',candidate.release_number,'previous_release_id',current_head.product_release_id,'head_revision',next_head_revision));
  return query select 'published',candidate.id,candidate.release_number,next_head_revision,current_head.product_release_id,publication_time;
end;
$$;

drop trigger if exists builder_component_page_revisions_publication_lock on builder_component_page_revisions;
create trigger builder_component_page_revisions_publication_lock before insert or update on builder_component_page_revisions
for each row execute function lock_builder_component_publication_source();

drop trigger if exists book_product_releases_immutable on book_product_releases;
create trigger book_product_releases_immutable before update or delete on book_product_releases
for each row execute function reject_book_component_release_mutation();
drop trigger if exists book_product_release_members_immutable on book_product_release_members;
create trigger book_product_release_members_immutable before update or delete on book_product_release_members
for each row execute function reject_book_component_release_mutation();
drop trigger if exists book_product_publication_events_immutable on book_product_publication_events;
create trigger book_product_publication_events_immutable before update or delete on book_product_publication_events
for each row execute function reject_book_component_release_mutation();
drop trigger if exists book_product_publication_mutations_immutable on book_product_publication_mutations;
create trigger book_product_publication_mutations_immutable before update or delete on book_product_publication_mutations
for each row execute function reject_book_component_release_mutation();
