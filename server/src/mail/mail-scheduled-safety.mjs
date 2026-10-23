// P1-08 Gate A: cancel only stale, unclaimed scheduled notices in the SAME
// business transaction as a rental status/due-date change. No provider calls.
// Caller must already hold FOR UPDATE on the canonical rental request row.
export async function cancelStaleScheduledMailInTransaction({client, requestId}) {
  if (typeof client?.query !== 'function') throw new TypeError('mail_schedule_client_required');
  if (typeof requestId !== 'string' || !requestId.trim() || requestId.length > 256) {
    throw new TypeError('mail_schedule_request_id_invalid');
  }
  const result = await client.query(`UPDATE app_mail_outbox o
     SET state='cancelled',last_error_code='mail_scheduled_rental_changed',updated_at=NOW()
     WHERE o.source_request_id=$1 AND o.state IN ('queued','retry')
       AND o.event_key IN ('rental_due_reminder','rental_overdue')
       AND NOT EXISTS (
         SELECT 1 FROM app_rental_requests r
         WHERE r.request_id=$1 AND r.status='대여중'
           AND o.source_due_date=r.due_date
           AND o.scheduled_for_date=(NOW() AT TIME ZONE 'Asia/Seoul')::date
           AND (
             (o.event_key='rental_due_reminder'
                AND r.due_date=((NOW() AT TIME ZONE 'Asia/Seoul')::date+1))
             OR (o.event_key='rental_overdue'
                AND r.due_date < (NOW() AT TIME ZONE 'Asia/Seoul')::date)
           )
       )`, [requestId]);
  return Object.freeze({cancelled:Number(result.rowCount || 0)});
}
