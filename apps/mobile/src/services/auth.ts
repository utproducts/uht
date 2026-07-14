import * as SecureStore from 'expo-secure-store';
import { API_URL } from '../constants/api';

const TOKEN_KEY = 'uht_token';
const USER_KEY = 'uht_user';
const ACTIVE_ROLE_KEY = 'uht_active_role';

export type UserRole = 'admin' | 'director' | 'organization' | 'coach' | 'manager' | 'parent' | 'scorekeeper' | 'referee';

export const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  director: 'Tournament Director',
  tournament_director: 'Tournament Director',
  organization: 'Organization',
  coach: 'Coach',
  manager: 'Team Manager',
  parent: 'Parent / Player',
  scorekeeper: 'Scorekeeper',
  referee: 'Referee',
};

export const ROLE_ICONS: Record<string, string> = {
  admin: 'shield',
  director: 'flag',
  tournament_director: 'flag',
  organization: 'business',
  coach: 'megaphone',
  manager: 'clipboard',
  parent: 'people',
  scorekeeper: 'create',
  referee: 'stopwatch',
};

export interface User {
  id: string;
  name: string;
  email: string;
  phone?: string;
  roles: string[];
}

export async function getToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function setToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function getUser(): Promise<User | null> {
  const raw = await SecureStore.getItemAsync(USER_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export async function setUser(user: User): Promise<void> {
  await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
}

export async function getActiveRole(): Promise<string | null> {
  return SecureStore.getItemAsync(ACTIVE_ROLE_KEY);
}

export async function setActiveRole(role: string): Promise<void> {
  await SecureStore.setItemAsync(ACTIVE_ROLE_KEY, role);
}

export async function clearAuth(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
  await SecureStore.deleteItemAsync(USER_KEY);
  await SecureStore.deleteItemAsync(ACTIVE_ROLE_KEY);
}

export async function signup(data: {
  name: string;
  email: string;
  phone: string;
  password: string;
  role?: 'coach' | 'parent';
}): Promise<{ success: boolean; token?: string; user?: User; error?: string }> {
  try {
    const nameParts = data.name.trim().split(/\s+/);
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';

    const res = await fetch(`${API_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firstName,
        lastName,
        email: data.email,
        phone: data.phone,
        password: data.password,
        role: data.role || 'parent',
      }),
    });
    const json = await res.json();
    if (json.success && json.data?.token) {
      await setToken(json.data.token);
      const user: User = {
        id: json.data.user?.id || '',
        name: `${json.data.user?.firstName || firstName} ${json.data.user?.lastName || lastName}`.trim(),
        email: data.email,
        phone: data.phone,
        roles: json.data.user?.roles || ['parent'],
      };
      await setUser(user);
      return { success: true, token: json.data.token, user };
    }
    const errorMsg = typeof json.error === 'string' ? json.error : 'Registration failed';
    return { success: false, error: errorMsg };
  } catch (e: any) {
    return { success: false, error: e.message || 'Network error' };
  }
}

export async function login(email: string, password: string): Promise<{ success: boolean; token?: string; user?: User; error?: string }> {
  try {
    const res = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const json = await res.json();
    if (json.success && json.data?.token) {
      await setToken(json.data.token);
      const user: User = {
        id: json.data.user?.id || '',
        name: `${json.data.user?.firstName || ''} ${json.data.user?.lastName || ''}`.trim() || email,
        email: json.data.user?.email || email,
        phone: json.data.user?.phone || '',
        roles: json.data.user?.roles || [],
      };
      await setUser(user);
      return { success: true, token: json.data.token, user };
    }
    const errorMsg = typeof json.error === 'string' ? json.error : 'Invalid email or password.';
    return { success: false, error: errorMsg };
  } catch (e: any) {
    return { success: false, error: e.message || 'Network error' };
  }
}

export async function authFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const token = await getToken();
  const isFormData = options.body instanceof FormData;
  return fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      // Don't set Content-Type for FormData — let React Native auto-set with boundary
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
}
