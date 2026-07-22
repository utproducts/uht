import type { Env } from '../types';

interface HotelConfirmationParams {
  hotelContactEmail: string;
  hotelContactName: string;
  hotelName: string;
  teamName: string;
  ageGroup: string;
  division?: string;
  eventName: string;
  eventDate: string;
  eventCity: string;
  coachName?: string;
  coachEmail?: string;
  coachPhone?: string;
  managerName?: string;
  managerEmail?: string;
  managerPhone?: string;
}

function buildHotelConfirmationHtml(params: HotelConfirmationParams): string {
  const { hotelContactName, hotelName, teamName, ageGroup, division, eventName, eventDate, eventCity,
    coachName, coachEmail, coachPhone, managerName, managerEmail, managerPhone } = params;

  const divisionText = division ? ` - ${division}` : '';

  // Build coach contact block
  let coachBlock = '';
  if (coachName || coachEmail || coachPhone) {
    coachBlock = `
      <tr>
        <td style="padding: 12px 20px; border-bottom: 1px solid #e8e8ed;">
          <p style="margin: 0 0 4px 0; font-size: 11px; color: #86868b; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">Head Coach</p>
          ${coachName ? `<p style="margin: 0; font-size: 15px; font-weight: 600; color: #1d1d1f;">${coachName}</p>` : ''}
          ${coachEmail ? `<p style="margin: 2px 0; font-size: 14px;"><a href="mailto:${coachEmail}" style="color: #003e79; text-decoration: none;">${coachEmail}</a></p>` : ''}
          ${coachPhone ? `<p style="margin: 2px 0; font-size: 14px; color: #6e6e73;">${coachPhone}</p>` : ''}
        </td>
      </tr>`;
  }

  // Build manager contact block
  let managerBlock = '';
  if (managerName || managerEmail || managerPhone) {
    managerBlock = `
      <tr>
        <td style="padding: 12px 20px;">
          <p style="margin: 0 0 4px 0; font-size: 11px; color: #86868b; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">Team Manager</p>
          ${managerName ? `<p style="margin: 0; font-size: 15px; font-weight: 600; color: #1d1d1f;">${managerName}</p>` : ''}
          ${managerEmail ? `<p style="margin: 2px 0; font-size: 14px;"><a href="mailto:${managerEmail}" style="color: #003e79; text-decoration: none;">${managerEmail}</a></p>` : ''}
          ${managerPhone ? `<p style="margin: 2px 0; font-size: 14px; color: #6e6e73;">${managerPhone}</p>` : ''}
        </td>
      </tr>`;
  }

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

          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #003e79, #001f3f); padding: 32px; text-align: center;">
              <img src="https://uht.chad-157.workers.dev/api/assets/brand/uht-logo.png" alt="Ultimate Tournaments" width="180" style="height: auto; margin-bottom: 16px;">
              <h1 style="color: #ffffff; font-size: 22px; margin: 0; font-weight: 700;">New Team Hotel Assignment</h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 24px 32px; font-size: 15px; line-height: 1.6; color: #1d1d1f;">
              <p style="margin: 0 0 16px 0;">Hi ${hotelContactName || 'Hotel Partner'},</p>
              <p style="margin: 0 0 20px 0;">A new team has been assigned to <strong>${hotelName}</strong> for an upcoming Ultimate Hockey Tournament event. Please find their details below.</p>

              <!-- Event Info -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f0f9ff; border: 1px solid #bae6fd; border-radius: 12px; margin-bottom: 20px;">
                <tr>
                  <td style="padding: 16px 20px;">
                    <p style="margin: 0; font-size: 11px; color: #86868b; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">Event</p>
                    <p style="margin: 4px 0 0 0; font-size: 18px; color: #003e79; font-weight: 700;">${eventName}</p>
                    <p style="margin: 4px 0 0 0; font-size: 14px; color: #6e6e73;">${eventDate} &middot; ${eventCity}</p>
                  </td>
                </tr>
              </table>

              <!-- Team Info -->
              <table width="100%" cellpadding="0" cellspacing="0" style="border: 1px solid #e8e8ed; border-radius: 12px; overflow: hidden; margin-bottom: 20px;">
                <tr>
                  <td style="padding: 16px 20px; background-color: #f5f5f7; border-bottom: 1px solid #e8e8ed;">
                    <p style="margin: 0; font-size: 11px; color: #86868b; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">Team</p>
                    <p style="margin: 4px 0 0 0; font-size: 18px; font-weight: 700; color: #1d1d1f;">${teamName}</p>
                    <p style="margin: 4px 0 0 0; font-size: 14px; color: #6e6e73;">${ageGroup}${divisionText}</p>
                  </td>
                </tr>
                ${coachBlock}
                ${managerBlock}
              </table>

              <p style="margin: 20px 0 0 0; font-size: 14px; color: #6e6e73;">
                The coach has been notified of their hotel assignment and may reach out to coordinate room bookings for their team.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f5f5f7; padding: 24px 32px; border-top: 1px solid #e8e8ed;">
              <p style="margin: 0; font-size: 13px; color: #86868b; text-align: center;">
                Ultimate Hockey Tournaments<br>
                477 Dunlay Street, Wood Dale, IL 60191<br>
                <a href="mailto:registration@ultimatetournaments.com" style="color: #00ccff; text-decoration: none;">registration@ultimatetournaments.com</a>
                &middot; <a href="https://ultimatetournaments.com" style="color: #00ccff; text-decoration: none;">ultimatetournaments.com</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Send hotel confirmation email to hotel contact when a team is assigned
 */
export async function sendHotelConfirmationEmail(env: Env, params: HotelConfirmationParams): Promise<{ success: boolean; error?: string }> {
  if (!env.RESEND_API) {
    console.warn('RESEND_API not configured — skipping hotel confirmation email');
    return { success: false, error: 'Resend API key not configured' };
  }

  const { hotelContactEmail, teamName, eventName, eventDate, hotelName } = params;

  const subject = `New Team Assignment: ${teamName} — ${eventName} (${eventDate})`;
  const html = buildHotelConfirmationHtml(params);

  // Plain text version
  let plainText = `Hi ${params.hotelContactName || 'Hotel Partner'},\n\nA new team has been assigned to ${hotelName} for an upcoming Ultimate Hockey Tournament event.\n\nEvent: ${eventName}\nDate: ${eventDate}\nLocation: ${params.eventCity}\n\nTeam: ${teamName}\nAge Group: ${params.ageGroup}${params.division ? ` - ${params.division}` : ''}`;
  if (params.coachName) plainText += `\n\nHead Coach: ${params.coachName}`;
  if (params.coachEmail) plainText += `\nEmail: ${params.coachEmail}`;
  if (params.coachPhone) plainText += `\nPhone: ${params.coachPhone}`;
  if (params.managerName) plainText += `\n\nTeam Manager: ${params.managerName}`;
  if (params.managerEmail) plainText += `\nEmail: ${params.managerEmail}`;
  if (params.managerPhone) plainText += `\nPhone: ${params.managerPhone}`;
  plainText += `\n\nThe coach has been notified and may reach out to coordinate room bookings.\n\nUltimate Hockey Tournaments\nregistration@ultimatetournaments.com`;

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.RESEND_API}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Ultimate Tournaments <registration@ultimatetournaments.com>',
        to: [hotelContactEmail],
        bcc: ['registration@ultimatetournaments.com'],
        subject,
        html,
        text: plainText,
      }),
    });

    if (response.ok) {
      return { success: true };
    } else {
      const errText = await response.text();
      console.error('Resend API error (hotel confirmation):', response.status, errText);
      return { success: false, error: `Resend ${response.status}: ${errText}` };
    }
  } catch (err: any) {
    console.error('Resend fetch error (hotel confirmation):', err);
    return { success: false, error: err.message };
  }
}
