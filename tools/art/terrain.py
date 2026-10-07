"""Seamless, painted top-down terrain materials for the 2.5D map renderer.

Each material is a periodic PERIOD x PERIOD texture (PERIOD = 4 tiles at
D = 160 texels per 32-px world tile) authored top-down. js/world.js composites
them into baked ground chunks with soft noise-broken transitions, then the
chunks are drawn through the iso transform, so there is no per-tile grid.
All art is original and procedural (numpy + PIL).
"""
import math, os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

D = 160                # texels per world tile
PERIOD = 4 * D         # 640
rs = np.random.RandomState


def hexc(h):
    h = h.lstrip('#')
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], np.float32)


def pnoise(n, seed, beta=2.0, lo=2):
    """Periodic fractal noise via FFT-filtered white noise, normalised to [0,1]."""
    r = rs(seed)
    w = r.randn(n, n)
    f = np.fft.fft2(w)
    ky = np.fft.fftfreq(n)[:, None] * n
    kx = np.fft.fftfreq(n)[None, :] * n
    k = np.sqrt(kx * kx + ky * ky)
    k[0, 0] = 1
    filt = 1.0 / np.power(k, beta / 2 * 2) * (k >= lo)
    out = np.real(np.fft.ifft2(f * filt))
    out -= out.min(); out /= max(1e-6, out.max())
    return out.astype(np.float32)


def band(n, seed, k0, k1):
    """Periodic band-limited noise (features ~ n/k1 .. n/k0 px)."""
    r = rs(seed)
    f = np.fft.fft2(r.randn(n, n))
    ky = np.fft.fftfreq(n)[:, None] * n
    kx = np.fft.fftfreq(n)[None, :] * n
    k = np.sqrt(kx * kx + ky * ky)
    out = np.real(np.fft.ifft2(f * ((k >= k0) & (k <= k1))))
    out -= out.min(); out /= max(1e-6, out.max())
    return out.astype(np.float32)


def tint(base, *layers):
    """base colour (hex) * product of (1 + amp*(noise-0.5)) layers -> float RGB."""
    rgb = np.ones((PERIOD, PERIOD, 3), np.float32) * hexc(base)
    for nz, amp, col in layers:
        if col is None:
            rgb *= (1 + amp * (nz - 0.5))[..., None]
        else:
            t = np.clip(nz * amp, 0, 1)[..., None]
            rgb = rgb * (1 - t) + hexc(col) * t
    return rgb


def img(rgb):
    return Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8), 'RGB')


def wrap_draw(draw_fn):
    """Call draw_fn(dx, dy) for the 9 periodic offsets so strokes wrap."""
    for dy in (-PERIOD, 0, PERIOD):
        for dx in (-PERIOD, 0, PERIOD):
            draw_fn(dx, dy)


def strokes(im, seed, n, cols, length=(6, 14), width=(1, 2), angle=(-0.5, 0.5), alpha=255):
    r = rs(seed)
    ov = Image.new('RGBA', im.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(ov)
    xs = r.uniform(0, PERIOD, n); ys = r.uniform(0, PERIOD, n)
    ls = r.uniform(*length, n); ws = r.randint(width[0], width[1] + 1, n)
    an = r.uniform(*angle, n) - math.pi / 2
    ci = r.randint(0, len(cols), n)
    for i in range(n):
        x, y, L = xs[i], ys[i], ls[i]
        x2, y2 = x + math.cos(an[i]) * L, y + math.sin(an[i]) * L
        c = tuple(int(v) for v in hexc(cols[ci[i]])) + (alpha,)
        for dx in (-PERIOD, 0, PERIOD):
            for dy in (-PERIOD, 0, PERIOD):
                if -20 < x + dx < PERIOD + 20 and -20 < y + dy < PERIOD + 20:
                    d.line([(x + dx, y + dy), (x2 + dx, y2 + dy)], fill=c, width=int(ws[i]))
    im = im.convert('RGBA')
    im.alpha_composite(ov)
    return im.convert('RGB')


def dots(im, seed, n, cols, r_=(1.5, 3.5), alpha=255, cluster=None):
    r = rs(seed)
    ov = Image.new('RGBA', im.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(ov)
    pts = []
    if cluster:
        nc, per, spread = cluster
        cx = r.uniform(0, PERIOD, nc); cy = r.uniform(0, PERIOD, nc)
        for i in range(nc):
            for j in range(per):
                pts.append((cx[i] + r.randn() * spread, cy[i] + r.randn() * spread))
    else:
        pts = list(zip(r.uniform(0, PERIOD, n), r.uniform(0, PERIOD, n)))
    for (x, y) in pts:
        rad = r.uniform(*r_)
        c = hexc(cols[r.randint(len(cols))])
        for dx in (-PERIOD, 0, PERIOD):
            for dy in (-PERIOD, 0, PERIOD):
                X, Y = (x % PERIOD) + dx, (y % PERIOD) + dy
                if -10 < X < PERIOD + 10 and -10 < Y < PERIOD + 10:
                    d.ellipse([X - rad, Y - rad, X + rad, Y + rad], fill=tuple(int(v) for v in c) + (alpha,))
                    # tiny highlight
                    d.ellipse([X - rad * 0.5 - rad * 0.2, Y - rad * 0.5 - rad * 0.2, X - rad * 0.2, Y - rad * 0.2], fill=tuple(int(min(255, v * 1.25 + 30)) for v in c) + (alpha,))
    im = im.convert('RGBA')
    im.alpha_composite(ov)
    return im.convert('RGB')


def soften(im, r=0.6):
    return im.filter(ImageFilter.GaussianBlur(r))


# ---------------------------------------------------------------------------
def grass(seed, base='#4f9a3a', dark='#2f6a2a', lite='#8cc456', flowers=None, density=1.0):
    n1 = pnoise(PERIOD, seed, 2.2); n2 = band(PERIOD, seed + 1, 20, 60); n3 = band(PERIOD, seed + 2, 4, 10)
    rgb = tint(base, (n1, 0.45, None), (n2, 0.25, None))
    rgb = rgb * (1 - 0.35 * np.clip(n3 - 0.55, 0, 1)[..., None] * 2) + hexc(lite) * 0.35 * np.clip(n3 - 0.55, 0, 1)[..., None] * 2
    im = img(rgb)
    im = strokes(im, seed + 3, int(26000 * density), [dark, dark, '#3f7f30'], (5, 12), (1, 2), alpha=200)
    im = strokes(im, seed + 4, int(16000 * density), [base, '#5fae44', lite, '#a6d66a'], (4, 10), (1, 2), alpha=230)
    if flowers:
        im = dots(im, seed + 5, 0, flowers, (1.6, 3.2), cluster=(int(40 * density), 9, 10))
    return soften(im, 0.5)


def flowerbed(seed):
    im = grass(seed, '#3f8a34', '#255a22', '#7ab84a', density=1.2)
    im = dots(im, seed + 7, 0, ['#ffffff', '#f6e8f2', '#ffd6ea'], (2.5, 4.2), cluster=(70, 10, 14))
    im = dots(im, seed + 8, 0, ['#e46aa8', '#f08cc0', '#c84a8a'], (2.5, 4.2), cluster=(60, 9, 12))
    im = dots(im, seed + 9, 0, ['#9a6ae0', '#b48af0', '#7a4ac0'], (2.2, 3.8), cluster=(50, 9, 12))
    im = dots(im, seed + 10, 0, ['#ffe27a'], (1.2, 2.0), cluster=(40, 5, 10))
    return im


def slabs(seed, base='#cdb894', var=0.1, mortar='#6e5f4c', row_h=(150, 230), w=(160, 320), moss=0.0, wear=1.0):
    """Large worn flagstones in periodic courses, bevelled, with mortar joints."""
    r = rs(seed)
    n1 = pnoise(PERIOD, seed, 2.0); n2 = band(PERIOD, seed + 1, 24, 90); n3 = band(PERIOD, seed + 9, 6, 16)
    rgb = tint(base, (n1, 0.18, None), (n2, 0.14, None))
    H = np.zeros((PERIOD, PERIOD), np.float32)        # per-slab height (for bevel)
    lab = np.zeros((PERIOD, PERIOD), np.int32) - 1
    # courses (rows) that sum to PERIOD
    rows, y = [], 0
    while y < PERIOD:
        h = int(r.uniform(*row_h))
        if PERIOD - (y + h) < row_h[0]:
            h = PERIOD - y
        rows.append((y, h)); y += h
    im_lab = Image.new('I', (PERIOD, PERIOD), -1)
    dl = ImageDraw.Draw(im_lab)
    k = 0
    tones = []
    for (y0, h) in rows:
        x, off = 0, r.uniform(0, PERIOD)
        while x < PERIOD:
            ww = int(r.uniform(*w))
            if PERIOD - (x + ww) < w[0]:
                ww = PERIOD - x
            for dx in (-PERIOD, 0, PERIOD):
                X0 = (x + off) % PERIOD + dx
                dl.rectangle([X0 + 3, y0 + 3, X0 + ww - 4, y0 + h - 4], fill=k)
            tones.append(r.uniform(1 - var, 1 + var) * np.array([1, r.uniform(0.97, 1.03), r.uniform(0.95, 1.04)]))
            x += ww; k += 1
    lab = np.asarray(im_lab, np.int32)
    inside = lab >= 0
    tone = np.ones((PERIOD, PERIOD, 3), np.float32)
    tarr = np.array(tones, np.float32)
    tone[inside] = tarr[lab[inside]]
    rgb = rgb * tone
    # bevel: distance-from-edge field via blur of the inside mask (wrap)
    m = Image.fromarray((inside * 255).astype(np.uint8))
    big = Image.new('L', (PERIOD * 3, PERIOD * 3))
    for i in range(3):
        for j in range(3):
            big.paste(m, (i * PERIOD, j * PERIOD))
    bl = np.asarray(big.filter(ImageFilter.GaussianBlur(5)), np.float32)[PERIOD:2 * PERIOD, PERIOD:2 * PERIOD] / 255
    gy, gx = np.gradient(bl)
    light = np.clip(-(gx * 0.7 + gy * 0.7) * 9, -1, 1)          # light from upper-left
    rgb = rgb * (1 + 0.22 * light[..., None])
    rgb = rgb * (0.78 + 0.22 * np.clip(bl * 1.6, 0, 1))[..., None]
    # worn centres a little lighter, chips / pits darker
    rgb = rgb * (1 + 0.08 * wear * (n3 - 0.5))[..., None]
    mort = hexc(mortar) * (0.85 + 0.3 * n1)[..., None]
    a = np.clip(bl * 2.2 - 0.25, 0, 1)[..., None]
    rgb = rgb * a + mort * (1 - a)
    if moss:
        mm = np.clip((1 - a[..., 0]) * (band(PERIOD, seed + 4, 8, 30) - 0.45) * 4 * moss, 0, 1)[..., None]
        rgb = rgb * (1 - mm) + hexc('#5a7a34') * mm
    im = img(rgb)
    # hairline cracks
    d = ImageDraw.Draw(im)
    for i in range(int(18 * wear)):
        x, y = r.uniform(0, PERIOD), r.uniform(0, PERIOD)
        pts = [(x, y)]
        for j in range(5):
            x += r.uniform(-14, 14); y += r.uniform(-14, 14); pts.append((x, y))
        d.line(pts, fill=tuple(int(v * 0.6) for v in hexc(base)), width=1)
    return soften(im, 0.45)


def inlay(seed):
    """Polished golden sandstone court: big two-tile slabs, faint gilt veining.
    The lotus mandala is drawn per courtyard at runtime so it never repeats."""
    im = slabs(seed, '#d9c29a', 0.05, '#8a6a40', row_h=(300, 340), w=(300, 340), wear=0.3)
    rgb = np.asarray(im, np.float32)
    v = np.abs(np.sin((band(PERIOD, seed + 5, 2, 6) * 9) * math.pi))
    t = np.clip(1 - v * 8, 0, 1)[..., None] * 0.25
    rgb = rgb * (1 - t) + hexc('#f2d08a') * t
    return soften(img(rgb), 0.5)


def border(seed):
    """Warm umber band stone with gilt edging (replaces the old red carpet)."""
    im = slabs(seed, '#8c7360', 0.06, '#3e3024', row_h=(160, 161), w=(150, 240), wear=0.5)
    return im


def cobble(seed, base='#bfae8c', mortar='#6e624e'):
    r = rs(seed)
    n1 = pnoise(PERIOD, seed, 2.0)
    rgb = tint(mortar, (n1, 0.3, None))
    im = img(rgb).convert('RGBA')
    ov = Image.new('RGBA', im.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(ov)
    # jittered grid of rounded stones (periodic)
    g = 16
    cell = PERIOD / g
    jit = r.uniform(-0.22, 0.22, (g, g, 2)) * cell
    for j in range(g):
        for i in range(g):
            cx, cy = (i + 0.5) * cell + jit[j, i, 0], (j + 0.5) * cell + jit[j, i, 1]
            rx, ry = cell * r.uniform(0.38, 0.48), cell * r.uniform(0.34, 0.46)
            k = r.uniform(0.86, 1.12)
            c = np.clip(hexc(base) * k * np.array([1, r.uniform(0.97, 1.03), r.uniform(0.94, 1.04)]), 0, 255)
            for dx in (-PERIOD, 0, PERIOD):
                for dy in (-PERIOD, 0, PERIOD):
                    X, Y = cx + dx, cy + dy
                    if -cell < X < PERIOD + cell and -cell < Y < PERIOD + cell:
                        d.ellipse([X - rx, Y - ry + 2, X + rx, Y + ry + 2], fill=tuple(int(v * 0.55) for v in c) + (255,))
                        d.ellipse([X - rx, Y - ry, X + rx, Y + ry], fill=tuple(int(v) for v in c) + (255,))
                        d.ellipse([X - rx * 0.7, Y - ry * 0.75, X + rx * 0.3, Y + ry * 0.1], fill=tuple(int(min(255, v * 1.12)) for v in c) + (120,))
    im.alpha_composite(ov)
    rgb = np.asarray(im.convert('RGB'), np.float32) * (0.9 + 0.2 * band(PERIOD, seed + 3, 3, 12))[..., None]
    return soften(img(rgb), 0.6)


def dirt(seed, base='#9c7c54'):
    n1 = pnoise(PERIOD, seed, 2.1); n2 = band(PERIOD, seed + 1, 30, 120)
    rgb = tint(base, (n1, 0.4, None), (n2, 0.2, None))
    im = img(rgb)
    im = dots(im, seed + 2, 900, ['#7a5e3e', '#b89a70', '#8a8070'], (1.2, 3.5))
    return soften(im, 0.6)


def planks(seed, base='#8a5e36', vertical=False):
    r = rs(seed)
    n1 = pnoise(PERIOD, seed, 2.0)
    grain = band(PERIOD, seed + 1, 2, 40)
    rgb = tint(base, (n1, 0.18, None))
    pw = PERIOD // 8
    for i in range(8):
        k = r.uniform(0.85, 1.12)
        sl = (slice(None), slice(i * pw, (i + 1) * pw))
        rgb[sl] *= k
        rgb[:, i * pw:i * pw + 3] *= 0.5
        # staggered butt joints
        y = int(r.uniform(0, PERIOD))
        rgb[y:y + 3, i * pw:(i + 1) * pw] *= 0.55
    # streaky grain along the boards
    g = np.asarray(Image.fromarray((grain * 255).astype(np.uint8)).resize((PERIOD // 8, PERIOD)).resize((PERIOD, PERIOD)), np.float32) / 255
    rgb *= (0.9 + 0.2 * g)[..., None]
    im = img(rgb)
    if not vertical:
        im = im.rotate(90)
    return soften(im, 0.5)


def marble(seed, base='#e6e2da', vein='#b4aca2'):
    n = pnoise(PERIOD, seed, 2.0)
    v = np.abs(np.sin((band(PERIOD, seed + 1, 2, 8) * 12 + n * 4) * math.pi))
    rgb = tint(base, (n, 0.08, None))
    t = np.clip(1 - v * 6, 0, 1)[..., None] * 0.6
    rgb = rgb * (1 - t) + hexc(vein) * t
    return slabs_overlay(img(rgb), seed)


def slabs_overlay(im, seed):
    """Add thin square seams every 2 tiles (polished floor)."""
    d = ImageDraw.Draw(im)
    for i in range(0, PERIOD, 2 * D):
        d.line([(i, 0), (i, PERIOD)], fill=(120, 112, 104), width=2)
        d.line([(0, i), (PERIOD, i)], fill=(120, 112, 104), width=2)
        d.line([(i + 2, 0), (i + 2, PERIOD)], fill=(255, 255, 255), width=1)
        d.line([(0, i + 2), (PERIOD, i + 2)], fill=(255, 255, 255), width=1)
    return soften(im, 0.5)


def ash(seed):
    im = dirt(seed, '#6a625c')
    return im


def corrupt(seed):
    n1 = pnoise(PERIOD, seed, 2.0); n2 = band(PERIOD, seed + 1, 6, 20)
    rgb = tint('#4a463a', (n1, 0.4, None))
    t = np.clip((n2 - 0.6) * 4, 0, 1)[..., None]
    rgb = rgb * (1 - t * 0.7) + hexc('#7a3a9a') * t * 0.7
    return soften(img(rgb), 0.6)


def water(seed, base='#2a8c94', deep='#14506a'):
    n1 = pnoise(PERIOD, seed, 2.4); n2 = band(PERIOD, seed + 1, 3, 9)
    rgb = tint(base, (n1, 0.25, None))
    t = np.clip(n2 * 1.2 - 0.2, 0, 1)[..., None]
    rgb = rgb * (1 - t * 0.5) + hexc(deep) * t * 0.5
    return soften(img(rgb), 1.2)


def caustics(seed):
    """Additive shimmer highlights (RGBA): thin bright cell borders."""
    a = band(PERIOD, seed, 6, 14); b = band(PERIOD, seed + 1, 6, 14)
    v = np.abs(a - b)
    line = np.clip(1 - v * 14, 0, 1) ** 2
    rgb = np.ones((PERIOD, PERIOD, 3), np.float32) * np.array([200, 255, 250], np.float32)
    out = np.dstack([rgb, line * 200]).astype(np.uint8)
    im = Image.fromarray(out, 'RGBA').filter(ImageFilter.GaussianBlur(1.2))
    return im


MATERIALS = {
    'grass': lambda: grass(11, flowers=['#ffffff', '#ffe27a', '#f2b6d0'], density=1.0),
    'grass_dark': lambda: grass(12, '#3b7a33', '#1f4a20', '#6aa044', density=1.0),
    'grass_dusk': lambda: grass(13, '#477f3a', '#24502a', '#7aae4e', flowers=['#ffffff', '#f2b6d0', '#c8a8f0'], density=1.1),
    'flowerbed': lambda: flowerbed(14),
    'slab': lambda: slabs(15, '#cdb894', 0.09, '#6e5f4c', moss=0.6),
    'inlay': lambda: inlay(16),
    'border': lambda: border(17),
    'cobble': lambda: cobble(18),
    'plaza': lambda: cobble(19, '#c8c2b6', '#6a665e'),
    'dirt': lambda: dirt(20),
    'ash': lambda: ash(21),
    'corrupt': lambda: corrupt(22),
    'wood': lambda: planks(23, '#8a5e36'),
    'bridge': lambda: planks(24, '#a4482e', vertical=True),
    'marble': lambda: marble(25),
    'pale': lambda: slabs(26, '#b4bcc8', 0.07, '#5a6270', row_h=(150, 200), w=(150, 260), wear=0.6),
    'rim': lambda: slabs(27, '#a89c88', 0.08, '#4e463c', row_h=(70, 90), w=(110, 170), moss=1.0),
    'water': lambda: water(28),
    'deep': lambda: water(29, '#1d6680', '#0c3048'),
}


def build(out_dir, names=None):
    os.makedirs(out_dir, exist_ok=True)
    from multiprocessing import Pool
    names = names or list(MATERIALS)
    with Pool(min(8, len(names))) as pool:
        res = pool.map(_one, [(n, out_dir) for n in names])
    c = caustics(30)
    c.save(os.path.join(out_dir, 'caustics.png'), optimize=True)
    return res


def _one(args):
    n, out_dir = args
    im = MATERIALS[n]()
    p = os.path.join(out_dir, n + '.jpg')
    im.save(p, quality=86, optimize=True, progressive=True)
    return n, os.path.getsize(p)


if __name__ == '__main__':
    root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
    for n, sz in build(os.path.join(root, 'assets', 'art', 'terrain'), sys.argv[1:] or None):
        print(n, sz // 1024, 'KB')
