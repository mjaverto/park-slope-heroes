#!/usr/bin/env node
// Stage 3 background generation tool for Park Slope Heroes.
// Uses Shopify's LLM proxy (proxy.shopify.ai) with OpenAI-compatible
// image generation (`/v1/images/generations`, model `openai:gpt-image-1`).
//
// Generates three 1536x1024 horizontal tiles that stitch into a
// ~4608x1024 side-scrolling Grand Army Plaza / Prospect Park entrance
// backdrop for Stage 3. Stage 3 is the FINAL stage: tree-lined approach,
// Soldiers' and Sailors' Memorial Arch, and a sewer-grate boss arena
// for the Sewer Colossus.
//
// Horizon/ground Y position must match Stage 1 and Stage 2 (40% from
// bottom) so a player walking across the stages feels continuous.
//
// Usage:
//   node tools/generate-stage3-backgrounds.js              # generate all three
//   node tools/generate-stage3-backgrounds.js stage3-tile1 # single tile
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
// lighting, horizon, and art direction. Deliberately aligned with Stage 1
// and Stage 2's anchors so all three stages stitch together continuously.

const STYLE_ANCHOR =
  "2D pixel-art painterly background, 16-bit SNES arcade beat-em-up aesthetic, " +
  "Teenage Mutant Ninja Turtles: Turtles in Time (Konami SNES) reference, rich " +
  "saturated colors, chunky pixels, clean outlines, crisp late-afternoon " +
  "golden-hour lighting, warm amber sunlight raking across stone and foliage, " +
  "clear blue sky with a few wispy pink-gold clouds. Warm brownstone, limestone, " +
  "and bronze undertones cohesive with Brooklyn's Grand Army Plaza and Prospect " +
  "Park entrance, leafy park greens and touches of autumn orange and red in the " +
  "fallen leaves.";

const COMPOSITION_ANCHOR =
  "Strict side-on flat parallax view (NOT isometric, NOT top-down, NOT 3/4). The " +
  "camera is a side-scroller camera, perfectly perpendicular to the scene. The " +
  "LOWER 40% of the canvas is flat horizontal walkable ground (a mix of stone " +
  "pavers, cobblestones, park path, or cracked stone depending on the tile) that " +
  "runs edge-to-edge at the same Y position. The horizon line sits exactly 40% " +
  "up from the bottom of the canvas, aligned with the horizon used in the " +
  "Stage 1 Park Slope 5th Avenue panels and Stage 2 JJ Byrne Park panels so the " +
  "stages connect continuously. The UPPER 60% is park scenery, monumental " +
  "architecture, foliage, and sky. No foreground objects cross below the bottom " +
  "edge. No vignettes, no frame, no border, no text anywhere in the image, no " +
  "signage lettering, no UI, no logos. No people, no characters, no rats, no " +
  "pedestrians, no animals. Empty scene ready for game sprites to be composited " +
  "on top.";

const SEAM_ANCHOR =
  "CRITICAL: the left and right edges of the image must be clean vertical cuts " +
  "at the same horizon height so this panel can be placed adjacent to other " +
  "panels of the same series (and to Stage 1 and Stage 2 panels) and tile " +
  "seamlessly. Do not place important focal subjects touching the left or right " +
  "edges.";

function bgPrompt(tileDescription) {
  return `${tileDescription} ${COMPOSITION_ANCHOR} ${STYLE_ANCHOR} ${SEAM_ANCHOR}`;
}

// --- Tile registry ----------------------------------------------------------

const TILES = {
  "stage3-tile1": {
    prompt: bgPrompt(
      "Prospect Park approach, TILE 1 of 3 (tree-lined walkway). The scene is a " +
        "Brooklyn park approach walkway: a wide stone-and-cement walkway with a " +
        "neat gray stone curb running along its right edge, bordered by a row of " +
        "mature London plane and maple trees on the upper portion of the image " +
        "whose golden-orange and red autumn canopies fill the upper half. Warm " +
        "amber sunlight filters through the leaves. A few dark-green slatted " +
        "Brooklyn park benches are placed along the left side of the walkway in " +
        "the mid-ground. Scattered fallen autumn leaves in orange, crimson, and " +
        "yellow dot the ground. Along the far right edge of the image, partially " +
        "visible and fading into haze, rise the silhouetted upper floors of a " +
        "row of Park Slope brownstones (warm red-brown stone, peaked cornices, " +
        "a hint of bay windows), suggesting the city fading away as the player " +
        "approaches the park. Ground in the lower 40% is a pale warm-gray stone " +
        "walkway with scattered leaves and a clear open walkable band in the " +
        "center for sprites."
    ),
  },
  "stage3-tile2": {
    prompt: bgPrompt(
      "Grand Army Plaza, TILE 2 of 3 (Soldiers' and Sailors' Memorial Arch). " +
        "The centerpiece is the iconic Soldiers' and Sailors' Memorial Arch of " +
        "Grand Army Plaza in Brooklyn: a massive granite triumphal arch with a " +
        "single wide central archway, ornate carved relief panels on its piers, " +
        "and bronze sculptural groups of soldiers, horses, and a winged Victory " +
        "chariot (quadriga) crowning the top. The arch dominates the upper " +
        "center/background of the scene, rendered in warm limestone and bronze " +
        "tones catching late afternoon golden light. The plaza floor in the " +
        "lower 40% is a pattern of warm gray radiating cobblestones / stone " +
        "pavers with clear negative space in the center for sprites. Two tall " +
        "ornate black cast-iron lamp posts with globe lamps flank the scene in " +
        "the mid-ground, one left-center and one right-center, tall enough to " +
        "reach into the upper half. Along the far left edge, partially visible, " +
        "is the base and a gentle splash suggestion of the Bailey Fountain (a " +
        "carved stone fountain rim with a hint of water) — just the rim and a " +
        "few droplets, not a central focal point. Green trees and a clear soft " +
        "blue sky fill any remaining upper space around and behind the arch."
    ),
  },
  "stage3-tile3": {
    prompt: bgPrompt(
      "Prospect Park entrance boss arena, TILE 3 of 3 (sewer colossus arena). " +
        "The park path opens into a wide circular stone plaza — a boss-fight " +
        "arena. Dead center in the foreground, dominating the lower 40% of the " +
        "image, is a large circular cast-iron NYC sewer manhole cover / storm " +
        "grate (aged dark iron with a radial pattern of slots and raised text-" +
        "free bosses, roughly 3 tile-widths across), set flush into cracked " +
        "pale-gray stone plaza pavers. Ominous pale steam wisps curl up from " +
        "the grate into the mid-ground. Cracks radiate outward through the " +
        "stone pavers around the grate, as if something massive has pushed up " +
        "from below. Flanking the arena in the mid-ground, a low curved stone " +
        "retaining wall rings the plaza. In the upper-center background, " +
        "framed by the mouths of two large trees, is the dark round mouth of a " +
        "stone sewer / drainage tunnel cut into a low hillside — pitch black " +
        "inside, water-stained stone arch around it, a few glints of light " +
        "suggesting something lurking. The sky is a moodier late-golden-hour " +
        "amber fading to deeper blue at the top, with the light raking " +
        "dramatically across the arena. The composition leaves an open clear " +
        "walkable ring of stone plaza around the grate (the grate itself is " +
        "the visual centerpiece but sprites need to circle it) — this is the " +
        "ultimate boss arena, ominous and ready for the Sewer Colossus to " +
        "erupt from below."
    ),
  },
};

const ALL_TILES = ["stage3-tile1", "stage3-tile2", "stage3-tile3"];

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

// --- Placeholder PNG (used when generation fails twice) ---------------------
// Emits a minimal 1536x1024 solid-color PNG so downstream tooling always has a
// file of the right dimensions on disk. Uses a single IDAT with one filter
// byte per row (filter=0) and flat pixel bytes zlib-compressed.

function crc32(buf) {
  let c;
  const table = crc32.table || (crc32.table = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })());
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function writeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

async function makePlaceholderPng(width, height, rgb = [40, 40, 60]) {
  const zlib = await import("node:zlib");
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const row = Buffer.alloc(1 + width * 3);
  for (let x = 0; x < width; x++) {
    row[1 + x * 3 + 0] = rgb[0];
    row[1 + x * 3 + 1] = rgb[1];
    row[1 + x * 3 + 2] = rgb[2];
  }
  const raw = Buffer.alloc(row.length * height);
  for (let y = 0; y < height; y++) row.copy(raw, y * row.length);
  const idat = zlib.deflateSync(raw);
  return Buffer.concat([
    sig,
    writeChunk("IHDR", ihdr),
    writeChunk("IDAT", idat),
    writeChunk("IEND", Buffer.alloc(0)),
  ]);
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

async function generateOne(tile, token, { maxAttempts = 2 } = {}) {
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
        const backoff = 3000;
        process.stderr.write(`[${tile}] retrying in ${backoff}ms...\n`);
        await new Promise((r) => setTimeout(r, backoff));
      }
    }
  }

  // Both attempts failed — write a placeholder at the correct dimensions
  // so the caller always finds a file on disk, and flag in the result.
  try {
    const placeholder = await makePlaceholderPng(1536, 1024, [30, 35, 55]);
    const outPath = path.join(backgroundsDir, `${tile}.png`);
    fs.mkdirSync(backgroundsDir, { recursive: true });
    fs.writeFileSync(outPath, placeholder);
    process.stderr.write(
      `[${tile}] wrote placeholder after ${maxAttempts} failures: ${outPath} (${placeholder.length} bytes)\n`
    );
    return {
      tile,
      path: outPath,
      bytes: placeholder.length,
      placeholder: true,
      error: lastErr?.message || "unknown",
    };
  } catch (phErr) {
    throw new Error(
      `All ${maxAttempts} gen attempts failed AND placeholder write failed: ` +
        `gen=${lastErr?.message}; placeholder=${phErr.message}`
    );
  }
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
      return generateOne(t, token, { maxAttempts: 2 }).then(
        (r) => ({ ...r, ok: !r.placeholder, ms: Date.now() - t0 }),
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
    } else if (r.placeholder) {
      console.log(
        `WARN ${r.tile} (${(r.ms / 1000).toFixed(1)}s, placeholder ${r.bytes} bytes): ${r.error}`
      );
    } else {
      console.log(`FAIL ${r.tile} (${(r.ms / 1000).toFixed(1)}s): ${r.error}`);
    }
  }
  console.log(`\nTotal time: ${(totalMs / 1000).toFixed(1)}s for ${results.length} tile(s).`);

  const failed = results.filter((r) => !r.ok && !r.placeholder).length;
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
