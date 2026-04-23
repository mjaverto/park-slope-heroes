#!/usr/bin/env node
// Stage 2 background generation tool for Park Slope Heroes.
// Uses Shopify's LLM proxy (proxy.shopify.ai) with OpenAI-compatible
// image generation (`/v1/images/generations`, model `openai:gpt-image-1`).
//
// Generates three 1536x1024 horizontal tiles that stitch into a
// ~4608x1024 side-scrolling JJ Byrne Playground backdrop for Stage 2.
// Stage 2 is the park playground: entry gate, jungle gym + swings, and
// the iconic concrete whale + slide boss-fight arena.
//
// Horizon/ground Y position must match Stage 1 (40% from bottom) so a
// player walking from Stage 1 into Stage 2 feels continuous.
//
// Usage:
//   node tools/generate-stage2-backgrounds.js              # generate all three
//   node tools/generate-stage2-backgrounds.js stage2-tile1 # single tile
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
// Repeated verbatim across every tile so the three panels share palette,
// lighting, horizon, and art direction. These are deliberately aligned with
// Stage 1's anchors so Stage 1 and Stage 2 stitch together continuously.

const STYLE_ANCHOR =
  "2D pixel-art painterly background, 16-bit SNES arcade beat-em-up aesthetic, " +
  "Teenage Mutant Ninja Turtles: Turtles in Time (Konami SNES) reference, rich " +
  "saturated colors, chunky pixels, clean outlines, late afternoon golden-hour " +
  "lighting, warm orange sunlight raking across surfaces, soft blue sky with a " +
  "few pink-tinted clouds. Warm brick and earth undertones cohesive with a " +
  "Brooklyn 5th Avenue sidewalk scene, with foliage greens introduced from the " +
  "park's leafy trees.";

const COMPOSITION_ANCHOR =
  "Strict side-on flat parallax view (NOT isometric, NOT top-down, NOT 3/4). The " +
  "camera is a side-scroller camera, perfectly perpendicular to the scene. The " +
  "LOWER 40% of the canvas is flat horizontal playground ground (a mix of brick " +
  "path, concrete, rubber safety mat, sand, or woodchips depending on the tile) " +
  "that runs edge-to-edge at the same Y position. The horizon line sits exactly " +
  "40% up from the bottom of the canvas, aligned with the sidewalk horizon used " +
  "in the Stage 1 Park Slope 5th Avenue panels so the stages connect " +
  "continuously. The UPPER 60% is park scenery, foliage, and sky. No foreground " +
  "objects cross below the bottom edge. No vignettes, no frame, no border, no " +
  "text anywhere in the image, no signage lettering except where explicitly " +
  "allowed. No people, no characters, no rats, no pedestrians, no animals. Empty " +
  "playground ready for game sprites to be composited on top.";

const SEAM_ANCHOR =
  "CRITICAL: the left and right edges of the image must be clean vertical cuts " +
  "at the same horizon height so this panel can be placed adjacent to other " +
  "panels of the same series (and to Stage 1 panels) and tile seamlessly. Do " +
  "not place important focal subjects touching the left or right edges.";

function bgPrompt(tileDescription) {
  return `${tileDescription} ${COMPOSITION_ANCHOR} ${STYLE_ANCHOR} ${SEAM_ANCHOR}`;
}

// --- Tile registry ----------------------------------------------------------

const TILES = {
  "stage2-tile1": {
    prompt: bgPrompt(
      "JJ Byrne Park playground entry, TILE 1 of 3 (park gate). A wrought-iron " +
        "Brooklyn park gate stands in the left-center of the upper half, its " +
        "ornate black iron posts flanking an open archway. A weathered wooden " +
        "park sign mounted on the gate reads 'JJ BYRNE PARK' in simple serif " +
        "lettering (this is the ONLY text in the image). A red-brick herringbone " +
        "path leads through the gate into the park, transitioning from the " +
        "tan-gray concrete sidewalk on the left edge. Leafy Brooklyn maple and " +
        "London plane trees in warm green-gold foliage rise behind the gate, " +
        "catching late afternoon sun. A dark-green slatted park bench sits " +
        "beside the path with a black wire-mesh NYC trash can nearby. Ground in " +
        "the lower 40% is concrete sidewalk on the left transitioning to warm " +
        "red brick path toward the right."
    ),
  },
  "stage2-tile2": {
    prompt: bgPrompt(
      "JJ Byrne Park playground, TILE 2 of 3 (jungle gym and swings). A " +
        "colorful metal jungle gym dominates the left-center of the upper half " +
        "with bright-red climbing bars, royal-blue ladders, and sunshine-yellow " +
        "platforms, its safety bars and slides rendered in chunky clean " +
        "outlines. To the right of the jungle gym stands a classic metal " +
        "swing-set frame (A-frame style) with two empty rubber swings hanging " +
        "still from chains. Leafy Brooklyn trees rise behind the equipment " +
        "under a soft late-afternoon sky. Ground in the lower 40% is a dark " +
        "charcoal-and-forest-green rubber playground safety mat directly under " +
        "the equipment, transitioning to pale tan playground concrete at the " +
        "edges with a small patch of sand visible under one swing."
    ),
  },
  "stage2-tile3": {
    prompt: bgPrompt(
      "JJ Byrne Park playground, TILE 3 of 3 (the iconic concrete whale " +
        "sculpture and slide, boss-fight arena). The centerpiece is the famous " +
        "long low concrete humpback-whale climbing sculpture of JJ Byrne Park " +
        "(a smooth gray-blue concrete whale-shaped play sculpture that kids " +
        "climb on and slide down its back and tail; it is a SOLID concrete " +
        "climber, NOT a fountain, NOT spouting water), positioned in the " +
        "left-center of the scene with its tail curving up. To the right of " +
        "the whale stands a tall silver metal slide with a red ladder and a " +
        "shiny slide surface curving down to the ground. Dark-green slatted " +
        "park benches line the far edges. Leafy Brooklyn trees rise behind " +
        "everything. The composition leaves significant OPEN SPACE in the " +
        "center foreground (empty playground floor) so the area reads as a " +
        "boss-fight arena ready for sprites. Ground in the lower 40% is a mix " +
        "of warm tan woodchips and light sand across the playground floor. " +
        "This is the most visually striking panel of the stage."
    ),
  },
};

const ALL_TILES = ["stage2-tile1", "stage2-tile2", "stage2-tile3"];

// --- Token helper -----------------------------------------------------------

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
        // Exponential backoff: 3s, 9s.
        const backoff = 3000 * Math.pow(3, attempt - 1);
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
