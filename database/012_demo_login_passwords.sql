-- Development/demo login credentials for the Hamilton House seed users.
-- Password for all three accounts: password123

update app_users
set password_hash = '$2b$12$TbcfsTmq6FFDE.aOFgkBuelsJsvqk.140AXzYhTFlta7idf64o.c6',
    auth_provider = 'password',
    status = 'active'
where lower(email) in (
  'elena.admin@example.com',
  'maria.teacher@example.com',
  'anna.student@example.com'
);

-- Apply this demo-only file after every production migration. The following
-- rows form a repeatable local pilot and are scoped to the exact historical
-- demo school and identities above.
with demo as (
  select school.id as school_id, teacher.id as teacher_id
  from schools school
  join app_users teacher on teacher.school_id = school.id
  where school.name = 'Hamilton House ELT Demo'
    and lower(teacher.email) = 'maria.teacher@example.com'
    and teacher.role = 'teacher'
)
insert into classes (
  school_id, teacher_id, name, level, slug, assigned_book,
  book_package_id, invite_code, status
)
select
  demo.school_id, demo.teacher_id, 'Ultimate B2 Pilot', 'B2',
  'ultimate-b2-pilot', 'Ultimate B2', package_record.id,
  'ULTB2P01', 'active'
from demo
join book_packages package_record on package_record.slug = 'ultimate-b2'
on conflict (slug) do update
set school_id = excluded.school_id,
    teacher_id = excluded.teacher_id,
    name = excluded.name,
    level = excluded.level,
    assigned_book = excluded.assigned_book,
    book_package_id = excluded.book_package_id,
    status = 'active';

insert into class_students (class_id, student_id, status)
select class_record.id, student.id, 'active'
from classes class_record
join schools school on school.id = class_record.school_id
join app_users student on student.school_id = school.id
where class_record.slug = 'ultimate-b2-pilot'
  and school.name = 'Hamilton House ELT Demo'
  and lower(student.email) = 'anna.student@example.com'
  and student.role = 'student'
on conflict (class_id, student_id) do update set status = 'active';

insert into book_access (user_id, book_package_id, role_scope)
select student.id, package_record.id, 'student'
from app_users student
join schools school on school.id = student.school_id
cross join book_packages package_record
where school.name = 'Hamilton House ELT Demo'
  and lower(student.email) = 'anna.student@example.com'
  and student.role = 'student'
  and package_record.slug = 'ultimate-b2'
on conflict (user_id, book_package_id, role_scope) do nothing;

with pilot as (
  select
    school.id as school_id,
    teacher.id as teacher_id,
    class_record.id as class_id
  from schools school
  join app_users teacher on teacher.school_id = school.id
  join classes class_record on class_record.school_id = school.id
  where school.name = 'Hamilton House ELT Demo'
    and lower(teacher.email) = 'maria.teacher@example.com'
    and teacher.role = 'teacher'
    and class_record.slug = 'ultimate-b2-pilot'
),
assignment_seed(activity_slug, title, idempotency_key) as (
  values
    ('ultimate-b2-sb-u1-p2-o3', 'Pilot auto-scored assignment', 'demo:ultimate-b2:auto'),
    ('ultimate-b2-sb-u1-p1-o1', 'Pilot teacher-reviewed assignment', 'demo:ultimate-b2:review')
)
insert into activity_assignments (
  school_id, activity_id, teacher_id, class_id, status, title,
  teacher_notes, worksheet_links, attached_files, idempotency_key
)
select
  pilot.school_id, activity.id, pilot.teacher_id, pilot.class_id,
  'assigned', assignment_seed.title, '', '[]'::jsonb, '[]'::jsonb,
  assignment_seed.idempotency_key
from pilot
cross join assignment_seed
join activities activity on activity.slug = assignment_seed.activity_slug
on conflict (school_id, teacher_id, idempotency_key)
  where idempotency_key is not null
do update set
  activity_id = excluded.activity_id,
  class_id = excluded.class_id,
  status = 'assigned',
  title = excluded.title;
