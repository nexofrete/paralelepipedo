# -*- coding: utf-8 -*-
"""
Confere o backend/schema.sql ANTES de mandar uma versão para o servidor.
O servidor roda o schema.sql inteiro ao ligar; se um comando falhar, nada é
aplicado e o sistema não sobe. Este script pega os erros mais comuns:
  - tabela criada 2x com o mesmo nome (o banco ignora a 2ª definição!);
  - ALTER em tabela que ainda não existe naquele ponto do arquivo;
  - UPDATE / INSERT ... SELECT usando coluna que não existe (ainda) na tabela.
Uso:  py ferramentas\\verificar-schema.py      (sai com código 1 se achar problema)
"""
import os, re, sys

AQUI = os.path.dirname(os.path.abspath(__file__))
s = open(os.path.join(AQUI, '..', 'backend', 'schema.sql'), encoding='utf-8').read()
# Expressões regulares do PostgreSQL: repetição {n,m} só vai até 255 (no JavaScript
# não tem limite — um teste no JS passa e o banco recusa a preparação inteira).
problemas_regex = []
for linha_n, linha in enumerate(s.split('\n'), 1):
    if linha.strip().startswith('--'):
        continue
    for m in re.finditer(r'\{(\d*),?(\d*)\}', linha):
        nums = [int(x) for x in m.groups() if x]
        if nums and max(nums) > 255:
            problemas_regex.append(f'linha {linha_n}: repetição {m.group(0)} numa expressão regular — o PostgreSQL só aceita até 255')
s = re.sub(r'\$\$.*?\$\$', "'<corpo>'", s, flags=re.S)
s = re.sub(r'--[^\n]*', '', s)
comandos = [x.strip() for x in s.split(';') if x.strip()]
PALAVRAS = set(('null true false and not case when then else end coalesce nullif concat_ws substring from for '
                'regexp_replace left ltrim now where is in or exists select limit current_date interval date_trunc '
                'trim lower upper distinct as on set like any between with cast numeric text boolean integer date '
                'timestamp abs greatest least sum count max min int float position desc asc order by group having '
                'join e n into values returning do nothing conflict update').split())
colunas, problemas = {}, []

def verificar_uso(tabela, corpo, comando):
    corpo = re.sub(r"'(?:[^']|'')*'", '', corpo)
    for ident in set(re.findall(r'\b([a-z_][a-z0-9_]{1,})\b', corpo)):
        if ident in colunas[tabela] or ident in PALAVRAS or ident in colunas:
            continue
        if re.search(r'\b\w+\.' + ident + r'\b', corpo):   # coluna de outra tabela com apelido (d.x)
            continue
        problemas.append(f'{comando[:50]}…: coluna "{ident}" não existe em {tabela} nesse ponto do arquivo')

for c in comandos:
    m = re.match(r'CREATE TABLE IF NOT EXISTS (\w+)\s*\((.*)\)$', c, re.S)
    if m:
        t = m.group(1)
        if t in colunas:
            problemas.append(f'tabela "{t}" criada 2x — o banco IGNORA a 2ª definição (use outro nome ou ALTER TABLE)')
            continue
        colunas[t] = set()
        for linha in re.split(r',\s*\n', m.group(2)):
            mm = re.match(r'\s*(\w+)\s+\w', linha)
            if mm and mm.group(1).upper() not in ('CONSTRAINT', 'PRIMARY', 'UNIQUE', 'FOREIGN', 'CHECK'):
                colunas[t].add(mm.group(1))
        continue
    m = re.match(r'ALTER TABLE (\w+) (ADD|DROP) COLUMN IF (?:NOT )?EXISTS (\w+)', c)
    if m:
        if m.group(1) not in colunas:
            problemas.append(f'ALTER em tabela que ainda não existe nesse ponto: {m.group(1)}')
        elif m.group(2) == 'ADD':
            colunas[m.group(1)].add(m.group(3))
        continue
    m = re.match(r'UPDATE (\w+) SET', c)
    if m:
        if m.group(1) not in colunas: problemas.append(f'UPDATE em tabela que não existe: {m.group(1)}')
        else: verificar_uso(m.group(1), c[m.end():], c)
        continue
    if c.startswith('INSERT'):
        m = re.search(r'\bFROM (\w+)', c)
        if m and m.group(1) in colunas:
            verificar_uso(m.group(1), c[m.end():], c)
            sel = re.search(r'\bSELECT (.*?) FROM ' + m.group(1), c, re.S)
            if sel:
                for col in [x.strip() for x in sel.group(1).split(',')]:
                    if re.fullmatch(r'[a-z_]\w*', col) and col not in colunas[m.group(1)]:
                        problemas.append(f'{c[:50]}…: SELECT de "{col}", que não existe em {m.group(1)}')

problemas += problemas_regex
if problemas:
    print('PROBLEMAS NO schema.sql:')
    print('\n'.join(f' - {p}' for p in sorted(set(problemas))))
    sys.exit(1)
print('schema.sql OK: nenhum problema encontrado.')
