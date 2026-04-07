'use client';

import { useState } from 'react';

export default function ContactPage() {
  const [form, setForm] = useState({ name: '', phone: '', email: '', interest: 'general', message: '' });
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // TODO: wire to API / SendGrid
    setSubmitted(true);
  };

  return (
    <div className="min-h-screen bg-[#fafafa]">
      {/* Hero */}
      <div className="relative overflow-hidden bg-gradient-to-br from-[#003e79] via-[#005599] to-[#00ccff]">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-white/10 rounded-full -translate-y-1/2 translate-x-1/4 blur-3xl" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-[#00ccff]/20 rounded-full translate-y-1/2 -translate-x-1/4 blur-3xl" />

        <div className="relative z-10 max-w-7xl mx-auto px-6 sm:px-8 lg:px-12 pt-16 pb-20 text-center">
          <h1 className="text-4xl sm:text-5xl font-extrabold text-white tracking-tight">Get in Touch</h1>
          <p className="mt-4 text-lg text-white/70 max-w-xl mx-auto">
            Have a question about an upcoming tournament, registration, or sponsorship? We&apos;d love to hear from you.
          </p>
        </div>

        <div className="absolute bottom-0 left-0 right-0">
          <svg viewBox="0 0 1440 60" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full" preserveAspectRatio="none">
            <path d="M0 60V0c240 40 480 60 720 60s480-20 720-60v60H0z" fill="#fafafa" />
          </svg>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-12 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-10">
          {/* Contact Info */}
          <div className="lg:col-span-2 space-y-6">
            {/* John */}
            <div className="bg-white rounded-2xl border border-[#e8e8ed] shadow-[0_1px_20px_-6px_rgba(0,0,0,0.08)] p-6">
              <h3 className="text-lg font-bold text-[#1d1d1f] mb-1">John Schwarz</h3>
              <p className="text-sm text-[#6e6e73] mb-4">Owner</p>
              <div className="space-y-3">
                <a href="mailto:john@ultimatetournaments.net" className="flex items-center gap-3 text-sm text-[#3d3d3d] hover:text-[#003e79] transition-colors">
                  <span className="w-9 h-9 rounded-full bg-[#f0f7ff] flex items-center justify-center shrink-0">
                    <svg className="w-4 h-4 text-[#003e79]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                  </span>
                  john@ultimatetournaments.net
                </a>
                <a href="tel:+16303366160" className="flex items-center gap-3 text-sm text-[#3d3d3d] hover:text-[#003e79] transition-colors">
                  <span className="w-9 h-9 rounded-full bg-[#f0f7ff] flex items-center justify-center shrink-0">
                    <svg className="w-4 h-4 text-[#003e79]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                  </span>
                  (630) 336-6160
                </a>
              </div>
            </div>

            {/* Johnny */}
            <div className="bg-white rounded-2xl border border-[#e8e8ed] shadow-[0_1px_20px_-6px_rgba(0,0,0,0.08)] p-6">
              <h3 className="text-lg font-bold text-[#1d1d1f] mb-1">Johnny Schwarz</h3>
              <p className="text-sm text-[#6e6e73] mb-4">Tournament Operations</p>
              <div className="space-y-3">
                <a href="mailto:johnny@ultimatetournaments.com" className="flex items-center gap-3 text-sm text-[#3d3d3d] hover:text-[#003e79] transition-colors">
                  <span className="w-9 h-9 rounded-full bg-[#f0f7ff] flex items-center justify-center shrink-0">
                    <svg className="w-4 h-4 text-[#003e79]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                  </span>
                  johnny@ultimatetournaments.com
                </a>
                <a href="tel:+16303366175" className="flex items-center gap-3 text-sm text-[#3d3d3d] hover:text-[#003e79] transition-colors">
                  <span className="w-9 h-9 rounded-full bg-[#f0f7ff] flex items-center justify-center shrink-0">
                    <svg className="w-4 h-4 text-[#003e79]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                  </span>
                  (630) 336-6175
                </a>
              </div>
            </div>

            {/* Cory */}
            <div className="bg-white rounded-2xl border border-[#e8e8ed] shadow-[0_1px_20px_-6px_rgba(0,0,0,0.08)] p-6">
              <h3 className="text-lg font-bold text-[#1d1d1f] mb-1">Cory Schwarz</h3>
              <p className="text-sm text-[#6e6e73] mb-4">Tournament Operations</p>
              <div className="space-y-3">
                <a href="mailto:cory@ultimatetournaments.com" className="flex items-center gap-3 text-sm text-[#3d3d3d] hover:text-[#003e79] transition-colors">
                  <span className="w-9 h-9 rounded-full bg-[#f0f7ff] flex items-center justify-center shrink-0">
                    <svg className="w-4 h-4 text-[#003e79]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                  </span>
                  cory@ultimatetournaments.com
                </a>
                <a href="tel:+16303360608" className="flex items-center gap-3 text-sm text-[#3d3d3d] hover:text-[#003e79] transition-colors">
                  <span className="w-9 h-9 rounded-full bg-[#f0f7ff] flex items-center justify-center shrink-0">
                    <svg className="w-4 h-4 text-[#003e79]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                  </span>
                  (630) 336-0608
                </a>
              </div>
            </div>

            {/* Mailing Address */}
            <div className="bg-white rounded-2xl border border-[#e8e8ed] shadow-[0_1px_20px_-6px_rgba(0,0,0,0.08)] p-6">
              <h3 className="text-base font-bold text-[#1d1d1f] mb-3">Mailing Address</h3>
              <div className="flex items-start gap-3">
                <span className="w-9 h-9 rounded-full bg-[#f0f7ff] flex items-center justify-center shrink-0 mt-0.5">
                  <svg className="w-4 h-4 text-[#003e79]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                </span>
                <div className="text-sm text-[#3d3d3d] leading-relaxed">
                  <p>477 Dunlay Street</p>
                  <p>Wood Dale, IL 60191</p>
                </div>
              </div>
            </div>
          </div>

          {/* Contact Form */}
          <div className="lg:col-span-3">
            <div className="bg-white rounded-2xl border border-[#e8e8ed] shadow-[0_1px_20px_-6px_rgba(0,0,0,0.08)] p-8">
              {submitted ? (
                <div className="text-center py-12">
                  <div className="w-16 h-16 mx-auto mb-5 rounded-full bg-emerald-50 flex items-center justify-center">
                    <svg className="w-8 h-8 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                  </div>
                  <h3 className="text-2xl font-bold text-[#1d1d1f] mb-2">Message Sent!</h3>
                  <p className="text-[#6e6e73] max-w-sm mx-auto">
                    Thank you for reaching out. We&apos;ll get back to you as soon as possible.
                  </p>
                  <button
                    onClick={() => { setSubmitted(false); setForm({ name: '', phone: '', email: '', interest: 'general', message: '' }); }}
                    className="mt-6 px-6 py-2.5 rounded-full text-sm font-semibold text-[#003e79] bg-[#f0f7ff] hover:bg-[#e0efff] transition-colors"
                  >
                    Send Another Message
                  </button>
                </div>
              ) : (
                <>
                  <h2 className="text-2xl font-bold text-[#1d1d1f] mb-1">Send Us a Message</h2>
                  <p className="text-sm text-[#6e6e73] mb-6">Fill out the form below and we&apos;ll respond within 24 hours.</p>

                  <form onSubmit={handleSubmit} className="space-y-5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-[#1d1d1f] mb-1.5">Name</label>
                        <input
                          type="text"
                          required
                          value={form.name}
                          onChange={e => setForm({ ...form, name: e.target.value })}
                          className="w-full px-4 py-2.5 rounded-xl border border-[#e8e8ed] text-sm text-[#1d1d1f] placeholder:text-[#86868b] focus:outline-none focus:ring-2 focus:ring-[#003e79]/20 focus:border-[#003e79]/30"
                          placeholder="Your name"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-[#1d1d1f] mb-1.5">Phone</label>
                        <input
                          type="tel"
                          value={form.phone}
                          onChange={e => setForm({ ...form, phone: e.target.value })}
                          className="w-full px-4 py-2.5 rounded-xl border border-[#e8e8ed] text-sm text-[#1d1d1f] placeholder:text-[#86868b] focus:outline-none focus:ring-2 focus:ring-[#003e79]/20 focus:border-[#003e79]/30"
                          placeholder="(555) 555-5555"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-[#1d1d1f] mb-1.5">Email</label>
                      <input
                        type="email"
                        required
                        value={form.email}
                        onChange={e => setForm({ ...form, email: e.target.value })}
                        className="w-full px-4 py-2.5 rounded-xl border border-[#e8e8ed] text-sm text-[#1d1d1f] placeholder:text-[#86868b] focus:outline-none focus:ring-2 focus:ring-[#003e79]/20 focus:border-[#003e79]/30"
                        placeholder="you@email.com"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-[#1d1d1f] mb-1.5">Interested In</label>
                      <select
                        value={form.interest}
                        onChange={e => setForm({ ...form, interest: e.target.value })}
                        className="w-full px-4 py-2.5 rounded-xl border border-[#e8e8ed] text-sm text-[#1d1d1f] bg-white focus:outline-none focus:ring-2 focus:ring-[#003e79]/20 focus:border-[#003e79]/30"
                      >
                        <option value="general">General Inquiries</option>
                        <option value="tournament">Tournament Information</option>
                        <option value="sponsorship">Sponsorship Opportunities</option>
                        <option value="ice">Ice Time Booking</option>
                        <option value="careers">Careers</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-[#1d1d1f] mb-1.5">Message</label>
                      <textarea
                        required
                        rows={5}
                        value={form.message}
                        onChange={e => setForm({ ...form, message: e.target.value })}
                        className="w-full px-4 py-2.5 rounded-xl border border-[#e8e8ed] text-sm text-[#1d1d1f] placeholder:text-[#86868b] focus:outline-none focus:ring-2 focus:ring-[#003e79]/20 focus:border-[#003e79]/30 resize-none"
                        placeholder="How can we help you?"
                      />
                    </div>

                    <button
                      type="submit"
                      className="w-full py-3 rounded-full bg-[#003e79] text-white font-semibold text-base hover:bg-[#002d5a] active:scale-[0.98] transition-all shadow-md"
                    >
                      Send Message
                    </button>
                  </form>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
