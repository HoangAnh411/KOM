# Third-party city assets

## Temporary city asset set: `temp-kenney-v1`

Downloaded on 2026-09-04 from the authors' official pages and stored as selected,
runtime-ready GLB files under `apps/client/public/assets/city3d/temp/kenney-v1/`.

- **Kenney Fantasy Town Kit 2.0** — buildings, roads, trees and town props.
  Source: https://kenney.nl/assets/fantasy-town-kit
- **Kenney Castle Kit 2.0** — perimeter walls, gates, flags and towers.
  Source: https://kenney.nl/assets/castle-kit
- **Kenney Mini Characters 1.0** — animated ambient townspeople.
  Source: https://kenney.nl/assets/mini-characters

The character animations are embedded inside
`characters/character-female-a.glb` and `characters/character-male-a.glb`, not
stored as separate animation files. Each character GLB contains 32 clips,
including `idle`, `walk`, `sprint`, `jump`, `sit`, `die`, interactions and attack
variants. The current city ambience plays the embedded `walk` clip through a
Three.js `AnimationMixer`.

The source pages identify the packs as **Creative Commons CC0 1.0**. Attribution
is not required, but the source and version are recorded here so every shipped
binary remains auditable. The original archives are not required by the runtime
and are not committed; rerun `scripts/import-city-assets.mjs` against unpacked
official archives to reproduce the selected asset set.

These are temporary authored assets. Gameplay and saved city layouts refer only
to semantic building IDs, never to these filenames, so a future original asset
set can replace them without a server or save-data migration.

## World 3D v2

`apps/client/public/assets/world3d/meridian-256-v2/terrain-lod0.glb` is generated
from this project's shared authored terrain data by `npm run assets:world`; it is
not a third-party asset. Its manifest references the CC0 Kenney models above by
semantic role (`cityTower`, `tree`, `army`, etc.), so an original art pack can
replace those URLs without changing gameplay IDs or persisted layouts.
