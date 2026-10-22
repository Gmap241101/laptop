// P1-04: transactional user-only notification bridge. No API calls, timer or external sends.
// Every call is performed BEFORE the business COMMIT on its existing pg client.
import { MAIL_EVENT_BY_KEY } from './mail-event-catalog.mjs';
import { parseMailAddress } from './mail-provider-config.mjs';
import { createMailOutboxRepository } from './mail-outbox-repository.mjs';

const outbox = createMailOutboxRepository();
const trim = (value) => String(value ?? '').trim();
const asDate = (value) => value instanceof Date ? value.toISOString().slice(0, 10) : trim(value).slice(0,10);
const asTimestamp = (value) => value instanceof Date ? value.toISOString() : trim(value);
const safeUrl = (value) => typeof value === 'string' && /^https:\/\/[a-z0-9.-]+(?::443)?(?:\/[a-z0-9_/?#=&%.-]*)?$/i.test(value) ? value : '';
// Only publicly configured site links; never request-derived URLs or secrets.
export const getMailPublicSiteUrl = (env=process.env) => safeUrl(env.MAIL_PUBLIC_SITE_URL) ||
  ((env.APP_ENV || '').toLowerCase() === 'staging' ? 'https://mkrental.vercel.app' : '');

const emptyValuesFor = (key) => Object.fromEntries(MAIL_EVENT_BY_KEY[key].variables.map((name)=>[name,'']));
export const rentalMailValues = (eventKey, rental, overrides={}) => ({
  ...emptyValuesFor(eventKey), name:trim(rental.requesterName), teamName:trim(rental.requesterTeam),
  siteUrl:getMailPublicSiteUrl(), requestNumber:trim(rental.id), assetName:trim(rental.assetCategory),
  assetCode:trim(rental.assetNo), rentalRequestedAt:trim(rental.requestedAt),
  rentalStartAt:asDate(rental.startDate), rentalDueAt:asDate(rental.dueDate),
  ...overrides,
});
export const memberMailValues = (eventKey, member, overrides={}) => ({
  ...emptyValuesFor(eventKey), name:trim(member.name || member.memberName),
  teamName:trim(member.team || member.memberTeam), siteUrl:getMailPublicSiteUrl(), ...overrides,
});
export const inquiryMailValues = (eventKey, inquiry, overrides={}) => ({
  ...emptyValuesFor(eventKey), name:trim(inquiry.author_name),
  teamName:trim(inquiry.author_team), siteUrl:getMailPublicSiteUrl(),
  inquirySubmittedAt:asTimestamp(inquiry.created_at),
  inquiryTitle:trim(inquiry.title), inquiryNumber:trim(inquiry.public_id), ...overrides,
});

export async function enqueueUserMail({client,eventKey,eventId,recipientEmail,values}) {
  if (!client || typeof client.query !== 'function') throw new TypeError('mail_client_required');
  if (MAIL_EVENT_BY_KEY[eventKey]?.recipient !== 'user') throw new TypeError('user_mail_event_required');
  // A missing/invalid historical email must never corrupt an otherwise valid business mutation.
  if (!parseMailAddress(recipientEmail)) return Object.freeze({queued:false,reason:'recipient_unavailable'});
  if (typeof eventId !== 'string' || eventId.length < 8) throw new TypeError('mail_event_id_invalid');
  return outbox.enqueueInTransaction({ client,eventKey,recipientEmail,eventId,values });
}

// P1-04 time-based candidate query. Deliberately NOT called by web startup or API.
// P1-05/06 operational policy must approve scheduler, daily cadence and reminder offsets.
export async function listScheduledUserMailCandidates({client, eventKey, referenceDate, limit=50}) {
  if (!['rental_due_reminder','rental_overdue'].includes(eventKey)) throw new TypeError('scheduled_user_event_required');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(referenceDate)) throw new TypeError('reference_date_invalid');
  if (!Number.isInteger(limit) || limit<1 || limit>100) throw new TypeError('mail_batch_limit_invalid');
  const condition = eventKey==='rental_due_reminder'
    ? "r.due_date = ($1::date + INTERVAL '1 day')::date"
    : 'r.due_date < $1::date';
  const rows=await client.query(`SELECT r.request_id,r.requester_email,r.requester_name,r.requester_team,
       r.requested_at_text,r.start_date::text,r.due_date::text,i.asset_category,i.asset_no
     FROM app_rental_requests r LEFT JOIN app_rental_request_items i ON i.rental_request_id=r.id
     WHERE r.status='대여중' AND ${condition}
     ORDER BY r.due_date,r.id LIMIT $2`,[referenceDate,limit]);
  return rows.rows.map((r)=>Object.freeze({eventKey,eventId:`${r.request_id}:${asDate(r.due_date)}:${eventKey==='rental_overdue'?referenceDate:'pre'}`,
    recipientEmail:r.requester_email,values:rentalMailValues(eventKey,{
      id:r.request_id,requesterName:r.requester_name,requesterTeam:r.requester_team,
      requestedAt:r.requested_at_text,startDate:r.start_date,dueDate:r.due_date,
      assetCategory:r.asset_category,assetNo:r.asset_no,
    })}));
}
