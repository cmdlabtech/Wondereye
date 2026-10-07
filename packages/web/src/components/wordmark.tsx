import { Link } from "@tanstack/react-router";
import type { MouseEvent } from "react";
import { cn } from "@/lib/cn";

export function PinIcon({ className }: { className?: string }) {
  return (
    <svg className={cn("pin-mark", className)} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="7.2" fill="currentColor" />
      <circle cx="12" cy="12" r="3.1" fill="#fff6ee" />
    </svg>
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
    <Link to={to} onClick={onClick} className="group inline-flex min-w-0 items-center gap-2.5 text-fg">
      <PinIcon className={cn("text-primary", size === "sm" ? "size-3.5" : "size-4")} />
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
