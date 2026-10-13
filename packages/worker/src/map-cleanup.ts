import { mapPlaceKey } from './lang';
import {
  TRANSLATED_NAME_METERS,
  clusterPlaces,
  distanceMeters,
  foldName,
  mergeClusters,
  stripPlaceQualifiers,
  type PlaceCluster,
  type PlaceIdentity,
} from './place-dedupe';

/** A Wikidata search hit whose label or alias equals the queried name. */
export interface QidHit {
  id: string;
  /** Display label, match text, or alias — compared after folding. */
  names: readonly string[];
  lat?: number;
  lng?: number;
}

/** How far a pin may sit from the Wikidata coordinate and still be that item. */
export const WIKIDATA_COORD_METERS = 500;

function namesEqual(a: string, b: string): boolean {
  const left = foldName(a);
  const right = foldName(b);
  return !!left && left === right;
}

/** Ids whose label or alias is exactly this place name (qualifiers stripped). */
export function qidsForName(placeName: string, hits: readonly QidHit[]): string[] {
  const wanted = [placeName, stripPlaceQualifiers(placeName)];
  const ids: string[] = [];
  for (const hit of hits) {
    const matched = hit.names.some((name) => wanted.some((candidate) => namesEqual(candidate, name)));
    if (matched && !ids.includes(hit.id)) ids.push(hit.id);
  }
  return ids;
}

/**
 * Full translations ("St. Vitus Cathedral" / "Katedrála svatého Víta…") share
 * one Wikidata item even when no type-word is in common. Accept that only
 * when both names resolve to the same single item and that item's coordinate
 * is next to both pins. Two different items, or an item in another city, do
 * not merge.
 */
export function wikidataConfirmsSamePlace(
  a: PlaceIdentity,
  b: PlaceIdentity,
  hitsFor: (name: string) => readonly QidHit[],
): string | undefined {
  if (!Number.isFinite(a.lat) || !Number.isFinite(b.lat)) return undefined;
  if (distanceMeters(a.lat, a.lng, b.lat, b.lng) > TRANSLATED_NAME_METERS) return undefined;
  const shared = qidsForName(a.name, hitsFor(a.name)).filter((id) => qidsForName(b.name, hitsFor(b.name)).includes(id));
  if (shared.length !== 1) return undefined;
  const id = shared[0];
  const located = [...hitsFor(a.name), ...hitsFor(b.name)].find(
    (hit) => hit.id === id && Number.isFinite(hit.lat) && Number.isFinite(hit.lng),
  );
  if (!located || located.lat == null || located.lng == null) return undefined;
  if (distanceMeters(a.lat, a.lng, located.lat, located.lng) > WIKIDATA_COORD_METERS) return undefined;
  if (distanceMeters(b.lat, b.lng, located.lat, located.lng) > WIKIDATA_COORD_METERS) return undefined;
  return id;
}

export interface CleanupGroup<T extends PlaceIdentity> {
  survivor: T;
  drop: T[];
  /** KV keys for `drop`, under the current mapplace scheme. */
  dropKeys: string[];
  survivorKey: string;
}

export function planDuplicateCleanup<T extends PlaceIdentity>(
  places: T[],
  hitsFor?: (name: string) => readonly QidHit[],
): CleanupGroup<T>[] {
  let clusters: PlaceCluster<T>[] = clusterPlaces(places);
  if (hitsFor) {
    clusters = mergeClusters(clusters, (a, b) => wikidataConfirmsSamePlace(a, b, hitsFor) != null);
  }
  const groups: CleanupGroup<T>[] = [];
  for (const cluster of clusters) {
    if (cluster.members.length < 2) continue;
    const survivorKey = mapPlaceKey(cluster.survivor.name, cluster.survivor.lat, cluster.survivor.lng);
    const drop = cluster.members.filter((member) => mapPlaceKey(member.name, member.lat, member.lng) !== survivorKey);
    if (drop.length === 0) continue;
    groups.push({
      survivor: cluster.survivor,
      drop,
      survivorKey,
      dropKeys: drop.map((member) => mapPlaceKey(member.name, member.lat, member.lng)),
    });
  }
  return groups;
}
