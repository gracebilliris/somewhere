export interface Photo {
  src: string;
  smallSrc: string;
  alt: string;
  author: string;
  source: string;
  license: string;
  licenseUrl: string;
}
export interface Place {
  id: string;
  name: string;
  city: string;
  suburb: string;
  category: string;
  occasions: string[];
  description: string;
  address: string;
  latitude: number;
  longitude: number;
  website: string;
  photo: Photo;
}
export interface Profile {
  id: string;
  username: string;
  name: string;
  bio: string;
  city: string;
  avatar: string;
  editorial: boolean;
}
export interface Collection {
  id: string;
  owner_id: string;
  name: string;
  description: string;
  occasion: string;
  cover: string;
  visibility: "public" | "private";
  created_at: string;
}
export interface CollectionPlace {
  collection_id: string;
  place_id: string;
  position: number;
  note: string;
}
export interface Snapshot {
  profiles: Profile[];
  places: Place[];
  collections: Collection[];
  collection_places: CollectionPlace[];
  saved_places: { user_id: string; place_id: string }[];
  follows: { follower_id: string; following_id: string }[];
  likes: { user_id: string; collection_id: string }[];
}
export type CollectionInput = Pick<
  Collection,
  "name" | "description" | "occasion" | "cover" | "visibility"
>;
export type ProfileInput = Pick<
  Profile,
  "name" | "username" | "bio" | "city" | "avatar"
>;
export function profileInput(input: ProfileInput): ProfileInput {
  const name = input.name.trim();
  const username = input.username.trim().toLowerCase();
  if (
    !name ||
    name.length > 60 ||
    input.bio.length > 300 ||
    input.city.length > 80
  )
    throw new Error("Check your name, biography and city lengths.");
  if (!/^[a-z0-9._]{3,40}$/.test(username))
    throw new Error(
      "Use 3–40 letters, numbers, dots or underscores for your username.",
    );
  return {
    ...input,
    name,
    username,
    bio: input.bio.trim(),
    city: input.city.trim(),
  };
}
export const occasions = [
  "Any occasion",
  "Date night",
  "Birthday dinner",
  "Coffee dates",
  "Weekend wandering",
  "Family outings",
  "After-work drinks",
  "Hidden gems",
  "Places to try",
];
export const categories = [
  "All places",
  "Food & drink",
  "Bars",
  "Cafes",
  "Art & culture",
  "Activities",
  "Outdoors",
  "Shopping",
  "Attractions",
];
export const DEMO_USER = "10000000-0000-4000-8000-000000000001";

export function collectionInput(input: CollectionInput): CollectionInput {
  const name = input.name.trim();
  if (!name || name.length > 80)
    throw new Error("Give your collection a name of 1–80 characters.");
  if (input.description.length > 600)
    throw new Error("Keep the description under 600 characters.");
  if (!["public", "private"].includes(input.visibility))
    throw new Error("Choose a valid visibility.");
  if (!occasions.includes(input.occasion))
    throw new Error("Choose an occasion from the list.");
  return { ...input, name, description: input.description.trim() };
}
export function collectionItems(data: Snapshot, id: string) {
  return data.collection_places
    .filter((item) => item.collection_id === id)
    .sort((a, b) => a.position - b.position);
}
export function visibleCollections(data: Snapshot, userId: string | null) {
  return data.collections.filter(
    (c) => c.visibility === "public" || c.owner_id === userId,
  );
}
export function searchPlaces(
  places: Place[],
  query: string,
  category = "All places",
  occasion = "Any occasion",
  location = "Sydney",
) {
  const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  return places.filter(
    (p) =>
      (category === "All places" || p.category === category) &&
      (occasion === "Any occasion" || p.occasions.includes(occasion)) &&
      (!location ||
        `${p.city} ${p.suburb}`
          .toLowerCase()
          .includes(location.toLowerCase())) &&
      words.every((word) =>
        `${p.name} ${p.city} ${p.suburb} ${p.category} ${p.occasions.join(" ")} ${p.description}`
          .toLowerCase()
          .includes(word),
      ),
  );
}
export function safeWebsite(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" ? parsed.href : null;
  } catch {
    return null;
  }
}
export function moveItem(ids: string[], id: string, direction: -1 | 1) {
  const next = [...ids];
  const from = next.indexOf(id);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= next.length) return next;
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}
