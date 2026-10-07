import type { Metadata } from 'next';
import PhotosPage from './PhotosPage';

export const metadata: Metadata = {
  title: 'Event Photos — Ultimate Hockey Tournaments',
  description: 'Photos from the weekend, shared by families and staff.',
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
  return <PhotosPage slug={params.slug} />;
}
