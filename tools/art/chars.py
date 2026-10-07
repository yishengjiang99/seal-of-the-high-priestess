"""Yaw-parameterised chibi rig -> high-res character sprite sheets.

A character is drawn from a spec (palette, hair style, outfit, weapon) and a
pose (walk phase, arm angles, lean, glow...). Facing is a yaw angle: 0 faces
the camera, 90 faces screen-left, 180 faces away; the engine mirrors for the
right-hand side. Frame 176x208 px = 88x104 logical px at 2x.
"""
import math
import numpy as np
from gfx import Canvas, part, hexc, shade, mix, blur, dilate, shift

FW, FH = 176, 208
AX, AY = 88, 198
D2R = math.pi / 180


def C(h, a=1.0):
    return hexc(h, a)


class Rig:
    def __init__(self, spec, yaw, pose):
        self.s = spec
        self.th = yaw * D2R
        self.p = pose
        self.cv = Canvas(FW, FH)
        k = spec.get('scale', 1.0)
        self.k = k
        self.cx = AX
        bob = pose.get('bob', 0) + pose.get('crouch', 0)
        # vertical layout (scaled about the ground point)
        self.gy = AY
        def Y(y):
            return AY - (AY - y) * k
        self.Y = Y
        self.hy = Y(66) + bob + pose.get('headDy', 0) + pose.get('crouch', 0) * 0.4
        self.shy = Y(106) + bob + pose.get('breath', 0) * 0.6
        self.wy = Y(134) + bob
        self.hipy = Y(150) + bob * 0.8 + pose.get('crouch', 0) * 0.5
        self.lean = pose.get('lean', 0)
        st, ct = math.sin(self.th), math.cos(self.th)
        self.st, self.ct = st, ct
        self.fwd = (-st, 0.16 * ct)

    # projection of a point on a horizontal ring of radius r at angle a (deg)
    def ring(self, a, r):
        t = self.th + a * D2R
        return self.cx - r * math.sin(t) * self.k, math.cos(t)

    def hx(self):
        return self.cx + self.lean * self.fwd[0] * 0.6

    # ------------------------------------------------------------------
    def draw(self):
        s, p, cv = self.s, self.p, self.cv
        # soft contact shadow is drawn by the engine; keep the frame clean.
        back = self.ct < -0.05
        self.limbs = self.compute_limbs()
        far = [l for l in self.limbs if l['depth'] < -0.2]
        near = [l for l in self.limbs if l['depth'] >= -0.2]
        if not back:
            self.hair_back_mass()
        for l in far:
            self.draw_limb(l, dim=True)
        if back is False and s.get('weapon_back'):
            self.weapon_on_back()
        self.legs()
        self.neck()
        self.torso()
        if back and s.get('weapon_back'):
            self.weapon_on_back()
        if back:
            self.hair_back_mass()
        for l in near:
            self.draw_limb(l)
        self.head()
        if getattr(self, 'staff_head', None):
            self.draw_staff_head(*self.staff_head)
        self.fx()
        return cv.result()

    # ---------------- limbs ----------------
    def compute_limbs(self):
        p, k = self.p, self.k
        out = []
        sw = (21 - 6 * abs(self.st)) * self.s.get('bulk', 1.0)
        for side, key in ((-1, 'armR'), (1, 'armL')):
            a = 90 * side
            x, d = self.ring(a, sw)
            x += self.lean * self.fwd[0] * 0.5
            y = self.shy + 3
            ang = p.get(key, 0) * D2R
            L = 34 * k * self.s.get('armlen', 1.0)
            fx, fy = self.fwd
            spread = (x - self.cx) / max(1, sw) * 4 * (1 - abs(self.st))
            hx = x + L * (fx * math.sin(ang)) + spread
            hy = y + L * math.cos(ang) + L * fy * math.sin(ang) * 0.6
            out.append(dict(kind='arm', side=side, depth=d + (0.25 if p.get(key, 0) > 60 else 0), sh=(x, y), hand=(hx, hy), ang=ang))
        return out

    def draw_limb(self, l, dim=False):
        s, cv = self.s, self.cv
        o = s['outfit']
        sleeve = C(o.get('sleeve', o['main']))
        if dim:
            sleeve = shade(sleeve, -0.18)
        (x0, y0), (x1, y1) = l['sh'], l['hand']
        wide = o.get('wide_sleeve', False)
        r1, r2 = (6.5, 10.5) if wide else (6, 5)
        r1 *= s.get('bulk', 1.0); r2 *= s.get('bulk', 1.0)
        # hand first if weapon held behind? weapon drawn after sleeve, hand on top
        m = cv.mask_limb((x0, y0), (x1 - (x1 - x0) * 0.08, y1 - (y1 - y0) * 0.08), r1, r2)
        part(cv, m, sleeve, sh=0.25, shk=2.6)
        if o.get('cuff'):
            cm = cv.mask_limb((x0 + (x1 - x0) * 0.8, y0 + (y1 - y0) * 0.8), (x1 - (x1 - x0) * 0.08, y1 - (y1 - y0) * 0.08), r2 * 0.82, r2 * 0.88)
            part(cv, cm, C(o['cuff']), lw=0.8, sh=0.2, shk=1.5)
        holds = l['side'] == -1 and s.get('weapon') and not s.get('weapon_back')
        if holds and self.p.get('weapon', True):
            self.weapon(x1, y1, l['ang'])
        skin = C(s.get('glove', s['skin']))
        if dim:
            skin = shade(skin, -0.15)
        hm = cv.mask_ellipse(x1, y1 + 1, 4.6 * s.get('bulk', 1.0), 4.8 * s.get('bulk', 1.0))
        part(cv, hm, skin, lw=0.9, sh=0.2, shk=1.6, hi=0.1)
        if s.get('sigil') and l['side'] == -1:
            cv.add(np.array(C('#ff4050')[:3]), blur(cv.mask_ellipse(x1, y1, 4, 4), 2.5 * cv.ss) * 0.9)

    def legs(self):
        s, p, cv, k = self.s, self.p, self.cv, self.k
        o = s['outfit']
        pants = C(o.get('pants', '#3a3040'))
        boot = C(o.get('boot', '#4a3428'))
        hipr = 8 * s.get('bulk', 1.0)
        legs = []
        for side, key in ((-1, 'legR'), (1, 'legL')):
            x, d = self.ring(90 * side, hipr)
            fwd, lift = p.get(key, (0, 0))
            fx, fy = self.fwd
            footx = x + fx * fwd + (x - self.cx) * 0.25
            footy = self.gy - 5 - lift + fy * fwd * 3 - p.get('crouch', 0) * 0.15
            legs.append((d, side, x, footx, footy))
        legs.sort()
        for d, side, x, footx, footy in legs:
            dim = d < -0.2
            pc = shade(pants, -0.15) if dim else pants
            bc = shade(boot, -0.15) if dim else boot
            m = cv.mask_limb((x, self.hipy), (footx, footy - 4), 6.2 * s.get('bulk', 1.0), 5.2 * s.get('bulk', 1.0))
            part(cv, m, pc, sh=0.25, shk=2)
            toe = self.fwd[0] * 4
            bm = cv.mask_ellipse(footx + toe, footy, 6.4 * s.get('bulk', 1.0) + abs(toe) * 0.4, 4.6)
            bm = np.maximum(bm, cv.mask_limb((footx, footy - 9), (footx, footy - 1), 5.4 * s.get('bulk', 1.0), 5.8 * s.get('bulk', 1.0)))
            part(cv, bm, bc, sh=0.3, shk=1.8)

    # ---------------- torso / outfit ----------------
    def torso(self):
        s, p, cv, k = self.s, self.p, self.cv, self.k
        o = s['outfit']
        typ = o['type']
        cx = self.cx
        a = abs(self.st)
        bulk = s.get('bulk', 1.0)
        sw = (21 - 6 * a) * bulk
        ww = (16 - 3 * a) * bulk
        hemY = self.Y(o.get('hem', 184)) + p.get('bob', 0) * 0.5
        hw = (o.get('flare', 27) - 5 * a) * bulk
        lean = self.lean * self.fwd[0]
        sway = p.get('hemSway', 0)
        main = C(o['main'])
        pts = [(cx - sw + lean, self.shy), (cx + sw + lean, self.shy),
               (cx + ww + lean * 0.5, self.wy), (cx + hw + sway, hemY - 2), (cx + hw * 0.5 + sway, hemY + 1),
               (cx - hw * 0.5 + sway, hemY + 1), (cx - hw + sway, hemY - 2), (cx - ww + lean * 0.5, self.wy)]
        # rounded shoulders
        m = cv.mask_poly(pts)
        m = np.maximum(m, cv.mask_ellipse(cx + lean, self.shy + 4, sw, 7))
        if typ == 'coat':
            # tails split at the front, lining shows
            part(cv, m, main, sh=0.3, shk=3.5, hi=0.12)
            if self.ct > -0.2:
                fx = cx - ww * 0.9 * self.st + lean * 0.5
                split = cv.mask_poly([(fx, self.wy + 4), (fx + 7 + sway, hemY + 2), (fx - 7 + sway, hemY + 2)])
                part(cv, split, C(o['lining']), clip=m, lw=0.7, sh=0.2)
                inner = cv.mask_poly([(fx - 7, self.shy + 1), (fx + 7, self.shy + 1), (fx + 4, self.wy + 6), (fx - 4, self.wy + 6)])
                part(cv, inner, C(o.get('shirt', '#2a2430')), clip=m, lw=0.7, sh=0.15)
                belt = cv.mask_poly([(cx - ww - 2, self.wy - 2), (cx + ww + 2, self.wy - 2), (cx + ww + 2, self.wy + 3), (cx - ww - 2, self.wy + 3)])
                part(cv, belt, C(o.get('belt', '#3a2a2a')), clip=m, lw=0.6, sh=0.2)
            # high collar
            col = cv.mask_poly([(cx - sw * 0.75 + lean, self.shy + 3), (cx - sw * 0.55 + lean, self.shy - 15), (cx + sw * 0.55 + lean, self.shy - 15), (cx + sw * 0.75 + lean, self.shy + 3)])
            if self.ct > -0.3:
                part(cv, col, C(o['lining']), sh=0.25, shk=2)
                cin = cv.mask_poly([(cx - sw * 0.35 - self.st * 8 + lean, self.shy + 2), (cx - sw * 0.25 - self.st * 8 + lean, self.shy - 8), (cx + sw * 0.25 - self.st * 8 + lean, self.shy - 8), (cx + sw * 0.35 - self.st * 8 + lean, self.shy + 2)])
                part(cv, cin, C(s['skin']), clip=col, lw=0.6, sh=0.25, shk=2.5)
            else:
                part(cv, col, main, sh=0.25, shk=2)
            return
        part(cv, m, main, sh=0.26, shk=3.6, hi=0.16)
        trim = o.get('trim')
        if trim:
            band = m * (1 - shift(m, 0, 4.5 * cv.ss)) * (cv.mask_poly([(0, hemY - 14), (FW, hemY - 14), (FW, FH), (0, FH)]))
            part(cv, band, C(trim), lw=0.0, noline=True, sh=0.15, shk=1)
        if self.ct > 0.05:
            # front opening / centre line at alpha 0
            fx = cx - ww * 0.95 * self.st + lean * 0.5
            if o.get('inner'):
                v = cv.mask_poly([(fx - 9 * self.ct, self.shy - 1), (fx + 9 * self.ct, self.shy - 1), (fx + 2, self.wy - 2), (fx - 2, self.wy - 2)])
                part(cv, v, C(o['inner']), clip=m, lw=0.6, sh=0.2)
            if trim:
                for sgn in (-1, 1):
                    ln = cv.mask_limb((fx + sgn * 9 * self.ct, self.shy - 1), (fx + sgn * 1.5, self.wy - 2), 1.1, 1.1)
                    cv.fill(ln * m, C(trim))
                ln = cv.mask_limb((fx + sway * 0.5, self.wy), (fx + sway, hemY - 4), 1.2, 1.4)
                cv.fill(ln * m, C(trim))
            if o.get('apron'):
                ap = cv.mask_poly([(fx - 11, self.wy), (fx + 11, self.wy), (fx + 13 + sway, hemY - 6), (fx - 13 + sway, hemY - 6)])
                part(cv, ap, C(o['apron']), clip=m, lw=0.7, sh=0.18)
        if o.get('sash'):
            sm = cv.mask_poly([(cx - ww - 3 + lean * 0.5, self.wy - 4), (cx + ww + 3 + lean * 0.5, self.wy - 4), (cx + ww + 3, self.wy + 4), (cx - ww - 3, self.wy + 4)])
            part(cv, sm, C(o['sash']), clip=m, lw=0.7, sh=0.25, shk=1.6)
            if trim:
                kn = cv.mask_ellipse(cx - ww * 0.95 * self.st, self.wy, 3.2 * max(0.3, abs(self.ct) + 0.2), 3)
                if self.ct > 0:
                    part(cv, kn, C(trim), lw=0.6, sh=0.2, shk=1)
        if o.get('pauldron'):
            for side in (-1, 1):
                x, d = self.ring(90 * side, sw * 0.95)
                if d < -0.4:
                    continue
                pm = cv.mask_ellipse(x, self.shy + 2, 10 * bulk * 0.8, 7.5 * bulk * 0.8)
                part(cv, pm, C(o['pauldron']), sh=0.3, shk=2, hi=0.3)
        if o.get('cloak'):
            # short shoulder cape
            cm = cv.mask_poly([(cx - sw - 3 + lean, self.shy - 2), (cx + sw + 3 + lean, self.shy - 2), (cx + sw + 6 + sway, self.wy + 8), (cx - sw - 6 + sway, self.wy + 8)])
            cm = np.maximum(cm, cv.mask_ellipse(cx + lean, self.shy + 2, sw + 3, 8))
            if self.ct > 0.3:
                cut = cv.mask_poly([(cx - 6 - self.st * 10, self.shy + 2), (cx + 6 - self.st * 10, self.shy + 2), (cx - self.st * 10, self.wy + 10)])
                cm = cm * (1 - cut)
            part(cv, cm, C(o['cloak']), sh=0.3, shk=3, hi=0.15)

    def neck(self):
        s, cv = self.s, self.cv
        k = self.k * s.get('headk', 1.0)
        cx, hy = self.hx(), self.hy
        skin = C(s['skin'])
        nm = cv.mask_limb((cx, hy + 22 * k), (cx, self.shy + 4), 4.6 * k * s.get('bulk', 1.0), 5.2 * k * s.get('bulk', 1.0))
        part(cv, nm, shade(skin, -0.18), lw=0.8, sh=0.2)
        if s.get('sigil') and self.ct > -0.2:
            sx = cx - 4 * self.st + 3
            cv.add(np.array(C('#ff3a4a')[:3]), blur(cv.mask_ellipse(sx, self.shy - 3, 3.0, 3.0), 2 * cv.ss))

    # ---------------- head ----------------
    def head(self):
        s, p, cv = self.s, self.p, self.cv
        cx, hy = self.hx(), self.hy
        k = self.k * s.get('headk', 1.0)
        st, ct = self.st, self.ct
        skin = C(s['skin'])
        R = 32 * k
        hs = s['hair']
        hair = C(hs['color'])
        # hair cap behind the head
        self.hair_cap_back(cx, hy, R, hair)
        # face
        if ct > -0.75:
            chin = (cx - 10 * st * k, hy + R * 1.04)
            fm = cv.mask_ellipse(cx - 2 * st * k, hy, R * (1 - 0.1 * abs(st)), R * 0.97)
            fm = np.maximum(fm, cv.mask_poly([(cx - R * 0.78 - 3 * st, hy + R * 0.25), (cx + R * 0.78 - 3 * st, hy + R * 0.25), chin]))
            if abs(st) > 0.5:
                nose = (cx - (R + 2.5) * st, hy + 7 * k)
                fm = np.maximum(fm, cv.mask_poly([(cx - (R - 4) * st, hy - 2), nose, (cx - (R - 3) * st, hy + 11 * k)]))
            part(cv, fm, skin, sh=0.22, shk=3.2, hi=0.12)
            # ears
            for side in (-1, 1):
                ex, d = self.ring(96 * side, R * 0.98 / self.k)
                if 0.0 < d < 0.75:
                    em = cv.mask_ellipse(ex, hy + 5 * k, 4.5 * k, 6.5 * k)
                    if s.get('ears') == 'pointed':
                        em = np.maximum(em, cv.mask_poly([(ex - 3, hy), (ex + 3 * (1 if ex > cx else -1) * 3, hy - 9), (ex + 3, hy + 6)]))
                    part(cv, em, skin, lw=0.9, sh=0.25, shk=1.5)
            self.face_features(cx, hy, k)
        self.hair_front(cx, hy, R, hair)
        self.headwear(cx, hy, R)

    def face_features(self, cx, hy, k):
        s, p, cv = self.s, self.p, self.cv
        st, ct = self.st, self.ct
        eye = C(s['eye'])
        line = C(s.get('lash', '#2a1626'))
        ey = hy + 9 * k
        blink = p.get('blink', 0)
        hurt = p.get('hurt', 0)
        for a in (-27, 27):
            ex, v = self.ring(a, 25 * k / self.k)
            ex -= 2 * st
            if v < 0.18:
                continue
            w = 8.6 * k * (0.35 + 0.65 * v)
            h = 11.0 * k * s.get('eyeh', 1.0)
            if blink or hurt:
                if hurt:
                    d = 1 if a > 0 else -1
                    m = np.maximum(cv.mask_limb((ex - w, ey - 3), (ex + w * 0.2, ey), 1.3, 1.3), cv.mask_limb((ex + w * 0.2, ey), (ex - w, ey + 3), 1.3, 1.3))
                else:
                    m = cv.mask_limb((ex - w, ey + 1), (ex + w, ey + 1), 1.4, 1.4)
                cv.fill(m, line)
                continue
            white = cv.mask_ellipse(ex, ey, w, h * 0.95)
            cv.fill(white, C('#fbf8f4'))
            ix = ex - 1.6 * st * k
            iris = cv.mask_ellipse(ix, ey + 0.8, w * 0.78, h * 0.86) * white
            cv.fill(iris, eye)
            top = iris * cv.mask_poly([(0, 0), (FW, 0), (FW, ey - h * 0.15), (0, ey - h * 0.15)])
            cv.fill(top * 0.75, shade(eye, -0.55))
            lowg = iris * cv.mask_poly([(0, ey + h * 0.35), (FW, ey + h * 0.35), (FW, FH), (0, FH)])
            cv.fill(lowg * 0.5, shade(eye, 0.45))
            cv.fill(cv.mask_ellipse(ix, ey + 1.2, w * 0.36, h * 0.42) * white, shade(eye, -0.75))
            cv.fill(cv.mask_ellipse(ix - w * 0.32, ey - h * 0.32, w * 0.3, h * 0.24), C('#ffffff'))
            cv.fill(cv.mask_ellipse(ix + w * 0.3, ey + h * 0.38, w * 0.15, h * 0.12), C('#ffffff', 0.9))
            if s.get('eye_glow'):
                cv.add(np.array(eye[:3]), blur(iris, 1.5 * cv.ss) * 0.35)
            # upper lash line (thick, sweeps out)
            outer = 1 if (ex - cx) * (1 if ct >= 0 else -1) > 0 else -1
            lash = cv.mask_poly([(ex - w * 1.1, ey - h * 0.62), (ex, ey - h * 1.02), (ex + w * 1.15, ey - h * 0.72),
                                 (ex + w * 1.2 * (1 if outer > 0 else 1), ey - h * 0.35), (ex + w * 0.9, ey - h * 0.66), (ex, ey - h * 0.82), (ex - w * 0.95, ey - h * 0.42)])
            cv.fill(lash, line)
            # brow
            bm = cv.mask_limb((ex - w * 0.9, ey - h * 1.55 + (2 if s.get('brow') == 'stern' and a < 0 else 0)), (ex + w * 0.9, ey - h * 1.6 - (2 if s.get('brow') == 'stern' else 0)), 0.9, 0.9)
            cv.fill(bm, shade(C(s['hair']['color']), -0.3))
            # blush
            if s.get('blush', True):
                cv.fill(blur(cv.mask_ellipse(ex + 1 * st, ey + h * 0.95, w * 0.8, 2.4), 1.5 * cv.ss) * 0.35, C('#f08a90'))
        # mouth
        mx, v = self.ring(0, 24 * k / self.k)
        if v > 0.2:
            my = hy + 23 * k
            mx -= 3 * self.st
            style = p.get('mouth', s.get('mouth', 'soft'))
            if style == 'smirk':
                m = cv.mask_limb((mx - 4, my + 0.5), (mx + 3.5, my - 1.2), 0.9, 1.0)
            elif style == 'open':
                m = cv.mask_ellipse(mx, my + 1, 3, 2.6)
            else:
                m = cv.mask_limb((mx - 2.8, my), (mx + 2.8, my), 0.8, 0.8)
            cv.fill(m, C('#7a3a44'))

    # ---------------- hair ----------------
    def hair_cap_back(self, cx, hy, R, hair):
        cv, hs = self.cv, self.s['hair']
        st = hs['style']
        if st == 'bald':
            return
        m = cv.mask_ellipse(cx + 1.5 * self.st, hy - 3, R * 1.1, R * 1.05)
        if st == 'spiky':
            pts = []
            n = 15
            for i in range(n + 1):
                a = math.pi * (1.0 + i / n)
                r = R * (1.18 if i % 2 else 1.0)
                pts.append((cx + math.cos(a) * r * 1.08, hy - 4 + math.sin(a) * r))
            pts += [(cx + R * 1.12, hy + 14), (cx - R * 1.12, hy + 14)]
            m = np.maximum(m, cv.mask_poly(pts))
        if st in ('long', 'ponytail', 'braid', 'bun', 'short', 'spiky'):
            # side mass to jaw height
            dn = 0.8 if st != 'short' else 0.35
            m = np.maximum(m, cv.mask_poly([(cx - R * 1.1, hy - 4), (cx + R * 1.1, hy - 4), (cx + R * 1.0, hy + R * dn * 0.7), (cx + R * 0.82, hy + R * dn), (cx - R * 0.82, hy + R * dn), (cx - R * 1.0, hy + R * dn * 0.7)]))
        self.capmask = m
        part(cv, m, hair, sh=0.28, shk=3, hi=0.1)

    def hair_back_mass(self):
        """Long hair / ponytail / braid hanging behind (or over, from behind) the body."""
        s, p, cv = self.s, self.p, self.cv
        hs = s['hair']
        st = hs['style']
        hair = C(hs['color'])
        cx, hy = self.hx(), self.hy
        R = 32 * self.k * s.get('headk', 1.0)
        sway = p.get('hairSway', 0)
        if st == 'ponytail':
            rx, d = self.ring(180, R * 0.75 / self.k)
            root = (rx, hy - R * 0.72)
            side = 1 if self.ct >= 0 else -0.2
            tip = (root[0] + 14 * side + sway * 1.3 + self.st * 12, self.Y(152) + p.get('bob', 0))
            mid = ((root[0] + tip[0]) / 2 + 8 * side + sway, (root[1] + tip[1]) / 2)
            pts = []
            n = 14
            for i in range(n + 1):
                t = i / n
                x = (1 - t) ** 2 * root[0] + 2 * (1 - t) * t * mid[0] + t * t * tip[0]
                y = (1 - t) ** 2 * root[1] + 2 * (1 - t) * t * mid[1] + t * t * tip[1]
                w = 9 * (1 - t) ** 0.8 + 1.2 + 3 * math.sin(t * math.pi)
                pts.append((x, y, w))
            left = [(x - w, y) for x, y, w in pts]
            right = [(x + w, y) for x, y, w in reversed(pts)]
            m = cv.mask_poly(left + right)
            part(cv, m, hair, sh=0.3, shk=3.5, hi=0.18)
            self.hair_shine(m, hair)
        elif st == 'braid':
            rx, d = self.ring(180, R * 0.8 / self.k)
            x0, y0 = rx, hy + 6
            for i in range(6):
                t = i / 6
                x = x0 + (sway * 0.8 + 4) * t + self.st * 10 * t
                y = y0 + i * 9
                m = cv.mask_ellipse(x, y, 6.5 - i * 0.5, 6)
                part(cv, m, hair, lw=0.9, sh=0.3, shk=2, hi=0.2)
        elif st == 'long':
            m = cv.mask_poly([(cx - R * 1.05, hy), (cx + R * 1.05, hy), (cx + R * 1.1 + sway, self.Y(140)), (cx - R * 1.1 + sway, self.Y(140))])
            part(cv, m, hair, sh=0.3, shk=3, hi=0.15)

    def hair_shine(self, m, hair):
        cv = self.cv
        ys = np.nonzero(m.max(axis=1) > 0)[0]
        if not len(ys):
            return

    def hair_front(self, cx, hy, R, hair):
        s, p, cv = self.s, self.p, self.cv
        hs = s['hair']
        st = hs['style']
        if st == 'bald':
            sh = cv.mask_ellipse(cx - 6, hy - R * 0.55, 7, 4)
            cv.fill(sh * 0.5, C('#ffffff', 0.5))
            return
        th, ct = self.st, self.ct
        if ct < -0.05:
            # seen from behind: full back cap, strands to the nape
            m = cv.mask_ellipse(cx + 3 * th, hy - 3, R * 1.1, R * 1.06)
            m = np.maximum(m, cv.mask_poly([(cx - R * 1.04, hy - 2), (cx + R * 1.04, hy - 2), (cx + R * 0.9, hy + R * 0.85), (cx - R * 0.9, hy + R * 0.85)]))
            if st == 'spiky':
                for i in range(7):
                    x = cx - R + i * R / 3
                    m = np.maximum(m, cv.mask_poly([(x - 6, hy + R * 0.5), (x + 6, hy + R * 0.5), (x + 2 + p.get('hairSway', 0) * 0.3, hy + R * 1.05)]))
            if abs(th) > 0.3 and ct > -0.95:
                # cheek / ear still visible at 3/4 back view: leave the far-front strip open
                pass
            part(cv, m, hair, sh=0.3, shk=3, hi=0.14)
            self.shine_band(m, hy - R * 0.45, R, hair)
            if hs.get('tips'):
                self.tips(m, hy + R * 0.62, C(hs['tips']))
            if st == 'ponytail' or st == 'bun':
                self.ornament(cx, hy, R)
            return
        # back-half cap at side/3-4 view
        if abs(th) > 0.35:
            bc = cv.mask_ellipse(cx + 11 * th * self.k, hy - 5, R * 0.8, R * 1.0)
            bc = np.maximum(bc, cv.mask_poly([(cx + 2 * th, hy - R * 0.7), (cx + R * 1.05 * th, hy - R * 0.3), (cx + R * 0.95 * th, hy + R * 0.7), (cx + 6 * th, hy + R * 0.6)]))
            part(cv, bc, hair, sh=0.28, shk=3, hi=0.12)
        # bangs: strands around the front of the head
        strands = hs.get('bangs', 9)
        spiky = st == 'spiky'
        m = np.zeros((cv.H, cv.W), np.float32)
        rng = np.random.RandomState(hs.get('seed', 3))
        lens = rng.uniform(0.75, 1.0, 32)
        for i in range(strands):
            a = -78 + 156 * i / (strands - 1)
            x, v = self.ring(a, R * 1.02 / self.k)
            if v < -0.05:
                continue
            rx, _ = self.ring(a * 0.55, R * 0.55 / self.k)
            root = (rx, hy - R * 0.98)
            L = (0.34 + 0.2 * (1 - abs(a) / 90)) * R * lens[i % 32]
            if abs(a) > 60:
                L = R * (0.95 if st in ('ponytail', 'long') else 0.55) * lens[i % 32]
            if spiky:
                L *= 1.18
            tip = (x + (x - cx) * 0.05 - th * 3, hy - R * 0.42 + L)
            wd = (7.5 if not spiky else 6.5) * self.k * max(0.35, v)
            ctrl = ((root[0] + tip[0]) / 2 + (x - cx) * 0.18, (root[1] + tip[1]) / 2 - 2)
            pts = []
            n = 8
            for j in range(n + 1):
                t = j / n
                px = (1 - t) ** 2 * root[0] + 2 * (1 - t) * t * ctrl[0] + t * t * tip[0]
                py = (1 - t) ** 2 * root[1] + 2 * (1 - t) * t * ctrl[1] + t * t * tip[1]
                w = wd * (1 - t) ** (0.6 if not spiky else 0.9) + 0.4
                pts.append((px, py, w))
            poly = [(px - w, py) for px, py, w in pts] + [(px + w, py) for px, py, w in reversed(pts)]
            m = np.maximum(m, cv.mask_poly(poly))
        # top cap over the strand roots
        top = cv.mask_ellipse(cx + 1.5 * th, hy - R * 0.55, R * 1.04, R * 0.55)
        m = np.maximum(m, top)
        if spiky:
            pts = []
            n = 13
            for i in range(n + 1):
                a = math.pi * (1.05 + 0.9 * i / n)
                r = R * (1.32 if i % 2 else 1.02)
                pts.append((cx + math.cos(a) * r * 1.05 + th * 2, hy - 6 + math.sin(a) * r * 0.95))
            m = np.maximum(m, cv.mask_poly(pts + [(cx + R * 0.9, hy - R * 0.4), (cx - R * 0.9, hy - R * 0.4)]))
            # cowlick
            m = np.maximum(m, cv.mask_poly([(cx - 4, hy - R * 1.15), (cx + 5, hy - R * 1.05), (cx + 12 + th * 4, hy - R * 1.5)]))
        part(cv, m, hair, sh=0.3, shk=2.8, hi=0.16)
        self.shine_band(m, hy - R * 0.62, R, hair)
        if hs.get('tips'):
            self.tips(m, hy - R * 0.05, C(hs['tips']))
        if st in ('ponytail', 'bun') and ct < 0.95:
            self.ornament(cx, hy, R)
        elif st in ('ponytail', 'bun'):
            self.ornament(cx, hy, R)

    def shine_band(self, m, y, R, hair):
        cv = self.cv
        cx = self.hx()
        arc = cv.mask_ellipse(cx - 3 * self.st - 4, y, R * 0.82, 4.2) * (1 - cv.mask_ellipse(cx - 3 * self.st - 4, y + 3.5, R * 0.78, 3.8))
        # broken highlight: notches
        notch = np.ones_like(arc)
        for i in (-1, 1):
            x = cx - 4 + i * R * 0.3
            notch *= 1 - cv.mask_poly([(x - 1.3, y - 8), (x + 1.3, y - 8), (x, y + 8)])
        cv.fill(arc * notch * m * 0.85, shade(hair, 0.55))

    def tips(self, m, y0, col):
        cv = self.cv
        H = cv.H
        g = np.clip((np.arange(H, dtype=np.float32) / cv.ss - y0) / 16, 0, 1)
        cv.fill(m * g[:, None] * 0.9, col)

    def ornament(self, cx, hy, R):
        s, cv = self.s, self.cv
        orn = s.get('ornament')
        if not orn:
            return
        ox, d = self.ring(150, R * 0.8 / self.k)
        oy = hy - R * 0.95
        if self.ct < -0.3:
            ox, oy = self.ring(180, R * 0.6 / self.k)[0], hy - R * 0.85
        petal = C(orn['petal'])
        for i, a in enumerate((-70, -35, 0, 35, 70)):
            r = a * D2R
            px, py = ox + math.sin(r) * 6.5, oy - math.cos(r) * 4.5
            m = cv.mask_ellipse(px, py, 3.3, 6.3, rot=r)
            part(cv, m, petal if i % 2 == 0 else shade(petal, -0.08), lw=0.7, sh=0.18, shk=1.2, hi=0.2)
        cm = cv.mask_ellipse(ox, oy + 1, 3, 2.4)
        part(cv, cm, C(orn['center']), lw=0.6, sh=0.2, shk=1)
        if orn.get('tassel'):
            tm = cv.mask_limb((ox + 3, oy + 3), (ox + 4 + self.p.get('hairSway', 0) * 0.3, oy + 18), 1.2, 1.8)
            part(cv, tm, C(orn['center']), lw=0.6, sh=0.2, shk=1)

    def headwear(self, cx, hy, R):
        s, cv = self.s, self.cv
        hw = s.get('headwear')
        if not hw:
            return
        if hw['type'] == 'horns':
            for side in (-1, 1):
                x, d = self.ring(55 * side, R * 0.85 / self.k)
                if d < -0.4:
                    continue
                m = cv.mask_poly([(x - 4, hy - R * 0.75), (x + 4, hy - R * 0.8), (x + side * 6 + (cx - x) * -0.2, hy - R * 1.45)])
                part(cv, m, C(hw['color']), lw=0.9, sh=0.3, shk=1.5, hi=0.2)
        elif hw['type'] == 'helmet':
            m = cv.mask_ellipse(cx, hy - R * 0.35, R * 1.12, R * 0.82)
            m = m * cv.mask_poly([(0, 0), (FW, 0), (FW, hy - R * 0.1), (0, hy - R * 0.1)])
            part(cv, m, C(hw['color']), sh=0.32, shk=3, hi=0.35)
            rim = cv.mask_poly([(cx - R * 1.15, hy - R * 0.22), (cx + R * 1.15, hy - R * 0.22), (cx + R * 1.1, hy - R * 0.08), (cx - R * 1.1, hy - R * 0.08)])
            part(cv, rim, shade(C(hw['color']), -0.15), lw=0.8, sh=0.2, hi=0.3)
            if hw.get('plume'):
                pm = cv.mask_ellipse(cx + 4 * self.st, hy - R * 1.1, 5, 9, rot=-0.3)
                part(cv, pm, C(hw['plume']), lw=0.8, sh=0.25)
        elif hw['type'] == 'kerchief':
            m = cv.mask_ellipse(cx + 1.5 * self.st, hy - R * 0.5, R * 1.08, R * 0.68)
            m = m * cv.mask_poly([(0, 0), (FW, 0), (FW, hy - R * 0.2), (0, hy - R * 0.2)])
            part(cv, m, C(hw['color']), sh=0.25, shk=2.5, hi=0.15)
            if self.ct < 0.2:
                kn = cv.mask_ellipse(cx + 8 * self.st * (1 if self.ct < 0 else 1), hy - R * 0.2, 6, 4)
                part(cv, kn, C(hw['color']), lw=0.8)
        elif hw['type'] == 'hood':
            m = cv.mask_ellipse(cx + 2 * self.st, hy - 2, R * 1.22, R * 1.18)
            if self.ct > -0.1:
                face = cv.mask_ellipse(cx - 6 * self.st, hy + 4, R * 0.9 * (1 - 0.3 * abs(self.st)), R * 0.98)
                m = m * (1 - face)
            m = m * cv.mask_poly([(0, 0), (FW, 0), (FW, hy + R * 0.9), (0, hy + R * 0.9)])
            part(cv, m, C(hw['color']), sh=0.3, shk=3, hi=0.12)

    # ---------------- props ----------------
    def weapon(self, hx, hy, ang):
        s, p, cv = self.s, self.p, self.cv
        w = s['weapon']
        # screen-space arm direction (shoulder -> hand)
        l = [l for l in self.limbs if l['side'] == -1][0]
        vx, vy = hx - l['sh'][0], hy - l['sh'][1]
        n = math.hypot(vx, vy) or 1
        vx, vy = vx / n, vy / n
        deg = ang / D2R
        fsgn = -1 if self.st > 0.2 else (1 if self.st < -0.2 else 0)
        if w == 'staff':
            t = min(1, max(0, (deg - 45) / 45))
            out = 1 if hx >= self.cx else -1
            base_x = 0.4 * fsgn * abs(self.st) if abs(self.st) > 0.5 else 0.2 * out
            ux, uy = base_x * (1 - t) + vx * t, -1 * (1 - t) + vy * t
        else:
            t = min(1, max(0, (deg - 30) / 60))
            # resting: point forward-down; swinging: extend the arm
            rx, ry = (0.75 * (fsgn or 0.6), 0.55)
            ux, uy = rx * (1 - t) + vx * t, ry * (1 - t) + vy * t
        n = math.hypot(ux, uy) or 1
        ux, uy = ux / n, uy / n
        if w == 'staff':
            L = 128 * self.k * (1 - 0.4 * t)
            top = (hx + ux * L * 0.7, hy + uy * L * 0.7)
            bot = (hx - ux * L * 0.3, hy - uy * L * 0.3)
            m = cv.mask_limb(bot, top, 2.0, 2.3)
            part(cv, m, C('#e8e4ef'), lw=0.9, sh=0.3, shk=1.5, hi=0.3)
            self.staff_head = (top[0] + ux * 6, top[1] + uy * 6, p.get('glow', 0.25))
        elif w == 'sword':
            L = 62 * self.k
            tip = (hx + ux * L, hy + uy * L)
            base = (hx + ux * 6, hy + uy * 6)
            m = cv.mask_limb(base, tip, 3.4, 0.8)
            part(cv, m, C('#3a3442'), lw=0.9, sh=0.3, shk=1.2, hi=0.0)
            edge = cv.mask_limb(base, tip, 1.4, 0.3)
            cv.fill(edge, C('#ff5262'))
            cv.add(np.array(C('#ff3040')[:3]), blur(edge, 2.5 * cv.ss) * (0.6 + p.get('glow', 0)))
            guard = cv.mask_limb((hx + uy * 7 + ux * 5, hy - ux * 7 + uy * 5), (hx - uy * 7 + ux * 5, hy + ux * 7 + uy * 5), 2, 2)
            part(cv, guard, C('#8a1a28'), lw=0.7, sh=0.2)
        elif w == 'bow':
            m = cv.mask_ellipse(hx + ux * 2, hy + uy * 2, 4, 26) * (1 - cv.mask_ellipse(hx + ux * 2 + 3, hy + uy * 2, 3.5, 24))
            part(cv, m, C('#7a4a2a'), lw=0.8, sh=0.3, shk=1.2, hi=0.2)
        elif w == 'gauntlet':
            m = cv.mask_ellipse(hx, hy, 8.5, 8)
            part(cv, m, C('#5a5a64'), lw=1.0, sh=0.3, shk=2, hi=0.35)

    def draw_staff_head(self, hxh, hyh, g):
        cv = self.cv
        ring = cv.mask_ellipse(hxh, hyh, 9, 9) * (1 - cv.mask_ellipse(hxh + 2.6, hyh - 1.6, 6.8, 6.8))
        part(cv, ring, C('#e2bf62'), lw=0.9, sh=0.3, shk=1.5, hi=0.35)
        for a in (-0.9, 0, 0.9):
            pm = cv.mask_ellipse(hxh + math.sin(a) * 5, hyh - 9 - math.cos(a) * 2, 2.2, 4.5, rot=a)
            part(cv, pm, C('#fbf6ff'), lw=0.6, sh=0.2, shk=1, hi=0.2)
        gem = cv.mask_ellipse(hxh, hyh, 4.0, 4.6)
        part(cv, gem, C('#9fe3ff'), lw=0.7, sh=0.25, shk=1, hi=0.5)
        cv.add(np.array(C('#bfeaff')[:3]), blur(cv.mask_ellipse(hxh, hyh, 6, 6), (3 + 6 * g) * cv.ss) * (0.5 + g))

    def weapon_on_back(self):
        pass

    def fx(self):
        p, cv = self.p, self.cv
        sm = p.get('smear')
        if sm:
            # motion arc for attacks: crescent in front of the body
            col = C(self.s.get('smear_col', '#ffffff'))
            cx, cy = self.cx - 18 * self.st, self.shy + 4
            a0, a1 = sm
            r = 58 * self.k
            outer, inner = [], []
            n = 18
            for i in range(n + 1):
                t = a0 + (a1 - a0) * i / n
                w = math.sin(math.pi * i / n)
                outer.append((cx - math.sin(t * D2R) * r * self.st, cy - math.cos(t * D2R) * r))
                inner.append((cx - math.sin(t * D2R) * (r - 16 * w) * self.st, cy - math.cos(t * D2R) * (r - 16 * w)))
            m = cv.mask_poly(outer + inner[::-1])
            cv.add(np.array(col[:3]), blur(m, 1.2 * cv.ss) * 0.85)
        g = p.get('cast', 0)
        if g:
            col = np.array(C(self.s.get('magic', '#bfeaff'))[:3])
            # magic circle at the hands
            hands = [l['hand'] for l in self.limbs]
            mx = sum(h[0] for h in hands) / 2 - 6 * self.st
            my = min(h[1] for h in hands) - 6
            ring = cv.mask_ellipse(mx, my, 16 * g, 16 * g) * (1 - cv.mask_ellipse(mx, my, 13 * g, 13 * g))
            cv.add(col, blur(ring, 0.8 * cv.ss) * 0.9)
            cv.add(col, blur(cv.mask_ellipse(mx, my, 8 * g, 8 * g), 5 * cv.ss) * 0.9)
            # rune marks around the circle
            for i in range(8):
                a = i * math.pi / 4 + g * 2
                rm = cv.mask_ellipse(mx + math.cos(a) * 19 * g, my + math.sin(a) * 19 * g, 1.6, 1.6)
                cv.add(col, rm)


# ---------------------------------------------------------------------------
# Animations
# ---------------------------------------------------------------------------
def walk_pose(i, n=8):
    t = i / n
    ph = 2 * math.pi * t
    return dict(
        bob=-2.6 * abs(math.sin(ph)) + 1.0,
        legL=(12 * math.sin(ph), 5 * max(0, math.cos(ph))),
        legR=(-12 * math.sin(ph), 5 * max(0, -math.cos(ph))),
        armL=-24 * math.sin(ph), armR=24 * math.sin(ph),
        hairSway=4 * math.sin(ph - 0.9), hemSway=1.6 * math.sin(ph), lean=4,
    )


def idle_pose(i, n=4, blink=False):
    b = math.sin(2 * math.pi * i / n)
    return dict(breath=b * 0.9, headDy=b * 0.7, bob=0, armL=3 + b, armR=3 - b * 0.5, hairSway=b * 1.2, blink=blink)


def cast_pose(i):
    table = [
        dict(crouch=2, armL=-20, armR=-25, lean=-2, cast=0),
        dict(crouch=0, armL=60, armR=70, lean=2, cast=0.35, glow=0.5),
        dict(crouch=-2, armL=125, armR=135, lean=3, cast=0.8, glow=0.9, mouth='open'),
        dict(crouch=-3, armL=130, armR=140, lean=3, cast=1.0, glow=1.0, mouth='open'),
        dict(crouch=-2, armL=120, armR=128, lean=2, cast=0.85, glow=0.8),
        dict(crouch=0, armL=40, armR=45, lean=1, cast=0.2, glow=0.3),
    ]
    p = dict(table[i])
    p.setdefault('bob', 0)
    return p


def attack_pose(i):
    table = [
        dict(armR=205, armL=-30, lean=-6, crouch=1, legL=(6, 0), legR=(-6, 0), wpn=0),
        dict(armR=165, armL=-20, lean=0, crouch=0, legL=(10, 2), legR=(-6, 0), smear=(200, 150)),
        dict(armR=95, armL=20, lean=8, crouch=2, legL=(14, 0), legR=(-10, 0), smear=(190, 85), mouth='open'),
        dict(armR=55, armL=30, lean=10, crouch=3, legL=(14, 0), legR=(-10, 0), smear=(150, 45)),
        dict(armR=35, armL=20, lean=6, crouch=2, legL=(10, 0), legR=(-8, 0)),
        dict(armR=15, armL=8, lean=2, crouch=0, legL=(4, 0), legR=(-4, 0)),
    ]
    return dict(table[i])


def hurt_pose(i):
    return [dict(lean=-8, armL=-35, armR=-40, crouch=1, hurt=1, headDy=1, legL=(-4, 0), legR=(4, 0)),
            dict(lean=-12, armL=-50, armR=-55, crouch=3, hurt=1, headDy=2, legL=(-6, 0), legR=(6, 0))][i]


def kneel_pose():
    return dict(crouch=26, lean=10, armL=30, armR=40, headDy=6, legL=(10, 0), legR=(-14, 0), blink=True)


YAWS = [0, 45, 90, 135, 180]
BATTLE_YAW = 65

# Sheet layout: rows of up to 8 frames.
def sheet_rows(full=True):
    rows = []
    for y in YAWS:
        rows.append(('idle', y, [idle_pose(i) for i in range(4)] + [idle_pose(0, blink=True)]))
        rows.append(('walk', y, [walk_pose(i) for i in range(8)]))
    if full:
        rows.append(('bidle', BATTLE_YAW, [idle_pose(i) for i in range(4)] + [idle_pose(0, blink=True)]))
        rows.append(('cast', BATTLE_YAW, [cast_pose(i) for i in range(6)]))
        rows.append(('attack', BATTLE_YAW, [attack_pose(i) for i in range(6)]))
        rows.append(('hurt', BATTLE_YAW, [hurt_pose(i) for i in range(2)] + [kneel_pose()]))
        rows.append(('bwalk', BATTLE_YAW, [walk_pose(i) for i in range(8)]))
    return rows


def npc_frames():
    out = []
    for y in YAWS:
        out.append((y, idle_pose(0)))
        out.append((y, idle_pose(2)))
    return out
