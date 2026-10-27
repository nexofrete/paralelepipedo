"""Folha 3: fonte de alimentacao (com fusiveis e filtros de 10000 uF)."""
import sys

import schemdraw.elements as elm

from base import CP, R, W, dot, gnd, nova, salvar, tag, texto, two

d = nova("Fonte", "")
texto((13, 11.5), "METEORO PRE POWER CB150 (com melhorias) - folha 3/3: fonte de alimentacao", 12)
texto((13, 10.4), "TR, KBPC606 e fusivel do primario ficam no chassi; ligam a placa pelo borne JPWR (+55 / GND / -55)", 8.5)

# transformador e ponte
tag((-3, 2.4), "127/220 VAC", "left")
W((-3, 2.4), (-1.6, 2.4))
d.add(elm.Fuse().endpoints((-1.6, 2.4), (0, 2.4)).label("fusivel\nprimario", loc="top", fontsize=8))
tag((-3, 0), "rede", "left")
W((-3, 0), (0, 0))
tr = elm.Transformer(t1=6, t2=6, core=True).theta(0).at((0, 0)).label("TR\n2 x 39 VAC\n>= 250 VA", loc="bottom", fontsize=8.5)
d.add(tr)
br = elm.Rectifier().theta(0).at((4, 1.2)).label("PT1 KBPC606", loc="top", fontsize=8.5)
d.add(br)
W(tr.s1, (1.6, 2.4), (1.6, 3.32), br.N)
W(tr.s2, (1.6, 0), (1.6, -0.92), br.S)
texto((9.0, 1.7), "+", 9)
texto((3.4, 1.7), "-", 9)
# center tap -> GND de potencia
W(tr.tapS3, (2.6, 1.2), (2.6, -1.6), (10, -1.6), (10, 1), (12, 1))
texto((1.9, 0.8), "CT", 7.5)

# trilhos brutos
W(br.E, (8.24, 6), (12, 6))
W(br.W, (4, -4), (12, -4))
texto((10, 6.5), "+55V", 8)
texto((10, -3.5), "-55V", 8)
dot((12, 6))
dot((12, -4))
dot((12, 1))
CP((12, 6), (12, 1), "C20", "10000u/63V", "bottom")
CP((12, 1), (12, -4), "C19", "10000u/63V", "bottom")
W((12, 1), (14, 1))
dot((14, 1))
gnd((14, 1), potencia=True)
texto((15.9, 0.1), "GND de potencia\n(Zobel, alto-falante)", 7.5)
texto((10.6, 7.6), "JPWR", 8)

# fusiveis
d.add(elm.Fuse().endpoints((12, 6), (16, 6)).label("F1\n5 A rapido", loc="top", fontsize=8.5))
d.add(elm.Fuse().endpoints((12, -4), (16, -4)).label("F2\n5 A rapido", loc="bottom", fontsize=8.5))
W((16, 6), (22, 6))
W((16, -4), (22, -4))
dot((17, 6))
dot((17, -4))
tag((17, 6), "+55V", "up")
tag((17, -4), "-55V", "down")

# ponte de terra (estrela)
W((14, 1), (14, 3))
two(elm.Line, (14, 3), (16.5, 3), "JGND", "ponte de fio", "top")
dot((16.5, 3))
gnd((16.5, 3))
texto((18.5, 2.4), "GND de sinal", 7.5)

# reguladores +/-12 V
R((22, 6), (25, 6), "R88", "2k2 2W")
dot((26, 6))
W((25, 6), (27.5, 6))
two(elm.Zener, (26, 3), (26, 6), "D1", "1N4742A 12V", "bottom")
gnd((26, 3))
tag((27.5, 6), "+12V", "right")
R((22, -4), (25, -4), "R20", "2k2 2W", "bottom")
W((25, -4), (27.5, -4))
dot((26, -4))
two(elm.Zener, (26, -4), (26, -1), "D2", "1N4742A 12V", "top")
dot((26, -1))
W((26, -1), (27.6, -1))
CP((27.6, -1), (27.6, -4), "C18", "10u/63V", "bottom")
dot((27.6, -4))
W((26, -1), (24.6, -1))
gnd((24.6, -1))
W((27.6, -4), (29, -4))
tag((29, -4), "-12V", "right")

salvar(sys.argv[1] if len(sys.argv) > 1 else "fonte.pdf")
