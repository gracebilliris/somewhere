import { describe, expect, it } from "vitest";
import seed from "../apps/web/public/data/seed.json";
import { applyAction, refreshPlaces } from "../packages/shared/demo";
import {
  collectionInput,
  DEMO_USER,
  moveItem,
  safeWebsite,
  searchPlaces,
  visibleCollections,
  type Collection,
  type Snapshot,
} from "../packages/shared/model";

const initial = () => structuredClone(seed) as Snapshot;
const privateCollection: Collection = {
  id: "my-guide",
  owner_id: DEMO_USER,
  name: "Birthday shortlist",
  description: "For the whole table.",
  occasion: "Birthday dinner",
  cover: "",
  visibility: "private",
  created_at: "2026-11-04T00:00:00Z",
};
describe("guidebook workflows", () => {
  it("refreshes an older place catalogue without changing personal guidebooks", () => {
    const source = initial();
    source.places = source.places.slice(0, 16);
    source.collections.push(privateCollection);
    source.saved_places.push({
      user_id: DEMO_USER,
      place_id: source.places[0].id,
    });
    source.collection_places.push({
      collection_id: privateCollection.id,
      place_id: source.places[0].id,
      position: 0,
      note: "Keep my own recommendation.",
    });
    const original = structuredClone(source);
    const catalogue = initial();
    catalogue.places[0].description = "Updated editorial information.";
    const updated = refreshPlaces(source, catalogue);
    expect(updated.places).toEqual(catalogue.places);
    const { places: oldPlaces, ...personal } = source;
    const { places: newPlaces, ...retained } = updated;
    expect(newPlaces.length).toBeGreaterThan(oldPlaces.length);
    expect(retained).toEqual(personal);
    expect(source).toEqual(original);
    expect(refreshPlaces(updated, catalogue)).toEqual(updated);
  });
  it("retains previously saved places absent from a later catalogue", () => {
    const source = initial();
    const olderPlace = { ...source.places[0], id: "previously-curated" };
    source.places.push(olderPlace);
    source.saved_places.push({ user_id: DEMO_USER, place_id: olderPlace.id });
    const updated = refreshPlaces(source, initial());
    expect(updated.places.at(-1)).toEqual(olderPlace);
    expect(updated.saved_places).toEqual(source.saved_places);
  });
  it("saves one place in multiple collections and preserves independent favourites", () => {
    let data = initial();
    data.collections.push(privateCollection, {
      ...privateCollection,
      id: "another",
    });
    const placeId = data.places[0].id;
    data = applyAction(data, {
      type: "save",
      placeId,
      ids: ["my-guide", "another"],
      favourite: true,
    });
    data = applyAction(data, {
      type: "save",
      placeId,
      ids: ["my-guide", "another"],
      favourite: true,
    });
    expect(
      data.collection_places.filter(
        (p) =>
          p.place_id === placeId &&
          ["my-guide", "another"].includes(p.collection_id),
      ),
    ).toHaveLength(2);
    expect(data.saved_places).toEqual([
      { user_id: DEMO_USER, place_id: placeId },
    ]);
    data = applyAction(data, { type: "delete", id: "my-guide" });
    expect(
      data.collection_places.some(
        (p) => p.collection_id === "another" && p.place_id === placeId,
      ),
    ).toBe(true);
    expect(data.saved_places).toHaveLength(1);
  });
  it("protects ownership and excludes private collections from other profiles", () => {
    const data = initial();
    data.collections.push(privateCollection);
    expect(
      visibleCollections(data, null).some((c) => c.id === privateCollection.id),
    ).toBe(false);
    expect(visibleCollections(data, DEMO_USER)).toContainEqual(
      privateCollection,
    );
    expect(() =>
      applyAction(data, { type: "delete", id: data.collections[0].id }),
    ).toThrow(/own/);
    expect(() =>
      applyAction(data, {
        type: "save",
        placeId: data.places[0].id,
        ids: [data.collections[0].id],
        favourite: true,
      }),
    ).toThrow(/own/);
    expect(data.saved_places).toEqual([]);
  });
  it("persists custom ordering and refuses stale or duplicate order payloads", () => {
    let data = initial();
    data.collections.push(privateCollection);
    const [a, b] = data.places;
    data = applyAction(data, {
      type: "save",
      placeId: a.id,
      ids: ["my-guide"],
      favourite: false,
    });
    data = applyAction(data, {
      type: "save",
      placeId: b.id,
      ids: ["my-guide"],
      favourite: false,
    });
    const order = moveItem([a.id, b.id], b.id, -1);
    data = applyAction(data, { type: "reorder", id: "my-guide", ids: order });
    expect(
      data.collection_places.find(
        (p) => p.collection_id === "my-guide" && p.place_id === b.id,
      )?.position,
    ).toBe(0);
    expect(() =>
      applyAction(data, { type: "reorder", id: "my-guide", ids: [a.id, a.id] }),
    ).toThrow(/order/);
    expect(moveItem(order, b.id, -1)).toEqual(order);
  });
  it("supports reversible follows and likes without fabricating popularity", () => {
    let data = initial();
    const person = data.profiles[0].id;
    const collection = data.collections[0].id;
    data = applyAction(data, { type: "follow", id: person });
    data = applyAction(data, { type: "like", id: collection });
    expect(data.follows).toHaveLength(1);
    expect(data.likes).toHaveLength(1);
    data = applyAction(data, { type: "follow", id: person });
    data = applyAction(data, { type: "like", id: collection });
    expect(data.follows).toEqual([]);
    expect(data.likes).toEqual([]);
  });
  it("combines city, category, occasion and multiword searches", () => {
    const places = initial().places;
    expect(
      searchPlaces(
        places,
        "birthday dinner",
        "Food & drink",
        "Birthday dinner",
        "Sydney",
      ).map((p) => p.name),
    ).toEqual([
      "Spice Alley",
      "Darling Square",
      "Bathers' Pavilion",
      "Doyles on the Beach",
      "Watsons Bay Boutique Hotel",
    ]);
    expect(
      searchPlaces(
        places,
        "family outings",
        "Activities",
        "Family outings",
        "Sydney",
      ).map((place) => place.name),
    ).toEqual([
      "Luna Park Sydney",
      "Taronga Zoo Sydney",
      "SEA LIFE Sydney Aquarium",
    ]);
    expect(
      searchPlaces(
        places,
        "",
        "Bars",
        "After-work drinks",
        "Circular Quay",
      ).map((p) => p.name),
    ).toEqual(["Opera Bar"]);
    expect(searchPlaces(places, "never existing place")).toEqual([]);
  });
  it("validates names and external links at trust boundaries", () => {
    expect(() => collectionInput({ ...privateCollection, name: "  " })).toThrow(
      /name/,
    );
    expect(safeWebsite("javascript:alert(1)")).toBeNull();
    expect(safeWebsite("https://www.mca.com.au/")).toBe(
      "https://www.mca.com.au/",
    );
  });
  it("lets a guide choose a username without impersonating an existing guide", () => {
    const data = initial();
    const profile = {
      ...data.profiles[0],
      id: DEMO_USER,
      username: "local.guide",
      editorial: false,
    };
    data.profiles.push(profile);
    const input = {
      name: "Explorer",
      username: "new.explorer",
      bio: "",
      city: "Sydney",
      avatar: "",
    };
    const updated = applyAction(data, { type: "profile", input });
    expect(updated.profiles.find((p) => p.id === DEMO_USER)?.username).toBe(
      "new.explorer",
    );
    expect(() =>
      applyAction(data, {
        type: "profile",
        input: { ...input, username: data.profiles[0].username },
      }),
    ).toThrow(/already in use/);
    expect(() =>
      applyAction(data, {
        type: "profile",
        input: { ...input, username: "not a username" },
      }),
    ).toThrow(/username/);
  });
});
