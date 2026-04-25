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
//    A section may also use `roaches: N` (in addition to `rats: N` and
//    `boss: 'name'`) to spawn a cockroach battle zone instead.
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
      { triggerX: 750, cameraLockX: 1024, rats: 2 },
      { triggerX: 1700, cameraLockX: 1950, roaches: 5 },
      { triggerX: 2700, cameraLockX: 2950, rats: 3 },
      { triggerX: 3700, cameraLockX: 3850, rats: 4 },
    ],
    // Mirror-shape "waves" so existing HUD code that reads stage.waves.length
    // and indexes currentWaveIndex keeps working without a branch.
    waves: [
      { rats: 2 },
      { roaches: 5 },
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
      { triggerX: 750, cameraLockX: 1024, rats: 3 },
      { triggerX: 1700, cameraLockX: 1950, roaches: 6 },
      { triggerX: 2700, cameraLockX: 2950, rats: 4 },
      { triggerX: 3700, cameraLockX: 3850, boss: 'rat-king' },
    ],
    waves: [
      { rats: 3 },
      { roaches: 6 },
      { rats: 4 },
      { boss: 'rat-king' },
    ],
  },
  {
    name: 'Grand Army Plaza',
    key: 'Stage3',
    // Two heavier rat zones + the 2-phase final boss: the Sewer Colossus.
    sections: [
      { triggerX: 750, cameraLockX: 1024, rats: 4 },
      { triggerX: 1700, cameraLockX: 1950, roaches: 8 },
      { triggerX: 2700, cameraLockX: 2950, rats: 5 },
      { triggerX: 3700, cameraLockX: 3850, boss: 'sewer-colossus' },
    ],
    waves: [
      { rats: 4 },
      { roaches: 8 },
      { rats: 5 },
      { boss: 'sewer-colossus' },
    ],
  },
  {
    name: '4th Ave & 9th St',
    key: 'Stage4',
    // Three battle zones leading up to Beakzilla — the muscly pigeon final-final boss.
    sections: [
      { triggerX: 750, cameraLockX: 1024, rats: 4 },
      { triggerX: 1700, cameraLockX: 1950, roaches: 7 },
      { triggerX: 2700, cameraLockX: 2950, rats: 5 },
      { triggerX: 3700, cameraLockX: 3850, boss: 'beakzilla' },
    ],
    waves: [
      { rats: 4 },
      { roaches: 7 },
      { rats: 5 },
      { boss: 'beakzilla' },
    ],
  },
];

export function getStage(index) {
  return STAGES[index] ?? STAGES[0];
}
