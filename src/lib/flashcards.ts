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
  due_at: z.string(),
  stability: z.number(),
  difficulty: z.number(),
  elapsed_days: z.number(),
  scheduled_days: z.number(),
  learning_steps: z.number(),
  reps: z.number(),
  lapses: z.number(),
  state: z.number(),
  last_reviewed_at: z.string().nullable(),
});

const REQUEST_TIMEOUT_MS = 10_000;

export class FlashcardNotFoundError extends Error {}

export async function saveFlashcard(front: string, back: string, source: FlashcardSource): Promise<Flashcard> {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, REQUEST_TIMEOUT_MS);

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

export async function updateFlashcard(id: string, front: string, back: string): Promise<Flashcard> {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`/api/flashcards/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ front, back }),
      signal: controller.signal,
    });
    if (response.status === 404) {
      throw new FlashcardNotFoundError("Flashcard not found");
    }
    const body: unknown = await response.json().catch(() => null);
    const parsed = flashcardSchema.safeParse(body);
    if (!response.ok || !parsed.success) {
      throw new Error("Failed to update flashcard");
    }
    return parsed.data;
  } finally {
    clearTimeout(timeout);
  }
}

export async function deleteFlashcard(id: string): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`/api/flashcards/${id}`, {
      method: "DELETE",
      signal: controller.signal,
    });
    if (response.ok || response.status === 404) {
      return;
    }
    throw new Error("Failed to delete flashcard");
  } finally {
    clearTimeout(timeout);
  }
}
