import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ServerError } from "@/components/auth/ServerError";
import { updateFlashcard, deleteFlashcard, FlashcardNotFoundError } from "@/lib/flashcards";
import type { Flashcard } from "@/types";

type Mode = "view" | "editing" | "confirming-delete";

interface FlashcardListItemProps {
  flashcard: Flashcard;
  onUpdated: (flashcard: Flashcard) => void;
  onNotFound: (id: string) => void;
  onDeleted: (id: string) => void;
}

function sourceBadgeLabel(source: Flashcard["source"]) {
  return source === "manual" ? "Manual" : "AI";
}

export function FlashcardListItem({ flashcard, onUpdated, onNotFound, onDeleted }: FlashcardListItemProps) {
  const [mode, setMode] = useState<Mode>("view");
  const [front, setFront] = useState(flashcard.front);
  const [back, setBack] = useState(flashcard.back);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function startEditing() {
    setFront(flashcard.front);
    setBack(flashcard.back);
    setError(null);
    setNotFound(false);
    setMode("editing");
  }

  function cancelEditing() {
    setFront(flashcard.front);
    setBack(flashcard.back);
    setError(null);
    setNotFound(false);
    setMode("view");
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
      setMode("view");
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

  function startConfirmingDelete() {
    setDeleteError(null);
    setMode("confirming-delete");
  }

  function cancelDelete() {
    setDeleteError(null);
    setMode("view");
  }

  async function handleConfirmDelete() {
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await deleteFlashcard(flashcard.id);
      onDeleted(flashcard.id);
    } catch {
      setDeleteError("Couldn't delete this flashcard. Please try again.");
    } finally {
      setIsDeleting(false);
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

      {mode === "editing" ? (
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
      ) : mode === "confirming-delete" ? (
        <p className="text-sm text-blue-100/80">Delete this flashcard? This can&apos;t be undone.</p>
      ) : (
        <div className="space-y-1">
          <p className="font-semibold">{flashcard.front}</p>
          <p className="text-sm text-blue-100/80">{flashcard.back}</p>
        </div>
      )}

      {mode === "confirming-delete" ? (
        <ServerError message={deleteError} />
      ) : notFound ? (
        <ServerError
          message="This flashcard no longer exists."
          action={
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="border-white/20 bg-white/10 text-white hover:bg-white/25 hover:text-white"
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
        {mode === "editing" ? (
          <>
            <Button
              type="button"
              variant="success"
              size="sm"
              disabled={isSaving || isUnchanged || notFound}
              onClick={handleSave}
            >
              Save
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="border-white/20 bg-white/10 text-white hover:bg-white/25 hover:text-white"
              disabled={isSaving || notFound}
              onClick={cancelEditing}
            >
              Cancel
            </Button>
          </>
        ) : mode === "confirming-delete" ? (
          <>
            <Button type="button" variant="destructive" size="sm" disabled={isDeleting} onClick={handleConfirmDelete}>
              {isDeleting ? "Deleting…" : "Confirm"}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="border-white/20 bg-white/10 text-white hover:bg-white/25 hover:text-white"
              disabled={isDeleting}
              onClick={cancelDelete}
            >
              Cancel
            </Button>
          </>
        ) : (
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="border-white/20 bg-white/10 text-white hover:bg-white/25 hover:text-white"
              onClick={startEditing}
            >
              Edit
            </Button>
            <Button type="button" variant="destructive" size="sm" onClick={startConfirmingDelete}>
              Delete
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
