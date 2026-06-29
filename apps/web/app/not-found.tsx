import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-[80vh] flex items-center justify-center bg-white">
      <div className="max-w-lg mx-auto px-6 text-center">
        {/* Icon */}
        <div className="w-20 h-20 mx-auto mb-8 rounded-2xl bg-gradient-to-br from-[#003e79] to-[#00ccff] flex items-center justify-center">
          <svg
            className="w-10 h-10 text-white"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15.182 16.318A4.486 4.486 0 0012.016 15a4.486 4.486 0 00-3.198 1.318M21 12a9 9 0 11-18 0 9 9 0 0118 0zM9.75 9.75c0 .414-.168.75-.375.75S9 10.164 9 9.75 9.168 9 9.375 9s.375.336.375.75zm-.375 0h.008v.015h-.008V9.75zm5.625 0c0 .414-.168.75-.375.75s-.375-.336-.375-.75.168-.75.375-.75.375.336.375.75zm-.375 0h.008v.015h-.008V9.75z"
            />
          </svg>
        </div>

        {/* Text */}
        <h1 className="text-4xl font-semibold text-[#1d1d1f] tracking-tight mb-3">
          Page Not Found
        </h1>
        <p className="text-[#6e6e73] text-lg leading-relaxed mb-10">
          The page you're looking for doesn't exist or may have been moved.
        </p>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            href="/"
            className="inline-flex items-center justify-center px-6 py-3 bg-[#003e79] text-white font-medium rounded-full transition-all duration-200 hover:bg-[#002d5a] hover:shadow-lg active:scale-[0.98] text-sm"
          >
            Go Home
          </Link>
          <Link
            href="/events"
            className="inline-flex items-center justify-center px-6 py-3 bg-[#f5f5f7] text-[#1d1d1f] font-medium rounded-full transition-all duration-200 hover:bg-[#e8e8ed] active:scale-[0.98] text-sm"
          >
            Browse Events
          </Link>
        </div>
      </div>
    </div>
  );
}
