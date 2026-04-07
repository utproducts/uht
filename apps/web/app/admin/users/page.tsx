'use client';

import { useState, useEffect } from 'react';

const API_BASE = 'https://uht.chad-157.workers.dev/api/users';

const ROLES = ['admin', 'director', 'organization', 'coach', 'manager', 'parent', 'scorekeeper', 'referee'];

interface User {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  roles: string; // comma-separated
  is_active: number;
  created_at: string;
}

interface PaginationInfo {
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
}

// ==================
// Create User Modal
// ==================
function CreateUserModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    password: '',
    roles: [] as string[],
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleRoleToggle = (role: string) => {
    setForm(prev => ({
      ...prev,
      roles: prev.roles.includes(role)
        ? prev.roles.filter(r => r !== role)
        : [...prev.roles, role]
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
      const res = await fetch(`${API_BASE}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
      else setError(json.error || 'Failed to create user');
    } catch (e) { setError('Network error'); }
    finally { setSaving(false); }
  };

  const fc = "w-full px-3 py-2 border border-[#e8e8ed] rounded-xl text-sm focus:ring-2 focus:ring-[#003e79]/20 outline-none";
  const lc = "block text-xs font-semibold text-[#6e6e73] mb-1";

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="border-b border-[#e8e8ed] px-6 py-4 flex items-center justify-between sticky top-0 bg-white">
          <h2 className="text-lg font-bold text-[#1d1d1f]">Create User</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-[#fafafa] text-[#86868b] hover:text-[#6e6e73]">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">
          {error && <div className="bg-red-50 text-red-700 text-sm px-4 py-3 rounded-xl">{error}</div>}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lc}>First Name *</label>
              <input className={fc} value={form.firstName} onChange={e => setForm({...form, firstName: e.target.value})} placeholder="John" />
            </div>
            <div>
              <label className={lc}>Last Name *</label>
              <input className={fc} value={form.lastName} onChange={e => setForm({...form, lastName: e.target.value})} placeholder="Doe" />
            </div>
          </div>

          <div>
            <label className={lc}>Email *</label>
            <input className={fc} type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} placeholder="john@example.com" />
          </div>

          <div>
            <label className={lc}>Phone</label>
            <input className={fc} type="tel" value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} placeholder="+1 (555) 000-0000" />
          </div>

          <div>
            <label className={lc}>Password *</label>
            <input className={fc} type="password" value={form.password} onChange={e => setForm({...form, password: e.target.value})} placeholder="••••••••" />
          </div>

          <div>
            <label className={lc}>Roles *</label>
            <div className="space-y-2 mt-2">
              {ROLES.map(role => (
                <label key={role} className="flex items-center gap-3 cursor-pointer p-2 hover:bg-[#f5f5f7] rounded-lg transition">
                  <input
                    type="checkbox"
                    checked={form.roles.includes(role)}
                    onChange={() => handleRoleToggle(role)}
                    className="w-4 h-4 rounded accent-[#003e79]"
                  />
                  <span className="text-sm text-[#3d3d3d] capitalize">{role}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
        <div className="border-t border-[#e8e8ed] px-6 py-4 flex items-center justify-end gap-3 sticky bottom-0 bg-white">
          <button onClick={onClose} className="px-5 py-2.5 bg-[#fafafa] hover:bg-[#e8e8ed] text-[#3d3d3d] font-semibold rounded-full text-sm transition">Cancel</button>
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
    firstName: user.first_name,
    lastName: user.last_name,
    email: user.email,
    phone: user.phone || '',
    roles: user.roles.split(',').map(r => r.trim()).filter(Boolean),
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleRoleToggle = (role: string) => {
    setForm(prev => ({
      ...prev,
      roles: prev.roles.includes(role)
        ? prev.roles.filter(r => r !== role)
        : [...prev.roles, role]
    }));
  };

  const handleSave = async () => {
    if (!form.email.trim()) { setError('Email is required'); return; }
    if (!form.firstName.trim()) { setError('First name is required'); return; }
    if (!form.lastName.trim()) { setError('Last name is required'); return; }
    if (form.roles.length === 0) { setError('At least one role is required'); return; }

    setSaving(true);
    setError('');
    try {
      // Update user info
      const res1 = await fetch(`${API_BASE}/${user.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          email: form.email.trim(),
          phone: form.phone.trim() || null,
        }),
      });
      const json1 = await res1.json();
      if (!json1.success) { setError(json1.error || 'Failed to update user'); setSaving(false); return; }

      // Update roles
      const res2 = await fetch(`${API_BASE}/${user.id}/roles`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roles: form.roles }),
      });
      const json2 = await res2.json();
      if (json2.success) { onSaved(); onClose(); }
      else setError(json2.error || 'Failed to update roles');
    } catch (e) { setError('Network error'); }
    finally { setSaving(false); }
  };

  const fc = "w-full px-3 py-2 border border-[#e8e8ed] rounded-xl text-sm focus:ring-2 focus:ring-[#003e79]/20 outline-none";
  const lc = "block text-xs font-semibold text-[#6e6e73] mb-1";

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="border-b border-[#e8e8ed] px-6 py-4 flex items-center justify-between sticky top-0 bg-white">
          <h2 className="text-lg font-bold text-[#1d1d1f]">Edit User</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-[#fafafa] text-[#86868b] hover:text-[#6e6e73]">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">
          {error && <div className="bg-red-50 text-red-700 text-sm px-4 py-3 rounded-xl">{error}</div>}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lc}>First Name *</label>
              <input className={fc} value={form.firstName} onChange={e => setForm({...form, firstName: e.target.value})} />
            </div>
            <div>
              <label className={lc}>Last Name *</label>
              <input className={fc} value={form.lastName} onChange={e => setForm({...form, lastName: e.target.value})} />
            </div>
          </div>

          <div>
            <label className={lc}>Email *</label>
            <input className={fc} type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} />
          </div>

          <div>
            <label className={lc}>Phone</label>
            <input className={fc} type="tel" value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} />
          </div>

          <div>
            <label className={lc}>Roles *</label>
            <div className="space-y-2 mt-2">
              {ROLES.map(role => (
                <label key={role} className="flex items-center gap-3 cursor-pointer p-2 hover:bg-[#f5f5f7] rounded-lg transition">
                  <input
                    type="checkbox"
                    checked={form.roles.includes(role)}
                    onChange={() => handleRoleToggle(role)}
                    className="w-4 h-4 rounded accent-[#003e79]"
                  />
                  <span className="text-sm text-[#3d3d3d] capitalize">{role}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
        <div className="border-t border-[#e8e8ed] px-6 py-4 flex items-center justify-end gap-3 sticky bottom-0 bg-white">
          <button onClick={onClose} className="px-5 py-2.5 bg-[#fafafa] hover:bg-[#e8e8ed] text-[#3d3d3d] font-semibold rounded-full text-sm transition">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="px-5 py-2.5 bg-[#003e79] hover:bg-[#002d5a] text-white font-semibold rounded-full text-sm transition disabled:opacity-50">
            {saving ? 'Saving...' : 'Save Changes'}
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
  const [statusFilter, setStatusFilter] = useState('all');
  const [creatingUser, setCreatingUser] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<PaginationInfo>({ total: 0, page: 1, per_page: 20, total_pages: 1 });

  const loadUsers = (searchTerm = '', role = 'all', status = 'all', pg = 1) => {
    setLoading(true);
    const params = new URLSearchParams();
    if (searchTerm) params.append('q', searchTerm);
    if (role !== 'all') params.append('role', role);
    if (status !== 'all') params.append('status', status === 'active' ? '1' : '0');
    params.append('page', pg.toString());
    params.append('per_page', '20');

    fetch(`${API_BASE}?${params.toString()}`)
      .then(r => r.json())
      .then(json => {
        if (json.success) {
          setUsers(json.data);
          setPagination(json.pagination || { total: json.data.length, page: pg, per_page: 20, total_pages: 1 });
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleSearch = (term: string) => {
    setSearch(term);
    setPage(1);
    loadUsers(term, roleFilter, statusFilter, 1);
  };

  const handleRoleFilter = (role: string) => {
    setRoleFilter(role);
    setPage(1);
    loadUsers(search, role, statusFilter, 1);
  };

  const handleStatusFilter = (status: string) => {
    setStatusFilter(status);
    setPage(1);
    loadUsers(search, roleFilter, status, 1);
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    loadUsers(search, roleFilter, statusFilter, newPage);
  };

  const toggleUserStatus = async (user: User) => {
    try {
      const res = await fetch(`${API_BASE}/${user.id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: user.is_active === 1 ? 0 : 1 }),
      });
      const json = await res.json();
      if (json.success) {
        loadUsers(search, roleFilter, statusFilter, page);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleUserSaved = () => {
    loadUsers(search, roleFilter, statusFilter, page);
  };

  // Role breakdown
  const roleCounts: Record<string, number> = {};
  users.forEach(u => {
    u.roles.split(',').forEach(role => {
      const r = role.trim();
      if (r) roleCounts[r] = (roleCounts[r] || 0) + 1;
    });
  });

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <div className="bg-[#fafafa] min-h-full">
      {/* Create Modal */}
      {creatingUser && (
        <CreateUserModal onClose={() => setCreatingUser(false)} onSaved={handleUserSaved} />
      )}

      {/* Edit Modal */}
      {editingUser && (
        <EditUserModal user={editingUser} onClose={() => setEditingUser(null)} onSaved={handleUserSaved} />
      )}

      {/* Header */}
      <div className="max-w-7xl mx-auto px-6 pt-6 pb-2 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-[#1d1d1f]">User Management</h1>
          <p className="text-sm text-[#86868b] mt-0.5">{pagination.total.toLocaleString()} users in database</p>
        </div>
        <button
          onClick={() => setCreatingUser(true)}
          className="px-6 py-2.5 bg-[#003e79] hover:bg-[#002d5a] text-white font-semibold rounded-full text-sm transition"
        >
          Add User
        </button>
      </div>

      {/* Controls */}
      <div className="max-w-7xl mx-auto px-6 mt-5 space-y-3">
        <div className="flex items-center gap-4 flex-wrap">
          {/* Search */}
          <div className="flex-1 min-w-xs max-w-sm">
            <input
              type="text"
              placeholder="Search by name or email..."
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              className="w-full px-4 py-2 border border-[#e8e8ed] rounded-xl text-sm focus:ring-2 focus:ring-[#003e79]/20 outline-none"
            />
          </div>

          {/* Role Filter */}
          <select
            value={roleFilter}
            onChange={(e) => handleRoleFilter(e.target.value)}
            className="px-3 py-2 border border-[#e8e8ed] rounded-xl text-sm bg-white focus:ring-2 focus:ring-[#003e79]/20 outline-none"
          >
            <option value="all">All Roles</option>
            {ROLES.map(role => (
              <option key={role} value={role}>{role.charAt(0).toUpperCase() + role.slice(1)} ({roleCounts[role] || 0})</option>
            ))}
          </select>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => handleStatusFilter(e.target.value)}
            className="px-3 py-2 border border-[#e8e8ed] rounded-xl text-sm bg-white focus:ring-2 focus:ring-[#003e79]/20 outline-none"
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>

          <span className="text-sm text-[#86868b]">{pagination.total.toLocaleString()} total</span>
        </div>
      </div>

      {/* Users Table */}
      <div className="max-w-7xl mx-auto px-6 py-5">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#003e79]" />
          </div>
        ) : users.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-lg p-12 text-center border border-[#e8e8ed]">
            <svg className="w-16 h-16 mx-auto text-[#86868b] mb-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
            <p className="text-[#86868b] font-medium">No users found</p>
          </div>
        ) : (
          <>
            {/* Desktop Table View */}
            <div className="hidden md:block bg-white rounded-2xl border border-[#e8e8ed] shadow-[0_1px_20px_-6px_rgba(0,0,0,0.08)] overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[#e8e8ed] bg-[#fafafa]">
                    <th className="text-left px-5 py-3 text-xs font-bold text-[#86868b] uppercase tracking-widest">Name</th>
                    <th className="text-left px-5 py-3 text-xs font-bold text-[#86868b] uppercase tracking-widest">Email</th>
                    <th className="text-left px-5 py-3 text-xs font-bold text-[#86868b] uppercase tracking-widest">Phone</th>
                    <th className="text-left px-5 py-3 text-xs font-bold text-[#86868b] uppercase tracking-widest">Roles</th>
                    <th className="text-center px-5 py-3 text-xs font-bold text-[#86868b] uppercase tracking-widest">Status</th>
                    <th className="text-left px-5 py-3 text-xs font-bold text-[#86868b] uppercase tracking-widest">Created</th>
                    <th className="text-right px-5 py-3 text-xs font-bold text-[#86868b] uppercase tracking-widest">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e8e8ed]">
                  {users.map(user => (
                    <tr key={user.id} className="hover:bg-[#fafafa]/50 transition">
                      <td className="px-5 py-3">
                        <div className="font-semibold text-sm text-[#1d1d1f]">{user.first_name} {user.last_name}</div>
                      </td>
                      <td className="px-5 py-3 text-sm text-[#6e6e73]">{user.email}</td>
                      <td className="px-5 py-3 text-sm text-[#6e6e73]">{user.phone || '—'}</td>
                      <td className="px-5 py-3">
                        <div className="flex flex-wrap gap-1.5">
                          {user.roles.split(',').map(role => {
                            const r = role.trim();
                            return r ? (
                              <span key={r} className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-[#f0f7ff] text-[#003e79]">
                                {r}
                              </span>
                            ) : null;
                          })}
                        </div>
                      </td>
                      <td className="px-5 py-3 text-center">
                        <div className="flex items-center justify-center">
                          <div className={`w-2.5 h-2.5 rounded-full ${user.is_active === 1 ? 'bg-green-500' : 'bg-red-500'}`} />
                        </div>
                      </td>
                      <td className="px-5 py-3 text-sm text-[#6e6e73]">{formatDate(user.created_at)}</td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => setEditingUser(user)}
                            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-blue-50 text-[#86868b] hover:text-[#003e79] transition"
                            title="Edit"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" /></svg>
                          </button>
                          <button
                            onClick={() => toggleUserStatus(user)}
                            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-amber-50 text-[#86868b] hover:text-amber-600 transition"
                            title={user.is_active === 1 ? 'Deactivate' : 'Activate'}
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Card View */}
            <div className="md:hidden space-y-3">
              {users.map(user => (
                <div key={user.id} className="bg-white rounded-2xl border border-[#e8e8ed] shadow-[0_1px_20px_-6px_rgba(0,0,0,0.08)] p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <h3 className="font-semibold text-[#1d1d1f]">{user.first_name} {user.last_name}</h3>
                      <p className="text-sm text-[#6e6e73] mt-0.5">{user.email}</p>
                      {user.phone && <p className="text-sm text-[#6e6e73]">{user.phone}</p>}
                    </div>
                    <div className={`w-3 h-3 rounded-full ${user.is_active === 1 ? 'bg-green-500' : 'bg-red-500'} flex-shrink-0`} />
                  </div>

                  <div className="mb-3">
                    <p className="text-xs text-[#86868b] font-semibold mb-2">Roles</p>
                    <div className="flex flex-wrap gap-1.5">
                      {user.roles.split(',').map(role => {
                        const r = role.trim();
                        return r ? (
                          <span key={r} className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-[#f0f7ff] text-[#003e79]">
                            {r}
                          </span>
                        ) : null;
                      })}
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs text-[#86868b] mb-3">
                    <span>Created {formatDate(user.created_at)}</span>
                  </div>

                  <div className="flex gap-2 pt-3 border-t border-[#e8e8ed]">
                    <button
                      onClick={() => setEditingUser(user)}
                      className="flex-1 px-3 py-2 bg-[#f0f7ff] hover:bg-blue-100 text-[#003e79] font-medium text-sm rounded-lg transition"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => toggleUserStatus(user)}
                      className="flex-1 px-3 py-2 bg-amber-50 hover:bg-amber-100 text-amber-700 font-medium text-sm rounded-lg transition"
                    >
                      {user.is_active === 1 ? 'Deactivate' : 'Activate'}
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination */}
            {pagination.total_pages > 1 && (
              <div className="flex items-center justify-between mt-6">
                <span className="text-sm text-[#86868b]">
                  Showing {((pagination.page - 1) * pagination.per_page) + 1}–{Math.min(pagination.page * pagination.per_page, pagination.total)} of {pagination.total.toLocaleString()}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handlePageChange(Math.max(1, pagination.page - 1))}
                    disabled={pagination.page === 1}
                    className="px-3 py-1.5 rounded-lg text-sm font-medium bg-white border border-[#e8e8ed] hover:bg-[#f5f5f7] disabled:opacity-40 disabled:cursor-not-allowed transition"
                  >
                    Prev
                  </button>
                  {Array.from({ length: Math.min(7, pagination.total_pages) }, (_, i) => {
                    let p: number;
                    if (pagination.total_pages <= 7) p = i + 1;
                    else if (pagination.page <= 4) p = i + 1;
                    else if (pagination.page >= pagination.total_pages - 3) p = pagination.total_pages - 6 + i;
                    else p = pagination.page - 3 + i;
                    return (
                      <button
                        key={p}
                        onClick={() => handlePageChange(p)}
                        className={`w-8 h-8 rounded-lg text-sm font-medium transition ${
                          pagination.page === p
                            ? 'bg-[#003e79] text-white shadow'
                            : 'bg-white border border-[#e8e8ed] hover:bg-[#f5f5f7] text-[#3d3d3d]'
                        }`}
                      >
                        {p}
                      </button>
                    );
                  })}
                  <button
                    onClick={() => handlePageChange(Math.min(pagination.total_pages, pagination.page + 1))}
                    disabled={pagination.page === pagination.total_pages}
                    className="px-3 py-1.5 rounded-lg text-sm font-medium bg-white border border-[#e8e8ed] hover:bg-[#f5f5f7] disabled:opacity-40 disabled:cursor-not-allowed transition"
                  >
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
