-- ============================================================
-- UHT Platform — Initial Database Schema
-- Team-First Data Model
-- ============================================================

-- ========================
-- USERS & AUTHENTICATION
-- ========================

CREATE TABLE users (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  phone TEXT,
  avatar_url TEXT,
  email_verified INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_users_email ON users(email);

-- A user can have multiple roles
CREATE TABLE user_roles (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK(role IN ('admin', 'director', 'organization', 'coach', 'manager', 'parent', 'scorekeeper', 'referee')),
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, role)
);

CREATE INDEX idx_user_roles_user ON user_roles(user_id);
CREATE INDEX idx_user_roles_role ON user_roles(role);

-- Password reset tokens
CREATE TABLE password_resets (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL,
  expires_at TEXT NOT NULL,
  used INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

-- ========================
-- ORGANIZATIONS & TEAMS
-- ========================

CREATE TABLE organizations (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  name TEXT NOT NULL,
  owner_id TEXT NOT NULL REFERENCES users(id),
  usa_hockey_org_id TEXT,
  logo_url TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,
  phone TEXT,
  email TEXT,
  website TEXT,
  notes TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_orgs_owner ON organizations(owner_id);

CREATE TABLE teams (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  organization_id TEXT REFERENCES organizations(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  age_group TEXT NOT NULL,  -- 'mite', '8u', '10u', '12u', '14u', '16u', '18u', 'adult'
  division_level TEXT,       -- 'AA', 'A', 'B', 'C', 'house', etc.
  usa_hockey_team_id TEXT,
  usa_hockey_roster_url TEXT,
  logo_url TEXT,
  city TEXT,
  state TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_teams_org ON teams(organization_id);
CREATE INDEX idx_teams_age ON teams(age_group);
CREATE INDEX idx_teams_age_div ON teams(age_group, division_level);

-- Link coaches to teams
CREATE TABLE team_coaches (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'head' CHECK(role IN ('head', 'assistant')),
  assigned_by TEXT REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(team_id, user_id)
);

CREATE INDEX idx_team_coaches_team ON team_coaches(team_id);
CREATE INDEX idx_team_coaches_user ON team_coaches(user_id);

-- Link managers to teams
CREATE TABLE team_managers (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(team_id, user_id)
);

CREATE INDEX idx_team_managers_team ON team_managers(team_id);
CREATE INDEX idx_team_managers_user ON team_managers(user_id);

-- ========================
-- PLAYERS
-- ========================

CREATE TABLE players (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  date_of_birth TEXT,
  usa_hockey_number TEXT,
  jersey_number TEXT,
  position TEXT CHECK(position IN ('forward', 'defense', 'goalie', NULL)),
  shoots TEXT CHECK(shoots IN ('left', 'right', NULL)),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_players_usa_hockey ON players(usa_hockey_number);

-- Players belong to teams (many-to-many, a player can be on multiple teams)
CREATE TABLE team_players (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'active' CHECK(status IN ('active', 'inactive', 'rostered')),
  added_at TEXT DEFAULT (datetime('now')),
  UNIQUE(team_id, player_id)
);

CREATE INDEX idx_team_players_team ON team_players(team_id);
CREATE INDEX idx_team_players_player ON team_players(player_id);

-- Link players to parent/player user accounts
CREATE TABLE player_guardians (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  relationship TEXT DEFAULT 'parent' CHECK(relationship IN ('parent', 'guardian', 'self')),
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(player_id, user_id)
);

CREATE INDEX idx_player_guardians_player ON player_guardians(player_id);
CREATE INDEX idx_player_guardians_user ON player_guardians(user_id);

-- ========================
-- VENUES / RINKS
-- ========================

CREATE TABLE venues (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  name TEXT NOT NULL,
  address TEXT,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  zip TEXT,
  phone TEXT,
  website TEXT,
  num_rinks INTEGER DEFAULT 1,
  notes TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE venue_rinks (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  venue_id TEXT NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  name TEXT NOT NULL,  -- 'Rink A', 'Sheet 1', etc.
  surface_size TEXT,   -- 'full', 'half', 'olympic'
  capacity INTEGER,
  notes TEXT,
  UNIQUE(venue_id, name)
);

CREATE INDEX idx_venue_rinks_venue ON venue_rinks(venue_id);

-- ========================
-- EVENTS
-- ========================

CREATE TABLE events (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  venue_id TEXT REFERENCES venues(id),
  logo_url TEXT,
  banner_url TEXT,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  registration_open_date TEXT,
  registration_deadline TEXT,
  rules_url TEXT,
  status TEXT DEFAULT 'draft' CHECK(status IN ('draft', 'published', 'registration_open', 'registration_closed', 'active', 'completed', 'cancelled')),
  -- For year-to-year duplication
  source_event_id TEXT REFERENCES events(id),
  season TEXT,  -- 'fall-2026', 'spring-2027', etc.
  scorekeeper_pin TEXT,  -- 4-digit pin for scorekeeper access
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_events_status ON events(status);
CREATE INDEX idx_events_city ON events(city, state);
CREATE INDEX idx_events_dates ON events(start_date, end_date);
CREATE INDEX idx_events_slug ON events(slug);
CREATE INDEX idx_events_season ON events(season);

CREATE TABLE event_divisions (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  age_group TEXT NOT NULL,
  division_level TEXT,
  max_teams INTEGER,
  min_teams INTEGER DEFAULT 3,
  current_team_count INTEGER DEFAULT 0,
  price_cents INTEGER NOT NULL,  -- Store in cents to avoid float issues
  game_format TEXT,  -- '3v3', '4v4', '5v5'
  period_length_minutes INTEGER DEFAULT 12,
  num_periods INTEGER DEFAULT 3,
  notes TEXT,
  status TEXT DEFAULT 'open' CHECK(status IN ('open', 'full', 'closed', 'cancelled')),
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_event_divisions_event ON event_divisions(event_id);
CREATE INDEX idx_event_divisions_age ON event_divisions(age_group);

-- For duplicating events year-to-year
CREATE TABLE event_templates (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  source_event_id TEXT NOT NULL REFERENCES events(id),
  name TEXT NOT NULL,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Directors assigned to events
CREATE TABLE event_directors (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(event_id, user_id)
);

CREATE INDEX idx_event_directors_event ON event_directors(event_id);

-- ========================
-- REGISTRATIONS
-- ========================

CREATE TABLE registrations (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  event_id TEXT NOT NULL REFERENCES events(id),
  event_division_id TEXT NOT NULL REFERENCES event_divisions(id),
  team_id TEXT NOT NULL REFERENCES teams(id),
  registered_by TEXT NOT NULL REFERENCES users(id),
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected', 'waitlisted', 'withdrawn')),
  payment_status TEXT DEFAULT 'unpaid' CHECK(payment_status IN ('unpaid', 'paid', 'refunded', 'partial')),
  stripe_payment_intent_id TEXT,
  stripe_charge_id TEXT,
  amount_cents INTEGER,
  approved_by TEXT REFERENCES users(id),
  approved_at TEXT,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_registrations_event ON registrations(event_id);
CREATE INDEX idx_registrations_team ON registrations(team_id);
CREATE INDEX idx_registrations_status ON registrations(status);
CREATE INDEX idx_registrations_division ON registrations(event_division_id);

-- Snapshot of roster at registration time
CREATE TABLE registration_rosters (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  registration_id TEXT NOT NULL REFERENCES registrations(id) ON DELETE CASCADE,
  player_id TEXT NOT NULL REFERENCES players(id),
  jersey_number TEXT,
  position TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(registration_id, player_id)
);

CREATE INDEX idx_reg_rosters_registration ON registration_rosters(registration_id);

-- ========================
-- SCHEDULING
-- ========================

CREATE TABLE schedule_rules (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  rule_type TEXT NOT NULL,
  -- e.g., 'min_rest_minutes', 'max_games_per_day', 'no_back_to_back',
  -- 'pool_play_games', 'crossover_enabled', 'bracket_type'
  rule_value TEXT NOT NULL,  -- JSON value for flexibility
  priority INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_schedule_rules_event ON schedule_rules(event_id);

CREATE TABLE games (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  event_id TEXT NOT NULL REFERENCES events(id),
  event_division_id TEXT NOT NULL REFERENCES event_divisions(id),
  home_team_id TEXT REFERENCES teams(id),
  away_team_id TEXT REFERENCES teams(id),
  venue_id TEXT REFERENCES venues(id),
  rink_id TEXT REFERENCES venue_rinks(id),
  game_number INTEGER,  -- Display number (Game 1, Game 2, etc.)
  start_time TEXT NOT NULL,
  end_time TEXT,
  game_type TEXT NOT NULL CHECK(game_type IN ('pool', 'quarterfinal', 'semifinal', 'consolation', 'championship', 'placement')),
  pool_name TEXT,  -- 'Pool A', 'Pool B', etc.
  home_score INTEGER DEFAULT 0,
  away_score INTEGER DEFAULT 0,
  period INTEGER DEFAULT 0,
  status TEXT DEFAULT 'scheduled' CHECK(status IN ('scheduled', 'warmup', 'in_progress', 'intermission', 'final', 'cancelled', 'forfeit')),
  is_overtime INTEGER DEFAULT 0,
  is_shootout INTEGER DEFAULT 0,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_games_event ON games(event_id);
CREATE INDEX idx_games_division ON games(event_division_id);
CREATE INDEX idx_games_home ON games(home_team_id);
CREATE INDEX idx_games_away ON games(away_team_id);
CREATE INDEX idx_games_time ON games(start_time);
CREATE INDEX idx_games_status ON games(status);
CREATE INDEX idx_games_venue_rink ON games(venue_id, rink_id);

-- Pool play standings (denormalized for speed)
CREATE TABLE pool_standings (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  event_id TEXT NOT NULL REFERENCES events(id),
  event_division_id TEXT NOT NULL REFERENCES event_divisions(id),
  pool_name TEXT NOT NULL,
  team_id TEXT NOT NULL REFERENCES teams(id),
  wins INTEGER DEFAULT 0,
  losses INTEGER DEFAULT 0,
  ties INTEGER DEFAULT 0,
  goals_for INTEGER DEFAULT 0,
  goals_against INTEGER DEFAULT 0,
  goal_differential INTEGER DEFAULT 0,
  points INTEGER DEFAULT 0,  -- e.g., 2 for win, 1 for tie, 0 for loss
  tiebreaker_rank INTEGER,
  UNIQUE(event_id, event_division_id, pool_name, team_id)
);

CREATE INDEX idx_pool_standings_event_div ON pool_standings(event_id, event_division_id);

-- ========================
-- SCORING / GAME EVENTS
-- ========================

CREATE TABLE game_events (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK(event_type IN (
    'goal', 'assist', 'penalty', 'shot',
    'period_start', 'period_end', 'game_start', 'game_end',
    'timeout', 'goalie_pull', 'goalie_return'
  )),
  team_id TEXT REFERENCES teams(id),
  player_id TEXT REFERENCES players(id),
  assist1_player_id TEXT REFERENCES players(id),
  assist2_player_id TEXT REFERENCES players(id),
  period INTEGER,
  game_time TEXT,  -- 'MM:SS' format
  penalty_type TEXT,
  penalty_minutes INTEGER,
  details TEXT,  -- JSON for extra info
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_game_events_game ON game_events(game_id);
CREATE INDEX idx_game_events_type ON game_events(event_type);
CREATE INDEX idx_game_events_player ON game_events(player_id);

-- Scorekeeper PIN codes per event
CREATE TABLE scorekeeper_pins (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  pin_code TEXT NOT NULL,  -- 4-digit code
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(event_id, pin_code)
);

CREATE INDEX idx_sk_pins_pin ON scorekeeper_pins(pin_code);

-- ========================
-- CONTACTS & COMMUNICATIONS
-- ========================

CREATE TABLE contacts (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id TEXT REFERENCES users(id),
  email TEXT,
  phone TEXT,
  first_name TEXT,
  last_name TEXT,
  organization_name TEXT,
  city TEXT,
  state TEXT,
  source TEXT,  -- 'registration', 'import', 'manual', 'website'
  tags TEXT,  -- JSON array of tags for filtering
  is_subscribed_email INTEGER DEFAULT 1,
  is_subscribed_sms INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_contacts_email ON contacts(email);
CREATE INDEX idx_contacts_phone ON contacts(phone);
CREATE INDEX idx_contacts_user ON contacts(user_id);

CREATE TABLE contact_lists (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  name TEXT NOT NULL,
  description TEXT,
  filter_criteria TEXT,  -- JSON: { age_groups: [], roles: [], cities: [], states: [] }
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Email campaigns
CREATE TABLE email_campaigns (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  body_html TEXT NOT NULL,
  body_text TEXT,
  from_name TEXT DEFAULT 'Ultimate Hockey Tournaments',
  from_email TEXT DEFAULT 'info@ultimatetournaments.com',
  event_id TEXT REFERENCES events(id),  -- Optional: tied to specific event
  template_type TEXT,  -- 'looking_for_teams', 'event_announcement', 'results', 'custom'
  status TEXT DEFAULT 'draft' CHECK(status IN ('draft', 'scheduled', 'sending', 'sent', 'cancelled')),
  scheduled_at TEXT,
  sent_at TEXT,
  sent_by TEXT REFERENCES users(id),
  -- Stats (updated via SendGrid webhooks)
  total_sent INTEGER DEFAULT 0,
  total_delivered INTEGER DEFAULT 0,
  total_opened INTEGER DEFAULT 0,
  total_clicked INTEGER DEFAULT 0,
  total_bounced INTEGER DEFAULT 0,
  total_unsubscribed INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_campaigns_event ON email_campaigns(event_id);
CREATE INDEX idx_campaigns_status ON email_campaigns(status);

CREATE TABLE email_sends (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  campaign_id TEXT NOT NULL REFERENCES email_campaigns(id) ON DELETE CASCADE,
  contact_id TEXT NOT NULL REFERENCES contacts(id),
  sendgrid_message_id TEXT,
  status TEXT DEFAULT 'queued' CHECK(status IN ('queued', 'sent', 'delivered', 'opened', 'clicked', 'bounced', 'dropped', 'unsubscribed')),
  opened_at TEXT,
  clicked_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_email_sends_campaign ON email_sends(campaign_id);
CREATE INDEX idx_email_sends_contact ON email_sends(contact_id);
CREATE INDEX idx_email_sends_sg ON email_sends(sendgrid_message_id);

-- SMS / TextMagic conversations
CREATE TABLE sms_conversations (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  contact_id TEXT REFERENCES contacts(id),
  phone_number TEXT NOT NULL,
  contact_name TEXT,  -- Resolved from contacts DB
  is_read INTEGER DEFAULT 0,
  last_message_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_sms_convos_phone ON sms_conversations(phone_number);
CREATE INDEX idx_sms_convos_contact ON sms_conversations(contact_id);

CREATE TABLE sms_messages (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  conversation_id TEXT NOT NULL REFERENCES sms_conversations(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK(direction IN ('inbound', 'outbound')),
  body TEXT NOT NULL,
  textmagic_message_id TEXT,
  status TEXT DEFAULT 'sent' CHECK(status IN ('queued', 'sent', 'delivered', 'failed', 'received')),
  sent_by TEXT REFERENCES users(id),  -- Which admin sent it
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_sms_messages_convo ON sms_messages(conversation_id);

-- ========================
-- SPONSORS
-- ========================

CREATE TABLE sponsors (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  name TEXT NOT NULL,
  logo_url TEXT,
  website TEXT,
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  notes TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE sponsorship_packages (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  name TEXT NOT NULL,  -- 'Gold', 'Silver', 'Bronze', 'Custom'
  tier TEXT NOT NULL CHECK(tier IN ('platinum', 'gold', 'silver', 'bronze', 'custom')),
  description TEXT,
  price_cents INTEGER NOT NULL,
  benefits TEXT,  -- JSON: { logo_on_jerseys: true, banner_at_rink: true, ... }
  is_seasonal INTEGER DEFAULT 0,  -- true = full season, false = per event
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE event_sponsorships (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  sponsor_id TEXT NOT NULL REFERENCES sponsors(id),
  event_id TEXT REFERENCES events(id),  -- NULL = season-wide
  package_id TEXT NOT NULL REFERENCES sponsorship_packages(id),
  season TEXT,
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'active', 'expired', 'cancelled')),
  payment_status TEXT DEFAULT 'unpaid' CHECK(payment_status IN ('unpaid', 'paid', 'refunded')),
  stripe_payment_intent_id TEXT,
  amount_cents INTEGER,
  start_date TEXT,
  end_date TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_event_sponsorships_event ON event_sponsorships(event_id);
CREATE INDEX idx_event_sponsorships_sponsor ON event_sponsorships(sponsor_id);

-- ========================
-- ICE BOOKING
-- ========================

CREATE TABLE ice_slots (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  venue_id TEXT NOT NULL REFERENCES venues(id),
  rink_id TEXT REFERENCES venue_rinks(id),
  date TEXT NOT NULL,
  start_time TEXT NOT NULL,  -- 'HH:MM' 24hr
  end_time TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL,
  price_cents INTEGER NOT NULL,
  status TEXT DEFAULT 'available' CHECK(status IN ('available', 'held', 'booked', 'blocked')),
  booked_by_name TEXT,
  booked_by_email TEXT,
  booked_by_phone TEXT,
  stripe_payment_intent_id TEXT,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_ice_slots_date ON ice_slots(date);
CREATE INDEX idx_ice_slots_venue ON ice_slots(venue_id);
CREATE INDEX idx_ice_slots_status ON ice_slots(status);

-- ========================
-- CHAMPIONS LOCKER
-- ========================

CREATE TABLE champions (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  event_id TEXT NOT NULL REFERENCES events(id),
  event_division_id TEXT NOT NULL REFERENCES event_divisions(id),
  team_id TEXT NOT NULL REFERENCES teams(id),
  placement TEXT DEFAULT 'champion' CHECK(placement IN ('champion', 'finalist', 'third')),
  declared_at TEXT DEFAULT (datetime('now')),
  merch_email_sent INTEGER DEFAULT 0,
  merch_sms_sent INTEGER DEFAULT 0,
  UNIQUE(event_id, event_division_id, placement)
);

CREATE INDEX idx_champions_event ON champions(event_id);
CREATE INDEX idx_champions_team ON champions(team_id);

CREATE TABLE merch_templates (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  name TEXT NOT NULL,
  product_type TEXT NOT NULL,  -- 'hoodie', 'tshirt', 'hat', 'puck', etc.
  template_url TEXT NOT NULL,  -- R2 path to template file
  preview_url TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE merch_orders (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  champion_id TEXT NOT NULL REFERENCES champions(id),
  contact_id TEXT REFERENCES contacts(id),
  player_name TEXT,
  product_type TEXT NOT NULL,
  size TEXT,
  quantity INTEGER DEFAULT 1,
  customization TEXT,  -- JSON: { team_logo: url, event_name: ..., year: ... }
  preview_url TEXT,  -- Generated preview image
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'paid', 'processing', 'shipped', 'delivered', 'cancelled')),
  stripe_payment_intent_id TEXT,
  amount_cents INTEGER,
  tracking_number TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_merch_orders_champion ON merch_orders(champion_id);

-- ========================
-- AUDIT LOG
-- ========================

CREATE TABLE audit_log (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id TEXT REFERENCES users(id),
  action TEXT NOT NULL,  -- 'registration.approved', 'event.created', 'score.updated', etc.
  entity_type TEXT,
  entity_id TEXT,
  details TEXT,  -- JSON with before/after or extra context
  ip_address TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_audit_action ON audit_log(action);
CREATE INDEX idx_audit_entity ON audit_log(entity_type, entity_id);
CREATE INDEX idx_audit_user ON audit_log(user_id);
CREATE INDEX idx_audit_time ON audit_log(created_at);
