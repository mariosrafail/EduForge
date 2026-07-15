-- Authorization Phase 2 reconciliation. Run after both historical 010 files and 011.
-- This migration never assigns unknown rows to the demo tenant.

alter table courses
  add column if not exists book_package_id uuid references book_packages(id) on delete set null,
  add column if not exists ownership_type text not null default 'official',
  add column if not exists created_by uuid references app_users(id) on delete set null;

alter table lessons
  add column if not exists school_id uuid references schools(id) on delete cascade,
  add column if not exists ownership_type text not null default 'official',
  add column if not exists created_by uuid references app_users(id) on delete set null;

alter table lesson_activities
  add column if not exists school_id uuid references schools(id) on delete cascade,
  add column if not exists ownership_type text not null default 'official',
  add column if not exists created_by uuid references app_users(id) on delete set null;

alter table activities
  add column if not exists ownership_type text not null default 'official';

do $$ begin
  alter table courses add constraint courses_ownership_type_check check (ownership_type in ('official', 'custom'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table lessons add constraint lessons_ownership_type_check check (ownership_type in ('official', 'custom'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table lesson_activities add constraint lesson_activities_ownership_type_check check (ownership_type in ('official', 'custom'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table activities add constraint activities_ownership_type_check check (ownership_type in ('official', 'custom'));
exception when duplicate_object then null; end $$;

-- Only relationship-backed tenant backfills are safe for existing data.
update lessons l
set school_id = c.school_id
from courses c
where l.school_id is null and l.course_id = c.id and c.school_id is not null;

update lesson_activities la
set school_id = coalesce(l.school_id, c.school_id)
from lessons l
left join courses c on c.id = l.course_id
where la.school_id is null and la.lesson_id = l.id and coalesce(l.school_id, c.school_id) is not null;

update activities
set ownership_type = 'custom'
where created_by is not null and ownership_type = 'official';

-- Known demo seed mapping only. No unknown production course is assigned a package.
update courses c
set book_package_id = bp.id
from schools s, book_packages bp
where c.school_id = s.id
  and s.name = 'Hamilton House ELT Demo'
  and c.book_code = 'B1-DEMO-2026'
  and bp.slug = 'ultimate-b2'
  and c.book_package_id is null;

create table if not exists lesson_assignments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  lesson_id uuid not null references lessons(id) on delete cascade,
  assigned_by uuid not null references app_users(id) on delete restrict,
  class_id uuid references classes(id) on delete cascade,
  student_id uuid references app_users(id) on delete cascade,
  status text not null default 'assigned' check (status in ('assigned', 'closed')),
  assigned_at timestamptz not null default now(),
  due_at timestamptz,
  check ((class_id is not null)::int + (student_id is not null)::int = 1)
);

create table if not exists class_invite_attempts (
  id bigint generated always as identity primary key,
  request_fingerprint text not null,
  succeeded boolean not null default false,
  attempted_at timestamptz not null default now()
);

create index if not exists courses_school_package_idx on courses (school_id, book_package_id);
create index if not exists lessons_school_course_idx on lessons (school_id, course_id);
create index if not exists lesson_activities_school_owner_idx on lesson_activities (school_id, ownership_type, created_by);
create index if not exists activities_school_owner_type_idx on activities (school_id, ownership_type, created_by);
create index if not exists lesson_assignments_student_idx on lesson_assignments (school_id, student_id, status, lesson_id);
create index if not exists lesson_assignments_class_idx on lesson_assignments (school_id, class_id, status, lesson_id);
create index if not exists class_invite_attempts_window_idx on class_invite_attempts (request_fingerprint, attempted_at desc);

-- Current, queryable report of tenant-owned rows that still need manual reconciliation.
create or replace view tenant_integrity_issues as
select 'app_users'::text as table_name, count(*)::bigint as null_school_rows from app_users where school_id is null
union all select 'classes', count(*) from classes where school_id is null
union all select 'courses', count(*) from courses where school_id is null
union all select 'activities_custom', count(*) from activities where ownership_type = 'custom' and school_id is null
union all select 'assignments', count(*) from assignments where school_id is null
union all select 'activity_assignments', count(*) from activity_assignments where school_id is null
union all select 'activity_submissions', count(*) from activity_submissions where school_id is null
union all select 'lesson_submissions', count(*) from lesson_submissions where school_id is null
union all select 'book_page_hotspots_custom', count(*) from book_page_hotspots where created_by is not null and school_id is null
union all select 'book_media_assets_custom', count(*) from book_media_assets where created_by is not null and school_id is null
union all select 'book_activities_custom', count(*) from book_activities where created_by is not null and school_id is null;

-- Required tenant columns become NOT NULL only when existing production data is clean.
-- Otherwise the migration reports the exact table and leaves reconciliation non-destructive.
do $$
declare
  target_table text;
  null_count bigint;
begin
  foreach target_table in array array[
    'app_users', 'classes', 'courses', 'assignments',
    'activity_assignments', 'activity_submissions', 'lesson_submissions'
  ] loop
    execute format('select count(*) from %I where school_id is null', target_table) into null_count;
    if null_count = 0 then
      execute format('alter table %I alter column school_id set not null', target_table);
    else
      raise warning 'Tenant integrity: %.school_id has % unresolved NULL row(s); NOT NULL was not applied', target_table, null_count;
    end if;
  end loop;
end $$;

-- Retain only the rolling window needed for application-level throttling preparation.
delete from class_invite_attempts where attempted_at < now() - interval '30 days';
