"""Geometria e verificações (DRC / conectividade) para a placa de face simples.

Tudo em milímetros, origem no canto superior esquerdo, Y para baixo,
visto pelo LADO DOS COMPONENTES (a camada de cobre fica embaixo).
"""
import math
from dataclasses import dataclass, field


@dataclass
class Pad:
    ref: str
    num: str
    x: float
    y: float
    size: float          # diâmetro (redondo) ou lado (quadrado)
    drill: float
    net: str
    square: bool = False
    h: float = 0.0       # altura > size => pad oval (oblongo) na vertical


@dataclass
class Track:
    net: str
    width: float
    pts: list


@dataclass
class Silk:
    kind: str            # 'line' | 'circle' | 'rect' | 'text' | 'poly'
    data: tuple
    size: float = 1.0


@dataclass
class Board:
    w: float
    h: float
    pads: list = field(default_factory=list)
    tracks: list = field(default_factory=list)
    silk: list = field(default_factory=list)
    holes: list = field(default_factory=list)      # (x, y, drill) furos de fixação
    jumpers: list = field(default_factory=list)    # (ref, padA, padB)
    parts: list = field(default_factory=list)      # (ref, value, descr)

    def pad(self, ref, num):
        for p in self.pads:
            if p.ref == ref and p.num == str(num):
                return p
        raise KeyError(f"{ref}.{num}")


# ---------------------------------------------------------------- distâncias
def _pt_seg(px, py, ax, ay, bx, by):
    dx, dy = bx - ax, by - ay
    L = dx * dx + dy * dy
    if L == 0:
        return math.hypot(px - ax, py - ay)
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / L))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))


def _seg_seg(a, b, c, d):
    def inter(p1, p2, p3, p4):
        def o(p, q, r):
            return (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])
        d1, d2 = o(p3, p4, p1), o(p3, p4, p2)
        d3, d4 = o(p1, p2, p3), o(p1, p2, p4)
        return (d1 * d2 < 0) and (d3 * d4 < 0)
    if inter(a, b, c, d):
        return 0.0
    return min(_pt_seg(*a, *c, *d), _pt_seg(*b, *c, *d),
               _pt_seg(*c, *a, *b), _pt_seg(*d, *a, *b))


def copper_items(board):
    """Lista de (net, tipo, geometria, meia-largura, id)."""
    items = []
    for i, p in enumerate(board.pads):
        if p.net is None:
            continue
        if p.h > p.size:
            d = (p.h - p.size) / 2
            items.append((p.net, 'seg', ((p.x, p.y - d), (p.x, p.y + d)), p.size / 2,
                          f"{p.ref}.{p.num}", None))
            continue
        r = p.size / 2 * (math.sqrt(2) if p.square else 1.0)
        items.append((p.net, 'pad', (p.x, p.y), r, f"{p.ref}.{p.num}", p))
    for i, t in enumerate(board.tracks):
        for j in range(len(t.pts) - 1):
            items.append((t.net, 'seg', (t.pts[j], t.pts[j + 1]), t.width / 2,
                          f"trilha {t.net}#{i}.{j}", None))
    return items


def _square_dist(p, q):
    """Distância de um ponto q à borda de um pad quadrado p (aprox. exata)."""
    h = p.size / 2
    dx = max(abs(q[0] - p.x) - h, 0)
    dy = max(abs(q[1] - p.y) - h, 0)
    return math.hypot(dx, dy)


def item_dist(a, b):
    """Distância borda a borda entre dois itens de cobre."""
    ta, ga, ra, pa = a[1], a[2], a[3], a[5]
    tb, gb, rb, pb = b[1], b[2], b[3], b[5]
    if ta == 'pad' and tb == 'pad':
        if pa.square or pb.square:
            sq, ot = (pa, pb) if pa.square else (pb, pa)
            return _square_dist(sq, (ot.x, ot.y)) - (0 if ot.square else ot.size / 2)
        return math.hypot(ga[0] - gb[0], ga[1] - gb[1]) - ra - rb
    if ta == 'pad' and tb == 'seg':
        a, b = b, a
        ta, ga, ra, pa, tb, gb, rb, pb = tb, gb, rb, pb, ta, ga, ra, pa
    if ta == 'seg' and tb == 'pad':
        if pb.square:
            # amostra o segmento
            (x1, y1), (x2, y2) = ga
            n = max(2, int(math.hypot(x2 - x1, y2 - y1) / 0.05))
            return min(_square_dist(pb, (x1 + (x2 - x1) * k / n, y1 + (y2 - y1) * k / n))
                       for k in range(n + 1)) - ra
        return _pt_seg(gb[0], gb[1], *ga[0], *ga[1]) - ra - rb
    return _seg_seg(ga[0], ga[1], gb[0], gb[1]) - ra - rb


def drc(board, clearance=0.45, edge=0.6):
    errs = []
    items = copper_items(board)
    for i in range(len(items)):
        for j in range(i + 1, len(items)):
            a, b = items[i], items[j]
            if a[0] == b[0]:
                continue
            d = item_dist(a, b)
            if d < clearance:
                errs.append((round(d, 3), a[4], b[4]))
    # distância à borda da placa
    for it in items:
        if it[1] == 'pad':
            pts = [it[2]]
        else:
            pts = list(it[2])
        for (x, y) in pts:
            m = min(x, y, board.w - x, board.h - y) - it[3]
            if m < edge:
                errs.append((round(m, 3), it[4], 'BORDA'))
    # furos de fixação
    for (hx, hy, hd) in board.holes:
        for it in items:
            if it[1] == 'pad':
                d = math.hypot(it[2][0] - hx, it[2][1] - hy) - it[3] - hd / 2
            else:
                d = _pt_seg(hx, hy, *it[2][0], *it[2][1]) - it[3] - hd / 2
            if d < 1.0:
                errs.append((round(d, 3), it[4], f'FURO({hx},{hy})'))
    return errs


def connectivity(board):
    """Verifica que cada net forma um único bloco de cobre (+ jumpers)."""
    items = copper_items(board)
    parent = list(range(len(items)))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    def union(i, j):
        parent[find(i)] = find(j)

    for i in range(len(items)):
        for j in range(i + 1, len(items)):
            if items[i][0] != items[j][0]:
                continue
            if item_dist(items[i], items[j]) <= 0.01:
                union(i, j)
    idx = {it[4]: k for k, it in enumerate(items)}
    for (ref, a, b) in board.jumpers:
        union(idx[a], idx[b])
    nets = {}
    for k, it in enumerate(items):
        nets.setdefault(it[0], {}).setdefault(find(k), []).append(it[4])
    problems = {}
    for net, groups in nets.items():
        if len(groups) > 1:
            problems[net] = [sorted(g for g in grp if not g.startswith('trilha'))
                             for grp in groups.values()]
    # trilhas soltas: segmento cujas pontas não tocam nada
    return problems
