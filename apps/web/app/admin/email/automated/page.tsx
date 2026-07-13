'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

const API_BASE = 'https://uht.chad-157.workers.dev/api';
const devHeaders = { 'X-Dev-Bypass': 'true' };
const authFetch = (url: string, opts: RequestInit = {}) =>
  fetch(url, { ...opts, headers: { ...devHeaders, ...(opts.headers || {}) } });

interface EditableField {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'url';
  defaultValue: string;
  helpText?: string;
  variables?: string[];
}

interface AutomatedTemplate {
  id: string;
  name: string;
  description: string;
  trigger: string;
  from: string;
  hasCustomizations?: boolean;
  editableFields?: EditableField[];
}

interface TemplatePreview {
  subject: string;
  html: string;
}

/* ── Trigger badge colors ── */
const triggerColors: Record<string, { bg: string; text: string }> = {
  'On registration submit': { bg: 'bg-blue-50', text: 'text-blue-700' },
  'On admin approval (no payment)': { bg: 'bg-amber-50', text: 'text-amber-700' },
  'On admin approval (deposit received)': { bg: 'bg-emerald-50', text: 'text-emerald-700' },
  'On admin approval (paid in full)': { bg: 'bg-green-50', text: 'text-green-700' },
  'On login request': { bg: 'bg-purple-50', text: 'text-purple-700' },
};

function TriggerBadge({ trigger }: { trigger: string }) {
  const c = triggerColors[trigger] || { bg: 'bg-gray-50', text: 'text-gray-600' };
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold ${c.bg} ${c.text}`}>
      {trigger}
    </span>
  );
}


/* ══════════════════════════════════════════
   TEMPLATE DETAIL + EDITOR VIEW
   ══════════════════════════════════════════ */
function TemplateDetail({ template, onBack }: { template: AutomatedTemplate; onBack: () => void }) {
  const [preview, setPreview] = useState<TemplatePreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [testEmail, setTestEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ success: boolean; error?: string } | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Editor state
  const [editableFields, setEditableFields] = useState<EditableField[]>([]);
  const [defaults, setDefaults] = useState<Record<string, string>>({});
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [hasCustomizations, setHasCustomizations] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<{ success: boolean; message?: string } | null>(null);
  const [resetting, setResetting] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Load overrides and preview
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [overridesRes, previewRes] = await Promise.all([
        authFetch(`${API_BASE}/email/automated/${template.id}/overrides`).then(r => r.json()) as Promise<any>,
        authFetch(`${API_BASE}/email/automated/${template.id}/preview`).then(r => r.json()) as Promise<any>,
      ]);

      if (overridesRes.success) {
        setEditableFields(overridesRes.data.fields || []);
        setDefaults(overridesRes.data.defaults || {});
        setOverrides(overridesRes.data.overrides || {});
        setFormValues(overridesRes.data.resolved || {});
        setHasCustomizations(overridesRes.data.hasCustomizations || false);
      }
      if (previewRes.success) {
        setPreview(previewRes.data);
      }
    } catch (err) {
      console.error('Error loading template data:', err);
    }
    setLoading(false);
  }, [template.id]);

  useEffect(() => { loadData(); }, [loadData]);

  // Write HTML into iframe when preview loads
  useEffect(() => {
    if (!preview?.html || !iframeRef.current) return;
    const timer = setTimeout(() => {
      const doc = iframeRef.current?.contentDocument;
      if (!doc) return;
      doc.open();
      doc.write(preview.html);
      doc.close();
    }, 100);
    return () => clearTimeout(timer);
  }, [preview?.html]);

  const handleFieldChange = (key: string, value: string) => {
    setFormValues(prev => ({ ...prev, [key]: value }));
    setDirty(true);
    setSaveResult(null);
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveResult(null);
    try {
      const r = await authFetch(`${API_BASE}/email/automated/${template.id}/overrides`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: formValues }),
      });
      const d = await r.json() as any;
      setSaveResult({ success: d.success, message: d.message });
      if (d.success) {
        setDirty(false);
        // Reload preview with new overrides
        const previewRes = await authFetch(`${API_BASE}/email/automated/${template.id}/preview`).then(r => r.json()) as any;
        if (previewRes.success) setPreview(previewRes.data);
        // Refresh override state
        const ovRes = await authFetch(`${API_BASE}/email/automated/${template.id}/overrides`).then(r => r.json()) as any;
        if (ovRes.success) {
          setOverrides(ovRes.data.overrides || {});
          setHasCustomizations(ovRes.data.hasCustomizations || false);
        }
      }
    } catch (e: any) {
      setSaveResult({ success: false, message: e.message });
    }
    setSaving(false);
  };

  const handleReset = async () => {
    setResetting(true);
    try {
      const r = await authFetch(`${API_BASE}/email/automated/${template.id}/overrides`, {
        method: 'DELETE',
      });
      const d = await r.json() as any;
      if (d.success) {
        // Reset form to defaults
        setFormValues({ ...defaults });
        setOverrides({});
        setHasCustomizations(false);
        setDirty(false);
        setSaveResult({ success: true, message: 'Reset to defaults!' });
        // Reload preview
        const previewRes = await authFetch(`${API_BASE}/email/automated/${template.id}/preview`).then(r => r.json()) as any;
        if (previewRes.success) setPreview(previewRes.data);
      }
    } catch (e: any) {
      setSaveResult({ success: false, message: e.message });
    }
    setResetting(false);
  };

  const handleSendTest = async () => {
    if (!testEmail) return;
    setSending(true);
    setSendResult(null);
    try {
      const r = await authFetch(`${API_BASE}/email/automated/send-test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId: template.id, email: testEmail }),
      });
      const d = await r.json() as any;
      setSendResult({ success: d.success, error: d.error });
    } catch (e: any) {
      setSendResult({ success: false, error: e.message });
    }
    setSending(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#003e79]" />
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button onClick={onBack}
          className="p-2 rounded-xl hover:bg-[#f5f5f7] border border-[#e8e8ed] transition-colors">
          <svg className="w-5 h-5 text-[#6e6e73]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="flex-1">
          <h2 className="text-xl font-bold text-[#1d1d1f]">{template.name}</h2>
          <p className="text-sm text-[#86868b] mt-0.5">{template.description}</p>
        </div>
        <div className="flex items-center gap-2">
          {hasCustomizations && (
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-700">
              Customized
            </span>
          )}
          <TriggerBadge trigger={template.trigger} />
        </div>
      </div>

      {/* Toggle: Preview / Edit */}
      <div className="flex items-center gap-2 mb-6">
        <button
          onClick={() => setShowEditor(false)}
          className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
            !showEditor ? 'bg-[#003e79] text-white' : 'bg-[#f5f5f7] text-[#6e6e73] hover:bg-[#e8e8ed]'
          }`}
        >
          Preview
        </button>
        <button
          onClick={() => setShowEditor(true)}
          className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
            showEditor ? 'bg-[#003e79] text-white' : 'bg-[#f5f5f7] text-[#6e6e73] hover:bg-[#e8e8ed]'
          }`}
        >
          Edit Template
          {dirty && <span className="ml-1.5 w-2 h-2 bg-amber-400 rounded-full inline-block" />}
        </button>
      </div>

      {showEditor ? (
        /* ── EDITOR ── */
        <div className="space-y-6">
          {/* Locked sections notice */}
          <div className="bg-[#f5f5f7] rounded-xl border border-[#e8e8ed] p-4">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-[#86868b] mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              <div>
                <p className="text-sm font-semibold text-[#1d1d1f]">Some sections are locked</p>
                <p className="text-xs text-[#86868b] mt-0.5">
                  The header branding, footer, layout, and dynamic data sections (event details, registration summary, payment options) cannot be edited.
                  You can customize the text content, subject line, and button text below.
                </p>
              </div>
            </div>
          </div>

          {/* Editable fields */}
          {editableFields.map((field) => {
            const isChanged = formValues[field.key] !== defaults[field.key];
            return (
              <div key={field.key} className="bg-white rounded-xl border border-[#e8e8ed] p-5">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-semibold text-[#1d1d1f]">{field.label}</label>
                  {isChanged && (
                    <button
                      onClick={() => handleFieldChange(field.key, defaults[field.key])}
                      className="text-xs text-[#003e79] hover:underline font-medium"
                    >
                      Reset to default
                    </button>
                  )}
                </div>
                {field.variables && field.variables.length > 0 && (
                  <p className="text-xs text-[#86868b] mb-2">
                    Available variables: {field.variables.map(v => (
                      <code key={v} className="mx-0.5 px-1.5 py-0.5 bg-[#f5f5f7] rounded text-[10px] font-mono text-[#003e79]">{`{${v}}`}</code>
                    ))}
                  </p>
                )}
                {field.type === 'textarea' ? (
                  <textarea
                    value={formValues[field.key] || ''}
                    onChange={(e) => handleFieldChange(field.key, e.target.value)}
                    rows={4}
                    className={`w-full px-4 py-3 rounded-xl border text-sm focus:ring-2 focus:ring-[#003e79] focus:border-transparent outline-none transition-colors ${
                      isChanged ? 'border-[#003e79] bg-blue-50/30' : 'border-[#e8e8ed] bg-white'
                    }`}
                  />
                ) : (
                  <input
                    type="text"
                    value={formValues[field.key] || ''}
                    onChange={(e) => handleFieldChange(field.key, e.target.value)}
                    className={`w-full px-4 py-3 rounded-xl border text-sm focus:ring-2 focus:ring-[#003e79] focus:border-transparent outline-none transition-colors ${
                      isChanged ? 'border-[#003e79] bg-blue-50/30' : 'border-[#e8e8ed] bg-white'
                    }`}
                  />
                )}
                {isChanged && (
                  <p className="text-[10px] text-[#86868b] mt-1">
                    Default: <span className="font-mono">{defaults[field.key].substring(0, 80)}{defaults[field.key].length > 80 ? '...' : ''}</span>
                  </p>
                )}
              </div>
            );
          })}

          {/* Save / Reset actions */}
          <div className="flex items-center justify-between pt-2">
            <div>
              {hasCustomizations && (
                <button
                  onClick={handleReset}
                  disabled={resetting}
                  className="px-5 py-2.5 rounded-xl text-sm font-semibold border border-red-200 text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40"
                >
                  {resetting ? 'Resetting...' : 'Reset All to Defaults'}
                </button>
              )}
            </div>
            <div className="flex items-center gap-3">
              {saveResult && (
                <span className={`text-sm font-semibold ${saveResult.success ? 'text-emerald-600' : 'text-red-600'}`}>
                  {saveResult.message}
                </span>
              )}
              <button
                onClick={handleSave}
                disabled={saving || !dirty}
                className="px-6 py-2.5 rounded-xl text-sm font-bold bg-[#003e79] text-white hover:bg-[#002d5a] transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {saving ? (
                  <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" /> Saving...</>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    Save Changes
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* ── PREVIEW MODE ── */
        <div>
          {/* Info bar */}
          <div className="grid grid-cols-2 gap-3 mb-6">
            <div className="bg-white rounded-xl border border-[#e8e8ed] p-4">
              <p className="text-xs font-medium text-[#86868b] uppercase tracking-wider">Subject Line</p>
              <p className="text-sm font-semibold text-[#1d1d1f] mt-1">{preview?.subject || '—'}</p>
            </div>
            <div className="bg-white rounded-xl border border-[#e8e8ed] p-4">
              <p className="text-xs font-medium text-[#86868b] uppercase tracking-wider">From Address</p>
              <p className="text-sm font-semibold text-[#1d1d1f] mt-1">{template.from}</p>
            </div>
          </div>

          {/* Send test */}
          <div className="bg-[#f0f7ff] rounded-xl border border-[#003e79]/15 p-5 mb-6">
            <h3 className="font-bold text-[#003e79] text-sm mb-3">Send a Test Email</h3>
            <div className="flex gap-3">
              <input
                type="email"
                value={testEmail}
                onChange={e => { setTestEmail(e.target.value); setSendResult(null); }}
                placeholder="Enter email address..."
                className="flex-1 px-4 py-2.5 rounded-xl border border-[#e8e8ed] bg-white text-sm focus:ring-2 focus:ring-[#003e79] focus:border-transparent outline-none"
              />
              <button
                onClick={handleSendTest}
                disabled={sending || !testEmail}
                className="px-6 py-2.5 rounded-xl text-sm font-bold bg-[#003e79] text-white hover:bg-[#002d5a] transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {sending ? (
                  <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" /> Sending...</>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                    </svg>
                    Send Test
                  </>
                )}
              </button>
            </div>
            {sendResult && (
              <div className={`mt-3 flex items-center gap-2 text-sm font-semibold ${sendResult.success ? 'text-emerald-600' : 'text-red-600'}`}>
                {sendResult.success ? (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    Test email sent to {testEmail}!
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    Failed: {sendResult.error}
                  </>
                )}
              </div>
            )}
          </div>

          {/* Email Preview */}
          <div className="bg-white rounded-xl border border-[#e8e8ed] overflow-hidden">
            <div className="px-5 py-3 bg-[#fafafa] border-b border-[#e8e8ed] flex items-center justify-between">
              <h3 className="font-semibold text-[#1d1d1f] text-sm">Email Preview</h3>
              <span className="text-[10px] text-[#86868b] font-medium">Sample data shown — actual emails use real registration details</span>
            </div>
            <iframe
              ref={iframeRef}
              className="w-full h-[600px] border-0"
              title="Email Preview"
            />
          </div>
        </div>
      )}
    </div>
  );
}


/* ══════════════════════════════════════════
   MAIN PAGE
   ══════════════════════════════════════════ */
export default function AutomatedEmailsPage() {
  const [templates, setTemplates] = useState<AutomatedTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTemplate, setSelectedTemplate] = useState<AutomatedTemplate | null>(null);

  useEffect(() => {
    authFetch(`${API_BASE}/email/automated`)
      .then(r => r.json())
      .then((d: any) => {
        if (d.success) setTemplates(d.data);
      })
      .finally(() => setLoading(false));
  }, []);

  if (selectedTemplate) {
    return (
      <div className="p-6">
        <TemplateDetail template={selectedTemplate} onBack={() => {
          setSelectedTemplate(null);
          // Refresh list to show updated customization badges
          authFetch(`${API_BASE}/email/automated`)
            .then(r => r.json())
            .then((d: any) => { if (d.success) setTemplates(d.data); });
        }} />
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Header with back link to campaigns */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <a href="/admin/email"
              className="text-sm text-[#003e79] hover:underline font-medium flex items-center gap-1">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
              Campaigns
            </a>
            <span className="text-[#c8c8cd]">/</span>
            <span className="text-sm text-[#86868b] font-medium">Automated Emails</span>
          </div>
          <h1 className="text-2xl font-bold text-[#1d1d1f]">Automated Emails</h1>
          <p className="text-sm text-[#86868b] mt-1">
            These emails are sent automatically based on user actions. Preview, edit, and send tests.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#003e79]" />
        </div>
      ) : (
        <div className="space-y-3">
          {templates.map(t => (
            <button
              key={t.id}
              onClick={() => setSelectedTemplate(t)}
              className="w-full text-left bg-white rounded-xl border border-[#e8e8ed] p-5 hover:border-[#003e79]/30 hover:shadow-sm transition-all group"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <h3 className="font-semibold text-[#1d1d1f] group-hover:text-[#003e79] transition-colors">
                      {t.name}
                    </h3>
                    <TriggerBadge trigger={t.trigger} />
                    {t.hasCustomizations && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-blue-700">
                        Customized
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-[#86868b] mt-1.5">{t.description}</p>
                  <p className="text-xs text-[#aeaeb2] mt-2">
                    From: {t.from}
                  </p>
                </div>
                <svg className="w-5 h-5 text-[#c8c8cd] group-hover:text-[#003e79] transition-colors flex-shrink-0 mt-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
