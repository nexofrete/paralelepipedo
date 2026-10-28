"""Lista de material em CSV."""
import re


def _key(ref):
    m = re.match(r'([A-Z]+)(\d+)', ref)
    return (m.group(1), int(m.group(2))) if m else (ref, 0)


def csv(b):
    lines = ['Ref;Valor;Descricao']
    for ref, val, descr in sorted(b.parts, key=lambda p: _key(p[0])):
        lines.append(f'{ref};{val};{descr}')
    return '\n'.join(lines) + '\n'
