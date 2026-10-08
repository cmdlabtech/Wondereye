import { describe, expect, it } from "vitest";
import { findBySlug, landmarkSlug, nameSlug, type Landmark } from "../src/lib/landmarks";

const lm = (name: string, lat: number, lng: number): Landmark => ({ name, type: "museum", lat, lng, snippet: "" });

const eiffel = lm("Tour Eiffel", 48.8582603, 2.2945008);
const ccc1 = lm("Christ Church Cathedral", 38.2519, -85.7535);
const ccc2 = lm("Christ Church Cathedral", 45.4177, -75.7081);
const cjk = lm("西丽佛祖庙", 22.5923, 113.9496);
const list = [eiffel, ccc1, ccc2, cjk];

describe("pin slugs", () => {
  it("strips accents and punctuation", () => {
    expect(nameSlug("Katedrála svatého Víta, Václava a Vojtěcha")).toBe("katedrala-svateho-vita-vaclava-a-vojtecha");
    expect(nameSlug("St. George's Basilica, Prague")).toBe("st-george-s-basilica-prague");
  });

  it("keeps non-Latin names", () => {
    expect(nameSlug(cjk.name)).toBe("西丽佛祖庙");
  });

  it("uses the bare name when unique and adds coordinates for twins", () => {
    expect(landmarkSlug(eiffel, list)).toBe("tour-eiffel");
    expect(landmarkSlug(ccc2, list)).toBe("christ-church-cathedral~45.4177,-75.7081");
  });

  it("treats an equal pin from a newer list as the same place, not a twin", () => {
    const fresh = list.map((m) => ({ ...m }));
    expect(landmarkSlug(eiffel, fresh)).toBe("tour-eiffel");
  });

  it("round-trips every pin", () => {
    for (const m of list) expect(findBySlug(list, landmarkSlug(m, list))).toBe(m);
  });

  it("returns null for unknown slugs", () => {
    expect(findBySlug(list, "nowhere")).toBeNull();
    expect(findBySlug(list, "")).toBeNull();
  });
});
