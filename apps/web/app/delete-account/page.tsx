import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Delete Account | Ultimate Hockey Tournaments',
  description: 'Request deletion of your Ultimate Hockey Tournaments account and associated data.',
};

export default function DeleteAccountPage() {
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-3xl font-bold text-[#1d1d1f] mb-2">Delete Your Account</h1>
        <p className="text-sm text-[#86868b] mb-10">Ultimate Hockey Tournaments</p>

        <div className="space-y-8 text-[#1d1d1f] text-[15px] leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold mb-3">How to Delete Your Account</h2>
            <p>
              If you would like to delete your Ultimate Hockey Tournaments account and all associated data,
              please follow these steps:
            </p>
            <ol className="list-decimal list-inside mt-4 space-y-3">
              <li>Send an email to <a href="mailto:support@ultimatetournaments.com" className="text-[#0071e3] underline">support@ultimatetournaments.com</a> from the email address associated with your account.</li>
              <li>Use the subject line: <strong>&quot;Account Deletion Request&quot;</strong></li>
              <li>Include your full name in the body of the email so we can verify your identity.</li>
            </ol>
            <p className="mt-4">
              We will process your request within 30 days and send a confirmation email once your account
              has been deleted.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3">Data That Will Be Deleted</h2>
            <p>When your account is deleted, the following data will be permanently removed:</p>
            <ul className="list-disc list-inside mt-3 space-y-2">
              <li>Your user profile (name, email address, phone number)</li>
              <li>Your authentication credentials and login sessions</li>
              <li>Your team follows and notification preferences</li>
              <li>Your push notification tokens and device registrations</li>
              <li>Your in-app notification history</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3">Data That May Be Retained</h2>
            <p>
              Certain data may be retained for a limited period or permanently for legitimate business
              and legal purposes:
            </p>
            <ul className="list-disc list-inside mt-3 space-y-2">
              <li><strong>Tournament registration records</strong> &mdash; retained for the duration of the tournament season for operational purposes, then deleted within 12 months after the season ends.</li>
              <li><strong>Payment transaction records</strong> &mdash; retained for 7 years as required by tax and financial regulations.</li>
              <li><strong>Player roster data</strong> &mdash; if your players are on active team rosters, their roster entries may be retained until the end of the current season to avoid disrupting team operations. Player names and jersey numbers are removed within 30 days of account deletion; only anonymized participation records are kept.</li>
              <li><strong>Game scores and standings</strong> &mdash; anonymized historical game results may be retained permanently as part of the public tournament record.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3">Questions?</h2>
            <p>
              If you have any questions about account deletion or your data, please contact us
              at <a href="mailto:support@ultimatetournaments.com" className="text-[#0071e3] underline">support@ultimatetournaments.com</a>.
            </p>
            <p className="mt-3">
              For more information about how we handle your data, please review
              our <a href="/privacy" className="text-[#0071e3] underline">Privacy Policy</a>.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
