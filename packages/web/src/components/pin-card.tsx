import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { formatType } from "@/lib/landmarks";
import type { MarkerPick } from "@/lib/globe-types";
import { PinIcon } from "@/components/wordmark";

function formatCoord(lat: number, lng: number) {
  const ns = lat >= 0 ? "N" : "S";
  const ew = lng >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(2)}°${ns}  ·  ${Math.abs(lng).toFixed(2)}°${ew}`;
}

export function PinCard({
  pick,
  onClose,
  onPrev,
  onNext,
  indexLabel,
}: {
  pick: MarkerPick;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  indexLabel?: string;
}) {
  const kicker = pick.kind === "geocode" ? "Place" : formatType(pick.landmark?.type ?? "landmark");
  const hop = pick.kind === "pin" && (onPrev || onNext);

  return (
    <article className="pin-card px-5 pt-4 pb-4">
      <div className="flex shrink-0 items-start justify-between gap-3">
        <p className="flex min-w-0 items-center gap-2.5 pt-1.5 text-xs tracking-[0.18em] text-ink/45 uppercase">
          <PinIcon className="h-3.5 text-primary" />
          <span className="truncate">{kicker}</span>
        </p>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="-mt-1 -mr-1.5 flex size-11 items-center justify-center text-ink/40 transition-colors duration-150 ease-out hover:text-ink"
        >
          <X className="size-4" />
        </button>
      </div>
      <h2 className="mt-2 shrink-0 font-display text-2xl font-medium leading-[1.15] tracking-tight text-pretty text-ink">
        {pick.landmark?.name ?? pick.label ?? "Pinned place"}
      </h2>
      {pick.landmark?.snippet ? (
        <p className="pin-card-copy mt-3 text-sm leading-relaxed text-pretty text-ink/65">
          {pick.landmark.snippet}
        </p>
      ) : null}
      <div className="mt-3 flex shrink-0 items-center justify-between gap-2">
        <p className="text-xs tracking-wide text-ink/40 tabular-nums">{formatCoord(pick.lat, pick.lng)}</p>
        {hop ? (
          <div className="flex items-center gap-1">
            {indexLabel ? <span className="mr-1 text-xs text-ink/35 tabular-nums">{indexLabel}</span> : null}
            <button
              type="button"
              aria-label="Previous place"
              onClick={onPrev}
              disabled={!onPrev}
              className="flex size-9 items-center justify-center rounded-full text-ink/50 transition-colors hover:bg-surface-2 hover:text-ink disabled:opacity-30"
            >
              <ChevronLeft className="size-4" />
            </button>
            <button
              type="button"
              aria-label="Next place"
              onClick={onNext}
              disabled={!onNext}
              className="flex size-9 items-center justify-center rounded-full text-ink/50 transition-colors hover:bg-surface-2 hover:text-ink disabled:opacity-30"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
        ) : null}
      </div>
    </article>
  );
}
