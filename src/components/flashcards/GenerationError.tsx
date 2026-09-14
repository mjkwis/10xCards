import { Button } from "@/components/ui/button";
import { ServerError } from "@/components/auth/ServerError";

interface GenerationErrorProps {
  message: string;
  onRetry: () => void;
}

export function GenerationError({ message, onRetry }: GenerationErrorProps) {
  return (
    <ServerError
      message={message}
      action={
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="border-white/20 bg-white/10 text-white hover:bg-white/25 hover:text-white"
          onClick={onRetry}
        >
          Try again
        </Button>
      }
    />
  );
}
