import type { Metadata } from 'next';
import EventDetail from './EventDetail';

export const metadata: Metadata = {
  title: 'Event Details — Ultimate Hockey Tournaments',
  description: 'View tournament details, pricing, hotels, and register for upcoming hockey events.',
};

// Pre-generate pages for all events — actual content loaded client-side via API
export async function generateStaticParams() {
  try {
    const res = await fetch('https://uht.chad-157.workers.dev/api/events?per_page=100', { next: { revalidate: 60 } });
    if (res.ok) {
      const json = await res.json();
      const events = json.data || [];
      const slugs = events.map((e: { slug: string }) => ({ slug: e.slug }));
      // Always include the fallback placeholder
      return [{ slug: '_' }, ...slugs];
    }
  } catch (e) {
    console.warn('Failed to fetch events for static params:', e);
  }
  return [{ slug: '_' }];
}

export default function EventDetailPage({ params }: { params: { slug: string } }) {
  return <EventDetail slug={params.slug} />;
}
