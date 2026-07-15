create table if not exists operational_runs (
  id uuid primary key default gen_random_uuid(),
  run_type text not null check (run_type in ('email_dispatcher', 'lifecycle_cleanup', 'tenant_integrity', 'staging_smoke')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  succeeded boolean,
  aggregate_counts jsonb not null default '{}'::jsonb,
  failure_code text,
  build_identifier text,
  check (finished_at is null or finished_at >= started_at),
  check ((succeeded is null and finished_at is null) or (succeeded is not null and finished_at is not null)),
  check (failure_code is null or failure_code ~ '^[a-z0-9_]{1,64}$')
);

create index if not exists operational_runs_type_finished_idx
  on operational_runs (run_type, finished_at desc);

create index if not exists operational_runs_failures_idx
  on operational_runs (finished_at desc)
  where succeeded = false;
