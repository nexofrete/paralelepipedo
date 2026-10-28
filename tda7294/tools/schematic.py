"""Desenha o esquema elétrico em SVG (sem dependências externas)."""
import os

S = []          # elementos SVG
LW = 0.45
FONT = 'font-family="Arial, Helvetica, sans-serif"'


def w(*pts, dash=False):
    d = 'M' + ' L'.join(f'{x},{y}' for x, y in pts)
    extra = ' stroke-dasharray="2 1.5"' if dash else ''
    S.append(f'<path d="{d}" fill="none" stroke="#111" stroke-width="{LW}" '
             f'stroke-linejoin="round"{extra}/>')


def dot(x, y):
    S.append(f'<circle cx="{x}" cy="{y}" r="0.9" fill="#111"/>')


def t(x, y, s, size=3.0, anchor='middle', bold=False, color='#111', italic=False):
    s = s.replace('&', '&amp;')
    fw = ' font-weight="bold"' if bold else ''
    fs = ' font-style="italic"' if italic else ''
    S.append(f'<text x="{x}" y="{y}" {FONT} font-size="{size}" text-anchor="{anchor}" '
             f'dominant-baseline="central" fill="{color}"{fw}{fs}>{s}</text>')


def res_h(x1, x2, y, ref, val):
    """Resistor horizontal entre x1 e x2."""
    c = (x1 + x2) / 2
    w((x1, y), (c - 5, y))
    w((c + 5, y), (x2, y))
    S.append(f'<rect x="{c - 5}" y="{y - 1.6}" width="10" height="3.2" fill="#fff" '
             f'stroke="#111" stroke-width="{LW}"/>')
    t(c, y - 4, ref, 2.8, bold=True)
    t(c, y + 4.2, val, 2.6)


def res_v(x, y1, y2, ref, val, side=1):
    c = (y1 + y2) / 2
    w((x, y1), (x, c - 5))
    w((x, c + 5), (x, y2))
    S.append(f'<rect x="{x - 1.6}" y="{c - 5}" width="3.2" height="10" fill="#fff" '
             f'stroke="#111" stroke-width="{LW}"/>')
    a = 'start' if side > 0 else 'end'
    t(x + 3.2 * side, c - 1.6, ref, 2.8, anchor=a, bold=True)
    t(x + 3.2 * side, c + 1.8, val, 2.6, anchor=a)


def cap_h(x1, x2, y, ref, val, polar=False, plus_left=True):
    c = (x1 + x2) / 2
    w((x1, y), (c - 0.9, y))
    w((c + 0.9, y), (x2, y))
    w((c - 0.9, y - 3), (c - 0.9, y + 3))
    if polar:
        S.append(f'<rect x="{c + 0.4}" y="{y - 3}" width="1" height="6" fill="#111"/>' if plus_left
                 else f'<rect x="{c - 1.4}" y="{y - 3}" width="1" height="6" fill="#111"/>')
        w((c + 0.9, y - 3), (c + 0.9, y + 3)) if not plus_left else None
        px = c - 2.6 if plus_left else c + 2.6
        t(px, y - 3.6, '+', 3)
        if not plus_left:
            pass
    else:
        w((c + 0.9, y - 3), (c + 0.9, y + 3))
    t(c, y - 6.2, ref, 2.8, bold=True)
    t(c, y + 5.6, val, 2.6)


def cap_v(x, y1, y2, ref, val, polar=False, plus_top=True, side=1):
    c = (y1 + y2) / 2
    w((x, y1), (x, c - 0.9))
    w((x, c + 0.9), (x, y2))
    if polar:
        if plus_top:
            w((x - 3, c - 0.9), (x + 3, c - 0.9))
            S.append(f'<rect x="{x - 3}" y="{c + 0.4}" width="6" height="1" fill="#111"/>')
            t(x - 3.4 * side, c - 3, '+', 3)
        else:
            S.append(f'<rect x="{x - 3}" y="{c - 1.4}" width="6" height="1" fill="#111"/>')
            w((x - 3, c + 0.9), (x + 3, c + 0.9))
            t(x - 3.4 * side, c + 3, '+', 3)
    else:
        w((x - 3, c - 0.9), (x + 3, c - 0.9))
        w((x - 3, c + 0.9), (x + 3, c + 0.9))
    a = 'start' if side > 0 else 'end'
    t(x + 4.2 * side, c - 1.6, ref, 2.8, anchor=a, bold=True)
    t(x + 4.2 * side, c + 1.8, val, 2.6, anchor=a)


def gnd(x, y):
    w((x, y), (x, y + 2))
    w((x - 3, y + 2), (x + 3, y + 2))
    w((x - 2, y + 3), (x + 2, y + 3))
    w((x - 1, y + 4), (x + 1, y + 4))


def flag(x, y, name, up=True):
    """Símbolo de alimentação (+V para cima, -V para baixo)."""
    if up:
        w((x, y), (x, y - 2.5))
        w((x - 3, y - 2.5), (x + 3, y - 2.5))
        t(x, y - 5, name, 2.8, bold=True)
    else:
        w((x, y), (x, y + 2.5))
        w((x - 3, y + 2.5), (x + 3, y + 2.5))
        t(x, y + 5, name, 2.8, bold=True)


def connector(x, y, ref, name, pins, side='left'):
    """Borne: pins = [(dy, rótulo)], fio sai para a direita (side=left) ou esquerda."""
    h = max(p[0] for p in pins) + 4
    xr = x - 7 if side == 'left' else x
    S.append(f'<rect x="{xr}" y="{y - 4}" width="7" height="{h + 4}" fill="#fff" '
             f'stroke="#111" stroke-width="{LW}"/>')
    for dy, lab in pins:
        cx = x - 2.2 if side == 'left' else x + 2.2
        S.append(f'<circle cx="{cx}" cy="{y + dy}" r="1.1" fill="none" stroke="#111" '
                 f'stroke-width="{LW}"/>')
        t(xr - 1.2 if side == 'left' else xr + 8.2, y + dy, lab, 2.3,
          anchor='end' if side == 'left' else 'start')
    t(xr + 3.5, y - 6.5, ref, 2.8, bold=True)
    t(xr + 3.5, y + h + 3, name, 2.4, italic=True)


def diode_v(x, y1, y2, ref, val, side=1):
    """Diodo vertical, anodo em cima (y1), catodo embaixo (y2)."""
    c = (y1 + y2) / 2
    w((x, y1), (x, c - 2))
    w((x, c + 2), (x, y2))
    S.append(f'<path d="M{x - 2.5},{c - 2} L{x + 2.5},{c - 2} L{x},{c + 2} Z" fill="#fff" '
             f'stroke="#111" stroke-width="{LW}"/>')
    w((x - 2.5, c + 2), (x + 2.5, c + 2))
    a = 'start' if side > 0 else 'end'
    t(x + 3.6 * side, c - 1.6, ref, 2.8, anchor=a, bold=True)
    t(x + 3.6 * side, c + 1.8, val, 2.6, anchor=a)


def build():
    S.clear()
    # ------------------------------------------------ CI
    X1, X2, Y1, Y2 = 120, 175, 55, 115
    S.append(f'<rect x="{X1}" y="{Y1}" width="{X2 - X1}" height="{Y2 - Y1}" fill="#fffbe9" '
             f'stroke="#111" stroke-width="0.6"/>')
    t((X1 + X2) / 2, 80, 'U1', 3.4, bold=True)
    t((X1 + X2) / 2, 85, 'TDA7294V', 3.4, bold=True)
    S.append(f'<path d="M{147.5 - 9},{90} L{147.5 - 9},{104} L{147.5 + 9},{97} Z" fill="none" '
             f'stroke="#111" stroke-width="{LW}"/>')

    def pin(n, x, y, name, dx=0, dy=0):
        lab_x = x + (2.2 if x == X1 else -2.2 if x == X2 else 0)
        lab_y = y + (2.8 if y == Y1 else -2.8 if y == Y2 else 0)
        anchor = 'start' if x == X1 else 'end' if x == X2 else 'middle'
        t(lab_x, lab_y, name, 2.3, anchor=anchor)
        nx = x + (-1.6 if x == X1 else 1.6 if x == X2 else 1.6)
        ny = y + (-1.6 if y == Y1 else 1.6 if y == Y2 else -1.4)
        t(nx, ny, str(n), 2.1, anchor='end' if x == X1 else 'start', color='#555')

    # esquerda
    pin(3, X1, 65, 'IN+')
    pin(2, X1, 80, 'IN-')
    pin(4, X1, 100, 'SVR')
    pin(1, X1, 108, 'ST-BY GND')
    # direita
    pin(6, X2, 68, 'BOOTSTRAP')
    pin(14, X2, 90, 'OUT')
    # topo
    pin(7, 135, Y1, '+Vs')
    pin(13, 160, Y1, '+PWVs')
    # base
    pin(9, 127, Y2, 'ST-BY')
    pin(10, 137, Y2, 'MUTE')
    pin(8, 152, Y2, '-Vs')
    pin(15, 165, Y2, '-PWVs')
    t(147.5, Y2 - 9, '5, 11, 12: N.C.', 2.1, color='#555', italic=True)

    # alimentação do CI
    w((135, Y1), (135, 45)); flag(135, 45, '+V')
    w((160, Y1), (160, 45)); flag(160, 45, '+V')
    w((152, Y2), (152, 124)); flag(152, 124, '-V', up=False)
    w((165, Y2), (165, 124)); flag(165, 124, '-V', up=False)

    # ------------------------------------------------ entrada
    connector(20, 65, 'J1', 'entrada', [(0, 'IN'), (8, 'GND')])
    res_h(20, 42, 65, 'R5', '100R')
    dot(46, 65)
    cap_v(46, 65, 80, 'C11', '470pF', side=-1)
    gnd(46, 80)
    w((42, 65), (52, 65))
    cap_h(52, 68, 65, 'C1', '1µF MKT')
    w((68, 65), (X1, 65))
    dot(85, 65)
    res_v(85, 65, 95, 'R1', '22k', side=-1)
    gnd(85, 95)
    w((20, 73), (28, 73)); gnd(28, 73)

    # ------------------------------------------------ realimentação
    w((X1, 80), (100, 80))
    dot(100, 80)
    res_v(100, 80, 100, 'R2', '680R', side=-1)
    cap_v(100, 100, 116, 'C2', '47µF/25V', polar=True, plus_top=True, side=-1)
    gnd(100, 116)
    S.append(f'<path d="M100,80 L100,67 A2,2 0 0 1 100,63 L100,30" fill="none" '
             f'stroke="#111" stroke-width="{LW}"/>')
    res_h(100, 200, 30, 'R3', '22k')
    w((200, 30), (200, 90))
    # SVR e ST-BY GND ao terra
    w((X1, 100), (112, 100)); w((X1, 108), (112, 108)); w((112, 100), (112, 116))
    dot(112, 108); gnd(112, 116)

    # ------------------------------------------------ bootstrap e saída
    w((X2, 68), (188, 68))
    cap_v(188, 68, 90, 'C5', '47µF/63V', polar=True, plus_top=True, side=1)
    w((X2, 90), (250, 90))
    dot(188, 90); dot(200, 90); dot(222, 90)
    res_v(222, 90, 112, 'R6', '2R7 1W', side=1)
    cap_v(222, 112, 130, 'C10', '100nF', side=1)
    gnd(222, 130)
    t(234, 118, 'Zobel (opcional)', 2.3, anchor='start', italic=True, color='#555')
    connector(250, 90, 'J3', 'alto-falante', [(0, 'OUT'), (8, 'GND')], side='right')
    w((250, 98), (244, 98)); gnd(244, 98)

    # ------------------------------------------------ MUTE / ST-BY
    w((127, Y2), (127, 130)); w((137, Y2), (137, 130)); w((127, 130), (137, 130))
    dot(132, 130)
    w((132, 130), (132, 136), (70, 136))
    dot(110, 136); dot(90, 136)
    res_v(110, 136, 160, 'R4', '22k', side=1)
    w((110, 160), (110, 164)); flag(110, 164, '+V', up=False) if False else None
    # R4 vai ao +V: desenha a bandeira acima? mantém em baixo com rótulo
    t(110, 167.5, '+V', 2.8, bold=True)
    w((107, 164), (113, 164))
    cap_v(90, 136, 156, 'C3', '100µF/50V', polar=True, plus_top=True, side=-1)
    gnd(90, 156)
    diode_v(70, 140, 160, 'D1', '1N4148', side=-1)
    w((70, 136), (70, 140))
    w((70, 160), (70, 164)); w((67, 164), (73, 164)); t(70, 167.5, '+V', 2.8, bold=True)
    t(12, 128, 'MUTE / ST-BY: o CI só sai do mudo depois que a fonte sobe;', 2.3, anchor='start', italic=True, color='#555')
    t(12, 131.5, 'D1 descarrega C3 ao desligar (corta o "plop")', 2.3, anchor='start', italic=True, color='#555')
    # observação do diodo (catodo no +V)

    # ------------------------------------------------ fonte
    connector(196, 150, 'J2', 'alimentação', [(0, '+V'), (10, 'GND'), (20, '-V')])
    w((196, 150), (262, 150)); w((196, 170), (262, 170)); w((196, 160), (262, 160))
    for x in (212, 230):
        dot(x, 150); dot(x, 170)
    dot(212, 160); dot(230, 160)
    t(262, 147.5, '+V', 2.8, anchor='end', bold=True)
    t(262, 167.5, '-V', 2.8, anchor='end', bold=True)
    cap_v(212, 150, 160, '', '', polar=True, plus_top=True)
    cap_v(212, 160, 170, '', '', polar=True, plus_top=True)
    t(206, 152.6, 'C6', 2.6, anchor='end', bold=True); t(206, 168.2, 'C8', 2.6, anchor='end', bold=True)
    t(217, 155.0, '1000µF', 2.2, anchor='start'); t(217, 165.0, '1000µF', 2.2, anchor='start')
    cap_v(230, 150, 160, '', '')
    cap_v(230, 160, 170, '', '')
    t(234.5, 155.0, 'C7 100nF', 2.2, anchor='start'); t(234.5, 165.0, 'C9 100nF', 2.2, anchor='start')
    w((248, 160), (262, 160)); gnd(256, 160) if False else None
    t(262, 157.5, 'GND', 2.8, anchor='end', bold=True)
    t(228, 178, 'C7/C9 ficam junto aos pinos 13 e 15; W1 leva +V ao pino 7', 2.2,
      italic=True, color='#555')

    # ------------------------------------------------ título
    t(10, 8, 'Amplificador TDA7294 — mono, placa de face simples', 5, anchor='start', bold=True)
    t(10, 14.5, 'Ganho = 1 + R3/R2 = 33,4 (30,5 dB)  •  ±35 V máx. p/ 8 Ω, ±27 V máx. p/ 4 Ω  •  '
      'baseado na Fig. 1 do datasheet ST', 2.8, anchor='start', color='#333')

    W_, H_ = 280, 185
    body = '\n'.join(S)
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{W_ * 4}" height="{H_ * 4}" '
            f'viewBox="0 0 {W_} {H_}">\n<title>Esquema TDA7294</title>\n'
            f'<rect width="{W_}" height="{H_}" fill="#fff"/>\n{body}\n</svg>\n')


if __name__ == '__main__':
    out = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                       'esquema.svg')
    with open(out, 'w', encoding='utf-8') as f:
        f.write(build())
    print(out)
