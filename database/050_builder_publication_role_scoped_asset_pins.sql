-- Publication Freeze v2 role-scoped identity. The same immutable bytes may be
-- pinned once per legitimate release asset role while same-role duplicates fail.

alter table book_component_release_asset_pins
  drop constraint book_component_release_asset_pins_pkey,
  add primary key(component_release_id,checksum_sha256,extension,asset_role);

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
    select count(*)-count(distinct concat_ws('.',value->>'checksumSha256',value->>'extension',value->>'role')) into duplicate_count
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
