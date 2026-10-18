#!/usr/bin/env python3
"""Pack generated hero art (tools/art/hero/src/*.jpg, made with GenerateImage from the locked
style frame) into game assets:
  assets/art/hero.png + hero.json   keyed sprites (props, Elara, Rootguard) with per-frame scale
  assets/art/fx.jpg  + fx.json      additive VFX on black
  assets/art/terrain/*.jpg          seamless ground materials (+ medallion.png)
  assets/ui/*.png                   round HUD icons
Everything is original (AI-generated for this project, no third-party art)."""
import json, os, sys, math
import numpy as np
from PIL import Image, ImageFilter, ImageEnhance
sys.path.insert(0, os.path.dirname(__file__))
from keylib import *

HERE = os.path.dirname(__file__)
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
SRC = os.path.join(HERE, "src")
OUT = os.path.join(ROOT, "assets", "art")
PPU = float(os.environ.get("HERO_PPU", "3.2"))      # atlas px per world unit (tile diamond = 80 units wide)

def S(n): return load(os.path.join(SRC, n + ".jpg"))

frames = {}   # name -> (img, ppu, ax, ay)  anchor in atlas px

def add(name, im, units, by="w", anchor=("c", "b"), unit_basis=None):
    b = trim(im)
    px = b.width if by == "w" else b.height
    ppu_native = px / units
    ppu = min(PPU, ppu_native)
    f = ppu / ppu_native
    if f < 0.999:
        b = b.resize((max(1, round(b.width * f)), max(1, round(b.height * f))), Image.LANCZOS)
    ax = b.width * (0.5 if anchor[0] == "c" else anchor[0])
    ay = b.height * ({"b": 0.985, "c": 0.5}[anchor[1]] if isinstance(anchor[1], str) else anchor[1])
    frames[name] = (b, ppu, ax, ay)
    return b

def prop(name, src, units, by="w", anchor=("c", "b")):
    return add(name, key_green(S(src)), units, by, anchor)

# ---- props -------------------------------------------------------------------
prop("pavilion", "pavilion", 240)
prop("gate", "gate", 200)
prop("stairs", "stairs", 250, anchor=("c", 0.93))
prop("bridge", "bridge", 275, anchor=("c", 0.62))
prop("lantern", "lantern", 92, by="h")
prop("pillar", "pillar", 150, by="h")
prop("cherry", "tree_cherry", 215, anchor=("c", 0.97))
prop("oak", "tree_dark", 195, anchor=("c", 0.97))
prop("rocks", "rocks", 125, anchor=("c", 0.93))
prop("bush_purple", "bush_purple", 96, anchor=("c", 0.9))
prop("bush_white", "bush_white", 96, anchor=("c", 0.9))
prop("bush_green", "bush_green", 100, anchor=("c", 0.9))
prop("flowers", "flowers", 150, anchor=("c", 0.5))
prop("lotus", "lotus", 135, anchor=("c", 0.55))
# mirrored variants (second axis of the iso grid)
for n in ("bridge", "stairs", "gate"):
    b, ppu, ax, ay = frames[n]
    frames[n + "_m"] = (b.transpose(Image.FLIP_LEFT_RIGHT), ppu, b.width - ax, ay)

# ---- characters: rows of 3 poses, shared scale per sheet, feet anchored -------------
def sheet(prefix, src, n=3, height=126, align="feet", crop_x=None):
    k = key_green(S(src))
    figs = split_row(k, n)
    figs = [trim(f) for f in figs]
    hmax = max(f.height for f in figs)
    sc = height / hmax * 0 + 1.0
    out = []
    for i, f in enumerate(figs):
        a = np.asarray(f)[..., 3] > 40
        h = f.height
        lo = a[int(h * 0.55):]
        xs = np.where(lo.any(0))[0] if lo.any() else np.arange(f.width)
        cx = float(np.average(np.arange(f.width), weights=lo.sum(0) + 1e-6)) if lo.any() else f.width / 2
        out.append((f, cx))
    ppu_native = hmax / height
    ppu = min(PPU, ppu_native)
    fac = ppu / ppu_native
    for i, (f, cx) in enumerate(out):
        g = f.resize((max(1, round(f.width * fac)), max(1, round(f.height * fac))), Image.LANCZOS)
        frames[f"{prefix}_{i}"] = (g, ppu, cx * fac, g.height * 0.985)

sheet("elara_sw", "elara_sw", 3, height=128)
sheet("elara_ne", "elara_ne", 3, height=128)
sheet("elara_cast", "elara_cast", 3, height=128)
sheet("root", "root_a", 3, height=150)
sheet("kael_sw", "kael_sw", 3, height=130)
sheet("kael_ne", "kael_ne", 3, height=130)

def npcs(src, names, tall=124):
    figs = [trim(f) for f in split_row(key_green(S(src)), len(names))]
    hmax = max(f.height for f in figs)
    ppu_native = hmax / tall; ppu = min(PPU, ppu_native); fac = ppu / ppu_native
    for n, f in zip(names, figs):
        g = f.resize((max(1, round(f.width * fac)), max(1, round(f.height * fac))), Image.LANCZOS)
        a = np.asarray(g)[..., 3] > 40; lo = a[int(g.height * 0.55):]
        cx = float(np.average(np.arange(g.width), weights=lo.sum(0) + 1e-6))
        frames["npc_" + n] = (g, ppu, cx, g.height * 0.985)
npcs("npc_a", ["abbess", "monk", "pilgrim"])
npcs("npc_b", ["acolyte", "villagerf", "elder"])

# ---- pack --------------------------------------------------------------------------
def pack(frames, width=4096, gap=4):
    items = sorted(frames.items(), key=lambda kv: -kv[1][0].height)
    x = y = rowh = 0; pos = {}
    for name, (im, ppu, ax, ay) in items:
        if x + im.width + gap > width:
            x = 0; y += rowh + gap; rowh = 0
        pos[name] = (x, y); x += im.width + gap; rowh = max(rowh, im.height)
    H = y + rowh
    H = 1 << (H - 1).bit_length()
    atlas = Image.new("RGBA", (width, H), (0, 0, 0, 0))
    meta = {}
    for name, (im, ppu, ax, ay) in items:
        atlas.alpha_composite(im, pos[name])
        meta[name] = [pos[name][0], pos[name][1], im.width, im.height, round(ax, 1), round(ay, 1), round(1.0 / ppu, 5)]
    return atlas, meta

atlas, meta = pack(frames)
pass
try:
    atlas.save(os.path.join(OUT, "hero.webp"), quality=88, method=6)
except Exception as e:
    print("webp skipped", e)
json.dump({"frames": meta, "w": atlas.width, "h": atlas.height}, open(os.path.join(OUT, "hero.json"), "w"), separators=(",", ":"))
print("hero atlas", atlas.size, os.path.getsize(os.path.join(OUT, "hero.webp")) // 1024, "KB webp")

# ---- VFX (additive) ----------------------------------------------------------------
def fx_crop(name, thr=26):
    im = S(name); a = np.asarray(im).astype(np.float32)
    lum = a.max(-1)
    ys, xs = np.where(lum > thr)
    b = (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)
    return im.crop(b)
fx = {"circle": fx_crop("fx_circle"), "swirl": fx_crop("fx_swirl"), "burst": fx_crop("fx_burst")}
scale = {"circle": 0.8, "swirl": 0.8, "burst": 0.7}
fm = {}; x = 0; H = 0
for k, v in fx.items():
    v = v.resize((round(v.width * scale[k]), round(v.height * scale[k])), Image.LANCZOS); fx[k] = v
    fm[k] = [x, 0, v.width, v.height]; x += v.width + 2; H = max(H, v.height)
fa = Image.new("RGB", (x, H))
for k, v in fx.items(): fa.paste(v, (fm[k][0], 0))
fa.save(os.path.join(OUT, "fx.jpg"), quality=90)
json.dump(fm, open(os.path.join(OUT, "fx.json"), "w"))

# ---- HUD icons ---------------------------------------------------------------------
UI = os.path.join(ROOT, "assets", "ui"); os.makedirs(UI, exist_ok=True)
def icons(src, names, n):
    k = key_green(S(src))
    figs = split_row(k, n)
    for f, nm in zip(figs, names):
        f = trim(f, 1); s = max(f.size); sq = Image.new("RGBA", (s, s), (0, 0, 0, 0)); sq.alpha_composite(f, ((s - f.width) // 2, (s - f.height) // 2))
        sq = sq.resize((200, 200), Image.LANCZOS); sq.save(os.path.join(UI, nm + ".png"), optimize=True)
icons("hud_skills", ["skill_swirl", "skill_sun", "skill_moon", "skill_shield"], 4)
icons("hud_ctx", ["btn_camp", "btn_menu", "btn_back"], 3)

# ---- terrain ----------------------------------------------------------------------
TER = os.path.join(OUT, "terrain"); os.makedirs(TER, exist_ok=True)
def crop_c(im, size, cx=0.5, cy=0.5):
    x = int(im.width * cx - size / 2); y = int(im.height * cy - size / 2)
    return im.crop((x, y, x + size, y + size))
def grade(im, sat=1.0, bright=1.0, tint=None, tint_a=0.0):
    im = ImageEnhance.Color(im).enhance(sat); im = ImageEnhance.Brightness(im).enhance(bright)
    if tint is not None:
        im = Image.blend(im, Image.new("RGB", im.size, tint), tint_a)
    return im
def save_tex(name, im, period):
    im = im.resize((period, period), Image.LANCZOS)
    im.save(os.path.join(TER, name + ".jpg"), quality=86, optimize=True)

plaza = mirror_tile(crop_c(S("tex_plaza"), 440, 0.5, 0.5))          # 880, mirror-tiled (grid keeps its look)
save_tex("slab", grade(plaza, 1.0, 0.92, (226, 178, 120), 0.10), 1320)
save_tex("inlay", grade(plaza, 1.12, 0.98, (232, 190, 110), 0.18), 1320)
save_tex("plaza", grade(plaza, 0.95, 0.96), 1320)
border = seamless_cross(crop_c(S("tex_rock"), 640)); save_tex("border", grade(border, 0.9, 0.9), 640)
save_tex("cobble", seamless_cross(crop_c(S("tex_rock"), 640, 0.5, 0.5)), 640)
save_tex("rim", grade(border, 0.8, 0.62), 640)
grass = seamless_cross(crop_c(S("tex_grass"), 640, 0.5, 0.5))
save_tex("grass", grass, 640)
save_tex("grass_dusk", grade(grass, 1.05, 0.86, (60, 70, 120), 0.10), 640)
save_tex("grass_dark", grade(grass, 0.95, 0.62, (30, 50, 70), 0.10), 640)
gf = seamless_cross(crop_c(S("tex_grass_flowers"), 640, 0.5, 0.5))
save_tex("flowerbed", grade(gf, 1.15, 0.95), 640)
earth = seamless_cross(crop_c(S("tex_earth"), 640, 0.5, 0.5))
save_tex("dirt", earth, 640); save_tex("ash", grade(earth, 0.25, 0.8), 640); save_tex("corrupt", grade(earth, 0.9, 0.55, (70, 30, 90), 0.25), 640)
water = seamless_cross(crop_c(S("tex_water"), 640, 0.5, 0.5))
save_tex("water", water, 640); save_tex("deep", grade(water, 1.0, 0.55, (10, 40, 70), 0.2), 640)
save_tex("marble", grade(plaza, 0.35, 1.12), 1320); save_tex("pale", grade(plaza, 0.5, 1.15), 1320)
# medallion centrepiece (keyed, top-down; the renderer projects it)
md = trim(key_green(S("medallion")), 2); s = max(md.size)
md = md.resize((768, round(768 * md.height / md.width)), Image.LANCZOS)
md.save(os.path.join(TER, "medallion.webp"), quality=90, method=6)
print("terrain done")
