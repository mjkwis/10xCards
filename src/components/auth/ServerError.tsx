import type { ReactNode } from "react";
import { CircleAlert } from "lucide-react";

interface ServerErrorProps {
  message?: string | null;
  action?: ReactNode;
}

export function ServerError({ message, action }: ServerErrorProps) {
  if (!message) return null;

  return (
    <p className="flex items-center justify-between gap-3 rounded-lg border border-red-500/30 bg-red-900/30 px-3 py-2 text-sm text-red-300">
      <span className="flex items-center gap-2">
        <CircleAlert className="size-4 shrink-0" />
        {message}
      </span>
      {action}
    </p>
  );
}
