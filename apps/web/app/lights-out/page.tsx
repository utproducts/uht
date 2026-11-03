'use client';

/*
  LIGHTS OUT INVITATIONAL - custom landing page for the invite-only
  glow-in-the-dark tournament. Dark navy + neon treatment is deliberate
  here: the page IS the event. Invitations go to Three Stars recipients.
*/

/* eslint-disable react/no-unescaped-entities */

const SWAG: { name: string; desc: string; icon: string }[] = [
  { name: 'Two Custom Jerseys', desc: 'Home and away glow-edition jerseys, made for this event only. Keep both.', icon: 'M16 3l2 3h3v6l-2 1v8H5v-8l-2-1V6h3l2-3h8z' },
  { name: 'Glow Stick Tape', desc: 'Glow-in-the-dark tape. Your blade becomes a light streak on every shot.', icon: 'M4 17l6-6 4 4 6-6M4 7h4v4' },
  { name: 'Custom Glow UHT Puck', desc: 'A collector glow-in-the-dark UHT puck. Nobody else can get one.', icon: 'M12 12m-8 0a8 3.5 0 1 0 16 0a8 3.5 0 1 0 -16 0' },
  { name: 'Glow T-Shirt', desc: 'A custom glow tee for every player. Lights off, logo on.', icon: 'M8 4l4 2 4-2 4 4-3 3v9H7v-9L4 8l4-4z' },
  { name: 'UHT Hockey Bag', desc: 'A full-size UHT hockey bag to haul it all home in.', icon: 'M3 9h18v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9zm5 0V7a4 4 0 018 0v2' },
  { name: 'And We Are Not Done', desc: 'More exclusive swag is being added. Invitees find out first.', icon: 'M12 3v18M3 12h18' },
];

export default function LightsOutPage() {
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

      {/* ambient glow blobs */}
      <div aria-hidden className="pointer-events-none fixed inset-0">
        <div className="absolute -top-32 -left-32 w-[480px] h-[480px] rounded-full" style={{ background: 'radial-gradient(circle, rgba(0,204,255,.16), transparent 65%)' }} />
        <div className="absolute top-1/3 -right-40 w-[520px] h-[520px] rounded-full" style={{ background: 'radial-gradient(circle, rgba(168,85,247,.13), transparent 65%)' }} />
        <div className="absolute bottom-0 left-1/4 w-[560px] h-[420px] rounded-full" style={{ background: 'radial-gradient(circle, rgba(57,255,20,.07), transparent 65%)' }} />
      </div>

      <div className="relative max-w-5xl mx-auto px-5">
        {/* top bar */}
        <div className="flex items-center justify-between py-5">
          <a href="/" className="flex items-center gap-2.5">
            <img src="/uht-logo.png" alt="UHT" className="w-10 h-10" />
            <span className="text-sm font-bold text-white/70">Ultimate Hockey Tournaments</span>
          </a>
          <span className="text-[11px] font-black tracking-[0.25em] text-[#39ff14] border border-[#39ff14]/50 rounded-full px-4 py-1.5 lo-glow-green" style={{ animation: 'loPulse 2.6s ease-in-out infinite' }}>INVITE ONLY</span>
        </div>

        {/* HERO */}
        <div className="text-center pt-14 pb-10">
          <p className="text-[12px] font-black tracking-[0.5em] text-[#7fd8ff] mb-5">UHT PRESENTS</p>
          <h1 className="text-5xl sm:text-7xl font-black leading-[0.95] lo-glow text-white">LIGHTS OUT<br />INVITATIONAL</h1>
          <p className="mt-6 text-[#9fd4f5] text-lg font-semibold">The first-ever glow-in-the-dark hockey tournament.</p>
          <p className="mt-2 text-white/60 text-sm font-medium tracking-wide">ST. LOUIS, MISSOURI &middot; DATES REVEALED TO INVITEES</p>
          <div className="mt-9 flex flex-col sm:flex-row items-center justify-center gap-3">
            <span className="px-6 py-3 rounded-full text-sm font-black bg-gradient-to-r from-[#00ccff] to-[#0077b0] text-[#04091a] shadow-[0_0_30px_rgba(0,204,255,.45)]">
              INVITATIONS GO TO THREE STARS WINNERS
            </span>
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

        {/* SWAG */}
        <div className="text-center pb-7">
          <h2 className="text-3xl font-black lo-glow">EVERY PLAYER LEAVES LOADED</h2>
          <p className="text-white/55 text-sm mt-2">All of this is yours to keep - included with your invitation.</p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 pb-16">
          {SWAG.map((s, i) => (
            <div key={s.name} className="lo-card rounded-2xl p-5 transition-all" style={{ animation: `loFloat ${5 + (i % 3)}s ease-in-out infinite` }}>
              <div className="w-11 h-11 rounded-xl flex items-center justify-center mb-3" style={{ background: 'rgba(0,204,255,.12)', border: '1px solid rgba(0,204,255,.3)' }}>
                <svg className="w-6 h-6 text-[#00ccff]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d={s.icon} /></svg>
              </div>
              <p className="font-black text-white">{s.name}</p>
              <p className="text-[13px] text-white/60 mt-1 leading-relaxed">{s.desc}</p>
            </div>
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
            <a href="/events" className="px-7 py-3 rounded-full text-sm font-black bg-gradient-to-r from-[#00ccff] to-[#0077b0] text-[#04091a] shadow-[0_0_30px_rgba(0,204,255,.4)] hover:brightness-110 transition">SEE UPCOMING UHT EVENTS</a>
            <a href="/three-stars" className="px-7 py-3 rounded-full text-sm font-bold border border-white/25 text-white/85 hover:border-[#00ccff] hover:text-white transition">MEET THE THREE STARS</a>
          </div>
        </div>

        <p className="text-center text-[11px] text-white/35 pb-10">Ultimate Hockey Tournaments &middot; Lights Out Invitational &middot; St. Louis, MO</p>
      </div>
    </div>
  );
}
