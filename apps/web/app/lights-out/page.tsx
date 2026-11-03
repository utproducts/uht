'use client';

/*
  LIGHTS OUT INVITATIONAL - custom landing page for the invite-only
  glow-in-the-dark tournament. Dark navy + neon treatment is deliberate
  here: the page IS the event. Invitations go to Three Stars recipients.
*/

/* eslint-disable react/no-unescaped-entities */

import { useEffect, useState } from 'react';

const API = 'https://uht.chad-157.workers.dev/api/lights-out';

const SWAG: { name: string; desc: string; icon: string; img?: string }[] = [
  { name: 'Two Custom Jerseys', desc: 'Home and away glow-edition jerseys, made for this event only. Keep both.', icon: 'M16 3l2 3h3v6l-2 1v8H5v-8l-2-1V6h3l2-3h8z' },
  { name: 'Glow Stick Tape', desc: 'Glow-in-the-dark tape. Your blade becomes a light streak on every shot.', icon: 'M4 17l6-6 4 4 6-6M4 7h4v4' },
  { name: 'Custom Glow UHT Puck', desc: 'A collector glow-in-the-dark UHT puck. Nobody else can get one.', icon: 'M12 12m-8 0a8 3.5 0 1 0 16 0a8 3.5 0 1 0 -16 0', img: '/lights-out-puck.jpg' },
  { name: 'Glow T-Shirt', desc: 'A custom glow tee for every player. Lights off, logo on.', icon: 'M8 4l4 2 4-2 4 4-3 3v9H7v-9L4 8l4-4z', img: '/lights-out-tee.jpg' },
  { name: 'UHT Duffle Bag', desc: 'A full-size UHT duffle bag to haul it all home in.', icon: 'M3 9h18v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9zm5 0V7a4 4 0 018 0v2', img: '/lights-out-duffle.jpg' },
  { name: 'And We Are Not Done', desc: 'More exclusive swag is being added. Invitees find out first.', icon: 'M12 3v18M3 12h18' },
];

// Swag card: shows the real product photo once it exists in /public, falls
// back to the icon-only card meanwhile. Static export + hydration means a
// plain <img onError> can fire before React attaches the handler, so probe
// the image from an effect instead.
function SwagCard({ s, i }: { s: { name: string; desc: string; icon: string; img?: string }; i: number }) {
  const [imgOk, setImgOk] = useState(false);
  useEffect(() => {
    if (!s.img) return;
    const probe = new Image();
    probe.onload = () => setImgOk(true);
    probe.src = s.img;
  }, [s.img]);

  return (
    <div className="lo-card rounded-2xl overflow-hidden transition-all flex flex-col" style={{ animation: `loFloat ${5 + (i % 3)}s ease-in-out infinite` }}>
      {imgOk && s.img && (
        <div className="relative">
          <img src={s.img} alt={s.name} loading="lazy" className="w-full h-44 object-cover" />
          <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, transparent 55%, rgba(10,18,40,.92) 100%)' }} />
        </div>
      )}
      <div className="p-5 flex-1">
        {!(imgOk && s.img) && (
          <div className="w-11 h-11 rounded-xl flex items-center justify-center mb-3" style={{ background: 'rgba(0,204,255,.12)', border: '1px solid rgba(0,204,255,.3)' }}>
            <svg className="w-6 h-6 text-[#00ccff]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d={s.icon} /></svg>
          </div>
        )}
        <p className="font-black text-white">{s.name}</p>
        <p className="text-[13px] text-white/60 mt-1 leading-relaxed">{s.desc}</p>
      </div>
    </div>
  );
}

function RegisterModal({ onClose }: { onClose: () => void }) {
  const [events, setEvents] = useState<any[]>([]);
  const [f, setF] = useState({ playerName: '', jerseyNumber: '', teamName: '', starEventId: '', birthYear: '', position: '', parentName: '', email: '', phone: '' });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`${API}/events`).then(r => r.json()).then(j => { if (j.success) setEvents(j.data || []); }).catch(() => {});
  }, []);

  const set = (k: string, v: string) => setF(prev => ({ ...prev, [k]: v }));
  const inputCls = 'w-full rounded-xl px-4 py-2.5 text-sm text-white bg-[#0a1228] border border-[#1d3a56] focus:border-[#00ccff] focus:outline-none placeholder:text-white/30';

  const submit = async () => {
    setError('');
    if (!f.playerName.trim() || !f.teamName.trim() || !f.starEventId || !f.parentName.trim() || !/^\S+@\S+\.\S+$/.test(f.email)) {
      setError('Please fill in the player, team, event, parent name, and a valid email.');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`${API}/register`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...f, playerName: f.playerName.trim(), teamName: f.teamName.trim(), parentName: f.parentName.trim(), email: f.email.trim() }),
      });
      const j = await res.json();
      if (j.success) setDone(true);
      else setError(typeof j.error === 'string' ? j.error : 'Something went wrong - please try again.');
    } catch {
      setError('Something went wrong - please try again.');
    }
    setBusy(false);
  };

  return (
    <div className="fixed inset-0 z-[3000] flex items-center justify-center p-4" style={{ background: 'rgba(2,5,14,.86)' }} onClick={onClose}>
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-3xl p-6 sm:p-8" style={{ background: '#070d20', border: '1px solid rgba(0,204,255,.4)', boxShadow: '0 0 60px rgba(0,204,255,.25)' }} onClick={(e) => e.stopPropagation()}>
        {done ? (
          <div className="text-center py-6">
            <p className="text-[12px] font-black tracking-[0.35em] text-[#39ff14] lo-glow-green mb-4">REQUEST RECEIVED</p>
            <p className="text-white text-xl font-black mb-3">We're confirming the star.</p>
            <p className="text-white/70 text-sm leading-relaxed mb-6">Every invite is verified against the official scoresheets. You'll get an email the moment {f.playerName.split(' ')[0] || 'your player'}'s spot is confirmed.</p>
            <button onClick={onClose} className="px-7 py-3 rounded-full text-sm font-black bg-gradient-to-r from-[#00ccff] to-[#0077b0] text-[#04091a]">DONE</button>
          </div>
        ) : (
          <>
            <p className="text-[11px] font-black tracking-[0.3em] text-[#39ff14] mb-1">INVITE REQUEST</p>
            <h3 className="text-2xl font-black text-white lo-glow mb-1">CLAIM YOUR SPOT</h3>
            <p className="text-white/60 text-[13px] leading-relaxed mb-5">Tell us where your player earned their Three Star. We verify every request against the official scoresheets before the invite is confirmed.</p>
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <input className={`${inputCls} col-span-2`} placeholder="Player full name *" value={f.playerName} onChange={(e) => set('playerName', e.target.value)} />
                <input className={inputCls} placeholder="Jersey #" value={f.jerseyNumber} onChange={(e) => set('jerseyNumber', e.target.value)} />
              </div>
              <input className={inputCls} placeholder="Team name *" value={f.teamName} onChange={(e) => set('teamName', e.target.value)} />
              <select className={inputCls} value={f.starEventId} onChange={(e) => set('starEventId', e.target.value)} style={{ color: f.starEventId ? '#fff' : 'rgba(255,255,255,.35)' }}>
                <option value="">Event where the star was earned *</option>
                {events.map((ev) => <option key={ev.id} value={ev.id} style={{ color: '#111' }}>{ev.name}</option>)}
              </select>
              <div className="grid grid-cols-2 gap-3">
                <input className={inputCls} placeholder="Birth year" value={f.birthYear} onChange={(e) => set('birthYear', e.target.value)} />
                <select className={inputCls} value={f.position} onChange={(e) => set('position', e.target.value)} style={{ color: f.position ? '#fff' : 'rgba(255,255,255,.35)' }}>
                  <option value="">Position</option>
                  {['Forward', 'Defense', 'Goalie'].map((p) => <option key={p} value={p} style={{ color: '#111' }}>{p}</option>)}
                </select>
              </div>
              <input className={inputCls} placeholder="Parent / guardian name *" value={f.parentName} onChange={(e) => set('parentName', e.target.value)} />
              <div className="grid grid-cols-2 gap-3">
                <input className={inputCls} type="email" placeholder="Email *" value={f.email} onChange={(e) => set('email', e.target.value)} />
                <input className={inputCls} type="tel" placeholder="Phone" value={f.phone} onChange={(e) => set('phone', e.target.value)} />
              </div>
              {error && <p className="text-[#ff6b6b] text-xs font-semibold">{error}</p>}
              <button onClick={submit} disabled={busy}
                className="w-full py-3.5 rounded-full text-sm font-black bg-gradient-to-r from-[#39ff14] to-[#00ccff] text-[#04091a] shadow-[0_0_30px_rgba(57,255,20,.35)] hover:brightness-110 transition disabled:opacity-60">
                {busy ? 'SUBMITTING…' : 'REQUEST MY INVITE'}
              </button>
              <p className="text-white/40 text-[11px] text-center">Invites are confirmed by the UHT team. Three Stars recipients only.</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function LightsOutPage() {
  const [showRegister, setShowRegister] = useState(false);
  return (
    <div className="min-h-screen bg-[#04091a] text-white overflow-hidden" style={{ fontFamily: 'ui-sans-serif, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif' }}>
      <style>{`
        @keyframes loPulse { 0%,100% { opacity: .55 } 50% { opacity: 1 } }
        @keyframes loFloat { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-10px) } }
        .lo-glow { text-shadow: 0 0 12px rgba(0,204,255,.9), 0 0 40px rgba(0,204,255,.55), 0 0 90px rgba(0,204,255,.3); }
        .lo-glow-green { text-shadow: 0 0 12px rgba(57,255,20,.9), 0 0 42px rgba(57,255,20,.45); }
        .lo-card { background: rgba(10,18,40,.75); border: 1px solid rgba(0,204,255,.22); box-shadow: 0 0 24px rgba(0,204,255,.07) inset; }
        .lo-card:hover { border-color: rgba(0,204,255,.55); box-shadow: 0 0 30px rgba(0,204,255,.18); }
      `}</style>

      {/* dark arena photo backdrop */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 bg-cover bg-center"
        style={{ backgroundImage: "url('/lights-out-arena.jpg')" }}
      />
      {/* darken + tint the photo so content stays readable and the neon pops */}
      <div aria-hidden className="pointer-events-none fixed inset-0" style={{ background: 'linear-gradient(180deg, rgba(4,9,26,.82) 0%, rgba(4,9,26,.55) 30%, rgba(4,9,26,.62) 65%, rgba(4,9,26,.9) 100%)' }} />

      {/* ambient glow blobs */}
      <div aria-hidden className="pointer-events-none fixed inset-0">
        <div className="absolute -top-32 -left-32 w-[480px] h-[480px] rounded-full" style={{ background: 'radial-gradient(circle, rgba(0,204,255,.16), transparent 65%)' }} />
        <div className="absolute top-1/3 -right-40 w-[520px] h-[520px] rounded-full" style={{ background: 'radial-gradient(circle, rgba(168,85,247,.13), transparent 65%)' }} />
        <div className="absolute bottom-0 left-1/4 w-[560px] h-[420px] rounded-full" style={{ background: 'radial-gradient(circle, rgba(57,255,20,.07), transparent 65%)' }} />
      </div>

      {/* cracked ice accents over the arena photo */}
      <svg aria-hidden className="pointer-events-none fixed inset-0 w-full h-full" viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice">
        {/* cracked ice - jagged fractures catching the neon */}
        <g fill="none" strokeLinecap="round" opacity=".55">
          <path d="M 80 780 L 190 640 L 175 560 L 300 470 L 285 400" stroke="rgba(190,235,255,.16)" strokeWidth="1.6" />
          <path d="M 190 640 L 300 625 L 365 540" stroke="rgba(190,235,255,.10)" strokeWidth="1.1" />
          <path d="M 1150 90 L 1010 200 L 1035 290 L 905 370" stroke="rgba(190,235,255,.14)" strokeWidth="1.5" />
          <path d="M 1010 200 L 905 185 L 835 255" stroke="rgba(190,235,255,.09)" strokeWidth="1" />
          <path d="M 40 150 L 160 215 L 150 310 L 255 345" stroke="rgba(0,204,255,.11)" strokeWidth="1.3" />
          <path d="M 1160 700 L 1030 630 L 1015 540 L 900 515" stroke="rgba(57,255,20,.10)" strokeWidth="1.3" />
          <path d="M 540 790 L 600 700 L 585 640" stroke="rgba(190,235,255,.10)" strokeWidth="1.1" />
          <path d="M 600 700 L 672 668 L 700 600" stroke="rgba(190,235,255,.07)" strokeWidth="1" />
        </g>
      </svg>

      <div className="relative max-w-5xl mx-auto px-5">
        {/* top bar - centered invite-only badge */}
        <div className="flex items-center justify-center pt-8 pb-2">
          <span className="text-sm sm:text-base font-black tracking-[0.35em] text-[#39ff14] border-2 border-[#39ff14]/60 rounded-full px-8 py-3 lo-glow-green" style={{ animation: 'loPulse 2.6s ease-in-out infinite' }}>INVITE ONLY</span>
        </div>

        {/* HERO */}
        <div className="text-center pt-10 pb-10">
          <p className="text-[12px] font-black tracking-[0.5em] text-[#7fd8ff] mb-2">UHT PRESENTS</p>
          <h1 className="sr-only">Lights Out Invitational</h1>
          <img
            src="/lights-out-logo.png"
            alt="UHT Lights Out Invitational"
            className="mx-auto w-[320px] sm:w-[460px] max-w-full"
            style={{ filter: 'drop-shadow(0 0 28px rgba(0,204,255,.35)) drop-shadow(0 0 60px rgba(57,255,20,.18))', animation: 'loFloat 7s ease-in-out infinite' }}
          />
          <p className="mt-4 text-[#9fd4f5] text-lg font-semibold">The first-ever glow-in-the-dark hockey tournament.</p>
          <p className="mt-2 text-white/60 text-sm font-medium tracking-wide">ST. LOUIS, MISSOURI &middot; DATES REVEALED TO INVITEES</p>
          <div className="mt-9 flex flex-col sm:flex-row items-center justify-center gap-3">
            <button onClick={() => setShowRegister(true)}
              className="px-9 py-3.5 rounded-full text-base font-black bg-gradient-to-r from-[#39ff14] to-[#00ccff] text-[#04091a] shadow-[0_0_36px_rgba(57,255,20,.45)] hover:brightness-110 transition">
              REGISTER NOW
            </button>
            <span className="text-[#7fd8ff] text-xs font-bold tracking-wider">THREE STARS WINNERS ONLY · EVERY INVITE IS VERIFIED</span>
          </div>
        </div>

        {/* THE PITCH */}
        <div className="max-w-2xl mx-auto text-center pb-14">
          <p className="text-white/80 text-[15px] leading-relaxed">
            The arena goes dark. The ice glows. Your tape leaves light trails and the puck burns neon across the blue line.
            One weekend a year, we turn hockey into something nobody has played before - and the only way in is to <b className="text-[#39ff14]">earn it</b>.
          </p>
        </div>

        {/* HOW YOU GET IN */}
        <div className="grid sm:grid-cols-3 gap-4 pb-14">
          {[
            ['EARN A STAR', 'Get named one of the Three Stars at any UHT tournament game. Every star earns an invite.', '#00ccff'],
            ['GET THE CALL', 'Invitations arrive through the UHT app and email. Family and fans welcome in the stands.', '#a855f7'],
            ['GET DRAFTED', 'No team entry needed - we build balanced teams by age and position. Show up and shine.', '#39ff14'],
          ].map(([t, d, c]) => (
            <div key={t as string} className="lo-card rounded-2xl p-5 transition-all">
              <p className="text-[11px] font-black tracking-[0.25em] mb-2" style={{ color: c as string }}>{t}</p>
              <p className="text-sm text-white/75 leading-relaxed">{d}</p>
            </div>
          ))}
        </div>

        {/* THE JERSEYS */}
        <div className="text-center pb-7">
          <h2 className="text-3xl font-black lo-glow">THE JERSEYS</h2>
          <p className="text-white/55 text-sm mt-2">Home and away glow editions, made for this event only. Every player keeps both.</p>
        </div>
        <div className="pb-16">
          <div className="rounded-3xl overflow-hidden" style={{ border: '1px solid rgba(0,204,255,.35)', boxShadow: '0 0 50px rgba(0,204,255,.18)' }}>
            <img src="/lights-out-jerseys.jpg" alt="Lights Out Invitational home and away jerseys" className="w-full block" />
          </div>
          <p className="text-center text-[11px] text-white/40 mt-3 tracking-wide">ST. LOUIS SKYLINE &middot; GATEWAY ARCH &middot; GLOW STITCHING THAT LIGHTS UP WHEN THE ARENA GOES DARK</p>
        </div>

        {/* SWAG */}
        <div className="text-center pb-7">
          <h2 className="text-3xl font-black lo-glow">EVERY PLAYER LEAVES LOADED</h2>
          <p className="text-white/55 text-sm mt-2">All of this is yours to keep - included with your invitation.</p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 pb-16">
          {SWAG.map((s, i) => (
            <SwagCard key={s.name} s={s} i={i} />
          ))}
        </div>

        {/* CLOSER */}
        <div className="lo-card rounded-3xl p-8 sm:p-10 text-center mb-16" style={{ borderColor: 'rgba(57,255,20,.3)' }}>
          <h2 className="text-2xl sm:text-3xl font-black lo-glow-green text-white">THE MOST FUN YOU WILL HAVE IN HOCKEY THIS YEAR.</h2>
          <p className="text-white/70 text-sm mt-3 max-w-xl mx-auto leading-relaxed">
            No standings grind. No seedings. Just the best moments from every UHT weekend - the kids who lit the lamp,
            stood on their head, and earned the star - together on glowing ice for one unforgettable night.
          </p>
          <p className="text-white/70 text-sm mt-4 max-w-xl mx-auto leading-relaxed">
            Want in? There is only one door: <b className="text-[#00ccff]">win a Three Star at a UHT event.</b> Every game, every tournament, three more invites are earned.
          </p>
          <div className="mt-7 flex flex-col sm:flex-row items-center justify-center gap-3">
            <button onClick={() => setShowRegister(true)}
              className="px-8 py-3 rounded-full text-sm font-black bg-gradient-to-r from-[#39ff14] to-[#00ccff] text-[#04091a] shadow-[0_0_30px_rgba(57,255,20,.4)] hover:brightness-110 transition">REGISTER NOW</button>
            <a href="/events" className="px-7 py-3 rounded-full text-sm font-black bg-gradient-to-r from-[#00ccff] to-[#0077b0] text-[#04091a] shadow-[0_0_30px_rgba(0,204,255,.4)] hover:brightness-110 transition">SEE UPCOMING UHT EVENTS</a>
            <a href="/three-stars" className="px-7 py-3 rounded-full text-sm font-bold border border-white/25 text-white/85 hover:border-[#00ccff] hover:text-white transition">MEET THE THREE STARS</a>
          </div>
        </div>

        <p className="text-center text-[11px] text-white/35 pb-10">Ultimate Hockey Tournaments &middot; Lights Out Invitational &middot; St. Louis, MO</p>
      </div>

      {showRegister && <RegisterModal onClose={() => setShowRegister(false)} />}
    </div>
  );
}
