import { getSupabase } from "./supabase";

export type SourceType = "youtube" | "web";

export interface SavedItem {
  id: string;
  url: string;
  source_type: string;
  title: string | null;
  notes: string | null;
  created_at: string;
}

const YOUTUBE_HOSTS = new Set(["youtube.com", "www.youtube.com", "youtu.be", "www.youtube-nocookie.com"]);

export function parseUrl(input: string): { url: string; sourceType: SourceType } {
  const trimmed = input.trim();
  if (!trimmed) throw new Error("Please paste a URL first.");
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error("That doesn't look like a valid URL. It should start with http:// or https://.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Only http:// and https:// URLs can be saved.");
  }
  const sourceType: SourceType = YOUTUBE_HOSTS.has(parsed.hostname.toLowerCase()) ? "youtube" : "web";
  return { url: trimmed, sourceType };
}

export async function listSavedItems(): Promise<SavedItem[]> {
  const { data, error } = await getSupabase()
    .from("saved_items")
    .select("id, url, source_type, title, notes, created_at")
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[saved_items] read failed", error);
    throw new Error("Couldn't load your library. Please try again.");
  }
  return data ?? [];
}

export async function createSavedItem(url: string, sourceType: SourceType): Promise<SavedItem> {
  const supabase = getSupabase();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error("Please log in again to save items.");
  const { data, error } = await supabase
    .from("saved_items")
    .insert({ url, source_type: sourceType, user_id: userData.user.id, created_at: new Date().toISOString() })
    .select("id, url, source_type, title, notes, created_at")
    .single();
  if (error) {
    if (error.code === "23505") throw new Error("You've already saved this URL.");
    console.error("[saved_items] insert failed", error);
    throw new Error("Couldn't save this URL. Please try again.");
  }
  return data;
}

export async function deleteSavedItem(id: string): Promise<void> {
  const { error, count } = await getSupabase()
    .from("saved_items")
    .delete({ count: "exact" })
    .eq("id", id);
  if (error) {
    console.error("[saved_items] delete failed", error);
    throw new Error("Couldn't delete this item. Please try again.");
  }
  if (count === 0) {
    console.error("[saved_items] delete affected 0 rows (check RLS delete policy)", { id });
    throw new Error("Couldn't delete this item. It may not be allowed by your database settings.");
  }
}
/* Test the YouTube enrichment function by invoking it with a saved item ID. This function checks if the user is logged in, then calls the "enrich-youtube" Supabase function with the provided saved item ID. It handles errors and logs the result. */
export async function testYouTubeEnrichment(savedItemId: string) {
  const supabase = getSupabase();

  const { data: sessionData, error: sessionError } =
    await supabase.auth.getSession();

  if (sessionError || !sessionData.session) {
    throw new Error("You must be logged in to test YouTube enrichment.");
  }

  const { data, error } = await supabase.functions.invoke(
    "enrich-youtube",
    {
      body: {
        saved_item_id: savedItemId,
      },
    },
  );

  if (error) {
    console.error("[enrich-youtube] failed", error);
    throw error;
  }

  console.log("[enrich-youtube] result", data);

  return data;
}
