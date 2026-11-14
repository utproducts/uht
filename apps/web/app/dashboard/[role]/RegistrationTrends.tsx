'use client';

import { useState, useEffect } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://uht.chad-157.workers.dev';

/*
 * Registration season comparison — approved teams by month, side by side with
 * prior seasons (mirrors the old Airtable "Total Teams by Month" tracker).
 * Prior-season numbers come from the season_benchmarks table; the current
 * season is computed live. Green = up vs the previous season's same month,
 * red = down. Seasons run June -> May.
 */

type SeasonRow = {
  season: string;
  total: number | null;
  months: Record<number, number>;
  approvedMonths?: Record<number, number>;
  approvedTotal?: number;
  current: boolean;
};

// June -> May
const SEASON_MONTHS = [6, 7, 8, 9, 10, 11, 12, 1, 2, 3, 4, 5];
const MONTH_NAMES = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const GREEN_BG = '#eef7e8';
const GREEN_TEXT = '#1e6b1e';
const RED_BG = '#fdeef4';
const RED_TEXT = '#b3204d';
const NEUTRAL_TEXT = '#1d1d1f';
const MUTED = '#86868b';

type MonthDetail = {
  month: number;
  this_year: number;
  last_year: number;
  this_season: { days: { day: string; teams: { team_name: string; event_name: string; division?: string; status?: string; state?: string; email?: string | null }[] }[]; total: number };
  last_season: { days: { day: string; teams: { team_name: string; event_name: string; division?: string; state?: string; email?: string | null }[] }[]; total: number };
};

function fmtDay(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export default function RegistrationTrends() {
  const [seasons, setSeasons] = useState<SeasonRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [authFailed, setAuthFailed] = useState(false);
  const [detailMonth, setDetailMonth] = useState<number | null>(null);
  const [detail, setDetail] = useState<MonthDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailSeason, setDetailSeason] = useState<'this' | 'last'>('this');
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [detailView, setDetailView] = useState<'calendar' | 'states'>('calendar');
  const [selectedState, setSelectedState] = useState<string | null>(null);

  const openMonth = (m: number) => {
    setDetailMonth(m);
    setDetail(null);
    setDetailSeason('this');
    setSelectedDay(null);
    setDetailView('calendar');
    setSelectedState(null);
    setDetailLoading(true);
    const token = typeof window !== 'undefined' ? localStorage.getItem('uht_token') : null;
    fetch(`${API}/api/analytics/reports/month-detail/${m}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(r => r.json())
      .then(json => { if (json.success) setDetail(json.data); })
      .catch(() => {})
      .finally(() => setDetailLoading(false));
  };

  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('uht_token') : null;
    fetch(`${API}/api/analytics/reports/season-comparison`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(r => {
        if (r.status === 401 || r.status === 403) setAuthFailed(true);
        return r.json();
      })
      .then(json => {
        if (json.success) {
          setSeasons(json.data.seasons || []);
        }
      })
      .catch(() => setAuthFailed(true))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="bg-white rounded-2xl border border-[#e8e8ed] p-8 flex justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#003e79]" /></div>;
  }
  // A stale login used to make this card vanish silently - say why instead
  if (seasons.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-[#e8e8ed] p-6 text-center">
        <p className="text-sm font-semibold text-[#1d1d1f]">Teams Registered by Month</p>
        <p className="text-xs text-[#86868b] mt-1.5">
          {authFailed
            ? 'Your session has expired, so the season comparison could not load. Sign out and back in to bring it back.'
            : 'The season comparison could not load. Pull to refresh, or sign out and back in.'}
        </p>
      </div>
    );
  }

  // Color a cell against the previous season's same month:
  // green = higher or equal (with data), red = lower, neutral = nothing to compare.
  const cellStyle = (value: number | null | undefined, prevValue: number | null | undefined): { bg: string; text: string } => {
    if (value === null || value === undefined) return { bg: 'transparent', text: MUTED };
    if (prevValue === null || prevValue === undefined) return { bg: 'transparent', text: NEUTRAL_TEXT };
    if (value >= prevValue) return { bg: GREEN_BG, text: GREEN_TEXT };
    return { bg: RED_BG, text: RED_TEXT };
  };

  const currentMonthNum = new Date().getMonth() + 1;

  // Chad wants the overview focused: show only last season and this season.
  // Comparisons still look back at the full list, so colors stay correct.
  const visibleSeasons = seasons.slice(-2);
  const prevOf = (s2: SeasonRow) => {
    const i = seasons.indexOf(s2);
    return i > 0 ? seasons[i - 1] : null;
  };

  const current = visibleSeasons.find(x => x.current) || visibleSeasons[visibleSeasons.length - 1];
  const last = prevOf(current);
  const pendingTotal = current && current.total !== null ? current.total - (current.approvedTotal || 0) : 0;
  const totalStyle = cellStyle(current?.total ?? null, last?.total ?? null);

  return (
    <div className="bg-white rounded-2xl border border-[#e8e8ed] p-5 shadow-[0_1px_10px_-4px_rgba(0,0,0,0.06)]">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
        <h3 className="text-sm font-semibold text-[#1d1d1f]">Teams Registered by Month</h3>
        <span className="text-xs" style={{ color: MUTED }}>Season runs June – May</span>
      </div>
      <p className="text-xs mb-4" style={{ color: MUTED }}>
        Big number = this season ({current?.season}) · small = last season ({last?.season || '—'}) · green = ahead, red = behind
      </p>

      {/* Season totals strip */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="rounded-xl border border-[#e8e8ed] bg-[#fafafa] px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: MUTED }}>{last?.season || 'Last season'} total</p>
          <p className="text-2xl font-bold text-[#1d1d1f]" style={{ fontVariantNumeric: 'tabular-nums' }}>{last?.total === null || last?.total === undefined ? '—' : last.total.toLocaleString()}</p>
        </div>
        <div className="rounded-xl px-4 py-3 border" style={{ background: totalStyle.bg === 'transparent' ? '#fafafa' : totalStyle.bg, borderColor: '#e8e8ed' }}>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[#003e79]">{current?.season} to date</p>
          <p className="text-2xl font-bold" style={{ color: totalStyle.text === MUTED ? NEUTRAL_TEXT : totalStyle.text, fontVariantNumeric: 'tabular-nums' }}>
            {current?.total === null || current?.total === undefined ? '—' : current.total.toLocaleString()}
          </p>
          {pendingTotal > 0 && <p className="text-[11px] font-semibold text-amber-600">{pendingTotal} pending approval</p>}
        </div>
      </div>

      {/* Month grid, June -> May */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2.5" style={{ fontVariantNumeric: 'tabular-nums' }}>
        {SEASON_MONTHS.map(m => {
          const isFuture = SEASON_MONTHS.indexOf(m) > SEASON_MONTHS.indexOf(currentMonthNum);
          const value = current ? (isFuture ? null : (current.months[m] ?? 0)) : null;
          const lastValue = last ? (last.months[m] ?? null) : null;
          const st = cellStyle(value, lastValue);
          const approvedM = current?.approvedMonths?.[m] || 0;
          const pendingM = value ? value - approvedM : 0;
          const isNow = m === currentMonthNum;
          return (
            <button key={m} onClick={() => openMonth(m)}
              className="rounded-xl border px-3 py-2.5 text-left transition hover:shadow-md hover:-translate-y-px cursor-pointer"
              style={{ background: st.bg === 'transparent' ? '#fff' : st.bg, borderColor: isNow ? '#003e79' : '#ededf0' }}>
              <div className="flex items-center justify-between gap-1">
                <p className="text-[11px] font-semibold uppercase tracking-wide truncate" style={{ color: isNow ? '#003e79' : MUTED }}>
                  {MONTH_NAMES[m].slice(0, 3)}
                </p>
                {isNow && <span className="w-1.5 h-1.5 rounded-full bg-[#003e79] shrink-0" title="In progress" />}
              </div>
              <p className="text-xl font-bold leading-tight" style={{ color: st.text === MUTED ? '#c7c7cc' : st.text }}>
                {value === null ? '—' : value.toLocaleString()}
              </p>
              <p className="text-[11px] font-medium" style={{ color: MUTED }}>
                {lastValue === null ? 'last yr —' : `last yr ${lastValue.toLocaleString()}`}
              </p>
              {pendingM > 0 && <p className="text-[10px] font-semibold text-amber-600">{pendingM} pending</p>}
            </button>
          );
        })}
      </div>
      <p className="text-[11px] mt-3" style={{ color: MUTED }}>Click any month to see the teams that registered each day, this season and last.</p>

      {/* Day-by-day drill-down */}
      {detailMonth !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6" onClick={() => setDetailMonth(null)}>
          <div className="absolute inset-0 bg-black/40" />
          <div onClick={e => e.stopPropagation()}
            className="relative bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[88vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#e8e8ed] shrink-0">
              <div>
                <h3 className="font-bold text-[#1d1d1f]">{MONTH_NAMES[detailMonth]} — who registered, day by day</h3>
                {detail && (
                  <p className="text-xs mt-0.5" style={{ color: MUTED }}>
                    {detail.this_year}: {detail.this_season.total} team{detail.this_season.total !== 1 ? 's' : ''} · {detail.last_year}: {detail.last_season.total} team{detail.last_season.total !== 1 ? 's' : ''}
                  </p>
                )}
              </div>
              <button onClick={() => setDetailMonth(null)}
                className="w-8 h-8 rounded-full bg-[#f5f5f7] hover:bg-[#e8e8ed] text-[#6e6e73] font-bold shrink-0">✕</button>
            </div>
            <div className="overflow-y-auto p-5">
              {detailLoading ? (
                <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#003e79]" /></div>
              ) : !detail ? (
                <p className="text-sm text-center py-10" style={{ color: MUTED }}>Could not load the month detail. Try again, or sign out and back in.</p>
              ) : (
                (() => {
                  const season = detailSeason === 'this' ? detail.this_season : detail.last_season;
                  const year = detailSeason === 'this' ? detail.this_year : detail.last_year;
                  const byDay = new Map(season.days.map(d => [d.day, d.teams]));
                  const daysInMonth = new Date(year, detailMonth, 0).getDate();
                  const firstWeekday = new Date(year, detailMonth - 1, 1).getDay();
                  const pad2 = (n: number) => String(n).padStart(2, '0');
                  const dayIso = (d: number) => `${year}-${pad2(detailMonth)}-${pad2(d)}`;
                  const sel = selectedDay && byDay.has(selectedDay) ? selectedDay : null;
                  const selTeams = sel ? byDay.get(sel)! : [];
                  const maxCount = Math.max(1, ...season.days.map(d => d.teams.length));
                  return (
                    <div className="max-w-xl mx-auto">
                      {/* Season toggle */}
                      <div className="flex gap-1.5 mb-4 bg-[#f5f5f7] rounded-xl p-1">
                        {([
                          { key: 'this' as const, label: `${detail.this_year} · this season`, total: detail.this_season.total },
                          { key: 'last' as const, label: `${detail.last_year} · last season`, total: detail.last_season.total },
                        ]).map(s => (
                          <button key={s.key} onClick={() => { setDetailSeason(s.key); setSelectedDay(null); setSelectedState(null); }}
                            className={`flex-1 rounded-lg px-3 py-2 text-xs font-bold transition ${detailSeason === s.key ? 'bg-[#003e79] text-white shadow' : 'text-[#6e6e73]'}`}>
                            {s.label}
                            <span className={`ml-1.5 text-[10px] font-semibold ${detailSeason === s.key ? 'text-[#9fd1ff]' : 'text-[#86868b]'}`}>{s.total}</span>
                          </button>
                        ))}
                      </div>

                      {/* Calendar / By State view switch */}
                      <div className="flex justify-center gap-1.5 mb-4">
                        {([{ key: 'calendar' as const, label: 'Calendar' }, { key: 'states' as const, label: 'By State' }]).map(v => (
                          <button key={v.key} onClick={() => setDetailView(v.key)}
                            className={`px-4 py-1.5 rounded-full text-xs font-bold transition ${detailView === v.key ? 'bg-[#0077b0] text-white' : 'bg-white border border-[#e8e8ed] text-[#6e6e73]'}`}>
                            {v.label}
                          </button>
                        ))}
                      </div>

                      {season.days.length === 0 ? (
                        <p className="text-sm text-center py-8" style={{ color: MUTED }}>
                          {detailSeason === 'this' ? `No registrations yet this ${MONTH_NAMES[detailMonth]}.` : `No data on file for ${MONTH_NAMES[detailMonth]} ${year}.`}
                        </p>
                      ) : detailView === 'states' ? (
                        (() => {
                          const stateMap = new Map<string, any[]>();
                          for (const d of season.days) for (const t of d.teams) {
                            const st = t.state || 'Unknown';
                            const list = stateMap.get(st) || [];
                            list.push({ ...t, day: d.day });
                            stateMap.set(st, list);
                          }
                          const states = Array.from(stateMap.entries()).sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
                          const maxSt = states.length ? states[0][1].length : 1;
                          return (
                            <div className="space-y-1.5">
                              {states.map(([st, teams]) => {
                                const open = selectedState === st;
                                return (
                                  <div key={st} className={`rounded-xl border overflow-hidden ${open ? 'border-[#0077b0]' : 'border-[#ededf0]'}`}>
                                    <button onClick={() => setSelectedState(open ? null : st)}
                                      className={`w-full flex items-center gap-3 px-3 py-2 text-left transition ${open ? 'bg-[#f0f7ff]' : 'bg-white hover:bg-[#fafafa]'}`}>
                                      <span className="w-16 text-sm font-bold text-[#003e79] shrink-0">{st}</span>
                                      <div className="flex-1 bg-[#f5f5f7] rounded-full h-3.5 overflow-hidden">
                                        <div className="h-3.5 rounded-full bg-gradient-to-r from-[#003e79] to-[#00ccff]"
                                          style={{ width: `${Math.max(5, (teams.length / maxSt) * 100)}%` }} />
                                      </div>
                                      <span className="w-8 text-right text-sm font-bold text-[#1d1d1f] shrink-0">{teams.length}</span>
                                      <span className="text-[#86868b] text-xs shrink-0">{open ? '▴' : '▾'}</span>
                                    </button>
                                    {open && (
                                      <div className="divide-y divide-[#f0f0f3] border-t border-[#f0f0f3]">
                                        {teams.sort((a: any, b: any) => a.day.localeCompare(b.day)).map((t: any, i: number) => (
                                          <div key={i} className="px-3 py-1.5">
                                            <p className="text-sm font-medium text-[#1d1d1f] leading-tight">{t.team_name}</p>
                                            <p className="text-[11px] truncate" style={{ color: MUTED }}>
                                              {fmtDay(t.day)} · {t.event_name}{t.division ? ` · ${t.division}` : ''}
                                              {t.email ? <> · <a href={`mailto:${t.email}`} className="text-[#0077b0] hover:underline">{t.email}</a></> : ''}
                                            </p>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })()
                      ) : (
                        <>
                          {/* Calendar grid */}
                          <div className="grid grid-cols-7 gap-1 mb-1">
                            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((w, i) => (
                              <p key={i} className="text-center text-[10px] font-bold uppercase" style={{ color: MUTED }}>{w}</p>
                            ))}
                          </div>
                          <div className="grid grid-cols-7 gap-1 mb-4">
                            {Array.from({ length: firstWeekday }).map((_, i) => <div key={`e${i}`} />)}
                            {Array.from({ length: daysInMonth }).map((_, i) => {
                              const d = i + 1;
                              const iso = dayIso(d);
                              const count = byDay.get(iso)?.length || 0;
                              const isSel = sel === iso;
                              return (
                                <button key={iso} onClick={() => count > 0 && setSelectedDay(isSel ? null : iso)}
                                  disabled={count === 0}
                                  className={`rounded-lg border aspect-square flex flex-col items-center justify-center transition ${
                                    isSel ? 'bg-[#003e79] border-[#003e79]' : count > 0 ? 'bg-[#f0f7ff] border-[#d5e8fa] hover:border-[#003e79] cursor-pointer' : 'bg-white border-[#f0f0f3]'
                                  }`}>
                                  <span className={`text-[9px] leading-none font-medium ${isSel ? 'text-[#9fd1ff]' : 'text-[#a8a8ad]'}`}>{d}</span>
                                  <span className={`text-sm font-bold leading-tight ${isSel ? 'text-white' : count > 0 ? 'text-[#003e79]' : 'text-[#d8d8dd]'}`}
                                    style={count > 0 && !isSel ? { opacity: 0.55 + 0.45 * (count / maxCount) } : undefined}>
                                    {count > 0 ? count : '·'}
                                  </span>
                                </button>
                              );
                            })}
                          </div>

                          {/* Selected day teams */}
                          {sel ? (
                            <div>
                              <p className="text-[11px] font-bold text-[#1d1d1f] bg-[#f5f5f7] rounded-md px-2 py-1.5 mb-1">
                                {fmtDay(sel)} · {selTeams.length} team{selTeams.length !== 1 ? 's' : ''}
                              </p>
                              {selTeams.map((t: any, i: number) => (
                                <div key={i} className="px-2 py-1.5 border-b border-[#f0f0f3] last:border-0">
                                  <p className="text-sm font-medium text-[#1d1d1f] leading-tight">{t.team_name}</p>
                                  <p className="text-[11px] truncate" style={{ color: MUTED }}>
                                    {t.event_name}{t.division ? ` · ${t.division}` : ''}{t.status && t.status !== 'approved' ? ` · ${t.status}` : ''}
                                    {t.email ? <> · <a href={`mailto:${t.email}`} className="text-[#0077b0] hover:underline">{t.email}</a></> : ''}
                                  </p>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs text-center py-3" style={{ color: MUTED }}>Tap a day to see the teams that registered.</p>
                          )}
                        </>
                      )}
                    </div>
                  );
                })()
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
