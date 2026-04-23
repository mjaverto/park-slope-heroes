// src/data/stages.js
// Source of truth for stage / wave configuration. Consumed by BootScene's
// wave manager. Mirrors the shape of characters.js (exported array + a
// `get*(index)` helper).
//
// Each stage has:
//  - name: display name (not yet shown in HUD; reserved for a future banner)
//  - Legacy (pre-scrolling) arena stages use `waves`: [{ rats: N }, ...].
//  - Scrolling beat-em-up stages use `sections`: [{ triggerX, cameraLockX, rats }]
//    where triggerX is the world-x the player must cross to activate the zone,
//    cameraLockX is where the camera stops panning so the lock-zone is centered,
//    and rats is the number of rats to spawn for that wave.
//    A `sections`-based stage still exposes a `waves`-shape array for HUD
//    compatibility (Wave N / M text).
//
// Stage 1 is a scrolling street with three battle zones. Stages 2/3 (TBD)
// will follow the same shape.

export const STAGES = [
  {
    name: '5th Ave Sidewalks',
    // Three battle zones along the 4608-wide world. Player walks in from the
    // left, hits triggerX, camera locks around cameraLockX, rats spawn.
    sections: [
      { triggerX: 800, cameraLockX: 1024, rats: 2 },
      { triggerX: 2100, cameraLockX: 2350, rats: 3 },
      { triggerX: 3400, cameraLockX: 3650, rats: 4 },
    ],
    // Mirror-shape "waves" so existing HUD code that reads stage.waves.length
    // and indexes currentWaveIndex keeps working without a branch.
    waves: [
      { rats: 2 },
      { rats: 3 },
      { rats: 4 },
    ],
  },
  {
    name: 'JJ Byrne Playground',
    key: 'Stage2',
    // Two rat zones + a final boss zone. Boss section uses `boss: 'rat-king'`
    // instead of `rats: N` so the scene branches on spawn.
    sections: [
      { triggerX: 800, cameraLockX: 1024, rats: 3 },
      { triggerX: 2100, cameraLockX: 2350, rats: 4 },
      { triggerX: 3400, cameraLockX: 3650, boss: 'rat-king' },
    ],
    waves: [
      { rats: 3 },
      { rats: 4 },
      { boss: 'rat-king' },
    ],
  },
];

export function getStage(index) {
  return STAGES[index] ?? STAGES[0];
}
