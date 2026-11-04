import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { format } from "prettier";

const root = resolve(import.meta.dirname, "..");
const id = (kind, n) =>
  `${kind}0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const photos = JSON.parse(
  await readFile(resolve(root, "content/photos.json"), "utf8"),
);
const rows = [
  [
    "spice-alley",
    "Spice Alley",
    "Chippendale",
    "Food & drink",
    ["Date night", "Birthday dinner", "Hidden gems"],
    "Lanterns overhead, little kitchens all around. A casual laneway for choosing dinner together, one stall at a time.",
    "Kensington Street, Chippendale NSW 2008",
    -33.8855,
    151.2015,
    "https://spice-alley.com.au/",
  ],
  [
    "opera-bar",
    "Opera Bar",
    "Circular Quay",
    "Bars",
    ["After-work drinks", "Date night", "Birthday dinner"],
    "A drink beside the harbour, with the Opera House on one side and the bridge on the other. Plan ahead for busy evenings.",
    "Lower Concourse, Sydney Opera House, Sydney NSW 2000",
    -33.8572,
    151.2142,
    "https://operabar.com.au/",
  ],
  [
    "botanic-garden",
    "Royal Botanic Garden",
    "Sydney",
    "Outdoors",
    ["Weekend wandering", "Family outings", "Date night"],
    "Take the long way through palms, garden paths and harbour lawns. Leave room in the afternoon for an unhurried picnic.",
    "Mrs Macquaries Road, Sydney NSW 2000",
    -33.8642,
    151.2166,
    "https://www.botanicgardens.org.au/royal-botanic-garden-sydney",
  ],
  [
    "white-rabbit",
    "White Rabbit Gallery & Tea House",
    "Chippendale",
    "Cafes",
    ["Coffee dates", "Hidden gems", "Weekend wandering"],
    "Contemporary Chinese art, then tea and a quiet conversation downstairs. The photograph shows the gallery exterior; check exhibition changeover dates.",
    "30 Balfour Street, Chippendale NSW 2008",
    -33.8875,
    151.2006,
    "https://whiterabbitcollection.org/",
  ],
  [
    "quay-promenade",
    "Circular Quay promenade",
    "Circular Quay",
    "Attractions",
    ["Weekend wandering", "Family outings", "Date night"],
    "Ferries coming and going, a little sea air, and the city opening out around the water. A lovely meeting point before the rest of the day.",
    "Circular Quay, Sydney NSW 2000",
    -33.8609,
    151.2121,
    "https://www.sydney.com/destinations/sydney/sydney-city/circular-quay",
  ],
  [
    "observatory-hill",
    "Observatory Hill Park",
    "The Rocks",
    "Outdoors",
    ["Hidden gems", "Date night", "Weekend wandering"],
    "A grassy hill, old trees and one of the city’s best bridge views. Bring a picnic rug and allow for uphill paths.",
    "Upper Fort Street, Millers Point NSW 2000",
    -33.8596,
    151.2048,
    "https://www.cityofsydney.nsw.gov.au/parks/observatory-hill-park",
  ],
  [
    "darling-square",
    "Darling Square",
    "Haymarket",
    "Food & drink",
    ["Birthday dinner", "Family outings", "After-work drinks"],
    "A whole neighbourhood of dining possibilities around The Exchange. Browse together, then choose a table that suits the group.",
    "Steam Mill Lane, Haymarket NSW 2000",
    -33.8771,
    151.202,
    "https://www.darlingsq.com/",
  ],
  [
    "art-gallery",
    "Art Gallery of New South Wales",
    "Sydney",
    "Art & culture",
    ["Weekend wandering", "Family outings", "Date night"],
    "Let a favourite painting decide the pace. Explore the collection, the architecture and the paths towards the harbour.",
    "Art Gallery Road, Sydney NSW 2000",
    -33.8688,
    151.2173,
    "https://www.artgallery.nsw.gov.au/",
  ],
  [
    "barangaroo-reserve",
    "Barangaroo Reserve",
    "Barangaroo",
    "Outdoors",
    ["Weekend wandering", "Family outings", "Hidden gems"],
    "Sandstone edges, native planting and a waterfront walk made for slowing down. Bring water and sun protection.",
    "Hickson Road, Barangaroo NSW 2000",
    -33.8587,
    151.2019,
    "https://www.barangaroo.com/see-and-do/barangaroo-reserve",
  ],
  [
    "chinese-garden",
    "Chinese Garden of Friendship",
    "Darling Harbour",
    "Attractions",
    ["Date night", "Hidden gems", "Family outings"],
    "Step away from the city into pavilions, winding paths and koi ponds. A small, thoughtful escape; admission charges apply.",
    "Pier Street, Darling Harbour NSW 2000",
    -33.8764,
    151.2024,
    "https://www.darlingharbour.com/see-and-do/chinese-garden-of-friendship",
  ],
  [
    "qvb",
    "Queen Victoria Building",
    "Sydney",
    "Shopping",
    ["Weekend wandering", "Coffee dates", "Places to try"],
    "Look up at the clocks and stained glass before exploring the arcades. Make an afternoon of browsing and a tea stop.",
    "455 George Street, Sydney NSW 2000",
    -33.8718,
    151.2067,
    "https://www.qvb.com.au/",
  ],
  [
    "mca",
    "Museum of Contemporary Art Australia",
    "The Rocks",
    "Art & culture",
    ["Date night", "Weekend wandering", "Coffee dates"],
    "Harbourside contemporary art with plenty to talk about afterwards. Check current exhibition access and ticket conditions.",
    "140 George Street, The Rocks NSW 2000",
    -33.8599,
    151.209,
    "https://www.mca.com.au/",
  ],
  [
    "paddys-markets",
    "Paddy’s Markets Haymarket",
    "Haymarket",
    "Shopping",
    ["Family outings", "Weekend wandering", "Hidden gems"],
    "Browse the covered stalls for a small find or something unexpected. Trading days vary, so check before setting out.",
    "9–13 Hay Street, Haymarket NSW 2000",
    -33.8792,
    151.2035,
    "https://paddysmarkets.com.au/",
  ],
  [
    "hyde-park",
    "Hyde Park",
    "Sydney",
    "Outdoors",
    ["Weekend wandering", "Family outings", "Coffee dates"],
    "A shady pause beneath the fig trees, right in the middle of town. Pair a slow walk with something from a nearby cafe.",
    "Elizabeth Street, Sydney NSW 2000",
    -33.8731,
    151.2113,
    "https://www.cityofsydney.nsw.gov.au/parks/hyde-park",
  ],
  [
    "state-library",
    "State Library of New South Wales",
    "Sydney",
    "Art & culture",
    ["Hidden gems", "Weekend wandering"],
    "Reading rooms, sandstone and changing displays. An easy way to turn an ordinary lunch break into a little discovery.",
    "1 Shakespeare Place, Sydney NSW 2000",
    -33.8662,
    151.2128,
    "https://www.sl.nsw.gov.au/",
  ],
  [
    "pyrmont-bridge",
    "Pyrmont Bridge",
    "Darling Harbour",
    "Attractions",
    ["Weekend wandering", "Family outings", "Date night"],
    "Walk across the harbour on a historic swing bridge. Come back after dark to see the waterfront in a different light.",
    "Pyrmont Bridge, Darling Harbour NSW 2000",
    -33.8705,
    151.2013,
    "https://www.darlingharbour.com/see-and-do/pyrmont-bridge",
  ],
];
const places = rows.map(
  (
    [
      slug,
      name,
      suburb,
      category,
      occasions,
      description,
      address,
      latitude,
      longitude,
      website,
    ],
    i,
  ) => ({
    id: id(2, i + 1),
    name,
    suburb,
    category,
    occasions,
    description,
    address,
    latitude,
    longitude,
    website,
    city: "Sydney",
    photo: photos[slug],
  }),
);
const profiles = [
  {
    id: id(3, 1),
    username: "the.slow.weekend",
    name: "The Slow Weekend",
    bio: "A Somewhere editorial guide to quieter corners, long walks and taking your time.",
    city: "Sydney",
    avatar: "",
    editorial: true,
  },
  {
    id: id(3, 2),
    username: "table.for.everyone",
    name: "Table for Everyone",
    bio: "A Somewhere editorial guide to shared tables, easy evenings and good company.",
    city: "Sydney",
    avatar: "",
    editorial: true,
  },
  {
    id: id(3, 3),
    username: "city.side.notes",
    name: "City Side Notes",
    bio: "A Somewhere editorial guide to art, architecture and the places between.",
    city: "Sydney",
    avatar: "",
    editorial: true,
  },
];
const guides = [
  [
    "A little after-hours magic",
    "Lantern-lit dinner, a harbour drink, and absolutely no rush to head home.",
    "Date night",
    1,
    [0, 1, 15],
    [
      "Go early, wander the laneway and let everyone pick a kitchen.",
      "Check the venue’s current hours before planning a sunset drink.",
      "A lovely way to stretch out the evening.",
    ],
  ],
  [
    "The art of a slow Sunday",
    "A few leafy corners for days when the only plan is to take your time.",
    "Weekend wandering",
    0,
    [2, 5, 8, 13],
    [
      "Start with the gardens while the paths are quiet.",
      "Bring a rug and find your patch of grass.",
      "Follow the water rather than a timetable.",
      "Finish beneath the fig trees.",
    ],
  ],
  [
    "Another year, another good table",
    "Low-pressure ideas for getting your favourite people together.",
    "Birthday dinner",
    1,
    [6, 0, 1],
    [
      "A dining precinct, not a single restaurant: agree on a venue before the day.",
      "A casual birthday option for a group happy to try different kitchens.",
      "Check group arrangements directly with the venue.",
    ],
  ],
  [
    "For the wonderfully curious",
    "Gallery afternoons, quiet reading rooms and a tea break worth lingering over.",
    "Hidden gems",
    2,
    [3, 7, 14, 11],
    [
      "Leave time for tea after the exhibition. Check opening days.",
      "Choose one part of the collection and really spend time with it.",
      "Look for the current public displays.",
      "Check current tickets before your visit.",
    ],
  ],
  [
    "Little city adventures",
    "Easy places to explore with the whole crew, from gardens to harbour crossings.",
    "Family outings",
    0,
    [4, 9, 15, 12],
    [
      "Watch the ferries from the promenade.",
      "Check entry fees and bring a little patience for winding paths.",
      "A good harbour crossing between stops.",
      "Check market trading days before promising a treasure hunt.",
    ],
  ],
  [
    "Coffee, conversation & a detour",
    "Tea, a gallery, a little window shopping. An afternoon without a clock.",
    "Coffee dates",
    2,
    [3, 10, 13],
    [
      "The tea house is inside the gallery building shown.",
      "Browse the arcades; choose a current tea or coffee venue on arrival.",
      "Bring your coffee and find a bench under the trees.",
    ],
  ],
];
const collections = guides.map(
  ([name, description, occasion, owner, indices], i) => ({
    id: id(4, i + 1),
    owner_id: profiles[owner].id,
    name,
    description,
    occasion,
    cover: `place:${places[indices[0]].id}`,
    visibility: "public",
    created_at: `2026-10-${String(26 - i).padStart(2, "0")}T09:00:00Z`,
  }),
);
const collection_places = guides.flatMap(([, , , , indices, notes], i) =>
  indices.map((p, position) => ({
    collection_id: collections[i].id,
    place_id: places[p].id,
    position,
    note: notes[position],
  })),
);
const seed = {
  profiles,
  places,
  collections,
  collection_places,
  saved_places: [],
  follows: [],
  likes: [],
};
await mkdir(resolve(root, "apps/web/public/data"), { recursive: true });
await writeFile(
  resolve(root, "apps/web/public/data/seed.json"),
  await format(JSON.stringify(seed), { parser: "json" }),
);
const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
let sql =
  "-- Curated real places and explicitly labelled editorial guides. No fabricated user accounts or popularity.\nbegin;\n";
for (const [table, records] of Object.entries({
  profiles,
  places,
  collections,
  collection_places,
})) {
  for (const record of records) {
    const values = Object.values(record).map((v) =>
      typeof v === "boolean" || typeof v === "number"
        ? String(v)
        : Array.isArray(v)
          ? `array[${v.map(quote).join(",")}]::text[]`
          : typeof v === "object"
            ? `${quote(JSON.stringify(v))}::jsonb`
            : quote(v),
    );
    sql += `insert into public.somewhere_${table} (${Object.keys(record).join(",")}) values (${values.join(",")}) on conflict do nothing;\n`;
  }
}
await mkdir(resolve(root, "supabase"), { recursive: true });
await writeFile(resolve(root, "supabase/seed.sql"), sql + "commit;\n");
console.log(
  `Built ${places.length} real places, ${collections.length} editorial collections and matching PostgreSQL seed.`,
);
