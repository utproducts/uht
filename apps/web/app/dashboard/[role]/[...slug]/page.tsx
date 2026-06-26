import SubPageContent from './SubPageContent';

export function generateStaticParams() {
  const roles = ['coach', 'manager', 'organization', 'parent', 'scorekeeper', 'referee'];
  const slugsByRole: Record<string, string[][]> = {
    coach: [['teams'], ['events'], ['roster'], ['schedule'], ['coupons']],
    manager: [['teams'], ['events'], ['roster'], ['schedule'], ['coupons']],
    organization: [['teams'], ['coaches'], ['rosters'], ['events']],
    parent: [['teams'], ['schedule'], ['results'], ['stats']],
    scorekeeper: [['assignments'], ['completed']],
    referee: [['assignments'], ['reports']],
  };
  const params: { role: string; slug: string[] }[] = [];
  for (const role of roles) {
    for (const slug of slugsByRole[role]) {
      params.push({ role, slug });
    }
  }
  return params;
}

export default function DashboardSubPage() {
  return <SubPageContent />;
}
