import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ServerError } from "@/components/auth/ServerError";
import { updateFlashcard, FlashcardNotFoundError } from "@/lib/flashcards";
import type { Flashcard } from "@/types";

interface FlashcardListItemProps {
  flashcard: Flashcard;
  onUpdated: (flashcard: Flashcard) => void;
  onNotFound: (id: string) => void;
}

function sourceBadgeLabel(source: Flashcard["source"]) {
  return source === "manual" ? "Manual" : "AI";
}

export function FlashcardListItem({ flashcard, onUpdated, onNotFound }: FlashcardListItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [front, setFront] = useState(flashcard.front);
  const [back, setBack] = useState(flashcard.back);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  function startEditing() {
    setFront(flashcard.front);
    setBack(flashcard.back);
    setError(null);
    setNotFound(false);
    setIsEditing(true);
  }

  function cancelEditing() {
    setFront(flashcard.front);
    setBack(flashcard.back);
    setError(null);
    setNotFound(false);
    setIsEditing(false);
  }

  async function handleSave() {
    setIsSaving(true);
    setError(null);
    setNotFound(false);
    try {
      const updated = await updateFlashcard(flashcard.id, front, back);
      onUpdated(updated);
      setFront(updated.front);
      setBack(updated.back);
      setIsEditing(false);
    } catch (err) {
      if (err instanceof FlashcardNotFoundError) {
        setNotFound(true);
      } else {
        setError("Couldn't save changes. Please try again.");
      }
    } finally {
      setIsSaving(false);
    }
  }

  const isUnchanged = front === flashcard.front && back === flashcard.back;

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-white">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="rounded-full border border-white/20 bg-white/10 px-2 py-0.5 text-xs text-blue-100/80">
          {sourceBadgeLabel(flashcard.source)}
        </span>
      </div>

      {isEditing ? (
        <div className="space-y-2">
          <textarea
            value={front}
            onChange={(e) => {
              setFront(e.target.value);
            }}
            maxLength={200}
            rows={2}
            className="w-full rounded-lg border border-white/20 bg-white/10 p-2 text-sm text-white placeholder:text-white/40"
            placeholder="Front"
          />
          <textarea
            value={back}
            onChange={(e) => {
              setBack(e.target.value);
            }}
            maxLength={500}
            rows={3}
            className="w-full rounded-lg border border-white/20 bg-white/10 p-2 text-sm text-white placeholder:text-white/40"
            placeholder="Back"
          />
        </div>
      ) : (
        <div className="space-y-1">
          <p className="font-semibold">{flashcard.front}</p>
          <p className="text-sm text-blue-100/80">{flashcard.back}</p>
        </div>
      )}

      {notFound ? (
        <ServerError
          message="This flashcard no longer exists."
          action={
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                onNotFound(flashcard.id);
              }}
            >
              Remove
            </Button>
          }
        />
      ) : (
        <ServerError message={error} />
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {isEditing ? (
          <>
            <Button type="button" variant="success" size="sm" disabled={isSaving || isUnchanged} onClick={handleSave}>
              Save
            </Button>
            <Button type="button" variant="outline" size="sm" disabled={isSaving} onClick={cancelEditing}>
              Cancel
            </Button>
          </>
        ) : (
          <Button type="button" variant="outline" size="sm" onClick={startEditing}>
            Edit
          </Button>
        )}
      </div>
    </div>
  );
}
