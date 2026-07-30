"use client";

import { useEffect } from "react";

export default function RootError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-full flex-col items-center justify-center gap-3 p-6 text-center">
      <h1 className="text-lg font-semibold">Something went wrong</h1>
      <p className="text-sm text-gray-500">
        An unexpected error occurred. Try again, or come back later.
      </p>
      <button
        type="button"
        onClick={() => unstable_retry()}
        className="rounded bg-black px-3 py-1.5 text-sm text-white"
      >
        Try again
      </button>
    </main>
  );
}
