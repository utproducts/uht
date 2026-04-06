import type { Env } from '../types';

interface ApprovalEmailParams {
  recipientEmail: string;
  recipientName: string;
  ccEmails?: string[];
  teamName: string;
  ageGroup: string;
  division?: string;
  eventName: string;
  eventDate: string;
  eventCity: string;
  paymentStatus: string;
  priceCents?: number;
}

/**
 * Builds the acceptance email HTML matching the current UHT email style.
 * 3 variants based on payment status: pay_later, deposit_paid, fully_paid
 */
function buildAcceptanceHtml(params: ApprovalEmailParams): string {
  const { teamName, ageGroup, division, eventName, eventDate, eventCity, paymentStatus, priceCents } = params;

  const divisionText = division ? ` - ${division}` : '';
  const priceStr = priceCents ? `$${(priceCents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '';

  let paymentSection = '';

  if (paymentStatus === 'paid') {
    paymentSection = `
      <p>Thank you, your registration has been paid in full.</p>
      <p>Please send us your approved hockey roster as soon as it's ready — this can be uploaded online through the registration portal or emailed.</p>
    `;
  } else if (paymentStatus === 'partial') {
    paymentSection = `
      <p>Thank you, your deposit has been received. The remaining balance is due 30 days before the tournament starts.</p>
      <p>Please send us your approved hockey roster as soon as it's ready — this can be uploaded online through the registration portal or emailed.</p>
      <h3 style="color: #003e79; margin-top: 24px;">Payment Options:</h3>
      ${paymentOptionsHtml()}
    `;
  } else {
    // unpaid / pay later (default)
    paymentSection = `
      <p>We will hold your spot for 14 days, during which a <strong>$350.00 deposit</strong> is required. The remaining balance is due 30 days before the tournament starts.</p>
      <p>Please send us your approved hockey roster as soon as it's ready — this can be uploaded online through the registration portal or emailed.</p>
      <p>If you need more time for the deposit, please reach out, and we can discuss waiving it.</p>
      <h3 style="color: #003e79; margin-top: 24px;">Payment Options:</h3>
      ${paymentOptionsHtml()}
    `;
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
              <img src="https://ultimatetournaments.com/storage/logo/uht-logo-white.png" alt="Ultimate Tournaments" width="180" style="margin-bottom: 16px;">
              <h1 style="color: #ffffff; font-size: 24px; margin: 0; font-weight: 700;">Registration Accepted!</h1>
            </td>
          </tr>

          <!-- Event Badge -->
          <tr>
            <td style="padding: 24px 32px 0 32px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f0f9ff; border: 1px solid #bae6fd; border-radius: 12px; padding: 20px;">
                <tr>
                  <td style="padding: 16px 20px;">
                    <p style="margin: 0; font-size: 13px; color: #6e6e73; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">Event</p>
                    <p style="margin: 4px 0 0 0; font-size: 18px; color: #003e79; font-weight: 700;">${eventName}</p>
                    <p style="margin: 4px 0 0 0; font-size: 14px; color: #6e6e73;">${eventDate} · ${eventCity}</p>
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

          <!-- Body -->
          <tr>
            <td style="padding: 24px 32px 32px 32px; font-size: 15px; line-height: 1.6; color: #1d1d1f;">
              <p style="margin: 0 0 16px 0;"><strong>Congratulations on your registration!</strong></p>
              ${paymentSection}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f5f5f7; padding: 24px 32px; border-top: 1px solid #e8e8ed;">
              <p style="margin: 0; font-size: 13px; color: #86868b; text-align: center;">
                Ultimate Hockey Tournaments<br>
                477 Dunlay Street, Wood Dale, IL 60191<br>
                <a href="mailto:registration@ultimatetournaments.com" style="color: #00ccff; text-decoration: none;">registration@ultimatetournaments.com</a>
                · <a href="https://ultimatetournaments.com" style="color: #00ccff; text-decoration: none;">ultimatetournaments.com</a>
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

function paymentOptionsHtml(): string {
  return `
    <ol style="padding-left: 20px; font-size: 14px; line-height: 1.8; color: #1d1d1f;">
      <li><strong>Credit Card:</strong> Process your payment directly on our <a href="https://ultimatetournaments.com" style="color: #00ccff;">website registration portal</a>.</li>
      <li><strong>Venmo:</strong><br>
        Ultimate Hockey Tournaments: <strong>@ultimatetournaments</strong> (look for the UHT logo)<br>
        John Schwarz: <strong>@john-Schwarz-33</strong> (UHT logo; last 4 digits: 6160)
      </li>
      <li><strong>Check:</strong><br>
        Make checks payable to <strong>UHT</strong> and mail to:<br>
        477 Dunlay Street, Wood Dale, IL 60191<br>
        <em>Include your team's name, date of tourney, and division on the check.</em>
      </li>
    </ol>
  `;
}

/**
 * Send the acceptance/approval email via SendGrid
 */
export async function sendApprovalEmail(env: Env, params: ApprovalEmailParams): Promise<{ success: boolean; error?: string }> {
  if (!env.SENDGRID_API_KEY) {
    console.warn('SENDGRID_API_KEY not configured — skipping approval email');
    return { success: false, error: 'SendGrid API key not configured' };
  }

  const { recipientEmail, recipientName, ccEmails, teamName, ageGroup, division, eventName, eventDate, eventCity } = params;

  const divisionText = division ? ` - ${division}` : '';
  const subject = `Accepted! ${eventDate}, ${eventCity} - ${eventName} - ${teamName} - ${ageGroup}${divisionText}`;

  const html = buildAcceptanceHtml(params);
  const plainText = `Congratulations! Your registration for ${eventName} has been accepted.\n\nTeam: ${teamName}\nAge Group: ${ageGroup}${divisionText}\nEvent: ${eventName}\nDate: ${eventDate}\nCity: ${eventCity}\n\nPlease send us your approved hockey roster as soon as it's ready.\n\nUltimate Hockey Tournaments\nregistration@ultimatetournaments.com`;

  const personalizations: any = {
    to: [{ email: recipientEmail, name: recipientName }],
  };

  // Add CC emails (coach, assistant coaches, etc.)
  if (ccEmails && ccEmails.length > 0) {
    personalizations.cc = ccEmails.filter(e => e && e !== recipientEmail).map(e => ({ email: e }));
  }

  // BCC registration inbox
  personalizations.bcc = [{ email: 'registration@ultimatetournaments.com' }];

  try {
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.SENDGRID_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [personalizations],
        from: { email: 'registration@ultimatetournaments.com', name: 'Ultimate Tournaments' },
        subject,
        content: [
          { type: 'text/html', value: html },
          { type: 'text/plain', value: plainText },
        ],
      }),
    });

    if (response.ok || response.status === 202) {
      return { success: true };
    } else {
      const errText = await response.text();
      console.error('SendGrid API error:', response.status, errText);
      return { success: false, error: `SendGrid ${response.status}: ${errText}` };
    }
  } catch (err: any) {
    console.error('SendGrid fetch error:', err);
    return { success: false, error: err.message };
  }
}
