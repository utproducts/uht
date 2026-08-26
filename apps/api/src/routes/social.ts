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

  // Load an image as a data URI. Our own URLs can't be fetched from inside the
  // worker (self-request), so /api/upload/images/* and /api/assets/* are read
  // straight from R2; external URLs are fetched normally. PNG/JPEG only.
  const imageToDataUri = async (url: string): Promise<string | null> => {
    try {
      let bytes: ArrayBuffer | null = null;
      let ctype = '';
      const mUpload = url.match(/\/api\/upload\/images\/([^?]+)/);
      const mAsset = url.match(/\/api\/assets\/([^?]+)/);
      const r2Key = mUpload ? `images/${mUpload[1]}` : mAsset ? mAsset[1] : null;
      if (r2Key) {
        const obj = await (c.env as any).STORAGE.get(r2Key);
        if (obj) {
          bytes = await obj.arrayBuffer();
          ctype = obj.httpMetadata?.contentType || (r2Key.endsWith('.png') ? 'image/png' : 'image/jpeg');
        }
      } else {
        const r = await fetch(url);
        if (r.ok) {
          ctype = (r.headers.get('content-type') || '').split(';')[0];
          bytes = await r.arrayBuffer();
        }
      }
      if (!bytes || !/image\/(png|jpe?g)/i.test(ctype) || bytes.byteLength > 3_000_000) return null;
      let bin = '';
      const u8 = new Uint8Array(bytes);
      for (let i = 0; i < u8.length; i += 8192) bin += String.fromCharCode(...u8.subarray(i, i + 8192));
      return `data:${ctype};base64,${btoa(bin)}`;
    } catch {
      return null;
    }
  };

  const [eventLogoUri, uhtLogoUri] = await Promise.all([
    reg.logo_url ? imageToDataUri(String(reg.logo_url)) : Promise.resolve(null),
    imageToDataUri('https://ultimatetournaments.com/uht-logo.png'),
  ]);

  const eventBlock = eventLogoUri
    ? `<div style="display: flex; align-items: center; gap: 44px;">
         <img src="${eventLogoUri}" width="200" height="200" style="border-radius: 28px; object-fit: contain;" />
         <div style="display: flex; flex-direction: column;">
           <div style="display: flex; font-family: '${heading}'; font-size: 52px; color: #ffffff; line-height: 1.12; max-width: 620px;">${String(reg.event_name).replace(/&/g, '&amp;').replace(/</g, '&lt;')}</div>
           <div style="display: flex; margin-top: 16px; font-size: 33px; font-weight: 700; color: #7cc4ef; white-space: nowrap;">${dates}</div>
           <div style="display: flex; margin-top: 6px; font-size: 33px; font-weight: 700; color: #7cc4ef; white-space: nowrap;">${city}</div>
         </div>
       </div>`
    : `<div style="display: flex; flex-direction: column; align-items: center;">
         <div style="display: flex; font-family: '${heading}'; font-size: 54px; color: #ffffff; line-height: 1.12; max-width: 880px; text-align: center; justify-content: center;">${String(reg.event_name).replace(/&/g, '&amp;').replace(/</g, '&lt;')}</div>
         <div style="display: flex; align-items: center; gap: 20px; margin-top: 18px;">
             <div style="display: flex; font-size: 33px; font-weight: 700; color: #7cc4ef; white-space: nowrap;">${dates}</div>
             <div style="display: flex; width: 8px; height: 8px; border-radius: 4px; background: #00ccff;"></div>
             <div style="display: flex; font-size: 33px; font-weight: 700; color: #7cc4ef; white-space: nowrap;">${city}</div>
           </div>
       </div>`;

  const html = `
    <div style="display: flex; flex-direction: column; align-items: center; width: 1080px; height: 1080px; background: linear-gradient(155deg, #001730 0%, #002a56 48%, #004a8c 100%); font-family: 'Inter'; position: relative;">
      <div style="display: flex; position: absolute; top: 0; left: 0; right: 0; height: 10px; background: linear-gradient(90deg, #00ccff 0%, #7cf5ff 50%, #00ccff 100%);"></div>
      <div style="display: flex; position: absolute; top: 220px; left: -220px; width: 900px; height: 3px; background: rgba(0,204,255,0.25); transform: rotate(-18deg);"></div>
      <div style="display: flex; position: absolute; top: 260px; left: -220px; width: 700px; height: 2px; background: rgba(0,204,255,0.15); transform: rotate(-18deg);"></div>
      <div style="display: flex; position: absolute; bottom: 240px; right: -260px; width: 900px; height: 3px; background: rgba(0,204,255,0.22); transform: rotate(-18deg);"></div>
      <div style="display: flex; position: absolute; bottom: 200px; right: -260px; width: 700px; height: 2px; background: rgba(0,204,255,0.13); transform: rotate(-18deg);"></div>

      ${uhtLogoUri ? `<img src="${uhtLogoUri}" width="150" height="150" style="margin-top: 54px; object-fit: contain;" />` : `<div style="display: flex; margin-top: 74px; font-family: '${heading}'; font-size: 26px; color: #7cc4ef; letter-spacing: 7px;">ULTIMATE HOCKEY TOURNAMENTS</div>`}

      <div style="display: flex; margin-top: 40px; font-size: 30px; font-weight: 700; color: #7cc4ef; letter-spacing: 12px;">IT'S OFFICIAL</div>
      <div style="display: flex; margin-top: 10px; font-family: '${heading}'; font-size: 168px; color: #00ccff; line-height: 1;">WE'RE IN!</div>

      <div style="display: flex; width: 120px; height: 6px; border-radius: 3px; background: #00ccff; margin-top: 44px;"></div>

      <div style="display: flex; flex-direction: column; align-items: center; margin-top: 40px; padding: 0 80px;">
        <div style="display: flex; font-family: '${heading}'; font-size: ${teamSize}px; color: #ffffff; text-align: center; justify-content: center; line-height: 1.15;">${teamName.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</div>
        ${divChip ? `<div style="display: flex; margin-top: 20px; font-size: 34px; font-weight: 700; color: #7cc4ef; letter-spacing: 8px;">${divChip.toUpperCase()}</div>` : ''}
      </div>

      <div style="display: flex; flex-grow: 1;"></div>

      <div style="display: flex; justify-content: center; width: 100%; margin-bottom: 120px; padding: 0 70px;">
        ${eventBlock}
      </div>

      <div style="display: flex; position: absolute; bottom: 44px; left: 0; right: 0; align-items: center; justify-content: center; gap: 30px; font-size: 27px; font-weight: 700; color: rgba(255,255,255,0.72);">
        <div style="display: flex;">@ultimatehockeytournaments</div>
        <div style="display: flex; width: 7px; height: 7px; border-radius: 4px; background: #00ccff;"></div>
        <div style="display: flex;">#UHTHockey</div>
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
