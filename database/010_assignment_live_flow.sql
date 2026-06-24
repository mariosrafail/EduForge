alter table activity_assignments add column if not exists title text;
alter table activity_assignments add column if not exists teacher_notes text not null default '';
alter table activity_assignments add column if not exists worksheet_links jsonb not null default '[]'::jsonb;
alter table activity_assignments add column if not exists attached_files jsonb not null default '[]'::jsonb;
alter table activity_assignments add column if not exists updated_at timestamptz default now();

alter table activity_submissions add column if not exists teacher_feedback text not null default '';
alter table activity_submissions add column if not exists reviewed_at timestamptz;
alter table activity_submissions add column if not exists reviewed_by uuid references app_users(id) on delete set null;

create index if not exists activity_assignments_teacher_idx on activity_assignments (teacher_id);
create index if not exists activity_assignments_class_idx on activity_assignments (class_id);
create index if not exists activity_assignments_student_idx on activity_assignments (student_id);
create index if not exists activity_assignments_activity_idx on activity_assignments (activity_id);
create index if not exists activity_assignments_due_idx on activity_assignments (due_at);
create index if not exists activity_submissions_assignment_student_idx on activity_submissions (activity_assignment_id, student_id);
create index if not exists activity_submissions_student_idx on activity_submissions (student_id);
