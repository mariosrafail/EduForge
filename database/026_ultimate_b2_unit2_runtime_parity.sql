begin;

-- Migration 019 predates the stable normalized IDs used by the 40-activity
-- Unit 2 runtime. Preserve its authoritative questions/options while moving
-- the two scored reading activities onto their canonical IDs.
update activities
set slug = 'ultimate-b2-sb-u2-p2-o3',
    content = coalesce(content, '{}'::jsonb) || jsonb_build_object(
      'demoActivityKey', 'ultimate-b2-sb-u2-p2-o3',
      'publisherSourceActivityId', 'ultimate-b2-sb-u2-p2-o3',
      'implementationMode', 'auto-scored'
    ),
    content_json = coalesce(content_json, '{}'::jsonb) || jsonb_build_object(
      'demoActivityKey', 'ultimate-b2-sb-u2-p2-o3',
      'publisherSourceActivityId', 'ultimate-b2-sb-u2-p2-o3',
      'implementationMode', 'auto-scored'
    )
where slug = 'unit-2-reading-exercise-3';

update activities
set slug = 'ultimate-b2-sb-u2-p2-o4',
    content = coalesce(content, '{}'::jsonb) || jsonb_build_object(
      'demoActivityKey', 'ultimate-b2-sb-u2-p2-o4',
      'publisherSourceActivityId', 'ultimate-b2-sb-u2-p2-o4',
      'implementationMode', 'auto-scored'
    ),
    content_json = coalesce(content_json, '{}'::jsonb) || jsonb_build_object(
      'demoActivityKey', 'ultimate-b2-sb-u2-p2-o4',
      'publisherSourceActivityId', 'ultimate-b2-sb-u2-p2-o4',
      'implementationMode', 'auto-scored'
    )
where slug = 'unit-2-reading-exercise-4';

do $migration$
declare
  unit_uuid uuid;
  lesson_uuid uuid;
  activity_uuid uuid;
begin
  select unit_record.id into unit_uuid
  from units unit_record
  join book_components component on component.id = unit_record.book_component_id
  join book_packages package_record on package_record.id = component.book_package_id
  where package_record.slug = 'ultimate-b2'
    and component.slug = 'ultimate-b2-students-book'
    and unit_record.slug = 'unit-2'
  limit 1;

  select id into lesson_uuid
  from lessons
  where unit_id = unit_uuid and slug = 'unit-2-reading'
  limit 1;

  insert into activities (
    lesson_id, slug, title, type, activity_type, instructions,
    content, content_json, settings_json, sort_order,
    is_assignable, is_demo_active
  )
  values (
    lesson_uuid,
    'ultimate-b2-sb-u2-p2-o2',
    'Reading · Exercise 2',
    'text_panel',
    'text_panel',
    'Read and listen to the publisher text.',
    '{"demoActivityKey":"ultimate-b2-sb-u2-p2-o2","publisherSourceActivityId":"ultimate-b2-sb-u2-p2-o2","implementationMode":"reading-content"}'::jsonb,
    '{"demoActivityKey":"ultimate-b2-sb-u2-p2-o2","publisherSourceActivityId":"ultimate-b2-sb-u2-p2-o2","implementationMode":"reading-content"}'::jsonb,
    '{}'::jsonb,
    200,
    true,
    true
  )
  on conflict (lesson_id, slug) do update
  set title = excluded.title,
      type = excluded.type,
      activity_type = excluded.activity_type,
      instructions = excluded.instructions,
      content = excluded.content,
      content_json = excluded.content_json,
      is_assignable = true,
      is_demo_active = true;

  insert into lessons (
    unit_id, title, slug, lesson_type, sort_order, position,
    instructions, status
  )
  values (
    unit_uuid, 'Unit 2 · Part 6', 'unit-2-part-06',
    'students-book-activity', 6, 6,
    'Evidence-backed Students Book Unit 2 activities.', 'published'
  )
  on conflict (unit_id, slug) do update
  set status = 'published';

  select id into lesson_uuid
  from lessons
  where unit_id = unit_uuid and slug = 'unit-2-part-06'
  limit 1;

  insert into activities (
    lesson_id, slug, title, type, activity_type, instructions,
    content, content_json, settings_json, sort_order,
    is_assignable, is_demo_active
  )
  values (
    lesson_uuid,
    'ultimate-b2-sb-u2-p6-o1',
    'Speaking · Exercise 1',
    'typed_gap_fill',
    'typed_gap_fill',
    'Compare the photos using the publisher prompts.',
    '{"demoActivityKey":"ultimate-b2-sb-u2-p6-o1","publisherSourceActivityId":"ultimate-b2-sb-u2-p6-o1","implementationMode":"unscored-practice"}'::jsonb,
    '{"demoActivityKey":"ultimate-b2-sb-u2-p6-o1","publisherSourceActivityId":"ultimate-b2-sb-u2-p6-o1","implementationMode":"unscored-practice"}'::jsonb,
    '{}'::jsonb,
    601,
    true,
    true
  )
  on conflict (lesson_id, slug) do update
  set title = excluded.title,
      instructions = excluded.instructions,
      content = excluded.content,
      content_json = excluded.content_json,
      is_assignable = true,
      is_demo_active = true
  returning id into activity_uuid;

  insert into questions (activity_id, question_number, prompt, question_type, feedback_json, sort_order)
  values
    (activity_uuid, 1, 'Similarities', 'practice_prompt', '{"source":"publisher-prompt-no-answer"}'::jsonb, 1),
    (activity_uuid, 2, 'Differences', 'practice_prompt', '{"source":"publisher-prompt-no-answer"}'::jsonb, 2)
  on conflict (activity_id, question_number) do update
  set prompt = excluded.prompt,
      question_type = excluded.question_type,
      feedback_json = excluded.feedback_json,
      sort_order = excluded.sort_order;

  insert into activities (
    lesson_id, slug, title, type, activity_type, instructions,
    content, content_json, settings_json, sort_order,
    is_assignable, is_demo_active
  )
  values (
    lesson_uuid,
    'ultimate-b2-sb-u2-p6-o5',
    'Speaking · Exercise 3',
    'typed_gap_fill',
    'typed_gap_fill',
    'Compare the photos and respond to the publisher prompts.',
    '{"demoActivityKey":"ultimate-b2-sb-u2-p6-o5","publisherSourceActivityId":"ultimate-b2-sb-u2-p6-o5","implementationMode":"unscored-practice"}'::jsonb,
    '{"demoActivityKey":"ultimate-b2-sb-u2-p6-o5","publisherSourceActivityId":"ultimate-b2-sb-u2-p6-o5","implementationMode":"unscored-practice"}'::jsonb,
    '{}'::jsonb,
    605,
    true,
    true
  )
  on conflict (lesson_id, slug) do update
  set title = excluded.title,
      instructions = excluded.instructions,
      content = excluded.content,
      content_json = excluded.content_json,
      is_assignable = true,
      is_demo_active = true
  returning id into activity_uuid;

  insert into questions (activity_id, question_number, prompt, question_type, feedback_json, sort_order)
  values
    (activity_uuid, 1, 'Compare the two photos.', 'practice_prompt', '{"source":"publisher-prompt-no-answer"}'::jsonb, 1),
    (activity_uuid, 2, 'Why have the people chosen to spend their holidays in these places?', 'practice_prompt', '{"source":"publisher-prompt-no-answer"}'::jsonb, 2),
    (activity_uuid, 3, 'Which of these two places would you most enjoy visiting?', 'practice_prompt', '{"source":"publisher-prompt-no-answer"}'::jsonb, 3)
  on conflict (activity_id, question_number) do update
  set prompt = excluded.prompt,
      question_type = excluded.question_type,
      feedback_json = excluded.feedback_json,
      sort_order = excluded.sort_order;
end
$migration$;

commit;
