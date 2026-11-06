import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";

const base = process.env.BASE_URL || "http://127.0.0.1:5186/somewhere/";
await mkdir("artifacts", { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];
const check = async (label, run) => {
  await run();
  results.push(label);
  console.log(`PASS ${label}`);
};
try {
  const context = await browser.newContext({
    // Offline caching has its own suite; route-abort fault injection must reach the network.
    serviceWorkers: "block",
    viewport: { width: 1440, height: 1000 },
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const page = await context.newPage();
  const errors = [];
  const backendRequests = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (request) => {
    if (new URL(request.url()).hostname.endsWith(".supabase.co"))
      backendRequests.push(request.url());
  });
  const visit = async (route) => {
    await page.goto(`${base}#${route}`, { waitUntil: "networkidle" });
    await expect(page.locator("main")).toBeVisible();
  };
  await visit("/");
  await check(
    "Honest local demo, real loaded photos and non-functional-cloud signup protection",
    async () => {
      await expect(page.locator(".demo-banner")).toContainText("Local demo");
      assert.deepEqual(
        backendRequests,
        [],
        "The approved local demo must not contact Supabase",
      );
      await page.locator(".account-button").click();
      await expect(page.getByRole("dialog")).toContainText(
        "we won’t collect your email",
      );
      await expect(
        page.getByRole("dialog").locator("input[type=email]"),
      ).toHaveCount(0);
      await page
        .getByRole("button", { name: "Continue the local demo" })
        .click();
      await page.screenshot({
        path: "artifacts/home-desktop.png",
        fullPage: true,
      });
    },
  );
  let firstId, secondId;
  await check(
    "Create a private collection with photo cover and descriptive occasion",
    async () => {
      await visit("/collections");
      await page
        .locator("main")
        .getByRole("button", { name: "Create collection" })
        .click();
      const modal = page.getByRole("dialog");
      await modal.getByLabel("Collection name").fill("Birthday with my people");
      await modal
        .getByLabel("A little about it")
        .fill("Somewhere relaxed for the whole table.");
      await modal
        .getByRole("combobox", { name: "Occasion", exact: true })
        .selectOption("Birthday dinner");
      await modal
        .getByRole("button", { name: "Use Darling Square as cover" })
        .click();
      await modal
        .getByRole("button", { name: "Create collection", exact: true })
        .click();
      await expect(
        page.getByRole("heading", { name: "Birthday with my people" }),
      ).toBeVisible();
      firstId = page.url().split("/collection/")[1];
      await expect(page.locator(".collection-detail")).toContainText(
        "Private · only you",
      );
    },
  );
  await check(
    "Discover a birthday venue and create another collection while saving to both",
    async () => {
      await visit("/explore?occasion=Birthday%20dinner");
      await expect(page.getByLabel("Filter by occasion")).toHaveValue(
        "Birthday dinner",
      );
      await page
        .getByLabel("Search places, collections and people")
        .fill("spice");
      await expect(page.locator(".place-card")).toHaveCount(1);
      await page
        .getByRole("link", { name: "Spice Alley", exact: true })
        .click();
      await expect(
        page.getByRole("heading", { name: "Spice Alley", exact: true }),
      ).toBeVisible();
      await expect(page.locator(".place-portrait img")).toBeVisible();
      await page
        .getByRole("button", { name: "Save to your guidebook" })
        .click();
      const modal = page.getByRole("dialog");
      await modal.getByLabel(/Saved for later/).check();
      await modal.getByLabel(/Birthday with my people/).check();
      await modal.getByLabel("New private collection").fill("Friday shortlist");
      await modal.getByRole("button", { name: "Create", exact: true }).click();
      await expect(modal.getByLabel(/Friday shortlist/)).toBeChecked();
      await modal.getByRole("button", { name: "Save your choices" }).click();
      await expect(modal).toHaveCount(0);
      await visit("/collections");
      await expect(page.locator(".collection-card")).toHaveCount(2);
      await page
        .locator("main")
        .getByRole("link", { name: "Friday shortlist", exact: true })
        .click();
      secondId = page.url().split("/collection/")[1];
      await expect(page.locator(".stop")).toHaveCount(1);
    },
  );
  await check(
    "Save another place, reorder stops, add a recommendation and retain data after reload",
    async () => {
      await visit("/explore");
      await page
        .getByRole("button", { name: "Save Opera Bar", exact: true })
        .click();
      const modal = page.getByRole("dialog");
      await modal.getByLabel(/Birthday with my people/).check();
      await modal.getByRole("button", { name: "Save your choices" }).click();
      await visit(`/collection/${firstId}`);
      await expect(page.locator(".stop")).toHaveCount(2);
      await page.getByRole("button", { name: "Move Opera Bar up" }).click();
      await expect(page.locator(".stop").first()).toContainText("Opera Bar");
      await page
        .locator(".stop")
        .first()
        .getByLabel("Your recommendation")
        .fill("Ask the group about a sunset drink.");
      await page
        .locator(".stop")
        .first()
        .getByRole("button", { name: "Save note" })
        .click();
      await expect(page.locator(".toast[role=status]")).toContainText(
        "Recommendation saved.",
      );
      await page.reload({ waitUntil: "networkidle" });
      await expect(page.locator(".stop").first()).toContainText("Opera Bar");
      await expect(
        page.locator(".stop").first().getByLabel("Your recommendation"),
      ).toHaveValue("Ask the group about a sunset drink.");
      await page.screenshot({
        path: "artifacts/collection-desktop.png",
        fullPage: true,
      });
    },
  );
  await check(
    "Edit metadata, upload a cover, and refuse misleading local-public sharing",
    async () => {
      await page.getByRole("button", { name: "Edit collection" }).click();
      const modal = page.getByRole("dialog");
      await modal
        .getByLabel("Collection name")
        .fill("Birthday shortlist, sorted");
      await modal
        .getByRole("combobox", { name: "Who can see it?", exact: true })
        .selectOption("public");
      await modal
        .locator("input[type=file]")
        .setInputFiles("apps/web/public/photos/opera-bar-480.webp");
      await expect(modal.locator(".upload-button")).toContainText(
        "Photo selected",
      );
      await modal.getByRole("button", { name: "Save changes" }).click();
      await expect(
        page.getByRole("heading", { name: "Birthday shortlist, sorted" }),
      ).toBeVisible();
      await expect(page.locator(".detail-cover img")).toHaveAttribute(
        "src",
        /^data:image\/jpeg/,
      );
      await page.getByRole("button", { name: "Share", exact: true }).click();
      await expect(page.locator(".toast[role=status]")).toContainText(
        "local to your device",
      );
      await page.reload({ waitUntil: "networkidle" });
      await expect(page.locator(".detail-cover img")).toHaveAttribute(
        "src",
        /^data:image\/jpeg/,
      );
    },
  );
  await check(
    "Explore editorial collections, like/unlike, follow/unfollow and share real seed links",
    async () => {
      await visit("/collection/40000000-0000-4000-8000-000000000001");
      await page
        .getByRole("button", { name: "Like collection", exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: "Liked", exact: true }),
      ).toHaveAttribute("aria-pressed", "true");
      await page.getByRole("button", { name: "Share", exact: true }).click();
      await expect
        .poll(() => page.evaluate(() => navigator.clipboard.readText()))
        .toContain("#/collection/40000000-0000-4000-8000-000000000001");
      await page
        .getByRole("link", { name: /Curated by Table for Everyone/ })
        .click();
      await page
        .getByRole("button", { name: "Follow guide", exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: "Following", exact: true }),
      ).toBeVisible();
      await visit("/");
      await expect(
        page.getByRole("heading", { name: "From the guides you follow" }),
      ).toBeVisible();
      await visit("/person/30000000-0000-4000-8000-000000000002");
      await page
        .getByRole("button", { name: "Following", exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: "Follow guide", exact: true }),
      ).toBeVisible();
      await visit("/profile");
      await expect(
        page.getByRole("heading", { name: "Collections you’ve liked" }),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "Unlike A little after-hours magic" })
        .click();
      await expect(page.locator("main")).toContainText("Tap a heart");
    },
  );
  await check(
    "Search people and categories; saving retains active filters and keyboard focus",
    async () => {
      await visit("/explore");
      await page.locator(".skip-link").focus();
      await page.keyboard.press("Enter");
      await expect(page.locator("main")).toBeFocused();
      assert.equal(new URL(page.url()).hash, "#/explore");
      const search = page.getByLabel("Search places, collections and people");
      await search.fill("Table");
      await page.getByRole("tab", { name: /people/i }).click();
      await expect(page.locator(".person-card")).toHaveCount(1);
      await page.getByRole("button", { name: "Reset", exact: true }).click();
      await page.getByRole("tab", { name: /places/i }).click();
      await page.getByLabel("Filter by category").selectOption("Bars");
      await expect(page.locator(".place-card")).toHaveCount(1);
      await page.getByRole("button", { name: "Save Opera Bar" }).click();
      await page.getByRole("button", { name: "Close dialog" }).click();
      await expect(page.getByLabel("Filter by category")).toHaveValue("Bars");
      await expect(
        page.getByRole("button", { name: "Save Opera Bar" }),
      ).toBeFocused();
      await search.fill("this place does not exist");
      await expect(
        page.getByRole("heading", { name: "Nothing here just yet." }),
      ).toBeVisible();
    },
  );
  await check(
    "Edit profile, remove one collection membership and confirm deletion without losing favourites",
    async () => {
      await visit("/profile");
      await page.getByRole("button", { name: "Edit profile" }).click();
      await page
        .getByLabel("Your name", { exact: true })
        .fill("Weekend explorer");
      await page
        .getByRole("textbox", { name: /Username/ })
        .fill("weekend.explorer");
      await page
        .getByLabel("A little about you")
        .fill("Always up for a harbour walk.");
      await page
        .getByRole("dialog")
        .locator("input[type=file]")
        .setInputFiles("apps/web/public/photos/opera-bar-480.webp");
      await expect(
        page.getByRole("dialog").locator(".upload-button"),
      ).toContainText("Profile photo selected");
      await page
        .getByRole("button", { name: "Save profile", exact: true })
        .click();
      await expect(
        page.getByRole("heading", { name: "Weekend explorer" }),
      ).toBeVisible();
      await expect(page.locator(".profile-header .avatar img")).toBeVisible();
      await expect(page.locator(".profile-header")).toContainText(
        "@weekend.explorer",
      );
      await visit(`/collection/${secondId}`);
      await page
        .getByRole("button", {
          name: "Remove Spice Alley from this collection",
        })
        .click();
      await expect(page.locator(".stop")).toHaveCount(0);
      await page
        .getByRole("button", { name: "Delete collection", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Keep collection", exact: true })
        .click();
      await expect(
        page.getByRole("heading", { name: "Friday shortlist" }),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "Delete collection", exact: true })
        .click();
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Delete collection", exact: true })
        .click();
      await expect(page.locator(".collection-card")).toHaveCount(1);
      await visit("/saved");
      await expect(page.locator(".place-card")).toHaveCount(2);
      await page.reload({ waitUntil: "networkidle" });
      await expect(page.locator(".place-card")).toHaveCount(2);
    },
  );
  await check(
    "Anonymous deep links omit another browser’s local collections",
    async () => {
      const other = await browser.newContext();
      const visitor = await other.newPage();
      await visitor.goto(`${base}#/collection/${firstId}`, {
        waitUntil: "networkidle",
      });
      await expect(
        visitor.getByRole("heading", {
          name: "This collection isn’t available.",
        }),
      ).toBeVisible();
      await visitor.goto(
        `${base}#/collection/40000000-0000-4000-8000-000000000001`,
        { waitUntil: "networkidle" },
      );
      await expect(
        visitor.getByRole("heading", { name: "A little after-hours magic" }),
      ).toBeVisible();
      await other.close();
    },
  );
  await check(
    "Responsive pages at 320, 390, 768 and 1440px with no horizontal overflow or broken photos",
    async () => {
      for (const width of [320, 390, 768, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        for (const route of [
          "/",
          "/explore",
          `/collection/${firstId}`,
          "/place/20000000-0000-4000-8000-000000000001",
          "/profile",
        ]) {
          await visit(route);
          assert.equal(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
            true,
            `${route} overflows at ${width}`,
          );
          for (const img of await page.locator("main img").all())
            await img.scrollIntoViewIfNeeded();
          await expect
            .poll(() =>
              page
                .locator("main img")
                .evaluateAll((imgs) =>
                  imgs.every((i) => i.complete && i.naturalWidth > 0),
                ),
            )
            .toBe(true);
          if (width === 390 || width === 1440)
            await page.screenshot({
              path: `artifacts/${route === "/" ? "home" : route.split("/")[1]}-${width}.png`,
              fullPage: true,
            });
        }
      }
    },
  );
  await check(
    "Missing routes and image failures recover; complete credits and private backup are available",
    async () => {
      await visit("/not-a-page");
      await expect(
        page.getByRole("heading", { name: "Let’s find another way." }),
      ).toBeVisible();
      await page.route("**/photos/spice-alley*", (route) => route.abort());
      await visit("/place/20000000-0000-4000-8000-000000000001");
      await expect(page.locator(".place-portrait .photo-fallback")).toHaveCount(
        1,
      );
      await page
        .getByRole("button", {
          name: "About, privacy & photo credits",
          exact: true,
        })
        .click();
      await expect(page.locator(".credit-row")).toHaveCount(16);
      const download = page.waitForEvent("download");
      await page
        .getByRole("button", { name: "Download your guidebook backup" })
        .click();
      assert.equal(
        (await download).suggestedFilename(),
        "somewhere-guidebook.json",
      );
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toHaveCount(0);
      assert.deepEqual(errors, []);
    },
  );
  await writeFile(
    "artifacts/browser-results.json",
    JSON.stringify({ base, results, errors, passed: true }, null, 2),
  );
  console.log(`Verified ${results.length} complete browser checks at ${base}`);
} finally {
  await browser.close();
}
