import { createHmac } from "node:crypto";
import { isIP } from "node:net";

export const builderLoginWindowSeconds = 15 * 60;
export const builderPairLimit = 5;
export const builderAccountLimit = 20;
export const builderSourceLimit = 40;
export const builderPendingLeaseSeconds = 30;
export const builderPairPendingLimit = 5;
export const builderSourcePendingLimit = 20;
export const builderLoginRetentionDays = 14;
export const builderRateLimitMessage = "Too many login attempts. Try again later.";

const isolatedSalt = "isolated-builder-auth-rate-limit-only";
const validOutcomes = new Set(["invalid_credentials", "authenticated", "rejected_account"]);

function headerValue(headers, name) {
  const direct = headers?.[name] ?? headers?.[name.toLowerCase()] ?? headers?.[name.toUpperCase()];
  if (direct !== undefined) return String(direct);
  const match = Object.entries(headers || {}).find(([key]) => key.toLowerCase() === name.toLowerCase());
  return match ? String(match[1]) : "";
}

export function canonicalizeBuilderSourceIp(value) {
  const raw = String(value || "").trim();
  const version = isIP(raw);
  if (version === 4) return raw.split(".").map((part) => String(Number(part))).join(".");
  if (version === 6) {
    try {
      return new URL(`http://[${raw}]/`).hostname.slice(1, -1).toLowerCase();
    } catch {
      return "unknown";
    }
  }
  return "unknown";
}

export function builderSourceIp(event = {}) {
  const trusted = headerValue(event.headers, "x-nf-client-connection-ip");
  if (trusted) return canonicalizeBuilderSourceIp(trusted);
  return canonicalizeBuilderSourceIp(headerValue(event.headers, "x-forwarded-for").split(",")[0]);
}

export function builderRateLimitSalt(environment = process.env) {
  const supplied = String(environment.BUILDER_AUTH_RATE_LIMIT_SALT || "");
  if (supplied) {
    if (supplied.length < 32) throw new Error("BUILDER_AUTH_RATE_LIMIT_SALT must be at least 32 characters");
    return supplied;
  }
  const isolated = environment.TEST_DATABASE_CONFIRMATION === "isolated-test-database"
    || environment.LOCAL_DATABASE_CONFIRMATION === "isolated-local-pilot";
  if (isolated) return isolatedSalt;
  throw new Error("BUILDER_AUTH_RATE_LIMIT_SALT is required");
}

export function builderLoginIdentifier(kind, value, salt = builderRateLimitSalt()) {
  if (!["source", "email"].includes(kind)) throw new Error("Unsupported Builder login identifier kind");
  return createHmac("sha256", salt)
    .update(`eduforge:builder-auth:${kind}:v1\0${String(value)}`)
    .digest("hex");
}

export function builderLoginIdentifiers(event, normalizedEmail, environment = process.env) {
  const salt = builderRateLimitSalt(environment);
  return {
    requestFingerprint: builderLoginIdentifier("source", builderSourceIp(event), salt),
    emailHash: builderLoginIdentifier("email", String(normalizedEmail || "").trim().toLowerCase(), salt),
  };
}

export function boundedBuilderRetryAfter(value) {
  const seconds = Math.ceil(Number(value));
  if (!Number.isFinite(seconds)) return builderLoginWindowSeconds;
  return Math.max(1, Math.min(builderLoginWindowSeconds, seconds));
}

export function builderLimiterDecision({ pairFailures = 0, sourceFailures = 0, accountFailures = 0 } = {}) {
  return {
    pairLimited: Number(pairFailures) >= builderPairLimit,
    sourceLimited: Number(sourceFailures) >= builderSourceLimit,
    accountLimited: Number(accountFailures) >= builderAccountLimit,
  };
}

function normalizeDecision(row = {}) {
  return {
    attemptId: row.attempt_id,
    outcome: row.outcome,
    pairFailures: Number(row.pair_failures || 0),
    sourceFailures: Number(row.source_failures || 0),
    accountFailures: Number(row.account_failures || 0),
    pairLimited: Boolean(row.pair_limited),
    sourceLimited: Boolean(row.source_limited),
    accountLimited: Boolean(row.account_limited),
    limited: Boolean(row.limited),
    limitedDimension: row.limited_dimension || null,
    thresholdDimension: row.threshold_dimension || null,
    retryAfter: boundedBuilderRetryAfter(row.retry_after_seconds),
  };
}

async function withBuilderLocks(sql, lockValues, callback) {
  if (typeof sql.authLoginTransaction === "function") {
    return sql.authLoginTransaction(lockValues, callback);
  }
  if (typeof sql.transaction === "function") {
    const results = await sql.transaction((transactionSql) => [
      transactionSql`
        select pg_advisory_xact_lock(lock_key)
        from (
          select distinct hashtextextended(value, 0) as lock_key
          from unnest(${lockValues}::text[]) value
        ) locks
        order by lock_key
      `,
      callback(transactionSql),
    ]);
    return results[1];
  }
  throw new Error("Builder login rate limiting requires transaction-capable PostgreSQL");
}

export async function beginBuilderLoginAttempt(sql, { requestFingerprint, emailHash }) {
  const lockSource = `builder-auth:source:${requestFingerprint}`;
  const lockEmail = `builder-auth:email:${emailHash}`;
  const rows = await withBuilderLocks(sql, [lockSource, lockEmail], (transactionSql) => transactionSql`
    with parameters as materialized (
      select statement_timestamp() as current_time,
             statement_timestamp() - (${builderLoginWindowSeconds} * interval '1 second') as window_start,
             statement_timestamp() - (${builderPendingLeaseSeconds} * interval '1 second') as pending_start
    ), cleanup_candidates as materialized (
      select attempt.id
      from builder_login_attempts attempt, parameters
      where attempt.attempted_at < parameters.current_time - (${builderLoginRetentionDays} * interval '1 day')
      order by attempt.attempted_at
      limit 200
    ), cleaned as (
      delete from builder_login_attempts attempt
      using cleanup_candidates candidate
      where attempt.id = candidate.id
      returning attempt.id
    ), last_success as materialized (
      select max(attempt.attempted_at) as attempted_at
      from builder_login_attempts attempt, parameters
      where attempt.email_hash = ${emailHash}
        and attempt.outcome = 'authenticated'
        and attempt.attempted_at > parameters.window_start
    ), pair_failures as materialized (
      select attempt.attempted_at,
             row_number() over (order by attempt.attempted_at desc) as recency
      from builder_login_attempts attempt, parameters, last_success
      where attempt.request_fingerprint = ${requestFingerprint}
        and attempt.email_hash = ${emailHash}
        and attempt.outcome = 'invalid_credentials'
        and attempt.attempted_at > parameters.window_start
        and attempt.attempted_at > coalesce(last_success.attempted_at, parameters.window_start)
    ), source_failures as materialized (
      select attempt.attempted_at,
             row_number() over (order by attempt.attempted_at desc) as recency
      from builder_login_attempts attempt, parameters
      where attempt.request_fingerprint = ${requestFingerprint}
        and attempt.outcome = 'invalid_credentials'
        and attempt.attempted_at > parameters.window_start
    ), account_failures as materialized (
      select attempt.attempted_at,
             row_number() over (order by attempt.attempted_at desc) as recency
      from builder_login_attempts attempt, parameters, last_success
      where attempt.email_hash = ${emailHash}
        and attempt.outcome = 'invalid_credentials'
        and attempt.attempted_at > parameters.window_start
        and attempt.attempted_at > coalesce(last_success.attempted_at, parameters.window_start)
    ), pending_attempts as materialized (
      select attempt.request_fingerprint, attempt.email_hash, attempt.attempted_at
      from builder_login_attempts attempt, parameters
      where attempt.outcome = 'pending'
        and attempt.attempted_at > parameters.pending_start
        and attempt.request_fingerprint = ${requestFingerprint}
    ), counts as materialized (
      select
        (select count(*) from pair_failures)::int as pair_count,
        (select count(*) from source_failures)::int as source_count,
        (select count(*) from account_failures)::int as account_count,
        (select count(*) from pending_attempts where email_hash = ${emailHash})::int as pair_pending,
        (select count(*) from pending_attempts)::int as source_pending
    ), decision as materialized (
      select *,
        pair_count >= ${builderPairLimit} as pair_limited,
        source_count >= ${builderSourceLimit} as source_limited,
        account_count >= ${builderAccountLimit} as account_limited,
        pair_pending >= ${builderPairPendingLimit} as pair_busy,
        source_pending >= ${builderSourcePendingLimit} as source_busy
      from counts
    ), inserted as (
      insert into builder_login_attempts(request_fingerprint, email_hash, succeeded, outcome)
      select ${requestFingerprint}, ${emailHash}, false,
        case when pair_limited or source_limited or pair_busy or source_busy
          then 'rate_limited' else 'pending' end
      from decision
      returning id, outcome
    ), release_times as materialized (
      select attempted_at + (${builderLoginWindowSeconds} * interval '1 second') as release_at
        from pair_failures where recency = ${builderPairLimit}
      union all
      select attempted_at + (${builderLoginWindowSeconds} * interval '1 second')
        from source_failures where recency = ${builderSourceLimit}
      union all
      select min(attempted_at) + (${builderPendingLeaseSeconds} * interval '1 second')
        from pending_attempts, decision where decision.pair_busy or decision.source_busy
    )
    select inserted.id as attempt_id, inserted.outcome,
      decision.pair_count as pair_failures,
      decision.source_count as source_failures,
      decision.account_count as account_failures,
      decision.pair_limited, decision.source_limited, decision.account_limited,
      (inserted.outcome = 'rate_limited') as limited,
      case
        when decision.pair_limited then 'pair'
        when decision.source_limited then 'source'
        when decision.pair_busy or decision.source_busy then 'concurrency'
        else null
      end as limited_dimension,
      extract(epoch from (coalesce(max(release_times.release_at), parameters.current_time + interval '1 second') - parameters.current_time)) as retry_after_seconds
    from inserted cross join decision cross join parameters left join release_times on true
    group by inserted.id, inserted.outcome, decision.pair_count, decision.source_count,
      decision.account_count, decision.pair_limited, decision.source_limited,
      decision.account_limited, decision.pair_busy, decision.source_busy, parameters.current_time
  `);
  return normalizeDecision(rows[0]);
}

export async function completeBuilderLoginAttempt(sql, {
  attemptId,
  requestFingerprint,
  emailHash,
  builderUserId = null,
  outcome,
}) {
  if (!validOutcomes.has(outcome)) throw new Error("Unsupported Builder login attempt outcome");
  const lockSource = `builder-auth:source:${requestFingerprint}`;
  const lockEmail = `builder-auth:email:${emailHash}`;
  const rows = await withBuilderLocks(sql, [lockSource, lockEmail], (transactionSql) => transactionSql`
    with parameters as materialized (
      select statement_timestamp() as current_time,
             statement_timestamp() - (${builderLoginWindowSeconds} * interval '1 second') as window_start
    ), last_success as materialized (
      select max(attempt.attempted_at) as attempted_at
      from builder_login_attempts attempt, parameters
      where attempt.email_hash = ${emailHash}
        and attempt.outcome = 'authenticated'
        and attempt.attempted_at > parameters.window_start
    ), existing_pair as materialized (
      select count(*)::int as count
      from builder_login_attempts attempt, parameters, last_success
      where attempt.request_fingerprint = ${requestFingerprint}
        and attempt.email_hash = ${emailHash}
        and attempt.outcome = 'invalid_credentials'
        and attempt.attempted_at > parameters.window_start
        and attempt.attempted_at > coalesce(last_success.attempted_at, parameters.window_start)
    ), existing_source as materialized (
      select count(*)::int as count
      from builder_login_attempts attempt, parameters
      where attempt.request_fingerprint = ${requestFingerprint}
        and attempt.outcome = 'invalid_credentials'
        and attempt.attempted_at > parameters.window_start
    ), existing_account as materialized (
      select count(*)::int as count
      from builder_login_attempts attempt, parameters, last_success
      where attempt.email_hash = ${emailHash}
        and attempt.outcome = 'invalid_credentials'
        and attempt.attempted_at > parameters.window_start
        and attempt.attempted_at > coalesce(last_success.attempted_at, parameters.window_start)
    ), finalized as materialized (
      update builder_login_attempts attempt
      set builder_user_id = ${builderUserId},
          succeeded = (${outcome} = 'authenticated'),
          outcome = case
            when ${outcome} = 'invalid_credentials'
              and ((select count from existing_pair) >= ${builderPairLimit}
                or (select count from existing_source) >= ${builderSourceLimit}
                or (select count from existing_account) >= ${builderAccountLimit})
              then 'rate_limited'
            else ${outcome}
          end
      where attempt.id = ${attemptId}
        and attempt.request_fingerprint = ${requestFingerprint}
        and attempt.email_hash = ${emailHash}
        and attempt.outcome = 'pending'
      returning attempt.id, attempt.outcome, attempt.attempted_at
    ), effective_success as materialized (
      select max(attempted_at) as attempted_at
      from (
        select attempt.attempted_at
        from builder_login_attempts attempt, parameters
        where attempt.email_hash = ${emailHash}
          and attempt.outcome = 'authenticated'
          and attempt.attempted_at > parameters.window_start
        union all
        select attempted_at from finalized where outcome = 'authenticated'
      ) successes
    ), pair_failures as materialized (
      select attempted_at, row_number() over (order by attempted_at desc) as recency
      from (
        select attempt.attempted_at
        from builder_login_attempts attempt, parameters, effective_success
        where attempt.request_fingerprint = ${requestFingerprint}
          and attempt.email_hash = ${emailHash}
          and attempt.outcome = 'invalid_credentials'
          and attempt.attempted_at > parameters.window_start
          and attempt.attempted_at > coalesce(effective_success.attempted_at, parameters.window_start)
        union all
        select attempted_at from finalized
        where outcome = 'invalid_credentials'
          and attempted_at > coalesce((select attempted_at from effective_success), (select window_start from parameters))
      ) failures
    ), source_failures as materialized (
      select attempted_at, row_number() over (order by attempted_at desc) as recency
      from (
        select attempt.attempted_at
        from builder_login_attempts attempt, parameters
        where attempt.request_fingerprint = ${requestFingerprint}
          and attempt.outcome = 'invalid_credentials'
          and attempt.attempted_at > parameters.window_start
        union all
        select attempted_at from finalized where outcome = 'invalid_credentials'
      ) failures
    ), account_failures as materialized (
      select attempted_at, row_number() over (order by attempted_at desc) as recency
      from (
        select attempt.attempted_at
        from builder_login_attempts attempt, parameters, effective_success
        where attempt.email_hash = ${emailHash}
          and attempt.outcome = 'invalid_credentials'
          and attempt.attempted_at > parameters.window_start
          and attempt.attempted_at > coalesce(effective_success.attempted_at, parameters.window_start)
        union all
        select attempted_at from finalized
        where outcome = 'invalid_credentials'
          and attempted_at > coalesce((select attempted_at from effective_success), (select window_start from parameters))
      ) failures
    ), decision as materialized (
      select
        (select count(*) from pair_failures)::int as pair_count,
        (select count(*) from source_failures)::int as source_count,
        (select count(*) from account_failures)::int as account_count
    ), release_times as materialized (
      select attempted_at + (${builderLoginWindowSeconds} * interval '1 second') as release_at
        from pair_failures where recency = ${builderPairLimit}
      union all
      select attempted_at + (${builderLoginWindowSeconds} * interval '1 second')
        from source_failures where recency = ${builderSourceLimit}
      union all
      select attempted_at + (${builderLoginWindowSeconds} * interval '1 second')
        from account_failures where recency = ${builderAccountLimit}
    )
    select finalized.id as attempt_id, finalized.outcome,
      decision.pair_count as pair_failures,
      decision.source_count as source_failures,
      decision.account_count as account_failures,
      decision.pair_count >= ${builderPairLimit} as pair_limited,
      decision.source_count >= ${builderSourceLimit} as source_limited,
      decision.account_count >= ${builderAccountLimit} as account_limited,
      (finalized.outcome = 'rate_limited'
        or decision.pair_count >= ${builderPairLimit}
        or decision.source_count >= ${builderSourceLimit}
        or decision.account_count >= ${builderAccountLimit}) as limited,
      case
        when finalized.outcome = 'rate_limited' and (select count from existing_pair) >= ${builderPairLimit} then 'pair'
        when finalized.outcome = 'rate_limited' and (select count from existing_source) >= ${builderSourceLimit} then 'source'
        when finalized.outcome = 'rate_limited' and (select count from existing_account) >= ${builderAccountLimit} then 'account'
        else null
      end as limited_dimension,
      case
        when finalized.outcome = 'invalid_credentials' and decision.pair_count = ${builderPairLimit} then 'pair'
        when finalized.outcome = 'invalid_credentials' and decision.source_count = ${builderSourceLimit} then 'source'
        when finalized.outcome = 'invalid_credentials' and decision.account_count = ${builderAccountLimit} then 'account'
        else null
      end as threshold_dimension,
      extract(epoch from (coalesce(max(release_times.release_at), parameters.current_time + interval '1 second') - parameters.current_time)) as retry_after_seconds
    from finalized cross join decision cross join parameters left join release_times on true
    group by finalized.id, finalized.outcome, decision.pair_count, decision.source_count,
      decision.account_count, parameters.current_time
  `);
  if (!rows[0]) throw new Error("Builder login attempt reservation is no longer active");
  return normalizeDecision(rows[0]);
}
