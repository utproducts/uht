import { authFetch } from './auth';

// ==================
// Organizations
// ==================
export async function searchOrganizations(query: string, state?: string) {
  const params = new URLSearchParams();
  if (query) params.set('q', query);
  if (state) params.set('state', state);
  const res = await fetch(`https://uht.chad-157.workers.dev/api/organizations/search?${params.toString()}`);
  const json = await res.json();
  return json.success ? json.data : [];
}

export async function getOrganizationsByState(state: string) {
  const res = await fetch(`https://uht.chad-157.workers.dev/api/organizations/search?state=${encodeURIComponent(state)}`);
  const json = await res.json();
  return json.success ? json.data : [];
}

// ==================
// Teams
// ==================
export async function getTeamsByOrg(orgId: string) {
  const res = await fetch(`https://uht.chad-157.workers.dev/api/teams/by-org/${orgId}`);
  const json = await res.json();
  return json.success ? json.data : [];
}

export async function searchTeams(query: string) {
  const res = await fetch(`https://uht.chad-157.workers.dev/api/teams/search?q=${encodeURIComponent(query)}`);
  const json = await res.json();
  return json.success ? json.data : [];
}

// ==================
// Follow / Unfollow
// ==================
export async function followTeam(teamId: string) {
  const res = await authFetch('/api/follows', {
    method: 'POST',
    body: JSON.stringify({ team_id: teamId }),
  });
  return res.json();
}

export async function unfollowTeam(teamId: string) {
  const res = await authFetch(`/api/follows/${teamId}`, { method: 'DELETE' });
  return res.json();
}

export async function getFollowedTeams() {
  const res = await authFetch('/api/follows');
  const json = await res.json();
  return json.success ? json.data : [];
}

// ==================
// Events
// ==================
export async function getEvents() {
  const res = await fetch('https://uht.chad-157.workers.dev/api/events?per_page=100');
  const json = await res.json();
  return json.success ? json.data : [];
}

export async function getEventDetail(eventId: string) {
  const res = await fetch(`https://uht.chad-157.workers.dev/api/events/${eventId}`);
  const json = await res.json();
  return json.success ? json.data : null;
}

export async function getTeamSchedule(eventId: string, teamId: string) {
  const res = await fetch(`https://uht.chad-157.workers.dev/api/events/${eventId}/schedule?team_id=${teamId}`);
  const json = await res.json();
  return json.success ? json.data : [];
}

export async function getEventSchedule(eventId: string) {
  const res = await fetch(`https://uht.chad-157.workers.dev/api/events/${eventId}/schedule`);
  const json = await res.json();
  return json.success ? json.data : [];
}

export async function getMyTeamIds(): Promise<string[]> {
  try {
    const [followsRes, myTeamsRes] = await Promise.all([
      authFetch('/api/follows').catch(() => null),
      authFetch('/api/teams/my-teams').catch(() => null),
    ]);
    const teamIds = new Set<string>();
    if (followsRes) {
      const fj = await followsRes.json() as any;
      if (fj.success && Array.isArray(fj.data)) {
        fj.data.forEach((f: any) => teamIds.add(f.team_id));
      }
    }
    if (myTeamsRes) {
      const tj = await myTeamsRes.json() as any;
      if (tj.success && Array.isArray(tj.data)) {
        tj.data.forEach((t: any) => teamIds.add(t.id));
      }
    }
    return [...teamIds];
  } catch {
    return [];
  }
}

// ==================
// Scores & Standings
// ==================
export async function getEventScores(eventId: string) {
  const res = await fetch(`https://uht.chad-157.workers.dev/api/scoring/events/${eventId}/games`);
  const json = await res.json() as { success: boolean; data?: unknown[] };
  return json.success ? json.data : [];
}

export async function getEventStandings(eventId: string) {
  const res = await fetch(`https://uht.chad-157.workers.dev/api/scoring/events/${eventId}/standings`);
  const json = await res.json() as { success: boolean; data?: unknown[] };
  return json.success ? json.data : [];
}

// ==================
// Scorekeeper Dashboard
// ==================
export async function getScorekeeperEvents() {
  const res = await authFetch('/api/scoring/my-events');
  const json = await res.json() as { success: boolean; data?: unknown[] };
  return json.success ? json.data : [];
}

export async function getScorekeeperGames(eventId: string) {
  const res = await authFetch(`/api/scoring/my-events/${eventId}/games`);
  const json = await res.json() as { success: boolean; data?: unknown[] };
  return json.success ? json.data : [];
}

// ==================
// Event Hotels
// ==================
export async function getEventHotels(eventId: string) {
  const res = await fetch(`https://uht.chad-157.workers.dev/api/events/event-hotels/${eventId}`);
  const json = await res.json() as { success: boolean; data?: unknown[] };
  return json.success ? json.data : [];
}

// ==================
// Event Divisions (for pricing display)
// ==================
export async function getEventDivisions(eventId: string) {
  const res = await fetch(`https://uht.chad-157.workers.dev/api/events/event-divisions/${eventId}`);
  const json = await res.json() as { success: boolean; data?: unknown[] };
  return json.success ? json.data : [];
}
