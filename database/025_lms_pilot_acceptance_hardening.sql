begin;

-- Existing assignments predate request idempotency and intentionally retain a
-- NULL key. New API-created assignments use a caller-stable key per target.
alter table activity_assignments
  add column if not exists idempotency_key text;

create unique index if not exists activity_assignments_idempotency_unique_idx
  on activity_assignments (school_id, teacher_id, idempotency_key)
  where idempotency_key is not null;

-- Historical submissions remain untouched. New final submissions occupy slot
-- 1, enforcing the pilot's single-submission/no-resubmission policy without
-- deleting any pre-existing attempts.
alter table activity_submissions
  add column if not exists submission_slot smallint;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'activity_submissions_submission_slot_check'
  ) then
    alter table activity_submissions
      add constraint activity_submissions_submission_slot_check
      check (submission_slot is null or submission_slot = 1);
  end if;
end
$$;

create unique index if not exists activity_submissions_final_slot_unique_idx
  on activity_submissions (activity_assignment_id, student_id, submission_slot)
  where activity_assignment_id is not null and submission_slot = 1;

commit;
