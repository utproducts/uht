import { authFetch } from './auth';

// ==================
// Organizations
// ==================
export async function searchOrganizations(query: string) {
  const res = await fetch(`https://uht.chad-157.workers.dev/api/organizations/search?q=${encodeURIComponent(query)}`);
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
  const res = await fetch('https://uht.chad-157.workers.dev/api/events');
  const json = await res.json();
  return json.success ? json.data : [];
}

export async function getEventDetail(eventId: string) {
  const res = await fetch(`https://uht.chad-157.workers.dev/api/events/${eventId}`);
  const json = await res.json();
  return json.success ? json.data : null;
}

export async function getTeamSchedule(eventId: string, teamId: string) {
  const res = await fetch(`https://uht.chad-157.workers.dev/api/schedules/event/${eventId}?team_id=${teamId}`);
  const json = await res.json();
  return json.success ? json.data : [];
}

export async function getEventSchedule(eventId: string) {
  const res = await fetch(`https://uht.chad-157.workers.dev/api/schedules/event/${eventId}`);
  const json = await res.json();
  return json.success ? json.data : [];
}
