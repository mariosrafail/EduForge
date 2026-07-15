import { randomUUID } from "node:crypto";
import { deliverAccountEmail, recordDeliveryFailureEvent } from "./_email-utils.js";

export const maximumDispatchAttempts = 5;

export async function runAccountEmailDispatch({ sql, deliver = deliverAccountEmail, limit = 10 } = {}) {
  const recovered = await sql`
    update account_email_outbox
    set delivery_state='retryable', claim_id=null, claimed_at=null, next_attempt_at=now(), last_error_code='stale_claim_recovered'
    where delivery_state='sending' and claimed_at < now()-interval '15 minutes'
    returning id
  `;
  const claimId = randomUUID();
  const rows = await sql`
    with candidates as (
      select id from account_email_outbox
      where template_type='password_changed'
        and delivery_state in ('queued', 'retryable')
        and coalesce(next_attempt_at, created_at) <= now()
        and attempt_count < ${maximumDispatchAttempts}
      order by coalesce(next_attempt_at, created_at), created_at
      for update skip locked limit ${Math.max(1, Math.min(50, Number(limit) || 10))}
    )
    update account_email_outbox o
    set delivery_state='sending', claim_id=${claimId}, claimed_at=now()
    from candidates c where o.id=c.id
    returning o.id, o.user_id, o.recipient_email, o.template_type, o.template_variables, o.attempt_count,
      (select school_id from app_users where id=o.user_id) as school_id
  `;
  let sent = 0;
  let failed = 0;
  let exhausted = 0;
  for (const row of rows) {
    let delivery;
    try {
      delivery = await deliver({ recipient: row.recipient_email, templateType: row.template_type, outboxId: row.id, name: row.template_variables?.name || "" });
    } catch {
      delivery = { state: "failed", errorCode: "email_configuration_error" };
    }
    if (delivery.state === "sent") {
      sent += 1;
      await sql`update account_email_outbox set delivery_state='sent',provider_reference=${delivery.reference || null},last_error_code=null,attempt_count=attempt_count+1,delivered_at=now(),next_attempt_at=null,claim_id=null,claimed_at=null where id=${row.id} and claim_id=${claimId}`;
      continue;
    }
    failed += 1;
    const isExhausted = Number(row.attempt_count) + 1 >= maximumDispatchAttempts;
    if (isExhausted) exhausted += 1;
    const delayMinutes = Math.min(60, 2 ** Number(row.attempt_count));
    await sql`update account_email_outbox set delivery_state=${isExhausted ? "exhausted" : "retryable"},last_error_code=${delivery.errorCode || "smtp_delivery_failed"},attempt_count=attempt_count+1,next_attempt_at=case when ${isExhausted} then null else now()+(${delayMinutes}*interval '1 minute') end,claim_id=null,claimed_at=null where id=${row.id} and claim_id=${claimId}`;
    if (row.user_id) await recordDeliveryFailureEvent(sql, { userId: row.user_id, schoolId: row.school_id, templateType: row.template_type });
  }
  return { claimed: rows.length, sent, failed, exhausted, stale_claims_recovered: recovered.length };
}
