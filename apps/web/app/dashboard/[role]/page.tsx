import DashboardContent from './DashboardContent';

export function generateStaticParams() {
  return [
    { role: 'admin' }, { role: 'director' }, { role: 'organization' }, { role: 'coach' },
    { role: 'manager' }, { role: 'parent' }, { role: 'scorekeeper' }, { role: 'referee' },
  ];
}

// Roles whose bare dashboard URL just forwards to a sub-page. The redirect is
// baked into the static HTML as an inline script so it runs at parse time —
// the client-side (useEffect) redirect in DashboardContent proved unreliable
// because a hydration crash (React #329) could freeze the page on its spinner.
const STATIC_REDIRECTS: Record<string, string> = {
  coach: '/dashboard/coach/teams/',
  manager: '/dashboard/manager/teams/',
};

export default function DashboardPage({ params }: { params: { role: string } }) {
  const role = params.role || 'admin';
  const redirect = STATIC_REDIRECTS[role];
  return (
    <>
      {redirect && (
        <script
          dangerouslySetInnerHTML={{ __html: `location.replace(${JSON.stringify(redirect)})` }}
        />
      )}
      <DashboardContent role={role} />
    </>
  );
}
