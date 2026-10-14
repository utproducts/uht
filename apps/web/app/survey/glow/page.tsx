'use client';

import { useEffect, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://uht.chad-157.workers.dev';

const Q = [
  {
    key: 'interest',
    title: 'How interested would you be in a GLOW IN THE DARK hockey tournament?',
    sub: 'Blacklights, neon jerseys, glowing pucks and lines - a full glow experience.',
    options: [
      { v: 'very', label: 'Very interested - sign us up!' },
      { v: 'somewhat', label: 'Somewhat interested' },
      { v: 'not', label: 'Not interested' },
    ],
  },
  {
    key: 'format',
    title: 'Which format sounds better to you?',
    sub: 'We are considering a full glow event, or a hybrid where some games are glow and some are under normal lighting.',
    options: [
      { v: 'all_glow', label: 'All games glow in the dark' },
      { v: 'hybrid', label: 'Hybrid - some glow, some normal lighting' },
      { v: 'either', label: 'Either sounds fun' },
    ],
  },
  {
    key: 'cost_reaction',
    title: 'Heads up: cost may run a little higher than a normal tournament because of glow uniforms and specialty equipment. Does that change your interest?',
    sub: '',
    options: [
      { v: 'still_in', label: 'Still in - worth it for the experience' },
      { v: 'depends', label: 'Depends how much higher' },
      { v: 'probably_out', label: 'That would probably rule us out' },
    ],
  },
  {
    key: 'travel',
    title: 'Would you travel for it?',
    sub: '',
    options: [
      { v: 'would_travel', label: 'Yes - we would travel for this' },
      { v: 'home_city_only', label: 'Only if it comes to our home city / area' },
      { v: 'either', label: 'Either works for us' },
    ],
  },
];

export default function GlowSurveyPage() {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [comments, setComments] = useState('');
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    try {
      const p = new URLSearchParams(window.location.search);
      const e = p.get('e');
      if (e) setEmail(atob(e));
    } catch {}
  }, []);

  const submit = async () => {
    if (!answers.interest) { setErr('Please answer the first question.'); return; }
    setSending(true); setErr('');
    try {
      const res = await fetch(`${API}/api/surveys/glow-2026/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...answers, email, name, city, comments }),
      });
      const j = await res.json();
      if (j.success) setDone(true);
      else setErr(j.error || 'Something went wrong - please try again.');
    } catch { setErr('Could not reach the server - please try again.'); }
    setSending(false);
  };

  return (
    <div className="min-h-screen bg-[#0a2240] py-10 px-4" style={{ backgroundImage: 'radial-gradient(ellipse at 20% 0%, rgba(0,204,255,0.18), transparent 50%), radial-gradient(ellipse at 90% 100%, rgba(57,255,20,0.10), transparent 45%)' }}>
      <div className="max-w-xl mx-auto">
        <div className="text-center mb-8">
          <p className="text-xs tracking-[0.3em] font-bold text-[#00ccff] mb-3">ULTIMATE HOCKEY TOURNAMENTS</p>
          <h1 className="text-4xl font-extrabold text-white leading-tight" style={{ textShadow: '0 0 18px rgba(0,204,255,0.8), 0 0 40px rgba(0,204,255,0.4)' }}>
            GLOW IN THE DARK<br />HOCKEY
          </h1>
          <p className="text-[#b9c9dc] mt-3 text-sm">We are thinking about hosting one. Thirty seconds of your time tells us if we should.</p>
        </div>

        {done ? (
          <div className="bg-white/10 border border-[#00ccff]/50 rounded-2xl p-8 text-center backdrop-blur">
            <div className="text-5xl mb-3">&#127881;</div>
            <h2 className="text-xl font-bold text-white mb-2">Got it - thank you!</h2>
            <p className="text-[#b9c9dc] text-sm">Your answers are in. If the glow tournament happens, you will be the first to know.</p>
          </div>
        ) : (
          <div className="space-y-5">
            {Q.map(q => (
              <div key={q.key} className="bg-white/[0.07] border border-white/15 rounded-2xl p-5 backdrop-blur">
                <p className="text-white font-bold text-[15px] leading-snug">{q.title}</p>
                {q.sub ? <p className="text-[#9db2c9] text-xs mt-1">{q.sub}</p> : null}
                <div className="mt-3 space-y-2">
                  {q.options.map(o => (
                    <button
                      key={o.v}
                      type="button"
                      onClick={() => setAnswers(a => ({ ...a, [q.key]: o.v }))}
                      className={`w-full text-left px-4 py-3 rounded-xl border text-sm font-medium transition ${
                        answers[q.key] === o.v
                          ? 'bg-[#00ccff] border-[#00ccff] text-[#0a2240] shadow-[0_0_14px_rgba(0,204,255,0.6)]'
                          : 'bg-white/5 border-white/20 text-white hover:border-[#00ccff]/60'
                      }`}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}

            <div className="bg-white/[0.07] border border-white/15 rounded-2xl p-5 backdrop-blur space-y-3">
              <p className="text-white font-bold text-[15px]">About you <span className="text-[#9db2c9] font-normal text-xs">(optional, helps us plan locations)</span></p>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Name"
                className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-sm text-white placeholder-[#7d8aa0] outline-none focus:border-[#00ccff]" />
              <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" inputMode="email" autoCapitalize="none"
                className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-sm text-white placeholder-[#7d8aa0] outline-none focus:border-[#00ccff]" />
              <input value={city} onChange={e => setCity(e.target.value)} placeholder="Home city and state (e.g. Naperville, IL)"
                className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-sm text-white placeholder-[#7d8aa0] outline-none focus:border-[#00ccff]" />
              <textarea value={comments} onChange={e => setComments(e.target.value)} placeholder="Anything else you want us to know?" rows={3}
                className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-sm text-white placeholder-[#7d8aa0] outline-none focus:border-[#00ccff] resize-none" />
            </div>

            {err ? <p className="text-red-400 text-sm text-center font-medium">{err}</p> : null}

            <button onClick={submit} disabled={sending}
              className="w-full py-4 rounded-2xl bg-[#00ccff] text-[#0a2240] font-extrabold text-lg shadow-[0_0_24px_rgba(0,204,255,0.55)] hover:shadow-[0_0_34px_rgba(0,204,255,0.8)] transition disabled:opacity-60">
              {sending ? 'Sending…' : 'Submit My Answers'}
            </button>
            <p className="text-center text-[#7d8aa0] text-xs pb-6">Ultimate Hockey Tournaments · ultimatetournaments.com</p>
          </div>
        )}
      </div>
    </div>
  );
}
