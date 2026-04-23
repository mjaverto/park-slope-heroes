#!/usr/bin/env node
// Sprite generation tool for Park Slope Heroes.
// Uses Shopify's LLM proxy (proxy.shopify.ai) with OpenAI-compatible
// image generation (`/v1/images/generations`, model `openai:gpt-image-1`).
//
// Usage:
//   node tools/generate-sprites.js aiden
//   node tools/generate-sprites.js aiden-idle aiden-walk-1 fries
//   node tools/generate-sprites.js --all-poses   # generate the full pose set
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

// --- Style wrappers ----------------------------------------------------------

// Sprite-sheet style (legacy `aiden`, multi-pose on one canvas).
const CHAR_STYLE =
  "16-bit SNES pixel art, transparent background, flat colors, clean black outlines, " +
  "Teenage Mutant Ninja Turtles: Turtles in Time arcade aesthetic, crisp pixel edges, " +
  "bright saturated palette, high contrast, centered on canvas.";

// Single-pose style used by all per-pose subjects. Vibrant and chunky.
const POSE_STYLE =
  "16-bit SNES pixel art, vibrant saturated colors, thick black outlines, chunky pixels, " +
  "Teenage Mutant Ninja Turtles: Turtles in Time arcade aesthetic.";

// Framing rules locked across every pose, per the generation spec.
const POSE_FRAMING =
  "Single centered figure, full-body, facing right, transparent background, " +
  "no shadow on ground, no decorative elements, no text, no frame or border.";

const ITEM_STYLE =
  "16-bit SNES pixel art icon, transparent background, flat colors, clean black outlines, " +
  "centered, chunky pixels, bright saturated palette.";

const SHEET_SUFFIX =
  "Render as a horizontal sprite sheet of 10 frames in a single row on one transparent canvas, " +
  "left to right: 2 idle frames (breathing), 4 walking frames (full cycle), 3 attack frames " +
  "(wind-up, strike, recover), 1 hit/flinch frame. Each cell shows the same character from the " +
  "front, same scale, same ground line, 32x48 pixel character in each cell.";

// --- Locked identity descriptions -------------------------------------------
// Used verbatim across every pose of a given character so the same figure is
// recognizable across frames.
const AIDEN_IDENTITY =
  "A 10-year-old boy hero, shaggy brown hair, fierce red bandana tied across his forehead, " +
  "bright red t-shirt, blue jeans, white sneakers, twin katanas with black hilts sheathed " +
  "in an X-pattern on his back.";

const RAT_IDENTITY =
  "A muscular anthropomorphic street rat villain, shirtless with patchy warm brown-gray fur " +
  "(brown dominant, not cool gray), bulging arm and chest muscles, sneering with yellow fangs, " +
  "angry red eyes, long pink tail, wearing torn blue jeans with a chain belt, NYC gangster vibe, " +
  "no shoes.";

// --- Kid identity strings (locked per-character, used across all 6 poses) ----

const THEO_IDENTITY =
  "A 10-year-old boy hero (NOT a muscular adult), tall and lanky with shaggy blond hair falling " +
  "over his eyes, bright green zip hoodie unzipped over a white tee, khaki cargo shorts, " +
  "red high-top sneakers, holding a polished wooden bo staff.";

const LYELLE_IDENTITY =
  "A 10-year-old girl hero (NOT a muscular adult), athletic build, curly auburn-red hair in a " +
  "loose ponytail, bright yellow graphic t-shirt with a bold black star print, cuffed blue denim " +
  "shorts, white canvas sneakers, twin silver sai daggers with red-wrapped hilts.";

const MATTHEW_IDENTITY =
  "A 10-year-old boy hero (NOT a muscular adult), compact and wiry, short spiky black hair, " +
  "white ribbed tank top, black skinny jeans, black hi-top sneakers, holding a pair of " +
  "black-and-silver wooden nunchucks on a steel chain.";

const KATHRYN_IDENTITY =
  "A 10-year-old girl hero (NOT a muscular adult), long brown hair in a single side braid falling " +
  "over her shoulder, purple-and-pink tie-dye t-shirt, olive green cargo pants, brown leather " +
  "lace-up boots, wielding a kusarigama: a curved black-and-silver sickle connected to a long " +
  "metal chain with a weighted end.";

const RONAN_IDENTITY =
  "A 10-year-old boy hero (NOT a muscular adult), stocky build, sandy blond buzzcut with a red " +
  "bandana headband tied around his forehead, navy blue short-sleeve t-shirt, grey jogger sweatpants " +
  "with elastic cuffs, black sneakers, holding a pair of black wooden tonfas (one in each hand).";

// Build a per-pose character prompt that keeps identity locked and swaps the
// pose description only. Optional `paletteAnchor` reinforces color consistency
// across frames that have historically drifted.
function posePrompt(identity, pose, paletteAnchor) {
  const anchor = paletteAnchor ? ` ${paletteAnchor}` : "";
  return `${identity} Pose: ${pose}.${anchor} ${POSE_FRAMING} Style: ${POSE_STYLE}`;
}

// --- Subject registry --------------------------------------------------------

const SUBJECTS = {
  // Legacy multi-pose sheet (kept for reference; DO NOT regenerate).
  aiden: {
    type: "char-sheet",
    desc:
      "A 10-year-old boy hero, shaggy brown hair, fierce red bandana over forehead, " +
      "wielding twin katanas crossed in front of him, blue jeans, white sneakers, red t-shirt.",
  },
  // Legacy char-sheet entries for kids were removed in favor of per-pose
  // entries (theo-idle, lyelle-walk-1, etc.) further down in this registry.
  "street-rat": {
    type: "char-sheet",
    desc:
      "A muscular anthropomorphic rat enemy, shirtless with patchy grey-brown fur, " +
      "sneering yellow fangs, NYC gangster vibe with ripped jeans and chain belt, angry red eyes.",
  },
  "bruiser-rat": {
    type: "char-sheet",
    desc:
      "A larger heavily-muscled anthropomorphic rat enemy, shirtless with a heavy iron chain " +
      "around its neck, massive fists, brown-black fur, scars across its face, aggressive stance.",
  },
  "rat-king": {
    type: "char-sheet",
    desc:
      "A mini-boss anthropomorphic rat punk, torn jeans, dirty white tank top, tall purple mohawk, " +
      "spiked brass knuckles on both fists, evil grin with gold teeth.",
  },
  "sewer-colossus": {
    type: "char-sheet",
    desc:
      "A final-boss massive anthropomorphic rat monster, dripping with sewer slime, " +
      "glowing yellow eyes, hulking shoulders, torn green pants, scars and metal plating, " +
      "hunched imposing pose.",
  },

  // --- Per-pose single-frame subjects (Step 4 sprite swap-in) ---------------

  "aiden-idle": {
    type: "char-pose",
    size: "1024x1024",
    prompt: posePrompt(
      AIDEN_IDENTITY,
      "standing relaxed at ease, weight on back foot, arms loose at sides, head up, " +
        "calm alert expression, twin katanas still crossed on his back"
    ),
  },
  "aiden-walk-1": {
    type: "char-pose",
    size: "1024x1024",
    prompt: posePrompt(
      AIDEN_IDENTITY,
      "mid-stride walking cycle, LEFT foot forward and planted, right foot lifted behind, " +
        "arms swinging naturally in opposition, determined face"
    ),
  },
  "aiden-walk-2": {
    type: "char-pose",
    size: "1024x1024",
    prompt: posePrompt(
      AIDEN_IDENTITY,
      "mid-stride walking cycle, RIGHT foot forward and planted, left foot lifted behind, " +
        "arms swinging naturally in opposition, determined face"
    ),
  },
  "aiden-attack-1": {
    type: "char-pose",
    size: "1024x1024",
    prompt: posePrompt(
      AIDEN_IDENTITY,
      "katana wind-up pose, ONE katana drawn and raised high over his head ready to strike, " +
        "second katana still sheathed on his back, front leg braced, fierce battle yell"
    ),
  },
  "aiden-attack-2": {
    type: "char-pose",
    size: "1024x1024",
    prompt: posePrompt(
      AIDEN_IDENTITY,
      "katana mid-slash action pose, BOTH katanas drawn and swinging horizontally outward " +
        "in a wide double-slash, motion implied by blade angle, body leaning into the attack, " +
        "gritted teeth"
    ),
  },
  "aiden-hit": {
    type: "char-pose",
    size: "1024x1024",
    prompt: posePrompt(
      AIDEN_IDENTITY,
      "staggered back from a hit, body leaning backward off-balance, ONE arm raised defensively " +
        "across his face, other arm flailing, eyes scrunched in pain, katanas still on back"
    ),
  },

  "rat-idle": {
    type: "char-pose",
    size: "1024x1024",
    prompt: posePrompt(
      RAT_IDENTITY,
      "standing in a menacing idle stance, weight shifted forward, FISTS CLENCHED at his sides, " +
        "shoulders hunched, sneering at the camera, showing off bulging muscles"
    ),
  },
  "rat-walk-1": {
    type: "char-pose",
    size: "1024x1024",
    prompt: posePrompt(
      RAT_IDENTITY,
      "mid-stride advancing toward camera, LEFT foot forward and planted, right foot lifted behind, " +
        "fists clenched, shoulders rolling, prowling predatory gait"
    ),
  },
  "rat-walk-2": {
    type: "char-pose",
    size: "1024x1024",
    prompt: posePrompt(
      RAT_IDENTITY,
      "mid-stride advancing toward camera, RIGHT foot forward and planted, left foot lifted behind, " +
        "fists clenched, shoulders rolling, prowling predatory gait",
      "EXACT color palette match to rat-walk-1: same warm brown-gray fur tone " +
        "(brown dominant, not cool gray), same blue jeans, same pink tail, same chain belt."
    ),
  },
  "rat-attack": {
    type: "char-pose",
    size: "1024x1024",
    prompt: posePrompt(
      RAT_IDENTITY,
      "winding up a huge haymaker punch, one fist cocked back dramatically behind his shoulder, " +
        "other arm extended forward for balance, body rotated, face snarling with fangs bared"
    ),
  },
  "rat-hit": {
    type: "char-pose",
    size: "1024x1024",
    prompt: posePrompt(
      RAT_IDENTITY,
      "staggered back after taking a hit, body leaning backward off-balance, head snapped back, " +
        "arms flailing outward, eyes scrunched, spit flying from his mouth, tail whipping"
    ),
  },

  // --- Theo: bo staff ------------------------------------------------------
  "theo-idle": {
    type: "char-pose",
    size: "1024x1024",
    prompt: posePrompt(
      THEO_IDENTITY,
      "standing relaxed, weight on back foot, wooden bo staff held vertically in his right hand " +
        "with the bottom tip planted on the ground, free hand at his side, calm confident expression"
    ),
  },
  "theo-walk-1": {
    type: "char-pose",
    size: "1024x1024",
    prompt: posePrompt(
      THEO_IDENTITY,
      "mid-stride walking cycle, LEFT foot forward and planted, right foot lifted behind, " +
        "bo staff carried casually angled across his body in both hands, determined face"
    ),
  },
  "theo-walk-2": {
    type: "char-pose",
    size: "1024x1024",
    prompt: posePrompt(
      THEO_IDENTITY,
      "mid-stride walking cycle, RIGHT foot forward and planted, left foot lifted behind, " +
        "bo staff carried casually angled across his body in both hands, determined face"
    ),
  },
  "theo-attack-1": {
    type: "char-pose",
    size: "1024x1024",
    prompt: posePrompt(
      THEO_IDENTITY,
      "bo staff wind-up: both hands gripping the staff, raising it overhead ready to bring it down, " +
        "front leg braced, fierce battle yell"
    ),
  },
  "theo-attack-2": {
    type: "char-pose",
    size: "1024x1024",
    prompt: posePrompt(
      THEO_IDENTITY,
      "bo staff mid-swing horizontal sweep, staff held level in both hands swinging outward to the " +
        "right, body rotated with the swing, motion implied by staff angle, gritted teeth"
    ),
  },
  "theo-hit": {
    type: "char-pose",
    size: "1024x1024",
    prompt: posePrompt(
      THEO_IDENTITY,
      "staggered back from a hit, body leaning backward off-balance, bo staff held defensively " +
        "across his chest in both hands, eyes scrunched in pain"
    ),
  },

  // --- Lyelle: twin sai ----------------------------------------------------
  "lyelle-idle": {
    type: "char-pose",
    size: "1024x1024",
    prompt: posePrompt(
      LYELLE_IDENTITY,
      "standing relaxed, weight on back foot, one sai held in each hand pointing downward at her sides, " +
        "alert calm expression"
    ),
  },
  "lyelle-walk-1": {
    type: "char-pose",
    size: "1024x1024",
    prompt: posePrompt(
      LYELLE_IDENTITY,
      "mid-stride walking cycle, LEFT foot forward and planted, right foot lifted behind, " +
        "both sai held in low guard in front of her, blades angled forward, focused face"
    ),
  },
  "lyelle-walk-2": {
    type: "char-pose",
    size: "1024x1024",
    prompt: posePrompt(
      LYELLE_IDENTITY,
      "mid-stride walking cycle, RIGHT foot forward and planted, left foot lifted behind, " +
        "both sai held in low guard in front of her, blades angled forward, focused face"
    ),
  },
  "lyelle-attack-1": {
    type: "char-pose",
    size: "1024x1024",
    prompt: posePrompt(
      LYELLE_IDENTITY,
      "sai cross-strike action pose, both sai swinging inward past each other across her chest " +
        "in an X-shape, body leaning into the strike, fierce yell"
    ),
  },
  "lyelle-attack-2": {
    type: "char-pose",
    size: "1024x1024",
    prompt: posePrompt(
      LYELLE_IDENTITY,
      "sai outward thrust, both sai stabbing forward fully extended in front of her, arms " +
        "straight out, front leg lunged forward, fierce expression"
    ),
  },
  "lyelle-hit": {
    type: "char-pose",
    size: "1024x1024",
    prompt: posePrompt(
      LYELLE_IDENTITY,
      "staggered back from a hit, body leaning backward off-balance, ONE sai raised defensively " +
        "across her face, other sai flailing outward, eyes scrunched in pain"
    ),
  },

  // --- Matthew: nunchucks --------------------------------------------------
  "matthew-idle": {
    type: "char-pose",
    size: "1024x1024",
    prompt: posePrompt(
      MATTHEW_IDENTITY,
      "standing relaxed, weight on back foot, nunchucks dangling loose from his right hand " +
        "with the idle chuck resting against his thigh, cool confident smirk"
    ),
  },
  "matthew-walk-1": {
    type: "char-pose",
    size: "1024x1024",
    prompt: posePrompt(
      MATTHEW_IDENTITY,
      "mid-stride walking cycle, LEFT foot forward and planted, right foot lifted behind, " +
        "nunchucks in his right hand spinning in a small arc, focused face"
    ),
  },
  "matthew-walk-2": {
    type: "char-pose",
    size: "1024x1024",
    prompt: posePrompt(
      MATTHEW_IDENTITY,
      "mid-stride walking cycle, RIGHT foot forward and planted, left foot lifted behind, " +
        "nunchucks in his right hand spinning in a small arc, focused face"
    ),
  },
  "matthew-attack-1": {
    type: "char-pose",
    size: "1024x1024",
    prompt: posePrompt(
      MATTHEW_IDENTITY,
      "nunchuck cross-body whirl attack, nunchucks whirling horizontally across his chest, " +
        "motion blur of the chain implied, body rotated into the swing, fierce yell"
    ),
  },
  "matthew-attack-2": {
    type: "char-pose",
    size: "1024x1024",
    prompt: posePrompt(
      MATTHEW_IDENTITY,
      "nunchuck downward smack, right arm raised overhead bringing the nunchucks down in a hard " +
        "vertical strike, front leg braced, fierce expression"
    ),
  },
  "matthew-hit": {
    type: "char-pose",
    size: "1024x1024",
    prompt: posePrompt(
      MATTHEW_IDENTITY,
      "staggered back from a hit, body leaning backward off-balance, nunchucks flailing loose " +
        "from his right hand, left arm raised defensively, eyes scrunched in pain"
    ),
  },

  // --- Kathryn: kusarigama chain-scythe ------------------------------------
  "kathryn-idle": {
    type: "char-pose",
    size: "1024x1024",
    prompt: posePrompt(
      KATHRYN_IDENTITY,
      "standing relaxed, weight on back foot, sickle held in her right hand pointing down at her side, " +
        "the long chain coiled neatly in her left hand, alert calm expression"
    ),
  },
  "kathryn-walk-1": {
    type: "char-pose",
    size: "1024x1024",
    prompt: posePrompt(
      KATHRYN_IDENTITY,
      "mid-stride walking cycle, LEFT foot forward and planted, right foot lifted behind, " +
        "sickle in her right hand, chain held in her left hand swinging loose, focused face"
    ),
  },
  "kathryn-walk-2": {
    type: "char-pose",
    size: "1024x1024",
    prompt: posePrompt(
      KATHRYN_IDENTITY,
      "mid-stride walking cycle, RIGHT foot forward and planted, left foot lifted behind, " +
        "sickle in her right hand, chain held in her left hand swinging loose, focused face"
    ),
  },
  "kathryn-attack-1": {
    type: "char-pose",
    size: "1024x1024",
    prompt: posePrompt(
      KATHRYN_IDENTITY,
      "chain throw action pose, her left arm extended forward hurling the weighted chain end " +
        "outward, sickle still gripped in her right hand held back near her hip, body rotated " +
        "into the throw, fierce yell"
    ),
  },
  "kathryn-attack-2": {
    type: "char-pose",
    size: "1024x1024",
    prompt: posePrompt(
      KATHRYN_IDENTITY,
      "sickle slash action pose, curved sickle in her right hand swinging in a wide arc in front " +
        "of her, blade angle implying motion, chain trailing behind, body leaning into the slash, " +
        "gritted teeth"
    ),
  },
  "kathryn-hit": {
    type: "char-pose",
    size: "1024x1024",
    prompt: posePrompt(
      KATHRYN_IDENTITY,
      "staggered back from a hit, body leaning backward off-balance, sickle held weakly at her side, " +
        "chain flailing loose, free arm raised defensively, eyes scrunched in pain"
    ),
  },

  // --- Ronan: twin tonfas --------------------------------------------------
  "ronan-idle": {
    type: "char-pose",
    size: "1024x1024",
    prompt: posePrompt(
      RONAN_IDENTITY,
      "standing relaxed, weight on back foot, one tonfa gripped in each hand with the long shaft " +
        "reversed along his forearms (handle out front, shaft lying down his arm), confident stance"
    ),
  },
  "ronan-walk-1": {
    type: "char-pose",
    size: "1024x1024",
    prompt: posePrompt(
      RONAN_IDENTITY,
      "mid-stride walking cycle, LEFT foot forward and planted, right foot lifted behind, " +
        "tonfas held in low guard reversed along his forearms, focused face"
    ),
  },
  "ronan-walk-2": {
    type: "char-pose",
    size: "1024x1024",
    prompt: posePrompt(
      RONAN_IDENTITY,
      "mid-stride walking cycle, RIGHT foot forward and planted, left foot lifted behind, " +
        "tonfas held in low guard reversed along his forearms, focused face"
    ),
  },
  "ronan-attack-1": {
    type: "char-pose",
    size: "1024x1024",
    prompt: posePrompt(
      RONAN_IDENTITY,
      "tonfa elbow-spin strike, body rotated hard with his right elbow driving forward and the " +
        "tonfa shaft swinging outward from his forearm like a bludgeon, other tonfa held defensively, " +
        "fierce yell"
    ),
  },
  "ronan-attack-2": {
    type: "char-pose",
    size: "1024x1024",
    prompt: posePrompt(
      RONAN_IDENTITY,
      "tonfa straight punch action pose, right arm fully extended punching forward with the tonfa " +
        "head leading the strike, left tonfa guard at his hip, front leg lunged forward, gritted teeth"
    ),
  },
  "ronan-hit": {
    type: "char-pose",
    size: "1024x1024",
    prompt: posePrompt(
      RONAN_IDENTITY,
      "staggered back from a hit, body leaning backward off-balance, one tonfa raised defensively " +
        "across his face, other tonfa flailing outward, eyes scrunched in pain"
    ),
  },

  // Item: small pixel fries carton; center ~40% of canvas, lots of transparent padding.
  fries: {
    type: "item-pose",
    size: "1024x1024",
    prompt:
      "A small French fries carton pickup item: a classic red cardboard fry carton with " +
      "golden-yellow pixelated french fries sticking out the top. " +
      "The fries carton should occupy only the centermost ~40% of the canvas with generous " +
      "transparent space on all four sides. " +
      `${POSE_FRAMING} Style: ${POSE_STYLE}`,
  },

  // Legacy item sheet prompts (not used by step 4 but kept).
  pizza: {
    type: "item-sheet",
    desc:
      "A single triangular slice of cheese pizza with pepperoni, crisp crust, " +
      "glistening cheese, classic NYC slice, pickup item, 24x24 pixel icon.",
  },
};

// Ordered list of the 12 pose subjects for --all-poses.
const ALL_POSES = [
  "aiden-idle",
  "aiden-walk-1",
  "aiden-walk-2",
  "aiden-attack-1",
  "aiden-attack-2",
  "aiden-hit",
  "rat-idle",
  "rat-walk-1",
  "rat-walk-2",
  "rat-attack",
  "rat-hit",
  "fries",
];

function buildPrompt(subject) {
  const cfg = SUBJECTS[subject];
  if (!cfg) {
    throw new Error(
      `Unknown subject "${subject}". Supported: ${Object.keys(SUBJECTS).join(", ")}`
    );
  }
  // Pre-built prompts win.
  if (cfg.prompt) return cfg.prompt;

  if (cfg.type === "char-sheet") {
    return `${cfg.desc} Style: ${CHAR_STYLE} ${SHEET_SUFFIX}`;
  }
  if (cfg.type === "item-sheet") {
    return `${cfg.desc} Style: ${ITEM_STYLE}`;
  }
  throw new Error(`Subject "${subject}" has no prompt and unknown type "${cfg.type}"`);
}

function sizeFor(subject) {
  const cfg = SUBJECTS[subject];
  if (cfg.size) return cfg.size;
  // Legacy: wide sheet for chars, square for items.
  if (cfg.type === "char-sheet") return "1536x1024";
  return "1024x1024";
}

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

async function generateOnce(subject, token) {
  const prompt = buildPrompt(subject);
  const size = sizeFor(subject);

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
    throw new Error(
      `HTTP ${res.status} ${res.statusText}: ${text.slice(0, 500)}`
    );
  }

  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Non-JSON response: ${text.slice(0, 500)}`);
  }

  const item = json?.data?.[0];
  if (!item) {
    throw new Error(`Unexpected response shape: ${text.slice(0, 500)}`);
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

  if (pngBuffer.length < 50 * 1024) {
    throw new Error(`PNG is suspiciously small (${pngBuffer.length} bytes, want >= 50 KB)`);
  }

  const outPath = path.join(spritesDir, `${subject}.png`);
  fs.mkdirSync(spritesDir, { recursive: true });
  fs.writeFileSync(outPath, pngBuffer);

  process.stderr.write(`[${subject}] wrote ${outPath} (${pngBuffer.length} bytes)\n`);
  return outPath;
}

async function generateOne(subject, token, { maxAttempts = 3 } = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await generateOnce(subject, token);
    } catch (err) {
      lastErr = err;
      process.stderr.write(
        `[${subject}] attempt ${attempt}/${maxAttempts} failed: ${err.message}\n`
      );
      if (attempt < maxAttempts) {
        const backoff = 2000 * attempt;
        process.stderr.write(`[${subject}] retrying in ${backoff}ms...\n`);
        await new Promise((r) => setTimeout(r, backoff));
      }
    }
  }
  throw lastErr;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error("Usage: node tools/generate-sprites.js <subject> [<subject> ...]");
    console.error("       node tools/generate-sprites.js --all-poses");
    console.error("Supported subjects:\n  " + Object.keys(SUBJECTS).join("\n  "));
    process.exit(1);
  }

  let subjects;
  if (args.length === 1 && args[0] === "--all-poses") {
    subjects = ALL_POSES;
  } else {
    const unknown = args.filter((s) => !SUBJECTS[s]);
    if (unknown.length) {
      console.error(`Unknown subject(s): ${unknown.join(", ")}`);
      console.error("Supported subjects:\n  " + Object.keys(SUBJECTS).join("\n  "));
      process.exit(1);
    }
    subjects = args;
  }

  const token = getToken();
  const results = [];
  const started = Date.now();
  for (const subject of subjects) {
    const t0 = Date.now();
    try {
      const p = await generateOne(subject, token, { maxAttempts: 3 });
      results.push({ subject, ok: true, path: p, ms: Date.now() - t0 });
    } catch (err) {
      results.push({ subject, ok: false, error: err.message, ms: Date.now() - t0 });
    }
  }
  const totalMs = Date.now() - started;

  console.log("\n=== Results ===");
  for (const r of results) {
    if (r.ok) console.log(`OK   ${r.subject} (${(r.ms / 1000).toFixed(1)}s) -> ${r.path}`);
    else console.log(`FAIL ${r.subject} (${(r.ms / 1000).toFixed(1)}s): ${r.error}`);
  }
  console.log(`\nTotal time: ${(totalMs / 1000).toFixed(1)}s for ${results.length} subject(s).`);
  const failed = results.filter((r) => !r.ok).length;
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
