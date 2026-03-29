/**
 * API client for the UHT platform
 * Handles all communication between Next.js frontend and Cloudflare Workers API
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://uht-api.ultimatetournaments.com';

interface RequestOptions {
  method?: string;
  body?: any;
  token?: string;
  headers?: Record<string, string>;
}

class ApiClient {
  private baseUrl: string;
  private token: string | null = null;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  setToken(token: string | null) {
    this.token = token;
    if (token && typeof window !== 'undefined') {
      localStorage.setItem('uht_token', token);
    } else if (typeof window !== 'undefined') {
      localStorage.removeItem('uht_token');
    }
  }

  getToken(): string | null {
    if (this.token) return this.token;
    if (typeof window !== 'undefined') {
      this.token = localStorage.getItem('uht_token');
    }
    return this.token;
  }

  async request<T = any>(path: string, options: RequestOptions = {}): Promise<T> {
    const { method = 'GET', body, token, headers = {} } = options;
    const authToken = token || this.getToken();

    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        ...headers,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: 'Request failed' }));
      throw new ApiError(res.status, error.error || 'Request failed');
    }

    return res.json();
  }

  // Auth
  async login(email: string, password: string) {
    const res = await this.request<{ success: boolean; data: { token: string; user: any } }>('/api/auth/login', {
      method: 'POST',
      body: { email, password },
    });
    if (res.data?.token) this.setToken(res.data.token);
    return res;
  }

  async register(data: { email: string; password: string; firstName: string; lastName: string; phone?: string; role?: string }) {
    const res = await this.request<{ success: boolean; data: { token: string; user: any } }>('/api/auth/register', {
      method: 'POST',
      body: data,
    });
    if (res.data?.token) this.setToken(res.data.token);
    return res;
  }

  async getMe() {
    return this.request('/api/auth/me');
  }

  async scorekeeperLogin(pin: string) {
    const res = await this.request<{ success: boolean; data: { token: string; eventId: string; eventName: string } }>('/api/auth/scorekeeper-pin', {
      method: 'POST',
      body: { pin },
    });
    if (res.data?.token) this.setToken(res.data.token);
    return res;
  }

  logout() {
    this.setToken(null);
  }

  // Events
  async getEvents(params?: Record<string, string>) {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return this.request(`/api/events${qs}`);
  }

  async getEvent(slug: string) {
    return this.request(`/api/events/${slug}`);
  }

  async getCities() {
    return this.request('/api/events/meta/cities');
  }

  async getStates() {
    return this.request('/api/events/meta/states');
  }

  // Teams
  async getMyTeams() {
    return this.request('/api/teams/my-teams');
  }

  async getTeam(id: string) {
    return this.request(`/api/teams/${id}`);
  }

  async createTeam(data: any) {
    return this.request('/api/teams', { method: 'POST', body: data });
  }

  async addPlayer(teamId: string, data: any) {
    return this.request(`/api/teams/${teamId}/players`, { method: 'POST', body: data });
  }

  // Registrations
  async registerTeam(data: { eventDivisionId: string; teamId: string; notes?: string }) {
    return this.request('/api/registrations', { method: 'POST', body: data });
  }

  async getEventRegistrations(eventId: string, params?: Record<string, string>) {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return this.request(`/api/registrations/event/${eventId}${qs}`);
  }

  async approveRegistration(id: string) {
    return this.request(`/api/registrations/${id}/approve`, { method: 'POST' });
  }

  // Scoring
  async getEventGames(eventId: string, params?: Record<string, string>) {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return this.request(`/api/scoring/events/${eventId}/games${qs}`);
  }

  async getGame(gameId: string) {
    return this.request(`/api/scoring/games/${gameId}`);
  }

  async recordGameEvent(gameId: string, data: any) {
    return this.request(`/api/scoring/games/${gameId}/events`, { method: 'POST', body: data });
  }

  // Ice Booking
  async getIceSlots(params?: Record<string, string>) {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return this.request(`/api/ice-booking/slots${qs}`);
  }

  async bookIceSlot(data: { slotId: string; name: string; email: string; phone: string; notes?: string }) {
    return this.request('/api/ice-booking/book', { method: 'POST', body: data });
  }

  // Chatbot
  async chat(message: string, history?: Array<{ role: 'user' | 'assistant'; content: string }>) {
    return this.request('/api/chatbot/chat', {
      method: 'POST',
      body: { message, conversationHistory: history },
    });
  }
}

class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = 'ApiError';
  }
}

export const api = new ApiClient(API_BASE);
export { ApiError };
