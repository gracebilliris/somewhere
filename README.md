# Somewhere

**Good places, good company.** A mobile-first personal guidebook for discovering real places, organising them into collections, and finding inspiration in other people's tastes.

Web: https://gracebilliris.github.io/somewhere/

## What works

- Editorial Home, searchable Explore, personal collections, saved places and public profiles.
- Collection creation, editing, covers, custom ordering, recommendation notes and confirmed deletion.
- Save one place into multiple collections and independently into private favourites.
- Follow/unfollow guides; like/unlike collections; share published public collections using native sharing or clipboard.
- Six collections from three explicitly labelled editorial guides, and 16 real Sydney places with local, credited photographs.
- Location, category and occasion filters, place details, official websites, directions and opt-in OpenStreetMap.
- Persistent IndexedDB local demo; Supabase email/password registration, sign-in, email confirmation, recovery, profiles, relational data and private image storage when connected.
- Installable PWA with iPhone home-screen icons, offline app/photographs/seed data, and a confirmed update flow that preserves saved guidebooks.
- Private-by-default collections, backend-enforced ownership and access policies, keyboard-accessible dialogs, responsive navigation and empty/error/loading states.

## Current deployment status

The existing Caffeine Committee Supabase public configuration was located, but its project host did not resolve during development. A public key cannot install database tables. This release intentionally runs as a **local demo** (`DATA_MODE=demo` in GitHub Actions variables), with no requests to the unavailable backend.

The demo is not real authentication or a multi-user social service. All changes remain in this browser's IndexedDB. Public visibility previews do not publish local collections. Sharing your own local collection is deliberately blocked rather than generating a misleading link. Editorial collection links can be shared because they exist in the seed on every installation. Follows, likes and recommendations are not fabricated community activity.

Do not store sensitive information in demo data. Clearing browser site data removes it; “About, privacy & photo credits” lets you download your guidebook as JSON. Local data is not automatically migrated into cloud accounts. Image credits and details of external services are available in the same dialog.

## Local development

Requires Node 22.12+ and npm.

```sh
npm ci
cp .env.example .env
# Configure only the public project URL and publishable/anon key if available.
npm run dev
# http://127.0.0.1:5186/somewhere/
```

```sh
npm test
npm run build
npm run preview -- --port 5187
# http://127.0.0.1:5187/somewhere/
BASE_URL=http://127.0.0.1:5187/somewhere/ npm run test:browser
```

Hash routes work on refresh and in shared links under GitHub Pages without server rewrites. Photos, seed data and JavaScript are served from the configured repository base path.

## Install on your phone

Open https://gracebilliris.github.io/somewhere/ online first and let offline setup finish.

- **iPhone/iPad:** open in Safari, tap **Share → Add to Home Screen**, enable **Open as Web App** if shown, then **Add**. Launch Somewhere from the new icon.
- **Android/desktop Chrome or Edge:** use **Install app** in Somewhere if the browser offers an installer, or the browser's install icon/menu. Installation availability depends on the browser.

The app opens in a standalone window. The app shell, all 16 Sydney places, their local photos and the seed are precached. In local-demo mode you can reopen it offline, browse places, create/edit collections and save favourites. Maps, external websites, cloud accounts and sharing to external services still need internet. Installation is not an App Store release and does not enable accounts or syncing.

Local data may not carry across automatically from Safari tabs into an iPhone home-screen installation, depending on iOS/browser storage behaviour. Install first before building your main guidebook; keep a JSON backup of existing browser data. The app does not promise permanent device storage. Clearing browser/app data or removing the installation may remove local guidebooks.

Updates show a prompt instead of silently reloading while you edit. Confirming an update reloads the app; saved IndexedDB data is preserved, but unsaved text is not. The service worker and caches are restricted to `/somewhere/` and do not cache Supabase/authentication responses, other apps, maps or external websites.

PWA behaviour is tested against production assets, not the Vite development server:

```sh
npm run build
npm run test:pwa
# Starts a temporary local static server and checks offline/update behaviour.
# To check the deployed site (without the local simulated update):
BASE_URL=https://gracebilliris.github.io/somewhere/ npm run test:pwa
```

Icons can be regenerated with `node scripts/build-icons.mjs`.

Workbox's build-only `glob` and `deepmerge` dependencies have scoped/package overrides to avoid upstream dependency advisories. Recheck these overrides when updating Workbox.

## Backend setup

Use the existing project or a new Supabase project. Do not put service-role keys, database passwords or management access tokens in frontend code or GitHub variables.

1. Make sure the project is active and its URL is reachable.
2. In **SQL Editor**, run `supabase/migrations/202611040001_somewhere.sql` once, then `supabase/seed.sql`. Only `somewhere_*` application tables, namespaced functions and a `somewhere-images` bucket are added. Existing Caffeine Committee tables and policies are not changed.
3. Keep the Email authentication provider enabled. Configure the production and local **additional redirect URLs**:
   - `https://gracebilliris.github.io/somewhere/`
   - `http://127.0.0.1:5186/somewhere/`
   - `http://127.0.0.1:5187/somewhere/`
     Avoid replacing an existing shared project's Site URL without considering its other apps.
4. Configure production email delivery and appropriate signup rate limits in Supabase before a public launch. Default email limits are not suitable for a large consumer service.
5. Set GitHub repository **Actions variables** `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`, then change `DATA_MODE` from `demo` to `auto`. The URL and publishable key are intentionally public client configuration. For local development set the corresponding `VITE_` variables in root `.env`. Use `VITE_DATA_MODE=demo` to force a fast, disconnected local demo even when public credentials are present.
6. Push to `main` or run **Deploy Somewhere**. Verify that the local-demo banner is absent, then register two test users and check cross-device public sharing, follows, private collection isolation and image permissions.

Authentication uses a namespaced session key, avoiding interference with other apps on the same GitHub Pages origin. Accounts already registered with the shared Supabase project can sign in; the `somewhere_ensure_profile` function creates only their Somewhere profile without altering their other data.

Database policies protect private collections, their place lists, favourites and uploaded covers. Profile biographies and social follows are public. No email addresses are stored in public profiles. Editorial profiles are not authentication users. Uploaded images are re-encoded as JPEG (removing original metadata), capped at 1600px and stored in an owner-scoped private bucket. Reading a private image requires ownership; public collection/profile images can be read through their published reference. Previously issued signed image URLs can remain valid for up to ten minutes after a visibility change.

## Architecture and iOS path

```text
apps/web/            Vite + React + TypeScript + Tailwind, static output
packages/shared/     Platform-independent types, validation, search and demo transactions
supabase/            PostgreSQL schema, RLS, atomic save/reorder RPCs, seed
content/photos.json  Image provenance and licences
scripts/             Repeatable seed generation
tests/               Business rules, SQL policies and browser journeys
```

`repository.ts` isolates persistence from the UI. Cloud operations use the Supabase SDK; the local adapter applies the same domain rules within IndexedDB read/write transactions. Cloud errors never silently redirect signed-in writes into a local store. Saves across collections and reordering are transactional RPCs. The initial client loads up to 1000 visible rows per entity; replace this bounded starter loader with paginated server-side queries as the catalogue grows.

A future Expo app can reuse `packages/shared`, the database, RLS, authentication and storage. Implement native navigation, secure session storage, permissions, camera/photo picker and sharing adapters separately; do not reuse DOM components as native UI. No iOS app, push notifications, live events feed, booking system or live places API is claimed in this release.

## Deployment

Set repository Pages source to **GitHub Actions**. The workflow installs locked dependencies, runs tests, builds with the repository base path, and deploys `apps/web/dist`. GitHub Pages hosts only static assets; Supabase remains the external backend. No SSR or service-role credentials are needed.

## Content

`content/photos.json` records authors, original Wikimedia Commons sources and individual licences. Photographs show the actual named places, not unrelated stock imagery. They are resized/WebP-compressed and cropped in the interface. Preserve the credit links and relevant licence terms when reusing the images. Descriptions are original editorial guidance, not live opening hours, current prices or user reviews.

The web seed and SQL seed are generated together:

```sh
node scripts/build-seed.mjs
```

Changing the seed does not overwrite existing local demo data or already-installed database records. For production catalogue updates, use a deliberate new database migration; do not clear user data.
