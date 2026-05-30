create extension if not exists pgcrypto;

create table if not exists publishers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists book_packages (
  id uuid primary key default gen_random_uuid(),
  publisher_id uuid not null references publishers(id) on delete cascade,
  title text not null,
  slug text not null unique,
  level text not null,
  description text,
  cover_asset_path text,
  status text not null default 'draft' check (status in ('active', 'draft', 'archived')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists book_components (
  id uuid primary key default gen_random_uuid(),
  book_package_id uuid not null references book_packages(id) on delete cascade,
  title text not null,
  slug text not null,
  component_type text not null,
  cover_asset_path text,
  sort_order int not null default 1,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (book_package_id, slug)
);

create table if not exists units (
  id uuid primary key default gen_random_uuid(),
  book_component_id uuid not null references book_components(id) on delete cascade,
  title text not null,
  slug text not null,
  unit_number int,
  sort_order int not null default 1,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (book_component_id, slug)
);

alter table lessons add column if not exists unit_id uuid references units(id) on delete cascade;
alter table lessons add column if not exists slug text;
alter table lessons add column if not exists lesson_type text;
alter table lessons add column if not exists sort_order int;

update lessons
set sort_order = position
where sort_order is null;

create unique index if not exists lessons_unit_slug_idx on lessons (unit_id, slug) where unit_id is not null and slug is not null;
create unique index if not exists lessons_unit_slug_unique_idx on lessons (unit_id, slug);
create index if not exists lessons_unit_sort_idx on lessons (unit_id, sort_order);

alter table activities drop constraint if exists activities_type_check;
alter table activities add column if not exists lesson_id uuid references lessons(id) on delete cascade;
alter table activities add column if not exists slug text;
alter table activities add column if not exists activity_type text;
alter table activities add column if not exists instructions text;
alter table activities add column if not exists estimated_minutes int;
alter table activities add column if not exists timer_seconds int;
alter table activities add column if not exists media_asset_path text;
alter table activities add column if not exists content_json jsonb;
alter table activities add column if not exists settings_json jsonb;
alter table activities add column if not exists sort_order int;
alter table activities add column if not exists is_assignable boolean not null default true;
alter table activities add column if not exists is_demo_active boolean not null default false;

update activities
set activity_type = coalesce(activity_type, type),
    instructions = coalesce(instructions, ''),
    content_json = coalesce(content_json, content),
    settings_json = coalesce(settings_json, '{}'::jsonb),
    sort_order = coalesce(sort_order, 1)
where activity_type is null
   or content_json is null
   or settings_json is null
   or sort_order is null;

create unique index if not exists activities_lesson_slug_idx on activities (lesson_id, slug) where lesson_id is not null and slug is not null;
create unique index if not exists activities_lesson_slug_unique_idx on activities (lesson_id, slug);
create index if not exists activities_lesson_sort_idx on activities (lesson_id, sort_order);
create index if not exists activities_demo_idx on activities (is_demo_active, activity_type);

create table if not exists questions (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references activities(id) on delete cascade,
  question_number int not null,
  prompt text not null,
  question_type text not null,
  content_json jsonb,
  feedback_json jsonb,
  sort_order int not null default 1,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (activity_id, question_number)
);

create table if not exists question_options (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references questions(id) on delete cascade,
  option_label text not null,
  option_text text not null,
  is_correct boolean not null default false,
  sort_order int not null default 1,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (question_id, option_label)
);

create table if not exists activation_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  book_package_id uuid not null references book_packages(id) on delete cascade,
  school_id uuid references schools(id) on delete set null,
  user_id uuid references app_users(id) on delete set null,
  max_uses int,
  used_count int not null default 0,
  status text not null default 'active' check (status in ('active', 'revoked', 'expired')),
  expires_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists book_access (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references app_users(id) on delete cascade,
  book_package_id uuid not null references book_packages(id) on delete cascade,
  activation_code_id uuid references activation_codes(id) on delete set null,
  role_scope text not null check (role_scope in ('teacher', 'student', 'school_admin')),
  granted_at timestamptz not null default now(),
  created_at timestamptz default now(),
  unique (user_id, book_package_id, role_scope)
);

create table if not exists activity_assignments (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references activities(id) on delete cascade,
  teacher_id uuid references app_users(id) on delete set null,
  class_id uuid references classes(id) on delete set null,
  student_id uuid references app_users(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  due_at timestamptz,
  status text not null default 'assigned' check (status in ('assigned', 'closed')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table activity_submissions add column if not exists activity_id uuid references activities(id) on delete cascade;
alter table activity_submissions add column if not exists activity_assignment_id uuid references activity_assignments(id) on delete set null;
alter table activity_submissions add column if not exists started_at timestamptz default now();
alter table activity_submissions add column if not exists score_percent numeric;
alter table activity_submissions add column if not exists correct_count int;
alter table activity_submissions add column if not exists total_count int;
alter table activity_submissions add column if not exists status text default 'submitted';
alter table activity_submissions alter column answers drop not null;

create table if not exists student_answers (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references activity_submissions(id) on delete cascade,
  question_id uuid not null references questions(id) on delete cascade,
  selected_option_id uuid references question_options(id) on delete set null,
  answer_text text,
  is_correct boolean,
  feedback_text text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (submission_id, question_id)
);

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_publishers_updated_at on publishers;
create trigger set_publishers_updated_at before update on publishers for each row execute function set_updated_at();
drop trigger if exists set_book_packages_updated_at on book_packages;
create trigger set_book_packages_updated_at before update on book_packages for each row execute function set_updated_at();
drop trigger if exists set_book_components_updated_at on book_components;
create trigger set_book_components_updated_at before update on book_components for each row execute function set_updated_at();
drop trigger if exists set_units_updated_at on units;
create trigger set_units_updated_at before update on units for each row execute function set_updated_at();
drop trigger if exists set_questions_updated_at on questions;
create trigger set_questions_updated_at before update on questions for each row execute function set_updated_at();
drop trigger if exists set_question_options_updated_at on question_options;
create trigger set_question_options_updated_at before update on question_options for each row execute function set_updated_at();
drop trigger if exists set_activation_codes_updated_at on activation_codes;
create trigger set_activation_codes_updated_at before update on activation_codes for each row execute function set_updated_at();
drop trigger if exists set_activity_assignments_updated_at on activity_assignments;
create trigger set_activity_assignments_updated_at before update on activity_assignments for each row execute function set_updated_at();
drop trigger if exists set_student_answers_updated_at on student_answers;
create trigger set_student_answers_updated_at before update on student_answers for each row execute function set_updated_at();

insert into publishers (name, slug)
values ('Hamilton House', 'hamilton-house')
on conflict (slug) do update set name = excluded.name;

with publisher as (
  select id from publishers where slug = 'hamilton-house'
)
insert into book_packages (publisher_id, title, slug, level, description, cover_asset_path, status)
select id, 'Ultimate B2', 'ultimate-b2', 'B2', 'Hamilton House Ultimate B2 digital book package for ELT schools.', 'src/assets/books/ultimate-b2/covers/ultimate_b2_students_book.jpg', 'active'
from publisher
on conflict (slug) do update
set title = excluded.title,
    level = excluded.level,
    description = excluded.description,
    cover_asset_path = excluded.cover_asset_path,
    status = excluded.status;

with pkg as (select id from book_packages where slug = 'ultimate-b2')
insert into book_components (book_package_id, title, slug, component_type, cover_asset_path, sort_order)
select pkg.id, seed.title, seed.slug, seed.component_type, seed.cover_asset_path, seed.sort_order
from pkg
cross join (
  values
    ('Ultimate B2 Students Book', 'ultimate-b2-students-book', 'students_book', 'src/assets/books/ultimate-b2/covers/ultimate_b2_students_book.jpg', 1),
    ('Ultimate B2 Workbook', 'ultimate-b2-workbook', 'workbook', 'src/assets/books/ultimate-b2/covers/ultimate_b2_workbook.jpg', 2),
    ('Ultimate B2 Grammar Book', 'ultimate-b2-grammar-book', 'grammar_book', 'src/assets/books/ultimate-b2/covers/ultimate_b2_grammar_book.jpg', 3),
    ('Ultimate B2 Test Book', 'ultimate-b2-test-book', 'test_book', 'src/assets/books/ultimate-b2/covers/ultimate_b2_test_book.jpg', 4)
) as seed(title, slug, component_type, cover_asset_path, sort_order)
on conflict (book_package_id, slug) do update
set title = excluded.title,
    component_type = excluded.component_type,
    cover_asset_path = excluded.cover_asset_path,
    sort_order = excluded.sort_order;

with components as (select id, slug from book_components)
insert into units (book_component_id, title, slug, unit_number, sort_order)
select components.id, seed.title, seed.slug, seed.unit_number, seed.sort_order
from components
join (
  values
    ('ultimate-b2-students-book', 'Unit 2', 'unit-2', 2, 1),
    ('ultimate-b2-workbook', 'Unit 2', 'unit-2', 2, 1),
    ('ultimate-b2-grammar-book', 'Unit 2', 'unit-2', 2, 1),
    ('ultimate-b2-test-book', 'Quiz 1', 'quiz-1', 1, 1),
    ('ultimate-b2-test-book', 'Quiz 2', 'quiz-2', 2, 2)
) as seed(component_slug, title, slug, unit_number, sort_order)
  on seed.component_slug = components.slug
on conflict (book_component_id, slug) do update
set title = excluded.title,
    unit_number = excluded.unit_number,
    sort_order = excluded.sort_order;

with units_src as (
  select units.id, book_components.slug as component_slug, units.slug as unit_slug
  from units
  join book_components on book_components.id = units.book_component_id
)
insert into lessons (unit_id, title, slug, lesson_type, sort_order, position, instructions, status)
select units_src.id, seed.title, seed.slug, seed.lesson_type, seed.sort_order, seed.sort_order, seed.instructions, 'published'
from units_src
join (
  values
    ('ultimate-b2-students-book', 'unit-2', 'Unit 2 Reading', 'unit-2-reading', 'reading', 1, 'Read the Unit 2 text and complete comprehension tasks.'),
    ('ultimate-b2-workbook', 'unit-2', 'Unit 2 Listening', 'unit-2-listening', 'listening', 1, 'Listen to the Unit 2 audio and answer the questions.'),
    ('ultimate-b2-grammar-book', 'unit-2', 'Unit 2 Grammar', 'unit-2-grammar', 'grammar', 1, 'Review the grammar rules and complete controlled practice.'),
    ('ultimate-b2-test-book', 'quiz-1', 'Vocabulary', 'quiz-1-vocabulary', 'test', 1, 'Choose the correct answers.'),
    ('ultimate-b2-test-book', 'quiz-2', 'Quiz 2', 'quiz-2-test', 'test', 1, 'Complete the timed Unit 2 progress check.')
) as seed(component_slug, unit_slug, title, slug, lesson_type, sort_order, instructions)
  on seed.component_slug = units_src.component_slug and seed.unit_slug = units_src.unit_slug
on conflict (unit_id, slug) do update
set title = excluded.title,
    lesson_type = excluded.lesson_type,
    sort_order = excluded.sort_order,
    position = excluded.position,
    instructions = excluded.instructions,
    status = excluded.status;

with lesson_src as (select id, slug from lessons where unit_id is not null)
insert into activities (lesson_id, slug, title, type, activity_type, instructions, estimated_minutes, timer_seconds, media_asset_path, content, content_json, settings_json, sort_order, is_assignable, is_demo_active)
select lesson_src.id, seed.slug, seed.title, seed.activity_type, seed.activity_type, seed.instructions, seed.estimated_minutes, seed.timer_seconds, seed.media_asset_path, seed.content_json, seed.content_json, seed.settings_json, seed.sort_order, seed.is_assignable, true
from lesson_src
join (
  values
    ('unit-2-reading', 'unit-2-reading-video-intro', 'Unit 2 Reading Video Intro', 'media_video', 'Watch the video introduction.', 4, null::int, null::text, '{"placeholder":true,"duration":"02:15","note":"Replace with supplied Ultimate B2 video asset","demoActivityKey":"video-intro"}'::jsonb, '{}'::jsonb, 1, true),
    ('unit-2-reading', 'unit-2-reading-exercise-3', 'Unit 2 Reading Exercise 3', 'reading_multiple_choice', 'Choose the correct answers.', 8, null::int, null::text, '{"demoTextPlaceholder":true,"demoActivityKey":"reading-ex3"}'::jsonb, '{}'::jsonb, 2, true),
    ('unit-2-reading', 'unit-2-reading-exercise-4', 'Unit 2 Reading Exercise 4', 'reading_evidence', 'Choose the paragraph/evidence or write the short answer.', 10, null::int, null::text, '{"demoTextPlaceholder":true,"demoActivityKey":"reading-ex4"}'::jsonb, '{}'::jsonb, 3, true),
    ('unit-2-listening', 'workbook-page-20-listening-exercise', 'Workbook page 20 Listening Exercise', 'listening_multiple_choice', 'Listen and choose the correct answers.', 10, null::int, null::text, '{"placeholder":true,"duration":"01:40","note":"Replace with supplied Ultimate B2 audio asset","demoActivityKey":"listening-page-20"}'::jsonb, '{}'::jsonb, 1, true),
    ('unit-2-grammar', 'opening-exercise', 'Opening exercise', 'grammar_gap_fill', 'Complete the Unit 2 grammar warm-up.', 7, null::int, null::text, '{"demoActivityKey":"grammar-opening","grammar_rules":["Use past perfect for an earlier past action: had + past participle.","Use so that to explain purpose.","Use participle clauses to connect actions clearly."]}'::jsonb, '{}'::jsonb, 1, true),
    ('unit-2-grammar', 'exercise-4', 'Exercise 4', 'grammar_multiple_choice', 'Choose the best grammar option.', 12, null::int, null::text, '{"demoActivityKey":"grammar-ex4","grammar_rules":["Use past perfect for an earlier past action: had + past participle.","Use so that to explain purpose.","Use participle clauses to connect actions clearly."]}'::jsonb, '{}'::jsonb, 2, true),
    ('quiz-1-vocabulary', 'quiz-1-vocabulary', 'Quiz 1 Vocabulary', 'timed_quiz', 'Choose the correct answers.', 20, 1200, null::text, '{"scoreLabel":"/20","section":"Vocabulary","sourcePage":"Quiz 1","demoActivityKey":"quiz-1-vocabulary"}'::jsonb, '{}'::jsonb, 1, true),
    ('quiz-2-test', 'quiz-2-timed-test', 'Quiz 2', 'timed_quiz', 'Complete the 20-minute timed test.', 20, 1200, null::text, '{"scoreLabel":"/10","section":"Unit 2 Progress","sourcePage":"Quiz 2","demoActivityKey":"quiz-2"}'::jsonb, '{}'::jsonb, 1, true)
) as seed(lesson_slug, slug, title, activity_type, instructions, estimated_minutes, timer_seconds, media_asset_path, content_json, settings_json, sort_order, is_assignable)
  on seed.lesson_slug = lesson_src.slug
on conflict (lesson_id, slug) do update
set title = excluded.title,
    type = excluded.type,
    activity_type = excluded.activity_type,
    instructions = excluded.instructions,
    estimated_minutes = excluded.estimated_minutes,
    timer_seconds = excluded.timer_seconds,
    media_asset_path = excluded.media_asset_path,
    content = excluded.content,
    content_json = excluded.content_json,
    settings_json = excluded.settings_json,
    sort_order = excluded.sort_order,
    is_assignable = excluded.is_assignable,
    is_demo_active = excluded.is_demo_active;

with pkg as (select id from book_packages where slug = 'ultimate-b2'),
school as (select id from schools where name = 'Hamilton House ELT Demo' order by created_at asc limit 1)
insert into activation_codes (code, book_package_id, school_id, max_uses, used_count, status)
select 'ULT-B2-DEMO-2026', pkg.id, school.id, 100, 0, 'active'
from pkg left join school on true
on conflict (code) do update
set book_package_id = excluded.book_package_id,
    school_id = excluded.school_id,
    max_uses = excluded.max_uses,
    status = excluded.status;

with activity_seed(activity_slug, question_number, prompt, question_type, feedback_json, option_label, option_text, is_correct, sort_order) as (
  values
    ('unit-2-reading-exercise-3', 1, 'What first motivated the young inventor to change her plan?', 'multiple_choice', '{"correct":"Correct.","wrong":"Look again at the opening paragraph."}'::jsonb, 'A', 'A school competition', false, 1),
    ('unit-2-reading-exercise-3', 1, 'What first motivated the young inventor to change her plan?', 'multiple_choice', '{"correct":"Correct.","wrong":"Look again at the opening paragraph."}'::jsonb, 'B', 'A problem she noticed while travelling', true, 2),
    ('unit-2-reading-exercise-3', 1, 'What first motivated the young inventor to change her plan?', 'multiple_choice', '{"correct":"Correct.","wrong":"Look again at the opening paragraph."}'::jsonb, 'C', 'Advice from a film producer', false, 3),
    ('unit-2-reading-exercise-3', 2, 'Which word best describes the inventor after the first prototype failed?', 'multiple_choice', '{}'::jsonb, 'A', 'Determined', true, 1),
    ('unit-2-reading-exercise-3', 2, 'Which word best describes the inventor after the first prototype failed?', 'multiple_choice', '{}'::jsonb, 'B', 'Careless', false, 2),
    ('unit-2-reading-exercise-3', 2, 'Which word best describes the inventor after the first prototype failed?', 'multiple_choice', '{}'::jsonb, 'C', 'Uninterested', false, 3),
    ('unit-2-reading-exercise-3', 3, 'Why did local students help test the device?', 'multiple_choice', '{}'::jsonb, 'A', 'They could give practical feedback.', true, 1),
    ('unit-2-reading-exercise-3', 3, 'Why did local students help test the device?', 'multiple_choice', '{}'::jsonb, 'B', 'They wanted to sell it abroad.', false, 2),
    ('unit-2-reading-exercise-3', 3, 'Why did local students help test the device?', 'multiple_choice', '{}'::jsonb, 'C', 'They had written the instructions.', false, 3),
    ('unit-2-reading-exercise-3', 4, 'What is the main message of the text?', 'multiple_choice', '{}'::jsonb, 'A', 'Good ideas improve when people test and revise them.', true, 1),
    ('unit-2-reading-exercise-3', 4, 'What is the main message of the text?', 'multiple_choice', '{}'::jsonb, 'B', 'Technology always succeeds immediately.', false, 2),
    ('unit-2-reading-exercise-3', 4, 'What is the main message of the text?', 'multiple_choice', '{}'::jsonb, 'C', 'Competitions are more important than teamwork.', false, 3),
    ('unit-2-reading-exercise-4', 1, 'Which paragraph mentions the main character’s decision?', 'paragraph_choice', '{"feedback":"Check where the final decision is clearly stated."}'::jsonb, 'A', 'Paragraph 1', false, 1),
    ('unit-2-reading-exercise-4', 1, 'Which paragraph mentions the main character’s decision?', 'paragraph_choice', '{"feedback":"Check where the final decision is clearly stated."}'::jsonb, 'B', 'Paragraph 3', true, 2),
    ('unit-2-reading-exercise-4', 2, 'Which paragraph explains how feedback changed the project?', 'paragraph_choice', '{}'::jsonb, 'A', 'Paragraph 2', true, 1),
    ('unit-2-reading-exercise-4', 2, 'Which paragraph explains how feedback changed the project?', 'paragraph_choice', '{}'::jsonb, 'B', 'Paragraph 4', false, 2),
    ('unit-2-reading-exercise-4', 3, 'Write the short phrase that shows the project improved gradually.', 'short_answer', '{"acceptedAnswers":["step by step"],"feedback":"Find the phrase that describes gradual improvement."}'::jsonb, 'A', 'step by step', true, 1),
    ('workbook-page-20-listening-exercise', 1, 'The speakers are discussing a school project.', 'true_false', '{}'::jsonb, 'A', 'True', true, 1),
    ('workbook-page-20-listening-exercise', 1, 'The speakers are discussing a school project.', 'true_false', '{}'::jsonb, 'B', 'False', false, 2),
    ('workbook-page-20-listening-exercise', 2, 'Where will the students meet?', 'multiple_choice', '{}'::jsonb, 'A', 'At the library', true, 1),
    ('workbook-page-20-listening-exercise', 2, 'Where will the students meet?', 'multiple_choice', '{}'::jsonb, 'B', 'At the cinema', false, 2),
    ('workbook-page-20-listening-exercise', 2, 'Where will the students meet?', 'multiple_choice', '{}'::jsonb, 'C', 'At the station', false, 3),
    ('workbook-page-20-listening-exercise', 3, 'The deadline has changed.', 'true_false', '{}'::jsonb, 'A', 'True', false, 1),
    ('workbook-page-20-listening-exercise', 3, 'The deadline has changed.', 'true_false', '{}'::jsonb, 'B', 'False', true, 2),
    ('workbook-page-20-listening-exercise', 4, 'What does the teacher want them to add?', 'multiple_choice', '{}'::jsonb, 'A', 'A short conclusion', true, 1),
    ('workbook-page-20-listening-exercise', 4, 'What does the teacher want them to add?', 'multiple_choice', '{}'::jsonb, 'B', 'A new script', false, 2),
    ('workbook-page-20-listening-exercise', 5, 'The group will practise once more.', 'true_false', '{}'::jsonb, 'A', 'True', true, 1),
    ('workbook-page-20-listening-exercise', 5, 'The group will practise once more.', 'true_false', '{}'::jsonb, 'B', 'False', false, 2),
    ('opening-exercise', 1, 'By the time we arrived, the film ___.', 'multiple_choice', '{}'::jsonb, 'A', 'had started', true, 1),
    ('opening-exercise', 1, 'By the time we arrived, the film ___.', 'multiple_choice', '{}'::jsonb, 'B', 'has started', false, 2),
    ('opening-exercise', 2, 'She saved the file so that she ___ lose her work.', 'multiple_choice', '{}'::jsonb, 'A', 'would not', true, 1),
    ('opening-exercise', 2, 'She saved the file so that she ___ lose her work.', 'multiple_choice', '{}'::jsonb, 'B', 'had not', false, 2),
    ('opening-exercise', 3, '___ carefully, the instructions were easy to follow.', 'multiple_choice', '{}'::jsonb, 'A', 'Written', true, 1),
    ('opening-exercise', 3, '___ carefully, the instructions were easy to follow.', 'multiple_choice', '{}'::jsonb, 'B', 'Writing', false, 2),
    ('opening-exercise', 4, 'I wish I ___ earlier about the meeting.', 'multiple_choice', '{}'::jsonb, 'A', 'had known', true, 1),
    ('opening-exercise', 4, 'I wish I ___ earlier about the meeting.', 'multiple_choice', '{}'::jsonb, 'B', 'know', false, 2),
    ('exercise-4', 1, 'Choose the correct sentence.', 'multiple_choice', '{}'::jsonb, 'A', 'Having finished the report, Maya sent it to her teacher.', true, 1),
    ('exercise-4', 1, 'Choose the correct sentence.', 'multiple_choice', '{}'::jsonb, 'B', 'Finished the report, Maya sending it to her teacher.', false, 2),
    ('exercise-4', 2, 'They left early so that they ___ miss the train.', 'multiple_choice', '{}'::jsonb, 'A', 'would not', true, 1),
    ('exercise-4', 2, 'They left early so that they ___ miss the train.', 'multiple_choice', '{}'::jsonb, 'B', 'had not', false, 2),
    ('exercise-4', 3, 'I wish we ___ more time for the project.', 'multiple_choice', '{}'::jsonb, 'A', 'had had', true, 1),
    ('exercise-4', 3, 'I wish we ___ more time for the project.', 'multiple_choice', '{}'::jsonb, 'B', 'have', false, 2),
    ('exercise-4', 4, 'After the team ___ the plan, they started testing.', 'multiple_choice', '{}'::jsonb, 'A', 'had agreed on', true, 1),
    ('exercise-4', 4, 'After the team ___ the plan, they started testing.', 'multiple_choice', '{}'::jsonb, 'B', 'has agreed on', false, 2),
    ('exercise-4', 5, 'The notes, ___ during the interview, were very useful.', 'multiple_choice', '{}'::jsonb, 'A', 'taken', true, 1),
    ('exercise-4', 5, 'The notes, ___ during the interview, were very useful.', 'multiple_choice', '{}'::jsonb, 'B', 'taking', false, 2),
    ('quiz-1-vocabulary', 1, 'She’s a very experienced ___. She’s made more than twenty films in the last thirty years.', 'multiple_choice', '{}'::jsonb, 'A', 'cast', false, 1),
    ('quiz-1-vocabulary', 1, 'She’s a very experienced ___. She’s made more than twenty films in the last thirty years.', 'multiple_choice', '{}'::jsonb, 'B', 'crew', false, 2),
    ('quiz-1-vocabulary', 1, 'She’s a very experienced ___. She’s made more than twenty films in the last thirty years.', 'multiple_choice', '{}'::jsonb, 'C', 'producer', true, 3),
    ('quiz-1-vocabulary', 1, 'She’s a very experienced ___. She’s made more than twenty films in the last thirty years.', 'multiple_choice', '{}'::jsonb, 'D', 'cinemagoer', false, 4),
    ('quiz-1-vocabulary', 2, 'The ___ was very well written. When Terry read it, he knew he wanted a part in the film.', 'multiple_choice', '{}'::jsonb, 'A', 'script', true, 1),
    ('quiz-1-vocabulary', 2, 'The ___ was very well written. When Terry read it, he knew he wanted a part in the film.', 'multiple_choice', '{}'::jsonb, 'B', 'rehearsal', false, 2),
    ('quiz-1-vocabulary', 2, 'The ___ was very well written. When Terry read it, he knew he wanted a part in the film.', 'multiple_choice', '{}'::jsonb, 'C', 'costume', false, 3),
    ('quiz-1-vocabulary', 2, 'The ___ was very well written. When Terry read it, he knew he wanted a part in the film.', 'multiple_choice', '{}'::jsonb, 'D', 'release', false, 4),
    ('quiz-1-vocabulary', 3, 'I ___ a part in Fire in New York because I was busy with another film.', 'multiple_choice', '{}'::jsonb, 'A', 'turned down', true, 1),
    ('quiz-1-vocabulary', 3, 'I ___ a part in Fire in New York because I was busy with another film.', 'multiple_choice', '{}'::jsonb, 'B', 'turned to', false, 2),
    ('quiz-1-vocabulary', 3, 'I ___ a part in Fire in New York because I was busy with another film.', 'multiple_choice', '{}'::jsonb, 'C', 'turned up', false, 3),
    ('quiz-1-vocabulary', 3, 'I ___ a part in Fire in New York because I was busy with another film.', 'multiple_choice', '{}'::jsonb, 'D', 'turned around', false, 4),
    ('quiz-1-vocabulary', 4, 'The director asked everyone to attend one final ___ before filming.', 'multiple_choice', '{}'::jsonb, 'A', 'rehearsal', true, 1),
    ('quiz-1-vocabulary', 4, 'The director asked everyone to attend one final ___ before filming.', 'multiple_choice', '{}'::jsonb, 'B', 'audience', false, 2),
    ('quiz-1-vocabulary', 4, 'The director asked everyone to attend one final ___ before filming.', 'multiple_choice', '{}'::jsonb, 'C', 'plot', false, 3),
    ('quiz-1-vocabulary', 4, 'The director asked everyone to attend one final ___ before filming.', 'multiple_choice', '{}'::jsonb, 'D', 'screen', false, 4)
),
upsert_questions as (
  insert into questions (activity_id, question_number, prompt, question_type, feedback_json, sort_order)
  select distinct activities.id, activity_seed.question_number, activity_seed.prompt, activity_seed.question_type, activity_seed.feedback_json, activity_seed.question_number
  from activity_seed
  join activities on activities.slug = activity_seed.activity_slug
  on conflict (activity_id, question_number) do update
  set prompt = excluded.prompt,
      question_type = excluded.question_type,
      feedback_json = excluded.feedback_json,
      sort_order = excluded.sort_order
  returning id, activity_id, question_number
)
insert into question_options (question_id, option_label, option_text, is_correct, sort_order)
select questions.id, activity_seed.option_label, activity_seed.option_text, activity_seed.is_correct, activity_seed.sort_order
from activity_seed
join activities on activities.slug = activity_seed.activity_slug
join questions on questions.activity_id = activities.id and questions.question_number = activity_seed.question_number
on conflict (question_id, option_label) do update
set option_text = excluded.option_text,
    is_correct = excluded.is_correct,
    sort_order = excluded.sort_order;
