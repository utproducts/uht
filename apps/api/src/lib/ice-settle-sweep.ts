/**
 * Ice booking settle sweep.
 *
 * A Book Ice checkout only settled when the customer landed back on the
 * confirmation page. If they paid and closed the tab, the slot sat in 'held'
 * forever: money taken, no booking recorded, no emails (3 of the first 6 real
 * bookings did exactly this, Nov 2026). The Stripe webhook endpoint exists but
 * is not registered in the Stripe dashboard, so the cron closes the gap:
 *
 * Every tick, each 'held' slot older than 20 minutes is checked against its
 * Stripe checkout session directly:
 *   - paid     -> atomically claim 'held' -> 'booked', send both booking emails
 *   - expired  -> release the hold so the slot sells again
 *   - open     -> leave it (customer may still be mid-checkout)
 *
 * The 20-minute buffer keeps the sweep away from live checkouts, and the
 * atomic claim makes it safe alongside the confirmation-page settle.
 */

export async function runIceSettleSweep(env: any): Promise<{ settled: number; released: number; checked: number }> {
  const db = env.DB;
  const out = { settled: 0, released: 0, checked: 0 };

  const held = await db.prepare(`
    SELECT is2.*, v.name as venue_name, vr.name as rink_name
    FROM ice_slots is2
    LEFT JOIN venues v ON v.id = is2.venue_id
    LEFT JOIN venue_rinks vr ON vr.id = is2.rink_id
    WHERE is2.status = 'held'
      AND is2.stripe_payment_intent_id LIKE 'cs_%'
      AND is2.updated_at < datetime('now', '-20 minutes')
    ORDER BY is2.updated_at ASC
    LIMIT 10
  `).all<any>();

  for (const slot of (held.results || [])) {
    out.checked++;
    let session: any = null;
    try {
      const sres = await fetch(`https://api.stripe.com/v1/checkout/sessions/${slot.stripe_payment_intent_id}`, {
        headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}` },
      });
      if (!sres.ok) continue; // transient or unknown session - try next tick
      session = await sres.json();
    } catch { continue; }

    if (session.payment_status === 'paid') {
      const claim = await db.prepare(
        "UPDATE ice_slots SET status = 'booked', updated_at = datetime('now') WHERE id = ? AND status = 'held'"
      ).bind(slot.id).run();
      if ((claim.meta?.changes || 0) > 0) {
        out.settled++;
        console.log(`Ice settle sweep: settled paid booking ${slot.id} (${slot.date} ${slot.start_time}, ${slot.booked_by_email})`);
        await sendIceBookingEmails(env, db, slot).catch((e: any) => console.error('Ice settle sweep email error:', e));
      }
    } else if (session.status === 'expired') {
      await db.prepare(`
        UPDATE ice_slots SET status = 'available', booked_by_name = NULL, booked_by_email = NULL,
        booked_by_phone = NULL, notes = NULL, stripe_payment_intent_id = NULL,
        updated_at = datetime('now') WHERE id = ? AND status = 'held'
      `).bind(slot.id).run();
      out.released++;
      console.log(`Ice settle sweep: released expired hold ${slot.id} (${slot.date} ${slot.start_time})`);
    }
    // session still open: leave the hold alone
  }

  return out;
}

/** Send the confirmation + staff alert for a settled slot (template-driven) */
export async function sendIceBookingEmails(env: any, db: any, slot: any): Promise<void> {
  const { buildIceBookingConfirmationHtml, buildIceBookingStaffHtml, iceBookingVars } = await import('./ice-booking-email');
  const { getResolvedFields, replaceVars, isTemplateEnabled } = await import('./template-overrides');
  const booking = {
    venueName: slot.venue_name || 'Rosemont Outdoor Rink',
    rinkName: slot.rink_name || null,
    date: slot.date,
    startTime: slot.start_time,
    endTime: slot.end_time,
    amountCents: slot.price_cents || 0,
    name: slot.booked_by_name || '',
    email: slot.booked_by_email || '',
    phone: slot.booked_by_phone || null,
    notes: slot.notes || null,
  };
  const vars = iceBookingVars(booking);

  try {
    if (await isTemplateEnabled(db, 'ice_booking_staff')) {
      const f = await getResolvedFields(db, 'ice_booking_staff');
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.RESEND_API}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'Ultimate Hockey Tournaments <info@ultimatetournaments.com>',
          to: ['johnny@ultimatetournaments.com', 'john@ultimatetournaments.com'],
          subject: replaceVars(f.subject, vars),
          html: buildIceBookingStaffHtml(booking, f),
        }),
      });
    }
  } catch {}

  if (slot.booked_by_email) {
    try {
      if (await isTemplateEnabled(db, 'ice_booking_confirmation')) {
        const f = await getResolvedFields(db, 'ice_booking_confirmation');
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${env.RESEND_API}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: 'Ultimate Hockey Tournaments <info@ultimatetournaments.com>',
            reply_to: 'johnny@ultimatetournaments.com',
            to: [slot.booked_by_email],
            subject: replaceVars(f.subject, vars),
            html: buildIceBookingConfirmationHtml(booking, f),
          }),
        });
      }
    } catch {}
  }
}
