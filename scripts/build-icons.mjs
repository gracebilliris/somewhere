import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const output = resolve(import.meta.dirname, "../apps/web/public/icons");
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  for (const [name, size, maskable] of [
    ["icon-192.png", 192, false],
    ["icon-512.png", 512, false],
    ["icon-maskable-512.png", 512, true],
    ["apple-touch-icon.png", 180, false],
  ]) {
    const encoded = await page.evaluate(
      ({ size, maskable }) => {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = size;
        const context = canvas.getContext("2d");
        context.fillStyle = "#435b48";
        context.fillRect(0, 0, size, size);
        const scale = (size / 64) * (maskable ? 0.72 : 0.88);
        context.translate(size / 2, size / 2);
        context.scale(scale, scale);
        context.translate(-32, -32);
        context.fillStyle = "#f3eddb";
        context.fill(
          new Path2D(
            "M32 13c-12 0-19 8-19 17 0 13 19 24 19 24s19-11 19-24c0-9-7-17-19-17Z",
          ),
        );
        context.fillStyle = "#435b48";
        context.beginPath();
        context.arc(32, 30, 7, 0, Math.PI * 2);
        context.fill();
        return canvas.toDataURL("image/png").split(",")[1];
      },
      { size, maskable },
    );
    await writeFile(resolve(output, name), Buffer.from(encoded, "base64"));
  }
} finally {
  await browser.close();
}
console.log("Generated install, maskable and iPhone home-screen icons.");
