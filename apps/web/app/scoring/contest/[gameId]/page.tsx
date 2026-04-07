'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';

const API_BASE = 'https://uht.chad-157.workers.dev/api';

export default function ContestPage() {
  const params = useParams();
  const gameId = params.gameId as string;

  const [game, setGame] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [coachName, setCoachName] = useState('');
  const [coachPhone, setCoachPhone] = useState('');
  const [teamId, setTeamId] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`${API_BASE}/scoring/games/${gameId}`)
      .then(r => r.json())
      .then(json => {
        if (json.success) setGame(json.data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [gameId]);

  const handleSubmit = async () => {
    if (!teamId || !reason.trim() || !coachPhone.trim()) {
      setError('Please select your team, enter your phone number, and describe the issue.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/scoring/games/${gameId}/contest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId, coachPhone, coachName, reason }),
      });
      const json = await res.json();
      if (json.success) {
        setSubmitted(true);
      } else {
        setError(json.error || 'Failed to submit contest');
      }
    } catch {
      setError('Network error — please try again');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#fafafa] flex items-center justify-center">
        <div className="animate-pulse text-[#86868b]">Loading game...</div>
      </div>
    );
  }

  if (!game) {
    return (
      <div className="min-h-screen bg-[#fafafa] flex items-center justify-center p-6">
        <div className="text-center">
          <div className="text-4xl mb-4">🏒</div>
          <h1 className="text-xl font-bold text-[#1d1d1f] mb-2">Game Not Found</h1>
          <p className="text-[#6e6e73]">This game doesn&apos;t exist or the link is invalid.</p>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-[#fafafa] flex items-center justify-center p-6">
        <div className="text-center max-w-md">
          <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-10 h-10 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-[#1d1d1f] mb-3">Contest Submitted</h1>
          <p className="text-[#6e6e73] mb-6">
            Your contest for Game #{game.game_number} has been submitted. A tournament director will review it shortly.
          </p>
          <div className="bg-white rounded-2xl border border-[#e8e8ed] p-4">
            <div className="text-sm text-[#86868b] uppercase tracking-widest font-semibold mb-2">Final Score</div>
            <div className="text-2xl font-black text-[#1d1d1f]">
              {game.home_team_name} {game.home_score} — {game.away_score} {game.away_team_name}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#fafafa]">
      {/* Header */}
      <div className="bg-gradient-to-r from-[#003e79] via-[#005599] to-[#00ccff] px-6 py-8 text-center">
        <div className="text-white/70 text-xs uppercase tracking-widest font-semibold mb-2">
          Contest Score — Game #{game.game_number}
        </div>
        <div className="text-white text-lg font-bold mb-1">
          {game.age_group} — {game.division_level}
        </div>
        <div className="flex items-center justify-center gap-4 mt-4">
          <div className="text-right flex-1">
            <div className="text-white font-bold text-lg">{game.home_team_name}</div>
            <div className="text-white/60 text-xs">Home</div>
          </div>
          <div className="text-white font-black text-4xl px-4">
            {game.home_score} — {game.away_score}
          </div>
          <div className="text-left flex-1">
            <div className="text-white font-bold text-lg">{game.away_team_name}</div>
            <div className="text-white/60 text-xs">Away</div>
          </div>
        </div>
        <div className="mt-3 inline-block bg-white/20 text-white text-xs font-semibold px-3 py-1 rounded-full">
          FINAL
        </div>
      </div>

      {/* Contest Form */}
      <div className="max-w-lg mx-auto px-6 py-8 space-y-5">
        <div>
          <h2 className="text-lg font-bold text-[#1d1d1f] mb-1">Contest This Score</h2>
          <p className="text-sm text-[#6e6e73]">
            If you believe there is an error in the score, please submit a contest below. A tournament director will review it.
          </p>
        </div>

        {/* Select Team */}
        <div>
          <label className="block text-xs text-[#86868b] uppercase tracking-widest font-semibold mb-2">Your Team</label>
          <div className="grid grid-cols-2 gap-3">
            {[
              { id: game.home_team_id, name: game.home_team_name, label: 'Home' },
              { id: game.away_team_id, name: game.away_team_name, label: 'Away' },
            ].map(team => (
              <button
                key={team.id}
                onClick={() => setTeamId(team.id)}
                className={`p-4 rounded-xl border-2 text-left transition ${
                  teamId === team.id
                    ? 'border-[#003e79] bg-[#f0f7ff]'
                    : 'border-[#e8e8ed] bg-white hover:border-[#003e79]/30'
                }`}
              >
                <div className={`font-semibold text-sm ${teamId === team.id ? 'text-[#003e79]' : 'text-[#1d1d1f]'}`}>
                  {team.name}
                </div>
                <div className="text-xs text-[#86868b] mt-0.5">{team.label}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Coach Info */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-[#86868b] uppercase tracking-widest font-semibold mb-2">Your Name</label>
            <input
              type="text"
              value={coachName}
              onChange={e => setCoachName(e.target.value)}
              placeholder="Coach name"
              className="w-full border border-[#e8e8ed] rounded-xl p-3 text-[#1d1d1f] focus:ring-2 focus:ring-[#003e79]/20 outline-none"
            />
          </div>
          <div>
            <label className="block text-xs text-[#86868b] uppercase tracking-widest font-semibold mb-2">Phone *</label>
            <input
              type="tel"
              value={coachPhone}
              onChange={e => setCoachPhone(e.target.value)}
              placeholder="(630) 555-1234"
              className="w-full border border-[#e8e8ed] rounded-xl p-3 text-[#1d1d1f] focus:ring-2 focus:ring-[#003e79]/20 outline-none"
            />
          </div>
        </div>

        {/* Reason */}
        <div>
          <label className="block text-xs text-[#86868b] uppercase tracking-widest font-semibold mb-2">What&apos;s wrong? *</label>
          <textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            rows={4}
            placeholder="Describe the scoring issue — e.g., a goal was missed, wrong team credited, penalty not recorded, etc."
            className="w-full border border-[#e8e8ed] rounded-xl p-3 text-[#1d1d1f] focus:ring-2 focus:ring-[#003e79]/20 outline-none resize-none"
          />
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">{error}</div>
        )}

        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="w-full py-4 bg-[#003e79] text-white rounded-full font-bold text-lg hover:bg-[#002d5a] disabled:bg-[#86868b] transition"
        >
          {submitting ? 'Submitting...' : 'Submit Contest'}
        </button>
      </div>
    </div>
  );
}
