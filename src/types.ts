import type { Database } from "@/db/database.types";

export type FlashcardSource = "ai-full" | "ai-edited" | "manual";

export type Flashcard = Omit<Database["public"]["Tables"]["flashcards"]["Row"], "source"> & {
  source: FlashcardSource;
};
