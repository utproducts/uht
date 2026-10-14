'use client';

import { useEffect, useState } from 'react';

const API = 'https://uht.chad-157.workers.dev';

const LABELS: Record<string, { title: string; options: Record<string, string> }> = {
  interest: {
    title: 'Interest in a glow in the dark tournament',
    options: { very: 'Very interested', somewhat: 'Somewhat interested', not: 'Not interested' },
  },
  format: {
    title: 'Preferred format',
    options: { all_glow: 'All games glow', hybrid: 'Hybrid (some glow, some normal)', either: 'Either sounds fun' },
  },
  cost_reaction: {
    title: 'Reaction to higher cost (glow uniforms etc.)',
    options: { still_in: 'Still in', depends: 'Depends how much higher', probably_out: 'Probably rules us out' },
  },
  travel: {
    title: 'Travel vs home city',
    options: { would_travel: 'Would travel', home_city_only: 'Home city / area only', either: 'Either works' },
  },
};

const BAR_COLORS = ['#00a650', '#f59e0b', '#ef4444'];

export default function SurveysAdminPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const hdrs = (): any => ({ 'X-Dev-Bypass': 'true', ...(typeof window !== 'undefined' && localStorage.getItem('uht_token') ? { Authorization: `Bearer ${localStorage.getItem('uht_token')}` } : {}) });

  useEffect(() => {
    fetch(`${API}/api/surveys/glow-2026/summary`, { headers: hdrs() })
      .then(r => r.json())
      .then(j => { if (j.success) setData(j.data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const exportCsv = () => {
    if (!data?.responses?.length) return;
    const cols = ['created_at', 'name', 'email', 'city', 'interest', 'format', 'cost_reaction', 'travel', 'comments'];
    const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [cols.join(','), ...data.responses.map((r: any) => cols.map(c => esc(r[c])).join(','))].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'glow-survey-responses.csv';
    a.click();
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#1d1d1f]">Glow Tournament Survey</h1>
          <p className="text-sm text-[#6e6e73] mt-1">
            {loading ? 'Loading…' : `${data?.total ?? 0} response${data?.total === 1 ? '' : 's'} so far`} ·{' '}
            <a href="https://ultimatetournaments.com/survey/glow" target="_blank" className="text-[#0077b6] font-medium">open the live form</a>
          </p>
        </div>
        <button onClick={exportCsv} disabled={!data?.responses?.length}
          className="px-4 py-2 rounded-xl bg-[#003e79] text-white text-sm font-semibold disabled:opacity-40">
          Export CSV
        </button>
      </div>

      {/* Overview bars */}
      <div className="grid md:grid-cols-2 gap-5 mb-8">
        {Object.entries(LABELS).map(([field, cfg]) => {
          const counts = data?.counts?.[field] || {};
          const totalAnswered = Object.values(counts).reduce((s: number, n: any) => s + n, 0) as number;
          return (
            <div key={field} className="bg-white rounded-2xl shadow p-5">
              <h3 className="text-sm font-bold text-[#1d1d1f] mb-3">{cfg.title}</h3>
              {totalAnswered === 0 ? (
                <p className="text-xs text-[#86868b]">No answers yet.</p>
              ) : (
                <div className="space-y-2.5">
                  {Object.entries(cfg.options).map(([v, label], i) => {
                    const n = counts[v] || 0;
                    const pct = totalAnswered ? Math.round((n / totalAnswered) * 100) : 0;
                    return (
                      <div key={v}>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-[#3d3d3d] font-medium">{label}</span>
                          <span className="text-[#6e6e73]">{n} · {pct}%</span>
                        </div>
                        <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: BAR_COLORS[i] || '#003e79' }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Responses table */}
      <div className="bg-white rounded-2xl shadow overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="text-sm font-bold text-[#1d1d1f]">Individual responses</h3>
        </div>
        {!data?.responses?.length ? (
          <p className="text-sm text-[#86868b] px-5 py-6">Nothing yet - responses appear here the moment someone submits.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-[#6e6e73] border-b border-gray-100">
                  <th className="px-4 py-2.5">When</th>
                  <th className="px-4 py-2.5">Who</th>
                  <th className="px-4 py-2.5">City</th>
                  <th className="px-4 py-2.5">Interest</th>
                  <th className="px-4 py-2.5">Format</th>
                  <th className="px-4 py-2.5">Cost</th>
                  <th className="px-4 py-2.5">Travel</th>
                  <th className="px-4 py-2.5">Comments</th>
                </tr>
              </thead>
              <tbody>
                {data.responses.map((r: any) => (
                  <tr key={r.id} className="border-b border-gray-50">
                    <td className="px-4 py-2.5 text-[#6e6e73] whitespace-nowrap">{String(r.created_at).slice(0, 16)}</td>
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-[#1d1d1f]">{r.name || '—'}</div>
                      <div className="text-[#6e6e73]">{r.email || ''}</div>
                    </td>
                    <td className="px-4 py-2.5 text-[#3d3d3d]">{r.city || '—'}</td>
                    <td className="px-4 py-2.5">{LABELS.interest.options[r.interest] || '—'}</td>
                    <td className="px-4 py-2.5">{LABELS.format.options[r.format] || '—'}</td>
                    <td className="px-4 py-2.5">{LABELS.cost_reaction.options[r.cost_reaction] || '—'}</td>
                    <td className="px-4 py-2.5">{LABELS.travel.options[r.travel] || '—'}</td>
                    <td className="px-4 py-2.5 text-[#3d3d3d] max-w-[220px]">{r.comments || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
