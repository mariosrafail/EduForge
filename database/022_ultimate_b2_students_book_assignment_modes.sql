begin;

-- All 77 implemented Unit 1/2 Students Book activities use the existing
-- assignment/submission tables. Disabled legacy interactions are not seeded by
-- migrations 020/021 and remain non-assignable.
update activities activity
set is_assignable = true
from lessons lesson
join units unit_record on unit_record.id = lesson.unit_id
join book_components component on component.id = unit_record.book_component_id
join book_packages package_record on package_record.id = component.book_package_id
where activity.lesson_id = lesson.id
  and package_record.slug = 'ultimate-b2'
  and component.slug = 'ultimate-b2-students-book'
  and activity.slug ~ '^ultimate-b2-sb-u[12]-'
  and activity.content_json->>'implementationMode' in (
    'auto-scored',
    'teacher-reviewed',
    'unscored-practice',
    'reading-content'
  )
  and coalesce(activity.content_json->>'implementationStatus', '') <> 'disabled-editorial-only';

commit;
