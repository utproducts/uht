'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

const API_BASE = 'https://uht.chad-157.workers.dev/api';
const devHeaders = { 'X-Dev-Bypass': 'true' };
const authFetch = (url: string, opts: RequestInit = {}) =>
  fetch(url, { ...opts, headers: { ...devHeaders, ...(opts.headers || {}) } });

// Types
interface Conversation {
  id: string;
  contact_id: string | null;
  phone_number: string;
  contact_name: string | null;
  is_read: number;
  last_message_at: string;
  last_message: string | null;
  last_message_time: string | null;
  unread_count: number;
}

interface Message {
  id: string;
  conversation_id: string;
  direction: 'inbound' | 'outbound';
  body: string;
  status: string;
  sent_by: string | null;
  sent_by_name: string | null;
  created_at: string;
}

interface FilterEvent {
  id: string;
  name: string;
  city: string;
  state: string;
}

// Helpers
const timeAgo = (dateStr: string | null) => {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const fmtMessageTime = (dateStr: string) => {
  const d = new Date(dateStr);
  const today = new Date();
  const isToday = d.toDateString() === today.toDateString();
  if (isToday) return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};

const initials = (name: string | null) => {
  if (!name || name.startsWith('+')) return '?';
  return name.split(' ').filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase();
};

// ==========================================
// BROADCAST MODAL
// ==========================================
function BroadcastModal({
  onClose,
  onSent,
}: {
  onClose: () => void;
  onSent: () => void;
}) {
  const [step, setStep] = useState<'filter' | 'compose' | 'confirm'>('filter');
  const [events, setEvents] = useState<FilterEvent[]>([]);
  const [ageGroups, setAgeGroups] = useState<string[]>([]);
  const [filterType, setFilterType] = useState('event');
  const [selectedEvent, setSelectedEvent] = useState('');
  const [selectedAgeGroup, setSelectedAgeGroup] = useState('');
  const [message, setMessage] = useState('');
  const [recipientCount, setRecipientCount] = useState(0);
  const [recipientPreview, setRecipientPreview] = useState<any[]>([]);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<any>(null);

  useEffect(() => {
    authFetch(`${API_BASE}/sms/filters`).then(r => r.json()).then(json => {
      if (json.success) {
        setEvents(json.data.events || []);
        setAgeGroups(json.data.ageGroups || []);
      }
    });
  }, []);

  const previewRecipients = async () => {
    const filter: any = { type: filterType };
    if (filterType.includes('event')) filter.eventId = selectedEvent;
    if (filterType.includes('age_group')) filter.ageGroup = selectedAgeGroup;

    const res = await authFetch(`${API_BASE}/sms/recipients/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filter }),
    });
    const json = await res.json();
    if (json.success) {
      setRecipientCount(json.data.count);
      setRecipientPreview(json.data.recipients || []);
      setStep('compose');
    }
  };

  const sendBroadcast = async () => {
    setSending(true);
    const filter: any = { type: filterType };
    if (filterType.includes('event')) filter.eventId = selectedEvent;
    if (filterType.includes('age_group')) filter.ageGroup = selectedAgeGroup;

    const res = await authFetch(`${API_BASE}/sms/broadcast`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, filter }),
    });
    const json = await res.json();
    setSending(false);
    if (json.success) {
      setResult(json.data);
      setStep('confirm');
    } else {
      alert('Error: ' + (json.error || 'Send failed'));
    }
  };

  const filterOptions = [
    { value: 'event', label: 'All participants in an event' },
    { value: 'event_coaches', label: 'Coaches/managers in an event' },
    { value: 'event_age_group', label: 'Participants in age group' },
    { value: 'event_age_group_coaches', label: 'Coaches in age group' },
    { value: 'all_contacts', label: 'All contacts in database' },
  ];

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="bg-gradient-to-r from-[#003e79] to-[#005599] rounded-t-2xl px-6 py-4 flex items-center justify-between">
          <h3 className="text-white font-bold text-lg">Broadcast Message</h3>
          <button onClick={onClose} className="text-white/70 hover:text-white text-2xl leading-none">&times;</button>
        </div>

        <div className="p-6 space-y-4">
          {step === 'filter' && (
            <>
              <div>
                <label className="block text-xs text-[#86868b] uppercase tracking-widest font-semibold mb-1.5">Send To</label>
                <select value={filterType} onChange={e => setFilterType(e.target.value)}
                  className="w-full border border-[#e8e8ed] rounded-xl p-2.5 text-[#1d1d1f] text-sm outline-none focus:ring-2 focus:ring-[#003e79]/20">
                  {filterOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>

              {filterType.includes('event') && (
                <div>
                  <label className="block text-xs text-[#86868b] uppercase tracking-widest font-semibold mb-1.5">Event</label>
                  <select value={selectedEvent} onChange={e => setSelectedEvent(e.target.value)}
                    className="w-full border border-[#e8e8ed] rounded-xl p-2.5 text-[#1d1d1f] text-sm outline-none focus:ring-2 focus:ring-[#003e79]/20">
                    <option value="">Select event...</option>
                    {events.map(e => <option key={e.id} value={e.id}>{e.name} — {e.city}, {e.state}</option>)}
                  </select>
                </div>
              )}

              {filterType.includes('age_group') && (
                <div>
                  <label className="block text-xs text-[#86868b] uppercase tracking-widest font-semibold mb-1.5">Age Group</label>
                  <select value={selectedAgeGroup} onChange={e => setSelectedAgeGroup(e.target.value)}
                    className="w-full border border-[#e8e8ed] rounded-xl p-2.5 text-[#1d1d1f] text-sm outline-none focus:ring-2 focus:ring-[#003e79]/20">
                    <option value="">Select age group...</option>
                    {ageGroups.map(ag => <option key={ag} value={ag}>{ag}</option>)}
                  </select>
                </div>
              )}

              <button onClick={previewRecipients}
                disabled={filterType.includes('event') && !selectedEvent}
                className="w-full px-4 py-3 bg-[#003e79] text-white rounded-full text-sm font-semibold hover:bg-[#002d5a] disabled:bg-[#86868b] transition">
                Preview Recipients
              </button>
            </>
          )}

          {step === 'compose' && (
            <>
              <div className="bg-[#f0f7ff] border border-[#003e79]/20 rounded-xl p-4">
                <div className="text-sm font-semibold text-[#003e79]">{recipientCount} recipient{recipientCount !== 1 ? 's' : ''}</div>
                <div className="mt-2 space-y-1 max-h-32 overflow-y-auto">
                  {recipientPreview.map((r, i) => (
                    <div key={i} className="text-xs text-[#3d3d3d]">
                      {r.name}{r.team ? ` · ${r.team}` : ''}{r.ageGroup ? ` (${r.ageGroup})` : ''}
                    </div>
                  ))}
                  {recipientCount > 20 && <div className="text-xs text-[#86868b]">...and {recipientCount - 20} more</div>}
                </div>
              </div>

              <div>
                <label className="block text-xs text-[#86868b] uppercase tracking-widest font-semibold mb-1.5">Message</label>
                <textarea value={message} onChange={e => setMessage(e.target.value)}
                  rows={4} placeholder="Type your message..."
                  className="w-full border border-[#e8e8ed] rounded-xl p-3 text-[#1d1d1f] text-sm outline-none focus:ring-2 focus:ring-[#003e79]/20 resize-none" />
                <div className="text-right text-[10px] text-[#86868b] mt-1">{message.length} / 160 characters</div>
              </div>

              <div className="flex gap-2">
                <button onClick={() => setStep('filter')}
                  className="flex-1 px-4 py-3 border border-[#e8e8ed] text-[#3d3d3d] rounded-full text-sm font-semibold hover:bg-[#fafafa] transition">
                  Back
                </button>
                <button onClick={sendBroadcast} disabled={!message.trim() || sending}
                  className="flex-1 px-4 py-3 bg-[#003e79] text-white rounded-full text-sm font-semibold hover:bg-[#002d5a] disabled:bg-[#86868b] transition">
                  {sending ? 'Sending...' : `Send to ${recipientCount}`}
                </button>
              </div>
            </>
          )}

          {step === 'confirm' && result && (
            <div className="text-center py-4">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-green-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </div>
              <h4 className="font-bold text-[#1d1d1f] text-lg">Messages Sent</h4>
              <p className="text-sm text-[#6e6e73] mt-2">{result.sent} of {result.totalRecipients} delivered{result.failed > 0 ? ` · ${result.failed} failed` : ''}</p>
              <button onClick={() => { onSent(); onClose(); }}
                className="mt-6 px-6 py-3 bg-[#003e79] text-white rounded-full text-sm font-semibold hover:bg-[#002d5a] transition">
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ==========================================
// NEW CONVERSATION MODAL
// ==========================================
function NewConvoModal({ onClose, onCreated }: { onClose: () => void; onCreated: (convoId: string) => void }) {
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    if (!phone.trim() || !message.trim()) return;
    setSending(true);
    const res = await authFetch(`${API_BASE}/sms/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, message }),
    });
    const json = await res.json();
    setSending(false);
    if (json.success) {
      onCreated(json.data.conversationId);
      onClose();
    } else {
      alert('Error: ' + (json.error || 'Send failed'));
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full" onClick={e => e.stopPropagation()}>
        <div className="bg-gradient-to-r from-[#003e79] to-[#005599] rounded-t-2xl px-6 py-4 flex items-center justify-between">
          <h3 className="text-white font-bold text-lg">New Message</h3>
          <button onClick={onClose} className="text-white/70 hover:text-white text-2xl leading-none">&times;</button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs text-[#86868b] uppercase tracking-widest font-semibold mb-1.5">Phone Number</label>
            <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="(555) 123-4567"
              className="w-full border border-[#e8e8ed] rounded-xl p-2.5 text-[#1d1d1f] text-sm outline-none focus:ring-2 focus:ring-[#003e79]/20" />
          </div>
          <div>
            <label className="block text-xs text-[#86868b] uppercase tracking-widest font-semibold mb-1.5">Message</label>
            <textarea value={message} onChange={e => setMessage(e.target.value)} rows={3} placeholder="Type your message..."
              className="w-full border border-[#e8e8ed] rounded-xl p-3 text-[#1d1d1f] text-sm outline-none focus:ring-2 focus:ring-[#003e79]/20 resize-none" />
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="flex-1 px-4 py-2.5 border border-[#e8e8ed] text-[#3d3d3d] rounded-full text-sm font-semibold hover:bg-[#fafafa] transition">Cancel</button>
            <button onClick={handleSend} disabled={!phone.trim() || !message.trim() || sending}
              className="flex-1 px-4 py-2.5 bg-[#003e79] text-white rounded-full text-sm font-semibold hover:bg-[#002d5a] disabled:bg-[#86868b] transition">
              {sending ? 'Sending...' : 'Send'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// MAIN COMPONENT
// ==========================================
export default function AdminCommsPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvo, setActiveConvo] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [showBroadcast, setShowBroadcast] = useState(false);
  const [showNewConvo, setShowNewConvo] = useState(false);
  const [tab, setTab] = useState<'sms' | 'email'>('sms');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Load conversations
  const loadConversations = useCallback(async () => {
    const params = searchQuery ? `?search=${encodeURIComponent(searchQuery)}` : '';
    const res = await authFetch(`${API_BASE}/sms/conversations${params}`);
    const json = await res.json();
    if (json.success) setConversations(json.data || []);
    setLoading(false);
  }, [searchQuery]);

  useEffect(() => { loadConversations(); }, [loadConversations]);

  // Poll for new messages every 10s
  useEffect(() => {
    const interval = setInterval(loadConversations, 10000);
    return () => clearInterval(interval);
  }, [loadConversations]);

  // Load messages when conversation changes
  useEffect(() => {
    if (!activeConvo) { setMessages([]); return; }
    authFetch(`${API_BASE}/sms/conversations/${activeConvo.id}/messages`)
      .then(r => r.json())
      .then(json => {
        if (json.success) setMessages(json.data || []);
        setTimeout(scrollToBottom, 100);
      });
  }, [activeConvo]);

  useEffect(scrollToBottom, [messages]);

  // Send message
  const handleSend = async () => {
    if (!activeConvo || !newMessage.trim()) return;
    setSendingMessage(true);
    const res = await authFetch(`${API_BASE}/sms/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId: activeConvo.id, message: newMessage }),
    });
    const json = await res.json();
    setSendingMessage(false);
    if (json.success) {
      setNewMessage('');
      // Reload messages
      const msgRes = await authFetch(`${API_BASE}/sms/conversations/${activeConvo.id}/messages`);
      const msgJson = await msgRes.json();
      if (msgJson.success) setMessages(msgJson.data || []);
      loadConversations();
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const unreadCount = conversations.filter(c => c.unread_count > 0).length;

  return (
    <div className="bg-[#fafafa] min-h-full flex flex-col" style={{ height: 'calc(100vh - 64px)' }}>
      {/* Header */}
      <div className="max-w-full px-6 pt-4 pb-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-extrabold text-[#1d1d1f]">Communications</h1>
          {/* Tab toggle */}
          <div className="flex gap-1 bg-[#e8e8ed] rounded-xl p-1">
            {(['sms', 'email'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition ${tab === t ? 'bg-white text-[#1d1d1f] shadow' : 'text-[#6e6e73] hover:text-[#1d1d1f]'}`}>
                {t === 'sms' ? 'Texting' : 'Email'}
                {t === 'sms' && unreadCount > 0 && (
                  <span className="ml-1.5 inline-flex items-center justify-center w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full">{unreadCount}</span>
                )}
              </button>
            ))}
          </div>
        </div>
        {tab === 'sms' && (
          <div className="flex gap-2">
            <button onClick={() => setShowNewConvo(true)}
              className="px-4 py-2 border border-[#003e79] text-[#003e79] hover:bg-[#f0f7ff] rounded-full text-sm font-semibold transition">
              New Message
            </button>
            <button onClick={() => setShowBroadcast(true)}
              className="px-4 py-2 bg-[#003e79] text-white hover:bg-[#002d5a] rounded-full text-sm font-semibold transition">
              Broadcast
            </button>
          </div>
        )}
      </div>

      {tab === 'sms' ? (
        /* SMS Tab — WhatsApp-style layout */
        <div className="flex-1 flex mx-4 mb-4 bg-white rounded-2xl border border-[#e8e8ed] shadow-[0_1px_20px_-6px_rgba(0,0,0,0.08)] overflow-hidden" style={{ minHeight: 0 }}>
          {/* Conversation List (left panel) */}
          <div className="w-80 border-r border-[#e8e8ed] flex flex-col">
            {/* Search */}
            <div className="p-3 border-b border-[#e8e8ed]">
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search conversations..."
                className="w-full bg-[#fafafa] border border-[#e8e8ed] rounded-xl px-3 py-2 text-sm text-[#1d1d1f] outline-none focus:ring-2 focus:ring-[#003e79]/20"
              />
            </div>

            {/* Conversation items */}
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="p-4 text-center text-[#86868b] text-sm">Loading...</div>
              ) : conversations.length === 0 ? (
                <div className="p-6 text-center">
                  <p className="text-[#86868b] text-sm">No conversations yet</p>
                  <p className="text-[#86868b] text-xs mt-1">Send a message or broadcast to get started</p>
                </div>
              ) : (
                conversations.map(convo => (
                  <button
                    key={convo.id}
                    onClick={() => setActiveConvo(convo)}
                    className={`w-full text-left px-4 py-3 flex gap-3 items-start hover:bg-[#fafafa] transition border-b border-[#e8e8ed]/50 ${
                      activeConvo?.id === convo.id ? 'bg-[#f0f7ff]' : ''
                    }`}
                  >
                    {/* Avatar */}
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                      convo.unread_count > 0 ? 'bg-[#003e79] text-white' : 'bg-[#e8e8ed] text-[#6e6e73]'
                    }`}>
                      {initials(convo.contact_name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className={`text-sm truncate ${convo.unread_count > 0 ? 'font-bold text-[#1d1d1f]' : 'font-medium text-[#3d3d3d]'}`}>
                          {convo.contact_name || convo.phone_number}
                        </span>
                        <span className="text-[10px] text-[#86868b] flex-shrink-0 ml-2">{timeAgo(convo.last_message_time || convo.last_message_at)}</span>
                      </div>
                      <div className="flex items-center justify-between mt-0.5">
                        <p className={`text-xs truncate ${convo.unread_count > 0 ? 'text-[#1d1d1f]' : 'text-[#86868b]'}`}>
                          {convo.last_message || 'No messages'}
                        </p>
                        {convo.unread_count > 0 && (
                          <span className="inline-flex items-center justify-center w-5 h-5 bg-[#003e79] text-white text-[10px] font-bold rounded-full flex-shrink-0 ml-2">
                            {convo.unread_count}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Message Thread (right panel) */}
          <div className="flex-1 flex flex-col">
            {activeConvo ? (
              <>
                {/* Thread header */}
                <div className="px-6 py-3 border-b border-[#e8e8ed] flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-[#003e79] text-white flex items-center justify-center text-xs font-bold">
                    {initials(activeConvo.contact_name)}
                  </div>
                  <div>
                    <div className="font-semibold text-[#1d1d1f] text-sm">{activeConvo.contact_name || activeConvo.phone_number}</div>
                    <div className="text-[10px] text-[#86868b]">{activeConvo.phone_number}</div>
                  </div>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3 bg-[#fafafa]">
                  {messages.map(msg => (
                    <div key={msg.id} className={`flex ${msg.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[70%] rounded-2xl px-4 py-2.5 ${
                        msg.direction === 'outbound'
                          ? 'bg-[#003e79] text-white rounded-br-md'
                          : 'bg-white border border-[#e8e8ed] text-[#1d1d1f] rounded-bl-md'
                      }`}>
                        <p className="text-sm whitespace-pre-wrap">{msg.body}</p>
                        <div className={`text-[10px] mt-1 ${msg.direction === 'outbound' ? 'text-white/60' : 'text-[#86868b]'}`}>
                          {fmtMessageTime(msg.created_at)}
                          {msg.direction === 'outbound' && msg.sent_by_name && ` · ${msg.sent_by_name}`}
                          {msg.direction === 'outbound' && (
                            <span className="ml-1">
                              {msg.status === 'delivered' ? '✓✓' : msg.status === 'sent' ? '✓' : msg.status === 'failed' ? '✗' : '○'}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>

                {/* Input */}
                <div className="px-4 py-3 border-t border-[#e8e8ed] bg-white">
                  <div className="flex gap-2 items-end">
                    <textarea
                      ref={inputRef}
                      value={newMessage}
                      onChange={e => setNewMessage(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="Type a message..."
                      rows={1}
                      className="flex-1 border border-[#e8e8ed] rounded-xl px-4 py-2.5 text-sm text-[#1d1d1f] outline-none focus:ring-2 focus:ring-[#003e79]/20 resize-none"
                      style={{ maxHeight: 120 }}
                    />
                    <button
                      onClick={handleSend}
                      disabled={!newMessage.trim() || sendingMessage}
                      className="w-10 h-10 bg-[#003e79] text-white rounded-full flex items-center justify-center hover:bg-[#002d5a] disabled:bg-[#86868b] transition flex-shrink-0"
                    >
                      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" /></svg>
                    </button>
                  </div>
                </div>
              </>
            ) : (
              /* Empty state */
              <div className="flex-1 flex items-center justify-center text-center p-8">
                <div>
                  <div className="w-20 h-20 bg-[#fafafa] rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-10 h-10 text-[#86868b]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <h3 className="font-semibold text-[#3d3d3d] text-lg">Select a conversation</h3>
                  <p className="text-sm text-[#86868b] mt-1">Choose from the list or start a new message</p>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Email Tab — redirect to dedicated email page */
        <div className="flex-1 mx-4 mb-4 bg-white rounded-2xl border border-[#e8e8ed] shadow-[0_1px_20px_-6px_rgba(0,0,0,0.08)] flex items-center justify-center">
          <div className="text-center p-8">
            <div className="w-20 h-20 bg-[#f0f7ff] rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-10 h-10 text-[#003e79]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="2" y="4" width="20" height="16" rx="2" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M22 7l-10 7L2 7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h3 className="font-semibold text-[#3d3d3d] text-lg">Email Campaigns</h3>
            <p className="text-sm text-[#86868b] mt-1 mb-4">Create, send, and track email campaigns with open/click analytics</p>
            <a href="/admin/email" className="inline-flex items-center gap-2 px-6 py-2.5 bg-[#003e79] text-white rounded-xl font-semibold hover:bg-[#002d5a] transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
              Go to Email Campaigns
            </a>
          </div>
        </div>
      )}

      {/* Modals */}
      {showBroadcast && <BroadcastModal onClose={() => setShowBroadcast(false)} onSent={loadConversations} />}
      {showNewConvo && <NewConvoModal onClose={() => setShowNewConvo(false)} onCreated={(id) => { loadConversations(); setActiveConvo(conversations.find(c => c.id === id) || null); }} />}
    </div>
  );
}
