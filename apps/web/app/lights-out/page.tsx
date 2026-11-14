'use client';

/*
  LIGHTS OUT INVITATIONAL - custom landing page for the invite-only
  glow-in-the-dark tournament. Dark navy + neon treatment is deliberate
  here: the page IS the event. Invitations go to Three Stars recipients.
*/

/* eslint-disable react/no-unescaped-entities */

import { useEffect, useState } from 'react';
import { Oswald, Rajdhani } from 'next/font/google';

// Oswald matches the homepage hero headline; Rajdhani carries the techy
// arena-signage accents (badges, buttons, card titles)
const oswald = Oswald({ subsets: ['latin'], weight: ['700'] });
const rajdhani = Rajdhani({ subsets: ['latin'], weight: ['500', '600', '700'] });

const API = 'https://uht.chad-157.workers.dev/api/lights-out';

const SWAG: { name: string; desc: string; icon: string; img?: string }[] = [
  { name: 'Two Custom Jerseys', desc: 'Home and away glow-edition jerseys, made for this event only. Keep both.', icon: 'M16 3l2 3h3v6l-2 1v8H5v-8l-2-1V6h3l2-3h8z', img: '/lights-out-jerseys.jpg?v=2' },
  { name: 'Custom Hockey Stick Collectible', desc: 'A Lights Out edition collector stick with the Arch on the blade. Made once, never again.', icon: 'M4 17l6-6 4 4 6-6M4 7h4v4', img: '/lights-out-stick.jpg' },
  { name: 'Custom Glow UHT Puck', desc: 'A collector glow-in-the-dark UHT puck. Nobody else can get one.', icon: 'M12 12m-8 0a8 3.5 0 1 0 16 0a8 3.5 0 1 0 -16 0', img: '/lights-out-puck.jpg' },
  { name: 'Glow T-Shirt', desc: 'A custom glow tee for every player. Lights off, logo on.', icon: 'M8 4l4 2 4-2 4 4-3 3v9H7v-9L4 8l4-4z', img: '/lights-out-tee.jpg' },
  { name: 'UHT Duffle Bag', desc: 'A full-size UHT duffle bag to haul it all home in.', icon: 'M3 9h18v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9zm5 0V7a4 4 0 018 0v2', img: '/lights-out-duffle.jpg' },
  { name: 'Custom Trading Cards', desc: 'Your own player trading card - name, number, and photo, printed like the pros.', icon: 'M7 5h10a2 2 0 012 2v12a2 2 0 01-2 2H7a2 2 0 01-2-2V7a2 2 0 012-2zm2-2h8M9 10h6M9 13h6M9 16h4', img: '/lights-out-cards.jpg' },
  { name: 'Trading Card Booklet', desc: 'A collector booklet to hold every card from the event - trade your way to the full set.', icon: 'M4 5a2 2 0 012-2h6v18H6a2 2 0 01-2-2V5zm8-2h6a2 2 0 012 2v14a2 2 0 01-2 2h-6M12 3v18', img: '/lights-out-booklet.jpg' },
  { name: 'Custom Lights Out Ring', desc: 'A heavyweight custom ring made only for this event. Wear the night forever.', icon: 'M12 14m-6 0a6 6 0 1 0 12 0a6 6 0 1 0 -12 0M9 8l3-5 3 5', img: '/lights-out-ring.jpg' },
  { name: 'And We Are Not Done', desc: 'More exclusive swag is being added. Invitees find out first.', icon: 'M12 3v18M3 12h18' },
];

// Swag card: shows the real product photo once it exists in /public, falls
// back to the icon-only card meanwhile. Static export + hydration means a
// plain <img onError> can fire before React attaches the handler, so probe
// the image from an effect instead.
function SwagCard({ s, i, onOpen }: { s: { name: string; desc: string; icon: string; img?: string }; i: number; onOpen?: (src: string, title: string) => void }) {
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
        <button type="button" className="relative block w-full cursor-zoom-in" onClick={() => onOpen && onOpen(s.img as string, s.name)} aria-label={`View ${s.name} full size`}>
          <img src={s.img} alt={s.name} loading="lazy" className="w-full h-44 object-cover" />
          <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, transparent 55%, rgba(10,18,40,.92) 100%)' }} />
        </button>
      )}
      <div className="p-5 flex-1">
        {!(imgOk && s.img) && (
          <div className="w-11 h-11 rounded-xl flex items-center justify-center mb-3" style={{ background: 'rgba(0,204,255,.12)', border: '1px solid rgba(0,204,255,.3)' }}>
            <svg className="w-6 h-6 text-[#00ccff]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d={s.icon} /></svg>
          </div>
        )}
        <p className={`${rajdhani.className} text-lg font-bold tracking-[0.08em] text-white uppercase`}>{s.name}</p>
        <p className="text-[13px] text-white/60 mt-1 leading-relaxed">{s.desc}</p>
      </div>
    </div>
  );
}

// Full-screen product viewer - click any swag photo to blow it up
function Lightbox({ src, title, onClose }: { src: string; title: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[3200] flex flex-col items-center justify-center p-4 sm:p-8" style={{ background: 'rgba(2,5,14,.93)' }} onClick={onClose}>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute top-4 right-4 w-11 h-11 rounded-full flex items-center justify-center text-white/90 hover:text-white transition z-[3300]"
        style={{ background: 'rgba(10,18,40,.9)', border: '1px solid rgba(0,204,255,.45)', boxShadow: '0 0 24px rgba(0,204,255,.25)' }}
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.4}><path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" /></svg>
      </button>
      <img
        src={src}
        alt={title}
        className="max-w-full max-h-[82vh] object-contain rounded-2xl"
        style={{ border: '1px solid rgba(0,204,255,.35)', boxShadow: '0 0 70px rgba(0,204,255,.25)' }}
        onClick={(e) => e.stopPropagation()}
      />
      <p className={`${rajdhani.className} mt-4 text-lg font-bold tracking-[0.25em] text-[#7fd8ff] text-center uppercase`}>{title}</p>
    </div>
  );
}

// For families WITHOUT a star: no payment, just a reviewed request. First
// spots always go to Three Stars winners - the form says so plainly.
function RequestInviteModal({ onClose }: { onClose: () => void }) {
  const [f, setF] = useState({ playerName: '', teamName: '', birthYear: '', position: '', parentName: '', email: '', phone: '', reason: '' });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const set = (k: string, v: string) => setF(prev => ({ ...prev, [k]: v }));
  const inputCls = 'w-full rounded-xl px-4 py-2.5 text-sm text-white bg-[#0a1228] border border-[#1d3a56] focus:border-[#00ccff] focus:outline-none placeholder:text-white/30';

  const submit = async () => {
    setError('');
    if (!f.playerName.trim() || !f.teamName.trim() || !f.parentName.trim() || !/^\S+@\S+\.\S+$/.test(f.email)) {
      setError('Please fill in the player, team, parent name, and a valid email.');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`${API}/request-invite`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...f, playerName: f.playerName.trim(), teamName: f.teamName.trim(), parentName: f.parentName.trim(), email: f.email.trim() }),
      });
      const j = await res.json();
      if (j.success) { setDone(true); setBusy(false); return; }
      setError(typeof j.error === 'string' ? j.error : 'Something went wrong - please try again.');
    } catch {
      setError('Something went wrong - please try again.');
    }
    setBusy(false);
  };

  return (
    <div className="fixed inset-0 z-[3000] flex items-center justify-center p-4" style={{ background: 'rgba(2,5,14,.86)' }} onClick={onClose}>
      <div className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-3xl p-6 sm:p-8" style={{ background: '#070d20', border: '1px solid rgba(0,204,255,.4)', boxShadow: '0 0 60px rgba(0,204,255,.25)' }} onClick={(e) => e.stopPropagation()}>
        <button type="button" onClick={onClose} aria-label="Close"
          className="absolute top-3.5 right-3.5 w-10 h-10 rounded-full flex items-center justify-center text-white/80 hover:text-white transition z-10"
          style={{ background: 'rgba(10,18,40,.9)', border: '1px solid rgba(0,204,255,.4)' }}>
          <svg style={{ width: 18, height: 18 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.4}><path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
        {done ? (
          <div className="text-center py-6">
            <p className="text-[12px] font-black tracking-[0.35em] text-[#39ff14] lo-glow-green mb-4">REQUEST RECEIVED</p>
            <p className="text-white text-xl font-black mb-3">You're on the list.</p>
            <p className="text-white/70 text-sm leading-relaxed mb-6">First spots go to Three Stars winners - but if spots open up, requests are the first place we look. We'll email you either way. Fastest way in: earn a star at any UHT event this season.</p>
            <button onClick={onClose} className="px-7 py-3 rounded-full text-sm font-black bg-gradient-to-r from-[#00ccff] to-[#0077b0] text-[#04091a]">DONE</button>
          </div>
        ) : (
          <>
            <p className={`${rajdhani.className} text-sm font-semibold tracking-[0.35em] text-[#00ccff] mb-1`}>NO STAR YET?</p>
            <h3 className={`${rajdhani.className} text-3xl font-bold tracking-[0.08em] text-white lo-glow mb-1`}>REQUEST AN INVITE</h3>
            <p className="text-white/60 text-[13px] leading-relaxed mb-1.5">Think your player belongs on glowing ice? Tell us who they are and why.</p>
            <p className={`${rajdhani.className} text-[#ffb84d]/85 text-sm font-semibold tracking-[0.1em] mb-4`}>REQUESTING DOES NOT MEAN APPROVAL - THIS IS A VERY LIMITED EVENT AND FIRST SPOTS GO TO OUR THREE STARS WINNERS</p>
            <div className="space-y-3">
              <input className={inputCls} placeholder="Player full name *" value={f.playerName} onChange={(e) => set('playerName', e.target.value)} />
              <input className={inputCls} placeholder="Team name *" value={f.teamName} onChange={(e) => set('teamName', e.target.value)} />
              <div className="grid grid-cols-2 gap-3">
                <input className={inputCls} placeholder="Birth year" value={f.birthYear} onChange={(e) => set('birthYear', e.target.value)} />
                <select className={inputCls} value={f.position} onChange={(e) => set('position', e.target.value)} style={{ color: f.position ? '#fff' : 'rgba(255,255,255,.35)' }}>
                  <option value="" style={{ color: '#6e6e73', backgroundColor: '#fff' }}>Position</option>
                  {['Forward', 'Defense', 'Goalie'].map((p) => <option key={p} value={p} style={{ color: '#111', backgroundColor: '#fff' }}>{p}</option>)}
                </select>
              </div>
              <input className={inputCls} placeholder="Parent / guardian name *" value={f.parentName} onChange={(e) => set('parentName', e.target.value)} />
              <div className="grid grid-cols-2 gap-3">
                <input className={inputCls} type="email" placeholder="Email *" value={f.email} onChange={(e) => set('email', e.target.value)} />
                <input className={inputCls} placeholder="Phone" value={f.phone} onChange={(e) => set('phone', e.target.value)} />
              </div>
              <textarea className={`${inputCls} min-h-[80px]`} placeholder="Why should your player be considered?" value={f.reason} onChange={(e) => set('reason', e.target.value)} />
              {error && <p className="text-[#ff6b81] text-xs">{error}</p>}
              <button onClick={submit} disabled={busy}
                className={`${rajdhani.className} w-full py-3.5 rounded-full text-base font-bold tracking-[0.12em] bg-gradient-to-r from-[#00ccff] to-[#0077b0] text-[#04091a] hover:brightness-110 transition disabled:opacity-50`}>
                {busy ? 'SENDING…' : 'SUBMIT REQUEST'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function RegisterModal({ onClose }: { onClose: () => void }) {
  const [events, setEvents] = useState<any[]>([]);
  const [f, setF] = useState({ playerName: '', jerseyNumber: '', teamName: '', starEventId: '', inviteCode: '', birthYear: '', position: '', parentName: '', email: '', phone: '', payType: 'full' });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`${API}/events`).then(r => r.json()).then(j => { if (j.success) setEvents(j.data || []); }).catch(() => {});
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const set = (k: string, v: string) => setF(prev => ({ ...prev, [k]: v }));
  const inputCls = 'w-full rounded-xl px-4 py-2.5 text-sm text-white bg-[#0a1228] border border-[#1d3a56] focus:border-[#00ccff] focus:outline-none placeholder:text-white/30';

  const submit = async () => {
    setError('');
    const usingCode = f.starEventId === '__code';
    if (!f.playerName.trim() || !f.teamName.trim() || !f.parentName.trim() || !/^\S+@\S+\.\S+$/.test(f.email)
      || (!usingCode && !f.starEventId) || (usingCode && f.inviteCode.trim().length < 4)) {
      setError(usingCode
        ? 'Please fill in the player, team, parent name, a valid email, and your invite code.'
        : 'Please fill in the player, team, event, parent name, and a valid email.');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`${API}/register`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...f,
          starEventId: f.starEventId === '__code' ? undefined : f.starEventId,
          inviteCode: f.starEventId === '__code' ? f.inviteCode.trim().toUpperCase() : undefined,
          playerName: f.playerName.trim(), teamName: f.teamName.trim(), parentName: f.parentName.trim(), email: f.email.trim(),
        }),
      });
      const j = await res.json();
      if (j.success && j.data?.checkoutUrl) {
        window.location.href = j.data.checkoutUrl; // off to Stripe - $550 per player
        return;
      }
      setError(typeof j.error === 'string' ? j.error : 'Something went wrong - please try again.');
    } catch {
      setError('Something went wrong - please try again.');
    }
    setBusy(false);
  };

  return (
    <div className="fixed inset-0 z-[3000] flex items-center justify-center p-4" style={{ background: 'rgba(2,5,14,.86)' }} onClick={onClose}>
      <div className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-3xl p-6 sm:p-8" style={{ background: '#070d20', border: '1px solid rgba(0,204,255,.4)', boxShadow: '0 0 60px rgba(0,204,255,.25)' }} onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-3.5 right-3.5 w-10 h-10 rounded-full flex items-center justify-center text-white/80 hover:text-white transition z-10"
          style={{ background: 'rgba(10,18,40,.9)', border: '1px solid rgba(0,204,255,.4)' }}
        >
          <svg className="w-4.5 h-4.5" style={{ width: 18, height: 18 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.4}><path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
        {done ? (
          <div className="text-center py-6">
            <p className="text-[12px] font-black tracking-[0.35em] text-[#39ff14] lo-glow-green mb-4">REQUEST RECEIVED</p>
            <p className="text-white text-xl font-black mb-3">We're confirming the star.</p>
            <p className="text-white/70 text-sm leading-relaxed mb-6">Every invite is verified against the official scoresheets. You'll get an email the moment {f.playerName.split(' ')[0] || 'your player'}'s spot is confirmed.</p>
            <button onClick={onClose} className="px-7 py-3 rounded-full text-sm font-black bg-gradient-to-r from-[#00ccff] to-[#0077b0] text-[#04091a]">DONE</button>
          </div>
        ) : (
          <>
            <p className={`${rajdhani.className} text-sm font-semibold tracking-[0.35em] text-[#39ff14] mb-1`}>INVITE REQUEST</p>
            <h3 className={`${rajdhani.className} text-3xl font-bold tracking-[0.08em] text-white lo-glow mb-1`}>CLAIM YOUR SPOT</h3>
            <p className="text-white/60 text-[13px] leading-relaxed mb-1.5">Tell us where your player earned their Three Star. We verify every registration against the official scoresheets before the invite is confirmed.</p>
            <p className={`${rajdhani.className} text-[#39ff14] text-base font-bold tracking-[0.08em] mb-1`}>$550 PER PLAYER (OR $200 DEPOSIT) &middot; ALL SWAG INCLUDED</p>
            <p className={`${rajdhani.className} text-[#ffb84d]/85 text-sm font-semibold tracking-[0.12em] mb-4`}>EXTREMELY LIMITED EVENT &middot; A $200 DEPOSIT HOLDS YOUR SPOT</p>
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <input className={`${inputCls} col-span-2`} placeholder="Player full name *" value={f.playerName} onChange={(e) => set('playerName', e.target.value)} />
                <input className={inputCls} placeholder="Jersey #" value={f.jerseyNumber} onChange={(e) => set('jerseyNumber', e.target.value)} />
              </div>
              <input className={inputCls} placeholder="Team name *" value={f.teamName} onChange={(e) => set('teamName', e.target.value)} />
              <select className={inputCls} value={f.starEventId} onChange={(e) => set('starEventId', e.target.value)} style={{ color: f.starEventId ? '#fff' : 'rgba(255,255,255,.35)' }}>
                <option value="" style={{ color: '#6e6e73', backgroundColor: '#fff' }}>Event where the star was earned *</option>
                {events.map((ev) => <option key={ev.id} value={ev.id} style={{ color: '#111', backgroundColor: '#fff' }}>{ev.name}</option>)}
                <option value="__code" style={{ color: '#111', backgroundColor: '#fff' }}>I have an invite code</option>
              </select>
              {f.starEventId === '__code' && (
                <input className={inputCls} placeholder="Invite code (from your approval email) *" value={f.inviteCode}
                  onChange={(e) => set('inviteCode', e.target.value.toUpperCase())} style={{ letterSpacing: '2px' }} />
              )}
              <div className="grid grid-cols-2 gap-3">
                <input className={inputCls} placeholder="Birth year" value={f.birthYear} onChange={(e) => set('birthYear', e.target.value)} />
                <select className={inputCls} value={f.position} onChange={(e) => set('position', e.target.value)} style={{ color: f.position ? '#fff' : 'rgba(255,255,255,.35)' }}>
                  <option value="" style={{ color: '#6e6e73', backgroundColor: '#fff' }}>Position</option>
                  {['Forward', 'Defense', 'Goalie'].map((p) => <option key={p} value={p} style={{ color: '#111', backgroundColor: '#fff' }}>{p}</option>)}
                </select>
              </div>
              <input className={inputCls} placeholder="Parent / guardian name *" value={f.parentName} onChange={(e) => set('parentName', e.target.value)} />
              <div className="grid grid-cols-2 gap-3">
                <input className={inputCls} type="email" placeholder="Email *" value={f.email} onChange={(e) => set('email', e.target.value)} />
                <input className={inputCls} type="tel" placeholder="Phone" value={f.phone} onChange={(e) => set('phone', e.target.value)} />
              </div>
              {/* payment plan stepper */}
              <div className="grid grid-cols-2 gap-3 pt-1">
                {[
                  ['full', 'PAY IN FULL', '$550', 'Everything locked in today'],
                  ['deposit', 'DEPOSIT', '$200', 'Non-refundable · $350 due before the event'],
                ].map(([val, label, price, sub]) => (
                  <button key={val} type="button" onClick={() => set('payType', val)}
                    className="rounded-2xl px-4 py-3.5 text-left transition-all"
                    style={f.payType === val
                      ? { background: 'rgba(57,255,20,.1)', border: '2px solid rgba(57,255,20,.7)', boxShadow: '0 0 22px rgba(57,255,20,.2)' }
                      : { background: 'rgba(10,18,40,.6)', border: '2px solid rgba(29,58,86,.9)' }}>
                    <span className={`${rajdhani.className} block text-sm font-bold tracking-[0.15em] ${f.payType === val ? 'text-[#39ff14]' : 'text-white/60'}`}>{label}</span>
                    <span className={`${rajdhani.className} block text-2xl font-bold ${f.payType === val ? 'text-white' : 'text-white/70'}`}>{price}</span>
                    <span className="block text-[11px] leading-snug mt-0.5 text-white/45">{sub}</span>
                  </button>
                ))}
              </div>
              {error && <p className="text-[#ff6b6b] text-xs font-semibold">{error}</p>}
              <button onClick={submit} disabled={busy}
                className="w-full py-3.5 rounded-full text-sm font-black bg-gradient-to-r from-[#39ff14] to-[#00ccff] text-[#04091a] shadow-[0_0_30px_rgba(57,255,20,.35)] hover:brightness-110 transition disabled:opacity-60">
                {busy ? 'STARTING CHECKOUT…' : f.payType === 'deposit' ? 'REGISTER + PAY $200 DEPOSIT' : 'REGISTER + PAY $550'}
              </button>
              <p className="text-white/40 text-[11px] text-center">Secure payment by Stripe. Invites are confirmed by the UHT team - Three Stars recipients only.</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function LightsOutPage() {
  const [showRegister, setShowRegister] = useState(false);
  const [showRequest, setShowRequest] = useState(false);
  const [lightbox, setLightbox] = useState<{ src: string; title: string } | null>(null);
  const [paidState, setPaidState] = useState<null | 'verifying' | 'paid' | 'failed'>(null);

  // Back from Stripe: confirm the session actually paid, then celebrate
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const reg = q.get('reg');
    const sid = q.get('session_id');
    if (!reg || !sid) return;
    window.history.replaceState({}, '', '/lights-out/');
    setPaidState('verifying');
    fetch(`${API}/register/${encodeURIComponent(reg)}/verify?session_id=${encodeURIComponent(sid)}`)
      .then(r => r.json())
      .then(j => setPaidState(j.success ? 'paid' : 'failed'))
      .catch(() => setPaidState('failed'));
  }, []);
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
        {/* HERO - homepage-style split: big type left, logo right */}
        <div className="grid lg:grid-cols-[1.05fr_0.95fr] items-center gap-10 lg:gap-6 pt-14 pb-16 min-h-[72vh]">
          <div className="text-center lg:text-left order-2 lg:order-1">
            {/* badge */}
            <div className="inline-flex items-center gap-2.5 px-5 py-2 rounded-full bg-white/5 backdrop-blur-sm border border-[#39ff14]/40 mb-7" style={{ animation: 'loPulse 2.6s ease-in-out infinite' }}>
              <span className="w-2 h-2 rounded-full bg-[#39ff14]" />
              <span className={`${rajdhani.className} text-sm font-bold tracking-[0.35em] pl-[0.35em] text-[#39ff14]`}>INVITE ONLY</span>
            </div>

            <p className={`${rajdhani.className} text-sm font-semibold tracking-[0.5em] text-[#7fd8ff]/70 mb-3`}>UHT PRESENTS</p>
            <h1 className={`${oswald.className} text-6xl sm:text-7xl lg:text-[86px] font-bold uppercase tracking-tight leading-[0.95] text-white`}>
              <span className="bg-gradient-to-r from-[#39ff14] via-[#8aff5e] to-[#d9ffc4] bg-clip-text text-transparent">LIGHTS OUT</span>
              <br />
              INVITATIONAL
            </h1>

            <p className="mt-6 text-lg sm:text-xl text-white/60 leading-relaxed max-w-xl mx-auto lg:mx-0">
              The first-ever glow-in-the-dark hockey tournament. The arena goes dark, the ice glows, and only the ones who earned a star get to play.
            </p>
            <p className={`${rajdhani.className} mt-3 text-[#7fd8ff]/70 text-base font-medium tracking-[0.3em]`}>ST. LOUIS, MO &middot; <span className="text-[#39ff14]">JUNE 11-13, 2027</span></p>

            <div className="mt-9 flex flex-col sm:flex-row items-center lg:justify-start justify-center gap-4 flex-wrap">
              <button onClick={() => setShowRegister(true)}
                className={`${rajdhani.className} group px-10 py-4 rounded-full text-lg font-bold tracking-[0.12em] bg-gradient-to-r from-[#39ff14] to-[#00ccff] text-[#04091a] shadow-[0_0_40px_rgba(57,255,20,.4)] hover:brightness-110 active:scale-[0.98] transition-all`}>
                REGISTER NOW
                <svg className="inline-block w-5 h-5 ml-2 -mt-0.5 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
              </button>
              <a href="/three-stars" className={`${rajdhani.className} px-8 py-4 rounded-full text-lg font-semibold tracking-[0.12em] bg-white/5 backdrop-blur-sm text-white/85 border border-white/20 hover:bg-white/10 hover:border-[#00ccff]/50 transition-all`}>
                MEET THE THREE STARS
              </a>
            </div>
            <p className={`${rajdhani.className} mt-5 text-[#7fd8ff]/55 text-sm font-medium tracking-[0.25em]`}>$550 PER PLAYER &middot; THREE STARS WINNERS ONLY &middot; EVERY INVITE IS VERIFIED</p>
            <p className={`${rajdhani.className} mt-2 text-[#ffb84d]/80 text-sm font-semibold tracking-[0.25em]`}>EXTREMELY LIMITED EVENT &middot; A $200 DEPOSIT HOLDS YOUR SPOT</p>
          </div>

          <div className="order-1 lg:order-2 flex justify-center">
            <img
              src="/lights-out-logo.png"
              alt="UHT Lights Out Invitational"
              className="w-[280px] sm:w-[360px] lg:w-[470px] max-w-full"
              style={{ filter: 'drop-shadow(0 0 28px rgba(0,204,255,.35)) drop-shadow(0 0 60px rgba(57,255,20,.18))', animation: 'loFloat 7s ease-in-out infinite' }}
            />
          </div>
        </div>

        {/* THE PITCH */}
        <div className="max-w-xl mx-auto text-center pb-14">
          <p className="text-white/70 text-base leading-[1.8]">
            The arena goes dark. The ice glows. Your tape leaves light trails and the puck burns neon across the blue line.
            One weekend a year, we turn hockey into something nobody has played before - and the only way in is to <b className="text-[#39ff14] font-semibold">earn it</b>.
          </p>
        </div>

        {/* HOW YOU GET IN */}
        <div className="grid sm:grid-cols-3 gap-4 pb-16">
          {[
            ['1', 'EARN A STAR', 'Get named one of the Three Stars at any UHT tournament game. Every star earns an invite.', '#00ccff'],
            ['2', 'GET THE CALL', 'Invitations arrive through the UHT app and email. Family and fans welcome in the stands.', '#a855f7'],
            ['3', 'GET DRAFTED', 'No team entry needed - we build balanced teams by age and position. Show up and shine.', '#39ff14'],
          ].map(([n, t, d, c]) => (
            <div key={t as string} className="lo-card rounded-2xl p-6 transition-all">
              <div className="flex items-center gap-3 mb-3">
                <span className={`${rajdhani.className} w-8 h-8 rounded-full flex items-center justify-center text-base font-bold shrink-0`} style={{ color: c as string, border: `1.5px solid ${c}66`, background: `${c}14` }}>{n}</span>
                <p className={`${rajdhani.className} text-lg font-bold tracking-[0.18em]`} style={{ color: c as string }}>{t}</p>
              </div>
              <p className="text-sm text-white/70 leading-relaxed">{d}</p>
            </div>
          ))}
        </div>

        {/* THE JERSEYS */}
        <div className="text-center pb-7">
          <h2 className={`${rajdhani.className} text-4xl font-bold tracking-[0.12em] lo-glow`}>THE JERSEYS</h2>
          <p className="text-white/55 text-sm mt-2">Home and away glow editions, made for this event only. Every player keeps both.</p>
        </div>
        <div className="pb-16">
          <button type="button" className="block w-full rounded-3xl overflow-hidden cursor-zoom-in" style={{ border: '1px solid rgba(0,204,255,.35)', boxShadow: '0 0 50px rgba(0,204,255,.18)' }}
            onClick={() => setLightbox({ src: '/lights-out-jerseys.jpg?v=2', title: 'Home and Away Jerseys' })} aria-label="View jerseys full size">
            <img src="/lights-out-jerseys.jpg?v=2" alt="Lights Out Invitational home and away jerseys" className="w-full block" />
          </button>
          <p className="text-center text-[11px] text-white/40 mt-3 tracking-wide">ST. LOUIS SKYLINE &middot; GATEWAY ARCH &middot; GLOW STITCHING THAT LIGHTS UP WHEN THE ARENA GOES DARK</p>
        </div>

        {/* SWAG */}
        <div className="text-center pb-7">
          <h2 className={`${rajdhani.className} text-4xl font-bold tracking-[0.12em] lo-glow`}>EVERY PLAYER LEAVES LOADED</h2>
          <p className="text-white/55 text-sm mt-2">All of this is yours to keep - included with your invitation.</p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 pb-16">
          {SWAG.map((s, i) => (
            <SwagCard key={s.name} s={s} i={i} onOpen={(src, title) => setLightbox({ src, title })} />
          ))}
        </div>

        {/* CLOSER */}
        <div className="lo-card rounded-3xl p-8 sm:p-10 text-center mb-16" style={{ borderColor: 'rgba(57,255,20,.3)' }}>
          <h2 className={`${rajdhani.className} text-3xl sm:text-4xl font-bold tracking-[0.08em] lo-glow-green text-white`}>THE MOST FUN YOU WILL HAVE IN HOCKEY THIS YEAR.</h2>
          <p className="text-white/70 text-sm mt-3 max-w-xl mx-auto leading-relaxed">
            No standings grind. No seedings. Just the best moments from every UHT weekend - the kids who lit the lamp,
            stood on their head, and earned the star - together on glowing ice for one unforgettable night.
          </p>
          <p className="text-white/70 text-sm mt-4 max-w-xl mx-auto leading-relaxed">
            Want in? There is only one door: <b className="text-[#00ccff]">win a Three Star at a UHT event.</b> Every game, every tournament, three more invites are earned.
          </p>
          <p className="text-white/70 text-sm mt-4 max-w-xl mx-auto leading-relaxed">
            No star yet but think your player belongs on glowing ice? You can <b className="text-[#39ff14]">request an invite</b> below. Requesting does not mean approval - this is a very limited event and first spots go to our Three Stars winners - but if spots open up, requests are the first place we look.
          </p>
          <div className={`${rajdhani.className} mt-7 flex flex-col sm:flex-row items-center justify-center gap-3`}>
            <button onClick={() => setShowRegister(true)}
              className="px-9 py-3 rounded-full text-base font-bold tracking-[0.12em] bg-gradient-to-r from-[#39ff14] to-[#00ccff] text-[#04091a] shadow-[0_0_30px_rgba(57,255,20,.4)] hover:brightness-110 transition">REGISTER NOW</button>
            <a href="/events" className="px-8 py-3 rounded-full text-base font-bold tracking-[0.12em] bg-gradient-to-r from-[#00ccff] to-[#0077b0] text-[#04091a] shadow-[0_0_30px_rgba(0,204,255,.4)] hover:brightness-110 transition">SEE UPCOMING UHT EVENTS</a>
            <button onClick={() => setShowRequest(true)}
              className="px-8 py-3 rounded-full text-base font-semibold tracking-[0.12em] border border-[#39ff14]/50 text-[#39ff14] hover:bg-[#39ff14]/10 transition">REQUEST AN INVITE</button>
            <a href="/three-stars" className="px-8 py-3 rounded-full text-base font-semibold tracking-[0.12em] border border-white/25 text-white/85 hover:border-[#00ccff] hover:text-white transition">MEET THE THREE STARS</a>
          </div>
        </div>

        <p className="text-center text-[11px] text-white/35 pb-10">Ultimate Hockey Tournaments &middot; Lights Out Invitational &middot; St. Louis, MO</p>
      </div>

      {showRegister && <RegisterModal onClose={() => setShowRegister(false)} />}
      {showRequest && <RequestInviteModal onClose={() => setShowRequest(false)} />}
      {lightbox && <Lightbox src={lightbox.src} title={lightbox.title} onClose={() => setLightbox(null)} />}
      {paidState && (
        <div className="fixed inset-0 z-[3400] flex items-center justify-center p-4" style={{ background: 'rgba(2,5,14,.9)' }} onClick={() => paidState !== 'verifying' && setPaidState(null)}>
          <div className="w-full max-w-md rounded-3xl p-8 text-center" style={{ background: '#070d20', border: '1px solid rgba(57,255,20,.45)', boxShadow: '0 0 60px rgba(57,255,20,.2)' }} onClick={(e) => e.stopPropagation()}>
            {paidState === 'verifying' ? (
              <>
                <p className={`${rajdhani.className} text-lg font-bold tracking-[0.2em] text-[#7fd8ff]`}>CONFIRMING PAYMENT…</p>
                <p className="text-white/60 text-sm mt-3">One second while we check with Stripe.</p>
              </>
            ) : paidState === 'paid' ? (
              <>
                <p className={`${rajdhani.className} text-sm font-semibold tracking-[0.35em] text-[#39ff14] lo-glow-green mb-3`}>PAYMENT RECEIVED</p>
                <p className={`${rajdhani.className} text-3xl font-bold text-white mb-3`}>YOU'RE ALMOST IN.</p>
                <p className="text-white/70 text-sm leading-relaxed mb-6">Registration and payment are locked in. We're verifying the Three Star against the official scoresheets - the final invite confirmation hits your inbox shortly.</p>
                <button onClick={() => setPaidState(null)} className={`${rajdhani.className} px-8 py-3 rounded-full text-base font-bold tracking-[0.12em] bg-gradient-to-r from-[#39ff14] to-[#00ccff] text-[#04091a]`}>LIGHTS OUT</button>
              </>
            ) : (
              <>
                <p className={`${rajdhani.className} text-lg font-bold tracking-[0.2em] text-[#ff6b6b] mb-3`}>PAYMENT NOT CONFIRMED</p>
                <p className="text-white/70 text-sm leading-relaxed mb-6">We couldn't confirm the payment. If your card was charged, email us and we'll sort it out right away - otherwise try registering again.</p>
                <button onClick={() => setPaidState(null)} className={`${rajdhani.className} px-8 py-3 rounded-full text-base font-bold tracking-[0.12em] border border-white/25 text-white`}>CLOSE</button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
