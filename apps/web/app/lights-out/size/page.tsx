'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://uht.chad-157.workers.dev';

/*
 * Lights Out swag sizes - parents land here from the acceptance email.
 * Jersey + tee size saved straight onto the registration row so the admin
 * panel can total sizes for the order. Deposit families also get their
 * remaining-balance button here.
 */

function SizePicker() {
  const params = useSearchParams();
  const id = params.get('id') || '';
  const balanceFlag = params.get('balance') || '';
  const [playerName, setPlayerName] = useState('');
  const [jerseySizes, setJerseySizes] = useState<string[]>([]);
  const [teeSizes, setTeeSizes] = useState<string[]>([]);
  const [jersey, setJersey] = useState('');
  const [goalieCut, setGoalieCut] = useState(false);
  const [tee, setTee] = useState('');
  const [number, setNumber] = useState('');
  const [jerseyName, setJerseyName] = useState('');
  const [balanceCents, setBalanceCents] = useState(0);
  const [state, setState] = useState<'loading' | 'ready' | 'saving' | 'saved' | 'missing'>('loading');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) { setState('missing'); return; }
    fetch(`${API}/api/lights-out/size/${encodeURIComponent(id)}`)
      .then(r => r.json())
      .then(json => {
        if (json.success) {
          setPlayerName(json.data.player_name || '');
          setJerseySizes(json.data.jersey_sizes || []);
          setTeeSizes(json.data.tee_sizes || []);
          const js = String(json.data.jersey_size || '');
          setGoalieCut(js.startsWith('Goalie Cut '));
          setJersey(js.startsWith('Goalie Cut ') ? js.slice(11) : js);
          setTee(json.data.tee_size || '');
          setNumber(json.data.jersey_number || '');
          setJerseyName(json.data.jersey_name || '');
          setBalanceCents(json.data.balance_cents || 0);
          setState('ready');
        } else setState('missing');
      })
      .catch(() => setState('missing'));
  }, [id]);

  const save = async () => {
    if (!jersey && !tee && !number.trim() && !jerseyName.trim()) return;
    setState('saving');
    setError('');
    try {
      const r = await fetch(`${API}/api/lights-out/size/${encodeURIComponent(id)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jerseySize: jersey ? (goalieCut ? `Goalie Cut ${jersey}` : jersey) : undefined,
          teeSize: tee || undefined,
          jerseyNumber: number.trim() || undefined,
          jerseyName: jerseyName.trim() || undefined,
        }),
      });
      const json = await r.json();
      if (json.success) setState('saved');
      else { setState('ready'); setError(json.error || 'Could not save. Try again.'); }
    } catch {
      setState('ready');
      setError('Could not save. Check your connection and try again.');
    }
  };

  const firstName = playerName.split(' ')[0] || 'your player';
  const sizeGrid = (label: string, options: string[], value: string, set2: (v: string) => void) => (
    <div className="mb-5">
      <p className="text-xs font-bold tracking-widest mb-2" style={{ color: '#39ff14' }}>{label}</p>
      <div className="grid grid-cols-2 gap-2">
        {options.map(s => (
          <button key={s} onClick={() => set2(s)}
            className="rounded-xl py-3 text-sm font-bold border transition"
            style={value === s
              ? { background: 'linear-gradient(90deg,#39ff14,#00ccff)', color: '#04091a', borderColor: 'transparent' }
              : { background: 'rgba(255,255,255,.04)', color: '#dbe8f5', borderColor: 'rgba(0,204,255,.3)' }}>
            {s}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen" style={{ background: '#04091a' }}>
      <div className="max-w-md mx-auto px-5 py-12">
        <div className="text-center mb-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/lights-out-logo.png" alt="Lights Out Invitational" className="w-44 mx-auto" />
        </div>
        {balanceFlag === 'paid' && (
          <div className="rounded-xl border px-4 py-3 mb-4 text-center" style={{ background: 'rgba(57,255,20,.08)', borderColor: 'rgba(57,255,20,.5)' }}>
            <p className="text-sm font-bold" style={{ color: '#39ff14' }}>Balance paid - {firstName} is paid in full. See you under the glow.</p>
          </div>
        )}
        <div className="rounded-2xl border p-6" style={{ background: '#0a1228', borderColor: 'rgba(0,204,255,.35)' }}>
          {state === 'loading' && (
            <p className="text-center text-sm" style={{ color: '#7fd8ff' }}>Loading...</p>
          )}
          {state === 'missing' && (
            <div className="text-center">
              <p className="text-sm font-bold text-white mb-2">We could not find that registration.</p>
              <p className="text-xs" style={{ color: '#7fd8ff' }}>
                Use the size link from your acceptance email, or email us at
                {' '}<a href="mailto:info@ultimatetournaments.com" style={{ color: '#39ff14' }}>info@ultimatetournaments.com</a>.
              </p>
            </div>
          )}
          {state === 'saved' && (
            <div className="text-center py-4">
              <p className="text-lg font-bold mb-2" style={{ color: '#39ff14' }}>Locked in</p>
              <p className="text-sm text-white">
                {jerseyName || playerName}{number ? ` #${number}` : ''}
                {jersey ? ` - Jersey ${goalieCut ? 'Goalie Cut ' : ''}${jersey}` : ''}{tee ? ` - Tee ${tee}` : ''}
              </p>
              <p className="text-xs mt-3" style={{ color: '#7fd8ff' }}>
                The swag will be waiting at check-in, right before opening ceremonies on June 11th.
                Need a change later? Just open this link again.
              </p>
              <button onClick={() => setState('ready')}
                className="mt-4 text-xs font-bold underline" style={{ color: '#7fd8ff' }}>
                Change sizes
              </button>
            </div>
          )}
          {(state === 'ready' || state === 'saving') && (
            <>
              <p className="text-xs font-bold tracking-widest text-center mb-1" style={{ color: '#7fd8ff' }}>SWAG SIZES</p>
              <h1 className="text-xl font-bold text-white text-center mb-1">{playerName}</h1>
              <p className="text-xs text-center mb-5" style={{ color: '#7fd8ff' }}>
                Pick what {firstName} will wear in June 2027 - when in doubt, size up. You can change these any time before the event.
              </p>
              <div className="mb-5">
                <p className="text-xs font-bold tracking-widest mb-2" style={{ color: '#39ff14' }}>ON THE JERSEY</p>
                <div className="grid grid-cols-3 gap-2">
                  <input value={number} onChange={e => setNumber(e.target.value.replace(/[^0-9]/g, '').slice(0, 2))}
                    placeholder="#" inputMode="numeric"
                    className="rounded-xl py-3 px-3 text-sm font-bold border text-center"
                    style={{ background: 'rgba(255,255,255,.04)', color: '#fff', borderColor: 'rgba(0,204,255,.3)' }} />
                  <input value={jerseyName} onChange={e => setJerseyName(e.target.value.toUpperCase().slice(0, 20))}
                    placeholder="LAST NAME" className="col-span-2 rounded-xl py-3 px-3 text-sm font-bold border tracking-widest"
                    style={{ background: 'rgba(255,255,255,.04)', color: '#fff', borderColor: 'rgba(0,204,255,.3)' }} />
                </div>
                <p className="text-[11px] mt-1.5" style={{ color: '#55637a' }}>
                  Number requests are first come, first served within each team - we will get as close as we can.
                </p>
              </div>
              <div className="mb-3">
                <p className="text-xs font-bold tracking-widest mb-2" style={{ color: '#39ff14' }}>JERSEY CUT</p>
                <div className="grid grid-cols-2 gap-2">
                  {[{ v: false, label: 'REGULAR' }, { v: true, label: 'GOALIE CUT' }].map(opt => (
                    <button key={opt.label} onClick={() => setGoalieCut(opt.v)}
                      className="rounded-xl py-3 text-sm font-bold border transition"
                      style={goalieCut === opt.v
                        ? { background: 'linear-gradient(90deg,#39ff14,#00ccff)', color: '#04091a', borderColor: 'transparent' }
                        : { background: 'rgba(255,255,255,.04)', color: '#dbe8f5', borderColor: 'rgba(0,204,255,.3)' }}>
                      {opt.label}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] mt-1.5" style={{ color: goalieCut ? '#39ff14' : '#55637a' }}>
                  {goalieCut ? 'Goalie cut it is - roomier for pads.' : 'Goalies: pick GOALIE CUT so the jersey fits over pads.'}
                </p>
              </div>
              {sizeGrid('GLOW JERSEY SIZE', jerseySizes, jersey, setJersey)}
              {sizeGrid('GLOW TEE SIZE', teeSizes, tee, setTee)}
              {error && <p className="text-xs text-center mb-3" style={{ color: '#ffb84d' }}>{error}</p>}
              <button onClick={save} disabled={(!jersey && !tee && !number.trim() && !jerseyName.trim()) || state === 'saving'}
                className="w-full rounded-full py-3 text-sm font-bold disabled:opacity-40"
                style={{ background: 'linear-gradient(90deg,#39ff14,#00ccff)', color: '#04091a' }}>
                {state === 'saving' ? 'SAVING...' : 'SAVE SIZES'}
              </button>
            </>
          )}
        </div>
        {balanceCents > 0 && balanceFlag !== 'paid' && (
          <div className="rounded-2xl border p-5 mt-4 text-center" style={{ background: '#0a1228', borderColor: 'rgba(255,184,77,.45)' }}>
            <p className="text-sm font-bold mb-1" style={{ color: '#ffb84d' }}>Balance due: ${(balanceCents / 100).toFixed(0)}</p>
            <p className="text-xs mb-3" style={{ color: '#7fd8ff' }}>Your deposit got the spot - pay the balance as soon as possible to be fully locked in for June.</p>
            <a href={`${API}/api/lights-out/balance/${encodeURIComponent(id)}`}
              className="inline-block rounded-full px-7 py-2.5 text-sm font-bold border-2"
              style={{ borderColor: '#ffb84d', color: '#ffb84d' }}>
              PAY THE BALANCE
            </a>
          </div>
        )}
        <p className="text-center text-[11px] mt-6" style={{ color: '#55637a' }}>
          Ultimate Hockey Tournaments - Lights Out Invitational - St. Louis, MO
        </p>
      </div>
    </div>
  );
}

export default function LightsOutSizePage() {
  return (
    <Suspense fallback={<div className="min-h-screen" style={{ background: '#04091a' }} />}>
      <SizePicker />
    </Suspense>
  );
}
