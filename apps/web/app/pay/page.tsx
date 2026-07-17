/*
  ISOLATED PAGE — zero shared component imports.
  Standalone payment page for shared payment links.
  Coaches/managers copy a link and send it to whoever needs to pay.
  Safe from breakage during site updates.
*/
'use client';

import { useState, useEffect, useRef } from 'react';

const API = 'https://uht.chad-157.workers.dev/api';
const STRIPE_PK = 'pk_live_51JT7FXGJu05jTbyJAmm6UfNev2syS1j9F81arSoiT6Fx8JcQhmcjBUUNVxGX0Zf0amJj1H5Ylvdh7FScdopNkxfn00kBBHQuTz';

interface Registration {
  id: string;
  team_name: string;
  age_group: string;
  event_name: string;
  event_slug: string;
  event_city: string;
  event_state: string;
  start_date: string;
  end_date: string;
  status: string;
  payment_status: string;
  price_cents: number;
  deposit_cents: number;
  already_paid: boolean;
}

type Step = 'loading' | 'error' | 'choose' | 'card' | 'processing' | 'success' | 'already_paid';

export default function PayPage() {
  const [step, setStep] = useState<Step>('loading');
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [errorMsg, setErrorMsg] = useState('');
  const [paymentChoice, setPaymentChoice] = useState<'pay_now' | 'pay_deposit'>('pay_now');
  const [email, setEmail] = useState('');
  const [discountCode, setDiscountCode] = useState('');
  const [totalCents, setTotalCents] = useState(0);
  const [stripeInstance, setStripeInstance] = useState<any>(null);
  const [stripeElements, setStripeElements] = useState<any>(null);
  const [paying, setPaying] = useState(false);
  const [paymentIntentId, setPaymentIntentId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const paymentElementRef = useRef<HTMLDivElement>(null);

  // Load registration data from URL params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const regIds = params.get('reg');
    if (!regIds) {
      setErrorMsg('No registration IDs provided. Please use a valid payment link.');
      setStep('error');
      return;
    }

    fetch(`${API}/stripe/payment-info?ids=${encodeURIComponent(regIds)}`)
      .then(r => r.json())
      .then((data: any) => {
        if (!data.success || !data.data?.registrations?.length) {
          setErrorMsg(data.error || 'Registrations not found. The link may be invalid or expired.');
          setStep('error');
          return;
        }
        const regs: Registration[] = data.data.registrations;
        const unpaid = regs.filter(r => !r.already_paid);
        if (unpaid.length === 0) {
          setRegistrations(regs);
          setStep('already_paid');
          return;
        }
        setRegistrations(unpaid);
        setStep('choose');
      })
      .catch(() => {
        setErrorMsg('Unable to load registration details. Please try again.');
        setStep('error');
      });
  }, []);

  // Load Stripe.js
  useEffect(() => {
    if ((window as any).Stripe) {
      setStripeInstance((window as any).Stripe(STRIPE_PK));
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://js.stripe.com/v3/';
    script.onload = () => setStripeInstance((window as any).Stripe(STRIPE_PK));
    document.head.appendChild(script);
  }, []);

  // Mount Stripe Elements when card step is reached
  useEffect(() => {
    if (step !== 'card' || !stripeInstance || !paymentElementRef.current || !clientSecret) return;

    const timer = setTimeout(() => {
      if (!paymentElementRef.current) return;
      const elements = stripeInstance.elements({
        clientSecret,
        appearance: { theme: 'stripe', variables: { colorPrimary: '#003e79' } },
      });
      const paymentElement = elements.create('payment', { layout: 'tabs' });
      paymentElement.mount(paymentElementRef.current);
      setStripeElements(elements);
    }, 150);
    return () => clearTimeout(timer);
  }, [step, stripeInstance, clientSecret]);

  const formatPrice = (cents: number) => `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 0 })}`;
  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const computeTotal = (choice: 'pay_now' | 'pay_deposit') => {
    return registrations.reduce((sum, r) => sum + (choice === 'pay_deposit' ? r.deposit_cents : r.price_cents), 0);
  };

  const handleCreatePaymentIntent = async () => {
    if (!email || !email.includes('@')) {
      setErrorMsg('Please enter a valid email for the payment receipt.');
      return;
    }
    setErrorMsg('');
    setPaying(true);

    try {
      const res = await fetch(`${API}/stripe/create-payment-intent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          registrationIds: registrations.map(r => r.id),
          paymentChoice,
          email,
          eventName: registrations[0].event_name,
          teamNames: registrations.map(r => r.team_name),
          ...(discountCode ? { discountCode } : {}),
        }),
      });
      const data = await res.json() as any;

      if (!data.success) {
        setErrorMsg(data.error || 'Failed to set up payment. Please try again.');
        setPaying(false);
        return;
      }

      if (data.data?.fullyDiscounted) {
        setStep('success');
        setPaying(false);
        return;
      }

      setTotalCents(data.data.totalCents);
      setPaymentIntentId(data.data.paymentIntentId);
      setClientSecret(data.data.clientSecret);
      setStep('card');
      setPaying(false);
    } catch {
      setErrorMsg('Network error. Please check your connection and try again.');
      setPaying(false);
    }
  };

  const handlePaymentSubmit = async () => {
    if (!stripeInstance || !stripeElements) return;
    setPaying(true);
    setErrorMsg('');

    try {
      const { error, paymentIntent } = await stripeInstance.confirmPayment({
        elements: stripeElements,
        redirect: 'if_required',
      });

      if (error) {
        setErrorMsg(error.message || 'Payment failed. Please try again.');
        setPaying(false);
        return;
      }

      if (paymentIntent?.status === 'succeeded') {
        // Confirm with our API (fire-and-forget, webhook is backup)
        fetch(`${API}/stripe/confirm-payment`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paymentIntentId: paymentIntent.id }),
        }).catch(() => {});
        setStep('success');
      } else if (paymentIntent?.status === 'requires_action') {
        setErrorMsg('Additional authentication required. Please follow the prompts from your bank.');
      } else {
        setErrorMsg('Payment could not be completed. Please try again.');
      }
    } catch {
      setErrorMsg('Payment processing error. Please try again.');
    }
    setPaying(false);
  };

  const S = {
    page: { minHeight: '100vh', background: 'linear-gradient(180deg, #f0f4f8 0%, #e2e8f0 100%)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 16px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' } as React.CSSProperties,
    card: { maxWidth: 560, width: '100%', backgroundColor: '#ffffff', borderRadius: 16, boxShadow: '0 4px 24px rgba(0,0,0,0.08)', overflow: 'hidden' } as React.CSSProperties,
    header: { backgroundColor: '#003e79', padding: '24px', textAlign: 'center' as const },
    logo: { height: 48, margin: '0 auto 10px', display: 'block' },
    title: { fontSize: 20, fontWeight: 800, color: '#ffffff', margin: 0 } as React.CSSProperties,
    body: { padding: '28px 24px' },
    label: { display: 'block', fontSize: 13, fontWeight: 600, color: '#6e6e73', marginBottom: 6, textTransform: 'uppercase' as const, letterSpacing: 0.5 } as React.CSSProperties,
    input: { width: '100%', padding: '12px 14px', fontSize: 15, border: '2px solid #e8e8ed', borderRadius: 10, outline: 'none', boxSizing: 'border-box' as const, fontFamily: 'inherit' },
    btn: { width: '100%', padding: '14px 24px', fontSize: 16, fontWeight: 700, color: '#ffffff', backgroundColor: '#003e79', border: 'none', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit' } as React.CSSProperties,
    btnDisabled: { backgroundColor: '#6e6e73', cursor: 'not-allowed' } as React.CSSProperties,
    btnOutline: { width: '100%', padding: '12px 24px', fontSize: 15, fontWeight: 600, color: '#003e79', backgroundColor: '#ffffff', border: '2px solid #003e79', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit' } as React.CSSProperties,
    error: { fontSize: 14, color: '#e53e3e', margin: '0 0 16px', padding: '10px 14px', backgroundColor: '#fff5f5', borderRadius: 8 },
    regCard: { backgroundColor: '#f8f9fa', borderRadius: 10, padding: '14px 16px', marginBottom: 10, borderLeft: '4px solid #003e79' },
    footer: { backgroundColor: '#f5f5f7', padding: '16px 24px', textAlign: 'center' as const },
  };

  return (
    <div style={S.page}>
      <div style={S.card}>
        <div style={S.header}>
          <img src="/uht-logo.png" alt="UHT" style={S.logo} />
          <h1 style={S.title}>Tournament Payment</h1>
        </div>

        <div style={S.body}>
          {step === 'loading' && (
            <p style={{ textAlign: 'center', color: '#6e6e73', fontSize: 16 }}>Loading registration details...</p>
          )}

          {step === 'error' && (
            <div style={{ textAlign: 'center' }}>
              <p style={{ fontSize: 48, margin: '0 0 16px' }}>&#9888;</p>
              <p style={{ fontSize: 16, color: '#1d1d1f', fontWeight: 600, margin: '0 0 8px' }}>Something went wrong</p>
              <p style={{ fontSize: 14, color: '#6e6e73', lineHeight: 1.6, margin: 0 }}>{errorMsg}</p>
            </div>
          )}

          {step === 'already_paid' && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ width: 64, height: 64, borderRadius: '50%', backgroundColor: '#d4edda', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', fontSize: 32 }}>
                <span>&#10003;</span>
              </div>
              <p style={{ fontSize: 20, color: '#1d1d1f', fontWeight: 700, margin: '0 0 8px' }}>Already Paid</p>
              <p style={{ fontSize: 15, color: '#6e6e73', lineHeight: 1.6, margin: 0 }}>
                {registrations.length === 1
                  ? `${registrations[0].team_name} is already paid for ${registrations[0].event_name}.`
                  : 'All registrations on this link are already paid.'}
              </p>
            </div>
          )}

          {step === 'choose' && (
            <>
              {/* Registration summary */}
              <p style={{ fontSize: 15, color: '#6e6e73', margin: '0 0 16px', lineHeight: 1.5 }}>
                Review the registration{registrations.length > 1 ? 's' : ''} below and choose a payment option.
              </p>
              {registrations.map(r => (
                <div key={r.id} style={S.regCard}>
                  <p style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 700, color: '#1d1d1f' }}>{r.team_name}</p>
                  <p style={{ margin: '0 0 2px', fontSize: 13, color: '#003e79', fontWeight: 600 }}>{r.event_name}</p>
                  <p style={{ margin: 0, fontSize: 12, color: '#6e6e73' }}>
                    {r.event_city}, {r.event_state} &middot; {formatDate(r.start_date)} &ndash; {formatDate(r.end_date)}
                    {r.age_group ? ` · ${r.age_group}` : ''}
                  </p>
                  <div style={{ marginTop: 8, display: 'flex', gap: 16 }}>
                    <span style={{ fontSize: 13, color: '#1d1d1f' }}>Full: <strong>{formatPrice(r.price_cents)}</strong></span>
                    <span style={{ fontSize: 13, color: '#6e6e73' }}>Deposit: <strong>{formatPrice(r.deposit_cents)}</strong></span>
                  </div>
                </div>
              ))}

              {/* Payment choice */}
              <div style={{ margin: '20px 0', display: 'flex', gap: 10 }}>
                <button
                  onClick={() => setPaymentChoice('pay_now')}
                  style={{
                    flex: 1, padding: '14px 12px', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit', fontSize: 14, fontWeight: 700,
                    border: paymentChoice === 'pay_now' ? '2px solid #003e79' : '2px solid #e8e8ed',
                    backgroundColor: paymentChoice === 'pay_now' ? '#f0f7ff' : '#ffffff',
                    color: paymentChoice === 'pay_now' ? '#003e79' : '#6e6e73',
                  }}
                >
                  Pay in Full<br />
                  <span style={{ fontSize: 18, fontWeight: 800 }}>{formatPrice(computeTotal('pay_now'))}</span>
                </button>
                <button
                  onClick={() => setPaymentChoice('pay_deposit')}
                  style={{
                    flex: 1, padding: '14px 12px', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit', fontSize: 14, fontWeight: 700,
                    border: paymentChoice === 'pay_deposit' ? '2px solid #003e79' : '2px solid #e8e8ed',
                    backgroundColor: paymentChoice === 'pay_deposit' ? '#f0f7ff' : '#ffffff',
                    color: paymentChoice === 'pay_deposit' ? '#003e79' : '#6e6e73',
                  }}
                >
                  Pay Deposit<br />
                  <span style={{ fontSize: 18, fontWeight: 800 }}>{formatPrice(computeTotal('pay_deposit'))}</span>
                </button>
              </div>

              {/* Discount code */}
              <div style={{ marginBottom: 16 }}>
                <label style={S.label}>Discount Code (optional)</label>
                <input
                  type="text"
                  value={discountCode}
                  onChange={e => setDiscountCode(e.target.value.toUpperCase())}
                  placeholder="e.g. UHT-ABC123"
                  style={S.input}
                />
              </div>

              {/* Email for receipt */}
              <div style={{ marginBottom: 20 }}>
                <label style={S.label}>Email for Receipt</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => { setEmail(e.target.value); setErrorMsg(''); }}
                  placeholder="your@email.com"
                  style={S.input}
                />
              </div>

              {errorMsg && <p style={S.error}>{errorMsg}</p>}

              <button
                onClick={handleCreatePaymentIntent}
                disabled={paying}
                style={{ ...S.btn, ...(paying ? S.btnDisabled : {}) }}
              >
                {paying ? 'Setting up payment...' : `Continue to Payment — ${formatPrice(computeTotal(paymentChoice))}`}
              </button>
            </>
          )}

          {step === 'card' && (
            <>
              <p style={{ fontSize: 15, color: '#6e6e73', margin: '0 0 4px' }}>
                Paying for: <strong>{registrations.map(r => r.team_name).join(', ')}</strong>
              </p>
              <p style={{ fontSize: 22, fontWeight: 800, color: '#003e79', margin: '0 0 20px' }}>
                {formatPrice(totalCents)}
              </p>

              <div ref={paymentElementRef} style={{ marginBottom: 20, minHeight: 100 }} />

              {errorMsg && <p style={S.error}>{errorMsg}</p>}

              <button
                onClick={handlePaymentSubmit}
                disabled={paying || !stripeElements}
                style={{ ...S.btn, ...(paying || !stripeElements ? S.btnDisabled : {}) }}
              >
                {paying ? 'Processing...' : `Pay ${formatPrice(totalCents)}`}
              </button>

              <button
                onClick={() => { setStep('choose'); setStripeElements(null); setErrorMsg(''); }}
                style={{ ...S.btnOutline, marginTop: 10 }}
              >
                Back
              </button>
            </>
          )}

          {step === 'success' && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ width: 72, height: 72, borderRadius: '50%', backgroundColor: '#d4edda', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', fontSize: 36 }}>
                <span>&#10003;</span>
              </div>
              <p style={{ fontSize: 22, color: '#1d1d1f', fontWeight: 800, margin: '0 0 8px' }}>Payment Successful!</p>
              <p style={{ fontSize: 15, color: '#6e6e73', lineHeight: 1.6, margin: '0 0 24px' }}>
                {registrations.map(r => r.team_name).join(', ')} {registrations.length === 1 ? 'is' : 'are'} confirmed for{' '}
                <strong>{registrations[0].event_name}</strong>.
                {email && ` A receipt has been sent to ${email}.`}
              </p>
              <a
                href={`https://ultimatetournaments.com/events/${registrations[0].event_slug}`}
                style={{ ...S.btn, display: 'inline-block', textDecoration: 'none', textAlign: 'center' as const, maxWidth: 280 }}
              >
                View Event Details
              </a>
            </div>
          )}
        </div>

        <div style={S.footer}>
          <p style={{ fontSize: 12, color: '#86868b', margin: 0 }}>
            <a href="https://ultimatetournaments.com" style={{ color: '#003e79', textDecoration: 'none' }}>
              ultimatetournaments.com
            </a>
            {' '}&middot;{' '}Secure payment powered by Stripe
          </p>
        </div>
      </div>
    </div>
  );
}
