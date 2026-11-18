'use client';

/*
  ADMIN: LIGHTS OUT INVITATIONAL - invite requests from /lights-out.
  Every request lands pending; the star claim is pre-checked against
  game_three_stars (green check = found on a scoresheet). Approving
  sends the "you're in" email to the parent.
*/

import { useEffect, useState } from 'react';

const API = 'https://uht.chad-157.workers.dev/api/lights-out';

function hdrs(extra?: Record<string, string>): Record<string, string> {
  return {
    'X-Dev-Bypass': 'true',
    ...(typeof window !== 'undefined' && localStorage.getItem('uht_token') ? { Authorization: `Bearer ${localStorage.getItem('uht_token')}` } : {}),
    ...extra,
  };
}

const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  pending_payment: 'bg-gray-50 text-gray-500 border-gray-200',
  approved: 'bg-green-50 text-green-700 border-green-200',
  denied: 'bg-red-50 text-red-600 border-red-200',
  invite_requested: 'bg-[#f0f7ff] text-[#0077b0] border-[#bfe0f5]',
  invite_approved: 'bg-green-50 text-green-700 border-green-200',
  invite_denied: 'bg-red-50 text-red-600 border-red-200',
};
const STATUS_LABELS: Record<string, string> = {
  pending: 'PAID - AWAITING APPROVAL',
  pending_payment: 'CHECKOUT NOT COMPLETED',
  approved: 'APPROVED',
  denied: 'DENIED',
  invite_requested: 'INVITE REQUEST - NO STAR',
  invite_approved: 'CODE SENT - AWAITING REGISTRATION',
  invite_denied: 'REQUEST DENIED',
};

export default function LightsOutAdminPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'registered' | 'incomplete' | 'pending' | 'approved' | 'denied' | 'requests'>('all');
  const [testEmail, setTestEmail] = useState('');
  const [sizesMsg, setSizesMsg] = useState('');
  const [sizesBusy, setSizesBusy] = useState(false);

  const sendSizesTest = async () => {
    const to = testEmail.trim();
    if (!to.includes('@')) { setSizesMsg('Enter the email to send the test to.'); return; }
    setSizesBusy(true);
    setSizesMsg('');
    try {
      const res = await fetch(`${API}/admin/test-sizes-email`, { method: 'POST', headers: hdrs({ 'Content-Type': 'application/json' }), body: JSON.stringify({ to }) });
      const j = await res.json();
      setSizesMsg(j.success ? `Test sent to ${to} (sample player: ${j.data?.sample_player}). Check your inbox, click everything.` : (j.error || 'Test failed.'));
    } catch { setSizesMsg('Test failed - try again.'); }
    setSizesBusy(false);
  };

  const sendSizesBlast = async (count: number) => {
    if (!window.confirm(`Send the sizes email to ${count} famil${count === 1 ? 'y' : 'ies'} that have not gotten one yet? Each gets their own link, and nobody is ever emailed twice.`)) return;
    setSizesBusy(true);
    setSizesMsg('');
    try {
      const res = await fetch(`${API}/admin/send-sizes-emails`, { method: 'POST', headers: hdrs() });
      const j = await res.json();
      setSizesMsg(j.success ? `Sent ${j.data?.sent} emails${j.data?.failed?.length ? ` - FAILED for: ${j.data.failed.join(', ')}` : '.'}` : (j.error || 'Send failed.'));
      load();
    } catch { setSizesMsg('Send failed - try again.'); }
    setSizesBusy(false);
  };

  const load = async () => {
    try {
      const res = await fetch(`${API}/admin/requests`, { headers: hdrs() });
      const j = await res.json();
      if (j.success) setRows(j.data || []);
    } catch {}
    setLoaded(true);
  };
  useEffect(() => { load(); }, []);

  const setStatus = async (id: string, status: string) => {
    setBusy(id);
    try {
      const res = await fetch(`${API}/admin/requests/${id}`, {
        method: 'PATCH', headers: hdrs({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ status }),
      });
      const j = await res.json();
      if (j.success) setRows(prev => prev.map(r => r.id === id ? { ...r, status } : r));
    } catch {}
    setBusy(null);
  };

  // Registered = actually paid (matches the overview tile). Incomplete =
  // started checkout, never paid. Requests = the invite_* family.
  const isReq = (r: any) => String(r.status).startsWith('invite_');
  const isPaid = (r: any) => !isReq(r) && (r.amount_paid_cents || 0) > 0;
  const counts = { all: rows.length, registered: 0, incomplete: 0, pending: 0, approved: 0, denied: 0, requests: 0 } as Record<string, number>;
  for (const r of rows) {
    counts[r.status] = (counts[r.status] || 0) + 1;
    if (isReq(r)) counts.requests++;
    else if (isPaid(r)) counts.registered++;
    else counts.incomplete++;
  }
  const visible = rows.filter(r => {
    if (filter === 'all') return true;
    if (filter === 'requests') return isReq(r);
    if (filter === 'registered') return isPaid(r);
    if (filter === 'incomplete') return !isReq(r) && !isPaid(r);
    return r.status === filter;
  });

  return (
    <div className="max-w-5xl mx-auto px-6 py-6">
      <h1 className="text-2xl font-bold text-[#1d1d1f]">Lights Out Invitational</h1>
      <p className="text-sm text-[#6e6e73] mt-1 mb-5">
        Invite requests from the Lights Out page. The star claim is checked against the scoresheets automatically -
        approving sends the confirmation email to the family.
      </p>

      {/* Age-group rollup: big number = paid registrations, sub-line splits
          by birth year and shows open invite requests. Divisions use the
          current (2026-27) season - what each kid is right now. */}
      {loaded && rows.length > 0 && (() => {
        const divisionOf = (by: any): string => {
          const y = parseInt(String(by || '').trim(), 10);
          if (!y || y < 2004 || y > 2023) return 'Unknown';
          if (y >= 2018) return 'Mite';
          if (y >= 2016) return 'Squirt';
          if (y >= 2014) return 'Pee Wee';
          if (y >= 2012) return 'Bantam';
          return 'Midget';
        };
        const ORDER = ['Mite', 'Squirt', 'Pee Wee', 'Bantam', 'Midget', 'Unknown'];
        const posOf = (p: any): string => {
          const s = String(p || '').trim().toUpperCase();
          if (s.startsWith('F')) return 'F';
          if (s.startsWith('D')) return 'D';
          if (s.startsWith('G')) return 'G';
          return '?';
        };
        const agg: Record<string, { paid: number; req: number; years: Record<string, number>; pos: Record<string, number> }> = {};
        for (const r of rows) {
          if (!isPaid(r) && !isReq(r)) continue; // abandoned checkouts don't count
          const d = divisionOf(r.birth_year);
          const a = (agg[d] = agg[d] || { paid: 0, req: 0, years: {}, pos: {} });
          if (isPaid(r)) {
            a.paid++;
            const yk = String(r.birth_year || '?').trim();
            a.years[yk] = (a.years[yk] || 0) + 1;
            const pk = posOf(r.position);
            a.pos[pk] = (a.pos[pk] || 0) + 1;
          } else a.req++;
        }
        const shown = ORDER.filter(d => agg[d]);
        if (shown.length === 0) return null;
        return (
          <div className="mb-5">
            <p className="text-[11px] font-bold text-[#86868b] uppercase tracking-widest mb-2">Registered by age group</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {shown.map(d => (
                <div key={d} className="bg-white border border-[#e8e8ed] rounded-2xl px-4 py-3 shadow-sm">
                  <p className="text-[11px] font-bold text-[#6e6e73] uppercase tracking-wide">{d}</p>
                  <p className="text-2xl font-black text-[#003e79] leading-tight">{agg[d].paid}</p>
                  <p className="text-[11px] text-[#86868b] font-semibold leading-snug">
                    {Object.entries(agg[d].years).sort((a2, b2) => a2[0].localeCompare(b2[0])).map(([y, n]) => `${y}: ${n}`).join(' · ') || 'none paid yet'}
                    {agg[d].req ? `${Object.keys(agg[d].years).length ? ' · ' : ''}+${agg[d].req} requested` : ''}
                  </p>
                  {agg[d].paid > 0 && (
                    <p className="text-[11px] text-[#0a6ebd] font-bold leading-snug mt-0.5">
                      {(['F', 'D', 'G', '?'] as const)
                        .filter(k => agg[d].pos[k])
                        .map(k => `${k === 'F' ? 'Fwd' : k === 'D' ? 'Def' : k === 'G' ? 'Goalie' : 'N/A'} ${agg[d].pos[k]}`)
                        .join(' · ')}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Swag order: jersey + tee size totals across paid registrations, so
          ordering is one glance - plus who still has not picked */}
      {loaded && (() => {
        const paid = rows.filter((r: any) => isPaid(r));
        if (paid.length === 0) return null;
        const unsent = paid.filter((r: any) => !r.sizes_email_sent_at).length;
        const allEmailed = unsent === 0;
        const count = (key: 'jersey_size' | 'tee_size') => {
          const m: Record<string, number> = {};
          for (const r of paid) { const v = (r as any)[key]; if (v) m[v] = (m[v] || 0) + 1; }
          return m;
        };
        const ORDER2 = ['Youth S', 'Youth M', 'Youth L', 'Youth XL', 'Adult S', 'Adult M', 'Adult L', 'Adult XL', 'Adult XXL'];
        const js = count('jersey_size'); const ts = count('tee_size');
        const missing = paid.filter((r: any) => !r.jersey_size || !r.tee_size).length;
        const exportSwag = () => {
          const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
          const header = ['Player', 'Name on Jersey', 'Number', 'Cut', 'Jersey Size', 'Tee Size', 'Team', 'Birth Year', 'Parent Email'];
          const lines = [header.join(',')];
          for (const r of [...paid].sort((a: any, b: any) => String(a.player_name).localeCompare(String(b.player_name)))) {
            const raw = String(r.jersey_size || '');
            const goalie = raw.startsWith('Goalie Cut ');
            lines.push([
              r.player_name,
              r.jersey_name || String(r.player_name || '').trim().split(/\s+/).slice(-1)[0] || '',
              r.jersey_number_request || r.jersey_number || '',
              goalie ? 'Goalie Cut' : (raw ? 'Regular' : ''),
              goalie ? raw.slice(11) : raw,
              r.tee_size || '',
              r.team_name || '',
              r.birth_year || '',
              r.email || '',
            ].map(esc).join(','));
          }
          const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = `lights-out-swag-order-${new Date().toISOString().slice(0, 10)}.csv`;
          a.click();
          URL.revokeObjectURL(a.href);
        };
        const line = (m: Record<string, number>) => {
          const extras = Object.keys(m).filter(sz => !ORDER2.includes(sz)).sort();
          const parts = [...ORDER2.filter(sz => m[sz]), ...extras].map(sz => `${sz}: ${m[sz]}`);
          return parts.join(' · ') || 'none picked yet';
        };
        return (
          <div className={`border rounded-2xl px-4 py-3 shadow-sm mb-5 ${allEmailed ? 'bg-emerald-50 border-emerald-300' : 'bg-white border-[#e8e8ed]'}`}>
            <div className="flex items-center justify-between flex-wrap gap-2 mb-1.5">
              <p className={`text-[11px] font-bold uppercase tracking-widest ${allEmailed ? 'text-emerald-700' : 'text-[#86868b]'}`}>
                Swag order ({paid.length} players){allEmailed ? ' - approved, all families emailed' : ''}
              </p>
              <button onClick={exportSwag}
                className="px-3 py-1 rounded-full text-xs font-bold border border-[#003e79] text-[#003e79] bg-white hover:bg-[#f0f7ff]">
                Export swag order
              </button>
            </div>
            <p className="text-sm text-[#1d1d1f]"><span className="font-bold text-[#003e79]">Jerseys</span> · {line(js)}</p>
            <p className="text-sm text-[#1d1d1f] mt-0.5"><span className="font-bold text-[#003e79]">Tees</span> · {line(ts)}</p>
            {missing > 0 && <p className="text-xs font-semibold text-amber-600 mt-1">{missing} player{missing !== 1 ? 's' : ''} still missing a size</p>}
            {(() => {
              return (
                <div className={`mt-3 pt-3 border-t ${allEmailed ? 'border-emerald-200' : 'border-[#f0f0f2]'}`}>
                  <p className="text-[11px] font-bold text-[#86868b] uppercase tracking-widest mb-2">Sizes email</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <input type="email" value={testEmail} onChange={e => setTestEmail(e.target.value)}
                      placeholder="you@email.com"
                      className="border border-[#e0e0e5] rounded-lg px-3 py-1.5 text-sm w-52 focus:ring-2 focus:ring-[#003e79]/20 outline-none" />
                    <button onClick={sendSizesTest} disabled={sizesBusy}
                      className="px-4 py-1.5 rounded-full text-sm font-semibold border border-[#003e79] text-[#003e79] hover:bg-[#f0f7ff] disabled:opacity-50">
                      Send me a test
                    </button>
                    {unsent > 0 && (
                      <button onClick={() => sendSizesBlast(unsent)} disabled={sizesBusy}
                        className="px-4 py-1.5 rounded-full text-sm font-semibold bg-[#003e79] text-white hover:bg-[#00315f] disabled:opacity-50">
                        {`Approve + email ${unsent} famil${unsent === 1 ? 'y' : 'ies'}`}
                      </button>
                    )}
                  </div>
                  {sizesMsg && <p className="text-xs font-semibold text-[#0a6ebd] mt-2">{sizesMsg}</p>}
                  <p className="text-[11px] text-[#86868b] mt-1.5">
                    The test uses a real player so every link works - the size form, the social graphic, and the balance button. The real send skips anyone already emailed.
                  </p>
                </div>
              );
            })()}
          </div>
        );
      })()}

      <div className="flex flex-wrap gap-2 mb-5">
        {(['all', 'registered', 'requests', 'incomplete', 'pending', 'approved', 'denied'] as const).map(fk => (
          <button key={fk} onClick={() => setFilter(fk)}
            className={`px-4 py-1.5 rounded-full text-sm font-semibold border transition ${filter === fk ? 'bg-[#003e79] text-white border-[#003e79]' : 'bg-white text-[#3d3d3d] border-[#e8e8ed] hover:border-[#003e79]/40'}`}>
            {fk === 'all' ? 'All' : fk[0].toUpperCase() + fk.slice(1)} ({counts[fk] || 0})
          </button>
        ))}
      </div>

      {!loaded ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#003e79]" /></div>
      ) : visible.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-[#e8e8ed] p-10 text-center text-sm text-[#86868b]">
          {rows.length === 0 ? 'No invite requests yet.' : 'Nothing with that status.'}
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((r) => (
            <div key={r.id} className="bg-white rounded-2xl shadow-sm border border-[#e8e8ed] p-5">
              <div className="flex flex-wrap items-start gap-3">
                <div className="flex-1 min-w-[220px]">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-base font-bold text-[#1d1d1f]">{r.player_name}{r.jersey_number ? ` #${r.jersey_number}` : ''}</p>
                    <span className={`text-[11px] font-bold border rounded-full px-2.5 py-0.5 uppercase ${STATUS_STYLES[r.status] || STATUS_STYLES.pending}`}>{STATUS_LABELS[r.status] || r.status}</span>
                    {!!r.paid_at && (
                      <span className="text-[11px] font-bold border rounded-full px-2.5 py-0.5 bg-green-50 text-green-700 border-green-200">
                        PAID ${((r.amount_paid_cents || 0) / 100).toLocaleString()}{r.payment_plan === 'deposit' ? ' DEPOSIT' : ' IN FULL'}
                      </span>
                    )}
                    {!!r.paid_at && r.payment_plan === 'deposit' && (r.amount_paid_cents || 0) < 55000 && (
                      <span className="text-[11px] font-bold border rounded-full px-2.5 py-0.5 bg-blue-50 text-blue-700 border-blue-200">
                        ${((55000 - (r.amount_paid_cents || 0)) / 100).toLocaleString()} BALANCE DUE
                      </span>
                    )}
                    <span className={`text-[11px] font-bold rounded-full px-2.5 py-0.5 border ${r.star_verified ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-600 border-red-200'}`}>
                      {r.star_verified ? 'STAR VERIFIED' : 'STAR NOT FOUND'}
                    </span>
                  </div>
                  <p className="text-sm text-[#3d3d3d] mt-1">{r.team_name}{r.birth_year ? ` · ${r.birth_year}` : ''}{r.position ? ` · ${r.position}` : ''}</p>
                  {(r.jersey_size || r.tee_size || r.jersey_number_request || r.jersey_name) && (
                    <p className="text-xs font-semibold text-[#0a6ebd] mt-0.5">
                      {(r.jersey_name || r.jersey_number_request) ? `${r.jersey_name || '(no name)'}${r.jersey_number_request ? ` #${r.jersey_number_request}` : ''} · ` : ''}
                      {r.jersey_size ? `Jersey ${r.jersey_size}` : 'Jersey size missing'}{' · '}{r.tee_size ? `Tee ${r.tee_size}` : 'Tee size missing'}
                    </p>
                  )}
                  {r.star_event_id === 'invite-request'
                    ? <p className="text-xs text-[#0077b0] mt-1 font-semibold">No star - requested an invite{r.invite_code ? <> · code <b className="tracking-widest">{r.invite_code}</b></> : ''}</p>
                    : <p className="text-xs text-[#6e6e73] mt-1">Star earned at: <b>{r.star_event_name || r.star_event_id}</b></p>}
                  {r.notes && String(r.notes).startsWith('Invite request') && (
                    <p className="text-xs text-[#3d3d3d] mt-1 italic">{String(r.notes).replace('Invite request: ', '').replace('Invite request (no star)', '')}</p>
                  )}
                  <p className="text-xs text-[#6e6e73] mt-0.5">{r.parent_name} · {r.email}{r.phone ? ` · ${r.phone}` : ''}</p>
                  <p className="text-[11px] text-[#86868b] mt-1">Requested {String(r.created_at || '').slice(0, 16).replace('T', ' ')}</p>
                  {(!!r.paid_at || ['approved', 'pending'].includes(String(r.status))) && (
                    <a href={`https://uht.chad-157.workers.dev/api/lights-out/share/${r.id}.png`} target="_blank" rel="noreferrer"
                      className="inline-block text-xs text-[#0077b0] font-semibold underline underline-offset-2 mt-1">
                      View social graphic
                    </a>
                  )}
                </div>
                <div className="flex gap-2 shrink-0">
                  {String(r.status).startsWith('invite_') ? (
                    <>
                      {r.status !== 'invite_approved' && (
                        <button onClick={() => setStatus(r.id, 'invite_approved')} disabled={busy === r.id}
                          className="px-4 py-2 rounded-xl bg-green-600 text-white text-xs font-bold hover:bg-green-700 transition disabled:opacity-50">
                          Approve + Send Code
                        </button>
                      )}
                      {r.status !== 'invite_denied' && (
                        <button onClick={() => setStatus(r.id, 'invite_denied')} disabled={busy === r.id}
                          className="px-4 py-2 rounded-xl bg-white border border-red-200 text-red-600 text-xs font-bold hover:bg-red-50 transition disabled:opacity-50">
                          Deny
                        </button>
                      )}
                    </>
                  ) : (<>
                  {r.status !== 'approved' && (
                    <button onClick={() => setStatus(r.id, 'approved')} disabled={busy === r.id}
                      className="px-4 py-2 rounded-xl bg-green-600 text-white text-xs font-bold hover:bg-green-700 transition disabled:opacity-50">
                      Approve + Email
                    </button>
                  )}
                  {r.status !== 'denied' && (
                    <button onClick={() => setStatus(r.id, 'denied')} disabled={busy === r.id}
                      className="px-4 py-2 rounded-xl bg-white border border-red-200 text-red-600 text-xs font-bold hover:bg-red-50 transition disabled:opacity-50">
                      Deny
                    </button>
                  )}
                  {r.status !== 'pending' && (
                    <button onClick={() => setStatus(r.id, 'pending')} disabled={busy === r.id}
                      className="px-4 py-2 rounded-xl bg-white border border-[#e8e8ed] text-[#6e6e73] text-xs font-bold hover:border-[#003e79]/40 transition disabled:opacity-50">
                      Back to Pending
                    </button>
                  )}
                  </>)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
