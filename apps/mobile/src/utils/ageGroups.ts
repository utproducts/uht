// Canonical hockey age group ordering
// Handles both name format (Mite, Squirt...) and number format (8U, 10U...)
const AGE_ORDER_MAP: Record<string, number> = {
  'mite': 1, '8u': 1, '8-u': 1,
  'squirt': 2, '10u': 2, '10-u': 2,
  'peewee': 3, 'pee wee': 3, '12u': 3, '12-u': 3,
  'bantam': 4, '14u': 4, '14-u': 4,
  'midget': 5, '16u': 5, '16-u': 5, '18u': 6, '18-u': 6,
};

export function ageGroupSortKey(ageGroup: string): number {
  if (!ageGroup) return 999;
  const normalized = ageGroup.toLowerCase().trim();
  // Try exact match first
  if (AGE_ORDER_MAP[normalized] !== undefined) return AGE_ORDER_MAP[normalized];
  // Try prefix match (e.g. "Mite AA" -> "mite")
  for (const [key, val] of Object.entries(AGE_ORDER_MAP)) {
    if (normalized.startsWith(key)) return val;
  }
  return 999;
}

export function sortByAgeGroup<T>(items: T[], getAgeGroup: (item: T) => string): T[] {
  return [...items].sort((a, b) => {
    const aKey = ageGroupSortKey(getAgeGroup(a));
    const bKey = ageGroupSortKey(getAgeGroup(b));
    if (aKey !== bKey) return aKey - bKey;
    // Same age group - sort by full label
    return getAgeGroup(a).localeCompare(getAgeGroup(b));
  });
}

// Returns unique age groups from divisions, in correct order
export function getOrderedAgeGroups(divisions: { age_group: string }[]): string[] {
  const unique = [...new Set(divisions.map(d => d.age_group).filter(Boolean))];
  return unique.sort((a, b) => ageGroupSortKey(a) - ageGroupSortKey(b));
}
