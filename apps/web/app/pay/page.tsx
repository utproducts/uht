'use client';

/**
 * Standalone tournament payment page.
 * Reached via payment links: /pay/?reg=<registrationId>[,<registrationId>...]
 *
 * Flow: load registration details (/stripe/payment-info) → choose full/deposit →
 * create PaymentIntent → Stripe Elements card entry → confirm (/stripe/confirm-payment).
 *
 * NOTE: This source was recovered from the deployed production bundle
 * (page-17621e66d9a9243b.js) after the original file was lost. Keep behavior
 * in sync with the /api/stripe routes in apps/api/src/routes/stripe.ts.
 */

import { useEffect, useRef, useState, CSSProperties } from 'react';

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || 'https://uht.chad-157.workers.dev') + '/api';
const STRIPE_PK = 'pk_live_51JT7FXGJu05jTbyJAmm6UfNev2syS1j9F81arSoiT6Fx8JcQhmcjBUUNVxGX0Zf0amJj1H5Ylvdh7FScdopNkxfn00kBBHQuTz';

interface PayRegistration {
  id: string;
  team_name: string;
  event_name: string;
  event_city: string;
  event_state: string;
  event_slug?: string;
  start_date: string;
  end_date: string;
  age_group: string;
  price_cents: number;
  deposit_cents: number;
  already_paid: boolean;
}

type Step = 'loading' | 'error' | 'already_paid' | 'choose' | 'card' | 'success';
type PaymentChoice = 'pay_now' | 'pay_deposit';

export default function PayPage() {
  const [step, setStep] = useState<Step>('loading');
  const [regs, setRegs] = useState<PayRegistration[]>([]);
  const [error, setError] = useState('');
  const [choice, setChoice] = useState<PaymentChoice>('pay_now');
  const [email, setEmail] = useState('');
  const [discountCode, setDiscountCode] = useState('');
  const [totalCents, setTotalCents] = useState(0);
  const [stripe, setStripe] = useState<any>(null);
  const [elements, setElements] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [paymentIntentId, setPaymentIntentId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const cardRef = useRef<HTMLDivElement>(null);

  // Load registration details from the payment link
  useEffect(() => {
    const ids = new URLSearchParams(window.location.search).get('reg');
    if (!ids) {
      setError('No registration IDs provided. Please use a valid payment link.');
      setStep('error');
      return;
    }
    fetch(`${API_BASE}/stripe/payment-info?ids=${encodeURIComponent(ids)}`)
      .then((r) => r.json())
      .then((res) => {
        if (!res.success || !res.data?.registrations?.length) {
          setError(res.error || 'Registrations not found. The link may be invalid or expired.');
          setStep('error');
          return;
        }
        const all: PayRegistration[] = res.data.registrations;
        const unpaid = all.filter((r) => !r.already_paid);
        if (unpaid.length === 0) {
          setRegs(all);
          setStep('already_paid');
          return;
        }
        setRegs(unpaid);
        setStep('choose');
      })
      .catch(() => {
        setError('Unable to load registration details. Please try again.');
        setStep('error');
      });
  }, []);

  // Load Stripe.js
  useEffect(() => {
    if ((window as any).Stripe) {
      setStripe((window as any).Stripe(STRIPE_PK));
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://js.stripe.com/v3/';
    script.onload = () => setStripe((window as any).Stripe(STRIPE_PK));
    document.head.appendChild(script);
  }, []);

  // Mount Stripe Payment Element when entering the card step
  useEffect(() => {
    if (step !== 'card' || !stripe || !cardRef.current || !clientSecret) return;
    const timer = setTimeout(() => {
      if (!cardRef.current) return;
      const els = stripe.elements({
        clientSecret,
        appearance: { theme: 'stripe', variables: { colorPrimary: '#003e79' } },
      });
      els.create('payment', { layout: 'tabs' }).mount(cardRef.current);
      setElements(els);
    }, 150);
    return () => clearTimeout(timer);
  }, [step, stripe, clientSecret]);

  const fmt = (cents: number) =>
    `$${(cents / 100).toLocaleString('en-US', {
      minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
      maximumFractionDigits: 2,
    })}`;

  const fmtDate = (d: string) =>
    new Date(d + 'T12:00:00').toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

  const total = (c: PaymentChoice) =>
    regs.reduce((sum, r) => sum + (c === 'pay_deposit' ? r.deposit_cents : r.price_cents), 0);

  const setupPayment = async () => {
    if (!email || !email.includes('@')) {
      setError('Please enter a valid email for the payment receipt.');
      return;
    }
    setError('');
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/stripe/create-payment-intent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          registrationIds: regs.map((r) => r.id),
          paymentChoice: choice,
          email,
          eventName: regs[0].event_name,
          teamNames: regs.map((r) => r.team_name),
          ...(discountCode ? { discountCode } : {}),
        }),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.error || 'Failed to set up payment. Please try again.');
        setBusy(false);
        return;
      }
      if (data.data?.fullyDiscounted) {
        setStep('success');
        setBusy(false);
        return;
      }
      setTotalCents(data.data.totalCents);
      setPaymentIntentId(data.data.paymentIntentId);
      setClientSecret(data.data.clientSecret);
      setStep('card');
      setBusy(false);
    } catch {
      setError('Network error. Please check your connection and try again.');
      setBusy(false);
    }
  };

  const pay = async () => {
    if (!stripe || !elements) return;
    setBusy(true);
    setError('');
    try {
      const { error: payError, paymentIntent } = await stripe.confirmPayment({
        elements,
        redirect: 'if_required',
      });
      if (payError) {
        setError(payError.message || 'Payment failed. Please try again.');
        setBusy(false);
        return;
      }
      if (paymentIntent?.status === 'succeeded') {
        fetch(`${API_BASE}/stripe/confirm-payment`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paymentIntentId: paymentIntent.id }),
        }).catch(() => {});
        setStep('success');
      } else if (paymentIntent?.status === 'requires_action') {
        setError('Additional authentication required. Please follow the prompts from your bank.');
      } else {
        setError('Payment could not be completed. Please try again.');
      }
    } catch {
      setError('Payment processing error. Please try again.');
    }
    setBusy(false);
  };

  const S: Record<string, CSSProperties> = {
    page: {
      minHeight: '100vh',
      background: 'linear-gradient(180deg, #f0f4f8 0%, #e2e8f0 100%)',
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'center',
      padding: '40px 16px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    },
    card: {
      maxWidth: 560,
      width: '100%',
      backgroundColor: '#ffffff',
      borderRadius: 16,
      boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
      overflow: 'hidden',
    },
    header: { backgroundColor: '#003e79', padding: '24px', textAlign: 'center' },
    logo: { height: 48, margin: '0 auto 10px', display: 'block' },
    title: { fontSize: 20, fontWeight: 800, color: '#ffffff', margin: 0 },
    body: { padding: '28px 24px' },
    label: {
      display: 'block',
      fontSize: 13,
      fontWeight: 600,
      color: '#6e6e73',
      marginBottom: 6,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    input: {
      width: '100%',
      padding: '12px 14px',
      fontSize: 15,
      border: '2px solid #e8e8ed',
      borderRadius: 10,
      outline: 'none',
      boxSizing: 'border-box',
      fontFamily: 'inherit',
    },
    btn: {
      width: '100%',
      padding: '14px 24px',
      fontSize: 16,
      fontWeight: 700,
      color: '#ffffff',
      backgroundColor: '#003e79',
      border: 'none',
      borderRadius: 10,
      cursor: 'pointer',
      fontFamily: 'inherit',
    },
    btnDisabled: { backgroundColor: '#6e6e73', cursor: 'not-allowed' },
    btnOutline: {
      width: '100%',
      padding: '12px 24px',
      fontSize: 15,
      fontWeight: 600,
      color: '#003e79',
      backgroundColor: '#ffffff',
      border: '2px solid #003e79',
      borderRadius: 10,
      cursor: 'pointer',
      fontFamily: 'inherit',
    },
    error: {
      fontSize: 14,
      color: '#e53e3e',
      margin: '0 0 16px',
      padding: '10px 14px',
      backgroundColor: '#fff5f5',
      borderRadius: 8,
    },
    regCard: {
      backgroundColor: '#f8f9fa',
      borderRadius: 10,
      padding: '14px 16px',
      marginBottom: 10,
      borderLeft: '4px solid #003e79',
    },
    footer: { backgroundColor: '#f5f5f7', padding: '16px 24px', textAlign: 'center' },
  };

  const choiceBtn = (selected: boolean): CSSProperties => ({
    flex: 1,
    padding: '14px 12px',
    borderRadius: 10,
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontSize: 14,
    fontWeight: 700,
    border: selected ? '2px solid #003e79' : '2px solid #e8e8ed',
    backgroundColor: selected ? '#f0f7ff' : '#ffffff',
    color: selected ? '#003e79' : '#6e6e73',
  });

  return (
    <div style={S.page}>
      <div style={S.card}>
        <div style={S.header}>
          <img src="/uht-logo.png" alt="UHT" style={S.logo} />
          <h1 style={S.title}>Tournament Payment</h1>
        </div>
        <div style={S.body}>
          {step === 'loading' && (
            <p style={{ textAlign: 'center', color: '#6e6e73', fontSize: 16 }}>
              Loading registration details...
            </p>
          )}

          {step === 'error' && (
            <div style={{ textAlign: 'center' }}>
              <p style={{ fontSize: 48, margin: '0 0 16px' }}>⚠</p>
              <p style={{ fontSize: 16, color: '#1d1d1f', fontWeight: 600, margin: '0 0 8px' }}>
                Something went wrong
              </p>
              <p style={{ fontSize: 14, color: '#6e6e73', lineHeight: 1.6, margin: 0 }}>{error}</p>
            </div>
          )}

          {step === 'already_paid' && (
            <div style={{ textAlign: 'center' }}>
              <div
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: '50%',
                  backgroundColor: '#d4edda',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 20px',
                  fontSize: 32,
                }}
              >
                <span>✓</span>
              </div>
              <p style={{ fontSize: 20, color: '#1d1d1f', fontWeight: 700, margin: '0 0 8px' }}>
                Already Paid
              </p>
              <p style={{ fontSize: 15, color: '#6e6e73', lineHeight: 1.6, margin: 0 }}>
                {regs.length === 1
                  ? `${regs[0].team_name} is already paid for ${regs[0].event_name}.`
                  : 'All registrations on this link are already paid.'}
              </p>
            </div>
          )}

          {step === 'choose' && (
            <>
              <p style={{ fontSize: 15, color: '#6e6e73', margin: '0 0 16px', lineHeight: 1.5 }}>
                Review the registration{regs.length > 1 ? 's' : ''} below and choose a payment
                option.
              </p>
              {regs.map((r) => (
                <div key={r.id} style={S.regCard}>
                  <p style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 700, color: '#1d1d1f' }}>
                    {r.team_name}
                  </p>
                  <p style={{ margin: '0 0 2px', fontSize: 13, color: '#003e79', fontWeight: 600 }}>
                    {r.event_name}
                  </p>
                  <p style={{ margin: 0, fontSize: 12, color: '#6e6e73' }}>
                    {r.event_city}, {r.event_state} · {fmtDate(r.start_date)} –{' '}
                    {fmtDate(r.end_date)}
                    {r.age_group ? ` · ${r.age_group}` : ''}
                  </p>
                  <div style={{ marginTop: 8, display: 'flex', gap: 16 }}>
                    <span style={{ fontSize: 13, color: '#1d1d1f' }}>
                      Full: <strong>{fmt(r.price_cents)}</strong>
                    </span>
                    <span style={{ fontSize: 13, color: '#6e6e73' }}>
                      Deposit: <strong>{fmt(r.deposit_cents)}</strong>
                    </span>
                  </div>
                </div>
              ))}

              <div style={{ margin: '20px 0', display: 'flex', gap: 10 }}>
                <button onClick={() => setChoice('pay_now')} style={choiceBtn(choice === 'pay_now')}>
                  Pay in Full
                  <br />
                  <span style={{ fontSize: 18, fontWeight: 800 }}>{fmt(total('pay_now'))}</span>
                </button>
                <button
                  onClick={() => setChoice('pay_deposit')}
                  style={choiceBtn(choice === 'pay_deposit')}
                >
                  Pay Deposit
                  <br />
                  <span style={{ fontSize: 18, fontWeight: 800 }}>{fmt(total('pay_deposit'))}</span>
                </button>
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={S.label}>Discount Code (optional)</label>
                <input
                  type="text"
                  value={discountCode}
                  onChange={(e) => setDiscountCode(e.target.value.toUpperCase())}
                  placeholder="e.g. UHT-ABC123"
                  style={S.input}
                />
              </div>

              <div style={{ marginBottom: 20 }}>
                <label style={S.label}>Email for Receipt</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setError('');
                  }}
                  placeholder="your@email.com"
                  style={S.input}
                />
              </div>

              {error && <p style={S.error}>{error}</p>}

              <button
                onClick={setupPayment}
                disabled={busy}
                style={{ ...S.btn, ...(busy ? S.btnDisabled : {}) }}
              >
                {busy ? 'Setting up payment...' : `Continue to Payment — ${fmt(total(choice))}`}
              </button>
            </>
          )}

          {step === 'card' && (
            <>
              <p style={{ fontSize: 15, color: '#6e6e73', margin: '0 0 4px' }}>
                Paying for: <strong>{regs.map((r) => r.team_name).join(', ')}</strong>
              </p>
              <p style={{ fontSize: 22, fontWeight: 800, color: '#003e79', margin: '0 0 20px' }}>
                {fmt(totalCents)}
              </p>
              <div ref={cardRef} style={{ marginBottom: 20, minHeight: 100 }} />
              {error && <p style={S.error}>{error}</p>}
              <button
                onClick={pay}
                disabled={busy || !elements}
                style={{ ...S.btn, ...(busy || !elements ? S.btnDisabled : {}) }}
              >
                {busy ? 'Processing...' : `Pay ${fmt(totalCents)}`}
              </button>
              <button
                onClick={() => {
                  setStep('choose');
                  setElements(null);
                  setError('');
                }}
                style={{ ...S.btnOutline, marginTop: 10 }}
              >
                Back
              </button>
            </>
          )}

          {step === 'success' && (
            <div style={{ textAlign: 'center' }}>
              <div
                style={{
                  width: 72,
                  height: 72,
                  borderRadius: '50%',
                  backgroundColor: '#d4edda',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 20px',
                  fontSize: 36,
                }}
              >
                <span>✓</span>
              </div>
              <p style={{ fontSize: 22, color: '#1d1d1f', fontWeight: 800, margin: '0 0 8px' }}>
                Payment Successful!
              </p>
              <p style={{ fontSize: 15, color: '#6e6e73', lineHeight: 1.6, margin: '0 0 24px' }}>
                {regs.map((r) => r.team_name).join(', ')} {regs.length === 1 ? 'is' : 'are'}{' '}
                confirmed for <strong>{regs[0].event_name}</strong>.
                {email && ` A receipt has been sent to ${email}.`}
              </p>
              <a
                href={`https://ultimatetournaments.com/events/${regs[0].event_slug}`}
                style={{
                  ...S.btn,
                  display: 'inline-block',
                  textDecoration: 'none',
                  textAlign: 'center',
                  maxWidth: 280,
                }}
              >
                View Event Details
              </a>
            </div>
          )}
        </div>

        <div style={S.footer}>
          <p style={{ fontSize: 12, color: '#86868b', margin: 0 }}>
            <a
              href="https://ultimatetournaments.com"
              style={{ color: '#003e79', textDecoration: 'none' }}
            >
              ultimatetournaments.com
            </a>{' '}
            · Secure payment powered by Stripe
          </p>
        </div>
      </div>
    </div>
  );
}
