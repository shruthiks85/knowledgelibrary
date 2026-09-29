import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { supabaseConfigured } from "@/lib/supabase";
import {
  createSavedItem,
  deleteSavedItem,
  listSavedItems,
  parseUrl,
  type SavedItem,
} from "@/lib/saved-items";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "My Knowledge Library" },
      { name: "description", content: "Save YouTube videos and web pages you want to find later." },
      { property: "og:title", content: "My Knowledge Library" },
      { property: "og:description", content: "Save YouTube videos and web pages you want to find later." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function Index() {
  const [items, setItems] = useState<SavedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setLoadError(null);
    try {
      setItems(await listSavedItems());
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Couldn't load your library.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (supabaseConfigured) void load();
    else setLoading(false);
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSaved(false);
    let parsed;
    try {
      parsed = parseUrl(input);
    } catch (err) {
      setFormError((err as Error).message);
      return;
    }
    setSaving(true);
    try {
      await createSavedItem(parsed.url, parsed.sourceType);
      setInput("");
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      await load();
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(id: string) {
    setDeleteError(null);
    setDeletingId(id);
    try {
      await deleteSavedItem(id);
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch (err) {
      setDeleteError((err as Error).message);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <main className="min-h-screen bg-background text-foreground" style={{ fontFamily: "Figtree, sans-serif" }}>
      <div className="mx-auto max-w-2xl px-5 py-16 sm:py-24">
        <header className="mb-10">
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl" style={{ fontFamily: "Fraunces, serif" }}>
            My Knowledge Library
          </h1>
          <p className="mt-3 text-lg text-muted-foreground">Save things you want to find later.</p>
        </header>

        {!supabaseConfigured && (
          <div className="mb-8 rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm">
            The library isn't connected to the database yet. Add <code>VITE_SUPABASE_URL</code> and{" "}
            <code>VITE_SUPABASE_ANON_KEY</code> to the project's environment settings.
          </div>
        )}

        <form onSubmit={onSubmit} className="flex flex-col gap-3 sm:flex-row">
          <input
            type="text"
            inputMode="url"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Paste a YouTube or web URL..."
            aria-label="URL"
            className="h-12 flex-1 rounded-lg border border-input bg-card px-4 text-base outline-none focus:ring-2 focus:ring-ring"
          />
          <button
            type="submit"
            disabled={saving || !supabaseConfigured}
            className="h-12 rounded-lg bg-primary px-6 font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </form>
        <div className="mt-2 min-h-5 text-sm" aria-live="polite">
          {formError && <p className="text-destructive">{formError}</p>}
          {saved && <p className="text-muted-foreground">Saved</p>}
        </div>

        <section className="mt-10">
          {deleteError && <p className="mb-3 text-sm text-destructive">{deleteError}</p>}
          {loading ? (
            <p className="text-muted-foreground">Loading your library…</p>
          ) : loadError ? (
            <div className="rounded-lg border border-destructive/40 p-4 text-sm">
              <p className="text-destructive">{loadError}</p>
              <button onClick={() => void load()} className="mt-2 underline">Try again</button>
            </div>
          ) : items.length === 0 && supabaseConfigured ? (
            <div className="rounded-lg border border-dashed border-border p-10 text-center">
              <p className="font-medium">Nothing saved yet.</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Paste a YouTube or web URL above to start building your library.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border bg-card">
              {items.map((item) => (
                <li key={item.id} className="flex items-start gap-4 p-4">
                  <span className="mt-0.5 shrink-0 rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground">
                    {item.source_type === "youtube" ? "YouTube" : "Web"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block break-all text-sm font-medium hover:underline"
                    >
                      {item.url}
                    </a>
                    <p className="mt-1 text-xs text-muted-foreground">{formatDate(item.created_at)}</p>
                  </div>
                  <button
                    onClick={() => void onDelete(item.id)}
                    disabled={deletingId === item.id}
                    className="shrink-0 text-sm text-muted-foreground hover:text-destructive disabled:opacity-50"
                  >
                    {deletingId === item.id ? "Deleting…" : "Delete"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
