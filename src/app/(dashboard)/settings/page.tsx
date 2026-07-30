import Link from "next/link";

const SECTIONS = [
  {
    href: "/settings/team",
    title: "Team",
    blurb: "Invite teammates, set admin/agent roles, remove members.",
  },
  {
    href: "/settings/widget",
    title: "Chat widget",
    blurb: "Your embed snippet and a live demo page to test it on.",
  },
  {
    href: "/settings/email",
    title: "Email channel",
    blurb: "The address that turns inbound email into conversations.",
  },
  {
    href: "/settings/domain",
    title: "Custom domain",
    blurb: "Serve your help center from your own hostname.",
  },
];

export default function SettingsPage() {
  return (
    <main className="flex max-w-2xl flex-col gap-4 p-6">
      <h1 className="text-xl font-semibold">Settings</h1>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {SECTIONS.map((section) => (
          <li key={section.href}>
            <Link
              href={section.href}
              className="flex h-full flex-col rounded border border-gray-200 p-4 hover:bg-gray-50"
            >
              <span className="font-medium">{section.title}</span>
              <span className="mt-1 text-sm text-gray-600">{section.blurb}</span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
