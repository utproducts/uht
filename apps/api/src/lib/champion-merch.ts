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

export interface MerchColor { name: string; swatch: string; image: string; url: string }
export interface MerchProduct {
  name: string;
  img: string;
  link: string;
  price?: string | null;
  tier: 'champion' | 'other';
  colors?: MerchColor[];
}

function esc(x: any): string {
  return String(x ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function unescapeHtml(x: string): string {
  return x.replace(/&amp;/g, '&').replace(/&#0?39;/g, "'").replace(/&quot;/g, '"');
}

export async function fetchMerchProducts(slugOrUrl: string): Promise<{ products: MerchProduct[]; shopUrl: string; eventLogo?: string | null }> {
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
            colors: Array.isArray(pr.colors) ? pr.colors
              .filter((c0: any) => c0?.image && c0?.url)
              .map((c0: any) => ({ name: String(c0.name || ''), swatch: String(c0.swatch || '#ccc'), image: String(c0.image), url: String(c0.url) })) : [],
          });
        }
      }
      if (products.length > 0) return { products, shopUrl: d.event?.shop_url || shopUrl, eventLogo: d.event?.logo?.url || null };
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
  return { products: out, shopUrl, eventLogo: null };
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

export interface ChampionInfo { team_name: string; division: string; score: string; photo: string | null }

export async function eventChampions(db: any, eventId: string): Promise<ChampionInfo[]> {
  const rows = (await db.prepare(`
    SELECT CASE WHEN g.home_score > g.away_score THEN g.home_team_id ELSE g.away_team_id END as tid,
      COALESCE(wt.schedule_name, wt.name) as team_name,
      COALESCE(ed.age_group || CASE WHEN ed.division_level IS NOT NULL THEN ' ' || ed.division_level ELSE '' END, 'Champions') as division,
      MAX(g.home_score, g.away_score) || '-' || MIN(g.home_score, g.away_score) as score
    FROM games g
    JOIN teams wt ON wt.id = CASE WHEN g.home_score > g.away_score THEN g.home_team_id ELSE g.away_team_id END
    LEFT JOIN event_divisions ed ON ed.id = g.event_division_id
    WHERE g.event_id = ? AND g.game_type = 'championship' AND g.status = 'final'
      AND g.home_team_id IS NOT NULL AND g.away_team_id IS NOT NULL AND g.home_score != g.away_score
    ORDER BY division
  `).bind(eventId).all()).results || [];
  const out: ChampionInfo[] = [];
  for (const r of rows as any[]) {
    const photo = await db.prepare(
      "SELECT id FROM event_photos WHERE event_id = ?1 AND kind = 'champion' AND team_id = ?2 ORDER BY created_at DESC LIMIT 1"
    ).bind(eventId, r.tid).first<any>();
    out.push({
      team_name: r.team_name, division: r.division, score: r.score,
      photo: photo ? `https://uht.chad-157.workers.dev/api/photos/file/${photo.id}?card=1` : null,
    });
  }
  return out;
}

function championsGallery(champions: ChampionInfo[]): string {
  // Photos are PRE-CROPPED to identical 480x480 squares server-side
  // (?card=1), so every client renders a perfectly even grid
  const cell = (ch: ChampionInfo) => `
    <td width="25%" style="padding:5px;vertical-align:top;">
      ${ch.photo
        ? `<img src="${esc(ch.photo)}" alt="${esc(ch.team_name)}" width="128" height="128" style="display:block;width:100%;height:auto;border-radius:10px;border:1.5px solid #e4d9b4;" />`
        : `<table role="presentation" width="100%" style="border-collapse:collapse;"><tr><td style="background:#003e79;border-radius:10px;height:110px;font-size:0;">&nbsp;</td></tr></table>`}
      <div style="font-family:Arial,sans-serif;font-size:10.5px;font-weight:bold;color:#1d2a3d;line-height:1.3;margin-top:5px;text-align:center;">${esc(ch.team_name)}</div>
      <div style="font-family:Arial,sans-serif;font-size:9.5px;color:#b8860b;font-weight:bold;text-align:center;">${esc(ch.division)}</div>
    </td>`;
  let rows = '';
  const list = champions.slice(0, 12);
  for (let i = 0; i < list.length; i += 4) {
    const chunk = list.slice(i, i + 4);
    rows += `<tr>${chunk.map(cell).join('')}${'<td width="25%"></td>'.repeat(4 - chunk.length)}</tr>`;
  }
  return `<table role="presentation" width="100%" style="border-collapse:collapse;margin-top:12px;">${rows}</table>`;
}

export function buildChampionMerchHtml(ev: any, products: MerchProduct[], shopUrl: string, eventLogo?: string | null, champions: ChampionInfo[] = []): { subject: string; html: string } {
  const subject = `Champions only: your ${ev.name} title gear is live`;
  const champs = products.filter(p => p.tier === 'champion');
  const featured = champs.slice(0, 4);

  // Each featured card wears a DIFFERENT color so the variety shows
  const card = (p: MerchProduct, idx: number) => {
    const colors = p.colors || [];
    const variant = colors.length > 0 ? colors[idx % colors.length] : null;
    const img = variant?.image || p.img;
    const link = variant?.url || p.link;
    const dots = colors.slice(0, 6).map(c0 =>
      `<td width="14" style="padding:0 3px;"><div style="width:12px;height:12px;border-radius:50%;background:${esc(c0.swatch)};border:1px solid #d8dce3;font-size:0;line-height:0;">&nbsp;</div></td>`
    ).join('');
    return `
    <td width="50%" style="padding:8px;vertical-align:top;">
      <a href="${esc(link)}" style="text-decoration:none;display:block;background:#ffffff;border:1.5px solid #e4d9b4;border-radius:14px;overflow:hidden;">
        <img src="${esc(img)}" alt="${esc(p.name)}" width="100%" style="display:block;background:#f8f9fb;" />
        <div style="padding:10px 12px 12px;">
          <div style="font-family:Arial,sans-serif;font-size:13px;font-weight:bold;color:#1d2a3d;line-height:1.35;">${esc(p.name)}</div>
          ${colors.length > 1 ? `<table role="presentation" style="border-collapse:collapse;margin-top:7px;"><tr>${dots}<td style="font-family:Arial,sans-serif;font-size:10px;color:#8a94a3;padding-left:4px;">${colors.length} colors</td></tr></table>` : ''}
          <div style="font-family:Arial,sans-serif;font-size:12px;font-weight:bold;color:#b8860b;margin-top:7px;letter-spacing:1px;">${p.price ? esc(p.price) + '  ·  ' : ''}SHOP NOW &gt;</div>
        </div>
      </a>
    </td>`;
  };

  let rows = '';
  for (let i = 0; i < featured.length; i += 2) {
    rows += `<tr>${card(featured[i], i)}${featured[i + 1] ? card(featured[i + 1], i + 1) : '<td width="50%"></td>'}</tr>`;
  }

  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#f2f4f8;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:620px;margin:0 auto;padding:24px 14px;">
    <div style="background:#ffffff;border:2px solid #d4af37;border-radius:18px;overflow:hidden;">
      <div style="text-align:center;padding:26px 24px 6px;">
        ${eventLogo ? `<img src="${esc(eventLogo)}" alt="${esc(ev.name)}" width="150" style="display:block;margin:0 auto 14px;" />` : ''}
        <div style="display:inline-block;background:linear-gradient(90deg,#d4af37,#b8860b);color:#ffffff;font-size:11px;font-weight:bold;letter-spacing:3px;border-radius:999px;padding:7px 18px;">CHAMPIONS ONLY</div>
        <div style="font-size:26px;font-weight:900;color:#003e79;margin-top:14px;line-height:1.25;">You earned this.</div>
        <div style="font-size:14px;color:#5b6b80;margin-top:8px;line-height:1.55;max-width:440px;margin-left:auto;margin-right:auto;">
          Official <strong style="color:#1d2a3d;">${esc(ev.name)}</strong> CHAMPIONS gear - reserved for the teams that won it all.
          Custom name and number available on every piece.
        </div>
        ${champions.length > 0 ? `
        <div style="font-size:12px;font-weight:bold;letter-spacing:2.5px;color:#b8860b;margin-top:20px;">${champions.length} CHAMPIONSHIP GAME${champions.length !== 1 ? 'S' : ''} - ${champions.length} CHAMPION${champions.length !== 1 ? 'S' : ''} CROWNED</div>
        ${championsGallery(champions)}` : ''}
      </div>
      <div style="padding:10px 14px 4px;">
        <table role="presentation" width="100%" style="border-collapse:collapse;">${rows}</table>
      </div>
      <div style="text-align:center;padding:14px 20px 26px;">
        <a href="${esc(shopUrl)}" style="display:inline-block;background:linear-gradient(90deg,#d4af37,#b8860b);color:#ffffff;font-weight:900;font-size:14px;letter-spacing:1px;border-radius:999px;padding:14px 32px;text-decoration:none;">VIEW ALL CHAMPION PRODUCTS</a>
        <p style="font-size:11.5px;color:#8a94a3;margin:12px 0 0;">Free shipping on orders over $99.99 - the collection closes soon.</p>
      </div>
    </div>
    <div style="text-align:center;margin:16px 0 0;">
      <img src="https://ultimatetournaments.com/uht-logo.png" alt="Ultimate Hockey Tournaments" width="46" height="46" style="display:inline-block;" />
      <p style="font-size:11px;color:#8a94a3;margin:8px 0 0;">Ultimate Hockey Tournaments - ${esc(ev.city)}, ${esc(ev.state)}<br>Questions? Just reply to this email.</p>
    </div>
  </div>
</body></html>`;

  return { subject, html };
}

export async function sendChampionMerch(env: any, eventId: string, shopUrl: string, opts: { testEmail?: string } = {}): Promise<any> {
  const db = env.DB;
  const ev = await db.prepare('SELECT id, name, city, state, COALESCE(is_test,0) as is_test FROM events WHERE id = ?').bind(eventId).first<any>();
  if (!ev) return { error: 'Event not found' };

  const { products, shopUrl: resolvedShop, eventLogo } = await fetchMerchProducts(shopUrl);
  if (products.length === 0) return { error: 'No products found at that link - check the URL' };
  const champions = await eventChampions(db, eventId);
  const { subject, html } = buildChampionMerchHtml(ev, products, resolvedShop, eventLogo, champions);

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
