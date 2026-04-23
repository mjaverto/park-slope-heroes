#!/usr/bin/env node
// Background generation tool for Park Slope Heroes.
// Uses Shopify's LLM proxy (proxy.shopify.ai) with OpenAI-compatible
// image generation (`/v1/images/generations`, model `openai:gpt-image-1`).
//
// Generates three 1536x1024 horizontal tiles that stitch into a
// ~4608x1024 side-scrolling 5th Ave Park Slope backdrop for Stage 1.
//
// Usage:
//   node tools/generate-backgrounds.js              # generate all three tiles
//   node tools/generate-backgrounds.js stage1-tile1 # single tile
//
// Output: assets/backgrounds/<tile>.png

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const backgroundsDir = path.join(projectRoot, "assets", "backgrounds");

const ENDPOINT = "https://proxy.shopify.ai/v1/images/generations";
const MODEL = "openai:gpt-image-1";
const SIZE = "1536x1024";

// --- Shared style & composition anchors -------------------------------------
// These strings are repeated verbatim across every tile so the three panels
// share palette, lighting, horizon, and art direction and therefore seam
// cleanly when laid side-by-side for horizontal scrolling.

const STYLE_ANCHOR =
  "2D pixel-art painterly background, 16-bit SNES arcade beat-em-up aesthetic, " +
  "Teenage Mutant Ninja Turtles: Turtles in Time (Konami SNES) reference, rich " +
  "saturated colors, chunky pixels, clean outlines, late afternoon golden-hour " +
  "lighting, warm orange sunlight raking across brick facades, soft blue sky " +
  "with a few pink-tinted clouds.";

const COMPOSITION_ANCHOR =
  "Strict side-on flat parallax view (NOT isometric, NOT top-down, NOT 3/4). The " +
  "camera is a side-scroller camera, perfectly perpendicular to the street. The " +
  "LOWER 40% of the canvas is a flat horizontal NYC concrete sidewalk plus street " +
  "curb that runs edge-to-edge at the same Y position. The horizon line sits " +
  "exactly 40% up from the bottom of the canvas. The UPPER 60% is building " +
  "facades and sky. No foreground objects cross below the bottom edge. No " +
  "vignettes, no frame, no border, no text anywhere in the image, no signage " +
  "lettering except where explicitly allowed. No people, no characters, no rats, " +
  "no pedestrians, no cars, no bicycles, no animals. Empty street ready for game " +
  "sprites to be composited on top.";

const SEAM_ANCHOR =
  "CRITICAL: the left and right edges of the image must be clean vertical cuts " +
  "at the same horizon height so this panel can be placed adjacent to other " +
  "panels of the same series and tile seamlessly. Do not place important focal " +
  "subjects touching the left or right edges.";

function bgPrompt(tileDescription) {
  return `${tileDescription} ${COMPOSITION_ANCHOR} ${STYLE_ANCHOR} ${SEAM_ANCHOR}`;
}

// --- Tile registry ----------------------------------------------------------

const TILES = {
  "stage1-tile1": {
    prompt: bgPrompt(
      "Park Slope Brooklyn 5th Avenue sidewalk, TILE 1 of 3 (bodega corner). " +
        "A small NYC corner bodega occupies the left-center of the upper half, " +
        "with a brightly striped red-yellow-green awning above large storefront " +
        "windows, stacked produce crates on the sidewalk under the awning, a " +
        "cluster of colorful newspaper vending boxes (blue, red, yellow) at the " +
        "curb, and a red fire hydrant. To the right of the bodega, the lower " +
        "portion of a Park Slope brownstone wall is visible with a single " +
        "stoop beginning. Sidewalk tiles in the lower 40% are tan-gray concrete " +
        "with visible expansion joints."
    ),
  },
  "stage1-tile2": {
    prompt: bgPrompt(
      "Park Slope Brooklyn 5th Avenue sidewalk, TILE 2 of 3 (brownstone row). " +
        "A continuous row of three to four classic Park Slope brownstone " +
        "townhouses fills the upper 60% of the image, each with a raised stoop " +
        "and wrought-iron railings, tall arched parlor windows, warm red-brown " +
        "sandstone facades catching late afternoon sunlight. Between stoops are " +
        "small sidewalk tree pits with young street trees and green metal tree " +
        "guards. A pile of black trash bags sits curbside. Sidewalk tiles in " +
        "the lower 40% match tile 1's tan-gray concrete with expansion joints."
    ),
  },
  "stage1-tile3": {
    prompt: bgPrompt(
      "Park Slope Brooklyn 5th Avenue sidewalk, TILE 3 of 3 (pizza shop " +
        "approach). A classic NYC slice pizzeria occupies the right-center of " +
        "the upper half with a bright red awning and a glowing red neon sign " +
        "reading 'PIZZA' in blocky letters (this is the ONLY text in the image). " +
        "Storefront window shows a pizza counter silhouette. To the left of the " +
        "pizzeria: a graffiti-tagged old-school NYC payphone booth and a metal " +
        "subway grate in the sidewalk venting a soft plume of white steam. " +
        "Sidewalk tiles in the lower 40% match tiles 1 and 2's tan-gray " +
        "concrete with expansion joints."
    ),
  },
};

const ALL_TILES = ["stage1-tile1", "stage1-tile2", "stage1-tile3"];

// --- Token helper (copied from tools/generate-sprites.js pattern) -----------

function getToken() {
  if (
    process.env.SHOPIFY_PROXY_KEY &&
    process.env.SHOPIFY_PROXY_KEY.trim() &&
    process.env.SHOPIFY_PROXY_KEY !== "replace-me"
  ) {
    return process.env.SHOPIFY_PROXY_KEY.trim();
  }
  try {
    const out = execFileSync("/opt/dev/bin/devx", ["llm-gateway", "print-token", "--key"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    const token = out.trim();
    if (!token) throw new Error("devx returned an empty token");
    return token;
  } catch (err) {
    console.error(
      "ERROR: Could not obtain SHOPIFY_PROXY_KEY.\n" +
        "  - Set env var SHOPIFY_PROXY_KEY, or\n" +
        "  - Ensure `/opt/dev/bin/devx llm-gateway print-token --key` works.\n" +
        `Underlying error: ${err.message}`
    );
    process.exit(1);
  }
}

// --- Generation -------------------------------------------------------------

async function generateOnce(tile, token) {
  const cfg = TILES[tile];
  if (!cfg) throw new Error(`Unknown tile "${tile}"`);

  const body = {
    model: MODEL,
    prompt: cfg.prompt,
    size: SIZE,
    n: 1,
    // Backgrounds are opaque -- we want a fully rendered sky & sidewalk, not
    // a transparent layer.
  };

  process.stderr.write(`[${tile}] requesting (${SIZE})...\n`);
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}: ${text.slice(0, 500)}`);
  }

  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Non-JSON response: ${text.slice(0, 500)}`);
  }

  const item = json?.data?.[0];
  if (!item) throw new Error(`Unexpected response shape: ${text.slice(0, 500)}`);

  let pngBuffer;
  if (item.b64_json) {
    pngBuffer = Buffer.from(item.b64_json, "base64");
  } else if (item.url) {
    process.stderr.write(`[${tile}] downloading URL ${item.url}\n`);
    const imgRes = await fetch(item.url);
    if (!imgRes.ok) throw new Error(`Failed to download image URL (HTTP ${imgRes.status})`);
    pngBuffer = Buffer.from(await imgRes.arrayBuffer());
  } else {
    throw new Error(`No b64_json or url in item. Keys: ${Object.keys(item).join(", ")}`);
  }

  const magic = pngBuffer.slice(0, 4);
  const isPng =
    magic[0] === 0x89 && magic[1] === 0x50 && magic[2] === 0x4e && magic[3] === 0x47;
  if (!isPng) {
    throw new Error(
      `Output bytes are not PNG. First 8 bytes: ${Array.from(pngBuffer.slice(0, 8))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join(" ")}`
    );
  }

  // Backgrounds are wide-format and opaque so they should be considerably
  // bigger than the 50 KB sprite floor.
  if (pngBuffer.length < 100 * 1024) {
    throw new Error(`PNG is suspiciously small (${pngBuffer.length} bytes, want >= 100 KB)`);
  }

  const outPath = path.join(backgroundsDir, `${tile}.png`);
  fs.mkdirSync(backgroundsDir, { recursive: true });
  fs.writeFileSync(outPath, pngBuffer);

  process.stderr.write(`[${tile}] wrote ${outPath} (${pngBuffer.length} bytes)\n`);
  return { tile, path: outPath, bytes: pngBuffer.length };
}

async function generateOne(tile, token, { maxAttempts = 3 } = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await generateOnce(tile, token);
    } catch (err) {
      lastErr = err;
      process.stderr.write(
        `[${tile}] attempt ${attempt}/${maxAttempts} failed: ${err.message}\n`
      );
      if (attempt < maxAttempts) {
        const backoff = 3000 * attempt;
        process.stderr.write(`[${tile}] retrying in ${backoff}ms...\n`);
        await new Promise((r) => setTimeout(r, backoff));
      }
    }
  }
  throw lastErr;
}

async function main() {
  const args = process.argv.slice(2);
  let tiles;
  if (args.length === 0) {
    tiles = ALL_TILES;
  } else {
    const unknown = args.filter((t) => !TILES[t]);
    if (unknown.length) {
      console.error(`Unknown tile(s): ${unknown.join(", ")}`);
      console.error("Supported tiles:\n  " + ALL_TILES.join("\n  "));
      process.exit(1);
    }
    tiles = args;
  }

  const token = getToken();
  const started = Date.now();

  // Fan all tile generations out in parallel -- the proxy tolerates
  // concurrent requests and each one takes ~30-60s.
  const settled = await Promise.allSettled(
    tiles.map((t) => {
      const t0 = Date.now();
      return generateOne(t, token, { maxAttempts: 3 }).then(
        (r) => ({ ...r, ok: true, ms: Date.now() - t0 }),
        (err) => ({ tile: t, ok: false, error: err.message, ms: Date.now() - t0 })
      );
    })
  );

  const results = settled.map((s) => (s.status === "fulfilled" ? s.value : s.reason));
  const totalMs = Date.now() - started;

  console.log("\n=== Results ===");
  for (const r of results) {
    if (r.ok) {
      console.log(
        `OK   ${r.tile} (${(r.ms / 1000).toFixed(1)}s, ${r.bytes} bytes) -> ${r.path}`
      );
    } else {
      console.log(`FAIL ${r.tile} (${(r.ms / 1000).toFixed(1)}s): ${r.error}`);
    }
  }
  console.log(`\nTotal time: ${(totalMs / 1000).toFixed(1)}s for ${results.length} tile(s).`);

  const failed = results.filter((r) => !r.ok).length;
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
