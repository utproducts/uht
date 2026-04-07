'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const API_BASE = 'https://uht.chad-157.workers.dev/api';

interface Game {
  id: string;
  event_id: string;
  game_number: number;
  game_type: string;
  home_team_id: string;
  away_team_id: string;
  home_team_name: string;
  away_team_name: string;
  home_score: number;
  away_score: number;
  age_group: string;
  division_level: string;
  start_time: string;
  rink_name: string;
  venue_name: string;
  status: string;
}

export default function ScorekeeperPage() {
  const router = useRouter();
  const [pin, setPin] = useState('');
  const [games, setGames] = useState<Game[] | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [shake, setShake] = useState(false);
  const [storedPin, setStoredPin] = useState('');
  const [selectedEventId, setSelectedEventId] = useState('');
  const [eventName, setEventName] = useState('');

  const handleNumberClick = (num: string) => {
    if (pin.length < 8) {
      setPin(pin + num);
      setError('');
    }
  };

  const handleClear = () => {
    setPin('');
    setError('');
  };

  const handleBackspace = () => {
    setPin(pin.slice(0, -1));
    setError('');
  };

  const handleEnter = async () => {
    if (pin.length < 4) {
      setError('PIN must be 4-8 digits');
      triggerShake();
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch(`${API_BASE}/scoring/scorekeeper/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      });

      const json = await response.json();

      if (!json.success) {
        throw new Error(json.error || 'Invalid PIN');
      }

      setStoredPin(pin);
      setSelectedEventId(json.data.eventId);
      setEventName(json.data.eventName || '');
      setGames(json.data.games || []);
    } catch (err: any) {
      setError(err?.message || 'Invalid PIN. Please try again.');
      triggerShake();
      setPin('');
    } finally {
      setLoading(false);
    }
  };

  const triggerShake = () => {
    setShake(true);
    setTimeout(() => setShake(false), 500);
  };

  const handleGameClick = (game: Game) => {
    router.push(
      `/scoring/game?gameId=${game.id}&pin=${storedPin}&eventId=${selectedEventId}`
    );
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'scheduled':
        return { label: 'Scheduled', color: 'bg-blue-100 text-blue-700' };
      case 'warmup':
        return { label: 'Warmup', color: 'bg-purple-100 text-purple-700' };
      case 'in_progress':
        return { label: 'Live', color: 'bg-green-100 text-green-700' };
      case 'intermission':
        return { label: 'Intermission', color: 'bg-yellow-100 text-yellow-700' };
      case 'final':
        return { label: 'Final', color: 'bg-gray-100 text-gray-500' };
      default:
        return { label: status, color: 'bg-gray-100 text-gray-500' };
    }
  };

  const getGameTypeBadge = (type: string) => {
    switch (type) {
      case 'pool':
        return { label: 'Pool', color: 'bg-indigo-100 text-indigo-700' };
      case 'bracket':
      case 'semifinal':
        return { label: 'Bracket', color: 'bg-orange-100 text-orange-700' };
      case 'championship':
        return { label: 'Championship', color: 'bg-yellow-100 text-yellow-800' };
      case 'consolation':
        return { label: 'Consolation', color: 'bg-teal-100 text-teal-700' };
      default:
        return { label: type || 'Game', color: 'bg-gray-100 text-gray-500' };
    }
  };

  const formatTime = (iso: string) => {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    } catch {
      return iso;
    }
  };

  // Show games list after successful PIN entry
  if (games !== null) {
    return (
      <div className="min-h-screen bg-[#fafafa]">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#003e79] via-[#005599] to-[#00ccff] px-6 py-8">
          <h1 className="text-3xl font-bold text-white">UHT Scorekeeper</h1>
          <p className="text-white/70 mt-1 text-sm">{eventName || 'Select a game to score'}</p>
        </div>

        {/* Games List */}
        <div className="px-4 py-6 max-w-2xl mx-auto">
          {games.length === 0 ? (
            <div className="bg-white border border-[#e8e8ed] rounded-2xl p-8 text-center shadow-[0_1px_20px_-6px_rgba(0,0,0,0.08)]">
              <div className="text-4xl mb-4">🏒</div>
              <p className="text-[#1d1d1f] font-bold text-lg mb-2">No Games Available</p>
              <p className="text-[#6e6e73] text-sm">There are no scoreable games for this PIN right now.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {games.map((game) => {
                const statusBadge = getStatusBadge(game.status);
                const typeBadge = getGameTypeBadge(game.game_type);
                return (
                  <button
                    key={game.id}
                    onClick={() => handleGameClick(game)}
                    className="w-full text-left bg-white border border-[#e8e8ed] rounded-2xl p-4 shadow-[0_1px_20px_-6px_rgba(0,0,0,0.08)] active:scale-[0.98] transition-transform"
                  >
                    {/* Game Header */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-[#86868b]">
                          Game #{game.game_number}
                        </span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${typeBadge.color}`}>
                          {typeBadge.label}
                        </span>
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${statusBadge.color}`}>
                        {statusBadge.label}
                      </span>
                    </div>

                    {/* Teams + Score */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-base font-bold text-[#1d1d1f] truncate">{game.home_team_name || 'TBD'}</p>
                        <p className="text-xs text-[#86868b]">Home</p>
                      </div>
                      {game.status !== 'scheduled' && (
                        <div className="text-center px-4">
                          <p className="text-2xl font-black text-[#1d1d1f]">
                            {game.home_score} - {game.away_score}
                          </p>
                        </div>
                      )}
                      {game.status === 'scheduled' && (
                        <div className="text-center px-4">
                          <p className="text-lg font-bold text-[#86868b]">vs</p>
                        </div>
                      )}
                      <div className="flex-1 min-w-0 text-right">
                        <p className="text-base font-bold text-[#1d1d1f] truncate">{game.away_team_name || 'TBD'}</p>
                        <p className="text-xs text-[#86868b]">Away</p>
                      </div>
                    </div>

                    {/* Division & Time */}
                    <div className="flex items-center justify-between text-xs text-[#6e6e73]">
                      <span>{game.age_group} {game.division_level}</span>
                      <span>{formatTime(game.start_time)} {game.rink_name ? `• ${game.rink_name}` : ''}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Back Button */}
          <button
            onClick={() => {
              setGames(null);
              setPin('');
              setStoredPin('');
            }}
            className="w-full mt-6 py-3 rounded-full border border-[#e8e8ed] text-[#003e79] font-semibold text-center bg-white"
          >
            Back to PIN Entry
          </button>
        </div>
      </div>
    );
  }

  // PIN Entry Screen
  return (
    <div className="min-h-screen bg-[#fafafa] flex flex-col">
      {/* Hero Header */}
      <div className="bg-gradient-to-r from-[#003e79] via-[#005599] to-[#00ccff] px-6 py-12">
        <h1 className="text-4xl font-bold text-white text-center">UHT Scorekeeper</h1>
        <p className="text-white/70 text-center mt-2 text-sm">Enter your PIN to access games</p>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-8">
        {/* PIN Display */}
        <div className="w-full max-w-xs mb-8">
          <div
            className={`flex justify-center gap-3 mb-3 transition-transform ${shake ? 'animate-shake' : ''}`}
          >
            {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
              <div
                key={i}
                className={`w-3.5 h-3.5 rounded-full transition-all ${
                  i < pin.length ? 'bg-[#003e79] scale-110' : 'bg-[#e8e8ed]'
                }`}
              />
            ))}
          </div>

          <p className="text-center text-[#6e6e73] text-sm">
            {pin.length > 0 ? `${pin.length} digit${pin.length !== 1 ? 's' : ''} entered` : 'Enter 4-8 digit PIN'}
          </p>

          {error && (
            <p className="text-center text-red-600 text-sm font-medium mt-3">{error}</p>
          )}
        </div>

        {/* Keypad */}
        <div className="w-full max-w-xs">
          <div className="grid grid-cols-3 gap-3 mb-4">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
              <button
                key={num}
                onClick={() => handleNumberClick(num)}
                disabled={loading}
                className="h-16 rounded-xl bg-white border border-[#e8e8ed] text-2xl font-bold text-[#003e79] active:bg-[#f0f7ff] transition-colors disabled:opacity-50"
              >
                {num}
              </button>
            ))}
            <button
              onClick={handleBackspace}
              disabled={loading || pin.length === 0}
              className="h-16 rounded-xl bg-white border border-[#e8e8ed] text-lg font-semibold text-[#6e6e73] active:bg-[#f5f5f7] transition-colors disabled:opacity-30"
            >
              ←
            </button>
            <button
              onClick={() => handleNumberClick('0')}
              disabled={loading}
              className="h-16 rounded-xl bg-white border border-[#e8e8ed] text-2xl font-bold text-[#003e79] active:bg-[#f0f7ff] transition-colors disabled:opacity-50"
            >
              0
            </button>
            <button
              onClick={handleClear}
              disabled={loading || pin.length === 0}
              className="h-16 rounded-xl bg-white border border-[#e8e8ed] text-sm font-semibold text-[#6e6e73] active:bg-[#f5f5f7] transition-colors disabled:opacity-30"
            >
              Clear
            </button>
          </div>

          {/* Enter Button */}
          <button
            onClick={handleEnter}
            disabled={loading || pin.length < 4}
            className="w-full h-14 rounded-full bg-[#003e79] text-white text-lg font-bold active:bg-[#002d5a] transition-colors disabled:bg-[#86868b] disabled:cursor-not-allowed"
          >
            {loading ? 'Verifying...' : 'Enter'}
          </button>
        </div>
      </div>

      <style jsx>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-8px); }
          75% { transform: translateX(8px); }
        }
        .animate-shake {
          animation: shake 0.4s ease-in-out;
        }
      `}</style>
    </div>
  );
}
