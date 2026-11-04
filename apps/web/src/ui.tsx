import { useEffect, useRef, useState, type ReactNode } from "react";
import { ImageOff, MapPin, X } from "lucide-react";
import type { Place, Snapshot } from "../../../packages/shared/model";
import { client } from "./repository";

export function Photo({
  place,
  eager = false,
  className = "",
}: {
  place: Place;
  eager?: boolean;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  return failed ? (
    <div className={`photo-fallback ${className}`}>
      <ImageOff />
      <span>{place.name}</span>
    </div>
  ) : (
    <img
      className={className}
      src={`${import.meta.env.BASE_URL}${place.photo.src}`}
      srcSet={`${import.meta.env.BASE_URL}${place.photo.smallSrc} 480w, ${import.meta.env.BASE_URL}${place.photo.src} 960w`}
      sizes="(max-width: 600px) 90vw, (max-width: 1100px) 45vw, 33vw"
      alt={place.photo.alt}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}
export function Cover({
  cover,
  data,
  className = "",
}: {
  cover: string;
  data: Snapshot;
  className?: string;
}) {
  const [src, setSrc] = useState("");
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    setFailed(false);
    setSrc("");
    if (/^data:image\/(jpeg|png|webp);base64,/.test(cover)) setSrc(cover);
    if (cover.startsWith("upload:") && client) {
      client.storage
        .from("somewhere-images")
        .createSignedUrl(cover.slice(7), 600)
        .then(({ data }) => {
          if (active && data) setSrc(data.signedUrl);
        });
    }
    return () => {
      active = false;
    };
  }, [cover]);
  const place = data.places.find((p) => `place:${p.id}` === cover);
  if (place)
    return <Photo key={place.id} place={place} className={className} />;
  return src && !failed ? (
    <img
      className={className}
      src={src}
      alt="Custom guidebook cover"
      onError={() => setFailed(true)}
    />
  ) : (
    <div className={`cover-placeholder ${className}`}>
      <MapPin size={42} strokeWidth={1} />
      <span>A few good places</span>
    </div>
  );
}
export function Modal({
  title,
  children,
  close,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const onClose = useRef(close);
  onClose.current = close;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = ref.current!;
    dialog.showModal();
    const cancel = (event: Event) => {
      event.preventDefault();
      onClose.current();
    };
    dialog.addEventListener("cancel", cancel);
    return () => {
      dialog.removeEventListener("cancel", cancel);
      dialog.close();
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal"
      aria-labelledby="modal-heading"
      onClick={(event) => {
        if (event.target === ref.current) close();
      }}
    >
      <div className="modal-inner">
        <div className="modal-heading">
          <h2 id="modal-heading">{title}</h2>
          <button
            className="icon-button"
            aria-label="Close dialog"
            onClick={close}
          >
            <X />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
export function Avatar({
  name,
  small = false,
  avatar = "",
}: {
  name: string;
  small?: boolean;
  avatar?: string;
}) {
  const [src, setSrc] = useState("");
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    setSrc("");
    setFailed(false);
    if (/^data:image\/(jpeg|png|webp);base64,/.test(avatar)) setSrc(avatar);
    if (avatar.startsWith("upload:") && client)
      client.storage
        .from("somewhere-images")
        .createSignedUrl(avatar.slice(7), 600)
        .then(({ data }) => {
          if (active && data) setSrc(data.signedUrl);
        });
    return () => {
      active = false;
    };
  }, [avatar]);
  return (
    <span aria-hidden="true" className={`avatar ${small ? "small" : ""}`}>
      {src && !failed ? (
        <img src={src} alt="" onError={() => setFailed(true)} />
      ) : (
        name
          .split(" ")
          .slice(0, 2)
          .map((s) => s[0])
          .join("")
      )}
    </span>
  );
}
