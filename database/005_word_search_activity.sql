do $$
declare
  constraint_record record;
begin
  for constraint_record in
    select tc.constraint_name
    from information_schema.table_constraints tc
    join information_schema.constraint_column_usage ccu
      on tc.constraint_name = ccu.constraint_name
     and tc.table_schema = ccu.table_schema
    where tc.table_schema = 'public'
      and tc.table_name = 'lesson_activities'
      and tc.constraint_type = 'CHECK'
      and ccu.column_name = 'type'
  loop
    execute format('alter table public.lesson_activities drop constraint if exists %I', constraint_record.constraint_name);
  end loop;

  -- Fallback for common generated name when metadata lookup differs.
  execute 'alter table public.lesson_activities drop constraint if exists lesson_activities_type_check';

  alter table public.lesson_activities
    add constraint lesson_activities_type_check
    check (type in ('gap_fill', 'line_matching', 'multiple_choice', 'word_search'));
end $$;
