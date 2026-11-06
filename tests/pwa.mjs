import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const dist = resolve(
  fileURLToPath(new URL("../apps/web/dist/", import.meta.url)),
);
const prefix = "/somewhere/";
let version = 1;
let server;
let base = process.env.BASE_URL;
if (!base) {
  const types = {
    ".html": "text/html",
    ".js": "application/javascript",
    ".css": "text/css",
    ".json": "application/json",
    ".webmanifest": "application/manifest+json",
    ".png": "image/png",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
  };
  server = createServer(async (req, res) => {
    try {
      const pathname = new URL(req.url, "http://localhost").pathname;
      assert.ok(pathname.startsWith(prefix));
      const relative = decodeURIComponent(pathname.slice(prefix.length));
      const file = resolve(dist, relative || "index.html");
      assert.ok(file.startsWith(`${dist}${sep}`));
      let body = await readFile(file);
      if (relative === "sw.js")
        body = Buffer.concat([body, Buffer.from(`\n// PWA test ${version}\n`)]);
      const extension = file.slice(file.lastIndexOf("."));
      res.writeHead(200, {
        "Content-Type": types[extension] || "application/octet-stream",
        "Cache-Control": "no-store",
      });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end("Not found");
    }
  });
  await new Promise((ready) => server.listen(0, "127.0.0.1", ready));
  base = `http://127.0.0.1:${server.address().port}${prefix}`;
}
const baseUrl = new URL(base);
const browser = await chromium.launch();
await mkdir("artifacts/pwa", { recursive: true });
const check = async (name, run) => {
  await run();
  console.log(`PASS ${name}`);
};
try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(base, { waitUntil: "networkidle" });
  await check(
    "Scoped manifest, actual registered worker and home-screen icons",
    async () => {
      const manifestUrl = await page
        .locator('link[rel="manifest"]')
        .getAttribute("href");
      const manifest = await (
        await context.request.get(new URL(manifestUrl, base).href)
      ).json();
      assert.equal(manifest.start_url, baseUrl.pathname);
      assert.equal(manifest.scope, baseUrl.pathname);
      assert.equal(manifest.id, baseUrl.pathname);
      assert.equal(manifest.display, "standalone");
      assert.deepEqual(
        manifest.icons.map((icon) => icon.sizes),
        ["192x192", "512x512", "512x512"],
      );
      assert.equal(manifest.icons[2].purpose, "maskable");
      for (const icon of manifest.icons) {
        const response = await context.request.get(
          new URL(icon.src, base).href,
        );
        assert.equal(response.status(), 200);
        const png = await response.body();
        assert.equal(png.readUInt32BE(16), Number(icon.sizes.split("x")[0]));
        assert.equal(png.readUInt32BE(20), Number(icon.sizes.split("x")[1]));
      }
      const apple = await page
        .locator('link[rel="apple-touch-icon"]')
        .getAttribute("href");
      const applePng = await (
        await context.request.get(new URL(apple, base).href)
      ).body();
      assert.equal(applePng.readUInt32BE(16), 180);
      assert.equal(applePng.readUInt32BE(20), 180);
      const scope = await page.evaluate(
        async () => (await navigator.serviceWorker.ready).scope,
      );
      assert.equal(scope, base);
      await expect
        .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
        .toBe(true);
      await expect(page.locator(".pwa-banner")).toContainText("ready offline");
    },
  );
  await check("Installation guidance and mobile layout", async () => {
    await page
      .getByRole("button", { name: "Install app", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toContainText(
      "does not create an account",
    );
    await page.getByRole("button", { name: "Got it", exact: true }).click();
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      );
      await page.screenshot({
        path: `artifacts/pwa/home-${width}.png`,
        fullPage: true,
      });
    }
    const iphone = await browser.newContext({
      viewport: { width: 390, height: 844 },
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1",
    });
    const iosPage = await iphone.newPage();
    await iosPage.addInitScript(() => {
      window.addEventListener(
        "beforeinstallprompt",
        (event) => {
          event.preventDefault();
          event.stopImmediatePropagation();
        },
        { capture: true },
      );
    });
    await iosPage.goto(base, { waitUntil: "networkidle" });
    await iosPage
      .getByRole("button", { name: "Install app", exact: true })
      .click();
    const instructions = iosPage.getByRole("dialog");
    await expect(instructions).toContainText(
      "open Somewhere in Safari, tap Share, then Add to Home Screen",
    );
    await expect(instructions).toContainText("may use separate storage");
    await iphone.close();
  });
  let collectionUrl;
  await check(
    "Create online, reopen and edit a local collection offline",
    async () => {
      await page.goto(`${base}#/collections`);
      await page
        .locator("main")
        .getByRole("button", { name: "Create collection" })
        .click();
      let modal = page.getByRole("dialog");
      await modal.getByLabel("Collection name").fill("Offline weekend");
      await modal
        .getByLabel("A little about it")
        .fill("A guidebook that comes with me.");
      await modal
        .getByRole("button", { name: "Create collection", exact: true })
        .click();
      await expect(
        page.getByRole("heading", { name: "Offline weekend" }),
      ).toBeVisible();
      collectionUrl = page.url();
      await context.setOffline(true);
      await page.reload({ waitUntil: "networkidle" });
      await expect(
        page.getByRole("heading", { name: "Offline weekend" }),
      ).toBeVisible();
      await expect(page.locator(".pwa-status")).toContainText("You’re offline");
      await page
        .getByRole("button", { name: "Edit collection", exact: true })
        .click();
      modal = page.getByRole("dialog");
      await modal
        .getByLabel("Collection name")
        .fill("Offline weekend, updated");
      await modal
        .getByRole("button", { name: "Save changes", exact: true })
        .click();
      await expect(
        page.getByRole("heading", { name: "Offline weekend, updated" }),
      ).toBeVisible();
      await page.reload({ waitUntil: "networkidle" });
      await expect(
        page.getByRole("heading", { name: "Offline weekend, updated" }),
      ).toBeVisible();
      await expect(page.locator(".pwa-banner")).toContainText("ready offline");
    },
  );
  await check(
    "All 16 places and 32 real photos are usable offline, with persistent saves",
    async () => {
      const results = await page.evaluate(async (base) => {
        const seed = await (await fetch(`${base}data/seed.json`)).json();
        const photos = seed.places.flatMap((place) => [
          place.photo.src,
          place.photo.smallSrc,
        ]);
        const loaded = await Promise.all(
          photos.map(
            (src) =>
              new Promise((done) => {
                const image = new Image();
                image.onload = () => done(image.naturalWidth > 0);
                image.onerror = () => done(false);
                image.src = `${base}${src}`;
              }),
          ),
        );
        return {
          count: seed.places.length,
          photos: loaded.length,
          allLoaded: loaded.every(Boolean),
        };
      }, base);
      assert.deepEqual(results, { count: 16, photos: 32, allLoaded: true });
      await page.goto(`${base}#/place/20000000-0000-4000-8000-000000000001`);
      await expect(
        page.getByRole("heading", { name: "Spice Alley", exact: true }),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "Save to your guidebook", exact: true })
        .click();
      const modal = page.getByRole("dialog");
      await modal.getByLabel(/Saved for later/).check();
      await modal.getByLabel(/Offline weekend, updated/).check();
      await modal.getByRole("button", { name: "Save your choices" }).click();
      await expect(modal).toHaveCount(0);
      await page.goto(collectionUrl);
      await expect(page.locator(".stop")).toHaveCount(1);
      await page.reload({ waitUntil: "networkidle" });
      await expect(page.locator(".stop")).toHaveCount(1);
      const tab = await context.newPage();
      await tab.goto(collectionUrl, { waitUntil: "networkidle" });
      await expect(
        tab.getByRole("heading", { name: "Offline weekend, updated" }),
      ).toBeVisible();
      await expect(tab.locator(".stop")).toHaveCount(1);
      await tab.close();
    },
  );
  await check(
    "Only public app assets are cached and sibling apps are untouched",
    async () => {
      const cached = await page.evaluate(async () => {
        const names = await caches.keys();
        return Promise.all(
          names.map(async (name) => ({
            name,
            urls: (await (await caches.open(name)).keys()).map(
              (request) => request.url,
            ),
          })),
        );
      });
      assert.ok(cached.length > 0);
      for (const cache of cached) {
        assert.ok(cache.name.startsWith("somewhere-"));
        for (const url of cache.urls) assert.ok(url.startsWith(base));
      }
      assert.equal(
        await page.evaluate(
          async (base) =>
            !!(await navigator.serviceWorker.getRegistration(
              new URL("../brick-by-brick/", base).href,
            )),
          base,
        ),
        false,
      );
      await context.setOffline(false);
    },
  );
  if (server) {
    await check(
      "Real waiting-worker update never interrupts editing and retains saved data",
      async () => {
        await page.goto(collectionUrl);
        await page.getByRole("button", { name: "Edit collection" }).click();
        const modal = page.getByRole("dialog");
        await modal.getByLabel("Collection name").fill("An unsaved draft");
        await page.evaluate(async () => {
          const cache = await caches.open("sibling-app-test");
          await cache.put("/sibling-app-marker", new Response("keep this"));
        });
        version++;
        await page.evaluate(async () =>
          (await navigator.serviceWorker.ready).update(),
        );
        await expect(
          page.getByRole("button", { name: "Update app", exact: true }),
        ).toBeVisible({ timeout: 30000 });
        await expect(
          page.getByRole("button", { name: "Update app", exact: true }),
        ).toBeDisabled();
        await expect(modal.getByLabel("Collection name")).toHaveValue(
          "An unsaved draft",
        );
        await modal.getByRole("button", { name: "Save changes" }).click();
        await expect(
          page.getByRole("heading", { name: "An unsaved draft" }),
        ).toBeVisible();
        await page
          .getByRole("button", { name: "Update app", exact: true })
          .click();
        await page
          .getByRole("button", { name: "Keep editing", exact: true })
          .click();
        await expect(
          page.getByRole("heading", { name: "An unsaved draft" }),
        ).toBeVisible();
        await page
          .getByRole("button", { name: "Update app", exact: true })
          .click();
        await Promise.all([
          page.waitForEvent("load"),
          page
            .getByRole("button", { name: "Reload and update", exact: true })
            .click(),
        ]);
        await expect(
          page.getByRole("heading", { name: "An unsaved draft" }),
        ).toBeVisible();
        await expect(page.locator(".stop")).toHaveCount(1);
        await expect(
          page.getByRole("button", { name: "Update app", exact: true }),
        ).toHaveCount(0);
        assert.equal(
          await page.evaluate(async () => {
            const cache = await caches.open("sibling-app-test");
            return (await cache.match("/sibling-app-marker")).text();
          }),
          "keep this",
        );
      },
    );
  }
  assert.deepEqual(errors, []);
  await context.close();
} finally {
  await browser.close();
  if (server) await new Promise((done) => server.close(done));
}
