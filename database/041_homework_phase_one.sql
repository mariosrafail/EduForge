begin;

create table homeworks (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  teacher_id uuid not null references app_users(id) on delete restrict,
  title text not null check (char_length(title) between 1 and 240),
  teacher_notes text not null default '' check (char_length(teacher_notes) <= 4000),
  worksheet_links jsonb not null default '[]'::jsonb
    check (jsonb_typeof(worksheet_links) = 'array'),
  due_at timestamptz,
  status text not null default 'assigned' check (status in ('assigned', 'closed')),
  idempotency_key text not null check (idempotency_key ~ '^[A-Za-z0-9._:-]{8,128}$'),
  request_sha256 text not null check (request_sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, teacher_id, idempotency_key),
  unique (school_id, teacher_id, id)
);

create table homework_items (
  id uuid primary key default gen_random_uuid(),
  homework_id uuid not null references homeworks(id) on delete cascade,
  position integer not null check (position > 0),
  target_kind text not null check (target_kind in ('legacy_activity', 'published_native')),
  activity_id uuid references activities(id) on delete restrict,
  native_release_id uuid references book_component_releases(id) on delete restrict,
  native_activity_id text,
  created_at timestamptz not null default now(),
  unique (homework_id, id),
  unique (homework_id, position),
  constraint homework_items_target_identity_check check (
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
  )
);

create unique index homework_items_legacy_target_unique_idx
  on homework_items (homework_id, activity_id)
  where target_kind = 'legacy_activity';

create unique index homework_items_native_target_unique_idx
  on homework_items (homework_id, native_release_id, native_activity_id)
  where target_kind = 'published_native';

alter table activity_assignments
  add column homework_id uuid references homeworks(id) on delete restrict,
  add column homework_item_id uuid;

alter table activity_assignments
  add constraint activity_assignments_homework_link_check
  check (
    (homework_id is null and homework_item_id is null)
    or
    (homework_id is not null and homework_item_id is not null)
  ),
  add constraint activity_assignments_homework_item_fk
  foreign key (homework_id, homework_item_id)
  references homework_items(homework_id, id)
  on delete restrict,
  add constraint activity_assignments_homework_scope_fk
  foreign key (school_id, teacher_id, homework_id)
  references homeworks(school_id, teacher_id, id)
  on delete restrict;

create index activity_assignments_homework_idx
  on activity_assignments (homework_id, homework_item_id, class_id);

create index homeworks_school_teacher_created_idx
  on homeworks (school_id, teacher_id, created_at desc);

drop trigger if exists set_homeworks_updated_at on homeworks;
create trigger set_homeworks_updated_at
before update on homeworks
for each row execute function set_updated_at();

commit;
