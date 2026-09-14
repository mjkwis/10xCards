import type { APIRoute } from "astro";
import { z } from "zod";
import { GenerationFailedError, GenerationTimeoutError, generateFlashcardCandidates } from "@/lib/services/openrouter";
import type { GenerateFlashcardsResponseDto } from "@/types";

const MAX_SOURCE_TEXT_LENGTH = 5000;

const generateCommandSchema = z.object({
  sourceText: z.string().min(1).max(MAX_SOURCE_TEXT_LENGTH),
});

export const POST: APIRoute = async (context) => {
  if (!context.locals.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body: unknown = await context.request.json().catch(() => null);
  const parsed = generateCommandSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  try {
    const candidates = await generateFlashcardCandidates(parsed.data.sourceText);
    const responseBody: GenerateFlashcardsResponseDto = { candidates };
    return Response.json(responseBody, { status: 200 });
  } catch (error) {
    if (error instanceof GenerationTimeoutError) {
      return Response.json({ error: "Flashcard generation timed out. Please try again." }, { status: 504 });
    }
    if (error instanceof GenerationFailedError) {
      return Response.json({ error: "Flashcard generation failed. Please try again." }, { status: 502 });
    }
    return Response.json({ error: "Flashcard generation failed. Please try again." }, { status: 502 });
  }
};
