create extension if not exists pgcrypto;

create table if not exists courses (
  id uuid primary key default gen_random_uuid(),
  school_id uuid references schools(id) on delete cascade,
  title text not null,
  subtitle text,
  book_code text,
  level text,
  status text not null default 'active' check (status in ('draft', 'active', 'archived')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists lessons (
  id uuid primary key default gen_random_uuid(),
  course_id uuid references courses(id) on delete cascade,
  title text not null,
  subtitle text,
  position int not null default 1,
  instructions text,
  status text not null default 'published' check (status in ('draft', 'published', 'archived')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists lesson_activities (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid references lessons(id) on delete cascade,
  type text not null check (type in ('gap_fill', 'line_matching', 'multiple_choice')),
  title text not null,
  instructions text,
  position int not null default 1,
  content jsonb not null,
  correct_answers jsonb not null,
  feedback jsonb,
  skill text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists lesson_submissions (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid references lessons(id) on delete cascade,
  student_id uuid references app_users(id),
  answers jsonb not null,
  score numeric,
  activity_scores jsonb,
  mistakes jsonb,
  revision_guidance jsonb,
  submitted_at timestamptz default now()
);

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_courses_updated_at on courses;
create trigger set_courses_updated_at
before update on courses
for each row
execute function set_updated_at();

drop trigger if exists set_lessons_updated_at on lessons;
create trigger set_lessons_updated_at
before update on lessons
for each row
execute function set_updated_at();

drop trigger if exists set_lesson_activities_updated_at on lesson_activities;
create trigger set_lesson_activities_updated_at
before update on lesson_activities
for each row
execute function set_updated_at();

create index if not exists courses_book_code_idx on courses (book_code);
create index if not exists lessons_course_position_idx on lessons (course_id, position);
create index if not exists lesson_activities_lesson_position_idx on lesson_activities (lesson_id, position);
create index if not exists lesson_submissions_lesson_idx on lesson_submissions (lesson_id, submitted_at desc);

with ensure_demo_school as (
  insert into schools (name, logo, primary_color, secondary_color)
  select 'Hamilton House ELT Demo', 'HH', '#f97316', '#0b1f3a'
  where not exists (select 1 from schools where name = 'Hamilton House ELT Demo')
  returning id
),
selected_school as (
  select id from ensure_demo_school
  union all
  select id from (
    select id from schools
    where name = 'Hamilton House ELT Demo'
      and not exists (select 1 from ensure_demo_school)
    order by created_at asc
    limit 1
  ) existing_school
),
ensure_demo_course as (
  insert into courses (school_id, title, subtitle, book_code, level, status)
  select id, 'English Skills B1', 'Hamilton House digital course demo', 'B1-DEMO-2026', 'B1', 'active'
  from selected_school
  where not exists (select 1 from courses where book_code = 'B1-DEMO-2026')
  returning id
),
selected_course as (
  select id from ensure_demo_course
  union all
  select id from (
    select id from courses
    where book_code = 'B1-DEMO-2026'
      and not exists (select 1 from ensure_demo_course)
    order by created_at asc
    limit 1
  ) existing_course
),
ensure_demo_lesson as (
  insert into lessons (course_id, title, position, instructions, status)
  select id, 'Welcome 2 - Vocabulary 4', 1, 'Complete the activities in order or jump between activities during demo mode.', 'published'
  from selected_course
  where not exists (
    select 1
    from lessons
    join selected_course on lessons.course_id = selected_course.id
    where lessons.title = 'Welcome 2 - Vocabulary 4'
  )
  returning id
),
selected_lesson as (
  select id from ensure_demo_lesson
  union all
  select id from (
    select lessons.id
    from lessons
    join selected_course on lessons.course_id = selected_course.id
    where lessons.title = 'Welcome 2 - Vocabulary 4'
      and not exists (select 1 from ensure_demo_lesson)
    order by lessons.created_at asc
    limit 1
  ) existing_lesson
)
insert into lesson_activities (lesson_id, type, title, instructions, position, content, correct_answers, feedback, skill)
select selected_lesson.id, seed.type, seed.title, seed.instructions, seed.position, seed.content::jsonb, seed.correct_answers::jsonb, seed.feedback::jsonb, seed.skill
from selected_lesson
cross join (
  values
    (
      'gap_fill',
      'Days of the school week',
      'Drag each word into the correct gap.',
      1,
      '{"wordBank":["Friday","Monday","Saturday","Thursday","Tuesday","Wednesday"],"prompts":["This is the first day of the school week.","This is the second day of the school week.","This is the day after Tuesday.","This is the day after Wednesday.","This is the day before Sunday.","This is the day before Saturday."]}',
      '{"answers":["Monday","Tuesday","Wednesday","Thursday","Saturday","Friday"]}',
      '{"correct":"Good job. You chose the correct word.","wrong":"Review the clue and choose the word that fits it.","revision":"Review the weekday order before trying again."}',
      'Days of the week'
    ),
    (
      'line_matching',
      'Seasons in the UK',
      'Drag from one box to another to make a match.',
      2,
      '{"leftItems":[{"id":"spring","label":"spring"},{"id":"summer","label":"summer"},{"id":"autumn","label":"autumn"},{"id":"winter","label":"winter"}],"rightItems":[{"id":"autumn-months","label":"September, October, November"},{"id":"summer-months","label":"June, July, August"},{"id":"winter-months","label":"December, January, February"},{"id":"spring-months","label":"March, April, May"}]}',
      '{"spring":"spring-months","summer":"summer-months","autumn":"autumn-months","winter":"winter-months"}',
      '{"correct":"Good job. Your matches are correct.","wrong":"Review the season and month groups before trying again.","revision":"Review the seasons and their months before trying again."}',
      'Seasons and months'
    ),
    (
      'multiple_choice',
      'Choose the correct word',
      'Choose the best answer.',
      3,
      '{"questions":[{"id":"mc-1","prompt":"Which word completes the sentence? I usually _____ my homework after dinner.","options":["do","make","take","have"]}]}',
      '{"mc-1":"do"}',
      '{"correct":"Good job. You chose the correct answer.","wrong":"Use the sentence context before choosing the answer.","revision":"Review common verb collocations with homework."}',
      'Vocabulary collocations'
    )
) as seed(type, title, instructions, position, content, correct_answers, feedback, skill)
where not exists (
  select 1 from lesson_activities
  where lesson_id = selected_lesson.id
    and position = seed.position
);
