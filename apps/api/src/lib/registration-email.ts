import type { Env } from '../types';

interface RegistrationConfirmationParams {
  recipientEmail: string;
  recipientName: string;
  teamName: string;
  ageGroup: string;
  division?: string;
  eventName: string;
  eventDate: string;
  eventCity: string;
  headCoachName?: string;
  priceCents?: number;
  depositCents?: number;
  /** Admin-customized field overrides from DB */
  _overrides?: Record<string, string>;
}

export function buildConfirmationHtml(params: Partial<RegistrationConfirmationParams> & { teamName: string; ageGroup: string; eventName: string; eventDate: string; eventCity: string }): string {
  const { teamName, ageGroup, division, eventName, eventDate, eventCity, headCoachName, priceCents, depositCents } = params;
  const o = (params as any)._overrides as Record<string, string> | undefined;
  const divisionText = division ? ` - ${division}` : '';
  const priceStr = priceCents ? `$${(priceCents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '';
  const depositStr = depositCents ? `$${(depositCents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '$350.00';

  // Editable fields (use overrides or defaults)
  const heading = o?.heading || 'Registration Received!';
  const headingSubtitle = o?.heading_subtitle || "We've got your application";
  const bodyText = (o?.body_text || 'You have successfully registered for the {eventName}!')
    .replace(/\{eventName\}/g, eventName).replace(/\{teamName\}/g, teamName).replace(/\{ageGroup\}/g, ageGroup).replace(/\{division\}/g, division || '');
  const nextStepsTitle = o?.next_steps_title || 'What happens next?';
  const nextStepsText = o?.next_steps_text || 'Our team reviews all registrations and approves them within 24-48 hours. You\'ll receive a confirmation email once your spot is secured with details on payment and next steps.';
  const preparationText = o?.preparation_text || 'In the meantime, please have the following ready:\n• Your approved USA Hockey roster\n• Hotel preferences for your team\n• Payment method (Credit Card, Venmo, or Check)';

  // Convert preparation text newlines + bullets to HTML
  const prepHtml = preparationText.split('\n').map((line: string) => {
    line = line.trim();
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
              <img src="https://ultimatetournaments.com/storage/logo/uht-logo-white.png" alt="Ultimate Tournaments" width="180" style="margin-bottom: 16px;">
              <h1 style="color: #ffffff; font-size: 22px; margin: 0; font-weight: 700;">${heading}</h1>
              <p style="color: rgba(255,255,255,0.7); font-size: 14px; margin: 8px 0 0 0;">${headingSubtitle}</p>
            </td>
          </tr>

          <!-- Event Badge (locked — dynamic data) -->
          <tr>
            <td style="padding: 24px 32px 0 32px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f0f9ff; border: 1px solid #bae6fd; border-radius: 12px;">
                <tr>
                  <td style="padding: 16px 20px;">
                    <p style="margin: 0; font-size: 13px; color: #6e6e73; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">Event</p>
                    <p style="margin: 4px 0 0 0; font-size: 18px; color: #003e79; font-weight: 700;">${eventName}</p>
                    <p style="margin: 4px 0 0 0; font-size: 14px; color: #6e6e73;">${eventDate} &middot; ${eventCity}</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 0 20px 16px 20px;">
                    <table cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="background-color: #003e79; color: #ffffff; font-size: 12px; font-weight: 600; padding: 4px 12px; border-radius: 20px;">${teamName}</td>
                        <td width="8"></td>
                        <td style="background-color: #e8e8ed; color: #1d1d1f; font-size: 12px; font-weight: 600; padding: 4px 12px; border-radius: 20px;">${ageGroup}${divisionText}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body (editable) -->
          <tr>
            <td style="padding: 24px 32px 0 32px; font-size: 15px; line-height: 1.6; color: #1d1d1f;">
              <p style="margin: 0 0 16px 0;">${bodyText}</p>

              <!-- What Happens Next (editable) -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #fffbeb; border: 1px solid #fde68a; border-radius: 12px; margin-bottom: 20px;">
                <tr>
                  <td style="padding: 16px 20px;">
                    <p style="margin: 0 0 8px 0; font-size: 14px; font-weight: 700; color: #92400e;">${nextStepsTitle}</p>
                    <p style="margin: 0; font-size: 14px; color: #78350f; line-height: 1.6;">
                      ${nextStepsText}
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Registration Summary (locked — dynamic data) -->
          <tr>
            <td style="padding: 0 32px 24px 32px; font-size: 14px; color: #1d1d1f;">
              <table width="100%" cellpadding="0" cellspacing="0" style="border: 1px solid #e8e8ed; border-radius: 12px; overflow: hidden;">
                <tr>
                  <td style="background-color: #f5f5f7; padding: 12px 16px; font-weight: 700; font-size: 13px; color: #6e6e73; text-transform: uppercase; letter-spacing: 0.5px;">Registration Summary</td>
                </tr>
                <tr>
                  <td style="padding: 16px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding: 4px 0; color: #6e6e73; font-size: 13px; width: 120px;">Team</td>
                        <td style="padding: 4px 0; font-weight: 600;">${teamName}</td>
                      </tr>
                      <tr>
                        <td style="padding: 4px 0; color: #6e6e73; font-size: 13px;">Age Group</td>
                        <td style="padding: 4px 0; font-weight: 600;">${ageGroup}</td>
                      </tr>
                      ${division ? `<tr><td style="padding: 4px 0; color: #6e6e73; font-size: 13px;">Division</td><td style="padding: 4px 0; font-weight: 600;">${division}</td></tr>` : ''}
                      ${headCoachName ? `<tr><td style="padding: 4px 0; color: #6e6e73; font-size: 13px;">Head Coach</td><td style="padding: 4px 0; font-weight: 600;">${headCoachName}</td></tr>` : ''}
                      ${priceStr ? `<tr><td style="padding: 4px 0; color: #6e6e73; font-size: 13px;">Entry Fee</td><td style="padding: 4px 0; font-weight: 600;">${priceStr}</td></tr>` : ''}
                      <tr>
                        <td style="padding: 4px 0; color: #6e6e73; font-size: 13px;">Status</td>
                        <td style="padding: 4px 0;"><span style="background-color: #fef3c7; color: #92400e; font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 20px;">Pending Review</span></td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Helpful Info (editable) -->
          <tr>
            <td style="padding: 0 32px 32px 32px; font-size: 14px; line-height: 1.6; color: #6e6e73;">
              ${prepHtml}
              <p style="margin: 16px 0 0 0;">Questions? Reply to this email or contact us at <a href="mailto:registration@ultimatetournaments.com" style="color: #00ccff; text-decoration: none;">registration@ultimatetournaments.com</a></p>
            </td>
          </tr>

          <!-- Footer (locked) -->
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
 * Send registration confirmation email via SendGrid
 * Fired immediately when someone registers (before admin approval)
 */
export async function sendRegistrationConfirmationEmail(env: Env, params: RegistrationConfirmationParams): Promise<{ success: boolean; error?: string }> {
  if (!env.SENDGRID_API_KEY) {
    console.warn('SENDGRID_API_KEY not configured — skipping registration confirmation email');
    return { success: false, error: 'SendGrid API key not configured' };
  }

  const o = params._overrides as Record<string, string> | undefined;
  const subjectTemplate = o?.subject || 'You have successfully registered to the {eventName} - Ultimate Tournaments';
  const subject = subjectTemplate
    .replace(/\{eventName\}/g, params.eventName).replace(/\{teamName\}/g, params.teamName).replace(/\{ageGroup\}/g, params.ageGroup);
  const html = buildConfirmationHtml(params);

  const plainText = `You have successfully registered for the ${params.eventName}!\n\nTeam: ${params.teamName}\nAge Group: ${params.ageGroup}${params.division ? `\nDivision: ${params.division}` : ''}\nEvent: ${params.eventName}\nDate: ${params.eventDate}\nLocation: ${params.eventCity}\n\nWhat happens next?\nOur team reviews all registrations and approves them within 24-48 hours. You'll receive a confirmation email once your spot is secured.\n\nIn the meantime, please have the following ready:\n- Your approved USA Hockey roster\n- Hotel preferences for your team\n- Payment method\n\nQuestions? Contact registration@ultimatetournaments.com\n\nUltimate Hockey Tournaments\n477 Dunlay Street, Wood Dale, IL 60191`;

  try {
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.SENDGRID_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{
          to: [{ email: params.recipientEmail, name: params.recipientName }],
          bcc: [{ email: 'registration@ultimatetournaments.com' }],
        }],
        from: { email: 'registration@ultimatetournaments.com', name: 'Ultimate Tournaments' },
        reply_to: { email: 'registration@ultimatetournaments.com', name: 'Ultimate Tournaments' },
        subject,
        content: [
          { type: 'text/plain', value: plainText },
          { type: 'text/html', value: html },
        ],
      }),
    });

    if (response.ok || response.status === 202) {
      return { success: true };
    } else {
      const errText = await response.text();
      console.error('SendGrid registration email error:', response.status, errText);
      return { success: false, error: `SendGrid ${response.status}: ${errText}` };
    }
  } catch (err: any) {
    console.error('SendGrid registration email fetch error:', err);
    return { success: false, error: err.message };
  }
}
