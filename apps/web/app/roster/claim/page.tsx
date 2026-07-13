'use client';
import { useState, useEffect } from 'react';

const API = 'https://api.ultimatetournaments.com/api';

interface Player {
  id: string; firstName: string; lastName: string; jerseyNumber: string | null;
  position: string | null; shoots: string | null;
  claimed: boolean; parentName: string | null; parentEmail: string | null;
  avatarId: string | null;
}

const AVATAR_MAP: Record<string, string> = {
  penguin: '🐧', bear: '🐻', wolf: '🐺', eagle: '🦅', shark: '🦈', dragon: '🐉',
  lion: '🦁', tiger: '🐯', fox: '🦊', owl: '🦉', unicorn: '🦄', octopus: '🐙',
  bat: '🦇', gorilla: '🦍', rocket: '🚀', lightning: '⚡',
};
interface TeamInfo {
  id: string; name: string; ageGroup: string; divisionLevel: string | null;
  city: string | null; state: string | null; headCoachName: string | null; orgName: string | null;
}

type Mode = 'roster' | 'claim' | 'register' | 'success';

export default function RosterClaimPage() {
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [team, setTeam] = useState<TeamInfo | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [mode, setMode] = useState<Mode>('roster');

  // Claim form
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [parentFirst, setParentFirst] = useState('');
  const [parentLast, setParentLast] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  // Register form (new player)
  const [newPlayerFirst, setNewPlayerFirst] = useState('');
  const [newPlayerLast, setNewPlayerLast] = useState('');
  const [newJersey, setNewJersey] = useState('');
  const [newPosition, setNewPosition] = useState('');

  // Success
  const [successData, setSuccessData] = useState<{ playerName: string; teamName: string } | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get('t') || '';
    // Also support /roster/claim/TOKEN path style — extract from pathname
    const pathParts = window.location.pathname.split('/');
    const pathToken = pathParts[pathParts.length - 1] !== 'claim' ? pathParts[pathParts.length - 1] : '';
    const finalToken = t || pathToken || '';
    setToken(finalToken);

    if (!finalToken) {
      setError('No roster link token provided. Make sure you have the full link from your coach.');
      setLoading(false);
      return;
    }

    (async () => {
      try {
        const res = await fetch(`${API}/teams/roster/share/${finalToken}`);
        const json = await res.json() as any;
        if (json.success) {
          setTeam(json.data.team);
          setPlayers(json.data.players);
        } else {
          setError(json.error || 'This roster link is invalid or has expired.');
        }
      } catch {
        setError('Could not load roster. Please check your connection and try again.');
      }
      setLoading(false);
    })();
  }, []);

  const formatPos = (p: string | null) => {
    if (!p) return '';
    return p.charAt(0).toUpperCase() + p.slice(1);
  };

  const handleClaim = (player: Player) => {
    setSelectedPlayer(player);
    setMode('claim');
    setSubmitError('');
  };

  const handleRegisterNew = () => {
    setMode('register');
    setSubmitError('');
  };

  const submitClaim = async () => {
    if (!selectedPlayer || !parentFirst.trim() || !parentLast.trim() || !email.trim()) {
      setSubmitError('Please fill in all required fields.');
      return;
    }
    setSubmitting(true);
    setSubmitError('');
    try {
      const res = await fetch(`${API}/teams/roster/share/${token}/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playerId: selectedPlayer.id,
          parentFirstName: parentFirst.trim(),
          parentLastName: parentLast.trim(),
          email: email.trim(),
          phone: phone.trim(),
        }),
      });
      const json = await res.json() as any;
      if (json.success) {
        setSuccessData({ playerName: json.data.playerName, teamName: json.data.teamName });
        setMode('success');
        // Update local player list to show as claimed
        setPlayers(prev => prev.map(p => p.id === selectedPlayer.id ? { ...p, claimed: true } : p));
      } else {
        setSubmitError(json.error || 'Failed to claim player.');
      }
    } catch {
      setSubmitError('Network error. Please try again.');
    }
    setSubmitting(false);
  };

  const submitRegister = async () => {
    if (!newPlayerFirst.trim() || !newPlayerLast.trim() || !parentFirst.trim() || !parentLast.trim() || !email.trim()) {
      setSubmitError('Please fill in all required fields.');
      return;
    }
    setSubmitting(true);
    setSubmitError('');
    try {
      const res = await fetch(`${API}/teams/roster/share/${token}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playerFirstName: newPlayerFirst.trim(),
          playerLastName: newPlayerLast.trim(),
          jerseyNumber: newJersey.trim() || undefined,
          position: newPosition || undefined,
          parentFirstName: parentFirst.trim(),
          parentLastName: parentLast.trim(),
          email: email.trim(),
          phone: phone.trim(),
        }),
      });
      const json = await res.json() as any;
      if (json.success) {
        setSuccessData({ playerName: json.data.playerName, teamName: json.data.teamName });
        setMode('success');
      } else {
        setSubmitError(json.error || 'Failed to register player.');
      }
    } catch {
      setSubmitError('Network error. Please try again.');
    }
    setSubmitting(false);
  };

  // Loading screen
  if (loading) {
    return (
      <div className="min-h-screen bg-[#f5f5f7] flex flex-col">
        <nav className="bg-navy-700 px-6 py-4">
          <a href="/" className="flex items-center gap-3">
            <img src="/uht-logo.png" alt="UHT" className="h-8 w-auto" />
            <span className="text-white font-semibold text-lg">Ultimate Tournaments</span>
          </a>
        </nav>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <svg className="w-10 h-10 text-[#003e79] animate-spin mx-auto mb-4" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <p className="text-[#6e6e73]">Loading roster...</p>
          </div>
        </div>
      </div>
    );
  }

  // Error screen
  if (error || !team) {
    return (
      <div className="min-h-screen bg-[#f5f5f7] flex flex-col">
        <nav className="bg-navy-700 px-6 py-4">
          <a href="/" className="flex items-center gap-3">
            <img src="/uht-logo.png" alt="UHT" className="h-8 w-auto" />
            <span className="text-white font-semibold text-lg">Ultimate Tournaments</span>
          </a>
        </nav>
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="text-center max-w-md">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-[#1d1d1f] mb-2">Invalid Roster Link</h2>
            <p className="text-[#6e6e73]">{error || 'This link is invalid or has expired. Ask your coach for a new link.'}</p>
            <a href="/" className="inline-block mt-6 px-6 py-3 bg-[#003e79] text-white rounded-xl font-semibold hover:bg-[#002d5a] transition">
              Go to Home
            </a>
          </div>
        </div>
      </div>
    );
  }

  // Success screen
  if (mode === 'success' && successData) {
    return (
      <div className="min-h-screen bg-[#f5f5f7] flex flex-col">
        <nav className="bg-navy-700 px-6 py-4">
          <a href="/" className="flex items-center gap-3">
            <img src="/uht-logo.png" alt="UHT" className="h-8 w-auto" />
            <span className="text-white font-semibold text-lg">Ultimate Tournaments</span>
          </a>
        </nav>
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="w-full max-w-md text-center">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-5">
              <svg className="w-10 h-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-[#1d1d1f] mb-2">You&apos;re All Set!</h2>
            <p className="text-[#6e6e73] mb-6">
              <span className="font-semibold text-[#1d1d1f]">{successData.playerName}</span> is now registered with{' '}
              <span className="font-semibold text-[#003e79]">{successData.teamName}</span>.
            </p>

            <div className="bg-white rounded-2xl shadow-sm border border-[#e8e8ed] p-6 text-left mb-6">
              <h3 className="font-semibold text-[#1d1d1f] mb-3">What happens next?</h3>
              <div className="space-y-3 text-sm text-[#6e6e73]">
                <div className="flex gap-3">
                  <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-xs font-bold text-blue-600">1</span>
                  </div>
                  <p>We&apos;ve created your account with the email you provided. You can log in anytime using a magic link.</p>
                </div>
                <div className="flex gap-3">
                  <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-xs font-bold text-blue-600">2</span>
                  </div>
                  <p>When your team registers for a tournament, you&apos;ll receive notifications with all the details.</p>
                </div>
                <div className="flex gap-3">
                  <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-xs font-bold text-blue-600">3</span>
                  </div>
                  <p>You can log in to view schedules, scores, and team info for any tournament your team is in.</p>
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <a href="/" className="flex-1 py-3 rounded-xl bg-[#003e79] text-white font-semibold hover:bg-[#002d5a] transition text-center">
                Go to Home
              </a>
              <button onClick={() => { setMode('roster'); setSelectedPlayer(null); setParentFirst(''); setParentLast(''); setEmail(''); setPhone(''); }}
                className="flex-1 py-3 rounded-xl border border-[#e8e8ed] text-[#1d1d1f] font-semibold hover:bg-gray-50 transition">
                Claim Another Player
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Claim form
  if (mode === 'claim' && selectedPlayer) {
    return (
      <div className="min-h-screen bg-[#f5f5f7] flex flex-col">
        <nav className="bg-navy-700 px-6 py-4">
          <a href="/" className="flex items-center gap-3">
            <img src="/uht-logo.png" alt="UHT" className="h-8 w-auto" />
            <span className="text-white font-semibold text-lg">Ultimate Tournaments</span>
          </a>
        </nav>
        <div className="flex-1 flex items-start justify-center p-6 pt-8">
          <div className="w-full max-w-lg">
            <button onClick={() => setMode('roster')} className="text-sm text-[#003e79] hover:underline mb-4 flex items-center gap-1">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              Back to Roster
            </button>

            <div className="bg-white rounded-2xl shadow-sm border border-[#e8e8ed] overflow-hidden">
              <div className="bg-gradient-to-r from-[#003e79] to-[#005599] px-6 py-4">
                <h2 className="text-white font-bold text-lg">Confirm Player Registration</h2>
                <p className="text-white/70 text-sm mt-1">{team.name}</p>
              </div>

              <div className="p-6 space-y-5">
                {/* Player Info (read-only confirmation) */}
                <div className="bg-blue-50 rounded-xl p-4">
                  <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-2">Player</p>
                  <p className="text-lg font-bold text-[#1d1d1f]">
                    {selectedPlayer.firstName} {selectedPlayer.lastName}
                  </p>
                  <div className="flex gap-4 mt-1 text-sm text-[#6e6e73]">
                    {selectedPlayer.jerseyNumber && <span>#{selectedPlayer.jerseyNumber}</span>}
                    {selectedPlayer.position && <span>{formatPos(selectedPlayer.position)}</span>}
                    {selectedPlayer.shoots && <span>Shoots {selectedPlayer.shoots}</span>}
                  </div>
                </div>

                <p className="text-sm text-[#6e6e73]">
                  Please provide your contact information. This creates your account so you&apos;ll receive tournament updates for this team.
                </p>

                {submitError && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">{submitError}</div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-[#1d1d1f] mb-1.5">Your First Name <span className="text-red-500">*</span></label>
                    <input type="text" value={parentFirst} onChange={e => setParentFirst(e.target.value)}
                      placeholder="First name" autoFocus
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#1d1d1f] mb-1.5">Your Last Name <span className="text-red-500">*</span></label>
                    <input type="text" value={parentLast} onChange={e => setParentLast(e.target.value)}
                      placeholder="Last name"
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none text-sm" />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-[#1d1d1f] mb-1.5">Email <span className="text-red-500">*</span></label>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                    placeholder="your@email.com"
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none text-sm" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-[#1d1d1f] mb-1.5">Phone Number <span className="text-red-500">*</span></label>
                  <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                    placeholder="(555) 555-5555"
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none text-sm" />
                </div>

                <button onClick={submitClaim} disabled={submitting || !parentFirst.trim() || !parentLast.trim() || !email.trim()}
                  className={"w-full py-3.5 rounded-xl font-semibold text-sm transition " +
                    (submitting ? "bg-gray-300 text-gray-500 cursor-not-allowed" : "bg-[#003e79] text-white hover:bg-[#002d5a]")}>
                  {submitting ? 'Registering...' : 'Confirm & Register'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Register new player form
  if (mode === 'register') {
    return (
      <div className="min-h-screen bg-[#f5f5f7] flex flex-col">
        <nav className="bg-navy-700 px-6 py-4">
          <a href="/" className="flex items-center gap-3">
            <img src="/uht-logo.png" alt="UHT" className="h-8 w-auto" />
            <span className="text-white font-semibold text-lg">Ultimate Tournaments</span>
          </a>
        </nav>
        <div className="flex-1 flex items-start justify-center p-6 pt-8">
          <div className="w-full max-w-lg">
            <button onClick={() => setMode('roster')} className="text-sm text-[#003e79] hover:underline mb-4 flex items-center gap-1">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              Back to Roster
            </button>

            <div className="bg-white rounded-2xl shadow-sm border border-[#e8e8ed] overflow-hidden">
              <div className="bg-gradient-to-r from-[#003e79] to-[#005599] px-6 py-4">
                <h2 className="text-white font-bold text-lg">Register New Player</h2>
                <p className="text-white/70 text-sm mt-1">{team.name}</p>
              </div>

              <div className="p-6 space-y-5">
                <p className="text-sm text-[#6e6e73]">
                  Don&apos;t see your player on the roster? Add them here and provide your contact info.
                </p>

                {submitError && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">{submitError}</div>
                )}

                <div className="bg-gray-50 rounded-xl p-4 space-y-4">
                  <p className="text-xs font-semibold text-[#6e6e73] uppercase tracking-wide">Player Information</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-[#1d1d1f] mb-1.5">Player First Name <span className="text-red-500">*</span></label>
                      <input type="text" value={newPlayerFirst} onChange={e => setNewPlayerFirst(e.target.value)}
                        placeholder="First name" autoFocus
                        className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none text-sm bg-white" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-[#1d1d1f] mb-1.5">Player Last Name <span className="text-red-500">*</span></label>
                      <input type="text" value={newPlayerLast} onChange={e => setNewPlayerLast(e.target.value)}
                        placeholder="Last name"
                        className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none text-sm bg-white" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-[#1d1d1f] mb-1.5">Jersey Number</label>
                      <input type="text" value={newJersey} onChange={e => setNewJersey(e.target.value)}
                        placeholder="#"
                        className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none text-sm bg-white" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-[#1d1d1f] mb-1.5">Position</label>
                      <select value={newPosition} onChange={e => setNewPosition(e.target.value)}
                        className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none text-sm bg-white">
                        <option value="">Select...</option>
                        <option value="forward">Forward</option>
                        <option value="defense">Defense</option>
                        <option value="goalie">Goalie</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className="bg-gray-50 rounded-xl p-4 space-y-4">
                  <p className="text-xs font-semibold text-[#6e6e73] uppercase tracking-wide">Parent / Guardian Information</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-[#1d1d1f] mb-1.5">Your First Name <span className="text-red-500">*</span></label>
                      <input type="text" value={parentFirst} onChange={e => setParentFirst(e.target.value)}
                        placeholder="First name"
                        className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none text-sm bg-white" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-[#1d1d1f] mb-1.5">Your Last Name <span className="text-red-500">*</span></label>
                      <input type="text" value={parentLast} onChange={e => setParentLast(e.target.value)}
                        placeholder="Last name"
                        className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none text-sm bg-white" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#1d1d1f] mb-1.5">Email <span className="text-red-500">*</span></label>
                    <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                      placeholder="your@email.com"
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none text-sm bg-white" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#1d1d1f] mb-1.5">Phone Number <span className="text-red-500">*</span></label>
                    <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                      placeholder="(555) 555-5555"
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none text-sm bg-white" />
                  </div>
                </div>

                <button onClick={submitRegister}
                  disabled={submitting || !newPlayerFirst.trim() || !newPlayerLast.trim() || !parentFirst.trim() || !parentLast.trim() || !email.trim()}
                  className={"w-full py-3.5 rounded-xl font-semibold text-sm transition " +
                    (submitting ? "bg-gray-300 text-gray-500 cursor-not-allowed" : "bg-[#003e79] text-white hover:bg-[#002d5a]")}>
                  {submitting ? 'Registering...' : 'Register Player'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Main roster view
  const claimedCount = players.filter(p => p.claimed).length;

  return (
    <div className="min-h-screen bg-[#f5f5f7] flex flex-col">
      <nav className="bg-navy-700 px-6 py-4">
        <a href="/" className="flex items-center gap-3">
          <img src="/uht-logo.png" alt="UHT" className="h-8 w-auto" />
          <span className="text-white font-semibold text-lg">Ultimate Tournaments</span>
        </a>
      </nav>

      <div className="flex-1 flex items-start justify-center p-4 sm:p-6 pt-6 sm:pt-8">
        <div className="w-full max-w-2xl">
          {/* Team Header */}
          <div className="bg-gradient-to-r from-[#003e79] to-[#005599] rounded-2xl p-6 text-white mb-6">
            <div className="flex items-start justify-between">
              <div>
                {team.orgName && (
                  <p className="text-white/60 text-xs font-semibold uppercase tracking-wider mb-1">{team.orgName}</p>
                )}
                <h1 className="text-2xl font-bold">{team.name}</h1>
                <div className="flex flex-wrap gap-3 mt-2 text-sm text-white/80">
                  <span>{team.ageGroup}</span>
                  {team.divisionLevel && <span>• {team.divisionLevel}</span>}
                  {(team.city || team.state) && (
                    <span>• {[team.city, team.state].filter(Boolean).join(', ')}</span>
                  )}
                </div>
                {team.headCoachName && (
                  <p className="text-sm text-white/60 mt-2">Coach: {team.headCoachName}</p>
                )}
              </div>
              <div className="bg-white/20 rounded-xl px-4 py-2 text-center">
                <p className="text-2xl font-bold">{players.length}</p>
                <p className="text-xs text-white/80">Players</p>
              </div>
            </div>
          </div>

          {/* Instructions */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6 flex items-start gap-3">
            <svg className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <p className="text-sm font-semibold text-blue-900">Find your player and register</p>
              <p className="text-xs text-blue-700 mt-1">
                Find your child in the roster below and tap &ldquo;This is my child&rdquo; to register.
                We&apos;ll create your account and keep you updated on all tournament activity for this team.
              </p>
            </div>
          </div>

          {/* Player List */}
          <div className="bg-white rounded-2xl shadow-sm border border-[#e8e8ed] overflow-hidden mb-4">
            {players.length === 0 ? (
              <div className="p-8 text-center">
                <p className="text-[#6e6e73]">No players on the roster yet.</p>
                <p className="text-sm text-[#86868b] mt-1">Your coach hasn&apos;t added any players. You can register your player below.</p>
              </div>
            ) : (
              <div>
                <div className="bg-gray-50 px-4 py-2.5 border-b border-gray-200 flex items-center justify-between">
                  <span className="text-xs font-semibold text-[#6e6e73] uppercase tracking-wide">Team Roster</span>
                  <span className="text-xs text-[#86868b]">{claimedCount}/{players.length} registered</span>
                </div>
                {players.map(player => (
                  <div key={player.id} className="px-4 py-3.5 border-b border-gray-100 last:border-b-0 flex items-center justify-between hover:bg-gray-50 transition">
                    <div className="flex items-center gap-3">
                      <div className={"w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold relative " +
                        (player.claimed ? "bg-green-100 text-green-700" : "bg-gray-100 text-[#6e6e73]")}>
                        {player.avatarId ? (
                          <span className="text-xl">{AVATAR_MAP[player.avatarId] || '🏒'}</span>
                        ) : (
                          player.jerseyNumber || '—'
                        )}
                        {player.avatarId && player.jerseyNumber && (
                          <span className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-[#003e79] text-white text-[10px] font-bold flex items-center justify-center">
                            {player.jerseyNumber}
                          </span>
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-[#1d1d1f]">
                          {player.firstName} {player.lastName}
                        </p>
                        <div className="flex gap-2 text-xs text-[#6e6e73]">
                          {player.position && <span className="capitalize">{player.position}</span>}
                          {player.shoots && <span>• Shoots {player.shoots}</span>}
                        </div>
                      </div>
                    </div>
                    <div>
                      {player.claimed ? (
                        <div className="flex items-center gap-1.5 text-green-600 text-xs font-medium bg-green-50 px-3 py-1.5 rounded-full">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          Registered
                        </div>
                      ) : (
                        <button onClick={() => handleClaim(player)}
                          className="px-4 py-2 rounded-xl bg-[#003e79] text-white text-xs font-semibold hover:bg-[#002d5a] transition whitespace-nowrap">
                          This is my child
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Register new player button */}
          <button onClick={handleRegisterNew}
            className="w-full py-4 rounded-2xl border-2 border-dashed border-[#003e79]/30 text-[#003e79] font-semibold text-sm hover:bg-blue-50 hover:border-[#003e79]/50 transition flex items-center justify-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
            </svg>
            Player Not on Roster? Register Here
          </button>

          <p className="text-center text-xs text-[#86868b] mt-6 mb-4">
            Powered by <a href="/" className="text-[#003e79] hover:underline">Ultimate Tournaments</a>
          </p>
        </div>
      </div>
    </div>
  );
}
