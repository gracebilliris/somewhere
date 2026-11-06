import { useEffect, useState } from "react";
import { Download, RefreshCw, WifiOff, X } from "lucide-react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { Modal } from "./ui";

interface InstallEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}
function isStandalone() {
  return (
    matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export default function PwaControls({
  localDemo,
  blocked,
}: {
  localDemo: boolean;
  blocked: boolean;
}) {
  const [installed, setInstalled] = useState(isStandalone);
  const [online, setOnline] = useState(navigator.onLine);
  const [installEvent, setInstallEvent] = useState<InstallEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [dialog, setDialog] = useState<"install" | "update" | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [cached, setCached] = useState(false);
  const {
    offlineReady: [offlineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    immediate: true,
    onRegisteredSW: (_url, registration) => {
      if (registration)
        void navigator.serviceWorker.ready.then(() => setCached(true));
    },
    onRegisterError: () =>
      setError(
        "Offline setup didn’t finish. Reopen online and try again; your saved guidebook is unchanged.",
      ),
  });
  const offlineAvailable = offlineReady || cached;
  useEffect(() => {
    const media = matchMedia("(display-mode: standalone)");
    const install = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as InstallEvent);
    };
    const complete = () => {
      setInstalled(true);
      setInstallEvent(null);
      setDialog(null);
    };
    const connection = () => setOnline(navigator.onLine);
    const display = () => setInstalled(isStandalone());
    window.addEventListener("beforeinstallprompt", install);
    window.addEventListener("appinstalled", complete);
    window.addEventListener("online", connection);
    window.addEventListener("offline", connection);
    media.addEventListener("change", display);
    return () => {
      window.removeEventListener("beforeinstallprompt", install);
      window.removeEventListener("appinstalled", complete);
      window.removeEventListener("online", connection);
      window.removeEventListener("offline", connection);
      media.removeEventListener("change", display);
    };
  }, []);
  const iphone =
    /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return (
    <>
      {!online && (
        <div className="pwa-status" role="status">
          <WifiOff size={16} />
          <span>
            {localDemo
              ? "You’re offline. Local guidebooks still work; maps and external websites need internet."
              : "You’re offline. Shared accounts need internet; private backend responses are not cached."}
          </span>
        </div>
      )}
      {needRefresh && (
        <div className="pwa-banner update-banner">
          <RefreshCw size={20} />
          <div>
            <strong>A fresh version is ready.</strong>
            <p>
              Update when you’ve finished editing. Saved guidebooks are kept.
            </p>
          </div>
          <div className="pwa-actions">
            <button
              className="button"
              disabled={blocked}
              onClick={() => setDialog("update")}
            >
              Update app
            </button>
            <button className="text-link" onClick={() => setNeedRefresh(false)}>
              Later
            </button>
          </div>
        </div>
      )}
      {!installed && !dismissed && (
        <div className="pwa-banner">
          <Download size={20} />
          <div>
            <strong>Keep your Somewhere close.</strong>
            <p>
              {localDemo && offlineAvailable
                ? "The Sydney guide is ready offline. Add it to your home screen."
                : "Add to your home screen. Open online once to set up the offline guide."}
            </p>
          </div>
          <div className="pwa-actions">
            <button
              className="button"
              disabled={blocked}
              onClick={() => setDialog("install")}
            >
              Install app
            </button>
            <button
              className="icon-button"
              aria-label="Dismiss installation suggestion"
              onClick={() => setDismissed(true)}
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}
      {error && (
        <p className="pwa-status" role="status">
          {error}
        </p>
      )}
      {dialog === "install" && (
        <Modal title="A little home-screen home." close={() => setDialog(null)}>
          <div className="prose">
            <p>
              Somewhere can open in its own app window, without the browser
              tabs. No App Store download is needed.
            </p>
            {installEvent ? (
              <button
                className="button primary wide"
                disabled={working}
                onClick={async () => {
                  const event = installEvent;
                  setWorking(true);
                  try {
                    await event.prompt();
                    await event.userChoice;
                    setInstallEvent(null);
                    setDialog(null);
                  } catch {
                    setError(
                      "Your browser couldn’t open the installer. Try its menu or the instructions below.",
                    );
                  } finally {
                    setWorking(false);
                  }
                }}
              >
                Install Somewhere <Download size={16} />
              </button>
            ) : (
              <p>
                {iphone
                  ? "On iPhone or iPad: open Somewhere in Safari, tap Share, then Add to Home Screen. Enable “Open as Web App” if shown, then tap Add."
                  : "In Chrome or Edge, look for the install icon in the address bar or “Install app” in the browser menu. On Android, the menu may say “Add to Home screen”. On iPhone, use Safari → Share → Add to Home Screen."}
              </p>
            )}
            <h3>A little about offline use</h3>
            <p>
              {localDemo
                ? offlineAvailable
                  ? "Offline setup is complete. The app, Sydney place photos and your local collections can reopen without internet."
                  : "Keep this page open online until offline setup finishes. The first visit needs internet."
                : "The app shell and editorial guide can be cached, but cloud accounts and private data still require internet. This is not offline cloud syncing."}
            </p>
            <p>
              Installation does not create an account or turn on syncing. Local
              demo data remains on this device and can be lost if browser or app
              storage is cleared. Download a guidebook backup from About before
              clearing anything. Maps and external websites always need
              internet.
            </p>
            {iphone && (
              <p>
                Safari and the installed iPhone app may use separate storage.
                Install before building your main guidebook, or keep a backup of
                existing browser data.
              </p>
            )}
            <button className="button wide" onClick={() => setDialog(null)}>
              Got it
            </button>
          </div>
        </Modal>
      )}
      {dialog === "update" && (
        <Modal title="Ready for a fresh page?" close={() => setDialog(null)}>
          <div className="prose">
            <p>
              The app will reload to apply the update. Saved collections and
              favourites are kept, but any unsaved text will be lost.
            </p>
            <div className="button-row">
              <button className="button" onClick={() => setDialog(null)}>
                Keep editing
              </button>
              <button
                className="button primary"
                disabled={working || blocked}
                onClick={async () => {
                  setWorking(true);
                  try {
                    await updateServiceWorker(true);
                  } catch {
                    setError(
                      "The update could not finish. Reconnect and try again.",
                    );
                    setDialog(null);
                  } finally {
                    setWorking(false);
                  }
                }}
              >
                Reload and update
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
