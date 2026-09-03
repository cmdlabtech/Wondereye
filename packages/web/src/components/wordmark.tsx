import { Link } from "@tanstack/react-router";
import type { MouseEvent } from "react";
import { cn } from "@/lib/cn";

export function PinIcon({ className }: { className?: string }) {
  return (
    <span className={cn("pin-diamond", className)} aria-hidden>
      <i />
    </span>
  );
}

export function Wordmark({
  to = "/",
  size = "md",
  kicker,
  onClick,
}: {
  to?: "/" | "/map";
  size?: "sm" | "md";
  kicker?: string;
  onClick?: (e: MouseEvent<HTMLAnchorElement>) => void;
}) {
  return (
    <Link to={to} onClick={onClick} className="group inline-flex min-w-0 items-center gap-3 text-fg">
      <PinIcon className={size === "sm" ? "size-2.5" : "size-3"} />
      <span className="min-w-0">
        <span
          className={cn(
            "block font-display font-medium leading-none tracking-tight",
            size === "sm" ? "text-lg" : "text-xl",
          )}
        >
          Wondereye
        </span>
        {kicker ? (
          <span className="mt-1.5 block text-[0.65rem] tracking-[0.2em] text-muted uppercase">{kicker}</span>
        ) : null}
      </span>
    </Link>
  );
}
