# -*- coding: utf-8 -*-
"""
Gera o Manual do Nexofrete (PDF) na raiz do projeto: Manual_Sistema_de_Fretes.pdf

Como usar (no computador que tiver Python 3):
    1) Instale a biblioteca uma vez:   py -m pip install reportlab
    2) Rode:                           py ferramentas\\gerar-manual.py
       (ou dê dois cliques em ferramentas\\gerar-manual.bat)

A versão impressa no manual vem sozinha de backend/package.json.
O conteúdo está em ferramentas/manual_conteudo.py — é lá que se atualiza o
texto a cada versão nova. Este arquivo só cuida da aparência.

Usa só as fontes padrão do PDF (Helvetica), pra rodar igual em qualquer
computador. Por isso o texto evita emojis e símbolos fora do Latin-1
(setas, ✓ etc.) — eles sairiam como quadradinhos.
"""
import json
import os
import sys
from datetime import date

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (BaseDocTemplate, CondPageBreak, Frame, KeepTogether, NextPageTemplate,
                                PageBreak, PageTemplate, Paragraph, Spacer, Table, TableStyle)
from reportlab.platypus.tableofcontents import TableOfContents

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(AQUI)
sys.path.insert(0, AQUI)

# ---------- Cores (as mesmas do sistema) ----------
AZUL_ESCURO = colors.HexColor('#1F4E78')
AZUL = colors.HexColor('#2F6FB0')
AZUL_CLARO = colors.HexColor('#EAF1F8')
CINZA_TEXTO = colors.HexColor('#2B2F36')
CINZA_FRACO = colors.HexColor('#6B7280')
CINZA_LINHA = colors.HexColor('#D9DEE5')
CINZA_FUNDO = colors.HexColor('#F5F7FA')
VERDE = colors.HexColor('#1F9D5C')
LARANJA = colors.HexColor('#E8890C')
VERMELHO = colors.HexColor('#D64545')

LARGURA, ALTURA = A4
MARGEM = 20 * mm
LARGURA_UTIL = LARGURA - 2 * MARGEM


def versao_do_sistema():
    try:
        with open(os.path.join(RAIZ, 'backend', 'package.json'), encoding='utf-8') as f:
            return json.load(f).get('version', '?')
    except Exception:
        return '?'


VERSAO = versao_do_sistema()

# ---------- Estilos ----------
EST = {
    'corpo': ParagraphStyle('corpo', fontName='Helvetica', fontSize=10, leading=14.2, textColor=CINZA_TEXTO, spaceAfter=6),
    'h1': ParagraphStyle('h1', fontName='Helvetica-Bold', fontSize=18, leading=22, textColor=AZUL_ESCURO, spaceBefore=4, spaceAfter=10),
    'h2': ParagraphStyle('h2', fontName='Helvetica-Bold', fontSize=12.5, leading=16, textColor=AZUL_ESCURO, spaceBefore=10, spaceAfter=5),
    'h3': ParagraphStyle('h3', fontName='Helvetica-Bold', fontSize=10.5, leading=14, textColor=CINZA_TEXTO, spaceBefore=6, spaceAfter=3),
    'parte': ParagraphStyle('parte', fontName='Helvetica-Bold', fontSize=26, leading=32, textColor=colors.white),
    'parte_sub': ParagraphStyle('parte_sub', fontName='Helvetica', fontSize=12, leading=17, textColor=colors.white),
    'lista': ParagraphStyle('lista', fontName='Helvetica', fontSize=10, leading=14, textColor=CINZA_TEXTO, leftIndent=12, bulletIndent=2, spaceAfter=3),
    'passo': ParagraphStyle('passo', fontName='Helvetica', fontSize=10, leading=14, textColor=CINZA_TEXTO),
    'passo_num': ParagraphStyle('passo_num', fontName='Helvetica-Bold', fontSize=11, leading=13, textColor=colors.white, alignment=TA_CENTER),
    'tab_cab': ParagraphStyle('tab_cab', fontName='Helvetica-Bold', fontSize=9, leading=11.5, textColor=colors.white),
    'tab': ParagraphStyle('tab', fontName='Helvetica', fontSize=9, leading=12, textColor=CINZA_TEXTO),
    'aviso': ParagraphStyle('aviso', fontName='Helvetica', fontSize=9.6, leading=13.4, textColor=CINZA_TEXTO),
    'codigo': ParagraphStyle('codigo', fontName='Courier', fontSize=9, leading=12, textColor=CINZA_TEXTO),
    'toc1': ParagraphStyle('toc1', fontName='Helvetica-Bold', fontSize=11, leading=15, textColor=AZUL_ESCURO, spaceBefore=8),
    'toc2': ParagraphStyle('toc2', fontName='Helvetica', fontSize=9.8, leading=13.5, textColor=CINZA_TEXTO, leftIndent=14),
}


# ---------- Blocos usados pelo conteúdo ----------
class Documento(BaseDocTemplate):
    """Registra cada título no sumário (com a página certa)."""

    def afterFlowable(self, flowable):
        nivel = getattr(flowable, '_nivel_sumario', None)
        if nivel is None:
            return
        texto = getattr(flowable, '_texto_sumario', None) or flowable.getPlainText()
        chave = 'sec%d' % id(flowable)
        self.canv.bookmarkPage(chave)
        self.canv.addOutlineEntry(texto, chave, level=nivel, closed=nivel > 0)
        self.notify('TOCEntry', (nivel, texto, self.page, chave))


def P(texto):
    return Paragraph(texto, EST['corpo'])


def parte(titulo, subtitulo):
    """Página de abertura de uma parte do manual (fundo azul)."""
    p = Paragraph(titulo, EST['parte'])
    tab = Table([[p], [Paragraph(subtitulo, EST['parte_sub'])]], colWidths=[LARGURA_UTIL])
    tab.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), AZUL_ESCURO),
        ('LEFTPADDING', (0, 0), (-1, -1), 18), ('RIGHTPADDING', (0, 0), (-1, -1), 18),
        ('TOPPADDING', (0, 0), (0, 0), 26), ('BOTTOMPADDING', (0, -1), (-1, -1), 26),
    ]))
    tab._nivel_sumario = 0
    tab._texto_sumario = titulo
    return [PageBreak(), Spacer(1, 60 * mm), tab]


def h1(texto):
    p = Paragraph(texto, EST['h1'])
    p._nivel_sumario = 1
    return [PageBreak(), p, Table([['']], colWidths=[LARGURA_UTIL], rowHeights=[2],
                                  style=[('BACKGROUND', (0, 0), (-1, -1), AZUL)]), Spacer(1, 8)]


def h2(texto):
    return [CondPageBreak(40 * mm), Paragraph(texto, EST['h2'])]


def h3(texto):
    return [CondPageBreak(25 * mm), Paragraph(texto, EST['h3'])]


def lista(itens):
    return [Paragraph(i, EST['lista'], bulletText='\u2022') for i in itens]


def passos(itens):
    linhas = [[Paragraph(str(n), EST['passo_num']), Paragraph(t, EST['passo'])] for n, t in enumerate(itens, 1)]
    tab = Table(linhas, colWidths=[9 * mm, LARGURA_UTIL - 9 * mm])
    estilo = [('VALIGN', (0, 0), (-1, -1), 'TOP'), ('LEFTPADDING', (1, 0), (1, -1), 8),
              ('TOPPADDING', (0, 0), (-1, -1), 3), ('BOTTOMPADDING', (0, 0), (-1, -1), 5)]
    for i in range(len(linhas)):
        estilo.append(('BACKGROUND', (0, i), (0, i), AZUL))
        estilo.append(('TOPPADDING', (0, i), (0, i), 3))
    tab.setStyle(TableStyle(estilo))
    return [tab, Spacer(1, 6)]


_CORES_AVISO = {'dica': (VERDE, 'Dica'), 'atencao': (LARANJA, 'Atenção'), 'importante': (VERMELHO, 'Importante'),
                'nota': (AZUL, 'Como funciona'), 'novo': (AZUL_ESCURO, 'Novo nesta versão')}


def aviso(tipo, texto):
    cor, rotulo = _CORES_AVISO[tipo]
    p = Paragraph('<font color="%s"><b>%s:</b></font> %s' % (cor.hexval().replace('0x', '#'), rotulo, texto), EST['aviso'])
    tab = Table([[p]], colWidths=[LARGURA_UTIL])
    tab.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), CINZA_FUNDO), ('LINEBEFORE', (0, 0), (0, -1), 3.5, cor),
        ('LEFTPADDING', (0, 0), (-1, -1), 10), ('RIGHTPADDING', (0, 0), (-1, -1), 10),
        ('TOPPADDING', (0, 0), (-1, -1), 7), ('BOTTOMPADDING', (0, 0), (-1, -1), 7),
    ]))
    return [Spacer(1, 2), KeepTogether(tab), Spacer(1, 8)]


def tabela(cabecalho, linhas, larguras=None):
    """Tabela com cabeçalho azul. larguras em frações (somam 1)."""
    larguras = larguras or [1.0 / len(cabecalho)] * len(cabecalho)
    dados = [[Paragraph(c, EST['tab_cab']) for c in cabecalho]]
    dados += [[Paragraph(str(c), EST['tab']) for c in l] for l in linhas]
    tab = Table(dados, colWidths=[LARGURA_UTIL * f for f in larguras], repeatRows=1)
    estilo = [
        ('BACKGROUND', (0, 0), (-1, 0), AZUL_ESCURO), ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('GRID', (0, 0), (-1, -1), 0.4, CINZA_LINHA),
        ('TOPPADDING', (0, 0), (-1, -1), 4), ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('LEFTPADDING', (0, 0), (-1, -1), 6), ('RIGHTPADDING', (0, 0), (-1, -1), 6),
    ]
    for i in range(1, len(dados)):
        if i % 2 == 0:
            estilo.append(('BACKGROUND', (0, i), (-1, i), CINZA_FUNDO))
    tab.setStyle(TableStyle(estilo))
    return [tab, Spacer(1, 8)]


def codigo(texto):
    tab = Table([[Paragraph(texto, EST['codigo'])]], colWidths=[LARGURA_UTIL])
    tab.setStyle(TableStyle([('BACKGROUND', (0, 0), (-1, -1), CINZA_FUNDO), ('BOX', (0, 0), (-1, -1), 0.4, CINZA_LINHA),
                             ('LEFTPADDING', (0, 0), (-1, -1), 8), ('TOPPADDING', (0, 0), (-1, -1), 5),
                             ('BOTTOMPADDING', (0, 0), (-1, -1), 5)]))
    return [tab, Spacer(1, 8)]


# ---------- Páginas ----------
def desenhar_capa(canv, doc):
    canv.saveState()
    canv.setFillColor(AZUL_ESCURO)
    canv.rect(0, ALTURA * 0.42, LARGURA, ALTURA * 0.58, stroke=0, fill=1)
    canv.setFillColor(AZUL)
    canv.rect(0, ALTURA * 0.42 - 6, LARGURA, 6, stroke=0, fill=1)
    canv.setFillColor(colors.white)
    canv.setFont('Helvetica-Bold', 40)
    canv.drawString(MARGEM, ALTURA * 0.72, 'Nexofrete')
    canv.setFont('Helvetica', 17)
    canv.drawString(MARGEM, ALTURA * 0.72 - 30, 'Manual completo do sistema')
    canv.setFont('Helvetica', 11.5)
    canv.drawString(MARGEM, ALTURA * 0.72 - 54, 'Instalação, uso no dia a dia, administração e segurança')
    canv.setFont('Helvetica-Bold', 12)
    canv.drawString(MARGEM, ALTURA * 0.50, 'Versão do sistema: %s' % VERSAO)
    canv.setFillColor(CINZA_TEXTO)
    canv.setFont('Helvetica', 10.5)
    y = ALTURA * 0.34
    for linha in ['Acompanhamento de NF-e e CT-e, tabelas de preço,', 'auditoria de frete, aprovação de pagamento,',
                  'conferência de faturas, relatórios e sinistros.']:
        canv.drawString(MARGEM, y, linha)
        y -= 15
    canv.setFillColor(CINZA_FRACO)
    canv.setFont('Helvetica', 9)
    canv.drawString(MARGEM, 22 * mm, 'Manual gerado em %s' % date.today().strftime('%d/%m/%Y'))
    canv.restoreState()


def desenhar_pagina(canv, doc):
    canv.saveState()
    canv.setStrokeColor(CINZA_LINHA)
    canv.setLineWidth(0.5)
    canv.line(MARGEM, ALTURA - 13 * mm, LARGURA - MARGEM, ALTURA - 13 * mm)
    canv.setFont('Helvetica', 8)
    canv.setFillColor(CINZA_FRACO)
    canv.drawString(MARGEM, ALTURA - 11 * mm, 'Nexofrete — Manual do sistema')
    canv.drawRightString(LARGURA - MARGEM, ALTURA - 11 * mm, 'Versão %s' % VERSAO)
    canv.line(MARGEM, 13 * mm, LARGURA - MARGEM, 13 * mm)
    canv.drawRightString(LARGURA - MARGEM, 9 * mm, 'Página %d' % doc.page)
    canv.restoreState()


def gerar(saida):
    import manual_conteudo as conteudo

    doc = Documento(saida, pagesize=A4, leftMargin=MARGEM, rightMargin=MARGEM, topMargin=18 * mm, bottomMargin=18 * mm,
                    title='Manual do Nexofrete', author='Nexofrete', subject='Manual do sistema — versão %s' % VERSAO)
    frame = Frame(MARGEM, 18 * mm, LARGURA_UTIL, ALTURA - 36 * mm, id='normal')
    doc.addPageTemplates([PageTemplate(id='capa', frames=[frame], onPage=desenhar_capa),
                          PageTemplate(id='normal', frames=[frame], onPage=desenhar_pagina)])

    sumario = TableOfContents()
    sumario.levelStyles = [EST['toc1'], EST['toc2']]
    sumario.dotsMinLevel = 1

    historia = [NextPageTemplate('normal'), PageBreak(),
                Paragraph('Sumário', EST['h1']), sumario]
    historia += conteudo.montar(globals())
    doc.multiBuild(historia)


if __name__ == '__main__':
    destino = os.path.join(RAIZ, 'Manual_Sistema_de_Fretes.pdf')
    gerar(destino)
    print('Manual gerado: %s (versão %s)' % (destino, VERSAO))
