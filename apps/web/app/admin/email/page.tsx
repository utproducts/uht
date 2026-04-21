'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

const API_BASE = 'https://uht.chad-157.workers.dev/api';
const devHeaders = { 'X-Dev-Bypass': 'true' };
const authFetch = (url: string, opts: RequestInit = {}) =>
  fetch(url, { ...opts, headers: { ...devHeaders, ...(opts.headers || {}) } });

/* ── Types ── */
interface Campaign {
  id: string;
  name: string;
  subject: string;
  template_type: string;
  status: string;
  event_name: string | null;
  total_sent: number;
  total_delivered: number;
  total_opened: number;
  total_clicked: number;
  total_bounced: number;
  total_unsubscribed: number;
  sent_at: string | null;
  created_at: string;
  audience_filter: string | null;
}

interface CampaignDetail extends Campaign {
  body_html: string;
  recipients: Recipient[];
}

interface Recipient {
  id: string;
  contact_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  status: string;
  opened_at: string | null;
  clicked_at: string | null;
  created_at: string;
}

interface AudienceEvent {
  id: string;
  name: string;
  city: string;
  state: string;
  start_date: string;
  team_count: number;
}

interface AudienceDivision {
  id: string;
  age_group: string;
  division_level: string;
  current_team_count: number;
  max_teams: number;
}

interface AudiencePreview {
  count: number;
  sample: { email: string; name: string; team: string; age_group: string; event: string }[];
}

/* ── Helpers ── */
function formatDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function pct(num: number, denom: number): string {
  if (!denom) return '0%';
  return (num / denom * 100).toFixed(1) + '%';
}

const templateLabels: Record<string, string> = {
  market_all_events: 'Market All Events',
  market_specific_event: 'Market Specific Event',
  find_team: 'Find a Team',
  custom: 'Custom',
};

const statusStyles: Record<string, { bg: string; text: string; dot: string }> = {
  draft: { bg: 'bg-gray-50', text: 'text-gray-600', dot: 'bg-gray-400' },
  sending: { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' },
  sent: { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  failed: { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500' },
};

const recipientStatusStyles: Record<string, { bg: string; text: string }> = {
  sent: { bg: 'bg-blue-50', text: 'text-blue-700' },
  delivered: { bg: 'bg-sky-50', text: 'text-sky-700' },
  opened: { bg: 'bg-emerald-50', text: 'text-emerald-700' },
  clicked: { bg: 'bg-green-50', text: 'text-green-700' },
  bounced: { bg: 'bg-red-50', text: 'text-red-700' },
  unsubscribed: { bg: 'bg-orange-50', text: 'text-orange-700' },
  dropped: { bg: 'bg-gray-100', text: 'text-gray-600' },
};

function StatusBadge({ status }: { status: string }) {
  const s = statusStyles[status] || statusStyles.draft;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold ${s.bg} ${s.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

function RecipientBadge({ status }: { status: string }) {
  const s = recipientStatusStyles[status] || recipientStatusStyles.sent;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${s.bg} ${s.text}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

/* ══════════════════════════════════════════
   STAT CARD
   ══════════════════════════════════════════ */
function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="bg-white rounded-xl border border-[#e8e8ed] p-4">
      <p className="text-xs font-medium text-[#86868b] uppercase tracking-wider">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${color || 'text-[#1d1d1f]'}`}>{value}</p>
      {sub && <p className="text-xs text-[#86868b] mt-0.5">{sub}</p>}
    </div>
  );
}

/* ══════════════════════════════════════════
   VISUAL EMAIL EDITOR (WYSIWYG via iframe designMode)
   ══════════════════════════════════════════ */
function VisualEmailEditor({ html, onChange }: { html: string; onChange: (html: string) => void }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const initialized = useRef(false);
  const [isEditing, setIsEditing] = useState(false);

  // Write HTML into iframe and enable editing
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || !html) return;

    const initEditor = () => {
      const doc = iframe.contentDocument;
      if (!doc) return;
      doc.open();
      doc.write(html);
      doc.close();
      doc.designMode = 'on';
      initialized.current = true;
      setIsEditing(true);

      // Sync changes back on every input
      doc.addEventListener('input', () => {
        const updatedHtml = '<!DOCTYPE html>' + doc.documentElement.outerHTML;
        onChange(updatedHtml);
      });
    };

    // Small delay to let iframe mount
    const timer = setTimeout(initEditor, 100);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [html ? 'loaded' : 'empty']);

  const execCommand = (cmd: string, value?: string) => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return;
    doc.execCommand(cmd, false, value || '');
    // Sync after command
    const updatedHtml = '<!DOCTYPE html>' + doc.documentElement.outerHTML;
    onChange(updatedHtml);
  };

  const handleLink = () => {
    const url = prompt('Enter URL:');
    if (url) execCommand('createLink', url);
  };

  return (
    <div className="border border-[#e8e8ed] rounded-xl overflow-hidden bg-white">
      {/* Simple formatting toolbar */}
      <div className="flex items-center gap-1 px-3 py-2 bg-[#fafafa] border-b border-[#e8e8ed]">
        <button onClick={() => execCommand('bold')} title="Bold"
          className="p-1.5 rounded-lg hover:bg-[#e8e8ed] transition-colors text-[#3d3d3d]">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M15.6 10.79c.97-.67 1.65-1.77 1.65-2.79 0-2.26-1.75-4-4-4H7v14h7.04c2.09 0 3.71-1.7 3.71-3.79 0-1.52-.86-2.82-2.15-3.42zM10 6.5h3c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5h-3v-3zm3.5 9H10v-3h3.5c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5z"/></svg>
        </button>
        <button onClick={() => execCommand('italic')} title="Italic"
          className="p-1.5 rounded-lg hover:bg-[#e8e8ed] transition-colors text-[#3d3d3d]">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M10 4v3h2.21l-3.42 8H6v3h8v-3h-2.21l3.42-8H18V4z"/></svg>
        </button>
        <button onClick={() => execCommand('underline')} title="Underline"
          className="p-1.5 rounded-lg hover:bg-[#e8e8ed] transition-colors text-[#3d3d3d]">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M12 17c3.31 0 6-2.69 6-6V3h-2.5v8c0 1.93-1.57 3.5-3.5 3.5S8.5 12.93 8.5 11V3H6v8c0 3.31 2.69 6 6 6zm-7 2v2h14v-2H5z"/></svg>
        </button>
        <div className="w-px h-5 bg-[#e8e8ed] mx-1" />
        <button onClick={handleLink} title="Insert Link"
          className="p-1.5 rounded-lg hover:bg-[#e8e8ed] transition-colors text-[#3d3d3d]">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/></svg>
        </button>
        <button onClick={() => execCommand('removeFormat')} title="Clear Formatting"
          className="p-1.5 rounded-lg hover:bg-[#e8e8ed] transition-colors text-[#3d3d3d]">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M3.27 5L2 6.27l6.97 6.97L6.5 19h3l1.57-3.66L16.73 21 18 19.73 3.27 5zM6 5v.18L8.82 8h2.4l-.72 1.68 2.1 2.1L14.21 8H20V5H6z"/></svg>
        </button>
        <div className="flex-1" />
        <span className="text-[10px] text-[#86868b] font-medium">Click the email to edit it</span>
      </div>

      {/* Editable iframe */}
      <iframe
        ref={iframeRef}
        className="w-full h-[380px] border-0"
        title="Edit Email"
      />
    </div>
  );
}

/* ══════════════════════════════════════════
   COMPOSE WIZARD
   ══════════════════════════════════════════ */
function ComposeWizard({ onClose, onSent }: { onClose: () => void; onSent: () => void }) {
  const [step, setStep] = useState(1);

  // Step 1: Template type
  const [templateType, setTemplateType] = useState('');

  // Step 2: Audience
  const [audienceScope, setAudienceScope] = useState('everyone');
  const [selectedEventId, setSelectedEventId] = useState('');
  const [selectedDivisionId, setSelectedDivisionId] = useState('');
  const [selectedAgeGroup, setSelectedAgeGroup] = useState('');
  const [events, setEvents] = useState<AudienceEvent[]>([]);
  const [divisions, setDivisions] = useState<AudienceDivision[]>([]);
  const [ageGroups, setAgeGroups] = useState<string[]>([]);
  const [preview, setPreview] = useState<AudiencePreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  // Manual email options
  const [pastedEmails, setPastedEmails] = useState('');
  const [manualEmailList, setManualEmailList] = useState<string[]>([]);
  const [csvFileName, setCsvFileName] = useState('');
  const csvInputRef = useRef<HTMLInputElement>(null);

  // Step 3: Preview & Send
  const [subject, setSubject] = useState('');
  const [bodyHtml, setBodyHtml] = useState('');
  const [baseHtml, setBaseHtml] = useState(''); // template before division rows injected
  const [customMessage, setCustomMessage] = useState('');
  const [campaignName, setCampaignName] = useState('');
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ sent: number; failed: number } | null>(null);
  const [generatingTemplate, setGeneratingTemplate] = useState(false);

  // Division builder for find_team template
  interface DivisionEntry { name: string; spots: string; enabled: boolean }
  const [divEntries, setDivEntries] = useState<DivisionEntry[]>([]);

  // Common age groups for quick-add
  const commonDivisions = ['Mite', 'Squirt', 'Pee Wee', 'Bantam', 'Midget', '8U', '10U', '12U', '14U', '16U', '18U'];

  // Build division row HTML from entries
  const buildDivisionRowsHtml = useCallback((entries: DivisionEntry[]) => {
    const enabled = entries.filter(e => e.enabled && e.name.trim());
    if (enabled.length === 0) return '';
    return enabled.map(e => `
      <tr>
        <td style="padding:8px 12px;color:#1d1d1f;font-size:14px;font-weight:600;border-bottom:1px solid #e8e8ed;">${e.name}</td>
        <td style="padding:8px 12px;text-align:center;color:#003e79;font-weight:bold;font-size:14px;border-bottom:1px solid #e8e8ed;">${e.spots ? e.spots + (e.spots === '1' ? ' spot' : ' spots') : 'Open'}</td>
      </tr>`).join('');
  }, []);

  // Inject division rows into base template
  const updateEmailWithDivisions = useCallback((entries: DivisionEntry[], base: string) => {
    if (!base) return;
    const rows = buildDivisionRowsHtml(entries);
    const updated = base.replace(
      /<!-- DIVISION_ROWS -->[\s\S]*?<!-- \/DIVISION_ROWS -->/,
      `<!-- DIVISION_ROWS -->${rows}<!-- /DIVISION_ROWS -->`
    );
    setBodyHtml(updated);
  }, [buildDivisionRowsHtml]);

  // Update email whenever division entries change
  const handleDivisionChange = useCallback((newEntries: DivisionEntry[]) => {
    setDivEntries(newEntries);
    updateEmailWithDivisions(newEntries, baseHtml);
  }, [baseHtml, updateEmailWithDivisions]);

  // Load events for audience targeting
  useEffect(() => {
    authFetch(`${API_BASE}/email/audience/events`).then(r => r.json()).then((d: any) => {
      if (d.success) setEvents(d.data);
    });
  }, []);

  // Load divisions when event selected
  useEffect(() => {
    if (!selectedEventId) { setDivisions([]); return; }
    authFetch(`${API_BASE}/email/audience/events/${selectedEventId}/divisions`).then(r => r.json()).then((d: any) => {
      if (d.success) {
        setDivisions(d.data);
        const groups = Array.from(new Set((d.data as AudienceDivision[]).map((div: AudienceDivision) => div.age_group)));
        setAgeGroups(groups);
      }
    });
  }, [selectedEventId]);

  // Auto-generate template when moving to step 3
  const generateTemplate = useCallback(async () => {
    if (templateType === 'custom') {
      setSubject('');
      setBodyHtml('');
      setBaseHtml('');
      return;
    }
    setGeneratingTemplate(true);
    try {
      const body: any = { templateType };
      if (templateType === 'market_specific_event' || templateType === 'find_team') {
        body.eventId = selectedEventId;
      }
      const r = await authFetch(`${API_BASE}/email/templates/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await r.json() as any;
      if (d.success) {
        setSubject(d.data.subject);

        // For find_team, strip out any API-generated division rows and start clean
        if (templateType === 'find_team') {
          const cleanHtml = d.data.html.replace(
            /<!-- DIVISION_ROWS -->[\s\S]*?<!-- \/DIVISION_ROWS -->/,
            '<!-- DIVISION_ROWS --><!-- /DIVISION_ROWS -->'
          );
          setBaseHtml(cleanHtml);
          setBodyHtml(cleanHtml);

          // Initialize division entries from loaded divisions or defaults (all toggled off)
          const initialEntries: DivisionEntry[] = divisions.length > 0
            ? divisions.map(div => ({
                name: `${div.age_group}${div.division_level ? ' ' + div.division_level : ''}`,
                spots: String(div.max_teams - div.current_team_count),
                enabled: false,
              }))
            : ['Mite', 'Squirt', 'Pee Wee', 'Bantam', 'Midget'].map(name => ({
                name,
                spots: '',
                enabled: false,
              }));
          setDivEntries(initialEntries);
        } else {
          setBaseHtml(d.data.html);
          setBodyHtml(d.data.html);
        }
      }
    } catch (e) { console.error(e); }
    setGeneratingTemplate(false);
  }, [templateType, selectedEventId, divisions]);

  // Preview audience
  const loadPreview = useCallback(async () => {
    setLoadingPreview(true);
    const filter: any = { scope: audienceScope };
    if (audienceScope === 'event') filter.eventId = selectedEventId;
    if (audienceScope === 'division') filter.divisionId = selectedDivisionId;
    if (audienceScope === 'age_group') filter.ageGroup = selectedAgeGroup;
    if (audienceScope === 'manual_emails') filter.manualEmails = manualEmailList;
    // Auto-exclude registered teams when marketing a specific event
    if ((templateType === 'market_specific_event' || templateType === 'find_team') && selectedEventId) {
      filter.excludeRegisteredForEvent = selectedEventId;
    }
    try {
      const r = await authFetch(`${API_BASE}/email/audience/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(filter),
      });
      const d = await r.json() as any;
      if (d.success) setPreview(d.data);
    } catch (e) { console.error(e); }
    setLoadingPreview(false);
  }, [audienceScope, selectedEventId, selectedDivisionId, selectedAgeGroup, manualEmailList]);

  // Parse emails from raw text (handles commas, newlines, semicolons, spaces)
  const parseEmails = useCallback((raw: string): string[] => {
    const emailRegex = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
    const matches = raw.match(emailRegex) || [];
    const seen = new Set<string>();
    return matches.filter(e => {
      const lower = e.toLowerCase();
      if (seen.has(lower)) return false;
      seen.add(lower);
      return true;
    });
  }, []);

  // Handle paste emails change
  const handlePastedEmailsChange = useCallback((text: string) => {
    setPastedEmails(text);
    const parsed = parseEmails(text);
    setManualEmailList(parsed);
    setPreview(null);
  }, [parseEmails]);

  // Handle CSV file upload
  const handleCsvUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      if (!text) return;
      const parsed = parseEmails(text);
      setManualEmailList(prev => {
        const combined = [...prev, ...parsed];
        const seen = new Set<string>();
        return combined.filter(em => {
          const lower = em.toLowerCase();
          if (seen.has(lower)) return false;
          seen.add(lower);
          return true;
        });
      });
      // Also add to the paste area for visibility
      setPastedEmails(prev => prev ? prev + '\n' + parsed.join('\n') : parsed.join('\n'));
      setPreview(null);
    };
    reader.readAsText(file);
    // Reset input so same file can be re-selected
    e.target.value = '';
  }, [parseEmails]);

  // Send
  const handleSend = async () => {
    if (!subject || !bodyHtml) return;
    setSending(true);
    try {
      // 1. Create campaign
      const filter: any = { scope: audienceScope };
      if (audienceScope === 'event') filter.eventId = selectedEventId;
      if (audienceScope === 'division') filter.divisionId = selectedDivisionId;
      if (audienceScope === 'age_group') filter.ageGroup = selectedAgeGroup;
      if (audienceScope === 'manual_emails') filter.manualEmails = manualEmailList;
      // Auto-exclude teams already registered for this event when marketing or finding teams
      if ((templateType === 'market_specific_event' || templateType === 'find_team') && selectedEventId) {
        filter.excludeRegisteredForEvent = selectedEventId;
      }

      const name = campaignName || `${templateLabels[templateType] || 'Campaign'} — ${new Date().toLocaleDateString()}`;

      const createRes = await authFetch(`${API_BASE}/email/campaigns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          subject,
          bodyHtml: templateType === 'custom' ? generateCustomHtml(customMessage) : bodyHtml,
          templateType,
          eventId: selectedEventId || undefined,
          audience: filter,
        }),
      });
      const createData = await createRes.json() as any;
      if (!createData.success) throw new Error('Failed to create campaign');

      // 2. Send it
      const sendRes = await authFetch(`${API_BASE}/email/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId: createData.data.id, audience: filter }),
      });
      const sendData = await sendRes.json() as any;
      if (sendData.success) {
        setSendResult(sendData.data);
      } else {
        alert(sendData.error || 'Send failed');
      }
    } catch (e: any) {
      alert(e.message || 'Something went wrong');
    }
    setSending(false);
  };

  // Simple HTML wrapper for custom messages
  function generateCustomHtml(msg: string) {
    return msg; // The API will wrap it
  }

  const canProceedStep1 = !!templateType;
  const needsEvent = templateType === 'market_specific_event' || templateType === 'find_team';
  const canProceedStep2 = audienceScope === 'everyone' ||
    (audienceScope === 'event' && !!selectedEventId) ||
    (audienceScope === 'division' && !!selectedDivisionId) ||
    (audienceScope === 'age_group' && !!selectedAgeGroup) ||
    (audienceScope === 'manual_emails' && manualEmailList.length > 0);

  // If sent, show success
  if (sendResult) {
    return (
      <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
          <div className="bg-gradient-to-r from-emerald-500 to-emerald-600 p-8 text-center text-white">
            <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold">Emails Sent!</h2>
            <p className="text-emerald-100 mt-2">Your campaign is on its way</p>
          </div>
          <div className="p-6 text-center">
            <div className="flex gap-6 justify-center mb-6">
              <div>
                <p className="text-3xl font-bold text-emerald-600">{sendResult.sent}</p>
                <p className="text-sm text-[#86868b]">Sent</p>
              </div>
              {sendResult.failed > 0 && (
                <div>
                  <p className="text-3xl font-bold text-red-500">{sendResult.failed}</p>
                  <p className="text-sm text-[#86868b]">Failed</p>
                </div>
              )}
            </div>
            <p className="text-sm text-[#86868b] mb-6">
              Stats will update as recipients open and click. Check back in a few hours for full reporting.
            </p>
            <button onClick={() => { onSent(); onClose(); }}
              className="w-full py-3 bg-[#003e79] text-white rounded-xl font-semibold hover:bg-[#002d5a] transition-colors">
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#003e79] to-[#005599] px-6 py-4 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-white font-bold text-lg">Compose Email</h2>
            <p className="text-white/60 text-sm">Step {step} of 3</p>
          </div>
          <button onClick={onClose} className="text-white/60 hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Progress bar */}
        <div className="flex gap-1 px-6 pt-4 flex-shrink-0">
          {[1, 2, 3].map(s => (
            <div key={s} className={`h-1.5 flex-1 rounded-full transition-colors ${s <= step ? 'bg-[#003e79]' : 'bg-[#e8e8ed]'}`} />
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* ── STEP 1: What are you looking to do? ── */}
          {step === 1 && (
            <div>
              <h3 className="text-xl font-bold text-[#1d1d1f] mb-2">What are you looking to do?</h3>
              <p className="text-sm text-[#86868b] mb-6">Choose the type of email you want to send</p>

              <div className="space-y-3">
                {[
                  { value: 'market_all_events', icon: '📅', label: 'Market All Events', desc: 'Promote all upcoming tournaments to your contact list' },
                  { value: 'market_specific_event', icon: '🏒', label: 'Market a Specific Event', desc: 'Send details about one tournament' },
                  { value: 'find_team', icon: '🔍', label: 'Find a Team for an Event', desc: 'Let teams know about open spots in divisions' },
                  { value: 'custom', icon: '✏️', label: 'Custom Email', desc: 'Write your own message from scratch' },
                ].map(opt => (
                  <button key={opt.value} onClick={() => setTemplateType(opt.value)}
                    className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
                      templateType === opt.value
                        ? 'border-[#003e79] bg-[#f0f7ff] shadow-sm'
                        : 'border-[#e8e8ed] hover:border-[#c8c8cd] bg-white'
                    }`}>
                    <div className="flex items-start gap-3">
                      <span className="text-2xl mt-0.5">{opt.icon}</span>
                      <div>
                        <p className={`font-semibold ${templateType === opt.value ? 'text-[#003e79]' : 'text-[#1d1d1f]'}`}>{opt.label}</p>
                        <p className="text-sm text-[#86868b] mt-0.5">{opt.desc}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              {/* If specific event or find team, show event picker */}
              {needsEvent && (
                <div className="mt-6">
                  <label className="block text-sm font-semibold text-[#3d3d3d] mb-2">Which event?</label>
                  <select value={selectedEventId} onChange={e => setSelectedEventId(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-[#e8e8ed] bg-white text-[#1d1d1f] text-sm focus:ring-2 focus:ring-[#003e79] focus:border-transparent outline-none">
                    <option value="">Select an event...</option>
                    {events.map(ev => (
                      <option key={ev.id} value={ev.id}>{ev.name} — {ev.city}, {ev.state} ({ev.team_count} teams)</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}

          {/* ── STEP 2: Who should receive this? ── */}
          {step === 2 && (
            <div>
              <h3 className="text-xl font-bold text-[#1d1d1f] mb-2">Who should receive this?</h3>
              <p className="text-sm text-[#86868b] mb-6">Choose your audience</p>

              <div className="space-y-3">
                {[
                  { value: 'everyone', label: 'Everyone', desc: 'All team contacts in our system' },
                  { value: 'event', label: 'By Event', desc: 'Teams registered for a specific event' },
                  { value: 'division', label: 'By Division', desc: 'Teams in a specific division' },
                  { value: 'age_group', label: 'By Age Group', desc: 'Teams in a specific age group (e.g. Mite, Squirt)' },
                  { value: 'manual_emails', label: 'Paste Emails / Upload CSV', desc: 'Enter email addresses manually or upload a CSV file' },
                ].map(opt => (
                  <button key={opt.value} onClick={() => { setAudienceScope(opt.value); setPreview(null); }}
                    className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
                      audienceScope === opt.value
                        ? 'border-[#003e79] bg-[#f0f7ff] shadow-sm'
                        : 'border-[#e8e8ed] hover:border-[#c8c8cd] bg-white'
                    }`}>
                    <p className={`font-semibold ${audienceScope === opt.value ? 'text-[#003e79]' : 'text-[#1d1d1f]'}`}>{opt.label}</p>
                    <p className="text-sm text-[#86868b] mt-0.5">{opt.desc}</p>
                  </button>
                ))}
              </div>

              {/* Event picker */}
              {audienceScope === 'event' && (
                <div className="mt-4">
                  <label className="block text-sm font-semibold text-[#3d3d3d] mb-2">Select Event</label>
                  <select value={selectedEventId} onChange={e => { setSelectedEventId(e.target.value); setPreview(null); }}
                    className="w-full px-4 py-3 rounded-xl border border-[#e8e8ed] bg-white text-[#1d1d1f] text-sm focus:ring-2 focus:ring-[#003e79] focus:border-transparent outline-none">
                    <option value="">Choose event...</option>
                    {events.map(ev => (
                      <option key={ev.id} value={ev.id}>{ev.name} ({ev.team_count} teams)</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Division picker */}
              {audienceScope === 'division' && (
                <div className="mt-4 space-y-3">
                  <div>
                    <label className="block text-sm font-semibold text-[#3d3d3d] mb-2">Select Event first</label>
                    <select value={selectedEventId} onChange={e => { setSelectedEventId(e.target.value); setSelectedDivisionId(''); setPreview(null); }}
                      className="w-full px-4 py-3 rounded-xl border border-[#e8e8ed] bg-white text-[#1d1d1f] text-sm focus:ring-2 focus:ring-[#003e79] focus:border-transparent outline-none">
                      <option value="">Choose event...</option>
                      {events.map(ev => (
                        <option key={ev.id} value={ev.id}>{ev.name}</option>
                      ))}
                    </select>
                  </div>
                  {divisions.length > 0 && (
                    <div>
                      <label className="block text-sm font-semibold text-[#3d3d3d] mb-2">Select Division</label>
                      <select value={selectedDivisionId} onChange={e => { setSelectedDivisionId(e.target.value); setPreview(null); }}
                        className="w-full px-4 py-3 rounded-xl border border-[#e8e8ed] bg-white text-[#1d1d1f] text-sm focus:ring-2 focus:ring-[#003e79] focus:border-transparent outline-none">
                        <option value="">Choose division...</option>
                        {divisions.map(d => (
                          <option key={d.id} value={d.id}>{d.age_group} {d.division_level} ({d.current_team_count}/{d.max_teams} teams)</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              )}

              {/* Age group picker */}
              {audienceScope === 'age_group' && (
                <div className="mt-4 space-y-3">
                  {!selectedEventId && (
                    <div>
                      <label className="block text-sm font-semibold text-[#3d3d3d] mb-2">Select Event first</label>
                      <select value={selectedEventId} onChange={e => { setSelectedEventId(e.target.value); setSelectedAgeGroup(''); setPreview(null); }}
                        className="w-full px-4 py-3 rounded-xl border border-[#e8e8ed] bg-white text-[#1d1d1f] text-sm focus:ring-2 focus:ring-[#003e79] focus:border-transparent outline-none">
                        <option value="">Choose event...</option>
                        {events.map(ev => (
                          <option key={ev.id} value={ev.id}>{ev.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  {selectedEventId && ageGroups.length > 0 && (
                    <div>
                      <label className="block text-sm font-semibold text-[#3d3d3d] mb-2">Select Age Group</label>
                      <div className="flex flex-wrap gap-2">
                        {ageGroups.map(ag => (
                          <button key={ag} onClick={() => { setSelectedAgeGroup(ag); setPreview(null); }}
                            className={`px-4 py-2 rounded-full text-sm font-semibold border transition-all ${
                              selectedAgeGroup === ag
                                ? 'border-[#003e79] bg-[#003e79] text-white'
                                : 'border-[#e8e8ed] bg-white text-[#3d3d3d] hover:border-[#003e79]'
                            }`}>
                            {ag}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Manual emails: paste + CSV upload */}
              {audienceScope === 'manual_emails' && (
                <div className="mt-4 space-y-4">
                  <div>
                    <label className="block text-sm font-semibold text-[#3d3d3d] mb-2">Paste email addresses</label>
                    <textarea
                      value={pastedEmails}
                      onChange={e => handlePastedEmailsChange(e.target.value)}
                      placeholder={"john@example.com, jane@example.com\ncoach@team.com\none per line, comma-separated, or any format..."}
                      rows={6}
                      className="w-full px-4 py-3 rounded-xl border border-[#e8e8ed] bg-white text-[#1d1d1f] text-sm focus:ring-2 focus:ring-[#003e79] focus:border-transparent outline-none resize-y font-mono"
                    />
                    <p className="text-xs text-[#86868b] mt-1">
                      {manualEmailList.length > 0
                        ? <span className="text-[#003e79] font-semibold">{manualEmailList.length} valid email{manualEmailList.length !== 1 ? 's' : ''} detected</span>
                        : 'Separate emails with commas, newlines, semicolons, or spaces'}
                    </p>
                  </div>

                  <div className="border-t border-[#e8e8ed] pt-4">
                    <label className="block text-sm font-semibold text-[#3d3d3d] mb-2">Or upload a CSV file</label>
                    <input
                      ref={csvInputRef}
                      type="file"
                      accept=".csv,.txt,.tsv"
                      onChange={handleCsvUpload}
                      className="hidden"
                    />
                    <button
                      onClick={() => csvInputRef.current?.click()}
                      className="w-full py-3 px-4 rounded-xl border-2 border-dashed border-[#c8c8cd] bg-[#fafafa] text-sm text-[#6e6e73] hover:border-[#003e79] hover:text-[#003e79] hover:bg-[#f0f7ff] transition-all flex items-center justify-center gap-2"
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                      {csvFileName ? `Uploaded: ${csvFileName}` : 'Choose CSV file...'}
                    </button>
                    <p className="text-xs text-[#86868b] mt-1">CSV should contain email addresses — we'll find them automatically from any column</p>
                  </div>
                </div>
              )}

              {/* Preview button */}
              {canProceedStep2 && (
                <div className="mt-6">
                  <button onClick={loadPreview} disabled={loadingPreview}
                    className="w-full py-3 bg-[#f0f7ff] text-[#003e79] rounded-xl font-semibold border border-[#003e79]/20 hover:bg-[#e0efff] transition-colors disabled:opacity-50">
                    {loadingPreview ? 'Loading...' : 'Preview Audience'}
                  </button>

                  {preview && (
                    <div className="mt-4 p-4 bg-[#f0f7ff] rounded-xl border border-[#003e79]/10">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 bg-[#003e79] rounded-full flex items-center justify-center">
                          <span className="text-white font-bold text-sm">{preview.count}</span>
                        </div>
                        <div>
                          <p className="font-semibold text-[#003e79]">{preview.count} recipient{preview.count !== 1 ? 's' : ''}</p>
                          <p className="text-xs text-[#86868b]">will receive this email</p>
                        </div>
                      </div>
                      {preview.sample.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-[#86868b] mb-2 uppercase tracking-wider">Sample recipients:</p>
                          <div className="space-y-1.5">
                            {preview.sample.slice(0, 5).map((s, i) => (
                              <div key={i} className="flex items-center justify-between text-sm bg-white rounded-lg px-3 py-2">
                                <span className="text-[#1d1d1f] font-medium">{s.name || s.email}</span>
                                <span className="text-[#86868b] text-xs">{s.team}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── STEP 3: Preview & Send ── */}
          {step === 3 && (
            <div>
              <h3 className="text-xl font-bold text-[#1d1d1f] mb-2">Review & Send</h3>
              <p className="text-sm text-[#86868b] mb-6">Make sure everything looks good before sending</p>

              {generatingTemplate ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#003e79]" />
                  <span className="ml-3 text-[#86868b]">Generating template...</span>
                </div>
              ) : (
                <>
                  {/* Campaign name */}
                  <div className="mb-4">
                    <label className="block text-sm font-semibold text-[#3d3d3d] mb-1.5">Campaign Name (internal)</label>
                    <input value={campaignName} onChange={e => setCampaignName(e.target.value)}
                      placeholder={`${templateLabels[templateType] || 'Campaign'} — ${new Date().toLocaleDateString()}`}
                      className="w-full px-4 py-2.5 rounded-xl border border-[#e8e8ed] bg-white text-sm focus:ring-2 focus:ring-[#003e79] focus:border-transparent outline-none" />
                  </div>

                  {/* Subject */}
                  <div className="mb-4">
                    <label className="block text-sm font-semibold text-[#3d3d3d] mb-1.5">Subject Line</label>
                    <input value={subject} onChange={e => setSubject(e.target.value)}
                      placeholder="Enter email subject..."
                      className="w-full px-4 py-2.5 rounded-xl border border-[#e8e8ed] bg-white text-sm focus:ring-2 focus:ring-[#003e79] focus:border-transparent outline-none" />
                  </div>

                  {/* Custom message for custom template */}
                  {templateType === 'custom' && (
                    <div className="mb-4">
                      <label className="block text-sm font-semibold text-[#3d3d3d] mb-1.5">Message</label>
                      <textarea value={customMessage} onChange={e => setCustomMessage(e.target.value)}
                        rows={8} placeholder="Type your email message here... (HTML supported)"
                        className="w-full px-4 py-2.5 rounded-xl border border-[#e8e8ed] bg-white text-sm focus:ring-2 focus:ring-[#003e79] focus:border-transparent outline-none resize-none" />
                    </div>
                  )}

                  {/* ── Division Builder (find_team only) ── */}
                  {templateType === 'find_team' && (
                    <div className="mb-4 bg-[#f0f7ff] rounded-xl border border-[#003e79]/15 overflow-hidden">
                      <div className="px-4 py-3 bg-[#003e79]/5 border-b border-[#003e79]/10">
                        <h4 className="font-bold text-[#003e79] text-sm">Division Builder</h4>
                        <p className="text-xs text-[#6e6e73] mt-0.5">Toggle divisions on, set available spots, and they'll appear in the email below</p>
                      </div>
                      <div className="p-4 space-y-2">
                        {divEntries.map((entry, idx) => (
                          <div key={idx} className={`flex items-center gap-3 p-2.5 rounded-lg transition-all ${entry.enabled ? 'bg-white shadow-sm border border-[#003e79]/20' : 'bg-white/50 border border-transparent'}`}>
                            {/* Toggle */}
                            <button onClick={() => {
                              const updated = [...divEntries];
                              updated[idx] = { ...entry, enabled: !entry.enabled };
                              handleDivisionChange(updated);
                            }}
                              className={`w-10 h-6 rounded-full relative transition-colors flex-shrink-0 ${entry.enabled ? 'bg-[#003e79]' : 'bg-[#c8c8cd]'}`}>
                              <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform ${entry.enabled ? 'left-[18px]' : 'left-0.5'}`} />
                            </button>

                            {/* Division name */}
                            <input value={entry.name}
                              onChange={e => {
                                const updated = [...divEntries];
                                updated[idx] = { ...entry, name: e.target.value };
                                handleDivisionChange(updated);
                              }}
                              placeholder="Division name"
                              className={`flex-1 px-3 py-1.5 rounded-lg border text-sm font-semibold outline-none transition-colors ${entry.enabled ? 'border-[#e8e8ed] bg-white text-[#1d1d1f] focus:ring-2 focus:ring-[#003e79]' : 'border-transparent bg-transparent text-[#86868b]'}`}
                            />

                            {/* Spots input */}
                            <div className="flex items-center gap-1.5 flex-shrink-0">
                              <input value={entry.spots}
                                onChange={e => {
                                  const updated = [...divEntries];
                                  updated[idx] = { ...entry, spots: e.target.value.replace(/[^0-9]/g, '') };
                                  handleDivisionChange(updated);
                                }}
                                placeholder="#"
                                className={`w-14 px-2 py-1.5 rounded-lg border text-sm text-center font-bold outline-none transition-colors ${entry.enabled ? 'border-[#e8e8ed] bg-white text-[#003e79] focus:ring-2 focus:ring-[#003e79]' : 'border-transparent bg-transparent text-[#86868b]'}`}
                              />
                              <span className={`text-xs ${entry.enabled ? 'text-[#6e6e73]' : 'text-[#aeaeb2]'}`}>spots</span>
                            </div>

                            {/* Remove */}
                            <button onClick={() => {
                              const updated = divEntries.filter((_, i) => i !== idx);
                              handleDivisionChange(updated);
                            }}
                              className="p-1 rounded-md hover:bg-red-50 text-[#c8c8cd] hover:text-red-400 transition-colors flex-shrink-0">
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                          </div>
                        ))}

                        {/* Add division row */}
                        <div className="flex items-center gap-2 pt-2">
                          <button onClick={() => handleDivisionChange([...divEntries, { name: '', spots: '', enabled: true }])}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-[#003e79] bg-white border border-[#003e79]/20 hover:bg-[#003e79]/5 transition-colors">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                            Add Division
                          </button>
                          <div className="h-4 w-px bg-[#e8e8ed]" />
                          <span className="text-[10px] text-[#86868b] font-medium">Quick add:</span>
                          <div className="flex flex-wrap gap-1">
                            {commonDivisions
                              .filter(name => !divEntries.some(e => e.name.toLowerCase() === name.toLowerCase()))
                              .slice(0, 5)
                              .map(name => (
                                <button key={name}
                                  onClick={() => handleDivisionChange([...divEntries, { name, spots: '', enabled: true }])}
                                  className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-white border border-[#e8e8ed] text-[#6e6e73] hover:border-[#003e79] hover:text-[#003e79] transition-colors">
                                  + {name}
                                </button>
                              ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Email visual editor */}
                  {templateType !== 'custom' && bodyHtml && (
                    <div className="mb-4">
                      <VisualEmailEditor html={bodyHtml} onChange={setBodyHtml} />
                    </div>
                  )}

                  {/* Audience summary */}
                  <div className="bg-[#f0f7ff] rounded-xl p-4 mb-4 border border-[#003e79]/10">
                    <p className="text-sm font-semibold text-[#003e79]">Audience</p>
                    <p className="text-sm text-[#3d3d3d] mt-1">
                      {audienceScope === 'everyone' ? 'Everyone in the system' :
                       audienceScope === 'event' ? `Teams registered for: ${events.find(e => e.id === selectedEventId)?.name || 'Unknown'}` :
                       audienceScope === 'division' ? `Division: ${divisions.find(d => d.id === selectedDivisionId)?.age_group || ''} ${divisions.find(d => d.id === selectedDivisionId)?.division_level || ''}` :
                       audienceScope === 'manual_emails' ? `Custom email list (${manualEmailList.length} addresses)` :
                       `Age Group: ${selectedAgeGroup}`}
                    </p>
                    {preview && <p className="text-xs text-[#86868b] mt-1">{preview.count} recipients</p>}
                    {(templateType === 'market_specific_event' || templateType === 'find_team') && selectedEventId && (
                      <p className="text-xs text-emerald-600 mt-1 flex items-center gap-1">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                        Teams already registered for this event will be excluded
                      </p>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-[#e8e8ed] px-6 py-4 flex items-center justify-between flex-shrink-0 bg-[#fafafa]">
          <button onClick={() => step > 1 ? setStep(step - 1) : onClose()}
            className="px-5 py-2.5 rounded-xl text-sm font-semibold text-[#6e6e73] hover:text-[#1d1d1f] hover:bg-white border border-transparent hover:border-[#e8e8ed] transition-all">
            {step === 1 ? 'Cancel' : 'Back'}
          </button>

          {step < 3 ? (
            <button
              disabled={step === 1 ? (!canProceedStep1 || (needsEvent && !selectedEventId)) : !canProceedStep2}
              onClick={async () => {
                if (step === 2) {
                  // Auto-load preview if not loaded
                  if (!preview) await loadPreview();
                }
                setStep(step + 1);
                if (step === 2) generateTemplate();
              }}
              className="px-6 py-2.5 rounded-xl text-sm font-bold bg-[#003e79] text-white hover:bg-[#002d5a] transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
              Continue
            </button>
          ) : (
            <button onClick={handleSend} disabled={sending || generatingTemplate || (!subject && templateType !== 'custom') || (templateType === 'custom' && !customMessage)}
              className="px-8 py-2.5 rounded-xl text-sm font-bold bg-emerald-600 text-white hover:bg-emerald-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2">
              {sending ? (
                <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" /> Sending...</>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
                  Send Now
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════
   CAMPAIGN DETAIL VIEW
   ══════════════════════════════════════════ */
function CampaignDetailView({ campaignId, onBack }: { campaignId: string; onBack: () => void }) {
  const [campaign, setCampaign] = useState<CampaignDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [resending, setResending] = useState(false);
  const [recipientFilter, setRecipientFilter] = useState('all');

  const loadCampaign = useCallback(async () => {
    setLoading(true);
    try {
      const r = await authFetch(`${API_BASE}/email/campaigns/${campaignId}`);
      const d = await r.json() as any;
      if (d.success) setCampaign(d.data);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [campaignId]);

  useEffect(() => { loadCampaign(); }, [loadCampaign]);

  const handleResendNonOpeners = async () => {
    if (!confirm('Resend this campaign to everyone who hasn\'t opened it yet?')) return;
    setResending(true);
    try {
      const r = await authFetch(`${API_BASE}/email/campaigns/${campaignId}/resend-non-openers`, { method: 'POST' });
      const d = await r.json() as any;
      if (d.success) {
        alert(`Resent to ${d.data.resent} of ${d.data.total_non_openers} non-openers!`);
        loadCampaign();
      } else {
        alert(d.error || 'Resend failed');
      }
    } catch (e: any) { alert(e.message); }
    setResending(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#003e79]" />
      </div>
    );
  }

  if (!campaign) {
    return <p className="text-center py-20 text-[#86868b]">Campaign not found</p>;
  }

  const filteredRecipients = recipientFilter === 'all'
    ? campaign.recipients
    : campaign.recipients.filter(r => r.status === recipientFilter);

  const nonOpenerCount = campaign.recipients.filter(r => r.status === 'sent' || r.status === 'delivered').length;

  return (
    <div>
      {/* Back button + header */}
      <div className="flex items-center gap-4 mb-6">
        <button onClick={onBack}
          className="p-2 rounded-xl hover:bg-[#f5f5f7] border border-[#e8e8ed] transition-colors">
          <svg className="w-5 h-5 text-[#6e6e73]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
        </button>
        <div className="flex-1">
          <h2 className="text-xl font-bold text-[#1d1d1f]">{campaign.name}</h2>
          <p className="text-sm text-[#86868b]">
            Subject: {campaign.subject} · Sent {formatDate(campaign.sent_at)}
          </p>
        </div>
        <StatusBadge status={campaign.status} />
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-6">
        <StatCard label="Sent" value={campaign.total_sent} color="text-[#003e79]" />
        <StatCard label="Delivered" value={campaign.total_delivered} sub={pct(campaign.total_delivered, campaign.total_sent)} color="text-sky-600" />
        <StatCard label="Opened" value={campaign.total_opened} sub={pct(campaign.total_opened, campaign.total_sent)} color="text-emerald-600" />
        <StatCard label="Clicked" value={campaign.total_clicked} sub={pct(campaign.total_clicked, campaign.total_sent)} color="text-green-600" />
        <StatCard label="Bounced" value={campaign.total_bounced} sub={pct(campaign.total_bounced, campaign.total_sent)} color="text-red-500" />
        <StatCard label="Unsubs" value={campaign.total_unsubscribed} sub={pct(campaign.total_unsubscribed, campaign.total_sent)} color="text-orange-500" />
      </div>

      {/* Resend to non-openers */}
      {campaign.status === 'sent' && nonOpenerCount > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 flex items-center justify-between">
          <div>
            <p className="font-semibold text-amber-800">
              {nonOpenerCount} recipient{nonOpenerCount !== 1 ? 's' : ''} haven&apos;t opened this email
            </p>
            <p className="text-sm text-amber-600 mt-0.5">Send it again to people who missed it</p>
          </div>
          <button onClick={handleResendNonOpeners} disabled={resending}
            className="px-5 py-2.5 bg-amber-500 text-white rounded-xl font-semibold hover:bg-amber-600 transition-colors disabled:opacity-50 flex items-center gap-2">
            {resending ? (
              <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" /> Resending...</>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                Resend to Non-Openers
              </>
            )}
          </button>
        </div>
      )}

      {/* Recipients table */}
      <div className="bg-white rounded-xl border border-[#e8e8ed] overflow-hidden">
        <div className="px-5 py-4 border-b border-[#e8e8ed] flex items-center justify-between">
          <h3 className="font-semibold text-[#1d1d1f]">Recipients ({campaign.recipients.length})</h3>
          <div className="flex gap-1.5">
            {['all', 'opened', 'clicked', 'delivered', 'sent', 'bounced'].map(f => (
              <button key={f} onClick={() => setRecipientFilter(f)}
                className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                  recipientFilter === f ? 'bg-[#003e79] text-white' : 'bg-[#f5f5f7] text-[#6e6e73] hover:bg-[#e8e8ed]'
                }`}>
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-[#fafafa]">
                <th className="text-left px-5 py-3 text-xs font-bold text-[#86868b] uppercase tracking-widest">Recipient</th>
                <th className="text-left px-5 py-3 text-xs font-bold text-[#86868b] uppercase tracking-widest">Status</th>
                <th className="text-left px-5 py-3 text-xs font-bold text-[#86868b] uppercase tracking-widest">Opened</th>
                <th className="text-left px-5 py-3 text-xs font-bold text-[#86868b] uppercase tracking-widest">Clicked</th>
              </tr>
            </thead>
            <tbody>
              {filteredRecipients.length === 0 ? (
                <tr><td colSpan={4} className="px-5 py-8 text-center text-[#86868b]">No recipients match this filter</td></tr>
              ) : filteredRecipients.map(r => (
                <tr key={r.id} className="border-t border-[#f0f0f5] hover:bg-[#fafafa] transition-colors">
                  <td className="px-5 py-3">
                    <p className="text-sm font-semibold text-[#1d1d1f]">{r.first_name} {r.last_name}</p>
                    <p className="text-xs text-[#86868b]">{r.email}</p>
                  </td>
                  <td className="px-5 py-3"><RecipientBadge status={r.status} /></td>
                  <td className="px-5 py-3 text-sm text-[#6e6e73]">{r.opened_at ? formatDate(r.opened_at) : '—'}</td>
                  <td className="px-5 py-3 text-sm text-[#6e6e73]">{r.clicked_at ? formatDate(r.clicked_at) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}


/* ══════════════════════════════════════════
   MAIN PAGE
   ══════════════════════════════════════════ */
export default function EmailPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCompose, setShowCompose] = useState(false);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState('');

  const loadCampaigns = useCallback(async () => {
    setLoading(true);
    try {
      let url = `${API_BASE}/email/campaigns`;
      if (filterStatus) url += `?status=${filterStatus}`;
      const r = await authFetch(url);
      const d = await r.json() as any;
      if (d.success) setCampaigns(d.data);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [filterStatus]);

  useEffect(() => { loadCampaigns(); }, [loadCampaigns]);

  // If viewing a campaign detail
  if (selectedCampaignId) {
    return (
      <div className="p-6">
        <CampaignDetailView campaignId={selectedCampaignId} onBack={() => { setSelectedCampaignId(null); loadCampaigns(); }} />
      </div>
    );
  }

  // Aggregate stats
  const totalSent = campaigns.reduce((s, c) => s + (c.total_sent || 0), 0);
  const totalOpened = campaigns.reduce((s, c) => s + (c.total_opened || 0), 0);
  const totalClicked = campaigns.reduce((s, c) => s + (c.total_clicked || 0), 0);
  const totalBounced = campaigns.reduce((s, c) => s + (c.total_bounced || 0), 0);

  return (
    <div className="p-6">
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#1d1d1f]">Email Campaigns</h1>
          <p className="text-sm text-[#86868b] mt-1">Create, send, and track email campaigns</p>
        </div>
        <div className="flex items-center gap-3">
          <a href="/admin/email/automated"
            className="px-5 py-2.5 rounded-xl bg-white text-[#003e79] font-semibold border border-[#003e79]/20 hover:bg-[#f0f7ff] transition-colors flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Automated Emails
          </a>
          <button onClick={() => setShowCompose(true)}
            className="px-5 py-2.5 rounded-xl bg-[#003e79] text-white font-semibold hover:bg-[#002d5a] transition-colors flex items-center gap-2 shadow-sm">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
            Compose
          </button>
        </div>
      </div>

      {/* Global stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard label="Total Sent" value={totalSent.toLocaleString()} color="text-[#003e79]" />
        <StatCard label="Avg Open Rate" value={pct(totalOpened, totalSent)} sub={`${totalOpened.toLocaleString()} opens`} color="text-emerald-600" />
        <StatCard label="Avg Click Rate" value={pct(totalClicked, totalSent)} sub={`${totalClicked.toLocaleString()} clicks`} color="text-green-600" />
        <StatCard label="Bounce Rate" value={pct(totalBounced, totalSent)} sub={`${totalBounced.toLocaleString()} bounces`} color="text-red-500" />
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-2 mb-4">
        <span className="text-sm font-medium text-[#86868b]">Filter:</span>
        {['', 'draft', 'sent', 'sending'].map(s => (
          <button key={s} onClick={() => setFilterStatus(s)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
              filterStatus === s ? 'bg-[#003e79] text-white' : 'bg-[#f5f5f7] text-[#6e6e73] hover:bg-[#e8e8ed]'
            }`}>
            {s === '' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {/* Campaign list */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#003e79]" />
        </div>
      ) : campaigns.length === 0 ? (
        <div className="bg-white rounded-2xl border border-[#e8e8ed] shadow-[0_1px_20px_-6px_rgba(0,0,0,0.08)] p-12 text-center">
          <div className="w-20 h-20 bg-[#fafafa] rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-10 h-10 text-[#86868b]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="2" y="4" width="20" height="16" rx="2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M22 7l-10 7L2 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h3 className="font-semibold text-[#3d3d3d] text-lg mb-1">No campaigns yet</h3>
          <p className="text-sm text-[#86868b] mb-6">Create your first email campaign to get started</p>
          <button onClick={() => setShowCompose(true)}
            className="px-6 py-2.5 rounded-xl bg-[#003e79] text-white font-semibold hover:bg-[#002d5a] transition-colors">
            Compose Your First Email
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-[#e8e8ed] overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-[#fafafa]">
                <th className="text-left px-5 py-3 text-xs font-bold text-[#86868b] uppercase tracking-widest">Campaign</th>
                <th className="text-left px-5 py-3 text-xs font-bold text-[#86868b] uppercase tracking-widest">Type</th>
                <th className="text-left px-5 py-3 text-xs font-bold text-[#86868b] uppercase tracking-widest">Status</th>
                <th className="text-center px-5 py-3 text-xs font-bold text-[#86868b] uppercase tracking-widest">Sent</th>
                <th className="text-center px-5 py-3 text-xs font-bold text-[#86868b] uppercase tracking-widest">Opens</th>
                <th className="text-center px-5 py-3 text-xs font-bold text-[#86868b] uppercase tracking-widest">Clicks</th>
                <th className="text-left px-5 py-3 text-xs font-bold text-[#86868b] uppercase tracking-widest">Date</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map(c => (
                <tr key={c.id} onClick={() => setSelectedCampaignId(c.id)}
                  className="border-t border-[#f0f0f5] hover:bg-[#f0f7ff] cursor-pointer transition-colors">
                  <td className="px-5 py-3.5">
                    <p className="text-sm font-semibold text-[#1d1d1f]">{c.name}</p>
                    <p className="text-xs text-[#86868b] mt-0.5">{c.subject}</p>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="text-xs font-medium text-[#6e6e73] bg-[#f5f5f7] px-2 py-1 rounded-md">
                      {templateLabels[c.template_type] || c.template_type}
                    </span>
                  </td>
                  <td className="px-5 py-3.5"><StatusBadge status={c.status} /></td>
                  <td className="px-5 py-3.5 text-center text-sm font-semibold text-[#1d1d1f]">{c.total_sent}</td>
                  <td className="px-5 py-3.5 text-center">
                    <span className="text-sm font-semibold text-emerald-600">{pct(c.total_opened, c.total_sent)}</span>
                  </td>
                  <td className="px-5 py-3.5 text-center">
                    <span className="text-sm font-semibold text-green-600">{pct(c.total_clicked, c.total_sent)}</span>
                  </td>
                  <td className="px-5 py-3.5 text-sm text-[#86868b]">{formatDate(c.sent_at || c.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Compose modal */}
      {showCompose && <ComposeWizard onClose={() => setShowCompose(false)} onSent={loadCampaigns} />}
    </div>
  );
}
