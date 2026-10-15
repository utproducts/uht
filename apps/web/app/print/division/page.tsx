'use client';

/**
 * Printable division sheet: standings on top, every game below.
 * Opened from the public schedule page or the admin Schedules tab:
 *   /print/division?event=<slug>&division=<Age Group Level>
 * Black-on-white, condensed, one division per sheet.
 */

import { useEffect, useState } from 'react';

const API = (process.env.NEXT_PUBLIC_API_URL || 'https://uht.chad-157.workers.dev') + '/api';

const fmtTime = (iso: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  let h = d.getHours(); const m = String(d.getMinutes()).padStart(2, '0');
  const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12;
  return `${h}:${m} ${ap}`;
};
const fmtDay = (iso: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
};

export default function PrintDivisionPage() {
  const [event, setEvent] = useState<any>(null);
  const [games, setGames] = useState<any[]>([]);
  const [standings, setStandings] = useState<any[]>([]);
  const [division, setDivision] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const slug = p.get('event') || '';
    const div = p.get('division') || '';
    setDivision(div);
    if (!slug) { setErr('Missing event'); setLoading(false); return; }
    (async () => {
      try {
        const evRes = await fetch(`${API}/events/${slug}`);
        const evJson = await evRes.json();
        if (!evJson.success) { setErr('Event not found'); setLoading(false); return; }
        const ev = evJson.data;
        setEvent(ev);
        const hdrs: any = (typeof window !== 'undefined' && localStorage.getItem('uht_token'))
          ? { Authorization: `Bearer ${localStorage.getItem('uht_token')}` } : {};
        const [schedRes, standRes] = await Promise.all([
          fetch(`${API}/scoring/events/${ev.id}/schedule`, { headers: hdrs }),
          fetch(`${API}/scoring/events/${ev.id}/standings`, { headers: hdrs }),
        ]);
        const schedJson = await schedRes.json();
        const standJson = await standRes.json();
        const all = (schedJson.data || []) as any[];
        const match = (g: any) => !div || `${g.age_group || ''} ${g.division_level || ''}`.trim() === div;
        setGames(all.filter(match).sort((a, b) => String(a.start_time).localeCompare(String(b.start_time))));
        setStandings(((standJson.data || []) as any[]).filter((s: any) => !div || `${s.age_group || ''} ${s.division_level || ''}`.trim() === div));
      } catch { setErr('Could not load the schedule'); }
      setLoading(false);
    })();
  }, []);

  if (loading) return <div style={{ padding: 40, fontFamily: 'sans-serif' }}>Loading…</div>;
  if (err) return <div style={{ padding: 40, fontFamily: 'sans-serif' }}>{err}</div>;

  // Standings grouped by pool
  const pools = new Map<string, any[]>();
  for (const s of standings) {
    const key = s.pool_name || 'Standings';
    if (!pools.has(key)) pools.set(key, []);
    pools.get(key)!.push(s);
  }

  // Games grouped by day
  const days = new Map<string, any[]>();
  for (const g of games) {
    const key = String(g.start_time).slice(0, 10);
    if (!days.has(key)) days.set(key, []);
    days.get(key)!.push(g);
  }

  const teamLabel = (name: string | null, ph: string | null) => name || ph || 'TBD';
  const typeChip = (g: any) => {
    if (!g.game_type || g.game_type === 'pool') return '';
    if (/champ/i.test(g.game_type)) return 'CHAMPIONSHIP';
    if (/place|consol/i.test(g.game_type)) return 'PLACEMENT';
    return String(g.game_type).toUpperCase();
  };

  return (
    <div className="print-sheet">
      <style>{`
        .print-sheet { font-family: -apple-system, 'Segoe UI', Arial, sans-serif; color: #000; background: #fff; max-width: 820px; margin: 0 auto; padding: 24px 20px; }
        .ps-toolbar { display: flex; justify-content: flex-end; margin-bottom: 10px; }
        .ps-print-btn { background: #003e79; color: #fff; border: 0; border-radius: 8px; padding: 10px 22px; font-size: 14px; font-weight: 700; cursor: pointer; }
        .ps-head { border-bottom: 3px solid #000; padding-bottom: 8px; margin-bottom: 12px; }
        .ps-event { font-size: 20px; font-weight: 800; margin: 0; }
        .ps-div { font-size: 16px; font-weight: 700; margin: 2px 0 0; }
        .ps-meta { font-size: 11px; color: #444; margin: 2px 0 0; }
        .ps-section { font-size: 13px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; margin: 14px 0 4px; }
        table.ps { width: 100%; border-collapse: collapse; font-size: 12px; }
        table.ps th { text-align: left; border-bottom: 2px solid #000; padding: 3px 6px; font-size: 11px; text-transform: uppercase; }
        table.ps td { border-bottom: 1px solid #ccc; padding: 4px 6px; }
        table.ps th.num, table.ps td.num { text-align: center; width: 34px; }
        .ps-day { font-size: 13px; font-weight: 800; background: #eee; padding: 4px 8px; margin: 10px 0 0; border: 1px solid #999; }
        .ps-score { font-weight: 800; white-space: nowrap; }
        .ps-blank { display: inline-block; border-bottom: 1.5px solid #000; width: 26px; height: 12px; margin: 0 2px; }
        .ps-chip { font-size: 9px; font-weight: 800; border: 1px solid #000; padding: 0 4px; margin-left: 6px; }
        @media print {
          .ps-toolbar { display: none; }
          .print-sheet { padding: 0; max-width: none; }
          .ps-day { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          @page { margin: 12mm; }
        }
      `}</style>

      <div className="ps-toolbar">
        <button className="ps-print-btn" onClick={() => window.print()}>Print</button>
      </div>

      <div className="ps-head">
        <p className="ps-event">{event?.name}</p>
        <p className="ps-div">{division || 'All Divisions'}</p>
        <p className="ps-meta">
          {event?.start_date ? `${event.start_date.slice(0, 10)} to ${String(event.end_date || '').slice(0, 10)}` : ''}
          {' · '}Printed {new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
        </p>
      </div>

      {/* Standings */}
      {Array.from(pools.entries()).map(([pool, rows]) => (
        <div key={pool}>
          <p className="ps-section">{pools.size > 1 || pool !== 'Standings' ? `Standings - ${pool}` : 'Standings'}</p>
          <table className="ps">
            <thead>
              <tr>
                <th className="num">#</th><th>Team</th>
                <th className="num">GP</th><th className="num">W</th><th className="num">L</th><th className="num">T</th>
                <th className="num">PTS</th><th className="num">GF</th><th className="num">GA</th><th className="num">DIFF</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s: any, i: number) => (
                <tr key={s.team_id || i}>
                  <td className="num">{i + 1}</td>
                  <td>{s.team_name}</td>
                  <td className="num">{s.games_played}</td>
                  <td className="num">{s.wins}</td>
                  <td className="num">{s.losses}</td>
                  <td className="num">{s.ties}</td>
                  <td className="num"><strong>{s.points}</strong></td>
                  <td className="num">{s.goals_for}</td>
                  <td className="num">{s.goals_against}</td>
                  <td className="num">{s.goal_differential > 0 ? `+${s.goal_differential}` : s.goal_differential}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      {standings.length === 0 && <p style={{ fontSize: 12, color: '#555' }}>No standings yet.</p>}

      {/* Games by day */}
      <p className="ps-section" style={{ marginTop: 18 }}>Games ({games.length})</p>
      {Array.from(days.entries()).map(([day, dayGames]) => (
        <div key={day}>
          <p className="ps-day">{fmtDay(dayGames[0].start_time)}</p>
          <table className="ps">
            <tbody>
              {dayGames.map((g: any) => (
                <tr key={g.id}>
                  <td className="num">{g.game_number ? `#${g.game_number}` : ''}</td>
                  <td style={{ width: 70, whiteSpace: 'nowrap' }}>{fmtTime(g.adjusted_start_time || g.start_time)}</td>
                  <td style={{ width: 150 }}>{g.rink_name || ''}</td>
                  <td>
                    {teamLabel(g.home_team_name, g.home_placeholder)} <span style={{ color: '#666' }}>vs</span> {teamLabel(g.away_team_name, g.away_placeholder)}
                    {typeChip(g) ? <span className="ps-chip">{typeChip(g)}</span> : null}
                  </td>
                  <td className="num ps-score" style={{ width: 70 }}>
                    {g.status === 'final' || g.status === 'in_progress' || g.status === 'intermission'
                      ? `${g.home_score} - ${g.away_score}${g.status !== 'final' ? '*' : ''}`
                      : <><span className="ps-blank" /> - <span className="ps-blank" /></>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      {games.length === 0 && <p style={{ fontSize: 12, color: '#555' }}>No games in this division.</p>}
    </div>
  );
}
