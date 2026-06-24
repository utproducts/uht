'use client';

import { useEffect, useState, useRef, useMemo } from 'react';

const API = 'https://uht.chad-157.workers.dev/api';

interface Org {
  id: number;
  name: string;
  state: string;
  team_count?: number;
  is_active?: number;
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

function getToken(): string {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('uht_token') || '';
  }
  return '';
}

function parseCsv(text: string): CsvRow[] {
  const rows: CsvRow[] = [];
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return rows;

  // Detect delimiter
  const headerLine = lines[0];
  const delimiter = headerLine.includes('\t') ? '\t' : ',';

  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(delimiter).map((s) => s.trim().replace(/^"|"$/g, ''));
    if (parts.length >= 2 && parts[0] && parts[1]) {
      rows.push({ name: parts[0], state: parts[1] });
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
];

export default function OrganizationsPage() {
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [collapsedStates, setCollapsedStates] = useState<Set<string>>(new Set());

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

  const fetchOrgs = async () => {
    try {
      const res = await fetch(`${API}/organizations/admin/list`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (res.ok) {
        const data = await res.json();
        setOrgs(data.organizations || data || []);
      }
    } catch (e) {
      console.error('Failed to fetch organizations', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrgs();
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
    setCollapsedStates((prev) => {
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

  // Add org
  const handleAdd = async () => {
    if (!newName.trim() || !newState) return;
    setAdding(true);
    try {
      const res = await fetch(`${API}/organizations/quick-create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ name: newName.trim(), state: newState }),
      });
      if (res.ok) {
        setNewName('');
        setNewState('');
        setShowAddForm(false);
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
            const isCollapsed = collapsedStates.has(state);
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
