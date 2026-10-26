/*
  CHAMPION MERCH CAMPAIGN (Oct 2026): admin pastes the tournamentgear
  champions-shop link on the event's Overview, previews the scraped
  products, and sends an exclusive email to every champion team's
  contacts plus a push to champion team followers. Products are parsed
  live from the shop page so the email always matches what's for sale.
*/

const FROM = 'Ultimate Hockey Tournaments <johnny@ultimatetournaments.com>';
const REPLY_TO = 'johnny@ultimatetournaments.com';
const emailRe = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

export interface MerchProduct {
  name: string;
  img: string;
  link: string;
  price?: string | null;
  tier: 'champion' | 'other';
}

function esc(x: any): string {
  return String(x ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function unescapeHtml(x: string): string {
  return x.replace(/&amp;/g, '&').replace(/&#0?39;/g, "'").replace(/&quot;/g, '"');
}

export async function fetchMerchProducts(slugOrUrl: string): Promise<{ products: MerchProduct[]; shopUrl: string }> {
  // Accept a bare event slug or any champions.ultimatetournaments.com link
  let slug = slugOrUrl.trim();
  const m = slug.match(/\/event\/([^/?#]+)/);
  if (m) slug = m[1];
  slug = slug.replace(/^https?:\/\/[^/]+\/?/, '').replace(/\/+$/, '');
  const shopUrl = `https://champions.ultimatetournaments.com/event/${slug}/`;

  // The gear site's JSON API is the source of truth
  try {
    const res = await fetch(`https://champions.ultimatetournaments.com/wp-json/uht/v1/events/${encodeURIComponent(slug)}/products`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (UHT merch mailer)' },
    });
    if (res.ok) {
      const d: any = await res.json();
      const products: MerchProduct[] = [];
      for (const t of d.types || []) {
        for (const pr of t.products || []) {
          if (!pr?.name || !pr?.image || !pr?.url) continue;
          products.push({
            name: String(pr.name), img: String(pr.image), link: String(pr.url),
            price: pr.price ? `$${pr.price}` : null,
            tier: String(t.slug) === 'champion' ? 'champion' : 'other',
          });
        }
      }
      if (products.length > 0) return { products, shopUrl: d.event?.shop_url || shopUrl };
    }
  } catch {}

  // Fallback: scrape the shop page markup
  const res = await fetch(shopUrl, { headers: { 'User-Agent': 'Mozilla/5.0 (UHT merch mailer)' } });
  if (!res.ok) throw new Error(`Shop page returned ${res.status}`);
  const html = await res.text();
  const items = html.match(/<li class="product [^"]*">[\s\S]*?<\/li>/g) || [];
  const out: MerchProduct[] = [];
  for (const block of items) {
    const link = block.match(/<a href="([^"]+)" class="ep-product-link"/);
    const img = block.match(/<img src="([^"]+)"[^>]*title="([^"]*)"/);
    if (!link || !img) continue;
    const name = unescapeHtml(img[2] || '').trim();
    if (!name) continue;
    out.push({ name, img: img[1], link: unescapeHtml(link[1]), price: null, tier: /champion/i.test(name) ? 'champion' : 'other' });
  }
  if (out.length === 0) throw new Error('No products found for that event slug');
  return { products: out, shopUrl };
}

export async function championTeamIds(db: any, eventId: string): Promise<string[]> {
  const rows = (await db.prepare(`
    SELECT CASE WHEN home_score > away_score THEN home_team_id ELSE away_team_id END as tid
    FROM games WHERE event_id = ? AND game_type = 'championship' AND status = 'final'
      AND home_team_id IS NOT NULL AND away_team_id IS NOT NULL AND home_score != away_score
  `).bind(eventId).all()).results || [];
  return [...new Set((rows as any[]).map(r => r.tid as string))];
}

/** Champion teams' registration contacts + bench staff + followers with accounts */
export async function championRecipients(db: any, eventId: string, teamIds: string[]): Promise<string[]> {
  if (teamIds.length === 0) return [];
  const ph = teamIds.map(() => '?').join(',');
  const emails = new Set<string>();
  const regs = (await db.prepare(`
    SELECT email1, email2, coach_email FROM event_registrations
    WHERE event_id = ? AND team_id IN (${ph})
  `).bind(eventId, ...teamIds).all()).results || [];
  for (const r of regs as any[]) {
    for (const e of [r.email1, r.email2, r.coach_email]) {
      const v = String(e || '').trim().toLowerCase();
      if (emailRe.test(v)) emails.add(v);
    }
  }
  const users = (await db.prepare(`
    SELECT DISTINCT u.email FROM users u WHERE u.id IN (
      SELECT user_id FROM team_coaches WHERE team_id IN (${ph})
      UNION SELECT user_id FROM team_managers WHERE team_id IN (${ph})
      UNION SELECT user_id FROM team_members WHERE team_id IN (${ph}) AND status = 'active'
      UNION SELECT user_id FROM user_follows WHERE team_id IN (${ph})
    ) AND u.email IS NOT NULL
  `).bind(...teamIds, ...teamIds, ...teamIds, ...teamIds).all()).results || [];
  for (const u of users as any[]) {
    const v = String(u.email || '').trim().toLowerCase();
    if (emailRe.test(v)) emails.add(v);
  }
  return [...emails];
}

export function buildChampionMerchHtml(ev: any, products: MerchProduct[], shopUrl: string): { subject: string; html: string } {
  const subject = `Champions only: your ${ev.name} title gear is live`;
  const champs = products.filter(p => p.tier === 'champion');
  const others = products.filter(p => p.tier !== 'champion');

  const card = (p: MerchProduct) => `
    <td width="50%" style="padding:7px;vertical-align:top;">
      <a href="${esc(p.link)}" style="text-decoration:none;display:block;background:#ffffff;border:1px solid #e8e0c8;border-radius:14px;overflow:hidden;">
        <img src="${esc(p.img)}" alt="${esc(p.name)}" width="100%" style="display:block;background:#f7f7f9;" />
        <div style="padding:10px 12px 12px;">
          <div style="font-family:Arial,sans-serif;font-size:13px;font-weight:bold;color:#1d2a3d;line-height:1.35;">${esc(p.name)}</div>
          <div style="font-family:Arial,sans-serif;font-size:11px;font-weight:bold;color:#b8860b;margin-top:5px;letter-spacing:1px;">${p.price ? esc(p.price) + ' · ' : ''}SHOP NOW &gt;</div>
        </div>
      </a>
    </td>`;

  const grid = (list: MerchProduct[]) => {
    let rows = '';
    for (let i = 0; i < list.length; i += 2) {
      rows += `<tr>${card(list[i])}${list[i + 1] ? card(list[i + 1]) : '<td width="50%"></td>'}</tr>`;
    }
    return `<table role="presentation" width="100%" style="border-collapse:collapse;">${rows}</table>`;
  };

  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#0d1320;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:620px;margin:0 auto;padding:20px 12px;">
    <div style="background:linear-gradient(135deg,#1a1205,#2b1d08 55%,#3d2a0a);border:1px solid #b8860b;border-radius:18px 18px 0 0;padding:30px 24px 26px;text-align:center;">
      <div style="font-size:11px;letter-spacing:4px;color:#d4af37;font-weight:bold;">CHAMPIONS ONLY</div>
      <div style="font-size:28px;font-weight:900;color:#ffffff;margin-top:10px;line-height:1.2;">You earned this.</div>
      <div style="font-size:15px;color:#e8d9a8;margin-top:8px;line-height:1.5;">Official ${esc(ev.name)} CHAMPIONS gear - available only to the teams that won it all.</div>
    </div>
    <div style="background:#faf8f2;padding:22px 16px 10px;">
      <p style="font-family:Arial,sans-serif;font-size:14px;color:#2a3c52;line-height:1.6;margin:0 14px 14px;">
        Congratulations, champion! Not everyone gets to wear this - the Champions collection below is reserved for
        the ${esc(ev.name)} title winners. Every piece is custom-built for this event, printed on demand, and shipped
        straight to your door. Tap any item to claim yours before the collection closes.
      </p>
      ${grid(champs)}
      ${others.length > 0 ? `
      <p style="font-family:Arial,sans-serif;font-size:12px;font-weight:bold;letter-spacing:2px;color:#8a7a4a;margin:18px 14px 8px;">MORE ${esc(String(ev.name).toUpperCase())} GEAR</p>
      ${grid(others)}` : ''}
      <div style="text-align:center;padding:18px 0 20px;">
        <a href="${esc(shopUrl)}" style="display:inline-block;background:linear-gradient(90deg,#d4af37,#b8860b);color:#ffffff;font-weight:900;font-size:14px;letter-spacing:1px;border-radius:999px;padding:14px 34px;text-decoration:none;">SHOP THE CHAMPIONS COLLECTION</a>
      </div>
    </div>
    <div style="background:#0d1320;border-radius:0 0 18px 18px;padding:16px 24px;text-align:center;">
      <p style="font-size:11px;color:#6b7a90;margin:0;">Ultimate Hockey Tournaments - ${esc(ev.city)}, ${esc(ev.state)}<br>Questions? Just reply to this email.</p>
    </div>
  </div>
</body></html>`;

  return { subject, html };
}

export async function sendChampionMerch(env: any, eventId: string, shopUrl: string, opts: { testEmail?: string } = {}): Promise<any> {
  const db = env.DB;
  const ev = await db.prepare('SELECT id, name, city, state, COALESCE(is_test,0) as is_test FROM events WHERE id = ?').bind(eventId).first<any>();
  if (!ev) return { error: 'Event not found' };

  const { products, shopUrl: resolvedShop } = await fetchMerchProducts(shopUrl);
  if (products.length === 0) return { error: 'No products found at that link - check the URL' };
  const { subject, html } = buildChampionMerchHtml(ev, products, resolvedShop);

  if (opts.testEmail) {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, reply_to: REPLY_TO, to: [opts.testEmail], subject: `[TEST] ${subject}`, html }),
    });
    return { test: true, ok: resp.ok, products: products.length };
  }

  const teamIds = await championTeamIds(db, eventId);
  if (teamIds.length === 0) return { error: 'No championship winners recorded for this event yet' };
  const recipients = await championRecipients(db, eventId, teamIds);
  if (recipients.length === 0) return { error: 'No email addresses found for the champion teams' };

  // BCC waves of 40, same as the recap engine
  let sent = 0;
  for (let i = 0; i < recipients.length; i += 40) {
    try {
      const resp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.RESEND_API}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: FROM, reply_to: REPLY_TO, to: [FROM.match(/<(.+)>/)![1]], bcc: recipients.slice(i, i + 40), subject, html }),
      });
      if (resp.ok) sent += Math.min(40, recipients.length - i);
    } catch {}
  }

  // One blast copy for the staff inbox
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: FROM, to: ['johnny@ultimatetournaments.com', 'john@ultimatetournaments.com'],
        subject: `[Blast copy - ${sent} recipients] ${subject}`, html,
      }),
    });
  } catch {}

  return { teams: teamIds.length, recipients: recipients.length, sent, products: products.length };
}
