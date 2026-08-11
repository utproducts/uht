-- Historical approved-team counts per season/month, imported from the old
-- Airtable tracker. month = calendar month number (1-12); month = 0 holds the
-- season total (2024-2025's total is "as of current date" per the Airtable).
-- Current season is computed live from the registration tables, not stored here.
CREATE TABLE IF NOT EXISTS season_benchmarks (
  season TEXT NOT NULL,
  month INTEGER NOT NULL,
  approved INTEGER NOT NULL,
  PRIMARY KEY (season, month)
);

INSERT OR REPLACE INTO season_benchmarks (season, month, approved) VALUES
  ('2025-2026', 0, 1770),
  ('2025-2026', 6, 2),
  ('2025-2026', 7, 25),
  ('2025-2026', 8, 180),
  ('2025-2026', 9, 416),
  ('2025-2026', 10, 212),
  ('2025-2026', 11, 142),
  ('2025-2026', 12, 125),
  ('2024-2025', 0, 1445),
  ('2024-2025', 6, 0),
  ('2024-2025', 7, 38),
  ('2024-2025', 8, 99),
  ('2024-2025', 9, 392),
  ('2024-2025', 10, 220),
  ('2024-2025', 11, 129),
  ('2024-2025', 12, 104);
