// src/data/characters.js
// Source of truth for the 6 playable kids. Consumed by CharacterSelect
// and by Player/BootScene at spawn time (stats pulled by key).
//
// Stat design notes:
//  - hp: max health. Ronan is tankiest; Lyelle is glassiest.
//  - speed: movement speed px/sec. Lyelle fastest; Theo & Ronan slowest.
//  - damage: per-attack damage. Aiden is the balanced baseline at 15.
//  - reach: hitbox offset from the player in the facing direction, tuned
//    to each weapon's silhouette. Kathryn's kusarigama is the longest;
//    Lyelle's sai are stubbiest.
// Each kid is distinct in flavor without being strictly stronger/weaker
// than another — higher damage/reach is paid for with lower hp or speed.

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
    key: 'lyelle',
    name: 'Lyelle',
    weapon: 'Twin Sai',
    tagline: 'Fast. Close.',
    stats: { hp: 90, speed: 230, damage: 12, reach: 22 },
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
    key: 'ronan',
    name: 'Ronan',
    weapon: 'Tonfas',
    tagline: 'Defensive counter.',
    stats: { hp: 110, speed: 195, damage: 11, reach: 26 },
  },
];

export function getCharacter(key) {
  return CHARACTERS.find((c) => c.key === key) ?? CHARACTERS[0];
}
