# Instruções do projeto (Nexofrete)

## Manual e documentação: atualizar SEMPRE

A cada função nova ou mudança de comportamento visível ao usuário, no mesmo commit:

1. **Manual do sistema (PDF)** — atualize o texto em `sistema-frete/ferramentas/`:
   - `manual_conteudo.py` (Parte 1: instalação), `manual_uso.py` (Parte 2: uso do embarcador),
     `manual_admin.py` (Parte 3: administração + glossário),
     `manual_transportadora.py` (Partes 4 a 6: operação da transportadora, financeiro e gestão, integrações).
   - Regere o PDF: `python3 sistema-frete/ferramentas/gerar-manual.py` (precisa do `reportlab`).
     Ele grava `sistema-frete/Manual_Sistema_de_Fretes.pdf`, que é baixado em "Sobre o sistema".
   - Só caracteres do WinAnsi (o gerador troca/remove setas e emojis, mas escreva sem eles).
     Em tabelas/parágrafos, `<` e `>` literais precisam ser `&lt;` e `&gt;`; `&` como `&amp;`.
2. **Novidades** — inclua o item em `sistema-frete/backend/novidades.json` (versão mais nova primeiro;
   ao abrir uma versão nova, suba também `version` em `backend/package.json` e `package-lock.json`).
3. **README** — `sistema-frete/README.md`, na seção da função (e na lista de códigos de tela, se houver tela nova).

Ao entregar, diga ao usuário que o manual foi atualizado (e em que capítulo).
