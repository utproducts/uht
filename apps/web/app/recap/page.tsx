'use client';

/*
  EVENT RECAP - the celebration page families land on from the morning-after
  push and email. /recap?event=<slug or id>. The content itself lives in
  components/EventRecap.tsx and is also embedded on past events' pages.
*/

import { useEffect, useState } from 'react';
import { EventRecapContent } from '../components/EventRecap';

export default function RecapPage() {
  const [slug, setSlug] = useState<string | null>(null);
  useEffect(() => {
    setSlug(new URLSearchParams(window.location.search).get('event') || '');
  }, []);
  if (slug === null) return <div className="min-h-screen flex items-center justify-center text-[#6e6e73]">Loading recap…</div>;
  return <EventRecapContent slug={slug} />;
}
