'use client';

import { useState, useEffect } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://uht.chad-157.workers.dev';

interface Photo {
  id: string;
  url: string;
  kind: 'fan' | 'champion';
  team_name?: string | null;
  age_group?: string | null;
  division_level?: string | null;
  created_at: string;
}

export default function PhotosPage({ slug }: { slug: string }) {
  const [eventName, setEventName] = useState('');
  const [eventId, setEventId] = useState('');
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [viewer, setViewer] = useState<Photo | null>(null);

  useEffect(() => {
    let realSlug = slug;
    if (typeof window !== 'undefined' && (slug === '_' || !slug)) {
      const parts = window.location.pathname.split('/').filter(Boolean);
      realSlug = parts[1] || slug;
    }
    fetch(`${API}/api/events/${realSlug}`)
      .then(r => r.json())
      .then((j: any) => {
        if (!j.success) return;
        setEventName(j.data.name);
        setEventId(j.data.id);
        return fetch(`${API}/api/photos/events/${j.data.id}/photos?per_page=120`)
          .then(r2 => r2.json())
          .then((p: any) => {
            if (p.success) { setPhotos(p.data.photos || []); setTotal(p.data.total || 0); }
          });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [slug]);

  const champs = photos.filter(p => p.kind === 'champion');
  const fans = photos.filter(p => p.kind !== 'champion');

  return (
    <div className="min-h-screen bg-[#f5f5f7]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <p className="text-[#00ccff] text-xs font-bold uppercase tracking-widest mb-1">Event Photos</p>
        <h1 className="text-2xl sm:text-3xl font-bold text-[#1d1d1f]">{eventName || 'Tournament Photos'}</h1>
        <p className="text-sm text-[#6e6e73] mt-1 mb-6">
          {total > 0 ? `${total.toLocaleString()} photo${total !== 1 ? 's' : ''} shared by families and staff. ` : ''}
          Upload yours in the UHT app all weekend - every photo becomes part of the official event mosaic.
        </p>

        {loading ? (
          <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#003e79]" /></div>
        ) : photos.length === 0 ? (
          <div className="bg-white rounded-2xl border border-[#e8e8ed] p-10 text-center">
            <p className="font-semibold text-[#1d1d1f] text-lg">No photos yet</p>
            <p className="text-sm text-[#6e6e73] mt-1">Photos families share in the UHT app during the event will appear here.</p>
          </div>
        ) : (
          <>
            {champs.length > 0 && (
              <div className="mb-8">
                <h2 className="text-sm font-bold text-[#8a6d1a] uppercase tracking-widest mb-3">🏆 Champions</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {champs.map(p => (
                    <button key={p.id} onClick={() => setViewer(p)}
                      className="text-left bg-white rounded-2xl overflow-hidden border-2 border-[#e7c45e] shadow-[0_2px_20px_-8px_rgba(180,140,30,0.4)] hover:-translate-y-0.5 transition">
                      <img src={p.url} alt={p.team_name || 'Champions'} className="w-full h-52 object-cover bg-[#e8ecf1]" />
                      <div className="flex items-center gap-2 px-4 py-3 bg-[#fffaf0]">
                        <span className="text-xl">🏆</span>
                        <div>
                          <p className="font-bold text-[#1d2a3d] text-sm">{p.team_name || 'Champions'}</p>
                          {(p.age_group || p.division_level) && (
                            <p className="text-xs font-semibold text-[#8a6d1a]">{[p.age_group, p.division_level].filter(Boolean).join(' ')} Champions</p>
                          )}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {fans.length > 0 && (
              <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2">
                {fans.map(p => (
                  <button key={p.id} onClick={() => setViewer(p)} className="aspect-square overflow-hidden rounded-xl bg-[#e8ecf1] hover:opacity-90 transition">
                    <img src={p.url} alt="" loading="lazy" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {viewer && (
        <div className="fixed inset-0 z-50 bg-[#040a14]/95 flex flex-col items-center justify-center p-4" onClick={() => setViewer(null)}>
          <button className="absolute top-5 right-5 text-white/80 text-3xl leading-none" onClick={() => setViewer(null)}>×</button>
          <img src={viewer.url} alt="" className="max-h-[80vh] max-w-full rounded-xl" onClick={e => e.stopPropagation()} />
          {viewer.kind === 'champion' && (
            <p className="text-[#f5d98d] font-bold mt-4">🏆 {viewer.team_name || 'Champions'}{(viewer.age_group || viewer.division_level) ? ` · ${[viewer.age_group, viewer.division_level].filter(Boolean).join(' ')}` : ''}</p>
          )}
        </div>
      )}
    </div>
  );
}
