'use client';
import { useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';

const ROLES = [
  { id: 'admin', label: 'Admin', icon: '\u{1F6E1}' },
  { id: 'director', label: 'Director', icon: '\u{1F3AF}' },
  { id: 'organization', label: 'Organization', icon: '\u{1F3E2}' },
  { id: 'coach', label: 'Coach', icon: '\u{1F4CB}' },
  { id: 'manager', label: 'Manager', icon: '\u{1F465}' },
  { id: 'parent', label: 'Parent/Player', icon: '\u{2B50}' },
  { id: 'scorekeeper', label: 'Scorekeeper', icon: '\u{1F4CA}' },
  { id: 'referee', label: 'Referee', icon: '\u{1F6A9}' },
];

export default function RoleSwitcher() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const currentRole = ROLES.find((r) => pathname.includes(r.id)) || ROLES[0];

  const switchRole = (roleId: string) => {
    if (typeof window !== 'undefined') localStorage.setItem('uht_role', roleId);
    router.push('/dashboard/' + roleId);
    setOpen(false);
  };

  return (
    <div className="fixed bottom-6 right-6 z-50">
      {open && (
        <div className="absolute bottom-16 right-0 w-56 bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden mb-2">
          <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100">
            <p className="text-xs font-semibold text-[#6e6e73] uppercase tracking-wide">Switch Role</p>
          </div>
          <div className="p-2">
            {ROLES.map((role) => (
              <button key={role.id} onClick={() => switchRole(role.id)} className={"w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-left transition-colors " + (currentRole.id === role.id ? "bg-brand-50 text-brand-600 font-medium" : "text-[#1d1d1f] hover:bg-gray-50")}>
                <span>{role.icon}</span>
                <span>{role.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      <button onClick={() => setOpen(!open)} className="flex items-center gap-2 bg-navy-700 text-white px-4 py-3 rounded-full shadow-lg hover:bg-navy-600 transition-colors text-sm font-medium">
        <span>{currentRole.icon}</span>
        <span>{currentRole.label}</span>
        <svg className={"w-4 h-4 transition-transform " + (open ? "rotate-180" : "")} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
        </svg>
      </button>
    </div>
  );
}
