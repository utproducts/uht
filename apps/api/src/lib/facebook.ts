/**
 * Auto-post champion photos to the UHT Facebook Page.
 * Needs two worker secrets (wrangler secret put):
 *   FACEBOOK_PAGE_ID    - the Page's numeric id
 *   FACEBOOK_PAGE_TOKEN - a long-lived Page access token with
 *                         pages_manage_posts + pages_read_engagement
 * Silently does nothing until both are set, so the photo upload never
 * breaks because Facebook is missing or down.
 */
export async function postChampionPhotoToFacebook(env: any, opts: {
  photoUrl: string;
  caption: string;
}): Promise<{ posted: boolean; id?: string; error?: string }> {
  const pageId = env.FACEBOOK_PAGE_ID;
  const token = env.FACEBOOK_PAGE_TOKEN;
  if (!pageId || !token) return { posted: false, error: 'facebook not configured' };
  try {
    const form = new URLSearchParams();
    form.set('url', opts.photoUrl);
    form.set('caption', opts.caption);
    form.set('access_token', token);
    const res = await fetch(`https://graph.facebook.com/v21.0/${pageId}/photos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
    const j = await res.json().catch(() => ({})) as any;
    if (res.ok && (j.id || j.post_id)) return { posted: true, id: j.post_id || j.id };
    console.error('Facebook post failed:', res.status, JSON.stringify(j).slice(0, 300));
    return { posted: false, error: j?.error?.message || `HTTP ${res.status}` };
  } catch (e: any) {
    console.error('Facebook post error:', e?.message);
    return { posted: false, error: e?.message || 'network' };
  }
}
