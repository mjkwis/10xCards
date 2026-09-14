import { GenerationError } from "@/components/flashcards/GenerationError";
import type { Flashcard } from "@/types";

interface FlashcardsListProps {
  flashcards: Flashcard[];
  state: "loading" | "ready" | "error";
  error: string;
  onRetry: () => void;
}

function sourceBadgeLabel(source: Flashcard["source"]) {
  return source === "manual" ? "Manual" : "AI";
}

export function FlashcardsList({ flashcards, state, error, onRetry }: FlashcardsListProps) {
  if (state === "loading") {
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
        <div key={flashcard.id} className="rounded-xl border border-white/10 bg-white/5 p-4 text-white">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="rounded-full border border-white/20 bg-white/10 px-2 py-0.5 text-xs text-blue-100/80">
              {sourceBadgeLabel(flashcard.source)}
            </span>
          </div>
          <div className="space-y-1">
            <p className="font-semibold">{flashcard.front}</p>
            <p className="text-sm text-blue-100/80">{flashcard.back}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
