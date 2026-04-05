'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function DashboardAdminSponsorsRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace('/admin/sponsors'); }, [router]);
  return (
    <div className="flex justify-center py-20">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-cyan-600" />
    </div>
  );
}
