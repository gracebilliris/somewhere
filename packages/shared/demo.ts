import {
  collectionInput,
  DEMO_USER,
  type CollectionInput,
  profileInput,
  type ProfileInput,
  type Snapshot,
} from "./model";

export type Action =
  | { type: "collection"; id: string; input: CollectionInput }
  | { type: "delete"; id: string }
  | { type: "save"; placeId: string; ids: string[]; favourite: boolean }
  | { type: "like"; id: string }
  | { type: "follow"; id: string }
  | { type: "reorder"; id: string; ids: string[] }
  | { type: "note"; id: string; placeId: string; note: string }
  | {
      type: "profile";
      input: ProfileInput;
    };

export function applyAction(
  source: Snapshot,
  action: Action,
  userId = DEMO_USER,
): Snapshot {
  const data = structuredClone(source);
  const own = (id: string) => {
    const collection = data.collections.find(
      (c) => c.id === id && c.owner_id === userId,
    );
    if (!collection)
      throw new Error("You can only change your own collections.");
    return collection;
  };
  if (action.type === "collection") {
    const input = collectionInput(action.input);
    const existing = data.collections.find((c) => c.id === action.id);
    if (existing) Object.assign(own(action.id), input);
    else
      data.collections.unshift({
        ...input,
        id: action.id,
        owner_id: userId,
        created_at: new Date().toISOString(),
      });
  }
  if (action.type === "delete") {
    own(action.id);
    data.collections = data.collections.filter((c) => c.id !== action.id);
    data.collection_places = data.collection_places.filter(
      (p) => p.collection_id !== action.id,
    );
    data.likes = data.likes.filter((l) => l.collection_id !== action.id);
  }
  if (action.type === "save") {
    if (!data.places.some((p) => p.id === action.placeId))
      throw new Error("This place is unavailable.");
    [...new Set(action.ids)].forEach(own);
    const mine = new Set(
      data.collections.filter((c) => c.owner_id === userId).map((c) => c.id),
    );
    data.collection_places = data.collection_places.filter(
      (p) =>
        !(
          p.place_id === action.placeId &&
          mine.has(p.collection_id) &&
          !action.ids.includes(p.collection_id)
        ),
    );
    for (const id of new Set(action.ids)) {
      if (
        !data.collection_places.some(
          (p) => p.place_id === action.placeId && p.collection_id === id,
        )
      ) {
        const last = Math.max(
          -1,
          ...data.collection_places
            .filter((p) => p.collection_id === id)
            .map((p) => p.position),
        );
        data.collection_places.push({
          collection_id: id,
          place_id: action.placeId,
          position: last + 1,
          note: "",
        });
      }
    }
    data.saved_places = data.saved_places.filter(
      (s) => !(s.user_id === userId && s.place_id === action.placeId),
    );
    if (action.favourite)
      data.saved_places.push({ user_id: userId, place_id: action.placeId });
  }
  if (action.type === "like") {
    const c = data.collections.find((c) => c.id === action.id);
    if (!c || (c.visibility === "private" && c.owner_id !== userId))
      throw new Error("This collection is private.");
    const exists = data.likes.some(
      (l) => l.user_id === userId && l.collection_id === action.id,
    );
    data.likes = data.likes.filter(
      (l) => !(l.user_id === userId && l.collection_id === action.id),
    );
    if (!exists) data.likes.push({ user_id: userId, collection_id: action.id });
  }
  if (action.type === "follow") {
    if (action.id === userId || !data.profiles.some((p) => p.id === action.id))
      throw new Error("Choose another guide to follow.");
    const exists = data.follows.some(
      (f) => f.follower_id === userId && f.following_id === action.id,
    );
    data.follows = data.follows.filter(
      (f) => !(f.follower_id === userId && f.following_id === action.id),
    );
    if (!exists)
      data.follows.push({ follower_id: userId, following_id: action.id });
  }
  if (action.type === "reorder") {
    own(action.id);
    const items = data.collection_places.filter(
      (p) => p.collection_id === action.id,
    );
    if (
      new Set(action.ids).size !== items.length ||
      action.ids.length !== items.length ||
      items.some((p) => !action.ids.includes(p.place_id))
    )
      throw new Error("The place order has changed. Try again.");
    items.forEach((item) => {
      item.position = action.ids.indexOf(item.place_id);
    });
  }
  if (action.type === "note") {
    own(action.id);
    if (action.note.length > 400)
      throw new Error("Keep your recommendation under 400 characters.");
    const item = data.collection_places.find(
      (p) => p.collection_id === action.id && p.place_id === action.placeId,
    );
    if (!item) throw new Error("This place is no longer in the collection.");
    item.note = action.note.trim();
  }
  if (action.type === "profile") {
    const input = profileInput(action.input);
    if (
      data.profiles.some(
        (p) => p.id !== userId && p.username === input.username,
      )
    )
      throw new Error("That username is already in use.");
    const profile = data.profiles.find((p) => p.id === userId);
    if (!profile) throw new Error("Profile unavailable.");
    Object.assign(profile, input);
  }
  return data;
}
