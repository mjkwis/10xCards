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
        <Button type="button" variant="outline" size="sm" onClick={onRetry}>
          Try again
        </Button>
      }
    />
  );
}
