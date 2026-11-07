import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Bookmark,
  Check,
  ChevronDown,
  Compass,
  ExternalLink,
  FolderHeart,
  Heart,
  Home,
  ImagePlus,
  Leaf,
  LockKeyhole,
  MapPin,
  Plus,
  Search,
  Share2,
  SlidersHorizontal,
  Sparkles,
  UserRound,
  X,
} from "lucide-react";
import {
  categories,
  collectionInput,
  collectionItems,
  DEMO_USER,
  moveItem,
  occasions,
  safeWebsite,
  searchPlaces,
  visibleCollections,
  type Collection,
  type CollectionInput,
  type Place,
  type Profile,
  type Snapshot,
} from "../../../packages/shared/model";
import type { Action } from "../../../packages/shared/demo";
import {
  client,
  cloudRepository,
  demoRepository,
  prepareImage,
  type Repository,
} from "./repository";
import { Avatar, Cover, Modal, Photo } from "./ui";
import PwaControls from "./PwaControls";

type Dialog =
  | { kind: "collection"; collection?: Collection }
  | { kind: "save"; place: Place }
  | { kind: "profile" }
  | { kind: "auth" }
  | { kind: "setup" }
  | { kind: "delete"; collection: Collection }
  | { kind: "people"; title: string; ids: string[] }
  | null;
function useRoute() {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const change = () => {
      setHash(location.hash);
      window.scrollTo(0, 0);
      requestAnimationFrame(() =>
        document.getElementById("main-content")?.focus({ preventScroll: true }),
      );
    };
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, []);
  const [path = "/", query = ""] = (
    hash.startsWith("#/") ? hash.slice(1) : "/"
  ).split("?");
  return { path, params: new URLSearchParams(query) };
}
const go = (path: string) => {
  location.hash = path;
};
const errorText = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "Something went wrong. Please try again.";
const CardsContext = createContext<{
  data: Snapshot;
  userId: string | null;
  busy: boolean;
  savePlace: (place: Place) => void;
  like: (id: string) => void;
} | null>(null);

function CollectionCard({ collection }: { collection: Collection }) {
  const { data, userId, busy, like } = useContext(CardsContext)!;
  const owner = data.profiles.find((p) => p.id === collection.owner_id);
  const liked = data.likes.some(
    (l) => l.user_id === userId && l.collection_id === collection.id,
  );
  return (
    <article className="collection-card">
      <div className="collection-image">
        <a
          href={`#/collection/${collection.id}`}
          aria-label={`Open ${collection.name}`}
        >
          <Cover cover={collection.cover} data={data} />
        </a>
        <span className="image-tag">
          {collection.visibility === "private" ? (
            <>
              <LockKeyhole size={12} /> Private
            </>
          ) : (
            collection.occasion
          )}
        </span>
        <button
          className={`floating-button ${liked ? "selected" : ""}`}
          aria-label={`${liked ? "Unlike" : "Like"} ${collection.name}`}
          aria-pressed={liked}
          disabled={busy}
          onClick={() => like(collection.id)}
        >
          <Heart size={18} fill={liked ? "currentColor" : "none"} />
        </button>
      </div>
      <div className="card-kicker">
        {collectionItems(data, collection.id).length} places ·{" "}
        {owner?.city || "Your guidebook"}
      </div>
      <h3>
        <a href={`#/collection/${collection.id}`}>{collection.name}</a>
      </h3>
      <p>{collection.description}</p>
      <a className="byline" href={`#/person/${owner?.id}`}>
        <Avatar name={owner?.name || "Explorer"} avatar={owner?.avatar} small />
        <span>
          {owner?.name}
          {owner?.editorial && <small>Editorial guide</small>}
        </span>
        <span className="like-count">
          <Heart size={12} />{" "}
          {data.likes.filter((l) => l.collection_id === collection.id).length}
        </span>
      </a>
    </article>
  );
}
function PlaceCard({ place }: { place: Place }) {
  const { data, userId, savePlace } = useContext(CardsContext)!;
  const mine = new Set(
    data.collections.filter((c) => c.owner_id === userId).map((c) => c.id),
  );
  const saved =
    data.saved_places.some(
      (s) => s.user_id === userId && s.place_id === place.id,
    ) ||
    data.collection_places.some(
      (cp) => cp.place_id === place.id && mine.has(cp.collection_id),
    );
  return (
    <article className="place-card">
      <div className="place-image">
        <a href={`#/place/${place.id}`} aria-label={`Discover ${place.name}`}>
          <Photo key={place.id} place={place} />
        </a>
        <button
          className={`floating-button ${saved ? "selected" : ""}`}
          aria-label={`Save ${place.name}`}
          aria-pressed={saved}
          onClick={() => savePlace(place)}
        >
          <Bookmark size={18} fill={saved ? "currentColor" : "none"} />
        </button>
      </div>
      <div className="card-kicker">{place.category}</div>
      <h3>
        <a href={`#/place/${place.id}`}>{place.name}</a>
      </h3>
      <p className="place-location">
        <MapPin size={12} />
        {place.suburb}, {place.city}
      </p>
    </article>
  );
}

export default function App() {
  const [repo, setRepo] = useState<Repository | null>(null);
  const [data, setData] = useState<Snapshot | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState("");
  const [backendIssue, setBackendIssue] = useState("");
  const [dialog, setDialog] = useState<Dialog>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [reload, setReload] = useState(0);
  const { path, params } = useRoute();
  useEffect(() => {
    let active = true;
    let subscription: { unsubscribe: () => void } | undefined;
    setLoadError("");
    setData(null);
    async function init() {
      let chosen: Repository;
      let uid: string | null = null;
      try {
        if (!client)
          throw new Error("Supabase public configuration is not installed.");
        chosen = cloudRepository();
        await chosen.load();
        const { data: sessionData, error } = await client.auth.getSession();
        if (error) throw error;
        uid = sessionData.session?.user.id ?? null;
        if (uid) {
          const result = await client.rpc("somewhere_ensure_profile");
          if (result.error) throw result.error;
        }
        subscription = client.auth.onAuthStateChange((event, session) => {
          if (!["SIGNED_IN", "SIGNED_OUT", "PASSWORD_RECOVERY"].includes(event))
            return;
          if (event === "PASSWORD_RECOVERY") {
            setDialog({ kind: "auth" });
            setMessage(
              "You are signed in through your recovery link. Use “Set a new password” in the account dialog.",
            );
          }
          setData(null);
          setTimeout(async () => {
            try {
              const nextId = session?.user.id ?? null;
              if (nextId) {
                const result = await client!.rpc("somewhere_ensure_profile");
                if (result.error) throw result.error;
              }
              const snapshot = await chosen.load();
              if (active) {
                setUserId(nextId);
                setData(snapshot);
              }
            } catch (error) {
              if (active) setLoadError(errorText(error));
            }
          }, 0);
        }).data.subscription;
      } catch {
        chosen = await demoRepository();
        uid = DEMO_USER;
        if (active)
          setBackendIssue(
            client
              ? "The configured Supabase project is unreachable or the Somewhere schema is not installed."
              : import.meta.env.VITE_DATA_MODE === "demo"
                ? "This release is intentionally running as a local demo."
                : "Supabase is not connected.",
          );
      }
      const snapshot = await chosen.load();
      if (active) {
        setRepo(chosen);
        setUserId(uid);
        setData(snapshot);
      }
    }
    init().catch((error) => {
      if (active) setLoadError(errorText(error));
    });
    return () => {
      active = false;
      subscription?.unsubscribe();
    };
  }, [reload]);
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(""), 6500);
    return () => clearTimeout(timer);
  }, [message]);
  const notify = (text: string) => setMessage(text);
  async function act(action: Action, success = "") {
    if (!repo || !userId) {
      setDialog({ kind: "auth" });
      throw new Error("Sign in to save your own recommendations.");
    }
    if (busyRef.current)
      throw new Error("Please wait for your previous change to finish.");
    busyRef.current = true;
    setBusy(true);
    try {
      await repo.act(action, userId);
      const snapshot = await repo.load();
      setData(snapshot);
      if (success) notify(success);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  const run = (action: Action, success?: string) => {
    void act(action, success).catch((error) => notify(errorText(error)));
  };
  const needUser = (next: Dialog) =>
    setDialog(userId ? next : { kind: "auth" });
  if (!data || !repo)
    return (
      <div className="loading-screen">
        <div className="wordmark">
          <MapPin />
          somewhere<span>✳</span>
        </div>
        {loadError ? (
          <>
            <h1>Your guidebook couldn’t load.</h1>
            <p role="alert">{loadError}</p>
            <button
              className="button primary"
              onClick={() => setReload((n) => n + 1)}
            >
              Try again
            </button>
          </>
        ) : (
          <>
            <div className="loading-line" />
            <p>Finding a few good places…</p>
          </>
        )}
      </div>
    );
  const mine = data.collections.filter((c) => c.owner_id === userId);
  const profile = data.profiles.find((p) => p.id === userId);
  const visible = visibleCollections(data, userId);
  const nav = [
    { href: "/", label: "Home", icon: Home },
    { href: "/explore", label: "Explore", icon: Compass },
    { href: "/collections", label: "My collections", icon: FolderHeart },
    { href: "/saved", label: "Saved", icon: Bookmark },
    { href: "/profile", label: "Profile", icon: UserRound },
  ];
  const countLikes = (id: string) =>
    data.likes.filter((l) => l.collection_id === id).length;
  async function share(collection: Collection) {
    if (collection.visibility === "private") {
      notify(
        "Private collections are only visible to you. Edit visibility before sharing.",
      );
      return;
    }
    if (repo!.mode === "demo" && collection.owner_id === DEMO_USER) {
      notify(
        "This guidebook is local to your device. Connect Supabase to publish and share your own collections.",
      );
      return;
    }
    const url = `${location.origin}${import.meta.env.BASE_URL}#/collection/${collection.id}`;
    try {
      if (navigator.share)
        await navigator.share({
          title: collection.name,
          text: collection.description,
          url,
        });
      else {
        await navigator.clipboard.writeText(url);
        notify("Collection link copied.");
      }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError"))
        notify(
          "Sharing is unavailable in this browser. You can copy the collection URL from the address bar.",
        );
    }
  }
  function Empty({
    title,
    text,
    action = "Explore places",
    href = "/explore",
  }: {
    title: string;
    text: string;
    action?: string;
    href?: string;
  }) {
    return (
      <div className="empty">
        <Compass size={36} strokeWidth={1} />
        <h2>{title}</h2>
        <p>{text}</p>
        <a className="button primary" href={`#${href}`}>
          {action}
          <ArrowRight size={16} />
        </a>
      </div>
    );
  }
  function SectionHeading({
    title,
    kicker,
    href,
  }: {
    title: string;
    kicker?: string;
    href?: string;
  }) {
    return (
      <div className="section-heading">
        <div>
          {kicker && <p className="eyebrow">{kicker}</p>}
          <h2>{title}</h2>
        </div>
        {href && (
          <a className="text-link" href={`#${href}`}>
            See all <ArrowRight size={15} />
          </a>
        )}
      </div>
    );
  }
  function renderHome() {
    const followed = new Set(
      data!.follows
        .filter((f) => f.follower_id === userId)
        .map((f) => f.following_id),
    );
    const fromFollowing = visible.filter((c) => followed.has(c.owner_id));
    return (
      <>
        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow">
              <span className="tiny-sun">✳</span> GOOD PLACES. BETTER COMPANY.
            </p>
            <h1>
              Find your kind
              <br />
              of <em>somewhere.</em>
            </h1>
            <p>
              The tucked-away table. The long-way-home walk.
              <br className="desktop-break" /> A little inspiration for your
              next “let’s go there.”
            </p>
            <a className="button primary" href="#/explore">
              Let’s find a place <ArrowRight size={17} />
            </a>
            <div className="hero-footnote">
              <span className="mini-avatars">
                <Avatar small name="Slow Weekend" />
                <Avatar small name="Table Everyone" />
                <Avatar small name="City Notes" />
              </span>
              <span>A few good guides. A world of possibility.</span>
            </div>
          </div>
          <div className="hero-photos">
            <a
              className="hero-main-photo"
              href={`#/place/${data!.places[0].id}`}
            >
              <Photo place={data!.places[0]} eager />
              <span>
                <MapPin size={14} /> Spice Alley, Sydney{" "}
                <ArrowRight size={16} />
              </span>
            </a>
            <div className="postcard">
              <Photo place={data!.places[1]} eager />
              <span>Meet you by the water. ↗</span>
            </div>
            <span className="hero-scribble">
              less scrolling,
              <br />
              more going.
            </span>
          </div>
        </section>
        <section className="occasions-section">
          <div className="section-heading">
            <h2>What’s the occasion?</h2>
            <span className="subtle">There’s a somewhere for that.</span>
          </div>
          <div className="occasion-list">
            {[
              ["Date night", "A little chemistry"],
              ["Birthday dinner", "Make a night of it"],
              ["Coffee dates", "One more coffee"],
              ["Weekend wandering", "Take the long way"],
              ["Hidden gems", "Off the usual path"],
            ].map(([o, caption], i) => (
              <a
                href={`#/explore?occasion=${encodeURIComponent(o)}`}
                className={`occasion-tile tone-${i}`}
                key={o}
              >
                <span className="occasion-symbol">
                  {["♡", "✷", "☕", "↝", "◇"][i]}
                </span>
                <strong>{o}</strong>
                <small>{caption}</small>
              </a>
            ))}
          </div>
        </section>
        {fromFollowing.length > 0 && (
          <section>
            <SectionHeading
              kicker="YOUR PEOPLE, THEIR PLACES"
              title="From the guides you follow"
            />
            <div className="collection-grid">
              {fromFollowing.slice(0, 3).map((c) => (
                <CollectionCard key={c.id} collection={c} />
              ))}
            </div>
          </section>
        )}
        <section>
          <SectionHeading
            kicker="LITTLE LISTS, BIG POSSIBILITIES"
            title="A good place to start"
            href="/explore?tab=collections"
          />
          <div className="collection-grid">
            {visible.slice(0, 3).map((c) => (
              <CollectionCard key={c.id} collection={c} />
            ))}
          </div>
        </section>
        <section className="discovery-strip">
          <div>
            <p className="eyebrow">KEEP THE GOOD ONES CLOSE</p>
            <h2>Your taste. Your little guidebook.</h2>
            <p>
              Save a place for later, or make a collection for a whole kind of
              day.
            </p>
          </div>
          <button
            className="button"
            onClick={() => needUser({ kind: "collection" })}
          >
            Start a collection <Plus size={16} />
          </button>
        </section>
        <section>
          <SectionHeading
            kicker="ON OUR SYDNEY RADAR"
            title="Worth a little detour"
            href="/explore"
          />
          <div className="place-grid">
            {data!.places.slice(0, 4).map((place) => (
              <PlaceCard key={place.id} place={place} />
            ))}
          </div>
        </section>
      </>
    );
  }
  function renderCollection({ id }: { id: string }) {
    const c = visible.find((item) => item.id === id);
    if (!c)
      return (
        <Empty
          title="This collection isn’t available."
          text="It may be private, deleted, or stored only on another device. Sign in if it belongs to you."
        />
      );
    const owner = data!.profiles.find((p) => p.id === c.owner_id)!;
    const isMine = c.owner_id === userId;
    const liked = data!.likes.some(
      (l) => l.user_id === userId && l.collection_id === id,
    );
    const items = collectionItems(data!, id);
    return (
      <>
        <a className="back-link" href="#/explore?tab=collections">
          <ArrowLeft size={15} />
          All collections
        </a>
        <div className="collection-detail">
          <div className="detail-cover">
            <Cover cover={c.cover} data={data!} />
          </div>
          <div className="collection-detail-copy">
            <span className="pill">
              {c.visibility === "private" && <LockKeyhole size={12} />}
              {c.visibility === "private" ? "Private · only you" : c.occasion}
            </span>
            <h1>{c.name}</h1>
            <p>{c.description}</p>
            <a href={`#/person/${owner.id}`} className="byline">
              <Avatar name={owner.name} avatar={owner.avatar} small />
              <span>
                Curated by {owner.name}
                {owner.editorial && <small>Somewhere editorial guide</small>}
              </span>
            </a>
            <p className="subtle">
              {items.length} places · {countLikes(id)}{" "}
              {countLikes(id) === 1 ? "like" : "likes"}
            </p>
            <div className="button-row">
              <button
                className={`button ${liked ? "active" : ""}`}
                disabled={busy}
                aria-pressed={liked}
                onClick={() =>
                  userId
                    ? run({ type: "like", id })
                    : setDialog({ kind: "auth" })
                }
              >
                <Heart size={16} fill={liked ? "currentColor" : "none"} />
                {liked ? "Liked" : "Like collection"}
              </button>
              <button className="button" onClick={() => void share(c)}>
                <Share2 size={16} />
                Share
              </button>
              {isMine && (
                <button
                  className="button"
                  onClick={() =>
                    setDialog({ kind: "collection", collection: c })
                  }
                >
                  Edit collection
                </button>
              )}
            </div>
            {repo!.mode === "demo" && isMine && (
              <p className="local-disclaimer">
                Stored on this device. Public-link sharing needs a connected
                backend.
              </p>
            )}
          </div>
        </div>
        <SectionHeading
          title={
            isMine
              ? "Your places, in your order."
              : "A few stops along the way."
          }
          kicker={isMine ? "USE THE ARROWS TO REORDER" : "THE LITTLE GUIDE"}
        />
        {items.length ? (
          <div className="collection-stops">
            {items.map((item, index) => {
              const p = data!.places.find((p) => p.id === item.place_id)!;
              return (
                <article className="stop" key={p.id}>
                  <span className="stop-number">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <a className="stop-photo" href={`#/place/${p.id}`}>
                    <Photo place={p} />
                  </a>
                  <div className="stop-copy">
                    <div className="card-kicker">
                      {p.category} · {p.suburb}
                    </div>
                    <h3>
                      <a href={`#/place/${p.id}`}>{p.name}</a>
                    </h3>
                    <p>{p.description}</p>
                    {isMine ? (
                      <NoteEditor
                        key={`${id}-${p.id}-${item.note}`}
                        note={item.note}
                        save={(note) =>
                          act(
                            { type: "note", id, placeId: p.id, note },
                            "Recommendation saved.",
                          )
                        }
                      />
                    ) : (
                      item.note && <blockquote>“{item.note}”</blockquote>
                    )}
                    <a className="text-link" href={`#/place/${p.id}`}>
                      Take a closer look <ArrowRight size={14} />
                    </a>
                  </div>
                  <div className="stop-actions">
                    {isMine && (
                      <>
                        <button
                          className="icon-button"
                          disabled={busy || index === 0}
                          aria-label={`Move ${p.name} up`}
                          onClick={() =>
                            run({
                              type: "reorder",
                              id,
                              ids: moveItem(
                                items.map((i) => i.place_id),
                                p.id,
                                -1,
                              ),
                            })
                          }
                        >
                          <ArrowUp size={17} />
                        </button>
                        <button
                          className="icon-button"
                          disabled={busy || index === items.length - 1}
                          aria-label={`Move ${p.name} down`}
                          onClick={() =>
                            run({
                              type: "reorder",
                              id,
                              ids: moveItem(
                                items.map((i) => i.place_id),
                                p.id,
                                1,
                              ),
                            })
                          }
                        >
                          <ArrowDown size={17} />
                        </button>
                      </>
                    )}
                    <button
                      className="icon-button"
                      aria-label={`Save ${p.name}`}
                      onClick={() => needUser({ kind: "save", place: p })}
                    >
                      <Bookmark size={18} />
                    </button>
                    {isMine && (
                      <button
                        className="icon-button"
                        disabled={busy}
                        aria-label={`Remove ${p.name} from this collection`}
                        onClick={() =>
                          run(
                            {
                              type: "save",
                              placeId: p.id,
                              ids: data!.collection_places
                                .filter(
                                  (i) =>
                                    i.place_id === p.id &&
                                    i.collection_id !== id &&
                                    mine.some((c) => c.id === i.collection_id),
                                )
                                .map((i) => i.collection_id),
                              favourite: data!.saved_places.some(
                                (s) =>
                                  s.user_id === userId && s.place_id === p.id,
                              ),
                            },
                            "Place removed from this collection.",
                          )
                        }
                      >
                        <X size={16} />
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <Empty
            title="The first place is the best place to start."
            text="Find somewhere you love, then save it into this collection."
          />
        )}
        {isMine && (
          <div className="collection-bottom">
            <a className="button primary" href="#/explore">
              <Plus size={16} />
              Find places to add
            </a>
            <button
              className="text-link danger"
              onClick={() => setDialog({ kind: "delete", collection: c })}
            >
              Delete collection
            </button>
          </div>
        )}
      </>
    );
  }
  function renderPlace({ id }: { id: string }) {
    const p = data!.places.find((p) => p.id === id);
    if (!p)
      return (
        <Empty
          title="That place wandered off."
          text="Explore the guide to find another somewhere."
        />
      );
    const featuring = visible.filter((c) =>
      data!.collection_places.some(
        (i) => i.place_id === id && i.collection_id === c.id,
      ),
    );
    const notes = data!.collection_places.filter(
      (i) =>
        i.place_id === id &&
        i.note &&
        featuring.some((c) => c.id === i.collection_id),
    );
    const site = safeWebsite(p.website);
    return (
      <>
        <a className="back-link" href="#/explore">
          <ArrowLeft size={15} />
          Back to exploring
        </a>
        <div className="place-detail">
          <div className="place-portrait">
            <Photo place={p} eager />
            <div className="photo-credit">
              {p.photo.src ? (
                <>
                  Photo: {p.photo.author} ·{" "}
                  <a href={p.photo.source} target="_blank" rel="noreferrer">
                    {p.photo.license}
                    <ExternalLink size={10} />
                  </a>
                </>
              ) : (
                "No verified venue photograph is available yet."
              )}
            </div>
          </div>
          <div className="place-detail-copy">
            <span className="pill">{p.category}</span>
            <h1>{p.name}</h1>
            <p className="place-location">
              <MapPin size={15} />
              {p.suburb}, {p.city}
            </p>
            <p className="detail-description">{p.description}</p>
            <div className="tag-row">
              {p.occasions.map((o) => (
                <a href={`#/explore?occasion=${encodeURIComponent(o)}`} key={o}>
                  {o}
                </a>
              ))}
            </div>
            <button
              className="button primary wide"
              onClick={() => needUser({ kind: "save", place: p })}
            >
              <Bookmark size={16} />
              Save to your guidebook
            </button>
            <div className="address-block">
              <p className="eyebrow">THE PARTICULARS</p>
              <p>{p.address}</p>
              <div className="button-row">
                {site && (
                  <a
                    className="text-link"
                    href={site}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Visit website <ExternalLink size={13} />
                  </a>
                )}
                <a
                  className="text-link"
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${p.name} ${p.address}`)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Get directions <ArrowRight size={13} />
                </a>
              </div>
              <p className="fine-print">
                Editorial inspiration, not live availability. Confirm opening
                hours, prices, accessibility and bookings with the venue.
              </p>
            </div>
          </div>
        </div>
        <PlaceMap key={p.id} place={p} />
        {notes.length > 0 && (
          <section>
            <SectionHeading
              kicker="A LITTLE LOCAL CONTEXT"
              title="Why it’s in their guidebook"
            />
            <div className="recommendation-grid">
              {notes.map((n) => {
                const c = visible.find((c) => c.id === n.collection_id)!;
                const author = data!.profiles.find((p) => p.id === c.owner_id)!;
                return (
                  <a
                    key={n.collection_id}
                    href={`#/collection/${n.collection_id}`}
                    className="recommendation"
                  >
                    <blockquote>“{n.note}”</blockquote>
                    <div className="byline">
                      <Avatar name={author.name} avatar={author.avatar} small />
                      <span>
                        {author.name}
                        <small>
                          {author.editorial
                            ? "Editorial guide"
                            : "Community recommendation"}{" "}
                          · {c.name}
                        </small>
                      </span>
                    </div>
                  </a>
                );
              })}
            </div>
          </section>
        )}
        <section>
          <SectionHeading
            title="In good company"
            kicker="COLLECTIONS FEATURING THIS PLACE"
          />
          {featuring.length ? (
            <div className="collection-grid">
              {featuring.map((c) => (
                <CollectionCard key={c.id} collection={c} />
              ))}
            </div>
          ) : (
            <p className="subtle">
              No public collections yet. Make the first one.
            </p>
          )}
        </section>
      </>
    );
  }
  function renderProfile({ id }: { id: string | null }) {
    const person = data!.profiles.find((p) => p.id === id);
    if (!person)
      return (
        <Empty
          title="Make a little corner of your own."
          text="Sign in to build your guidebook and follow people whose places you love."
        />
      );
    const own = id === userId;
    const following = data!.follows.some(
      (f) => f.follower_id === userId && f.following_id === id,
    );
    const followers = data!.follows
      .filter((f) => f.following_id === id)
      .map((f) => f.follower_id);
    const follows = data!.follows
      .filter((f) => f.follower_id === id)
      .map((f) => f.following_id);
    const collections = visible.filter((c) => c.owner_id === id);
    return (
      <>
        <div className="profile-header">
          <Avatar name={person.name} avatar={person.avatar} />
          <div>
            <p className="eyebrow">
              {person.editorial
                ? "SOMEWHERE EDITORIAL GUIDE"
                : own
                  ? "YOUR LITTLE CORNER OF THE WORLD"
                  : "COMMUNITY GUIDE"}
            </p>
            <h1>{person.name}</h1>
            <p className="subtle">
              @{person.username} · {person.city}
            </p>
            <p>{person.bio}</p>
            <div className="profile-counts">
              <span>
                <strong>{collections.length}</strong> collections
              </span>
              <button
                onClick={() =>
                  setDialog({
                    kind: "people",
                    title: "Followers",
                    ids: followers,
                  })
                }
              >
                <strong>{followers.length}</strong> followers
              </button>
              <button
                onClick={() =>
                  setDialog({
                    kind: "people",
                    title: "Following",
                    ids: follows,
                  })
                }
              >
                <strong>{follows.length}</strong> following
              </button>
            </div>
          </div>
          <div>
            {own ? (
              <button
                className="button"
                onClick={() => setDialog({ kind: "profile" })}
              >
                Edit profile
              </button>
            ) : (
              <button
                className={`button ${following ? "" : "primary"}`}
                disabled={busy}
                onClick={() =>
                  userId
                    ? run(
                        { type: "follow", id: person.id },
                        following
                          ? "Guide unfollowed."
                          : "Guide followed. Their collections will appear on Home.",
                      )
                    : setDialog({ kind: "auth" })
                }
              >
                {following ? <Check size={16} /> : <Plus size={16} />}
                {following ? "Following" : "Follow guide"}
              </button>
            )}
          </div>
        </div>
        {own && repo!.mode === "demo" && (
          <div className="inline-notice">
            <Leaf size={17} />
            <span>
              This is your local demo profile, not a registered account. Your
              changes stay in this browser.
            </span>
          </div>
        )}
        <SectionHeading
          title={own ? "Your collections" : "Their little guidebooks"}
        />
        {collections.length ? (
          <div className="collection-grid">
            {collections.map((c) => (
              <CollectionCard key={c.id} collection={c} />
            ))}
          </div>
        ) : (
          <Empty
            title="A blank page, a new possibility."
            text="Create a collection, find a few favourites, and make it yours."
          />
        )}
        {own && (
          <>
            <SectionHeading title="Collections you’ve liked" />
            {visible.filter((c) =>
              data!.likes.some(
                (l) => l.user_id === userId && l.collection_id === c.id,
              ),
            ).length ? (
              <div className="collection-grid">
                {visible
                  .filter((c) =>
                    data!.likes.some(
                      (l) => l.user_id === userId && l.collection_id === c.id,
                    ),
                  )
                  .map((c) => (
                    <CollectionCard key={c.id} collection={c} />
                  ))}
              </div>
            ) : (
              <p className="subtle">
                Tap a heart on a collection to keep it here.
              </p>
            )}
          </>
        )}
      </>
    );
  }
  let page;
  if (path === "/") page = renderHome();
  else if (path === "/explore")
    page = (
      <ExplorePage
        key={`${path}?${params.toString()}`}
        params={params}
        data={data}
        visible={visible}
        renderPlace={(p) => <PlaceCard key={p.id} place={p} />}
        renderCollection={(c) => <CollectionCard key={c.id} collection={c} />}
      />
    );
  else if (path === "/collections")
    page = (
      <>
        <div className="page-intro heading-with-action">
          <div>
            <p className="eyebrow">YOUR PERSONAL GUIDEBOOK</p>
            <h1>
              A place for <em>your places.</em>
            </h1>
            <p>
              Little lists for big nights, slow mornings, and everything in
              between.
            </p>
          </div>
          <button
            className="button primary"
            onClick={() => needUser({ kind: "collection" })}
          >
            <Plus size={17} />
            Create collection
          </button>
        </div>
        {mine.length ? (
          <div className="collection-grid">
            {mine.map((c) => (
              <CollectionCard key={c.id} collection={c} />
            ))}
          </div>
        ) : (
          <Empty
            title="Good things start with a little list."
            text="Create your first collection using the button above, then add places from Explore."
          />
        )}
      </>
    );
  else if (path === "/saved") {
    const ids = new Set([
      ...data.saved_places
        .filter((s) => s.user_id === userId)
        .map((s) => s.place_id),
      ...data.collection_places
        .filter((i) => mine.some((c) => c.id === i.collection_id))
        .map((i) => i.place_id),
    ]);
    page = (
      <>
        <div className="page-intro">
          <p className="eyebrow">KEEP THE GOOD ONES CLOSE</p>
          <h1>
            For a <em>“one day.”</em>
          </h1>
          <p>
            All the places you’ve saved or added to your collections. Only
            visible to you.
          </p>
        </div>
        {ids.size ? (
          <div className="place-grid">
            {data.places
              .filter((p) => ids.has(p.id))
              .map((p) => (
                <PlaceCard key={p.id} place={p} />
              ))}
          </div>
        ) : (
          <Empty
            title="A little room for possibility."
            text="Save a place that catches your eye. It’ll be waiting here when you’re ready."
          />
        )}
      </>
    );
  } else if (path.startsWith("/place/"))
    page = renderPlace({ id: path.slice(7) });
  else if (path.startsWith("/collection/"))
    page = renderCollection({ id: path.slice(12) });
  else if (path === "/profile" || path.startsWith("/person/"))
    page = renderProfile({ id: path === "/profile" ? userId : path.slice(8) });
  else
    page = (
      <Empty
        title="Let’s find another way."
        text="That page isn’t in the guidebook."
        href="/"
        action="Back to home"
      />
    );
  return (
    <CardsContext.Provider
      value={{
        data,
        userId,
        busy,
        savePlace: (place) => needUser({ kind: "save", place }),
        like: (id) =>
          userId ? run({ type: "like", id }) : setDialog({ kind: "auth" }),
      }}
    >
      <>
        <a
          className="skip-link"
          href="#main-content"
          onClick={(event) => {
            event.preventDefault();
            document.getElementById("main-content")?.focus();
          }}
        >
          Skip to content
        </a>
        <aside className="sidebar">
          <a className="wordmark" href="#/">
            <MapPin size={26} strokeWidth={1.8} />
            somewhere<span>✳</span>
          </a>
          <p className="brand-note">good places, good company.</p>
          <nav aria-label="Main navigation">
            {nav.map(({ href, label, icon: Icon }) => (
              <a
                key={href}
                href={`#${href}`}
                aria-current={path === href ? "page" : undefined}
              >
                <Icon size={19} />
                <span>{label}</span>
                {label === "My collections" && mine.length > 0 && (
                  <small>{mine.length}</small>
                )}
              </a>
            ))}
          </nav>
          <div className="sidebar-collections">
            <p className="eyebrow">
              YOUR LITTLE LISTS
              <button
                className="icon-button"
                aria-label="Create collection"
                onClick={() => needUser({ kind: "collection" })}
              >
                <Plus size={16} />
              </button>
            </p>
            {mine.slice(0, 4).map((c) => (
              <a href={`#/collection/${c.id}`} key={c.id}>
                <span className="list-dot" />
                {c.name}
                {c.visibility === "private" && <LockKeyhole size={11} />}
              </a>
            ))}
            {!mine.length && (
              <p>
                Your next good idea
                <br />
                starts with a collection.
              </p>
            )}
          </div>
          <div className="sidebar-bottom">
            <Leaf size={24} strokeWidth={1} />
            <p>
              A little less “where should we go?”
              <br />A little more being there.
            </p>
            <button onClick={() => setDialog({ kind: "setup" })}>
              {repo.mode === "demo"
                ? "Local demo · about your data"
                : "About & photo credits"}
              <ArrowRight size={12} />
            </button>
          </div>
        </aside>
        <div className="workspace">
          <header className="topbar">
            <a className="mobile-wordmark wordmark" href="#/">
              somewhere<span>✳</span>
            </a>
            <a className="city-selector" href="#/explore">
              <MapPin size={15} />
              Sydney, Australia
              <ChevronDown size={13} />
            </a>
            <form
              className="top-search"
              onSubmit={(e) => {
                e.preventDefault();
                const q = new FormData(e.currentTarget).get("search");
                go(`/explore?q=${encodeURIComponent(String(q || ""))}`);
              }}
            >
              <Search size={16} />
              <input
                name="search"
                aria-label="Quick search"
                placeholder="Find your next somewhere"
              />
            </form>
            <button
              className="account-button"
              onClick={() => setDialog({ kind: "auth" })}
              aria-label={
                repo.mode === "demo"
                  ? "Account and cloud sign-in"
                  : userId
                    ? "Your account"
                    : "Sign in"
              }
            >
              <Avatar
                name={profile?.name || "Guest Explorer"}
                avatar={profile?.avatar}
                small
              />
            </button>
          </header>
          {repo.mode === "demo" && (
            <div className="demo-banner">
              <span>
                <span className="status-dot" />
                Local demo · changes stay on this device. Shared accounts aren’t
                connected.
              </span>
              <button onClick={() => setDialog({ kind: "setup" })}>
                About this demo <ArrowRight size={12} />
              </button>
            </div>
          )}
          <PwaControls
            localDemo={repo.mode === "demo"}
            blocked={busy || dialog !== null}
          />
          <main id="main-content" tabIndex={-1}>
            {page}
            <footer>
              <a className="wordmark" href="#/">
                somewhere<span>✳</span>
              </a>
              <span>Made for the joy of going somewhere.</span>
              <button onClick={() => setDialog({ kind: "setup" })}>
                About, privacy & photo credits
              </button>
            </footer>
          </main>
        </div>
        <nav className="mobile-nav" aria-label="Mobile navigation">
          {nav.map(({ href, label, icon: Icon }) => (
            <a
              href={`#${href}`}
              key={href}
              aria-current={path === href ? "page" : undefined}
            >
              <Icon size={20} />
              <span>{label === "My collections" ? "Collections" : label}</span>
            </a>
          ))}
        </nav>
        {message && (
          <div className="toast" role="status">
            {message}
            <button aria-label="Dismiss message" onClick={() => setMessage("")}>
              <X size={16} />
            </button>
          </div>
        )}
        {dialog?.kind === "collection" && (
          <CollectionEditor
            key={dialog.collection?.id || "new"}
            data={data}
            repo={repo}
            userId={userId!}
            collection={dialog.collection}
            close={() => setDialog(null)}
            save={async (id, input) => {
              await act({ type: "collection", id, input }, "Collection saved.");
              setDialog(null);
              go(`/collection/${id}`);
            }}
          />
        )}
        {dialog?.kind === "save" && (
          <SaveDialog
            key={dialog.place.id}
            place={dialog.place}
            data={data}
            mine={mine}
            userId={userId!}
            close={() => setDialog(null)}
            save={async (ids, favourite) => {
              await act(
                { type: "save", placeId: dialog.place.id, ids, favourite },
                "Your guidebook is up to date.",
              );
              setDialog(null);
            }}
            create={async (name) => {
              const id = crypto.randomUUID();
              await act({
                type: "collection",
                id,
                input: {
                  name,
                  description: "",
                  occasion: "Places to try",
                  cover: `place:${dialog.place.id}`,
                  visibility: "private",
                },
              });
              return id;
            }}
          />
        )}
        {dialog?.kind === "profile" && profile && (
          <ProfileEditor
            profile={profile}
            repo={repo}
            close={() => setDialog(null)}
            save={async (input) => {
              await act({ type: "profile", input }, "Profile updated.");
              setDialog(null);
            }}
          />
        )}
        {dialog?.kind === "auth" && (
          <AuthDialog
            cloud={repo.mode === "cloud"}
            userId={userId}
            close={() => setDialog(null)}
            notify={notify}
          />
        )}
        {dialog?.kind === "setup" && (
          <Modal title="A little about Somewhere" close={() => setDialog(null)}>
            <div className="prose">
              <p>
                Somewhere is a personal guidebook for real places. The Sydney
                starter guide contains {data.places.length} curated places and
                six collections from explicitly labelled editorial guides, not
                real user reviews or invented popularity.
              </p>
              <h3>Your data</h3>
              <p>
                {repo.mode === "demo"
                  ? `${backendIssue} You are using a local demo, not a registered account. Collections, saves, follows and likes are stored in IndexedDB in this browser. They do not sync or publish, and clearing site data removes them. Do not store anything sensitive here.`
                  : "Accounts and guidebooks are stored in Supabase. Private collections and saved places are protected by database access policies; profiles and social follows are public. Uploaded images use a private storage bucket."}
              </p>
              <p>
                Local demo changes are not automatically uploaded when cloud
                mode is connected. A backup can preserve them for your own
                records.
              </p>
              <button
                className="button"
                onClick={() => {
                  const blob = new Blob(
                    [
                      JSON.stringify(
                        {
                          version: 1,
                          profile,
                          collections: mine,
                          collection_places: data.collection_places.filter(
                            (i) => mine.some((c) => c.id === i.collection_id),
                          ),
                          saved_places: data.saved_places.filter(
                            (s) => s.user_id === userId,
                          ),
                        },
                        null,
                        2,
                      ),
                    ],
                    { type: "application/json" },
                  );
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = "somewhere-guidebook.json";
                  a.click();
                  setTimeout(() => URL.revokeObjectURL(url), 1000);
                }}
              >
                Download your guidebook backup
              </button>
              <h3>Before you head out</h3>
              <p>
                Places are curated inspiration, not live listings or booking
                advice. Confirm opening hours, prices, accessibility and
                availability with venues. Maps load only when requested, using
                OpenStreetMap. External websites have their own privacy
                policies.
              </p>
              <h3>Photography</h3>
              <p>
                Real photographs of the named places or clearly identified
                host-building details, cropped, resized and WebP-compressed.
                Images are licensed individually below. No photograph is a
                promise of current venue conditions. Where no venue photo has
                been verified, we show a clearly labelled unavailable state
                rather than an unrelated image.
              </p>
              {data.places.map(({ id, name, photo }) => (
                <div className="credit-row" key={id}>
                  <strong>{name}</strong>
                  <span>
                    {photo.src ? (
                      <>
                        {photo.author} ·{" "}
                        <a href={photo.source} target="_blank" rel="noreferrer">
                          Original
                        </a>{" "}
                        ·{" "}
                        <a
                          href={photo.licenseUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {photo.license}
                        </a>
                      </>
                    ) : (
                      "Venue photo not yet available; no stock image is used."
                    )}
                  </span>
                </div>
              ))}
              <a
                className="text-link"
                href="https://github.com/gracebilliris/somewhere#backend-setup"
                target="_blank"
                rel="noreferrer"
              >
                Backend setup & source <ExternalLink size={13} />
              </a>
            </div>
          </Modal>
        )}
        {dialog?.kind === "people" && (
          <Modal title={dialog.title} close={() => setDialog(null)}>
            {dialog.ids.length ? (
              dialog.ids.map((id) => {
                const p = data.profiles.find((p) => p.id === id);
                return (
                  p && (
                    <a
                      key={id}
                      className="person-list-row"
                      href={`#/person/${id}`}
                      onClick={() => setDialog(null)}
                    >
                      <Avatar name={p.name} avatar={p.avatar} small />
                      <span>
                        {p.name}
                        <small>@{p.username}</small>
                      </span>
                      <ArrowRight size={16} />
                    </a>
                  )
                );
              })
            ) : (
              <p className="subtle">
                No one here yet. Good recommendations take a little time.
              </p>
            )}
          </Modal>
        )}
        {dialog?.kind === "delete" && (
          <Modal title="Let this collection go?" close={() => setDialog(null)}>
            <p>
              “{dialog.collection.name}” and its place ordering and notes will
              be deleted. Places saved elsewhere are kept. This cannot be
              undone.
            </p>
            <div className="button-row">
              <button className="button" onClick={() => setDialog(null)}>
                Keep collection
              </button>
              <button
                disabled={busy}
                className="button destructive"
                onClick={() => {
                  void act(
                    { type: "delete", id: dialog.collection.id },
                    "Collection deleted.",
                  )
                    .then(() => {
                      setDialog(null);
                      go("/collections");
                    })
                    .catch((e) => notify(errorText(e)));
                }}
              >
                Delete collection
              </button>
            </div>
          </Modal>
        )}
      </>
    </CardsContext.Provider>
  );
}

function PlaceMap({ place: p }: { place: Place }) {
  const [map, setMap] = useState(false);
  const bbox = [
    p.longitude - 0.006,
    p.latitude - 0.004,
    p.longitude + 0.006,
    p.latitude + 0.004,
  ].join(",");
  return (
    <div className="map-panel">
      {map ? (
        <iframe
          title={`Map of ${p.name}`}
          loading="lazy"
          src={`https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${p.latitude},${p.longitude}`}
        />
      ) : (
        <>
          <MapPin size={28} strokeWidth={1} />
          <div>
            <h3>Put a place to the name.</h3>
            <p>
              Load an interactive OpenStreetMap. This connects to an external
              map service.
            </p>
          </div>
          <button className="button" onClick={() => setMap(true)}>
            Show map <ArrowRight size={14} />
          </button>
        </>
      )}
    </div>
  );
}
function ExplorePage({
  params,
  data,
  visible,
  renderPlace,
  renderCollection,
}: {
  params: URLSearchParams;
  data: Snapshot;
  visible: Collection[];
  renderPlace: (p: Place) => ReactNode;
  renderCollection: (c: Collection) => ReactNode;
}) {
  const [query, setQuery] = useState(params.get("q") || "");
  const [category, setCategory] = useState("All places");
  const [occasion, setOccasion] = useState(
    params.get("occasion") || "Any occasion",
  );
  const [locationFilter, setLocationFilter] = useState("Sydney");
  const [tab, setTab] = useState(params.get("tab") || "places");
  const matches = (text: string) =>
    query
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean)
      .every((w) => text.toLowerCase().includes(w));
  const foundPlaces = searchPlaces(
    data.places,
    query,
    category,
    occasion,
    locationFilter,
  );
  const foundCollections = visible.filter(
    (c) =>
      matches(`${c.name} ${c.description} ${c.occasion}`) &&
      (occasion === "Any occasion" || c.occasion === occasion) &&
      (category === "All places" ||
        collectionItems(data, c.id).some((i) =>
          data.places.some(
            (p) => p.id === i.place_id && p.category === category,
          ),
        )) &&
      (!locationFilter ||
        collectionItems(data, c.id).some((i) =>
          data.places.some(
            (p) =>
              p.id === i.place_id &&
              `${p.city} ${p.suburb}`
                .toLowerCase()
                .includes(locationFilter.toLowerCase()),
          ),
        )),
  );
  const foundPeople = data.profiles.filter(
    (p) =>
      matches(`${p.name} ${p.username} ${p.bio} ${p.city}`) &&
      (!locationFilter ||
        p.city.toLowerCase().includes(locationFilter.toLowerCase())),
  );
  return (
    <>
      <div className="page-intro">
        <p className="eyebrow">FOLLOW YOUR CURIOSITY</p>
        <h1>
          A world of <em>“let’s go.”</em>
        </h1>
        <p>Real places, thoughtful collections, and people with good taste.</p>
      </div>
      <form className="explore-search" onSubmit={(e) => e.preventDefault()}>
        <Search />
        <input
          aria-label="Search places, collections and people"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="A place, a neighbourhood, a kind of day…"
        />
        {query && (
          <button
            className="icon-button"
            aria-label="Clear search"
            onClick={() => setQuery("")}
            type="button"
          >
            <X size={18} />
          </button>
        )}
      </form>
      <div className="filters">
        <SlidersHorizontal size={17} />
        <label>
          <span>Where</span>
          <select
            aria-label="Filter by location"
            value={locationFilter}
            onChange={(e) => setLocationFilter(e.target.value)}
          >
            {[
              "Sydney",
              ...new Set(data.places.map((p) => p.suburb)),
              "Anywhere",
            ]
              .filter((s, i, a) => a.indexOf(s) === i)
              .map((s) => (
                <option value={s === "Anywhere" ? "" : s} key={s}>
                  {s}
                </option>
              ))}
          </select>
        </label>
        <label>
          <span>What</span>
          <select
            aria-label="Filter by category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label>
          <span>For</span>
          <select
            aria-label="Filter by occasion"
            value={occasion}
            onChange={(e) => setOccasion(e.target.value)}
          >
            {occasions.map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
        </label>
        <button
          className="text-link"
          type="button"
          onClick={() => {
            setQuery("");
            setCategory("All places");
            setOccasion("Any occasion");
            setLocationFilter("Sydney");
          }}
        >
          Reset
        </button>
      </div>
      <div className="tabs" role="tablist" aria-label="Explore results">
        {[
          ["places", foundPlaces.length],
          ["collections", foundCollections.length],
          ["people", foundPeople.length],
        ].map(([key, count]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(String(key))}
          >
            {String(key)} <span>{count}</span>
          </button>
        ))}
      </div>
      <p className="results-note">
        {tab === "people"
          ? "People search uses name, biography and city; category and occasion apply to places and collections."
          : "A curated starting point, not live availability. Check venue details before you go."}
      </p>
      {tab === "places" &&
        (foundPlaces.length ? (
          <div className="place-grid">{foundPlaces.map(renderPlace)}</div>
        ) : (
          <div className="empty">
            <Compass />
            <h2>Nothing here just yet.</h2>
            <p>Try another word, a wider area or a different occasion.</p>
          </div>
        ))}
      {tab === "collections" &&
        (foundCollections.length ? (
          <div className="collection-grid">
            {foundCollections.map(renderCollection)}
          </div>
        ) : (
          <div className="empty">
            <Compass />
            <h2>No collections match.</h2>
            <p>Clear a filter or try a different kind of day.</p>
          </div>
        ))}
      {tab === "people" && (
        <div className="people-grid">
          {foundPeople.length ? (
            foundPeople.map((p) => (
              <a className="person-card" href={`#/person/${p.id}`} key={p.id}>
                <Avatar name={p.name} avatar={p.avatar} />
                <h3>{p.name}</h3>
                <p>@{p.username}</p>
                <p>{p.bio}</p>
                <span className="pill">
                  {p.editorial ? "Editorial guide" : p.city}
                </span>
              </a>
            ))
          ) : (
            <div className="empty">
              <h2>No guides found.</h2>
              <p>Try a name, username or city.</p>
            </div>
          )}
        </div>
      )}
    </>
  );
}

function NoteEditor({
  note,
  save,
}: {
  note: string;
  save: (note: string) => Promise<void>;
}) {
  const [text, setText] = useState(note);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <form
      className="note-editor"
      onSubmit={(e) => {
        e.preventDefault();
        setBusy(true);
        save(text)
          .catch((e) => setError(errorText(e)))
          .finally(() => setBusy(false));
      }}
    >
      <label>
        <span>Your recommendation</span>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={400}
          placeholder="Why is this one worth a visit?"
          rows={2}
        />
      </label>
      {text !== note && (
        <button className="text-link" disabled={busy}>
          Save note
        </button>
      )}
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
function CollectionEditor({
  data,
  repo,
  userId,
  collection,
  close,
  save,
}: {
  data: Snapshot;
  repo: Repository;
  userId: string;
  collection?: Collection;
  close: () => void;
  save: (id: string, input: CollectionInput) => Promise<void>;
}) {
  const [input, setInput] = useState<CollectionInput>(
    collection || {
      name: "",
      description: "",
      occasion: "Places to try",
      visibility: "private",
      cover: `place:${data.places[0].id}`,
    },
  );
  const [pendingFile, setPendingFile] = useState<Blob | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      let valid = collectionInput(input);
      if (pendingFile)
        valid = { ...valid, cover: await repo.upload(pendingFile, userId) };
      await save(collection?.id || crypto.randomUUID(), valid);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={
        collection ? "Make it a little more you." : "A new little guidebook."
      }
      close={busy ? () => {} : close}
    >
      <form className="stack-form" onSubmit={submit}>
        <p className="subtle">
          For a kind of day, a favourite person, or just a feeling.
        </p>
        <label>
          Collection name
          <input
            autoFocus
            required
            maxLength={80}
            value={input.name}
            onChange={(e) => setInput({ ...input, name: e.target.value })}
            placeholder="e.g. Our next birthday dinner"
          />
        </label>
        <label>
          A little about it
          <textarea
            maxLength={600}
            rows={3}
            value={input.description}
            onChange={(e) =>
              setInput({ ...input, description: e.target.value })
            }
            placeholder="What makes these places belong together?"
          />
        </label>
        <label>
          Occasion
          <select
            value={input.occasion}
            onChange={(e) => setInput({ ...input, occasion: e.target.value })}
          >
            {occasions
              .filter((o) => o !== "Any occasion")
              .map((o) => (
                <option key={o}>{o}</option>
              ))}
          </select>
        </label>
        <fieldset>
          <legend>Make a cover</legend>
          <div className="cover-options">
            {data.places.slice(0, 8).map((p) => (
              <button
                type="button"
                key={p.id}
                aria-label={`Use ${p.name} as cover`}
                aria-pressed={!pendingFile && input.cover === `place:${p.id}`}
                onClick={() => {
                  setPendingFile(null);
                  setInput({ ...input, cover: `place:${p.id}` });
                }}
              >
                <Photo place={p} />
              </button>
            ))}
          </div>
          <label className="upload-button">
            <ImagePlus size={16} />
            {pendingFile
              ? "Photo selected — choose another"
              : "Or upload your own photo"}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={busy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setBusy(true);
                setError("");
                prepareImage(file)
                  .then((blob) => setPendingFile(blob))
                  .catch((e) => setError(errorText(e)))
                  .finally(() => setBusy(false));
              }}
            />
          </label>
          <small>
            JPG, PNG or WebP, up to 5 MB. Only upload photos you have permission
            to use.
          </small>
        </fieldset>
        <label>
          Who can see it?
          <select
            value={input.visibility}
            onChange={(e) =>
              setInput({
                ...input,
                visibility: e.target.value as "private" | "public",
              })
            }
          >
            <option value="private">Private — only me</option>
            <option value="public">
              {repo.mode === "demo"
                ? "Public — preview only in this local demo"
                : "Public — anyone with the link"}
            </option>
          </select>
        </label>
        {repo.mode === "demo" && (
          <p className="local-disclaimer">
            Both options stay on this device in demo mode. A connected backend
            is required to publish.
          </p>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="button primary wide" disabled={busy}>
          {busy ? "Saving…" : collection ? "Save changes" : "Create collection"}
          <ArrowRight size={16} />
        </button>
      </form>
    </Modal>
  );
}
function SaveDialog({
  place,
  data,
  mine,
  userId,
  close,
  save,
  create,
}: {
  place: Place;
  data: Snapshot;
  mine: Collection[];
  userId: string;
  close: () => void;
  save: (ids: string[], favourite: boolean) => Promise<void>;
  create: (name: string) => Promise<string>;
}) {
  const [ids, setIds] = useState(
    data.collection_places
      .filter(
        (p) =>
          p.place_id === place.id && mine.some((c) => c.id === p.collection_id),
      )
      .map((p) => p.collection_id),
  );
  const [favourite, setFavourite] = useState(
    data.saved_places.some(
      (s) => s.user_id === userId && s.place_id === place.id,
    ),
  );
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <Modal title="Keep this somewhere." close={busy ? () => {} : close}>
      <div className="save-place-preview">
        <Photo place={place} />
        <div>
          <h3>{place.name}</h3>
          <p>
            {place.suburb} · {place.category}
          </p>
        </div>
      </div>
      <p className="subtle">One place, as many little lists as you like.</p>
      <form
        className="stack-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            await save(ids, favourite);
          } catch (e) {
            setError(errorText(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="check-row">
          <Bookmark size={18} />
          <span>
            Saved for later<small>Your private, unorganised favourites</small>
          </span>
          <input
            type="checkbox"
            checked={favourite}
            onChange={(e) => setFavourite(e.target.checked)}
          />
        </label>
        {mine.map((c) => (
          <label className="check-row" key={c.id}>
            <FolderHeart size={18} />
            <span>
              {c.name}
              <small>{c.visibility === "private" ? "Private" : "Public"}</small>
            </span>
            <input
              type="checkbox"
              checked={ids.includes(c.id)}
              onChange={(e) =>
                setIds(
                  e.target.checked
                    ? [...ids, c.id]
                    : ids.filter((id) => id !== c.id),
                )
              }
            />
          </label>
        ))}
        <div className="inline-create">
          <label>
            <span>New private collection</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              placeholder="Give it a name"
            />
          </label>
          <button
            className="button"
            type="button"
            disabled={busy || !name.trim()}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                const id = await create(name);
                setIds((current) => [...current, id]);
                setName("");
              } catch (e) {
                setError(errorText(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            <Plus size={16} />
            Create
          </button>
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="button primary wide" disabled={busy}>
          {busy ? "Saving…" : "Save your choices"}
          <Check size={16} />
        </button>
      </form>
    </Modal>
  );
}
function ProfileEditor({
  profile,
  repo,
  close,
  save,
}: {
  profile: Profile;
  repo: Repository;
  close: () => void;
  save: (
    input: Pick<Profile, "name" | "username" | "bio" | "city" | "avatar">,
  ) => Promise<void>;
}) {
  const [input, setInput] = useState({
    name: profile.name,
    username: profile.username,
    bio: profile.bio,
    city: profile.city,
    avatar: profile.avatar,
  });
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <Modal title="Your little introduction." close={busy ? () => {} : close}>
      <form
        className="stack-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await save({
              ...input,
              avatar: photo
                ? await repo.upload(photo, profile.id)
                : input.avatar,
            });
          } catch (e) {
            setError(errorText(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Your name
          <input
            autoFocus
            required
            maxLength={60}
            value={input.name}
            onChange={(e) => setInput({ ...input, name: e.target.value })}
          />
        </label>
        <label>
          Username
          <input
            required
            minLength={3}
            maxLength={40}
            pattern="[a-z0-9._]{3,40}"
            value={input.username}
            onChange={(e) =>
              setInput({ ...input, username: e.target.value.toLowerCase() })
            }
            autoCapitalize="none"
            autoComplete="username"
          />
          <small>
            Letters, numbers, dots and underscores; 3–40 characters.
          </small>
        </label>
        <label>
          A little about you
          <textarea
            maxLength={300}
            value={input.bio}
            onChange={(e) => setInput({ ...input, bio: e.target.value })}
            rows={3}
          />
        </label>
        <label>
          Your city
          <input
            maxLength={80}
            value={input.city}
            onChange={(e) => setInput({ ...input, city: e.target.value })}
          />
        </label>
        <label className="upload-button">
          <ImagePlus size={16} />
          {photo ? "Profile photo selected" : "Choose a profile photo"}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setBusy(true);
              prepareImage(file)
                .then(setPhoto)
                .catch((e) => setError(errorText(e)))
                .finally(() => setBusy(false));
            }}
          />
        </label>
        <small>
          Your profile and picture are public in connected mode. JPG, PNG or
          WebP under 5 MB.
        </small>
        {(input.avatar || photo) && (
          <button
            className="text-link"
            type="button"
            onClick={() => {
              setInput({ ...input, avatar: "" });
              setPhoto(null);
            }}
          >
            Remove profile photo
          </button>
        )}
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <button className="button primary" disabled={busy}>
          {busy ? "Saving…" : "Save profile"}
        </button>
      </form>
    </Modal>
  );
}
function AuthDialog({
  cloud,
  userId,
  close,
  notify,
}: {
  cloud: boolean;
  userId: string | null;
  close: () => void;
  notify: (text: string) => void;
}) {
  const [mode, setMode] = useState<"signin" | "signup" | "reset" | "password">(
    "signin",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!cloud)
    return (
      <Modal title="Your guidebook, wherever you go." close={close}>
        <div className="prose">
          <p>
            Real accounts need a connected Supabase backend. This deployment is
            currently in local-demo mode; we won’t collect your email or pretend
            you’ve registered.
          </p>
          <p>
            You can explore, create collections, save places and try social
            interactions on this device. Your local changes are not visible to
            anyone else.
          </p>
          <a
            href="https://github.com/gracebilliris/somewhere#backend-setup"
            className="button primary"
            target="_blank"
            rel="noreferrer"
          >
            View backend setup <ExternalLink size={15} />
          </a>
          <button className="button wide" onClick={close}>
            Continue the local demo
          </button>
        </div>
      </Modal>
    );
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const fields = new FormData(e.currentTarget);
    const email = String(fields.get("email") || "");
    const password = String(fields.get("password") || "");
    try {
      if (!client) throw new Error("Backend configuration is missing.");
      const redirectTo = `${location.origin}${import.meta.env.BASE_URL}`;
      const result =
        mode === "signup"
          ? await client.auth.signUp({
              email,
              password,
              options: {
                emailRedirectTo: redirectTo,
                data: { app: "somewhere" },
              },
            })
          : mode === "reset"
            ? await client.auth.resetPasswordForEmail(email, { redirectTo })
            : mode === "password"
              ? await client.auth.updateUser({ password })
              : await client.auth.signInWithPassword({ email, password });
      if (result.error) throw result.error;
      notify(
        mode === "signup"
          ? "Check your email to confirm your account, then sign in."
          : mode === "reset"
            ? "If that account exists, a recovery email is on its way."
            : mode === "password"
              ? "Password updated."
              : "Welcome to your little guidebook.",
      );
      close();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={
        userId
          ? "Your account"
          : mode === "signup"
            ? "Make yourself at home."
            : mode === "reset"
              ? "A fresh way back in."
              : "Welcome back, explorer."
      }
      close={busy ? () => {} : close}
    >
      {userId && mode !== "password" ? (
        <div className="stack-form">
          <button className="button" onClick={() => setMode("password")}>
            Set a new password
          </button>
          <button
            className="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const result = await client!.auth.signOut();
              if (result.error) {
                setError(result.error.message);
                setBusy(false);
              } else close();
            }}
          >
            Sign out
          </button>
          {error && <p role="alert">{error}</p>}
        </div>
      ) : (
        <form className="stack-form" onSubmit={submit}>
          {mode !== "password" && (
            <label>
              Email
              <input
                autoFocus
                type="email"
                name="email"
                autoComplete="email"
                required
              />
            </label>
          )}
          {mode !== "reset" && (
            <label>
              {mode === "password" ? "New password" : "Password"}
              <input
                type="password"
                name="password"
                minLength={8}
                required
                autoComplete={
                  mode === "signin" ? "current-password" : "new-password"
                }
              />
            </label>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button className="button primary" disabled={busy}>
            {busy
              ? "Just a moment…"
              : mode === "signup"
                ? "Create account"
                : mode === "reset"
                  ? "Send recovery email"
                  : mode === "password"
                    ? "Update password"
                    : "Sign in"}
          </button>
          {mode !== "password" && (
            <div className="button-row">
              <button
                type="button"
                className="text-link"
                onClick={() => {
                  setMode(mode === "signup" ? "signin" : "signup");
                  setError("");
                }}
              >
                {mode === "signup"
                  ? "Already have an account? Sign in"
                  : "New here? Create an account"}
              </button>
              <button
                type="button"
                className="text-link"
                onClick={() => {
                  setMode("reset");
                  setError("");
                }}
              >
                Forgot password?
              </button>
            </div>
          )}
        </form>
      )}
    </Modal>
  );
}
