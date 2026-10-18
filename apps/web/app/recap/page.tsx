'use client';

/*
  EVENT RECAP - the celebration page families land on from the morning-after
  push and email: champions with photos, Three Stars of the weekend, every
  goal scorer, and a short summary. /recap?event=<slug or id>
*/

import { useEffect, useState } from 'react';

const API = (process.env.NEXT_PUBLIC_API_URL || 'https://uht.chad-157.workers.dev') + '/api';

export default function RecapPage() {
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const slug = new URLSearchParams(window.location.search).get('event') || '';
    if (!slug) { setErr('Missing event'); setLoading(false); return; }
    fetch(`${API}/events/${encodeURIComponent(slug)}/recap`)
      .then(r => r.json())
      .then(j => { if (j.success) setData(j.data); else setErr(j.error || 'Not found'); })
      .catch(() => setErr('Could not load the recap'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="min-h-screen flex items-center justify-center text-[#6e6e73]">Loading recap…</div>;
  if (err || !data) return <div className="min-h-screen flex items-center justify-center text-[#6e6e73]">{err || 'Recap not available'}</div>;

  const ev = data.event;
  const fmtDates = () => {
    try {
      const s = new Date(String(ev.start_date).slice(0, 10) + 'T12:00:00');
      const e = new Date(String(ev.end_date).slice(0, 10) + 'T12:00:00');
      const f = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      return `${f(s)} – ${f(e)}, ${e.getFullYear()}`;
    } catch { return ''; }
  };

  return (
    <div className="min-h-screen bg-[#f4f7fb]">
      {/* HERO */}
      <div className="bg-gradient-to-br from-[#002d5a] via-[#003e79] to-[#00a3cc] text-white">
        <div className="max-w-5xl mx-auto px-5 pt-14 pb-12 text-center">
          <div className="text-[11px] font-black tracking-[0.35em] text-[#7fd8ff]">EVENT RECAP</div>
          <h1 className="text-4xl sm:text-5xl font-black mt-3 leading-tight">{ev.name}</h1>
          <p className="text-[#bfe8ff] mt-2 text-sm font-semibold">{ev.city}, {ev.state} · {fmtDates()}</p>
          <div className="flex justify-center gap-8 sm:gap-14 mt-10">
            {[{ n: data.totals.games, l: 'GAMES' }, { n: data.totals.goals, l: 'GOALS' }, { n: data.totals.teams, l: 'TEAMS' }, { n: data.stars.length, l: 'STARS' }].map(x => (
              <div key={x.l}>
                <div className="text-3xl sm:text-4xl font-black">{x.n}</div>
                <div className="text-[10px] tracking-[0.25em] text-[#7fd8ff] font-bold mt-1">{x.l}</div>
              </div>
            ))}
          </div>
        </div>
        <svg viewBox="0 0 1440 60" className="block w-full" preserveAspectRatio="none" style={{ height: 40 }}>
          <path d="M0,60 C360,0 1080,0 1440,60 L1440,60 L0,60 Z" fill="#f4f7fb" />
        </svg>
      </div>

      <div className="max-w-5xl mx-auto px-5 pb-16">
        {/* SUMMARY */}
        <p className="text-center text-[15px] leading-relaxed text-[#2a3c52] max-w-3xl mx-auto -mt-1 pt-6">{data.summary}</p>

        {/* CHAMPIONS */}
        {data.champions.length > 0 && (
          <section className="mt-12">
            <h2 className="text-center text-sm font-black tracking-[0.3em] text-[#b8860b]">🏆 YOUR CHAMPIONS 🏆</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mt-6">
              {data.champions.map((ch: any) => (
                <div key={ch.team_id + ch.division} className="bg-white rounded-3xl overflow-hidden shadow-lg border-2 border-[#e8d9a8]">
                  {ch.photo_url ? (
                    <img src={ch.photo_url} alt={ch.team_name} className="w-full aspect-[4/3] object-cover" />
                  ) : (
                    <div className="w-full aspect-[4/3] bg-gradient-to-br from-[#003e79] to-[#00a3cc] flex items-center justify-center text-7xl">🏆</div>
                  )}
                  <div className="p-5 text-center">
                    <div className="text-[10px] font-black tracking-[0.25em] text-[#b8860b]">{String(ch.division).toUpperCase()} CHAMPIONS</div>
                    <div className="text-2xl font-black text-[#003e79] mt-1">{ch.team_name}</div>
                    <div className="text-xs text-[#6b7a90] mt-1 font-semibold">won {ch.score} over {ch.runner_up}</div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* THREE STARS */}
        {data.stars.length > 0 && (
          <section className="mt-14">
            <h2 className="text-center text-sm font-black tracking-[0.3em] text-[#b8860b]">★ THREE STARS OF THE WEEKEND ★</h2>
            <div className="bg-white rounded-3xl shadow-md border border-[#e8edf3] mt-6 overflow-hidden">
              {data.stars.map((st: any, i: number) => (
                <div key={i} className={`flex items-center gap-3 px-5 py-2.5 ${i % 2 ? 'bg-[#fbfcfe]' : 'bg-white'} ${i ? 'border-t border-[#f0f3f7]' : ''}`}>
                  <span className="text-[#d4af37] text-sm w-12 shrink-0 tracking-tight">{'★'.repeat(st.first > 0 ? 3 : st.second > 0 ? 2 : 1)}</span>
                  <span className="font-bold text-[#1d2b3d] text-sm">{st.player_name} <span className="text-[#8295ab] font-semibold">#{st.jersey_number}</span></span>
                  <span className="text-xs text-[#5b6b80] flex-1 truncate text-right">{st.team_name}</span>
                  <span className="text-[11px] font-bold text-[#b8860b] w-14 text-right shrink-0">{st.total} star{st.total > 1 ? 's' : ''}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* GOAL SCORERS */}
        {data.scorers.length > 0 && (
          <section className="mt-14">
            <h2 className="text-center text-sm font-black tracking-[0.3em] text-[#003e79]">🥅 EVERY GOAL SCORER</h2>
            <p className="text-center text-xs text-[#6b7a90] mt-1">{data.scorers.length} players lit the lamp this weekend</p>
            <div className="flex flex-wrap justify-center gap-2 mt-6">
              {data.scorers.map((sc: any, i: number) => (
                <span key={i} className="inline-flex items-center gap-1.5 bg-white border border-[#d5e5f5] rounded-full px-3.5 py-1.5 text-[13px] shadow-sm">
                  <b className="text-[#17304d]">{sc.player_name}</b>
                  <span className="text-[#8295ab] text-[11px]">{sc.team_name}</span>
                  {sc.goals > 1 && <span className="bg-[#003e79] text-white text-[10px] font-black rounded-full px-1.5 py-0.5">×{sc.goals}</span>}
                </span>
              ))}
            </div>
          </section>
        )}

        {/* CTA */}
        <section className="mt-16 text-center bg-gradient-to-br from-[#003e79] to-[#005599] rounded-3xl p-8 text-white">
          <div className="text-xl font-black">Enjoyed the weekend?</div>
          <p className="text-[#bfe8ff] text-sm mt-2 max-w-md mx-auto">A quick App Store review helps more youth hockey families find us — and we read every one.</p>
          <a href="https://apps.apple.com/app/id6786085393?action=write-review"
            className="inline-block mt-5 bg-white text-[#003e79] font-black text-sm rounded-full px-8 py-3 hover:bg-[#e8f6ff] transition">Leave a Review</a>
        </section>
      </div>
    </div>
  );
}
