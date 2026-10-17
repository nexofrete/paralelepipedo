"""Roda o DRC do KiCad na placa e resume as violacoes.

Os jumpers aparecem como 'unconnected_items' (cada jumper liga dois pads que o
KiCad nao sabe que serao unidos por um fio) - o numero deve bater com o de jumpers.
Uso: python3 verificar.py [placa.kicad_pcb]
"""
import collections
import re
import sys
import tempfile

import pcbnew

pcb = sys.argv[1] if len(sys.argv) > 1 else "meteoro_cb150.kicad_pcb"
b = pcbnew.LoadBoard(pcb)
rpt = tempfile.mktemp(suffix=".rpt")
pcbnew.WriteDRCReport(b, rpt, pcbnew.EDA_UNITS_MILLIMETRES, True)
txt = open(rpt).read()
cnt = collections.Counter(re.findall(r"^\[(\w+)\]", txt, re.M))
nj = sum(1 for fp in b.GetFootprints() if re.fullmatch(r"W\d+", fp.GetReference()))
for k, v in cnt.most_common():
    print(f"{k:24s} {v}")
print("jumpers:", nj)
bad = [k for k in ("clearance", "shorting_items", "tracks_crossing", "hole_near_hole", "hole_clearance",
                   "copper_edge_clearance", "solder_mask_bridge", "track_width") if cnt.get(k)]
if bad or cnt.get("unconnected_items", 0) > nj:
    for blk in txt.split("\n["):
        if any(blk.startswith(k) for k in bad) or blk.startswith("unconnected"):
            print("[" + blk.strip()[:400])
    sys.exit(1)
print("OK: sem violacoes de isolacao; desconexoes = jumpers")
