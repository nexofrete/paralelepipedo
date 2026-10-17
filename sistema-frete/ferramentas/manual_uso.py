# -*- coding: utf-8 -*-
"""Manual do Nexofrete — Parte 2: uso do dia a dia."""


def parte_uso(g):
    P, h1, h2, h3, lista, passos, aviso, tabela, codigo, parte = (
        g['P'], g['h1'], g['h2'], g['h3'], g['lista'], g['passos'], g['aviso'], g['tabela'], g['codigo'], g['parte'])
    s = []
    s += parte('Parte 2 — Uso do dia a dia',
               'Como os dados entram, como o frete é conferido e o que fazer em cada tela.')

    # 10
    s += h1('10. Conceitos básicos')
    s += h2('O registro de frete')
    s.append(P('Cada linha do sistema é um <b>registro de frete</b>, ligado a uma nota fiscal. Ele junta os dados da '
               'NF-e (pedido, cliente, cidade, valor faturado, volumes, peso), do CT-e (transportadora, número, valor '
               'cobrado, impostos, taxas), da planilha do ERP e do mapa de carregamento, além do cálculo pela tabela '
               'de preço e da decisão de pagamento.'))
    s += h2('Status do frete')
    s += tabela(['Status', 'Significado'], [
        ['Aguardando CT-e', 'A nota foi importada, mas o CT-e da transportadora ainda não chegou.'],
        ['Pendente (em conferência)', 'CT-e recebido; ainda falta o cálculo pela tabela ou uma decisão.'],
        ['Frete Retido', 'O valor cobrado no CT-e diverge da tabela além da margem de tolerância, ou a nota tem '
         'CT-e de transportadoras diferentes. <b>Não é pago</b> até alguém decidir.'],
        ['Liberado p/ Pagamento', 'Conferido e aprovado (pelo sistema ou por uma pessoa). Aguarda a fatura da '
         'transportadora.'],
        ['Faturado', 'Já entrou numa fatura conferida.'],
        ['Cancelado', 'Pedido cancelado ou CT-e cancelado. Sai das contas.'],
        ['Arquivado', 'Nota antiga sem CT-e, tirada de "Aguardando CT-e" pela limpeza em Manutenção. Volta para a conferência '
         'sozinha se o CT-e for importado.'],
        ['Não cobrado', 'CT-e a mais da nota que é pago por outra pessoa (o tomador não é a empresa — ex.: redespacho '
         'por conta do destino). Fica só como histórico da nota e sai das contas.'],
    ], [0.28, 0.72])
    s += h2('Situação da aprovação')
    s += tabela(['Aprovação', 'Significado'], [
        ['Pendente', 'Ninguém decidiu ainda.'],
        ['Aprovado', 'Liberado. Aparece quem aprovou: uma pessoa ou "Sistema (conferência automática)".'],
        ['Rejeitado', 'Não deve ser pago. Guarda o motivo.'],
    ], [0.28, 0.72])
    s += h2('Nota fiscal cancelada')
    s.append(P('A nota é marcada como <b>NF cancelada</b> quando chega o <b>XML de cancelamento da NF-e</b> registrado na SEFAZ '
               '(pelo Enviar XML, pela pasta monitorada ou pelo NF-Stock), quando a planilha do ERP traz NF_CANCELADA = S, ou '
               'quando o retorno da SEFAZ informa a nota como cancelada.'))
    s += lista([
        '<b>Sem CT-e</b>: o status vira <b>Cancelado</b> automaticamente — sai de "Aguardando CT-e", de Entregas previstas, '
        'dos atrasos e da busca automática de entregas. Continua em Todos os registros, em laranja, como histórico.',
        '<b>CT-e que chega depois</b> para uma nota já cancelada (NF ou pedido): o frete fica <b>retido</b> para conferência — '
        'é uma transportadora cobrando frete de nota cancelada.',
        '<b>Com CT-e</b>: o frete fica <b>retido</b> (faixa "NF CANCELADA" no kanban e aviso em Precisa de atenção) até alguém '
        'conferir — normalmente o frete deveria ir para a nota que substituiu a cancelada. Aprovação já feita por uma pessoa e '
        'frete faturado não são mexidos.',
    ])
    s += h2('Destaques de cor na lista')
    s += lista([
        '<b>Linha vermelha</b>: pedido cancelado no ERP (ESTATUS_PEDIDO = C).',
        '<b>Linha laranja</b>: nota fiscal cancelada (NF_CANCELADA = S), com observação.',
        '<b>Linha roxa</b>: nota fiscal devolvida (nota de retorno emitida).',
        '<b>Linha azul-clara</b>: remessa para feira/demonstração que já retornou.',
        '<b>Nota "refaturada"</b>: o número da nota no ERP (NR_NOTA) é diferente do número da NF (NR_NF).',
    ])
    s += h2('Valores que aparecem em todo o sistema')
    s += tabela(['Campo', 'O que é'], [
        ['Valor Frete Negociado / Vlr. CT-e', 'O que a transportadora cobrou no CT-e.'],
        ['Valor Frete Tabelado', 'Só o frete base calculado pela tabela (sem taxas).'],
        ['Valor Total Calculado', 'Frete base + Ad Valorem + GRIS + Pedágio + TDE + TDA + TRT + Despacho, pela tabela.'],
        ['Valor Total do Frete', 'Valor Total Calculado + Outras Despesas. Na Carga Direta, é o próprio valor '
         'negociado + Outras Despesas.'],
        ['Dif. Negociado × Tabela', 'Valor Total do Frete menos o Vlr. CT-e. Positivo: a tabela dá mais que o '
         'cobrado; negativo: a transportadora cobrou acima da tabela.'],
        ['% Frete', 'Quanto o frete representa do valor da nota fiscal.'],
    ], [0.32, 0.68])

    # 11
    s += h1('11. Visão geral')
    s.append(P('É a tela inicial. Mostra o retrato do momento e leva direto para o que precisa de ação — cada quadro é '
               'clicável e abre a tela certa (se o usuário tiver permissão para ela).'))
    s += h2('Fluxo do frete')
    s.append(P('Cinco quadros com a quantidade (e o valor) em cada etapa: Aguardando CT-e, Em conferência, Frete Retido, '
               'Liberado p/ Pagamento e Faturado.'))
    s += h2('Precisa de atenção')
    s.append(P('Só aparece o que tem alguma coisa pendente:'))
    s += lista([
        'Notas com CT-e de transportadoras diferentes.',
        'Pagamentos vencidos e pagamentos vencendo nos próximos 7 dias.',
        'Fretes retidos aguardando decisão.',
        'CT-e liberados ainda fora de fatura.',
        'Entregas atrasadas sem entrega registrada.',
        'Sinistros cuja data de cobrança chegou.',
        'CT-e sem valor pela tabela (falta tabela ativa ou o trecho da cidade).',
        'Meta de frete do mês acima de 90% ou estourada.',
    ])
    s += h2('Outros quadros')
    s += lista(['<b>Gasto com frete no mês</b>, comparado com a meta.',
                '<b>Transportadoras no mês</b>, pelo valor cobrado nos CT-e.',
                '<b>Últimos 6 meses</b>, a evolução do valor cobrado.'])
    s += h2('Notificações (sino)')
    s.append(P('O sino no topo junta avisos como: fretes retidos, pagamentos vencidos ou vencendo, meta perto de '
               'estourar, tabelas de preço vencidas ou vencendo em 30 dias, possíveis CT-e/NF-e duplicados, entregas '
               'atrasadas, entregas sem canhoto, CT-e sem tabela, ICMS diferente da rota, sinistros para cobrar e '
               'backup atrasado. Clicar num aviso leva à tela correspondente.'))

    # 12
    s += h1('12. Como os dados entram no sistema')
    s += h2('Enviar XML (manual)')
    s.append(P('Na tela <b>Enviar XML</b>:'))
    s += lista([
        'Arraste os arquivos para a área indicada, ou clique para selecionar. Aceita XML de NF-e, de CT-e e de eventos '
        '(cancelamento).',
        'Aceita também <b>arquivos .zip</b> — inclusive os que as transportadoras mandam com subpastas (CNPJ/xml/). '
        '<b>Não é preciso descompactar</b>: suba o .zip como veio.',
        '"Selecionar uma pasta inteira" importa todos os XML de uma pasta de uma vez.',
        'O "Número do pedido" é opcional: serve para forçar que NF-e e CT-e caiam no mesmo registro.',
        '<b>Retorno da SEFAZ</b> (o recibo que o ERP salva como "-ret.xml"): é reconhecido, mas não tem dados da nota, '
        'então não cria nada — só aparece como "Recibo da SEFAZ... nada a importar". Se a SEFAZ informar que a nota ou o '
        'CT-e foi cancelado ou denegado, o sistema anota isso nas observações do registro.',
    ])
    s += aviso('nota', 'O sistema importa sempre na ordem certa: primeiro as notas, depois os CT-e, depois os '
                       'cancelamentos. Um XML já importado antes (mesma chave de acesso) é recusado, sem duplicar.')
    s += h2('O que é lido da NF-e')
    s += lista([
        'Cliente, cidade, bairro, UF, volumes, peso, cubagem e chave de acesso.',
        '<b>Pedido</b> e <b>Pedido Mercus</b> (pedido do cliente): lidos do campo de informações complementares (infCpl).',
        '<b>Valor faturado</b>: lido do valor de pagamento (vPag).',
        '<b>Redespacho</b> e cidade do redespacho: lidos do texto "REDESPACHO:" nas informações complementares.',
    ])
    s += h2('O que é lido do CT-e')
    s += lista([
        'Transportadora (nome e CNPJ), número, data de emissão, valor da prestação e valor total.',
        'Componentes da prestação e taxas (GRIS, TDE, TDA, pedágio, TRT, ad valorem).',
        'Impostos: ICMS (base, alíquota, valor, CST), IBS e CBS.',
        'UF de início e fim da prestação (usadas para conferir a alíquota de ICMS).',
        'As notas que ele transporta. O vínculo CT-e » NF-e é automático, pela chave da nota ou pelo número dela.',
    ])
    s += aviso('dica', 'A transportadora que aparece num CT-e novo é cadastrada sozinha em Cadastros » '
                       'Transportadoras.')
    s += h2('Pasta monitorada de XML (automático)')
    s.append(P('Em <b>Manutenção » Pasta monitorada de XML</b>, aponte a pasta onde os XML chegam (a que o e-mail ou o ERP '
               'salva — pode ser uma pasta da rede). O sistema confere a pasta de tempos em tempos e importa sozinho os '
               'XML novos, soltos ou dentro de .zip. Opcionalmente, move cada arquivo para as subpastas "Importados" ou '
               '"Com erro". Cada arquivo é anotado pelo conteúdo, então nunca é importado duas vezes. "Importar agora" '
               'força uma conferência imediata.'))
    s += h2('Planilha do ERP (TIMELINE_PEDIDOS.xlsx)')
    s.append(P('Em <b>Enviar XML » Atualizar planilha do ERP</b>, suba a planilha exportada do ERP. Ela completa os campos '
               'que estiverem vazios nos registros — <b>nunca sobrescreve</b> o que veio do XML.'))
    s += tabela(['Coluna da planilha', 'Campo no sistema'], [
        ['NR_PEDIDO', 'Número do Pedido'],
        ['PEDIDO_CLIENTE', 'Pedido Mercus (só os números: "132237ANTECIPAD" vira 132237)'],
        ['NM_CLIENTE', 'Cliente'],
        ['NR_NF / NR_NOTA', 'Número da NF (quando diferentes, a nota é marcada como refaturada)'],
        ['FRETE_CIF_FOB', 'Frete CIF ou FOB (E = CIF, D = Destinatário/FOB)'],
        ['ESTATUS_PEDIDO', 'C = pedido cancelado (linha vermelha)'],
        ['NF_CANCELADA', 'S = nota cancelada (linha laranja + observação)'],
    ], [0.3, 0.7])
    s += aviso('importante', 'A planilha do ERP <b>não cria registros</b>. Uma linha da planilha sem nota no sistema fica '
                             'guardada, aguardando o XML da NF-e chegar; quando ele chega, os dados da planilha são '
                             'aplicados. Isso evita que pedidos antigos da planilha virem registros soltos. O botão '
                             '"Tirar da lista os registros que vieram só da planilha" limpa registros criados assim por '
                             'versões antigas.')
    s.append(P('A planilha também pode ser importada sozinha: veja "Importação automática da planilha do ERP" na seção 24.'))
    s += aviso('novo', 'A tabela acima é o <b>formato padrão</b>. A planilha de outro ERP, com outras colunas (ex.: "Nota '
                       'Fiscal", "Peso Bruto"), é lida por um <b>modelo de planilha</b>: veja a seção 54. Quando houver '
                       'modelos, a tela de envio mostra a escolha do modelo ao lado do botão. Aceita .xlsx, .xls e .csv.')
    s += h2('Devolução / troca de nota (e-mail)')
    s.append(P('Em <b>Enviar XML » Devolução / troca de nota</b>, cole o e-mail padrão de devolução. O sistema lê a NF original, '
               'a NF substituta, a nota de retorno, o pedido, o cliente, o motivo e onde está a mercadoria, mostra para conferir e, '
               'ao registrar:'))
    s += lista([
        '<b>NF original</b>: marcada como devolvida, ligada à substituta; sai das entregas a acompanhar. O frete dela continua na auditoria.',
        '<b>NF substituta</b>: ligada à original ("Substitui a NF X"), com a informação de que a mercadoria continua com o transportador, quando for o caso.',
        '<b>Nota de retorno</b> (nota de entrada): não gera frete a acompanhar. Se o XML dela for importado, não vira frete, e a '
        'devolução fica marcada como completa. Se chegar um <b>CT-e que cita a nota de retorno</b> (a mercadoria voltou), ele é '
        'ligado à NF original como <b>CT-e de devolução</b>, conferido pelo percentual de devolução da tabela.',
        'O que ainda não estiver no sistema é aplicado sozinho quando a nota for importada. As últimas registradas ficam na lista do quadro.',
        '<b>Nota refaturada</b>: quando a empresa emite uma nova nota com o <b>mesmo número de pedido</b> da devolvida, o sistema liga as '
        'duas sozinho e a nova recebe nas observações "Nota fiscal refaturada referente à NF X, que foi devolvida (nota de retorno Y)". '
        'Na lista, a nota devolvida aparece em <b>roxo</b>.',
        '<b>Cobrança em dobro</b>: a transportadora deve cobrar a entrega uma vez só — no CT-e da nota devolvida OU no da refaturada. '
        'Se as duas tiverem CT-e, o mais novo fica <b>retido</b> com a faixa "Possível cobrança em dobro" na Auditoria e aviso em '
        'Precisa de atenção, até alguém conferir e aprovar ou rejeitar.',
    ])
    s.append(P('Notas de <b>entrada</b> e de <b>devolução</b> (XML) não são mais importadas como frete de venda — antes elas '
               'ficavam "aguardando CT-e" para sempre. A <b>NF-e de devolução</b> emitida pela empresa já registra a devolução sozinha: '
               'o XML traz a nota de origem (chave referenciada) e o motivo, então a nota de origem fica marcada como devolvida (sai das '
               'entregas atrasadas) e o CT-e de devolução que citar a nota de devolução é ligado à nota de origem — sem precisar do e-mail.'))
    s += h2('NF-e complementar ou de ajuste')
    s.append(P('A NF-e <b>complementar</b> (ex.: "NFe COMPLEMENTAR ST") ou <b>de ajuste</b> só complementa imposto ou valor de outra nota '
               '— não tem mercadoria. Ela não vira frete, não entra em "Notas sem mapa", "Aguardando CT-e" nem entregas, e nunca se junta '
               'ao registro de outra nota (mesmo com o mesmo número de pedido). Na nota original entra a observação "NF-e complementar X … '
               'sem mercadoria, não gera frete".'))
    s += h2('Frete por conta do cliente')
    s.append(P('Nota de <b>venda</b> com frete por conta do <b>destinatário</b> (modalidade FOB, modFrete 1) e <b>sem transportadora '
               'informada</b> (o campo da transportadora vem vazio): o cliente é quem contrata a transportadora ou vem buscar. O registro '
               'mostra o selo <b>🧾 Frete por conta do cliente</b> na coluna Frete CIF/FOB, um aviso no topo ao abrir o registro e a '
               'observação "Frete por conta do cliente (FOB) — transportadora não informada na nota". Se a nota trouxer uma '
               'transportadora, segue o tratamento normal.'))
    s += h2('NF-e sem circulação de mercadoria')
    s.append(P('Notas que não têm transporte — destinatário com o <b>mesmo CNPJ</b> da empresa (ex.: "BAIXA DE ESTOQUE", CFOP 5927) ou '
               'só com CFOPs que não movimentam mercadoria (baixa de estoque, reclassificação, nota de cupom fiscal, transferência ou '
               'ressarcimento de crédito de ICMS) — não viram frete e ficam fora de "Aguardando CT-e", "Notas sem mapa" e entregas. '
               'Transferência para <b>outra filial</b> (CNPJ diferente) continua sendo frete normal.'))
    s += h2('Retorno de feira, exposição ou demonstração')
    s.append(P('A nota de <b>retorno de remessa</b> (entrada com CFOP 1913, 1914 ou 1916 — demonstração, feira/exposição, conserto — que '
               'cita a remessa de origem) é reconhecida sozinha: a remessa fica marcada como <b>retornou</b> (linha azul-clara, sai das '
               'entregas atrasadas) e o <b>CT-e da volta</b>, que cita a nota de retorno, é ligado à remessa como CT-e de <b>Retorno</b>.'))
    s += lista([
        'O valor esperado do CT-e da volta é o <b>% de retorno</b> da tabela de preço da transportadora sobre o CT-e da ida '
        '(campo "Retorno de feira / demonstração (%)": 100, 50... — vazio vale 100%).',
    ])
    s += h2('Mapa de carregamento')
    s.append(P('Em <b>Enviar XML » Importar mapa de carregamento</b>, suba a planilha do mapa (.xls ou .xlsx). Ligando pela nota fiscal '
               '(coluna "Nr. nota"), ela grava em cada frete: a <b>Data da Coleta</b> (pela "Dt. referência do mapa de carregamento" — a '
               'Data Prevista de Entrega é recalculada a partir dela), o <b>número</b> e a <b>descrição</b> do mapa e o <b>1º ajudante</b>. '
               'Notas que não estão no mapa são ignoradas. Esses dados alimentam o relatório de notas sem mapa de carregamento (seção 19).'))

    # 13
    s += h1('13. Vários CT-e para a mesma nota')
    s.append(P('Uma mesma nota pode ter mais de um CT-e. O primeiro que chega fica no registro da nota (o '
               '<b>principal</b>); cada CT-e que chega depois vira um registro ligado a ele, com os dados da nota '
               'copiados e um <b>tipo de vínculo</b>:'))
    s += tabela(['Tipo', 'Quando', 'Como é conferido'], [
        ['Complementar', 'CT-e complementar (tipo 1).', 'Sem valor esperado: vai para aprovação manual.'],
        ['Reentrega', 'Outro CT-e normal da <b>mesma</b> transportadora. É o caso mais comum.',
         'Esperado = um % do CT-e original (padrão 50%, configurável em Manutenção).'],
        ['Devolução', 'Igual à reentrega, com "DEVOLU" na observação do CT-e.', 'Mesmo % da reentrega.'],
        ['Reposição', 'Observação "REPOSIÇÃO": mercadoria enviada de novo (avaria/extravio).',
         'Frete cheio pela tabela. É ligado ao sinistro da mesma nota; se não houver sinistro, o sistema avisa.'],
        ['Redespacho da nota', 'CT-e da transportadora de <b>redespacho</b> (a 2ª perna da entrega). Reconhecido quando o '
         'CNPJ (ou o nome) dela bate com o "REDESPACHO:" da NF-e, ou quando o próprio CT-e se declara subcontratação ou '
         'redespacho. O CNPJ é o mais seguro: a nota pode trazer a razão social e o CT-e, o nome fantasia.',
         'Frete legítimo, <b>sem alerta</b>: pela tabela da transportadora do redespacho, da cidade do redespacho até o '
         'cliente. A 1ª transportadora continua calculada até a cidade do redespacho.'],
        ['Outra transportadora', 'CT-e de uma transportadora <b>diferente</b> na mesma nota, que não é o redespacho '
         'previsto.',
         'Pela tabela da transportadora dele. Fica <b>retido</b> com alerta vermelho até alguém definir quem levou '
         'a nota (seção 16).'],
        ['Substituto', 'CT-e de substituição (tipo 3).', 'Toma o lugar do CT-e original no registro principal.'],
        ['Anulação', 'CT-e de anulação (tipo 2).', 'Não cria registro: prende o principal como Frete Retido para '
         'revisão.'],
    ], [0.18, 0.37, 0.45])
    s += h2('CT-e cancelado')
    s.append(P('Quando chega o <b>evento de cancelamento</b> de um CT-e:'))
    s += lista([
        'CT-e a mais da nota (reentrega, outra transportadora...): vira Cancelado e sai das contas.',
        'CT-e principal: vai para o histórico da nota. Se já chegou outro CT-e para a mesma nota, ele assume o lugar; '
        'senão, a nota volta a "Aguardando CT-e" e o próximo CT-e entra no lugar.',
        'Se o CT-e já estava faturado, o sistema não reorganiza nada: só marca e avisa para conferir a fatura com a '
        'transportadora.',
    ])
    s += aviso('importante', 'Um CT-e cancelado <b>não pode fazer nada</b> no sistema: não pode ser alterado, aprovado, '
                             'faturado nem excluído. Fica só como histórico da nota.')
    s += h2('CT-e que chega antes da nota')
    s.append(P('Se o CT-e for importado antes da NF-e, ele fica numa linha própria, sem cliente. Quando a nota chega '
               '(pelo XML ou pela planilha), o sistema junta os dois sozinho: se a nota ainda não tinha CT-e, ele vai para '
               'a linha dela; se já tinha, vira um CT-e a mais da nota.'))
    s += h2('Quem paga cada CT-e (tomador)')
    s.append(P('O sistema lê do XML quem é o <b>tomador</b> de cada CT-e — quem paga aquele frete (remetente, destinatário, '
               'expedidor, recebedor ou um terceiro). Ele aparece na coluna "Quem paga" do Detalhe do Frete. Quando o tomador '
               'não é a empresa da nota, o CT-e a mais passa para o status <b>Não cobrado</b>: fica na lista da nota como '
               'histórico, sem alerta, fora do kanban e das contas de gasto. É o caso comum do redespacho "por conta do '
               'destino", pago pelo cliente. No CT-e principal, o sistema só mostra um aviso laranja no detalhe.'))
    s += h2('Onde ver os CT-e de uma nota')
    s += lista(['No <b>Detalhe do Frete</b> da Auditoria (lista "CT-e desta nota", com o total pago).',
                'Em <b>Relatórios » NF-e × CT-e</b>, que mostra cada nota com todos os CT-e vinculados.',
                'Nos cartões do kanban, com selos como "Reentrega do CT-e 1234 · NF 5678".'])

    # 14
    s += h1('14. Todos os registros')
    s.append(P('A lista completa de fretes, ordenada pelo número da NF, no estilo de uma planilha.'))
    s += h2('Encontrar registros')
    s += lista([
        '<b>Busca geral</b>: pedido, NF, CT-e, transportadora, redespacho ou cliente.',
        '<b>Filtro por período</b> da emissão da NF: ano, mês, semana, dia, últimos 7/30 dias ou período personalizado.',
        '<b>Filtro por coluna</b>, como no Excel, na linha logo abaixo do cabeçalho (que fica fixo ao rolar).',
        'Paginação de 100 linhas e modo <b>Tela cheia</b>.',
    ])
    s += h2('Editar um registro')
    s.append(P('Dê <b>dois cliques</b> no registro para abrir o formulário. Quem tem "Editar / lançar registros" pode corrigir campos. '
               'No formulário também ficam:'))
    s += lista([
        '<b>Carga Direta</b>: caminhão dedicado negociado direto. Não usa a tabela padrão — o valor negociado é o '
        'próprio valor do frete.',
        '<b>Fluxo de Aprovação</b>: situação da aprovação, quem aprovou e quando, motivo de rejeição.',
        '<b>Calcular Valor Frete Tabelado</b>: busca os trechos da transportadora, calcula e preenche. Se não calcular, '
        '"Por que não calculou?" diz exatamente qual passo falhou (sem tabela, sem cidade, sem trecho).',
        '<b>Buscar cidade por endereço</b>: busca de melhor esforço pela rua e número. Sempre confira antes de aplicar, '
        'porque o mesmo nome de rua existe em várias cidades.',
        '<b>Comprovante de Entrega</b>: nome de quem recebeu, data da entrega, assinatura (com o dedo ou o mouse) e foto '
        'da carga. A data da entrega entra no SLA (no prazo ou atrasado).',
        '<b>Excluir registro</b>: só para quem tem essa permissão. É permanente.',
        '<b>Excluir vários de uma vez</b>: marque as caixinhas ao lado do Número do Pedido (a do cabeçalho marca todos da página '
        'que está na tela) e clique em <b>Excluir selecionados</b>; para confirmar, digite EXCLUIR. Fretes já faturados e CT-e '
        'cancelados são pulados — o aviso no final diz quantos.',
    ])
    s += h2('Lançar um registro manual')
    s.append(P('"+ Lançar registro manual" abre o formulário vazio, para fretes que não têm XML.'))

    # 15
    s += h1('15. Tabelas de preço e o cálculo do frete')
    s.append(P('A tabela de preço é o que a transportadora negociou. É com ela que o sistema calcula quanto cada frete '
               'deveria custar. Fica em <b>Cadastros » Tabelas de Preço</b>.'))
    s += h2('Dados gerais da tabela')
    s += tabela(['Campo', 'Uso'], [
        ['Transportadora, UF, nome', 'Identificação. A busca aceita nome ou CNPJ.'],
        ['UF / Cidade Destino, Tipo de Frete', 'Abrangência da tabela.'],
        ['Prazo padrão (dias)', 'Usado no SLA quando o trecho não tem prazo próprio.'],
        ['Ad Valorem (%)', 'Percentual sobre o valor da nota.'],
        ['GRIS (%) e GRIS Mínimo (R$)', 'Percentual sobre o valor da nota, respeitando o mínimo.'],
        ['Pedágio', 'Valor por fração de 100 kg (arredonda para cima).'],
        ['TDE, TDA, TRT', 'Taxas fixas de dificuldade de entrega, de acesso e de restrição de trânsito.'],
        ['Despacho / CTRC', 'Valor fixo por CT-e emitido.'],
        ['Cubagem (kg por m³)', 'Fator do peso cubado (padrão 300).'],
        ['Devolução (%) e Reentrega (%)', 'Referência combinada com a transportadora.'],
        ['Validade (meses)', 'O sistema avisa quando a tabela está vencendo ou vencida.'],
        ['Descarga', 'Valor de descarga: por entrega, por volume, por kg ou por tonelada, com mínimo opcional. Cobrada em todos os '
         'clientes ou só nos da lista (CNPJ, raiz do CNPJ ou parte do nome, um por linha). Soma no total do frete.'],
        ['ICMS', 'Para quem cobra "tabela + ICMS": o ICMS é somado ao total. Alíquota: a da tabela; em branco, a do CT-e; sem CT-e, '
         'a da rota (7%/12% entre estados). Por dentro (padrão do CT-e: total ÷ (1 − alíquota)) ou por fora (total × alíquota).'],
        ['Seguradora, condição de faturamento, índice de correção', 'Informativos.'],
        ['Tabela ativa', 'Só tabelas ativas entram no cálculo.'],
    ], [0.38, 0.62])
    s += h2('Trechos (preço por destino)')
    s.append(P('Cada tabela tem trechos por destino, região e tipo de carga. Preencha as <b>cidades dessa praça</b> '
               '(separadas por vírgula, ou pelo seletor de cidades): é por elas que o sistema acha o trecho certo de cada '
               'frete. Algumas transportadoras organizam a capital por <b>bairro</b> — o sistema aceita bairro ou cidade. '
               'Os trechos também podem ser importados de uma planilha ("Importar via Excel").'))
    s += h3('Modo de cálculo por volume (padrão)')
    s += lista(['Volumes menor ou igual ao Volume Mínimo: cobra o <b>Frete Mínimo</b>.',
                'Volumes acima do mínimo: <b>Valor por Volume × quantidade de volumes</b>.'])
    s += h3('Modo de cálculo por peso')
    s += lista(['Peso considerado = o maior entre o peso real e o peso cubado (cubagem × fator).',
                'Até o Peso Mínimo: cobra o Valor Mínimo.',
                'Acima: Valor Mínimo + (peso considerado - peso mínimo) × R$/kg excedente.'])
    s += h2('Como o sistema acha a tabela e o trecho')
    s += passos([
        '<b>Transportadora</b>: pelo CNPJ do CT-e; se não houver tabela nesse CNPJ, pela raiz do CNPJ (outra filial da '
        'mesma empresa); só sem CNPJ usa o nome.',
        '<b>Cidade</b>: se a nota tem redespacho, usa a cidade do redespacho; senão, procura uma cidade cadastrada '
        'mencionada nas observações; senão, usa a cidade e o bairro do cliente.',
        '<b>Trecho</b>: o trecho que tem essa cidade (ou bairro) na lista de cidades.',
        '<b>Total</b>: frete base + Ad Valorem + GRIS + Pedágio + TDE + TDA + TRT + Despacho + Descarga; e, se a tabela '
        'mandar somar, o ICMS por cima de tudo.',
    ])
    s.append(P('O detalhe de cada cálculo (tabela, trecho, regra aplicada) fica guardado no registro e aparece no '
               'Detalhe do Frete.'))
    s += h2('Exportar e importar a tabela completa')
    s.append(P('Para usar a mesma tabela em outra empresa (outro Nexofrete) sem digitar tudo de novo: na lista de tabelas, '
               'clique no <b>⬇</b> ao lado do nome. Sai um Excel com duas abas — <b>Tabela</b> (dados gerais: transportadora e '
               'CNPJ, taxas, prazo, validade...) e <b>Trechos</b> (todos os trechos, com as cidades). Na outra empresa, use '
               '<b>⬆ Importar tabela</b> e escolha o arquivo.'))
    s += lista([
        'A importação sempre cria uma tabela <b>nova</b> — nunca sobrescreve uma existente. Se já houver uma com o mesmo nome '
        'na transportadora, a nova ganha "(importada dd/mm/aaaa)" no nome.',
        'A transportadora é achada pelo CNPJ (ou pelo nome). Se não existir, é cadastrada automaticamente.',
        'Dá para ajustar valores direto no Excel antes de importar (ex.: um reajuste). Só mantenha os nomes das abas e das colunas.',
    ])
    s += h2('Histórico e impressão')
    s.append(P('"Ver Histórico" mostra as versões anteriores de uma tabela (o que mudou e quando). "Imprimir / PDF" gera a '
               'tabela para enviar ou arquivar.'))
    s += aviso('dica', 'Depois de corrigir uma tabela ou cadastrar cidades novas nos trechos, use "Recalcular todos '
                       'agora" em Manutenção (seção 24) para refazer o cálculo dos fretes já existentes.')

    # 16
    s += h1('16. Auditoria de Frete')
    s.append(P('É a tela de trabalho da conferência: compara o que foi cobrado no CT-e com o que a tabela diz que deveria '
               'custar. No topo ficam os totais: registros comparados, pago a mais que a tabela, pago a menos e a '
               'diferença líquida. Dá para filtrar por transportadora, status (OK, divergente, carga direta) e buscar '
               'por CT-e, pedido ou cliente.'))
    s += h2('Conferência automática')
    s.append(P('Toda vez que um frete tem o valor do CT-e e o valor calculado, o sistema compara os dois:'))
    s += lista([
        '<b>Dentro da margem de tolerância</b> (seção 24): Liberado p/ Pagamento, aprovado por "Sistema (conferência '
        'automática)".',
        '<b>Fora da margem</b>: Frete Retido.',
        'Aprovação feita por uma pessoa, frete faturado e frete cancelado não são mexidos.',
        'Nota com CT-e de transportadoras diferentes, ainda sem decisão, <b>nunca é liberada sozinha</b>.',
    ])
    s += h2('O kanban')
    s += tabela(['Coluna', 'O que tem'], [
        ['Pendente de Conferência', 'CT-e recebido, sem conferência concluída.'],
        ['Frete Retido', 'Divergências e notas com transportadoras diferentes. Mostra o resumo da divergência.'],
        ['Liberado p/ Pagamento', 'Aprovados, aguardando fatura.'],
        ['Faturado', 'Já em fatura conferida.'],
    ], [0.32, 0.68])
    s.append(P('Cada cartão mostra pedido, CT-e, transportadora, valor negociado, valor calculado e diferença, além de '
               'selos: tipo de vínculo (reentrega, outra transportadora...), ICMS divergente, taxas divergentes, '
               'aprovado/rejeitado. Cartões com a <b>faixa vermelha</b> são de notas com transportadoras diferentes.'))
    s += h2('Decisões no cartão')
    s += lista([
        '<b>Aprovar</b>: libera o pagamento, com uma justificativa (o sistema já sugere um texto com as divergências).',
        '<b>Aprovar em lote</b>: marque as caixas dos cartões e use "Aprovar selecionados".',
        '<b>Glosa</b>: a transportadora aceitou descontar a diferença no boleto. Informe o valor e o motivo; o frete é '
        'liberado e o Financeiro já exporta o valor líquido.',
        '<b>Email</b>: manda o espelho do cálculo (valores e taxas) para o email da transportadora, para ela corrigir ou '
        'aceitar a glosa. Precisa do envio de email configurado.',
    ])
    s += aviso('nota', '<b>Limite de alçada</b>: se configurado, fretes acima desse valor só podem ser aprovados por quem '
                       'tem a permissão "Aprovar valores altos".')
    s += h2('Detalhe do Frete')
    s.append(P('O botão "Detalhe" do cartão abre a janela completa daquele frete:'))
    s += lista([
        '<b>Resumo</b>: cliente, transportadora deste CT-e, quem levou a nota (quando há transportadoras diferentes), '
        'rota, volumes e status (OK, DIVERGENTE, SEM CÁLCULO, CARGA DIRETA ou NÃO LEVOU).',
        '<b>CT-e desta nota</b>: todos os CT-e da nota, tipo, transportadora, valor cobrado, esperado, status e o total '
        'pago de frete na nota.',
        '<b>Como o sistema calculou</b>: tabela, trecho, regra aplicada e a conta feita.',
        '<b>Como a transportadora calculou</b>: componentes da prestação e impostos, lidos do XML do CT-e.',
        '<b>Conferência de taxas</b>: GRIS, TDE, TDA, TRT e pedágio cobrados × esperados pela tabela.',
        '<b>Rodapé</b>: valores e impostos do CT-e (base e alíquota de ICMS, ICMS, IBS, CBS, total com impostos).',
    ])
    s += h3('Recalcular pela tabela')
    s.append(P('O botão <b>Recalcular pela tabela</b> refaz o cálculo daquele frete ali mesmo e guarda o detalhe. Se não '
               'conseguir, mostra o motivo (sem tabela ativa, cidade não cadastrada no trecho...). Em reentrega, '
               'devolução e reposição, refaz o esperado a partir do CT-e principal. Frete faturado, cancelado, carga '
               'direta e CT-e complementar não são recalculados.'))
    s += h3('Conferência do ICMS')
    s.append(P('Em transporte entre estados, o sistema confere a alíquota de ICMS do CT-e pela rota (UF de início e fim '
               'do CT-e): <b>7%</b> quando sai do Sul/Sudeste (menos ES) para Norte, Nordeste, Centro-Oeste ou ES; '
               '<b>12%</b> nos demais casos. Dentro do mesmo estado não confere. Só CT-e com ICMS normal (CST 00 ou 20).'))

    s += h2('Transportadoras diferentes na mesma nota: quem levou?')
    s += aviso('novo', 'Recurso da versão 1.72.0.')
    s += aviso('nota', 'O CT-e da transportadora de <b>redespacho</b> previsto na nota não entra aqui: ele é a 2ª perna da '
                       'entrega, não uma cobrança duplicada (seção 13).')
    s.append(P('Duas transportadoras cobrando a mesma nota normalmente é erro: só uma delas levou a mercadoria. Esse '
               'caso aparece com muito destaque — faixa vermelha no cartão, alerta vermelho no Detalhe e na Visão '
               'geral — e os CT-e ficam retidos até alguém decidir.'))
    s += passos([
        'Abra o <b>Detalhe</b> de qualquer CT-e da nota.',
        'Na lista "CT-e desta nota", clique em <b>Foi esta que levou</b> na linha da transportadora que realmente levou '
        'a mercadoria. (Precisa da permissão "Aprovar pagamento".)',
        'Confirme.',
    ])
    s.append(P('O que acontece:'))
    s += lista([
        'Os CT-e da transportadora escolhida seguem a <b>conferência normal</b>, pela tabela dela: se bater, são '
        'liberados; se divergir, ficam retidos como qualquer outro.',
        'Os CT-e das outras ficam marcados <b>Não levou — não pagar</b>: são rejeitados, saem do "Total pago" da nota e '
        'não podem ser aprovados, nem receber glosa, nem entrar em aprovação em lote.',
        'O alerta vermelho vira uma faixa verde com quem levou, quem decidiu e quando. O topo do detalhe passa a mostrar '
        '"Quem levou a nota".',
        'Se o CT-e de quem não levou <b>já estava faturado</b>, ele não é mexido: o sistema avisa para cobrar o estorno '
        'da transportadora.',
        'A decisão fica no log de auditoria.',
    ])
    s += aviso('dica', 'Errou? Use <b>Trocar p/ esta</b> na linha da outra transportadora, ou <b>Desfazer</b> na faixa '
                       'verde para voltar ao alerta. Se depois chegar um CT-e novo de uma terceira transportadora, a '
                       'decisão é desfeita e o alerta volta; se for da transportadora que levou (uma reentrega), segue '
                       'normal.')

    s += h2('Exportar e imprimir')
    s.append(P('"Exportar CSV/Excel" e "Imprimir/PDF" geram a lista da auditoria com os filtros aplicados.'))

    # 17
    s += h1('17. Conferência de fatura da transportadora')
    s.append(P('Quando a fatura da transportadora chega, os CT-e dela são conferidos juntos. Fica no botão <b>Conferir '
               'Fatura</b> da Auditoria (precisa da permissão "Conferir fatura" e de "Ver todos os registros").'))
    s += passos([
        'Escolha a transportadora e preencha número, emissão, vencimento e valor da fatura.',
        'Marque os CT-e que estão na fatura. Dá para <b>colar a coluna de CT-e</b> da fatura e clicar em "Marcar esses '
        'CT-e", e filtrar para ver só os marcados.',
        'Confira a tabela: frete pela tabela, frete do CT-e, diferença e a situação de cada CT-e (conferido ou não).',
        'Clique em <b>Conferir e gerar documento</b>.',
    ])
    s += lista([
        'Os CT-e passam a <b>Faturado</b> e recebem o vencimento da fatura.',
        'O sistema guarda uma "foto" dos valores no momento da conferência e gera o documento para o Financeiro, com um '
        '<b>código de verificação</b>.',
        'Parecer: <b>Conferida</b> (todos os CT-e conferidos e o total bate com a fatura) ou <b>Conferida com '
        'ressalvas</b>. Glosas combinadas nos CT-e aparecem no documento, para conferir se foram descontadas.',
        'A aba "Faturas conferidas" lista o histórico. Só o administrador pode desfazer uma conferência.',
    ])

    # 18
    s += h1('18. Financeiro')
    s.append(P('Fretes liberados para pagamento, vencimentos e glosas.'))
    s += lista([
        '<b>Quadros</b>: total a pagar, vencendo em 7 dias, vencidos e aguardando resolução (retidos).',
        '<b>Meta de gasto com frete</b> do mês: defina o valor; a Visão geral e o sino avisam quando chega a 90% e quando '
        'estoura.',
        '<b>Lista de pagamentos</b>: vencimento, pedido, NF, CT-e, transportadora, dados bancários (banco, agência/conta, '
        'PIX), valor negociado, glosa e valor líquido.',
        '<b>Exportar p/ Financeiro</b>: planilha só com o essencial para pagar (transportadora, CNPJ, dados bancários, '
        'vencimento, valor líquido acordado) dos fretes liberados.',
        '<b>Glosas recentes</b>: as últimas glosas registradas.',
    ])
    s += aviso('dica', 'Os dados bancários vêm do cadastro da transportadora. Preencha-os em Cadastros » '
                       'Transportadoras para a exportação sair completa.')

    # 19
    s += h1('19. Relatórios')
    s.append(P('Ao clicar em <b>Relatórios</b> no menu da esquerda, abre um submenu logo abaixo, com uma tela para cada relatório: '
               'Gráficos, Entregas previstas, Notas sem mapa, Montar relatório (BI), Comparar cotações, Anomalias, Scorecard, '
               'NF-e × CT-e e Conferência de CT-e. Os gráficos podem ser maximizados ou minimizados, e a tela pode ser impressa.'))
    s += h2('Melhor transportadora para cada nota')
    s.append(P('Para cada nota que ainda não saiu (sem CT-e e sem entrega), calcula pelas tabelas de preço o frete de <b>todas</b> as '
               'transportadoras que atendem a cidade — com taxas, descarga e ICMS —, o prazo e o <b>% de entregas no prazo</b> de cada uma '
               '(histórico dos últimos 6 meses, por UF quando há entregas suficientes), e sugere a melhor.'))
    s += lista([
        '<b>Transportadora de redespacho cadastrada sozinha</b>: o CNPJ do redespacho que vem nas informações da NF-e é consultado '
        '(BrasilAPI) e a transportadora entra em Cadastros » Transportadoras com razão social, nome fantasia, endereço, cidade/UF, CEP, telefone e '
        'e-mail (selo "🔀 Redespacho"; filtro "Só as de redespacho"). A cidade até onde a transportadora contratada leva passa a vir '
        'desse cadastro — o texto da nota fica só como reserva (autônomo com CPF, CNPJ não encontrado). A consulta tenta a '
        'BrasilAPI, a CNPJ.ws e a ReceitaWS, nessa ordem; se todas falharem, tenta de novo em 10 minutos (até 5 vezes) e o motivo '
        'aparece no cadastro. O botão <b>🔄 Completar pelo CNPJ</b> (na edição da transportadora, ou na lista para todas as que estão '
        'sem cidade ou de redespacho sem nome fantasia) faz a busca na hora. O CNPJ é reconhecido com ou sem a palavra "CNPJ:" na frente '
        '(ex.: "REDESPACHO: FULANO - ME - 02.765.172/0002-62 - RUA ..."). Se o CNPJ que veio na nota estiver <b>digitado errado</b> (dígito verificador que não confere), '
        'o sistema avisa e sugere o certo: corrija no campo CNPJ e clique em Completar pelo CNPJ. As notas com o CNPJ errado continuam '
        'ligadas ao cadastro corrigido (pela raiz e filial), sem criar transportadora repetida.',
        '<b>Correção automática do CNPJ</b> (quando o da nota é inválido ou não existe na Receita), nesta ordem: (1) procura pela '
        '<b>razão social</b> nos CT-e já recebidos e no cadastro um CNPJ válido da <b>mesma filial</b> (dígitos 9 a 12 iguais); '
        '(2) testa o mesmo número com os dígitos verificadores corrigidos, aceitando só se a razão social conferir; (3) se só a '
        '<b>matriz</b> conferir, confirma a empresa mas <b>não preenche a cidade</b> e avisa para confirmar a filial. O sistema '
        'nunca troca de filial sozinho. Quando corrige, o CNPJ errado fica guardado como alternativo (as notas continuam ligadas) '
        'e a observação registra o que foi feito.',
        '<b>Cidade comparada</b> (coluna "Entrega até"): até onde a transportadora leva — a do <b>redespacho</b> quando a nota tem '
        'redespacho; a do <b>LOCAL DE ENTREGA</b> (ou outra cidade das tabelas) citada nas informações da nota; senão, a do cliente.',
        '<b>Critério</b>: mais barata; mais barata dentro do prazo (o da transportadora atual, ou um prazo máximo que você digita); ou mais rápida.',
        'Mostra a transportadora atual (a da nota), o valor dela, a sugerida e a <b>economia</b>. Clique numa nota para ver o ranking completo.',
        '<b>Já embarcadas</b>: compara as notas que já saíram com o valor real do CT-e — quanto teria economizado com a sugerida.',
        'Notas FOB / cliente retira ficam de fora (quem escolhe a transportadora é o cliente). Exporta para Excel.',
    ])
    s += h2('Consolidar rotas')
    s.append(P('Para decidir a rota e o caminhão <b>antes da nota fiscal</b>. Mostra os pedidos <b>liberados e ainda sem nota</b> (da '
               'planilha do ERP) agrupados pelo destino: a cidade do cliente ou, quando o pedido tem <b>redespacho</b>, a cidade do '
               'redespacho. Colunas: Cliente (NM_CLIENTE), Pedido (NR_PEDIDO), Nr. Mercus (PEDIDO_CLIENTE, só o número), Dt. Liberação '
               '(DT_PEDIDO_LIBERADO), Transportadora, Redespacho, Volumes (QTD_CAIXAS), Peso (PESO_KG) e m³ (CUBAGEM_M3).'))
    s += lista([
        'Os destinos já aparecem abertos ("1. São Paulo/SP — N pedidos…"). Marque os pedidos (clicando na caixinha ou em qualquer '
        'lugar da linha) ou o destino inteiro: o quadro <b>🚚 Carga montada</b>, fixo no topo, vai somando a cada clique os pedidos, '
        'volumes, <b>peso</b>, <b>m³</b> e o <b>caminhão indicado</b> — o menor que comporta o peso e o volume (capacidades em '
        '<b>⚙ Veículos</b>). Pedido sem m³ é avisado, e o caminhão passa a ser escolhido só pelo peso.',
        '<b>🖨 Imprimir / PDF</b> e <b>⬇ Excel</b>, no quadro do topo, saem só com os pedidos marcados, agrupados por destino.',
        '<b>Itens sem medida</b>: quando a coluna <b>ITENS_SEM_MEDIDA</b> da planilha é maior que zero, o pedido tem item sem cubagem — '
        'o m³ real é maior que o informado. O pedido mostra "⚠ N item(ns) sem medida", o destino conta quantos pedidos estão assim, '
        'aparece um alerta ao marcar e o quadro da carga e o romaneio avisam que o m³ pode ser maior. O valor é atualizado a cada '
        'importação da planilha (some quando o ERP medir os itens).',
        'Ficam de fora: pedidos FOB / frete por conta do cliente e cancelados. A opção "Incluir pedidos já faturados que ainda '
        'não saíram" traz também os que já têm nota e ainda não têm CT-e.',
    ])
    s += h2('Lançar entregas do WhatsApp')
    s.append(P('Para transportadoras que mandam a foto do comprovante num grupo do WhatsApp com o número da NF. Em <b>Relatórios » '
               'Entregas previstas</b>, botão <b>📋 Lançar entregas do WhatsApp</b>:'))
    s += passos([
        'No WhatsApp Web, abra o grupo, passe o mouse numa mensagem, clique na setinha ⌄ » <b>Selecionar mensagens</b> e marque as do dia.',
        'Copie com <b>Ctrl+C</b> — cada mensagem vem com a data, ex.: "[14:16, 06/10/2026] Fulano: 193233" — e cole no campo. Também '
        'serve o texto de "Exportar conversa" do celular ou uma lista de NF (com uma data para as linhas sem data).',
        'Clique em <b>Ler</b>: o sistema mostra cada NF encontrada com o cliente, a transportadora e a data da mensagem (dá para corrigir). '
        'Só valem números que existem como NF no sistema (pedidos e telefones são ignorados). Ficam desmarcadas as que já têm entrega, '
        'as canceladas e as com data antes da emissão.',
        'Clique em <b>Lançar as marcadas</b>: a data de entrega é gravada com a origem "whatsapp" — o "Refazer entregas automáticas" '
        'não apaga essas datas.',
    ])
    s += h2('Importar fotos dos comprovantes (canhotos)')
    s.append(P('Quando o grupo da transportadora só tem as fotos dos canhotos, na mesma janela (<b>📋 Lançar entregas do WhatsApp</b>), '
               'parte <b>📸 Importar fotos dos comprovantes</b>: baixe as fotos do dia no WhatsApp e arraste para a área (ou clique). Cada '
               'foto aparece com os campos <b>NF</b> e <b>Data do canhoto</b> (que vem com a data da foto, tirada do nome do arquivo do '
               'WhatsApp); ao digitar a NF aparecem o cliente e a transportadora. Clique na miniatura para ampliar e conferir a data no '
               'canhoto. <b>✅ Lançar entregas com as fotos</b> grava a data de entrega (origem "canhoto") e guarda a foto como o '
               'comprovante da nota.'))
    s.append(P('<b>Leitura gratuita do número da NF</b>: com o leitor de texto (Tesseract) instalado no servidor, o sistema lê sozinho o '
               '<b>número da NF impresso</b> no canhoto — mesmo com a foto deitada — e só aceita número que existe como NF no sistema. '
               'A data escrita à mão não é lida por ele: vem da data da foto, para conferir. Para instalar: no servidor, na pasta '
               '<b>backend</b>, rode <b>npm install</b> (uma vez); na primeira leitura ele baixa os dados do idioma (precisa de internet '
               'só nessa vez).'))
    s.append(P('<b>Leitura por IA (opcional)</b>: em Manutenção » <b>🤖 Leitura de comprovantes por IA</b>, informe uma chave da API da '
               'Anthropic (console.anthropic.com), ligue e teste. Com ela ligada, o sistema lê sozinho o número da NF e a data escrita à '
               'mão no canhoto e preenche os campos ("🤖 lido — confira"; "confira com atenção" quando a leitura é incerta). Precisa de '
               'internet e tem um custo pequeno por foto; a chave fica criptografada. O modelo é configurável.'))
    s += h2('Notas sem mapa de carregamento')
    s.append(P('Mostra as notas emitidas há mais dias do que o limite (padrão <b>3 dias corridos</b>, ajustável na própria tela) que '
               'ainda não entraram em nenhum mapa de carregamento — possivelmente paradas no estoque. Colunas: Nr. nota, emissão, dias '
               'parada, situação, Nr. pedido, cliente, volumes, Nr. mapa, Ds. mapa, data de referência, 1º ajudante e CT-e.'))
    s += lista([
        '<b>Situação</b>: <b>Sem mapa</b> (o caso comum); <b>Frete por conta do cliente</b> (venda FOB sem transportadora informada — '
        'cobrar a retirada do cliente; a mesma regra do selo 🧾 em Todos os registros); '
        '<b>CT-e emitido e sem mapa</b> (a transportadora gerou o CT-e com o XML da nota mas não veio coletar?).',
        'Não entram: notas canceladas, devolvidas, de entrada e já entregues.',
        'Filtros por situação, por período de emissão (<b>Emitidas de</b> … <b>até</b> …, com calendário em português — dá para '
        'digitar dd/mm/aaaa ou escolher no calendário) e busca por NF, pedido ou cliente; exporta para <b>Excel</b> e <b>PDF</b> '
        '(o PDF mostra o período escolhido).',
        'O prazo salvo vale também para o aviso no <b>sino</b>, em <b>Precisa de atenção</b> e no número ao lado do item no submenu.',
    ])
    s += h2('Gráficos')
    s += tabela(['Relatório', 'O que mostra'], [
        ['Entregas previstas', 'Fretes sem entrega registrada pela data prevista (coleta ou CT-e + prazo do trecho): '
         'atrasadas, hoje, próximos 7 dias. Com link de rastreamento da transportadora e exportação para Excel.'],
        ['% com tabela de preço', 'Quantos fretes já têm tabela cadastrada para a transportadora.'],
        ['Transportadoras que mais carrego', 'Top 10 por quantidade de fretes.'],
        ['Redespacho que mais entrego', 'Top 15 transportadoras de redespacho.'],
        ['Cidades onde entregaram', 'Top 15 cidades (a do redespacho quando houve).'],
        ['CIF: direto × redespacho', 'Por transportadora, em quantidade e valor, por mês.'],
        ['Sinistros e avarias', 'Por transportadora, por tipo, por mês e cobranças pendentes.'],
        ['Carga direta', 'Por transportadora, destinos e mês.'],
        ['% Frete médio', 'Por mês (12 meses) e por dia (30 dias).'],
        ['CIF × FOB', 'Em quantidade e em valor faturado.'],
        ['Status e retidos', 'Distribuição por status e frete retido por transportadora.'],
        ['Gasto e valor', 'Gasto por mês, transportadoras por valor, glosas recuperadas, entregas por UF.'],
        ['Cidades que mais faturamos', 'Faturamento por cidade do cliente, participação e frete pago.'],
        ['Custo de frete por cliente', 'Frete de todas as notas do cliente (com reentregas) sobre o que ele comprou.'],
        ['Reentregas e devoluções', 'Custo por transportadora e por cliente.'],
        ['SLA e atrasos', 'No prazo × atrasado, e atrasos por transportadora.'],
    ], [0.3, 0.7])
    s += h2('Rastreamento automático pela SSW')
    s.append(P('Muitas transportadoras (a FAST-X, por exemplo) usam o sistema SSW. Para elas, o Nexofrete consulta a '
               'própria SSW pela chave da NF-e — sem senha — e preenche sozinho a <b>data da entrega</b> e quem recebeu. '
               'Para ligar, marque <b>Rastreamento automático pela SSW</b> no cadastro da transportadora.'))
    s += lista([
        'A consulta roda <b>todo dia às 6h30</b> e também pelo botão <b>Buscar entregas na SSW</b>, em Entregas previstas '
        '(se uma transportadora estiver selecionada no filtro, só ela é consultada).',
        'A coluna <b>Última ocorrência</b> mostra o último evento (ex.: "Entrega agendada", "Saída para entrega"); '
        'clicando nela aparece o histórico completo.',
        '<b>Entrega agendada</b> pelo cliente (ex.: "ENTREGA AGENDADA P/ 27/08"): a <b>previsão passa a ser a data '
        'agendada</b>, e é por ela que o sistema mede se a entrega foi no prazo — a transportadora não tem como entregar '
        'antes. Só conta o agendamento registrado pela transportadora do CT-e.',
        'Ocorrência de problema (retida, recusa, avaria, destinatário ausente...) aparece em vermelho e gera aviso no sino.',
        '<b>Só vale a entrega da transportadora do CT-e</b> (a da tabela de preço). Na nota com redespacho, o que a '
        'transportadora do redespacho registra na SSW (entrega ao cliente, agendamento) aparece só como informação — '
        '"Redespacho (informativo)" na lista e em cinza no histórico — e não muda nenhuma data.',
        '<b>Refazer entregas automáticas</b> (botão em Entregas previstas): apaga só as datas de entrega que vieram da '
        'busca automática nos últimos 120 dias — mostrando antes quantas são — e busca de novo com as regras atuais. '
        'Datas lançadas à mão, pelo botão Entregue ou pelo comprovante de entrega, nunca são apagadas.',
        'Uma data de entrega lançada à mão nunca é substituída. Entregas vindas da SSW não entram no aviso de "entrega '
        'sem canhoto", porque o comprovante já foi registrado na SEFAZ pela transportadora.',
    ])
    s.append(P('<b>Descobrir quais usam SSW:</b> em Cadastros » Transportadoras, o botão <b>Descobrir quais usam SSW</b> testa '
               'uma nota recente de cada transportadora na SSW e liga o rastreamento automático nas que responderem.'))
    s += h2('Transportadoras que não usam SSW')
    s += lista([
        '<b>Comprovante de Entrega da SEFAZ</b>: quando a transportadora registra a entrega na SEFAZ, ela gera um XML de evento '
        '("Comprovante de Entrega do CT-e"). Importado pelo Enviar XML ou pela pasta monitorada, ele preenche a data da '
        'entrega e quem recebeu, e entra no histórico da nota. Peça às transportadoras para mandarem esses XML junto com '
        'os dos CT-e.',
        '<b>Portal próprio da transportadora</b> (hoje: Lonngren, usado pela Andrade e Abreu): no cadastro da '
        'transportadora, em <b>Portal de rastreamento</b>, cole o link de login, a empresa, o usuário e a senha, salve e '
        'clique em <b>Testar conexão</b>. O botão <b>Buscar entregas</b> e a busca das 6h30 passam a ler o portal: '
        'preenchem a data da entrega ("Entrega realizada"), a data da coleta (se estiver vazia) e o histórico. A senha '
        'fica criptografada no servidor e não aparece de novo na tela.',
        '<b>Central de Canhotos da LD Rio Pizzo</b>: no cadastro da transportadora, em <b>Portal de rastreamento</b>, '
        'escolha "Central de Canhotos (LD Rio Pizzo)" e informe o mesmo e-mail e senha usados no site da LD Rio. Salve e '
        'clique em <b>Testar conexão</b>: aparece quantas notas vieram do portal. A busca das 6h30 e o botão de rastreamento '
        'passam a preencher a Data da Entrega (origem "portal"), com quem recebeu e a situação da nota. Se o portal '
        'mudar o formato, o teste mostra as colunas que vieram, para o suporte ajustar.',
        '<b>EDI (OCOREN)</b>: arquivo de ocorrências de entrega no padrão PROCEDA — veja o documento de solicitação de '
        'integração EDI para enviar à transportadora.',
        '<b>Link de rastreamento</b>: no cadastro da transportadora, o endereço com {NF}, {CTE} ou {CHAVE_NFE} coloca o botão '
        'Rastrear na lista.',
        'Sem nenhuma dessas, a entrega é lançada pelo botão <b>Entregue</b> ou pelo comprovante de entrega do registro.',
    ])
    s += h2('Montar Relatório (BI)')
    s.append(P('Escolha os filtros (transportadora, status, período da NF) e os campos, veja a prévia e exporte para Excel.'))
    s += h2('Comparar Cotações e simulador')
    s.append(P('<b>Comparar</b>: informe cidade, volumes, peso, cubagem e valor da nota; o sistema calcula o frete em '
               '<b>todas</b> as transportadoras com tabela para essa cidade, do mais barato ao mais caro. <b>Simulador '
               '"E se eu tivesse trocado de transportadora?"</b>: recalcula o histórico de uma transportadora com a tabela '
               'de outra, para saber se vale a pena trocar.'))
    s += h2('Anomalias e duplicidades')
    s.append(P('<b>Fretes fora do padrão</b>: compara cada frete com a média da mesma transportadora e mostra os que '
               'ficaram mais de 2 desvios-padrão acima ou abaixo (só transportadoras com pelo menos 5 fretes). '
               '<b>Possíveis duplicidades</b>: o mesmo número de CT-e ou NF-e em mais de um registro.'))
    s += h2('Scorecard de transportadoras')
    s.append(P('Nota de 0 a 100 combinando % de entregas no prazo, % de fretes retidos por divergência e sinistros (só '
               'transportadoras com pelo menos 3 fretes).'))
    s += h2('NF-e × CT-e')
    s.append(P('Cada nota com todos os CT-e vinculados (principal, reentrega, outra transportadora...), valor da nota, '
               'soma dos fretes e situação.'))
    s += h2('Auditoria de Frete (relatório)')
    s.append(P('Conferência só de leitura, com filtro por período de emissão do CT-e, transportadora e busca. Aponta os '
               'problemas de cada frete, sem alterar nada:'))
    s += lista(['CT-e sem tabela de preço.', 'CT-e diferente do valor calculado (fora da tolerância).',
                'Transportadora da NF-e diferente da do CT-e.', 'CT-e cancelado.',
                'CT-e ou NF-e aparecendo mais de uma vez.', 'ICMS diferente do esperado pela rota.'])

    # 20
    s += h1('20. Sinistros e avarias')
    s.append(P('Registro de avaria, extravio, furto ou outro prejuízo com a carga, por transportadora.'))
    s += lista([
        'Informe nota fiscal, transportadora, tipo, data da ocorrência, valor do prejuízo, status (Aberto, Em '
        'Negociação, Resolvido) e descrição.',
        '<b>Cobrar a transportadora em</b>: +7, +15, +30 dias ou uma data. Você recebe um lembrete na véspera e no dia, '
        'na sua Agenda. O lembrete some sozinho quando o sinistro é resolvido ou ressarcido.',
        '<b>Ressarcimento</b>: valor e data. Os quadros do topo mostram total, em aberto, prejuízo e ressarcido.',
        'Um CT-e de reposição da mesma nota fica ligado ao sinistro.',
    ])
    s += aviso('nota', 'Para ver a tela precisa da permissão "Sinistros"; para registrar e editar, também de "Editar / '
                       'lançar registros".')

    # 21
    s += h1('21. Agenda e Mensagens')
    s += h2('Agenda')
    s += lista([
        'Calendário do mês, próximos eventos e avisos.',
        'Evento com título, data, horário (ou dia inteiro), local, descrição e cor.',
        '<b>Compartilhar com</b> outras pessoas do sistema; elas recebem o evento e o aviso.',
        '<b>Lembrete</b> para todos os participantes: 1 dia antes ou 1 hora antes. Os lembretes chegam em até 1 minuto.',
        'Os lembretes de cobrança de sinistro também aparecem aqui.',
    ])
    s += h2('Mensagens')
    s += lista([
        'Comunicação interna entre usuários, com caixa de recebidas e enviadas.',
        'Até 5 anexos por mensagem, de até 20 MB cada.',
        'O número no menu mostra as mensagens não lidas.',
    ])
    s += aviso('atencao', 'Os anexos ficam na pasta do sistema no servidor. Se o servidor for ligado a partir de outra '
                          'cópia da pasta, os anexos "somem" — mantenha sempre uma única pasta do sistema.')
    return s
