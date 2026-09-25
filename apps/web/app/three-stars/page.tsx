export const metadata = {
  title: 'Three Stars Selection Rules - Ultimate Hockey Tournaments',
  description: 'How the Three Stars of the Game are selected at every UHT event: the exact scoring formula, the fairness guarantee, and how ties are broken.',
};

const CARD = 'bg-white rounded-2xl border border-[#e8e8ed] p-6 shadow-sm';

export default function ThreeStarsRulesPage() {
  return (
    <div className="min-h-screen bg-[#f5f5f7] flex flex-col">
      {/* Hero */}
      <div className="bg-gradient-to-r from-[#003e79] via-[#005599] to-[#00ccff] px-6 py-14">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-4xl font-extrabold text-white">Three Stars of the Game</h1>
          <p className="text-white/80 mt-3 text-lg">
            The Three Stars are the MVPs of every game at a UHT event. They are selected automatically
            from the official scoresheet by a fixed formula - the same math for every team, every game,
            every tournament. No favorites, no politics.
          </p>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-10 space-y-6 w-full flex-1">
        <div className={CARD}>
          <h2 className="text-xl font-bold text-[#1d1d1f] mb-3">How players earn points</h2>
          <p className="text-sm text-[#6e6e73] mb-4">
            Everything comes from what the scorekeeper records during the game. When the final horn
            sounds, every player's points are totaled and the top three become the stars.
          </p>
          <div className="overflow-hidden rounded-xl border border-[#e8e8ed]">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#f5f5f7] text-left text-xs uppercase tracking-wide text-[#86868b]">
                  <th className="px-4 py-2.5 font-bold">Skaters</th>
                  <th className="px-4 py-2.5 font-bold text-right">Points</th>
                </tr>
              </thead>
              <tbody className="text-[#1d1d1f]">
                <tr className="border-t border-[#f0f0f2]"><td className="px-4 py-2.5">Goal</td><td className="px-4 py-2.5 text-right font-bold">+3</td></tr>
                <tr className="border-t border-[#f0f0f2]"><td className="px-4 py-2.5">Assist</td><td className="px-4 py-2.5 text-right font-bold">+2</td></tr>
                <tr className="border-t border-[#f0f0f2]"><td className="px-4 py-2.5">Game-winning goal bonus</td><td className="px-4 py-2.5 text-right font-bold">+1</td></tr>
                <tr className="border-t border-[#f0f0f2]"><td className="px-4 py-2.5">Each penalty minute</td><td className="px-4 py-2.5 text-right font-bold text-red-600">-0.25</td></tr>
              </tbody>
            </table>
          </div>
          <div className="overflow-hidden rounded-xl border border-[#e8e8ed] mt-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#f5f5f7] text-left text-xs uppercase tracking-wide text-[#86868b]">
                  <th className="px-4 py-2.5 font-bold">Goalies</th>
                  <th className="px-4 py-2.5 font-bold text-right">Points</th>
                </tr>
              </thead>
              <tbody className="text-[#1d1d1f]">
                <tr className="border-t border-[#f0f0f2]"><td className="px-4 py-2.5">Each save</td><td className="px-4 py-2.5 text-right font-bold">+0.3</td></tr>
                <tr className="border-t border-[#f0f0f2]"><td className="px-4 py-2.5">Shutout</td><td className="px-4 py-2.5 text-right font-bold">+4</td></tr>
                <tr className="border-t border-[#f0f0f2]"><td className="px-4 py-2.5">Win</td><td className="px-4 py-2.5 text-right font-bold">+1.5</td></tr>
                <tr className="border-t border-[#f0f0f2]"><td className="px-4 py-2.5">Each goal against</td><td className="px-4 py-2.5 text-right font-bold text-red-600">-0.5</td></tr>
              </tbody>
            </table>
          </div>
          <p className="text-xs text-[#86868b] mt-3">
            Empty-net goals never count against a goalie. Goalie saves are based on the shots recorded
            by the scorekeeper.
          </p>
        </div>

        <div className={CARD}>
          <h2 className="text-xl font-bold text-[#1d1d1f] mb-3">The fairness guarantee</h2>
          <p className="text-sm text-[#3c3c43] leading-relaxed">
            At least one star always comes from <strong>each team</strong>. Even in a lopsided game,
            the losing side's best performer is recognized - and that is often their goalie, who earns
            points for every save while under pressure. A 9-1 game where a goalie stops 30 shots is a
            game where that goalie earned a star.
          </p>
        </div>

        <div className={CARD}>
          <h2 className="text-xl font-bold text-[#1d1d1f] mb-3">Sportsmanship matters</h2>
          <p className="text-sm text-[#3c3c43] leading-relaxed">
            Penalty minutes subtract from a player's total, and any player assessed a misconduct,
            game misconduct, or match penalty is <strong>disqualified from the stars for that game</strong>,
            no matter how many goals they scored. Stars are for players who help their team on the ice
            and keep their head.
          </p>
        </div>

        <div className={CARD}>
          <h2 className="text-xl font-bold text-[#1d1d1f] mb-3">Ties and eligibility</h2>
          <ul className="text-sm text-[#3c3c43] leading-relaxed list-disc pl-5 space-y-1.5">
            <li>Ties are broken by: more goals, then more assists, then fewer penalty minutes.</li>
            <li>Only players on the game's signed lineup who were marked Playing are eligible.</li>
            <li>Stars are assigned the moment the game goes final and announced by push notification to both teams.</li>
          </ul>
        </div>

        <div className={CARD}>
          <h2 className="text-xl font-bold text-[#1d1d1f] mb-3">Can the stars be changed?</h2>
          <p className="text-sm text-[#3c3c43] leading-relaxed">
            Yes. The formula does the first pass, but the scorekeeper and tournament staff can adjust
            the stars at the rink when something the scoresheet cannot capture deserves recognition -
            a defensive performance, a penalty kill, a great team moment. Staff decisions are final.
          </p>
        </div>
      </div>

    </div>
  );
}
