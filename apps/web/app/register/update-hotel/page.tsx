'use client';

import { useState, useEffect } from 'react';

const API = 'https://uht.chad-157.workers.dev/api';

interface EventHotel {
  id: string;
  hotel_name: string;
  city: string;
  state: string;
  rate_description: string | null;
  booking_url: string | null;
}

export default function UpdateHotelPage() {
  const [eventId, setEventId] = useState('');
  const [regId, setRegId] = useState('');
  const [hotels, setHotels] = useState<EventHotel[]>([]);
  const [regInfo, setRegInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [picks, setPicks] = useState<[string, string, string]>(['', '', '']);
  const [isLocal, setIsLocal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const reg = params.get('reg') || '';
    const event = params.get('event') || '';
    setRegId(reg);
    setEventId(event);

    if (!reg || !event) {
      setError('Missing registration or event information. Please use the link from your email.');
      setLoading(false);
      return;
    }

    (async () => {
      try {
        const [hotelsRes, regRes] = await Promise.all([
          fetch(`${API}/events/event-hotels/${event}`),
          fetch(`${API}/events/registration/${reg}/info`),
        ]);
        const hotelsJson = await hotelsRes.json() as any;
        const regJson = await regRes.json() as any;

        if (hotelsJson.success) {
          setHotels(hotelsJson.data || []);
        }
        if (regJson.success) {
          setRegInfo(regJson.data);
          // Pre-populate existing choices
          if (regJson.data.hotel_choice_1 === 'Local Team') {
            setIsLocal(true);
          } else {
            setPicks([
              regJson.data.hotel_choice_1 || '',
              regJson.data.hotel_choice_2 || '',
              regJson.data.hotel_choice_3 || '',
            ]);
          }
        } else {
          setError('Registration not found. The link may have expired.');
        }
      } catch (err) {
        setError('Failed to load data. Please try again.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const pickHotel = (hotelName: string) => {
    if (isLocal) return;
    const idx = picks.indexOf(hotelName);
    if (idx !== -1) {
      // Remove it
      const newPicks: [string, string, string] = [...picks];
      newPicks[idx] = '';
      // Shift remaining up
      const filtered = newPicks.filter(p => p) as string[];
      setPicks([filtered[0] || '', filtered[1] || '', filtered[2] || '']);
      return;
    }
    const nextEmpty = picks.findIndex(p => !p);
    if (nextEmpty !== -1) {
      const newPicks: [string, string, string] = [...picks];
      newPicks[nextEmpty] = hotelName;
      setPicks(newPicks);
    }
  };

  const removeHotel = (slot: number) => {
    const newPicks: [string, string, string] = [...picks];
    newPicks[slot] = '';
    const filtered = newPicks.filter(p => p) as string[];
    setPicks([filtered[0] || '', filtered[1] || '', filtered[2] || '']);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${API}/events/registration/${regId}/hotels`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hotelChoice1: isLocal ? 'Local Team' : picks[0] || null,
          hotelChoice2: isLocal ? null : picks[1] || null,
          hotelChoice3: isLocal ? null : picks[2] || null,
        }),
      });
      const json = await res.json() as any;
      if (json.success) {
        setSaved(true);
      } else {
        setError(json.error || 'Failed to save. Please try again.');
      }
    } catch {
      setError('Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f5f5f7] flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-3 border-[#00ccff] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-[#6e6e73]">Loading hotel options...</p>
        </div>
      </div>
    );
  }

  if (error && !regInfo) {
    return (
      <div className="min-h-screen bg-[#f5f5f7] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" /></svg>
          </div>
          <h2 className="text-xl font-bold text-[#1d1d1f] mb-2">Something went wrong</h2>
          <p className="text-[#6e6e73]">{error}</p>
        </div>
      </div>
    );
  }

  if (saved) {
    return (
      <div className="min-h-screen bg-[#f5f5f7] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-emerald-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-emerald-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          </div>
          <h2 className="text-xl font-bold text-[#1d1d1f] mb-2">Hotel Preferences Saved!</h2>
          <p className="text-[#6e6e73] mb-6">
            {isLocal
              ? "We've noted that you're a local team and won't need a hotel."
              : `Your hotel choices have been saved. We'll do our best to accommodate your preferences.`
            }
          </p>
          {regInfo && (
            <div className="bg-[#f0f9ff] border border-[#bae6fd] rounded-xl p-4 text-left mb-6">
              <p className="text-sm font-semibold text-[#003e79]">{regInfo.team_name}</p>
              <p className="text-xs text-[#6e6e73] mt-1">{regInfo.age_group}</p>
              {!isLocal && picks[0] && (
                <div className="mt-3 space-y-1">
                  {picks.filter(p => p).map((p, i) => (
                    <p key={i} className="text-xs text-[#6e6e73]">
                      <span className="font-medium text-[#1d1d1f]">{i === 0 ? '1st' : i === 1 ? '2nd' : '3rd'} Choice:</span> {p}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}
          <a href="/" className="inline-block px-6 py-3 bg-[#003e79] text-white font-semibold rounded-xl hover:bg-[#002d59] transition-colors">
            Go to UHT Home
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f5f5f7]">
      {/* Header */}
      <div className="bg-gradient-to-r from-[#003e79] to-[#001f3f] text-white">
        <div className="max-w-2xl mx-auto px-4 py-8 text-center">
          <img src="https://uht.chad-157.workers.dev/api/assets/brand/uht-logo.png" alt="Ultimate Tournaments" className="h-10 mx-auto mb-4 object-contain" />
          <h1 className="text-2xl font-bold mb-1">Select Your Hotel Preferences</h1>
          {regInfo && (
            <p className="text-white/70 text-sm">
              {regInfo.team_name} &middot; {regInfo.age_group}
            </p>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-2xl mx-auto px-4 py-8">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-lg p-6 sm:p-8">
          {/* Local team toggle */}
          <button
            onClick={() => { setIsLocal(!isLocal); }}
            className={`w-full text-left p-4 rounded-xl border-2 mb-6 transition-all ${
              isLocal ? 'border-[#003e79] bg-[#003e79]/5' : 'border-[#e8e8ed] hover:border-[#003e79]/40'
            }`}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-[#1d1d1f]">We're a Local Team</p>
                <p className="text-sm text-[#6e6e73] mt-0.5">We don't need a hotel — we live nearby.</p>
              </div>
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                isLocal ? 'border-[#003e79] bg-[#003e79]' : 'border-[#d1d1d6]'
              }`}>
                {isLocal && (
                  <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                )}
              </div>
            </div>
          </button>

          {!isLocal && (
            <>
              {hotels.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-[#6e6e73]">Hotel options are not yet available. Please check back later.</p>
                </div>
              ) : (
                <>
                  {/* Selected picks display */}
                  <div className="space-y-3 mb-6">
                    {[0, 1, 2].map(slot => {
                      const pick = picks[slot];
                      const hotel = hotels.find(h => h.hotel_name === pick);
                      const label = slot === 0 ? '1st Choice' : slot === 1 ? '2nd Choice' : '3rd Choice';
                      const colors = slot === 0 ? 'border-[#00ccff] bg-[#00ccff]/5' : slot === 1 ? 'border-blue-300 bg-blue-50' : 'border-gray-300 bg-gray-50';

                      return (
                        <div key={slot} className={`p-4 rounded-xl border-2 ${pick ? colors : 'border-dashed border-[#d1d1d6] bg-[#fafafa]'}`}>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                                pick ? 'bg-[#003e79] text-white' : 'bg-[#e8e8ed] text-[#86868b]'
                              }`}>
                                {slot + 1}
                              </span>
                              <div>
                                {hotel ? (
                                  <>
                                    <p className="font-semibold text-[#1d1d1f] text-sm">{hotel.hotel_name}</p>
                                    <p className="text-xs text-[#6e6e73]">{hotel.city}, {hotel.state}{hotel.rate_description ? ` · ${hotel.rate_description}` : ''}</p>
                                  </>
                                ) : (
                                  <p className="text-sm text-[#86868b]">{label} — tap a hotel below</p>
                                )}
                              </div>
                            </div>
                            {pick && (
                              <button
                                onClick={() => removeHotel(slot)}
                                className="w-7 h-7 rounded-full bg-red-50 text-red-500 hover:bg-red-100 flex items-center justify-center transition-colors"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Hotel list */}
                  <p className="text-xs font-medium text-[#86868b] uppercase tracking-wider mb-3">Available Hotels</p>
                  <div className="space-y-2 max-h-[350px] overflow-y-auto">
                    {hotels.map(hotel => {
                      const pickedSlot = picks.indexOf(hotel.hotel_name);
                      const isPicked = pickedSlot !== -1;
                      const nextEmpty = picks.findIndex(p => !p);
                      const soldOut = !!(hotel as any).sold_out;

                      return (
                        <button
                          key={hotel.id}
                          onClick={() => { if (!soldOut) pickHotel(hotel.hotel_name); }}
                          disabled={soldOut || (!isPicked && nextEmpty === -1)}
                          className={`w-full text-left p-4 rounded-xl border transition-all ${
                            soldOut
                              ? 'border-[#e8e8ed] bg-[#fafafa] opacity-60 cursor-not-allowed'
                              : isPicked
                                ? 'border-[#00ccff] bg-[#00ccff]/5'
                                : nextEmpty === -1
                                  ? 'border-[#e8e8ed] bg-[#fafafa] opacity-50 cursor-not-allowed'
                                  : 'border-[#e8e8ed] hover:border-[#00ccff]/40 hover:bg-[#fafafa]'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <p className={`font-semibold text-sm ${soldOut ? 'text-[#86868b] line-through' : 'text-[#1d1d1f]'}`}>{hotel.hotel_name}</p>
                              <p className="text-xs text-[#6e6e73]">
                                {hotel.city}, {hotel.state}
                                {hotel.rate_description ? ` · ${hotel.rate_description}` : ''}
                              </p>
                            </div>
                            {soldOut ? (
                              <span className="text-[10px] font-bold text-red-600 bg-red-50 border border-red-200 rounded-full px-2 py-0.5">SOLD OUT</span>
                            ) : isPicked ? (
                              <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                                pickedSlot === 0 ? 'bg-[#00ccff] text-white' :
                                pickedSlot === 1 ? 'bg-blue-400 text-white' :
                                'bg-gray-400 text-white'
                              }`}>
                                #{pickedSlot + 1}
                              </span>
                            ) : nextEmpty !== -1 ? (
                              <span className="text-xs text-[#00ccff] font-medium">+ Add</span>
                            ) : null}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </>
          )}

          {/* Save button */}
          <div className="mt-8 pt-6 border-t border-[#e8e8ed]">
            <button
              onClick={handleSave}
              disabled={saving || (!isLocal && !picks[0])}
              className="w-full py-4 rounded-xl font-semibold text-white bg-[#00ccff] hover:bg-[#00b8e6] disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm text-lg"
            >
              {saving ? 'Saving...' : 'Save Hotel Selection'}
            </button>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-[#86868b] mt-8">
          Ultimate Hockey Tournaments &middot; ultimatetournaments.com
        </p>
      </div>
    </div>
  );
}
