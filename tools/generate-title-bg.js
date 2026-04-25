#!/usr/bin/env node
// Title screen background generation tool for Park Slope Heroes.
// Uses Shopify's LLM proxy (proxy.shopify.ai) with OpenAI-compatible
// image generation (`/v1/images/generations`, model `openai:gpt-image-1`).
//
// Generates ONE 1536x1024 hero image for the title/start screen. Phaser
// scales it to the game viewport (1024x576). The title text overlays
// on top in-engine.
//
// Usage:
//   node tools/generate-title-bg.js
//
// Output: assets/backgrounds/title-bg.png

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

// --- Prompt -----------------------------------------------------------------

const TITLE_PROMPT =
  "Epic hero title screen for a Brooklyn beat-em-up arcade game called Park " +
  "Slope Heroes. Brooklyn Park Slope late-afternoon skyline in 16-bit pixel-art " +
  "painterly style, Teenage Mutant Ninja Turtles: Turtles in Time (Konami SNES) " +
  "reference, rich saturated colors, chunky pixels, clean outlines. " +
  "Composition: a dramatic golden-hour / sunset sky fills the upper half — " +
  "warm oranges and pinks bleeding into deep purples toward the top of the " +
  "canvas. A line of Brooklyn brownstone silhouettes runs along the mid-ground " +
  "horizon — classic Park Slope rowhouses with peaked cornices, stoops, bay " +
  "windows, cut in black/deep-violet silhouette against the glowing sky. In " +
  "the far background toward the center, the iconic Soldiers' and Sailors' " +
  "Memorial Arch of Grand Army Plaza stands proudly silhouetted, crowned by " +
  "its winged Victory quadriga. To the right, on the far horizon, a tiny hint " +
  "of the Manhattan skyline (Empire State / One WTC silhouettes, very small, " +
  "very distant). To the left, a hint of the Prospect Park tree canopy in " +
  "dark silhouette. " +
  "In the middle-foreground, centered slightly low, stand SIX kid-sized hero " +
  "silhouettes on a flat brownstone rooftop, fully backlit against the sky — " +
  "you see their crisp dark shapes and raised/drawn weapons but not their " +
  "faces or clothing details. Weapons visible in silhouette: a pair of " +
  "katanas held crossed high overhead, a long bo staff held vertical, twin " +
  "sai held at waist level, nunchucks mid-swing with a motion blur arc, a " +
  "kusarigama (sickle + chain) held low, and twin tonfas held out at the " +
  "sides. The six kids stand in a heroic hero-shot row, slightly staggered, " +
  "confident and ready — Saturday-morning-cartoon intro energy. " +
  "IMPORTANT: the upper third of the image (the sky zone where big title text " +
  "will overlay in-engine) must be slightly darker and less visually busy — " +
  "let it be the deeper purple part of the sunset gradient with minimal " +
  "detail, so bright gold and cyan title text will read clearly on top. " +
  "Mood: heroic, epic, ominous-but-hopeful, TMNT intro screen meets Streets " +
  "of Rage title card. " +
  "Strict constraints: NO text anywhere in the image, no lettering, no logos, " +
  "no signage, no UI, no HUD, no watermark, no frame, no border, no vignette. " +
  "No individual facial details on the six silhouettes — they are pure dark " +
  "shapes. 2D flat painterly pixel-art, NOT photorealistic, NOT 3D-rendered, " +
  "NOT isometric. Wide landscape composition suitable as a game title backdrop.";

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
// Emits a minimal solid-color PNG so downstream tooling always has a file on
// disk. MainMenu's fallback will render the plain rectangle anyway.

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

async function makePlaceholderPng(width, height, rgb = [15, 10, 26]) {
  const zlib = await import("node:zlib");
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
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

async function generateOnce(token) {
  const body = {
    model: MODEL,
    prompt: TITLE_PROMPT,
    size: SIZE,
    n: 1,
  };

  process.stderr.write(`[title-bg] requesting (${SIZE})...\n`);
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
    process.stderr.write(`[title-bg] downloading URL ${item.url}\n`);
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

  const outPath = path.join(backgroundsDir, "title-bg.png");
  fs.mkdirSync(backgroundsDir, { recursive: true });
  fs.writeFileSync(outPath, pngBuffer);

  process.stderr.write(`[title-bg] wrote ${outPath} (${pngBuffer.length} bytes)\n`);
  return { path: outPath, bytes: pngBuffer.length };
}

async function generate(token, { maxAttempts = 2 } = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await generateOnce(token);
    } catch (err) {
      lastErr = err;
      process.stderr.write(
        `[title-bg] attempt ${attempt}/${maxAttempts} failed: ${err.message}\n`
      );
      if (attempt < maxAttempts) {
        const backoff = 3000;
        process.stderr.write(`[title-bg] retrying in ${backoff}ms...\n`);
        await new Promise((r) => setTimeout(r, backoff));
      }
    }
  }

  // Both attempts failed — write a placeholder. MainMenu's fallback will
  // render the plain rectangle regardless.
  try {
    const placeholder = await makePlaceholderPng(1536, 1024, [15, 10, 26]);
    const outPath = path.join(backgroundsDir, "title-bg.png");
    fs.mkdirSync(backgroundsDir, { recursive: true });
    fs.writeFileSync(outPath, placeholder);
    process.stderr.write(
      `[title-bg] wrote placeholder after ${maxAttempts} failures: ${outPath} (${placeholder.length} bytes)\n`
    );
    return {
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
  const token = getToken();
  const started = Date.now();

  let result;
  try {
    result = await generate(token, { maxAttempts: 2 });
  } catch (err) {
    console.error(`FATAL: ${err.message}`);
    process.exit(1);
  }

  const totalMs = Date.now() - started;
  console.log("\n=== Result ===");
  if (result.placeholder) {
    console.log(
      `WARN title-bg (${(totalMs / 1000).toFixed(1)}s, placeholder ${result.bytes} bytes): ${result.error}`
    );
  } else {
    console.log(
      `OK   title-bg (${(totalMs / 1000).toFixed(1)}s, ${result.bytes} bytes) -> ${result.path}`
    );
  }

  process.exit(result.placeholder ? 1 : 0);
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
