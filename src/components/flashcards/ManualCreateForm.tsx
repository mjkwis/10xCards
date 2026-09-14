import { useState, type SyntheticEvent } from "react";
import { Button } from "@/components/ui/button";
import { ServerError } from "@/components/auth/ServerError";
import { saveFlashcard } from "@/lib/flashcards";
import type { Flashcard } from "@/types";

interface ManualCreateFormProps {
  onCreated: (flashcard: Flashcard) => void;
}

export function ManualCreateForm({ onCreated }: ManualCreateFormProps) {
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaveState("saving");
    setErrorMessage("");
    try {
      const flashcard = await saveFlashcard(front, back, "manual");
      onCreated(flashcard);
      setFront("");
      setBack("");
      setSaveState("idle");
    } catch {
      setErrorMessage("Couldn't save this flashcard. Please try again.");
      setSaveState("error");
    }
  }

  const isSaving = saveState === "saving";
  const submitDisabled = front.trim().length === 0 || back.trim().length === 0 || isSaving;

  return (
    <form
      onSubmit={(event) => void handleSubmit(event)}
      className="w-full max-w-2xl space-y-3 rounded-xl border border-white/10 bg-white/5 p-4 text-white"
    >
      <h2 className="font-semibold">Create flashcard</h2>
      <textarea
        value={front}
        onChange={(e) => {
          setFront(e.target.value);
        }}
        maxLength={200}
        rows={2}
        placeholder="Front"
        className="w-full rounded-lg border border-white/20 bg-white/10 p-2 text-sm text-white placeholder:text-white/40"
      />
      <textarea
        value={back}
        onChange={(e) => {
          setBack(e.target.value);
        }}
        maxLength={500}
        rows={3}
        placeholder="Back"
        className="w-full rounded-lg border border-white/20 bg-white/10 p-2 text-sm text-white placeholder:text-white/40"
      />

      <ServerError message={saveState === "error" ? errorMessage : null} />

      <Button type="submit" size="sm" disabled={submitDisabled}>
        {isSaving ? "Saving…" : "Add flashcard"}
      </Button>
    </form>
  );
}
