'use client';

import { useEffect, useRef } from 'react';

const API_BASE = 'https://uht.chad-157.workers.dev/api';
const HEARTBEAT_INTERVAL = 30000; // 30 seconds

function getSessionId(): string {
  if (typeof window === 'undefined') return '';
  let sid = sessionStorage.getItem('uht_session_id');
  if (!sid) {
    sid = crypto.randomUUID().replace(/-/g, '');
    sessionStorage.setItem('uht_session_id', sid);
  }
  return sid;
}

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('uht_token');
}

async function trackEvent(activityType: string, pagePath?: string, metadata?: Record<string, any>, durationSeconds?: number) {
  try {
    const token = getToken();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    await fetch(`${API_BASE}/analytics/track`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        sessionId: getSessionId(),
        activityType,
        pagePath: pagePath || (typeof window !== 'undefined' ? window.location.pathname : undefined),
        metadata,
        durationSeconds,
      }),
      keepalive: true, // Allow sending even during page unload
    });
  } catch {
    // Silently fail - tracking should never block the user
  }
}

export default function ActivityTracker() {
  const lastPath = useRef('');
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pageStartRef = useRef(Date.now());

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Track initial page view
    const currentPath = window.location.pathname;
    if (currentPath !== lastPath.current) {
      trackEvent('page_view', currentPath);
      lastPath.current = currentPath;
      pageStartRef.current = Date.now();
    }

    // Track login events (check if token just appeared)
    const token = getToken();
    const wasLoggedIn = sessionStorage.getItem('uht_was_logged_in');
    if (token && !wasLoggedIn) {
      trackEvent('login', currentPath);
      sessionStorage.setItem('uht_was_logged_in', 'true');
    } else if (!token && wasLoggedIn) {
      sessionStorage.removeItem('uht_was_logged_in');
    }

    // Heartbeat for time-on-site tracking (every 30s)
    heartbeatRef.current = setInterval(() => {
      trackEvent('session_heartbeat', window.location.pathname, undefined, 30);
    }, HEARTBEAT_INTERVAL);

    // Track navigation changes (for SPAs)
    const handlePopState = () => {
      const newPath = window.location.pathname;
      if (newPath !== lastPath.current) {
        // Send duration for previous page
        const duration = Math.round((Date.now() - pageStartRef.current) / 1000);
        if (duration > 1) {
          trackEvent('page_view', lastPath.current, { duration_on_previous_page: duration });
        }
        trackEvent('page_view', newPath);
        lastPath.current = newPath;
        pageStartRef.current = Date.now();
      }
    };

    // Track page visibility changes
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        const duration = Math.round((Date.now() - pageStartRef.current) / 1000);
        if (duration > 1) {
          trackEvent('session_heartbeat', window.location.pathname, { event: 'tab_hidden' }, duration);
        }
      } else {
        pageStartRef.current = Date.now();
      }
    };

    window.addEventListener('popstate', handlePopState);
    document.addEventListener('visibilitychange', handleVisibility);

    // Intercept link clicks to track navigation
    const handleClick = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest('a');
      if (target && target.href && target.href.startsWith(window.location.origin)) {
        const newPath = new URL(target.href).pathname;
        if (newPath !== lastPath.current) {
          setTimeout(() => {
            if (window.location.pathname !== lastPath.current) {
              trackEvent('page_view', window.location.pathname);
              lastPath.current = window.location.pathname;
              pageStartRef.current = Date.now();
            }
          }, 100);
        }
      }
    };

    document.addEventListener('click', handleClick);

    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      window.removeEventListener('popstate', handlePopState);
      document.removeEventListener('visibilitychange', handleVisibility);
      document.removeEventListener('click', handleClick);
    };
  }, []);

  return null; // This component renders nothing
}

// Export helper for explicit tracking from other components
export { trackEvent };
