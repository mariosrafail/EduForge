function boundedDays(name, fallback, minimum = 1, maximum = 3650) {
  const value = Number(process.env[name] || fallback);
  if (!Number.isInteger(value) || value < minimum || value > maximum) throw new Error(`${name} is invalid`);
  return value;
}

function boundedMinutes(name, fallback, minimum = 5, maximum = 1440) {
  const value = Number(process.env[name] || fallback);
  if (!Number.isInteger(value) || value < minimum || value > maximum) throw new Error(`${name} is invalid`);
  return value;
}

export function lifecycleRetentionConfiguration() {
  return {
    rateLimitDays: boundedDays("ACCOUNT_RATE_LIMIT_RETENTION_DAYS", 7),
    tokenDays: boundedDays("ACCOUNT_TOKEN_RETENTION_DAYS", 30),
    outboxDays: boundedDays("ACCOUNT_OUTBOX_RETENTION_DAYS", 90, 30),
    inviteAttemptDays: boundedDays("INVITE_ATTEMPT_RETENTION_DAYS", 7),
    bookCodeAttemptDays: boundedDays("BOOK_CODE_ATTEMPT_RETENTION_DAYS", 7),
    staleClaimMinutes: boundedMinutes("STALE_OUTBOX_CLAIM_MINUTES", 15),
  };
}

export async function runLifecycleCleanup({ sql, configuration = lifecycleRetentionConfiguration() } = {}) {
  const core = await sql`
    select * from cleanup_account_lifecycle_history(
      ${configuration.rateLimitDays} * interval '1 day',
      ${configuration.tokenDays} * interval '1 day'
    )
  `;
  const inviteAttempts = await sql`
    delete from class_invite_attempts
    where attempted_at < now() - (${configuration.inviteAttemptDays} * interval '1 day')
    returning id
  `;
  const bookCodeAttempts = await sql`
    delete from book_code_redemption_attempts
    where attempted_at < now() - (${configuration.bookCodeAttemptDays} * interval '1 day')
    returning id
  `;
  const recoveredClaims = await sql`
    update account_email_outbox
    set delivery_state='retryable', claim_id=null, claimed_at=null, next_attempt_at=now(), last_error_code='stale_claim_recovered'
    where delivery_state='sending'
      and claimed_at < now() - (${configuration.staleClaimMinutes} * interval '1 minute')
    returning id
  `;
  const outboxRows = await sql`
    delete from account_email_outbox
    where delivery_state in ('sent', 'captured', 'preview', 'failed', 'exhausted')
      and coalesce(delivered_at, created_at) < now() - (${configuration.outboxDays} * interval '1 day')
    returning id
  `;
  return {
    rate_limit_rows: Number(core[0]?.rate_limit_rows || 0),
    token_rows: Number(core[0]?.token_rows || 0),
    invite_attempt_rows: inviteAttempts.length,
    book_code_attempt_rows: bookCodeAttempts.length,
    stale_claims_recovered: recoveredClaims.length,
    outbox_rows: outboxRows.length,
  };
}
