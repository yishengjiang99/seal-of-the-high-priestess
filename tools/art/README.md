# Procedural art pipeline (2.5D overhaul)

Everything here is drawn from code: no reference images, no traced or third-party art.
Output goes to `assets/art/` and is bundled with the web build and the iOS app.

    pip install pillow numpy
    python3 tools/art/build_chars.py      # assets/art/chars/*.png + layout.json (party + NPC sheets)
    python3 tools/art/build_tiles.py      # assets/art/world.png/.json (props atlas, RES=1.5 -> scale 3)
    python3 tools/art/terrain.py          # assets/art/terrain/*.jpg (seamless painted ground materials)
    python3 tools/art/build_manifest.py   # js/art-data.js (frame/layout manifest read by js/world.js)

The renderer (`js/world.js`) only loads these images when the `visualOverhaul` flag is on
(`?visual=1`, `SOTH_FEATURE("visual", true)`, or server `FLAGS.visualOverhaul`).
