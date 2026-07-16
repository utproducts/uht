/*
  ISOLATED PAGE — zero shared component imports.
  Self-contained unsubscribe page. Safe from breakage during site updates.
*/
'use client';

import { useState, useEffect } from 'react';

const API = 'https://uht.chad-157.workers.dev/api';

export default function UnsubscribePage() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error' | 'already'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  // Pre-fill email from URL query param
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const emailParam = params.get('email');
    if (emailParam) {
      setEmail(decodeURIComponent(emailParam));
    }
  }, []);

  const handleUnsubscribe = async () => {
    if (!email || !email.includes('@')) {
      setErrorMsg('Please enter a valid email address.');
      setStatus('error');
      return;
    }

    setStatus('loading');
    setErrorMsg('');

    try {
      // Check current status first
      const checkRes = await fetch(`${API}/email/unsubscribe?email=${encodeURIComponent(email)}`);
      const checkData = await checkRes.json();

      if (checkData.data?.already_unsubscribed) {
        setStatus('already');
        return;
      }

      // Perform unsubscribe
      const res = await fetch(`${API}/email/unsubscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();
      if (data.success) {
        setStatus('success');
      } else {
        setErrorMsg(data.error || 'Something went wrong. Please try again.');
        setStatus('error');
      }
    } catch {
      setErrorMsg('Unable to connect. Please try again later.');
      setStatus('error');
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(180deg, #f8f9fa 0%, #e9ecef 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px 16px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    }}>
      <div style={{
        maxWidth: 480,
        width: '100%',
        backgroundColor: '#ffffff',
        borderRadius: 16,
        boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          backgroundColor: '#003e79',
          padding: '28px 24px',
          textAlign: 'center',
        }}>
          <img
            src="/uht-logo.png"
            alt="Ultimate Hockey Tournaments"
            style={{ height: 56, margin: '0 auto 12px', display: 'block' }}
          />
          <h1 style={{
            fontSize: 22,
            fontWeight: 800,
            color: '#ffffff',
            margin: 0,
          }}>
            Email Preferences
          </h1>
        </div>

        {/* Body */}
        <div style={{ padding: '32px 28px' }}>
          {status === 'success' ? (
            <div style={{ textAlign: 'center' }}>
              <div style={{
                width: 64,
                height: 64,
                borderRadius: '50%',
                backgroundColor: '#d4edda',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 20px',
                fontSize: 32,
              }}>
                <span>&#10003;</span>
              </div>
              <h2 style={{ fontSize: 20, color: '#1d1d1f', margin: '0 0 12px', fontWeight: 700 }}>
                You&apos;ve been unsubscribed
              </h2>
              <p style={{ fontSize: 15, color: '#6e6e73', lineHeight: 1.6, margin: '0 0 24px' }}>
                <strong>{email}</strong> has been removed from our marketing email list.
                You will no longer receive promotional emails from Ultimate Hockey Tournaments.
              </p>
              <p style={{ fontSize: 13, color: '#aeaeb2', lineHeight: 1.5, margin: 0 }}>
                Note: You may still receive transactional emails related to your tournament registrations
                (confirmations, approvals, schedule updates).
              </p>
            </div>
          ) : status === 'already' ? (
            <div style={{ textAlign: 'center' }}>
              <h2 style={{ fontSize: 20, color: '#1d1d1f', margin: '0 0 12px', fontWeight: 700 }}>
                Already unsubscribed
              </h2>
              <p style={{ fontSize: 15, color: '#6e6e73', lineHeight: 1.6, margin: 0 }}>
                <strong>{email}</strong> is already unsubscribed from our marketing emails.
                No further action is needed.
              </p>
            </div>
          ) : (
            <>
              <p style={{ fontSize: 16, color: '#1d1d1f', lineHeight: 1.6, margin: '0 0 24px' }}>
                Enter your email address below to unsubscribe from Ultimate Hockey Tournaments marketing emails.
              </p>

              <div style={{ marginBottom: 20 }}>
                <label style={{
                  display: 'block',
                  fontSize: 13,
                  fontWeight: 600,
                  color: '#6e6e73',
                  marginBottom: 6,
                  textTransform: 'uppercase' as const,
                  letterSpacing: 0.5,
                }}>
                  Email Address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setStatus('idle'); setErrorMsg(''); }}
                  placeholder="your@email.com"
                  style={{
                    width: '100%',
                    padding: '14px 16px',
                    fontSize: 16,
                    border: `2px solid ${status === 'error' ? '#e53e3e' : '#e8e8ed'}`,
                    borderRadius: 10,
                    outline: 'none',
                    boxSizing: 'border-box' as const,
                    fontFamily: 'inherit',
                    transition: 'border-color 0.2s',
                  }}
                  onFocus={(e) => { if (status !== 'error') e.target.style.borderColor = '#003e79'; }}
                  onBlur={(e) => { if (status !== 'error') e.target.style.borderColor = '#e8e8ed'; }}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleUnsubscribe(); }}
                />
              </div>

              {status === 'error' && errorMsg && (
                <p style={{
                  fontSize: 14,
                  color: '#e53e3e',
                  margin: '0 0 16px',
                  padding: '10px 14px',
                  backgroundColor: '#fff5f5',
                  borderRadius: 8,
                }}>
                  {errorMsg}
                </p>
              )}

              <button
                onClick={handleUnsubscribe}
                disabled={status === 'loading'}
                style={{
                  width: '100%',
                  padding: '14px 24px',
                  fontSize: 16,
                  fontWeight: 700,
                  color: '#ffffff',
                  backgroundColor: status === 'loading' ? '#6e6e73' : '#003e79',
                  border: 'none',
                  borderRadius: 10,
                  cursor: status === 'loading' ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit',
                  transition: 'background-color 0.2s',
                }}
              >
                {status === 'loading' ? 'Unsubscribing...' : 'Unsubscribe'}
              </button>

              <p style={{
                fontSize: 13,
                color: '#aeaeb2',
                lineHeight: 1.5,
                margin: '20px 0 0',
                textAlign: 'center',
              }}>
                This will only unsubscribe you from marketing emails.
                You will still receive important transactional emails about your registrations.
              </p>
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{
          backgroundColor: '#f5f5f7',
          padding: '16px 24px',
          textAlign: 'center',
        }}>
          <p style={{ fontSize: 12, color: '#86868b', margin: 0 }}>
            <a href="https://ultimatetournaments.com" style={{ color: '#003e79', textDecoration: 'none' }}>
              ultimatetournaments.com
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
