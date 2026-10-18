"""Chroma-key + sprite helpers for generated (GenerateImage) hero art.
All inputs are 1280x720 JPEGs: one subject (or a row of poses) on flat chroma green,
or additive VFX on black. Keying is flood-fill based (so green INSIDE foliage survives),
with a soft alpha ramp, edge decontamination and green despill."""
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage as ndi

def load(path):
    return Image.open(path).convert("RGB")

def bg_colour(a):
    b = np.concatenate([a[:10].reshape(-1, 3), a[-10:].reshape(-1, 3), a[:, :10].reshape(-1, 3), a[:, -10:].reshape(-1, 3)])
    return np.median(b, axis=0)

def key_green(im, t1=48.0, t2=96.0, despill=True):
    a = np.asarray(im).astype(np.float32)
    bg = bg_colour(a)
    d = np.sqrt(((a - bg) ** 2).sum(-1))
    # greenness helps on dark foliage near the bg hue
    gr = a[..., 1] - np.maximum(a[..., 0], a[..., 2])
    bgg = bg[1] - max(bg[0], bg[2])
    cand = (d < t2) & ((gr > bgg * 0.45) if bgg > 60 else True)
    lab, n = ndi.label(cand)
    edge = np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))
    edge = edge[edge > 0]
    bgm = np.isin(lab, edge)
    # interior holes (between branches, lily pads...): tight match, big enough to be background
    tight = (d < t1 * 1.1) & ((gr > bgg * 0.6) if bgg > 60 else True)
    tl, tn = ndi.label(tight)
    if tn:
        ts = ndi.sum(tight, tl, range(1, tn + 1))
        bgm |= np.isin(tl, [i + 1 for i, s in enumerate(ts) if s >= 25])
    bgm = ndi.binary_opening(bgm, iterations=1) | (bgm & (d < t1))
    # soft alpha: 0 inside bg, ramp over the band, 1 elsewhere
    near = ndi.binary_dilation(bgm, iterations=3)
    ramp = np.clip((d - t1) / (t2 - t1), 0, 1)
    alpha = np.where(bgm, 0.0, 1.0)
    alpha = np.where(near & ~bgm, np.maximum(ramp, 0.0) * 0 + np.clip(ramp * 1.15, 0, 1), alpha)
    # keep alpha 1 well inside the subject
    inner = ~ndi.binary_dilation(bgm, iterations=4)
    alpha = np.where(inner, 1.0, alpha)
    alpha = ndi.gaussian_filter(alpha, 0.6)
    # drop specks: keep components of the opaque mask with decent area
    solid = alpha > 0.5
    l2, n2 = ndi.label(solid)
    if n2 > 1:
        sizes = ndi.sum(solid, l2, range(1, n2 + 1))
        keep = np.isin(l2, [i + 1 for i, s in enumerate(sizes) if s > 120])
        alpha = np.where(keep | ndi.binary_dilation(keep, iterations=2), alpha, 0.0)
    rgb = a.copy()
    if despill:
        ring = ndi.binary_dilation(alpha > 0.02, iterations=1) & ndi.binary_dilation(alpha < 0.98, iterations=4)
        # decontaminate: remove bg contribution proportional to (1-alpha)
        al = np.clip(alpha, 0.05, 1)[..., None]
        dec = (a - (1 - al) * bg) / al
        rgb = np.where(ring[..., None], np.clip(dec, 0, 255), rgb)
        # clamp green to the average of red/blue (+ a little) on the ring and just inside it
        zone = ndi.binary_dilation(ring, iterations=2) & (alpha > 0)
        lim = np.maximum(rgb[..., 0], rgb[..., 2]) * 1.02 + 6
        g = np.where(zone & (rgb[..., 1] > lim), lim, rgb[..., 1])
        rgb[..., 1] = g
    out = np.dstack([np.clip(rgb, 0, 255), np.clip(alpha * 255, 0, 255)]).astype(np.uint8)
    return Image.fromarray(out, "RGBA")

def bbox(im, thr=8):
    a = np.asarray(im)[..., 3]
    ys, xs = np.where(a > thr)
    if len(xs) == 0: return None
    return xs.min(), ys.min(), xs.max() + 1, ys.max() + 1

def trim(im, pad=2):
    b = bbox(im)
    return im.crop((max(0, b[0] - pad), max(0, b[1] - pad), min(im.width, b[2] + pad), min(im.height, b[3] + pad)))

def split_row(im, n, min_gap=14):
    """split a keyed row image into n figures by empty column gaps"""
    a = np.asarray(im)[..., 3] > 24
    cols = a.sum(0) > 0
    segs = []; start = None
    for x, v in enumerate(cols):
        if v and start is None: start = x
        if not v and start is not None:
            segs.append([start, x]); start = None
    if start is not None: segs.append([start, len(cols)])
    # merge segments closer than min_gap
    m = []
    for s in segs:
        if m and s[0] - m[-1][1] < min_gap: m[-1][1] = s[1]
        else: m.append(s)
    m = [s for s in m if s[1] - s[0] > 40]
    while len(m) > n:   # merge the closest pair
        gaps = [m[i + 1][0] - m[i][1] for i in range(len(m) - 1)]
        i = int(np.argmin(gaps)); m[i][1] = m[i + 1][1]; del m[i + 1]
    return [im.crop((s[0], 0, s[1], im.height)) for s in m]

def seamless_cross(img, axis_both=True):
    """cross-fade seamless (good for organic textures)"""
    a = np.asarray(img).astype(np.float32)
    h, w = a.shape[:2]
    def pass_x(a):
        b = np.roll(a, w // 2, axis=1)
        x = np.arange(w); m = 1 - np.abs(2 * x / w - 1)
        m = (m ** 1.0)[None, :, None]
        return a * m + b * (1 - m)
    def pass_y(a):
        b = np.roll(a, h // 2, axis=0)
        y = np.arange(h); m = 1 - np.abs(2 * y / h - 1)
        m = m[:, None, None]
        return a * m + b * (1 - m)
    out = pass_y(pass_x(a))
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8))

def mirror_tile(img):
    w, h = img.size
    o = Image.new(img.mode, (w * 2, h * 2))
    o.paste(img, (0, 0)); o.paste(img.transpose(Image.FLIP_LEFT_RIGHT), (w, 0))
    o.paste(img.transpose(Image.FLIP_TOP_BOTTOM), (0, h)); o.paste(img.transpose(Image.ROTATE_180), (w, h))
    return o
