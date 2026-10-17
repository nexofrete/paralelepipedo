"""Gera a placa do Pre Power CB150 (dupla face, ou face simples com jumpers).

Etapas: carrega os footprints do KiCad, posiciona os componentes (posicao_<semente>.json;
se nao existir, recozimento simulado que minimiza comprimento e cruzamentos), roteia as
trilhas com o roteador de negociacao de congestionamento (roteador.py) e faz o GND de
sinal tambem como plano de cobre. Em face simples, ilhas isoladas do plano recebem jumpers.
Saida: meteoro_cb150.kicad_pcb (o PDF e gerado por gerar_pdf.py).

Placa publicada (dupla face):  LAYERS=2 POUR=GND python3 gerar_pcb.py 62
Variaveis: LAYERS (1 ou 2), POUR (nets em plano), JUMP_COST/JUMP_START (face simples),
ITERS, INIT/FIXAS/T0/ANCHOR ou MANUAL (posicionamento a partir de um arquivo),
REUSE_ROUTE (reaproveita rota_*.pkl), SAIDA (arquivo de saida).
"""
import math
import os
import random
import sys

import numpy as np
import pcbnew
from PIL import Image, ImageDraw
from scipy.ndimage import distance_transform_edt

import circuito as C

MM = 1e6
BW, BH = 230.0, 145.0           # placa (mm)
OX, OY = 20.0, 20.0              # origem da placa na folha
SEED = int(sys.argv[1]) if len(sys.argv) > 1 else 1
random.seed(SEED)

# ---------------------------------------------------------------- footprints
def load_fp(lib, name):
    return pcbnew.FootprintLoad(f"{C.LIB}/{lib}.pretty", name)


def courtyard(fp):
    xs, ys = [], []
    for it in fp.GraphicalItems():
        if it.GetLayer() == pcbnew.F_CrtYd:
            b = it.GetBoundingBox()
            xs += [b.GetLeft(), b.GetRight()]
            ys += [b.GetTop(), b.GetBottom()]
    return min(xs) / MM, max(xs) / MM, min(ys) / MM, max(ys) / MM


# geometria por rotacao: offsets dos pads e courtyard
GEOM = {}
for ref, (fpn, val, nets, grp) in C.P.items():
    g = []
    for k in range(4):
        fp = load_fp(*fpn)
        fp.SetPosition(pcbnew.VECTOR2I(0, 0))
        fp.SetOrientationDegrees(90 * k)
        pads = {p.GetNumber(): (p.GetPosition().x / MM, p.GetPosition().y / MM) for p in fp.Pads()}
        g.append((pads, courtyard(fp)))
    GEOM[ref] = g

# ---------------------------------------------------------------- posicionamento
# (x, y, rotacao/90) fixos: borda superior = dissipador, conectores nas bordas
FIXED = {
    # borda superior = dissipador: Q5 Q7 (B C E) ... (E C B) Q6 Q4
    "Q5": (130.65, 6.0, 2), "Q7": (138.0, 6.0, 0), "Q6": (195.0, 6.0, 2), "Q4": (202.0, 6.0, 0),
    "C20": (160.0, 120.0, 0), "C19": (196.0, 120.0, 0),
    "JPWR": (219.0, 72.0, 1), "JSPK": (219.0, 42.0, 1),
    "J1": (4.0, 10.0, 0), "JCH1": (4.0, 32.0, 0), "JRV2": (4.0, 52.0, 0),
    "JRV3": (4.0, 72.0, 0), "JRV4": (4.0, 88.0, 0), "JRV1": (4.0, 108.0, 0),
    "JLINE": (221.0, 20.0, 0),
}
REGION = {"pre": (3, 3, 100, 142), "drv": (80, 18, 155, 142),
          "out": (100, 12, 227, 95), "psu": (105, 65, 227, 142)}
MARGIN = 3.0   # folga entre courtyards


def pads_abs(ref, st):
    x, y, k = st[ref]
    return {n: (x + dx, y + dy) for n, (dx, dy) in GEOM[ref][k][0].items()}


def bbox(ref, st):
    x, y, k = st[ref]
    x0, x1, y0, y1 = GEOM[ref][k][1]
    return x + x0 - MARGIN / 2, x + x1 + MARGIN / 2, y + y0 - MARGIN / 2, y + y1 + MARGIN / 2


NETS = {}
for ref, (_, _, nets, _) in C.P.items():
    for pad, n in nets.items():
        NETS.setdefault(n, []).append((ref, pad))
REF_NETS = {ref: set(nets.values()) for ref, (_, _, nets, _) in C.P.items()}


def net_cost(n, st):
    xs, ys = [], []
    for ref, pad in NETS[n]:
        px, py = pads_abs(ref, st)[pad]
        xs.append(px)
        ys.append(py)
    w = 1.0 if n not in ("GND", "GNDP") else 0.35
    return w * ((max(xs) - min(xs)) + (max(ys) - min(ys)))


def overlap(a, b, st):
    ax0, ax1, ay0, ay1 = bbox(a, st)
    bx0, bx1, by0, by1 = bbox(b, st)
    w = min(ax1, bx1) - max(ax0, bx0)
    h = min(ay1, by1) - max(ay0, by0)
    return w * h if w > 0 and h > 0 else 0.0


def region_pen(ref, st):
    x0, x1, y0, y1 = bbox(ref, st)
    rx0, ry0, rx1, ry1 = REGION[C.P[ref][3]]
    rx0, ry0, rx1, ry1 = max(rx0, 1), max(ry0, 1), min(rx1, BW - 1), min(ry1, BH - 1)
    return max(0, rx0 - x0) + max(0, x1 - rx1) + max(0, ry0 - y0) + max(0, y1 - ry1)


POUR = [n for n in os.environ.get("POUR", "").split(",") if n]   # nets feitas por plano de cobre
ANCHOR = {}
ANCHOR_W = float(os.environ.get("ANCHOR", "0"))


def part_cost(ref, st):
    c = 200.0 * region_pen(ref, st) if not ANCHOR else 0.0
    x0, x1, y0, y1 = bbox(ref, st)
    c += 200.0 * (max(0, 1 - x0) + max(0, x1 - BW + 1) + max(0, 1 - y0) + max(0, y1 - BH + 1))
    if ref in ANCHOR:
        ax, ay, _ = ANCHOR[ref]
        c += ANCHOR_W * (abs(st[ref][0] - ax) + abs(st[ref][1] - ay))
    for o in st:
        if o != ref:
            c += 60.0 * overlap(ref, o, st)
    return c


def mst(n, st):
    """arestas da arvore geradora minima dos pads da net (estimativa das trilhas)"""
    pts = [pads_abs(r, st)[p] for r, p in NETS[n]]
    if len(pts) < 2:
        return np.zeros((0, 4))
    inn = [0]
    out = list(range(1, len(pts)))
    e = []
    while out:
        best = None
        for i in inn:
            for j in out:
                d = abs(pts[i][0] - pts[j][0]) + abs(pts[i][1] - pts[j][1])
                if best is None or d < best[0]:
                    best = (d, i, j)
        _, i, j = best
        e.append((*pts[i], *pts[j]))
        inn.append(j)
        out.remove(j)
    return np.array(e)


NET_W = {"GND": 0.4, "GNDP": 0.6}


def crossings(A, B):
    """numero de cruzamentos entre segmentos A (n,4) e B (m,4)"""
    if len(A) == 0 or len(B) == 0:
        return 0
    ax0, ay0, ax1, ay1 = [A[:, i][:, None] for i in range(4)]
    bx0, by0, bx1, by1 = [B[:, i][None, :] for i in range(4)]

    def orient(px, py, qx, qy, rx, ry):
        return (qx - px) * (ry - py) - (qy - py) * (rx - px)
    d1 = orient(ax0, ay0, ax1, ay1, bx0, by0)
    d2 = orient(ax0, ay0, ax1, ay1, bx1, by1)
    d3 = orient(bx0, by0, bx1, by1, ax0, ay0)
    d4 = orient(bx0, by0, bx1, by1, ax1, ay1)
    return int(np.sum((d1 * d2 < -1e-9) & (d3 * d4 < -1e-9)))


def padhits(S, P, rad=2.2):
    """segmentos S passando a menos de rad de pads P (k,2)"""
    if len(S) == 0 or len(P) == 0:
        return 0
    x0, y0, x1, y1 = [S[:, i][:, None] for i in range(4)]
    px, py = P[:, 0][None, :], P[:, 1][None, :]
    dx, dy = x1 - x0, y1 - y0
    L = dx * dx + dy * dy + 1e-9
    t = np.clip(((px - x0) * dx + (py - y0) * dy) / L, 0, 1)
    d2 = (x0 + t * dx - px) ** 2 + (y0 + t * dy - py) ** 2
    # ignora as extremidades (o proprio pad de destino)
    return int(np.sum((d2 < rad * rad) & (t > 0.02) & (t < 0.98)))


def route_cost(nets, refs, st, EC):
    """custo de roteabilidade das nets afetadas + pads das pecas movidas"""
    c = 0.0
    nets = list(nets)
    others = [n for n in EC if n not in nets]
    Bo = np.concatenate([EC[n] for n in others if len(EC[n])] or [np.zeros((0, 4))])
    allpads = {n: np.array([pads_abs(r, st)[p] for r, p in NETS[n]]) for n in NETS}
    for i, n in enumerate(nets):
        A = EC[n]
        w = NET_W.get(n, 1.0)
        c += 14.0 * w * crossings(A, Bo)
        for m in nets[i + 1:]:
            c += 14.0 * min(w, NET_W.get(m, 1.0)) * crossings(A, EC[m])
        fp = np.concatenate([allpads[m] for m in NETS if m != n])
        c += 6.0 * w * padhits(A, fp)
    # trilhas de outras nets passando sobre os pads movidos
    mp = []
    for r in refs:
        for p, n in C.P[r][2].items():
            if n not in nets:
                mp.append(pads_abs(r, st)[p])
    if mp and len(Bo):
        c += 6.0 * padhits(Bo, np.array(mp))
    return c


def place(init=None, fixed=FIXED, T0=40.0):
    st = {}
    for ref in C.P:
        if init and ref in init:
            st[ref] = tuple(init[ref])
        elif ref in fixed:
            st[ref] = fixed[ref]
        else:
            rx0, ry0, rx1, ry1 = REGION[C.P[ref][3]]
            st[ref] = (random.uniform(rx0 + 8, rx1 - 8), random.uniform(ry0 + 8, ry1 - 8), random.randrange(4))
    movable = [r for r in C.P if r not in fixed]
    EC = {n: mst(n, st) for n in NETS}
    n_iter = int(sys.argv[2]) if len(sys.argv) > 2 else 60000
    T1 = 0.05
    for it in range(n_iter):
        T = T0 * (T1 / T0) ** (it / n_iter)
        ref = random.choice(movable)
        old = st[ref]
        refs = [ref]
        mv = random.random()
        other = None
        if mv < 0.15:
            new = (old[0], old[1], random.randrange(4))
        elif mv < 0.25:
            other = random.choice(movable)
            if other == ref:
                continue
            refs.append(other)
        else:
            s = max(1.27, T * 1.0)
            new = (old[0] + random.gauss(0, s), old[1] + random.gauss(0, s), old[2])
        nets = set()
        for r in refs:
            nets |= REF_NETS[r]
        before = sum(net_cost(n, st) for n in nets) + sum(part_cost(r, st) for r in refs)
        use_rc = it > n_iter * 0.25 or T0 < 10
        if use_rc:
            before += route_cost(nets, refs, st, EC)
        if other:
            oo = st[other]
            st[ref], st[other] = (oo[0], oo[1], old[2]), (old[0], old[1], oo[2])
        else:
            st[ref] = new
        saved = {n: EC[n] for n in nets}
        for n in nets:
            EC[n] = mst(n, st)
        after = sum(net_cost(n, st) for n in nets) + sum(part_cost(r, st) for r in refs)
        if use_rc:
            after += route_cost(nets, refs, st, EC)
        d = after - before
        if d > 0 and random.random() > math.exp(-d / T):
            st[ref] = old
            if other:
                st[other] = oo
            EC.update(saved)
        if it % 5000 == 0:
            print("  recozimento", it, round(T, 2), flush=True)
    # alinha na grade de 1,27 mm
    for ref in movable:
        x, y, k = st[ref]
        st[ref] = (round(x / 1.27) * 1.27, round(y / 1.27) * 1.27, k)
    return st


# ---------------------------------------------------------------- placa KiCad
LAYERS = int(os.environ.get("LAYERS", "1"))   # 1 = face simples, 2 = dupla face


def CU_LAYERS():
    ls = pcbnew.LSET()
    ls.AddLayer(pcbnew.B_Cu)
    ls.AddLayer(pcbnew.B_Mask)
    if LAYERS == 2:
        ls.AddLayer(pcbnew.F_Cu)
        ls.AddLayer(pcbnew.F_Mask)
    return ls


def build_board(st):
    board = pcbnew.BOARD()
    board.SetCopperLayerCount(2)
    netinfo = {}
    for n in NETS:
        ni = pcbnew.NETINFO_ITEM(board, n)
        board.Add(ni)
        netinfo[n] = ni
    for ref, (fpn, val, nets, grp) in C.P.items():
        fp = load_fp(*fpn)
        fp.SetReference(ref)
        fp.SetValue(val)
        x, y, k = st[ref]
        fp.SetPosition(pcbnew.VECTOR2I(int((OX + x) * MM), int((OY + y) * MM)))
        fp.SetOrientationDegrees(90 * k)
        pp = [(q.GetPosition().x / MM, q.GetPosition().y / MM) for q in fp.Pads()]
        pitch = min([((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2) ** 0.5 for i, a in enumerate(pp) for b in pp[i + 1:]] or [9])
        for p in fp.Pads():
            # pads maiores para confeccao caseira (face simples), sem encostar no vizinho
            sz = p.GetSize()
            dr = p.GetDrillSize().x / MM
            mn = 1.9 if fpn in (C.DIP8, C.H2, C.H3, C.TO92, C.TO126, C.TRIM) else 2.4
            if C.P[ref][0] == C.TO92:
                mn = 1.7
            mn = min(mn, pitch - 0.55)
            nx, ny = max(sz.x / MM, mn), max(sz.y / MM, mn)
            if fpn not in (C.TO264, C.CP35, C.TB2, C.TB3):
                p.SetShape(pcbnew.PAD_SHAPE_CIRCLE if nx == ny else pcbnew.PAD_SHAPE_OVAL)
            p.SetSize(pcbnew.VECTOR2I(int(nx * MM), int(ny * MM)))
            p.SetDrillSize(pcbnew.VECTOR2I(int(min(dr, nx - 0.9) * MM), int(min(dr, nx - 0.9) * MM)))
            p.SetLayerSet(CU_LAYERS())
            p.SetAttribute(pcbnew.PAD_ATTRIB_PTH)
            n = nets.get(p.GetNumber())
            if n:
                p.SetNet(netinfo[n])
        fp.Reference().SetTextSize(pcbnew.VECTOR2I(int(1.2 * MM), int(1.2 * MM)))
        # valor na camada F.Fab (pagina de montagem), referencia na serigrafia
        fp.Value().SetVisible(True)
        fp.Value().SetLayer(pcbnew.F_Fab)
        fp.Value().SetTextSize(pcbnew.VECTOR2I(int(1.0 * MM), int(1.0 * MM)))
        fp.Value().SetTextThickness(int(0.15 * MM))
        board.Add(fp)
    ds = board.GetDesignSettings()
    nc = ds.m_NetSettings.m_DefaultNetClass
    nc.SetClearance(int(C.CLEARANCE * MM))
    nc.SetTrackWidth(int(C.DEFAULT_WIDTH * MM))
    tb = board.GetTitleBlock()
    tb.SetTitle("Meteoro Pre Power CB150 - placa " + ("dupla face" if LAYERS == 2 else "face simples"))
    tb.SetCompany("Meteoro Amplifier (esquema Poi 20.60.40.012)")
    tb.SetRevision("2.0" if LAYERS == 2 else "1.0")
    tb.SetComment(0, "Escala 1:1 - imprimir a 100%")
    # contorno
    pts = [(0, 0), (BW, 0), (BW, BH), (0, BH)]
    for i in range(4):
        s = pcbnew.PCB_SHAPE(board)
        s.SetShape(pcbnew.SHAPE_T_SEGMENT)
        a, b = pts[i], pts[(i + 1) % 4]
        s.SetStart(pcbnew.VECTOR2I(int((OX + a[0]) * MM), int((OY + a[1]) * MM)))
        s.SetEnd(pcbnew.VECTOR2I(int((OX + b[0]) * MM), int((OY + b[1]) * MM)))
        s.SetLayer(pcbnew.Edge_Cuts)
        s.SetWidth(int(0.15 * MM))
        board.Add(s)
    # furos de fixacao
    for (hx, hy) in [(4, BH - 4), (104, BH - 4), (BW - 4, BH - 4), (88, 4)]:
        fp = load_fp("MountingHole", "MountingHole_3.2mm_M3")
        fp.SetPosition(pcbnew.VECTOR2I(int((OX + hx) * MM), int((OY + hy) * MM)))
        fp.SetReference("")
        fp.Value().SetVisible(False)
        board.Add(fp)
    return board, netinfo


# ---------------------------------------------------------------- roteamento
class RouteResult:
    pass


def route_pf(board, iters=int(os.environ.get("ITERS", "120"))):
    from roteador import PathFinder
    pads, holes = [], []
    for fp in board.GetFootprints():
        if fp.GetFPID().GetLibItemName() == "MountingHole_3.2mm_M3":
            holes.append((fp.GetPosition().x / MM - OX, fp.GetPosition().y / MM - OY, 3.4))
            continue
        for p in fp.Pads():
            o = p.GetEffectivePolygon().Outline(0)
            poly = [(o.CPoint(i).x / MM - OX, o.CPoint(i).y / MM - OY) for i in range(o.PointCount())]
            pads.append((p.GetNetname(), fp.GetReference(), p.GetNumber(),
                         p.GetPosition().x / MM - OX, p.GetPosition().y / MM - OY, poly))
    pf = PathFinder(BW, BH, pads, holes, lambda n: C.WIDTH.get(n, C.DEFAULT_WIDTH), C.CLEARANCE, layers=LAYERS)

    def span(n):
        t = pf.terms[n]
        return (max(a[2] for a in t) - min(a[2] for a in t)) + (max(a[3] for a in t) - min(a[3] for a in t))
    nets = [n for n in pf.terms if len(pf.terms[n]) > 1]
    power = [n for n in ["GNDP", "OUT", "Q7E", "Q6E", "VP55", "VN55"] if n in nets]
    order = power + sorted([n for n in nets if n not in power], key=span)
    if POUR and not os.environ.get("ROUTE_POUR") and LAYERS == 1:
        order = [n for n in order if n not in POUR]
    failed, nov = pf.run(order, iters)

    r = RouteResult()
    r.segs, r.jumpers, r.vias = pf.segments()
    return r, [(n, [(t[0], t[1]) for t in f]) for n, f in failed.items()], nov


def write_tracks(board, netinfo, r):
    # rede de seguranca: afina trechos que passariam perto demais de pads de outras nets
    padc = []
    for fp in board.GetFootprints():
        for p in fp.Pads():
            c = p.GetPosition()
            padc.append((p.GetNetname(), c.x / MM - OX, c.y / MM - OY, max(p.GetSize().x, p.GetSize().y) / MM / 2))

    def seg_dist(px, py, a, b):
        dx, dy = b[0] - a[0], b[1] - a[1]
        L = dx * dx + dy * dy
        t = 0 if L == 0 else max(0, min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / L))
        return ((a[0] + t * dx - px) ** 2 + (a[1] + t * dy - py) ** 2) ** 0.5
    for (net, a, b, w, lay) in r.segs:
        for (pn, px, py, pr) in padc:
            if pn != net and abs(px - a[0]) + abs(py - a[1]) < 30:
                room = seg_dist(px, py, a, b) - pr - C.CLEARANCE - 0.02
                if room < w / 2:
                    w = max(0.4, math.floor(2 * room * 100) / 100)
        t = pcbnew.PCB_TRACK(board)
        t.SetStart(pcbnew.VECTOR2I(int((OX + a[0]) * MM), int((OY + a[1]) * MM)))
        t.SetEnd(pcbnew.VECTOR2I(int((OX + b[0]) * MM), int((OY + b[1]) * MM)))
        t.SetWidth(int(w * MM))
        t.SetLayer(pcbnew.B_Cu if lay == 0 else pcbnew.F_Cu)
        t.SetNet(netinfo[net])
        board.Add(t)
    from roteador import VIA_PAD
    for (net, a) in getattr(r, "vias", []):
        v = pcbnew.PCB_VIA(board)
        v.SetPosition(pcbnew.VECTOR2I(int((OX + a[0]) * MM), int((OY + a[1]) * MM)))
        v.SetWidth(int(VIA_PAD * MM))
        v.SetDrill(int(0.8 * MM))
        v.SetNet(netinfo[net])
        board.Add(v)
    # jumpers: footprint com 2 pads + linha na serigrafia
    for i, (net, a, b) in enumerate(r.jumpers):
        fp = pcbnew.FOOTPRINT(board)
        fp.SetReference(f"W{i + 1}")
        fp.SetValue("jumper")
        fp.Value().SetVisible(False)
        board.Add(fp)
        rel = (b[0] - a[0], b[1] - a[1])
        for k, (x, y) in enumerate(((0, 0), rel)):
            p = pcbnew.PAD(fp)
            p.SetNumber(str(k + 1))
            p.SetAttribute(pcbnew.PAD_ATTRIB_PTH)
            p.SetShape(pcbnew.PAD_SHAPE_CIRCLE)
            p.SetSize(pcbnew.VECTOR2I(int(2.0 * MM), int(2.0 * MM)))
            p.SetDrillSize(pcbnew.VECTOR2I(int(0.8 * MM), int(0.8 * MM)))
            p.SetLayerSet(CU_LAYERS())
            v = pcbnew.VECTOR2I(int(x * MM), int(y * MM))
            p.SetPos0(v)
            p.SetPosition(v)
            p.SetNet(netinfo[net])
            fp.Add(p)
        s = pcbnew.FP_SHAPE(fp)
        s.SetShape(pcbnew.SHAPE_T_SEGMENT)
        s.SetStart0(pcbnew.VECTOR2I(0, 0))
        s.SetEnd0(pcbnew.VECTOR2I(int(rel[0] * MM), int(rel[1] * MM)))
        s.SetLayer(pcbnew.F_SilkS)
        s.SetWidth(int(0.5 * MM))
        s.SetDrawCoord()
        fp.Add(s)
        fp.Reference().SetPos0(pcbnew.VECTOR2I(int((rel[0] / 2 + (1.3 if rel[0] == 0 else 0)) * MM),
                                               int((rel[1] / 2 - (1.3 if rel[1] == 0 else 0)) * MM)))
        fp.Reference().SetTextSize(pcbnew.VECTOR2I(int(1.0 * MM), int(1.0 * MM)))
        fp.Reference().SetDrawCoord()
        fp.SetPosition(pcbnew.VECTOR2I(int((OX + a[0]) * MM), int((OY + a[1]) * MM)))


def v2(x, y):
    return pcbnew.VECTOR2I(int((OX + x) * MM), int((OY + y) * MM))


def add_jumper(board, netinfo, net, a, b, idx):
    fp = pcbnew.FOOTPRINT(board)
    fp.SetReference(f"W{idx}")
    fp.SetValue("jumper")
    fp.Value().SetVisible(False)
    board.Add(fp)
    rel = (b[0] - a[0], b[1] - a[1])
    for k, (x, y) in enumerate(((0, 0), rel)):
        p = pcbnew.PAD(fp)
        p.SetNumber(str(k + 1))
        p.SetAttribute(pcbnew.PAD_ATTRIB_PTH)
        p.SetShape(pcbnew.PAD_SHAPE_CIRCLE)
        p.SetSize(pcbnew.VECTOR2I(int(2.2 * MM), int(2.2 * MM)))
        p.SetDrillSize(pcbnew.VECTOR2I(int(0.8 * MM), int(0.8 * MM)))
        p.SetLayerSet(CU_LAYERS())
        v = pcbnew.VECTOR2I(int(x * MM), int(y * MM))
        p.SetPos0(v)
        p.SetPosition(v)
        p.SetNet(netinfo[net])
        fp.Add(p)
    s = pcbnew.FP_SHAPE(fp)
    s.SetShape(pcbnew.SHAPE_T_SEGMENT)
    s.SetStart0(pcbnew.VECTOR2I(0, 0))
    s.SetEnd0(pcbnew.VECTOR2I(int(rel[0] * MM), int(rel[1] * MM)))
    s.SetLayer(pcbnew.F_SilkS)
    s.SetWidth(int(0.5 * MM))
    s.SetDrawCoord()
    fp.Add(s)
    fp.Reference().SetPos0(pcbnew.VECTOR2I(int((rel[0] / 2 + (1.3 if abs(rel[0]) < 0.1 else 0)) * MM),
                                           int((rel[1] / 2 - (1.3 if abs(rel[1]) < 0.1 else 0)) * MM)))
    fp.Reference().SetTextSize(pcbnew.VECTOR2I(int(1.0 * MM), int(1.0 * MM)))
    fp.Reference().SetDrawCoord()
    fp.SetPosition(v2(*a))
    return fp


def pour(board, netinfo, net, start_idx):
    """plano de cobre da net em B.Cu; ilhas sem ligacao recebem jumpers"""
    z = pcbnew.ZONE(board)
    z.SetLayer(pcbnew.B_Cu)
    z.SetNetCode(netinfo[net].GetNetCode())
    z.SetLocalClearance(int(0.6 * MM))
    z.SetMinThickness(int(0.6 * MM))
    z.SetPadConnection(pcbnew.ZONE_CONNECTION_THERMAL)
    z.SetThermalReliefGap(int(0.6 * MM))
    z.SetThermalReliefSpokeWidth(int(1.0 * MM))
    z.SetIslandRemovalMode(pcbnew.ISLAND_REMOVAL_MODE_ALWAYS)
    o = z.Outline()
    o.NewOutline()
    for (x, y) in [(1, 1), (BW - 1, 1), (BW - 1, BH - 1), (1, BH - 1)]:
        o.Append(v2(x, y))
    board.Add(z)
    jumpers = []
    for rnd in range(12):
        pcbnew.ZONE_FILLER(board).Fill(board.Zones())
        polys = z.GetFilledPolysList(pcbnew.B_Cu)
        clusters = net_clusters(board, polys, net)
        cl = sorted(clusters.values(), key=lambda c: len(c[0]), reverse=True)
        print(f"  plano {net}: rodada {rnd}, {len(cl)} grupo(s)", flush=True)
        if len(cl) <= 1:
            break
        pts = island_points(polys)
        main = cl[0]
        mainpts = [q for k in main[1] for q in pts.get(k, [])]
        best = None
        for other in cl[1:]:
            opts = [q for k in other[1] for q in pts.get(k, [])]
            if not opts:
                print("  grupo sem plano:", [p.GetParent().GetReference() + "." + p.GetNumber() for p in other[0]])
                if link_to_plane(board, netinfo, net, polys, main[1], other[0][0]):
                    best = "trilha"
                    break
                continue
            for qa in opts:
                for qb in mainpts:
                    L = abs(qa[0] - qb[0]) + abs(qa[1] - qb[1])
                    if best is None or L < best[0]:
                        best = (L, qa, qb)
        if best is None:
            break
        if best == "trilha":
            continue
        _, a, b = best
        jumpers.append(add_jumper(board, netinfo, net, a, b, start_idx + len(jumpers)))
    return jumpers


def pour_simple(board, netinfo, net):
    """dupla face: a net ja esta roteada; planos nas duas faces so somam cobre"""
    for layer in (pcbnew.B_Cu, pcbnew.F_Cu):
        z = pcbnew.ZONE(board)
        z.SetLayer(layer)
        z.SetNetCode(netinfo[net].GetNetCode())
        z.SetLocalClearance(int(0.6 * MM))
        z.SetMinThickness(int(0.6 * MM))
        z.SetPadConnection(pcbnew.ZONE_CONNECTION_THERMAL)
        z.SetThermalReliefGap(int(0.6 * MM))
        z.SetThermalReliefSpokeWidth(int(1.0 * MM))
        z.SetIslandRemovalMode(pcbnew.ISLAND_REMOVAL_MODE_ALWAYS)
        o = z.Outline()
        o.NewOutline()
        for (x, y) in [(1, 1), (BW - 1, 1), (BW - 1, BH - 1), (1, BH - 1)]:
            o.Append(v2(x, y))
        board.Add(z)
    pcbnew.ZONE_FILLER(board).Fill(board.Zones())


def net_clusters(board, polys, net):
    """agrupa os pads da net por conectividade (trilhas, jumpers e ilhas do plano)"""
    pads = []
    jl = []
    for fp in board.GetFootprints():
        fpp = [p for p in fp.Pads() if p.GetNetname() == net]
        r = fp.GetReference()
        for p in fpp:
            pads.append(p)
        if r.startswith("W") and r[1:].isdigit() and len(fpp) == 2:
            jl.append((fpp[0], fpp[1]))
    tracks = [t for t in board.GetTracks() if t.GetNetname() == net]
    n_p, n_t = len(pads), len(tracks)
    nis = polys.OutlineCount()
    parent = list(range(n_p + n_t + nis))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    def union(i, j):
        parent[find(i)] = find(j)
    key = {}
    for i, p in enumerate(pads):
        key[(p.GetParent().GetReference(), p.GetNumber())] = i
    for a, b in jl:
        union(key[(a.GetParent().GetReference(), a.GetNumber())], key[(b.GetParent().GetReference(), b.GetNumber())])
    for ti, t in enumerate(tracks):
        for pt in (t.GetStart(), t.GetEnd()):
            for i, p in enumerate(pads):
                if p.HitTest(pt):
                    union(n_p + ti, i)
            for tj, u in enumerate(tracks):
                if tj != ti and u.HitTest(pt):
                    union(n_p + ti, n_p + tj)
            for k in range(nis):
                if polys.Contains(pt, k):
                    union(n_p + ti, n_p + n_t + k)
    for i, p in enumerate(pads):
        # raio termico: os "spokes" do plano invadem a borda do pad
        c = p.GetPosition()
        o = p.GetEffectivePolygon().Outline(0)
        pts = []
        for j in range(o.PointCount()):
            v = o.CPoint(j)
            dx, dy = v.x - c.x, v.y - c.y
            L = max(1.0, (dx * dx + dy * dy) ** 0.5)
            f = max(0.0, (L - 0.25 * MM) / L)
            pts.append(pcbnew.VECTOR2I(int(c.x + dx * f), int(c.y + dy * f)))
        for k in range(nis):
            if any(polys.Contains(q, k) for q in pts):
                union(i, n_p + n_t + k)
    cl = {}
    for i, p in enumerate(pads):
        cl.setdefault(find(i), ([], set()))[0].append(p)
    for k in range(nis):
        root = find(n_p + n_t + k)
        if root in cl:
            cl[root][1].add(k)
    return cl


def link_to_plane(board, netinfo, net, polys, islands, pad, w=0.8):
    """trilha curta (busca em largura) de um pad isolado ate o plano principal"""
    from collections import deque
    res = 0.15875
    fx, fy = int(BW / res) + 1, int(BH / res) + 1
    img = Image.new("L", (fx, fy), 0)
    d = ImageDraw.Draw(img)
    for fp in board.GetFootprints():
        for p in fp.Pads():
            if p.GetNetname() != net:
                o = p.GetEffectivePolygon().Outline(0)
                d.polygon([((o.CPoint(i).x / MM - OX) / res, (o.CPoint(i).y / MM - OY) / res)
                           for i in range(o.PointCount())], fill=1)
    for t in board.GetTracks():
        if t.GetNetname() != net:
            a, b = t.GetStart(), t.GetEnd()
            ww = t.GetWidth() / MM
            d.line([((a.x / MM - OX) / res, (a.y / MM - OY) / res), ((b.x / MM - OX) / res, (b.y / MM - OY) / res)],
                   fill=1, width=max(1, int(ww / res)))
            for q in (a, b):
                cx, cy, r = (q.x / MM - OX) / res, (q.y / MM - OY) / res, ww / 2 / res
                d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=1)
    foreign = np.array(img, dtype=bool)
    dist = distance_transform_edt(~foreign) * res
    step = 4
    g = 0.635
    legal = dist[::step, ::step] >= w / 2 + C.CLEARANCE + 0.05
    gy, gx = legal.shape
    c = pad.GetPosition()
    sx, sy = int(round((c.x / MM - OX) / g)), int(round((c.y / MM - OY) / g))
    prev = {(sx, sy): None}
    q = deque([(sx, sy)])
    goal = None
    while q:
        cx, cy = q.popleft()
        if (cx, cy) != (sx, sy) and abs(cx - sx) + abs(cy - sy) > 3:
            pt = v2(cx * g, cy * g)
            if any(polys.Contains(pt, k) for k in islands):
                goal = (cx, cy)
                break
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (1, -1), (-1, 1), (-1, -1)):
            n = (cx + dx, cy + dy)
            if 0 <= n[0] < gx and 0 <= n[1] < gy and n not in prev and (legal[n[1], n[0]] or abs(n[0] - sx) + abs(n[1] - sy) <= 2):
                prev[n] = (cx, cy)
                q.append(n)
    jump = None
    if goal is None:
        # sem saida pelo cobre: trilha ate um ponto livre + jumper ate o plano
        jl = dist[::step, ::step] >= 1.1 + C.CLEARANCE + 0.1
        pts_isl = [q for k in islands for q in island_points(polys).get(k, [])]
        best = None
        for (cx, cy) in prev:
            if not jl[cy, cx] or abs(cx - sx) + abs(cy - sy) < 4:
                continue
            x, y = cx * g, cy * g
            for (qx, qy) in pts_isl:
                L = ((qx - x) ** 2 + (qy - y) ** 2) ** 0.5
                if L < 20 and (best is None or L < best[0]):
                    best = (L, (cx, cy), (qx, qy))
        if best is None:
            return False
        goal, jump = best[1], best[2]
    path = [goal]
    while prev[path[-1]] is not None:
        path.append(prev[path[-1]])
    pts = [(c.x / MM - OX, c.y / MM - OY)] + [(x * g, y * g) for x, y in reversed(path[:-1])]
    for a, b in zip(pts, pts[1:]):
        t = pcbnew.PCB_TRACK(board)
        t.SetStart(v2(*a))
        t.SetEnd(v2(*b))
        t.SetWidth(int(w * MM))
        t.SetLayer(pcbnew.B_Cu)
        t.SetNet(netinfo[net])
        board.Add(t)
    if jump:
        n = sum(1 for fp in board.GetFootprints() if fp.GetReference().startswith("W")) + 1
        add_jumper(board, netinfo, net, pts[-1], jump, n)
    print(f"  trilha de {pad.GetParent().GetReference()}.{pad.GetNumber()} ate o plano"
          + (" (com jumper)" if jump else ""))
    return True


def island_points(polys, step=1.27):
    """pontos de grade dentro de cada ilha, com folga para um pad de jumper"""
    out = {}
    ring = [(1.45 * math.cos(t * math.pi / 4), 1.45 * math.sin(t * math.pi / 4)) for t in range(8)]
    nx, ny = int(BW / step), int(BH / step)
    for i in range(1, nx):
        for j in range(1, ny):
            x, y = i * step, j * step
            for k in range(polys.OutlineCount()):
                if polys.Contains(v2(x, y), k) and all(polys.Contains(v2(x + dx, y + dy), k) for dx, dy in ring):
                    out.setdefault(k, []).append((x, y))
                    break
    return out


if __name__ == "__main__":
    import json
    import os
    cache = f"posicao_{SEED}.json"
    if os.path.exists(cache):
        st = {k: tuple(v) for k, v in json.load(open(cache)).items()}
    else:
        if os.environ.get("INIT"):
            # parte de uma posicao existente (ancorada); pecas novas ficam livres
            init = {k: tuple(v) for k, v in json.load(open(os.environ["INIT"])).items()}
            fixed = {k: init[k] for k in os.environ.get("FIXAS", "").split(",") if k in init}
            ANCHOR.update({k: v for k, v in init.items() if k in C.P})
            st = place(init, fixed, T0=float(os.environ.get("T0", "3")))
        elif os.environ.get("MANUAL"):
            from posicao_manual import POS
            fixed = {k: POS[k] for k in ("Q5", "Q7", "Q6", "Q4", "R28", "R27", "C20", "C19", "JPWR",
                                         "J1", "JCH1", "JRV1", "JRV2", "JRV3", "JRV4")}
            ANCHOR.update(POS)
            st = place(POS, fixed, T0=float(os.environ.get("T0", "3")))
        else:
            st = place()
        json.dump(st, open(cache, "w"), indent=0)
    board, netinfo = build_board(st)
    import pickle
    rcache = f"rota_{SEED}_{'-'.join(POUR) or 'x'}{'_r' if os.environ.get('ROUTE_POUR') else ''}_L{LAYERS}.pkl"
    if os.environ.get("REUSE_ROUTE") and os.path.exists(rcache):
        r, still, nov = pickle.load(open(rcache, "rb"))
    else:
        r, still, nov = route_pf(board)
        pickle.dump((r, still, nov), open(rcache, "wb"))
    print("conflitos restantes:", nov)
    write_tracks(board, netinfo, r)
    t = pcbnew.PCB_TEXT(board)
    t.SetText("METEORO PRE POWER CB150 - lado cobre")
    t.SetPosition(pcbnew.VECTOR2I(int((OX + 60) * MM), int((OY + BH - 3.5) * MM)))
    t.SetLayer(pcbnew.B_Cu)
    t.SetMirrored(True)
    t.SetTextSize(pcbnew.VECTOR2I(int(1.8 * MM), int(1.8 * MM)))
    t.SetTextThickness(int(0.35 * MM))
    board.Add(t)
    if LAYERS == 2:
        t = pcbnew.PCB_TEXT(board)
        t.SetText("METEORO PRE POWER CB150 - lado componentes")
        t.SetPosition(pcbnew.VECTOR2I(int((OX + 150) * MM), int((OY + BH - 3.5) * MM)))
        t.SetLayer(pcbnew.F_Cu)
        t.SetTextSize(pcbnew.VECTOR2I(int(1.8 * MM), int(1.8 * MM)))
        t.SetTextThickness(int(0.35 * MM))
        board.Add(t)
    extra = []
    if POUR:
        # o preenchimento de zonas e mais estavel numa placa carregada do disco
        tmpf = "tmp_" + os.environ.get("SAIDA", "meteoro_cb150.kicad_pcb")
        pcbnew.SaveBoard(tmpf, board)
        board = pcbnew.LoadBoard(tmpf)
        for ext in ("", ".kicad_pro", ".kicad_prl"):
            f = tmpf if not ext else tmpf[: -len(".kicad_pcb")] + ext
            if os.path.exists(f):
                os.remove(f)
        netinfo = {n: board.FindNet(n) for n in NETS}
        for n in POUR:
            if LAYERS == 2:
                pour_simple(board, netinfo, n)
            else:
                extra += pour(board, netinfo, n, len(r.jumpers) + len(extra) + 1)
    pcbnew.SaveBoard(os.environ.get("SAIDA", "meteoro_cb150.kicad_pcb"), board)
    print("jumpers:", len(r.jumpers) + len(extra), "vias:", len(getattr(r, "vias", [])), "trilhas:", len(r.segs))
    print("sem rota:", [(n, [(p[0], p[1]) for p in f]) for n, f in still])
