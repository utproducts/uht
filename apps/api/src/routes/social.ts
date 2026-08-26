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
async function loadFont(family: string, weight: number, italic = false): Promise<ArrayBuffer | null> {
  try {
    const axis = italic ? `ital,wght@1,${weight}` : `wght@${weight}`;
    const cssUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:${axis}`;
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

  const teamName = String(reg.display_name || 'Our Team').toUpperCase();
  const divChip = [reg.div_age, reg.div_level].filter(Boolean).join(' ').toUpperCase();
  const dates = fmtRange(reg.start_date, reg.end_date).toUpperCase();
  const city = `${reg.city}, ${reg.state}`.toUpperCase();
  // Full-width team band — auto-fit long names
  const teamSize = teamName.length > 42 ? 30 : teamName.length > 32 ? 36 : teamName.length > 22 ? 42 : 48;

  const [barlowSemiIt, barlowBoldIt, teko] = await Promise.all([
    loadFont('Barlow Condensed', 600, true),
    loadFont('Barlow Condensed', 700, true),
    loadFont('Teko', 700),
  ]);
  const fonts: any[] = [];
  if (barlowSemiIt) fonts.push({ name: 'Barlow Condensed', data: barlowSemiIt, weight: 600, style: 'italic' });
  if (barlowBoldIt) fonts.push({ name: 'Barlow Condensed', data: barlowBoldIt, weight: 700, style: 'italic' });
  if (teko) fonts.push({ name: 'Teko', data: teko, weight: 700, style: 'normal' });
  if (!fonts.length) return c.json({ success: false, error: 'Font load failed — try again' }, 503);

  // Load an image as a data URI. Our own URLs can't be fetched from inside the
  // worker (self-request), so /api/upload/images/* and /api/assets/* are read
  // straight from R2; external URLs are fetched normally. PNG/JPEG only.
  const imageToDataUri = async (url: string): Promise<string | null> => {
    try {
      let bytes: ArrayBuffer | null = null;
      let ctype = '';
      const mUpload = url.match(/\/api\/upload\/images\/([^?]+)/);
      const mAsset = url.match(/\/api\/assets\/([^?]+)/);
      const r2Key = url.startsWith('r2:') ? url.slice(3) : mUpload ? `images/${mUpload[1]}` : mAsset ? mAsset[1] : null;
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
      if (!bytes || !/image\/(png|jpe?g)/i.test(ctype) || bytes.byteLength > 4_000_000) return null;
      let bin = '';
      const u8 = new Uint8Array(bytes);
      for (let i = 0; i < u8.length; i += 8192) bin += String.fromCharCode(...u8.subarray(i, i + 8192));
      return `data:${ctype};base64,${btoa(bin)}`;
    } catch {
      return null;
    }
  };

  const [bgUri, eventLogoUri] = await Promise.all([
    imageToDataUri('r2:social/were-in-bg.png'),
    reg.logo_url ? imageToDataUri(String(reg.logo_url)) : Promise.resolve(null),
  ]);
  if (!bgUri) return c.json({ success: false, error: 'Template background missing' }, 503);

  const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');

  // Chad's designed template as the background; only the four dynamic pieces
  // are overlaid: team band, event logo, date, city (footer/hero are baked in)
  const html = `
    <div style="display: flex; width: 1080px; height: 1080px; position: relative; font-family: 'Barlow Condensed';">
      <img src="${bgUri}" width="1080" height="1080" style="position: absolute; top: 0; left: 0;" />

      <div style="display: flex; position: absolute; top: 508px; left: 40px; right: 40px; justify-content: center;">
        <div style="display: flex; font-size: ${teamSize}px; font-weight: 600; font-style: italic; color: #ffffff; letter-spacing: 5px; text-align: center; justify-content: center; text-shadow: 0 3px 10px rgba(0,0,0,0.85);">${esc(teamName)}${divChip && !teamName.includes(divChip) ? '' : ''}</div>
      </div>

      ${eventLogoUri
        ? `<div style="display: flex; position: absolute; top: 582px; left: 0; right: 0; justify-content: center;">
             <img src="${eventLogoUri}" width="264" height="264" style="border-radius: 26px; object-fit: contain;" />
           </div>`
        : ''}

      <div style="display: flex; position: absolute; top: ${eventLogoUri ? 852 : 700}px; left: 0; right: 0; justify-content: center;">
        <div style="display: flex; font-family: 'Teko'; font-size: ${eventLogoUri ? 92 : 120}px; font-weight: 700; color: #ffffff; letter-spacing: 4px; line-height: 1; text-shadow: 0 4px 12px rgba(0,0,0,0.9);">${esc(dates)}</div>
      </div>

      <div style="display: flex; position: absolute; top: ${eventLogoUri ? 952 : 830}px; left: 0; right: 0; justify-content: center;">
        <div style="display: flex; font-size: 37px; font-weight: 700; font-style: italic; color: #6ecbff; letter-spacing: 10px; text-shadow: 0 3px 10px rgba(0,0,0,0.85);">${esc(city)}</div>
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
