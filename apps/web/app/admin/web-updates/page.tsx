'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://uht.chad-157.workers.dev';

function authHeaders(): Record<string, string> {
  return {
    'X-Dev-Bypass': 'true',
    ...(typeof window !== 'undefined' && localStorage.getItem('uht_token')
      ? { Authorization: `Bearer ${localStorage.getItem('uht_token')}` }
      : {}),
  };
}

interface UpdateRequest {
  id: string;
  title: string;
  description: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  page_url: string | null;
  screenshot_url: string | null;
  status: 'new' | 'in_progress' | 'done' | 'needs_info' | 'declined';
  requested_by_name: string | null;
  requested_by_email: string | null;
  result_notes: string | null;
  created_at: string;
  completed_at: string | null;
}

const STATUS_STYLES: Record<string, string> = {
  new: 'bg-blue-100 text-blue-700',
  in_progress: 'bg-amber-100 text-amber-700',
  done: 'bg-green-100 text-green-700',
  needs_info: 'bg-purple-100 text-purple-700',
  declined: 'bg-gray-100 text-gray-500',
};
const STATUS_LABELS: Record<string, string> = {
  new: 'New', in_progress: 'In Progress', done: 'Done', needs_info: 'Needs Info', declined: 'Declined',
};
const PRIORITY_STYLES: Record<string, string> = {
  urgent: 'bg-red-100 text-red-700',
  high: 'bg-orange-100 text-orange-700',
  normal: 'bg-gray-100 text-gray-600',
  low: 'bg-gray-50 text-gray-400',
};

export default function WebUpdatesPage() {
  const [requests, setRequests] = useState<UpdateRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState<'open' | 'done' | 'all'>('open');
  const [expanded, setExpanded] = useState<string | null>(null);

  // New request form
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<'low' | 'normal' | 'high' | 'urgent'>('normal');
  const [pageUrl, setPageUrl] = useState('');
  const [screenshotUrl, setScreenshotUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/web-updates`, { headers: authHeaders() });
      const json = await res.json() as any;
      if (json.success) setRequests(json.data || []);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleScreenshot = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`${API}/api/upload/image`, { method: 'POST', body: fd });
      const json = await res.json() as any;
      if (json.success && json.url) setScreenshotUrl(json.url);
      else setMessage('Screenshot upload failed — you can still submit without it.');
    } catch {
      setMessage('Screenshot upload failed — you can still submit without it.');
    }
    setUploading(false);
  };

  const submit = async () => {
    if (title.trim().length < 3 || description.trim().length < 3) {
      setMessage('Please give the request a title and describe what you want changed.');
      return;
    }
    setSubmitting(true);
    setMessage('');
    try {
      const res = await fetch(`${API}/api/web-updates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          priority,
          page_url: pageUrl.trim() || null,
          screenshot_url: screenshotUrl || null,
        }),
      });
      const json = await res.json() as any;
      if (json.success) {
        setTitle(''); setDescription(''); setPriority('normal'); setPageUrl(''); setScreenshotUrl('');
        setShowForm(false);
        setMessage('Added to the log — you\'ll get an email when it\'s done.');
        load();
      } else {
        setMessage(json.error || 'Failed to submit request.');
      }
    } catch {
      setMessage('Network error — please try again.');
    }
    setSubmitting(false);
  };

  const setStatus = async (id: string, status: string) => {
    try {
      await fetch(`${API}/api/web-updates/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ status }),
      });
      load();
    } catch {}
  };

  const visible = filter === 'open'
    ? requests.filter(r => r.status === 'new' || r.status === 'in_progress' || r.status === 'needs_info')
    : filter === 'done'
      ? requests.filter(r => r.status === 'done')
      : requests;

  const fmtDate = (s: string) => {
    try {
      const d = new Date(s.replace(' ', 'T') + 'Z');
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' · ' +
        d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    } catch { return s; }
  };

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-bold text-[#1d1d1f]">Web Updates</h1>
        <button onClick={() => { setShowForm(f => !f); setMessage(''); }}
          className="px-4 py-2 rounded-xl bg-[#003e79] text-white text-sm font-semibold hover:bg-[#002d5a] transition">
          {showForm ? 'Cancel' : '+ New Update'}
        </button>
      </div>
      <p className="text-sm text-[#6e6e73] mb-5">
        The running log of site changes — what&apos;s needed, what&apos;s in progress, and everything that&apos;s shipped.
        Be specific (which page, exact wording, a screenshot) and you&apos;ll get an email when your item is done.
      </p>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        {[
          { label: 'Open', value: requests.filter(r => ['new', 'needs_info'].includes(r.status)).length, color: 'text-[#003e79]' },
          { label: 'In Progress', value: requests.filter(r => r.status === 'in_progress').length, color: 'text-amber-600' },
          { label: 'Completed', value: requests.filter(r => r.status === 'done').length, color: 'text-green-600' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-2xl border border-[#e8e8ed] px-4 py-3 text-center">
            <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-[#86868b]">{s.label}</div>
          </div>
        ))}
      </div>

      {message && (
        <div className="p-3 mb-4 rounded-xl bg-blue-50 border border-blue-200 text-sm text-blue-800">{message}</div>
      )}

      {showForm && (
        <div className="bg-white rounded-2xl border border-[#e8e8ed] p-5 mb-6 space-y-4">
          <div>
            <label className="text-sm font-medium text-[#3d3d3d] block mb-1">What do you want changed?</label>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Swap the Windmill Cup banner photo"
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:border-[#003e79] focus:ring-2 focus:ring-[#003e79]/10 outline-none text-sm" />
          </div>
          <div>
            <label className="text-sm font-medium text-[#3d3d3d] block mb-1">Details</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={4}
              placeholder="Describe exactly what should change and where. Include exact wording if it's a text change."
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:border-[#003e79] focus:ring-2 focus:ring-[#003e79]/10 outline-none text-sm" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-[#3d3d3d] block mb-1">Page (optional)</label>
              <input value={pageUrl} onChange={e => setPageUrl(e.target.value)} placeholder="https://ultimatetournaments.com/..."
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:border-[#003e79] focus:ring-2 focus:ring-[#003e79]/10 outline-none text-sm" />
            </div>
            <div>
              <label className="text-sm font-medium text-[#3d3d3d] block mb-1">Priority</label>
              <select value={priority} onChange={e => setPriority(e.target.value as any)}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:border-[#003e79] outline-none text-sm bg-white">
                <option value="low">Low — whenever</option>
                <option value="normal">Normal</option>
                <option value="high">High — soon please</option>
                <option value="urgent">Urgent — affecting customers now</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-[#3d3d3d] block mb-1">Screenshot (optional)</label>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleScreenshot(f); }} />
            {screenshotUrl ? (
              <div className="flex items-center gap-3">
                <img src={screenshotUrl} alt="screenshot" className="h-16 rounded-lg border border-gray-200" />
                <button onClick={() => setScreenshotUrl('')} className="text-xs text-red-600 font-semibold">Remove</button>
              </div>
            ) : (
              <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
                className="px-4 py-2 rounded-xl border border-gray-200 text-sm text-[#3d3d3d] hover:bg-gray-50 transition">
                {uploading ? 'Uploading...' : 'Attach screenshot'}
              </button>
            )}
          </div>
          <button onClick={submit} disabled={submitting}
            className="px-5 py-2.5 rounded-xl bg-[#003e79] text-white text-sm font-semibold hover:bg-[#002d5a] disabled:bg-gray-300 transition">
            {submitting ? 'Submitting...' : 'Submit Request'}
          </button>
        </div>
      )}

      <div className="flex gap-2 mb-4">
        {(['open', 'done', 'all'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition ${filter === f ? 'bg-[#003e79] text-white' : 'bg-white border border-gray-200 text-[#6e6e73] hover:bg-gray-50'}`}>
            {f === 'open'
              ? `Open (${requests.filter(r => ['new', 'in_progress', 'needs_info'].includes(r.status)).length})`
              : f === 'done'
                ? `Completed (${requests.filter(r => r.status === 'done').length})`
                : `All (${requests.length})`}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-[#86868b] text-sm py-8 text-center">Loading...</div>
      ) : visible.length === 0 ? (
        <div className="bg-white rounded-2xl border border-[#e8e8ed] p-10 text-center text-[#86868b] text-sm">
          {filter === 'open' ? 'No open items — all caught up! 🎉' : filter === 'done' ? 'Nothing completed yet.' : 'No updates logged yet.'}
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map(r => (
            <div key={r.id} className="bg-white rounded-2xl border border-[#e8e8ed] p-4 cursor-pointer" onClick={() => setExpanded(expanded === r.id ? null : r.id)}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold text-[#1d1d1f] text-sm">{r.title}</div>
                  <div className="text-xs text-[#86868b] mt-0.5">
                    {r.requested_by_name || r.requested_by_email || 'Unknown'} · {fmtDate(r.created_at)}
                    {r.status === 'done' && r.completed_at && <span className="text-green-600"> · completed {fmtDate(r.completed_at)}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {r.priority !== 'normal' && (
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${PRIORITY_STYLES[r.priority]}`}>{r.priority}</span>
                  )}
                  <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${STATUS_STYLES[r.status]}`}>{STATUS_LABELS[r.status]}</span>
                </div>
              </div>
              {expanded === r.id && (
                <div className="mt-3 pt-3 border-t border-[#f5f5f7]" onClick={e => e.stopPropagation()}>
                  <p className="text-sm text-[#3d3d3d] whitespace-pre-wrap">{r.description}</p>
                  {r.page_url && (
                    <p className="text-xs mt-2"><a href={r.page_url} target="_blank" rel="noreferrer" className="text-[#003e79] underline">{r.page_url}</a></p>
                  )}
                  {r.screenshot_url && (
                    <a href={r.screenshot_url} target="_blank" rel="noreferrer">
                      <img src={r.screenshot_url} alt="screenshot" className="mt-2 max-h-48 rounded-lg border border-gray-200" />
                    </a>
                  )}
                  {r.result_notes && (
                    <div className="mt-3 bg-[#f5f5f7] rounded-xl p-3">
                      <p className="text-xs font-semibold text-[#003e79] mb-1">Result</p>
                      <p className="text-sm text-[#1d1d1f] whitespace-pre-wrap">{r.result_notes}</p>
                    </div>
                  )}
                  <div className="flex gap-2 mt-3">
                    {r.status !== 'done' && (
                      <button onClick={() => setStatus(r.id, 'done')} className="px-3 py-1.5 rounded-lg bg-green-50 text-green-700 text-xs font-semibold border border-green-200 hover:bg-green-100 transition">Mark Done</button>
                    )}
                    {(r.status === 'done' || r.status === 'declined') && (
                      <button onClick={() => setStatus(r.id, 'new')} className="px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 text-xs font-semibold border border-blue-200 hover:bg-blue-100 transition">Reopen</button>
                    )}
                    {r.status !== 'declined' && r.status !== 'done' && (
                      <button onClick={() => setStatus(r.id, 'declined')} className="px-3 py-1.5 rounded-lg bg-gray-50 text-gray-500 text-xs font-semibold border border-gray-200 hover:bg-gray-100 transition">Cancel Request</button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
