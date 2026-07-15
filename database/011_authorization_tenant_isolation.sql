-- Authorization and tenant-isolation support. Safe to run after migrations 001-010.

alter table activity_assignments add column if not exists school_id uuid references schools(id) on delete cascade;
alter table lesson_submissions add column if not exists school_id uuid references schools(id) on delete cascade;
alter table book_page_hotspots add column if not exists school_id uuid references schools(id) on delete cascade;
alter table book_media_assets add column if not exists school_id uuid references schools(id) on delete cascade;
alter table book_activities add column if not exists school_id uuid references schools(id) on delete cascade;

update activity_assignments aa
set school_id = coalesce(
  (select c.school_id from classes c where c.id = aa.class_id),
  (select u.school_id from app_users u where u.id = aa.teacher_id),
  (select u.school_id from app_users u where u.id = aa.student_id)
)
where aa.school_id is null;

update activity_submissions s
set school_id = coalesce(
  (select u.school_id from app_users u where u.id = s.student_id),
  (select aa.school_id from activity_assignments aa where aa.id = s.activity_assignment_id)
)
where s.school_id is null;

update lesson_submissions s
set school_id = u.school_id
from app_users u
where s.school_id is null and u.id = s.student_id;

update book_page_hotspots h set school_id = u.school_id from app_users u where h.school_id is null and h.created_by = u.id;
update book_media_assets m set school_id = u.school_id from app_users u where m.school_id is null and m.created_by = u.id;
update book_activities a set school_id = u.school_id from app_users u where a.school_id is null and a.created_by = u.id;

with demo_school as (
  select id from schools where name = 'Hamilton House ELT Demo' order by created_at asc limit 1
)
update book_page_hotspots set school_id = demo_school.id from demo_school where school_id is null;
with demo_school as (
  select id from schools where name = 'Hamilton House ELT Demo' order by created_at asc limit 1
)
update book_media_assets set school_id = demo_school.id from demo_school where school_id is null;
with demo_school as (
  select id from schools where name = 'Hamilton House ELT Demo' order by created_at asc limit 1
)
update book_activities set school_id = demo_school.id from demo_school where school_id is null;

create unique index if not exists auth_sessions_token_hash_unique_idx on auth_sessions (token_hash);
create index if not exists auth_sessions_active_idx on auth_sessions (expires_at, user_id);
create index if not exists app_users_school_role_status_idx on app_users (school_id, role, status);
create index if not exists classes_school_teacher_status_idx on classes (school_id, teacher_id, status);
create index if not exists class_students_student_status_class_idx on class_students (student_id, status, class_id);
create index if not exists courses_school_status_idx on courses (school_id, status);
create index if not exists activities_school_creator_idx on activities (school_id, created_by);
create index if not exists assignments_school_assignee_idx on assignments (school_id, assigned_by, status);
create index if not exists activity_assignments_school_teacher_idx on activity_assignments (school_id, teacher_id, status);
create index if not exists activity_assignments_school_class_idx on activity_assignments (school_id, class_id, status);
create index if not exists activity_submissions_school_student_idx on activity_submissions (school_id, student_id, submitted_at desc);
create index if not exists lesson_submissions_school_student_idx on lesson_submissions (school_id, student_id, submitted_at desc);
create index if not exists book_access_user_package_idx on book_access (user_id, book_package_id);
create index if not exists book_page_hotspots_school_page_idx on book_page_hotspots (school_id, package_slug, component_slug, page_id);
create index if not exists book_media_assets_school_context_idx on book_media_assets (school_id, package_slug, component_slug, page_id);
create index if not exists book_activities_school_context_idx on book_activities (school_id, package_slug, component_slug, page_id, status);
