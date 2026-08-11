'use client';

import { useEffect, useState, useRef, useMemo } from 'react';

const API = 'https://uht.chad-157.workers.dev/api';

interface Org {
  id: number;
  name: string;
  state: string;
  team_count?: number;
  is_active?: number;
  owner_email?: string;
  owner_name?: string;
}

interface CsvRow {
  name: string;
  state: string;
}

interface ImportResult {
  imported: number;
  skipped: number;
  skippedNames?: string[];
}

interface OrgRequest {
  id: string;
  name: string;
  city: string;
  state: string;
  requested_by_email: string;
  requested_by_name: string;
  status: string;
  admin_notes: string;
  created_at: string;
  matched_org: { id: string; name: string; city: string | null; state: string | null; team_count: number } | null;
}

function getToken(): string {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('uht_token') || '';
  }
  return '';
}

function parseCsv(text: string): CsvRow[] {
  const rows: CsvRow[] = [];
  // Strip BOM if present
  const clean = text.replace(/^﻿/, '');
  const lines = clean.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return rows;

  // Detect delimiter
  const firstLine = lines[0];
  const delimiter = firstLine.includes('\t') ? '\t' : ',';

  // Check if first row looks like a header (contains letters like "name", "org", "state")
  const firstParts = firstLine.split(delimiter).map((s) => s.trim().replace(/^"|"$/g, '').toLowerCase());
  const looksLikeHeader = firstParts.some((p) => /^(organization|org|name|state|team)/.test(p));
  const startIdx = looksLikeHeader ? 1 : 0;

  // If only 1 line and it's a header, nothing to import
  if (startIdx >= lines.length) return rows;

  for (let i = startIdx; i < lines.length; i++) {
    const parts = lines[i].split(delimiter).map((s) => s.trim().replace(/^"|"$/g, ''));
    const name = parts[0] || '';
    const state = parts[1] || '';
    if (name) {
      rows.push({ name, state });
    }
  }
  return rows;
}

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA',
  'HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY',
  // Canadian provinces/territories
  'AB','BC','MB','NB','NL','NS','NT','NU','ON','PE','QC','SK','YT',
];

export default function OrganizationsPage() {
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  // States start collapsed; this tracks the ones the admin has opened
  const [expandedStates, setExpandedStates] = useState<Set<string>>(new Set());

  // CSV upload
  const [csvRows, setCsvRows] = useState<CsvRow[] | null>(null);
  const [csvFileName, setCsvFileName] = useState('');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Add form
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newState, setNewState] = useState('');
  const [adding, setAdding] = useState(false);

  // Delete
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // Org requests (fall teams)
  const [requests, setRequests] = useState<OrgRequest[]>([]);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [denyingId, setDenyingId] = useState<string | null>(null);
  // Request id whose "merge into existing org" owner-choice panel is open
  const [mergeChoiceId, setMergeChoiceId] = useState<string | null>(null);

  // Owner assignment
  const [ownerEditId, setOwnerEditId] = useState<number | null>(null);
  const [ownerEmail, setOwnerEmail] = useState('');
  const [ownerSaving, setOwnerSaving] = useState(false);
  const [ownerError, setOwnerError] = useState('');

  const handleSetOwner = async (org: Org) => {
    if (!ownerEmail.trim()) return;
    setOwnerSaving(true);
    setOwnerError('');
    try {
      const res = await fetch(`${API}/organizations/admin/${org.id}/owner`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ email: ownerEmail.trim() }),
      });
      const json = await res.json();
      if (json.success) {
        setOrgs(prev => prev.map(o => o.id === org.id
          ? { ...o, owner_email: json.data.owner_email, owner_name: json.data.owner_name }
          : o));
        setOwnerEditId(null);
        setOwnerEmail('');
      } else {
        setOwnerError(json.error || 'Failed to set owner');
      }
    } catch {
      setOwnerError('Network error');
    } finally {
      setOwnerSaving(false);
    }
  };

  const fetchOrgs = async () => {
    try {
      const res = await fetch(`${API}/organizations/admin/list`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (res.ok) {
        const data = await res.json();
        setOrgs(data.data || data.organizations || []);
      }
    } catch (e) {
      console.error('Failed to fetch organizations', e);
    } finally {
      setLoading(false);
    }
  };

  const fetchRequests = async () => {
    try {
      const res = await fetch(`${API}/organizations/admin/requests`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (res.ok) {
        const data = await res.json();
        setRequests(data.data || []);
      }
    } catch (e) {
      console.error('Failed to fetch org requests', e);
    }
  };

  const handleApprove = async (req: OrgRequest, options?: { mode: 'merge'; makeOwner: boolean }) => {
    setApprovingId(req.id);
    setMergeChoiceId(null);
    try {
      const body = options
        ? { mode: 'merge', makeOwner: options.makeOwner, mergeOrgId: req.matched_org?.id }
        : {};
      const res = await fetch(`${API}/organizations/admin/requests/${req.id}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        fetchRequests();
        fetchOrgs();
      } else {
        const err = await res.text();
        alert('Failed to approve: ' + err);
      }
    } catch {
      alert('Failed to approve request');
    } finally {
      setApprovingId(null);
    }
  };

  const handleDeny = async (req: OrgRequest) => {
    const reason = prompt(`Reason for denying "${req.name}"? (optional)`);
    if (reason === null) return; // cancelled
    setDenyingId(req.id);
    try {
      const res = await fetch(`${API}/organizations/admin/requests/${req.id}/deny`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ reason: reason || undefined }),
      });
      if (res.ok) {
        fetchRequests();
      } else {
        const err = await res.text();
        alert('Failed to deny: ' + err);
      }
    } catch {
      alert('Failed to deny request');
    } finally {
      setDenyingId(null);
    }
  };

  useEffect(() => {
    fetchOrgs();
    fetchRequests();
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return orgs;
    const q = search.toLowerCase();
    return orgs.filter((o) => o.name.toLowerCase().includes(q));
  }, [orgs, search]);

  const grouped = useMemo(() => {
    const map: Record<string, Org[]> = {};
    for (const o of filtered) {
      const st = o.state || 'Unknown';
      if (!map[st]) map[st] = [];
      map[st].push(o);
    }
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  const toggleState = (state: string) => {
    setExpandedStates((prev) => {
      const next = new Set(prev);
      if (next.has(state)) next.delete(state);
      else next.add(state);
      return next;
    });
  };

  // CSV handling
  const handleFile = (file: File) => {
    setCsvFileName(file.name);
    setImportResult(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const rows = parseCsv(text);
      setCsvRows(rows);
    };
    reader.readAsText(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file && (file.name.endsWith('.csv') || file.name.endsWith('.tsv') || file.name.endsWith('.txt'))) {
      handleFile(file);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const handleImport = async () => {
    if (!csvRows || csvRows.length === 0) return;
    setImporting(true);
    try {
      const res = await fetch(`${API}/organizations/admin/bulk-import`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ organizations: csvRows }),
      });
      if (res.ok) {
        const data = await res.json();
        setImportResult(data);
        setCsvRows(null);
        setCsvFileName('');
        fetchOrgs();
      } else {
        const err = await res.text();
        alert('Import failed: ' + err);
      }
    } catch (e) {
      alert('Import failed');
    } finally {
      setImporting(false);
    }
  };

  // Add org (uses bulk-import with a single org for simplicity)
  const handleAdd = async () => {
    if (!newName.trim() || !newState) return;
    setAdding(true);
    try {
      const res = await fetch(`${API}/organizations/admin/bulk-import`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ organizations: [{ name: newName.trim(), state: newState }] }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.skipped > 0) {
          alert(`"${newName.trim()}" already exists.`);
        } else {
          setNewName('');
          setNewState('');
          setShowAddForm(false);
        }
        fetchOrgs();
      } else {
        const err = await res.text();
        alert('Failed to create: ' + err);
      }
    } catch (e) {
      alert('Failed to create organization');
    } finally {
      setAdding(false);
    }
  };

  // Delete org
  const handleDelete = async (org: Org) => {
    if (!confirm(`Delete "${org.name}"? This cannot be undone.`)) return;
    setDeletingId(org.id);
    try {
      const res = await fetch(`${API}/organizations/${org.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (res.ok) {
        fetchOrgs();
      } else {
        // Fallback: try PATCH to deactivate
        const patchRes = await fetch(`${API}/organizations/${org.id}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${getToken()}`,
          },
          body: JSON.stringify({ is_active: 0 }),
        });
        if (patchRes.ok) {
          fetchOrgs();
        } else {
          alert('Failed to delete organization');
        }
      }
    } catch (e) {
      alert('Failed to delete organization');
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-[#e8e8ed] rounded w-48" />
          <div className="h-64 bg-[#e8e8ed] rounded-2xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-[#1d1d1f]">Organizations</h1>
          <span className="bg-[#003e79] text-white text-xs font-semibold px-2.5 py-1 rounded-full">
            {orgs.length}
          </span>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="px-4 py-2 bg-[#003e79] text-white text-sm font-medium rounded-lg hover:bg-[#002d5a] transition-colors"
        >
          + Add Organization
        </button>
      </div>

      {/* Pending Organization Requests (from fall coaches) */}
      {requests.filter((r) => r.status === 'pending').length > 0 && (
        <div className="bg-amber-50 rounded-2xl shadow-sm border border-amber-200 p-5 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            <h3 className="text-sm font-semibold text-amber-800">
              Pending Organization Requests
            </h3>
            <span className="bg-amber-200 text-amber-800 text-xs font-semibold px-2 py-0.5 rounded-full">
              {requests.filter((r) => r.status === 'pending').length}
            </span>
          </div>
          <div className="space-y-3">
            {requests
              .filter((r) => r.status === 'pending')
              .map((req) => (
                <div
                  key={req.id}
                  className="bg-white rounded-xl border border-amber-200 p-4"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-[#1d1d1f]">{req.name}</span>
                        {req.state && (
                          <span className="text-xs text-[#6e6e73] bg-[#f5f5f7] px-2 py-0.5 rounded-full">
                            {req.city ? `${req.city}, ${req.state}` : req.state}
                          </span>
                        )}
                        {req.matched_org && (
                          <span className="text-xs font-semibold text-orange-700 bg-orange-100 border border-orange-200 px-2 py-0.5 rounded-full">
                            ⚠ Matches existing org: {req.matched_org.name}
                            {req.matched_org.state ? ` (${req.matched_org.state})` : ''}
                            {` · ${req.matched_org.team_count} team${req.matched_org.team_count !== 1 ? 's' : ''}`}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-[#6e6e73] mt-1">
                        Requested by{' '}
                        <span className="font-medium text-[#1d1d1f]">
                          {req.requested_by_name || req.requested_by_email}
                        </span>
                        {req.requested_by_name && (
                          <span className="text-[#86868b]"> ({req.requested_by_email})</span>
                        )}
                        <span className="text-[#86868b]">
                          {' '}&middot;{' '}
                          {new Date(req.created_at).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      {req.matched_org ? (
                        <button
                          onClick={() => setMergeChoiceId(mergeChoiceId === req.id ? null : req.id)}
                          disabled={approvingId === req.id}
                          className="px-4 py-1.5 bg-green-600 text-white text-xs font-semibold rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
                        >
                          {approvingId === req.id ? 'Approving...' : 'Approve & Merge'}
                        </button>
                      ) : (
                        <button
                          onClick={() => handleApprove(req)}
                          disabled={approvingId === req.id}
                          className="px-4 py-1.5 bg-green-600 text-white text-xs font-semibold rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
                        >
                          {approvingId === req.id ? 'Approving...' : 'Approve'}
                        </button>
                      )}
                      <button
                        onClick={() => handleDeny(req)}
                        disabled={denyingId === req.id}
                        className="px-4 py-1.5 bg-white text-red-600 text-xs font-semibold rounded-lg border border-red-200 hover:bg-red-50 transition-colors disabled:opacity-50"
                      >
                        {denyingId === req.id ? 'Denying...' : 'Deny'}
                      </button>
                    </div>
                  </div>

                  {/* Merge choice panel — decide whether the requester becomes an org owner */}
                  {req.matched_org && mergeChoiceId === req.id && (
                    <div className="mt-3 p-3 bg-orange-50 border border-orange-200 rounded-lg">
                      <p className="text-xs text-[#1d1d1f] mb-2">
                        <span className="font-semibold">{req.matched_org.name}</span> already exists — no new org will be created.
                        Should <span className="font-semibold">{req.requested_by_name || req.requested_by_email}</span> become an owner of it,
                        or are they just a coach/manager of a team in the org?
                      </p>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleApprove(req, { mode: 'merge', makeOwner: true })}
                          className="px-3 py-1.5 bg-[#003e79] text-white text-xs font-semibold rounded-lg hover:bg-[#002d5a] transition-colors"
                        >
                          Merge — make them an owner
                        </button>
                        <button
                          onClick={() => handleApprove(req, { mode: 'merge', makeOwner: false })}
                          className="px-3 py-1.5 bg-white text-[#003e79] text-xs font-semibold rounded-lg border border-[#003e79]/30 hover:bg-[#f0f7ff] transition-colors"
                        >
                          Merge — no ownership (they&apos;ll join a team)
                        </button>
                        <button
                          onClick={() => setMergeChoiceId(null)}
                          className="px-3 py-1.5 text-xs font-medium text-[#6e6e73] hover:text-[#1d1d1f]"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
          </div>
          <p className="text-xs text-amber-700 mt-3">
            Approving creates the organization and sends an email to the coach with a link to create their team.
          </p>
        </div>
      )}

      {/* Add Form */}
      {showAddForm && (
        <div className="bg-white rounded-2xl shadow-sm border border-[#e8e8ed] p-5 mb-6">
          <h3 className="text-sm font-semibold text-[#1d1d1f] mb-3">New Organization</h3>
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label className="block text-xs font-medium text-[#6e6e73] mb-1">Name</label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Organization name"
                className="w-full px-3 py-2 border border-[#e8e8ed] rounded-lg text-sm text-[#1d1d1f] focus:outline-none focus:border-[#003e79] focus:ring-1 focus:ring-[#003e79]"
              />
            </div>
            <div className="w-32">
              <label className="block text-xs font-medium text-[#6e6e73] mb-1">State</label>
              <select
                value={newState}
                onChange={(e) => setNewState(e.target.value)}
                className="w-full px-3 py-2 border border-[#e8e8ed] rounded-lg text-sm text-[#1d1d1f] focus:outline-none focus:border-[#003e79] focus:ring-1 focus:ring-[#003e79] bg-white"
              >
                <option value="">Select</option>
                {US_STATES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <button
              onClick={handleAdd}
              disabled={adding || !newName.trim() || !newState}
              className="px-4 py-2 bg-[#003e79] text-white text-sm font-medium rounded-lg hover:bg-[#002d5a] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {adding ? 'Creating...' : 'Create'}
            </button>
            <button
              onClick={() => { setShowAddForm(false); setNewName(''); setNewState(''); }}
              className="px-4 py-2 text-[#6e6e73] text-sm font-medium rounded-lg hover:bg-[#f5f5f7] transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="mb-6">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search organizations..."
          className="w-full px-4 py-2.5 bg-white border border-[#e8e8ed] rounded-xl text-sm text-[#1d1d1f] placeholder-[#86868b] focus:outline-none focus:border-[#003e79] focus:ring-1 focus:ring-[#003e79]"
        />
      </div>

      {/* CSV Upload */}
      <div className="bg-white rounded-2xl shadow-sm border border-[#e8e8ed] p-5 mb-6">
        <h3 className="text-sm font-semibold text-[#1d1d1f] mb-3">CSV Import</h3>
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={
            'border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ' +
            (dragOver
              ? 'border-[#003e79] bg-[#f0f7ff]'
              : 'border-[#e8e8ed] hover:border-[#003e79] hover:bg-[#fafafa]')
          }
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.tsv,.txt"
            onChange={handleFileInput}
            className="hidden"
          />
          <div className="text-[#6e6e73] text-sm">
            <span className="text-[#003e79] font-medium">Click to upload</span> or drag and drop a CSV file
          </div>
          <p className="text-xs text-[#86868b] mt-1">
            Columns: &quot;Organization Name&quot; and &quot;State&quot; (first row is header)
          </p>
        </div>

        {/* CSV Preview */}
        {csvRows && csvRows.length > 0 && (
          <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-[#1d1d1f]">
                <span className="font-medium">{csvFileName}</span> &mdash; {csvRows.length} organizations found
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => { setCsvRows(null); setCsvFileName(''); }}
                  className="px-3 py-1.5 text-xs text-[#6e6e73] rounded-lg hover:bg-[#f5f5f7] transition-colors"
                >
                  Clear
                </button>
                <button
                  onClick={handleImport}
                  disabled={importing}
                  className="px-4 py-1.5 bg-[#003e79] text-white text-xs font-medium rounded-lg hover:bg-[#002d5a] transition-colors disabled:opacity-50"
                >
                  {importing ? 'Importing...' : 'Import'}
                </button>
              </div>
            </div>
            <div className="max-h-48 overflow-y-auto border border-[#e8e8ed] rounded-lg">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#f5f5f7] sticky top-0">
                    <th className="text-left px-3 py-2 font-medium text-[#6e6e73] text-xs">#</th>
                    <th className="text-left px-3 py-2 font-medium text-[#6e6e73] text-xs">Organization Name</th>
                    <th className="text-left px-3 py-2 font-medium text-[#6e6e73] text-xs">State</th>
                  </tr>
                </thead>
                <tbody>
                  {csvRows.map((row, i) => (
                    <tr key={i} className="border-t border-[#e8e8ed]">
                      <td className="px-3 py-1.5 text-[#86868b] text-xs">{i + 1}</td>
                      <td className="px-3 py-1.5 text-[#1d1d1f]">{row.name}</td>
                      <td className="px-3 py-1.5 text-[#6e6e73]">{row.state}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Import Result */}
        {importResult && (
          <div className="mt-4 p-4 bg-[#f0f7ff] rounded-lg border border-[#003e79]/20">
            <p className="text-sm font-medium text-[#003e79]">
              Import complete: {importResult.imported} imported, {importResult.skipped} skipped
            </p>
            {importResult.skippedNames && importResult.skippedNames.length > 0 && (
              <div className="mt-2">
                <p className="text-xs text-[#6e6e73] mb-1">Skipped (already exist):</p>
                <p className="text-xs text-[#86868b]">{importResult.skippedNames.join(', ')}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* State Sections */}
      {grouped.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-[#e8e8ed] p-12 text-center">
          <p className="text-[#6e6e73] text-sm">
            {search ? 'No organizations match your search.' : 'No organizations found.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {grouped.map(([state, stateOrgs]) => {
            // Searching expands everything so matches are visible immediately
            const isCollapsed = search.trim() ? false : !expandedStates.has(state);
            return (
              <div
                key={state}
                className="bg-white rounded-2xl shadow-sm border border-[#e8e8ed] overflow-hidden"
              >
                <button
                  onClick={() => toggleState(state)}
                  className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-[#fafafa] transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    <svg
                      className={'w-4 h-4 text-[#86868b] transition-transform ' + (isCollapsed ? '' : 'rotate-90')}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                    <span className="text-sm font-semibold text-[#1d1d1f]">{state}</span>
                  </div>
                  <span className="text-xs font-medium text-[#6e6e73] bg-[#f5f5f7] px-2 py-0.5 rounded-full">
                    {stateOrgs.length}
                  </span>
                </button>
                {!isCollapsed && (
                  <div className="border-t border-[#e8e8ed]">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-[#f5f5f7]">
                          <th className="text-left px-5 py-2 font-medium text-[#6e6e73] text-xs">Name</th>
                          <th className="text-left px-5 py-2 font-medium text-[#6e6e73] text-xs w-24">Teams</th>
                          <th className="text-left px-5 py-2 font-medium text-[#6e6e73] text-xs">Owner</th>
                          <th className="text-right px-5 py-2 font-medium text-[#6e6e73] text-xs w-20"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {stateOrgs.map((org) => (
                          <tr key={org.id} className="border-t border-[#e8e8ed] hover:bg-[#fafafa]">
                            <td className="px-5 py-2.5 text-[#1d1d1f]">{org.name}</td>
                            <td className="px-5 py-2.5 text-[#6e6e73]">
                              {org.team_count != null ? org.team_count : '—'}
                            </td>
                            <td className="px-5 py-2.5 text-[#6e6e73]">
                              {ownerEditId === org.id ? (
                                <span className="flex items-center gap-1.5">
                                  <input
                                    autoFocus
                                    value={ownerEmail}
                                    onChange={(e) => { setOwnerEmail(e.target.value); setOwnerError(''); }}
                                    onKeyDown={(e) => { if (e.key === 'Enter') handleSetOwner(org); if (e.key === 'Escape') { setOwnerEditId(null); setOwnerEmail(''); setOwnerError(''); } }}
                                    placeholder="owner@email.com"
                                    className="border border-[#d2d2d7] rounded-lg px-2 py-1 text-xs w-44 focus:outline-none focus:border-[#003e79]"
                                  />
                                  <button onClick={() => handleSetOwner(org)} disabled={ownerSaving}
                                    className="text-xs text-white bg-[#003e79] hover:bg-[#002d5a] rounded-lg px-2 py-1 font-medium disabled:opacity-50">
                                    {ownerSaving ? '...' : 'Save'}
                                  </button>
                                  <button onClick={() => { setOwnerEditId(null); setOwnerEmail(''); setOwnerError(''); }}
                                    className="text-xs text-[#6e6e73] hover:text-[#1d1d1f] px-1">✕</button>
                                  {ownerError && <span className="text-xs text-red-500">{ownerError}</span>}
                                </span>
                              ) : org.owner_email ? (
                                <button onClick={() => { setOwnerEditId(org.id); setOwnerEmail(org.owner_email || ''); setOwnerError(''); }}
                                  className="text-left hover:text-[#003e79] transition-colors" title="Click to change owner">
                                  {org.owner_name || org.owner_email}
                                  <span className="block text-[11px] text-[#a1a1a6]">{org.owner_email}</span>
                                </button>
                              ) : (
                                <button onClick={() => { setOwnerEditId(org.id); setOwnerEmail(''); setOwnerError(''); }}
                                  className="text-xs text-[#003e79] hover:text-[#002d5a] font-medium">
                                  + Set Owner
                                </button>
                              )}
                            </td>
                            <td className="px-5 py-2.5 text-right">
                              <button
                                onClick={() => handleDelete(org)}
                                disabled={deletingId === org.id}
                                className="text-xs text-red-500 hover:text-red-700 font-medium disabled:opacity-50 transition-colors"
                              >
                                {deletingId === org.id ? '...' : 'Delete'}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
