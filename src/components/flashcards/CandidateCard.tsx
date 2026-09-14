import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ServerError } from "@/components/auth/ServerError";
import type { FlashcardCandidateDto, FlashcardSource } from "@/types";

interface CandidateCardProps {
  candidate: FlashcardCandidateDto;
  onAccepted: () => void;
  onRejected: () => void;
}

async function saveFlashcard(front: string, back: string, source: FlashcardSource) {
  const response = await fetch("/api/flashcards", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ front, back, source }),
  });
  if (!response.ok) {
    throw new Error("Failed to save flashcard");
  }
}

export function CandidateCard({ candidate, onAccepted, onRejected }: CandidateCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [front, setFront] = useState(candidate.front);
  const [back, setBack] = useState(candidate.back);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAccept(source: FlashcardSource) {
    setIsSaving(true);
    setError(null);
    try {
      await saveFlashcard(front, back, source);
      onAccepted();
    } catch {
      setError("Couldn't save this flashcard. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-white">
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
          <p className="font-semibold">{front}</p>
          <p className="text-sm text-blue-100/80">{back}</p>
        </div>
      )}

      <ServerError message={error} />

      <div className="mt-3 flex flex-wrap gap-2">
        {isEditing ? (
          <Button type="button" size="sm" disabled={isSaving} onClick={() => handleAccept("ai-edited")}>
            Save edit
          </Button>
        ) : (
          <>
            <Button type="button" size="sm" disabled={isSaving} onClick={() => handleAccept("ai-full")}>
              Accept
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isSaving}
              onClick={() => {
                setIsEditing(true);
              }}
            >
              Edit
            </Button>
          </>
        )}
        <Button type="button" variant="ghost" size="sm" disabled={isSaving} onClick={onRejected}>
          Reject
        </Button>
      </div>
    </div>
  );
}
