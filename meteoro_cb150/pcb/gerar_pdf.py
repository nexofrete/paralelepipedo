"""Gera meteoro_cb150_pcb.pdf a partir de meteoro_cb150.kicad_pcb.

Paginas: 1) instrucoes e lista de jumpers; 2) lado cobre para transferencia
termica (escala 1:1); 3) lado cobre visto por baixo; 4) lado dos componentes
(montagem); 5) componentes + trilhas sobrepostas.
"""
import os
import subprocess
import sys
import tempfile

import pcbnew
from reportlab.lib.pagesizes import A4, landscape
from reportlab.pdfgen import canvas

PCB = sys.argv[1] if len(sys.argv) > 1 else "meteoro_cb150.kicad_pcb"
OUT = sys.argv[2] if len(sys.argv) > 2 else "meteoro_cb150_pcb.pdf"
MM = 1e6

board = pcbnew.LoadBoard(PCB)
bb = board.GetBoardEdgesBoundingBox()
bw, bh = bb.GetWidth() / MM, bb.GetHeight() / MM
jumpers = []
for fp in board.GetFootprints():
    r = fp.GetReference()
    if r.startswith("W") and r[1:].isdigit():
        p = list(fp.Pads())
        a, b = p[0].GetPosition(), p[1].GetPosition()
        L = ((a.x - b.x) ** 2 + (a.y - b.y) ** 2) ** 0.5 / MM
        jumpers.append((int(r[1:]), r, p[0].GetNetname(), L))
jumpers.sort()
ntr = sum(1 for t in board.GetTracks())
nparts = sum(1 for fp in board.GetFootprints() if fp.GetReference() and not fp.GetReference().startswith("W"))

tmp = tempfile.mkdtemp()
capa = os.path.join(tmp, "0.pdf")
c = canvas.Canvas(capa, pagesize=landscape(A4))
W, H = landscape(A4)
y = H - 50
c.setFont("Helvetica-Bold", 18)
c.drawString(40, y, "Meteoro Amplifier - Pre Power CB150 - placa de circuito impresso")
y -= 22
c.setFont("Helvetica", 10)
c.drawString(40, y, f"Face simples (cobre no lado da solda) - placa {bw:.0f} x {bh:.0f} mm - {nparts} componentes - "
             f"{len(jumpers)} jumpers - {ntr} segmentos de trilha")
y -= 26
c.setFont("Helvetica-Bold", 12)
c.drawString(40, y, "Paginas")
c.setFont("Helvetica", 10)
for t in ["2 - Lado do cobre para transferencia termica / fotolito (imprimir a 100%, sem 'ajustar a pagina').",
          "     Imprima em papel glossy/couche com impressora laser e aplique o toner sobre o cobre.",
          "3 - Lado do cobre visto por baixo da placa (referencia para conferir e soldar).",
          "4 - Lado dos componentes: posicao, referencia e valor de cada peca + jumpers (fios) em linha grossa.",
          "5 - Componentes e trilhas sobrepostos (vista por cima, trilhas 'transparentes')."]:
    y -= 14
    c.drawString(50, y, t)
y -= 24
c.setFont("Helvetica-Bold", 12)
c.drawString(40, y, "Regras usadas")
c.setFont("Helvetica", 10)
for t in ["Trilhas: 0,75 mm (sinal e +/-12 V), 1,2 mm (bases dos transistores de saida), 2,0 mm (+/-55 V, saida,",
          "     emissores e GND de potencia; afinam para 0,9 mm so entre pinos vizinhos).",
          "GND de sinal = plano de cobre (area preenchida), que tambem reduz o cobre a corroer.",
          "Isolacao minima entre cobres: 0,5 mm (verificada pelo DRC do KiCad).  Pads ampliados para furacao e solda caseiras.",
          "Furos: 0,8-1,0 mm (componentes comuns), 1,2-1,5 mm (TO-264, bornes, eletroliticos grandes), conforme o footprint.",
          "Confira a escala: a placa impressa deve medir exatamente %.0f x %.0f mm." % (bw, bh),
          "GND (sinal) e GND* de potencia sao unidos SO pela ponte JGND (fio) - aterramento em estrela.",
          "Q6/Q7 (e de preferencia Q4/Q5) ficam na borda superior para o dissipador; isole-os com mica/silicone.",
          "Q8 (MPSA42) deve ficar encostado no dissipador para compensacao termica do bias (use fios se preciso).",
          "Conectores JRV1..JRV4, J1, JCH1: fios blindados para potenciometros, jaque e chave do painel.",
          "JPWR: saida da ponte KBPC606 (+55 / GND / -55) - a ponte e o trafo ficam no chassi."]:
    y -= 14
    c.drawString(50, y, t)
y -= 24
c.setFont("Helvetica-Bold", 12)
c.drawString(40, y, f"Jumpers (fios no lado dos componentes): {len(jumpers)}")
c.setFont("Helvetica", 9)
y -= 4
col = 0
y0 = y
for i, (_, r, net, L) in enumerate(jumpers):
    if i and i % 14 == 0:
        col += 1
        y = y0
    y -= 12
    c.drawString(50 + col * 150, y, f"{r}: {L:5.1f} mm  ({net})")
c.showPage()
c.save()

pages = [capa]
for i, (layers, extra) in enumerate([
        ("B.Cu,Edge.Cuts", ["--black-and-white"]),
        ("B.Cu,Edge.Cuts", ["--black-and-white", "--mirror"]),
        ("F.SilkS,F.Fab,Edge.Cuts", ["--black-and-white"]),
        ("B.Cu,F.SilkS,F.Fab,Edge.Cuts", [])], 1):
    out = os.path.join(tmp, f"{i}.pdf")
    subprocess.run(["kicad-cli", "pcb", "export", "pdf", "-l", layers, "--ibt", *extra, "-o", out, PCB],
                   check=True, stdout=subprocess.DEVNULL)
    pages.append(out)
subprocess.run(["pdfunite", *pages, OUT], check=True)
print(OUT, len(jumpers), "jumpers")
