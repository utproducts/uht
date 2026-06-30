'use client';
import { useState, useEffect, useMemo } from 'react';

const API_BASE = 'https://uht.chad-157.workers.dev/api';

interface EventItem {
  id: string;
  name: string;
  city: string;
  state: string;
  season: string;
  start_date?: string;
}

interface Division {
  id: string;
  age_group?: string;
  division_level?: string;
  age_group_name?: string;
  division_level_name?: string;
}

export default function NotificationsPage() {
  const [tab, setTab] = useState<'compose' | 'history'>('compose');
  const [events, setEvents] = useState<EventItem[]>([]);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ success: boolean; sent?: number; error?: string } | null>(null);

  // Compose form
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState<'event_followers' | 'division' | 'all_users'>('event_followers');
  const [selectedEventId, setSelectedEventId] = useState('');
  const [selectedDivisionId, setSelectedDivisionId] = useState('');
  const [eventSearch, setEventSearch] = useState('');

  const token = typeof window !== 'undefined' ? localStorage.getItem('uht_token') : null;
  const apiFetch = (url: string, opts?: any) => fetch(url, {
    ...opts,
    headers: { ...(opts?.headers || {}), Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });

  // Load ALL events across all seasons
  useEffect(() => {
    apiFetch(`${API_BASE}/events?per_page=200`)
      .then(r => r.json())
      .then(json => {
        if (json.success) setEvents(json.data || []);
      })
      .catch(() => {});
  }, []);

  // Load divisions when an event is selected
  useEffect(() => {
    if (!selectedEventId) {
      setDivisions([]);
      setSelectedDivisionId('');
      return;
    }
    apiFetch(`${API_BASE}/events/${selectedEventId}`)
      .then(r => r.json())
      .then(json => {
        if (json.success && json.data?.divisions) {
          setDivisions(json.data.divisions);
        } else {
          setDivisions([]);
        }
      })
      .catch(() => setDivisions([]));
  }, [selectedEventId]);

  // Group events by season
  const eventsBySeasonArr = useMemo(() => {
    const map = new Map<string, EventItem[]>();
    events.forEach(ev => {
      const season = ev.season || 'Other';
      if (!map.has(season)) map.set(season, []);
      map.get(season)!.push(ev);
    });
    // Sort seasons descending (newest first)
    const sorted = Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
    return sorted;
  }, [events]);

  // Filter events by search
  const filteredEvents = useMemo(() => {
    if (!eventSearch.trim()) return eventsBySeasonArr;
    const q = eventSearch.toLowerCase();
    return eventsBySeasonArr.map(([season, evts]) => {
      const filtered = evts.filter(ev =>
        ev.name.toLowerCase().includes(q) ||
        ev.city?.toLowerCase().includes(q) ||
        ev.state?.toLowerCase().includes(q)
      );
      return [season, filtered] as [string, EventItem[]];
    }).filter(([, evts]) => evts.length > 0);
  }, [eventsBySeasonArr, eventSearch]);

  // Load notification history
  useEffect(() => {
    if (tab === 'history') {
      setLoadingHistory(true);
      apiFetch(`${API_BASE}/push/notifications?limit=100`)
        .then(r => r.json())
        .then(json => {
          if (json.success) setNotifications(json.data?.notifications || []);
          setLoadingHistory(false);
        })
        .catch(() => setLoadingHistory(false));
    }
  }, [tab]);

  const handleSend = async () => {
    if (!title.trim() || !body.trim()) return;
    setSending(true);
    setSendResult(null);

    try {
      let url = '';
      let payload: any = { title: title.trim(), body: body.trim() };

      if (audience === 'all_users') {
        url = `${API_BASE}/push/send-all`;
      } else if (audience === 'division') {
        if (!selectedEventId || !selectedDivisionId) {
          setSendResult({ success: false, error: 'Please select an event and division' });
          setSending(false);
          return;
        }
        url = `${API_BASE}/push/send-division`;
        payload.event_id = selectedEventId;
        payload.event_division_id = selectedDivisionId;
      } else {
        if (!selectedEventId) {
          setSendResult({ success: false, error: 'Please select an event' });
          setSending(false);
          return;
        }
        url = `${API_BASE}/push/send-event`;
        payload.event_id = selectedEventId;
      }

      const res = await apiFetch(url, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      const json = await res.json();

      if (json.success) {
        setSendResult({ success: true, sent: json.data?.sent || 0 });
        setTitle('');
        setBody('');
      } else {
        setSendResult({ success: false, error: json.error || 'Failed to send' });
      }
    } catch (e: any) {
      setSendResult({ success: false, error: e.message || 'Network error' });
    }
    setSending(false);
  };

  const triggerLockerRoomCheck = async () => {
    setSending(true);
    setSendResult(null);
    try {
      const res = await apiFetch(`${API_BASE}/push/check-locker-room-alerts`, { method: 'POST' });
      const json = await res.json();
      if (json.success) {
        setSendResult({
          success: true,
          sent: json.data?.total_sent || 0,
        });
      } else {
        setSendResult({ success: false, error: json.error || 'Failed' });
      }
    } catch (e: any) {
      setSendResult({ success: false, error: e.message });
    }
    setSending(false);
  };

  const selectedEventName = events.find(e => e.id === selectedEventId)?.name || '';

  const canSend = title.trim() && body.trim() && (
    audience === 'all_users' ||
    (audience === 'event_followers' && selectedEventId) ||
    (audience === 'division' && selectedEventId && selectedDivisionId)
  );

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-[#1d1d1f]">Notification Center</h1>
          <p className="text-sm text-[#86868b] mt-1">Send push notifications to app users</p>
        </div>
        <button
          onClick={triggerLockerRoomCheck}
          disabled={sending}
          className="px-4 py-2 rounded-xl bg-amber-500 text-white font-semibold text-sm hover:bg-amber-600 transition disabled:opacity-50"
        >
          Check Locker Room Alerts
        </button>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 bg-[#e8e8ed] rounded-xl p-1 w-fit">
        {(['compose', 'history'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-5 py-2 rounded-lg text-sm font-semibold transition ${
              tab === t ? 'bg-white text-[#1d1d1f] shadow' : 'text-[#6e6e73] hover:text-[#1d1d1f]'
            }`}
          >
            {t === 'compose' ? 'Compose' : 'History'}
          </button>
        ))}
      </div>

      {/* Result toast */}
      {sendResult && (
        <div className={`rounded-xl p-4 flex items-center gap-3 ${sendResult.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
          <svg className={`w-5 h-5 shrink-0 ${sendResult.success ? 'text-green-600' : 'text-red-600'}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            {sendResult.success
              ? <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              : <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            }
          </svg>
          <p className={`text-sm font-medium ${sendResult.success ? 'text-green-800' : 'text-red-800'}`}>
            {sendResult.success ? `Notification sent to ${sendResult.sent} device(s)` : sendResult.error}
          </p>
          <button onClick={() => setSendResult(null)} className="ml-auto text-xs font-medium text-gray-500 hover:text-gray-700">Dismiss</button>
        </div>
      )}

      {tab === 'compose' && (
        <div className="bg-white rounded-2xl shadow-lg p-6 max-w-2xl">
          <h3 className="text-lg font-bold text-[#1d1d1f] mb-5">Send Push Notification</h3>

          {/* Audience */}
          <div className="mb-5">
            <label className="text-sm font-semibold text-[#1d1d1f] mb-2 block">Audience</label>
            <div className="flex gap-3">
              <button
                onClick={() => { setAudience('event_followers'); setSelectedDivisionId(''); }}
                className={`flex-1 px-4 py-3 rounded-xl border-2 text-sm font-semibold transition ${
                  audience === 'event_followers'
                    ? 'border-[#003e79] bg-[#f0f7ff] text-[#003e79]'
                    : 'border-gray-200 text-[#6e6e73] hover:border-gray-300'
                }`}
              >
                <p className="mb-0.5">Event</p>
                <p className="text-xs font-normal text-[#86868b]">All teams in an event</p>
              </button>
              <button
                onClick={() => setAudience('division')}
                className={`flex-1 px-4 py-3 rounded-xl border-2 text-sm font-semibold transition ${
                  audience === 'division'
                    ? 'border-[#003e79] bg-[#f0f7ff] text-[#003e79]'
                    : 'border-gray-200 text-[#6e6e73] hover:border-gray-300'
                }`}
              >
                <p className="mb-0.5">Division</p>
                <p className="text-xs font-normal text-[#86868b]">Specific division only</p>
              </button>
              <button
                onClick={() => { setAudience('all_users'); setSelectedDivisionId(''); }}
                className={`flex-1 px-4 py-3 rounded-xl border-2 text-sm font-semibold transition ${
                  audience === 'all_users'
                    ? 'border-[#003e79] bg-[#f0f7ff] text-[#003e79]'
                    : 'border-gray-200 text-[#6e6e73] hover:border-gray-300'
                }`}
              >
                <p className="mb-0.5">All Users</p>
                <p className="text-xs font-normal text-[#86868b]">Everyone with the app</p>
              </button>
            </div>
          </div>

          {/* Event selector */}
          {(audience === 'event_followers' || audience === 'division') && (
            <div className="mb-5">
              <label className="text-sm font-semibold text-[#1d1d1f] mb-2 block">Select Event</label>
              <input
                type="text"
                value={eventSearch}
                onChange={e => setEventSearch(e.target.value)}
                placeholder="Search events..."
                className="w-full px-4 py-2 rounded-xl border border-gray-200 text-sm focus:border-[#003e79] focus:ring-2 focus:ring-blue-100 outline-none mb-2"
              />
              <div className="border border-gray-200 rounded-xl max-h-52 overflow-y-auto">
                {filteredEvents.length === 0 ? (
                  <div className="px-4 py-6 text-center text-sm text-[#86868b]">No events found</div>
                ) : (
                  filteredEvents.map(([season, evts]) => (
                    <div key={season}>
                      <div className="px-4 py-2 bg-[#fafafa] text-xs font-bold text-[#86868b] uppercase tracking-wide sticky top-0">
                        {season}
                      </div>
                      {evts.map(ev => (
                        <button
                          key={ev.id}
                          onClick={() => { setSelectedEventId(ev.id); setSelectedDivisionId(''); }}
                          className={`w-full text-left px-4 py-2.5 text-sm transition flex items-center justify-between ${
                            selectedEventId === ev.id
                              ? 'bg-[#f0f7ff] text-[#003e79] font-semibold'
                              : 'hover:bg-[#fafafa] text-[#1d1d1f]'
                          }`}
                        >
                          <span>{ev.name}</span>
                          <span className="text-xs text-[#86868b] ml-2">{ev.city}, {ev.state}</span>
                        </button>
                      ))}
                    </div>
                  ))
                )}
              </div>
              {selectedEventId && (
                <p className="mt-2 text-xs text-[#003e79] font-medium">
                  Selected: {selectedEventName}
                </p>
              )}
            </div>
          )}

          {/* Division selector (only when audience is division) */}
          {audience === 'division' && selectedEventId && (
            <div className="mb-5">
              <label className="text-sm font-semibold text-[#1d1d1f] mb-2 block">Select Division</label>
              {divisions.length === 0 ? (
                <p className="text-sm text-[#86868b]">No divisions found for this event</p>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {divisions.map(div => {
                    const label = [div.age_group_name || div.age_group, div.division_level_name || div.division_level].filter(Boolean).join(' ');
                    return (
                      <button
                        key={div.id}
                        onClick={() => setSelectedDivisionId(div.id)}
                        className={`px-4 py-2.5 rounded-xl border-2 text-sm font-semibold transition ${
                          selectedDivisionId === div.id
                            ? 'border-[#003e79] bg-[#f0f7ff] text-[#003e79]'
                            : 'border-gray-200 text-[#6e6e73] hover:border-gray-300'
                        }`}
                      >
                        {label || 'Division'}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Title */}
          <div className="mb-5">
            <label className="text-sm font-semibold text-[#1d1d1f] mb-2 block">Title</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Schedule Update"
              maxLength={100}
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:border-[#003e79] focus:ring-2 focus:ring-blue-100 outline-none"
            />
            <p className="text-xs text-[#86868b] mt-1">{title.length}/100</p>
          </div>

          {/* Body */}
          <div className="mb-6">
            <label className="text-sm font-semibold text-[#1d1d1f] mb-2 block">Message</label>
            <textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              placeholder="Write your notification message..."
              rows={4}
              maxLength={500}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:border-[#003e79] focus:ring-2 focus:ring-blue-100 outline-none resize-none"
            />
            <p className="text-xs text-[#86868b] mt-1">{body.length}/500</p>
          </div>

          {/* Send */}
          <button
            onClick={handleSend}
            disabled={sending || !canSend}
            className={`w-full py-3 rounded-xl font-semibold text-sm transition ${
              sending || !canSend
                ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                : 'bg-[#003e79] text-white hover:bg-[#002d5a] shadow-sm'
            }`}
          >
            {sending ? 'Sending...' : 'Send Notification'}
          </button>
        </div>
      )}

      {tab === 'history' && (
        <div className="bg-white rounded-2xl shadow-lg p-6">
          <h3 className="text-lg font-bold text-[#1d1d1f] mb-4">Notification History</h3>

          {loadingHistory ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#003e79]" />
            </div>
          ) : notifications.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-[#86868b]">No notifications sent yet.</p>
            </div>
          ) : (
            <div className="border border-[#e8e8ed] rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#fafafa] text-[#86868b] text-xs uppercase tracking-wide">
                    <th className="px-4 py-2 text-left">Title</th>
                    <th className="px-4 py-2 text-left">Message</th>
                    <th className="px-4 py-2 text-left">Type</th>
                    <th className="px-4 py-2 text-left">Audience</th>
                    <th className="px-4 py-2 text-center">Sent</th>
                    <th className="px-4 py-2 text-left">Date</th>
                    <th className="px-4 py-2 text-left">Sent By</th>
                  </tr>
                </thead>
                <tbody>
                  {notifications.map((n: any) => (
                    <tr key={n.id} className="border-t border-[#e8e8ed] hover:bg-[#fafafa]">
                      <td className="px-4 py-3 font-medium text-[#1d1d1f] max-w-[180px] truncate">{n.title}</td>
                      <td className="px-4 py-3 text-[#6e6e73] max-w-[200px] truncate">{n.body}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          n.type === 'locker_room' || n.type === 'locker_room_auto'
                            ? 'bg-amber-100 text-amber-800'
                            : n.type === 'broadcast'
                            ? 'bg-purple-100 text-purple-800'
                            : n.type === 'event_update'
                            ? 'bg-blue-100 text-blue-800'
                            : n.type === 'division_update'
                            ? 'bg-teal-100 text-teal-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}>
                          {n.type === 'locker_room_auto' ? 'Auto Locker' : n.type === 'division_update' ? 'Division' : n.type.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[#6e6e73] text-xs">{n.audience?.replace(/_/g, ' ')}</td>
                      <td className="px-4 py-3 text-center font-semibold text-[#1d1d1f]">{n.sent_count}</td>
                      <td className="px-4 py-3 text-[#6e6e73] text-xs">
                        {n.created_at ? new Date(n.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'}
                      </td>
                      <td className="px-4 py-3 text-[#6e6e73] text-xs">{n.sent_by_name || n.sent_by || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
