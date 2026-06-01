create extension if not exists pgcrypto;

alter table classes add column if not exists slug text;
alter table classes add column if not exists assigned_book text;
alter table classes add column if not exists book_package_id uuid references book_packages(id) on delete set null;
alter table classes add column if not exists invite_code text;
alter table classes add column if not exists status text not null default 'active';
alter table classes add column if not exists updated_at timestamptz default now();

update classes
set level = coalesce(nullif(level, ''), 'B2'),
    assigned_book = coalesce(assigned_book, 'Ultimate B2'),
    status = coalesce(nullif(status, ''), 'active'),
    updated_at = coalesce(updated_at, created_at, now())
where level is null
   or level = ''
   or assigned_book is null
   or status is null
   or status = ''
   or updated_at is null;

update classes
set slug = trim(both '-' from regexp_replace(lower(coalesce(name, 'class')), '[^a-z0-9]+', '-', 'g')) || '-' || left(replace(id::text, '-', ''), 8)
where slug is null or slug = '';

update classes
set invite_code = upper(left(replace(id::text, '-', ''), 8))
where invite_code is null or invite_code = '';

alter table classes alter column level set default 'B2';
alter table classes alter column level set not null;
alter table classes alter column slug set not null;
alter table classes alter column invite_code set not null;
alter table classes alter column status set not null;
alter table classes alter column updated_at set default now();

create unique index if not exists classes_slug_unique_idx on classes(slug);
create unique index if not exists classes_invite_code_unique_idx on classes(invite_code);
create index if not exists classes_teacher_idx on classes(teacher_id);
create index if not exists classes_school_idx on classes(school_id);
create index if not exists classes_slug_idx on classes(slug);
create index if not exists classes_invite_code_idx on classes(invite_code);
create index if not exists classes_book_package_idx on classes(book_package_id);

alter table class_students add column if not exists joined_at timestamptz default now();
alter table class_students add column if not exists status text not null default 'active';

update class_students
set joined_at = coalesce(joined_at, created_at, now()),
    status = coalesce(nullif(status, ''), 'active')
where joined_at is null or status is null or status = '';

alter table class_students alter column joined_at set not null;
alter table class_students alter column status set not null;

create unique index if not exists class_students_class_student_unique_idx on class_students(class_id, student_id);
create index if not exists class_students_class_idx on class_students(class_id);
create index if not exists class_students_student_idx on class_students(student_id);

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_classes_updated_at on classes;
create trigger set_classes_updated_at before update on classes for each row execute function set_updated_at();
