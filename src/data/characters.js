// src/data/characters.js
// Source of truth for the 6 playable kids. Consumed by CharacterSelect
// and by Player/BootScene at spawn time (stats pulled by key).
//
// Stat design notes:
//  - hp: max health.
//  - speed: movement speed px/sec. Rafi fastest; Theo & Dean slowest.
//  - damage: per-attack damage. Aiden is the balanced baseline at 15;
//    Dean is the hardest hitter (warhammer) to offset his tiny size and slow swing.
//  - reach: hitbox offset from the player in the facing direction.
//  - scale: optional display multiplier on top of the base sprite scale.
//    Dean's PNGs were auto-trimmed (ImageMagick -trim + south-gravity extent)
//    to 256×256 so the toddler figure fills the canvas with feet at the bottom.
//    Without compensation that makes him render at ~38% of Aiden (256 vs 1024
//    source × same SCALE). scale: 3.2 brings him to ~80% of Aiden's height,
//    matching the "smaller toddler among 6yo kids" intent. (2.0 was ~50%.)

export const CHARACTERS = [
  {
    key: 'aiden',
    name: 'Aiden',
    weapon: 'Twin Katanas',
    tagline: 'Balanced. Lead.',
    stats: { hp: 100, speed: 200, damage: 15, reach: 30 },
  },
  {
    key: 'theo',
    name: 'Theo',
    weapon: 'Bo Staff',
    tagline: 'Long reach.',
    stats: { hp: 100, speed: 190, damage: 12, reach: 50 },
  },
  {
    key: 'rafi',
    name: 'Rafi',
    weapon: 'Broom',
    tagline: 'Goofy. Sweeps fast.',
    stats: { hp: 90, speed: 230, damage: 12, reach: 35 },
  },
  {
    key: 'matthew',
    name: 'Matthew',
    weapon: 'Nunchucks',
    tagline: 'Flashy combos.',
    stats: { hp: 95, speed: 215, damage: 13, reach: 28 },
  },
  {
    key: 'kathryn',
    name: 'Kathryn',
    weapon: 'Kusarigama',
    tagline: 'Ranged chain pull.',
    stats: { hp: 95, speed: 205, damage: 13, reach: 60 },
  },
  {
    key: 'dean',
    name: 'Dean',
    weapon: 'Giant Warhammer',
    tagline: 'Tiny kid. Huge hammer.',
    stats: { hp: 100, speed: 170, damage: 22, reach: 40, scale: 3.2 },
  },
];

export function getCharacter(key) {
  return CHARACTERS.find((c) => c.key === key) ?? CHARACTERS[0];
}
