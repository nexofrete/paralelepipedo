"""Gera os arquivos da placa e roda as verificações.

Uso:  python3 build.py            (gera SVG + Gerber em ../out e ../pcb)
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from geom import drc, connectivity          # noqa: E402
from board import b                          # noqa: E402
import render                                # noqa: E402

ROOT = os.path.dirname(HERE)
PCB = os.path.join(ROOT, 'pcb')
os.makedirs(PCB, exist_ok=True)


def write(name, text):
    path = os.path.join(PCB, name)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(text)
    return path


def main():
    errs = drc(b)
    probs = connectivity(b)
    ok = True
    if errs:
        ok = False
        print(f'DRC: {len(errs)} violação(ões)')
        for e in sorted(errs)[:60]:
            print('  ', e)
    else:
        print('DRC: OK (isolação >= 0,45 mm, borda >= 0,6 mm)')
    if probs:
        ok = False
        print('Conectividade: PROBLEMAS')
        for net, groups in probs.items():
            print('  ', net, groups)
    else:
        print('Conectividade: OK (todas as redes contínuas)')

    write('cobre_espelhado_transferencia.svg',
          render.copper_layer(b, '#000', '#fff', mirror=True,
                              title='TDA7294 - cobre (espelhado p/ transferencia termica)'))
    write('cobre_vista_componentes.svg',
          render.copper_layer(b, '#000', '#fff', mirror=False,
                              title='TDA7294 - cobre visto pelo lado dos componentes'))
    write('serigrafia_componentes.svg',
          render.silk_layer(b, mirror=False, title='TDA7294 - montagem (lado dos componentes)'))
    write('serigrafia_espelhada_transferencia.svg',
          render.silk_layer(b, mirror=True, title='TDA7294 - serigrafia espelhada'))
    write('previa_placa.svg', render.preview(b, title='TDA7294 - previa'))

    import gerber
    gerber.export(b, os.path.join(PCB, 'gerber'))
    import bom
    write('lista_de_material.csv', bom.csv(b))
    return 0 if ok else 1


if __name__ == '__main__':
    sys.exit(main())
