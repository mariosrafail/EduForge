create extension if not exists pgcrypto;

create table if not exists schools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  logo text,
  primary_color text,
  secondary_color text,
  created_at timestamptz default now()
);

create table if not exists app_users (
  id uuid primary key default gen_random_uuid(),
  school_id uuid references schools(id) on delete cascade,
  full_name text not null,
  email text,
  role text not null check (role in ('admin', 'teacher', 'student')),
  level text,
  status text not null default 'invited' check (status in ('active', 'invited', 'paused')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists classes (
  id uuid primary key default gen_random_uuid(),
  school_id uuid references schools(id) on delete cascade,
  name text not null,
  level text,
  teacher_id uuid references app_users(id),
  created_at timestamptz default now()
);

create table if not exists class_students (
  id uuid primary key default gen_random_uuid(),
  class_id uuid references classes(id) on delete cascade,
  student_id uuid references app_users(id) on delete cascade,
  created_at timestamptz default now()
);

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_app_users_updated_at on app_users;
create trigger set_app_users_updated_at
before update on app_users
for each row
execute function set_updated_at();

insert into schools (name, logo, primary_color, secondary_color)
select 'Hamilton House ELT Demo', 'HH', '#f97316', '#0b1f3a'
where not exists (
  select 1 from schools where name = 'Hamilton House ELT Demo'
);

with demo_school as (
  select id from schools where name = 'Hamilton House ELT Demo' order by created_at asc limit 1
)
insert into app_users (school_id, full_name, email, role, level, status)
select demo_school.id, seed.full_name, seed.email, seed.role, seed.level, seed.status
from demo_school
cross join (
  values
    ('Elena Markou', 'elena.admin@example.com', 'admin', 'Operations', 'active'),
    ('Maria Antoniou', 'maria.teacher@example.com', 'teacher', 'B1 Junior', 'active'),
    ('Anna Georgiou', 'anna.student@example.com', 'student', 'B1 Junior', 'invited')
) as seed(full_name, email, role, level, status)
where not exists (
  select 1 from app_users where school_id = demo_school.id
);
