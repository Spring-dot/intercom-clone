import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-full flex-col items-center justify-center gap-3 p-6 text-center">
      <h1 className="text-lg font-semibold">Page not found</h1>
      <p className="text-sm text-gray-500">The page you&apos;re looking for doesn&apos;t exist.</p>
      <Link href="/" className="text-sm text-blue-600 hover:underline">
        Return home
      </Link>
    </main>
  );
}
