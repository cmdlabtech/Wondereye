import { useEffect, useMemo, useRef, type Ref } from "react";
import { ChevronDown, List } from "lucide-react";
import { formatType, landmarkId, TYPE_GROUPS, type Landmark, type TypeGroup } from "@/lib/landmarks";
import { PinIcon } from "@/components/wordmark";
import { cn } from "@/lib/cn";

export function PlacesPanel({
  open,
  landmarks,
  query,
  group,
  visible,
  selected,
  onToggle,
  onSelect,
  onGroup,
}: {
  open: boolean;
  landmarks: Landmark[];
  query: string;
  group: TypeGroup;
  visible: Landmark[];
  selected: Landmark | null;
  onToggle: () => void;
  onSelect: (lm: Landmark) => void;
  onGroup: (group: TypeGroup) => void;
}) {
  const selectedKey = selected ? landmarkId(selected) : "";
  const rowRef = useRef<HTMLButtonElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return landmarks.filter((m) => {
      if (group.types && !group.types.includes(m.type)) return false;
      if (q && !m.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [landmarks, query, group]);

  const visibleIds = useMemo(() => new Set(visible.map(landmarkId)), [visible]);
  const facing = useMemo(
    () => filtered.filter((m) => visibleIds.has(landmarkId(m))),
    [filtered, visibleIds],
  );
  const rest = useMemo(() => {
    if (!facing.length) return filtered;
    return filtered.filter((m) => !visibleIds.has(landmarkId(m)));
  }, [filtered, facing, visibleIds]);

  useEffect(() => {
    rowRef.current?.scrollIntoView({ block: "nearest" });
  }, [selectedKey]);

  const groups = useMemo(
    () =>
      TYPE_GROUPS.filter((g) => {
        if (!g.types) return true;
        return landmarks.some((m) => g.types!.includes(m.type));
      }),
    [landmarks],
  );

  return (
    <aside
      id="we-places"
      className={cn("places-sheet pointer-events-auto", open ? "is-open" : "is-collapsed")}
      aria-label="Places"
    >
      <button
        type="button"
        className="flex h-[3.35rem] w-full shrink-0 items-center justify-between gap-3 px-4 text-left md:pointer-events-none md:h-14 md:cursor-default"
        onClick={onToggle}
        aria-expanded={open}
      >
        <span className="flex min-w-0 items-center gap-2.5">
          <List className="size-4 text-primary" />
          <span className="truncate font-medium">{query.trim() ? "Matches" : "Places"}</span>
          <span className="text-xs text-muted tabular-nums">{filtered.length}</span>
        </span>
        <ChevronDown className={cn("size-4 text-muted transition-transform md:hidden", open && "rotate-180")} />
      </button>

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex shrink-0 gap-1.5 overflow-x-auto px-3 pb-3">
          {groups.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => onGroup(g)}
              className={cn("place-chip", group.id === g.id && "is-on")}
            >
              {g.label}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-2">
          {facing.length ? (
            <p className="px-4 pb-1 text-[0.65rem] tracking-[0.16em] text-muted uppercase">On this side</p>
          ) : null}
          {facing.map((m) => (
            <PlaceRow
              key={landmarkId(m)}
              landmark={m}
              selected={landmarkId(m) === selectedKey}
              rowRef={landmarkId(m) === selectedKey ? rowRef : undefined}
              onSelect={onSelect}
            />
          ))}
          {rest.length && facing.length ? (
            <p className="px-4 pt-3 pb-1 text-[0.65rem] tracking-[0.16em] text-muted uppercase">All matches</p>
          ) : null}
          {rest.map((m) => (
            <PlaceRow
              key={landmarkId(m)}
              landmark={m}
              selected={landmarkId(m) === selectedKey}
              rowRef={landmarkId(m) === selectedKey ? rowRef : undefined}
              onSelect={onSelect}
            />
          ))}
          {!filtered.length ? (
            <p className="px-4 py-6 text-sm text-muted">No places match that. Try another name, or search it as a city.</p>
          ) : null}
        </div>
      </div>
    </aside>
  );
}

function PlaceRow({
  landmark,
  selected,
  rowRef,
  onSelect,
}: {
  landmark: Landmark;
  selected: boolean;
  rowRef?: Ref<HTMLButtonElement>;
  onSelect: (lm: Landmark) => void;
}) {
  return (
    <button
      ref={rowRef}
      type="button"
      onClick={() => onSelect(landmark)}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "flex w-full items-start justify-between gap-3 px-4 py-2.5 text-left transition-colors duration-150",
        selected ? "bg-surface-2" : "hover:bg-surface-2/70",
      )}
    >
      <span className="min-w-0">
        <span className="block truncate text-sm text-fg">{landmark.name}</span>
        <span className="mt-0.5 block truncate text-xs text-muted">{formatType(landmark.type)}</span>
      </span>
      {selected ? <PinIcon className="mt-1.5 h-3.5 text-primary" /> : null}
    </button>
  );
}
