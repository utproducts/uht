/**
 * Glow in the dark tournament interest survey blast.
 * Personalized link prefills the recipient's email on the form (?e=base64).
 */

const FROM = 'Ultimate Hockey Tournaments <johnny@ultimatetournaments.com>';
const REPLY_TO = 'johnny@ultimatetournaments.com';
const SURVEY_URL = 'https://ultimatetournaments.com/survey/glow';

export const GLOW_SUBJECT = 'Glow in the dark hockey - would you play?';

export function buildGlowSurveyHtml(recipientEmail?: string | null): string {
  let link = SURVEY_URL;
  if (recipientEmail) {
    try { link = `${SURVEY_URL}?e=${btoa(recipientEmail)}`; } catch {}
  }
  return `<!doctype html>
<html>
<body style="margin:0;padding:0;background:#060f1e;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:28px 16px;">
    <div style="background:#0a2240;border-radius:18px;overflow:hidden;border:1px solid rgba(0,204,255,0.35);">
      <div style="padding:36px 28px 30px;text-align:center;background:radial-gradient(ellipse at 50% 0%, rgba(0,204,255,0.25), rgba(10,34,64,0) 65%);">
        <p style="margin:0 0 14px;font-size:11px;letter-spacing:4px;color:#00ccff;font-weight:700;">ULTIMATE HOCKEY TOURNAMENTS</p>
        <h1 style="margin:0;font-size:34px;line-height:1.15;color:#ffffff;font-weight:800;">GLOW IN THE DARK<br/>HOCKEY</h1>
        <p style="margin:14px 0 0;font-size:15px;color:#9db2c9;">Blacklights. Neon jerseys. A rink that glows.<br/>We want to host it - but first we want to hear from you.</p>
      </div>
      <div style="padding:8px 28px 30px;">
        <div style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);border-radius:14px;padding:18px 20px;margin-bottom:14px;">
          <p style="margin:0;font-size:14px;color:#dbe6f1;line-height:1.6;">We are exploring a <strong style="color:#00ccff;">glow in the dark tournament</strong> - and possibly a <strong style="color:#00ccff;">hybrid version</strong> where some games glow and some play under normal lighting.</p>
        </div>
        <div style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);border-radius:14px;padding:18px 20px;margin-bottom:14px;">
          <p style="margin:0;font-size:14px;color:#dbe6f1;line-height:1.6;">We also want to know: would you <strong style="color:#00ccff;">travel</strong> for it, or should we bring it to <strong style="color:#00ccff;">your home city</strong>?</p>
        </div>
        <div style="background:rgba(245,158,11,0.12);border:1px solid rgba(245,158,11,0.45);border-radius:14px;padding:16px 20px;margin-bottom:22px;">
          <p style="margin:0;font-size:13px;color:#fcd34d;line-height:1.6;"><strong>Good to know:</strong> the cost may run a little higher than a normal tournament because of glow uniforms and other specialty necessities. Your honest take on that helps us price it right.</p>
        </div>
        <div style="text-align:center;">
          <a href="${link}" style="display:inline-block;background:#00ccff;color:#0a2240;text-decoration:none;font-weight:800;font-size:17px;padding:16px 38px;border-radius:14px;">Take the 30 Second Survey</a>
          <p style="margin:14px 0 0;font-size:12px;color:#7d8aa0;">Four quick questions. No login needed.</p>
        </div>
      </div>
    </div>
    <p style="text-align:center;margin:18px 0 0;font-size:11px;color:#51627a;">Ultimate Hockey Tournaments &middot; ultimatetournaments.com<br/>You are receiving this because you have played with us or follow our events.</p>
  </div>
</body>
</html>`;
}

/** Campaign body: the send engine swaps __EMAIL_B64__ per recipient */
export function buildGlowSurveyCampaignHtml(): string {
  return buildGlowSurveyHtml(null).replace(
    'https://ultimatetournaments.com/survey/glow',
    'https://ultimatetournaments.com/survey/glow?e=__EMAIL_B64__'
  );
}

/** One test email to a staff address for approval */
export async function sendGlowSurveyTest(env: any, to: string) {
  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${env.RESEND_API}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, reply_to: REPLY_TO, to: [to], subject: `[TEST] ${GLOW_SUBJECT}`, html: buildGlowSurveyHtml(to) }),
  });
  return { ok: resp.ok, status: resp.status };
}
