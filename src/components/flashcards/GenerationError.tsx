import { CircleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

interface GenerationErrorProps {
  message: string;
  onRetry: () => void;
}

export function GenerationError({ message, onRetry }: GenerationErrorProps) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-red-500/30 bg-red-900/30 px-3 py-2 text-sm text-red-300">
      <span className="flex items-center gap-2">
        <CircleAlert className="size-4 shrink-0" />
        {message}
      </span>
      <Button type="button" variant="outline" size="sm" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}
