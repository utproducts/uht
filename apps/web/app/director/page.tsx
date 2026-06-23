'use client';

import { useEffect } from 'react';

export default function DirectorRedirect() {
  useEffect(() => {
    window.location.href = '/dashboard/director';
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#003e79]" />
    </div>
  );
}
