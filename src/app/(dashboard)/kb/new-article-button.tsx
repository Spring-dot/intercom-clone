"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function NewArticleButton({ categoryId }: { categoryId: string }) {
  const router = useRouter();
  const [isCreating, setIsCreating] = useState(false);

  async function handleClick() {
    setIsCreating(true);
    try {
      const res = await fetch("/api/articles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoryId }),
      });
      if (!res.ok) throw new Error("Failed to create article");
      const article: { id: string } = await res.json();
      router.push(`/kb/${article.id}`);
    } catch {
      setIsCreating(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isCreating}
      className="text-sm text-blue-600 hover:underline disabled:opacity-50"
    >
      {isCreating ? "Creating..." : "+ New article"}
    </button>
  );
}
