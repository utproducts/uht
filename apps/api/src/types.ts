export interface Env {
  // Cloudflare bindings
  DB: D1Database;
  SESSIONS: KVNamespace;
  STORAGE: R2Bucket;

  // API keys (set via wrangler secret)
  STRIPE_SECRET_KEY: string;
  SENDGRID_API_KEY: string;
  TEXTMAGIC_USERNAME: string;
  TEXTMAGIC_API_KEY: string;
  TWILIO_ACCOUNT_SID: string;
  TWILIO_AUTH_TOKEN: string;
  TWILIO_PHONE_NUMBER: string;
  CLAUDE_API_KEY: string;
  JWT_SECRET: string;
  USA_HOCKEY_API_KEY: string;

  // Config
  ENVIRONMENT: string;
  CORS_ORIGIN: string;
}

// User roles
export type UserRole = 'admin' | 'director' | 'organization' | 'coach' | 'manager' | 'parent' | 'scorekeeper' | 'referee';

// Auth context attached to requests
export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  roles: UserRole[];
}

// JWT payload
export interface JWTPayload {
  sub: string;  // user id
  email: string;
  roles: UserRole[];
  iat: number;
  exp: number;
}

// Common response types
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    perPage: number;
    total: number;
    totalPages: number;
  };
}
