/**
 * One "Champions of the Event" multi-photo Facebook post per event.
 * Secrets (wrangler secret put): FACEBOOK_PAGE_ID, FACEBOOK_PAGE_TOKEN
 * (long-lived Page token with pages_manage_posts). Silently inert until set.
 */

async function fbForm(env: any, path: string, fields: Record<string, string>) {
  const form = new URLSearchParams(fields);
  form.set('access_token', env.FACEBOOK_PAGE_TOKEN);
  const res = await fetch(`https://graph.facebook.com/v21.0/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });
  const j = await res.json().catch(() => ({})) as any;
  return { ok: res.ok, j };
}

export async function postChampionsAlbum(env: any, opts: {
  message: string;
  photoUrls: string[];
}): Promise<{ posted: boolean; id?: string; error?: string }> {
  if (!env.FACEBOOK_PAGE_ID || !env.FACEBOOK_PAGE_TOKEN) return { posted: false, error: 'facebook not configured' };
  try {
    // 1. Upload each photo unpublished, collect media ids (FB caps a
    // multi-photo post around 10 attachments)
    const mediaIds: string[] = [];
    for (const url of opts.photoUrls.slice(0, 10)) {
      const { ok, j } = await fbForm(env, `${env.FACEBOOK_PAGE_ID}/photos`, { url, published: 'false' });
      if (ok && j.id) mediaIds.push(j.id);
      else console.error('FB photo upload failed:', JSON.stringify(j).slice(0, 200));
    }
    if (mediaIds.length === 0) return { posted: false, error: 'no photos uploaded' };
    // 2. One feed post carrying all of them
    const fields: Record<string, string> = { message: opts.message };
    mediaIds.forEach((id, i) => { fields[`attached_media[${i}]`] = JSON.stringify({ media_fbid: id }); });
    const { ok, j } = await fbForm(env, `${env.FACEBOOK_PAGE_ID}/feed`, fields);
    if (ok && j.id) return { posted: true, id: j.id };
    console.error('FB feed post failed:', JSON.stringify(j).slice(0, 300));
    return { posted: false, error: j?.error?.message || 'feed post failed' };
  } catch (e: any) {
    console.error('FB album error:', e?.message);
    return { posted: false, error: e?.message || 'network' };
  }
}

/**
 * Gather an event's champion photos, compose the message, post ONE album.
 * force=true posts whatever exists; otherwise only when every division
 * that has games is covered by a champion photo. Dedupes via
 * events.fb_champions_posted_at.
 */
export async function postEventChampionsIfReady(env: any, eventId: string, force = false):
  Promise<{ posted: boolean; reason?: string; covered?: number; needed?: number }> {
  const db = env.DB;
  const event = await db.prepare('SELECT id, name, COALESCE(is_test,0) as is_test, fb_champions_posted_at FROM events WHERE id = ?')
    .bind(eventId).first();
  if (!event || event.is_test) return { posted: false, reason: 'missing or test event' };
  if (event.fb_champions_posted_at && !force) return { posted: false, reason: 'already posted' };

  const photos = (await db.prepare(`
    SELECT ep.id, ep.team_id, COALESCE(t.schedule_name, t.name) as team_name,
      (SELECT TRIM(COALESCE(ed.age_group,'') || ' ' || COALESCE(ed.division_level,''))
       FROM event_registrations er LEFT JOIN event_divisions ed ON ed.id = er.event_division_id
       WHERE er.event_id = ep.event_id AND er.team_id = ep.team_id LIMIT 1) as division,
      ep.created_at
    FROM event_photos ep LEFT JOIN teams t ON t.id = ep.team_id
    WHERE ep.event_id = ? AND ep.kind = 'champion' AND ep.status = 'approved'
    ORDER BY ep.created_at ASC
  `).bind(eventId).all()).results || [];
  if (photos.length === 0) return { posted: false, reason: 'no champion photos yet' };

  // Latest photo per team wins (retakes replace)
  const byTeam = new Map<string, any>();
  for (const p of photos) byTeam.set(p.team_id || p.id, p);
  const picks = Array.from(byTeam.values());

  const needed = (await db.prepare(
    'SELECT COUNT(DISTINCT event_division_id) as n FROM games WHERE event_id = ? AND event_division_id IS NOT NULL'
  ).bind(eventId).first())?.n || 0;
  const covered = new Set(picks.map((p: any) => (p.division || '').trim()).filter(Boolean)).size;
  if (!force && needed > 0 && covered < needed) {
    return { posted: false, reason: 'divisions not all covered', covered, needed };
  }

  const lines = picks.map((p: any) => {
    const div = (p.division || '').trim();
    return div ? `${div}: ${p.team_name}` : `${p.team_name}`;
  });
  const message = `CHAMPIONS OF THE ${String(event.name).toUpperCase()}! \u{1F3C6}\n\nCongratulations to our champions:\n\n${lines.join('\n')}\n\nWhat a weekend of hockey. See everyone at the next one!\n#UltimateHockeyTournaments #YouthHockey`;

  const r = await postChampionsAlbum(env, {
    message,
    photoUrls: picks.map((p: any) => `https://uht.chad-157.workers.dev/api/photos/file/${p.id}`),
  });
  if (r.posted) {
    await db.prepare("UPDATE events SET fb_champions_posted_at = datetime('now') WHERE id = ?").bind(eventId).run();
    return { posted: true };
  }
  return { posted: false, reason: r.error };
}
