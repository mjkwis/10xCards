import { z } from "zod";
import type { Flashcard, FlashcardSource } from "@/types";

export const flashcardSchema = z.object({
  id: z.string(),
  front: z.string(),
  back: z.string(),
  source: z.enum(["ai-full", "ai-edited", "manual"]),
  user_id: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

const SAVE_TIMEOUT_MS = 10_000;

export async function saveFlashcard(front: string, back: string, source: FlashcardSource): Promise<Flashcard> {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, SAVE_TIMEOUT_MS);

  try {
    const response = await fetch("/api/flashcards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ front, back, source }),
      signal: controller.signal,
    });
    const body: unknown = await response.json().catch(() => null);
    const parsed = flashcardSchema.safeParse(body);
    if (!response.ok || !parsed.success) {
      throw new Error("Failed to save flashcard");
    }
    return parsed.data;
  } finally {
    clearTimeout(timeout);
  }
}
