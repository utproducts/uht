'use client';
import { useState, useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

const ALL_ROLES = [
  { id: 'admin', label: 'Admin' },
  { id: 'director', label: 'Director' },
  { id: 'organization', label: 'Organization' },
  { id: 'coach', label: 'Coach' },
  { id: 'manager', label: 'Manager' },
  { id: 'parent', label: 'Parent / Fan' },
  { id: 'scorekeeper', label: 'Scorekeeper' },
  { id: 'referee', label: 'Referee' },
];

const SELF_ADDABLE = ['coach', 'parent', 'referee', 'scorekeeper'];

function getUserRoles(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const stored = localStorage.getItem('uht_user');
    if (stored) {
      const u = JSON.parse(stored);
      return u.roles || [];
    }
  } catch {}
  return [];
}

export default function RoleSwitcher() {
  const [open, setOpen] = useState(false);
  const [userRoles, setUserRoles] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);
  const [addSuccess, setAddSuccess] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  // Determine current role from URL
  const pathRole = pathname.split('/')[2] || (pathname.startsWith('/admin') ? 'admin' : '');
  const currentRole = ALL_ROLES.find((r) => r.id === pathRole) || ALL_ROLES.find((r) => userRoles.includes(r.id)) || ALL_ROLES[0];

  useEffect(() => {
    setUserRoles(getUserRoles());
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const visibleRoles = ALL_ROLES.filter((r) => userRoles.includes(r.id));
  const addableRoles = ALL_ROLES.filter((r) => SELF_ADDABLE.includes(r.id) && !userRoles.includes(r.id));

  const switchRole = (roleId: string) => {
    if (typeof window !== 'undefined') localStorage.setItem('uht_role', roleId);
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
      const res = await fetch('https://uht.chad-157.workers.dev/api/auth/add-role', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ role: roleId }),
      });
      const json = await res.json();
      if (json.success && json.roles) {
        // Update localStorage
        const stored = localStorage.getItem('uht_user');
        if (stored) {
          const u = JSON.parse(stored);
          u.roles = json.roles;
          localStorage.setItem('uht_user', JSON.stringify(u));
        }
        setUserRoles(json.roles);
        const label = ALL_ROLES.find(r => r.id === roleId)?.label || roleId;
        setAddSuccess(label);
        setTimeout(() => setAddSuccess(''), 2000);
      }
    } catch {}
    setAdding(false);
  };

  return (
    <div ref={dropdownRef} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-white/90 hover:text-white text-sm font-medium transition-colors px-2.5 py-1 rounded-lg hover:bg-white/10"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
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
          {/* Current roles */}
          <div className="px-3 py-2 bg-gray-50 border-b border-gray-100">
            <p className="text-[10px] font-semibold text-[#86868b] uppercase tracking-wider">Switch Role</p>
          </div>
          <div className="p-1.5">
            {visibleRoles.length > 0 ? visibleRoles.map((role) => (
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
                  <svg className="w-4 h-4 text-[#003e79] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
                {currentRole.id !== role.id && <span className="w-4 flex-shrink-0" />}
                {role.label}
              </button>
            )) : (
              <p className="px-3 py-2 text-sm text-[#86868b]">No roles assigned</p>
            )}
          </div>

          {/* Add a role */}
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

          {/* Success message */}
          {addSuccess && (
            <div className="px-3 py-2 bg-green-50 border-t border-green-100">
              <p className="text-xs text-green-700 font-medium">{addSuccess} added!</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
