import type { Metadata } from 'next';
import EventDetail from './EventDetail';

export const runtime = 'edge';

export const metadata: Metadata = {
  title: 'Event Details — Ultimate Hockey Tournaments',
  description: 'View tournament details, pricing, hotels, and register for upcoming hockey events.',
};

export default function EventDetailPage({ params }: { params: { slug: string } }) {
  return <EventDetail slug={params.slug} />;
}
