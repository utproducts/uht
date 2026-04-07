'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function AdminEventsRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace('/admin/events'); }, [router]);
  return (
    <div className="flex items-center justify-center py-20">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#003e79]" />
    </div>
  );
}
