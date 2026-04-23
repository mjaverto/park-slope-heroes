// src/data/stages.js
// Source of truth for stage / wave configuration. Consumed by BootScene's
// wave manager. Mirrors the shape of characters.js (exported array + a
// `get*(index)` helper).
//
// Each stage has:
//  - name: display name (not yet shown in HUD; reserved for a future banner)
//  - waves: ordered list of wave definitions. Each wave has `rats` = how
//    many street rats to spawn simultaneously at the start of that wave.
//
// v1 ships with a single stage "5th Ave Sidewalks" that ramps 2 -> 3 -> 4.

export const STAGES = [
  {
    name: '5th Ave Sidewalks',
    waves: [
      { rats: 2 },
      { rats: 3 },
      { rats: 4 },
    ],
  },
];

export function getStage(index) {
  return STAGES[index] ?? STAGES[0];
}
