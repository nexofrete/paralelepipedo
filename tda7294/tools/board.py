"""Definição da placa: posicionamento dos componentes e trilhas.

Placa de FACE SIMPLES (cobre só embaixo). Coordenadas em mm vistas pelo
lado dos componentes. Executar `python3 build.py` para gerar tudo.
"""
from geom import Board, Pad, Track, Silk

W, H = 81.0, 64.0

# --------------------------------------------------------------- larguras
SIG = 0.9      # sinal
MID = 1.2      # alimentação de baixa corrente / GND de sinal
PWR = 2.0      # alimentação de potência, saída e GND principal

b = Board(W, H)


def part(ref, value, descr):
    b.parts.append((ref, value, descr))


def pads(ref, lst, size, drill, square_first=False):
    for i, (num, x, y, net) in enumerate(lst):
        b.pads.append(Pad(ref, str(num), x, y, size, drill, net,
                          square=(square_first and i == 0)))


def label(text, x, y, size=1.3):
    b.silk.append(Silk('text', (text, x, y), size))


def value(text, x, y, size=1.0):
    """Valor do componente na serigrafia (letra menor, abaixo da referência)."""
    b.silk.append(Silk('text', (text, x, y), size))


# texto mais curto na serigrafia quando o valor completo não cabe
SILK_VALUE = {'C7': '100nF', 'C9': '100nF', 'C10': '100nF'}


def place_labels(ref, val, lx, ly, vx, vy):
    label(ref, lx, ly)
    value(SILK_VALUE.get(ref, val), lx if vx is None else vx, ly + 1.5 if vy is None else vy)


def track(net, width, *pts):
    b.tracks.append(Track(net, width, list(pts)))


# ------------------------------------------------------------ footprints
def resistor(ref, val, p1, p2, n1, n2, drill=0.8, size=1.9, body=(6.3, 2.5),
             lx=None, ly=None, descr='', vx=None, vy=None):
    (x1, y1), (x2, y2) = p1, p2
    pads(ref, [(1, x1, y1, n1), (2, x2, y2, n2)], size, drill)
    cx, cy = (x1 + x2) / 2, (y1 + y2) / 2
    L, D = body
    if abs(x2 - x1) > abs(y2 - y1):
        b.silk.append(Silk('rect', (cx - L / 2, cy - D / 2, L, D)))
        b.silk.append(Silk('line', (x1 + size / 2 + .3, y1, cx - L / 2, cy)))
        b.silk.append(Silk('line', (cx + L / 2, cy, x2 - size / 2 - .3, y2)))
    else:
        b.silk.append(Silk('rect', (cx - D / 2, cy - L / 2, D, L)))
        b.silk.append(Silk('line', (x1, y1 + size / 2 + .3, cx, cy - L / 2)))
        b.silk.append(Silk('line', (cx, cy + L / 2, x2, y2 - size / 2 - .3)))
    place_labels(ref, val, lx if lx is not None else cx, ly if ly is not None else cy, vx, vy)
    part(ref, val, descr)


def diode(ref, val, pa, pk, na, nk, descr='', lx=None, ly=None, vx=None, vy=None):
    """pa = anodo, pk = catodo (faixa desenhada do lado do catodo)."""
    (xa, ya), (xk, yk) = pa, pk
    pads(ref, [('A', xa, ya, na), ('K', xk, yk, nk)], 1.9, 0.8)
    b.pads[-1].square = True
    cx, cy = (xa + xk) / 2, (ya + yk) / 2
    if abs(xk - xa) > abs(yk - ya):
        s = 1 if xk > xa else -1
        b.silk.append(Silk('rect', (cx - 2, cy - 1, 4, 2)))
        b.silk.append(Silk('line', (cx + 1.3 * s, cy - 1, cx + 1.3 * s, cy + 1)))
    else:
        s = 1 if yk > ya else -1
        b.silk.append(Silk('rect', (cx - 1, cy - 2, 2, 4)))
        b.silk.append(Silk('line', (cx - 1, cy + 1.3 * s, cx + 1, cy + 1.3 * s)))
    place_labels(ref, val, lx if lx is not None else cx - 2.2,
                 ly if ly is not None else cy, vx, vy)
    part(ref, val, descr)


def film(ref, val, p1, p2, n1, n2, box=(7.2, 3.0), descr='', lx=None, ly=None,
         vx=None, vy=None):
    (x1, y1), (x2, y2) = p1, p2
    pads(ref, [(1, x1, y1, n1), (2, x2, y2, n2)], 1.9, 0.9)
    cx, cy = (x1 + x2) / 2, (y1 + y2) / 2
    L, D = box
    if abs(x2 - x1) > abs(y2 - y1):
        b.silk.append(Silk('rect', (cx - L / 2, cy - D / 2, L, D)))
    else:
        b.silk.append(Silk('rect', (cx - D / 2, cy - L / 2, D, L)))
    place_labels(ref, val, lx if lx is not None else cx, ly if ly is not None else cy, vx, vy)
    part(ref, val, descr)


def elec(ref, val, pplus, pminus, nplus, nminus, dia, size=2.0, drill=0.9,
         descr='', lx=None, ly=None, vx=None, vy=None):
    (xp, yp), (xm, ym) = pplus, pminus
    b.pads.append(Pad(ref, '+', xp, yp, size, drill, nplus, square=True))
    b.pads.append(Pad(ref, '-', xm, ym, size, drill, nminus))
    cx, cy = (xp + xm) / 2, (yp + ym) / 2
    b.silk.append(Silk('circle', (cx, cy, dia / 2)))
    # sinal de + ao lado do terminal positivo
    dx, dy = xp - cx, yp - cy
    n = max((dx * dx + dy * dy) ** .5, 1e-6)
    px, py = cx + dx / n * (dia / 2 - 1.1), cy + dy / n * (dia / 2 - 1.1)
    # desloca o + para fora do eixo dos terminais
    ox, oy = -dy / n * 1.6, dx / n * 1.6
    b.silk.append(Silk('text', ('+', px + ox, py + oy), 1.6))
    place_labels(ref, val, lx if lx is not None else cx,
                 ly if ly is not None else cy - 0.2, vx, vy)
    part(ref, val, descr)


def terminal(ref, value, lst, pitch, horizontal, descr='', size=2.4, drill=1.3,
             depth=7.6, side=+1, lx=None, ly=None, lab_off=None):
    """Borne de parafuso. side indica para que lado fica a entrada do fio."""
    pads(ref, lst, size, drill, square_first=True)
    xs = [p[1] for p in lst]
    ys = [p[2] for p in lst]
    if horizontal:
        x0, x1 = min(xs) - pitch / 2, max(xs) + pitch / 2
        y0 = ys[0] - (depth - 3.2) if side < 0 else ys[0] - 3.2
        b.silk.append(Silk('rect', (x0, y0, x1 - x0, depth)))
    else:
        y0, y1 = min(ys) - pitch / 2, max(ys) + pitch / 2
        x0 = xs[0] - 3.2 if side > 0 else xs[0] - (depth - 3.2)
        b.silk.append(Silk('rect', (x0, y0, depth, y1 - y0)))
    for (num, x, y, net) in lst:
        if lab_off is None:
            dx, dy = (0, 3.9 * -side) if horizontal else (-3.9 * side, 0)
        else:
            dx, dy = lab_off
        b.silk.append(Silk('text', (net_label(net), x + dx, y + dy), 1.1))
    label(ref, lx if lx is not None else sum(xs) / len(xs),
          ly if ly is not None else sum(ys) / len(ys))
    part(ref, value, descr)


def net_label(n):
    return {'VP': '+V', 'VN': '-V', 'GND': 'GND', 'OUT': 'OUT', 'IN': 'IN'}.get(n, n)


def jumper(ref, pa, pb, net, descr):
    (xa, ya), (xb, yb) = pa, pb
    pads(ref, [('a', xa, ya, net), ('b', xb, yb, net)], 2.0, 0.9)
    b.silk.append(Silk('line', (xa, ya, xb, yb), 0.6))
    b.jumpers.append((ref, f"{ref}.a", f"{ref}.b"))
    label(ref, (xa + xb) / 2, (ya + yb) / 2 - 1.3)
    part(ref, 'fio', descr)


# ================================================================== U1
X0, YE, YO = 36.0, 11.0, 16.08
YB = (YE + YO) / 2           # canal entre as duas fileiras de pinos
# O pino 12 é N.C. no TDA7294: o pad dele serve só de passagem para a trilha -V
PIN_NET = {1: 'GND', 2: 'INN', 3: 'INP', 4: 'GND', 5: None, 6: 'BOOT', 7: 'VP',
           8: 'VN', 9: 'MUTE', 10: 'MUTE', 11: None, 12: 'VN', 13: 'VP',
           14: 'OUT', 15: 'VN'}


def px(n):
    return X0 + (n - 1) * 1.27


def py(n):
    return YO if n % 2 else YE


for n in range(1, 16):
    b.pads.append(Pad('U1', str(n), px(n), py(n), 1.8, 1.0,
                      PIN_NET[n] if PIN_NET[n] else 'NC%d' % n, square=(n == 1)))
# contorno do corpo (Multiwatt15 vertical) e aba metálica
b.silk.append(Silk('rect', (X0 - 1.21, YE - 4.5, 20.2, 5.0)))
b.silk.append(Silk('line', (X0 - 1.21, YE - 3.1, X0 + 18.99, YE - 3.1)))
label('U1  TDA7294', X0 + 8.9, YE - 1.6, 1.4)
b.silk.append(Silk('text', ('1', X0 - 2.3, YO), 1.1))
b.silk.append(Silk('text', ('15', X0 + 17.78 + 2.5, YO), 1.1))
part('U1', 'TDA7294V', 'Amplificador DMOS 100 V / 100 W, Multiwatt15V (vertical)')

# ============================================== lado esquerdo (realimentação)
L_INN, L_BOOT, L_VN, L_OUT = 9.0, 7.2, 8.1, 3.6
OUTX = 8.0          # descida da saída (realimentação) pelo lado esquerdo
BOOTX = 18.0
INNX = 22.0
GNDX = 31.0         # descida do GND de sinal

# U1.14 sobe e corre pelo topo para os dois lados (faixa sob o dissipador)
track('OUT', 1.0, (px(14), YE), (px(14), L_OUT), (OUTX, L_OUT), (OUTX, 24.0))
# bootstrap: pino 6 -> C5(+); C5(-) -> saída
track('BOOT', SIG, (px(6), YE), (px(6), L_BOOT), (BOOTX, L_BOOT), (BOOTX, 15.0),
      (15.5, 15.0))
elec('C5', '47µF/63V', (15.5, 15.0), (12.0, 15.0), 'BOOT', 'OUT', 8.0,
     descr='Bootstrap (eletrolítico radial 8 mm, passo 3,5)', lx=13.75, ly=20.2)
track('OUT', 1.0, (OUTX, 15.0), (12.0, 15.0))
# entrada inversora: pino 2 -> R3 / R2
track('INN', SIG, (px(2), YE), (px(2), L_INN), (INNX, L_INN), (INNX, 29.0))
resistor('R3', '22k', (OUTX, 24.0), (OUTX + 10.16, 24.0), 'OUT', 'INN',
         descr='Realimentação (ganho = 1 + R3/R2 ≈ 33 = 30 dB)', ly=26.4)
track('INN', SIG, (OUTX + 10.16, 24.0), (INNX, 24.0))
resistor('R2', '680R', (INNX, 29.0), (INNX, 39.16), 'INN', 'FB',
         descr='Realimentação (ganho)', lx=INNX - 3.0)
elec('C2', '47µF/25V', (INNX, 43.0), (INNX + 2.5, 43.0), 'FB', 'GND', 6.3,
     descr='Desacoplamento DC da realimentação (radial 6,3 mm, passo 2,5)',
     lx=INNX + 1.25, ly=47.6)
track('FB', SIG, (INNX, 39.16), (INNX, 43.0))
track('GND', MID, (INNX + 2.5, 43.0), (GNDX, 43.0))

# ======================================================== MUTE / STAND-BY
# pinos 9 e 10 unidos pelo canal entre as fileiras
MUTEX = px(9)
track('MUTE', SIG, (px(10), YE), (px(10), YB), (px(9), YB), (px(9), YO))
track('MUTE', SIG, (px(9), YO), (MUTEX, 37.0))
# +V do pino 7 vem pelo jumper W1 (passa por cima da trilha do MUTE)
W1A = (px(7), 19.6)
W1B = (px(13), 19.6)
track('VP', MID, (px(7), YO), W1A, (px(7), 22.4))
jumper('W1', W1A, W1B, 'VP', 'Leva +V ao pino 7 (+Vs sinal); fio rígido nu ou encapado')
diode('D1', '1N4148', (px(7), 30.02), (px(7), 22.4), 'MUTE', 'VP', lx=41.4, vx=45.3, vy=32.4,
      descr='Descarga rápida do MUTE ao desligar (anti-"plop")')
track('MUTE', SIG, (px(7), 30.02), (MUTEX, 30.02))
resistor('R4', '22k', (48.6, 22.4), (48.6, 32.56), 'VP', 'MUTE',
         descr='Constante de tempo MUTE/ST-BY', lx=50.3, ly=35.2)
track('MUTE', SIG, (48.6, 32.56), (MUTEX, 32.56))
elec('C3', '22µF/50V', (MUTEX, 37.0), (MUTEX - 2.5, 37.0), 'MUTE', 'GND', 6.3,
     descr='Constante de tempo MUTE/ST-BY (radial 6,3 mm)', lx=40.0, ly=38.0)

# ======================================================== entrada
# GND dos pinos 4 e 1 pelo canal entre as fileiras e saída para a esquerda
track('GND', MID, (px(4), YE), (px(4), YB), (GNDX, YB), (GNDX, 60.5))
track('GND', MID, (px(1), YO), (px(1), YB))
film('C1', '1µF', (33.46, 20.0), (38.54, 20.0), 'IN', 'INP',
     descr='Acoplamento da entrada (poliéster MKT, passo 5 mm)', ly=22.4)
track('INP', SIG, (px(3), YO), (px(3), 20.0), (px(3), 25.0))
resistor('R1', '22k', (px(3), 25.0), (px(3), 35.16), 'INP', 'GND',
         descr='Resistência de entrada / polarização', lx=px(3) + 2.6)
track('GND', MID, (px(3), 35.16), (GNDX, 35.16))
terminal('J1', 'Entrada', [(1, 34.0, 26.0, 'IN'), (2, 34.0, 28.54, 'GND')], 2.54,
         False, descr='Entrada de áudio (barra de pinos 2,54 mm ou cabo blindado)',
         size=1.8, drill=1.0, depth=3.2, side=+1, lx=34.0, ly=31.4)
track('IN', SIG, (33.46, 20.0), (34.0, 21.0), (34.0, 26.0))
track('GND', MID, (34.0, 28.54), (GNDX, 28.54))

# ======================================================== alimentação
VPX = px(13)
track('VP', PWR, (px(13), YO), (VPX, 46.0))
track('VP', MID, (VPX, 22.4), (48.6, 22.4))
# -V: pino 8 sobe, passa por cima do pino 10, entra no pad 12 (N.C.), desce para
# o canal entre as fileiras e chega ao pino 15
track('VN', MID, (px(8), YE), (px(8), L_VN), (px(12), L_VN), (px(12), YB),
      (px(15), YB), (px(15), YO))
track('VN', PWR, (px(15), YO), (px(15), 18.0), (61.4, 25.6), (61.4, 31.0),
      (67.0, 36.6), (67.0, 46.0))
STARX = 56.32
film('C7', '100nF/100V', (VPX, 27.0), (STARX, 27.0), 'VP', 'GND',
     descr='Desacoplamento +V junto ao CI', vy=24.4)
film('C9', '100nF/100V', (STARX, 31.0), (61.4, 31.0), 'GND', 'VN',
     descr='Desacoplamento -V junto ao CI', vy=33.6)
track('GND', PWR, (STARX, 27.0), (STARX, 60.5))
elec('C6', '1000µF/50V', (49.0, 46.0), (54.0, 46.0), 'VP', 'GND', 12.5, size=2.2,
     drill=1.0, descr='Filtro +V (radial 12,5 mm, passo 5)', lx=51.5, ly=48.6)
elec('C8', '1000µF/50V', (62.0, 46.0), (67.0, 46.0), 'GND', 'VN', 12.5, size=2.2,
     drill=1.0, descr='Filtro -V (radial 12,5 mm, passo 5)', lx=64.5, ly=48.6)
track('VP', PWR, (VPX, 46.0), (49.0, 46.0))
track('GND', PWR, (54.0, 46.0), (62.0, 46.0))
terminal('J2', 'Alimentação', [(1, 51.24, 56.0, 'VP'), (2, 56.32, 56.0, 'GND'),
                               (3, 61.40, 56.0, 'VN')], 5.08, True,
         descr='Borne 3 vias passo 5,08 mm: +V / GND / -V', side=+1, ly=53.9, lab_off=(0, 2.6))
track('VP', PWR, (49.0, 46.0), (49.0, 52.0), (51.24, 54.24), (51.24, 56.0))
track('VN', PWR, (67.0, 46.0), (67.0, 52.0), (63.0, 56.0), (61.40, 56.0))
# trilha de terra principal (estrela no borne J2)
track('GND', PWR, (GNDX, 60.5), (77.5, 60.5))
track('GND', MID, (MUTEX - 2.5, 37.0), (MUTEX - 2.5, 60.5))

# ======================================================== saída
OUTR = 74.0
track('OUT', PWR, (px(14), L_OUT), (OUTR, L_OUT), (OUTR, 38.0), (77.5, 38.0))
terminal('J3', 'Alto-falante', [(1, 77.5, 38.0, 'OUT'), (2, 77.5, 43.08, 'GND')],
         5.08, False, descr='Borne 2 vias passo 5,08 mm para o alto-falante',
         side=-1, lx=76.0, ly=47.6, lab_off=(-4.3, 0))
track('GND', PWR, (77.5, 43.08), (77.5, 60.5))
# Zobel / Boucherot (opcional)
resistor('R6', '2R7 1W', (70.0, 8.0), (70.0, 23.24), 'OUT', 'ZOB', drill=1.0,
         size=2.2, body=(10.0, 4.0), descr='Rede Zobel (opcional), 1 W', lx=66.4, vx=65.6)
track('OUT', MID, (70.0, 8.0), (OUTR, 8.0))
film('C10', '100nF/100V', (70.0, 26.5), (70.0, 31.58), 'ZOB', 'GND',
     descr='Rede Zobel (opcional)', lx=66.6)
track('ZOB', SIG, (70.0, 23.24), (70.0, 26.5))
track('GND', MID, (70.0, 31.58), (70.0, 60.5))

# furos de fixação M3
b.holes += [(4.0, 34.0, 3.2), (4.0, 60.0, 3.2), (78.0, 12.0, 3.2)]

# ------------------------------------------------ marcações gerais
# face da aba / dissipador: nada de componente acima desta linha
for i in range(0, 80, 3):
    b.silk.append(Silk('line', (i + 0.5, YE - 4.5, i + 2.0, YE - 4.5)))
label('DISSIPADOR (ABA = -V)', 22.0, 1.4, 1.1)
label('TDA7294 MONO', 15.0, 54.0, 1.8)
label('FACE SIMPLES  REV A', 15.0, 57.0, 1.2)
