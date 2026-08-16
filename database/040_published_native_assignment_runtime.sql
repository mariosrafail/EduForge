begin;

alter table activity_assignments
  add column if not exists target_kind text not null default 'legacy_activity',
  add column if not exists native_release_id uuid references book_component_releases(id) on delete restrict,
  add column if not exists native_activity_id text;

alter table activity_assignments
  alter column activity_id drop not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'activity_assignments_target_identity_check'
  ) then
    alter table activity_assignments
      add constraint activity_assignments_target_identity_check
      check (
        (target_kind = 'legacy_activity'
          and activity_id is not null
          and native_release_id is null
          and native_activity_id is null)
        or
        (target_kind = 'published_native'
          and activity_id is null
          and native_release_id is not null
          and native_activity_id is not null
          and native_activity_id ~ '^[a-z0-9][a-z0-9-]{0,127}$')
      );
  end if;
end
$$;

create index if not exists activity_assignments_native_target_idx
  on activity_assignments (native_release_id, native_activity_id)
  where target_kind = 'published_native';

alter table activity_submissions
  add column if not exists response_schema_version text,
  add column if not exists response_payload jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'activity_submissions_response_envelope_check'
  ) then
    alter table activity_submissions
      add constraint activity_submissions_response_envelope_check
      check (
        (response_schema_version is null and response_payload is null)
        or
        (response_schema_version is not null
          and response_payload is not null
          and jsonb_typeof(response_payload) = 'object')
      );
  end if;
end
$$;

commit;
