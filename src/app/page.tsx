import Link from "next/link";

const FEATURES = [
  {
    title: "Unified Inbox",
    blurb: "Chat and email conversations in one queue -- no switching tools.",
  },
  {
    title: "Real-time Chat Widget",
    blurb: "Drop-in widget for your site, live message delivery both ways.",
  },
  {
    title: "AI Summaries",
    blurb: "Every conversation gets a quick what/tried/status summary.",
  },
  {
    title: "Knowledge Base",
    blurb: "Publish help articles your widget can suggest as customers type.",
  },
];

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center px-6 py-24">
      <section className="flex max-w-2xl flex-col items-center gap-6 text-center">
        <h1 className="text-4xl font-semibold tracking-tight">Intercom Clone</h1>
        <p className="max-w-lg text-lg text-gray-600">
          The unified inbox for chat and email support, with AI summaries and a
          searchable knowledge base built in.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/sign-in"
            className="rounded border border-gray-300 px-4 py-2 text-sm font-medium hover:bg-gray-50"
          >
            Sign in
          </Link>
          <Link
            href="/sign-up"
            className="rounded bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            Sign up
          </Link>
          <Link
            href="/demo"
            className="rounded border border-gray-300 px-4 py-2 text-sm font-medium hover:bg-gray-50"
          >
            Try the live chat demo
          </Link>
        </div>
      </section>

      <section className="mt-20 grid w-full max-w-3xl grid-cols-1 gap-6 sm:grid-cols-2">
        {FEATURES.map((feature) => (
          <div key={feature.title} className="rounded border border-gray-200 p-4">
            <h2 className="font-medium">{feature.title}</h2>
            <p className="mt-1 text-sm text-gray-600">{feature.blurb}</p>
          </div>
        ))}
      </section>
    </main>
  );
}
