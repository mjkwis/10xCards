import { z } from "zod";
import { OPENROUTER_API_KEY, OPENROUTER_MODEL } from "astro:env/server";
import type { FlashcardCandidateDto } from "@/types";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "openai/gpt-4o-mini";
const DEFAULT_TIMEOUT_MS = 20_000;
const MAX_CANDIDATES = 10;
const MAX_TOKENS = 2048;
const FRONT_MAX_LENGTH = 200;
const BACK_MAX_LENGTH = 500;

export class GenerationTimeoutError extends Error {
  constructor() {
    super("OpenRouter request timed out");
    this.name = "GenerationTimeoutError";
  }
}

export class GenerationFailedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GenerationFailedError";
  }
}

const candidateSchema = z.object({
  front: z.string().trim().min(1).max(FRONT_MAX_LENGTH),
  back: z.string().trim().min(1).max(BACK_MAX_LENGTH),
});

const structuredResponseSchema = z.object({
  flashcards: z.array(z.unknown()),
});

const openRouterResponseSchema = z.object({
  choices: z.array(
    z.object({
      message: z.object({
        content: z.string(),
      }),
    }),
  ),
});

const responseFormat = {
  type: "json_schema",
  json_schema: {
    name: "flashcard_candidates",
    strict: true,
    schema: {
      type: "object",
      properties: {
        flashcards: {
          type: "array",
          maxItems: MAX_CANDIDATES,
          items: {
            type: "object",
            properties: {
              front: { type: "string" },
              back: { type: "string" },
            },
            required: ["front", "back"],
            additionalProperties: false,
          },
        },
      },
      required: ["flashcards"],
      additionalProperties: false,
    },
  },
};

function buildMessages(sourceText: string) {
  return [
    {
      role: "system",
      content:
        "You turn source text into flashcards for spaced-repetition study. " +
        `Produce up to ${MAX_CANDIDATES} flashcards. Each "front" must be a concise question or prompt (max ${FRONT_MAX_LENGTH} characters), ` +
        `and each "back" must be a concise answer (max ${BACK_MAX_LENGTH} characters). ` +
        "Only use information present in the source text. Respond with JSON matching the provided schema.",
    },
    {
      role: "user",
      content: sourceText,
    },
  ];
}

export async function generateFlashcardCandidates(sourceText: string): Promise<FlashcardCandidateDto[]> {
  if (!OPENROUTER_API_KEY) {
    throw new GenerationFailedError("OpenRouter is not configured");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, DEFAULT_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(OPENROUTER_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL ?? DEFAULT_MODEL,
        messages: buildMessages(sourceText),
        response_format: responseFormat,
        provider: { zdr: true },
        max_tokens: MAX_TOKENS,
      }),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new GenerationTimeoutError();
    }
    throw new GenerationFailedError("Failed to reach OpenRouter");
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new GenerationFailedError(`OpenRouter request failed with status ${response.status}`);
  }

  const rawBody: unknown = await response.json().catch(() => null);
  const parsedBody = openRouterResponseSchema.safeParse(rawBody);
  if (!parsedBody.success) {
    throw new GenerationFailedError("OpenRouter response did not include message content");
  }
  const content = parsedBody.data.choices[0]?.message.content;
  if (typeof content !== "string") {
    throw new GenerationFailedError("OpenRouter response did not include message content");
  }

  let parsedContent: unknown;
  try {
    parsedContent = JSON.parse(content);
  } catch {
    throw new GenerationFailedError("OpenRouter response content was not valid JSON");
  }

  const structuredResult = structuredResponseSchema.safeParse(parsedContent);
  if (!structuredResult.success) {
    throw new GenerationFailedError("OpenRouter response did not match the expected shape");
  }

  const candidates: FlashcardCandidateDto[] = [];
  for (const item of structuredResult.data.flashcards) {
    const result = candidateSchema.safeParse(item);
    if (result.success) {
      candidates.push(result.data);
    }
    if (candidates.length >= MAX_CANDIDATES) {
      break;
    }
  }

  if (candidates.length === 0) {
    throw new GenerationFailedError("No valid flashcard candidates were returned");
  }

  return candidates;
}
