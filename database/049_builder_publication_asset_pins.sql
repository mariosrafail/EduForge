-- Publication Freeze v2. Historical releases retain their materialized objects;
-- new atomic product releases may pin exact content-addressed private source assets.

alter table book_component_releases
  add column if not exists asset_storage_mode text not null default 'materialized-v1'
  check (asset_storage_mode in ('materialized-v1','pinned-source-v1'));

do $$ begin
  if not exists(select 1 from pg_constraint where conname='book_assets_identity_scope_unique') then
    alter table book_assets add constraint book_assets_identity_scope_unique unique(id,book_component_id,book_package_id);
  end if;
end $$;

create table if not exists book_component_release_asset_pins (
  component_release_id uuid not null,
  book_package_id uuid not null,
  book_component_id uuid not null,
  book_asset_id uuid not null,
  asset_role text not null check(asset_role in ('managed_page_image','activity_artwork','unit_extra_video')),
  source_asset_role text not null check(source_asset_role in ('page_image','activity_artwork','unit_extra_video')),
  checksum_sha256 text not null check(checksum_sha256 ~ '^[a-f0-9]{64}$'),
  byte_size bigint not null check(byte_size>=1),
  media_type text not null check(media_type in ('image/png','image/jpeg','image/webp','audio/mpeg','video/mp4','application/pdf')),
  extension text not null check(extension in ('png','jpg','webp','mp3','mp4','pdf')),
  storage_profile text not null check(storage_profile='private'),
  storage_bucket text not null check(length(storage_bucket) between 1 and 255),
  object_key text not null check(length(object_key) between 1 and 1024),
  source_owner_key text not null check(source_owner_key ~ '^[a-z0-9][a-z0-9._-]{0,127}$'),
  source_asset_slot text not null default '' check(source_asset_slot='' or source_asset_slot ~ '^[a-z0-9][a-z0-9._-]{0,127}$'),
  pin_sha256 text not null check(pin_sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  primary key(component_release_id,checksum_sha256,extension),
  constraint book_component_release_asset_pins_release_scope_fk
    foreign key(component_release_id,book_component_id,book_package_id)
    references book_component_releases(id,book_component_id,book_package_id) on delete restrict,
  constraint book_component_release_asset_pins_asset_scope_fk
    foreign key(book_asset_id,book_component_id,book_package_id)
    references book_assets(id,book_component_id,book_package_id) on delete restrict,
  constraint book_component_release_asset_pins_asset_unique unique(component_release_id,book_asset_id,asset_role),
  constraint book_component_release_asset_pins_pin_unique unique(component_release_id,pin_sha256)
);

create index if not exists book_component_release_asset_pins_asset_idx
  on book_component_release_asset_pins(book_asset_id);

create or replace function builder_release_asset_pin_sha256(
  requested_asset_id uuid,requested_role text,requested_source_role text,requested_checksum text,requested_byte_size bigint,
  requested_media_type text,requested_extension text,requested_storage_profile text,requested_storage_bucket text,
  requested_object_key text,requested_owner_key text,requested_asset_slot text
)
returns text language sql immutable as $$
  select encode(digest(convert_to(array_to_string(array[
    'builder-release-asset-pin-v1',requested_asset_id::text,requested_role,requested_source_role,requested_checksum,
    requested_byte_size::text,requested_media_type,requested_extension,requested_storage_profile,requested_storage_bucket,
    requested_object_key,requested_owner_key,requested_asset_slot
  ],E'\n'),'UTF8'),'sha256'),'hex')
$$;

create or replace function validate_builder_release_asset_pin()
returns trigger language plpgsql as $$
declare
  release_row book_component_releases%rowtype;
  asset_row book_assets%rowtype;
  package_slug text; component_slug text; page_key text; unit_slug text; expected_key text; expected_source_role text;
begin
  select * into release_row from book_component_releases where id=new.component_release_id;
  select * into asset_row from book_assets where id=new.book_asset_id;
  select package.slug,component.slug into package_slug,component_slug
  from book_packages package join book_components component on component.book_package_id=package.id
  where package.id=new.book_package_id and component.id=new.book_component_id;
  if release_row.id is null or asset_row.id is null or package_slug is null
    or release_row.asset_storage_mode<>'pinned-source-v1'
    or release_row.book_package_id<>new.book_package_id or release_row.book_component_id<>new.book_component_id
    or asset_row.book_package_id<>new.book_package_id or asset_row.book_component_id<>new.book_component_id
  then raise exception using errcode='PZ001',message='release_pin_integrity_failed'; end if;

  expected_source_role:=case when new.asset_role='managed_page_image' then 'page_image' else new.asset_role end;
  if new.source_asset_role<>expected_source_role or asset_row.asset_role<>expected_source_role
    or asset_row.checksum_sha256<>new.checksum_sha256 or asset_row.byte_size<>new.byte_size
    or asset_row.mime_type<>new.media_type or asset_row.storage_profile<>new.storage_profile
    or asset_row.storage_bucket<>new.storage_bucket or asset_row.object_key<>new.object_key
    or asset_row.publication_status<>'draft' or asset_row.access_level<>'internal'
    or new.pin_sha256<>builder_release_asset_pin_sha256(new.book_asset_id,new.asset_role,new.source_asset_role,new.checksum_sha256,
      new.byte_size,new.media_type,new.extension,new.storage_profile,new.storage_bucket,new.object_key,new.source_owner_key,new.source_asset_slot)
    or not exists(select 1 from jsonb_array_elements(release_row.asset_manifest) descriptor
      where descriptor->>'sha256'=new.checksum_sha256 and descriptor->>'extension'=new.extension
        and descriptor->>'mediaType'=new.media_type and descriptor->>'role'=new.asset_role)
  then raise exception using errcode='PZ001',message='release_pin_integrity_failed'; end if;

  if new.asset_role='managed_page_image' then
    select stable_key into page_key from book_pages where id=asset_row.page_id and book_component_id=new.book_component_id;
    expected_key:='builder-page-assets/'||package_slug||'/'||component_slug||'/'||new.source_owner_key||'/assets/'||new.checksum_sha256||'.'||new.extension;
    if page_key<>component_slug||'/pages/'||new.source_owner_key or new.source_asset_slot<>'' or new.object_key<>expected_key then
      raise exception using errcode='PZ001',message='release_pin_integrity_failed'; end if;
  elsif new.asset_role='unit_extra_video' then
    select slug into unit_slug from units where id=asset_row.unit_id and book_component_id=new.book_component_id;
    expected_key:='builder-unit-extra-assets/'||package_slug||'/'||component_slug||'/'||unit_slug||'/'||new.source_owner_key||'/assets/'||new.checksum_sha256||'.mp4';
    if new.media_type<>'video/mp4' or new.extension<>'mp4' or asset_row.page_id is not null or asset_row.activity_id is not null
      or asset_row.source_metadata->>'unit_extra_item_id'<>new.source_owner_key
      or asset_row.source_metadata->>'asset_slot'<>new.source_asset_slot or new.source_asset_slot<>new.source_owner_key
      or asset_row.source_metadata->>'unit_slug'<>unit_slug or new.object_key<>expected_key
    then raise exception using errcode='PZ001',message='release_pin_integrity_failed'; end if;
  else
    expected_key:='builder-native-assets/'||package_slug||'/'||component_slug||'/'||new.source_owner_key||'/assets/'
      ||case when new.extension in ('mp3','mp4') then new.source_asset_slot||'/' else '' end||new.checksum_sha256||'.'||new.extension;
    if asset_row.source_metadata->>'native_activity_id'<>new.source_owner_key
      or asset_row.source_metadata->>'asset_slot'<>new.source_asset_slot or new.object_key<>expected_key
    then raise exception using errcode='PZ001',message='release_pin_integrity_failed'; end if;
  end if;
  return new;
end $$;

drop trigger if exists book_component_release_asset_pins_validate on book_component_release_asset_pins;
create trigger book_component_release_asset_pins_validate before insert on book_component_release_asset_pins
for each row execute function validate_builder_release_asset_pin();

drop trigger if exists book_component_release_asset_pins_immutable on book_component_release_asset_pins;
create trigger book_component_release_asset_pins_immutable before update or delete on book_component_release_asset_pins
for each row execute function reject_book_component_release_mutation();

create or replace function protect_pinned_book_asset_identity()
returns trigger language plpgsql as $$
begin
  if exists(select 1 from book_component_release_asset_pins where book_asset_id=old.id) and (
    tg_op='DELETE' or old.book_package_id is distinct from new.book_package_id
    or old.book_component_id is distinct from new.book_component_id or old.unit_id is distinct from new.unit_id
    or old.page_id is distinct from new.page_id or old.activity_id is distinct from new.activity_id
    or old.asset_role is distinct from new.asset_role or old.storage_profile is distinct from new.storage_profile
    or old.storage_bucket is distinct from new.storage_bucket or old.object_key is distinct from new.object_key
    or old.checksum_sha256 is distinct from new.checksum_sha256 or old.byte_size is distinct from new.byte_size
    or old.mime_type is distinct from new.mime_type or old.access_level is distinct from new.access_level
    or old.source_metadata is distinct from new.source_metadata
  ) then raise exception using errcode='PZ002',message='pinned_book_asset_identity_immutable'; end if;
  return case when tg_op='DELETE' then old else new end;
end $$;

drop trigger if exists book_assets_pinned_identity_guard on book_assets;
create trigger book_assets_pinned_identity_guard before update or delete on book_assets
for each row execute function protect_pinned_book_asset_identity();

create or replace function select_builder_release_asset_storage_mode()
returns trigger language plpgsql as $$
begin
  if current_setting('hhplms.release_asset_storage_mode',true)='pinned-source-v1' then new.asset_storage_mode:='pinned-source-v1'; end if;
  return new;
end $$;

drop trigger if exists book_component_releases_storage_mode_insert on book_component_releases;
create trigger book_component_releases_storage_mode_insert before insert on book_component_releases
for each row execute function select_builder_release_asset_storage_mode();

create or replace function create_builder_pinned_product_release(
  requested_product_release_id uuid,requested_book_slug text,requested_release_schema_version text,requested_compiler_id text,
  requested_members jsonb,requested_request_sha256 text,requested_release_note text,actor_builder_user_id uuid,requested_client_mutation_id uuid
)
returns table(outcome text,product_release_id uuid,product_release_number bigint,source_snapshot_sha256 text,release_sha256 text,members jsonb)
language plpgsql as $$
declare result record; member jsonb; pin jsonb; private_count int; pin_count int; duplicate_count int; existing_count int; replay_release_id uuid;
begin
  if jsonb_typeof(requested_members)<>'array' then return query select 'invalid_request',null::uuid,null::bigint,null::text,null::text,null::jsonb; return; end if;
  for member in select value from jsonb_array_elements(requested_members) loop
    if member->>'assetStorageMode'<>'pinned-source-v1' or jsonb_typeof(member->'assetPins')<>'array' then
      return query select 'invalid_request',null::uuid,null::bigint,null::text,null::text,null::jsonb; return;
    end if;
    select count(*) into private_count from jsonb_array_elements(member->'assetManifest') descriptor
      where descriptor->>'role' in ('managed_page_image','activity_artwork','unit_extra_video');
    pin_count:=jsonb_array_length(member->'assetPins');
    select count(*)-count(distinct concat_ws('.',value->>'checksumSha256',value->>'extension')) into duplicate_count
      from jsonb_array_elements(member->'assetPins');
    if private_count<>pin_count or duplicate_count<>0 or exists(
      select 1 from jsonb_array_elements(member->'assetPins') candidate
      where not exists(select 1 from jsonb_array_elements(member->'assetManifest') descriptor
        where descriptor->>'sha256'=candidate->>'checksumSha256' and descriptor->>'extension'=candidate->>'extension'
          and descriptor->>'mediaType'=candidate->>'mediaType' and descriptor->>'role'=candidate->>'role')
    ) then raise exception using errcode='PZ003',message='release_pin_conflict'; end if;
  end loop;

  perform set_config('hhplms.release_asset_storage_mode','pinned-source-v1',true);
  select * into result from create_builder_product_release(requested_product_release_id,requested_book_slug,requested_release_schema_version,
    requested_compiler_id,requested_members,requested_request_sha256,requested_release_note,actor_builder_user_id,requested_client_mutation_id);
  perform set_config('hhplms.release_asset_storage_mode','',true);
  if result.outcome='created' then
    for member in select value from jsonb_array_elements(requested_members) loop
      for pin in select value from jsonb_array_elements(member->'assetPins') loop
        insert into book_component_release_asset_pins(component_release_id,book_package_id,book_component_id,book_asset_id,asset_role,
          source_asset_role,checksum_sha256,byte_size,media_type,extension,storage_profile,storage_bucket,object_key,source_owner_key,source_asset_slot,pin_sha256)
        select release.id,release.book_package_id,release.book_component_id,(pin->>'assetId')::uuid,pin->>'role',pin->>'sourceAssetRole',
          pin->>'checksumSha256',(pin->>'byteSize')::bigint,pin->>'mediaType',pin->>'extension',pin->>'storageProfile',pin->>'storageBucket',
          pin->>'objectKey',pin->>'ownerKey',pin->>'assetSlot',pin->>'pinSha256'
        from book_component_releases release where release.id=(member->>'releaseId')::uuid;
        if not found then raise exception using errcode='PZ001',message='release_pin_integrity_failed'; end if;
      end loop;
    end loop;
  elsif result.outcome='idempotent' then
    for member in select value from jsonb_array_elements(requested_members) loop
      select family_member.component_release_id into replay_release_id
      from book_product_release_members family_member join book_components component on component.id=family_member.book_component_id
      where family_member.product_release_id=result.product_release_id and component.slug=member->>'componentSlug';
      select count(*) into existing_count from book_component_release_asset_pins where component_release_id=replay_release_id;
      if existing_count<>jsonb_array_length(member->'assetPins') or exists(
        select 1 from jsonb_array_elements(member->'assetPins') candidate
        where not exists(select 1 from book_component_release_asset_pins stored
          where stored.component_release_id=replay_release_id and stored.pin_sha256=candidate->>'pinSha256')
      ) then raise exception using errcode='PZ001',message='release_pin_integrity_failed'; end if;
    end loop;
  end if;
  return query select result.outcome,result.product_release_id,result.product_release_number,result.source_snapshot_sha256,result.release_sha256,result.members;
end $$;

create or replace function archive_unreferenced_builder_unit_extra_assets(requested_book_slug text, requested_component_slug text, actor_builder_user_id uuid)
returns table(asset_id uuid, object_key text) language plpgsql as $$
declare resolved_component_id uuid; current_payload jsonb;
begin
  if not exists(select 1 from builder_users where id=actor_builder_user_id and status='active' and role='developer') then raise exception 'unauthorized Builder actor'; end if;
  select component.id into resolved_component_id from book_packages package join book_components component on component.book_package_id=package.id
  where package.slug=requested_book_slug and component.slug=requested_component_slug limit 1;
  if resolved_component_id is null then return; end if;
  select payload into current_payload from builder_component_documents where book_component_id=resolved_component_id and document_type='unit_extras' and document_key='default';
  return query update book_assets asset set publication_status='archived',updated_at=now()
  where asset.book_component_id=resolved_component_id and asset.asset_role='unit_extra_video'
    and asset.publication_status='draft' and asset.storage_profile='private' and asset.access_level='internal'
    and not exists(select 1 from book_component_release_asset_pins pin where pin.book_asset_id=asset.id)
    and not exists(select 1 from jsonb_array_elements(coalesce(current_payload->'units','[]'::jsonb)) unit_entry
      cross join lateral jsonb_array_elements(coalesce(unit_entry->'categories'->'videos','[]'::jsonb)) video_entry
      where video_entry->'asset'->>'assetId'=asset.id::text)
  returning asset.id,asset.object_key;
end $$;
