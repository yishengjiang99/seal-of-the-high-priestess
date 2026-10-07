"""Isometric terrain, blocks and props (original procedural art).

Ground textures are authored top-down in a square and affine-mapped to the
iso diamond (DW x DH = 160 x 80 px = 80 x 40 logical at 2x). Blocks are
extruded diamonds with textured side faces; props are shaded vector shapes.
Light comes from the upper left.
"""
import math, os, json
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageChops, ImageEnhance

RES = float(os.environ.get('SOTH_ART_RES', '1.5'))   # 1.0 = 2x logical; 1.5 = 3x logical
DW, DH = int(160 * RES), int(80 * RES)
LV = int(48 * RES)          # px per block level (24 logical)
TEX = int(192 * RES)        # square texture size before the iso mapping
rs = np.random.RandomState


def hexc(h):
    h = h.lstrip('#')
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], np.float32)


def noise(n, scale, seed, octaves=3):
    """Tileable-ish value noise in [0,1], n x n."""
    r = rs(seed)
    out = np.zeros((n, n), np.float32)
    amp, tot = 1.0, 0
    for o in range(octaves):
        k = max(2, int(n / scale * (2 ** o)))
        g = r.rand(k, k).astype(np.float32)
        im = Image.fromarray((g * 255).astype(np.uint8)).resize((n, n), Image.BICUBIC)
        out += np.asarray(im, np.float32) / 255 * amp
        tot += amp
        amp *= 0.5
    return out / tot


def colorize(base, var, n):
    """base colour modulated by noise field var in [-1,1]."""
    b = hexc(base)
    return np.clip(b[None, None, :] * (1 + var[..., None]), 0, 255)


def tex_img(rgb):
    return Image.fromarray(rgb.astype(np.uint8), 'RGB').convert('RGBA')


def to_iso(tex, extra=0):
    """Square RGBA texture -> diamond (DW x DH + extra) via affine map."""
    n = tex.size[0]
    # screen (x,y) -> texture (u,v): u = (x/ (DW/2) + y/(DH/2))/2 * n ... solve inverse
    # diamond: top (DW/2,0), right (DW,DH/2), bottom (DW/2,DH), left (0,DH/2)
    # u along top->right edge, v along top->left edge
    a = n / DW
    b = n / DH
    # u = (x - DW/2)/ (DW/2) * n/2 + y/(DH/2) * n/2  ; v = -(x-DW/2)/(DW/2)*n/2 + y/(DH/2)*n/2
    cu = (n / 2) / (DW / 2); cv = (n / 2) / (DH / 2)
    coeffs_u = (cu, cv, -DW / 2 * cu)
    coeffs_v = (-cu, cv, DW / 2 * cu)
    W, H = DW, DH + extra
    out = tex.transform((W, H), Image.AFFINE, coeffs_u + coeffs_v, resample=Image.BICUBIC)
    return out


def diamond_mask(w=DW, h=DH, ss=4, inset=0.0):
    im = Image.new('L', (w * ss, h * ss), 0)
    i = inset * ss
    ImageDraw.Draw(im).polygon([(w * ss / 2, i), (w * ss - i * 2, h * ss / 2), (w * ss / 2, h * ss - i), (i * 2, h * ss / 2)], fill=255)
    return im.resize((w, h), Image.BOX)


def apply_mask(img, mask):
    img = img.copy()
    a = ImageChops.multiply(img.getchannel('A'), mask)
    img.putalpha(a)
    return img


# ---------------------------------------------------------------------------
# Ground textures (top-down squares)
# ---------------------------------------------------------------------------
def grass_tex(seed, flowers=0, dark=False, hue='#56b03c'):
    n = TEX
    r = rs(seed)
    v = (noise(n, 48, seed) - 0.5) * 0.35 + (noise(n, 10, seed + 1) - 0.5) * 0.18
    rgb = colorize(hue, v, n)
    im = tex_img(rgb)
    d = ImageDraw.Draw(im)
    base = hexc(hue)
    for i in range(260):
        x, y = r.randint(0, n), r.randint(0, n)
        L = r.randint(4, 10)
        k = r.uniform(0.75, 1.35)
        c = tuple(int(min(255, cc * k)) for cc in base) + (255,)
        d.line([(x, y), (x + r.randint(-3, 4), y - L)], fill=c, width=2)
    for i in range(flowers):
        x, y = r.randint(10, n - 10), r.randint(10, n - 10)
        col = [(250, 240, 250), (255, 214, 90), (240, 130, 180), (150, 190, 255)][r.randint(0, 4)]
        for a in range(5):
            ang = a * 1.256
            d.ellipse([x + math.cos(ang) * 3 - 2.5, y + math.sin(ang) * 3 - 2.5, x + math.cos(ang) * 3 + 2.5, y + math.sin(ang) * 3 + 2.5], fill=col + (255,))
        d.ellipse([x - 2, y - 2, x + 2, y + 2], fill=(255, 220, 120, 255))
    im = im.filter(ImageFilter.SMOOTH)
    return im


def cobble_tex(seed, c1='#d9c9a8', c2='#b8a684', mortar='#7e705c'):
    n = TEX
    r = rs(seed)
    im = tex_img(colorize(mortar, (noise(n, 20, seed) - 0.5) * 0.3, n))
    d = ImageDraw.Draw(im)
    # jittered grid stones (tile edges wrap so neighbours line up)
    cells = 4
    cs = n / cells
    for j in range(cells):
        for i in range(cells):
            off = (cs / 2) if j % 2 else 0
            cx = i * cs + off + r.uniform(-4, 4)
            cy = j * cs + cs / 2 + r.uniform(-3, 3)
            w = cs * r.uniform(0.40, 0.47)
            h = cs * r.uniform(0.36, 0.44)
            k = r.uniform(0.85, 1.12)
            base = hexc(c1) * k if r.rand() > 0.4 else hexc(c2) * k
            for dx in (-n, 0, n):
                x = cx + dx
                d.rounded_rectangle([x - w, cy - h + 3, x + w, cy + h + 3], radius=10, fill=tuple(int(c * 0.62) for c in base) + (255,))
                d.rounded_rectangle([x - w, cy - h, x + w, cy + h], radius=10, fill=tuple(int(min(255, c)) for c in base) + (255,))
                d.rounded_rectangle([x - w + 3, cy - h + 2, x + w - 6, cy - h + 7], radius=4, fill=tuple(int(min(255, c * 1.12)) for c in base) + (255,))
    v = (noise(n, 16, seed + 5) - 0.5) * 0.12
    arr = np.asarray(im, np.float32)
    arr[..., :3] *= (1 + v[..., None])
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), 'RGBA')


def flat_tex(seed, base, var=0.18, scale=24, speck=None, speckn=0):
    n = TEX
    r = rs(seed)
    v = (noise(n, scale, seed) - 0.5) * var * 2
    im = tex_img(colorize(base, v, n))
    d = ImageDraw.Draw(im)
    if speck:
        for i in range(speckn):
            x, y = r.randint(0, n), r.randint(0, n)
            s = r.uniform(1.5, 4)
            d.ellipse([x - s, y - s * 0.7, x + s, y + s * 0.7], fill=tuple(hexc(speck).astype(int)) + (255,))
    return im


def plank_tex(seed, base='#9a6a3c', vertical=False):
    n = TEX
    r = rs(seed)
    im = tex_img(colorize(base, (noise(n, 30, seed) - 0.5) * 0.12, n))
    d = ImageDraw.Draw(im)
    rows = 6
    h = n / rows
    for j in range(rows):
        k = r.uniform(0.85, 1.12)
        c = tuple(int(min(255, x * k)) for x in hexc(base))
        d.rectangle([0, j * h + 1, n, (j + 1) * h - 2], fill=c + (255,))
        for g in range(6):
            y = j * h + r.uniform(4, h - 4)
            d.line([(r.uniform(0, n), y), (r.uniform(0, n), y)], fill=tuple(int(x * 0.85) for x in c) + (255,), width=1)
        d.line([(0, (j + 1) * h - 1), (n, (j + 1) * h - 1)], fill=tuple(int(x * 0.55) for x in c) + (255,), width=3)
        x = r.uniform(0, n)
        d.line([(x, j * h), (x, (j + 1) * h)], fill=tuple(int(x_ * 0.6) for x_ in c) + (255,), width=2)
    if vertical:
        im = im.rotate(90)
    return im


def marble_tex(seed, base='#e4e0d8', vein='#b8b0a8', tiles=2, gold=False):
    n = TEX
    im = tex_img(colorize(base, (noise(n, 40, seed) - 0.5) * 0.1, n))
    d = ImageDraw.Draw(im)
    s = n / tiles
    for j in range(tiles):
        for i in range(tiles):
            d.rectangle([i * s, j * s, (i + 1) * s - 1, (j + 1) * s - 1], outline=tuple(hexc(vein).astype(int)) + (255,), width=3)
            d.line([(i * s + 3, j * s + 3), ((i + 1) * s - 4, j * s + 3)], fill=(255, 255, 255, 140), width=2)
    if gold:
        c = n / 2
        d.polygon([(c, 18), (n - 18, c), (c, n - 18), (18, c)], outline=(226, 191, 98, 255), width=6)
        d.polygon([(c, 44), (n - 44, c), (c, n - 44), (44, c)], fill=(226, 191, 98, 180))
    return im


def carpet_tex(seed):
    n = TEX
    im = tex_img(colorize('#8a2e44', (noise(n, 30, seed) - 0.5) * 0.12, n))
    d = ImageDraw.Draw(im)
    d.rectangle([10, 10, n - 11, n - 11], outline=(226, 191, 98, 255), width=5)
    d.rectangle([22, 22, n - 23, n - 23], outline=(110, 30, 50, 255), width=3)
    c = n / 2
    d.polygon([(c, 40), (n - 40, c), (c, n - 40), (40, c)], outline=(226, 191, 98, 220), width=4)
    return im


def water_tex(seed, frame, deep=False):
    n = TEX
    base = '#1d5f86' if deep else '#2f9bb0'
    hi = (170, 235, 245) if not deep else (110, 180, 220)
    v = (noise(n, 40, seed) - 0.5) * 0.18
    im = tex_img(colorize(base, v, n))
    d = ImageDraw.Draw(im)
    r = rs(seed + 77)
    ph = frame / 4 * 2 * math.pi
    for i in range(14):
        x0, y0 = r.uniform(0, n), r.uniform(0, n)
        L = r.uniform(18, 40)
        a = 0.5 + 0.5 * math.sin(ph + i * 1.7)
        dy = math.sin(ph + i) * 4
        col = hi + (int(60 + 150 * a),)
        for dx in (-n, 0, n):
            d.arc([x0 + dx - L, y0 + dy - 6, x0 + dx + L, y0 + dy + 6], 200, 340, fill=col, width=2)
    return im.filter(ImageFilter.SMOOTH)


# ---------------------------------------------------------------------------
# Face mapping for blocks
# ---------------------------------------------------------------------------
def face_img(tex, w, h, side):
    """Map a w x h rectangle texture onto the left (+y, screen SW) or right (+x, SE) face."""
    tex = tex.resize((w, h), Image.BICUBIC)
    W, H = w, h + w // 2
    # left face: x in [0,w], y = x*0.5 + t ; right face: y = (w-x)*0.5 + t
    if side == 'L':
        coeffs = (1, 0, 0, -0.5, 1, 0)
    else:
        coeffs = (1, 0, 0, 0.5, 1, -w * 0.5)
    return tex.transform((W, H), Image.AFFINE, coeffs, resample=Image.BICUBIC)


def shade_img(img, k):
    arr = np.asarray(img, np.float32).copy()
    arr[..., :3] *= k
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), 'RGBA')


def block(top, side_l, side_r, h, top_extra=None, rim=True):
    """Extruded diamond of height h px. Returns RGBA (DW x DH+h), anchor = bottom diamond centre."""
    W, H = DW, DH + h
    out = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    hw = DW // 2
    L = face_img(side_l, hw, h, 'L')
    R = face_img(side_r, hw, h, 'R')
    # vertical AO gradient at the bottom of the faces
    out.alpha_composite(shade_img(L, 1.0), (0, DH // 2))
    out.alpha_composite(shade_img(R, 0.72), (hw, DH // 2))
    t = apply_mask(to_iso(top), diamond_mask())
    out.alpha_composite(t, (0, 0))
    d = ImageDraw.Draw(out)
    if rim:
        # crisp bevel highlight along the top-front edges, dark edge on vertical corner
        lw = max(2, int(2 * RES))
        d.line([(0, DH // 2), (hw, DH)], fill=(255, 250, 235, 120), width=lw)
        d.line([(hw, DH), (DW, DH // 2)], fill=(255, 250, 235, 70), width=lw)
        d.line([(hw, DH), (hw, DH + h)], fill=(30, 20, 40, 90), width=lw)
    # contact AO
    ao = Image.new('L', (W, H), 0)
    da = ImageDraw.Draw(ao)
    da.polygon([(0, DH // 2 + h - 10), (hw, DH + h - 10), (DW, DH // 2 + h - 10), (DW, DH // 2 + h), (hw, DH + h), (0, DH // 2 + h)], fill=110)
    ao = ao.filter(ImageFilter.GaussianBlur(5))
    dark = Image.new('RGBA', (W, H), (20, 14, 30, 255))
    dark.putalpha(ImageChops.multiply(ao, out.getchannel('A')))
    out.alpha_composite(dark)
    return out


def wall_side(w, h, base='#efe2c6', timber='#8a5a34', seed=0, kind='plaster', window=False, door=False, band=None):
    r = rs(seed)
    f = w / 80.0 if kind != 'roof' else w / 80.0
    im = tex_img(colorize(base, (noise(max(w, h) * 2, 20, seed) - 0.5) * 0.12, 0)[:h * 2, :w * 2]).resize((w * 2, h * 2))
    d = ImageDraw.Draw(im)
    W2, H2 = w * 2, h * 2
    if kind == 'plaster':
        d.rectangle([0, 0, W2, 10 * f], fill=tuple(hexc(timber).astype(int)) + (255,))
        d.rectangle([0, H2 - 14 * f, W2, H2], fill=tuple((hexc(timber) * 0.8).astype(int)) + (255,))
        d.rectangle([0, 0, 8 * f, H2], fill=tuple(hexc(timber).astype(int)) + (255,))
    elif kind == 'stone':
        rows = 4
        rh = H2 / rows
        for j in range(rows):
            off = (j % 2) * 30 * f
            for i in range(-1, int(5 / min(1, f)) + 2):
                x0 = i * 60 * f + off
                k = r.uniform(0.85, 1.1)
                c = tuple(int(min(255, x * k)) for x in hexc(base))
                d.rounded_rectangle([x0 + 2 * f, j * rh + 2 * f, x0 + 58 * f, (j + 1) * rh - 2 * f], radius=6 * f, fill=c + (255,))
                d.line([(x0 + 4 * f, j * rh + 4 * f), (x0 + 54 * f, j * rh + 4 * f)], fill=tuple(min(255, int(x * 1.15)) for x in c) + (255,), width=int(2 * f))
    elif kind == 'wood':
        st = max(8, int(18 * f))
        for i in range(0, W2, st):
            k = r.uniform(0.85, 1.1)
            c = tuple(int(min(255, x * k)) for x in hexc(base))
            d.rectangle([i, 0, i + st - 2, H2], fill=c + (255,))
            d.line([(i + st - 1, 0), (i + st - 1, H2)], fill=tuple(int(x * 0.5) for x in c) + (255,), width=int(2 * f))
    elif kind == 'pavilion':
        # red lacquer posts, cream plaster panels with a wooden lattice window band
        post = (164, 44, 34, 255); postd = (110, 26, 22, 255)
        d.rectangle([0, 0, W2, H2], fill=(236, 222, 196, 255))
        for x0 in (0, W2 - 14 * f):
            d.rectangle([x0, 0, x0 + 14 * f, H2], fill=post)
            d.rectangle([x0 + 9 * f, 0, x0 + 14 * f, H2], fill=postd)
        d.rectangle([0, 0, W2, 12 * f], fill=post)
        d.rectangle([0, H2 - 16 * f, W2, H2], fill=(120, 84, 54, 255))
        y0, y1 = 22 * f, H2 * 0.62
        d.rectangle([20 * f, y0, W2 - 20 * f, y1], fill=(92, 52, 34, 255))
        d.rectangle([24 * f, y0 + 4 * f, W2 - 24 * f, y1 - 4 * f], fill=(255, 210, 140, 255))
        for i in range(1, 6):
            x = 24 * f + (W2 - 48 * f) * i / 6
            d.line([(x, y0), (x, y1)], fill=(92, 52, 34, 255), width=int(3 * f))
        for i in range(1, 4):
            y = y0 + (y1 - y0) * i / 4
            d.line([(20 * f, y), (W2 - 20 * f, y)], fill=(92, 52, 34, 255), width=int(3 * f))
    elif kind == 'roof':
        rows = 5
        rh = H2 / rows
        tw = 28 * f
        for j in range(rows):
            off = (j % 2) * tw / 2
            for i in range(-1, int(W2 // tw) + 2):
                x0 = i * tw + off
                k = r.uniform(0.88, 1.08)
                c = tuple(int(min(255, x * k)) for x in hexc(base))
                d.rounded_rectangle([x0, j * rh, x0 + tw - 2 * f, (j + 1) * rh + 6 * f], radius=8 * f, fill=tuple(int(x * 0.6) for x in c) + (255,))
                d.rounded_rectangle([x0, j * rh, x0 + tw - 2 * f, (j + 1) * rh + 2 * f], radius=8 * f, fill=c + (255,))
    if band:
        d.rectangle([0, 14 * f, W2, 22 * f], fill=tuple(hexc(band).astype(int)) + (255,))
    if window:
        cx = W2 // 2
        S_ = lambda *v: [x * f for x in v]
        d.rounded_rectangle([cx - 22 * f, 26 * f, cx + 22 * f, 76 * f], radius=6 * f, fill=(70, 46, 30, 255))
        d.rounded_rectangle([cx - 17 * f, 31 * f, cx + 17 * f, 72 * f], radius=4 * f, fill=(255, 214, 130, 255))
        d.rectangle([cx - 2 * f, 31 * f, cx + 2 * f, 72 * f], fill=(90, 60, 36, 255))
        d.rectangle([cx - 17 * f, 49 * f, cx + 17 * f, 53 * f], fill=(90, 60, 36, 255))
        d.rectangle([cx - 26 * f, 76 * f, cx + 26 * f, 82 * f], fill=(110, 76, 46, 255))
    if door:
        cx = W2 // 2
        d.rounded_rectangle([cx - 26 * f, 22 * f, cx + 26 * f, H2], radius=24 * f, fill=(70, 40, 24, 255))
        d.rounded_rectangle([cx - 21 * f, 28 * f, cx + 21 * f, H2], radius=20 * f, fill=(132, 82, 44, 255))
        for i in (-10, 0, 10):
            d.line([(cx + i * f, 34 * f), (cx + i * f, H2)], fill=(100, 60, 32, 255), width=int(2 * f))
        d.ellipse([cx + 10 * f, 66 * f, cx + 16 * f, 72 * f], fill=(226, 191, 98, 255))
    return im.resize((w, h), Image.LANCZOS)


# ---------------------------------------------------------------------------
# Props (drawn supersampled)
# ---------------------------------------------------------------------------
class P:
    """Supersampled prop canvas. Coordinates are in base (2x) units; the image is
    rendered at RES x that size, then volume-shaded so flat shapes read as
    rounded, lit forms (light from the upper left)."""
    def __init__(self, w, h, ss=3):
        self.w, self.h = w, h
        self.ss = ss * RES
        ss = self.ss
        self.im = Image.new('RGBA', (int(w * ss), int(h * ss)), (0, 0, 0, 0))
        self.d = ImageDraw.Draw(self.im)

    def S(self, pts):
        return [(x * self.ss, y * self.ss) for x, y in pts]

    def ell(self, cx, cy, rx, ry, col):
        s = self.ss
        self.d.ellipse([(cx - rx) * s, (cy - ry) * s, (cx + rx) * s, (cy + ry) * s], fill=col)

    def poly(self, pts, col):
        self.d.polygon(self.S(pts), fill=col)

    def rect(self, x0, y0, x1, y1, col, r=0):
        s = self.ss
        if r:
            self.d.rounded_rectangle([x0 * s, y0 * s, x1 * s, y1 * s], radius=r * s, fill=col)
        else:
            self.d.rectangle([x0 * s, y0 * s, x1 * s, y1 * s], fill=col)

    def line(self, pts, col, w):
        self.d.line(self.S(pts), fill=col, width=int(w * self.ss), joint='curve')

    def blob(self, cx, cy, r, col, seed=0, lumps=9):
        """Shaded foliage blob: dark base, mid lumps, bright top-left lumps."""
        rr = rs(seed)
        c = hexc(col)
        dark = tuple((c * 0.55).astype(int)) + (255,)
        mid = tuple(c.astype(int)) + (255,)
        lite = tuple(np.minimum(255, c * 1.28 + 10).astype(int)) + (255,)
        self.ell(cx + r * 0.06, cy + r * 0.1, r, r * 0.92, dark)
        for i in range(lumps):
            a = rr.uniform(0, 2 * math.pi)
            d = rr.uniform(0.2, 0.55) * r
            self.ell(cx + math.cos(a) * d - r * 0.06, cy + math.sin(a) * d * 0.85 - r * 0.08, r * 0.45, r * 0.42, mid)
        for i in range(lumps // 2 + 1):
            a = rr.uniform(math.pi * 1.0, math.pi * 1.6)
            d = rr.uniform(0.15, 0.5) * r
            self.ell(cx + math.cos(a) * d, cy + math.sin(a) * d - r * 0.1, r * 0.28, r * 0.25, lite)

    def outline(self, col=(34, 26, 40), w=2):
        a = self.im.getchannel('A')
        k = max(3, int(w * self.ss / 1.5) | 1)
        big = a.filter(ImageFilter.MaxFilter(k))
        o = Image.new('RGBA', self.im.size, col + (255,))
        o.putalpha(big)
        o.alpha_composite(self.im)
        self.im = o

    def result(self, shade=0.55):
        out = self.im.resize((int(self.w * RES), int(self.h * RES)), Image.LANCZOS)
        if shade:
            out = volume_shade(out, shade)
        return out


def volume_shade(im, amt=0.55, rad=None):
    """Fake normal-mapped lighting from the alpha silhouette: rounded shading,
    a warm rim on the lit (upper-left) edge, cool occlusion low down."""
    arr = np.asarray(im, np.float32)
    a = arr[..., 3] / 255
    h, w = a.shape
    rad = rad or max(2, min(w, h) * 0.05)
    hm = np.asarray(Image.fromarray((a * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(rad)), np.float32) / 255
    gy, gx = np.gradient(hm)
    nl = np.clip(-(gx * 0.75 + gy * 0.65) * rad * 2.2, -1, 1)
    lit = 1 + amt * 0.42 * nl
    # vertical occlusion: lower parts a bit darker and cooler
    yy = np.linspace(0, 1, h)[:, None]
    occl = 1 - amt * 0.22 * np.clip((yy - 0.55) / 0.45, 0, 1)
    rgb = arr[..., :3] * (lit * occl)[..., None]
    rim = np.clip(nl - 0.35, 0, 1) * (a > 0.5) * amt * 0.9
    rgb = rgb + rim[..., None] * np.array([255, 236, 200], np.float32) * 0.35
    out = np.dstack([np.clip(rgb, 0, 255), arr[..., 3]]).astype(np.uint8)
    return Image.fromarray(out, 'RGBA')


def prop_tree(seed, kind='oak'):
    w, h = 200, 300
    p = P(w, h)
    cx, by = w / 2, h - 40
    trunk = (110, 72, 44, 255)
    p.poly([(cx - 9, by), (cx + 9, by), (cx + 6, by - 90), (cx - 6, by - 90)], trunk)
    p.poly([(cx - 9, by), (cx - 2, by), (cx - 2, by - 90), (cx - 6, by - 90)], (140, 96, 60, 255))
    p.poly([(cx - 14, by), (cx - 4, by - 10), (cx - 22, by + 4)], trunk)
    p.poly([(cx + 14, by), (cx + 4, by - 10), (cx + 22, by + 4)], trunk)
    r = rs(seed)
    if kind == 'oak':
        col = ['#3f9a3a', '#4aa83e', '#3a8f44'][seed % 3]
        p.blob(cx, by - 150, 72, col, seed, 11)
        p.blob(cx - 40, by - 110, 46, col, seed + 1, 7)
        p.blob(cx + 42, by - 112, 44, col, seed + 2, 7)
        p.blob(cx + 6, by - 196, 46, col, seed + 3, 7)
    elif kind == 'blossom':
        p.blob(cx, by - 150, 70, '#f0a8c8', seed, 11)
        p.blob(cx - 40, by - 110, 44, '#f4b8d4', seed + 1, 7)
        p.blob(cx + 42, by - 112, 42, '#eca0c0', seed + 2, 7)
        p.blob(cx + 4, by - 194, 44, '#f8c8dc', seed + 3, 7)
    elif kind == 'pine':
        for i, (yy, rr_) in enumerate([(by - 60, 66), (by - 110, 54), (by - 156, 42), (by - 196, 28)]):
            c = hexc('#2f7a4a') * (0.9 + i * 0.06)
            p.poly([(cx - rr_, yy), (cx + rr_, yy), (cx, yy - 70)], tuple((c * 0.6).astype(int)) + (255,))
            p.poly([(cx - rr_ + 6, yy - 4), (cx + rr_ * 0.2, yy - 6), (cx, yy - 70)], tuple(np.minimum(255, c * 1.2).astype(int)) + (255,))
            p.poly([(cx + rr_ * 0.2, yy - 6), (cx + rr_ - 6, yy - 4), (cx, yy - 70)], tuple(c.astype(int)) + (255,))
    elif kind == 'dead':
        p.blob(cx, by - 140, 64, '#5a3a78', seed, 9)
        p.blob(cx - 34, by - 104, 38, '#4a3068', seed + 1, 6)
        p.blob(cx + 36, by - 108, 36, '#6a4488', seed + 2, 6)
        for i in range(10):
            a = r.uniform(0, 6.28); d = r.uniform(10, 60)
            p.ell(cx + math.cos(a) * d, by - 140 + math.sin(a) * d * 0.8, 3, 3, (200, 120, 255, 200))
    p.outline((28, 36, 26) if kind != 'dead' else (30, 18, 40), 2)
    return p.result(), (w / 2, h - 40)


def prop_bush(seed, col='#3f9e3c', flowers=None):
    w, h = 130, 110
    p = P(w, h)
    p.blob(w / 2, h - 46, 40, col, seed, 9)
    p.blob(w / 2 - 26, h - 34, 26, col, seed + 1, 5)
    p.blob(w / 2 + 26, h - 34, 26, col, seed + 2, 5)
    if flowers:
        r = rs(seed + 9)
        for i in range(9):
            p.ell(w / 2 + r.uniform(-40, 40), h - 46 + r.uniform(-30, 20), 3.5, 3.5, flowers)
    p.outline((26, 40, 24), 2)
    return p.result(), (w / 2, h - 22)


def prop_lamp():
    w, h = 70, 170
    p = P(w, h)
    cx, by = w / 2, h - 20
    p.rect(cx - 9, by - 10, cx + 9, by, (60, 54, 62, 255), 3)
    p.rect(cx - 3.5, by - 120, cx + 3.5, by - 8, (52, 46, 56, 255))
    p.rect(cx - 2, by - 120, cx, by - 8, (110, 104, 120, 255))
    p.poly([(cx - 16, by - 128), (cx + 16, by - 128), (cx + 11, by - 150), (cx - 11, by - 150)], (60, 50, 60, 255))
    p.rect(cx - 12, by - 128, cx + 12, by - 104, (255, 214, 120, 255), 4)
    p.rect(cx - 7, by - 125, cx - 1, by - 107, (255, 246, 210, 255), 2)
    p.poly([(cx - 18, by - 150), (cx + 18, by - 150), (cx, by - 164)], (70, 56, 66, 255))
    p.outline((30, 24, 34), 2)
    return p.result(), (cx, by - 4)


def prop_statue():
    w, h = 110, 200
    p = P(w, h)
    cx, by = w / 2, h - 24
    p.poly([(cx - 34, by - 6), (cx, by + 12), (cx + 34, by - 6), (cx, by - 24)], (170, 172, 180, 255))
    p.poly([(cx - 34, by - 6), (cx, by + 12), (cx, by + 30), (cx - 34, by + 12)], (196, 198, 206, 255))
    p.poly([(cx, by + 12), (cx + 34, by - 6), (cx + 34, by + 12), (cx, by + 30)], (140, 142, 152, 255))
    # robed figure
    p.poly([(cx - 20, by - 10), (cx + 20, by - 10), (cx + 12, by - 90), (cx - 12, by - 90)], (222, 224, 230, 255))
    p.poly([(cx + 4, by - 10), (cx + 20, by - 10), (cx + 12, by - 90), (cx + 4, by - 90)], (186, 188, 198, 255))
    p.ell(cx, by - 104, 16, 17, (226, 228, 234, 255))
    p.ell(cx + 5, by - 102, 10, 13, (196, 198, 206, 255))
    p.poly([(cx - 22, by - 64), (cx, by - 74), (cx + 22, by - 64), (cx, by - 56)], (226, 191, 98, 255))
    p.outline((50, 48, 60), 2)
    return p.result(), (cx, by + 10)


def prop_fountain(frame=0):
    w, h = 170, 150
    p = P(w, h)
    cx, by = w / 2, h - 34
    p.ell(cx, by, 74, 37, (120, 124, 138, 255))
    p.ell(cx, by - 8, 74, 37, (176, 180, 192, 255))
    p.ell(cx, by - 8, 62, 30, (60, 140, 190, 255))
    p.ell(cx - 10, by - 14, 34, 12, (130, 200, 235, 255))
    p.rect(cx - 7, by - 64, cx + 7, by - 8, (196, 198, 208, 255), 3)
    p.ell(cx, by - 64, 24, 10, (176, 180, 192, 255))
    p.ell(cx, by - 66, 18, 7, (90, 170, 220, 255))
    for i in range(7):
        a = i / 7 * math.pi + 0.2
        x = cx + math.cos(a) * 30
        p.line([(cx, by - 74), ((cx + x) / 2, by - 90 - (i % 2) * 6), (x, by - 30)], (200, 240, 255, 200), 2)
    p.ell(cx, by - 78, 6, 10, (226, 191, 98, 255))
    p.outline((40, 40, 56), 2)
    return p.result(), (cx, by + 4)


def prop_crate():
    w, h = 90, 100
    p = P(w, h)
    cx, by = w / 2, h - 20
    s = 30
    p.poly([(cx - s, by - s * 0.5 - 30), (cx, by - s - 30), (cx + s, by - s * 0.5 - 30), (cx, by - 30)], (196, 146, 86, 255))
    p.poly([(cx - s, by - s * 0.5 - 30), (cx, by - 30), (cx, by), (cx - s, by - s * 0.5)], (160, 110, 60, 255))
    p.poly([(cx, by - 30), (cx + s, by - s * 0.5 - 30), (cx + s, by - s * 0.5), (cx, by)], (120, 80, 44, 255))
    p.line([(cx - s, by - s * 0.5 - 30), (cx, by)], (100, 66, 36, 255), 2)
    p.line([(cx + s, by - s * 0.5 - 30), (cx, by)], (80, 50, 28, 255), 2)
    p.outline((44, 28, 18), 2)
    return p.result(), (cx, by - 4)


def prop_bench():
    w, h = 110, 80
    p = P(w, h)
    cx, by = w / 2, h - 20
    p.poly([(cx - 40, by - 14), (cx + 10, by - 38), (cx + 40, by - 24), (cx - 10, by)], (150, 100, 56, 255))
    p.poly([(cx - 40, by - 14), (cx - 10, by), (cx - 10, by + 6), (cx - 40, by - 8)], (110, 70, 40, 255))
    p.poly([(cx - 40, by - 30), (cx + 10, by - 54), (cx + 10, by - 44), (cx - 40, by - 20)], (170, 116, 66, 255))
    p.outline((44, 28, 18), 2)
    return p.result(), (cx, by - 6)


def prop_stall():
    w, h = 170, 170
    p = P(w, h)
    cx, by = w / 2, h - 30
    p.poly([(cx - 60, by - 30), (cx, by - 60), (cx + 60, by - 30), (cx, by)], (150, 100, 56, 255))
    p.poly([(cx - 60, by - 30), (cx, by), (cx, by + 14), (cx - 60, by - 16)], (120, 78, 44, 255))
    p.poly([(cx, by), (cx + 60, by - 30), (cx + 60, by - 16), (cx, by + 14)], (96, 62, 34, 255))
    for i, c in enumerate([(240, 200, 90), (230, 110, 80), (140, 200, 90)]):
        p.ell(cx - 30 + i * 22, by - 34 + i * 4, 10, 7, c + (255,))
    for x in (cx - 56, cx + 56, cx):
        p.rect(x - 2.5, by - 110, x + 2.5, by - 24 if x != cx else by - 2, (90, 60, 34, 255))
    for i in range(6):
        col = (214, 58, 74, 255) if i % 2 == 0 else (246, 236, 214, 255)
        x0 = cx - 66 + i * 22
        p.poly([(x0, by - 106 + i * 0), (x0 + 22, by - 106), (x0 + 22 + 6, by - 130), (x0 + 6, by - 130)], col)
    p.poly([(cx - 66, by - 106), (cx + 66, by - 106), (cx + 66, by - 98), (cx - 66, by - 98)], (180, 40, 60, 255))
    p.outline((44, 24, 22), 2)
    return p.result(), (cx, by - 6)


def prop_fence(axis):
    w, h = 170, 110
    p = P(w, h)
    cx, by = w / 2, h - 34
    dx, dy = (40, 20) if axis == 'x' else (-40, 20)
    for t in (-1, 1):
        x, y = cx + dx * t, by - 0 + dy * t * 0 - 0
    a = (cx - dx, by - dy)
    b = (cx + dx, by + dy)
    for (x, y) in (a, b, (cx, by)):
        p.rect(x - 4, y - 44, x + 4, y + 2, (130, 86, 48, 255), 2)
        p.rect(x - 4, y - 44, x - 1, y + 2, (170, 118, 70, 255))
    for off in (-34, -18):
        p.line([(a[0], a[1] + off), (b[0], b[1] + off)], (190, 140, 84, 255), 5)
        p.line([(a[0], a[1] + off + 3), (b[0], b[1] + off + 3)], (120, 80, 44, 255), 2)
    p.outline((44, 28, 18), 2)
    return p.result(), (cx, by)


def prop_altar(frame=0):
    w, h = 140, 150
    p = P(w, h)
    cx, by = w / 2, h - 34
    p.poly([(cx - 46, by - 10), (cx, by - 33), (cx + 46, by - 10), (cx, by + 13)], (220, 218, 232, 255))
    p.poly([(cx - 46, by - 10), (cx, by + 13), (cx, by + 26), (cx - 46, by + 3)], (186, 184, 204, 255))
    p.poly([(cx, by + 13), (cx + 46, by - 10), (cx + 46, by + 3), (cx, by + 26)], (150, 148, 172, 255))
    p.poly([(cx - 30, by - 14), (cx, by - 29), (cx + 30, by - 14), (cx, by + 1)], (226, 191, 98, 255))
    for i, a in enumerate(range(-80, 81, 32)):
        r = math.radians(a)
        p.ell(cx + math.sin(r) * 14, by - 34 - math.cos(r) * 8, 7, 13, (250, 244, 255, 255) if i % 2 else (236, 226, 250, 255))
    p.ell(cx, by - 32, 7, 5, (255, 220, 120, 255))
    p.outline((50, 44, 70), 2)
    return p.result(), (cx, by + 6)


def prop_column():
    w, h = 90, 200
    p = P(w, h)
    cx, by = w / 2, h - 24
    p.rect(cx - 22, by - 14, cx + 22, by + 6, (200, 196, 186, 255), 4)
    p.rect(cx - 15, by - 140, cx + 15, by - 10, (232, 228, 218, 255))
    for i in range(-10, 12, 7):
        p.line([(cx + i, by - 138), (cx + i, by - 12)], (196, 192, 180, 255), 2)
    p.rect(cx + 6, by - 140, cx + 15, by - 10, (196, 190, 178, 255))
    p.rect(cx - 24, by - 156, cx + 24, by - 138, (226, 191, 98, 255), 3)
    p.outline((60, 54, 50), 2)
    return p.result(), (cx, by)


def prop_column_red():
    """Red-lacquer temple pillar on a stone plinth with a gilt capital."""
    w, h = 90, 220
    p = P(w, h)
    cx, by = w / 2, h - 24
    p.ell(cx, by + 2, 26, 12, (120, 112, 104, 255))
    p.rect(cx - 24, by - 16, cx + 24, by + 2, (176, 168, 156, 255), 4)
    p.ell(cx, by - 16, 24, 10, (204, 198, 188, 255))
    p.rect(cx - 15, by - 160, cx + 15, by - 14, (176, 46, 34, 255))
    p.rect(cx - 15, by - 160, cx - 6, by - 14, (214, 78, 58, 255))
    p.rect(cx + 7, by - 160, cx + 15, by - 14, (120, 26, 20, 255))
    for yy in (by - 40, by - 130):
        p.rect(cx - 16, yy - 4, cx + 16, yy + 4, (226, 186, 96, 255), 2)
    p.rect(cx - 26, by - 180, cx + 26, by - 158, (232, 194, 104, 255), 4)
    p.rect(cx - 30, by - 186, cx + 30, by - 178, (140, 40, 30, 255), 3)
    p.outline((52, 20, 18), 2)
    return p.result(), (cx, by)


def prop_lantern_stone():
    """Stone garden lantern (tourou) with a glowing fire box."""
    w, h = 96, 180
    p = P(w, h)
    cx, by = w / 2, h - 22
    stone, stoned, stonel = (150, 146, 140, 255), (104, 100, 96, 255), (196, 192, 184, 255)
    p.ell(cx, by, 30, 13, stoned)
    p.rect(cx - 26, by - 14, cx + 26, by, stone, 4)
    p.rect(cx - 9, by - 72, cx + 9, by - 12, stone, 3)
    p.rect(cx - 9, by - 72, cx - 3, by - 12, stonel)
    p.rect(cx - 24, by - 84, cx + 24, by - 70, stone, 4)
    # fire box
    p.rect(cx - 18, by - 118, cx + 18, by - 84, stoned, 3)
    p.rect(cx - 12, by - 114, cx + 12, by - 88, (255, 196, 96, 255), 3)
    p.rect(cx - 7, by - 110, cx + 1, by - 92, (255, 244, 200, 255), 2)
    # roof
    p.poly([(cx - 34, by - 118), (cx + 34, by - 118), (cx + 20, by - 138), (cx - 20, by - 138)], stone)
    p.poly([(cx - 34, by - 118), (cx - 40, by - 124), (cx - 20, by - 138)], stonel)
    p.poly([(cx + 34, by - 118), (cx + 40, by - 124), (cx + 20, by - 138)], stoned)
    p.ell(cx, by - 142, 8, 7, stonel)
    p.ell(cx, by - 150, 4, 5, stone)
    p.outline((40, 36, 40), 2)
    return p.result(), (cx, by - 4)


def prop_rock(seed, big=False):
    w, h = (190, 220) if big else (120, 100)
    p = P(w, h)
    r = rs(seed)
    cx, by = w / 2, h - 30
    s = 1.6 if big else 0.8
    base = np.array([120, 108, 104]) if big else np.array([140, 128, 116])
    pts = [(cx - 60 * s, by), (cx - 52 * s, by - 50 * s), (cx - 20 * s, by - 96 * s - r.uniform(0, 20)), (cx + 14 * s, by - 80 * s),
           (cx + 40 * s, by - 104 * s * (0.8 if big else 0.5)), (cx + 62 * s, by - 30 * s), (cx + 50 * s, by + 8)]
    p.poly(pts, tuple((base * 0.75).astype(int)) + (255,))
    p.poly([pts[0], pts[1], pts[2], (cx - 8 * s, by - 40 * s), (cx - 20 * s, by + 6)], tuple(np.minimum(255, base * 1.2).astype(int)) + (255,))
    p.poly([pts[2], pts[3], (cx - 8 * s, by - 40 * s)], tuple(np.minimum(255, base * 1.35).astype(int)) + (255,))
    if big:
        p.poly([(cx - 26 * s, by - 86 * s), (cx - 20 * s, by - 96 * s), (cx - 8 * s, by - 84 * s)], (240, 240, 244, 255))
    p.outline((40, 34, 38), 2)
    return p.result(), (cx, by - 6 * s)


def prop_rubble(seed):
    w, h = 140, 90
    p = P(w, h)
    r = rs(seed)
    for i in range(7):
        x, y = w / 2 + r.uniform(-44, 44), h - 34 + r.uniform(-16, 14)
        s = r.uniform(8, 18)
        c = np.array([150, 138, 128]) * r.uniform(0.8, 1.1)
        p.poly([(x - s, y), (x - s * 0.5, y - s), (x + s * 0.6, y - s * 0.9), (x + s, y), (x, y + s * 0.5)], tuple(c.astype(int)) + (255,))
        p.poly([(x - s, y), (x - s * 0.5, y - s), (x, y - s * 0.3)], tuple(np.minimum(255, c * 1.25).astype(int)) + (255,))
    p.outline((40, 34, 38), 2)
    return p.result(), (w / 2, h - 30)


def prop_lily(seed):
    """Lotus pads with a pink lotus flower (temple ponds)."""
    w, h = 130, 90
    p = P(w, h)
    r = rs(seed)
    for i in range(4):
        x, y = w / 2 + r.uniform(-34, 34), h / 2 + 8 + r.uniform(-10, 10)
        rx = r.uniform(14, 20)
        p.ell(x, y + 2, rx, rx * 0.5, (30, 90, 50, 255))
        p.ell(x, y, rx, rx * 0.5, (70, 160, 70, 255))
        p.ell(x - rx * 0.3, y - rx * 0.12, rx * 0.5, rx * 0.22, (110, 196, 96, 255))
        p.poly([(x, y), (x + rx, y - 3), (x + rx, y + 3)], (40, 120, 130, 255))
    cx, cy = w / 2 + r.uniform(-8, 8), h / 2 - 2
    for k, (a, col) in enumerate([(-70, (236, 120, 170)), (70, (236, 120, 170)), (-40, (246, 160, 196)), (40, (246, 160, 196)), (-14, (255, 196, 220)), (14, (255, 196, 220)), (0, (255, 222, 236))]):
        rr = math.radians(a)
        px, py = cx + math.sin(rr) * 9, cy - 12 - math.cos(rr) * 4
        p.poly([(cx + math.sin(rr) * 3, cy), (px - 6 * math.cos(rr), py + 2), (cx + math.sin(rr) * 16, cy - 22 - abs(math.cos(rr)) * 4), (px + 6 * math.cos(rr), py + 2)], col + (255,))
    p.ell(cx, cy - 8, 4, 3, (255, 220, 110, 255))
    p.outline((40, 50, 50), 1)
    return p.result(0.4), (w / 2, h / 2 + 8)


def prop_chest(opened=False):
    w, h = 90, 90
    p = P(w, h)
    cx, by = w / 2, h - 20
    s = 26
    top = by - 26
    p.poly([(cx - s, top - s * 0.5), (cx, top - s), (cx + s, top - s * 0.5), (cx, top)], (196, 120, 50, 255))
    p.poly([(cx - s, top - s * 0.5), (cx, top), (cx, by), (cx - s, by - s * 0.5)], (160, 92, 40, 255))
    p.poly([(cx, top), (cx + s, top - s * 0.5), (cx + s, by - s * 0.5), (cx, by)], (120, 66, 30, 255))
    p.line([(cx - s, top - s * 0.5 + 8), (cx, top + 8), (cx + s, top - s * 0.5 + 8)], (226, 191, 98, 255), 3)
    p.rect(cx - 5, top + 2, cx + 3, top + 14, (240, 210, 110, 255), 2)
    p.outline((44, 24, 14), 2)
    return p.result(), (cx, by - 4)


def prop_stairs():
    w, h = 160, 120
    p = P(w, h)
    cx, by = w / 2, h - 40
    for i in range(4):
        y = by - i * 12
        sx = 70 - i * 10
        p.poly([(cx - sx, y - sx * 0.5 + 35), (cx, y - sx * 0.5 + 0), (cx + sx, y - sx * 0.5 + 35), (cx, y + 35 - 0)], (150, 146, 160, 255))
    p.outline((40, 38, 50), 2)
    return p.result(), (cx, by)


def contact_shadow(w=120, h=60):
    w, h = int(w * RES), int(h * RES)
    im = Image.new('L', (w, h), 0)
    ImageDraw.Draw(im).ellipse([w * 0.12, h * 0.2, w * 0.88, h * 0.8], fill=255)
    im = im.filter(ImageFilter.GaussianBlur(w * 0.08))
    out = Image.new('RGBA', (w, h), (16, 10, 26, 255))
    out.putalpha(im.point(lambda v: int(v * 0.55)))
    return out, (w / 2, h / 2)


def glow(r, col):
    r = int(r * RES)
    n = r * 2
    yy, xx = np.mgrid[0:n, 0:n]
    d = np.sqrt((xx - r + 0.5) ** 2 + (yy - r + 0.5) ** 2) / r
    a = np.clip(1 - d, 0, 1) ** 2
    arr = np.zeros((n, n, 4), np.uint8)
    arr[..., 0], arr[..., 1], arr[..., 2] = col
    arr[..., 3] = (a * 255).astype(np.uint8)
    return Image.fromarray(arr, 'RGBA'), (r, r)


def marker():
    """Tap marker: golden ring (drawn scaled/faded by the engine)."""
    w, h = int(120 * RES), int(60 * RES)
    im = Image.new('RGBA', (w * 3, h * 3), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.ellipse([12, 12, w * 3 - 12, h * 3 - 12], outline=(255, 226, 140, 255), width=12)
    d.ellipse([60, 40, w * 3 - 60, h * 3 - 40], outline=(255, 246, 214, 200), width=6)
    return im.resize((w, h), Image.LANCZOS), (w / 2, h / 2)
