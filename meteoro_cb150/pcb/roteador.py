"""Roteador com negociacao de congestionamento (PathFinder), face simples ou dupla.

Grade de 1,27 mm: trilhas finas (<= 0,8 mm) podem ocupar celulas vizinhas;
trilhas largas exigem uma celula livre em volta. Pads sao obstaculos
rigidos (verificados com distancia exata num raster fino).
- Face simples (layers=1): sem caminho no cobre, o roteador usa jumpers
  (fio no lado dos componentes) de 5,08 a 15,24 mm, com custo alto.
- Dupla face (layers=2): camada 0 = B.Cu (prefere horizontal), camada 1 =
  F.Cu (prefere vertical), com vias entre elas; sem jumpers.
Celulas sao (i, j, camada).
"""
import heapq
import os

import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import distance_transform_edt, uniform_filter

G = 1.27            # passo da grade (mm)
RES = G / 8         # raster fino para distancias exatas aos pads
DIRS = [(1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (1, -1), (-1, 1), (-1, -1)]
JUMP_L = [4, 6, 8, 10, 12]
JUMP_PAD = 2.0      # diametro do pad do jumper (mm)
JUMP_COST = float(os.environ.get("JUMP_COST", "150"))
VIA_PAD = 1.6       # diametro da via (mm) - furo 0,8 mm, facil de fazer com fio
VIA_COST = float(os.environ.get("VIA_COST", "12"))
VIA = 16            # codigo de "direcao" de um passo por via
NECK_W = 0.9        # largura minima de trilha larga junto aos pads
NECK_R = 2.6        # alcance do afinamento a partir do pad (mm)


class PathFinder:
    def __init__(self, bw, bh, pads, holes, width, clearance, edge=1.0, layers=1):
        """pads: lista (net, ref, num, x, y, poligono[(x,y)...]) em mm (origem = canto da placa)"""
        self.gx, self.gy = int(bw / G) + 1, int(bh / G) + 1
        self.nl = layers
        self.width = width
        self.clr = clearance
        self.nets = sorted({p[0] for p in pads if p[0]})
        self.nid = {n: i + 1 for i, n in enumerate(self.nets)}
        fx, fy = int(bw / RES) + 1, int(bh / RES) + 1
        img = Image.new("I", (fx, fy), 0)
        d = ImageDraw.Draw(img)
        for (net, ref, num, x, y, poly) in pads:
            d.polygon([(px / RES, py / RES) for px, py in poly], fill=self.nid.get(net, -1))
        for (x, y, r) in holes:
            d.ellipse([(x - r) / RES, (y - r) / RES, (x + r) / RES, (y + r) / RES], fill=-1)
        e = max(1, int(edge / RES))
        d.rectangle([0, 0, fx, e], fill=-1)
        d.rectangle([0, fy - e, fx, fy], fill=-1)
        d.rectangle([0, 0, e, fy], fill=-1)
        d.rectangle([fx - e, 0, fx, fy], fill=-1)
        lab = np.array(img, dtype=np.int32)
        step = 8
        # para cada net: celulas legais (longe o bastante de cobre de pads de outras nets)
        self.legal = {}
        self.jlegal = {}
        self.vlegal = {}
        # pads de jumper e vias nao podem cair sobre nenhum pad (nem da propria net)
        dist_any = distance_transform_edt(lab == 0)[::step, ::step][: self.gy, : self.gx] * RES
        for n in self.nets:
            v = self.nid[n]
            foreign = (lab != 0) & (lab != v)
            dist = distance_transform_edt(~foreign)[::step, ::step][: self.gy, : self.gx] * RES
            w = width(n)
            self.legal[n] = dist >= w / 2 + clearance + 0.02
            if w > NECK_W:
                # trilha larga afina (NECK_W) perto dos proprios pads, entre pinos vizinhos
                own = distance_transform_edt(lab != v)[::step, ::step][: self.gy, : self.gx] * RES
                self.legal[n] |= (dist >= NECK_W / 2 + clearance + 0.02) & (own <= NECK_R)
            self.jlegal[n] = dist_any >= JUMP_PAD / 2 + clearance + 0.1
            self.vlegal[n] = dist_any >= VIA_PAD / 2 + clearance + 0.1
        # terminais: celulas dentro do cobre de cada pad (pads THT existem nas duas faces)
        self.terms = {}   # net -> list of (ref, num, x, y, set(cells))
        for (net, ref, num, x, y, poly) in pads:
            if not net:
                continue
            v = self.nid[net]
            cells = set()
            xs = [p[0] for p in poly]
            ys = [p[1] for p in poly]
            for i in range(int(min(xs) / G), int(max(xs) / G) + 2):
                for j in range(int(min(ys) / G), int(max(ys) / G) + 2):
                    fi, fj = i * step, j * step
                    if 0 <= j < self.gy and 0 <= i < self.gx and fj < lab.shape[0] and fi < lab.shape[1] and lab[fj, fi] == v:
                        cells.add((i, j))
            if not cells:
                cells.add((int(round(x / G)), int(round(y / G))))
                self.legal[net][int(round(y / G)), int(round(x / G))] = True
            for (i, j) in cells:
                self.legal[net][j, i] = True
            cells3 = {(i, j, lay) for (i, j) in cells for lay in range(self.nl)}
            self.terms.setdefault(net, []).append((ref, num, x, y, cells3))
        self.padc = [(net, x, y, max(((px - x) ** 2 + (py - y) ** 2) ** 0.5 for px, py in poly))
                     for (net, ref, num, x, y, poly) in pads]
        self.hist = np.zeros((self.nl, self.gy, self.gx))
        self.routes = {}      # net -> (celulas, celulas "largas", caminhos)

    def is_wide(self, n):
        return self.width(n) > 0.8

    # ------------------------------------------------------------ ocupacao
    def occupancy(self, skip):
        occ_all = np.zeros((self.nl, self.gy, self.gx))
        occ_wide = np.zeros((self.nl, self.gy, self.gx))
        for n, (cells, wide_cells, _) in self.routes.items():
            if n == skip:
                continue
            for (i, j, lay) in cells:
                occ_all[lay, j, i] += 1
            for (i, j, lay) in wide_cells:
                occ_wide[lay, j, i] += 1
        return occ_all, occ_wide

    def conflict_map(self, net):
        occ_all, occ_wide = self.occupancy(net)
        if self.is_wide(net):
            return uniform_filter(occ_all, size=(1, 3, 3), mode="constant") * 9
        return occ_all + uniform_filter(occ_wide, size=(1, 3, 3), mode="constant") * 9

    # ------------------------------------------------------------ busca
    def astar(self, net, src, dst, cost_cell, jump_ok):
        legal = self.legal[net]
        jl = self.jlegal[net]
        vl = self.vlegal[net]
        gx, gy = self.gx, self.gy
        two = self.nl == 2
        dl = list(dst)
        dxs = np.array([c[0] for c in dl])
        dys = np.array([c[1] for c in dl])

        def h(c):
            dx = np.abs(dxs - c[0])
            dy = np.abs(dys - c[1])
            return float(np.min(np.maximum(dx, dy) + 0.414 * np.minimum(dx, dy)))
        hc = {}
        openq = []
        g = {}
        came = {}
        for s in src:
            g[(s, -1)] = 0.0
            heapq.heappush(openq, (h(s), 0.0, s, -1))
        exp = 0
        while openq:
            f, gc, c, d = heapq.heappop(openq)
            if gc > g.get((c, d), 1e18):
                continue
            if c in dst:
                path = [(c, d)]
                k = (c, d)
                while k in came:
                    k = came[k]
                    path.append(k)
                return path[::-1]
            exp += 1
            if exp > 500000:
                return None
            lay = c[2]
            for di, (dx, dy) in enumerate(DIRS):
                nc = (c[0] + dx, c[1] + dy, lay)
                if not (0 <= nc[0] < gx and 0 <= nc[1] < gy) or not legal[nc[1], nc[0]]:
                    continue
                k = cost_cell[lay, nc[1], nc[0]]
                if dx and dy:
                    a, b = (nc[0], c[1]), (c[0], nc[1])
                    if not legal[a[1], a[0]] or not legal[b[1], b[0]]:
                        continue
                    k = 1.414 * k + 0.5 * (cost_cell[lay, a[1], a[0]] + cost_cell[lay, b[1], b[0]]) - 1.0
                    if two:
                        k *= 1.15
                elif two and (dy != 0) == (lay == 0):
                    k *= 1.6    # contra a direcao preferida da camada
                turn = 0.0 if d in (-1, di) or d >= 8 else (0.35 if (d < 4) != (di < 4) else 0.8)
                ng = gc + k + turn
                if ng < g.get((nc, di), 1e18):
                    g[(nc, di)] = ng
                    came[(nc, di)] = (c, d)
                    ij = nc[:2]
                    if ij not in hc:
                        hc[ij] = h(nc)
                    heapq.heappush(openq, (ng + hc[ij], ng, nc, di))
            if two and d != VIA and vl[c[1], c[0]]:
                nc = (c[0], c[1], 1 - lay)
                ng = gc + VIA_COST + 3 * (cost_cell[0, c[1], c[0]] + cost_cell[1, c[1], c[0]])
                if ng < g.get((nc, VIA), 1e18):
                    g[(nc, VIA)] = ng
                    came[(nc, VIA)] = (c, d)
                    heapq.heappush(openq, (ng + h(nc), ng, nc, VIA))
            if jump_ok and not two and d < 8 and jl[c[1], c[0]]:
                for di, (dx, dy) in enumerate(DIRS[:4]):
                    for L in JUMP_L:
                        nc = (c[0] + dx * L, c[1] + dy * L, 0)
                        if not (0 <= nc[0] < gx and 0 <= nc[1] < gy) or not jl[nc[1], nc[0]]:
                            continue
                        ng = gc + JUMP_COST + 0.5 * L + 4 * (cost_cell[0, c[1], c[0]] + cost_cell[0, nc[1], nc[0]])
                        key = (nc, 8 + di)
                        if ng < g.get(key, 1e18):
                            g[key] = ng
                            came[key] = (c, d)
                            heapq.heappush(openq, (ng + h(nc), ng, nc, 8 + di))
        return None

    def route_net(self, net, pfac, jump_ok):
        conf = self.conflict_map(net)
        cost_cell = (1.0 + self.hist) * (1.0 + pfac * conf)
        terms = self.terms[net]
        order = sorted(range(len(terms)), key=lambda i: terms[i][2] + terms[i][3])
        tree = set(terms[order[0]][4])
        todo = [terms[i] for i in order[1:]]
        paths = []
        failed = []
        connected = [terms[order[0]]]
        while todo:
            todo.sort(key=lambda t: min(abs(t[2] - c[2]) + abs(t[3] - c[3]) for c in connected))
            t = todo.pop(0)
            p = self.astar(net, t[4], tree, cost_cell, jump_ok)
            if p is None:
                failed.append(t)
                continue
            paths.append((t, p))
            connected.append(t)
            tree |= t[4]
            tree |= {c for c, d in p}
        cells, wide = set(), set()
        for t, p in paths:
            for k, (c, d) in enumerate(p):
                cells.add(c)
                if 4 <= d < 8:
                    pc = p[k - 1][0]
                    cells.add((c[0], pc[1], c[2]))
                    cells.add((pc[0], c[1], c[2]))
                if d >= 8:
                    # pads de jumper / via: ocupam como trilha larga (nas duas faces, se via)
                    for q in (c, p[k - 1][0]):
                        for lay in range(self.nl):
                            wide.add((q[0], q[1], lay))
                            cells.add((q[0], q[1], lay))
        if self.is_wide(net):
            wide |= cells
        self.routes[net] = (cells, wide, paths)
        return failed

    def overuse(self):
        # conflito real: celula usada por 2+ nets, ou net larga com vizinha de outra net
        over = np.zeros((self.nl, self.gy, self.gx))
        for n, (cells, wide, _) in self.routes.items():
            conf = self.conflict_map(n)
            for (i, j, lay) in cells:
                if conf[lay, j, i] > 0.5:
                    over[lay, j, i] += 1
        return over

    def count(self, n, kind):
        return sum(1 for _, p in self.routes[n][2] for c, d in p if (d == VIA) == (kind == "via") and d >= 8)

    def run(self, order, iters=70, log=print):
        pfac = 0.6
        failed = {}
        dirty = list(order)
        jump_start = int(os.environ.get("JUMP_START", "35"))
        nov = None
        for it in range(iters):
            jump_ok = it >= jump_start
            if it == jump_start and self.nl == 1:
                pfac = 2.0
            for n in dirty:
                self.routes.pop(n, None)
                f = self.route_net(n, pfac, jump_ok)
                if f:
                    failed[n] = f
                else:
                    failed.pop(n, None)
            over = self.overuse()
            nov = int((over > 0).sum())
            nj = sum(self.count(n, "jumper") for n in self.routes)
            nv = sum(self.count(n, "via") for n in self.routes)
            log(f"  iteracao {it}: celulas em conflito={nov} jumpers={nj} vias={nv} "
                f"falhas={sum(len(v) for v in failed.values())}")
            if nov == 0:
                break
            self.hist += 0.4 * (over > 0)
            pfac = pfac * 1.25 if it < jump_start or self.nl == 2 else min(pfac * 1.3, 200.0)
            # reroteia so as nets envolvidas em conflitos
            bad = set()
            for n, (cells, wide, _) in self.routes.items():
                if any(over[lay, j, i] > 0 for (i, j, lay) in cells):
                    bad.add(n)
            dirty = [n for n in order if n in bad]
        if nov == 0 and self.nl == 1:
            self.cleanup(order, log)
        return failed, nov

    def cleanup(self, order, log=print):
        """tenta eliminar jumpers rerroteando cada net sem jumper e sem conflito"""
        for rnd in range(3):
            gained = 0
            for n in order:
                if n not in self.routes or self.count(n, "jumper") == 0:
                    continue
                old = self.routes.pop(n)
                f = self.route_net(n, 1e5, False)
                ok = not f and int((self.overuse() > 0).sum()) == 0
                if ok:
                    gained += sum(1 for _, p in old[2] for c, d in p if 8 <= d < VIA)
                else:
                    self.routes[n] = old
            log(f"  limpeza {rnd}: jumpers removidos={gained}")
            if not gained:
                break

    def split_neck(self, n, a, b, w):
        """divide o segmento: trechos perto de pads de outras nets ficam com NECK_W"""
        if w <= NECK_W:
            return [(a, b, w)]
        L = ((b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2) ** 0.5
        k = max(1, int(L / 0.25))
        pts = [(a[0] + (b[0] - a[0]) * i / k, a[1] + (b[1] - a[1]) * i / k) for i in range(k + 1)]
        flags = []
        for p in pts:
            f = False
            for (net, x, y, r) in self.padc:
                if net != n and abs(p[0] - x) < 8 and abs(p[1] - y) < 8 and \
                        ((p[0] - x) ** 2 + (p[1] - y) ** 2) ** 0.5 < r + w / 2 + self.clr + 0.25:
                    f = True
                    break
            flags.append(f)
        out = []
        i = 0
        while i < k:
            j = i
            while j < k and flags[j + 1] == flags[i] and flags[j] == flags[i]:
                j += 1
            j = max(j, i + 1)
            ww = NECK_W if (flags[i] or flags[j]) else w
            out.append((pts[i], pts[j], ww))
            i = j
        # junta trechos consecutivos de mesma largura
        res = [out[0]]
        for seg in out[1:]:
            if seg[2] == res[-1][2]:
                res[-1] = (res[-1][0], seg[1], seg[2])
            else:
                res.append(seg)
        return res

    def segments(self):
        """converte rotas em segmentos (net, a, b, largura, camada), jumpers e vias"""
        segs, jumpers, vias = [], [], []
        for n, (cells, wide, paths) in self.routes.items():
            w = self.width(n)
            for t, p in paths:
                lay0 = p[0][0][2]
                runs = [(lay0, [(t[2], t[3])])]
                prev = None
                for c, d in p:
                    pt = (c[0] * G, c[1] * G)
                    if d == VIA:
                        vias.append((n, pt))
                        runs.append((c[2], []))
                    elif d >= 8:
                        jumpers.append((n, prev, pt))
                        runs.append((c[2], []))
                    runs[-1][1].append(pt)
                    prev = pt
                # fim: liga ao centro do pad se a ultima celula esta dentro de um pad desta net
                last = p[-1][0]
                for tt in self.terms[n]:
                    if last in tt[4]:
                        runs[-1][1].append((tt[2], tt[3]))
                        break
                for lay, r in runs:
                    r = _simplify(r)
                    for a, b in zip(r, r[1:]):
                        if a != b:
                            segs.extend((n, aa, bb, ww, lay) for aa, bb, ww in self.split_neck(n, a, b, w))
        return segs, jumpers, vias


def _simplify(run):
    out = []
    for p in run:
        if out and abs(out[-1][0] - p[0]) < 1e-6 and abs(out[-1][1] - p[1]) < 1e-6:
            continue
        out.append(p)
    if len(out) < 3:
        return out
    res = [out[0]]
    for i in range(1, len(out) - 1):
        a, b, c = res[-1], out[i], out[i + 1]
        cr = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0])
        if abs(cr) > 1e-6:
            res.append(b)
    res.append(out[-1])
    return res
