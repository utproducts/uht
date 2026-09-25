/**
 * 30-days-out event information email ("Johnny letter").
 *
 * Sent automatically to every registered team's coaches and managers when an
 * event is 30 days from its start date. All copy is editable through the
 * Automated Emails admin section (template id: event_info_30day); the dynamic
 * data (rinks, dates, roster status, payment status) is pulled live per team.
 */

import { replaceVars } from './template-overrides';

export interface EventInfoEmailParams {
  eventName: string;
  eventDates: string;        // "Oct 16 - 18, 2026"
  eventCity: string;         // "Holland, Michigan"
  eventUrl: string;          // public event page
  rinks: { name: string; address?: string; city?: string; state?: string }[];
  scheduleDate: string;      // "Oct 6" (10 days before start)
  teamName: string;
  ageGroup?: string;
  division?: string;
  rosterCount: number;       // players on the team's roster (0 = missing)
  isPaid: boolean;
  payUrl?: string;
  _overrides?: Record<string, string>;
}

function esc(s: string): string {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Section heading in house style */
function h3(title: string): string {
  return `<h3 style="color: #003e79; font-size: 17px; margin: 28px 0 8px 0;">${title}</h3>`;
}

function para(text: string): string {
  // Editable textareas use blank lines as paragraph breaks
  return text
    .split(/\n\s*\n/)
    .map(p => `<p style="margin: 0 0 12px 0;">${p.replace(/\n/g, '<br>')}</p>`)
    .join('');
}

export function buildEventInfoHtml(params: EventInfoEmailParams): string {
  const o = params._overrides || {};
  const divisionText = params.division ? ` - ${params.division}` : '';

  const vars: Record<string, string> = {
    eventName: params.eventName,
    teamName: params.teamName,
    eventDates: params.eventDates,
    eventCity: params.eventCity,
    scheduleDate: params.scheduleDate,
  };
  const f = (key: string, fallback: string) => replaceVars(o[key] || fallback, vars);

  // ── Editable copy (defaults live in template-overrides.ts; these fallbacks match) ──
  const heading = f('heading', 'Your Tournament Guide');
  const intro = f('intro_text',
    'Thank you for entering your team in the {eventName}. The tournament is 30 days away, and this email has everything your team needs to be ready. Please share it with your parents and players.');
  const notPlaying = f('not_playing_text',
    'If you received this email by mistake and your team is not participating, please reply and let us know.');
  const rosterText = f('roster_text',
    'Upload your roster at ultimatetournaments.com, or send us your official roster link from the USA Hockey portal. Once your roster is online, your team is eligible for mobile check-in, live scoring, event promos, and restaurant deals, all from your phone.');
  const paymentText = f('payment_text',
    'Registration balances are due in full at this point. If your team has not yet paid, please take care of it now or reply to this email to make arrangements. We accept credit card, Venmo, and check.');
  const venmoText = f('venmo_text',
    'Venmo: @ultimatetournaments (Ultimate Hockey Tournaments, UHT logo) or @john-Schwarz-33 (UHT logo, last 4 digits 6160).');
  const scheduleText = f('schedule_text',
    'Schedules will be posted in the UHT app on {scheduleDate}, and the app is the only place they are posted. Download the app, follow your team, and turn on notifications so you see your game times the moment they go live. Make sure your parents and players do the same. The welcome letter, tournament rules, and directions to the rinks will be emailed to team managers the same day.\n\nEarliest games on Friday: Mites and Squirts start no earlier than 12pm, Pee Wees no earlier than 2pm, and Bantams and Midgets no earlier than 4pm. Teams traveling the furthest are given scheduling consideration.');
  const scoresText = f('scores_text',
    'Every game is scored live. Follow scores, standings, and brackets in the UHT app or at ultimatetournaments.com from the rink, the hotel, or anywhere else.');
  const jerseysText = f('jerseys_text',
    'Home teams wear white jerseys and away teams wear dark. If your team has a jersey conflict, let us know ahead of time.');
  const gameTimesText = f('game_times_text',
    'Games can run ahead of schedule as well as behind. If we have a chance to start a game 15 minutes early, we will, so please have your team at the rink and ready.');
  const checkinText = f('checkin_text',
    'We are offering mobile check-in for this event. Teams with their roster online can check in right from the UHT app when they arrive. Team managers, please check in as soon as you arrive for each game.');
  const lockerText = f('locker_text',
    'Locker room assignments are posted on a board at every rink and pushed to the app.');
  const goodyText = f('goody_text',
    'When you arrive for your first game, make sure to pick up your team goody bag from the tournament director.');
  const closingText = f('closing_text',
    'Never hesitate to call, email, or text with any questions. We are looking forward to a great weekend of hockey.');
  const signoff = f('signoff', 'Johnny, Cory, and Nick');

  // ── Rink list ──
  const rinkRows = params.rinks.map(r => {
    const loc = [r.address, [r.city, r.state].filter(Boolean).join(', ')].filter(Boolean).join(' - ');
    return `
      <tr>
        <td style="padding: 10px 16px; border-bottom: 1px solid #e8e8ed;">
          <p style="margin: 0; font-size: 15px; font-weight: 700; color: #1d1d1f;">${esc(r.name)}</p>
          ${loc ? `<p style="margin: 2px 0 0 0; font-size: 13px; color: #6e6e73;">${esc(loc)}</p>` : ''}
        </td>
      </tr>`;
  }).join('');
  const rinkSection = params.rinks.length ? `
    ${h3('🏟️ Rinks for This Event')}
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f7; border-radius: 12px; overflow: hidden;">
      ${rinkRows}
    </table>` : '';

  // ── Roster status: big annoying warning vs green all-clear ──
  const rosterMissing = params.rosterCount === 0;
  const rosterBanner = rosterMissing ? `
    <tr>
      <td style="padding: 24px 32px 0 32px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background: linear-gradient(135deg, #b91c1c, #dc2626); border-radius: 12px;">
          <tr>
            <td style="padding: 24px 28px; text-align: center;">
              <p style="margin: 0; font-size: 30px;">🚨</p>
              <p style="margin: 8px 0 0 0; font-size: 20px; font-weight: 800; color: #ffffff; letter-spacing: 0.5px;">YOUR ROSTER IS NOT ON FILE</p>
              <p style="margin: 10px 0 0 0; font-size: 15px; line-height: 1.5; color: #fee2e2;">
                <strong>${esc(params.teamName)}</strong> is <strong>NOT eligible for mobile check-in</strong> until your roster is uploaded. Without it you will be checking in on paper at the rink, and your players will not appear in live scoring or stats.
              </p>
              <p style="margin: 18px 0 0 0;">
                <a href="https://ultimatetournaments.com/dashboard/coach/roster" style="display: inline-block; padding: 14px 32px; background-color: #ffffff; color: #b91c1c; text-decoration: none; border-radius: 8px; font-weight: 800; font-size: 15px;">Upload Your Roster Now</a>
              </p>
              <p style="margin: 12px 0 0 0; font-size: 12px; color: #fecaca;">Takes about 5 minutes. Paste from the USA Hockey portal or upload a file.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>` : `
    <tr>
      <td style="padding: 24px 32px 0 32px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 12px;">
          <tr>
            <td style="padding: 14px 20px;">
              <p style="margin: 0; font-size: 15px; font-weight: 700; color: #047857;">✅ Roster on file (${params.rosterCount} players) - your team is eligible for mobile check-in</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>`;

  // Second nag inside the check-in section so it cannot be missed
  const checkinRosterNag = rosterMissing ? `
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #fef2f2; border: 2px solid #dc2626; border-radius: 10px; margin-top: 10px;">
      <tr>
        <td style="padding: 12px 16px;">
          <p style="margin: 0; font-size: 14px; font-weight: 700; color: #b91c1c;">⚠️ Reminder: your roster is not online, so mobile check-in is OFF for your team. <a href="https://ultimatetournaments.com/dashboard/coach/roster" style="color: #b91c1c;">Fix it here.</a></p>
        </td>
      </tr>
    </table>` : '';

  // ── Payment section: only when a balance may be owed ──
  const paymentSection = params.isPaid ? `
    ${h3('💳 Payments')}
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 10px;">
      <tr><td style="padding: 12px 16px;">
        <p style="margin: 0; font-size: 14px; font-weight: 700; color: #047857;">Your registration is paid in full. Nothing due, thank you!</p>
      </td></tr>
    </table>` : `
    ${h3('💳 Payments')}
    ${para(paymentText)}
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f7; border-radius: 10px;">
      <tr><td style="padding: 12px 16px;">
        <p style="margin: 0; font-size: 13.5px; line-height: 1.6; color: #3c3c43;">${esc(venmoText)}</p>
      </td></tr>
    </table>
    ${params.payUrl ? `
    <p style="margin: 14px 0 0 0;">
      <a href="${params.payUrl}" style="display: inline-block; padding: 12px 28px; background-color: #003e79; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 14px;">Pay Online Now</a>
    </p>` : ''}`;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #f5f5f7; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f7; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.06);">

          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #003e79, #001f3f); padding: 32px; text-align: center;">
              <img src="https://uht.chad-157.workers.dev/api/assets/brand/uht-logo.png" alt="Ultimate Tournaments" width="180" style="height: auto; margin-bottom: 16px;">
              <h1 style="color: #ffffff; font-size: 24px; margin: 0; font-weight: 700;">${esc(heading)}</h1>
              <p style="color: #9fd4ff; font-size: 14px; margin: 8px 0 0 0; font-weight: 600;">30 days to game time</p>
            </td>
          </tr>

          <!-- Event Badge -->
          <tr>
            <td style="padding: 24px 32px 0 32px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f0f9ff; border: 1px solid #bae6fd; border-radius: 12px;">
                <tr>
                  <td style="padding: 16px 20px;">
                    <p style="margin: 0; font-size: 13px; color: #6e6e73; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">Event</p>
                    <p style="margin: 4px 0 0 0; font-size: 18px; color: #003e79; font-weight: 700;">${esc(params.eventName)}</p>
                    <p style="margin: 4px 0 0 0; font-size: 14px; color: #6e6e73;">${esc(params.eventDates)} · ${esc(params.eventCity)}</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 0 20px 16px 20px;">
                    <table cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="background-color: #003e79; color: #ffffff; font-size: 12px; font-weight: 600; padding: 4px 12px; border-radius: 20px;">${esc(params.teamName)}</td>
                        <td width="8"></td>
                        ${params.ageGroup ? `<td style="background-color: #e8e8ed; color: #1d1d1f; font-size: 12px; font-weight: 600; padding: 4px 12px; border-radius: 20px;">${esc(params.ageGroup)}${esc(divisionText)}</td>` : ''}
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          ${rosterBanner}

          <!-- Body -->
          <tr>
            <td style="padding: 24px 32px 32px 32px; font-size: 15px; line-height: 1.6; color: #1d1d1f;">
              ${para(intro)}
              <p style="margin: 0 0 12px 0; font-size: 13px; color: #6e6e73;">${esc(notPlaying)}</p>

              ${rinkSection}

              ${h3('📋 Rosters and Mobile Check-In')}
              ${para(rosterText)}
              ${para(checkinText)}
              ${checkinRosterNag}

              ${paymentSection}

              ${h3('🗓️ Schedules')}
              ${para(scheduleText)}

              ${h3('📱 Live Scores and Brackets')}
              ${para(scoresText)}
              <p style="margin: 4px 0 0 0;">
                <a href="${params.eventUrl}" style="display: inline-block; padding: 12px 28px; background-color: #00a0cc; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 14px;">View Event Page</a>
                <a href="https://apps.apple.com/app/id6786085393" style="display: inline-block; padding: 12px 28px; background-color: #003e79; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 14px; margin-left: 8px;">Get the UHT App</a>
              </p>

              ${h3('🎽 Jerseys')}
              ${para(jerseysText)}

              ${h3('⏰ Game Times')}
              ${para(gameTimesText)}

              ${h3('🚪 Locker Rooms')}
              ${para(lockerText)}

              ${h3('🎁 Team Goody Bags')}
              ${para(goodyText)}

              <table width="100%" cellpadding="0" cellspacing="0" style="margin-top: 28px; border-top: 1px solid #e8e8ed;">
                <tr>
                  <td style="padding-top: 20px;">
                    ${para(closingText)}
                    <p style="margin: 8px 0 0 0;">Thanks,<br><strong>${esc(signoff)}</strong></p>
                    <p style="margin: 8px 0 0 0; font-size: 13px; color: #6e6e73;">
                      <a href="mailto:johnny@ultimatetournaments.com" style="color: #00a0cc;">johnny@ultimatetournaments.com</a> ·
                      <a href="mailto:cory@ultimatetournaments.com" style="color: #00a0cc;">cory@ultimatetournaments.com</a> ·
                      <a href="https://www.ultimatetournaments.com" style="color: #00a0cc;">ultimatetournaments.com</a>
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f5f5f7; padding: 18px 32px; text-align: center;">
              <p style="margin: 0; font-size: 12px; color: #86868b;">Ultimate Hockey Tournaments · ultimatetournaments.com</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
