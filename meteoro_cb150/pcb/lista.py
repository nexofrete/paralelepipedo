"""Relacao de componentes tirada da propria placa (meteoro_cb150.kicad_pcb).

Uso: python3 lista.py [placa.kicad_pcb]  -> grava relacao_componentes.csv
Tambem usado por gerar_pdf.py para a pagina de relacao de componentes.
"""
import csv
import re
import sys

import pcbnew

# itens que nao vao na placa (ligados pelos conectores)
FORA_DA_PLACA = [
    (1, "20k linear (B)", "Potenciometro (ganho/master) - liga em JRV1", "RV1"),
    (1, "100k linear (B)", "Potenciometro (agudos) - liga em JRV2", "RV2"),
    (1, "10k linear (B)", "Potenciometro (equalizacao) - liga em JRV3", "RV3"),
    (1, "50k log (A)", "Potenciometro (equalizacao) - liga em JRV4", "RV4"),
    (1, "P10 mono", "Jaque de entrada - liga em J1", "J1 (painel)"),
    (1, "1 polo", "Chave de ganho - liga em JCH1", "CH1"),
    (1, "KBPC606", "Ponte retificadora 6 A (no chassi) - liga em JPWR", "PT1"),
    (1, "2 x 39 VAC, >= 250 VA", "Transformador com center tap + fusivel no primario", "TR"),
    (1, ">= 0,5 C/W", "Dissipador para Q4, Q5, Q6, Q7 (+ isoladores e pasta termica)", "-"),
    (2, "5 A rapido", "Fusivel 5x20 mm (vai nos porta-fusiveis F1/F2)", "F1, F2"),
    (2, "DIP-8", "Soquete para CI1 e CI2", "CI1, CI2"),
]


def descricao(ref, fpname, valor):
    if ref == "L1":
        return "Resistor 10 R 2 W + bobina 1 uH (12 voltas, fio 1 mm)"
    if ref == "JGND":
        return "Ponte de fio (terra em estrela)"
    tab = [("R_Axial_DIN0207", "Resistor 1/4 W"), ("R_Axial_DIN0309", "Resistor 1/2 W"),
           ("R_Axial_DIN0414", "Resistor 2 W"), ("R_Axial_Power", "Resistor 5 W (fio)"),
           ("C_Disc", "Capacitor ceramico 100 V"), ("C_Rect", "Capacitor de poliester 100 V"),
           ("SnapIn", "Capacitor eletrolitico snap-in 35 mm"), ("CP_Radial", "Capacitor eletrolitico"),
           ("TO-92", "Transistor TO-92"), ("TO-126", "Transistor TO-126"), ("TO-264", "Transistor TO-264 (no dissipador)"),
           ("DIP-8", "Circuito integrado DIP-8"), ("D_DO-41", "Diodo zener 1 W"),
           ("Fuseholder", "Porta-fusivel de placa 5x20 mm"), ("PinHeader", "Conector / pontos para fio do painel"),
           ("TerminalBlock", "Borne parafuso 5 mm"), ("Potentiometer", "Trimpot multivoltas 3296W")]
    for k, d in tab:
        if k in fpname:
            return d
    return fpname


def natural(r):
    m = re.match(r"([A-Z]+)(\d*)", r)
    return (m.group(1), int(m.group(2) or 0), r)


def componentes(pcb):
    b = pcbnew.LoadBoard(pcb)
    out = []
    for fp in b.GetFootprints():
        r = fp.GetReference()
        if not r or re.fullmatch(r"W\d+", r):
            continue
        out.append((r, fp.GetValue(), descricao(r, str(fp.GetFPID().GetLibItemName()), fp.GetValue())))
    return out


def agrupada(pcb):
    """lista (qtd, valor, descricao, referencias) agrupada por descricao+valor"""
    g = {}
    for r, v, d in componentes(pcb):
        g.setdefault((d, v), []).append(r)
    ordem = ["Resistor", "Capacitor", "Diodo", "Transistor", "Circuito", "Trimpot", "Porta", "Borne", "Conector", "Ponte"]

    def chave(item):
        (d, v), refs = item
        k = next((i for i, p in enumerate(ordem) if d.startswith(p)), 99)
        return (k, d, natural(sorted(refs, key=natural)[0]))
    linhas = []
    for (d, v), refs in sorted(g.items(), key=chave):
        refs = sorted(refs, key=natural)
        linhas.append((len(refs), v, d, ", ".join(refs)))
    return linhas


if __name__ == "__main__":
    pcb = sys.argv[1] if len(sys.argv) > 1 else "meteoro_cb150.kicad_pcb"
    with open("relacao_componentes.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f, delimiter=";")
        w.writerow(["Qtd", "Valor", "Descricao", "Referencias", "Local"])
        for linha in agrupada(pcb):
            w.writerow([*linha, "placa"])
        for linha in FORA_DA_PLACA:
            w.writerow([*linha, "fora da placa"])
    print("relacao_componentes.csv:", sum(q for q, *_ in agrupada(pcb)), "pecas na placa")
