import { afterEach, describe, expect, it, vi } from "vitest";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
const FRONT_MAX_LENGTH = 200;
const BACK_MAX_LENGTH = 500;
const MAX_CANDIDATES = 10;

type OpenRouterModule = typeof import("@/lib/services/openrouter");

async function loadOpenRouter(
  env: { apiKey?: string; model?: string } = { apiKey: "test-api-key" },
): Promise<OpenRouterModule> {
  vi.resetModules();
  vi.doMock("astro:env/server", () => ({
    OPENROUTER_API_KEY: env.apiKey,
    OPENROUTER_MODEL: env.model,
  }));
  return import("@/lib/services/openrouter");
}

function makeFetchResponse(overrides: Partial<{ ok: boolean; status: number; json: () => Promise<unknown> }> = {}) {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve({}),
    ...overrides,
  } as Response;
}

function makeSuccessResponse(flashcards: unknown[]) {
  return makeFetchResponse({
    json: () =>
      Promise.resolve({
        choices: [{ message: { content: JSON.stringify({ flashcards }) } }],
      }),
  });
}

function validCandidate(i: number) {
  return { front: `Front ${i}`, back: `Back ${i}` };
}

describe("generateFlashcardCandidates", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.doUnmock("astro:env/server");
  });

  it("resolves the module under test", async () => {
    const mod = await loadOpenRouter();
    expect(typeof mod.generateFlashcardCandidates).toBe("function");
  });

  it("throws GenerationFailedError when OPENROUTER_API_KEY is missing", async () => {
    const mod = await loadOpenRouter({ apiKey: undefined });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(mod.generateFlashcardCandidates("source text")).rejects.toBeInstanceOf(mod.GenerationFailedError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("throws GenerationFailedError when fetch rejects with a non-abort error", async () => {
    const mod = await loadOpenRouter();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    await expect(mod.generateFlashcardCandidates("source text")).rejects.toThrow("Failed to reach OpenRouter");
  });

  it("throws GenerationTimeoutError when fetch rejects with an AbortError", async () => {
    const mod = await loadOpenRouter();
    const abortError = Object.assign(new Error("The operation was aborted"), { name: "AbortError" });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(abortError));

    await expect(mod.generateFlashcardCandidates("source text")).rejects.toBeInstanceOf(mod.GenerationTimeoutError);
  });

  it("throws GenerationFailedError when fetch resolves with a non-OK status", async () => {
    const mod = await loadOpenRouter();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(makeFetchResponse({ ok: false, status: 500 })));

    await expect(mod.generateFlashcardCandidates("source text")).rejects.toBeInstanceOf(mod.GenerationFailedError);
  });

  it("throws GenerationFailedError when response.json() rejects (malformed HTTP-layer JSON)", async () => {
    const mod = await loadOpenRouter();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(makeFetchResponse({ json: () => Promise.reject(new Error("bad json")) })),
    );

    await expect(mod.generateFlashcardCandidates("source text")).rejects.toBeInstanceOf(mod.GenerationFailedError);
  });

  it("throws GenerationFailedError when the response body fails the envelope schema", async () => {
    const mod = await loadOpenRouter();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(makeFetchResponse({ json: () => Promise.resolve({ nope: "shape" }) })),
    );

    await expect(mod.generateFlashcardCandidates("source text")).rejects.toBeInstanceOf(mod.GenerationFailedError);
  });

  it("throws GenerationFailedError when content is missing (choices array empty)", async () => {
    const mod = await loadOpenRouter();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(makeFetchResponse({ json: () => Promise.resolve({ choices: [] }) })),
    );

    await expect(mod.generateFlashcardCandidates("source text")).rejects.toBeInstanceOf(mod.GenerationFailedError);
  });

  it("throws GenerationFailedError when content is not valid JSON", async () => {
    const mod = await loadOpenRouter();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        makeFetchResponse({
          json: () => Promise.resolve({ choices: [{ message: { content: "not json {" } }] }),
        }),
      ),
    );

    await expect(mod.generateFlashcardCandidates("source text")).rejects.toBeInstanceOf(mod.GenerationFailedError);
  });

  it("throws GenerationFailedError when parsed content fails the structured schema", async () => {
    const mod = await loadOpenRouter();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        makeFetchResponse({
          json: () => Promise.resolve({ choices: [{ message: { content: JSON.stringify({ nope: [] }) } }] }),
        }),
      ),
    );

    await expect(mod.generateFlashcardCandidates("source text")).rejects.toBeInstanceOf(mod.GenerationFailedError);
  });

  it("filters out invalid candidates and keeps valid ones", async () => {
    const mod = await loadOpenRouter();
    const flashcards = [
      validCandidate(1),
      "", // wrong type entirely
      { front: "missing back" }, // missing field
      { front: 123, back: "wrong type front" }, // wrong type
      { front: "a".repeat(FRONT_MAX_LENGTH + 1), back: "over-length front" }, // over-length front
      { front: "over-length back", back: "b".repeat(BACK_MAX_LENGTH + 1) }, // over-length back
      validCandidate(2),
    ];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(makeSuccessResponse(flashcards)));

    const result = await mod.generateFlashcardCandidates("source text");

    expect(result).toEqual([validCandidate(1), validCandidate(2)]);
  });

  it("caps accepted candidates at 10 and stops validating once the cap is hit", async () => {
    const mod = await loadOpenRouter();
    const accessedIndexes: number[] = [];
    const flashcards = Array.from({ length: 15 }, (_, i) => {
      if (i < MAX_CANDIDATES) {
        return validCandidate(i);
      }
      // Getter-backed so we can prove the validation loop never touches items past the cap.
      return {
        get front() {
          accessedIndexes.push(i);
          return `Front ${i}`;
        },
        back: `Back ${i}`,
      };
    });
    // Bypass JSON.stringify (which would eagerly invoke every getter while building the
    // fixture) by intercepting JSON.parse and handing back the getter-bearing objects
    // directly, exactly as the real candidate-validation loop would receive them.
    const marker = "__flashcards_payload__";
    const originalJsonParse = JSON.parse.bind(JSON) as (
      text: string,
      reviver?: Parameters<typeof JSON.parse>[1],
    ) => unknown;
    vi.spyOn(JSON, "parse").mockImplementation((text, ...rest) =>
      text === marker ? { flashcards } : originalJsonParse(text, ...rest),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        makeFetchResponse({
          json: () => Promise.resolve({ choices: [{ message: { content: marker } }] }),
        }),
      ),
    );

    const result = await mod.generateFlashcardCandidates("source text");

    expect(result).toHaveLength(MAX_CANDIDATES);
    expect(accessedIndexes).toEqual([]);
  });

  it("throws GenerationFailedError when every candidate fails validation", async () => {
    const mod = await loadOpenRouter();
    const flashcards = [{ front: "" }, { back: "" }, "not an object"];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(makeSuccessResponse(flashcards)));

    await expect(mod.generateFlashcardCandidates("source text")).rejects.toThrow(
      "No valid flashcard candidates were returned",
    );
  });

  it("resolves with the matching candidates for a well-formed response and sends the expected request", async () => {
    const mod = await loadOpenRouter({ apiKey: "my-secret-key" });
    const flashcards = [validCandidate(1), validCandidate(2), validCandidate(3)];
    const fetchMock = vi.fn().mockResolvedValue(makeSuccessResponse(flashcards));
    vi.stubGlobal("fetch", fetchMock);

    const result = await mod.generateFlashcardCandidates("source text");

    expect(result).toEqual(flashcards);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(OPENROUTER_API_URL);
    expect(requestInit.method).toBe("POST");
    expect((requestInit.headers as Record<string, string>).Authorization).toBe("Bearer my-secret-key");
  });
});
