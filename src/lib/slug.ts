import { randomUUID } from "node:crypto";

/** Turns a display name into a short, URL/email-safe, near-certainly-unique slug. */
export function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const suffix = randomUUID().slice(0, 6);
  return `${base || "workspace"}-${suffix}`;
}
