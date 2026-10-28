'use client';

/*
  EVENT PHOTO MOSAIC - full-screen zoomable viewer. The mosaic is sliced
  into a Leaflet tile pyramid (1024px tiles, 5 levels) so phones can
  pinch-zoom to full print resolution while loading only what's on screen.
  /mosaic?event=<slug>  ·  tiles live in R2 under mosaic/<slug>/z_x_y.jpg
*/

import { useEffect, useRef, useState } from 'react';

const ASSETS = 'https://uht.chad-157.workers.dev/api/assets/mosaic';

export default function MosaicPage() {
  const mapRef = useRef<HTMLDivElement>(null);
  const [err, setErr] = useState('');
  const [meta, setMeta] = useState<any>(null);
  const [slug, setSlug] = useState('');

  useEffect(() => {
    const ev = new URLSearchParams(window.location.search).get('event') || '';
    setSlug(ev);
    if (!ev) { setErr('Missing event'); return; }
    fetch(`${ASSETS}/${encodeURIComponent(ev)}/meta.json`)
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(setMeta)
      .catch(() => setErr('No mosaic published for this event yet.'));
  }, []);

  useEffect(() => {
    if (!meta || !mapRef.current) return;
    let map: any;
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css';
    document.head.appendChild(css);
    const js = document.createElement('script');
    js.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
    js.onload = () => {
      const L = (window as any).L;
      if (!L || !mapRef.current) return;
      const { width, height, tileSize, levels } = meta;
      const maxZoom = levels - 1;
      map = L.map(mapRef.current, {
        crs: L.CRS.Simple, minZoom: 0, maxZoom, zoomSnap: 0.25,
        attributionControl: false, maxBoundsViscosity: 0.8,
      });
      // CRS.Simple: 1 map unit = 1px at z0 (full/2^maxZoom)
      const sw = map.unproject([0, height / 2 ** maxZoom * 1], 0);
      const ne = map.unproject([width / 2 ** maxZoom, 0], 0);
      const bounds = new L.LatLngBounds(map.unproject([0, height], maxZoom), map.unproject([width, 0], maxZoom));
      L.TileLayer.Mosaic = L.TileLayer.extend({
        getTileUrl: (coords: any) => `${ASSETS}/${encodeURIComponent(slug)}/${coords.z}_${coords.x}_${coords.y}.jpg`,
      });
      const layer = new (L.TileLayer as any).Mosaic('', {
        tileSize, minZoom: 0, maxZoom, noWrap: true, bounds,
        errorTileUrl: 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==',
      });
      layer.addTo(map);
      map.setMaxBounds(bounds.pad(0.1));
      map.fitBounds(bounds);
      void sw; void ne;
    };
    document.head.appendChild(js);
    return () => { try { map?.remove(); } catch {} };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta]);

  return (
    <div className="fixed inset-0 bg-[#080a10] flex flex-col z-[2000]">
      <div className="flex items-center justify-between px-4 py-3 bg-[#0d1320] border-b border-[#1d2a3d] z-[1001]">
        <a href={slug ? `/recap?event=${encodeURIComponent(slug)}` : '/'} className="text-[#7fd8ff] text-sm font-semibold">&larr; Back to Recap</a>
        <p className="text-white text-sm font-black tracking-wide hidden sm:block">EVENT PHOTO MOSAIC</p>
        {meta ? (
          <a href={`${ASSETS}/${encodeURIComponent(slug)}/full.jpg`} download
            className="text-xs font-bold text-[#d4af37] border border-[#d4af37]/50 rounded-full px-3 py-1.5">Download Full Size</a>
        ) : <span />}
      </div>
      {err ? (
        <div className="flex-1 flex items-center justify-center text-[#8a94a3] text-sm">{err}</div>
      ) : (
        <div ref={mapRef} className="flex-1" style={{ background: '#080a10' }} />
      )}
      {meta && (
        <div className="px-4 py-2.5 bg-[#0d1320] border-t border-[#1d2a3d] text-center z-[1001]">
          <p className="text-[11px] text-[#8a94a3]">Pinch or scroll to zoom - every tile is a real photo from the weekend. Made from {meta.photos} family photos.</p>
        </div>
      )}
    </div>
  );
}
