import type { APIRoute } from "astro";
import { z } from "zod";
import { createClient } from "@/lib/supabase";

const createFlashcardSchema = z.object({
  front: z.string().min(1).max(200),
  back: z.string().min(1).max(500),
  source: z.enum(["ai-full", "ai-edited", "manual"]),
});

export const POST: APIRoute = async (context) => {
  if (!context.locals.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body: unknown = await context.request.json().catch(() => null);
  const parsed = createFlashcardSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return Response.json({ error: "Supabase is not configured" }, { status: 502 });
  }

  const { data, error } = await supabase
    .from("flashcards")
    .insert({
      user_id: context.locals.user.id,
      front: parsed.data.front,
      back: parsed.data.back,
      source: parsed.data.source,
    })
    .select()
    .single();

  if (error) {
    return Response.json({ error: "Failed to save flashcard" }, { status: 502 });
  }

  return Response.json(data, { status: 201 });
};
