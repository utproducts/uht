/*
  Super Saver credit — shared evaluator.

  Previously this logic lived inside the create-payment-intent handler, so the
  $400 only ever materialised at the instant someone paid in full. Teams paying
  a deposit (or sitting on pay-later) had no way to see that they'd earned it,
  which turned into support tickets.

  This module separates the DECISION from the CHARGE:
    - evaluate()  — read-only, safe to call from any page
    - evaluate(..., { persist: true }) — also pins the credit so what we show
      and what we charge can never disagree

  Pinning rule (Chad, Aug 2026): the credit lands on the team's SECOND event
  registered inside the promo window. The FIRST one is the qualifier and must
  start on or before Dec 31 of the promo's year.
*/

export interface SuperSaverRegRef {
  registration_id: string;
  event_id: string;
  event_name: string;
  start_date: string;
}

export interface SuperSaverStatus {
  /** A promo is running right now (drives the register-page upsell banner) */
  active: boolean;
  /** This team has earned the credit */
  eligible: boolean;
  /** Already redeemed on a completed payment */
  confirmed: boolean;
  credit_cents: number;
  promo_id: string | null;
  ends_at: string | null;
  /** 1st event registered in the window — what earns the credit */
  qualifying: SuperSaverRegRef | null;
  /** 2nd event registered — where the $400 comes off */
  applied: SuperSaverRegRef | null;
  /** Why they're not eligible yet, when they aren't */
  reason:
    | 'no_promo'
    | 'outside_window'
    | 'needs_second_event'
    | 'needs_hotel'
    | 'no_qualifying_event'
    | 'nothing_left_to_credit'
    | null;
  events_in_window: number;
  has_hotel: boolean;
}

interface TeamReg {
  id: string;
  event_id: string;
  created_at: string;
  needs_hotel: number;
  hotel_choice_1: string | null;
  payment_status: string | null;
}

function emptyStatus(reason: SuperSaverStatus['reason']): SuperSaverStatus {
  return {
    active: false, eligible: false, confirmed: false, credit_cents: 0,
    promo_id: null, ends_at: null, qualifying: null, applied: null,
    reason, events_in_window: 0, has_hotel: false,
  };
}

/** A real hotel preference. Local teams and placeholder text don't count. */
function hotelOk(r: { needs_hotel?: number; hotel_choice_1?: string | null }): boolean {
  if (r.needs_hotel === 1) return true;
  const c1 = String(r.hotel_choice_1 || '').trim().toLowerCase();
  return c1 !== '' && c1 !== 'hotels coming soon' && c1 !== 'local team';
}

/** Resolve the team behind a set of registration ids. */
export async function resolveTeamKey(
  db: D1Database,
  regIds: string[]
): Promise<{ teamId: string | null; teamName: string; teamKey: string } | null> {
  for (const regId of regIds) {
    let reg = await db.prepare(
      'SELECT team_id, team_name FROM event_registrations WHERE id = ?'
    ).bind(regId).first<any>();
    if (!reg) {
      reg = await db.prepare(
        `SELECT r.team_id, t.name as team_name FROM registrations r
         LEFT JOIN teams t ON t.id = r.team_id WHERE r.id = ?`
      ).bind(regId).first<any>();
    }
    if (!reg) continue;
    const teamId = reg.team_id || null;
    const teamName = String(reg.team_name || '').trim();
    if (!teamId && !teamName) continue;
    return { teamId, teamName, teamKey: teamId || teamName.toLowerCase() };
  }
  return null;
}

export async function evaluateSuperSaver(
  db: D1Database,
  target: { teamId?: string | null; teamName?: string | null; regIds?: string[] },
  opts: { persist?: boolean } = {}
): Promise<SuperSaverStatus> {
  try {
    let teamId = target.teamId || null;
    let teamName = (target.teamName || '').trim();

    if (!teamId && !teamName && target.regIds?.length) {
      const resolved = await resolveTeamKey(db, target.regIds);
      if (!resolved) return emptyStatus(null);
      teamId = resolved.teamId;
      teamName = resolved.teamName;
    }
    if (!teamId && !teamName) return emptyStatus(null);
    const teamKey = teamId || teamName.toLowerCase();

    const promos = await db.prepare(
      `SELECT id, discount_cents, starts_at, ends_at, event_ids, min_event_start, is_active
       FROM super_saver_promos ORDER BY starts_at DESC`
    ).all<any>();
    if (!promos.results?.length) return emptyStatus('no_promo');

    const anyActive = (promos.results as any[]).some(p => p.is_active === 1);
    let best: SuperSaverStatus | null = null;

    for (const promo of promos.results as any[]) {
      let featuredIds: string[] = [];
      try { featuredIds = JSON.parse(promo.event_ids || '[]'); } catch { /* none */ }

      // Every active registration this team made inside the promo window.
      // 'awaiting_payment' rows are abandoned checkouts — they don't count.
      const teamRegs: TeamReg[] = [];
      // Match on team_id when we have one. Falling back to the name for a
      // team that HAS an id merges genuinely different teams that share a name
      // (two 'Lake County Vipers Pee Wee (12U) Prospects Blue' squads, say),
      // which would hand one of them a credit it never earned.
      const er = teamId
        ? await db.prepare(
            `SELECT id, event_id, created_at, COALESCE(needs_hotel, 0) as needs_hotel,
                    hotel_choice_1, payment_status
             FROM event_registrations
             WHERE team_id = ?
               AND created_at >= ? AND created_at <= ?
               AND status NOT IN ('denied', 'rejected', 'withdrawn', 'awaiting_payment')`
          ).bind(teamId, promo.starts_at, promo.ends_at).all<any>()
        : await db.prepare(
            `SELECT id, event_id, created_at, COALESCE(needs_hotel, 0) as needs_hotel,
                    hotel_choice_1, payment_status
             FROM event_registrations
             WHERE LOWER(team_name) = LOWER(?) AND team_id IS NULL
               AND created_at >= ? AND created_at <= ?
               AND status NOT IN ('denied', 'rejected', 'withdrawn', 'awaiting_payment')`
          ).bind(teamName, promo.starts_at, promo.ends_at).all<any>();
      for (const r of (er.results || [])) teamRegs.push(r);

      if (teamId) {
        try {
          const rr = await db.prepare(
            `SELECT id, event_id, created_at, COALESCE(needs_hotel, 0) as needs_hotel,
                    NULL as hotel_choice_1, payment_status
             FROM registrations
             WHERE team_id = ? AND created_at >= ? AND created_at <= ?
               AND status NOT IN ('rejected', 'withdrawn')`
          ).bind(teamId, promo.starts_at, promo.ends_at).all<any>();
          for (const r of (rr.results || [])) {
            if (!teamRegs.some(x => x.id === r.id)) teamRegs.push(r);
          }
        } catch { /* table shape differs — event_registrations is the main one */ }
      }

      if (!teamRegs.length) {
        if (!best) best = { ...emptyStatus('outside_window'), active: anyActive };
        continue;
      }

      // Event start dates, needed for both ordering and the qualifier rule
      const eventInfo = new Map<string, { name: string; start_date: string }>();
      for (const eid of Array.from(new Set(teamRegs.map(r => r.event_id)))) {
        const ev = await db.prepare('SELECT name, start_date FROM events WHERE id = ?')
          .bind(eid).first<any>();
        if (ev) eventInfo.set(eid, { name: ev.name || '', start_date: ev.start_date || '' });
      }

      // One row per distinct event, in the order the team registered them.
      // Ties (multi-event checkouts write identical timestamps) break on the
      // earlier event start date, so ordering is stable across calls.
      const byEvent = new Map<string, TeamReg>();
      for (const r of teamRegs) {
        const existing = byEvent.get(r.event_id);
        if (!existing || r.created_at < existing.created_at) byEvent.set(r.event_id, r);
      }
      const ordered = Array.from(byEvent.values()).sort((a, b) => {
        if (a.created_at !== b.created_at) return a.created_at < b.created_at ? -1 : 1;
        const sa = eventInfo.get(a.event_id)?.start_date || '9999';
        const sb = eventInfo.get(b.event_id)?.start_date || '9999';
        if (sa !== sb) return sa < sb ? -1 : 1;
        return a.event_id < b.event_id ? -1 : 1;
      });

      const hasHotel = teamRegs.some(r => hotelOk(r));
      const partial: SuperSaverStatus = {
        ...emptyStatus(null),
        active: anyActive,
        credit_cents: promo.discount_cents || 40000,
        promo_id: promo.id,
        ends_at: promo.ends_at,
        events_in_window: ordered.length,
        has_hotel: hasHotel,
      };

      if (ordered.length < 2) {
        if (!best || best.events_in_window < 1) best = { ...partial, reason: 'needs_second_event' };
        continue;
      }
      if (!hasHotel) {
        best = { ...partial, reason: 'needs_hotel' };
        continue;
      }

      // The qualifier: earliest registered event starting inside the promo's year
      const promoYearEnd = String(promo.starts_at || '').slice(0, 4) + '-12-31';
      const isQualifier = (eid: string) =>
        (eventInfo.get(eid)?.start_date || '9999') <= promoYearEnd &&
        (featuredIds.length === 0 || featuredIds.includes(eid));

      const qIdx = ordered.findIndex(r => isQualifier(r.event_id));
      if (qIdx === -1) {
        best = { ...partial, reason: 'no_qualifying_event' };
        continue;
      }
      const qualifying = ordered[qIdx];

      // The credited registration: the SECOND event registered — i.e. the next
      // distinct event after the qualifier. Skip anything already paid in full
      // (a dead pin can never be redeemed) and honour min_event_start.
      const credited = ordered.find((r, i) =>
        i !== qIdx &&
        i > qIdx &&
        (r.payment_status || '').toLowerCase() !== 'paid' &&
        (!promo.min_event_start || (eventInfo.get(r.event_id)?.start_date || '') >= promo.min_event_start)
      ) || ordered.find((r, i) =>
        i !== qIdx &&
        (r.payment_status || '').toLowerCase() !== 'paid' &&
        (!promo.min_event_start || (eventInfo.get(r.event_id)?.start_date || '') >= promo.min_event_start)
      );

      if (!credited) {
        best = { ...partial, reason: 'nothing_left_to_credit' };
        continue;
      }

      const ref = (r: TeamReg): SuperSaverRegRef => ({
        registration_id: r.id,
        event_id: r.event_id,
        event_name: eventInfo.get(r.event_id)?.name || '',
        start_date: eventInfo.get(r.event_id)?.start_date || '',
      });

      // An already-redeemed credit is reported where it actually landed
      const existing = await db.prepare(
        'SELECT confirmed, applied_reg_id, qualifying_reg_id, amount_cents FROM super_saver_credits WHERE promo_id = ? AND team_key = ?'
      ).bind(promo.id, teamKey).first<any>();

      if (existing?.confirmed === 1) {
        const appliedRow = ordered.find(r => r.id === existing.applied_reg_id);
        const qualRow = ordered.find(r => r.id === existing.qualifying_reg_id);
        return {
          ...partial,
          eligible: true,
          confirmed: true,
          credit_cents: existing.amount_cents || partial.credit_cents,
          qualifying: qualRow ? ref(qualRow) : ref(qualifying),
          applied: appliedRow ? ref(appliedRow) : ref(credited),
          reason: null,
        };
      }

      if (opts.persist) {
        await db.prepare(`
          INSERT INTO super_saver_credits (promo_id, team_key, qualifying_reg_id, applied_reg_id, amount_cents, confirmed)
          VALUES (?, ?, ?, ?, ?, 0)
          ON CONFLICT(promo_id, team_key) DO UPDATE SET
            qualifying_reg_id = excluded.qualifying_reg_id,
            applied_reg_id = excluded.applied_reg_id,
            amount_cents = excluded.amount_cents
          WHERE confirmed = 0
        `).bind(promo.id, teamKey, qualifying.id, credited.id, partial.credit_cents).run();
      }

      return {
        ...partial,
        eligible: true,
        confirmed: false,
        qualifying: ref(qualifying),
        applied: ref(credited),
        reason: null,
      };
    }

    return best || { ...emptyStatus('outside_window'), active: anyActive };
  } catch (err: any) {
    console.error('Super Saver evaluation failed:', err?.message || String(err));
    return emptyStatus(null);
  }
}
