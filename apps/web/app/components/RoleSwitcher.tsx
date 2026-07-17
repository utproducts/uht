'use client';
import { useState, useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://uht.chad-157.workers.dev';

const ROLES = [
  { id: 'admin', label: 'Admin' },
  { id: 'director', label: 'Director' },
  { id: 'organization', label: 'Organization' },
  { id: 'coach', label: 'Coach' },
  { id: 'manager', label: 'Manager' },
  { id: 'parent', label: 'Parent / Fan' },
  { id: 'scorekeeper', label: 'Scorekeeper' },
  { id: 'referee', label: 'Referee' },
];

// Roles a user can self-assign from the dropdown (admin/director/etc. must be granted)
const SELF_SERVE_ROLES = ['coach', 'parent', 'referee', 'scorekeeper'];

function readRoles(): string[] {
  try {
    const stored = localStorage.getItem('uht_user');
    if (stored) return JSON.parse(stored).roles || [];
  } catch {}
  return [];
}

export default function RoleSwitcher() {
  const [open, setOpen] = useState(false);
  const [roles, setRoles] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);
  const [addedLabel, setAddedLabel] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const roleKey = pathname.split('/')[2] || (pathname.startsWith('/admin') ? 'admin' : '');
  const currentRole =
    ROLES.find((r) => r.id === roleKey) ||
    ROLES.find((r) => roles.includes(r.id)) ||
    ROLES[0];

  useEffect(() => {
    setRoles(readRoles());
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const myRoles = ROLES.filter((r) => roles.includes(r.id));
  const addableRoles = ROLES.filter((r) => SELF_SERVE_ROLES.includes(r.id) && !roles.includes(r.id));

  const switchRole = (roleId: string) => {
    localStorage.setItem('uht_role', roleId);
    // Use window.location.href for full page reload — router.push can fail
    // to re-mount the layout correctly in a static export
    if (roleId === 'admin') {
      window.location.href = '/admin/events';
    } else {
      window.location.href = '/dashboard/' + roleId;
    }
    setOpen(false);
  };

  const addRole = async (roleId: string) => {
    setAdding(true);
    try {
      const token = localStorage.getItem('uht_token');
      const res = await fetch(`${API}/api/auth/add-role`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ role: roleId }),
      });
      const data = await res.json();
      if (data.success && data.roles) {
        // Keep the cached user in sync so the dropdown reflects the new role
        const stored = localStorage.getItem('uht_user');
        if (stored) {
          const u = JSON.parse(stored);
          u.roles = data.roles;
          localStorage.setItem('uht_user', JSON.stringify(u));
        }
        setRoles(data.roles);
        const label = ROLES.find((r) => r.id === roleId)?.label || roleId;
        setAddedLabel(label);
        setTimeout(() => setAddedLabel(''), 2000);
      }
    } catch {}
    setAdding(false);
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-white/90 hover:text-white text-sm font-medium transition-colors px-2.5 py-1 rounded-lg hover:bg-white/10"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
          />
        </svg>
        <span>{currentRole.label}</span>
        <svg
          className={"w-3.5 h-3.5 transition-transform " + (open ? "rotate-180" : "")}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full right-0 mt-2 w-56 bg-white rounded-xl shadow-xl border border-gray-200 overflow-hidden z-50">
          <div className="px-3 py-2 bg-gray-50 border-b border-gray-100">
            <p className="text-[10px] font-semibold text-[#86868b] uppercase tracking-wider">Switch Role</p>
          </div>
          <div className="p-1.5">
            {myRoles.length > 0 ? (
              myRoles.map((role) => (
                <button
                  key={role.id}
                  onClick={() => switchRole(role.id)}
                  className={
                    "w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-left transition-colors " +
                    (currentRole.id === role.id
                      ? "bg-[#e6f0fa] text-[#003e79] font-semibold"
                      : "text-[#1d1d1f] hover:bg-gray-50")
                  }
                >
                  {currentRole.id === role.id && (
                    <svg
                      className="w-4 h-4 text-[#003e79] flex-shrink-0"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2.5}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                  {currentRole.id !== role.id && <span className="w-4 flex-shrink-0" />}
                  {role.label}
                </button>
              ))
            ) : (
              <p className="px-3 py-2 text-sm text-[#86868b]">No roles assigned</p>
            )}
          </div>

          {addableRoles.length > 0 && (
            <>
              <div className="border-t border-gray-100 px-3 py-2 bg-gray-50">
                <p className="text-[10px] font-semibold text-[#86868b] uppercase tracking-wider">Add a Role</p>
              </div>
              <div className="p-1.5">
                {addableRoles.map((role) => (
                  <button
                    key={role.id}
                    onClick={() => addRole(role.id)}
                    disabled={adding}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-left text-[#003e79] hover:bg-[#f0f7ff] transition-colors disabled:opacity-50"
                  >
                    <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                    </svg>
                    {role.label}
                  </button>
                ))}
              </div>
            </>
          )}

          {addedLabel && (
            <div className="px-3 py-2 bg-green-50 border-t border-green-100">
              <p className="text-xs text-green-700 font-medium">{addedLabel} added!</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
