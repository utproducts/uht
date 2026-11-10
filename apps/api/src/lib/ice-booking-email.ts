/**
 * Book Ice emails: booker confirmation + staff alert to John and Johnny.
 *
 * Both are registered in TEMPLATE_DEFINITIONS ('ice_booking_confirmation',
 * 'ice_booking_staff') so the admin Automated Emails page shows previews and
 * lets staff edit the wording without a deploy. The sends fire from
 * routes/ice-booking.ts the moment a Stripe checkout settles as paid.
 */

export interface IceBookingEmailData {
  venueName: string;
  rinkName?: string | null;
  date: string;       // YYYY-MM-DD
  startTime: string;  // HH:MM (24h)
  endTime: string;    // HH:MM (24h)
  amountCents: number;
  name: string;
  email: string;
  phone?: string | null;
  notes?: string | null;
}

export const SAMPLE_ICE_BOOKING: IceBookingEmailData = {
  venueName: 'Rosemont Outdoor Rink',
  date: '2027-01-21',
  startTime: '18:15',
  endTime: '19:15',
  amountCents: 39500,
  name: 'Mike Johnson',
  email: 'mike.johnson@email.com',
  phone: '(312) 555-0147',
  notes: 'Squirt A practice',
};

function prettyDate(iso: string): string {
  const d = new Date(iso + 'T12:00:00');
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

function pretty12h(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  if (!Number.isFinite(h)) return hhmm;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m || 0).padStart(2, '0')} ${ampm}`;
}

function dollars(cents: number): string {
  return `$${((cents || 0) / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
}

/** The {variable} map shared by both templates' subject/body fields */
export function iceBookingVars(b: IceBookingEmailData): Record<string, string> {
  return {
    name: b.name || '',
    firstName: (b.name || '').split(' ')[0] || '',
    venueName: b.venueName || 'Rosemont Outdoor Rink',
    date: prettyDate(b.date),
    startTime: pretty12h(b.startTime),
    endTime: pretty12h(b.endTime),
    amount: dollars(b.amountCents),
  };
}

function sub(text: string, vars: Record<string, string>): string {
  return (text || '').replace(/\{(\w+)\}/g, (m, k) => vars[k] ?? m);
}

const esc = (s: string) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Booker-facing confirmation (branded shell matching registration emails) */
export function buildIceBookingConfirmationHtml(b: IceBookingEmailData, fields: Record<string, string>): string {
  const vars = iceBookingVars(b);
  const heading = sub(fields.heading || "You're on the ice!", vars);
  const headingSubtitle = sub(fields.heading_subtitle || 'Your booking is confirmed and paid', vars);
  const bodyText = sub(fields.body_text || 'Thanks {firstName}! Your ice time at the {venueName} is confirmed and paid in full. Your details are below - save this email for your records.', vars);
  const arrivalText = sub(fields.arrival_text || 'Please arrive 15 minutes before your start time so you get your full hour on the ice. If you need to make a change to your booking, just reply to this email and we will take care of it.', vars);
  const footerText = sub(fields.footer_text || 'Questions? Reply to this email and we will get right back to you.', vars);

  const arrivalHtml = arrivalText.split('\n').map((line) => {
    line = line.trim();
    if (!line) return '';
    if (line.startsWith('•') || line.startsWith('-') || line.startsWith('*')) {
      return `<p style="margin: 0 0 4px 0;">&bull; ${line.replace(/^[•\-*]\s*/, '')}</p>`;
    }
    return `<p style="margin: 0 0 8px 0;">${line}</p>`;
  }).join('\n              ');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #f5f5f7; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f7; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.06);">

          <!-- Header (locked) -->
          <tr>
            <td style="background: linear-gradient(135deg, #003e79, #001f3f); padding: 32px; text-align: center;">
              <img src="https://uht.chad-157.workers.dev/api/assets/brand/uht-logo.png" alt="Ultimate Tournaments" width="180" style="height: auto; margin-bottom: 16px;">
              <h1 style="color: #ffffff; font-size: 22px; margin: 0; font-weight: 700;">${esc(heading)}</h1>
              <p style="color: rgba(255,255,255,0.7); font-size: 14px; margin: 8px 0 0 0;">${esc(headingSubtitle)}</p>
            </td>
          </tr>

          <!-- Body (editable) -->
          <tr>
            <td style="padding: 24px 32px 0 32px; font-size: 15px; line-height: 1.6; color: #1d1d1f;">
              <p style="margin: 0 0 16px 0;">${esc(bodyText)}</p>
            </td>
          </tr>

          <!-- Booking Summary (locked - dynamic data) -->
          <tr>
            <td style="padding: 0 32px 24px 32px; font-size: 14px; color: #1d1d1f;">
              <table width="100%" cellpadding="0" cellspacing="0" style="border: 1px solid #e8e8ed; border-radius: 12px; overflow: hidden;">
                <tr>
                  <td style="background-color: #f5f5f7; padding: 12px 16px; font-weight: 700; font-size: 13px; color: #6e6e73; text-transform: uppercase; letter-spacing: 0.5px;">Your Ice Time</td>
                </tr>
                <tr>
                  <td style="padding: 16px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding: 4px 0; color: #6e6e73; font-size: 13px; width: 120px;">Rink</td>
                        <td style="padding: 4px 0; font-weight: 600;">${esc(vars.venueName)}${b.rinkName ? ` - ${esc(b.rinkName)}` : ''}</td>
                      </tr>
                      <tr>
                        <td style="padding: 4px 0; color: #6e6e73; font-size: 13px;">Date</td>
                        <td style="padding: 4px 0; font-weight: 600;">${esc(vars.date)}</td>
                      </tr>
                      <tr>
                        <td style="padding: 4px 0; color: #6e6e73; font-size: 13px;">Time</td>
                        <td style="padding: 4px 0; font-weight: 600;">${esc(vars.startTime)} - ${esc(vars.endTime)}</td>
                      </tr>
                      <tr>
                        <td style="padding: 4px 0; color: #6e6e73; font-size: 13px;">Booked By</td>
                        <td style="padding: 4px 0; font-weight: 600;">${esc(b.name)}</td>
                      </tr>
                      ${b.notes ? `<tr><td style="padding: 4px 0; color: #6e6e73; font-size: 13px;">Notes</td><td style="padding: 4px 0; font-weight: 600;">${esc(b.notes)}</td></tr>` : ''}
                      <tr>
                        <td style="padding: 4px 0; color: #6e6e73; font-size: 13px;">Payment</td>
                        <td style="padding: 4px 0;"><span style="background-color: #dcfce7; color: #166534; font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 20px;">PAID &middot; ${esc(vars.amount)}</span></td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Arrival info (editable) -->
          <tr>
            <td style="padding: 0 32px 24px 32px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f0f9ff; border: 1px solid #bae6fd; border-radius: 12px;">
                <tr>
                  <td style="padding: 16px 20px; font-size: 14px; color: #0c4a6e; line-height: 1.6;">
                    ${arrivalHtml}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer note (editable) -->
          <tr>
            <td style="padding: 0 32px 28px 32px; font-size: 14px; line-height: 1.6; color: #6e6e73;">
              <p style="margin: 0;">${esc(footerText)}</p>
            </td>
          </tr>

          <!-- Footer (locked) -->
          <tr>
            <td style="background-color: #f5f5f7; padding: 20px 32px; text-align: center;">
              <p style="margin: 0; font-size: 12px; color: #aeaeb2;">Ultimate Hockey Tournaments &middot; ultimatetournaments.com</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/** Staff alert to John + Johnny on every paid booking */
export function buildIceBookingStaffHtml(b: IceBookingEmailData, fields: Record<string, string>): string {
  const vars = iceBookingVars(b);
  const introText = sub(fields.intro || 'New paid ice booking just came in.', vars);

  const row = (label: string, value: string) => `
                      <tr>
                        <td style="padding: 4px 0; color: #6e6e73; font-size: 13px; width: 110px;">${label}</td>
                        <td style="padding: 4px 0; font-weight: 600; font-size: 14px; color: #1d1d1f;">${value}</td>
                      </tr>`;

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin: 0; padding: 0; background-color: #f5f5f7; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f7; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.06);">

          <tr>
            <td style="background: linear-gradient(135deg, #003e79, #001f3f); padding: 22px 28px;">
              <p style="margin: 0; font-size: 11px; color: #7dd3fc; text-transform: uppercase; letter-spacing: 1.5px; font-weight: 700;">Ice Booking</p>
              <h1 style="color: #ffffff; font-size: 19px; margin: 6px 0 0 0; font-weight: 700;">${esc(vars.date)} &middot; ${esc(vars.startTime)} - ${esc(vars.endTime)}</h1>
            </td>
          </tr>

          <tr>
            <td style="padding: 20px 28px 0 28px; font-size: 14px; line-height: 1.6; color: #1d1d1f;">
              <p style="margin: 0 0 14px 0;">${esc(introText)}</p>
              <table width="100%" cellpadding="0" cellspacing="0" style="border: 1px solid #e8e8ed; border-radius: 12px;">
                <tr>
                  <td style="padding: 14px 16px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      ${row('Rink', esc(vars.venueName) + (b.rinkName ? ` - ${esc(b.rinkName)}` : ''))}
                      ${row('When', `${esc(vars.date)}, ${esc(vars.startTime)} - ${esc(vars.endTime)}`)}
                      ${row('Paid', `<span style="background-color: #dcfce7; color: #166534; font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 20px;">${esc(vars.amount)}</span>`)}
                      ${row('Name', esc(b.name))}
                      ${row('Email', `<a href="mailto:${esc(b.email)}" style="color: #0e7fb8; text-decoration: none;">${esc(b.email)}</a>`)}
                      ${b.phone ? row('Phone', esc(b.phone)) : ''}
                      ${b.notes ? row('Notes', esc(b.notes)) : ''}
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding: 20px 28px 26px 28px;">
              <a href="https://ultimatetournaments.com/admin/ice" style="display: inline-block; background: #003e79; color: #ffffff; padding: 11px 24px; border-radius: 10px; text-decoration: none; font-weight: 600; font-size: 14px;">Manage Ice Bookings</a>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
