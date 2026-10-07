"""Build character sprite sheets -> assets/art/chars/*.png + layout JSON fragment.
python3 tools/art/build_chars.py [ids...]"""
import json, os, sys
from multiprocessing import Pool
sys.path.insert(0, os.path.dirname(__file__))
from PIL import Image
from chars import Rig, FW, FH, AX, AY, sheet_rows, npc_frames
import specs

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'assets', 'art', 'chars')
HEROES = {'elara': specs.ELARA, 'kael': specs.KAEL, 'lyra': specs.LYRA, 'thorn': specs.THORN}
NPCS = specs.NPCS


def job(a):
    kind, cid, r, c, yaw, pose = a
    spec = HEROES.get(cid) or NPCS[cid]
    return kind, cid, r, c, Rig(spec, yaw, pose).draw()


def main():
    want = sys.argv[1:] or (list(HEROES) + ['npcs'])
    os.makedirs(OUT, exist_ok=True)
    jobs, layout = [], {}
    for cid in want:
        if cid in HEROES:
            rows = sheet_rows(True)
            layout[cid] = {'fw': FW, 'fh': FH, 'ax': AX, 'ay': AY, 'rows': {}}
            for r, (name, yaw, poses) in enumerate(rows):
                layout[cid]['rows'][f'{name}:{yaw}'] = [r, len(poses)]
                for c, p in enumerate(poses):
                    jobs.append(('hero', cid, r, c, yaw, p))
    if 'npcs' in want:
        frames = npc_frames()
        layout['npcs'] = {'fw': FW, 'fh': FH, 'ax': AX, 'ay': AY, 'cols': [f'{y}:{i % 2}' for i, (y, _) in enumerate(frames)], 'rows': {}}
        for r, nid in enumerate(NPCS):
            layout['npcs']['rows'][nid] = r
            for c, (yaw, p) in enumerate(frames):
                jobs.append(('npc', nid, r, c, yaw, p))
    sheets = {}
    with Pool(os.cpu_count()) as pool:
        for kind, cid, r, c, im in pool.imap_unordered(job, jobs, chunksize=2):
            key = 'npcs' if kind == 'npc' else cid
            if key not in sheets:
                if kind == 'npc':
                    sheets[key] = Image.new('RGBA', (FW * len(npc_frames()), FH * len(NPCS)))
                else:
                    sheets[key] = Image.new('RGBA', (FW * 8, FH * len(sheet_rows(True))))
            sheets[key].alpha_composite(im, (c * FW, r * FH))
    for key, im in sheets.items():
        p = os.path.join(OUT, key + '.png')
        im.save(p, optimize=True)
        print(key, im.size, os.path.getsize(p) // 1024, 'KB')
    lp = os.path.join(OUT, 'layout.json')
    old = json.load(open(lp)) if os.path.exists(lp) else {}
    old.update(layout)
    json.dump(old, open(lp, 'w'), indent=1)


if __name__ == '__main__':
    main()
