"use client";

import { useState } from "react";
import Link from "next/link";

type PublicArticle = { id: string; title: string; categoryName: string };

/**
 * Client-side substring filter over the already-loaded published articles --
 * chosen over a dedicated search API route since the whole published list
 * for a workspace is small and already sitting in the page payload; no need
 * for a second round-trip just to filter it. (The widget's autosuggest is a
 * separate concern with its own /api/kb-search route, since it needs to
 * search without first loading the whole list.)
 *
 * `basePath` rather than a workspace slug, because the same help center is
 * reachable at /help-center/{slug} and at the workspace's own custom domain
 * (where it lives at the root) -- the caller owns which one it is.
 */
export function ArticleSearch({
  articles,
  basePath,
}: {
  articles: PublicArticle[];
  basePath: string;
}) {
  const [query, setQuery] = useState("");

  const filtered = query.trim()
    ? articles.filter((article) => article.title.toLowerCase().includes(query.trim().toLowerCase()))
    : articles;

  return (
    <div className="flex flex-col gap-3">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search articles..."
        className="rounded border border-gray-300 px-3 py-2 text-sm"
      />
      {query.trim() && (
        <ul className="flex flex-col gap-1">
          {filtered.length === 0 ? (
            <p className="text-sm text-gray-500">No articles match &quot;{query}&quot;.</p>
          ) : (
            filtered.map((article) => (
              <li key={article.id}>
                <Link
                  href={`${basePath}/${article.id}`}
                  className="text-sm text-blue-600 hover:underline"
                >
                  {article.title}
                </Link>
                <span className="text-xs text-gray-500"> -- {article.categoryName}</span>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
