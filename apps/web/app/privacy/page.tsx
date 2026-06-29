import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy | Ultimate Hockey Tournaments',
  description: 'Privacy policy for Ultimate Hockey Tournaments website and mobile application.',
};

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-3xl font-bold text-[#1d1d1f] mb-2">Privacy Policy</h1>
        <p className="text-sm text-[#86868b] mb-10">Last updated: June 29, 2026</p>

        <div className="space-y-8 text-[#1d1d1f] text-[15px] leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold mb-3">1. Introduction</h2>
            <p>
              Ultimate Hockey Tournaments, LLC (&quot;Ultimate Tournaments,&quot; &quot;we,&quot; &quot;us,&quot; or &quot;our&quot;) operates the
              website at ultimatetournaments.com and the Ultimate Tournaments mobile application
              (collectively, the &quot;Platform&quot;). This Privacy Policy describes how we collect, use, disclose,
              and protect your personal information when you use our Platform.
            </p>
            <p className="mt-3">
              By using the Platform, you agree to the collection and use of information in accordance
              with this policy.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3">2. Information We Collect</h2>
            <p className="font-medium mb-2">Account Information</p>
            <p>
              When you create an account, we collect your name, email address, phone number, and role
              (such as coach, team manager, parent, or referee). If you register on behalf of a team
              or organization, we also collect team name, organization affiliation, and home state.
            </p>

            <p className="font-medium mt-4 mb-2">Player &amp; Roster Information</p>
            <p>
              Coaches and team managers may submit player rosters that include player names, jersey numbers,
              positions, and USA Hockey registration numbers. This information is used solely for tournament
              administration and scheduling purposes.
            </p>

            <p className="font-medium mt-4 mb-2">Payment Information</p>
            <p>
              Tournament registration fees are processed through Stripe, a third-party payment processor.
              We do not store credit card numbers, bank account details, or other sensitive financial
              information on our servers. Please refer to{' '}
              <a href="https://stripe.com/privacy" target="_blank" rel="noopener noreferrer" className="text-[#0071e3] hover:underline">
                Stripe&apos;s Privacy Policy
              </a>{' '}
              for information on how your payment data is handled.
            </p>

            <p className="font-medium mt-4 mb-2">Usage Data</p>
            <p>
              We automatically collect certain information when you use the Platform, including your IP address,
              browser type, device information, pages visited, and interaction patterns. This data helps us
              improve the Platform and diagnose technical issues.
            </p>

            <p className="font-medium mt-4 mb-2">Communications</p>
            <p>
              If you contact us through our chat widget, contact form, or email, we retain the content
              of those communications to provide support and improve our services.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3">3. How We Use Your Information</h2>
            <p>We use the information we collect to:</p>
            <ul className="list-disc ml-6 mt-2 space-y-1">
              <li>Manage tournament registrations, scheduling, and scoring</li>
              <li>Send transactional emails (registration confirmations, team approvals, magic link sign-ins, schedule updates)</li>
              <li>Send promotional communications about upcoming tournaments (you can opt out at any time)</li>
              <li>Process payments for tournament registration fees</li>
              <li>Provide customer support</li>
              <li>Improve and maintain the Platform</li>
              <li>Comply with legal obligations</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3">4. Third-Party Services</h2>
            <p>We use the following third-party services to operate the Platform:</p>
            <ul className="list-disc ml-6 mt-2 space-y-1">
              <li><strong>Stripe</strong> — payment processing for tournament registration fees</li>
              <li><strong>Resend</strong> — transactional and marketing email delivery</li>
              <li><strong>Cloudflare</strong> — website hosting, content delivery, and security</li>
              <li><strong>Expo / Apple App Store / Google Play</strong> — mobile app distribution and push notifications</li>
            </ul>
            <p className="mt-3">
              Each of these services has its own privacy policy governing how they handle your data. We
              encourage you to review their policies.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3">5. Data Sharing &amp; Disclosure</h2>
            <p>
              We do not sell, rent, or trade your personal information to third parties for marketing purposes.
              We may share your information in the following circumstances:
            </p>
            <ul className="list-disc ml-6 mt-2 space-y-1">
              <li><strong>Tournament operations:</strong> Team and roster information may be shared with venue
                operators, referees, and tournament directors as needed to run events.</li>
              <li><strong>Service providers:</strong> We share data with the third-party services listed above
                to operate the Platform.</li>
              <li><strong>Legal requirements:</strong> We may disclose information if required by law, regulation,
                or legal process.</li>
              <li><strong>Safety:</strong> We may disclose information to protect the rights, safety, or property
                of our users, the public, or Ultimate Tournaments.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3">6. Children&apos;s Privacy</h2>
            <p>
              Our Platform serves youth hockey tournaments, and player roster data may include information
              about individuals under 13 years of age. However, accounts on our Platform are created and
              managed by adults (coaches, team managers, parents, and guardians) — not by children directly.
              We do not knowingly collect personal information directly from children under 13.
            </p>
            <p className="mt-3">
              If you are a parent or guardian and believe that your child has provided us with personal
              information without your consent, please contact us at{' '}
              <a href="mailto:info@ultimatetournaments.com" className="text-[#0071e3] hover:underline">
                info@ultimatetournaments.com
              </a>{' '}
              and we will take steps to remove that information.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3">7. Data Security</h2>
            <p>
              We take reasonable measures to protect your personal information from unauthorized access,
              alteration, disclosure, or destruction. This includes using encrypted connections (HTTPS),
              secure authentication (passwordless magic links), and limiting access to personal data to
              authorized personnel. However, no method of transmission over the internet or electronic
              storage is 100% secure.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3">8. Data Retention</h2>
            <p>
              We retain your personal information for as long as your account is active or as needed to
              provide you services, comply with legal obligations, resolve disputes, and enforce our
              agreements. You may request deletion of your account and associated data by contacting us.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3">9. Your Rights</h2>
            <p>Depending on your jurisdiction, you may have the right to:</p>
            <ul className="list-disc ml-6 mt-2 space-y-1">
              <li>Access the personal information we hold about you</li>
              <li>Request correction of inaccurate information</li>
              <li>Request deletion of your personal information</li>
              <li>Opt out of marketing communications</li>
              <li>Request a copy of your data in a portable format</li>
            </ul>
            <p className="mt-3">
              To exercise any of these rights, please contact us at{' '}
              <a href="mailto:info@ultimatetournaments.com" className="text-[#0071e3] hover:underline">
                info@ultimatetournaments.com
              </a>.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3">10. Push Notifications</h2>
            <p>
              Our mobile app may send push notifications for game scores, schedule changes, and tournament
              updates. You can manage your notification preferences in your device settings at any time.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3">11. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. We will notify you of any material
              changes by posting the new policy on this page and updating the &quot;Last updated&quot; date.
              Your continued use of the Platform after changes are posted constitutes acceptance of the
              updated policy.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3">12. Contact Us</h2>
            <p>
              If you have any questions about this Privacy Policy, please contact us:
            </p>
            <p className="mt-2">
              Ultimate Hockey Tournaments, LLC<br />
              Email:{' '}
              <a href="mailto:info@ultimatetournaments.com" className="text-[#0071e3] hover:underline">
                info@ultimatetournaments.com
              </a><br />
              Website:{' '}
              <a href="https://ultimatetournaments.com" className="text-[#0071e3] hover:underline">
                ultimatetournaments.com
              </a>
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
