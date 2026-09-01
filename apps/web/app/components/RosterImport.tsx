'use client';

import { useState, useRef, useCallback } from 'react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://uht.chad-157.workers.dev';

interface Player {
  id?: string;
  firstName: string;
  lastName: string;
  jerseyNumber: string;
  awayJerseyNumber?: string;
  position: string;
  shoots: string;
}

interface RosterImportProps {
  teamId: string;
  onPlayersAdded: (players: Player[]) => void;
  compact?: boolean; // For inline use in create-team wizard
}

const TEMPLATE_HEADERS = ['Jersey #', 'First Name', 'Last Name', 'Position', 'Shoots'];
const EXAMPLE_ROWS = [
  ['12', 'John', 'Smith', 'Forward', 'Left'],
  ['7', 'Jane', 'Doe', 'Defense', 'Right'],
  ['30', 'Bob', 'Wilson', 'Goalie', 'Left'],
];

function getAuthHeaders(): Record<string, string> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('uht_token') : null;
  return token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
}

function normalizePosition(raw: string): string {
  if (!raw) return '';
  const lp = raw.toLowerCase().trim();
  if (lp.startsWith('f') || lp === 'c' || lp === 'lw' || lp === 'rw' || lp === 'center' || lp === 'wing') return 'forward';
  if (lp.startsWith('d') || lp === 'ld' || lp === 'rd') return 'defense';
  if (lp.startsWith('g')) return 'goalie';
  return '';
}

function normalizeShoots(raw: string): string {
  if (!raw) return '';
  const ls = raw.toLowerCase().trim();
  if (ls.startsWith('l')) return 'left';
  if (ls.startsWith('r')) return 'right';
  return '';
}

// Strip "H " or "A " prefix from USA Hockey jersey format (e.g. "H 98" → "98")
function stripJerseyPrefix(raw: string): string {
  return raw.replace(/^[HA]\s+/, '').trim();
}

// Parse a 2D array of rows into Player objects
function parseRows(rows: string[][]): Player[] {
  if (rows.length === 0) return [];

  // Try to detect header row
  const firstRow = rows[0].map(c => c.toLowerCase().trim());
  let colMap: Record<string, number> = {};
  let startRow = 0;

  // Check if first row looks like a header
  const headerKeywords = ['jersey', '#', 'first', 'last', 'name', 'pos', 'shoot', 'usa', 'number', 'dob'];
  const isHeader = firstRow.some(c => headerKeywords.some(kw => c.includes(kw)));

  if (isHeader) {
    startRow = 1;
    for (let i = 0; i < firstRow.length; i++) {
      const h = firstRow[i];
      if (h.includes('jersey') || h === '#' || h === 'no' || (h === 'number' && i === 0)) colMap.jersey = i;
      else if (h.includes('first')) colMap.firstName = i;
      else if (h.includes('last')) colMap.lastName = i;
      else if (h === 'name' || h === 'player') colMap.fullName = i;
      else if (h.includes('pos')) colMap.position = i;
      else if (h.includes('shoot')) colMap.shoots = i;
      else if (h.includes('dob') || h.includes('birth')) colMap.dob = i;
      // skip usa hockey columns
    }
  }

  // Detect USA Hockey H/A jersey format: check if data in jersey column starts with "H "
  // and the next column starts with "A ". If so, the header column count is off by 1 —
  // the "Position" header actually maps to the away jersey data column.
  let awayJerseyCol = -1;
  const sampleRow = rows[startRow];
  if (colMap.jersey !== undefined && sampleRow) {
    const jerseyVal = (sampleRow[colMap.jersey] || '').trim();
    if (/^H\s+\d/.test(jerseyVal) || /^H\s*$/.test(jerseyVal)) {
      // Home jersey detected — check next column for away jersey
      const nextCol = colMap.jersey + 1;
      const nextVal = (sampleRow[nextCol] || '').trim();
      if (/^A\s+\d/.test(nextVal) || /^A\s*$/.test(nextVal)) {
        awayJerseyCol = nextCol;
        // The header mapped "Position" to what's actually the away jersey column.
        // Shift position (and any other cols mapped at or after awayJerseyCol) right by 1.
        if (colMap.position !== undefined && colMap.position === awayJerseyCol) {
          // Real position data is one column further right
          colMap.position = awayJerseyCol + 1;
        }
        if (colMap.dob !== undefined && colMap.dob >= awayJerseyCol) {
          colMap.dob = colMap.dob + 1;
        }
      }
    }
  }

  // If no header detected, guess by our template column order
  if (Object.keys(colMap).length === 0) {
    // Assume template order: Jersey, First, Last, Position, Shoots
    // Or detect: if first column is numeric, it's jersey
    const sample = rows[startRow] || [];
    if (sample.length >= 3) {
      if (/^\d{1,3}$/.test(sample[0]?.trim()) || /^[HA]\s+\d/.test(sample[0]?.trim())) {
        // Starts with jersey number (plain or H/A format)
        colMap = { jersey: 0, firstName: 1, lastName: 2, position: 3, shoots: 4 };
      } else if (sample[0]?.includes(',')) {
        // "Last, First" format
        colMap = { fullName: 0, jersey: 1, position: 2, shoots: 3 };
      } else {
        // First Last format
        colMap = { firstName: 0, lastName: 1, jersey: 2, position: 3, shoots: 4 };
      }
    }
  }

  const players: Player[] = [];

  for (let i = startRow; i < rows.length; i++) {
    const row = rows[i];
    if (row.every(c => !c.trim())) continue; // skip empty rows

    let firstName = '', lastName = '';

    if (colMap.fullName !== undefined && row[colMap.fullName]) {
      const name = row[colMap.fullName].trim();
      if (name.includes(',')) {
        const parts = name.split(',').map(s => s.trim());
        lastName = parts[0];
        firstName = parts[1] || '';
      } else {
        const parts = name.split(/\s+/);
        firstName = parts[0] || '';
        lastName = parts.slice(1).join(' ') || '';
      }
    } else {
      firstName = (colMap.firstName !== undefined ? row[colMap.firstName] : '')?.trim() || '';
      lastName = (colMap.lastName !== undefined ? row[colMap.lastName] : '')?.trim() || '';
    }

    if (!firstName && !lastName) continue;

    // Extract jersey number, stripping H/A prefix if present
    let jerseyNumber = (colMap.jersey !== undefined ? row[colMap.jersey] : '')?.trim() || '';
    jerseyNumber = stripJerseyPrefix(jerseyNumber);

    // Extract away jersey if we detected the H/A format
    let awayJerseyNumber = '';
    if (awayJerseyCol >= 0) {
      awayJerseyNumber = stripJerseyPrefix((row[awayJerseyCol] || '').trim());
    }

    // Get position — skip if it's "None" (USA Hockey exports this when position isn't set)
    let posRaw = colMap.position !== undefined ? row[colMap.position] || '' : '';
    if (posRaw.trim().toLowerCase() === 'none') posRaw = '';

    players.push({
      firstName,
      lastName,
      jerseyNumber,
      awayJerseyNumber: awayJerseyNumber || undefined,
      position: normalizePosition(posRaw),
      shoots: normalizeShoots(colMap.shoots !== undefined ? row[colMap.shoots] || '' : ''),
    });
  }

  return players;
}

export default function RosterImport({ teamId, onPlayersAdded, compact }: RosterImportProps) {
  // Default was 'url', but USA Hockey added a CAPTCHA to roster pages (Aug 2026)
  // so link import no longer works for them — lead with file upload instead.
  const [activeTab, setActiveTab] = useState<'upload' | 'paste' | 'url' | 'manual'>('upload');
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Paste state
  const [pastedText, setPastedText] = useState('');

  // URL state
  const [importUrl, setImportUrl] = useState('');

  // Manual entry
  const [newPlayer, setNewPlayer] = useState<Player>({
    firstName: '', lastName: '', jerseyNumber: '', position: '', shoots: ''
  });

  // Preview
  const [previewPlayers, setPreviewPlayers] = useState<Player[]>([]);
  const [showPreview, setShowPreview] = useState(false);

  const downloadTemplate = () => {
    const csvContent = [
      TEMPLATE_HEADERS.join(','),
      ...EXAMPLE_ROWS.map(r => r.join(',')),
      // Add empty rows for them to fill in
      ...Array(15).fill(',,,,,' ),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'roster-template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const processFile = useCallback((file: File) => {
    setMessage(null);
    const ext = file.name.split('.').pop()?.toLowerCase();

    if (ext === 'csv' || ext === 'tsv' || ext === 'txt') {
      Papa.parse(file, {
        complete: (results: any) => {
          const rows = (results.data as string[][]).filter((r: string[]) => r.some((c: string) => c?.trim()));
          const players = parseRows(rows);
          if (players.length > 0) {
            setPreviewPlayers(players);
            setShowPreview(true);
          } else {
            setMessage({ type: 'error', text: 'No player data found in file. Make sure it has player names.' });
          }
        },
        error: () => {
          setMessage({ type: 'error', text: 'Failed to parse CSV file.' });
        },
      });
    } else if (ext === 'xlsx' || ext === 'xls') {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          const sheet = workbook.Sheets[workbook.SheetNames[0]];
          const rows: string[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });
          const filtered = rows.filter(r => r.some(c => c != null && String(c).trim()));
          const strRows = filtered.map(r => r.map(c => String(c ?? '')));
          const players = parseRows(strRows);
          if (players.length > 0) {
            setPreviewPlayers(players);
            setShowPreview(true);
          } else {
            setMessage({ type: 'error', text: 'No player data found in Excel file.' });
          }
        } catch {
          setMessage({ type: 'error', text: 'Failed to read Excel file.' });
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      setMessage({ type: 'error', text: 'Unsupported file type. Use .csv, .tsv, .xlsx, or .xls' });
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, [processFile]);

  const handlePaste = () => {
    if (!pastedText.trim()) return;
    // Parse pasted text as CSV/TSV
    const results = Papa.parse(pastedText.trim());
    const rows = (results.data as string[][]).filter(r => r.some(c => c?.trim()));
    const players = parseRows(rows);
    if (players.length > 0) {
      setPreviewPlayers(players);
      setShowPreview(true);
    } else {
      setMessage({ type: 'error', text: 'Could not parse player data. Try tab-separated or comma-separated format.' });
    }
  };

  const handleUrlImport = async () => {
    if (!importUrl.trim()) return;
    setImporting(true);
    setMessage(null);
    try {
      const res = await fetch(`${API}/api/teams/${teamId}/import-roster`, {
        method: 'POST', headers: getAuthHeaders(),
        body: JSON.stringify({ url: importUrl.trim() }),
      });
      const data = await res.json() as any;
      if (data.success && data.data?.players?.length > 0) {
        const added = data.data.players.map((p: any) => ({
          id: p.id, firstName: p.firstName, lastName: p.lastName,
          jerseyNumber: p.jerseyNumber || '', position: p.position || '',
          shoots: p.shoots || '',
        }));
        onPlayersAdded(added);
        setMessage({ type: 'success', text: `Imported ${data.data.added} players!` });
        setImportUrl('');
      } else {
        setMessage({ type: 'error', text: data.error || 'No players found at that URL. Try pasting your roster or uploading a file instead.' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Failed to import. Try pasting or uploading instead.' });
    }
    setImporting(false);
  };

  const handleManualAdd = async () => {
    if (!newPlayer.firstName.trim() || !newPlayer.lastName.trim()) return;
    setImporting(true);
    try {
      const res = await fetch(`${API}/api/teams/${teamId}/players`, {
        method: 'POST', headers: getAuthHeaders(),
        body: JSON.stringify(newPlayer),
      });
      const data = await res.json() as any;
      if (data.success) {
        onPlayersAdded([{ id: data.data.id, ...newPlayer }]);
        setNewPlayer({ firstName: '', lastName: '', jerseyNumber: '', position: '', shoots: '' });
        setMessage({ type: 'success', text: `Added ${newPlayer.firstName} ${newPlayer.lastName}` });
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to add player' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Network error' });
    }
    setImporting(false);
  };

  const confirmPreview = async () => {
    if (previewPlayers.length === 0) return;
    setImporting(true);
    setMessage(null);
    try {
      const res = await fetch(`${API}/api/teams/${teamId}/players/bulk`, {
        method: 'POST', headers: getAuthHeaders(),
        body: JSON.stringify({ players: previewPlayers }),
      });
      const data = await res.json() as any;
      if (data.success) {
        const added = data.data.players.map((p: any) => ({
          id: p.id, firstName: p.firstName, lastName: p.lastName,
          jerseyNumber: p.jerseyNumber || '', position: p.position || '',
          shoots: p.shoots || '',
        }));
        onPlayersAdded(added);
        setMessage({ type: 'success', text: `Added ${data.data.added} players to roster!` });
        setPreviewPlayers([]);
        setShowPreview(false);
        setPastedText('');
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to import players' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Network error' });
    }
    setImporting(false);
  };

  // Preview overlay
  if (showPreview && previewPlayers.length > 0) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-[#1d1d1f]">Review Players ({previewPlayers.length})</h3>
          <button onClick={() => { setShowPreview(false); setPreviewPlayers([]); }}
            className="text-sm text-[#6e6e73] hover:text-[#1d1d1f]">Cancel</button>
        </div>
        <p className="text-sm text-[#6e6e73]">Review the parsed roster below. Edit any fields, then click Import All to add them.</p>

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden max-h-80 overflow-y-auto">
          {(() => { const hasAway = previewPlayers.some(p => p.awayJerseyNumber); return (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-gray-50">
              <tr className="text-left">
                <th className="px-3 py-2 font-medium text-[#6e6e73] w-12">{hasAway ? 'H #' : '#'}</th>
                {hasAway && <th className="px-3 py-2 font-medium text-[#6e6e73] w-12">A #</th>}
                <th className="px-3 py-2 font-medium text-[#6e6e73]">First Name</th>
                <th className="px-3 py-2 font-medium text-[#6e6e73]">Last Name</th>
                <th className="px-3 py-2 font-medium text-[#6e6e73]">Position</th>
                <th className="px-3 py-2 font-medium text-[#6e6e73]">Shoots</th>
                <th className="px-3 py-2 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {previewPlayers.map((p, i) => (
                <tr key={i} className="border-t border-gray-100">
                  <td className="px-3 py-1.5">
                    <input type="text" value={p.jerseyNumber} onChange={e => {
                      const updated = [...previewPlayers];
                      updated[i] = { ...updated[i], jerseyNumber: e.target.value };
                      setPreviewPlayers(updated);
                    }} className="w-10 px-1 py-0.5 rounded border border-gray-200 text-sm text-center" />
                  </td>
                  {hasAway && <td className="px-3 py-1.5">
                    <input type="text" value={p.awayJerseyNumber || ''} onChange={e => {
                      const updated = [...previewPlayers];
                      updated[i] = { ...updated[i], awayJerseyNumber: e.target.value };
                      setPreviewPlayers(updated);
                    }} className="w-10 px-1 py-0.5 rounded border border-gray-200 text-sm text-center" />
                  </td>}
                  <td className="px-3 py-1.5">
                    <input type="text" value={p.firstName} onChange={e => {
                      const updated = [...previewPlayers];
                      updated[i] = { ...updated[i], firstName: e.target.value };
                      setPreviewPlayers(updated);
                    }} className="w-full px-1 py-0.5 rounded border border-gray-200 text-sm" />
                  </td>
                  <td className="px-3 py-1.5">
                    <input type="text" value={p.lastName} onChange={e => {
                      const updated = [...previewPlayers];
                      updated[i] = { ...updated[i], lastName: e.target.value };
                      setPreviewPlayers(updated);
                    }} className="w-full px-1 py-0.5 rounded border border-gray-200 text-sm" />
                  </td>
                  <td className="px-3 py-1.5">
                    <select value={p.position} onChange={e => {
                      const updated = [...previewPlayers];
                      updated[i] = { ...updated[i], position: e.target.value };
                      setPreviewPlayers(updated);
                    }} className="px-1 py-0.5 rounded border border-gray-200 text-sm bg-white">
                      <option value="">--</option>
                      <option value="forward">Forward</option>
                      <option value="defense">Defense</option>
                      <option value="goalie">Goalie</option>
                    </select>
                  </td>
                  <td className="px-3 py-1.5">
                    <select value={p.shoots} onChange={e => {
                      const updated = [...previewPlayers];
                      updated[i] = { ...updated[i], shoots: e.target.value };
                      setPreviewPlayers(updated);
                    }} className="px-1 py-0.5 rounded border border-gray-200 text-sm bg-white">
                      <option value="">--</option>
                      <option value="left">Left</option>
                      <option value="right">Right</option>
                    </select>
                  </td>
                  <td className="px-3 py-1.5">
                    <button onClick={() => setPreviewPlayers(prev => prev.filter((_, j) => j !== i))}
                      className="text-red-400 hover:text-red-600">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          ); })()}
        </div>

        <div className="flex items-center justify-between">
          <p className="text-xs text-[#86868b]">You can edit any field before importing. Duplicates will be skipped.</p>
          <button onClick={confirmPreview} disabled={importing || previewPlayers.length === 0}
            className="px-6 py-2.5 rounded-xl bg-[#003e79] text-white text-sm font-semibold hover:bg-[#002d5a] disabled:bg-gray-300 transition">
            {importing ? 'Importing...' : `Import ${previewPlayers.length} Players`}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {message && (
        <div className={`p-3 rounded-xl text-sm ${message.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-amber-50 text-amber-800 border border-amber-200'}`}>
          {message.text}
        </div>
      )}

      {/* Import Method Selector */}
      <div className="grid grid-cols-4 gap-2">
        {([
          { key: 'url', label: 'Import URL', desc: 'Import from URL', icon: 'M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1' },
          { key: 'upload', label: 'Upload File', desc: 'CSV or Excel', icon: 'M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12' },
          { key: 'paste', label: 'Paste', desc: 'From spreadsheet', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' },
          { key: 'manual', label: 'Manual', desc: 'One at a time', icon: 'M12 6v6m0 0v6m0-6h6m-6 0H6' },
        ] as const).map(tab => (
          <button key={tab.key} onClick={() => { setActiveTab(tab.key); setMessage(null); }}
            className={`flex flex-col items-center gap-1 px-3 py-3 rounded-xl border-2 text-center transition ${
              activeTab === tab.key
                ? 'border-[#003e79] bg-[#f0f7ff] text-[#003e79]'
                : 'border-gray-200 bg-white text-[#6e6e73] hover:border-gray-300 hover:bg-gray-50'
            }`}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={tab.icon} /></svg>
            <span className="text-xs font-semibold">{tab.label}</span>
            <span className={`text-[10px] leading-tight ${activeTab === tab.key ? 'text-[#003e79]/70' : 'text-[#86868b]'}`}>{tab.desc}</span>
          </button>
        ))}
      </div>

      {/* Upload Tab */}
      {activeTab === 'upload' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-[#6e6e73]">Upload a CSV or Excel file with your roster</p>
            <button onClick={downloadTemplate}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#003e79] text-[#003e79] text-xs font-semibold hover:bg-[#f0f7ff] transition">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
              Download Template
            </button>
          </div>

          {/* Drop zone */}
          <div
            onDragOver={e => { e.preventDefault(); setDragActive(true); }}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition ${
              dragActive ? 'border-[#003e79] bg-[#f0f7ff]' : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50'
            }`}
          >
            <input ref={fileInputRef} type="file" accept=".csv,.tsv,.xlsx,.xls,.txt" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) processFile(f); e.target.value = ''; }} />
            <svg className="w-10 h-10 mx-auto text-gray-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <p className="text-sm font-medium text-[#1d1d1f]">
              {dragActive ? 'Drop your file here' : 'Drag & drop a file, or click to browse'}
            </p>
            <p className="text-xs text-[#86868b] mt-1">Supports .csv, .xlsx, .xls, .tsv</p>
          </div>

          {/* Example format */}
          <div className="bg-gray-50 rounded-xl p-3">
            <p className="text-xs font-semibold text-[#6e6e73] mb-2">Expected format:</p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs font-mono">
                <thead>
                  <tr className="text-left text-[#86868b]">
                    {TEMPLATE_HEADERS.map(h => <th key={h} className="pr-3 pb-1">{h}</th>)}
                  </tr>
                </thead>
                <tbody className="text-[#1d1d1f]">
                  {EXAMPLE_ROWS.map((row, i) => (
                    <tr key={i}>
                      {row.map((cell, j) => <td key={j} className="pr-3 py-0.5">{cell}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Paste Tab */}
      {activeTab === 'paste' && (
        <div className="space-y-3">
          <p className="text-sm text-[#6e6e73]">Copy rows from Excel or Google Sheets and paste below</p>
          <textarea
            value={pastedText}
            onChange={e => setPastedText(e.target.value)}
            rows={compact ? 6 : 8}
            placeholder={"Jersey #\tFirst Name\tLast Name\tPosition\tShoots\n12\tJohn\tSmith\tForward\tLeft\n7\tJane\tDoe\tDefense\tRight\n30\tBob\tWilson\tGoalie\tLeft"}
            className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-[#003e79] focus:ring-2 focus:ring-[#003e79]/10 outline-none text-sm font-mono bg-white"
          />
          <div className="flex items-center justify-between">
            <p className="text-xs text-[#86868b]">Tab-separated, comma-separated, or &quot;Last, First&quot; format</p>
            <button onClick={handlePaste} disabled={!pastedText.trim()}
              className="px-5 py-2 rounded-xl bg-[#003e79] text-white text-sm font-semibold hover:bg-[#002d5a] disabled:bg-gray-300 transition">
              Parse & Preview
            </button>
          </div>
        </div>
      )}

      {/* URL Import Tab */}
      {activeTab === 'url' && (
        <div className="space-y-3">
          <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-800">
            <strong>USA Hockey links no longer work here.</strong> USA Hockey added a verification step to roster pages, so automatic import from portal.usahockey.com links fails. Open your roster link, complete the verification, then copy the roster table and use the <strong>Paste</strong> tab — or download the CSV and use <strong>Upload File</strong>.
          </div>
          <p className="text-sm text-[#6e6e73]">Paste a roster URL to import players automatically</p>
          <div className="flex gap-2">
            <input type="url" value={importUrl} onChange={e => setImportUrl(e.target.value)}
              placeholder="https://..."
              className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 focus:border-[#003e79] focus:ring-2 focus:ring-[#003e79]/10 outline-none text-sm" />
            <button onClick={handleUrlImport} disabled={!importUrl.trim() || importing}
              className="px-5 py-2.5 rounded-xl bg-[#003e79] text-white text-sm font-semibold hover:bg-[#002d5a] disabled:bg-gray-300 transition">
              {importing ? 'Importing...' : 'Import'}
            </button>
          </div>
        </div>
      )}

      {/* Manual Tab */}
      {activeTab === 'manual' && (
        <div className="space-y-3">
          <p className="text-sm text-[#6e6e73]">Add players one at a time</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[#6e6e73] mb-1">First Name *</label>
              <input type="text" value={newPlayer.firstName} onChange={e => setNewPlayer(p => ({ ...p, firstName: e.target.value }))}
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 focus:border-[#003e79] outline-none text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#6e6e73] mb-1">Last Name *</label>
              <input type="text" value={newPlayer.lastName} onChange={e => setNewPlayer(p => ({ ...p, lastName: e.target.value }))}
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 focus:border-[#003e79] outline-none text-sm" />
            </div>
          </div>
          <div className="grid grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium text-[#6e6e73] mb-1">Jersey #</label>
              <input type="text" value={newPlayer.jerseyNumber} onChange={e => setNewPlayer(p => ({ ...p, jerseyNumber: e.target.value }))}
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 outline-none text-sm text-center" />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#6e6e73] mb-1">Position</label>
              <select value={newPlayer.position} onChange={e => setNewPlayer(p => ({ ...p, position: e.target.value }))}
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 outline-none text-sm bg-white">
                <option value="">--</option>
                <option value="forward">Forward</option>
                <option value="defense">Defense</option>
                <option value="goalie">Goalie</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[#6e6e73] mb-1">Shoots</label>
              <select value={newPlayer.shoots} onChange={e => setNewPlayer(p => ({ ...p, shoots: e.target.value }))}
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 outline-none text-sm bg-white">
                <option value="">--</option>
                <option value="left">Left</option>
                <option value="right">Right</option>
              </select>
            </div>
          </div>
          <div className="flex justify-end">
            <button onClick={handleManualAdd} disabled={!newPlayer.firstName.trim() || !newPlayer.lastName.trim() || importing}
              className="px-5 py-2.5 rounded-xl bg-[#003e79] text-white text-sm font-semibold hover:bg-[#002d5a] disabled:bg-gray-300 transition">
              {importing ? 'Adding...' : 'Add Player'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
