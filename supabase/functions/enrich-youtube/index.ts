import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function extractYouTubeVideoId(urlString: string): string | null {
  try {
    const url = new URL(urlString);
    const hostname = url.hostname.toLowerCase();

    // youtube.com/watch?v=VIDEO_ID
    if (
      hostname === "youtube.com" ||
      hostname === "www.youtube.com" ||
      hostname === "m.youtube.com"
    ) {
      const videoId = url.searchParams.get("v");

      if (videoId) {
        return videoId;
      }

      // youtube.com/shorts/VIDEO_ID
      const shortsMatch = url.pathname.match(/^\/shorts\/([^/]+)/);

      if (shortsMatch) {
        return shortsMatch[1];
      }

      // youtube.com/embed/VIDEO_ID
      const embedMatch = url.pathname.match(/^\/embed\/([^/]+)/);

      if (embedMatch) {
        return embedMatch[1];
      }
    }

    // youtu.be/VIDEO_ID
    if (hostname === "youtu.be") {
      const videoId = url.pathname.split("/")[1];

      if (videoId) {
        return videoId;
      }
    }

    return null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  // Handle browser preflight request
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }
  let savedItemId: string | null = null;
  const authHeader = req.headers.get("Authorization");

  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Missing authorization header" }), {
      status: 401,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    });
  }

  // 2. Create a Supabase client using the user's JWT
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: {
      headers: {
        Authorization: authHeader,
      },
    },
  });

  try {
    // 1. Get the user's JWT from the request

    // 3. Verify the authenticated user
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      });
    }

    // 4. Read the request body
    const { saved_item_id } = await req.json();
    savedItemId = saved_item_id;
    if (!saved_item_id) {
      return new Response(JSON.stringify({ error: "saved_item_id is required" }), {
        status: 400,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      });
    }

    // 5. Load the saved item
    // RLS automatically ensures this belongs to the logged-in user.
    const { data: savedItem, error: savedItemError } = await supabase
      .from("saved_items")
      .select("id, url, source_type")
      .eq("id", saved_item_id)
      .single();

    if (savedItemError || !savedItem) {
      return new Response(JSON.stringify({ error: "Saved item not found" }), {
        status: 404,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      });
    }

    // 6. Make sure this is actually a YouTube item
    if (savedItem.source_type !== "youtube") {
      return new Response(JSON.stringify({ error: "Saved item is not a YouTube URL" }), {
        status: 400,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      });
    }

    // 7. Extract the YouTube video ID
    const videoId = extractYouTubeVideoId(savedItem.url);

    if (!videoId) {
      return new Response(JSON.stringify({ error: "Could not extract YouTube video ID" }), {
        status: 400,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      });
    }

    const { error: processingError } = await supabase.from("youtube_items").upsert(
      {
        saved_item_id: savedItem.id,
        video_id: videoId,
        metadata_status: "processing",
        metadata_error: null,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "saved_item_id",
      },
    );

    if (processingError) {
      throw new Error(`Database error while starting enrichment: ${processingError.message}`);
    }

    // 8. Get the YouTube API key from Supabase secrets
    const youtubeApiKey = Deno.env.get("YOUTUBE_API_KEY");

    if (!youtubeApiKey) {
      throw new Error("YOUTUBE_API_KEY is not configured");
    }

    // 9. Ask YouTube for the video's metadata
    const youtubeUrl = new URL("https://www.googleapis.com/youtube/v3/videos");

    youtubeUrl.searchParams.set("part", "snippet");
    youtubeUrl.searchParams.set("id", videoId);
    youtubeUrl.searchParams.set("key", youtubeApiKey);

    const youtubeResponse = await fetch(youtubeUrl.toString());

    if (!youtubeResponse.ok) {
      const errorText = await youtubeResponse.text();

      const errorMessage = `YouTube API error: ${youtubeResponse.status}`;

      await supabase
        .from("youtube_items")
        .update({
          metadata_status: "error",
          metadata_error: errorMessage,
          updated_at: new Date().toISOString(),
        })
        .eq("saved_item_id", savedItem.id);

      throw new Error(errorMessage);
    }

    const youtubeData = await youtubeResponse.json();

    // 10. YouTube returned no matching video
    if (!youtubeData.items || youtubeData.items.length === 0) {
      const errorMessage = "YouTube video was not found or is unavailable";

      await supabase
        .from("youtube_items")
        .update({
          metadata_status: "error",
          metadata_error: errorMessage,
          updated_at: new Date().toISOString(),
        })
        .eq("saved_item_id", savedItem.id);

      return new Response(
        JSON.stringify({
          error: errorMessage,
        }),
        {
          status: 404,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    const snippet = youtubeData.items[0].snippet;

    // 11. Save the metadata in youtube_items
    const { data: youtubeItem, error: upsertError } = await supabase
      .from("youtube_items")
      .upsert(
        {
          saved_item_id: savedItem.id,
          video_id: videoId,
          title: snippet.title,
          channel_title: snippet.channelTitle,
          description: snippet.description,
          published_at: snippet.publishedAt,
          thumbnail_url:
            snippet.thumbnails?.high?.url ??
            snippet.thumbnails?.medium?.url ??
            snippet.thumbnails?.default?.url ??
            null,
          metadata_status: "complete",
          metadata_error: null,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "saved_item_id",
        },
      )
      .select()
      .single();

    if (upsertError) {
      throw new Error(`Database error: ${upsertError.message}`);
    }

    // 12. Return the result
    return new Response(
      JSON.stringify({
        success: true,
        user_id: user.id,
        youtube_item: youtubeItem,
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  } catch (error) {
    console.error("[enrich-youtube] unexpected error", error);

    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    if (savedItemId) {
      await supabase
        .from("youtube_items")
        .update({
          metadata_status: "error",
          metadata_error: errorMessage,
          updated_at: new Date().toISOString(),
        })
        .eq("saved_item_id", savedItemId);
    }

    return new Response(
      JSON.stringify({
        error: errorMessage,
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  }
});
