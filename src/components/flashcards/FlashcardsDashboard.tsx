import { useCallback, useState } from "react";
import { z } from "zod";
import { GenerateReviewIsland } from "@/components/flashcards/GenerateReviewIsland";
import { ManualCreateForm } from "@/components/flashcards/ManualCreateForm";
import { FlashcardsList } from "@/components/flashcards/FlashcardsList";
import type { Flashcard } from "@/types";

const flashcardSchema = z.object({
  id: z.string(),
  front: z.string(),
  back: z.string(),
  source: z.enum(["ai-full", "ai-edited", "manual"]),
  user_id: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

const flashcardsResponseSchema = z.array(flashcardSchema);

const errorResponseSchema = z.object({
  error: z.string(),
});

interface FlashcardsDashboardProps {
  openRouterConfigured: boolean;
  initialFlashcards: Flashcard[];
  initialError: string;
}

export function FlashcardsDashboard({
  openRouterConfigured,
  initialFlashcards,
  initialError,
}: FlashcardsDashboardProps) {
  const [flashcards, setFlashcards] = useState<Flashcard[]>(initialFlashcards);
  const [listState, setListState] = useState<"loading" | "ready" | "error">(initialError ? "error" : "ready");
  const [listError, setListError] = useState(initialError);

  const retryLoadFlashcards = useCallback(() => {
    setListState("loading");
    setListError("");
    void (async () => {
      try {
        const response = await fetch("/api/flashcards");
        const body: unknown = await response.json();
        const parsed = flashcardsResponseSchema.safeParse(body);
        if (!response.ok || !parsed.success) {
          const errorParsed = errorResponseSchema.safeParse(body);
          setListError(errorParsed.success ? errorParsed.data.error : "Failed to load flashcards. Please try again.");
          setListState("error");
          return;
        }
        setFlashcards((prev) => {
          const fetchedIds = new Set(parsed.data.map((f) => f.id));
          const localOnly = prev.filter((f) => !fetchedIds.has(f.id));
          return [...localOnly, ...parsed.data];
        });
        setListState("ready");
      } catch {
        setListError("Failed to load flashcards. Please try again.");
        setListState("error");
      }
    })();
  }, []);

  const handleCardSaved = useCallback((flashcard: Flashcard) => {
    setFlashcards((prev) => {
      if (prev.some((f) => f.id === flashcard.id)) {
        return prev;
      }
      return [flashcard, ...prev];
    });
  }, []);

  return (
    <>
      <GenerateReviewIsland openRouterConfigured={openRouterConfigured} onSaved={handleCardSaved} />
      <ManualCreateForm onCreated={handleCardSaved} />
      <div className="w-full max-w-2xl space-y-3">
        <h2 className="text-xl font-semibold text-white">Your flashcards</h2>
        <FlashcardsList flashcards={flashcards} state={listState} error={listError} onRetry={retryLoadFlashcards} />
      </div>
    </>
  );
}
