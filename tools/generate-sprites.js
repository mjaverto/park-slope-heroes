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

// Stage 2 mini-boss: Jacked Rat King. MUST read as a MASSIVE, more-shredded version
// of the same species as RAT_IDENTITY — same warm brown-gray fur, same snout shape,
// same posture family. Crown + brass knuckles + spiked collar + ripped denim are the
// silhouette markers that make him visually distinct from regular street rats.
const RAT_KING_IDENTITY =
  "MASSIVE muscular mutant sewer rat king, roughly 2x the size of regular street rats, " +
  "shirtless to show bulging warm brown-gray furred musculature (brown dominant, not cool gray), " +
  "long pink tail, wears a tarnished brass crown with chipped jewels on his head, a spiked " +
  "leather collar around his neck, ripped denim shorts, brass knuckles on both paws. " +
  "Glowing red eyes, long scarred ears with chunks missing, yellow broken fangs, snarling face. " +
  "More menacing and shredded than regular street rats but CLEARLY the same species — same fur " +
  "palette, same snout shape, same posture style. 2D painterly pixel-art, 90s SNES arcade " +
  "(TMNT: Turtles in Time Konami reference). Full-body character in silhouette-friendly pose.";

const COCKROACH_IDENTITY =
  "A skittering NYC street cockroach enemy creature, dark glossy reddish-brown chitinous shell with " +
  "a hard segmented carapace, six spindly black insect legs, two long twitching antennae, transparent " +
  "buzzing wings folded along its back, mean glowing red compound eyes, sharp mandibles bared, " +
  "menacing oversized roach the size of a small dog. " +
  "2D painterly pixel-art, 90s SNES arcade (TMNT: Turtles in Time Konami reference). " +
  "Full-body creature in silhouette-friendly pose.";

const BEAKZILLA_IDENTITY =
  "Beakzilla, a comically MUSCLE-BOUND PIGEON the size of a 13-year-old human (tall, hulking — NOT realistically pigeon-sized), " +
  "iridescent purple-grey feathered body, BULGING BICEPS and pectorals visible through a torn yellow gym tank top that reads 'GAINS' across the chest, " +
  "tiny pigeon head with bright orange beak and red angry eyes, scrawny pink bird legs (mismatched with the swole upper body — that's the joke), " +
  "wearing tiny black sweatbands on each wrist, breadcrumbs scattered around his feet. " +
  "Cartoon comic-book style, vibrant, slightly menacing but funny.";

const R_TRAIN_IDENTITY =
  "An NYC subway R train (BMT R160 model) shown in side profile, GLOSSY SILVER stainless-steel exterior with horizontal corrugated ridges, " +
  "a bright RED CIRCULAR 'R' BADGE on the front car (large white letter R inside a red disc, classic NYC MTA roundel style), " +
  "front cab and 2-3 passenger cars visible end-to-end, large rectangular windows along each car. " +
  "Inside the windows you can see 4 different kids' faces pressed to the glass, smiling and waving — diverse cute children, NOT adults. " +
  "The train is on an ELEVATED OUTDOOR TRACK (visible girders below the train in the bottom 1/4 of the image), " +
  "Brooklyn sky behind. Cartoon comic-book style with crisp lineart, vibrant colors. NO text other than the R badge. NO platform people.";

// --- Kid identity strings (locked per-character, used across all poses) ----

const THEO_IDENTITY =
  "A 10-year-old African American boy hero (NOT a muscular adult), tall and lanky, dark brown skin, " +
  "VERY SHORT CROPPED black hair (nearly buzzed, close to scalp — NOT curly afro, NOT long, NOT shaggy), " +
  "bright green zip hoodie unzipped over a white tee, khaki cargo shorts, " +
  "red high-top sneakers, holding a polished wooden bo staff.";

const RAFI_IDENTITY =
  "A 10-year-old boy hero (NOT a muscular adult), MEDIUM-LENGTH BROWN HAIR in a classic boy's haircut " +
  "(parted, ear-length, NOT long, NOT shaggy, NOT spiky), light skin, GREY zip hoodie zipped halfway, " +
  "blue jeans, white sneakers with bright LIME GREEN socks visibly poking out at the ankles, " +
  "carrying a wooden household broom (long tan wooden handle, straw bristles at the bottom).";

const LYELLE_IDENTITY =
  "A 10-year-old boy hero (NOT a muscular adult), athletic build, light skin, SHORT MESSY BLOND HAIR " +
  "(straight and boyish, NOT long, NOT in a ponytail), bright blue eyes, bright yellow graphic t-shirt " +
  "with a bold black star print, cuffed blue denim shorts, white canvas sneakers, " +
  "twin silver sai daggers with red-wrapped hilts.";

const MATTHEW_IDENTITY =
  "A 10-year-old boy hero (NOT a muscular adult), compact and wiry, short spiky black hair, " +
  "white ribbed tank top, black skinny jeans, black hi-top sneakers, holding a pair of " +
  "black-and-silver wooden nunchucks on a steel chain.";

const KATHRYN_IDENTITY =
  "A 10-year-old girl hero (NOT a muscular adult), long brown hair in a single side braid falling " +
  "over her shoulder, purple-and-pink tie-dye t-shirt, olive green cargo pants, brown leather " +
  "lace-up boots, wielding a kusarigama: a curved black-and-silver sickle connected to a long " +
  "metal chain with a weighted end.";

const DEAN_IDENTITY =
  "A 3-year-old TODDLER boy hero named Dean (NOT a 10-year-old, NOT a muscular adult — a TINY " +
  "BLOND TODDLER roughly HALF the height of the other kids), baby-round chubby face, pale pink " +
  "skin, wispy pale-blond toddler hair, huge curious bright-blue eyes, wearing a red-and-white " +
  "horizontally-striped t-shirt, denim overalls with a front pocket, tiny white velcro sneakers " +
  "with red laces, hoisting with both tiny arms a COMICALLY OVERSIZED black iron warhammer — " +
  "the warhammer head is a massive rectangular iron block bigger than his own head, the wooden " +
  "shaft is taller than he is, studded with brass rivets; somehow he swings it with unnatural " +
  "toddler strength, fierce tiny-warrior determination on his baby face.";

// --- Sewer Colossus: final boss (2-phase transformation, 12-pose set) -------
// Phase 1 is the "Sewer Lord" humanoid rat-mutant villain. Phase 2 is the
// mutated "Sewer Colossus" — same creature, way more monstrous. Both phases
// must clearly read as the same character between transformations.

const SEWER_COLOSSUS_P1_IDENTITY =
  "A hulking humanoid rat-mutant villain known as 'The Sewer Lord', 8 feet tall, muscular but " +
  "still bipedal and rat-shaped. Matted brown-grey fur streaked with green sewer slime, glowing " +
  "yellow eyes, long rat snout with yellow fangs, tattered black leather trench coat over bare " +
  "chiseled chest, thick studded leather belts, rusted steel gauntlets with claws, wrapped " +
  "bandages around forearms, heavy boots caked in sewer muck, rat tail with iron rings threaded " +
  "through it. Intimidating but recognizably a rat. Dripping green ooze. " +
  "2D painterly pixel-art, 90s SNES arcade (TMNT: Turtles in Time Konami reference) final-boss " +
  "vibe. Full-body character in silhouette-friendly pose.";

const SEWER_COLOSSUS_P2_IDENTITY =
  "The same creature from Phase 1 ('The Sewer Lord') mutated further into 'The Sewer Colossus': " +
  "now 12 feet tall, massively thicker and more hulking, swollen green-veined muscles bursting " +
  "through the trench coat (which is now shredded into tatters), glowing RED eyes (changed from " +
  "yellow), extra thick black spikes protruding from shoulders and back, jaws wider with more " +
  "fangs, a second pair of smaller clawed arms emerging from his ribs (4 arms total), skin " +
  "visibly greener and more reptilian in patches, electrical green sewer-energy crackling around " +
  "his fists, completely feral rage expression. Still has the matted brown-grey fur, long rat " +
  "snout, rat tail with iron rings, heavy muck-caked boots, and studded leather belts from " +
  "Phase 1 — CLEARLY the same character but way more monstrous. " +
  "2D painterly pixel-art, 90s SNES arcade (TMNT: Turtles in Time Konami reference) final-boss " +
  "vibe. Full-body character in silhouette-friendly pose.";

// Palette anchor strings reused across later poses of each phase to keep the
// fur/slime/gear colors locked against drift (same pattern as rat-king).
const SEWER_COLOSSUS_P1_ANCHOR =
  "EXACT color palette match to sewer-colossus-p1-idle: same matted brown-grey fur with green " +
  "sewer slime streaks, same glowing yellow eyes, same tattered black leather trench coat, " +
  "same rusted steel clawed gauntlets, same dirty forearm bandages, same muck-caked boots, " +
  "same iron-ringed tail, same dripping green ooze.";

const SEWER_COLOSSUS_P2_ANCHOR =
  "EXACT color palette match to sewer-colossus-p2-idle: same greener-patched brown-grey fur with " +
  "swollen green veins, same glowing RED eyes, same shredded remnants of the black leather " +
  "trench coat, same black shoulder/back spikes, same crackling electrical green sewer-energy, " +
  "same four-armed silhouette, same iron-ringed tail, same muck-caked boots.";

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

  // --- Cockroach: fast skittering enemy (5 poses) --------------------------
  "cockroach-idle": {
    type: "char-pose",
    size: "1024x1024",
    prompt: posePrompt(
      COCKROACH_IDENTITY,
      "skittering in place idle stance, low to the ground on all six legs, antennae raised and " +
        "twitching, head turned slightly toward the camera, mandibles slightly parted, mean glowing " +
        "red eyes"
    ),
  },
  "cockroach-walk-1": {
    type: "char-pose",
    size: "1024x1024",
    prompt: posePrompt(
      COCKROACH_IDENTITY,
      "mid-skitter advancing toward camera, three left-side legs pushed forward and three " +
        "right-side legs back in the alternating tripod gait insects use, body slightly tilted into " +
        "the motion, antennae trailing back with speed"
    ),
  },
  "cockroach-walk-2": {
    type: "char-pose",
    size: "1024x1024",
    prompt: posePrompt(
      COCKROACH_IDENTITY,
      "mid-skitter advancing toward camera, opposite leg phase from walk-1: three right-side legs " +
        "forward and three left-side legs back — visibly different so a 2-frame cycle reads as " +
        "scuttling, antennae trailing",
      "EXACT color palette match to cockroach-walk-1: same dark glossy reddish-brown chitin, same " +
        "transparent wing tint, same red compound eyes, same antennae color."
    ),
  },
  "cockroach-attack": {
    type: "char-pose",
    size: "1024x1024",
    prompt: posePrompt(
      COCKROACH_IDENTITY,
      "lunging forward at the camera with body lifted up on rear legs, front legs and antennae " +
        "extended forward, transparent wings flared open behind, mandibles wide open and snapping, " +
        "hostile threat pose, mean glowing red eyes locked on target"
    ),
  },
  "cockroach-hit": {
    type: "char-pose",
    size: "1024x1024",
    prompt: posePrompt(
      COCKROACH_IDENTITY,
      "knocked onto its back with all six legs flailing in the air, glossy underside exposed, " +
        "antennae splayed out limp, body curled in pain, eyes scrunched"
    ),
  },

  // --- Beakzilla: muscle-bound pigeon boss (6-pose set) -------------------
  "beakzilla-idle": {
    type: "char-pose",
    size: "1024x1024",
    prompt: posePrompt(
      BEAKZILLA_IDENTITY,
      "Standing tall on his pink bird legs, both buff arms crossed over his chest in a smug " +
        "bodybuilder pose, head tilted slightly, beady red eye glaring at the camera, full body " +
        "visible front-facing"
    ),
  },
  "beakzilla-walk-1": {
    type: "char-pose",
    size: "1024x1024",
    prompt: posePrompt(
      BEAKZILLA_IDENTITY,
      "Mid-stride walk cycle frame 1, left bird-leg planted forward, right leg lifted back, buff " +
        "arms swinging in opposition, full body front-facing, leaning forward menacingly"
    ),
  },
  "beakzilla-walk-2": {
    type: "char-pose",
    size: "1024x1024",
    prompt: posePrompt(
      BEAKZILLA_IDENTITY,
      "Mid-stride walk cycle frame 2 (mirror of frame 1), right bird-leg planted forward, left " +
        "leg lifted back, arms swinging the other way",
      "EXACT color palette match to beakzilla-walk-1: same iridescent purple-grey feathered body, " +
        "same torn yellow 'GAINS' gym tank top, same bright orange beak, same red angry eyes, " +
        "same scrawny pink bird legs, same tiny black wrist sweatbands. No color flicker between " +
        "walk-1 and walk-2."
    ),
  },
  "beakzilla-attack": {
    type: "char-pose",
    size: "1024x1024",
    prompt: posePrompt(
      BEAKZILLA_IDENTITY,
      "Mid-attack lunge, one buff arm cocked back about to throw a haymaker punch, beak open in " +
        "a furious squawk, body twisted into the swing, dynamic action"
    ),
  },
  "beakzilla-hit": {
    type: "char-pose",
    size: "1024x1024",
    prompt: posePrompt(
      BEAKZILLA_IDENTITY,
      "Just got smacked. Body recoiling backward, buff arms flailing, eyes squeezed shut, beak " +
        "clenched, feathers puffing out around the impact point. Painful but comedic expression"
    ),
  },
  "beakzilla-defeat": {
    type: "char-pose",
    size: "1024x1024",
    prompt: posePrompt(
      BEAKZILLA_IDENTITY,
      "Defeated. Lying on his back on the ground with X's for eyes, buff arms splayed out, " +
        "tongue lolling, breadcrumbs scattered around him, the torn 'GAINS' tank top now ripped open"
    ),
  },

  // --- R train: one-off cinematic sprite ------------------------------------
  "r-train": {
    type: "char-pose",
    size: "1024x1024",
    prompt: posePrompt(
      R_TRAIN_IDENTITY,
      "Side profile view of the full train passing across the frame, all kids waving from the " +
        "windows with happy expressions. The train fills the horizontal width of the frame. " +
        "Static side-on composition"
    ),
  },

  // --- Jacked Rat King: Stage 2 mini-boss (6-pose set) ---------------------
  // Generation order matters: rat-king-idle is generated first, then the other
  // five poses cite its palette via `paletteAnchor` to keep fur/denim/crown
  // colors locked across the set.
  "rat-king-idle": {
    type: "char-pose",
    size: "1024x1024",
    prompt: posePrompt(
      RAT_KING_IDENTITY,
      "standing tall and intimidating, crown firmly on head, arms held out and slightly flexed to " +
        "show off his bulging musculature, brass-knuckled fists clenched, slight forward lean, " +
        "snarling threatening expression looking down at the camera, tail lashing behind him"
    ),
  },
  "rat-king-walk-1": {
    type: "char-pose",
    size: "1024x1024",
    prompt: posePrompt(
      RAT_KING_IDENTITY,
      "heavy stomping advance, LEFT foot forward and planted hard on the ground, right foot lifted " +
        "behind mid-step, fur and muscles jiggling with the impact, brass-knuckled fists clenched, " +
        "shoulders rolling aggressively, crown on head, menacing prowl",
      "EXACT color palette match to rat-king-idle: same warm brown-gray fur tone " +
        "(brown dominant, not cool gray), same ripped blue denim shorts, same tarnished brass " +
        "crown with the same chipped jewels, same spiked black leather collar, same brass " +
        "knuckles, same long pink tail."
    ),
  },
  "rat-king-walk-2": {
    type: "char-pose",
    size: "1024x1024",
    prompt: posePrompt(
      RAT_KING_IDENTITY,
      "heavy stomping advance, RIGHT foot forward and planted hard on the ground, left foot lifted " +
        "behind mid-step — visibly a different frame from walk-1 so a 2-frame cycle clearly reads " +
        "as walking, fur and muscles jiggling, brass-knuckled fists clenched, shoulders rolling, " +
        "crown on head, menacing prowl",
      "EXACT color palette match to rat-king-idle AND rat-king-walk-1: same warm brown-gray fur " +
        "tone (brown dominant, not cool gray), same ripped blue denim shorts, same tarnished " +
        "brass crown with the same chipped jewels, same spiked black leather collar, same brass " +
        "knuckles, same long pink tail. No color flicker between walk-1 and walk-2."
    ),
  },
  "rat-king-attack": {
    type: "char-pose",
    size: "1024x1024",
    prompt: posePrompt(
      RAT_KING_IDENTITY,
      "mid-swing of a massive uppercut with his brass-knuckled right fist, arm fully extended and " +
        "driving upward from his hip, body torqued hard into the punch, off-hand cocked back, " +
        "snarling with fangs bared, crown tilted but still on head, tail whipping for balance, " +
        "terrifying",
      "EXACT color palette match to rat-king-idle: same warm brown-gray fur tone (brown dominant, " +
        "not cool gray), same ripped blue denim shorts, same tarnished brass crown with chipped " +
        "jewels, same spiked black leather collar, same brass knuckles, same long pink tail."
    ),
  },
  "rat-king-hit": {
    type: "char-pose",
    size: "1024x1024",
    prompt: posePrompt(
      RAT_KING_IDENTITY,
      "recoiling backward from taking a hit, head tilted and snapped back, pained grimace with " +
        "fangs bared, one brass-knuckled paw raised to his face, other arm flailing out for balance, " +
        "crown knocked askew but still on head, body leaning backward off-balance, tail whipping",
      "EXACT color palette match to rat-king-idle: same warm brown-gray fur tone (brown dominant, " +
        "not cool gray), same ripped blue denim shorts, same tarnished brass crown with chipped " +
        "jewels, same spiked black leather collar, same brass knuckles, same long pink tail."
    ),
  },
  "rat-king-defeat": {
    type: "char-pose",
    size: "1024x1024",
    prompt: posePrompt(
      RAT_KING_IDENTITY,
      "defeated, dropped down on both knees, slumped forward with head hanging low, shoulders " +
        "slack, brass-knuckled fists resting limp on the ground in front of him, the tarnished " +
        "brass crown has fallen off his head and is lying on the ground beside him, tail limp, " +
        "beaten and exhausted expression",
      "EXACT color palette match to rat-king-idle: same warm brown-gray fur tone (brown dominant, " +
        "not cool gray), same ripped blue denim shorts, same spiked black leather collar, same " +
        "brass knuckles, same long pink tail. The fallen crown on the ground is the same " +
        "tarnished brass with chipped jewels."
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

  // --- Rafi: broom ---------------------------------------------------------
  "rafi-idle": {
    type: "char-pose",
    size: "1024x1024",
    prompt: posePrompt(
      RAFI_IDENTITY,
      "standing relaxed in a goofy taunt pose, BOTH hands raised to the sides of his head with palms " +
        "out and fingers splayed like rabbit ears framing his face, TONGUE STUCK OUT cheekily, eyes " +
        "squinted with a silly grin, broom tucked under one armpit so it sticks out behind him, " +
        "weight on back foot"
    ),
  },
  "rafi-walk-1": {
    type: "char-pose",
    size: "1024x1024",
    prompt: posePrompt(
      RAFI_IDENTITY,
      "mid-stride walking cycle, LEFT foot forward and planted, right foot lifted behind, " +
        "broom carried over his right shoulder casually with both hands, focused face"
    ),
  },
  "rafi-walk-2": {
    type: "char-pose",
    size: "1024x1024",
    prompt: posePrompt(
      RAFI_IDENTITY,
      "mid-stride walking cycle, RIGHT foot forward and planted, left foot lifted behind, " +
        "broom carried over his right shoulder casually with both hands, focused face"
    ),
  },
  "rafi-attack-1": {
    type: "char-pose",
    size: "1024x1024",
    prompt: posePrompt(
      RAFI_IDENTITY,
      "broom wind-up pose, both hands gripping the wooden handle, broom raised straight overhead " +
        "with bristles pointing up ready to strike downward, front leg braced, fierce battle yell"
    ),
  },
  "rafi-attack-2": {
    type: "char-pose",
    size: "1024x1024",
    prompt: posePrompt(
      RAFI_IDENTITY,
      "broom mid-sweep horizontal slash, broom held in both hands swinging horizontally outward to " +
        "the right with the bristled end leading, body rotated into the swing, motion implied by " +
        "broom angle, gritted teeth"
    ),
  },
  "rafi-hit": {
    type: "char-pose",
    size: "1024x1024",
    prompt: posePrompt(
      RAFI_IDENTITY,
      "staggered back from a hit, body leaning backward off-balance, broom raised diagonally across " +
        "his face defensively in both hands, eyes scrunched in pain"
    ),
  },

  // --- Lyelle: twin sai ----------------------------------------------------
  "lyelle-idle": {
    type: "char-pose",
    size: "1024x1024",
    prompt: posePrompt(
      LYELLE_IDENTITY,
      "standing relaxed, weight on back foot, one sai held in each hand pointing downward at his sides, " +
        "alert calm expression"
    ),
  },
  "lyelle-walk-1": {
    type: "char-pose",
    size: "1024x1024",
    prompt: posePrompt(
      LYELLE_IDENTITY,
      "mid-stride walking cycle, LEFT foot forward and planted, right foot lifted behind, " +
        "both sai held in low guard in front of him, blades angled forward, focused face"
    ),
  },
  "lyelle-walk-2": {
    type: "char-pose",
    size: "1024x1024",
    prompt: posePrompt(
      LYELLE_IDENTITY,
      "mid-stride walking cycle, RIGHT foot forward and planted, left foot lifted behind, " +
        "both sai held in low guard in front of him, blades angled forward, focused face"
    ),
  },
  "lyelle-attack-1": {
    type: "char-pose",
    size: "1024x1024",
    prompt: posePrompt(
      LYELLE_IDENTITY,
      "sai cross-strike action pose, both sai swinging inward past each other across his chest " +
        "in an X-shape, body leaning into the strike, fierce yell"
    ),
  },
  "lyelle-attack-2": {
    type: "char-pose",
    size: "1024x1024",
    prompt: posePrompt(
      LYELLE_IDENTITY,
      "sai outward thrust, both sai stabbing forward fully extended in front of him, arms " +
        "straight out, front leg lunged forward, fierce expression"
    ),
  },
  "lyelle-hit": {
    type: "char-pose",
    size: "1024x1024",
    prompt: posePrompt(
      LYELLE_IDENTITY,
      "staggered back from a hit, body leaning backward off-balance, ONE sai raised defensively " +
        "across his face, other sai flailing outward, eyes scrunched in pain"
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

  // --- Dean: comically oversized warhammer (3yo toddler hero) ---------------
  "dean-idle": {
    type: "char-pose",
    size: "1024x1024",
    prompt: posePrompt(
      DEAN_IDENTITY,
      "standing braced with both tiny arms wrapped around the wooden shaft of the massive " +
        "warhammer, the warhammer head resting on the ground next to his feet (it comes up to his " +
        "chest), feet planted wide, small proud determined expression"
    ),
  },
  "dean-walk-1": {
    type: "char-pose",
    size: "1024x1024",
    prompt: posePrompt(
      DEAN_IDENTITY,
      "mid-stride toddling cycle, LEFT foot forward and planted, right foot lifted behind, " +
        "dragging the huge warhammer along the ground with both hands on the shaft behind him " +
        "because it's too heavy to carry, tongue poking out in concentration"
    ),
  },
  "dean-walk-2": {
    type: "char-pose",
    size: "1024x1024",
    prompt: posePrompt(
      DEAN_IDENTITY,
      "mid-stride toddling cycle, RIGHT foot forward and planted, left foot lifted behind, " +
        "dragging the huge warhammer along the ground with both hands on the shaft behind him, " +
        "tongue poking out in concentration"
    ),
  },
  "dean-attack-1": {
    type: "char-pose",
    size: "1024x1024",
    prompt: posePrompt(
      DEAN_IDENTITY,
      "mid-swing overhead warhammer SMASH — both tiny hands gripping the shaft, the gigantic " +
        "iron hammer head arcing down past his head toward the ground in front of him, body " +
        "leaning into the swing, mouth open in a tiny battle cry, motion lines"
    ),
  },
  "dean-attack-2": {
    type: "char-pose",
    size: "1024x1024",
    prompt: posePrompt(
      DEAN_IDENTITY,
      "follow-through of a huge horizontal warhammer sweep — body fully rotated to one side, " +
        "the oversized iron warhammer head extended out in front of him at waist height, tiny " +
        "feet planted, fierce toddler scowl, wind-whooshing motion lines behind the hammer"
    ),
  },
  "dean-hit": {
    type: "char-pose",
    size: "1024x1024",
    prompt: posePrompt(
      DEAN_IDENTITY,
      "staggered back from a hit and knocked onto his butt, sitting on the ground with legs " +
        "splayed, the huge warhammer tipped over beside him, big teary blue eyes scrunched, " +
        "lower lip pouting, one tiny hand raised toward camera"
    ),
  },

  // --- Sewer Colossus: final boss (6 Phase 1 poses + 6 Phase 2 poses) ------
  // Generation order: each phase's idle is generated first so the palette
  // anchor on the remaining five poses can reference it and lock colors.

  // Phase 1: "The Sewer Lord" — humanoid sewer rat-mutant.
  "sewer-colossus-p1-idle": {
    type: "char-pose",
    size: "1024x1024",
    prompt: posePrompt(
      SEWER_COLOSSUS_P1_IDENTITY,
      "standing tall and imposing in a menacing idle stance, tattered trench coat hanging open, " +
        "clawed gauntleted fists clenched at his sides, shoulders hunched forward, snarling down " +
        "at the camera with yellow eyes glowing, ringed tail lashing behind him, green ooze " +
        "dripping from his gauntlets"
    ),
  },
  "sewer-colossus-p1-walk-1": {
    type: "char-pose",
    size: "1024x1024",
    prompt: posePrompt(
      SEWER_COLOSSUS_P1_IDENTITY,
      "heavy stomping advance, LEFT muck-caked boot forward and planted hard on the ground, right " +
        "foot lifted behind mid-step, clawed gauntleted fists clenched, trench coat flaring from " +
        "motion, shoulders rolling aggressively, menacing prowl, ringed tail swinging behind",
      SEWER_COLOSSUS_P1_ANCHOR
    ),
  },
  "sewer-colossus-p1-walk-2": {
    type: "char-pose",
    size: "1024x1024",
    prompt: posePrompt(
      SEWER_COLOSSUS_P1_IDENTITY,
      "heavy stomping advance, RIGHT muck-caked boot forward and planted hard on the ground, left " +
        "foot lifted behind mid-step — visibly a different frame from walk-1 so a 2-frame cycle " +
        "clearly reads as walking, clawed gauntleted fists clenched, trench coat flaring, " +
        "shoulders rolling, menacing prowl, ringed tail swinging behind",
      SEWER_COLOSSUS_P1_ANCHOR + " No color flicker between walk-1 and walk-2."
    ),
  },
  "sewer-colossus-p1-attack": {
    type: "char-pose",
    size: "1024x1024",
    prompt: posePrompt(
      SEWER_COLOSSUS_P1_IDENTITY,
      "mid-swing of a massive overhead claw strike, right arm raised high with the rusted steel " +
        "clawed gauntlet slashing downward, trench coat flared by the motion, off-hand cocked back " +
        "for balance, body torqued hard into the attack, fangs bared in a snarl, powerful windup " +
        "pose",
      SEWER_COLOSSUS_P1_ANCHOR
    ),
  },
  "sewer-colossus-p1-hit": {
    type: "char-pose",
    size: "1024x1024",
    prompt: posePrompt(
      SEWER_COLOSSUS_P1_IDENTITY,
      "recoiling backward from taking a hit, head snapped back, pained snarl with fangs bared, one " +
        "clawed gauntleted arm raised defensively across his face, other arm flailing out for " +
        "balance, body leaning backward off-balance, trench coat flared back, ringed tail whipping",
      SEWER_COLOSSUS_P1_ANCHOR
    ),
  },
  "sewer-colossus-p1-defeat": {
    type: "char-pose",
    size: "1024x1024",
    prompt: posePrompt(
      SEWER_COLOSSUS_P1_IDENTITY,
      "HALF-DEFEATED but about to transform — dropped down on one knee, slumped forward slightly, " +
        "tattered trench coat beginning to rip further across the shoulders, wisps of green energy " +
        "starting to leak from cracks in his fur, clawed gauntleted fists planted on the ground in " +
        "front of him, ringed tail limp, exhausted snarl with fangs bared, yellow eyes flickering. " +
        "Smoke and green vapor rising from his shoulders — mid-transformation cliffhanger pose",
      SEWER_COLOSSUS_P1_ANCHOR
    ),
  },

  // Phase 2: "The Sewer Colossus" — mutated hulking colossus.
  "sewer-colossus-p2-idle": {
    type: "char-pose",
    size: "1024x1024",
    prompt: posePrompt(
      SEWER_COLOSSUS_P2_IDENTITY,
      "standing in a colossal menacing idle stance, all FOUR arms spread and flexed to show off " +
        "his monstrous bulk, both sets of clawed fists clenched, the two upper arms raised wide " +
        "and the two smaller lower arms tensed at his ribs, shoulders massively hunched forward " +
        "with black spikes bristling, snarling down at the camera with red eyes blazing, " +
        "electrical green energy crackling around all four fists, ringed tail lashing hard behind " +
        "him, shredded trench coat hanging in strips"
    ),
  },
  "sewer-colossus-p2-walk-1": {
    type: "char-pose",
    size: "1024x1024",
    prompt: posePrompt(
      SEWER_COLOSSUS_P2_IDENTITY,
      "earth-shaking stomping advance, LEFT muck-caked boot forward and planted hard on the ground, " +
        "right foot lifted behind mid-step, all four arms in motion, upper arms swinging at sides, " +
        "smaller lower arms flexed at ribs, shredded trench coat strips flaring from motion, " +
        "shoulders rolling aggressively with spikes bristling, feral prowl, ringed tail swinging, " +
        "green energy arcing from fists",
      SEWER_COLOSSUS_P2_ANCHOR
    ),
  },
  "sewer-colossus-p2-walk-2": {
    type: "char-pose",
    size: "1024x1024",
    prompt: posePrompt(
      SEWER_COLOSSUS_P2_IDENTITY,
      "earth-shaking stomping advance, RIGHT muck-caked boot forward and planted hard on the " +
        "ground, left foot lifted behind mid-step — visibly a different frame from p2-walk-1 so a " +
        "2-frame cycle clearly reads as walking, all four arms in motion, shredded coat strips " +
        "flaring, shoulders rolling, spikes bristling, feral prowl, ringed tail swinging, green " +
        "energy arcing from fists",
      SEWER_COLOSSUS_P2_ANCHOR + " No color flicker between p2-walk-1 and p2-walk-2."
    ),
  },
  "sewer-colossus-p2-attack": {
    type: "char-pose",
    size: "1024x1024",
    prompt: posePrompt(
      SEWER_COLOSSUS_P2_IDENTITY,
      "mid-strike of a devastating four-arm haymaker combo, both upper arms swinging inward in " +
        "massive arcs across his chest while both smaller lower arms thrust forward with claws " +
        "extended, body rotated hard into the quad-punch, crackling green electrical energy " +
        "explosively arcing from all four fists, fangs bared in a feral roar, red eyes blazing, " +
        "shredded trench coat strips whipped by the motion, spikes bristling, powerful impact pose",
      SEWER_COLOSSUS_P2_ANCHOR
    ),
  },
  "sewer-colossus-p2-hit": {
    type: "char-pose",
    size: "1024x1024",
    prompt: posePrompt(
      SEWER_COLOSSUS_P2_IDENTITY,
      "recoiling backward from taking a hit, head snapped back, feral pained roar with fangs fully " +
        "bared, two arms (one upper, one lower) raised defensively across his face while the other " +
        "two arms flail outward for balance, body leaning backward off-balance, shredded coat " +
        "strips flared back, spikes bristling, ringed tail whipping, green energy sputtering and " +
        "leaking from fists",
      SEWER_COLOSSUS_P2_ANCHOR
    ),
  },
  "sewer-colossus-p2-defeat": {
    type: "char-pose",
    size: "1024x1024",
    prompt: posePrompt(
      SEWER_COLOSSUS_P2_IDENTITY,
      "fully defeated, collapsed onto both knees, slumped forward with massive head hanging low, " +
        "all four shoulders slack, both upper clawed fists resting limp on the ground in front of " +
        "him and both smaller lower arms dangling at his sides, ringed tail splayed limp behind, " +
        "red eyes DIMMED to a faint ember glow (no longer blazing), feral rage replaced by " +
        "exhausted beaten expression, shredded coat hanging in tatters, spikes drooping, thin " +
        "smoke rising from his shoulders, last wisps of fading green energy curling off his fists",
      SEWER_COLOSSUS_P2_ANCHOR + " The red eyes should be clearly DIMMED, not blazing."
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

// Ordered list of the 12 Sewer Colossus pose subjects for --colossus.
// Phase 1 idle generates first so its palette anchors the rest of Phase 1;
// same for Phase 2 idle. Order also mirrors the dramatic narrative: all of
// Phase 1, then the Phase 2 transformation sequence.
const COLOSSUS_POSES = [
  "sewer-colossus-p1-idle",
  "sewer-colossus-p1-walk-1",
  "sewer-colossus-p1-walk-2",
  "sewer-colossus-p1-attack",
  "sewer-colossus-p1-hit",
  "sewer-colossus-p1-defeat",
  "sewer-colossus-p2-idle",
  "sewer-colossus-p2-walk-1",
  "sewer-colossus-p2-walk-2",
  "sewer-colossus-p2-attack",
  "sewer-colossus-p2-hit",
  "sewer-colossus-p2-defeat",
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
    console.error("       node tools/generate-sprites.js --colossus");
    console.error("Supported subjects:\n  " + Object.keys(SUBJECTS).join("\n  "));
    process.exit(1);
  }

  let subjects;
  if (args.length === 1 && args[0] === "--all-poses") {
    subjects = ALL_POSES;
  } else if (args.length === 1 && args[0] === "--colossus") {
    subjects = COLOSSUS_POSES;
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
