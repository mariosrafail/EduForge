-- If the constraint name differs in a database, inspect it with:
-- SELECT conname FROM pg_constraint WHERE conrelid = 'lesson_activities'::regclass;

alter table lesson_activities
drop constraint if exists lesson_activities_type_check;

alter table lesson_activities
add constraint lesson_activities_type_check
check (type in ('gap_fill', 'line_matching', 'multiple_choice', 'word_search'));
