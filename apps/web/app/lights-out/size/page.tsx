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

// Manufacturer size chart (inches): A chest width, B sleeve, C body length.
// The size code is the real garment size, so the order sheet matches exactly.
const SIZE_INFO: Record<string, { label: string; chest: string; sleeve: string; body: string }> = {
  'CHILD-36': { label: 'Child', chest: '17.5', sleeve: '20.5', body: '23' },
  'YXS-38': { label: 'Youth XS', chest: '19', sleeve: '21.5', body: '24' },
  'YS-40': { label: 'Youth S', chest: '20', sleeve: '23.5', body: '26' },
  'YM-42': { label: 'Youth M', chest: '21', sleeve: '24.5', body: '27' },
  'YL-44': { label: 'Youth L', chest: '22', sleeve: '25.5', body: '28' },
  'YXL-46': { label: 'Youth XL', chest: '23', sleeve: '26.5', body: '29' },
  'AS-48': { label: 'Adult S', chest: '24', sleeve: '28', body: '30' },
  'AM-50': { label: 'Adult M', chest: '25', sleeve: '29', body: '31' },
  'AL-52': { label: 'Adult L', chest: '26', sleeve: '30', body: '32' },
  'AXL-54': { label: 'Adult XL', chest: '27', sleeve: '31', body: '33' },
  'A2XL-56': { label: 'Adult 2XL', chest: '28', sleeve: '32', body: '34' },
  'A3XL-58': { label: 'Adult 3XL', chest: '29', sleeve: '33', body: '35' },
  'A4XL-60': { label: 'Adult 4XL', chest: '30', sleeve: '33', body: '35.5' },
  'GC-44': { label: 'fits Youth S', chest: '22', sleeve: '24', body: '26' },
  'GC-46': { label: 'fits Youth M', chest: '23', sleeve: '25', body: '27' },
  'GC-48': { label: 'fits Youth L', chest: '24', sleeve: '26', body: '28' },
  'GC-50': { label: 'fits Youth XL', chest: '25', sleeve: '27', body: '29' },
  'GC-52': { label: 'fits Adult S', chest: '26', sleeve: '28', body: '30' },
  'GC-54': { label: 'fits Adult M', chest: '27', sleeve: '29', body: '31' },
  'GC-56': { label: 'fits Adult L', chest: '28', sleeve: '30', body: '32' },
  'GC-58': { label: 'fits Adult XL', chest: '29', sleeve: '31', body: '33' },
  'GC-60': { label: 'fits Adult 2XL', chest: '30', sleeve: '32', body: '34' },
  'GC-62': { label: 'fits Adult 3XL', chest: '31', sleeve: '33', body: '35' },
  'GC-64': { label: 'fits Adult 4XL', chest: '32', sleeve: '33.5', body: '35.5' },
};

function SizePicker() {
  const params = useSearchParams();
  const id = params.get('id') || '';
  const balanceFlag = params.get('balance') || '';
  const [playerName, setPlayerName] = useState('');
  const [jerseySizes, setJerseySizes] = useState<string[]>([]);
  const [goalieSizes, setGoalieSizes] = useState<string[]>([]);
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
          setGoalieSizes(json.data.goalie_jersey_sizes || []);
          setTeeSizes(json.data.tee_sizes || []);
          const js = String(json.data.jersey_size || '');
          setGoalieCut(js.startsWith('GC-'));
          setJersey(js);
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
          jerseySize: jersey || undefined,
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
                {jersey ? ` - Jersey ${jersey}${SIZE_INFO[jersey] ? ` (${SIZE_INFO[jersey].label})` : ''}` : ''}{tee ? ` - Tee ${tee}` : ''}
              </p>
              <p className="text-xs mt-3" style={{ color: '#7fd8ff' }}>
                The swag will be waiting at check-in, right before opening ceremonies on June 11th.
                Sizes are final once submitted - the order goes in as entered.
              </p>
              <p className="text-xs mt-2" style={{ color: '#55637a' }}>
                Spot a mistake? Email <a href="mailto:info@ultimatetournaments.com" style={{ color: '#7fd8ff' }}>info@ultimatetournaments.com</a> right away.
              </p>
            </div>
          )}
          {(state === 'ready' || state === 'saving') && (
            <>
              <p className="text-xs font-bold tracking-widest text-center mb-1" style={{ color: '#7fd8ff' }}>SWAG SIZES</p>
              <h1 className="text-xl font-bold text-white text-center mb-1">{playerName}</h1>
              <p className="text-xs text-center mb-5" style={{ color: '#7fd8ff' }}>
                Pick what {firstName} will wear in June 2027 - when in doubt, size up. Double check before you save: once sizes are submitted, the order goes in.
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
                    <button key={opt.label} onClick={() => { setGoalieCut(opt.v); if (jersey && (opt.v ? !goalieSizes.includes(jersey) : !jerseySizes.includes(jersey))) setJersey(''); }}
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
              <div className="mb-3">
                <p className="text-xs font-bold tracking-widest mb-2" style={{ color: '#39ff14' }}>GLOW JERSEY SIZE{goalieCut ? ' - GOALIE CUT' : ''}</p>
                <div className="grid grid-cols-2 gap-2">
                  {(goalieCut ? goalieSizes : jerseySizes).map(sz => {
                    const info = SIZE_INFO[sz];
                    return (
                      <button key={sz} onClick={() => setJersey(sz)}
                        className="rounded-xl py-2.5 text-sm font-bold border transition leading-tight"
                        style={jersey === sz
                          ? { background: 'linear-gradient(90deg,#39ff14,#00ccff)', color: '#04091a', borderColor: 'transparent' }
                          : { background: 'rgba(255,255,255,.04)', color: '#dbe8f5', borderColor: 'rgba(0,204,255,.3)' }}>
                        {sz}
                        {info && <span className="block text-[10px] font-semibold mt-0.5" style={{ opacity: .8 }}>{info.label} · chest {info.chest}&quot;</span>}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[11px] mt-1.5" style={{ color: '#55637a' }}>
                  These are the manufacturer&apos;s real jersey sizes - the number is the actual garment size in inches. Check the chart below and measure a jersey that fits well today.
                </p>
              </div>
              <div className="rounded-xl border p-3 mb-5 overflow-x-auto" style={{ borderColor: 'rgba(0,204,255,.25)', background: 'rgba(255,255,255,.02)' }}>
                <p className="text-[11px] font-bold tracking-widest mb-2" style={{ color: '#7fd8ff' }}>SIZE CHART IN INCHES{goalieCut ? ' - GOALIE CUT' : ''}</p>
                <table className="w-full text-[11px]" style={{ color: '#dbe8f5' }}>
                  <thead>
                    <tr style={{ color: '#55637a' }}>
                      <th align="left" className="pb-1">Size</th>
                      <th className="pb-1">Chest width</th>
                      <th className="pb-1">Sleeve</th>
                      <th className="pb-1">Body length</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(goalieCut ? goalieSizes : jerseySizes).map(sz => {
                      const info = SIZE_INFO[sz];
                      if (!info) return null;
                      return (
                        <tr key={sz} style={jersey === sz ? { color: '#39ff14', fontWeight: 700 } : undefined}>
                          <td align="left" className="py-0.5">{sz} ({info.label})</td>
                          <td align="center" className="py-0.5">{info.chest}</td>
                          <td align="center" className="py-0.5">{info.sleeve}</td>
                          <td align="center" className="py-0.5">{info.body}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <p className="text-[10px] mt-2" style={{ color: '#55637a' }}>
                  Chest width is measured flat across the front. Sizes vary slightly by jersey style - when in doubt, size up.
                </p>
              </div>
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
