import { describe, it, expect } from "vitest";
import { generateFlashcardCandidates } from "@/lib/services/openrouter";

describe("openrouter", () => {
  it("resolves the module under test", () => {
    expect(typeof generateFlashcardCandidates).toBe("function");
  });
});
