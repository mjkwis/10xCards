import { useState, type SyntheticEvent } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { ServerError } from "@/components/auth/ServerError";
import { GenerationError } from "@/components/flashcards/GenerationError";
import { CandidateCard } from "@/components/flashcards/CandidateCard";
import type { Flashcard, FlashcardCandidateDto } from "@/types";

const MAX_SOURCE_TEXT_LENGTH = 5000;
const GENERATE_TIMEOUT_MS = 30_000;

const generateResponseSchema = z.object({
  candidates: z.array(z.object({ front: z.string(), back: z.string() })),
});

const errorResponseSchema = z.object({
  error: z.string(),
});

interface GenerateReviewIslandProps {
  openRouterConfigured: boolean;
  onSaved: (flashcard: Flashcard) => void;
}

interface Candidate extends FlashcardCandidateDto {
  id: string;
}

function createId() {
  return crypto.randomUUID();
}

export function GenerateReviewIsland({ openRouterConfigured, onSaved }: GenerateReviewIslandProps) {
  const [sourceText, setSourceText] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [generationState, setGenerationState] = useState<"idle" | "generating" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  if (!openRouterConfigured) {
    return <ServerError message="AI generation isn't configured yet — set OPENROUTER_API_KEY to enable it." />;
  }

  async function handleGenerate() {
    setGenerationState("generating");
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, GENERATE_TIMEOUT_MS);
    try {
      const response = await fetch("/api/flashcards/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceText }),
        signal: controller.signal,
      });
      const body: unknown = await response.json();
      const parsed = generateResponseSchema.safeParse(body);
      if (!response.ok || !parsed.success) {
        const errorParsed = errorResponseSchema.safeParse(body);
        setErrorMessage(
          errorParsed.success ? errorParsed.data.error : "Flashcard generation failed. Please try again.",
        );
        setGenerationState("error");
        return;
      }
      setCandidates(parsed.data.candidates.map((candidate) => ({ ...candidate, id: createId() })));
      setGenerationState("idle");
    } catch {
      setErrorMessage("Flashcard generation failed. Please try again.");
      setGenerationState("error");
    } finally {
      clearTimeout(timeout);
    }
  }

  function handleSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    void handleGenerate();
  }

  function removeCandidate(id: string) {
    setCandidates((prev) => prev.filter((c) => c.id !== id));
  }

  return (
    <div className="w-full max-w-2xl space-y-4">
      <form onSubmit={handleSubmit} className="space-y-3">
        <textarea
          value={sourceText}
          onChange={(e) => {
            setSourceText(e.target.value);
          }}
          maxLength={MAX_SOURCE_TEXT_LENGTH}
          rows={8}
          placeholder="Paste source text (up to 5,000 characters)…"
          className="w-full rounded-lg border border-white/20 bg-white/10 p-3 text-sm text-white placeholder:text-white/40"
        />
        <div className="flex items-center justify-between">
          <span className="text-xs text-blue-100/50">
            {sourceText.length} / {MAX_SOURCE_TEXT_LENGTH}
          </span>
          <Button type="submit" disabled={sourceText.length === 0 || generationState === "generating"}>
            {generationState === "generating" ? "Generating…" : "Generate flashcards"}
          </Button>
        </div>
      </form>

      {generationState === "error" && <GenerationError message={errorMessage} onRetry={() => void handleGenerate()} />}

      {candidates.length > 0 && (
        <div className="space-y-3">
          {candidates.map((candidate) => (
            <CandidateCard
              key={candidate.id}
              candidate={candidate}
              onAccepted={(flashcard) => {
                onSaved(flashcard);
                removeCandidate(candidate.id);
              }}
              onRejected={() => {
                removeCandidate(candidate.id);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
