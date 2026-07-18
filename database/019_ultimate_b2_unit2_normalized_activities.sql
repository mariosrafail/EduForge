begin;

-- Replace the obsolete invented demo rows from 006 with the two publisher-
-- confirmed Unit 2 activities. Historical submissions remain intact; existing
-- question IDs for question numbers 1..4/1..3 are updated in place.

create temporary table normalized_ultimate_b2_questions (
  activity_slug text not null,
  question_number integer not null,
  prompt text not null,
  question_type text not null,
  correct_label text not null,
  primary key (activity_slug, question_number)
) on commit drop;

create temporary table normalized_ultimate_b2_options (
  activity_slug text not null,
  question_number integer not null,
  option_label text not null,
  option_text text not null,
  is_correct boolean not null,
  sort_order integer not null,
  primary key (activity_slug, question_number, option_label)
) on commit drop;

insert into normalized_ultimate_b2_questions (activity_slug, question_number, prompt, question_type, correct_label)
values
  ('unit-2-reading-exercise-3', 1, 'Bruce was an experienced pilot, and he was used to making this trip. It was only a 90-minute journey, and until that day, it had always gone perfectly. The fact that it followed a route through the Bermuda Triangle had never worried Bruce before. Over the years, around 2,000 ships and 200 planes had gone missing in this area. ____ As he hit the cloud, everything around the plane turned black as night. Although he was feeling extremely anxious, Bruce found the strength to stay calm and focused on flying the plane.', 'drag_and_drop_matching', 'F'),
  ('unit-2-reading-exercise-3', 2, 'Then, all of a sudden, flashes of brilliant white light started appearing around the plane. ____ So, what could it be? Thoughts raced wildly in his mind as he kept the plane on course through the blinding light. The Beechcraft Bonanza had been travelling inside the cloud for about thirty minutes when Bruce started to feel like he was in a never-ending tunnel. At that point, he wondered if he and his two passengers would ever make it out of the cloud alive.', 'drag_and_drop_matching', 'C'),
  ('unit-2-reading-exercise-3', 3, 'As the tunnel cloud seemed to close around the small plane, its electronic equipment stopped functioning properly. ____ Bruce was no longer able to navigate, but he refused to give up hope. Suddenly, he saw daylight through the darkness. Luckily, the plane managed to escape the cloud and found open blue sky once again. Everyone breathed a sigh of relief.', 'drag_and_drop_matching', 'E'),
  ('unit-2-reading-exercise-3', 4, 'Fearing that they had been blown off course, the pilot immediately contacted the air traffic controllers at Miami airport to check his plane''s position. However, the air traffic controllers couldn''t locate the plane on their radar. Then, to Bruce''s amazement, they announced that the plane was already inside the Miami air space. ____ This just added to the confusion. Surely that was impossible as this was a 90-minute journey!', 'drag_and_drop_matching', 'A'),
  ('unit-2-reading-exercise-3', 5, 'Suddenly, Bruce saw the runways and the terminal buildings at Miami Airport. He was indeed where the controllers had said he was! As the plane safely touched down on the runway, Bruce asked himself how they could have reached their destination so quickly. To make matters even more confusing, only half of the fuel needed had been used up. ____ It didn''t make any sense!', 'drag_and_drop_matching', 'G'),
  ('unit-2-reading-exercise-3', 6, 'According to some experts, nature sometimes creates a kind of electric fog in which ships and planes can get trapped. ____ After many years of research and talking to scientists, Bruce came to the conclusion that it must have been electric fog that he experienced that day. He is convinced that it acted like an accelerator to fast-track his Beechcraft Bonanza to its destination!', 'drag_and_drop_matching', 'B'),
  ('unit-2-reading-exercise-4', 1, 'Pilots need permission to enter another country''s ____ .', 'multiple_choice', '1'),
  ('unit-2-reading-exercise-4', 2, 'Mobile phones should be switched off until you are inside the ____ building.', 'multiple_choice', '2'),
  ('unit-2-reading-exercise-4', 3, 'Can you ____ where we are on this map?', 'multiple_choice', '1'),
  ('unit-2-reading-exercise-4', 4, 'Many physicists believe it''s possible to travel to other ____ .', 'multiple_choice', '2'),
  ('unit-2-reading-exercise-4', 5, 'Air traffic ____ guide planes from the control tower.', 'multiple_choice', '2'),
  ('unit-2-reading-exercise-4', 6, 'To his ____ , he had kept the plane on course.', 'multiple_choice', '1'),
  ('unit-2-reading-exercise-4', 7, 'The plane ____ down smoothly despite the windy conditions.', 'multiple_choice', '2'),
  ('unit-2-reading-exercise-4', 8, 'GPS technology calculates the fastest ____ to your destination.', 'multiple_choice', '1');

with ex3_options(option_label, option_text, sort_order) as (
  values
    ('A', 'Moreover, the plane''s clock showed that it had only been travelling for 45 minutes.', 1),
    ('B', 'What''s more, it''s possible for boats and aircraft to completely disappear and slip into another dimension when they hit this fog!', 2),
    ('C', 'However, Bruce knew that it wasn''t lightning.', 3),
    ('D', 'It had been the journey of a lifetime!', 4),
    ('E', 'For example, the compass started turning anti-clockwise and it appeared that a force outside the plane was now controlling it.', 5),
    ('F', 'Unlike the captains and pilots of those ships and planes, Bruce lived to tell an extraordinary tale.', 6),
    ('G', 'Had the plane become some kind of time machine that allowed them to travel through space and time?', 7)
)
insert into normalized_ultimate_b2_options (activity_slug, question_number, option_label, option_text, is_correct, sort_order)
select question.activity_slug, question.question_number, option.option_label, option.option_text,
       option.option_label = question.correct_label, option.sort_order
from normalized_ultimate_b2_questions question
cross join ex3_options option
where question.activity_slug = 'unit-2-reading-exercise-3';

insert into normalized_ultimate_b2_options (activity_slug, question_number, option_label, option_text, is_correct, sort_order)
values
  ('unit-2-reading-exercise-4', 1, '1', 'air space', true, 1), ('unit-2-reading-exercise-4', 1, '2', 'radar', false, 2),
  ('unit-2-reading-exercise-4', 2, '1', 'runway', false, 1), ('unit-2-reading-exercise-4', 2, '2', 'terminal', true, 2),
  ('unit-2-reading-exercise-4', 3, '1', 'locate', true, 1), ('unit-2-reading-exercise-4', 3, '2', 'control', false, 2),
  ('unit-2-reading-exercise-4', 4, '1', 'courses', false, 1), ('unit-2-reading-exercise-4', 4, '2', 'dimensions', true, 2),
  ('unit-2-reading-exercise-4', 5, '1', 'pilots', false, 1), ('unit-2-reading-exercise-4', 5, '2', 'controllers', true, 2),
  ('unit-2-reading-exercise-4', 6, '1', 'amazement', true, 1), ('unit-2-reading-exercise-4', 6, '2', 'horror', false, 2),
  ('unit-2-reading-exercise-4', 7, '1', 'took', false, 1), ('unit-2-reading-exercise-4', 7, '2', 'touched', true, 2),
  ('unit-2-reading-exercise-4', 8, '1', 'route', true, 1), ('unit-2-reading-exercise-4', 8, '2', 'road', false, 2);

update activities
set type = case slug when 'unit-2-reading-exercise-3' then 'drag_and_drop_matching' else 'multiple_choice' end,
    activity_type = case slug when 'unit-2-reading-exercise-3' then 'drag_and_drop_matching' else 'multiple_choice' end,
    instructions = case slug
      when 'unit-2-reading-exercise-3' then 'Read the text again and insert the missing sentences. There is one extra sentence which you do not need to use.'
      else 'Circle the correct words.'
    end,
    content_json = coalesce(content_json, '{}'::jsonb) || jsonb_build_object(
      'normalizedCatalogVersion', '1.0',
      'publisherSourceActivityId', case slug
        when 'unit-2-reading-exercise-3' then 'ultimate-b2-sb-u2-p2-o3'
        else 'ultimate-b2-sb-u2-p2-o4'
      end,
      'feedbackSource', 'application-generated-neutral'
    ),
    content = coalesce(content, '{}'::jsonb) || jsonb_build_object(
      'normalizedCatalogVersion', '1.0',
      'publisherSourceActivityId', case slug
        when 'unit-2-reading-exercise-3' then 'ultimate-b2-sb-u2-p2-o3'
        else 'ultimate-b2-sb-u2-p2-o4'
      end,
      'feedbackSource', 'application-generated-neutral'
    )
where slug in ('unit-2-reading-exercise-3', 'unit-2-reading-exercise-4');

insert into questions (activity_id, question_number, prompt, question_type, feedback_json, sort_order)
select activity.id, source.question_number, source.prompt, source.question_type,
       '{"source":"application-generated-neutral"}'::jsonb, source.question_number
from normalized_ultimate_b2_questions source
join activities activity on activity.slug = source.activity_slug
on conflict (activity_id, question_number) do update
set prompt = excluded.prompt,
    question_type = excluded.question_type,
    feedback_json = excluded.feedback_json,
    sort_order = excluded.sort_order;

delete from question_options option
using questions question, activities activity
where option.question_id = question.id
  and question.activity_id = activity.id
  and activity.slug in ('unit-2-reading-exercise-3', 'unit-2-reading-exercise-4')
  and not exists (
    select 1
    from normalized_ultimate_b2_options source
    where source.activity_slug = activity.slug
      and source.question_number = question.question_number
      and source.option_label = option.option_label
  );

insert into question_options (question_id, option_label, option_text, is_correct, sort_order)
select question.id, source.option_label, source.option_text, source.is_correct, source.sort_order
from normalized_ultimate_b2_options source
join activities activity on activity.slug = source.activity_slug
join questions question on question.activity_id = activity.id and question.question_number = source.question_number
on conflict (question_id, option_label) do update
set option_text = excluded.option_text,
    is_correct = excluded.is_correct,
    sort_order = excluded.sort_order;

commit;
