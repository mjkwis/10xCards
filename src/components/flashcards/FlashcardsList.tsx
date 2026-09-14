import { GenerationError } from "@/components/flashcards/GenerationError";
import { FlashcardListItem } from "@/components/flashcards/FlashcardListItem";
import type { Flashcard } from "@/types";

interface FlashcardsListProps {
  flashcards: Flashcard[];
  state: "loading" | "ready" | "error";
  error: string;
  onRetry: () => void;
  onUpdated: (flashcard: Flashcard) => void;
  onNotFound: (id: string) => void;
}

export function FlashcardsList({ flashcards, state, error, onRetry, onUpdated, onNotFound }: FlashcardsListProps) {
  if (state === "loading" && flashcards.length === 0) {
    return <p className="text-sm text-blue-100/70">Loading your flashcards…</p>;
  }

  if (state === "error") {
    return <GenerationError message={error} onRetry={onRetry} />;
  }

  if (flashcards.length === 0) {
    return (
      <p className="text-sm text-blue-100/70">
        You don&apos;t have any flashcards yet. Create one manually or generate some with AI above.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {flashcards.map((flashcard) => (
        <FlashcardListItem key={flashcard.id} flashcard={flashcard} onUpdated={onUpdated} onNotFound={onNotFound} />
      ))}
    </div>
  );
}
