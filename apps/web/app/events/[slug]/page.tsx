import type { Metadata } from 'next';
import EventDetail from './EventDetail';

export const metadata: Metadata = {
  title: 'Event Details — Ultimate Hockey Tournaments',
  description: 'View tournament details, pricing, hotels, and register for upcoming hockey events.',
};

// Pre-generate a placeholder page — actual content loaded client-side via API
export function generateStaticParams() {
  // Return a dummy param so the route exists; the client component
  // fetches the real event by slug at runtime
  return [{ slug: '_' }];
}

export default function EventDetailPage({ params }: { params: { slug: string } }) {
  return <EventDetail slug={params.slug} />;
}
