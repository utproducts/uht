'use client';

import { useState, useRef, useEffect } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://uht.chad-157.workers.dev';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export default function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showEscalation, setShowEscalation] = useState(false);
  const [escalationForm, setEscalationForm] = useState({ name: '', email: '', message: '' });
  const [escalationSent, setEscalationSent] = useState(false);
  const [escalationSending, setEscalationSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // Add welcome message on first open
  useEffect(() => {
    if (isOpen && messages.length === 0) {
      setMessages([{
        role: 'assistant',
        content: 'Hey there! I\'m the UHT assistant. I can help with questions about our tournaments, registration, pricing, venues, and more. What can I help you with?',
      }]);
    }
  }, [isOpen]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    const userMessage: Message = { role: 'user', content: text };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput('');
    setIsLoading(true);

    try {
      // Send conversation history (exclude the welcome message from history sent to API)
      const history = updatedMessages
        .slice(1, -1) // skip welcome message and current user message
        .map(m => ({ role: m.role, content: m.content }));

      const res = await fetch(`${API}/api/chatbot/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          conversationHistory: history.length > 0 ? history : undefined,
        }),
      });

      const data = await res.json();
      const reply = data?.data?.message || 'Sorry, I had trouble with that. Please try again or contact us at info@ultimatetournaments.com.';

      setMessages(prev => [...prev, { role: 'assistant', content: reply }]);
    } catch {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'I\'m having trouble connecting right now. You can reach our team directly at info@ultimatetournaments.com or call (630) 336-6160.',
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const sendEscalation = async () => {
    if (!escalationForm.name || !escalationForm.email || !escalationForm.message) return;
    setEscalationSending(true);

    try {
      // Build chat history summary
      const chatHistory = messages
        .map(m => `${m.role === 'user' ? 'Visitor' : 'AI'}: ${m.content}`)
        .join('\n\n');

      const res = await fetch(`${API}/api/chatbot/escalate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...escalationForm,
          chatHistory,
        }),
      });

      const data = await res.json();
      if (data?.data?.sent) {
        setEscalationSent(true);
      } else {
        // Fallback — show direct contact info
        setEscalationSent(true);
      }
    } catch {
      setEscalationSent(true); // Show success with fallback info
    } finally {
      setEscalationSending(false);
    }
  };

  return (
    <div id="chat-widget" className="fixed bottom-6 right-6 z-50" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
      {/* Chat Panel */}
      {isOpen && (
        <div
          className="mb-3 bg-white rounded-2xl overflow-hidden flex flex-col"
          style={{
            width: '380px',
            maxWidth: 'calc(100vw - 48px)',
            height: '520px',
            maxHeight: 'calc(100vh - 120px)',
            boxShadow: '0 8px 40px rgba(0,0,0,0.15), 0 2px 8px rgba(0,0,0,0.08)',
            border: '1px solid #e8e8ed',
          }}
        >
          {/* Header */}
          <div
            className="px-5 py-4 flex items-center justify-between shrink-0"
            style={{ background: 'linear-gradient(135deg, #003e79 0%, #005599 100%)' }}
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              </div>
              <div>
                <div className="text-white font-semibold text-sm">UHT Assistant</div>
                <div className="text-white/60 text-xs">We typically reply instantly</div>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
              aria-label="Close chat"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Messages or Escalation Form */}
          {showEscalation ? (
            <div className="flex-1 overflow-y-auto p-5">
              {escalationSent ? (
                <div className="text-center py-8">
                  <div className="w-14 h-14 rounded-full bg-green-50 flex items-center justify-center mx-auto mb-4">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold text-[#1d1d1f] mb-2">Message Sent!</h3>
                  <p className="text-sm text-[#6e6e73] leading-relaxed">
                    Our team will get back to you shortly. You can also reach us directly at{' '}
                    <a href="mailto:info@ultimatetournaments.com" className="text-[#003e79] hover:underline">
                      info@ultimatetournaments.com
                    </a>
                  </p>
                  <button
                    onClick={() => { setShowEscalation(false); setEscalationSent(false); setEscalationForm({ name: '', email: '', message: '' }); }}
                    className="mt-5 px-5 py-2 bg-[#003e79] text-white text-sm font-medium rounded-lg hover:bg-[#002d5a] transition-colors"
                  >
                    Back to Chat
                  </button>
                </div>
              ) : (
                <div>
                  <button
                    onClick={() => setShowEscalation(false)}
                    className="flex items-center gap-1 text-sm text-[#6e6e73] hover:text-[#1d1d1f] mb-4 transition-colors"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M19 12H5M12 19l-7-7 7-7" />
                    </svg>
                    Back to chat
                  </button>
                  <h3 className="text-lg font-semibold text-[#1d1d1f] mb-1">Send us a message</h3>
                  <p className="text-sm text-[#6e6e73] mb-5">We&apos;ll get back to you as soon as possible.</p>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-[#6e6e73] mb-1">Your Name</label>
                      <input
                        type="text"
                        value={escalationForm.name}
                        onChange={e => setEscalationForm(f => ({ ...f, name: e.target.value }))}
                        placeholder="John Smith"
                        className="w-full px-3 py-2 text-sm border border-[#d2d2d7] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#003e79]/20 focus:border-[#003e79]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[#6e6e73] mb-1">Email Address</label>
                      <input
                        type="email"
                        value={escalationForm.email}
                        onChange={e => setEscalationForm(f => ({ ...f, email: e.target.value }))}
                        placeholder="john@example.com"
                        className="w-full px-3 py-2 text-sm border border-[#d2d2d7] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#003e79]/20 focus:border-[#003e79]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[#6e6e73] mb-1">Message</label>
                      <textarea
                        value={escalationForm.message}
                        onChange={e => setEscalationForm(f => ({ ...f, message: e.target.value }))}
                        placeholder="How can we help?"
                        rows={4}
                        className="w-full px-3 py-2 text-sm border border-[#d2d2d7] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#003e79]/20 focus:border-[#003e79] resize-none"
                      />
                    </div>
                    <button
                      onClick={sendEscalation}
                      disabled={escalationSending || !escalationForm.name || !escalationForm.email || !escalationForm.message}
                      className="w-full py-2.5 bg-[#003e79] text-white text-sm font-medium rounded-lg hover:bg-[#002d5a] disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                    >
                      {escalationSending ? (
                        <>
                          <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          Sending...
                        </>
                      ) : (
                        'Send Message'
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Messages Area */}
              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3" style={{ scrollBehavior: 'smooth' }}>
                {messages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={`max-w-[85%] px-4 py-2.5 text-sm leading-relaxed ${
                        msg.role === 'user'
                          ? 'bg-[#003e79] text-white rounded-2xl rounded-br-md'
                          : 'bg-[#f0f0f5] text-[#1d1d1f] rounded-2xl rounded-bl-md'
                      }`}
                      style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
                    >
                      {msg.content}
                    </div>
                  </div>
                ))}
                {isLoading && (
                  <div className="flex justify-start">
                    <div className="bg-[#f0f0f5] rounded-2xl rounded-bl-md px-4 py-3 flex items-center gap-1.5">
                      <span className="w-2 h-2 bg-[#86868b] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-2 h-2 bg-[#86868b] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-2 h-2 bg-[#86868b] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Email Escalation Link */}
              <div className="px-4 pb-1">
                <button
                  onClick={() => setShowEscalation(true)}
                  className="text-xs text-[#6e6e73] hover:text-[#003e79] transition-colors flex items-center gap-1"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  Rather email our team directly?
                </button>
              </div>

              {/* Input Area */}
              <div className="px-4 pb-4 pt-2 shrink-0">
                <div className="flex items-end gap-2 bg-[#f5f5f7] rounded-xl border border-[#e8e8ed] focus-within:border-[#003e79] focus-within:ring-2 focus-within:ring-[#003e79]/10 transition-all">
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask about events, registration, pricing..."
                    rows={1}
                    className="flex-1 bg-transparent px-4 py-3 text-sm text-[#1d1d1f] placeholder-[#86868b] resize-none focus:outline-none"
                    style={{ minHeight: '44px', maxHeight: '100px' }}
                  />
                  <button
                    onClick={sendMessage}
                    disabled={!input.trim() || isLoading}
                    className="mr-2 mb-2 w-8 h-8 rounded-full bg-[#003e79] text-white flex items-center justify-center hover:bg-[#002d5a] disabled:opacity-30 disabled:cursor-not-allowed transition-all shrink-0"
                    aria-label="Send message"
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
                    </svg>
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-14 h-14 rounded-full shadow-lg flex items-center justify-center text-white transition-all duration-200 hover:scale-105 active:scale-95"
        style={{
          background: 'linear-gradient(135deg, #003e79 0%, #005599 100%)',
          boxShadow: '0 4px 20px rgba(0,62,121,0.35)',
        }}
        aria-label={isOpen ? 'Close chat' : 'Chat with us'}
      >
        {isOpen ? (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        ) : (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        )}
      </button>
    </div>
  );
}
