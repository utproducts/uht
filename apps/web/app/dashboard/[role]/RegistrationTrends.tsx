'use client';

import { useState, useEffect, useRef } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://uht.chad-157.workers.dev';

/*
 * Registration Trends — month-over-month registration analytics for the admin
 * overview (replaces the old Airtable tracking sheet).
 *
 * Colors follow the validated dataviz palette:
 *  - single-series magnitude: blue #2a78d6
 *  - categorical division slots (fixed order, never cycled)
 *  - status: good #0ca30c / warning #fab219 (always icon + label, never color alone)
 */

const SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'];
const INK = '#0b0b0b';
const INK_2 = '#52514e';
const INK_MUTED = '#898781';
const GRID = '#e1e0d9';
// Sequential blue ramp (100 -> 700) for the state heat table
const SEQ = ['#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95', '#0d366b'];

type Trends = {
  months: string[];
  totals: { total: number; approved: number; pending: number };
  perMonth: { month: string; total: number; approved: number; pending: number }[];
  states: { state: string; count: number }[];
  divisions: { division: string; count: number }[];
  statesByMonth: Record<string, Record<string, number>>;
  divisionsByMonth: Record<string, Record<string, number>>;
};

function monthLabel(m: string): string {
  const [y, mo] = m.split('-').map(Number);
  return new Date(Date.UTC(y, mo - 1, 1)).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
}
function monthLabelFull(m: string): string {
  const [y, mo] = m.split('-').map(Number);
  return new Date(Date.UTC(y, mo - 1, 1)).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

/* Single shared hover tooltip */
function useTooltip() {
  const [tip, setTip] = useState<{ x: number; y: number; html: string } | null>(null);
  const show = (e: React.MouseEvent, html: string) => {
    const rect = (e.currentTarget.closest('[data-tiproot]') as HTMLElement)?.getBoundingClientRect();
    if (!rect) return;
    setTip({ x: e.clientX - rect.left, y: e.clientY - rect.top, html });
  };
  const hide = () => setTip(null);
  const node = tip ? (
    <div
      className="pointer-events-none absolute z-20 px-2.5 py-1.5 rounded-lg bg-[#1d1d1f] text-white text-xs shadow-lg whitespace-nowrap"
      style={{ left: Math.max(0, tip.x - 40), top: Math.max(0, tip.y - 44) }}
      dangerouslySetInnerHTML={{ __html: tip.html }}
    />
  ) : null;
  return { show, hide, node };
}

function StatTile({ label, value, sub, accent, icon }: { label: string; value: string | number; sub?: string; accent?: string; icon?: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-[#e8e8ed] p-5 shadow-[0_1px_10px_-4px_rgba(0,0,0,0.06)]">
      <p className="text-sm mb-1 flex items-center gap-1.5" style={{ color: INK_2 }}>
        {icon}
        {label}
      </p>
      <p className="text-2xl font-bold" style={{ color: accent || INK }}>{value}</p>
      {sub && <p className="text-xs mt-1" style={{ color: INK_MUTED }}>{sub}</p>}
    </div>
  );
}

export default function RegistrationTrends() {
  const [data, setData] = useState<Trends | null>(null);
  const [loading, setLoading] = useState(true);
  const tooltip = useTooltip();

  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('uht_token') : null;
    fetch(`${API}/api/analytics/reports/registration-trends`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(r => r.json())
      .then(json => { if (json.success) setData(json.data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="bg-white rounded-2xl border border-[#e8e8ed] p-8 flex justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#003e79]" /></div>;
  }
  if (!data || data.totals.total === 0) {
    return (
      <div className="bg-white rounded-2xl border border-[#e8e8ed] p-8 text-center">
        <p className="text-sm" style={{ color: INK_2 }}>No registrations in the last 12 months yet.</p>
      </div>
    );
  }

  const { months, totals, perMonth, states, divisions, statesByMonth, divisionsByMonth } = data;
  const thisMonth = perMonth[perMonth.length - 1];
  const lastMonth = perMonth[perMonth.length - 2];
  const mom = thisMonth.total - (lastMonth?.total || 0);
  const maxMonthly = Math.max(...perMonth.map(m => m.total), 1);
  const peakMonth = perMonth.reduce((a, b) => (b.total > a.total ? b : a), perMonth[0]);

  // Divisions: fixed slot order (capped at 8 per the palette; fold the rest into Other)
  const divisionSlots = divisions.slice(0, 7).map(d => d.division);
  const hasOther = divisions.length > 7;
  const legendDivisions = hasOther ? [...divisionSlots, 'Other'] : divisionSlots;
  const divColor = (dv: string) => {
    const idx = legendDivisions.indexOf(dv);
    return SERIES[idx >= 0 ? idx : SERIES.length - 1];
  };
  const monthDivisionCount = (m: string, dv: string): number => {
    const bucket = divisionsByMonth[m] || {};
    if (dv !== 'Other') return bucket[dv] || 0;
    return Object.entries(bucket).filter(([k]) => !divisionSlots.includes(k)).reduce((s, [, v]) => s + v, 0);
  };
  const maxDivMonth = Math.max(...months.map(m => Object.values(divisionsByMonth[m] || {}).reduce((s, v) => s + v, 0)), 1);

  // States heat table: top 10 states + fold the tail
  const topStates = states.slice(0, 10);
  const tailStates = states.slice(10);
  const monthStateCount = (m: string, st: string): number => {
    const bucket = statesByMonth[m] || {};
    if (st !== '__other__') return bucket[st] || 0;
    const topSet = new Set(topStates.map(s => s.state));
    return Object.entries(bucket).filter(([k]) => !topSet.has(k)).reduce((s, [, v]) => s + v, 0);
  };
  const maxCell = Math.max(...months.flatMap(m => topStates.map(s => monthStateCount(m, s.state))), 1);
  const heat = (count: number): { bg: string; ink: string } => {
    if (count === 0) return { bg: 'transparent', ink: GRID };
    const idx = Math.min(SEQ.length - 1, Math.floor((count / maxCell) * SEQ.length));
    return { bg: SEQ[idx], ink: idx >= 3 ? '#ffffff' : INK };
  };

  const CHART_H = 150;

  return (
    <div data-tiproot className="relative space-y-4">
      {tooltip.node}

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatTile label="Teams registered" value={totals.total.toLocaleString()} sub="Last 12 months" />
        <StatTile
          label="This month"
          value={thisMonth.total.toLocaleString()}
          sub={`${mom >= 0 ? '+' : ''}${mom} vs ${monthLabel(lastMonth?.month || '')}`}
          accent={mom >= 0 ? '#006300' : undefined}
        />
        <StatTile
          label="Approved"
          value={totals.approved.toLocaleString()}
          sub={`${totals.total ? Math.round((totals.approved / totals.total) * 100) : 0}% of registrations`}
          accent="#0ca30c"
          icon={<svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="#0ca30c" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
        />
        <StatTile
          label="Awaiting approval"
          value={totals.pending.toLocaleString()}
          sub="Registered, not yet approved"
          accent="#a16207"
          icon={<svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="#a16207" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Teams per month */}
        <div className="bg-white rounded-2xl border border-[#e8e8ed] p-5 shadow-[0_1px_10px_-4px_rgba(0,0,0,0.06)]">
          <h3 className="text-sm font-semibold mb-4" style={{ color: INK }}>Teams registered per month</h3>
          <div className="flex items-end gap-1" style={{ height: CHART_H, borderBottom: `1px solid ${GRID}` }}>
            {perMonth.map(m => {
              const h = Math.round((m.total / maxMonthly) * (CHART_H - 24));
              const showLabel = m.total > 0 && (m.month === thisMonth.month || m.month === peakMonth.month);
              return (
                <div key={m.month} className="flex-1 flex flex-col items-center justify-end h-full cursor-default"
                  onMouseMove={e => tooltip.show(e, `<b>${monthLabelFull(m.month)}</b><br/>${m.total} team${m.total !== 1 ? 's' : ''} · ${m.approved} approved`)}
                  onMouseLeave={tooltip.hide}>
                  {showLabel && <span className="text-[11px] font-semibold mb-0.5" style={{ color: INK_2 }}>{m.total}</span>}
                  <div className="w-full max-w-[24px] rounded-t-[4px]" style={{ height: Math.max(m.total > 0 ? 3 : 0, h), background: '#2a78d6' }} />
                </div>
              );
            })}
          </div>
          <div className="flex gap-1 mt-1.5">
            {perMonth.map(m => (
              <span key={m.month} className="flex-1 text-center text-[10px]" style={{ color: INK_MUTED }}>{monthLabel(m.month)}</span>
            ))}
          </div>
        </div>

        {/* Division mix per month */}
        <div className="bg-white rounded-2xl border border-[#e8e8ed] p-5 shadow-[0_1px_10px_-4px_rgba(0,0,0,0.06)]">
          <h3 className="text-sm font-semibold mb-1" style={{ color: INK }}>Divisions per month</h3>
          <div className="flex flex-wrap gap-x-3 gap-y-1 mb-3">
            {legendDivisions.map(dv => (
              <span key={dv} className="inline-flex items-center gap-1.5 text-[11px]" style={{ color: INK_2 }}>
                <span className="w-2.5 h-2.5 rounded-[3px]" style={{ background: divColor(dv) }} />
                {dv}
              </span>
            ))}
          </div>
          <div className="flex items-end gap-1" style={{ height: CHART_H - 24, borderBottom: `1px solid ${GRID}` }}>
            {months.map(m => {
              const monthTotal = legendDivisions.reduce((s, dv) => s + monthDivisionCount(m, dv), 0);
              return (
                <div key={m} className="flex-1 flex flex-col-reverse items-center h-full cursor-default" style={{ gap: 0 }}>
                  {legendDivisions.map(dv => {
                    const count = monthDivisionCount(m, dv);
                    if (count === 0) return null;
                    const h = Math.max(3, Math.round((count / maxDivMonth) * (CHART_H - 48)));
                    return (
                      <div key={dv} className="w-full max-w-[24px]" style={{ height: h, background: divColor(dv), marginTop: 2, borderRadius: monthTotal > 0 ? 2 : 0 }}
                        onMouseMove={e => tooltip.show(e, `<b>${monthLabelFull(m)}</b><br/>${dv}: ${count} team${count !== 1 ? 's' : ''}`)}
                        onMouseLeave={tooltip.hide} />
                    );
                  })}
                </div>
              );
            })}
          </div>
          <div className="flex gap-1 mt-1.5">
            {months.map(m => (
              <span key={m} className="flex-1 text-center text-[10px]" style={{ color: INK_MUTED }}>{monthLabel(m)}</span>
            ))}
          </div>
        </div>
      </div>

      {/* States by month heat table */}
      <div className="bg-white rounded-2xl border border-[#e8e8ed] p-5 shadow-[0_1px_10px_-4px_rgba(0,0,0,0.06)]">
        <h3 className="text-sm font-semibold mb-4" style={{ color: INK }}>Teams by state, per month</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs" style={{ fontVariantNumeric: 'tabular-nums' }}>
            <thead>
              <tr>
                <th className="text-left font-medium py-1.5 pr-3" style={{ color: INK_MUTED }}>State</th>
                {months.map(m => (
                  <th key={m} className="text-center font-medium py-1.5 px-0.5 min-w-[34px]" style={{ color: INK_MUTED }}>{monthLabel(m)}</th>
                ))}
                <th className="text-right font-semibold py-1.5 pl-3" style={{ color: INK_2 }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {topStates.map(s => (
                <tr key={s.state}>
                  <td className="py-0.5 pr-3 font-semibold" style={{ color: INK }}>{s.state}</td>
                  {months.map(m => {
                    const count = monthStateCount(m, s.state);
                    const cell = heat(count);
                    return (
                      <td key={m} className="p-0.5">
                        <div className="rounded-md text-center py-1 font-medium cursor-default" style={{ background: cell.bg, color: count === 0 ? 'transparent' : cell.ink }}
                          onMouseMove={e => tooltip.show(e, `<b>${s.state}</b> · ${monthLabelFull(m)}<br/>${count} team${count !== 1 ? 's' : ''}`)}
                          onMouseLeave={tooltip.hide}>
                          {count || '0'}
                        </div>
                      </td>
                    );
                  })}
                  <td className="py-0.5 pl-3 text-right font-semibold" style={{ color: INK }}>{s.count}</td>
                </tr>
              ))}
              {tailStates.length > 0 && (
                <tr>
                  <td className="py-0.5 pr-3" style={{ color: INK_2 }}>Other ({tailStates.length})</td>
                  {months.map(m => {
                    const count = monthStateCount(m, '__other__');
                    const cell = heat(count);
                    return (
                      <td key={m} className="p-0.5">
                        <div className="rounded-md text-center py-1 font-medium" style={{ background: cell.bg, color: count === 0 ? 'transparent' : cell.ink }}>
                          {count || '0'}
                        </div>
                      </td>
                    );
                  })}
                  <td className="py-0.5 pl-3 text-right font-semibold" style={{ color: INK }}>{tailStates.reduce((s, x) => s + x.count, 0)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
