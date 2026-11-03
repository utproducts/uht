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

export default function RegistrationTrends() {
  const [seasons, setSeasons] = useState<SeasonRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [authFailed, setAuthFailed] = useState(false);

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
            <div key={m} className="rounded-xl border px-3 py-2.5"
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
            </div>
          );
        })}
      </div>
    </div>
  );
}
