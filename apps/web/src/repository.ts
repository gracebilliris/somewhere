import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  applyAction,
  refreshPlaces,
  type Action,
} from "../../../packages/shared/demo";
import {
  DEMO_USER,
  profileInput,
  type Snapshot,
} from "../../../packages/shared/model";

const tables = [
  "profiles",
  "places",
  "collections",
  "collection_places",
  "saved_places",
  "follows",
  "likes",
] as const;
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const client: SupabaseClient | null =
  url && key && import.meta.env.VITE_DATA_MODE !== "demo"
    ? createClient(url, key, {
        auth: {
          storageKey: "somewhere.auth.v1",
          persistSession: true,
          detectSessionInUrl: true,
        },
      })
    : null;

export interface Repository {
  mode: "cloud" | "demo";
  load(): Promise<Snapshot>;
  act(action: Action, userId: string): Promise<void>;
  upload(file: Blob, userId: string): Promise<string>;
}
function openDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("somewhere-guidebook-v1", 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("guidebook");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(
        new Error(
          "Device storage is unavailable. Enable browser storage to use the local demo.",
        ),
      );
  });
}
export async function demoRepository(): Promise<Repository> {
  const db = await openDb();
  const read = () =>
    new Promise<Snapshot | undefined>((resolve, reject) => {
      const tx = db.transaction("guidebook", "readonly");
      const request = tx.objectStore("guidebook").get("snapshot");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  const existing = await read();
  let catalogue: Snapshot | undefined;
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}data/seed.json`);
    if (!response.ok) throw new Error("Catalogue unavailable.");
    catalogue = await response.json();
  } catch {
    if (!existing)
      throw new Error(
        "The place guide could not load. Check your connection and retry.",
      );
  }
  if (catalogue) {
    const seed = catalogue;
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("guidebook", "readwrite");
      const store = tx.objectStore("guidebook");
      const request = store.get("snapshot");
      request.onsuccess = () => {
        const data: Snapshot = request.result
          ? refreshPlaces(request.result, seed)
          : {
              ...seed,
              profiles: [
                ...seed.profiles,
                {
                  id: DEMO_USER,
                  username: "your.local.guide",
                  name: "Your little corner",
                  bio: "A growing collection of places to go, things to try, and afternoons to remember.",
                  city: "Sydney",
                  avatar: "",
                  editorial: false,
                },
              ],
            };
        store.put(data, "snapshot");
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () =>
        reject(
          new Error(
            "Your browser could not save the demo. Check device storage.",
          ),
        );
      tx.onabort = () =>
        reject(new Error("Your browser could not save the demo."));
    });
  }
  return {
    mode: "demo",
    load: async () => {
      const data = await read();
      if (!data) throw new Error("Guidebook unavailable. Reload the page.");
      return data;
    },
    act: (action, userId) =>
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction("guidebook", "readwrite");
        const store = tx.objectStore("guidebook");
        const request = store.get("snapshot");
        request.onsuccess = () => {
          try {
            store.put(applyAction(request.result, action, userId), "snapshot");
          } catch (error) {
            reject(error);
            tx.abort();
          }
        };
        tx.oncomplete = () => resolve();
        tx.onerror = () =>
          reject(
            new Error(
              "Changes were not saved. Your device may be out of storage.",
            ),
          );
        tx.onabort = () => reject(new Error("Changes were not saved."));
      }),
    upload: async (file) =>
      new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () =>
          reject(new Error("The image could not be read."));
        reader.readAsDataURL(file);
      }),
  };
}
function check(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}
export function cloudRepository(): Repository {
  if (!client) throw new Error("Supabase is not configured.");
  const db = client;
  return {
    mode: "cloud",
    async load() {
      const data = {} as Snapshot;
      await Promise.all(
        tables.map(async (table) => {
          const { data: rows, error } = await db
            .from(`somewhere_${table}`)
            .select("*")
            .limit(1000)
            .abortSignal(AbortSignal.timeout(8000));
          check(error);
          Object.assign(data, { [table]: rows });
        }),
      );
      if (!data.places.length)
        throw new Error("The Somewhere place seed has not been installed.");
      return data;
    },
    async act(action, userId) {
      if (action.type === "collection") {
        const { data, error } = await db
          .from("somewhere_collections")
          .upsert({ id: action.id, owner_id: userId, ...action.input })
          .select("id")
          .single();
        check(error);
        if (!data) throw new Error("Collection was not saved.");
      }
      if (action.type === "delete") {
        const { data, error } = await db
          .from("somewhere_collections")
          .delete()
          .eq("id", action.id)
          .eq("owner_id", userId)
          .select("id");
        check(error);
        if (!data?.length) throw new Error("Collection was not deleted.");
      }
      if (action.type === "save") {
        const { error } = await db.rpc("somewhere_save_place", {
          p_place: action.placeId,
          p_collections: action.ids,
          p_favourite: action.favourite,
        });
        check(error);
      }
      if (action.type === "like" || action.type === "follow") {
        const table =
          action.type === "like" ? "somewhere_likes" : "somewhere_follows";
        const row: Record<string, string> =
          action.type === "like"
            ? { user_id: userId, collection_id: action.id }
            : { follower_id: userId, following_id: action.id };
        const existing = await db.from(table).select("*").match(row);
        check(existing.error);
        const { error } = existing.data?.length
          ? await db.from(table).delete().match(row)
          : await db.from(table).insert(row);
        check(error);
      }
      if (action.type === "reorder") {
        const { error } = await db.rpc("somewhere_reorder_collection", {
          p_collection: action.id,
          p_places: action.ids,
        });
        check(error);
      }
      if (action.type === "note") {
        const { data, error } = await db
          .from("somewhere_collection_places")
          .update({ note: action.note.trim() })
          .eq("collection_id", action.id)
          .eq("place_id", action.placeId)
          .select("place_id")
          .single();
        check(error);
        if (!data) throw new Error("Recommendation was not saved.");
      }
      if (action.type === "profile") {
        const { data, error } = await db
          .from("somewhere_profiles")
          .update(profileInput(action.input))
          .eq("id", userId)
          .select("id")
          .single();
        check(error);
        if (!data) throw new Error("Profile was not saved.");
      }
    },
    async upload(file, userId) {
      const path = `${userId}/${crypto.randomUUID()}.jpg`;
      const { error } = await db.storage
        .from("somewhere-images")
        .upload(path, file, { contentType: "image/jpeg", upsert: false });
      check(error);
      return `upload:${path}`;
    },
  };
}
export async function prepareImage(file: File): Promise<Blob> {
  if (
    !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
    file.size > 5 * 1024 * 1024
  )
    throw new Error("Choose a JPG, PNG or WebP under 5 MB.");
  const image = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 1600 / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext("2d");
    if (!context)
      throw new Error("Image processing is unavailable in this browser.");
    context.fillStyle = "#f7f6f2";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) =>
          blob ? resolve(blob) : reject(new Error("Image processing failed.")),
        "image/jpeg",
        0.85,
      ),
    );
  } finally {
    image.close();
  }
}
