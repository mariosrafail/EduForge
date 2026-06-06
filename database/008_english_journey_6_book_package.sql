create extension if not exists pgcrypto;

insert into publishers (name, slug)
values ('Imported AIR package', 'imported-air-package')
on conflict (slug) do update
set name = excluded.name;

with publisher as (select id from publishers where slug = 'imported-air-package')
insert into book_packages (publisher_id, title, slug, level, description, cover_asset_path, status)
select
  publisher.id,
  'English Journey 6',
  'english-journey-6',
  'A2',
  'English Journey 6 digital book package imported from the Adobe AIR source bundle.',
  'src/assets/books/english-journey-6/covers/english_journey_6_students_book.png',
  'active'
from publisher
on conflict (slug) do update
set title = excluded.title,
    level = excluded.level,
    description = excluded.description,
    cover_asset_path = excluded.cover_asset_path,
    status = excluded.status;

with pkg as (select id from book_packages where slug = 'english-journey-6')
insert into book_components (book_package_id, title, slug, component_type, cover_asset_path, sort_order)
select pkg.id, seed.title, seed.slug, seed.component_type, seed.cover_asset_path, seed.sort_order
from pkg
cross join (
  values
    ('English Journey 6 Students Book', 'english-journey-6-students-book', 'students_book', 'src/assets/books/english-journey-6/covers/english_journey_6_students_book.png', 1),
    ('English Journey 6 Workbook', 'english-journey-6-workbook', 'workbook', 'src/assets/books/english-journey-6/covers/english_journey_6_students_book.png', 2),
    ('English Journey 6 Grammar Book', 'english-journey-6-grammar-book', 'grammar_book', 'src/assets/books/english-journey-6/covers/english_journey_6_students_book.png', 3),
    ('English Journey 6 Test Book', 'english-journey-6-test-book', 'test_book', 'src/assets/books/english-journey-6/covers/english_journey_6_students_book.png', 4),
    ('English Journey 6 Video Bank', 'english-journey-6-video-bank', 'video_bank', 'src/assets/books/english-journey-6/covers/english_journey_6_students_book.png', 5)
) as seed(title, slug, component_type, cover_asset_path, sort_order)
on conflict (book_package_id, slug) do update
set title = excluded.title,
    component_type = excluded.component_type,
    cover_asset_path = excluded.cover_asset_path,
    sort_order = excluded.sort_order;

with components as (
  select id, slug from book_components where book_package_id = (select id from book_packages where slug = 'english-journey-6')
),
unit_seed as (
  select 'english-journey-6-students-book' as component_slug, concat('Unit ', unit_number) as title, concat('unit-', unit_number) as slug, unit_number, unit_number as sort_order
  from generate_series(1, 10) as unit_number
  union all
  select 'english-journey-6-workbook', concat('Unit ', unit_number), concat('unit-', unit_number), unit_number, unit_number
  from generate_series(1, 10) as unit_number
  union all
  select 'english-journey-6-grammar-book', concat('Unit ', unit_number), concat('unit-', unit_number), unit_number, unit_number
  from generate_series(1, 10) as unit_number
  union all
  select 'english-journey-6-test-book', concat('Test ', test_number), concat('test-', test_number), test_number, test_number
  from generate_series(1, 2) as test_number
  union all
  select 'english-journey-6-video-bank', 'Video set 1', 'video-set-1', 1, 1
)
insert into units (book_component_id, title, slug, unit_number, sort_order)
select components.id, unit_seed.title, unit_seed.slug, unit_seed.unit_number, unit_seed.sort_order
from unit_seed
join components on components.slug = unit_seed.component_slug
on conflict (book_component_id, slug) do update
set title = excluded.title,
    unit_number = excluded.unit_number,
    sort_order = excluded.sort_order;

with unit_src as (
  select units.id, book_components.slug as component_slug, units.slug as unit_slug
  from units
  join book_components on book_components.id = units.book_component_id
  join book_packages on book_packages.id = book_components.book_package_id
  where book_packages.slug = 'english-journey-6'
),
lesson_seed as (
  select component_slug, unit_slug, concat('Part ', part_number) as title, concat('part-', part_number) as slug, 'resources' as lesson_type, part_number as sort_order
  from unit_src
  cross join lateral generate_series(
    1,
    case
      when component_slug = 'english-journey-6-students-book' then 10
      when component_slug in ('english-journey-6-workbook', 'english-journey-6-grammar-book') then 6
      else 1
    end
  ) as part_number
)
insert into lessons (unit_id, title, slug, lesson_type, sort_order, position, instructions, status)
select unit_src.id, lesson_seed.title, lesson_seed.slug, lesson_seed.lesson_type, lesson_seed.sort_order, lesson_seed.sort_order, 'Imported AIR package resources. Map to an interactive activity before assigning.', 'draft'
from lesson_seed
join unit_src on unit_src.component_slug = lesson_seed.component_slug and unit_src.unit_slug = lesson_seed.unit_slug
on conflict (unit_id, slug) do update
set title = excluded.title,
    lesson_type = excluded.lesson_type,
    sort_order = excluded.sort_order,
    position = excluded.position,
    instructions = excluded.instructions,
    status = excluded.status;

with lesson_src as (
  select
    lessons.id,
    lessons.slug as lesson_slug,
    units.slug as unit_slug,
    book_components.slug as component_slug,
    case
      when book_components.slug = 'english-journey-6-students-book' then 'unit'
      when book_components.slug = 'english-journey-6-workbook' then 'work'
      when book_components.slug = 'english-journey-6-grammar-book' then 'grammar'
      when book_components.slug = 'english-journey-6-test-book' then 'test'
      when book_components.slug = 'english-journey-6-video-bank' then 'video'
      else book_components.slug
    end as source_folder
  from lessons
  join units on units.id = lessons.unit_id
  join book_components on book_components.id = units.book_component_id
  join book_packages on book_packages.id = book_components.book_package_id
  where book_packages.slug = 'english-journey-6'
)
insert into activities (lesson_id, slug, title, type, activity_type, instructions, estimated_minutes, timer_seconds, media_asset_path, content, content_json, settings_json, sort_order, is_assignable, is_demo_active)
select
  lesson_src.id,
  concat(lesson_src.unit_slug, '-', lesson_src.lesson_slug, '-resources'),
  concat(initcap(replace(lesson_src.lesson_slug, '-', ' ')), ' resources'),
  'imported_air_resource',
  'imported_air_resource',
  'Imported from English Journey 6.app. This resource bundle is visible but locked until mapped to a web activity.',
  null::int,
  null::int,
  null::text,
  jsonb_build_object(
    'sourceBundle', 'English Journey 6.app',
    'sourcePath', concat('assets/books/book1/', lesson_src.source_folder, '/', regexp_replace(lesson_src.unit_slug, '^(unit|test|video-set)-', ''), '/', lesson_src.lesson_slug),
    'lockedReason', 'AIR assets need activity mapping'
  ),
  jsonb_build_object(
    'sourceBundle', 'English Journey 6.app',
    'sourcePath', concat('assets/books/book1/', lesson_src.source_folder, '/', regexp_replace(lesson_src.unit_slug, '^(unit|test|video-set)-', ''), '/', lesson_src.lesson_slug),
    'lockedReason', 'AIR assets need activity mapping'
  ),
  '{}'::jsonb,
  1,
  false,
  false
from lesson_src
on conflict (lesson_id, slug) do update
set title = excluded.title,
    type = excluded.type,
    activity_type = excluded.activity_type,
    instructions = excluded.instructions,
    content = excluded.content,
    content_json = excluded.content_json,
    settings_json = excluded.settings_json,
    sort_order = excluded.sort_order,
    is_assignable = excluded.is_assignable,
    is_demo_active = excluded.is_demo_active;

with pkg as (select id from book_packages where slug = 'english-journey-6'),
school as (select id from schools where name = 'Hamilton House ELT Demo' order by created_at asc limit 1)
insert into activation_codes (code, book_package_id, school_id, max_uses, used_count, status)
select 'EJ6-DEMO-2026', pkg.id, school.id, 100, 0, 'active'
from pkg left join school on true
on conflict (code) do update
set book_package_id = excluded.book_package_id,
    school_id = excluded.school_id,
    max_uses = excluded.max_uses,
    status = excluded.status;
