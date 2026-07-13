'use client';

import { useState, useEffect } from 'react';

const API = 'https://api.ultimatetournaments.com/api';

export default function PaymentSuccessPage() {
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [paymentData, setPaymentData] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get('session_id');

    if (!sessionId) {
      setStatus('error');
      setErrorMsg('No payment session found.');
      return;
    }

    (async () => {
      try {
        const res = await fetch(`${API}/stripe/verify-payment/${sessionId}`);
        const json = await res.json() as any;

        if (json.success && json.data?.paid) {
          setPaymentData(json.data);
          setStatus('success');
        } else if (json.success && !json.data?.paid) {
          setStatus('error');
          setErrorMsg('Payment has not been completed yet. Please try again or contact us.');
        } else {
          setStatus('error');
          setErrorMsg(json.error || 'Could not verify payment.');
        }
      } catch {
        setStatus('error');
        setErrorMsg('Network error verifying payment. Please contact us to confirm.');
      }
    })();
  }, []);

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-[#f5f5f7] flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-3 border-[#00ccff] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-lg font-semibold text-[#1d1d1f]">Confirming your payment...</p>
          <p className="text-sm text-[#6e6e73] mt-2">Please wait while we verify with Stripe.</p>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="min-h-screen bg-[#f5f5f7] flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md text-center">
          <div className="w-16 h-16 rounded-full bg-amber-50 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-[#1d1d1f] mb-2">Payment Issue</h2>
          <p className="text-[#6e6e73] mb-6">{errorMsg}</p>
          <div className="flex flex-col gap-3">
            <a href="/events" className="px-6 py-3 rounded-xl font-semibold text-white bg-[#003e79] hover:bg-[#002d5a] transition-colors">
              Back to Events
            </a>
            <a href="/contact" className="px-6 py-3 rounded-xl font-semibold text-[#003e79] bg-[#f0f7ff] hover:bg-[#e0efff] transition-colors">
              Contact Support
            </a>
          </div>
        </div>
      </div>
    );
  }

  const amountFormatted = paymentData?.amountCents
    ? `$${(paymentData.amountCents / 100).toLocaleString()}`
    : '';

  return (
    <div className="min-h-screen bg-[#f5f5f7] flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl shadow-lg p-8 max-w-lg text-center">
        {/* Success animation */}
        <div className="w-20 h-20 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-6">
          <svg className="w-10 h-10 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>

        <h1 className="text-2xl font-bold text-[#1d1d1f] mb-2">Payment Confirmed!</h1>
        <p className="text-[#6e6e73] text-lg mb-6">
          Your {paymentData?.paymentChoice === 'pay_deposit' ? 'deposit' : 'payment'} of {amountFormatted} has been received.
        </p>

        <div className="bg-[#f5f5f7] rounded-xl p-5 mb-6 text-left">
          <h3 className="text-sm font-semibold text-[#1d1d1f] mb-3">What happens next?</h3>
          <div className="space-y-2.5">
            <div className="flex items-start gap-3">
              <span className="w-6 h-6 rounded-full bg-[#003e79] text-white text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">1</span>
              <p className="text-sm text-[#3d3d3d]">A confirmation email has been sent with your registration details.</p>
            </div>
            <div className="flex items-start gap-3">
              <span className="w-6 h-6 rounded-full bg-[#003e79] text-white text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">2</span>
              <p className="text-sm text-[#3d3d3d]">Our team will review your registration within 24-48 hours.</p>
            </div>
            <div className="flex items-start gap-3">
              <span className="w-6 h-6 rounded-full bg-[#003e79] text-white text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">3</span>
              <p className="text-sm text-[#3d3d3d]">You&apos;ll receive an approval email with hotel booking information and event details.</p>
            </div>
            {paymentData?.paymentChoice === 'pay_deposit' && (
              <div className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-amber-500 text-white text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">!</span>
                <p className="text-sm text-[#3d3d3d]">Remaining balance will be due before the event. We&apos;ll send a reminder.</p>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <a href="/events" className="px-8 py-3 rounded-full font-semibold text-white bg-[#003e79] hover:bg-[#002d5a] transition-colors">
            Browse More Events
          </a>
          <a href="/dashboard/coach" className="px-8 py-3 rounded-full font-semibold text-[#003e79] bg-[#f0f7ff] hover:bg-[#e0efff] transition-colors">
            Go to Dashboard
          </a>
        </div>
      </div>
    </div>
  );
}
