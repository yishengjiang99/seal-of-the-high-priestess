"""Shared raster helpers for the procedural art pipeline.

Everything is drawn supersampled (SS x) into float RGBA (premultiplied) numpy
buffers, cel-shaded from masks, outlined with coloured line art, and box-
downsampled at the end so edges come out anti-aliased. Original art only:
no external images are read.
"""
import math
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

SS = 4


def hexc(h, a=1.0):
    h = h.lstrip('#')
    return (int(h[0:2], 16) / 255, int(h[2:4], 16) / 255, int(h[4:6], 16) / 255, a)


def mix(c1, c2, t):
    return tuple(c1[i] * (1 - t) + c2[i] * t for i in range(4))


def shade(c, k):
    """k<0 darkens toward a cool purple-black, k>0 lightens toward warm white."""
    if k < 0:
        return mix(c, (0.10, 0.06, 0.16, c[3]), -k)
    return mix(c, (1.0, 0.98, 0.92, c[3]), k)


class Canvas:
    def __init__(self, w, h, ss=SS):
        self.w, self.h, self.ss = w, h, ss
        self.W, self.H = w * ss, h * ss
        self.buf = np.zeros((self.H, self.W, 4), np.float32)

    # ---- mask builders (coords in output pixels) ----
    def _img(self):
        return Image.new('L', (self.W, self.H), 0)

    def mask_poly(self, pts):
        im = self._img()
        s = self.ss
        if len(pts) >= 3:
            ImageDraw.Draw(im).polygon([(x * s, y * s) for x, y in pts], fill=255)
        return np.asarray(im, np.float32) / 255

    def mask_ellipse(self, cx, cy, rx, ry, rot=0.0, n=48):
        pts = []
        cr, sr = math.cos(rot), math.sin(rot)
        for i in range(n):
            a = 2 * math.pi * i / n
            x, y = rx * math.cos(a), ry * math.sin(a)
            pts.append((cx + x * cr - y * sr, cy + x * sr + y * cr))
        return self.mask_poly(pts)

    def mask_limb(self, p1, p2, r1, r2, steps=None):
        """Tapered capsule from p1 (radius r1) to p2 (radius r2)."""
        im = self._img()
        d = ImageDraw.Draw(im)
        s = self.ss
        if steps is None:
            L = math.hypot(p2[0] - p1[0], p2[1] - p1[1])
            steps = max(4, int(L / max(0.35, min(r1, r2) * 0.5)))
        for i in range(steps + 1):
            t = i / steps
            x = p1[0] + (p2[0] - p1[0]) * t
            y = p1[1] + (p2[1] - p1[1]) * t
            r = r1 + (r2 - r1) * t
            d.ellipse([(x - r) * s, (y - r) * s, (x + r) * s, (y + r) * s], fill=255)
        return np.asarray(im, np.float32) / 255

    # ---- compositing ----
    def over(self, rgb, a):
        """rgb: (3,) or (H,W,3) straight colour; a: (H,W) alpha."""
        a = np.clip(a, 0, 1)[..., None]
        src = np.empty_like(self.buf)
        src[..., :3] = np.asarray(rgb, np.float32) * a if np.ndim(rgb) == 1 else rgb * a
        src[..., 3:] = a
        self.buf = src + self.buf * (1 - a)

    def add(self, rgb, a):
        a = np.clip(a, 0, 1)[..., None]
        self.buf[..., :3] = np.clip(self.buf[..., :3] + np.asarray(rgb, np.float32) * a, 0, 1)
        self.buf[..., 3:] = np.clip(self.buf[..., 3:] + a * 0.6, 0, 1)

    def fill(self, mask, c):
        self.over(np.asarray(c[:3], np.float32), mask * c[3])

    def result(self):
        """Box-downsample premultiplied buffer -> straight RGBA PIL image."""
        s = self.ss
        b = self.buf.reshape(self.h, s, self.w, s, 4).mean(axis=(1, 3))
        a = b[..., 3:4]
        rgb = np.where(a > 1e-4, b[..., :3] / np.maximum(a, 1e-4), 0)
        out = np.concatenate([np.clip(rgb, 0, 1), np.clip(a, 0, 1)], axis=2)
        return Image.fromarray((out * 255 + 0.5).astype(np.uint8), 'RGBA')


def shift(m, dx, dy):
    """Return mask sampled at (x+dx, y+dy) (pixels at SS scale)."""
    out = np.zeros_like(m)
    H, W = m.shape
    dx, dy = int(round(dx)), int(round(dy))
    ys0, ys1 = max(0, -dy), min(H, H - dy)
    xs0, xs1 = max(0, -dx), min(W, W - dx)
    out[ys0:ys1, xs0:xs1] = m[ys0 + dy:ys1 + dy, xs0 + dx:xs1 + dx]
    return out


def dilate(m, r):
    if r <= 0:
        return m
    im = Image.fromarray((m * 255).astype(np.uint8), 'L')
    k = int(r) * 2 + 1
    im = im.filter(ImageFilter.MaxFilter(min(k, 15)))
    if k > 15:
        im = im.filter(ImageFilter.MaxFilter(k - 14 if (k - 14) % 2 else k - 13))
    return np.asarray(im, np.float32) / 255


def blur(m, r):
    im = Image.fromarray((np.clip(m, 0, 1) * 255).astype(np.uint8), 'L')
    return np.asarray(im.filter(ImageFilter.GaussianBlur(r)), np.float32) / 255


def part(cv, mask, base, line=None, lw=1.1, sh=0.28, hi=0.18, shk=3.2, hik=1.6,
         grad=0.10, clip=None, lightdir=(1, 1), noline=False):
    """Draw one cel-shaded part: outline under, base, shadow band, rim light."""
    s = cv.ss
    if clip is not None:
        mask = mask * clip
    if not noline:
        lc = line if line is not None else shade(base, -0.62)
        ol = dilate(mask, lw * s)
        if clip is not None:
            ol = ol * dilate(clip, lw * s)
        cv.fill(ol, lc)
    # vertical gradient for volume
    H = cv.H
    ys = np.nonzero(mask.max(axis=1) > 0)[0]
    if len(ys):
        y0, y1 = ys[0], ys[-1] + 1
        g = np.zeros(H, np.float32)
        g[y0:y1] = np.linspace(grad, -grad, y1 - y0)
        top = np.asarray(shade(base, 0.5)[:3]); bot = np.asarray(shade(base, -0.5)[:3])
        b3 = np.asarray(base[:3], np.float32)
        col = np.where(g[:, None] > 0, b3 + (top - b3) * g[:, None], b3 + (bot - b3) * (-g[:, None]))
        rgb = np.broadcast_to(col[:, None, :], (H, cv.W, 3))
        cv.over(rgb, mask * base[3])
    else:
        return mask
    lx, ly = lightdir
    if sh > 0:
        sm = shift(mask, lx * shk * s, ly * shk * s)
        hard = mask * (1 - sm)
        soft = mask * (1 - blur(sm, shk * s * 0.9))
        cv.fill(np.clip(hard * 0.55 + soft * 0.75, 0, 1), shade(base, -sh * 1.15) if sh < 1 else base)
        # ambient occlusion toward the far edge
        ao = mask * (1 - blur(mask, shk * s * 1.6))
        cv.fill(ao * 0.35, shade(base, -0.5))
    if hi > 0:
        rim = mask * (1 - shift(mask, -lx * hik * s, -ly * hik * s))
        cv.fill(rim * 0.8, shade(base, hi))
        spec = mask * blur(1 - shift(mask, -lx * hik * 2.2 * s, -ly * hik * 2.2 * s), hik * s * 1.2) * mask
        cv.fill(np.clip(spec, 0, 1) * 0.35, shade(base, min(0.9, hi * 2.2)))
    return mask
