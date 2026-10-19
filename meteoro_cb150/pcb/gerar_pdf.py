"""Gera meteoro_cb150_pcb.pdf a partir de meteoro_cb150.kicad_pcb.

Dupla face: 1) instrucoes; 2) cobre do lado da solda (B.Cu) para transferencia;
3) cobre do lado dos componentes (F.Cu) para transferencia (ja espelhado);
4) montagem (lado dos componentes); 5) as duas faces sobrepostas.
Face simples: 1) instrucoes e jumpers; 2) cobre para transferencia;
3) cobre visto por baixo; 4) montagem; 5) sobreposicao.
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
tracks = list(board.GetTracks())
nvias = sum(1 for t in tracks if t.GetClass() == "PCB_VIA")
ntr = len(tracks) - nvias
dupla = any(t.GetLayer() == pcbnew.F_Cu for t in tracks)
nparts = sum(1 for fp in board.GetFootprints() if fp.GetReference() and not fp.GetReference().startswith("W"))

tmp = tempfile.mkdtemp()
capa = os.path.join(tmp, "0.pdf")
c = canvas.Canvas(capa, pagesize=landscape(A4))
W, H = landscape(A4)
y = H - 50


def bloco(titulo, linhas):
    global y
    y -= 24
    c.setFont("Helvetica-Bold", 12)
    c.drawString(40, y, titulo)
    c.setFont("Helvetica", 9.5)
    for t in linhas:
        y -= 13
        c.drawString(50, y, t)


c.setFont("Helvetica-Bold", 18)
c.drawString(40, y, "Meteoro Amplifier - Pre Power CB150 (com melhorias) - placa de circuito impresso")
y -= 22
c.setFont("Helvetica", 10)
tipo = f"Dupla face - {nvias} vias" if dupla else f"Face simples - {len(jumpers)} jumpers"
c.drawString(40, y, f"{tipo} - placa {bw:.0f} x {bh:.0f} mm - {nparts} componentes - {ntr} segmentos de trilha")
if dupla:
    bloco("Paginas", [
        "Cobre do LADO DA SOLDA (B.Cu, azul na sobreposicao): imprima a 100% e transfira para a face de baixo.",
        "Cobre do LADO DOS COMPONENTES (F.Cu, vermelho): ja sai espelhado; imprima a 100% e transfira para a face de cima.",
        "     Alinhe as duas faces pelos 4 furos de fixacao e pelo contorno: fure primeiro os furos de fixacao numa face,",
        "     use-os para posicionar a segunda folha. Imprima a 100%, sem 'ajustar a pagina'.",
        "Ordem das paginas: esta capa; relacao de componentes (lista de compras); cobre do lado da solda;",
        "     cobre do lado dos componentes; montagem (posicao, referencia e valor); as duas faces sobrepostas.",
        "Vias: furo de 0,8 mm; passe um pedaco de fio e solde dos dois lados. Pads de componentes que tem trilha",
        "     na face de cima precisam ser soldados tambem por cima (ou use placa com furos metalizados).",
        "Mandar fabricar: o arquivo meteoro_cb150.kicad_pcb gera Gerber no KiCad (Arquivo > Fabricacao)."])
else:
    bloco("Paginas", [
        "Ordem das paginas: esta capa; relacao de componentes; cobre para transferencia (100%, sem 'ajustar');",
        "     cobre visto por baixo; montagem (posicao, referencia, valor e jumpers); componentes e trilhas sobrepostos."])
bloco("Regras usadas", [
    "Trilhas: 0,75 mm (sinal e +/-12 V), 1,2 mm (GND, bases dos transistores de saida), 2,0 mm (+/-55 V, saida,",
    "     emissores e GND de potencia; afinam so entre pinos vizinhos).  GND de sinal tambem em plano de cobre.",
    "Isolacao minima entre cobres: 0,5 mm (verificada pelo DRC do KiCad).  Pads ampliados para furacao caseira.",
    "Confira a escala: a placa impressa deve medir exatamente %.0f x %.0f mm." % (bw, bh),
    "GND (sinal) e GND de potencia sao unidos SO pela ponte JGND (fio) - aterramento em estrela.",
    "Q4/Q5/Q6/Q7 ficam na borda superior para o dissipador; isole-os com mica/silicone.",
    "Q8 (MPSA42) deve ficar encostado no dissipador para compensacao termica do bias (use fios se preciso).",
    "Conectores JRV1..JRV4, J1, JCH1: fios blindados para potenciometros, jaque e chave do painel.",
    "JPWR: saida da ponte KBPC606 (+55 / GND / -55) - a ponte e o trafo ficam no chassi.",
    "F1/F2: fusiveis 5x20 mm de 5 A rapidos.  L1: ~12 voltas de fio 1 mm enroladas sobre o resistor de 10 R/2 W.",
    "Melhorias sobre o esquema original: espelho de corrente (QM1/QM2), degeneracao R37/R38, limitadores de",
    "     corrente (Q9, QL1, QL2), R31 entre drivers, fusiveis, bobina de saida e filtros de 10000 uF - ver README."])
if jumpers:
    bloco(f"Jumpers (fios no lado dos componentes): {len(jumpers)}",
          [f"{r}: {L:5.1f} mm  ({net})" for _, r, net, L in jumpers][:20])
c.showPage()

# relacao de componentes (tirada da propria placa)
import lista  # noqa: E402


def tabela(titulo, linhas):
    global y
    def cab():
        global y
        c.setFont("Helvetica-Bold", 14)
        c.drawString(40, y, titulo)
        y -= 20
        c.setFont("Helvetica-Bold", 9)
        for x, t in ((40, "Qtd"), (70, "Valor"), (170, "Descricao"), (480, "Referencias")):
            c.drawString(x, y, t)
        y -= 4
        c.line(40, y, W - 40, y)
        y -= 11
    cab()
    c.setFont("Helvetica", 8.5)
    for q, v, d, r in linhas:
        partes = [r[i:i + 70] for i in range(0, len(r), 70)] if len(r) > 70 else [r]
        if y - 11 * len(partes) < 40:
            c.showPage()
            y = H - 50
            cab()
            c.setFont("Helvetica", 8.5)
        c.drawString(40, y, str(q))
        c.drawString(70, y, v[:18])
        c.drawString(170, y, d[:58])
        for k, pt in enumerate(partes):
            c.drawString(480, y, pt)
            y -= 11
        y -= 1


y = H - 50
linhas = lista.agrupada(PCB)
tabela(f"Relacao de componentes da placa ({sum(q for q, *_ in linhas)} pecas)", linhas)
y -= 14
if y < 160:
    c.showPage()
    y = H - 50
tabela("Fora da placa (ligados por fios aos conectores)", lista.FORA_DA_PLACA)
c.showPage()
c.save()

if dupla:
    plots = [("B.Cu,Edge.Cuts", ["--black-and-white"]),
             ("F.Cu,Edge.Cuts", ["--black-and-white", "--mirror"]),
             ("F.SilkS,F.Fab,Edge.Cuts", ["--black-and-white"]),
             ("F.Cu,B.Cu,F.SilkS,Edge.Cuts", [])]
else:
    plots = [("B.Cu,Edge.Cuts", ["--black-and-white"]),
             ("B.Cu,Edge.Cuts", ["--black-and-white", "--mirror"]),
             ("F.SilkS,F.Fab,Edge.Cuts", ["--black-and-white"]),
             ("B.Cu,F.SilkS,F.Fab,Edge.Cuts", [])]
pages = [capa]
for i, (layers, extra) in enumerate(plots, 1):
    out = os.path.join(tmp, f"{i}.pdf")
    subprocess.run(["kicad-cli", "pcb", "export", "pdf", "-l", layers, "--ibt", *extra, "-o", out, PCB],
                   check=True, stdout=subprocess.DEVNULL)
    pages.append(out)
subprocess.run(["pdfunite", *pages, OUT], check=True)
print(OUT, "dupla face" if dupla else "face simples", len(jumpers), "jumpers", nvias, "vias")
