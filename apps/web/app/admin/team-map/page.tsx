'use client';

/*
  ADMIN: TEAM MAP - heat map of where this season's registered teams come
  from. City coordinates live in city_geocodes (one-time Nominatim pass);
  the heat layer is leaflet.heat, markers scale with team count.
*/

import { useEffect, useRef, useState } from 'react';

const API = 'https://uht.chad-157.workers.dev/api';

function hdrs(): Record<string, string> {
  return {
    'X-Dev-Bypass': 'true',
    ...(typeof window !== 'undefined' && localStorage.getItem('uht_token') ? { Authorization: `Bearer ${localStorage.getItem('uht_token')}` } : {}),
  };
}

const titleCase = (s: string) => s.replace(/\b\w/g, (ch) => ch.toUpperCase());

export default function TeamMapPage() {
  const mapRef = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    fetch(`${API}/analytics/reports/team-map`, { headers: hdrs() })
      .then(r => r.json())
      .then((j: any) => { if (j.success) setData(j.data); else setErr(j.error || 'Could not load team map'); })
      .catch(() => setErr('Could not load team map'));
  }, []);

  useEffect(() => {
    if (!data || !mapRef.current) return;
    let map: any;
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css';
    document.head.appendChild(css);
    const js = document.createElement('script');
    js.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
    js.onload = () => {
      const heat = document.createElement('script');
      heat.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet.heat/0.2.0/leaflet-heat.js';
      heat.onload = () => {
        const L = (window as any).L;
        if (!L || !mapRef.current) return;
        map = L.map(mapRef.current, { scrollWheelZoom: true });
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; OpenStreetMap contributors', maxZoom: 12,
        }).addTo(map);

        const pts = (data.cities || []).map((c: any) => [c.lat, c.lng, Math.min(1, c.teams / 10)]);
        (L as any).heatLayer(pts, { radius: 32, blur: 24, maxZoom: 9, minOpacity: 0.35 }).addTo(map);

        const maxTeams = Math.max(1, ...(data.cities || []).map((c: any) => c.teams));
        for (const c of data.cities || []) {
          const r = 5 + Math.sqrt(c.teams / maxTeams) * 18;
          L.circleMarker([c.lat, c.lng], {
            radius: r, color: '#003e79', weight: 1.5, fillColor: '#00ccff', fillOpacity: 0.5,
          }).addTo(map).bindTooltip(`<b>${titleCase(c.city)}, ${c.state}</b><br/>${c.teams} team${c.teams !== 1 ? 's' : ''}`);
        }

        // Open on the core market (cities with 2+ teams); outliers are a zoom-out away
        const core = (data.cities || []).filter((c: any) => c.teams >= 2);
        const fitSet = core.length >= 3 ? core : (data.cities || []);
        if (fitSet.length > 0) {
          const bounds = L.latLngBounds(fitSet.map((c: any) => [c.lat, c.lng]));
          map.fitBounds(bounds.pad(0.1));
        } else {
          map.setView([41.5, -90], 5);
        }
      };
      document.head.appendChild(heat);
    };
    document.head.appendChild(js);
    return () => { try { map?.remove(); } catch {} };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  return (
    <div className="max-w-6xl mx-auto px-6 py-6">
      <h1 className="text-2xl font-bold text-[#1d1d1f]">Team Map</h1>
      <p className="text-sm text-[#6e6e73] mt-1 mb-5">
        Where this season&apos;s registered teams come from. Hot zones are your markets - hover any circle for the city and count.
      </p>

      {err ? (
        <div className="bg-white rounded-2xl border border-[#e8e8ed] p-10 text-center text-sm text-[#86868b]">{err}</div>
      ) : !data ? (
        <div className="flex justify-center py-16"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#003e79]" /></div>
      ) : (
        <div className="grid lg:grid-cols-[1fr_260px] gap-5">
          <div className="bg-white rounded-2xl border border-[#e8e8ed] overflow-hidden shadow-sm">
            <div ref={mapRef} style={{ height: 620 }} />
          </div>
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-[#e8e8ed] p-4 text-center">
              <div className="text-3xl font-bold text-[#003e79]">{data.total}</div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-[#86868b] mt-1">Teams This Season</div>
            </div>
            <div className="bg-white rounded-2xl border border-[#e8e8ed] p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-[#86868b] mb-2">By State</p>
              <div className="space-y-1.5 max-h-[340px] overflow-y-auto">
                {(data.states || []).map((s: any) => (
                  <div key={s.state} className="flex items-center justify-between text-sm">
                    <span className="font-medium text-[#3d3d3d]">{s.state}</span>
                    <span className="font-bold text-[#003e79]">{s.teams}</span>
                  </div>
                ))}
              </div>
            </div>
            {(data.unplaced || []).length > 0 && (
              <div className="bg-white rounded-2xl border border-[#e8e8ed] p-4">
                <p className="text-xs font-bold uppercase tracking-wider text-amber-600 mb-2">Not on map ({data.unplaced.length} cities)</p>
                <div className="space-y-1 max-h-[160px] overflow-y-auto">
                  {data.unplaced.map((c: any) => (
                    <p key={c.city + c.state} className="text-xs text-[#6e6e73]">{titleCase(c.city)}, {c.state} · {c.teams}</p>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
