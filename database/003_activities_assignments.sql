create extension if not exists pgcrypto;

create table if not exists activities (
  id uuid primary key default gen_random_uuid(),
  school_id uuid references schools(id) on delete cascade,
  created_by uuid references app_users(id),
  title text not null,
  type text not null check (type in ('multiple_choice', 'fill_blank', 'matching', 'writing')),
  skill text,
  book_title text,
  unit_title text,
  content jsonb not null,
  feedback jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists assignments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid references schools(id) on delete cascade,
  activity_id uuid references activities(id) on delete cascade,
  assigned_by uuid references app_users(id),
  target_type text not null check (target_type in ('class', 'student')),
  target_id uuid,
  due_date date,
  allowed_attempts int default 2,
  status text default 'published' check (status in ('draft', 'published', 'closed')),
  created_at timestamptz default now()
);

create table if not exists activity_submissions (
  id uuid primary key default gen_random_uuid(),
  school_id uuid references schools(id) on delete cascade,
  assignment_id uuid references assignments(id) on delete cascade,
  student_id uuid references app_users(id),
  answers jsonb not null,
  score numeric,
  mistakes jsonb,
  revision_guidance jsonb,
  attempt_number int default 1,
  submitted_at timestamptz default now()
);

create or replace function set_activities_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_activities_updated_at on activities;
create trigger set_activities_updated_at
before update on activities
for each row
execute function set_activities_updated_at();
