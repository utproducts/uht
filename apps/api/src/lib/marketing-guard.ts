// 72-hour marketing cooldown (Chad, 2026-11-08): never send a MARKETING email
// to an address within 72 hours of its last marketing email. Operational mail
// (confirmations, tournament guides, app invites, scoresheets) neither counts
// toward the window nor is blocked by it.
//
// Marketing sends are the email_sends rows whose campaign has is_marketing = 1
// (city drip, re-engagement, coupon reminders, admin-composed blasts). Every
// sender DEFERS a cooled-down recipient rather than dropping them: wave
// campaigns retry on later waves, the daily sweeps pick them up on a later day.

export const MARKETING_COOLDOWN_HOURS = 72;

// Every email address that received a marketing send inside the cooldown
// window, lowercased. One set-based query per send run.
export async function recentlyMarketedSet(db: D1Database): Promise<Set<string>> {
  try {
    const rows = ((await db.prepare(`
      SELECT DISTINCT LOWER(c.email) AS em
      FROM email_sends es
      JOIN email_campaigns ec ON ec.id = es.campaign_id
      JOIN contacts c ON c.id = es.contact_id
      WHERE es.created_at >= datetime('now', '-${MARKETING_COOLDOWN_HOURS} hours')
        AND COALESCE(ec.is_marketing, 0) = 1
        AND es.status != 'dropped'
        AND c.email IS NOT NULL
    `).all<any>()).results || []);
    return new Set(rows.map((r: any) => String(r.em)));
  } catch (e) {
    // Fail open on a missing column/table so sends are never silently stuck,
    // but log loudly — the migration should make this unreachable.
    console.error('marketing-guard: cooldown query failed, applying no cooldown', e);
    return new Set();
  }
}
