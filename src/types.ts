import type { Database } from "@/db/database.types";

export type FlashcardSource = "ai-full" | "ai-edited" | "manual";

export type Flashcard = Omit<Database["public"]["Tables"]["flashcards"]["Row"], "source"> & {
  source: FlashcardSource;
};

export interface GenerateFlashcardsCommand {
  sourceText: string;
}

export interface FlashcardCandidateDto {
  front: string;
  back: string;
}

export interface GenerateFlashcardsResponseDto {
  candidates: FlashcardCandidateDto[];
}

export interface CreateFlashcardCommand {
  front: string;
  back: string;
  source: FlashcardSource;
}

export interface UpdateFlashcardCommand {
  front: string;
  back: string;
}
