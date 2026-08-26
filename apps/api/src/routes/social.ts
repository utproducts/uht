import { Hono } from 'hono';
import { ImageResponse } from 'workers-og';
import type { Env } from '../types';

// "WE'RE IN!" social graphics — 1080x1080 PNG generated per registration for
// teams to post on Instagram/Facebook when they're accepted. Linked from the
// approval email. URL is public; the unguessable registration id is the key
// (same model as pay links).
export const socialRoutes = new Hono<{ Bindings: Env }>();

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function fmtRange(start: string, end: string): string {
  const s = new Date(start + 'T12:00:00');
  const e = new Date(end + 'T12:00:00');
  if (s.getMonth() === e.getMonth()) return `${MONTHS[s.getMonth()]} ${s.getDate()}–${e.getDate()}, ${e.getFullYear()}`;
  return `${MONTHS[s.getMonth()]} ${s.getDate()} – ${MONTHS[e.getMonth()]} ${e.getDate()}, ${e.getFullYear()}`;
}

// Load a Google font's TTF (cached at the edge) for satori rendering
async function loadFont(family: string, weight: number): Promise<ArrayBuffer | null> {
  try {
    const cssUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@${weight}`;
    const cacheKey = new Request(cssUrl + '#ttf');
    const cache = (caches as any).default;
    const cached = await cache.match(cacheKey);
    if (cached) return await cached.arrayBuffer();

    const css = await (await fetch(cssUrl, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 6.1)' } })).text();
    const m = css.match(/src: url\((https:[^)]+\.ttf)\)/);
    if (!m) return null;
    const fontRes = await fetch(m[1]);
    if (!fontRes.ok) return null;
    const buf = await fontRes.arrayBuffer();
    await cache.put(cacheKey, new Response(buf.slice(0), { headers: { 'Cache-Control': 'public, max-age=31536000' } }));
    return buf;
  } catch {
    return null;
  }
}

socialRoutes.get('/card/:regId', async (c) => {
  const db = c.env.DB;
  const regId = c.req.param('regId').replace(/\.png$/i, '');

  // Serve from edge cache when we've rendered this card before
  const cache = (caches as any).default;
  const cacheKey = new Request(new URL(c.req.url).toString());
  const cachedPng = await cache.match(cacheKey);
  if (cachedPng) return cachedPng;

  // Load the registration from either table, with display name + division
  let reg = await db.prepare(`
    SELECT er.id, er.age_group, er.division,
      COALESCE(ed.age_group, er.age_group) as div_age, COALESCE(ed.division_level, er.division) as div_level,
      COALESCE(ct.schedule_name, CASE WHEN ct.head_coach_name LIKE '% %' THEN COALESCE((SELECT og.name FROM organizations og WHERE og.id = ct.organization_id), ct.name) || ' (' || TRIM(SUBSTR(ct.head_coach_name, INSTR(ct.head_coach_name, ' '))) || ')' ELSE ct.name END, er.team_name) as display_name,
      e.name as event_name, e.city, e.state, e.start_date, e.end_date, e.logo_url
    FROM event_registrations er
    JOIN events e ON e.id = er.event_id
    LEFT JOIN event_divisions ed ON ed.id = er.event_division_id
    LEFT JOIN teams ct ON ct.id = er.team_id
    WHERE er.id = ?
  `).bind(regId).first<any>();
  if (!reg) {
    reg = await db.prepare(`
      SELECT r.id, t.age_group, NULL as division,
        COALESCE(ed.age_group, t.age_group) as div_age, COALESCE(ed.division_level, t.division_level) as div_level,
        COALESCE(t.schedule_name, t.name) as display_name,
        e.name as event_name, e.city, e.state, e.start_date, e.end_date, e.logo_url
      FROM registrations r
      JOIN events e ON e.id = r.event_id
      LEFT JOIN event_divisions ed ON ed.id = r.event_division_id
      LEFT JOIN teams t ON t.id = r.team_id
      WHERE r.id = ?
    `).bind(regId).first<any>();
  }
  if (!reg) return c.json({ success: false, error: 'Not found' }, 404);

  const teamName = String(reg.display_name || 'Our Team');
  const divChip = [reg.div_age, reg.div_level].filter(Boolean).join(' ');
  const dates = fmtRange(reg.start_date, reg.end_date);
  const city = `${reg.city}, ${reg.state}`;
  // Team names vary wildly in length — scale the headline down for long ones
  const teamSize = teamName.length > 34 ? 44 : teamName.length > 24 ? 56 : 68;

  const [black, bold] = await Promise.all([loadFont('Archivo Black', 400), loadFont('Inter', 700)]);
  const fonts: any[] = [];
  if (black) fonts.push({ name: 'Archivo Black', data: black, weight: 400, style: 'normal' });
  if (bold) fonts.push({ name: 'Inter', data: bold, weight: 700, style: 'normal' });
  if (!fonts.length) return c.json({ success: false, error: 'Font load failed — try again' }, 503);
  const heading = black ? 'Archivo Black' : 'Inter';

  // Inline the event logo as a data URI (satori only decodes PNG/JPEG, and
  // inlining avoids remote-fetch quirks). Skip silently on any problem.
  let logoImg = '';
  if (reg.logo_url) {
    try {
      const lr = await fetch(String(reg.logo_url));
      const ct = lr.headers.get('content-type') || '';
      if (lr.ok && /image\/(png|jpe?g)/i.test(ct)) {
        const ab = await lr.arrayBuffer();
        if (ab.byteLength < 2_000_000) {
          let bin = '';
          const bytes = new Uint8Array(ab);
          for (let i = 0; i < bytes.length; i += 8192) {
            bin += String.fromCharCode(...bytes.subarray(i, i + 8192));
          }
          const b64 = btoa(bin);
          logoImg = `<img src="data:${ct.split(';')[0]};base64,${b64}" width="190" height="190" style="border-radius: 24px; object-fit: contain;" />`;
        }
      }
    } catch {}
  }
  if (!logoImg) reg.logo_url = null; // widen the event-name block

  const html = `
    <div style="display: flex; flex-direction: column; width: 1080px; height: 1080px; background: linear-gradient(160deg, #001d3d 0%, #003e79 55%, #005599 100%); font-family: 'Inter'; position: relative;">
      <div style="display: flex; position: absolute; top: -160px; right: -160px; width: 460px; height: 460px; border-radius: 230px; background: rgba(0,204,255,0.12);"></div>
      <div style="display: flex; position: absolute; bottom: -200px; left: -140px; width: 520px; height: 520px; border-radius: 260px; background: rgba(0,204,255,0.08);"></div>

      <div style="display: flex; align-items: center; justify-content: center; margin-top: 64px;">
        <div style="display: flex; font-family: '${heading}'; font-size: 30px; color: #9fd8ff; letter-spacing: 8px;">ULTIMATE HOCKEY TOURNAMENTS</div>
      </div>

      <div style="display: flex; flex-direction: column; align-items: center; margin-top: 46px;">
        <div style="display: flex; font-family: '${heading}'; font-size: 148px; color: #00ccff; line-height: 1;">WE'RE IN!</div>
      </div>

      <div style="display: flex; flex-direction: column; align-items: center; margin-top: 44px; padding: 0 70px;">
        <div style="display: flex; font-family: '${heading}'; font-size: ${teamSize}px; color: #ffffff; text-align: center; line-height: 1.15;">${teamName.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</div>
        ${divChip ? `<div style="display: flex; margin-top: 26px; background: rgba(0,204,255,0.18); border: 3px solid #00ccff; border-radius: 40px; padding: 10px 34px; font-size: 34px; font-weight: 700; color: #aee9ff;">${divChip}</div>` : ''}
      </div>

      <div style="display: flex; align-items: center; justify-content: center; margin-top: 52px; gap: 40px; padding: 0 70px;">
        ${logoImg}
        <div style="display: flex; flex-direction: column;">
          <div style="display: flex; font-family: '${heading}'; font-size: 52px; color: #ffffff; line-height: 1.15; max-width: ${reg.logo_url ? '640px' : '900px'};">${String(reg.event_name).replace(/&/g, '&amp;').replace(/</g, '&lt;')}</div>
          <div style="display: flex; margin-top: 16px; font-size: 36px; font-weight: 700; color: #9fd8ff;">${dates}</div>
          <div style="display: flex; margin-top: 6px; font-size: 36px; font-weight: 700; color: #9fd8ff;">${city}</div>
        </div>
      </div>

      <div style="display: flex; position: absolute; bottom: 0; left: 0; right: 0; height: 96px; background: #00ccff; align-items: center; justify-content: center;">
        <div style="display: flex; gap: 28px; font-size: 27px; font-weight: 700; color: #00294f;">
          <div style="display: flex;">@ultimatehockeytournaments</div>
          <div style="display: flex;">#UHTHockey</div>
          <div style="display: flex;">ultimatetournaments.com</div>
        </div>
      </div>
    </div>`;

  try {
    const img = new ImageResponse(html, { width: 1080, height: 1080, fonts });
    const buf = await img.arrayBuffer();
    const res = new Response(buf, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=86400',
        'Content-Disposition': `inline; filename="were-in-${regId.slice(0, 8)}.png"`,
      },
    });
    c.executionCtx.waitUntil(cache.put(cacheKey, res.clone()));
    return res;
  } catch (err: any) {
    console.error('Social card render error:', err?.message || String(err));
    return c.json({ success: false, error: 'Card render failed' }, 500);
  }
});
