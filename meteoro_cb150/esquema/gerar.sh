#!/bin/sh
# gera esquema_eletrico.pdf (3 folhas) a partir dos scripts schemdraw
set -e
cd "$(dirname "$0")"
T=$(mktemp -d)
python3 pre.py "$T/1.pdf"
python3 potencia.py "$T/2.pdf"
python3 fonte.py "$T/3.pdf"
pdfunite "$T/1.pdf" "$T/2.pdf" "$T/3.pdf" ../esquema_eletrico.pdf
python3 pre.py ../esquema_pre.png
python3 potencia.py ../esquema_potencia.png
python3 fonte.py ../esquema_fonte.png
rm -rf "$T"
echo ../esquema_eletrico.pdf
