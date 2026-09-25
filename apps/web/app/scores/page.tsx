'use client';

import { useEffect } from 'react';

// /scores has no content of its own - live scores live on each event's page.
// Anyone landing here (old links, back-button paths) goes to the events list.
export default function ScoresRedirect() {
  useEffect(() => { window.location.replace('/events'); }, []);
  return (
    <div className="min-h-screen bg-[#fafafa] flex items-center justify-center">
      <p className="text-[#86868b] text-sm">Taking you to events...</p>
    </div>
  );
}
