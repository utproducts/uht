'use client';

import { useState } from 'react';

interface FAQItem {
  question: string;
  answer: string;
}

interface FAQCategory {
  name: string;
  icon: string;
  description: string;
  items: FAQItem[];
}

const faqData: FAQCategory[] = [
  {
    name: 'Getting Started',
    icon: '🏒',
    description: 'Everything you need to know before your first tournament',
    items: [
      {
        question: 'How do I register my team?',
        answer: 'Register through ultimatetournaments.com/upcoming-events. Select your event and click the "Register" button. You\'ll fill in your team details, select your age group and division, choose your hotel preferences, and submit payment or select the pay-later option.',
      },
      {
        question: 'What do I need to bring to the event?',
        answer: 'Managers need Roster Stickers (3 per game) and an official USA Hockey Roster. Parents should bring their family and a positive attitude! Coaches should bring pucks, water bottles, and any coaching accessories they need.',
      },
      {
        question: 'Do I need an official USA Hockey roster?',
        answer: 'Yes — all Squirt through Midget teams are required to have an official USA Hockey roster. Contact your club registrar to obtain one before the event.',
      },
      {
        question: 'Are you AAU or USA Hockey?',
        answer: 'Our events are sanctioned through USA Hockey for Squirt through Midget age levels, and through AAU for Mites/U9.',
      },
      {
        question: 'When is your next event?',
        answer: 'Check out our upcoming events page at ultimatetournaments.com/upcoming-events for the latest schedule and open registration.',
      },
    ],
  },
  {
    name: 'Event Details',
    icon: '📋',
    description: 'Games, schedules, brackets, and what to expect on-site',
    items: [
      {
        question: 'How many games are guaranteed?',
        answer: 'Indoor and hybrid tournaments guarantee four games. Our outdoor Winter Wonderland events guarantee three games.',
      },
      {
        question: 'What time is the first game?',
        answer: 'First games will not begin until after noon (12pm) on the first day. This is so teams don\'t have to check in to hotels a night early just for an early morning game.',
      },
      {
        question: 'Can games start early?',
        answer: 'Yes — per tournament rules, games can start up to 15 minutes early if both teams are ready and agree.',
      },
      {
        question: 'What are the period lengths?',
        answer: 'Period lengths are determined by each age level and location. You can view the specific period lengths by visiting the upcoming-events page, clicking "Quick View" on your event.',
      },
      {
        question: 'Where is the schedule?',
        answer: 'Schedules are sent directly to managers and coaches 10 days before the event. They are also posted online 3 days before the event under each tournament\'s "Quick View" then "Schedule" section.',
      },
      {
        question: 'Where are brackets and scores posted?',
        answer: 'Brackets and scores are posted online under your event\'s "Quick View" then "Schedule" section. They are updated in real-time throughout the tournament.',
      },
      {
        question: 'How do brackets work?',
        answer: 'You play each team in your division once. The point system is: 2 points for a win, 1 point for a tie, and 0 points for a loss. Final placement is determined by total points, with tiebreakers applied when needed.',
      },
      {
        question: 'What locker room are we in?',
        answer: 'You\'ll be notified via text approximately 1 hour before your game. If you haven\'t subscribed to text updates, the on-site directors can provide locker room assignments when you arrive.',
      },
      {
        question: 'Who hires the referees?',
        answer: 'The state governing body supplies all referees for our events.',
      },
      {
        question: 'Do we need to supply a scorekeeper or clock operator?',
        answer: 'No — we supply both the scorekeeper and clock operator. However, each team is required to provide one person per game to assist in the penalty box.',
      },
    ],
  },
  {
    name: 'Divisions & Skill Levels',
    icon: '🏆',
    description: 'Finding the right competitive level for your team',
    items: [
      {
        question: 'What division should my team be in?',
        answer: 'Use your state\'s classification system as a guide to match your team to the appropriate division. If you\'re unsure, don\'t hesitate to reach out and we can help you find the right fit.',
      },
      {
        question: 'Do you offer specific divisions?',
        answer: 'Yes — we offer all age levels and divisions. Specific brackets are determined based on registration numbers to ensure competitive and balanced matchups.',
      },
      {
        question: 'How do you determine divisions?',
        answer: 'Brackets are carefully created for competitiveness based on age, skill level, and state classifications. Our goal is to give every team meaningful, competitive games.',
      },
      {
        question: 'Why is a particular team in my bracket?',
        answer: 'Brackets are built for competitive balance. If you feel your team has been misplaced, please speak with the on-site director and we\'ll do our best to address it.',
      },
    ],
  },
  {
    name: 'Pricing & Payment',
    icon: '💳',
    description: 'Costs, payment options, discounts, and refunds',
    items: [
      {
        question: 'What is the cost of the event?',
        answer: 'Costs vary by location and age level. Visit ultimatetournaments.com/upcoming-events, select your event, click "Quick View," and scroll down to see pricing for each division.',
      },
      {
        question: 'How do we pay?',
        answer: 'We accept credit card payments through our website, Venmo (@ultimatetournaments), or checks mailed to 477 Dunlay Street, Wood Dale, IL 60191.',
      },
      {
        question: 'Are there multi-tournament discounts?',
        answer: 'Yes! Discounts vary based on the number of events played and hotel rooms used. Contact us for details on multi-event pricing.',
      },
      {
        question: 'Are there multi-team discounts?',
        answer: 'Yes — we offer discounts depending on the number of teams you bring per event. Reach out for specific pricing.',
      },
      {
        question: 'What is the refund policy?',
        answer: 'A full refund is available if cancelled 30 or more days before the event. Cancellations within 30 days of the event risk losing the full payment amount.',
      },
    ],
  },
  {
    name: 'Hotels & Travel',
    icon: '🏨',
    description: 'Stay-to-play policy, hotel options, and local team info',
    items: [
      {
        question: 'Is this event stay-to-play?',
        answer: 'Yes — all of our events are stay-to-play. Team managers select their top three hotel preferences during the registration process, and we assign hotels based on availability.',
      },
      {
        question: 'What is considered a local team?',
        answer: 'Teams with home rinks within 75 miles of the tournament location are considered local and are exempt from the stay-to-play requirement.',
      },
      {
        question: 'What if my team is local but wants to book hotel rooms?',
        answer: 'Contact your team manager to take advantage of our tournament-discounted hotel pricing. Even local teams can benefit from the group rates we\'ve negotiated.',
      },
      {
        question: 'Do we get any comped rooms?',
        answer: 'Teams can qualify for one comped coach/manager room by staying at two events with 15+ rooms booked per event. The refund is issued after the stay is completed.',
      },
      {
        question: "What's something fun to do in the area?",
        answer: 'Follow our event text updates for local activities, restaurant recommendations, and exclusive promotions at partnering businesses near the tournament venue.',
      },
    ],
  },
  {
    name: 'Merchandise & Extras',
    icon: '👕',
    description: 'Event merchandise, welcome bags, and special experiences',
    items: [
      {
        question: 'Can I buy event merchandise?',
        answer: 'Absolutely! Merchandise is available for purchase at the event. After the event, we also send out merchandise offerings to tournament subscribers that can be mailed directly to you.',
      },
      {
        question: 'Where do we get welcome bags?',
        answer: 'Team managers receive welcome bags at their first game check-in at the tournament director\'s table.',
      },
      {
        question: 'How can we order t-shirts after the event?',
        answer: 'A post-event merchandise link is sent to all tournament subscribers. You can browse and order shirts, hoodies, and other gear to be shipped directly to you.',
      },
      {
        question: 'How do we set up a Blackhawks locker room tour?',
        answer: 'For events at Fifth Third Arena, a representative will email team managers prior to the event with details on how to arrange locker room tours for your team.',
      },
      {
        question: 'How can I replace a missing or broken trophy?',
        answer: 'Have your team manager or coach contact us directly and we\'ll arrange a replacement.',
      },
      {
        question: 'How do I get missing scoresheets?',
        answer: 'Team managers or coaches can contact us directly and we\'ll provide copies of any scoresheets you need.',
      },
    ],
  },
  {
    name: 'Special Requests',
    icon: '💬',
    description: 'Schedule preferences, game time requests, and more',
    items: [
      {
        question: 'What if I need a special game time or have other requests?',
        answer: 'Let us know during registration using the notes section on the form, or email john@ultimatetournaments.net. We do our best to accommodate all reasonable requests.',
      },
      {
        question: 'What rinks do you use?',
        answer: 'Rink information is available for each event. Visit the upcoming-events page and click "Quick View" under your event to see venue details, addresses, and rink specifications.',
      },
    ],
  },
];

function FAQAccordion({ item, isOpen, onToggle }: { item: FAQItem; isOpen: boolean; onToggle: () => void }) {
  return (
    <div className={`border-b border-[#e8e8ed] last:border-0 ${isOpen ? 'bg-[#f9f9fb]' : ''}`}>
      <button
        onClick={onToggle}
        className="w-full text-left px-6 py-4 flex items-center gap-3 hover:bg-[#fafafa] transition"
      >
        <svg
          className={`w-5 h-5 text-[#003e79] shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
        </svg>
        <span className="font-medium text-[#1d1d1f] text-sm">{item.question}</span>
      </button>
      {isOpen && (
        <div className="px-6 pb-4 pl-14">
          <p className="text-sm text-[#3d3d3d] leading-relaxed">{item.answer}</p>
        </div>
      )}
    </div>
  );
}

export default function FAQPage() {
  const [openItems, setOpenItems] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const toggleItem = (key: string) => {
    setOpenItems(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Filter by search
  const filteredCategories = faqData
    .map(cat => ({
      ...cat,
      items: cat.items.filter(item =>
        !search ||
        item.question.toLowerCase().includes(search.toLowerCase()) ||
        item.answer.toLowerCase().includes(search.toLowerCase())
      ),
    }))
    .filter(cat => cat.items.length > 0);

  // If active category filter
  const displayCategories = activeCategory
    ? filteredCategories.filter(c => c.name === activeCategory)
    : filteredCategories;

  const totalQuestions = faqData.reduce((sum, c) => sum + c.items.length, 0);
  const matchCount = filteredCategories.reduce((sum, c) => sum + c.items.length, 0);

  return (
    <div className="min-h-screen bg-[#fafafa]">
      {/* Hero Section */}
      <div className="relative overflow-hidden pt-16 pb-12">
        {/* Gradient background with orbs */}
        <div className="absolute inset-0 bg-gradient-to-r from-[#003e79] via-[#005599] to-[#00ccff] -z-10" />

        {/* Blurred orbs */}
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-[#00ccff] rounded-full opacity-20 blur-3xl -z-10" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-[#003e79] rounded-full opacity-20 blur-3xl -z-10" />

        <div className="max-w-4xl mx-auto px-4 text-center">
          <h1 className="text-5xl font-bold text-white mb-4 leading-tight">Frequently Asked Questions</h1>
          <p className="text-white/80 max-w-2xl mx-auto mb-10 text-lg">
            Find answers to common questions about Ultimate Hockey Tournaments. Can't find what you're looking for?
            We're here to help.
          </p>

          {/* Search Input */}
          <div className="max-w-xl mx-auto relative">
            <svg
              className="w-5 h-5 text-white/60 absolute left-4 top-1/2 -translate-y-1/2"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
              />
            </svg>
            <input
              type="text"
              placeholder="Search questions..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-12 pr-4 py-3.5 bg-white/15 backdrop-blur-md border border-white/20 rounded-full text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-white/30 text-sm"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-white/60 hover:text-white"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

          {search && (
            <p className="text-sm text-white/70 mt-3">
              {matchCount} result{matchCount !== 1 ? 's' : ''} found
            </p>
          )}
        </div>

        {/* Curved SVG transition */}
        <svg
          className="absolute bottom-0 left-0 right-0 w-full h-auto"
          viewBox="0 0 1200 120"
          preserveAspectRatio="none"
          style={{ marginBottom: '-1px' }}
        >
          <path
            d="M0,64 C300,96 900,32 1200,64 L1200,120 L0,120 Z"
            fill="#fafafa"
            fillOpacity="1"
          />
        </svg>
      </div>

      {/* Category Filter Pills */}
      <div className="max-w-4xl mx-auto px-4 pt-12 mb-8">
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => setActiveCategory(null)}
            className={`px-5 py-2.5 rounded-full text-xs font-semibold whitespace-nowrap transition ${
              !activeCategory
                ? 'bg-[#003e79] text-white'
                : 'bg-[#f5f5f7] text-[#6e6e73] hover:bg-[#e8e8ed]'
            }`}
          >
            All ({totalQuestions})
          </button>
          {faqData.map(cat => (
            <button
              key={cat.name}
              onClick={() => setActiveCategory(activeCategory === cat.name ? null : cat.name)}
              className={`px-5 py-2.5 rounded-full text-xs font-semibold whitespace-nowrap transition flex items-center gap-2 ${
                activeCategory === cat.name
                  ? 'bg-[#003e79] text-white'
                  : 'bg-[#f5f5f7] text-[#6e6e73] hover:bg-[#e8e8ed]'
              }`}
            >
              <span>{cat.icon}</span>
              {cat.name}
            </button>
          ))}
        </div>
      </div>

      {/* FAQ Content */}
      <div className="max-w-4xl mx-auto px-4 pb-12 space-y-6">
        {displayCategories.map(cat => (
          <div
            key={cat.name}
            className="bg-white rounded-2xl border border-[#e8e8ed] shadow-[0_1px_20px_-6px_rgba(0,0,0,0.08)] overflow-hidden"
          >
            {/* Category Header */}
            <div className="px-6 py-5 border-b border-[#e8e8ed] bg-white">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{cat.icon}</span>
                <div className="flex-1">
                  <h2 className="font-semibold text-[#1d1d1f] text-lg">{cat.name}</h2>
                  <p className="text-xs text-[#6e6e73] mt-0.5">{cat.description}</p>
                </div>
                <span className="text-xs text-[#6e6e73] font-medium">
                  {cat.items.length} question{cat.items.length !== 1 ? 's' : ''}
                </span>
              </div>
            </div>

            {/* FAQ Items */}
            <div>
              {cat.items.map((item, i) => {
                const key = `${cat.name}-${i}`;
                return (
                  <FAQAccordion
                    key={key}
                    item={item}
                    isOpen={openItems.has(key) || !!search}
                    onToggle={() => toggleItem(key)}
                  />
                );
              })}
            </div>
          </div>
        ))}

        {displayCategories.length === 0 && (
          <div className="bg-white rounded-2xl border border-[#e8e8ed] shadow-[0_1px_20px_-6px_rgba(0,0,0,0.08)] p-12 text-center">
            <div className="text-5xl mb-4">🔍</div>
            <p className="text-[#1d1d1f] font-semibold mb-2">No questions match your search</p>
            <p className="text-sm text-[#6e6e73]">Try different keywords or browse all categories above.</p>
          </div>
        )}
      </div>

      {/* Contact CTA Section */}
      <div className="bg-white border-t border-[#e8e8ed]">
        <div className="max-w-3xl mx-auto px-4 py-16 text-center">
          <h2 className="text-3xl font-bold text-[#1d1d1f] mb-3">Still Have Questions?</h2>
          <p className="text-[#3d3d3d] mb-8 max-w-lg mx-auto">
            Our team is here to help. Reach out to us via email or phone and we'll get back to you quickly.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a
              href="mailto:john@ultimatetournaments.net"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-[#003e79] hover:bg-[#002850] text-white font-semibold rounded-full transition"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"
                />
              </svg>
              Email Us
            </a>
            <a
              href="tel:630-336-6160"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-[#f5f5f7] hover:bg-[#e8e8ed] text-[#003e79] font-semibold rounded-full transition border border-[#e8e8ed]"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z"
                />
              </svg>
              630-336-6160
            </a>
          </div>

          <p className="text-sm text-[#6e6e73] mt-6">
            Or mail us at: 477 Dunlay Street, Wood Dale, IL 60191
          </p>
        </div>
      </div>
    </div>
  );
}
