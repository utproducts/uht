// ============================================
// UHT Shared Types & Utilities
// Used by both the API (Workers) and Web (Next.js)
// ============================================

// User roles
export type UserRole = 'admin' | 'director' | 'organization' | 'coach' | 'manager' | 'parent' | 'scorekeeper' | 'referee';

// Age groups
export const AGE_GROUPS = ['mite', '8u', '10u', '12u', '14u', '16u', '18u', 'adult'] as const;
export type AgeGroup = typeof AGE_GROUPS[number];

// Division levels
export const DIVISION_LEVELS = ['AA', 'A', 'B', 'C', 'house'] as const;
export type DivisionLevel = typeof DIVISION_LEVELS[number];

// Event statuses
export const EVENT_STATUSES = ['draft', 'published', 'registration_open', 'registration_closed', 'active', 'completed', 'cancelled'] as const;
export type EventStatus = typeof EVENT_STATUSES[number];

// Registration statuses
export const REGISTRATION_STATUSES = ['pending', 'approved', 'rejected', 'waitlisted', 'withdrawn'] as const;
export type RegistrationStatus = typeof REGISTRATION_STATUSES[number];

// Game types
export const GAME_TYPES = ['pool', 'quarterfinal', 'semifinal', 'consolation', 'championship', 'placement'] as const;
export type GameType = typeof GAME_TYPES[number];

// Game statuses
export const GAME_STATUSES = ['scheduled', 'warmup', 'in_progress', 'intermission', 'final', 'cancelled', 'forfeit'] as const;
export type GameStatus = typeof GAME_STATUSES[number];

// Sponsorship tiers
export const SPONSOR_TIERS = ['platinum', 'gold', 'silver', 'bronze', 'custom'] as const;
export type SponsorTier = typeof SPONSOR_TIERS[number];

// Player positions
export const POSITIONS = ['forward', 'defense', 'goalie'] as const;
export type Position = typeof POSITIONS[number];

// US States we operate in (expandable)
export const UHT_STATES = [
  { code: 'IL', name: 'Illinois' },
  { code: 'WI', name: 'Wisconsin' },
  { code: 'MO', name: 'Missouri' },
  { code: 'IN', name: 'Indiana' },
  { code: 'MI', name: 'Michigan' },
] as const;

// UHT Cities
export const UHT_CITIES = [
  { name: 'Chicago', state: 'IL' },
  { name: 'Wisconsin Dells', state: 'WI' },
  { name: 'St. Louis', state: 'MO' },
  { name: 'South Bend', state: 'IN' },
  { name: 'Madison', state: 'WI' },
  { name: 'Holland', state: 'MI' },
  { name: 'Ann Arbor', state: 'MI' },
] as const;

// Utility: Format cents to dollar string
export function formatPrice(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100);
}

// Utility: Format date range
export function formatDateRange(start: string, end: string): string {
  const s = new Date(start);
  const e = new Date(end);
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };

  if (s.getMonth() === e.getMonth()) {
    return `${s.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}-${e.getDate()}, ${e.getFullYear()}`;
  }
  return `${s.toLocaleDateString('en-US', opts)} - ${e.toLocaleDateString('en-US', opts)}, ${e.getFullYear()}`;
}

// Utility: Calculate next year's equivalent weekend date
export function getNextYearWeekendDate(date: string): string {
  const d = new Date(date);
  const nextYear = new Date(d);
  nextYear.setFullYear(nextYear.getFullYear() + 1);

  // Adjust to the same day of the week
  const dayDiff = d.getDay() - nextYear.getDay();
  nextYear.setDate(nextYear.getDate() + dayDiff);

  return nextYear.toISOString().split('T')[0];
}

// Utility: Generate a 4-digit PIN
export function generatePin(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

// Utility: Slugify a string
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}
