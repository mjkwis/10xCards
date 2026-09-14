import type { APIRoute } from "astro";
import { z } from "zod";
import { createClient } from "@/lib/supabase";
import type { FlashcardSource } from "@/types";

const updateFlashcardSchema = z.object({
  front: z.string().trim().min(1).max(200),
  back: z.string().trim().min(1).max(500),
});

function nextSource(currentSource: FlashcardSource): FlashcardSource {
  return currentSource === "ai-full" ? "ai-edited" : currentSource;
}

export const PATCH: APIRoute = async (context) => {
  if (!context.locals.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const id = context.params.id;
  if (!id) {
    return Response.json({ error: "Flashcard not found" }, { status: 404 });
  }

  const body: unknown = await context.request.json().catch(() => null);
  const parsed = updateFlashcardSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return Response.json({ error: "Supabase is not configured" }, { status: 502 });
  }

  const { data: current, error: selectError } = await supabase
    .from("flashcards")
    .select("source")
    .eq("id", id)
    .eq("user_id", context.locals.user.id)
    .single();

  if (selectError) {
    if (selectError.code === "PGRST116") {
      return Response.json({ error: "Flashcard not found" }, { status: 404 });
    }
    return Response.json({ error: "Failed to load flashcard" }, { status: 502 });
  }

  const source = nextSource(current.source as FlashcardSource);

  const { data, error: updateError } = await supabase
    .from("flashcards")
    .update({ front: parsed.data.front, back: parsed.data.back, source })
    .eq("id", id)
    .eq("user_id", context.locals.user.id)
    .select()
    .single();

  if (updateError) {
    if (updateError.code === "PGRST116") {
      return Response.json({ error: "Flashcard not found" }, { status: 404 });
    }
    return Response.json({ error: "Failed to update flashcard" }, { status: 502 });
  }

  return Response.json(data, { status: 200 });
};
