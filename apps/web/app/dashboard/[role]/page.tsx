import DashboardContent from './DashboardContent';

export function generateStaticParams() {
  return [
    { role: 'admin' }, { role: 'director' }, { role: 'organization' }, { role: 'coach' },
    { role: 'manager' }, { role: 'parent' }, { role: 'scorekeeper' }, { role: 'referee' },
  ];
}

export default function DashboardPage({ params }: { params: { role: string } }) {
  return <DashboardContent role={params.role || 'admin'} />;
}
