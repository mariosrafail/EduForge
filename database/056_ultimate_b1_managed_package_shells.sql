-- Empty managed authoring shells for Ultimate B1 and Ultimate B1+.
-- Existing package, Students Book, and Workbook identities are retained. Test
-- Books are catalog-only: they deliberately receive no units or authoring
-- authorization until a dedicated editor is implemented.

with component_seed(package_slug,title,slug,component_type,sort_order) as (
  values
    ('ultimate-b1','Ultimate English B1 Grammar Book','ultimate-b1-grammar-book','grammar_book',3),
    ('ultimate-b1','Ultimate English B1 Test Book','ultimate-b1-test-book','test_book',4),
    ('ultimate-b1-plus','Ultimate English B1+ Grammar Book','ultimate-b1-plus-grammar-book','grammar_book',3),
    ('ultimate-b1-plus','Ultimate English B1+ Test Book','ultimate-b1-plus-test-book','test_book',4)
)
insert into book_components(book_package_id,title,slug,component_type,cover_asset_path,sort_order)
select package.id,seed.title,seed.slug,seed.component_type,null,seed.sort_order
from component_seed seed
join book_packages package on package.slug=seed.package_slug
on conflict(book_package_id,slug) do update
set title=excluded.title,
    component_type=excluded.component_type,
    sort_order=excluded.sort_order,
    updated_at=now();

with active_component_seed(package_slug,component_slug) as (
  values
    ('ultimate-b1','ultimate-b1-students-book'),
    ('ultimate-b1','ultimate-b1-workbook'),
    ('ultimate-b1','ultimate-b1-grammar-book'),
    ('ultimate-b1-plus','ultimate-b1-plus-students-book'),
    ('ultimate-b1-plus','ultimate-b1-plus-workbook'),
    ('ultimate-b1-plus','ultimate-b1-plus-grammar-book')
), managed_components as (
  select component.id book_component_id
  from active_component_seed seed
  join book_packages package on package.slug=seed.package_slug
  join book_components component
    on component.book_package_id=package.id and component.slug=seed.component_slug
), unit_seed as (
  select component.book_component_id,generated.unit_number
  from managed_components component
  cross join generate_series(1,10) as generated(unit_number)
)
insert into units(book_component_id,title,slug,unit_number,sort_order)
select book_component_id,'Unit '||unit_number,'unit-'||unit_number,unit_number,unit_number
from unit_seed
on conflict(book_component_id,slug) do update
set title=excluded.title,
    unit_number=excluded.unit_number,
    sort_order=excluded.sort_order,
    updated_at=now();

-- Page authoring is a closed tuple registry. Ultimate B2 Students Book keeps
-- its canonical override behavior; every other listed tuple is an empty
-- managed component. Test Books and mismatched package/component pairs remain
-- unresolvable.
create or replace function resolve_builder_page_component(requested_book_slug text,requested_component_slug text)
returns table(book_package_id uuid,book_component_id uuid) language sql stable as $$
  select package.id,component.id
  from (
    values
      ('ultimate-b2','ultimate-b2-students-book'),
      ('ultimate-b2','ultimate-b2-workbook'),
      ('ultimate-b2','ultimate-b2-grammar-book'),
      ('ultimate-b1','ultimate-b1-students-book'),
      ('ultimate-b1','ultimate-b1-workbook'),
      ('ultimate-b1','ultimate-b1-grammar-book'),
      ('ultimate-b1-plus','ultimate-b1-plus-students-book'),
      ('ultimate-b1-plus','ultimate-b1-plus-workbook'),
      ('ultimate-b1-plus','ultimate-b1-plus-grammar-book')
  ) as allowed(package_slug,component_slug)
  join book_packages package on package.slug=allowed.package_slug
  join book_components component
    on component.book_package_id=package.id and component.slug=allowed.component_slug
  where allowed.package_slug=requested_book_slug
    and allowed.component_slug=requested_component_slug
  limit 1
$$;

create or replace function prepare_builder_component_page_upload(
  requested_book_slug text,requested_component_slug text,requested_page_key text,requested_mode text,
  requested_expected_revision bigint,requested_client_mutation_id uuid,requested_upload_id uuid,
  requested_request_sha256 text,requested_page_metadata jsonb,requested_file_descriptor jsonb,
  requested_staging_object_key text,actor_builder_user_id uuid,requested_expires_at timestamptz
)
returns table(outcome text,upload_id uuid,current_revision bigint,session_state text,staging_object_key text)
language plpgsql as $$
declare scope record; revision_row builder_component_page_revisions%rowtype; existing builder_component_page_upload_sessions%rowtype; page_row book_pages%rowtype; requested_unit uuid;
begin
  if not exists(select 1 from builder_users where id=actor_builder_user_id and status='active' and role='developer') then
    return query select 'unauthorized_actor',null::uuid,null::bigint,null::text,null::text; return;
  end if;
  select * into scope from resolve_builder_page_component(requested_book_slug,requested_component_slug);
  if scope.book_component_id is null or requested_page_key not like requested_component_slug||'/pages/%' then
    return query select 'resource_not_found',null::uuid,null::bigint,null::text,null::text; return;
  end if;
  if requested_page_metadata ? 'unitId' and coalesce(requested_page_metadata->>'unitId','')<>'' then
    begin requested_unit:=(requested_page_metadata->>'unitId')::uuid; exception when invalid_text_representation then
      return query select 'invalid_unit',null::uuid,null::bigint,null::text,null::text; return;
    end;
    if not exists(select 1 from units where id=requested_unit and book_component_id=scope.book_component_id and unit_number between 1 and 10 and slug='unit-'||unit_number) then
      return query select 'invalid_unit',null::uuid,null::bigint,null::text,null::text; return;
    end if;
  end if;
  insert into builder_component_page_revisions(book_component_id) values(scope.book_component_id) on conflict do nothing;
  select * into revision_row from builder_component_page_revisions where book_component_id=scope.book_component_id for update;
  select * into existing from builder_component_page_upload_sessions where book_component_id=scope.book_component_id and client_mutation_id=requested_client_mutation_id;
  if existing.id is not null then
    if existing.request_sha256<>requested_request_sha256 then
      return query select 'mutation_id_conflict',existing.id,revision_row.revision,existing.state,null::text;
    else
      return query select 'idempotent',existing.id,revision_row.revision,existing.state,existing.staging_object_key;
    end if;
    return;
  end if;
  if revision_row.revision<>requested_expected_revision then
    return query select 'revision_conflict',null::uuid,revision_row.revision,null::text,null::text; return;
  end if;
  select * into page_row from book_pages where book_component_id=scope.book_component_id and stable_key=requested_page_key;
  if requested_book_slug='ultimate-b2' and requested_component_slug='ultimate-b2-students-book' and requested_mode<>'replace' then
    return query select 'operation_not_allowed',null::uuid,revision_row.revision,null::text,null::text; return;
  end if;
  if (requested_book_slug,requested_component_slug) in (
    ('ultimate-b2','ultimate-b2-workbook'),
    ('ultimate-b2','ultimate-b2-grammar-book'),
    ('ultimate-b1','ultimate-b1-students-book'),
    ('ultimate-b1','ultimate-b1-workbook'),
    ('ultimate-b1','ultimate-b1-grammar-book'),
    ('ultimate-b1-plus','ultimate-b1-plus-students-book'),
    ('ultimate-b1-plus','ultimate-b1-plus-workbook'),
    ('ultimate-b1-plus','ultimate-b1-plus-grammar-book')
  ) and (
    (requested_mode='create' and page_row.id is not null and coalesce(page_row.source_metadata->>'is_active','false')='true')
    or (requested_mode='replace' and (page_row.id is null or coalesce(page_row.source_metadata->>'is_active','false')<>'true'))
  ) then return query select 'page_state_conflict',null::uuid,revision_row.revision,null::text,null::text; return; end if;
  insert into builder_component_page_upload_sessions(
    id,book_package_id,book_component_id,page_key,upload_mode,expected_revision,client_mutation_id,request_sha256,
    page_metadata,file_descriptor,staging_object_key,created_by_builder_user_id,expires_at
  ) values(requested_upload_id,scope.book_package_id,scope.book_component_id,requested_page_key,requested_mode,requested_expected_revision,
    requested_client_mutation_id,requested_request_sha256,requested_page_metadata,requested_file_descriptor,requested_staging_object_key,actor_builder_user_id,requested_expires_at);
  return query select 'prepared',requested_upload_id,revision_row.revision,'prepared',requested_staging_object_key;
end $$;
