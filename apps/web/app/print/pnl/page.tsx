'use client';

/*
  PRINT-READY EVENT P&L - /print/pnl?event=<id>
  Clean document view (logo, event details, full P&L) that opens the
  browser print dialog, so admins can print or save as PDF.
  Requires an admin login in this browser (same token as /admin).
*/

import { useEffect, useState } from 'react';

const API = 'https://uht.chad-157.workers.dev/api/financials';

const CATEGORY_LABELS: Record<string, string> = {
  ice: 'Ice / Rink', referees: 'Referees', hotels: 'Hotels', awards: 'Awards',
  staff: 'Staff', marketing: 'Marketing', insurance: 'Insurance', travel: 'Travel',
  supplies: 'Supplies', other: 'Other',
};

export default function PnlPrintPage() {
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('event') || '';
    if (!id) { setErr('Missing event'); return; }
    fetch(`${API}/event-pnl/${id}`, {
      headers: {
        'X-Dev-Bypass': 'true',
        ...(localStorage.getItem('uht_token') ? { Authorization: `Bearer ${localStorage.getItem('uht_token')}` } : {}),
      },
    })
      .then(r => r.json())
      .then(j => {
        if (j.success) { setData(j.data); setTimeout(() => window.print(), 600); }
        else setErr('Could not load the P&L - make sure you are signed in as admin.');
      })
      .catch(() => setErr('Could not load the P&L'));
  }, []);

  if (err) return <div style={{ padding: 40, fontFamily: 'Arial' }}>{err}</div>;
  if (!data) return <div style={{ padding: 40, fontFamily: 'Arial' }}>Preparing P&amp;L…</div>;

  const { event, revenue, revenueByDivision, expenses, expenseTotals, rebates, summary } = data;
  const fmt = (c: number) => `$${((c || 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtDate = (d: string) => d ? new Date(String(d).slice(0, 10) + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '';
  const hotelRebates = (rebates || []).filter((r: any) => r.rebate_type !== 'other');
  const vendorRebates = (rebates || []).filter((r: any) => r.rebate_type === 'other');

  const sectionTitle = { fontSize: 13, fontWeight: 800 as const, color: '#003e79', letterSpacing: 1.5, textTransform: 'uppercase' as const, borderBottom: '2px solid #00ccff', paddingBottom: 4, margin: '22px 0 10px' };
  const row = { display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 0', borderBottom: '1px solid #f0f0f3' };

  return (
    <div style={{ fontFamily: 'Arial, Helvetica, sans-serif', maxWidth: 760, margin: '0 auto', padding: '36px 28px', color: '#1d2b3d' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 18, borderBottom: '3px solid #003e79', paddingBottom: 16 }}>
        {event.logo_url && <img src={event.logo_url} alt="" style={{ width: 84, height: 84, objectFit: 'contain' }} />}
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, letterSpacing: 2.5, color: '#b8860b', fontWeight: 800 }}>EVENT PROFIT &amp; LOSS</div>
          <div style={{ fontSize: 24, fontWeight: 900, color: '#003e79' }}>{event.name}</div>
          <div style={{ fontSize: 13, color: '#5b6b80', marginTop: 2 }}>
            {fmtDate(event.start_date)}{event.end_date && event.end_date !== event.start_date ? ` - ${fmtDate(event.end_date)}` : ''} · {event.city}, {event.state}
          </div>
        </div>
        <img src="/uht-logo.png" alt="UHT" style={{ height: 54, width: 'auto' }} />
      </div>

      {/* Summary */}
      <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
        {[['Revenue', fmt(summary.total_revenue_cents), '#15803d'], ['Expenses', fmt(summary.total_expenses_cents), '#dc2626'], ['Rebates', fmt(summary.total_rebates_cents), '#2563eb'], [summary.net_income_cents >= 0 ? 'Net Profit' : 'Net Loss', fmt(summary.net_income_cents), summary.net_income_cents >= 0 ? '#15803d' : '#dc2626']].map(([label, val, color]) => (
          <div key={label as string} style={{ flex: 1, border: '1px solid #e3eaf3', borderRadius: 10, padding: '10px 8px', textAlign: 'center' }}>
            <div style={{ fontSize: 17, fontWeight: 900, color: color as string }}>{val}</div>
            <div style={{ fontSize: 10, color: '#8295ab', fontWeight: 700, letterSpacing: 1, marginTop: 2, textTransform: 'uppercase' }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Revenue by Division */}
      <div style={sectionTitle}>Revenue by Division</div>
      {revenue?.team_count > 0 && <div style={{ fontSize: 12, color: '#8295ab', marginBottom: 6 }}>{revenue.paid_teams} paid / {revenue.unpaid_teams} unpaid of {revenue.team_count} teams</div>}
      {(revenueByDivision || []).filter((d: any) => (d.team_count || 0) > 0).map((d: any) => (
        <div key={d.age_group + (d.division_level || '')} style={row}>
          <span>{d.age_group}{d.division_level ? ` ${d.division_level}` : ''} <span style={{ color: '#8295ab' }}>({d.team_count} teams)</span></span>
          <b>{fmt(d.revenue_cents)}</b>
        </div>
      ))}

      {/* Expenses */}
      <div style={sectionTitle}>Expenses by Category</div>
      {(expenseTotals || []).length === 0 ? <div style={{ fontSize: 12, color: '#8295ab' }}>No expenses recorded.</div> :
        (expenseTotals || []).map((et: any) => (
          <div key={et.category} style={row}>
            <span>{CATEGORY_LABELS[et.category] || et.category} <span style={{ color: '#8295ab' }}>({et.line_items} items)</span></span>
            <b style={{ color: '#dc2626' }}>{fmt(et.total_cents)}</b>
          </div>
        ))}
      {(expenses || []).length > 0 && (
        <>
          <div style={{ fontSize: 11, color: '#8295ab', fontWeight: 700, margin: '10px 0 4px', letterSpacing: 1 }}>LINE ITEMS</div>
          {(expenses || []).map((ex: any) => (
            <div key={ex.id} style={{ ...row, fontSize: 12 }}>
              <span>{ex.description}{ex.vendor ? ` · ${ex.vendor}` : ''}{ex.date ? ` · ${ex.date}` : ''}</span>
              <span>{fmt(ex.amount_cents)}</span>
            </div>
          ))}
        </>
      )}

      {/* Rebates */}
      <div style={sectionTitle}>Hotel Rebates</div>
      {hotelRebates.length === 0 ? <div style={{ fontSize: 12, color: '#8295ab' }}>None recorded.</div> :
        hotelRebates.map((rb: any) => (
          <div key={rb.id} style={row}>
            <span>{rb.hotel_name}{rb.room_nights ? ` · ${rb.room_nights} blocks` : ''}</span>
            <b style={{ color: '#2563eb' }}>{fmt(rb.total_rebate_cents)}</b>
          </div>
        ))}
      {vendorRebates.length > 0 && (
        <>
          <div style={sectionTitle}>Other Vendor Rebates</div>
          {vendorRebates.map((rb: any) => (
            <div key={rb.id} style={row}>
              <span>{rb.hotel_name}{rb.notes ? ` · ${rb.notes}` : ''}</span>
              <b style={{ color: '#2563eb' }}>{fmt(rb.total_rebate_cents)}</b>
            </div>
          ))}
        </>
      )}

      <div style={{ marginTop: 26, paddingTop: 10, borderTop: '2px solid #003e79', display: 'flex', justifyContent: 'space-between', fontSize: 15, fontWeight: 900 }}>
        <span>NET {summary.net_income_cents >= 0 ? 'PROFIT' : 'LOSS'}</span>
        <span style={{ color: summary.net_income_cents >= 0 ? '#15803d' : '#dc2626' }}>{fmt(summary.net_income_cents)}</span>
      </div>
      <div style={{ fontSize: 10, color: '#8295ab', textAlign: 'center', marginTop: 22 }}>
        Ultimate Hockey Tournaments · Generated {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
      </div>
    </div>
  );
}
