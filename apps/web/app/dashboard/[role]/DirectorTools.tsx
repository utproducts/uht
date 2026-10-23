'use client';

/*
  DIRECTOR PORTAL (website) - mirrors the app's director toolkit card for
  card: Team Arrivals, Score Management, Locker Rooms, Championship Photos,
  Rink Addresses, Team Codes, Scorekeeper PINs, Venue Setup, plus the event
  PIN claim box so a web-only director never needs the app to get started.
  Every tool uses the exact same API endpoints the app screens use.
*/

import { useState, useEffect, useCallback, useRef } from 'react';

const API = 'https://uht.chad-157.workers.dev/api';
const SCORING_URL = 'https://ultimatetournaments.com/scoring';

function hdrs(): Record<string, string> {
  const h: Record<string, string> = { 'X-Dev-Bypass': 'true', 'Content-Type': 'application/json' };
  try {
    const t = localStorage.getItem('uht_token');
    if (t) h['Authorization'] = `Bearer ${t}`;
  } catch {}
  return h;
}

interface DirEvent { id: string; name: string; start_date?: string; end_date?: string }

function useDirectorEvents() {
  const [events, setEvents] = useState<DirEvent[]>([]);
  const [selected, setSelected] = useState<DirEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const reload = useCallback(() => {
    setLoading(true);
    fetch(`${API}/scoring/director-events`, { headers: hdrs() })
      .then(r => r.json())
      .then((j: any) => {
        if (j.success) {
          setEvents(j.data || []);
          setSelected((prev: DirEvent | null) => prev && (j.data || []).some((e: DirEvent) => e.id === prev.id) ? prev : (j.data?.[0] || null));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { reload(); }, [reload]);
  return { events, selected, setSelected, loading, reload };
}

function EventPills({ events, selected, onSelect }: { events: DirEvent[]; selected: DirEvent | null; onSelect: (e: DirEvent) => void }) {
  if (events.length <= 1) return null;
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 mb-4">
      {events.map(ev => (
        <button key={ev.id} onClick={() => onSelect(ev)}
          className={`px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap border transition ${selected?.id === ev.id ? 'bg-[#003e79] text-white border-[#003e79]' : 'bg-white text-[#3d3d3d] border-[#e8e8ed] hover:border-[#003e79]/40'}`}>
          {ev.name}
        </button>
      ))}
    </div>
  );
}

function copyText(text: string, note?: string) {
  try { navigator.clipboard.writeText(text); } catch {}
  if (note) alert(note);
}

async function shareText(message: string) {
  try {
    if (navigator.share) { await navigator.share({ text: message }); return; }
  } catch { return; }
  copyText(message, 'Copied to clipboard - paste it anywhere to share.');
}

function Spinner() {
  return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#003e79]" /></div>;
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-[#86868b] text-center py-10">{children}</p>;
}

/* ───────────────────────── PIN claim ───────────────────────── */
export function PinClaimBox({ onClaimed }: { onClaimed: () => void }) {
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async () => {
    const p = pin.trim();
    if (!p) { setError('Enter the event PIN from your tournament director.'); return; }
    setBusy(true); setError('');
    try {
      const r = await fetch(`${API}/director/claim`, { method: 'POST', headers: hdrs(), body: JSON.stringify({ pin: p }) });
      const j = await r.json();
      if (j.success) { setPin(''); onClaimed(); }
      else setError(j.error || 'That PIN did not match an event. Check it and try again.');
    } catch { setError('Could not reach the server - try again.'); }
    setBusy(false);
  };
  return (
    <div className="bg-white rounded-2xl border border-[#e8e8ed] p-6 shadow-[0_1px_10px_-4px_rgba(0,0,0,0.06)] max-w-md">
      <h3 className="text-lg font-bold text-[#1d1d1f]">Claim your event</h3>
      <p className="text-sm text-[#6e6e73] mt-1 mb-4">Enter the event PIN from Ultimate Tournaments to unlock your director tools for that event.</p>
      <div className="flex gap-2">
        <input value={pin} onChange={e => setPin(e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()}
          placeholder="Event PIN" inputMode="numeric"
          className="flex-1 px-4 py-2.5 rounded-xl border border-[#e8e8ed] text-base tracking-widest font-bold outline-none focus:border-[#003e79]" />
        <button onClick={submit} disabled={busy}
          className="px-5 py-2.5 rounded-xl bg-[#003e79] text-white text-sm font-bold hover:bg-[#002d5a] disabled:opacity-50">
          {busy ? '...' : 'Unlock'}
        </button>
      </div>
      {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
    </div>
  );
}

/* ───────────────────────── 1. Team Arrivals ───────────────────────── */
function ArrivalsTool() {
  const { events, selected, setSelected, loading } = useDirectorEvents();
  const [teams, setTeams] = useState<any[]>([]);
  const [contacts, setContacts] = useState<Record<string, any[]>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!selected) return;
    try {
      const res = await fetch(`${API}/registrations/admin/checkin/${selected.id}`, { headers: hdrs() });
      const json = await res.json();
      if (json.success) {
        setTeams(json.data.teams || json.data || []);
        setContacts(json.data.contacts || {});
      }
    } catch {}
  }, [selected]);
  useEffect(() => { load(); }, [load]);

  const toggle = async (reg: any) => {
    setBusy(reg.id);
    try {
      await fetch(`${API}/registrations/admin/checkin/${selected!.id}/toggle/${reg.id}`, { method: 'POST', headers: hdrs() });
      await load();
    } catch {}
    setBusy(null);
  };

  const checkedCount = teams.filter(t => t.checked_in_at).length;
  const AGE_ORDER = ['mite', 'squirt', 'pee wee', 'peewee', 'bantam', 'midget', 'girls'];
  const ageKey = (label: string) => { const l = label.toLowerCase(); const i = AGE_ORDER.findIndex(a => l.startsWith(a)); return i === -1 ? 99 : i; };
  const byAge: Record<string, any[]> = {};
  for (const t of teams) { const k = t.age_group || 'Other'; (byAge[k] = byAge[k] || []).push(t); }
  const ageEntries = Object.entries(byAge).sort((a, b) => ageKey(a[0]) - ageKey(b[0]) || a[0].localeCompare(b[0]));

  if (loading) return <Spinner />;
  return (
    <div>
      <p className="text-sm text-[#6e6e73] mb-4">{checkedCount} of {teams.length} teams arrived - per-game check-ins are on each game in Score Management</p>
      <EventPills events={events} selected={selected} onSelect={setSelected} />
      {ageEntries.map(([age, list]) => (
        <div key={age} className="mb-5">
          <p className="text-xs font-bold text-[#86868b] uppercase tracking-widest mb-2">{age}</p>
          <div className="space-y-2">
            {list.map(t => (
              <div key={t.id} className={`bg-white rounded-xl border p-4 flex items-start gap-3 ${t.missing_roster ? 'border-red-300' : 'border-[#e8e8ed]'}`}>
                <button onClick={() => toggle(t)} disabled={busy === t.id}
                  className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 border-2 transition ${t.checked_in_at ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-[#d2d2d7] text-[#9aa7ba] hover:border-[#003e79]'}`}>
                  {busy === t.id ? '…' : t.checked_in_at ? '✓' : ''}
                </button>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-[#1d1d1f] truncate">{t.display_name || t.team_name}</p>
                  <p className="text-xs text-[#86868b]">{t.checked_in_at ? `Checked in ${String(t.checked_in_at).slice(5, 16)}` : 'Not checked in'} · {t.roster_count ?? 0} players{t.missing_roster ? ' · NO ROSTER' : ''}</p>
                  {(contacts[t.team_id] || []).length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {(contacts[t.team_id] || []).slice(0, 3).map((c0: any, ci: number) => (
                        <a key={ci} href={`tel:${String(c0.phone).replace(/[^0-9+]/g, '')}`}
                          className="text-[11px] font-semibold text-[#003e79] bg-[#f0f7ff] rounded-full px-2.5 py-1">
                          {c0.name}{c0.role === 'Manager' ? ' (M)' : ''} · {c0.phone}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
      {teams.length === 0 && <Empty>No approved teams yet.</Empty>}
    </div>
  );
}

/* ───────────────────────── 2. Scorekeeper PINs ───────────────────────── */
function PinsTool() {
  const { events, selected, setSelected, loading } = useDirectorEvents();
  const [pins, setPins] = useState<any[]>([]);
  useEffect(() => {
    if (!selected) return;
    fetch(`${API}/scoring/events/${selected.id}/pins`, { headers: hdrs() })
      .then(r => r.json()).then((j: any) => { if (j.success) setPins(j.data || []); }).catch(() => {});
  }, [selected]);

  if (loading) return <Spinner />;
  return (
    <div>
      <EventPills events={events} selected={selected} onSelect={setSelected} />
      <button onClick={() => shareText(`UHT scorekeeper console: ${SCORING_URL} - enter your PIN to see your games.`)}
        className="w-full bg-white rounded-xl border border-[#e8e8ed] p-4 flex items-center gap-3 text-left hover:border-[#003e79]/40 mb-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-[#1d1d1f]">Scoring page</p>
          <p className="text-xs text-[#0a7cc9] truncate">{SCORING_URL}</p>
        </div>
        <span className="text-xs font-bold text-[#003e79]">SHARE</span>
      </button>
      <div className="space-y-2">
        {pins.map(p => (
          <div key={p.id} className="bg-white rounded-xl border border-[#e8e8ed] p-4 flex items-center gap-3">
            <button className="flex-1 text-left" onClick={() => copyText(String(p.pin_code), `PIN ${p.pin_code} copied.`)}>
              <p className="text-xs font-semibold text-[#86868b]">{p.label || p.rink_name || 'Event PIN'}</p>
              <p className="text-2xl font-black text-[#003e79] tracking-[0.3em]">{p.pin_code}</p>
            </button>
            <button onClick={() => copyText(String(p.pin_code), `PIN ${p.pin_code} copied.`)}
              className="px-3 py-2 rounded-lg bg-[#f0f7ff] text-[#003e79] text-xs font-bold">Copy</button>
            <button onClick={() => shareText(`Scorekeeping for ${selected?.name || 'the event'} (${p.label || p.rink_name || 'the event'}):\n\n1. Open ${SCORING_URL}\n2. Enter PIN: ${p.pin_code}\n\nThat opens your assigned games.`)}
              className="px-3 py-2 rounded-lg bg-[#e8e8ed] text-[#3d3d3d] text-xs font-bold">Share</button>
          </div>
        ))}
      </div>
      {pins.length === 0 && <Empty>No scorekeeper PINs set for this event yet. PINs are created in the admin panel under Scorekeepers.</Empty>}
    </div>
  );
}

/* ───────────────────────── 3. Championship Photos ───────────────────────── */
function ChampionsTool() {
  const { events, selected, setSelected, loading } = useDirectorEvents();
  const [teams, setTeams] = useState<any[]>([]);
  const [posted, setPosted] = useState<any[]>([]);
  const [uploading, setUploading] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const pendingTeam = useRef<any>(null);

  const load = useCallback(() => {
    if (!selected) return;
    fetch(`${API}/scoring/events/${selected.id}/standings`, { headers: hdrs() })
      .then(r => r.json())
      .then((j: any) => { if (j.success) setTeams((j.data || []).filter((r: any) => !String(r.team_id).startsWith('ph:'))); })
      .catch(() => {});
    fetch(`${API}/photos/events/${selected.id}/photos?kind=champion`)
      .then(r => r.json())
      .then((j: any) => { if (j.success) setPosted(j.data.photos || []); })
      .catch(() => {});
  }, [selected]);
  useEffect(load, [load]);

  // Same watermark the app applies: UHT logo stamped bottom-right
  const watermarkToJpegB64 = (file: File): Promise<string> => new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const MAX = 1600;
      const scale = Math.min(1, MAX / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const logo = new Image();
      logo.onload = () => {
        const lw = Math.round(canvas.width * 0.18);
        const lh = Math.round(lw * (logo.height / logo.width));
        const pad = Math.round(canvas.width * 0.025);
        ctx.globalAlpha = 0.9;
        ctx.drawImage(logo, canvas.width - lw - pad, canvas.height - lh - pad, lw, lh);
        ctx.globalAlpha = 1;
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL('image/jpeg', 0.82).split(',')[1]);
      };
      logo.onerror = () => { URL.revokeObjectURL(url); resolve(canvas.toDataURL('image/jpeg', 0.82).split(',')[1]); };
      logo.src = '/uht-logo.png';
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read that image')); };
    img.src = url;
  });

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const team = pendingTeam.current;
    e.target.value = '';
    if (!file || !team || !selected) return;
    setUploading(team.team_id);
    try {
      const b64 = await watermarkToJpegB64(file);
      const res = await fetch(`${API}/photos/events/${selected.id}/photos`, {
        method: 'POST', headers: hdrs(),
        body: JSON.stringify({ data: b64, mimeType: 'image/jpeg', kind: 'champion', teamId: team.team_id }),
      });
      const json = await res.json();
      if (json.success) { load(); alert(`${team.team_name} champions photo is live in the gallery.`); }
      else alert(json.error || 'Upload failed - please try again.');
    } catch { alert('Upload failed - please try again.'); }
    setUploading(null);
  };

  const postedTeamIds = new Set(posted.map(p => p.team_id));
  if (loading) return <Spinner />;
  return (
    <div>
      <p className="text-sm text-[#6e6e73] mb-4">Click the winning team, then pick their photo. The UHT logo is stamped automatically.</p>
      <EventPills events={events} selected={selected} onSelect={setSelected} />
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
      <div className="space-y-2">
        {teams.map((t: any) => (
          <button key={t.team_id} disabled={!!uploading}
            onClick={() => { pendingTeam.current = t; fileRef.current?.click(); }}
            className="w-full bg-white rounded-xl border border-[#e8e8ed] p-4 flex items-center gap-3 text-left hover:border-[#b8860b]/50 disabled:opacity-60">
            <span className="text-xl">🏆</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-[#1d1d1f] truncate">{t.team_name}</p>
              <p className="text-xs text-[#86868b]">{[t.age_group, t.division_level].filter(Boolean).join(' ')}</p>
            </div>
            {uploading === t.team_id ? (
              <span className="text-xs font-bold text-[#86868b]">Uploading…</span>
            ) : postedTeamIds.has(t.team_id) ? (
              <span className="text-[10px] font-black tracking-wider text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2.5 py-1">POSTED</span>
            ) : null}
          </button>
        ))}
      </div>
      {teams.length === 0 && <Empty>Teams appear once the schedule is uploaded.</Empty>}
    </div>
  );
}

/* ───────────────────────── 4. Rink Addresses ───────────────────────── */
function RinksTool() {
  const { events, selected, setSelected, loading } = useDirectorEvents();
  const [venues, setVenues] = useState<any[]>([]);
  useEffect(() => {
    if (!selected) return;
    fetch(`${API}/events/${selected.id}`)
      .then(r => r.json()).then((j: any) => { if (j.success) setVenues(j.data.venues || []); }).catch(() => {});
  }, [selected]);

  if (loading) return <Spinner />;
  return (
    <div>
      <EventPills events={events} selected={selected} onSelect={setSelected} />
      <div className="grid gap-3 sm:grid-cols-2">
        {venues.map((v: any) => {
          const addr = [v.address, v.city, v.state].filter(Boolean).join(', ');
          const maps = `https://maps.google.com/?q=${encodeURIComponent(`${v.venue_name} ${addr}`)}`;
          return (
            <div key={v.venue_id || v.venue_name} className="bg-white rounded-xl border border-[#e8e8ed] p-4">
              <p className="text-sm font-bold text-[#1d1d1f]">{v.venue_name}</p>
              <p className="text-xs text-[#86868b] mt-0.5">{addr || 'No address on file'}</p>
              {v.rinks?.length ? <p className="text-xs text-[#0a7cc9] mt-1">{v.rinks.map((r: any) => r.name).join('  ·  ')}</p> : null}
              <div className="flex gap-2 mt-3">
                <button onClick={() => shareText(`${v.venue_name}\n${addr}\n${maps}`)}
                  className="px-3 py-1.5 rounded-lg bg-[#003e79] text-white text-xs font-bold">Share</button>
                <button onClick={() => copyText(`${v.venue_name} - ${addr}`, 'Address copied.')}
                  className="px-3 py-1.5 rounded-lg bg-[#f0f7ff] text-[#003e79] text-xs font-bold">Copy</button>
                <a href={maps} target="_blank" rel="noreferrer"
                  className="px-3 py-1.5 rounded-lg bg-[#e8e8ed] text-[#3d3d3d] text-xs font-bold">Map</a>
              </div>
            </div>
          );
        })}
      </div>
      {venues.length === 0 && <Empty>No venues attached to this event yet.</Empty>}
    </div>
  );
}

/* ───────────────────────── 5. Team Codes ───────────────────────── */
function TeamCodesTool() {
  const { events, selected, setSelected, loading } = useDirectorEvents();
  const [rows, setRows] = useState<any[]>([]);
  const [codeMode, setCodeMode] = useState<'parent' | 'coach'>('parent');
  const codeFor = (r: any) => codeMode === 'parent' ? (r.parent_invite_code || null) : (r.invite_code || null);

  useEffect(() => {
    if (!selected) return;
    fetch(`${API}/scoring/events/${selected.id}/team-codes`, { headers: hdrs() })
      .then(r => r.json()).then((j: any) => { if (j.success) setRows(j.data || []); }).catch(() => {});
  }, [selected]);

  const divLabel = (r: any) => {
    if (r.ed_age) return [r.ed_age, r.ed_level].filter(Boolean).join(' ');
    return String(r.raw_age || 'Other').replace(/\s*\([^)]*\)/g, '').trim() || 'Other';
  };
  const AGE_ORDER = ['mite', 'squirt', 'pee wee', 'peewee', 'bantam', 'midget', 'girls'];
  const ageKey = (label: string) => { const l = label.toLowerCase(); const i = AGE_ORDER.findIndex(a => l.startsWith(a)); return i === -1 ? 999 : i; };
  const byDiv: Record<string, any[]> = {};
  for (const r of rows) { const k = divLabel(r); (byDiv[k] = byDiv[k] || []).push(r); }
  const divEntries = Object.entries(byDiv).sort((a, b) => ageKey(a[0]) - ageKey(b[0]) || a[0].localeCompare(b[0]));

  if (loading) return <Spinner />;
  return (
    <div>
      <EventPills events={events} selected={selected} onSelect={setSelected} />
      <div className="flex gap-2 mb-4">
        {([['parent', 'Parent Codes'], ['coach', 'Coach Codes']] as const).map(([mode, label]) => (
          <button key={mode} onClick={() => setCodeMode(mode)}
            className={`px-4 py-2 rounded-full text-sm font-semibold border transition ${codeMode === mode ? 'bg-[#003e79] text-white border-[#003e79]' : 'bg-white text-[#3d3d3d] border-[#e8e8ed]'}`}>
            {label}
          </button>
        ))}
      </div>
      <p className="text-xs text-[#86868b] mb-4">{codeMode === 'parent' ? 'Parent codes let families follow a team. Click a code to copy it.' : 'Coach codes let staff join a team. Click a code to copy it.'}</p>
      <div className="space-y-4">
        {divEntries.map(([div, list]) => (
          <div key={div} className="bg-white rounded-xl border border-[#e8e8ed] overflow-hidden">
            <div className="px-4 py-3 bg-[#f5f5f7] flex items-center justify-between">
              <p className="text-sm font-bold text-[#1d1d1f]">{div}</p>
              <p className="text-xs text-[#86868b]">{list.length} team{list.length !== 1 ? 's' : ''}</p>
            </div>
            {list.sort((a: any, b: any) => String(a.team_name).localeCompare(String(b.team_name))).map((r: any, i: number) => (
              <button key={`${r.team_name}-${i}`} onClick={() => codeFor(r) && copyText(codeFor(r), `${r.team_name} ${codeMode} code ${codeFor(r)} copied.`)}
                className="w-full px-4 py-3 flex items-center gap-3 border-t border-[#f0f0f2] text-left hover:bg-[#fafafa]">
                <span className="text-sm font-semibold text-[#1d1d1f] flex-1 truncate">{r.team_name}</span>
                {codeFor(r) ? (
                  <span className={`text-sm font-black tracking-[0.2em] rounded-lg px-3 py-1 ${codeMode === 'coach' ? 'bg-amber-50 text-amber-800 border border-amber-200' : 'bg-[#f0f7ff] text-[#003e79] border border-[#d5e5f5]'}`}>{codeFor(r)}</span>
                ) : (
                  <span className="text-xs text-[#86868b]">no code</span>
                )}
              </button>
            ))}
          </div>
        ))}
      </div>
      {rows.length === 0 && <Empty>No approved teams yet.</Empty>}
    </div>
  );
}

/* ───────────────────────── 6. Locker Rooms ───────────────────────── */
function LockerRoomsTool() {
  const { events, selected, setSelected, loading } = useDirectorEvents();
  const [games, setGames] = useState<any[]>([]);
  const [venueRooms, setVenueRooms] = useState<Record<string, string[]>>({});
  const [rinkRooms, setRinkRooms] = useState<Record<string, string[]>>({});
  const [selVenue, setSelVenue] = useState<string | null>(null);
  const [selRink, setSelRink] = useState<string | null>(null);
  const [selDay, setSelDay] = useState<string | null>(null);
  const [sheet, setSheet] = useState<{ game: any; side: 'home' | 'away' } | null>(null);
  const [pushing, setPushing] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!selected) return;
    fetch(`${API}/scoring/events/${selected.id}/games`)
      .then(r => r.json()).then((j: any) => { if (j.success) setGames(j.data || []); }).catch(() => {});
    fetch(`${API}/scoring/events/${selected.id}/locker-rooms`)
      .then(r => r.json())
      .then((j: any) => {
        if (!j.success) return;
        const vmap: Record<string, string[]> = {}; const rmap: Record<string, string[]> = {};
        for (const lr of j.data || []) {
          if (lr.venue_id) { (vmap[lr.venue_id] = vmap[lr.venue_id] || []).includes(lr.name) || vmap[lr.venue_id].push(lr.name); }
          if (lr.rink_id) { (rmap[lr.rink_id] = rmap[lr.rink_id] || []).includes(lr.name) || rmap[lr.rink_id].push(lr.name); }
        }
        setVenueRooms(vmap); setRinkRooms(rmap);
      }).catch(() => {});
  }, [selected]);
  useEffect(() => { setSelVenue(null); setSelRink(null); setSelDay(null); load(); }, [load]);

  const venues = Array.from(new Map(games.filter(g => g.venue_id).map(g => [g.venue_id, g.venue_name])).entries());
  const activeVenue = selVenue || (venues[0]?.[0] ?? null);
  const rinks = Array.from(new Map(games.filter(g => g.venue_id === activeVenue && g.rink_id).map(g => [g.rink_id, g.rink_name])).entries());
  const activeRink = selRink && rinks.some(r => r[0] === selRink) ? selRink : (rinks[0]?.[0] ?? null);
  const rinkGames = games.filter(g => g.venue_id === activeVenue && g.rink_id === activeRink);
  const days = Array.from(new Set(rinkGames.map(g => String(g.start_time || '').slice(0, 10)).filter(Boolean))).sort();
  const today = new Date().toISOString().slice(0, 10);
  const activeDay = selDay && days.includes(selDay) ? selDay : (days.includes(today) ? today : days[0] || null);
  const dayGames = rinkGames.filter(g => String(g.start_time || '').slice(0, 10) === activeDay)
    .sort((a, b) => String(a.start_time).localeCompare(String(b.start_time)));

  const fmtTime = (t: string) => {
    const d = new Date(String(t).includes(' ') ? String(t).replace(' ', 'T') : t);
    return isNaN(d.getTime()) ? '' : d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };
  const fmtDay = (iso: string) => {
    const d = new Date(iso + 'T12:00:00');
    return isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const saveRoom = async (game: any, side: 'home' | 'away', room: string | null) => {
    setSheet(null);
    const body = {
      home_locker_room: side === 'home' ? room : (game.home_locker_room || null),
      away_locker_room: side === 'away' ? room : (game.away_locker_room || null),
    };
    setGames(prev => prev.map(g => g.id === game.id ? { ...g, [`${side}_locker_room`]: room } : g));
    try {
      await fetch(`${API}/push/games/${game.id}/locker-rooms`, { method: 'PATCH', headers: hdrs(), body: JSON.stringify(body) });
    } catch { alert('Save failed - please try again.'); load(); }
  };

  const sendPush = async (game: any) => {
    setPushing(game.id);
    try {
      const res = await fetch(`${API}/push/send-locker-room`, { method: 'POST', headers: hdrs(), body: JSON.stringify({ game_id: game.id }) });
      const json = await res.json();
      alert(json.success ? `Locker rooms sent to ${json.data?.sent ?? 0} device(s).` : (json.error || 'Push failed - try again.'));
    } catch { alert('Push failed - try again.'); }
    setPushing(null);
  };

  const rinkScoped = activeRink ? (rinkRooms[activeRink] || []) : [];
  const roomsForVenue = rinkScoped.length > 0 ? rinkScoped : (activeVenue ? (venueRooms[activeVenue] || []) : []);
  const soon = games.filter((g: any) => {
    if (g.status !== 'scheduled' || (g.home_locker_room && g.away_locker_room)) return false;
    const d = new Date(String(g.start_time || '').replace(' ', 'T'));
    if (isNaN(d.getTime())) return false;
    const mins = (d.getTime() - Date.now()) / 60000;
    return mins > 0 && mins <= 120;
  });

  const FilterRow = ({ label, items, active, onPick }: { label: string; items: [any, any][]; active: any; onPick: (id: any) => void }) => (
    items.length > 1 ? (
      <div className="flex items-center gap-2 mb-2 overflow-x-auto">
        <span className="text-[10px] font-bold text-[#86868b] tracking-widest shrink-0">{label}</span>
        {items.map(([id, name]) => (
          <button key={id} onClick={() => onPick(id)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap border ${active === id ? 'bg-[#003e79] text-white border-[#003e79]' : 'bg-white text-[#3d3d3d] border-[#e8e8ed]'}`}>
            {name}
          </button>
        ))}
      </div>
    ) : null
  );

  if (loading) return <Spinner />;
  return (
    <div>
      {soon.length > 0 && (
        <div className="bg-red-600 text-white text-sm font-bold rounded-xl px-4 py-3 mb-4">
          {soon.length} game{soon.length !== 1 ? 's' : ''} within 2 hours {soon.length !== 1 ? 'have' : 'has'} no locker rooms - assign now
        </div>
      )}
      <EventPills events={events} selected={selected} onSelect={setSelected} />
      <FilterRow label="VENUE" items={venues as [any, any][]} active={activeVenue} onPick={id => { setSelVenue(id); setSelRink(null); }} />
      <FilterRow label="RINK" items={rinks as [any, any][]} active={activeRink} onPick={id => setSelRink(id)} />
      <FilterRow label="DAY" items={days.map(d => [d, fmtDay(d)]) as [any, any][]} active={activeDay} onPick={id => setSelDay(id)} />

      <div className="space-y-3 mt-3">
        {dayGames.map(g => (
          <div key={g.id} className="bg-white rounded-xl border border-[#e8e8ed] p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-bold text-[#1d1d1f]">{fmtTime(g.start_time)} · #{g.game_number}</p>
              {(g.home_locker_room || g.away_locker_room) ? (
                <button onClick={() => sendPush(g)} disabled={pushing === g.id}
                  className="px-3 py-1.5 rounded-lg bg-[#003e79] text-white text-xs font-bold disabled:opacity-50">
                  {pushing === g.id ? 'Sending…' : 'Push'}
                </button>
              ) : null}
            </div>
            {(['home', 'away'] as const).map(side => (
              <div key={side} className="flex items-center gap-2 py-1.5 border-t border-[#f0f0f2]">
                <span className="text-[10px] font-bold text-[#86868b] w-11 shrink-0">{side.toUpperCase()}</span>
                <span className="text-sm text-[#1d1d1f] flex-1 truncate">{side === 'home' ? (g.home_team_name || 'TBD') : (g.away_team_name || 'TBD')}</span>
                <button onClick={() => setSheet({ game: g, side })}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${(side === 'home' ? g.home_locker_room : g.away_locker_room) ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-[#f5f5f7] text-[#6e6e73] border-[#e8e8ed]'}`}>
                  {(side === 'home' ? g.home_locker_room : g.away_locker_room) || 'Assign'}
                </button>
              </div>
            ))}
          </div>
        ))}
      </div>
      {dayGames.length === 0 && <Empty>No games at this rink{activeDay ? ' on this day' : ''}.</Empty>}

      {sheet && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center" onClick={() => setSheet(null)}>
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm p-5" onClick={e => e.stopPropagation()}>
            <p className="text-sm font-bold text-[#1d1d1f] mb-3">
              {sheet.side === 'home' ? 'Home' : 'Away'} locker - {sheet.side === 'home' ? (sheet.game.home_team_name || 'TBD') : (sheet.game.away_team_name || 'TBD')}
            </p>
            <div className="max-h-72 overflow-y-auto space-y-1">
              {roomsForVenue.map(room => (
                <button key={room} onClick={() => saveRoom(sheet.game, sheet.side, room)}
                  className="w-full px-3 py-2.5 rounded-lg text-left text-sm font-semibold text-[#1d1d1f] hover:bg-[#f0f7ff]">{room}</button>
              ))}
              {roomsForVenue.length === 0 && (
                <p className="text-xs text-[#86868b] p-2">No locker rooms defined for this venue yet. Add them in Venue Setup, or use Custom below.</p>
              )}
            </div>
            <button onClick={() => { const text = window.prompt('Type the locker room name'); if (text && text.trim()) saveRoom(sheet.game, sheet.side, text.trim()); }}
              className="w-full px-3 py-2.5 rounded-lg text-left text-sm font-semibold text-[#003e79] hover:bg-[#f0f7ff]">Custom…</button>
            <button onClick={() => saveRoom(sheet.game, sheet.side, null)}
              className="w-full px-3 py-2.5 rounded-lg text-left text-sm font-semibold text-red-600 hover:bg-red-50">Clear assignment</button>
            <button onClick={() => setSheet(null)}
              className="w-full mt-2 py-2.5 rounded-xl bg-[#e8e8ed] text-sm font-bold text-[#3d3d3d]">Done</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ───────────────────────── 7. Venue Setup ───────────────────────── */
function VenueSetupTool() {
  const { events, selected, setSelected, loading } = useDirectorEvents();
  const [games, setGames] = useState<any[]>([]);
  const [rooms, setRooms] = useState<Record<string, any[]>>({});
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!selected) return;
    fetch(`${API}/scoring/events/${selected.id}/games`)
      .then(r => r.json()).then((j: any) => { if (j.success) setGames(j.data || []); }).catch(() => {});
  }, [selected]);

  const venues: { id: string; name: string; rinks: { id: string; name: string }[] }[] = [];
  for (const g of games) {
    if (!g.venue_id || !g.rink_id) continue;
    let v = venues.find(x => x.id === g.venue_id);
    if (!v) { v = { id: g.venue_id, name: g.venue_name, rinks: [] }; venues.push(v); }
    if (!v.rinks.some(r => r.id === g.rink_id)) v.rinks.push({ id: g.rink_id, name: g.rink_name });
  }

  const loadRooms = useCallback(async (rinkId: string) => {
    try {
      const res = await fetch(`${API}/director/rinks/${rinkId}/locker-rooms`, { headers: hdrs() });
      const json = await res.json();
      if (json.success) setRooms(prev => ({ ...prev, [rinkId]: json.data || [] }));
    } catch {}
  }, []);
  useEffect(() => {
    for (const v of venues) for (const r of v.rinks) if (!(r.id in rooms)) loadRooms(r.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [games]);

  const addRoom = async (rink: { id: string; name: string }) => {
    const text = window.prompt(`Add locker room - ${rink.name}\nRoom name (e.g. Room A, Locker 3)`);
    const name = (text || '').trim();
    if (!name) return;
    setBusy(rink.id);
    try {
      const res = await fetch(`${API}/director/rinks/${rink.id}/locker-rooms`, { method: 'POST', headers: hdrs(), body: JSON.stringify({ name }) });
      const json = await res.json();
      if (!json.success) alert(json.error || 'Could not add - try again.');
      await loadRooms(rink.id);
    } catch { alert('Could not add - try again.'); }
    setBusy(null);
  };

  const removeRoom = async (rinkId: string, room: any) => {
    if (!window.confirm(`Delete "${room.name}"?`)) return;
    try {
      const res = await fetch(`${API}/director/locker-rooms/${room.id}`, { method: 'DELETE', headers: hdrs() });
      const json = await res.json();
      if (!json.success) alert(json.error || 'Could not delete - it may be assigned to a game.');
      await loadRooms(rinkId);
    } catch {}
  };

  if (loading) return <Spinner />;
  return (
    <div>
      <p className="text-sm text-[#6e6e73] mb-4">Locker rooms you add here sync to the app too.</p>
      <EventPills events={events} selected={selected} onSelect={setSelected} />
      <div className="space-y-4">
        {venues.map(v => (
          <div key={v.id} className="bg-white rounded-xl border border-[#e8e8ed] overflow-hidden">
            <div className="px-4 py-3 bg-[#f5f5f7]"><p className="text-sm font-bold text-[#1d1d1f]">{v.name}</p></div>
            {v.rinks.map(r => (
              <div key={r.id} className="px-4 py-3 border-t border-[#f0f0f2]">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-semibold text-[#1d1d1f]">{r.name}</p>
                  <button onClick={() => addRoom(r)} disabled={busy === r.id}
                    className="px-3 py-1.5 rounded-lg bg-[#003e79] text-white text-xs font-bold disabled:opacity-50">+ Add Room</button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(rooms[r.id] || []).map(room => (
                    <button key={room.id} onClick={() => removeRoom(r.id, room)}
                      className="px-3 py-1.5 rounded-full bg-[#f0f7ff] border border-[#d5e5f5] text-xs font-semibold text-[#003e79] hover:border-red-300 hover:text-red-600">
                      {room.name} ✕
                    </button>
                  ))}
                  {(rooms[r.id] || []).length === 0 && <span className="text-xs text-[#86868b]">No locker rooms yet</span>}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
      {venues.length === 0 && <Empty>Rinks appear once the schedule is uploaded.</Empty>}
    </div>
  );
}

/* ───────────────────────── Portal (card grid + routing) ───────────────────────── */
const TOOLS: Array<{ key: string; label: string; sub: string }> = [
  { key: 'arrivals', label: 'Team Arrivals', sub: 'Mark teams arrived; game check-ins live on each game' },
  { key: 'scores', label: 'Score Management', sub: 'Fix scores and run games' },
  { key: 'lockers', label: 'Locker Rooms', sub: 'Assign rooms by rink and day' },
  { key: 'champions', label: 'Championship Photos', sub: 'Post the winners' },
  { key: 'rinks', label: 'Rink Addresses', sub: 'Share directions instantly' },
  { key: 'codes', label: 'Team Codes', sub: 'Help parents follow teams' },
  { key: 'pins', label: 'Scorekeeper PIN', sub: 'Look up any rink PIN' },
  { key: 'venues', label: 'Venue Setup', sub: 'Add locker rooms to rinks' },
];

const TOOL_VIEWS: Record<string, () => JSX.Element> = {
  arrivals: ArrivalsTool,
  lockers: LockerRoomsTool,
  champions: ChampionsTool,
  rinks: RinksTool,
  codes: TeamCodesTool,
  pins: PinsTool,
  venues: VenueSetupTool,
};

export default function DirectorPortal({ ScoreManagement }: { ScoreManagement: () => JSX.Element }) {
  const { events, loading, reload } = useDirectorEvents();
  const [tool, setTool] = useState<string | null>(null);

  if (loading) return <Spinner />;

  if (events.length === 0) {
    return (
      <div className="space-y-6">
        <PinClaimBox onClaimed={reload} />
        <div className="bg-white rounded-2xl border border-[#e8e8ed] p-6 max-w-md">
          <p className="text-sm text-[#6e6e73]">No events assigned to you yet. Enter the event PIN above, or ask the UHT admin to assign you to the event.</p>
        </div>
      </div>
    );
  }

  if (tool) {
    const active = TOOLS.find(t => t.key === tool);
    const View = tool === 'scores' ? ScoreManagement : TOOL_VIEWS[tool];
    return (
      <div>
        <button onClick={() => setTool(null)} className="text-sm font-semibold text-[#0a7cc9] mb-4">&larr; Director tools</button>
        <h2 className="text-xl font-bold text-[#1d1d1f] mb-4">{active?.label}</h2>
        {View ? <View /> : null}
      </div>
    );
  }

  return (
    <div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {TOOLS.map(t => (
          <button key={t.key} onClick={() => setTool(t.key)}
            className="bg-white rounded-2xl border border-[#e8e8ed] p-5 text-left hover:border-[#00ccff] hover:shadow-[0_4px_20px_-6px_rgba(0,62,121,0.15)] hover:-translate-y-0.5 transition-all">
            <p className="text-sm font-bold text-[#003e79]">{t.label}</p>
            <p className="text-xs text-[#86868b] mt-1 leading-snug">{t.sub}</p>
          </button>
        ))}
      </div>
      <div className="mt-6 max-w-md">
        <PinClaimBox onClaimed={reload} />
      </div>
    </div>
  );
}
