import { Button } from "@/components/ui/button";
import type { Flashcard } from "@/types";

interface ManualCreateFormProps {
  onCreated: (flashcard: Flashcard) => void;
}

export function ManualCreateForm({ onCreated }: ManualCreateFormProps) {
  return (
    <div className="w-full max-w-2xl space-y-3 rounded-xl border border-white/10 bg-white/5 p-4 text-white">
      <h2 className="font-semibold">Create flashcard — coming soon</h2>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled
        onClick={() => {
          onCreated({} as Flashcard);
        }}
      >
        Add flashcard
      </Button>
    </div>
  );
}
