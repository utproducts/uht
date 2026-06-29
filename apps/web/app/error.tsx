'use client';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
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
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
            />
          </svg>
        </div>

        {/* Text */}
        <h1 className="text-4xl font-semibold text-[#1d1d1f] tracking-tight mb-3">
          Something Went Wrong
        </h1>
        <p className="text-[#6e6e73] text-lg leading-relaxed mb-10">
          An unexpected error occurred. Please try again or head back to the home page.
        </p>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            onClick={() => reset()}
            className="inline-flex items-center justify-center px-6 py-3 bg-[#003e79] text-white font-medium rounded-full transition-all duration-200 hover:bg-[#002d5a] hover:shadow-lg active:scale-[0.98] text-sm cursor-pointer"
          >
            Try Again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center px-6 py-3 bg-[#f5f5f7] text-[#1d1d1f] font-medium rounded-full transition-all duration-200 hover:bg-[#e8e8ed] active:scale-[0.98] text-sm"
          >
            Go Home
          </a>
        </div>
      </div>
    </div>
  );
}
