#!/bin/sh
# gera PNG de pre-visualizacao: ver.sh placa.kicad_pcb saida.png
T=$(mktemp -d)
kicad-cli pcb export pdf -l B.Cu,F.SilkS,F.Fab,Edge.Cuts -o $T/p.pdf "$1" >/dev/null
pdftoppm -r ${3:-150} -png $T/p.pdf $T/p
convert $T/p-1.png -trim +repage "$2"
rm -rf $T
