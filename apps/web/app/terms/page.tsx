import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms of Service | Ultimate Hockey Tournaments',
  description: 'Terms of service for Ultimate Hockey Tournaments website and mobile application.',
};

export default function TermsOfServicePage() {
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-3xl font-bold text-[#1d1d1f] mb-2">Terms of Service</h1>
        <p className="text-sm text-[#86868b] mb-10">Last updated: June 29, 2026</p>

        <div className="space-y-8 text-[#1d1d1f] text-[15px] leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold mb-3">1. Acceptance of Terms</h2>
            <p>
              By accessing or using the Ultimate Hockey Tournaments website at ultimatetournaments.com
              and the Ultimate Tournaments mobile application (collectively, the &quot;Platform&quot;), operated by
              Ultimate Hockey Tournaments, LLC (&quot;Ultimate Tournaments,&quot; &quot;we,&quot; &quot;us,&quot; or &quot;our&quot;), you agree
              to be bound by these Terms of Service. If you do not agree to these terms, do not use the Platform.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3">2. Eligibility</h2>
            <p>
              You must be at least 18 years of age to create an account on the Platform. By creating an account,
              you represent and warrant that you are at least 18 years old and have the legal capacity to enter
              into these terms. Accounts for team rosters containing information about minors must be created
              and managed by an authorized adult (parent, guardian, or coach).
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3">3. Accounts</h2>
            <p>
              You are responsible for maintaining the security of your account. Our Platform uses passwordless
              authentication via magic link emails. You agree to provide accurate, current, and complete information
              during the registration process and to update such information to keep it accurate, current, and complete.
              You are responsible for all activity that occurs under your account.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3">4. Tournament Registration &amp; Payments</h2>
            <p>
              Tournament registration fees are non-refundable unless otherwise stated in the specific event
              listing or at the sole discretion of Ultimate Tournaments. All payments are processed securely
              through Stripe. By submitting payment, you agree to Stripe&apos;s terms of service.
            </p>
            <p className="mt-3">
              Registration for a tournament is not confirmed until payment is received and the team is
              approved by the tournament director. Ultimate Tournaments reserves the right to reject any
              registration at our discretion.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3">5. USA Hockey Compliance</h2>
            <p>
              All tournaments hosted through Ultimate Tournaments are USA Hockey sanctioned events. Participating
              teams and players must maintain current USA Hockey registration. Coaches must have completed
              all required USA Hockey coaching certifications and background checks. Ultimate Tournaments is
              not responsible for verifying individual USA Hockey eligibility — this responsibility lies with
              team coaches and organization administrators.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3">6. User Conduct</h2>
            <p>You agree not to:</p>
            <ul className="list-disc ml-6 mt-2 space-y-1">
              <li>Use the Platform for any unlawful purpose</li>
              <li>Submit false, misleading, or inaccurate information</li>
              <li>Impersonate any person or entity</li>
              <li>Interfere with or disrupt the Platform or its servers</li>
              <li>Attempt to gain unauthorized access to any part of the Platform</li>
              <li>Use automated scripts, bots, or scrapers to access the Platform</li>
              <li>Harass, abuse, or threaten other users</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3">7. Intellectual Property</h2>
            <p>
              The Platform, including its design, text, graphics, logos, and software, is the property of
              Ultimate Hockey Tournaments, LLC and is protected by copyright, trademark, and other intellectual
              property laws. You may not reproduce, distribute, modify, or create derivative works of any
              content on the Platform without our prior written consent.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3">8. User Content</h2>
            <p>
              By uploading content to the Platform (team logos, roster information, organization details),
              you grant Ultimate Tournaments a non-exclusive, worldwide, royalty-free license to use,
              display, and distribute that content in connection with operating the Platform and promoting
              tournaments. You represent that you have the right to share any content you upload.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3">9. Disclaimer of Warranties</h2>
            <p>
              The Platform is provided &quot;as is&quot; and &quot;as available&quot; without warranties of any kind, either
              express or implied, including but not limited to implied warranties of merchantability, fitness
              for a particular purpose, and non-infringement. We do not warrant that the Platform will be
              uninterrupted, secure, or error-free.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3">10. Limitation of Liability</h2>
            <p>
              To the maximum extent permitted by law, Ultimate Hockey Tournaments, LLC shall not be liable
              for any indirect, incidental, special, consequential, or punitive damages, including but not
              limited to loss of profits, data, or goodwill, arising out of or related to your use of the
              Platform. Our total liability for any claim arising under these terms shall not exceed the
              amount you paid to us in the twelve (12) months preceding the claim.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3">11. Assumption of Risk</h2>
            <p>
              Ice hockey is an inherently physical sport. Ultimate Tournaments is not responsible for any
              injuries, damages, or losses sustained by players, coaches, spectators, or any other individuals
              during tournaments or events organized through the Platform. Participation in any tournament
              is at your own risk.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3">12. Indemnification</h2>
            <p>
              You agree to indemnify, defend, and hold harmless Ultimate Hockey Tournaments, LLC, its
              officers, directors, employees, and agents from and against any claims, liabilities, damages,
              losses, and expenses arising out of or in any way connected with your use of the Platform
              or violation of these Terms.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3">13. Modifications</h2>
            <p>
              We reserve the right to modify these Terms of Service at any time. We will notify users of
              material changes by posting the updated terms on this page. Your continued use of the Platform
              following any changes constitutes acceptance of the revised terms.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3">14. Termination</h2>
            <p>
              We reserve the right to suspend or terminate your account at any time, with or without cause,
              and with or without notice. Upon termination, your right to use the Platform will immediately
              cease. Provisions of these terms that by their nature should survive termination shall survive.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3">15. Governing Law</h2>
            <p>
              These Terms shall be governed by and construed in accordance with the laws of the State of
              Michigan, without regard to its conflict of law provisions.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3">16. Contact</h2>
            <p>
              If you have any questions about these Terms of Service, please contact us:
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
