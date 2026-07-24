'use client';

import { useState, useEffect, useCallback } from 'react';

const API = 'https://uht.chad-157.workers.dev';

function authHeaders(): Record<string, string> {
  return {
    'X-Dev-Bypass': 'true',
    ...(typeof window !== 'undefined' && localStorage.getItem('uht_token')
      ? { Authorization: `Bearer ${localStorage.getItem('uht_token')}` }
      : {}),
  };
}

interface Submission {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  interest: string | null;
  message: string;
  status: string;
  created_at: string;
}

const STATUS_TABS = [
  { key: 'all', label: 'All' },
  { key: 'new', label: 'New' },
  { key: 'replied', label: 'Replied' },
  { key: 'archived', label: 'Archived' },
  { key: 'spam', label: 'Spam' },
];

const statusColors: Record<string, string> = {
  new: 'bg-blue-100 text-blue-700',
  replied: 'bg-green-100 text-green-700',
  archived: 'bg-[#e8e8ed] text-[#6e6e73]',
  spam: 'bg-red-100 text-red-700',
};

export default function InquiriesPage() {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('all');
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`${API}/api/contacts/submissions`, { headers: authHeaders() })
      .then(r => r.json())
      .then(json => setSubmissions(json.data || []))
      .catch(() => setSubmissions([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const setStatus = async (id: string, status: string) => {
    setSubmissions(prev => prev.map(s => (s.id === id ? { ...s, status } : s)));
    await fetch(`${API}/api/contacts/submissions/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ status }),
    }).catch(() => load());
  };

  const filtered = tab === 'all' ? submissions.filter(s => s.status !== 'spam') : submissions.filter(s => s.status === tab);
  const newCount = submissions.filter(s => s.status === 'new').length;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#1d1d1f]">Contact Inquiries</h1>
          <p className="text-sm text-[#6e6e73] mt-1">
            Messages from the website contact form{newCount > 0 ? ` — ${newCount} new` : ''}
          </p>
        </div>
        <button
          onClick={load}
          className="px-4 py-2 rounded-full text-sm font-semibold text-[#003e79] bg-[#f0f7ff] hover:bg-[#e0efff] transition-colors"
        >
          Refresh
        </button>
      </div>

      {/* Status tabs */}
      <div className="flex gap-2 mb-5 flex-wrap">
        {STATUS_TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
              tab === t.key ? 'bg-[#003e79] text-white' : 'bg-white text-[#6e6e73] border border-[#e8e8ed] hover:bg-[#fafafa]'
            }`}
          >
            {t.label}
            {t.key === 'new' && newCount > 0 && (
              <span className={`ml-1.5 text-xs ${tab === t.key ? 'text-white/80' : 'text-blue-600'}`}>{newCount}</span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-16 text-[#6e6e73]">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-[#e8e8ed] p-12 text-center text-[#6e6e73]">
          No {tab === 'all' ? '' : tab + ' '}inquiries yet.
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(s => (
            <div key={s.id} className="bg-white rounded-2xl border border-[#e8e8ed] p-5">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-[#1d1d1f]">{s.name}</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[s.status] || statusColors.new}`}>
                      {s.status}
                    </span>
                    {s.interest && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-[#f0f7ff] text-[#003e79]">{s.interest}</span>
                    )}
                  </div>
                  <div className="text-sm text-[#6e6e73] mt-1 flex items-center gap-3 flex-wrap">
                    <a href={`mailto:${s.email}`} className="hover:text-[#003e79]">{s.email}</a>
                    {s.phone && <span>{s.phone}</span>}
                    <span>{new Date(s.created_at.replace(' ', 'T') + 'Z').toLocaleString()}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <a
                    href={`mailto:${s.email}?subject=${encodeURIComponent('Re: Your message to Ultimate Tournaments')}`}
                    onClick={() => s.status === 'new' && setStatus(s.id, 'replied')}
                    className="px-3 py-1.5 rounded-full text-xs font-semibold text-white bg-[#003e79] hover:bg-[#002d5a] transition-colors"
                  >
                    Reply
                  </a>
                  {s.status !== 'replied' && (
                    <button onClick={() => setStatus(s.id, 'replied')} className="px-3 py-1.5 rounded-full text-xs font-semibold text-green-700 bg-green-50 hover:bg-green-100 transition-colors">
                      Mark Replied
                    </button>
                  )}
                  {s.status !== 'archived' && (
                    <button onClick={() => setStatus(s.id, 'archived')} className="px-3 py-1.5 rounded-full text-xs font-semibold text-[#6e6e73] bg-[#fafafa] hover:bg-[#e8e8ed] transition-colors">
                      Archive
                    </button>
                  )}
                  {s.status !== 'spam' ? (
                    <button onClick={() => setStatus(s.id, 'spam')} className="px-3 py-1.5 rounded-full text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 transition-colors">
                      Spam
                    </button>
                  ) : (
                    <button onClick={() => setStatus(s.id, 'new')} className="px-3 py-1.5 rounded-full text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 transition-colors">
                      Not Spam
                    </button>
                  )}
                </div>
              </div>
              <div className="mt-3">
                <p
                  className={`text-sm text-[#3d3d3d] whitespace-pre-wrap ${expanded === s.id ? '' : 'line-clamp-3'}`}
                  onClick={() => setExpanded(expanded === s.id ? null : s.id)}
                  style={{ cursor: 'pointer' }}
                >
                  {s.message}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
