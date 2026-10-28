"""Exporta Gerber RS-274X + Excellon (para mandar fabricar a placa).

Camadas geradas (vistas de cima, como manda o padrão):
  *-B_Cu.gbl      cobre (face de baixo)
  *-B_Mask.gbs    máscara de solda (face de baixo)
  *-F_SilkS.gto   serigrafia (face de cima)
  *-Edge_Cuts.gm1 contorno
  *-PTH.drl       furação
"""
import math
import os
import zipfile

NAME = 'tda7294_mono'

# Fonte de traço simples (grade 4 x 6), para a serigrafia
_F = {
    '0': [[(0, 0), (4, 0), (4, 6), (0, 6), (0, 0)], [(0, 6), (4, 0)]],
    '1': [[(1, 1), (2, 0), (2, 6)], [(1, 6), (3, 6)]],
    '2': [[(0, 1), (1, 0), (3, 0), (4, 1), (4, 2), (0, 6), (4, 6)]],
    '3': [[(0, 0), (4, 0), (2, 2.5), (4, 3.5), (4, 5), (3, 6), (0, 6)]],
    '4': [[(3, 6), (3, 0), (0, 4), (4, 4)]],
    '5': [[(4, 0), (0, 0), (0, 2.5), (3, 2.5), (4, 3.5), (4, 5), (3, 6), (0, 6)]],
    '6': [[(4, 0), (1, 0), (0, 1), (0, 6), (4, 6), (4, 3), (0, 3)]],
    '7': [[(0, 0), (4, 0), (1, 6)]],
    '8': [[(0, 0), (4, 0), (4, 6), (0, 6), (0, 0)], [(0, 3), (4, 3)]],
    '9': [[(4, 3), (0, 3), (0, 0), (4, 0), (4, 5), (3, 6), (0, 6)]],
    'A': [[(0, 6), (0, 2), (2, 0), (4, 2), (4, 6)], [(0, 3.5), (4, 3.5)]],
    'B': [[(0, 0), (3, 0), (4, 1), (4, 2), (3, 3), (0, 3)], [(3, 3), (4, 4), (4, 5), (3, 6), (0, 6), (0, 0)]],
    'C': [[(4, 0), (0, 0), (0, 6), (4, 6)]],
    'D': [[(0, 0), (3, 0), (4, 1), (4, 5), (3, 6), (0, 6), (0, 0)]],
    'E': [[(4, 0), (0, 0), (0, 6), (4, 6)], [(0, 3), (3, 3)]],
    'F': [[(4, 0), (0, 0), (0, 6)], [(0, 3), (3, 3)]],
    'G': [[(4, 0), (0, 0), (0, 6), (4, 6), (4, 3), (2, 3)]],
    'H': [[(0, 0), (0, 6)], [(4, 0), (4, 6)], [(0, 3), (4, 3)]],
    'I': [[(1, 0), (3, 0)], [(2, 0), (2, 6)], [(1, 6), (3, 6)]],
    'J': [[(4, 0), (4, 5), (3, 6), (1, 6), (0, 5)]],
    'K': [[(0, 0), (0, 6)], [(4, 0), (0, 3.5), (4, 6)]],
    'L': [[(0, 0), (0, 6), (4, 6)]],
    'M': [[(0, 6), (0, 0), (2, 3), (4, 0), (4, 6)]],
    'N': [[(0, 6), (0, 0), (4, 6), (4, 0)]],
    'O': [[(0, 0), (4, 0), (4, 6), (0, 6), (0, 0)]],
    'P': [[(0, 6), (0, 0), (4, 0), (4, 3), (0, 3)]],
    'Q': [[(0, 0), (4, 0), (4, 6), (0, 6), (0, 0)], [(2.5, 4), (4.5, 6.5)]],
    'R': [[(0, 6), (0, 0), (4, 0), (4, 3), (0, 3), (4, 6)]],
    'S': [[(4, 0), (0, 0), (0, 3), (4, 3), (4, 6), (0, 6)]],
    'T': [[(0, 0), (4, 0)], [(2, 0), (2, 6)]],
    'U': [[(0, 0), (0, 6), (4, 6), (4, 0)]],
    'V': [[(0, 0), (2, 6), (4, 0)]],
    'W': [[(0, 0), (1, 6), (2, 3), (3, 6), (4, 0)]],
    'X': [[(0, 0), (4, 6)], [(4, 0), (0, 6)]],
    'Y': [[(0, 0), (2, 3), (4, 0)], [(2, 3), (2, 6)]],
    'Z': [[(0, 0), (4, 0), (0, 6), (4, 6)]],
    '+': [[(0, 3), (4, 3)], [(2, 1), (2, 5)]],
    '-': [[(0.5, 3), (3.5, 3)]],
    ' ': [],
}


def text_strokes(txt, x, y, size):
    """Retorna polilinhas (mm, eixo Y para baixo) centradas em (x, y)."""
    txt = txt.upper()
    k = size / 6.0
    adv = 5.5 * k
    total = adv * len(txt) - 1.5 * k
    x0 = x - total / 2
    y0 = y - 3 * k
    out = []
    for i, ch in enumerate(txt):
        for stroke in _F.get(ch, []):
            out.append([(x0 + i * adv + px * k, y0 + py * k) for px, py in stroke])
    return out


class G:
    def __init__(self, h, func):
        self.h = h
        self.ap = {}
        self.body = []
        self.cur = None
        self.func = func

    def _ap(self, key):
        if key not in self.ap:
            self.ap[key] = 10 + len(self.ap)
        return self.ap[key]

    def use(self, key):
        d = self._ap(key)
        if self.cur != d:
            self.body.append(f'D{d}*')
            self.cur = d

    def c(self, v):
        return int(round(v * 1e6))

    def xy(self, x, y):
        return f'X{self.c(x)}Y{self.c(self.h - y)}'

    def line(self, pts, width):
        self.use(('C', round(width, 3)))
        self.body.append(self.xy(*pts[0]) + 'D02*')
        for p in pts[1:]:
            self.body.append(self.xy(*p) + 'D01*')

    def flash(self, x, y, key):
        self.use(key)
        self.body.append(self.xy(x, y) + 'D03*')

    def text(self):
        s = ['%FSLAX46Y46*%', '%MOMM*%', f'%TF.FileFunction,{self.func}*%', '%LPD*%']
        for key, d in self.ap.items():
            if key[0] == 'C':
                s.append(f'%ADD{d}C,{key[1]:.3f}*%')
            else:
                s.append(f'%ADD{d}R,{key[1]:.3f}X{key[1]:.3f}*%')
        s.append('G01*')
        s += self.body
        s.append('M02*')
        return '\n'.join(s) + '\n'


def export(b, outdir):
    os.makedirs(outdir, exist_ok=True)
    files = {}

    cu = G(b.h, 'Copper,L2,Bot')
    for t in b.tracks:
        cu.line(t.pts, t.width)
    for p in b.pads:
        cu.flash(p.x, p.y, ('R' if p.square else 'C', round(p.size, 3)))
    files[f'{NAME}-B_Cu.gbl'] = cu.text()

    mk = G(b.h, 'Soldermask,Bot')
    for p in b.pads:
        mk.flash(p.x, p.y, ('R' if p.square else 'C', round(p.size + 0.1, 3)))
    files[f'{NAME}-B_Mask.gbs'] = mk.text()

    sk = G(b.h, 'Legend,Top')
    for it in b.silk:
        k, d = it.kind, it.data
        if k == 'line':
            sk.line([(d[0], d[1]), (d[2], d[3])], 0.15 if it.size == 1.0 else min(it.size, 0.3))
        elif k == 'rect':
            x, y, w, h = d
            sk.line([(x, y), (x + w, y), (x + w, y + h), (x, y + h), (x, y)], 0.15)
        elif k == 'circle':
            cx, cy, r = d
            n = 48
            sk.line([(cx + r * math.cos(2 * math.pi * i / n), cy + r * math.sin(2 * math.pi * i / n))
                     for i in range(n + 1)], 0.15)
        elif k == 'text':
            txt, x, y = d
            txt = txt.replace('µ', 'U')
            for st in text_strokes(txt, x, y, it.size):
                if len(st) > 1:
                    sk.line(st, 0.15)
    files[f'{NAME}-F_SilkS.gto'] = sk.text()

    ed = G(b.h, 'Profile,NP')
    ed.line([(0, 0), (b.w, 0), (b.w, b.h), (0, b.h), (0, 0)], 0.1)
    files[f'{NAME}-Edge_Cuts.gm1'] = ed.text()

    # Excellon
    tools = {}
    for p in b.pads:
        tools.setdefault(round(p.drill, 2), []).append((p.x, p.y))
    for (x, y, d) in b.holes:
        tools.setdefault(round(d, 2), []).append((x, y))
    dr = ['M48', 'METRIC,TZ', 'FMAT,2']
    for i, d in enumerate(sorted(tools), 1):
        dr.append(f'T{i}C{d:.3f}')
    dr.append('%')
    dr.append('G90')
    dr.append('G05')
    for i, d in enumerate(sorted(tools), 1):
        dr.append(f'T{i}')
        for (x, y) in tools[d]:
            dr.append(f'X{x:.3f}Y{b.h - y:.3f}')
    dr.append('M30')
    files[f'{NAME}-PTH.drl'] = '\n'.join(dr) + '\n'

    for name, txt in files.items():
        with open(os.path.join(outdir, name), 'w') as f:
            f.write(txt)
    with zipfile.ZipFile(os.path.join(outdir, f'{NAME}_gerber.zip'), 'w',
                         zipfile.ZIP_DEFLATED) as z:
        for name in files:
            z.write(os.path.join(outdir, name), name)
