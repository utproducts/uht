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

type SeasonRow = { season: string; total: number | null; months: Record<number, number>; current: boolean };

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
  const [awaiting, setAwaiting] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('uht_token') : null;
    fetch(`${API}/api/analytics/reports/season-comparison`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(r => r.json())
      .then(json => {
        if (json.success) {
          setSeasons(json.data.seasons || []);
          setAwaiting(json.data.awaitingApproval || 0);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="bg-white rounded-2xl border border-[#e8e8ed] p-8 flex justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#003e79]" /></div>;
  }
  if (seasons.length === 0) return null;

  // Color a cell against the previous season's same month:
  // green = higher or equal (with data), red = lower, neutral = nothing to compare.
  const cellStyle = (value: number | null | undefined, prevValue: number | null | undefined): { bg: string; text: string } => {
    if (value === null || value === undefined) return { bg: 'transparent', text: MUTED };
    if (prevValue === null || prevValue === undefined) return { bg: 'transparent', text: NEUTRAL_TEXT };
    if (value >= prevValue) return { bg: GREEN_BG, text: GREEN_TEXT };
    return { bg: RED_BG, text: RED_TEXT };
  };

  const currentMonthNum = new Date().getMonth() + 1;

  return (
    <div className="bg-white rounded-2xl border border-[#e8e8ed] p-5 shadow-[0_1px_10px_-4px_rgba(0,0,0,0.06)]">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-semibold text-[#1d1d1f]">Approved Teams by Month</h3>
        <span className="text-xs" style={{ color: MUTED }}>Season runs June – May</span>
      </div>
      <p className="text-xs mb-4" style={{ color: MUTED }}>
        Green = ahead of the previous season&apos;s same month · Red = behind
        {awaiting > 0 && <> · <span className="font-semibold text-amber-600">{awaiting} team{awaiting !== 1 ? 's' : ''} registered &amp; awaiting approval</span> (not counted below)</>}
      </p>

      <div className="overflow-x-auto">
        <table className="w-full text-sm" style={{ fontVariantNumeric: 'tabular-nums' }}>
          <thead>
            <tr className="border-b border-[#e8e8ed]">
              <th className="text-left font-medium py-2 pr-4 text-xs uppercase tracking-wider" style={{ color: MUTED }}>Month</th>
              {seasons.map(s => (
                <th key={s.season} className={`text-right font-semibold py-2 px-4 ${s.current ? 'text-[#003e79]' : 'text-[#1d1d1f]'}`}>
                  {s.season}
                  {s.current && <span className="ml-1.5 text-[10px] font-bold uppercase bg-[#003e79] text-white rounded-full px-1.5 py-0.5 align-middle">Current</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#f0f0f2]">
            {/* Total row */}
            <tr className="bg-[#fafafa]">
              <td className="py-2.5 pr-4 font-bold text-[#1d1d1f]">Total Teams</td>
              {seasons.map((s, i) => {
                const prev = i > 0 ? seasons[i - 1].total : null;
                const st = cellStyle(s.total, prev);
                return (
                  <td key={s.season} className="py-1.5 px-2 text-right">
                    <span className="inline-block min-w-[72px] rounded-lg px-3 py-1 text-lg font-bold" style={{ background: st.bg, color: st.text }}>
                      {s.total === null ? '—' : s.total.toLocaleString()}
                    </span>
                  </td>
                );
              })}
            </tr>
            {/* Month rows */}
            {SEASON_MONTHS.map(m => {
              const isFutureThisSeason = SEASON_MONTHS.indexOf(m) > SEASON_MONTHS.indexOf(currentMonthNum);
              return (
                <tr key={m}>
                  <td className="py-1.5 pr-4 font-medium" style={{ color: NEUTRAL_TEXT }}>
                    {MONTH_NAMES[m]}
                    {m === currentMonthNum && <span className="ml-1.5 text-[10px] font-semibold" style={{ color: MUTED }}>(in progress)</span>}
                  </td>
                  {seasons.map((s, i) => {
                    const value = s.current && isFutureThisSeason ? null : (s.months[m] ?? (s.current ? 0 : null));
                    const prevSeason = i > 0 ? seasons[i - 1] : null;
                    const prevValue = prevSeason ? (prevSeason.months[m] ?? null) : null;
                    const st = cellStyle(value, prevValue);
                    return (
                      <td key={s.season} className="py-1 px-2 text-right">
                        <span className="inline-block min-w-[72px] rounded-lg px-3 py-1 font-semibold" style={{ background: st.bg, color: st.text }}>
                          {value === null || value === undefined ? '—' : value.toLocaleString()}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
