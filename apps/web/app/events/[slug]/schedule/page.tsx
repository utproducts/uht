import type { Metadata } from 'next';
import SchedulePage from './SchedulePage';

export const metadata: Metadata = {
  title: 'Schedule — Ultimate Hockey Tournaments',
  description: 'View the live tournament schedule, scores, and standings.',
};

export async function generateStaticParams() {
  try {
    const res = await fetch('https://uht.chad-157.workers.dev/api/events?per_page=100', { next: { revalidate: 60 } });
    if (res.ok) {
      const json = await res.json();
      const events = json.data || [];
      return [{ slug: '_' }, ...events.map((e: { slug: string }) => ({ slug: e.slug }))];
    }
  } catch {}
  return [{ slug: '_' }];
}

export default function Page({ params }: { params: { slug: string } }) {
  return <SchedulePage slug={params.slug} />;
}
