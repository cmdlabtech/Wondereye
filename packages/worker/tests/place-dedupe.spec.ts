import { describe, expect, it } from 'vitest';
import { distanceMeters, dedupePlaces } from '../src/place-dedupe';
import { mergePOIs } from '../src/places';
import { planDuplicateCleanup, qidsForName, wikidataConfirmsSamePlace, type QidHit } from '../src/map-cleanup';
import type { RawPOI } from '../src/types';

function poi(name: string, lat: number, lng: number, extra: Partial<RawPOI> = {}): RawPOI {
  return { name, type: extra.type ?? 'landmark', lat, lng, distance: extra.distance ?? 0, ...extra };
}

const eiffelTower = poi('Eiffel Tower', 48.85822222, 2.2945, { type: 'landmark', wikidata: 'Q243', wikipedia: 'en:Eiffel Tower', distance: 12 });
const tourEiffel = poi('Tour Eiffel', 48.8582603, 2.2945008, { type: 'monument', architect: 'Gustave Eiffel', distance: 10 });
const gustaveOffice = poi('Bureau de Gustave Eiffel', 48.8582685, 2.2945812, { type: 'attraction' });
const gustaveMemorial = poi('Gustave Eiffel', 48.8587307, 2.2944894, { type: 'memorial' });
const carousel = poi('Le Carrousel de la Tour Eiffel', 48.8589211, 2.2926215, { type: 'attraction' });

describe('place dedupe', () => {
  it('merges Tour Eiffel into Eiffel Tower and keeps the Wikidata id', () => {
    const [kept] = dedupePlaces([tourEiffel, eiffelTower]);
    expect(kept.name).toBe('Eiffel Tower');
    expect(kept.wikidata).toBe('Q243');
    expect(kept.wikipedia).toBe('en:Eiffel Tower');
    expect(kept.type).toBe('monument');
    expect(kept.architect).toBe('Gustave Eiffel');
    expect(distanceMeters(tourEiffel.lat, tourEiffel.lng, eiffelTower.lat, eiffelTower.lng)).toBeLessThan(50);
  });

  it('prefers the English name whichever record arrives first', () => {
    expect(dedupePlaces([eiffelTower, tourEiffel]).map((p) => p.name)).toEqual(['Eiffel Tower']);
    expect(dedupePlaces([tourEiffel, { ...eiffelTower, wikidata: undefined }]).map((p) => p.name)).toEqual(['Eiffel Tower']);
  });

  it('does not merge distinct landmarks a few meters from the tower', () => {
    const names = dedupePlaces([eiffelTower, tourEiffel, gustaveOffice, gustaveMemorial, carousel]).map((p) => p.name);
    expect(names).toEqual([
      'Eiffel Tower',
      'Bureau de Gustave Eiffel',
      'Gustave Eiffel',
      'Le Carrousel de la Tour Eiffel',
    ]);
    expect(distanceMeters(gustaveOffice.lat, gustaveOffice.lng, tourEiffel.lat, tourEiffel.lng)).toBeLessThan(50);
  });

  it('does not merge other close neighbors that are different places', () => {
    const pairs: [RawPOI, RawPOI][] = [
      [poi('Faneuil Hall Marketplace', 42.3600766, -71.0547394, { type: 'attraction' }), poi('Quincy Market', 42.3602163, -71.0547993, { type: 'marketplace' })],
      [poi('Fraumünster', 47.3697135, 8.5412029, { type: 'church' }), poi('Fraumünster Kreuzgang', 47.369564, 8.5410786, { type: 'attraction' })],
      [poi('Audubon Ballroom', 40.842, -73.938), poi('Malcolm X and Dr. Betty Shabazz Memorial and Educational Center', 40.842, -73.938)],
    ];
    for (const [a, b] of pairs) {
      expect(distanceMeters(a.lat, a.lng, b.lat, b.lng)).toBeLessThanOrEqual(50);
      expect(dedupePlaces([a, b])).toHaveLength(2);
    }
  });

  it('does not merge same-named places far apart', () => {
    const louisville = poi('Christ Church Cathedral', 38.2519383, -85.7534945, { type: 'cathedral' });
    const ottawa = poi('Christ Church Cathedral', 45.4177225, -75.708141, { type: 'church' });
    expect(dedupePlaces([louisville, ottawa])).toHaveLength(2);
    const here = poi('Central Library', 51.5, -0.12, { type: 'library' });
    const blocksAway = poi('Central Library', 51.504, -0.12, { type: 'library' });
    expect(distanceMeters(here.lat, here.lng, blocksAway.lat, blocksAway.lng)).toBeGreaterThan(50);
    expect(dedupePlaces([here, blocksAway])).toHaveLength(2);
  });

  it('trusts a shared Wikidata id across names and a few hundred meters', () => {
    const czech = poi('Katedrála svatého Víta, Václava a Vojtěcha', 50.0908638, 14.4005536, { type: 'cathedral', wikidata: 'Q5949' });
    const english = poi('St. Vitus Cathedral', 50.0944, 14.4006, { wikidata: 'q5949' });
    expect(distanceMeters(czech.lat, czech.lng, english.lat, english.lng)).toBeGreaterThan(50);
    expect(dedupePlaces([czech, english])).toHaveLength(1);
  });

  it('does not merge translated names that carry different Wikidata ids', () => {
    const french = { ...tourEiffel, wikidata: 'Q1' };
    const other = { ...eiffelTower, wikidata: 'Q999' };
    expect(dedupePlaces([french, other])).toHaveLength(2);
  });

  it('uses aliases to merge a full translation when only one pin has an id', () => {
    const czech = poi('Bazilika svatého Jiří', 50.0911967, 14.4025783, { type: 'church' });
    const english = poi("St. George's Basilica, Prague", 50.0912, 14.4026, { wikidata: 'Q1437065' });
    expect(dedupePlaces([czech, english])).toHaveLength(2);
    const aliases = new Map([['Q1437065', ["St. George's Basilica", 'Bazilika svatého Jiří']]]);
    const [kept] = dedupePlaces([czech, english], aliases);
    expect(kept.name).toBe("St. George's Basilica, Prague");
    expect(kept.wikidata).toBe('Q1437065');
    expect(kept.type).toBe('church');
  });

  it('still matches an English Wikipedia title that sits further than 50 m', () => {
    const osm = poi('Tour Eiffel', 48.85826, 2.2945, { type: 'monument', wikipedia: 'en:Eiffel_Tower' });
    const wiki = poi('Eiffel Tower', 48.862, 2.2945, { wikipedia: 'en:Eiffel Tower', wikidata: 'Q243' });
    expect(distanceMeters(osm.lat, osm.lng, wiki.lat, wiki.lng)).toBeGreaterThan(50);
    const [kept] = mergePOIs([osm], [wiki]);
    expect(kept.name).toBe('Eiffel Tower');
    expect(kept.wikidata).toBe('Q243');
    expect(kept.type).toBe('monument');
  });
});

describe('map cleanup plan', () => {
  it('drops the French Eiffel key and keeps the English one', () => {
    const groups = planDuplicateCleanup([
      { ...tourEiffel, snippet: 'French pin' },
      { ...eiffelTower, snippet: 'English pin' },
      { ...gustaveOffice, snippet: 'Office' },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].survivor.name).toBe('Eiffel Tower');
    expect(groups[0].drop.map((p) => p.name)).toEqual(['Tour Eiffel']);
    expect(groups[0].survivorKey).toBe('mapplace:eiffel-tower:48.858:2.295');
    expect(groups[0].dropKeys).toEqual(['mapplace:tour-eiffel:48.858:2.295']);
  });

  it('confirms a full translation only when both names are that one nearby item', () => {
    const czech = poi('Katedrála svatého Víta, Václava a Vojtěcha', 50.0908638, 14.4005536, { type: 'cathedral' });
    const english = poi('St. Vitus Cathedral', 50.09083333, 14.40055556);
    const palaceCs = poi('Starý královský palác', 50.090578, 14.401663, { type: 'attraction' });
    const palaceEn = poi('Old Royal Palace (Prague)', 50.09042778, 14.40145278);
    const faneuil = poi('Faneuil Hall Marketplace', 42.3600766, -71.0547394, { type: 'attraction' });
    const quincy = poi('Quincy Market', 42.3602163, -71.0547993, { type: 'marketplace' });
    const hits = new Map<string, QidHit[]>([
      [czech.name, [{ id: 'Q5949', names: ['katedrála svatého Víta, Václava a Vojtěcha', 'St. Vitus Cathedral'], lat: 50.0909, lng: 14.4005 }]],
      [english.name, [{ id: 'Q5949', names: ['St. Vitus Cathedral'], lat: 50.0909, lng: 14.4005 }]],
      [palaceEn.name, [
        { id: 'Q7084890', names: ['Old Royal Palace'], lat: 37.9755, lng: 23.7364 },
        { id: 'Q2340793', names: ['Old Royal Palace'], lat: 50.0905, lng: 14.4015 },
      ]],
      [palaceCs.name, [{ id: 'Q2340793', names: ['Starý královský palác', 'Old Royal Palace'], lat: 50.0905, lng: 14.4015 }]],
      [faneuil.name, [{ id: 'Q49137', names: ['Faneuil Hall'], lat: 42.36, lng: -71.056 }]],
      [quincy.name, [{ id: 'Q901885', names: ['Quincy Market'], lat: 42.3602, lng: -71.0548 }]],
    ]);
    const hitsFor = (name: string) => hits.get(name) ?? [];
    expect(wikidataConfirmsSamePlace(czech, english, hitsFor)).toBe('Q5949');
    expect(wikidataConfirmsSamePlace(palaceCs, palaceEn, hitsFor)).toBe('Q2340793');
    expect(wikidataConfirmsSamePlace(faneuil, quincy, hitsFor)).toBeUndefined();
    expect(qidsForName(faneuil.name, hitsFor(faneuil.name))).toEqual([]);

    const groups = planDuplicateCleanup([czech, english, palaceCs, palaceEn, faneuil, quincy, gustaveOffice, eiffelTower], hitsFor);
    const dropped = groups.flatMap((g) => g.drop.map((p) => p.name)).sort();
    expect(dropped).toEqual(['Katedrála svatého Víta, Václava a Vojtěcha', 'Starý královský palác']);
  });
});
