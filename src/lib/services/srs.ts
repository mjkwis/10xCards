import { fsrs, generatorParameters, type Card } from "ts-fsrs";
import type { FlashcardRating } from "@/types";

export interface FlashcardSrsFields {
  due_at: string;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  learning_steps: number;
  reps: number;
  lapses: number;
  state: number;
  last_reviewed_at: string | null;
}

const scheduler = fsrs(generatorParameters());

function toCard(fields: FlashcardSrsFields): Card {
  return {
    due: new Date(fields.due_at),
    stability: fields.stability,
    difficulty: fields.difficulty,
    elapsed_days: fields.elapsed_days,
    scheduled_days: fields.scheduled_days,
    learning_steps: fields.learning_steps,
    reps: fields.reps,
    lapses: fields.lapses,
    state: fields.state,
    last_review: fields.last_reviewed_at ? new Date(fields.last_reviewed_at) : undefined,
  };
}

function fromCard(card: Card): FlashcardSrsFields {
  return {
    due_at: card.due.toISOString(),
    stability: card.stability,
    difficulty: card.difficulty,
    // eslint-disable-next-line @typescript-eslint/no-deprecated -- required field on ts-fsrs@5.x's Card; removed in v6
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    learning_steps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    last_reviewed_at: card.last_review ? card.last_review.toISOString() : null,
  };
}

export function scheduleReview(current: FlashcardSrsFields, rating: FlashcardRating, now: Date): FlashcardSrsFields {
  const card = toCard(current);
  const { card: nextCard } = scheduler.next(card, now, rating);
  return fromCard(nextCard);
}
