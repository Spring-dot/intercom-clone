"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";

type ArticleStatus = "draft" | "published";

export function ArticleEditor({
  article,
  categories,
}: {
  article: {
    id: string;
    title: string;
    content: string;
    status: ArticleStatus;
    categoryId: string;
  };
  categories: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [title, setTitle] = useState(article.title);
  const [categoryId, setCategoryId] = useState(article.categoryId);
  const [status, setStatus] = useState<ArticleStatus>(article.status);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const editor = useEditor({
    extensions: [StarterKit],
    content: article.content,
    immediatelyRender: false,
  });

  async function handleSave() {
    if (!editor) return;
    setIsSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/articles/${article.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          categoryId,
          status,
          content: editor.getHTML(),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? "Failed to save article");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save article");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Delete this article? This can't be undone.")) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/articles/${article.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete article");
      router.push("/kb");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete article");
      setIsDeleting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 max-w-2xl">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Article title"
        className="text-lg font-semibold border border-gray-300 rounded px-2 py-1"
      />

      <div className="flex items-center gap-4 text-sm">
        <label className="flex items-center gap-1">
          Category
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="border border-gray-300 rounded px-2 py-1"
          >
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-1">
          <input
            type="checkbox"
            checked={status === "published"}
            onChange={(e) => setStatus(e.target.checked ? "published" : "draft")}
          />
          Published
        </label>
      </div>

      {editor && (
        <div className="flex items-center gap-2 text-sm border-b border-gray-200 pb-2">
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleBold().run()}
            className={`px-2 py-1 rounded border ${editor.isActive("bold") ? "bg-gray-200" : "border-gray-300"}`}
          >
            Bold
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleItalic().run()}
            className={`px-2 py-1 rounded border ${editor.isActive("italic") ? "bg-gray-200" : "border-gray-300"}`}
          >
            Italic
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            className={`px-2 py-1 rounded border ${editor.isActive("heading", { level: 2 }) ? "bg-gray-200" : "border-gray-300"}`}
          >
            Heading
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            className={`px-2 py-1 rounded border ${editor.isActive("bulletList") ? "bg-gray-200" : "border-gray-300"}`}
          >
            Bullet list
          </button>
        </div>
      )}

      <EditorContent editor={editor} className="border border-gray-300 rounded p-3 min-h-[240px] text-sm" />

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving || !editor}
          className="rounded bg-black px-3 py-1.5 text-sm text-white disabled:opacity-50"
        >
          {isSaving ? "Saving..." : "Save"}
        </button>
        <button
          type="button"
          onClick={handleDelete}
          disabled={isDeleting}
          className="rounded border border-red-300 px-3 py-1.5 text-sm text-red-600 disabled:opacity-50"
        >
          {isDeleting ? "Deleting..." : "Delete"}
        </button>
      </div>
    </div>
  );
}
