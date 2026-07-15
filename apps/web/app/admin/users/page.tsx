'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

const API_BASE = 'https://uht.chad-157.workers.dev/api/users';

const ROLES = ['admin', 'director', 'organization', 'coach', 'manager', 'parent', 'scorekeeper', 'referee'];

function formatPhone(phone: string | null | undefined): string {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`;
  if (digits.length === 11 && digits[0] === '1') return `(${digits.slice(1,4)}) ${digits.slice(4,7)}-${digits.slice(7)}`;
  return phone; // return as-is if not 10/11 digits
}

const ROLE_COLORS: Record<string, string> = {
  admin: 'bg-red-50 text-red-700',
  director: 'bg-purple-50 text-purple-700',
  organization: 'bg-indigo-50 text-indigo-700',
  coach: 'bg-blue-50 text-blue-700',
  manager: 'bg-cyan-50 text-cyan-700',
  parent: 'bg-green-50 text-green-700',
  scorekeeper: 'bg-amber-50 text-amber-700',
  referee: 'bg-orange-50 text-orange-700',
};

const SOURCE_LABELS: Record<string, { label: string; color: string }> = {
  signup: { label: 'Self Signup', color: 'bg-blue-50 text-blue-600' },
  roster_claim: { label: 'Roster Claim', color: 'bg-green-50 text-green-600' },
  invite: { label: 'Invited', color: 'bg-purple-50 text-purple-600' },
  admin: { label: 'Admin Created', color: 'bg-gray-100 text-gray-600' },
};

interface TeamAssoc {
  teamName: string;
  teamId: string;
  role: string;
}

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  roles: string[];
  isActive: boolean;
  createdAt: string;
  teams: TeamAssoc[];
  claimedPlayers: number;
  registrations: number;
  source: string;
}

interface PaginationInfo {
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}

// ==================
// Create User Modal
// ==================
function CreateUserModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    firstName: '', lastName: '', email: '', phone: '', password: '', roles: [] as string[],
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const toggleRole = (role: string) => {
    setForm(prev => ({
      ...prev,
      roles: prev.roles.includes(role) ? prev.roles.filter(r => r !== role) : [...prev.roles, role]
    }));
  };

  const handleSave = async () => {
    if (!form.email.trim()) { setError('Email is required'); return; }
    if (!form.firstName.trim()) { setError('First name is required'); return; }
    if (!form.lastName.trim()) { setError('Last name is required'); return; }
    if (!form.password.trim()) { setError('Password is required'); return; }
    if (form.roles.length === 0) { setError('At least one role is required'); return; }

    setSaving(true);
    setError('');
    try {
      const h: Record<string, string> = { 'Content-Type': 'application/json', 'X-Dev-Bypass': 'true' };
      const tk = localStorage.getItem('uht_token');
      if (tk) h['Authorization'] = `Bearer ${tk}`;
      const res = await fetch(API_BASE, {
        method: 'POST',
        headers: h,
        body: JSON.stringify({
          email: form.email.trim(),
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          phone: form.phone.trim() || undefined,
          password: form.password,
          roles: form.roles,
        }),
      });
      const json = await res.json();
      if (json.success) { onSaved(); onClose(); }
      else setError(typeof json.error === 'string' ? json.error : 'Failed to create user');
    } catch { setError('Network error'); }
    finally { setSaving(false); }
  };

  const fc = "w-full px-3 py-2.5 border border-[#e0e0e5] rounded-xl text-sm focus:ring-2 focus:ring-[#003e79]/20 focus:border-[#003e79]/40 outline-none transition";
  const lc = "block text-xs font-semibold text-[#6e6e73] mb-1.5";

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="border-b border-[#e8e8ed] px-6 py-4 flex items-center justify-between sticky top-0 bg-white rounded-t-2xl">
          <h2 className="text-lg font-bold text-[#1d1d1f]">Create User</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-[#f5f5f7] text-[#86868b]">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">
          {error && <div className="bg-red-50 text-red-700 text-sm px-4 py-3 rounded-xl border border-red-200">{error}</div>}
          <div className="grid grid-cols-2 gap-3">
            <div><label className={lc}>First Name *</label><input className={fc} value={form.firstName} onChange={e => setForm({...form, firstName: e.target.value})} placeholder="John" /></div>
            <div><label className={lc}>Last Name *</label><input className={fc} value={form.lastName} onChange={e => setForm({...form, lastName: e.target.value})} placeholder="Doe" /></div>
          </div>
          <div><label className={lc}>Email *</label><input className={fc} type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} placeholder="john@example.com" /></div>
          <div><label className={lc}>Phone</label><input className={fc} type="tel" value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} placeholder="(555) 555-5555" /></div>
          <div><label className={lc}>Password *</label><input className={fc} type="password" value={form.password} onChange={e => setForm({...form, password: e.target.value})} placeholder="Min 8 characters" /></div>
          <div>
            <label className={lc}>Roles *</label>
            <div className="flex flex-wrap gap-2 mt-1">
              {ROLES.map(role => (
                <button key={role} type="button" onClick={() => toggleRole(role)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${
                    form.roles.includes(role) ? ROLE_COLORS[role] + ' border-current' : 'bg-white text-[#86868b] border-[#e0e0e5] hover:border-[#c0c0c5]'
                  }`}
                >{role}</button>
              ))}
            </div>
          </div>
        </div>
        <div className="border-t border-[#e8e8ed] px-6 py-4 flex items-center justify-end gap-3 sticky bottom-0 bg-white rounded-b-2xl">
          <button onClick={onClose} className="px-5 py-2.5 bg-[#f5f5f7] hover:bg-[#e8e8ed] text-[#3d3d3d] font-semibold rounded-full text-sm transition">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="px-5 py-2.5 bg-[#003e79] hover:bg-[#002d5a] text-white font-semibold rounded-full text-sm transition disabled:opacity-50">
            {saving ? 'Creating...' : 'Create User'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ==================
// Edit User Modal
// ==================
function EditUserModal({ user, onClose, onSaved }: { user: User; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    firstName: user.firstName, lastName: user.lastName, email: user.email,
    phone: user.phone || '', roles: Array.isArray(user.roles) ? [...user.roles] : [],
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const toggleRole = (role: string) => {
    setForm(prev => ({
      ...prev,
      roles: prev.roles.includes(role) ? prev.roles.filter(r => r !== role) : [...prev.roles, role]
    }));
  };

  const handleSave = async () => {
    if (!form.email.trim() || !form.firstName.trim() || !form.lastName.trim()) { setError('Name and email required'); return; }
    if (form.roles.length === 0) { setError('At least one role required'); return; }

    setSaving(true);
    setError('');
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json', 'X-Dev-Bypass': 'true' };
      const tk2 = localStorage.getItem('uht_token');
      if (tk2) headers['Authorization'] = `Bearer ${tk2}`;

      const res1 = await fetch(`${API_BASE}/${user.id}`, {
        method: 'PUT', headers,
        body: JSON.stringify({ firstName: form.firstName.trim(), lastName: form.lastName.trim(), email: form.email.trim(), phone: form.phone.trim() || null }),
      });
      const json1 = await res1.json();
      if (!json1.success) { setError(typeof json1.error === 'string' ? json1.error : 'Failed to update'); setSaving(false); return; }

      const res2 = await fetch(`${API_BASE}/${user.id}/roles`, {
        method: 'PUT', headers,
        body: JSON.stringify({ roles: form.roles }),
      });
      const json2 = await res2.json();
      if (json2.success) { onSaved(); onClose(); }
      else setError(typeof json2.error === 'string' ? json2.error : 'Failed to update roles');
    } catch { setError('Network error'); }
    finally { setSaving(false); }
  };

  const fc = "w-full px-3 py-2.5 border border-[#e0e0e5] rounded-xl text-sm focus:ring-2 focus:ring-[#003e79]/20 focus:border-[#003e79]/40 outline-none transition";
  const lc = "block text-xs font-semibold text-[#6e6e73] mb-1.5";

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="border-b border-[#e8e8ed] px-6 py-4 flex items-center justify-between sticky top-0 bg-white rounded-t-2xl">
          <h2 className="text-lg font-bold text-[#1d1d1f]">Edit User</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-[#f5f5f7] text-[#86868b]">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">
          {error && <div className="bg-red-50 text-red-700 text-sm px-4 py-3 rounded-xl border border-red-200">{error}</div>}
          <div className="grid grid-cols-2 gap-3">
            <div><label className={lc}>First Name *</label><input className={fc} value={form.firstName} onChange={e => setForm({...form, firstName: e.target.value})} /></div>
            <div><label className={lc}>Last Name *</label><input className={fc} value={form.lastName} onChange={e => setForm({...form, lastName: e.target.value})} /></div>
          </div>
          <div><label className={lc}>Email *</label><input className={fc} type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} /></div>
          <div><label className={lc}>Phone</label><input className={fc} type="tel" value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} /></div>
          <div>
            <label className={lc}>Roles *</label>
            <div className="flex flex-wrap gap-2 mt-1">
              {ROLES.map(role => (
                <button key={role} type="button" onClick={() => toggleRole(role)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${
                    form.roles.includes(role) ? ROLE_COLORS[role] + ' border-current' : 'bg-white text-[#86868b] border-[#e0e0e5] hover:border-[#c0c0c5]'
                  }`}
                >{role}</button>
              ))}
            </div>
          </div>
        </div>
        <div className="border-t border-[#e8e8ed] px-6 py-4 flex items-center justify-end gap-3 sticky bottom-0 bg-white rounded-b-2xl">
          <button onClick={onClose} className="px-5 py-2.5 bg-[#f5f5f7] hover:bg-[#e8e8ed] text-[#3d3d3d] font-semibold rounded-full text-sm transition">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="px-5 py-2.5 bg-[#003e79] hover:bg-[#002d5a] text-white font-semibold rounded-full text-sm transition disabled:opacity-50">
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ==================
// Delete Confirmation Modal
// ==================
function DeleteModal({ user, onClose, onConfirm }: { user: User; onClose: () => void; onConfirm: () => void }) {
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  const isConfirmed = confirmText.toUpperCase() === 'DELETE';

  const handleDelete = async () => {
    if (!isConfirmed) return;
    setDeleting(true);
    setError('');
    try {
      const token = localStorage.getItem('uht_token');
      const res = await fetch(`${API_BASE}/${user.id}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}`, 'X-Dev-Bypass': 'true' } : { 'X-Dev-Bypass': 'true' },
      });
      const json = await res.json();
      if (json.success) {
        onConfirm();
      } else {
        setError(json.error || 'Failed to delete user');
      }
    } catch (err: any) {
      setError(err.message || 'Network error — please try again');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-5">
          <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
          </div>
          <h3 className="text-lg font-bold text-[#1d1d1f] text-center">Delete User</h3>
          <p className="text-sm text-[#6e6e73] text-center mt-2">
            This will permanently delete <strong>{user.firstName} {user.lastName}</strong> ({user.email}) and remove all their role associations. This cannot be undone.
          </p>
          <div className="mt-4">
            <label className="block text-xs font-semibold text-[#6e6e73] mb-1.5">Type &quot;delete&quot; to confirm</label>
            <input
              className="w-full px-3 py-2.5 border border-[#e0e0e5] rounded-xl text-sm focus:ring-2 focus:ring-red-200 outline-none"
              value={confirmText}
              onChange={e => setConfirmText(e.target.value)}
              placeholder="delete"
              autoFocus
            />
          </div>
          {error && (
            <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
          )}
        </div>
        <div className="border-t border-[#e8e8ed] px-6 py-4 flex items-center justify-end gap-3">
          <button onClick={onClose} className="px-5 py-2.5 bg-[#f5f5f7] hover:bg-[#e8e8ed] text-[#3d3d3d] font-semibold rounded-full text-sm transition">Cancel</button>
          <button onClick={handleDelete} disabled={!isConfirmed || deleting}
            className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-full text-sm transition disabled:opacity-40">
            {deleting ? 'Deleting...' : 'Delete User'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ==================
// Main Users Page
// ==================
export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [creatingUser, setCreatingUser] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [deletingUser, setDeletingUser] = useState<User | null>(null);
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [showAllUsers, setShowAllUsers] = useState(false);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<PaginationInfo>({ total: 0, page: 1, perPage: 50, totalPages: 1 });
  const [roleCounts, setRoleCounts] = useState<Record<string, number>>({});
  const searchTimer = useRef<ReturnType<typeof setTimeout>>();

  const getHeaders = (): Record<string, string> => {
    const h: Record<string, string> = { 'X-Dev-Bypass': 'true' };
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('uht_token');
      if (token) h['Authorization'] = `Bearer ${token}`;
    }
    return h;
  };

  const loadUsers = useCallback((searchTerm = '', role = 'all', status = 'all', pg = 1, allUsers = false) => {
    setLoading(true);
    const params = new URLSearchParams();
    if (searchTerm) params.append('q', searchTerm);
    if (role !== 'all') params.append('role', role);
    if (status !== 'all') params.append('status', status);
    if (allUsers) params.append('app_users', 'false');
    params.append('page', pg.toString());
    params.append('per_page', '50');

    fetch(`${API_BASE}?${params.toString()}`, {
      headers: getHeaders(),
    })
      .then(r => r.json())
      .then(json => {
        if (json.success) {
          setUsers(json.data || []);
          setPagination(json.pagination || { total: 0, page: pg, perPage: 50, totalPages: 1 });
          if (json.roleCounts) setRoleCounts(json.roleCounts);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => { loadUsers('', 'all', 'all', 1, showAllUsers); }, [loadUsers, showAllUsers]);

  const handleSearch = (term: string) => {
    setSearch(term);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setPage(1);
      loadUsers(term, roleFilter, statusFilter, 1, showAllUsers);
    }, 300);
  };

  const handleRoleFilter = (role: string) => {
    setRoleFilter(role);
    setPage(1);
    loadUsers(search, role, statusFilter, 1, showAllUsers);
  };

  const handleStatusFilter = (status: string) => {
    setStatusFilter(status);
    setPage(1);
    loadUsers(search, roleFilter, status, 1, showAllUsers);
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    loadUsers(search, roleFilter, statusFilter, newPage, showAllUsers);
  };

  const toggleUserStatus = async (user: User) => {
    try {
      await fetch(`${API_BASE}/${user.id}/status`, {
        method: 'PUT',
        headers: { ...getHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: user.isActive ? 0 : 1 }),
      });
      loadUsers(search, roleFilter, statusFilter, page, showAllUsers);
    } catch {}
  };

  const handleExport = () => {
    const url = `${API_BASE}/export/csv`;
    fetch(url, { headers: getHeaders() })
      .then(r => r.blob())
      .then(blob => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `uht-users-${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
      });
  };

  const handleUserSaved = () => loadUsers(search, roleFilter, statusFilter, page, showAllUsers);
  const handleUserDeleted = () => { setDeletingUser(null); loadUsers(search, roleFilter, statusFilter, page, showAllUsers); };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const formatDateLong = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  };

  // Client-side source filter
  const filteredUsers = sourceFilter === 'all' ? users : users.filter(u => u.source === sourceFilter);

  const totalUsers = pagination.total;

  return (
    <div className="bg-[#fafafa] min-h-full">
      {creatingUser && <CreateUserModal onClose={() => setCreatingUser(false)} onSaved={handleUserSaved} />}
      {editingUser && <EditUserModal user={editingUser} onClose={() => setEditingUser(null)} onSaved={handleUserSaved} />}
      {deletingUser && <DeleteModal user={deletingUser} onClose={() => setDeletingUser(null)} onConfirm={handleUserDeleted} />}

      {/* Header */}
      <div className="max-w-7xl mx-auto px-6 pt-6 pb-2">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-extrabold text-[#1d1d1f]">User Management</h1>
            <p className="text-sm text-[#86868b] mt-0.5">{totalUsers.toLocaleString()} {showAllUsers ? 'total' : 'app'} users</p>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => { setShowAllUsers(v => !v); setPage(1); }}
              className={`px-4 py-2.5 border font-medium rounded-full text-sm transition flex items-center gap-2 ${
                showAllUsers ? 'bg-amber-50 border-amber-300 text-amber-700' : 'bg-white border-[#e0e0e5] hover:bg-[#f5f5f7] text-[#3d3d3d]'
              }`}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" /></svg>
              {showAllUsers ? 'Showing All' : 'App Users Only'}
            </button>
            <button onClick={handleExport}
              className="px-4 py-2.5 bg-white border border-[#e0e0e5] hover:bg-[#f5f5f7] text-[#3d3d3d] font-medium rounded-full text-sm transition flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
              Export CSV
            </button>
            <button onClick={() => setCreatingUser(true)}
              className="px-5 py-2.5 bg-[#003e79] hover:bg-[#002d5a] text-white font-semibold rounded-full text-sm transition flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
              Add User
            </button>
          </div>
        </div>
      </div>

      {/* Role Summary Pills */}
      <div className="max-w-7xl mx-auto px-6 mt-4">
        <div className="flex flex-wrap gap-2">
          <button onClick={() => handleRoleFilter('all')}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border transition ${
              roleFilter === 'all' ? 'bg-[#003e79] text-white border-[#003e79]' : 'bg-white text-[#6e6e73] border-[#e0e0e5] hover:border-[#c0c0c5]'
            }`}>
            All ({totalUsers})
          </button>
          {ROLES.map(role => {
            const count = roleCounts[role] || 0;
            if (count === 0 && roleFilter !== role) return null;
            return (
              <button key={role} onClick={() => handleRoleFilter(role)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border transition capitalize ${
                  roleFilter === role ? ROLE_COLORS[role] + ' border-current' : 'bg-white text-[#6e6e73] border-[#e0e0e5] hover:border-[#c0c0c5]'
                }`}>
                {role} ({count})
              </button>
            );
          })}
        </div>
      </div>

      {/* Search + Filters */}
      <div className="max-w-7xl mx-auto px-6 mt-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex-1 min-w-[200px] max-w-sm relative">
            <svg className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#86868b]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>
            <input
              type="text"
              placeholder="Search name, email, or phone..."
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-[#e0e0e5] rounded-xl text-sm focus:ring-2 focus:ring-[#003e79]/20 outline-none"
            />
          </div>

          <select value={statusFilter} onChange={(e) => handleStatusFilter(e.target.value)}
            className="px-3 py-2.5 border border-[#e0e0e5] rounded-xl text-sm bg-white focus:ring-2 focus:ring-[#003e79]/20 outline-none">
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>

          <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)}
            className="px-3 py-2.5 border border-[#e0e0e5] rounded-xl text-sm bg-white focus:ring-2 focus:ring-[#003e79]/20 outline-none">
            <option value="all">All Sources</option>
            <option value="signup">Self Signup</option>
            <option value="roster_claim">Roster Claim</option>
            <option value="invite">Invited</option>
          </select>
        </div>
      </div>

      {/* Users List */}
      <div className="max-w-7xl mx-auto px-6 py-5">
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#003e79]" />
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm p-16 text-center border border-[#e8e8ed]">
            <svg className="w-14 h-14 mx-auto text-[#c8c8cd] mb-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" /></svg>
            <p className="text-[#86868b] font-medium text-lg">No users found</p>
            <p className="text-[#aeaeb2] text-sm mt-1">Try adjusting your search or filters</p>
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden md:block bg-white rounded-2xl border border-[#e8e8ed] shadow-[0_1px_20px_-6px_rgba(0,0,0,0.06)] overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[#e8e8ed] bg-[#f8f8fa]">
                    <th className="text-left px-5 py-3 text-[11px] font-bold text-[#86868b] uppercase tracking-wider">User</th>
                    <th className="text-left px-5 py-3 text-[11px] font-bold text-[#86868b] uppercase tracking-wider">Contact</th>
                    <th className="text-left px-5 py-3 text-[11px] font-bold text-[#86868b] uppercase tracking-wider">Roles</th>
                    <th className="text-center px-5 py-3 text-[11px] font-bold text-[#86868b] uppercase tracking-wider">Source</th>
                    <th className="text-center px-5 py-3 text-[11px] font-bold text-[#86868b] uppercase tracking-wider">Teams</th>
                    <th className="text-center px-5 py-3 text-[11px] font-bold text-[#86868b] uppercase tracking-wider">Status</th>
                    <th className="text-right px-5 py-3 text-[11px] font-bold text-[#86868b] uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f0f0f2]">
                  {filteredUsers.map(user => {
                    const isExpanded = expandedUser === user.id;
                    const sourceInfo = SOURCE_LABELS[user.source] || SOURCE_LABELS.signup;
                    return (
                      <UserRow key={user.id} user={user} isExpanded={isExpanded} sourceInfo={sourceInfo}
                        onToggleExpand={() => setExpandedUser(isExpanded ? null : user.id)}
                        onEdit={() => setEditingUser(user)}
                        onToggleStatus={() => toggleUserStatus(user)}
                        onDelete={() => setDeletingUser(user)}
                        formatDate={formatDate} formatDateLong={formatDateLong}
                      />
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Card View */}
            <div className="md:hidden space-y-3">
              {filteredUsers.map(user => {
                const sourceInfo = SOURCE_LABELS[user.source] || SOURCE_LABELS.signup;
                return (
                  <div key={user.id} className="bg-white rounded-2xl border border-[#e8e8ed] shadow-sm p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-gradient-to-br from-[#003e79] to-[#0066cc] rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                          {(user.firstName?.[0] || '').toUpperCase()}{(user.lastName?.[0] || '').toUpperCase()}
                        </div>
                        <div>
                          <h3 className="font-semibold text-[#1d1d1f]">{user.firstName} {user.lastName}</h3>
                          <p className="text-sm text-[#6e6e73]">{user.email}</p>
                          {user.phone && <p className="text-xs text-[#86868b]">{formatPhone(user.phone)}</p>}
                        </div>
                      </div>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold flex-shrink-0 ${
                        user.isActive ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${user.isActive ? 'bg-emerald-500' : 'bg-red-500'}`} />
                        {user.isActive ? 'Active' : 'Off'}
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-1 mb-3">
                      {(user.roles || []).map(role => {
                        const r = role.trim();
                        return r ? (
                          <span key={r} className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold capitalize ${ROLE_COLORS[r] || 'bg-gray-100 text-gray-600'}`}>
                            {r}
                          </span>
                        ) : null;
                      })}
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${sourceInfo.color}`}>
                        {sourceInfo.label}
                      </span>
                    </div>

                    {user.teams.length > 0 && (
                      <div className="mb-3 px-3 py-2 bg-[#f8f8fa] rounded-lg">
                        <p className="text-[10px] font-bold text-[#86868b] uppercase mb-1">Teams</p>
                        {user.teams.map((t, i) => (
                          <p key={i} className="text-xs text-[#3d3d3d]">
                            <span className="font-medium capitalize">{t.role}</span> - {t.teamName}
                          </p>
                        ))}
                      </div>
                    )}

                    <div className="flex items-center justify-between text-xs text-[#86868b] mb-3">
                      <span>Joined {formatDate(user.createdAt)}</span>
                      {user.claimedPlayers > 0 && <span>{user.claimedPlayers} claimed players</span>}
                    </div>

                    <div className="flex gap-2 pt-3 border-t border-[#f0f0f2]">
                      <button onClick={() => setEditingUser(user)}
                        className="flex-1 px-3 py-2 bg-[#f0f7ff] hover:bg-blue-100 text-[#003e79] font-medium text-sm rounded-lg transition">Edit</button>
                      <button onClick={() => toggleUserStatus(user)}
                        className="flex-1 px-3 py-2 bg-amber-50 hover:bg-amber-100 text-amber-700 font-medium text-sm rounded-lg transition">
                        {user.isActive ? 'Deactivate' : 'Activate'}
                      </button>
                      <button onClick={() => setDeletingUser(user)}
                        className="px-3 py-2 bg-red-50 hover:bg-red-100 text-red-600 font-medium text-sm rounded-lg transition">Delete</button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Pagination */}
            {pagination.totalPages > 1 && (
              <div className="flex items-center justify-between mt-6">
                <span className="text-sm text-[#86868b]">
                  Showing {((pagination.page - 1) * pagination.perPage) + 1}&ndash;{Math.min(pagination.page * pagination.perPage, pagination.total)} of {pagination.total.toLocaleString()}
                </span>
                <div className="flex items-center gap-1">
                  <button onClick={() => handlePageChange(Math.max(1, pagination.page - 1))} disabled={pagination.page === 1}
                    className="px-3 py-1.5 rounded-lg text-sm font-medium bg-white border border-[#e0e0e5] hover:bg-[#f5f5f7] disabled:opacity-40 disabled:cursor-not-allowed transition">
                    Prev
                  </button>
                  {Array.from({ length: Math.min(7, pagination.totalPages) }, (_, i) => {
                    let p: number;
                    if (pagination.totalPages <= 7) p = i + 1;
                    else if (pagination.page <= 4) p = i + 1;
                    else if (pagination.page >= pagination.totalPages - 3) p = pagination.totalPages - 6 + i;
                    else p = pagination.page - 3 + i;
                    return (
                      <button key={p} onClick={() => handlePageChange(p)}
                        className={`w-8 h-8 rounded-lg text-sm font-medium transition ${
                          pagination.page === p ? 'bg-[#003e79] text-white shadow' : 'bg-white border border-[#e0e0e5] hover:bg-[#f5f5f7] text-[#3d3d3d]'
                        }`}>{p}</button>
                    );
                  })}
                  <button onClick={() => handlePageChange(Math.min(pagination.totalPages, pagination.page + 1))} disabled={pagination.page === pagination.totalPages}
                    className="px-3 py-1.5 rounded-lg text-sm font-medium bg-white border border-[#e0e0e5] hover:bg-[#f5f5f7] disabled:opacity-40 disabled:cursor-not-allowed transition">
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// Separate component to avoid React key/fragment issues with expandable rows
function UserRow({ user, isExpanded, sourceInfo, onToggleExpand, onEdit, onToggleStatus, onDelete, formatDate, formatDateLong }: {
  user: User; isExpanded: boolean; sourceInfo: { label: string; color: string };
  onToggleExpand: () => void; onEdit: () => void; onToggleStatus: () => void; onDelete: () => void;
  formatDate: (d: string) => string; formatDateLong: (d: string) => string;
}) {
  return (
    <>
      <tr className={`hover:bg-[#fafafa]/80 transition cursor-pointer ${isExpanded ? 'bg-[#f8f8fa]' : ''}`}
        onClick={onToggleExpand}>
        <td className="px-5 py-3.5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-gradient-to-br from-[#003e79] to-[#0066cc] rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
              {(user.firstName?.[0] || '').toUpperCase()}{(user.lastName?.[0] || '').toUpperCase()}
            </div>
            <div>
              <div className="font-semibold text-sm text-[#1d1d1f]">{user.firstName} {user.lastName}</div>
              <div className="text-xs text-[#aeaeb2] mt-0.5">Joined {formatDate(user.createdAt)}</div>
            </div>
          </div>
        </td>
        <td className="px-5 py-3.5">
          <div className="text-sm text-[#3d3d3d]">{user.email}</div>
          {user.phone && <div className="text-xs text-[#86868b] mt-0.5">{formatPhone(user.phone)}</div>}
        </td>
        <td className="px-5 py-3.5">
          <div className="flex flex-wrap gap-1">
            {(user.roles || []).map(role => {
              const r = role.trim();
              return r ? (
                <span key={r} className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold capitalize ${ROLE_COLORS[r] || 'bg-gray-100 text-gray-600'}`}>
                  {r}
                </span>
              ) : null;
            })}
          </div>
        </td>
        <td className="px-5 py-3.5 text-center">
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${sourceInfo.color}`}>
            {sourceInfo.label}
          </span>
        </td>
        <td className="px-5 py-3.5 text-center">
          {user.teams.length > 0 ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#f0f7ff] text-[#003e79]">
              {user.teams.length}
            </span>
          ) : (
            <span className="text-xs text-[#c8c8cd]">&mdash;</span>
          )}
        </td>
        <td className="px-5 py-3.5 text-center">
          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold ${
            user.isActive ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${user.isActive ? 'bg-emerald-500' : 'bg-red-500'}`} />
            {user.isActive ? 'Active' : 'Inactive'}
          </span>
        </td>
        <td className="px-5 py-3.5 text-right" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-end gap-1">
            <button onClick={onEdit} title="Edit"
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-blue-50 text-[#86868b] hover:text-[#003e79] transition">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" /></svg>
            </button>
            <button onClick={onToggleStatus} title={user.isActive ? 'Deactivate' : 'Activate'}
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-amber-50 text-[#86868b] hover:text-amber-600 transition">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                {user.isActive ? (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                )}
              </svg>
            </button>
            <button onClick={onDelete} title="Delete"
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-red-50 text-[#86868b] hover:text-red-600 transition">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
            </button>
          </div>
        </td>
      </tr>
      {isExpanded && (
        <tr className="bg-[#f8f8fa]">
          <td colSpan={7} className="px-5 py-4">
            <div className="grid grid-cols-3 gap-6 ml-12">
              {/* Teams */}
              <div>
                <h4 className="text-xs font-bold text-[#86868b] uppercase tracking-wider mb-2">Team Associations</h4>
                {user.teams.length > 0 ? (
                  <div className="space-y-1.5">
                    {user.teams.map((t, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase ${
                          t.role === 'coach' ? 'bg-blue-100 text-blue-700' : 'bg-cyan-100 text-cyan-700'
                        }`}>{t.role}</span>
                        <span className="text-[#3d3d3d]">{t.teamName}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-[#aeaeb2]">No team associations</p>
                )}
              </div>

              {/* Activity */}
              <div>
                <h4 className="text-xs font-bold text-[#86868b] uppercase tracking-wider mb-2">Activity</h4>
                <div className="space-y-1.5 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-[#6e6e73]">Claimed Players</span>
                    <span className="font-semibold text-[#1d1d1f]">{user.claimedPlayers}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[#6e6e73]">Registrations</span>
                    <span className="font-semibold text-[#1d1d1f]">{user.registrations}</span>
                  </div>
                </div>
              </div>

              {/* Meta */}
              <div>
                <h4 className="text-xs font-bold text-[#86868b] uppercase tracking-wider mb-2">Details</h4>
                <div className="space-y-1.5 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-[#6e6e73]">Source</span>
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${sourceInfo.color}`}>{sourceInfo.label}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[#6e6e73]">Joined</span>
                    <span className="text-[#3d3d3d] text-xs">{formatDateLong(user.createdAt)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[#6e6e73]">User ID</span>
                    <span className="text-[#aeaeb2] text-xs font-mono">{user.id.slice(0, 12)}...</span>
                  </div>
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
