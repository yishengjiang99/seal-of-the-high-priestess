"""Build the iso terrain/prop atlas -> assets/art/world.png + world.json."""
import json, os, sys, math
sys.path.insert(0, os.path.dirname(__file__))
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageChops
from tiles import *

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'assets', 'art')

items = {}   # name -> (img, (ax, ay))


def ground(name, tex):
    items[name] = (apply_mask(to_iso(tex), diamond_mask(inset=-0.6)), (DW / 2, DH / 2))


def edge_decal(name, tex, edge, width=0.22, seed=0, foam=False):
    """Band along one diamond edge with an irregular inner border. edge in NE,NW,SE,SW (screen)."""
    n = TEX
    r = rs(seed)
    m = Image.new('L', (n, n), 0)
    d = ImageDraw.Draw(m)
    w = int(n * width)
    # in texture space: u axis -> screen down-right (x+), v axis -> screen down-left (y+)
    # NE edge = v==0 row (top), NW = u==0 column, SE = u==n, SW = v==n
    pts = []
    for i in range(0, n + 1, 8):
        j = w + r.randint(-w // 2, w // 2)
        pts.append((i, j))
    poly = [(0, 0)] + pts + [(n, 0)]
    d.polygon(poly, fill=255)
    m = m.filter(ImageFilter.GaussianBlur(2.5 if not foam else 4))
    rot = {'NE': 0, 'SE': -90, 'SW': 180, 'NW': 90}[edge]
    m = m.rotate(rot)
    t = tex.copy()
    t.putalpha(ImageChops.multiply(t.getchannel('A'), m))
    img = apply_mask(to_iso(t), diamond_mask(inset=-0.6))
    items[name] = (img, (DW / 2, DH / 2))


def blk(name, top, l, r, h):
    items[name] = (block(top, l, r, h), (DW / 2, DH / 2 + h))


def prop(name, res, scaled=True):
    img, anchor = res
    if scaled:
        anchor = (anchor[0] * RES, anchor[1] * RES)
    items[name] = (img, anchor)


def main():
    # Ground is painted at runtime from tools/art/terrain.py materials.

    # ---- blocks ----
    hw = DW // 2
    WALL_H = int(LV * 1.5)
    ROOF_H = int(LV * 2.6)
    plaster = flat_tex(100, '#f1e6cc', 0.06, 30)
    blk('wall_plaster', plaster, wall_side(hw, WALL_H, seed=1), wall_side(hw, WALL_H, seed=2), WALL_H)
    blk('wall_plaster_win', plaster, wall_side(hw, WALL_H, seed=3, window=True), wall_side(hw, WALL_H, seed=4, window=True), WALL_H)
    blk('wall_plaster_door', plaster, wall_side(hw, WALL_H, seed=5, door=True), wall_side(hw, WALL_H, seed=6), WALL_H)
    stone_top = flat_tex(101, '#e4e0d6', 0.06, 30)
    blk('wall_stone', stone_top, wall_side(hw, WALL_H, '#dcd6ca', seed=7, kind='stone'), wall_side(hw, WALL_H, '#dcd6ca', seed=8, kind='stone'), WALL_H)
    blk('wall_stone_win', stone_top, wall_side(hw, WALL_H, '#dcd6ca', seed=9, kind='stone', window=True), wall_side(hw, WALL_H, '#dcd6ca', seed=10, kind='stone', window=True), WALL_H)
    blk('wall_stone_door', stone_top, wall_side(hw, WALL_H, '#dcd6ca', seed=11, kind='stone', door=True), wall_side(hw, WALL_H, '#dcd6ca', seed=12, kind='stone'), WALL_H)
    wood_top = plank_tex(102, '#5e3e26')
    blk('wall_wood', wood_top, wall_side(hw, WALL_H, '#6e4a2c', seed=13, kind='wood'), wall_side(hw, WALL_H, '#6e4a2c', seed=14, kind='wood'), WALL_H)
    blk('wall_pavilion', wood_top, wall_side(hw, WALL_H, seed=31, kind='pavilion'), wall_side(hw, WALL_H, seed=32, kind='pavilion'), WALL_H)
    for nm, col in (('roof_green', '#3f9a50'), ('roof_red', '#c2483e'), ('roof_blue', '#3f6fb0'), ('roof_slate', '#4a5268')):
        top = wall_side(TEX, TEX, col, seed=15, kind='roof')
        blk(nm, top, wall_side(hw, ROOF_H, col, seed=16, kind='roof'), wall_side(hw, ROOF_H, col, seed=17, kind='roof'), ROOF_H)
    hedge_top = grass_tex(103, hue='#3a8a34')
    items['void'] = (Image.new('RGBA', (DW, DH), (0, 0, 0, 0)), (DW / 2, DH / 2))

    # ---- props ----
    for i in range(3):
        prop(f'tree_oak{i}', prop_tree(200 + i, 'oak'))
    for i in range(2):
        prop(f'tree_blossom{i}', prop_tree(210 + i, 'blossom'))
        prop(f'tree_pine{i}', prop_tree(220 + i, 'pine'))
        prop(f'tree_dead{i}', prop_tree(230 + i, 'dead'))
        prop(f'bush{i}', prop_bush(240 + i))
        prop(f'rock_big{i}', prop_rock(250 + i, True))
        prop(f'rubble{i}', prop_rubble(260 + i))
        prop(f'lily{i}', prop_lily(270 + i))
    prop('bushf', prop_bush(245, '#3f9e3c', (246, 160, 200, 255)))
    prop('lamp', prop_lamp())
    prop('statue', prop_statue())
    prop('fountain', prop_fountain())
    prop('crate', prop_crate())
    prop('bench', prop_bench())
    prop('stall', prop_stall())
    prop('fence_x', prop_fence('x'))
    prop('fence_y', prop_fence('y'))
    prop('altar', prop_altar())
    prop('column', prop_column())
    prop('column_red', prop_column_red())
    prop('lantern', prop_lantern_stone())
    prop('chest', prop_chest())
    prop('stairs', prop_stairs())
    prop('shadow', contact_shadow(), False)
    prop('glow_warm', glow(64, (255, 200, 120)), False)
    prop('glow_cool', glow(64, (170, 220, 255)), False)
    prop('glow_red', glow(64, (255, 80, 90)), False)
    prop('marker', marker(), False)

    # ---- pack (shelf) ----
    names = sorted(items, key=lambda n: -items[n][0].size[1])
    AW = 4096
    x = y = rowh = 0
    pos = {}
    pad = 2
    for n in names:
        w, h = items[n][0].size
        if x + w + pad > AW:
            x = 0; y += rowh + pad; rowh = 0
        pos[n] = (x, y)
        x += w + pad
        rowh = max(rowh, h)
    AH = y + rowh
    atlas = Image.new('RGBA', (AW, AH), (0, 0, 0, 0))
    meta = {}
    for n in names:
        img, (ax, ay) = items[n]
        px, py = pos[n]
        atlas.alpha_composite(img, (px, py))
        meta[n] = [px, py, img.size[0], img.size[1], round(ax, 1), round(ay, 1)]
    os.makedirs(OUT, exist_ok=True)
    p = os.path.join(OUT, 'world.png')
    atlas.save(p, optimize=True)
    json.dump({'scale': 2 * RES, 'dw': DW, 'dh': DH, 'lv': LV, 'frames': meta}, open(os.path.join(OUT, 'world.json'), 'w'))
    print('atlas', atlas.size, os.path.getsize(p) // 1024, 'KB', len(meta), 'frames')


if __name__ == '__main__':
    main()
