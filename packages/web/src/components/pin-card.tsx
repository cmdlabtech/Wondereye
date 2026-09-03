import { X } from "lucide-react";
import { formatType } from "@/lib/landmarks";
import type { MarkerPick } from "@/lib/globe-types";

function formatCoord(lat: number, lng: number) {
  const ns = lat >= 0 ? "N" : "S";
  const ew = lng >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(2)}°${ns}  ·  ${Math.abs(lng).toFixed(2)}°${ew}`;
}

export function PinCard({ pick, onClose }: { pick: MarkerPick; onClose: () => void }) {
  const kicker = pick.kind === "geocode" ? "Place" : formatType(pick.landmark?.type ?? "landmark");

  return (
    <article className="pin-card px-5 pt-4 pb-4">
      <div className="flex shrink-0 items-start justify-between gap-3">
        <p className="flex min-w-0 items-center gap-2.5 pt-1.5 text-xs tracking-[0.18em] text-ink/45 uppercase">
          <span className="pin-diamond shrink-0" aria-hidden>
            <i />
          </span>
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
      <p className="mt-3 shrink-0 text-xs tracking-wide text-ink/40 tabular-nums">
        {formatCoord(pick.lat, pick.lng)}
      </p>
    </article>
  );
}
