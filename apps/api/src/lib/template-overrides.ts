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
        variables: ['eventName', 'teamName', 'ageGroup', 'division'],
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
