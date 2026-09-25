/**
 * Email template override system.
 *
 * Each automated email template has editable fields (subject, body text, CTA button)
 * that admins can customize via the admin UI. Overrides are stored in D1 and
 * take effect immediately — no deploy needed.
 *
 * Locked (non-editable): header/logo, footer, layout, branding colors, dynamic data sections
 */

export interface TemplateField {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'url';
  defaultValue: string;
  helpText?: string;
  /** Variables that can be used in this field, e.g. {eventName} */
  variables?: string[];
}

export interface TemplateDefinition {
  id: string;
  name: string;
  description: string;
  trigger: string;
  from: string;
  /** Editable fields for this template */
  editableFields: TemplateField[];
}

// ─── TEMPLATE DEFINITIONS WITH EDITABLE FIELDS ────────────────────────

export const TEMPLATE_DEFINITIONS: TemplateDefinition[] = [
  {
    id: 'registration_confirmation',
    name: 'Registration Confirmation',
    description: 'Sent immediately when a team registers for an event (before admin approval)',
    trigger: 'On registration submit',
    from: 'registration@ultimatetournaments.com',
    editableFields: [
      {
        key: 'subject',
        label: 'Subject Line',
        type: 'text',
        defaultValue: 'You have successfully registered to the {eventName} - Ultimate Tournaments',
        variables: ['eventName', 'teamName', 'ageGroup'],
      },
      {
        key: 'heading',
        label: 'Header Title',
        type: 'text',
        defaultValue: 'Registration Received!',
      },
      {
        key: 'heading_subtitle',
        label: 'Header Subtitle',
        type: 'text',
        defaultValue: "We've got your application",
      },
      {
        key: 'body_text',
        label: 'Body Message',
        type: 'textarea',
        defaultValue: 'You have successfully registered for the {eventName}!',
        variables: ['eventName', 'teamName', 'ageGroup', 'division', 'discountCode'],
      },
      {
        key: 'next_steps_title',
        label: '"What Happens Next" Title',
        type: 'text',
        defaultValue: 'What happens next?',
      },
      {
        key: 'next_steps_text',
        label: '"What Happens Next" Message',
        type: 'textarea',
        defaultValue: 'Our team reviews all registrations and approves them within 24-48 hours. You\'ll receive a confirmation email once your spot is secured with details on payment and next steps.',
      },
      {
        key: 'preparation_text',
        label: 'Preparation Checklist',
        type: 'textarea',
        defaultValue: 'In the meantime, please have the following ready:\n• Your approved USA Hockey roster\n• Hotel preferences for your team\n• Payment method (Credit Card, Venmo, or Check)',
      },
    ],
  },
  {
    id: 'approval_unpaid',
    name: 'Registration Approved — Unpaid',
    description: 'Sent when admin approves a registration that has no payment yet. Includes $350 deposit requirement and payment options.',
    trigger: 'On admin approval (no payment)',
    from: 'registration@ultimatetournaments.com',
    editableFields: [
      {
        key: 'subject',
        label: 'Subject Line',
        type: 'text',
        defaultValue: 'Accepted! {eventDate}, {eventCity} - {eventName} - {teamName} - {ageGroup}{divisionText}',
        variables: ['eventName', 'teamName', 'ageGroup', 'eventDate', 'eventCity', 'divisionText'],
      },
      {
        key: 'heading',
        label: 'Header Title',
        type: 'text',
        defaultValue: 'Registration Accepted!',
      },
      {
        key: 'body_intro',
        label: 'Congratulations Message',
        type: 'text',
        defaultValue: 'Congratulations on your registration!',
      },
      {
        key: 'payment_text',
        label: 'Payment Instructions',
        type: 'textarea',
        defaultValue: 'We will hold your spot for 14 days, during which a $350.00 deposit is required. The remaining balance is due 30 days before the tournament starts.',
      },
      {
        key: 'roster_text',
        label: 'Roster Request',
        type: 'textarea',
        defaultValue: 'Please send us your approved hockey roster as soon as it\'s ready — this can be uploaded online through the registration portal or emailed.',
      },
      {
        key: 'deposit_note',
        label: 'Deposit Waiver Note',
        type: 'textarea',
        defaultValue: 'If you need more time for the deposit, please reach out, and we can discuss waiving it.',
      },
    ],
  },
  {
    id: 'approval_deposit',
    name: 'Registration Approved — Deposit Paid',
    description: 'Sent when admin approves a registration where a deposit has been received.',
    trigger: 'On admin approval (deposit received)',
    from: 'registration@ultimatetournaments.com',
    editableFields: [
      {
        key: 'subject',
        label: 'Subject Line',
        type: 'text',
        defaultValue: 'Accepted! {eventDate}, {eventCity} - {eventName} - {teamName} - {ageGroup}{divisionText}',
        variables: ['eventName', 'teamName', 'ageGroup', 'eventDate', 'eventCity', 'divisionText'],
      },
      {
        key: 'heading',
        label: 'Header Title',
        type: 'text',
        defaultValue: 'Registration Accepted!',
      },
      {
        key: 'body_intro',
        label: 'Congratulations Message',
        type: 'text',
        defaultValue: 'Congratulations on your registration!',
      },
      {
        key: 'payment_text',
        label: 'Payment Message',
        type: 'textarea',
        defaultValue: 'Thank you, your deposit has been received. The remaining balance is due 30 days before the tournament starts.',
      },
      {
        key: 'roster_text',
        label: 'Roster Request',
        type: 'textarea',
        defaultValue: 'Please send us your approved hockey roster as soon as it\'s ready — this can be uploaded online through the registration portal or emailed.',
      },
    ],
  },
  {
    id: 'approval_paid',
    name: 'Registration Approved — Fully Paid',
    description: 'Sent when admin approves a fully-paid registration.',
    trigger: 'On admin approval (paid in full)',
    from: 'registration@ultimatetournaments.com',
    editableFields: [
      {
        key: 'subject',
        label: 'Subject Line',
        type: 'text',
        defaultValue: 'Accepted! {eventDate}, {eventCity} - {eventName} - {teamName} - {ageGroup}{divisionText}',
        variables: ['eventName', 'teamName', 'ageGroup', 'eventDate', 'eventCity', 'divisionText'],
      },
      {
        key: 'heading',
        label: 'Header Title',
        type: 'text',
        defaultValue: 'Registration Accepted!',
      },
      {
        key: 'body_intro',
        label: 'Congratulations Message',
        type: 'text',
        defaultValue: 'Congratulations on your registration!',
      },
      {
        key: 'payment_text',
        label: 'Payment Message',
        type: 'textarea',
        defaultValue: 'Thank you, your registration has been paid in full.',
      },
      {
        key: 'roster_text',
        label: 'Roster Request',
        type: 'textarea',
        defaultValue: 'Please send us your approved hockey roster as soon as it\'s ready — this can be uploaded online through the registration portal or emailed.',
      },
    ],
  },
  {
    id: 'event_info_30day',
    name: 'Event Info — 30 Days Out',
    description: 'Sent automatically to every registered team\'s coaches and managers when an event is 30 days from its start date. Pulls the team\'s roster status, payment status, and the event\'s rinks automatically. Teams without a roster online get a large warning that they are not eligible for mobile check-in.',
    trigger: 'Daily — event start date is 30 days away',
    from: 'johnny@ultimatetournaments.com',
    editableFields: [
      {
        key: 'subject',
        label: 'Subject Line',
        type: 'text',
        defaultValue: '{eventName} - Tournament Guide for {teamName} (30 days out)',
        variables: ['eventName', 'teamName', 'eventDates', 'eventCity'],
      },
      {
        key: 'heading',
        label: 'Header Title',
        type: 'text',
        defaultValue: 'Your Tournament Guide',
      },
      {
        key: 'intro_text',
        label: 'Intro Message',
        type: 'textarea',
        defaultValue: 'Thank you for entering your team in the {eventName}. The tournament is 30 days away, and this email has everything your team needs to be ready. Please share it with your parents and players.',
        variables: ['eventName', 'teamName', 'eventDates', 'eventCity'],
      },
      {
        key: 'not_playing_text',
        label: 'Not Playing Note',
        type: 'text',
        defaultValue: 'If you received this email by mistake and your team is not participating, please reply and let us know.',
      },
      {
        key: 'roster_text',
        label: 'Roster Instructions',
        type: 'textarea',
        defaultValue: 'Upload your roster at ultimatetournaments.com, or send us your official roster link from the USA Hockey portal. Once your roster is online, your team is eligible for mobile check-in, live scoring, event promos, and restaurant deals, all from your phone.',
      },
      {
        key: 'checkin_text',
        label: 'Mobile Check-In Message',
        type: 'textarea',
        defaultValue: 'We are offering mobile check-in for this event. Teams with their roster online can check in right from the UHT app when they arrive. Team managers, please check in as soon as you arrive for each game.',
      },
      {
        key: 'payment_text',
        label: 'Payment Instructions (shown only to unpaid teams)',
        type: 'textarea',
        defaultValue: 'Registration balances are due in full at this point. If your team has not yet paid, please take care of it now or reply to this email to make arrangements. We accept credit card, Venmo, and check.',
      },
      {
        key: 'venmo_text',
        label: 'Venmo Details',
        type: 'textarea',
        defaultValue: 'Venmo: @ultimatetournaments (Ultimate Hockey Tournaments, UHT logo) or @john-Schwarz-33 (UHT logo, last 4 digits 6160).',
      },
      {
        key: 'schedule_text',
        label: 'Schedule Message',
        type: 'textarea',
        defaultValue: 'Schedules will be posted in the UHT app on {scheduleDate}, and the app is the only place they are posted. Download the app, follow your team, and turn on notifications so you see your game times the moment they go live. Make sure your parents and players do the same. The welcome letter, tournament rules, and directions to the rinks will be emailed to team managers the same day.\n\nEarliest games on Friday: Mites and Squirts start no earlier than 12pm, Pee Wees no earlier than 2pm, and Bantams and Midgets no earlier than 4pm. Teams traveling the furthest are given scheduling consideration.',
        variables: ['scheduleDate'],
      },
      {
        key: 'scores_text',
        label: 'Live Scores Message',
        type: 'textarea',
        defaultValue: 'Every game is scored live. Follow scores, standings, and brackets in the UHT app or at ultimatetournaments.com from the rink, the hotel, or anywhere else.',
      },
      {
        key: 'jerseys_text',
        label: 'Jerseys Message',
        type: 'textarea',
        defaultValue: 'Home teams wear white jerseys and away teams wear dark. If your team has a jersey conflict, let us know ahead of time.',
      },
      {
        key: 'game_times_text',
        label: 'Game Times Message',
        type: 'textarea',
        defaultValue: 'Games can run ahead of schedule as well as behind. If we have a chance to start a game 15 minutes early, we will, so please have your team at the rink and ready.',
      },
      {
        key: 'locker_text',
        label: 'Locker Rooms Message',
        type: 'text',
        defaultValue: 'Locker room assignments are posted on a board at every rink and pushed to the app.',
      },
      {
        key: 'goody_text',
        label: 'Goody Bags Message',
        type: 'text',
        defaultValue: 'When you arrive for your first game, make sure to pick up your team goody bag from the tournament director.',
      },
      {
        key: 'closing_text',
        label: 'Closing Message',
        type: 'textarea',
        defaultValue: 'Never hesitate to call, email, or text with any questions. We are looking forward to a great weekend of hockey.',
      },
      {
        key: 'signoff',
        label: 'Sign-Off Names',
        type: 'text',
        defaultValue: 'Johnny, Cory, and Nick',
      },
    ],
  },
  {
    id: 'magic_link',
    name: 'Magic Link Login',
    description: 'Sent when a user requests to sign in via email.',
    trigger: 'On login request',
    from: 'registration@ultimatetournaments.com',
    editableFields: [
      {
        key: 'subject',
        label: 'Subject Line',
        type: 'text',
        defaultValue: 'Your Login Link - Ultimate Tournaments',
      },
      {
        key: 'body_text',
        label: 'Body Message',
        type: 'textarea',
        defaultValue: 'Click the button below to sign in to your Ultimate Tournaments account. This link expires in 15 minutes.',
      },
      {
        key: 'cta_text',
        label: 'Button Text',
        type: 'text',
        defaultValue: 'Sign In',
      },
      {
        key: 'footer_text',
        label: 'Footer Note',
        type: 'text',
        defaultValue: "If you didn't request this link, you can safely ignore this email.",
      },
    ],
  },
];

// ─── HELPERS ──────────────────────────────────────────────────────────

/** Get defaults as a flat key→value map */
export function getDefaults(templateId: string): Record<string, string> {
  const def = TEMPLATE_DEFINITIONS.find(t => t.id === templateId);
  if (!def) return {};
  const defaults: Record<string, string> = {};
  for (const field of def.editableFields) {
    defaults[field.key] = field.defaultValue;
  }
  return defaults;
}

/** Merge DB overrides on top of defaults */
export function mergeOverrides(templateId: string, overrides: Record<string, string> | null): Record<string, string> {
  const defaults = getDefaults(templateId);
  if (!overrides) return defaults;
  return { ...defaults, ...overrides };
}

/** Replace {variable} placeholders in a string */
export function replaceVars(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key) => vars[key] ?? match);
}

/** Fetch overrides from D1 for a template */
export async function getOverridesFromDB(db: any, templateId: string): Promise<Record<string, string> | null> {
  const row = await db.prepare(
    'SELECT fields FROM email_template_overrides WHERE template_id = ?'
  ).bind(templateId).first() as { fields: string } | null;
  if (!row?.fields) return null;
  try {
    return JSON.parse(row.fields);
  } catch {
    return null;
  }
}

/** Get the resolved (merged) field values for a template */
export async function getResolvedFields(db: any, templateId: string): Promise<Record<string, string>> {
  const overrides = await getOverridesFromDB(db, templateId);
  return mergeOverrides(templateId, overrides);
}
