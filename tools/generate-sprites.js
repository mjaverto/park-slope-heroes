#!/usr/bin/env node
// Sprite generation tool for Park Slope Heroes.
// Uses Shopify's LLM proxy (proxy.shopify.ai) with OpenAI-compatible
// image generation (`/v1/images/generations`, model `openai:gpt-image-1`).
//
// Usage:
//   node tools/generate-sprites.js aiden
//   node tools/generate-sprites.js aiden street-rat fries
//
// Output: assets/sprites/<subject>.png

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const spritesDir = path.join(projectRoot, "assets", "sprites");

const ENDPOINT = "https://proxy.shopify.ai/v1/images/generations";
const MODEL = "openai:gpt-image-1";

// Style applied to every character prompt.
const CHAR_STYLE =
  "16-bit SNES pixel art, transparent background, flat colors, clean black outlines, " +
  "Teenage Mutant Ninja Turtles: Turtles in Time arcade aesthetic, crisp pixel edges, " +
  "bright saturated palette, high contrast, centered on canvas.";

const ITEM_STYLE =
  "16-bit SNES pixel art icon, transparent background, flat colors, clean black outlines, " +
  "centered, chunky pixels, bright saturated palette.";

// A 10-frame horizontal sprite sheet layout (idle x2, walk x4, attack x3, hit x1).
const SHEET_SUFFIX =
  "Render as a horizontal sprite sheet of 10 frames in a single row on one transparent canvas, " +
  "left to right: 2 idle frames (breathing), 4 walking frames (full cycle), 3 attack frames " +
  "(wind-up, strike, recover), 1 hit/flinch frame. Each cell shows the same character from the " +
  "front, same scale, same ground line, 32x48 pixel character in each cell.";

const SUBJECTS = {
  aiden: {
    type: "char",
    desc:
      "A 10-year-old boy hero, shaggy brown hair, fierce red bandana over forehead, " +
      "wielding twin katanas crossed in front of him, blue jeans, white sneakers, red t-shirt.",
  },
  theo: {
    type: "char",
    desc:
      "A 10-year-old boy hero, messy blonde hair, purple bandana, holding a wooden bo staff " +
      "diagonally, green cargo shorts, yellow t-shirt.",
  },
  lyelle: {
    type: "char",
    desc:
      "A 9-year-old girl hero, dark curly shoulder-length hair, red bandana headband, twin sai daggers, " +
      "purple hoodie, black leggings, pink sneakers.",
  },
  matthew: {
    type: "char",
    desc:
      "A 10-year-old boy hero, short blond hair, orange bandana, swinging a pair of nunchucks, " +
      "blue denim shorts, orange t-shirt, black hightops.",
  },
  kathryn: {
    type: "char",
    desc:
      "A 9-year-old girl hero, brown hair in two pigtails, blue bandana, wielding a kusarigama " +
      "(chain with curved sickle), teal dress over leggings, white sneakers.",
  },
  ronan: {
    type: "char",
    desc:
      "An 8-year-old boy hero, bright red hair, green bandana, holding a pair of tonfas, " +
      "grey shorts, green t-shirt, red sneakers.",
  },
  "street-rat": {
    type: "char",
    desc:
      "A muscular anthropomorphic rat enemy, shirtless with patchy grey-brown fur, " +
      "sneering yellow fangs, NYC gangster vibe with ripped jeans and chain belt, angry red eyes.",
  },
  "bruiser-rat": {
    type: "char",
    desc:
      "A larger heavily-muscled anthropomorphic rat enemy, shirtless with a heavy iron chain " +
      "around its neck, massive fists, brown-black fur, scars across its face, aggressive stance.",
  },
  "rat-king": {
    type: "char",
    desc:
      "A mini-boss anthropomorphic rat punk, torn jeans, dirty white tank top, tall purple mohawk, " +
      "spiked brass knuckles on both fists, evil grin with gold teeth.",
  },
  "sewer-colossus": {
    type: "char",
    desc:
      "A final-boss massive anthropomorphic rat monster, dripping with sewer slime, " +
      "glowing yellow eyes, hulking shoulders, torn green pants, scars and metal plating, " +
      "hunched imposing pose.",
  },
  fries: {
    type: "item",
    desc:
      "A single serving of golden french fries in a red cardboard carton, steam rising, " +
      "classic fast food NYC pickup item, 24x24 pixel icon.",
  },
  pizza: {
    type: "item",
    desc:
      "A single triangular slice of cheese pizza with pepperoni, crisp crust, " +
      "glistening cheese, classic NYC slice, pickup item, 24x24 pixel icon.",
  },
};

function buildPrompt(subject) {
  const cfg = SUBJECTS[subject];
  if (!cfg) {
    throw new Error(
      `Unknown subject "${subject}". Supported: ${Object.keys(SUBJECTS).join(", ")}`
    );
  }
  if (cfg.type === "char") {
    return `${cfg.desc} Style: ${CHAR_STYLE} ${SHEET_SUFFIX}`;
  }
  return `${cfg.desc} Style: ${ITEM_STYLE}`;
}

function getToken() {
  if (process.env.SHOPIFY_PROXY_KEY && process.env.SHOPIFY_PROXY_KEY.trim() && process.env.SHOPIFY_PROXY_KEY !== "replace-me") {
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

async function generateOne(subject, token) {
  const prompt = buildPrompt(subject);
  const cfg = SUBJECTS[subject];
  // Characters -> wide landscape sheet. Items -> square.
  // gpt-image-1 supports: 1024x1024, 1024x1536, 1536x1024, auto.
  const size = cfg.type === "char" ? "1536x1024" : "1024x1024";

  const body = {
    model: MODEL,
    prompt,
    size,
    n: 1,
    background: "transparent",
  };

  process.stderr.write(`[${subject}] requesting (${size})...\n`);
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
    process.stderr.write(
      `[${subject}] HTTP ${res.status} ${res.statusText}\n` +
        `  Response (first 500 chars): ${text.slice(0, 500)}\n`
    );
    throw new Error(`Image generation failed for "${subject}" (HTTP ${res.status})`);
  }

  let json;
  try {
    json = JSON.parse(text);
  } catch {
    process.stderr.write(
      `[${subject}] Non-JSON response (first 500 chars): ${text.slice(0, 500)}\n`
    );
    throw new Error(`Non-JSON response for "${subject}"`);
  }

  // Known shapes:
  //   OpenAI image gen: { data: [ { b64_json: "..." } ] }
  //   URL style:        { data: [ { url: "..." } ] }
  const item = json?.data?.[0];
  if (!item) {
    process.stderr.write(
      `[${subject}] Unexpected response shape (first 500 chars): ${text.slice(0, 500)}\n`
    );
    throw new Error(`Unexpected response shape for "${subject}"`);
  }

  let pngBuffer;
  if (item.b64_json) {
    pngBuffer = Buffer.from(item.b64_json, "base64");
  } else if (item.url) {
    process.stderr.write(`[${subject}] downloading URL ${item.url}\n`);
    const imgRes = await fetch(item.url);
    if (!imgRes.ok) throw new Error(`Failed to download image URL (HTTP ${imgRes.status})`);
    pngBuffer = Buffer.from(await imgRes.arrayBuffer());
  } else {
    process.stderr.write(
      `[${subject}] No b64_json or url in item. Keys: ${Object.keys(item).join(", ")}\n`
    );
    throw new Error(`No image data for "${subject}"`);
  }

  const outPath = path.join(spritesDir, `${subject}.png`);
  fs.mkdirSync(spritesDir, { recursive: true });
  fs.writeFileSync(outPath, pngBuffer);

  // Sanity check: PNG magic bytes 89 50 4E 47
  const magic = pngBuffer.slice(0, 4);
  const isPng =
    magic[0] === 0x89 && magic[1] === 0x50 && magic[2] === 0x4e && magic[3] === 0x47;
  if (!isPng) {
    process.stderr.write(
      `[${subject}] WARNING: output bytes don't start with PNG magic. First 8 bytes: ${Array.from(
        pngBuffer.slice(0, 8)
      )
        .map((b) => b.toString(16).padStart(2, "0"))
        .join(" ")}\n`
    );
  }

  process.stderr.write(`[${subject}] wrote ${outPath} (${pngBuffer.length} bytes)\n`);
  return outPath;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error("Usage: node tools/generate-sprites.js <subject> [<subject> ...]");
    console.error("Supported subjects:\n  " + Object.keys(SUBJECTS).join("\n  "));
    process.exit(1);
  }

  const unknown = args.filter((s) => !SUBJECTS[s]);
  if (unknown.length) {
    console.error(`Unknown subject(s): ${unknown.join(", ")}`);
    console.error("Supported subjects:\n  " + Object.keys(SUBJECTS).join("\n  "));
    process.exit(1);
  }

  const token = getToken();
  const results = [];
  for (const subject of args) {
    try {
      const p = await generateOne(subject, token);
      results.push({ subject, ok: true, path: p });
    } catch (err) {
      results.push({ subject, ok: false, error: err.message });
    }
  }

  console.log("\n=== Results ===");
  for (const r of results) {
    if (r.ok) console.log(`OK   ${r.subject} -> ${r.path}`);
    else console.log(`FAIL ${r.subject}: ${r.error}`);
  }
  const failed = results.filter((r) => !r.ok).length;
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
