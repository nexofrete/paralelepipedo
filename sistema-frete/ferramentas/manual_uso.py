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
    s += h2('Atualização automática')
    s.append(P('Com a Visão geral aberta, os quadros do fluxo, o "Precisa de atenção", o gasto do mês, os gráficos e o '
               'Faturamento do dia são atualizados sozinhos. Abaixo do campo Consultar nota, escolha <b>Atualizar a cada</b> 1, 2, '
               '5 (padrão), 10 ou 15 minutos, ou Desligado; a escolha fica guardada no navegador de cada usuário. Ao lado aparece '
               '"atualizado às HH:MM", e o botão com a seta circular atualiza na hora. Com a aba do navegador escondida, não '
               'atualiza; ao voltar para ela depois do tempo escolhido, atualiza na hora.'))
    s += h2('Consultar nota')
    s.append(P('No alto da tela, o campo <b>Consultar nota</b> procura a nota sem sair da Visão geral: digite o número da NF, a '
               'chave de acesso, o número do CT-e, o pedido, o cliente ou a transportadora. Aparecem na hora as 8 notas mais '
               'recentes que batem, de qualquer data, com o cliente e a cidade, a transportadora e o CT-e e a situação da entrega '
               '(entregue com a data, atrasada, em trânsito ou aguardando CT-e). Um clique abre a nota completa, com o DANFE, o XML, '
               'o histórico de rastreamento e o registro do frete. <b>Enter</b> (ou "Abrir na Consulta de notas") leva para a '
               'Consulta de notas (403) já com a busca, em todas as datas. Esc fecha a lista.'))
    s += h2('Faturamento do dia')
    s.append(P('Logo abaixo do fluxo do frete, o quadro <b>Faturamento do dia</b> mostra as NF-e de <b>venda</b> emitidas na '
               'data, com a <b>bonificação</b> à parte (pela data de emissão; notas canceladas e denegadas não contam). O número '
               'grande, a comparação, a média por pedido, os 5 estados e o gráfico dos 14 dias usam só as notas de venda. Abre no dia '
               'de hoje; as setas e o campo de data mudam o dia. O dia que está na tela é recalculado sozinho: logo depois de '
               'importar XML (Enviar XML ou os botões da Consulta de notas), sempre que você volta para a Visão geral e a cada '
               '2 minutos com a tela aberta (para as notas que entram pela pasta, NF-Stock ou e-mail).'))
    s.append(P('A operação de cada nota sai do <b>CFOP dos itens</b> no XML: <b>venda</b> = CFOP de venda (5101 a 5125 e 6101 a '
               '6125, com substituição tributária 5401 a 5405 e 6401 a 6405, combustíveis 5651 a 5656 e 5667, exportação 7101, 7102, '
               '7105, 7106 e 7127); <b>bonificação</b> = 5910 ou 6910 (remessa em bonificação, doação ou brinde) ou, sem CFOP de '
               'venda, a natureza da operação com "bonificação" (há quem use 5949). Nota com itens de venda e de bonificação conta '
               'como venda. Ficam de fora remessas, transferências, devoluções, consertos, demonstrações e notas de entrada. As notas '
               'sem XML (que entraram pela planilha do ERP) também ficam de fora, porque não têm o CFOP. Embaixo do quadro, a linha '
               '"Não entraram na soma" diz quantas ficaram de fora no dia; clique para ver quais. Nas notas que já estavam no '
               'sistema, a natureza e o CFOP são lidos do XML guardado quando o sistema liga.'))
    s += lista([
        'O quadro tem três cartões: o resumo do dia, os estados e clientes, e os últimos 14 dias. No resumo, em destaque, o '
        '<b>Total das notas de venda</b> do dia (soma do valor total das NF-e de venda), com a comparação com o mesmo dia da '
        'semana anterior numa etiqueta verde (subiu) ou vermelha (caiu), vendas com vendas; os números de notas emitidas, '
        'clientes, <b>média por pedido</b> (vendas divididas pelo número de notas de venda) e peso; e a barra <b>Venda + '
        'bonificação</b>, com o total e a parte de cada uma (valor e notas). "Ver as notas do dia" abre a Consulta de notas com essas notas.',
        '<b>Os 5 estados que mais compraram</b>: pela UF do destinatário, com o valor, a parte do dia (%) e o número de notas; '
        'os demais estados aparecem somados numa linha. Clique num estado para ver as notas dele naquele dia.',
        '<b>Os 3 maiores clientes do dia</b> (só venda), com medalha de ouro, prata e bronze: nome, cidade/UF, valor, a parte do '
        'dia (%) e o número de notas. As filiais do mesmo cliente (CNPJ com a mesma raiz de 8 dígitos) contam juntas. Clique '
        'num cliente para ver as notas dele no dia. Os 3 aparecem também na imagem e no texto para o WhatsApp.',
        '<b>Conferir com o ERP</b>: no ERP, abra a lista das notas do dia, selecione as linhas e copie (Ctrl+C); no '
        'quadro, clique em <b>Conferir com o ERP</b>, cole (Ctrl+V) e clique em Conferir. Em cada linha o sistema pega o '
        'número da nota e o valor, e mostra o total do ERP, o do sistema e a diferença, e nota por nota: confere; falta no '
        'sistema (com o botão Enviar o XML); está no sistema mas fora da soma (e o motivo: outra operação pelo CFOP, sem '
        'XML, cancelada, guardada dentro de outro registro); está com outra data de emissão; valor diferente; ou conta no '
        'sistema mas não está na lista colada.',
        '<b>Imagem para o WhatsApp</b>: o botão <b>Imagem</b> (ao lado das datas) gera um PNG em pé, com fundo claro e letras '
        'grandes para ler no celular: logo e nome da empresa, dia, total, comparação com a semana anterior, notas, clientes, '
        'média por pedido, peso, venda e bonificação, os 5 estados e os últimos 14 dias; no rodapé, "gerado pelo" e a marca Nexofrete. Na janela: <b>Copiar imagem</b> e colar '
        '(Ctrl+V) na conversa do WhatsApp Web ou do computador; <b>Compartilhar</b> (no celular e no Windows) e escolher o '
        'WhatsApp; ou <b>Baixar PNG</b> e anexar na conversa. Copiar só aparece quando o sistema é aberto por https ou no '
        'próprio computador do servidor (regra do navegador); senão use Baixar. <b>Copiar texto</b> copia a mensagem pronta '
        'para mandar junto com a imagem (saudação, total, venda e bonificação, comparação com a semana anterior e com a média '
        'dos 14 dias, notas, clientes, média por pedido, peso, os 5 estados e os destaques do dia), com os negritos do '
        'WhatsApp; o texto aparece em "Texto da mensagem" e dá para ajustar antes de copiar. No dia de hoje, o texto avisa '
        '"parcial até as HHhMM". Em Compartilhar, a imagem vai com o texto como legenda.',
        '<b>Últimos 14 dias</b>: uma linha por dia, com o mais recente em cima: o dia, uma barra deitada e o valor exato das '
        'vendas (ex.: R$ 707.776,00) com o número de notas. O dia escolhido fica em destaque; dia sem nota aparece numa linha '
        'fina "sem notas"; a linha tracejada vertical é a média dos dias com nota. Passe o mouse para ver a média por pedido do '
        'dia; clique numa linha para ver aquele dia. A imagem para o WhatsApp usa o mesmo formato.',
    ])
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
        '<b>NF-e que já está no sistema</b>: enviar o XML de novo não duplica a nota. O sistema completa o registro com o '
        'XML (guarda o XML se ele faltava, corrige o número, a data de emissão, a série e o emitente pelo XML, preenche '
        'cliente, UF, valor e a operação pelo CFOP) e diz onde a nota está ("registro #, NF e data") e, se for o caso, por que '
        'ela não aparece: cancelada ou denegada. Nota que tinha ficado guardada como "CT-e a mais" dentro de outro registro '
        '(erro corrigido na 1.73.0) volta a ser um registro próprio, com o CT-e dela; se for a mesma nota do registro, a NF-e '
        'passa para ele. O sistema também faz essa correção sozinho, em todas as notas, quando o servidor liga. Use isso quando uma nota que está no '
        'ERP não aparece na Consulta de notas ou no Faturamento do dia (por exemplo, nota que entrou pela planilha do ERP com '
        'outra data).',
        '<b>Mesmo pedido em mais de uma nota</b> (refaturamento por troca de tabela de preço, pedido dividido): cada NF-e '
        'fica no seu próprio registro, e as duas ganham a observação "Mesmo pedido X da NF Y". A nota só se junta a um '
        'registro do mesmo pedido que ainda não tem NF-e (criado pelo CT-e, pela planilha do ERP ou lançado à mão). Até a '
        'versão 1.73.0, a nota importada depois era gravada por cima da anterior, e a anterior sumia da lista. A Consulta '
        'de notas (403) mostra um aviso com as notas que sumiram assim, com o botão "Enviar os XML" para trazê-las de volta.',
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
    s += h2('CT-e direto da SEFAZ (automático)')
    s.append(P('Com o certificado digital A1 cadastrado, os CT-e em que a empresa aparece podem vir direto da SEFAZ, sem '
               'depender da transportadora mandar o XML: veja "CT-e na SEFAZ" no capítulo 14 (CT-e recebidos, código 404).'))
    s += h2('NF-Stock da Alterdata (automático)')
    s.append(P('Se a empresa usa o NF-Stock da Alterdata, os XML guardados lá (NF-e, CT-e e eventos) podem entrar sozinhos: veja '
               '"NF-Stock (Alterdata)" no capítulo 53 (Manutenção » Integrações, código 904).'))
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
        ['NR_MAPA_CARREGAMENTO', 'Número do mapa de carregamento'],
        ['DS_MAPA_CARREGAMENTO', 'Descrição do mapa'],
        ['DT_REFERENCIA_MAPA', 'Data de referência do mapa: vira a <b>Data da Coleta</b> (a Data Prevista de Entrega é recalculada)'],
        ['AJUDANTE_1_MAPA', '1º ajudante do mapa'],
        ['TRANSPORTADORA_MAPA', 'Transportadora que <b>de fato coletou</b> (nome e CNPJ): passa a ser a transportadora da nota'],
    ], [0.3, 0.7])
    s.append(P('Os campos do <b>mapa de carregamento</b> são os únicos que a planilha atualiza mesmo já preenchidos: vale sempre o '
               'mapa da planilha mais nova, porque o pedido pode mudar de mapa. Coluna de mapa vazia não apaga o que já estava gravado.'))
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
    s.append(P('O mapa de carregamento vem na própria <b>planilha do ERP (Timeline de pedidos)</b>, nas colunas NR_MAPA_CARREGAMENTO, '
               'DS_MAPA_CARREGAMENTO, DT_REFERENCIA_MAPA e AJUDANTE_1_MAPA (veja "Planilha do ERP" acima): não existe mais a importação '
               'separada do relatório do mapa. Cada frete recebe a <b>Data da Coleta</b> (pela data de referência do mapa; a Data Prevista '
               'de Entrega é recalculada a partir dela), o <b>número</b> e a <b>descrição</b> do mapa e o <b>1º ajudante</b>. Esses dados '
               'alimentam o relatório de notas sem mapa de carregamento (seção 19).'))
    s += h2('Transportadora que coletou (TRANSPORTADORA_MAPA)')
    s.append(P('A transportadora do mapa é quem de fato coletou a mercadoria na empresa, e vale mais que a que está na nota fiscal:'))
    s += lista([
        '<b>Vira a transportadora da nota</b> quando é outra empresa (pelo CNPJ que vem junto do nome; o nome usado é o do cadastro '
        'de transportadoras). A da NF-e continua guardada e aparece no relatório 106. Se for a mesma empresa escrita de outro '
        'jeito ("TRAS LTDA" x "TRANSPORTES LTDA"), nada muda.',
        '<b>Previsão de entrega pela transportadora que coletou</b>: com a Data da Coleta do mapa e o prazo da tabela de preço '
        'dela, a nota já ganha a Data Prevista de Entrega antes do CT-e. Se o CT-e vier de <b>outra</b> transportadora, o frete '
        'continua conferido pelo CT-e, mas o prazo segue o de quem coletou. CT-e da mesma transportadora: vale o cálculo do CT-e.',
        '<b>Entregas a acompanhar</b> mostra a transportadora que coletou, com a linha "coletou (mapa)" e, se o CT-e for de '
        'outra, "CT-e: nome". O Conferir no portal (Central de Canhotos da LD Rio) também procura as notas que ela coletou.',
        '<b>Sem tabela: carga direta?</b> Quando a transportadora que coletou não tem tabela de preço para o destino (caso típico '
        'de carga direta), a nota ganha esse aviso em Entregas a acompanhar e no relatório 106. O sistema <b>não marca</b> nada '
        'sozinho e o prazo continua o do CT-e: se foi carga direta, marque <b>Carga Direta</b> no registro e o aviso some.',
        '<b>Comparação com o CT-e</b>: CT-e de outra transportadora que não a do mapa aparece em NF-e x CT-e, inconsistências, como '
        '"Transportadora do mapa x CT-e diferente", e no relatório <b>106 · Transportadora do mapa x NF-e x CT-e</b>.',
        'Na exportação atual do ERP as colunas do fim vêm deslocadas uma casa (a transportadora em DS_MAPA_CARREGAMENTO, o '
        'ajudante em TRANSPORTADORA_MAPA e a data de saída em AJUDANTE_1_MAPA). O sistema reconhece isso pelo conteúdo e lê '
        'cada dado no lugar certo; quando o ERP for corrigido, continua funcionando.',
    ])

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
                'Em <b>Documentos » NF-e × CT-e » Notas e seus CT-e</b> (320), que mostra cada nota com todos os CT-e vinculados.',
                'Nos cartões do kanban, com selos como "Reentrega do CT-e 1234 · NF 5678".'])
    s += h2('Um CT-e para várias notas')
    s.append(P('Quando o CT-e leva várias notas (cita várias chaves de NF-e), ele é ligado a <b>todas</b>: fica no registro '
               'de uma delas e as outras ficam "cobertas" por ele, com o número do CT-e. Nenhuma dessas notas fica como '
               '"aguardando CT-e". O frete é <b>dividido entre as notas</b> pelo peso (sem peso, pelo valor da nota; sem os '
               'dois, em partes iguais) e a parte de cada nota aparece em Fretes contratados » Notas e seus CT-e e na pesquisa. A '
               'conferência pela tabela usa a soma do peso, dos volumes, da cubagem e do valor de todas as notas do CT-e. '
               'A data de entrega lançada no CT-e vale para todas as notas dele. Se a nota chegar depois do CT-e, ela é '
               'ligada sozinha na importação seguinte.'))

    # 14
    s += h1('14. Todos os registros e Consulta de notas')
    s += aviso('nota', 'A tela <b>Todos os registros (402)</b> saiu do menu: a consulta do dia a dia passou a ser a <b>Consulta de '
                       'notas (403)</b>, descrita mais abaixo neste capítulo, que mostra também o CT-e, a transportadora e se a nota foi entregue. '
                       'Lançar registro manual, excluir e editar o registro do frete (dois cliques na nota » Abrir o registro do frete) '
                       'estão lá. Por um tempo, a tela antiga ainda abre pelo <b>Ctrl+K 402</b>.')
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

    s += h2('Endereço de entrega e redespacho')
    s.append(P('Ao importar a NF-e, o sistema procura o endereço de entrega nesta ordem:'))
    s += tabela(['Ordem', 'Onde', 'Para que serve'], [
        ['1', 'REDESPACHO: escrito nos dados adicionais', 'É para lá que a transportadora contratada leva a carga. A cidade do redespacho é a usada no cálculo do frete.'],
        ['2', 'Grupo &lt;entrega&gt; do XML', 'Local de entrega diferente do destinatário, já com os campos separados (o mais confiável).'],
        ['3', 'LOCAL DE ENTREGA, ENDEREÇO DE ENTREGA, ENTREGAR EM... nos dados adicionais', 'Quando a nota não tem o grupo &lt;entrega&gt;.'],
        ['4', 'Endereço do destinatário', 'Quando não há nada acima.'],
    ], [0.1, 0.4, 0.5])
    s += lista([
        'Do texto livre, o sistema separa nome, CNPJ, inscrição estadual, rua e número, complemento, bairro, cidade, UF e CEP. A cidade '
        'é conferida na lista oficial de municípios do IBGE (também quando a nota não traz a UF e a cidade só existe num estado). '
        '"ENTREGA EM 10/11" e frases assim não são confundidas com endereço.',
        'Quando a leitura não tem certeza (cidade que não está no IBGE ou sem rua), a nota fica com <b>⚠ conferir</b> e o motivo. '
        'O número de notas a conferir aparece no alto da tela; clique nele para ver só essas. A rua é reconhecida pelo tipo '
        '(RUA, AV, ROD, ESTRADA, TRAVESSA, PRAÇA, LARGO, VIELA...) e pelas abreviações dos Correios (VLA, TRV, LGO, PRC, R ou R., AL.); '
        'quando o número vem colado no nome ("AV ANTONIO CARLOS 200" ou "N 4550"), ele vira o número do endereço; rótulos '
        'grudados na palavra de antes ("VILA SAO RAFAELMUNICIPIO:GUARULHOS") também são separados, e barracão, asa e módulo '
        '("BRCAO ASA 1 MODULO 58") vão para o complemento. O hífen colado faz parte do nome da rua ("ESTRADA PIMENTAS-SAO '
        'MIGUEL"); com espaços (" - ") ele separa as partes do endereço.',
        '<b>Redespacho só com nome e CNPJ</b> (a nota não traz o endereço): o endereço é completado com o cadastro da transportadora, '
        'que o sistema busca sozinho pelo CNPJ (rua, número, bairro, cidade, UF e CEP). No detalhe aparece "endereço completado pelo '
        'cadastro do CNPJ". Se o cadastro ainda não existir, o endereço entra assim que a consulta do CNPJ terminar.',
        'Quebras de linha nos dados adicionais (inclusive as gravadas como o texto "\\n" por alguns ERPs) separam as partes do endereço.',
        'Separadores "pela metade" ("1013-JARDIM PRESIDENTE DUTRA -GUARULHOS ,SP") também são entendidos, e também o endereço '
        'sem separador nenhum depois do número ("RUA DR. MIGUEL PAULO CAPALBO, 30 PARI SAO PAULO CNPJ: ... TEL. ..."): a cidade '
        'é achada antes do CNPJ e do telefone, e o bairro é o que fica entre o número e a cidade. CNPJ com dígito errado na nota '
        'não é usado. Quando a nota não traz o CEP, '
        'ele vem do cadastro da transportadora do redespacho, se a cidade do cadastro for a mesma.',
        '<b>Sem a cidade no texto</b> ("Rua X, 174, Bairro Cocota - CEP 21921025"): a cidade sai do <b>CEP</b>, na hora para as '
        'capitais (pela faixa de CEP dos Correios) e, para as outras cidades, por uma consulta do CEP na BrasilAPI (guardada para não '
        'consultar de novo). No detalhe aparece "cidade achada pelo CEP". A palavra "Bairro" na frente do nome do bairro é tirada, e '
        'avisos depois do endereço ("CASO NAO RECEBA... BOLETOS NO WHATSAPP") não entram no endereço.',
        '<b>Releitura</b>: sempre que as regras de leitura melhoram, as notas com "conferir" lidas pela versão anterior são lidas de '
        'novo sozinhas quando o servidor é reiniciado depois da atualização (as corrigidas à mão não mudam).',
        'Em <b>Abrir</b>, cada endereço mostra a origem, o texto da nota de onde foi lido e o botão <b>Corrigir</b> (quem pode editar '
        'registros). A cidade corrigida é conferida no IBGE; no redespacho, ela vira também a Cidade do Redespacho do cálculo: se mudou, '
        'use Recalcular no registro. Endereço corrigido à mão não é mais trocado pela leitura automática.',
        'As notas que já estavam no sistema são lidas de novo, a partir do XML guardado, quando o sistema liga.',
        'No Montar relatório (BI) há os campos Endereço de entrega, Endereço do redespacho, Origem do endereço e Endereço a conferir.',
    ])
    s += h2('Consulta de notas (403)')
    s.append(P('Em <b>Documentos » Notas fiscais</b>, as NF-e importadas com todos os dados da nota: número e série, chave de '
               'acesso, emitente (nome e CNPJ), destinatário, valor dos produtos e total da nota, peso bruto e peso líquido, '
               'volumes, data de emissão, data e hora de saída, endereço de entrega (o local de entrega, quando a nota informa '
               'um diferente do destinatário) e a situação: autorizada, cancelada ou denegada. Esses dados são lidos do XML na '
               'importação; nas notas que já estavam no sistema, são lidos do XML guardado quando o sistema liga.'))
    s += lista([
        '<b>Filtros</b> em duas linhas: na 1ª, Buscar (número, chave, CT-e, pedido, cliente ou transportadora), Transportadora, '
        'Entrega e Situação da NF-e (autorizada, cancelada, denegada, sem CT-e); na 2ª, o Período (pela emissão ou pela saída) e '
        'a Ordem. Os filtros menos usados (emitente, destinatário, série, cidade, UF e endereço de entrega) ficam em <b>Mais '
        'filtros</b>, que abre ao clicar. Abaixo, uma faixa de quadros compactos com Entregues, Não entregues, Atrasadas, total '
        'de notas, valor, peso e volumes, canceladas e denegadas, Endereço a conferir e Faltando na sequência.',
        '<b>Operação (pelo CFOP)</b>, em Mais filtros: venda e bonificação, só venda, só bonificação, outras (remessa, '
        'transferência, devolução...) ou sem XML. O detalhe da nota mostra a natureza da operação e os CFOP.',
        '<b>Entrega</b> (coluna): para onde a transportadora leva a nota e de onde veio o endereço. Filtro <b>Endereço de entrega</b>: '
        'a conferir, com redespacho, local de entrega diferente ou corrigidos à mão.',
        '<b>Ordem</b>: a lista abre na <b>sequência das notas</b> (por emitente, série e número; a escolha fica guardada). '
        'Nessa ordem, quando falta um número entre duas notas do mesmo emitente e série, aparece uma linha amarela "Falta a nota '
        'X" ou "Faltam N notas: X a Y" (a nota não entrou no sistema ou foi inutilizada), e o quadro <b>Faltando na sequência</b> '
        'mostra o total. Na própria linha amarela, o botão <b>Enviar o XML</b> (para quem pode enviar XML) abre a escolha do '
        'arquivo: escolha o XML da nota que falta (ou um .zip com os XML) e ela é importada ali mesmo, como no Enviar XML; a '
        'linha amarela some quando a nota entra. Notas que o sistema pula de propósito (baixa de estoque, complementar, '
        'entrada ou devolução, exportação) ficam guardadas com o motivo: na sequência elas aparecem numa linha cinza ("NF X '
        'não entra como frete: baixa de estoque...") e não contam como faltando. A janela mostra a resposta para cada arquivo: importada, já estava no '
        'sistema (e o que foi completado com o XML) ou o erro. A série "001" e a série "1" contam como a mesma. Se a nota sumiu porque outra nota do mesmo pedido foi gravada por cima dela '
        '(erro corrigido na 1.73.0), o aviso laranja no alto da Consulta lista essas notas, diz qual nota ficou no lugar e '
        'se há um CT-e no registro para conferir de qual das duas notas ele é. Saltos de mais de 500 números não contam (outra faixa de numeração). Dá para mudar para "maior número '
        'primeiro" ou "mais recentes primeiro".',
        '<b>Etiquetas de volume</b> (10 x 7 cm, no padrão do ERP): marque as notas e clique em <b>Etiquetas</b> (ou use o '
        'botão Etiquetas no detalhe da nota). Sai uma etiqueta por volume, em quadros: no alto o logo da empresa (o do '
        'cadastro da Empresa, quando ela é a remetente da nota), o <b>Remetente</b> (nome, endereço e CEP), o <b>Pedido</b>, a '
        '<b>NF-e</b> e o <b>Volume</b> ("1 de 68"); no meio o <b>Destinatário</b> em letra grande e o <b>Endereço de entrega</b> '
        '(rua, número, complemento e bairro; cidade - UF | CEP); embaixo a <b>Transportadora</b>, o <b>Peso Líquido</b> e o '
        '<b>Peso Bruto</b> (somados dos volumes do XML ou, sem XML, os da nota). Na coluna "Imprimir" dá para '
        'escolher só alguns volumes (ex.: 1-5,8). <b>Imprimir</b> abre as etiquetas no navegador (na Zebra, papel 100 x 70 mm, '
        'margens nenhuma e escala 100%); <b>Baixar ZPL</b> gera o arquivo da Zebra; com a Zebra na rede, o administrador '
        'cadastra o IP em <b>Impressora</b> (porta 9100, 203 ou 300 dpi, com etiqueta de teste) e aparece <b>Enviar para a '
        'Zebra</b>, que imprime direto. Os dados saem do XML da NF-e. A coluna <b>Transportadora</b> da janela vem preenchida '
        'com a da nota (XML), ou a do CT-e, ou o redespacho escrito na nota ("REDESP. ..."); se estiver vazia ou errada, digite '
        'antes de imprimir: vale para todas as etiquetas daquela nota.',
        '<b>Páginas</b>: a lista mostra 1000 notas por vez, com "Notas 2.001 a 2.500 de 2.500" e os botões Primeira, Anterior, '
        'Próxima e Última. Na ordem da sequência, a lista abre na última página (as notas mais novas). O Excel leva todas as '
        'notas do filtro, de todas as páginas. Ao digitar uma data no período, a lista espera a data completa.',
        'A lista rola dentro da tela: as barras de rolagem (para baixo e para o lado) ficam sempre visíveis, sem precisar ir até o '
        'fim da lista, e o cabeçalho das colunas fica fixo no alto.',
        '<b>Entrega</b> (coluna): <b>Entregue</b> com a data, a origem (SSW, portal, comprovante, lançada à mão) e quem recebeu; '
        '<b>Atrasada N dias</b> (passou da previsão) ou <b>Em trânsito</b> com a previsão e a última ocorrência do rastreamento; '
        '<b>Aguardando CT-e</b>. A coluna <b>Transportadora / CT-e</b> mostra quem leva, o número, a emissão e o valor do CT-e. '
        'Filtros <b>Entrega</b> (entregues, não entregues, atrasadas) e <b>Transportadora</b>; os quadros Entregues, Não entregues e '
        'Atrasadas também filtram ao clicar. A busca aceita NF, chave, CT-e, pedido, cliente ou transportadora.',
        'No alto: <b>Lançar registro manual</b> (quem edita registros), <b>Tela cheia</b> e <b>Excluir marcadas</b> (quem exclui '
        'registros; marque as caixas à esquerda).',
        '<b>Dois cliques</b> na linha abrem o documento. Cada linha tem o botão <b>DANFE</b> (abre o DANFE da nota para imprimir '
        'ou salvar em PDF) e a <b>chave de acesso</b> resumida (clique para copiar a chave inteira).',
        '<b>DANFE em folhas A4, no layout dos ERPs</b>: canhoto com o destinatário, o endereço, a emissão e o valor total (com a '
        'linha de corte); quadro do emitente com o <b>logo da empresa</b> (o de Cadastros » Empresa, só nas notas emitidas por ela; '
        'logo largo, com o nome ao lado do símbolo, vai em cima do endereço, e logo quadrado fica ao lado); '
        'quadro DANFE com Saída/Entrada, "FL 1 / 3", número e série; código de barras e chave; natureza e protocolo; inscrições; '
        'destinatário (com o indicador da IE); fatura (número, valor original, desconto e líquido); cálculo do imposto; '
        'transportador/volumes; produtos (CST com a origem, ex.: 100). Os <b>dados adicionais ficam no rodapé de todas as '
        'folhas</b>; o texto das informações complementares que não cabe no quadro continua na última folha ("Continuação - '
        'informações complementares"). As folhas seguintes repetem o canhoto e o cabeçalho e continuam os produtos. Nenhuma '
        'linha de produto é cortada entre duas folhas. Para imprimir, use papel A4, retrato, escala 100%.',
        'No documento aberto: a transportadora e o CT-e, a entrega e a previsão, e os botões <b>Histórico de rastreamento</b> '
        '(as ocorrências da SSW ou do portal) e <b>Abrir o registro do frete</b> (valores, cálculo pela tabela, aprovação, comprovante '
        'de entrega; ao fechar, a lista se atualiza).',
        '<b>Abrir</b> a nota mostra tudo e os botões <b>DANFE</b> (gerado a partir do XML, pronto para imprimir ou salvar em PDF '
        'pelo navegador) e <b>XML</b> (o arquivo da nota). Nota que entrou só pela planilha do ERP não tem XML.',
        '<b>XML das notas (.zip)</b>: baixa os XML de todas as notas do filtro num arquivo .zip. <b>Excel</b>: a lista com '
        'todas as colunas.',
        '<b>Imprimir DANFE</b> em lote: marque as notas na lista (a caixinha do cabeçalho marca todas) e clique em <b>Imprimir '
        'DANFE</b>. Abre uma página com um DANFE por folha, pronta para imprimir ou, em "Salvar como PDF", gerar um arquivo só '
        'com todas. Sem nenhuma marcada, saem as notas do filtro (até 300 de uma vez). A nota cancelada sai com a marca '
        'CANCELADA e a denegada com USO DENEGADO.',
        '<b>Eventos da nota</b>: ao abrir a nota aparecem os eventos importados (Cancelamento, Carta de Correção, Comprovante '
        'de Entrega), com data, texto, protocolo e o botão <b>XML do evento</b>. O XML dos eventos entra pelo Enviar XML, '
        'como os das notas.',
        '<b>Denegada</b>: NF-e com uso denegado pela SEFAZ (no próprio XML ou no recibo da SEFAZ importado) fica marcada como '
        'denegada: não tem valor fiscal, sai de "aguardando CT-e" e o CT-e que vier para ela fica retido, como na cancelada. '
        'O DANFE sai com a marca "USO DENEGADO".',
    ])

    s += h2('CT-e recebidos (404)')
    s.append(P('Em <b>Documentos » CT-e recebidos</b>, os CT-e das transportadoras com todos os dados lidos do XML: número, série '
               'e chave de acesso, emissão, protocolo de autorização, emitente (a transportadora), tomador (quem paga o frete), '
               'remetente, destinatário, município e UF de origem e de destino, modal (rodoviário, aéreo, aquaviário, '
               'ferroviário, dutoviário, multimodal), tipo de serviço (normal, subcontratação, redespacho...), CFOP, valor total '
               'do frete e o ICMS (situação tributária, base de cálculo, alíquota e valor). Os CT-e que já estavam no sistema '
               'são lidos do XML guardado sozinhos.'))
    s += lista([
        '<b>Filtros</b>: número, chave, NF ou pedido; transportadora, tomador, remetente e destinatário (nome ou CNPJ); '
        'município e UF de origem e de destino; modal; tipo de serviço; CFOP; período pela emissão do CT-e; situação '
        '(normal, cancelado, complementar, anulação, substituto). No alto: quantidade de CT-e, valor do frete e ICMS (sem os '
        'cancelados) e quantos estão cancelados.',
        '<b>Abrir</b> o CT-e mostra tudo, o <b>histórico do documento</b> (importação, eventos, auditoria, fatura e '
        'pagamento) e os botões <b>DACTE</b> (gerado a partir do XML, no mesmo desenho do DACTE oficial, com código de barras '
        'e QR Code, para imprimir ou salvar em PDF; o CT-e cancelado sai com a tarja CANCELADO) e <b>XML do CT-e</b>.',
        '<b>Eventos</b>: o XML de cada evento importado (Carta de Correção, Cancelamento, Comprovante de Entrega...) fica '
        'guardado e aparece no histórico com o botão <b>XML do evento</b>. A Carta de Correção do CT-e mostra os campos '
        'corrigidos (ex.: "corrigido: ide/xMunFim = CURITIBA") e o protocolo.',
        '<b>XML dos CT-e (.zip)</b>: baixa os XML de todos os CT-e do filtro, com os XML dos eventos numa pasta "eventos". '
        '<b>Excel</b>: a lista com todas as colunas.',
        'No detalhe do frete (Todos os registros) também aparecem os botões <b>DACTE</b> e <b>XML do CT-e</b>, e o histórico '
        'traz os eventos com o XML de cada um.',
    ])
    s.append(P('<b>CT-e na SEFAZ (busca automática)</b>'))
    s.append(P('<b>📡 CT-e na SEFAZ</b>, no alto da tela: busca no Ambiente Nacional da SEFAZ os CT-e em que a sua empresa aparece '
               '(tomadora, remetente, destinatária, expedidora, recebedora ou autorizada a baixar o XML), com o certificado digital '
               'A1 cadastrado na Configuração fiscal da emissão de CT-e (o mesmo ambiente, produção ou homologação). Cada CT-e entra '
               'como se o XML tivesse sido enviado à mão: liga à nota, cadastra a transportadora e passa pela auditoria. Os eventos '
               '(cancelamento, carta de correção) também chegam e são aplicados.'))
    s += lista([
        '<b>Buscar agora</b> (quem pode enviar XML) e <b>Buscar sozinho (a cada hora)</b> (administrador).',
        'A janela mostra a última consulta, o resultado e cada documento: Importado (com o link "ver o CT-e"), Já estava no '
        'sistema, Emitido pela empresa (os CT-e emitidos pela própria empresa ficam em CT-e emitidos), Evento aplicado ou Não '
        'importado (com o motivo).',
        'Regra da SEFAZ: quando ela responde "nenhum documento novo", a próxima consulta só é aceita 1 hora depois. O botão '
        'fica bloqueado até lá e mostra o horário liberado.',
        'No modo demonstração a SEFAZ é simulada: vêm dois CT-e de exemplo e um "emitido pela empresa".',
        '<b>Para não trazer todos os CT-e antigos</b> (administrador): <b>Só os novos daqui pra frente</b> pula tudo o que a SEFAZ '
        'já tem para a empresa (faz uma consulta só para saber até onde pular; os antigos não são importados) e a busca passa a '
        'trazer só os CT-e emitidos dali em diante. <b>Importar só os emitidos desde</b> (uma data, com <b>Salvar data</b>): os CT-e '
        'mais antigos que a data são pulados e aparecem como "Antigo (pulado)"; os eventos deles também não são aplicados. Vazio = '
        'importa todos.',
        '<b>Começar a partir do NSU</b> (administrador): o NSU é o número de ordem dos documentos na SEFAZ. A próxima busca traz o que '
        'vem depois do número informado (0 = tudo o que a SEFAZ ainda guarda, uns 3 meses); os CT-e que já estão no sistema não '
        'duplicam. O número não pode passar do maior NSU que a SEFAZ informou.',
    ])

    # 15
    s += h1('14-A. Pedidos e pré-notas fiscais')
    s.append(P('No menu <b>Faturamento</b> (bloco Finanças), <b>Pedidos</b> (Ctrl+K 405) e <b>Pré-notas fiscais</b> (406) mostram o que entra pela planilha do ERP '
               '(Importação do ERP), antes e depois da nota fiscal.'))
    s += h2('Pedidos (405)')
    s += lista([
        'Cada pedido do período (data do pedido, padrão últimos 30 dias): os que já viraram nota e os que ainda estão só na planilha.',
        'Colunas, na ordem da planilha de pedidos: <b>Pedido</b> (e o Pedido Mercus), <b>Situação</b>, <b>Cliente</b> (com o nome curto e o '
        'CNPJ), <b>Liberação</b> (data e hora) e <b>Expedição</b> (EXPEDICAO, ANTECIPADO...), <b>Peso e cubagem</b>, <b>Status WMS</b> (com a '
        'data inicial e o usuário), <b>Etiquetas</b> (quantidade e quando foram impressas), <b>Separação</b> (início, fim e quanto tempo levou) '
        'e a <b>NF-e</b> com a emissão.',
        'Da planilha do ERP (Timeline de pedidos) vêm o pedido, o CNPJ, o cliente, o nome curto (NM_CURTO), o Pedido Mercus, a liberação '
        '(DT_PEDIDO_LIBERADO), o peso, a cubagem, a expedição (EXPEDICAO), a nota e a emissão.',
        '<b>Do WMS</b> vêm o status, a data inicial, o usuário, a data e a quantidade de etiquetas, o início e o fim da separação e o '
        'cancelamento. Enquanto não houver ligação direta com o WMS, use o botão <b>Planilha do WMS</b> (quem edita registros): uma planilha '
        'exportada do WMS com a coluna "Número Pedido" e as colunas "Status/WMS", "Data Inicial", "Usuário", "Data/Imp. Etq", '
        '"Qtd. Etiquetas", "Data Início", "Data Finalização" e "Cancelado Wms" (as outras colunas são ignoradas; "Liberação" e "Expedição", '
        'se vierem preenchidas, valem mais que as do ERP). Célula vazia não apaga o que já estava.',
        'Se a maioria dos valores de uma coluna não for do tipo dela (por exemplo, datas em "Qtd. Etiquetas"), a planilha é <b>recusada '
        'sem gravar nada</b>: é sinal de colunas deslocadas. Valores estranhos isolados ficam vazios e são avisados.',
        '<b>Ligação com o WMS</b> (só o administrador): cadastro do endereço, do usuário e da senha do WMS, para o Nexofrete consultar o '
        'WMS sozinho, só lendo. Use um usuário só de consulta criado para o Nexofrete. A senha fica criptografada e não aparece de novo. '
        '<b>Salvar e testar conexão</b> abre o WMS a partir do servidor (o WMS fica na rede da empresa) e mostra um <b>diagnóstico</b> da '
        'tela de login: nomes dos campos, tecnologia e caminhos de API, sem senha nem dados. Copie e envie para quem monta a integração. '
        'Em <b>Endereço da tela Expedição Mercadorias</b>, cole o endereço da barra do navegador depois de buscar uma Carga: o botão '
        '<b>Testar login e tela de expedição</b> faz o login no WMS (avisa se o usuário ou a senha não forem aceitos) e descreve a tela: '
        'filtros, colunas da tabela e o botão Exportar, sem os dados das linhas.',
        '<b>Consulta automática do WMS</b> (Imperium, tela Expedição Mercadorias; a Carga do WMS é o pedido do ERP): marque <b>Ligada</b> e '
        'escolha o intervalo (30 min a 4 h; comece com 1 h), o horário (das/até) e quantos dias para trás olhar. A cada intervalo o Nexofrete '
        'faz o login e <b>uma busca por período</b> (Data Inicial da expedição), como uma pessoa clicando em Buscar, e grava em cada pedido: '
        'status do WMS, % de conferência, número da expedição, tipo, placa, motorista, itinerário, data inicial e final. Depois de uma falha, '
        'espera o dobro do intervalo. Desmarcar Ligada pausa na hora.',
        '<b>Pedidos procurados pela Carga</b>: a busca por período pode trazer só a primeira página do WMS e não pega expedição que começou '
        'antes do período. Por isso, depois dela, o Nexofrete procura pela Carga, um de cada vez, os pedidos dos últimos 60 dias que ainda '
        'estão sem dados do WMS ou não estão finalizados, até o máximo por rodada (campo <b>Por carga (máx.)</b>, padrão 40; 0 desliga). Quem '
        'foi procurado há pouco fica para a próxima rodada (2 horas se o WMS tinha a carga, 12 horas se não tinha), e pedido FINALIZADO ou '
        'CANCELADO não é mais procurado. A mensagem da consulta diz quantos foram procurados e achados.',
        '<b>Usuário e Data/Imp. Etq</b> vêm da <b>OS da expedição</b> no WMS (/expedicao/os/index/id/nº da expedição): no histórico da OS '
        '(Data, Usuário, Mapa, Etiqueta, Andamento), a linha com o andamento <b>Etiquetas Impressas</b> (com reimpressão, a primeira); sem '
        'essa linha, as etiquetas ainda não foram impressas e o campo fica vazio. Vale para todos os pedidos daquela expedição. A OS é aberta depois da busca do pedido e, na consulta de cada '
        'rodada, para as expedições ainda sem quem imprimiu (de novo a cada 2 horas, até aparecer; mesmo limite por rodada). A <b>Qtd. '
        'Etiquetas</b> vem do Resumo da tela de expedição (Qtd. Etq. Válidas) quando a expedição é só daquele pedido. Na janela Ligação com o '
        'WMS, <b>Testar OS (quem imprimiu)</b> abre a OS de uma expedição e mostra o que foi lido.',
        '<b>🔎 buscar</b> (na coluna Status/WMS de cada pedido ainda sem dados do WMS): procura só aquele pedido no WMS, na hora. Se o WMS '
        'não tiver a carga, aparece "não está no WMS".',
        '<b>Buscar todos sem dados</b> (ao lado de Pausar integração): procura no WMS, um por vez (1 segundo entre cada um), todos os '
        'pedidos dos últimos 60 dias sem dados ou não finalizados, em segundo plano. A linha do WMS mostra o andamento ("Buscando pedidos no '
        'WMS: 120 de 900") e a lista é atualizada no fim. Pausar integração interrompe; uma segunda busca ao mesmo tempo não é aceita.',
        '<b>Pausar integração</b>: na tela Pedidos, ao lado da linha do WMS (quem edita registros). Depois de confirmar, o Nexofrete para na '
        'hora de consultar o WMS: nem a consulta automática nem o botão Atualizar do WMS falam com ele, e a linha mostra "integração pausada". '
        '<b>Retomar integração</b> volta a consultar no intervalo configurado. Cada pausa e retomada fica na auditoria. O teste da janela '
        'Ligação com o WMS continua funcionando com a integração pausada.',
        'Na tela Pedidos: a linha "WMS: integração ligada... última: ..." mostra a última consulta (com o erro, se falhou), e o botão '
        '<b>Atualizar do WMS</b> (quem edita registros) consulta na hora, no máximo uma vez a cada 2 minutos. A situação segue o status do WMS '
        'antes da nota: INTEGRADO fica em Aguardando nota; EM SEPARAÇÃO em <b>Em separação</b>; EM CONFERÊNCIA, 1ª e 2ª CONFERÊNCIA em '
        '<b>Em conferência</b>; CONFERIDO, EM FINALIZAÇÃO, PARCIALMENTE FINALIZADO e FINALIZADO em <b>Separado</b>; CANCELADA em Cancelado.',
        'O arquivo do botão Exportar da tela Expedição Mercadorias também pode ser importado em Planilha do WMS (a coluna Cargas vira o pedido).',
        '<b>Situação</b>: Aguardando nota; Em separação (o WMS começou a separar); Separado (separação terminada, esperando a nota); '
        'Faturado (sem embarque nem coleta pedida); Em embarque; Coleta pedida; Coletado / em trânsito; Entregue; e Cancelado (no ERP, no '
        'WMS ou nota cancelada). Pedido aguardando nota há mais de 3 dias aparece com os dias em vermelho.',
        'A tabela rola dentro da tela, com o cabeçalho fixo: as barras de rolagem (inclusive a de lado, em telas menores) ficam sempre '
        'à vista, sem precisar ir até o fim da lista.',
        'Duas visões (botões <b>Planilha</b> e <b>Resumida</b>; o sistema lembra a escolhida): <b>Planilha</b> mostra cada campo na sua coluna, '
        'na ordem da planilha de pedidos (Número Pedido, Situação, CNPJ, Cliente, Nome Curto, Pedido Mercus, Liberação, Peso, Cubagem, '
        'Status/WMS, Data Inicial, Expedição, Usuário, Data/Imp. Etq, Qtd. Etiquetas, Data Início, Data Finalização, Cancelado Wms, Nota '
        'Fiscal e Data de Emissão), com o número do pedido fixo à esquerda ao rolar para o lado; <b>Resumida</b> agrupa os campos para '
        'caber na tela (etiquetas e separação na mesma coluna, placa e motorista embaixo do status).',
        '<b>Buscador no topo</b> (o mesmo modelo da Visão geral): filtra a aba aberta enquanto você digita; com texto, procura no último ano '
        '(sem texto, nos 30 dias ou no período escolhido). Acha o número do pedido, o Mercus, a NF, o cliente, o nome curto, o CNPJ (com ou '
        'sem pontuação), a cidade, a transportadora, a placa, o motorista, o status e o usuário do WMS. Esc limpa.',
        'Clique na NF-e para abrir a nota. Os botões do alto filtram pela situação; a busca acha pedido, pedido do cliente, cliente, nome '
        'curto, CNPJ, NF, cidade, transportadora, status do WMS ou usuário. O <b>Excel</b> leva todos os pedidos com as colunas da planilha de '
        'pedidos, mais a situação, o destino, a transportadora e o CT-e.',
    ])
    s += h2('Pré-notas fiscais (406)')
    s += lista([
        'A pré-nota é a linha da planilha do ERP: o pedido antes da NF-e. A aba lista as que esperam faturamento e as já faturadas dos '
        'últimos 60 dias.',
        '<b>Situação</b>: A faturar; Parada sem faturar (mais de 3 dias desde o pedido); NF sem XML (o ERP já informou o número da nota, mas '
        'o XML ainda não chegou ao sistema); Faturada, confere; Faturada, mudou (com o que mudou: valor, volumes, peso, transportadora, '
        'destino ou cliente); e Cancelada no ERP.',
        'Os cartões somam o valor esperando faturamento, as paradas, as faturadas com diferença e quantos dias, em média, vão do pedido à '
        'nota. A comparação completa, campo a campo, está no relatório 87 (Controle operacional).',
    ])

    s += h1('15. Tabelas de preço e o cálculo do frete')
    s.append(P('A tabela de preço é o que a transportadora negociou. É com ela que o sistema calcula quanto cada frete '
               'deveria custar. Fica em <b>Cadastros » Tabelas de Preço</b>.'))
    s.append(P('Na lista de tabelas, a coluna <b>Rastreamento</b> mostra como o sistema acompanha as entregas de cada '
               'transportadora (passe o mouse no selo para ver o detalhe):'))
    s += tabela(['Selo', 'O que quer dizer'], [
        ['SSW', 'As entregas são lidas do SSW sozinhas (busca das 6h30 e botão Buscar entregas). O sistema marca isso quando acha a transportadora no SSW.'],
        ['Portal ATA', 'Portal próprio da Andrade e Abreu (Lonngren), lido com o login cadastrado na transportadora.'],
        ['Central de Canhotos', 'Site da LD Rio Pizzo, lido com o e-mail e a senha cadastrados na transportadora.'],
        ['EDI', 'A transportadora manda arquivos de ocorrência (OCOREN). Fica laranja se o último arquivo tem mais de 30 dias.'],
        ['Link', 'Só o link de rastreamento: abre o site da transportadora, mas não traz a entrega sozinho.'],
        ['manual', 'Sem rastreamento automático: as entregas entram à mão, pelo canhoto ou pelo XML.'],
    ], [0.22, 0.78])
    s.append(P('Para mudar, use o cadastro da transportadora (Cadastros » Transportadoras » Portal de rastreamento e link).'))
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
               'Os trechos também podem ser importados de uma planilha ("Importar via Excel"). A caixa de cidades cresce para '
               'mostrar a lista inteira (Enter vira vírgula ao salvar), e as colunas Região e Tipo de carga são mais largas.'))
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
        'Dá para ajustar valores direto no Excel antes de importar. Só mantenha os nomes das abas e das colunas. '
        'Para reajustar várias tabelas por um mesmo %, use o Reajuste em lote (abaixo).',
    ])
    s += h2('Reajuste em lote')
    s.append(P('Em <b>Cadastros » Tabelas de Preço</b>, o botão <b>Reajuste em lote</b> aplica um percentual (acréscimo ou '
               'desconto) em várias tabelas de uma vez, por exemplo o reajuste anual do contrato pelo IPCA.'))
    s += passos([
        '<b>Escolha as tabelas</b>: transportadora (ou todas), só as gerais ou só as de clientes, um cliente e a UF de destino. '
        'As inativas ficam de fora, a não ser que você marque "Incluir tabelas inativas".',
        '<b>Informe o %</b> (ex.: 6,5 para aumentar, -3 para baixar, entre -50% e +100%), o índice ou motivo (opcional) e a data '
        'em <b>Vale a partir de</b>.',
        '<b>Marque o que reajustar</b>: frete peso (R$/kg dos trechos e excedente), fretes mínimos, taxas em R$ (pedágio, TDE, TDA, '
        'TRT, despacho, GRIS mínimo, pallet, descarga) e, se quiser, ad valorem e GRIS em %. "Renovar a validade" faz a validade '
        '(em meses) contar de novo a partir da data do reajuste.',
        '<b>Ver prévia</b>: lista cada tabela com o valor de antes e o de depois (1º trecho, frete mínimo, pedágio, ad valorem). '
        'Desmarque as tabelas que ficam de fora.',
        '<b>Aplicar reajuste agora</b> (data de hoje) ou <b>Agendar</b> (data futura): até a data vale o preço atual; no dia, o '
        'sistema aplica sozinho.',
    ])
    s += lista([
        'Antes de mudar, cada tabela ganha uma cópia de como estava em "Ver Histórico" e uma linha nas Observações '
        '(ex.: "Reajuste de 6,5% (IPCA 12 meses) em 01/01/2027").',
        'Aba <b>Histórico</b> do reajuste: todos os reajustes em lote, com quem fez, a data e a situação (agendado, aplicado, '
        'desfeito, cancelado). <b>Cancelar</b> desiste de um agendado; <b>Desfazer</b> volta as tabelas aos valores de antes.',
        'O Desfazer não mexe numa tabela que foi editada depois do reajuste (ela aparece no aviso para conferir à mão). Se houver '
        'um reajuste mais novo nas mesmas tabelas, desfaça primeiro o mais novo.',
        'Os valores são arredondados: R$/kg com 4 casas, valores em R$ com 2 e percentuais com 3.',
    ])
    s += aviso('nota', 'O reajuste vale para os cálculos feitos daí em diante (cotação, CT-e, auditoria). Fretes já calculados só '
                       'mudam se você usar "Recalcular todos agora" em Manutenção (seção 24).')
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
    s += h2('Entendendo a diferença do frete')
    s += lista([
        '<b>No cartão</b>: Cobrado, Tabela e a diferença em R$ e em %. "A mais" (vermelho) = a transportadora cobrou mais que a '
        'tabela; "A menos" (verde) = cobrou menos; "Na tolerância" (cinza) = diferença pequena, dentro da tolerância configurada, '
        'que conta como confere. Quando há taxa divergente, a linha <b>Onde</b> mostra as que mais pesam (ex.: TDE +R$ 45,00).',
        '<b>No Detalhe</b>, o quadro do alto resume tudo numa frase: "A transportadora cobrou R$ X a mais que a tabela (+Y%)", '
        'com o valor pela tabela, o cobrado no CT-e, a diferença e duas barras para comparar o tamanho.',
        '<b>Onde está a diferença</b>: cada componente que não bate (frete peso, taxas, ad valorem, GRIS...), com o cobrado, o da '
        'tabela e quanto a mais ou a menos; taxa que a tabela não prevê; peso ou volumes do CT-e diferentes da nota; ICMS. O que '
        'os itens não explicam aparece como <b>Restante</b> (normalmente o frete base ou o frete mínimo).',
        'Diferença muito grande (CT-e com mais que o dobro ou menos da metade da tabela) ganha um aviso: quase sempre é o trecho ou '
        'a tabela errada, e não cobrança indevida. Confira em "Como o sistema calculou" antes de cobrar a transportadora.',
        '<b>Glosar a diferença</b>: no quadro, já com o valor cobrado a mais preenchido (dá para mudar antes de confirmar).',
    ])
    s += h2('Conferir em sequência (fila e teclado)')
    s.append(P('No alto do Detalhe aparece a <b>fila</b>: os fretes divergentes que ainda esperam decisão, com os filtros da tela, do que '
               'mais cobrou a mais para o que menos cobrou (ex.: "2 de 14"). Assim dá para conferir um atrás do outro sem fechar a janela.'))
    s += tabela(['Tecla / botão', 'O que faz'], [
        ['→ ou ▶', 'Próximo frete da fila.'],
        ['← ou ◀', 'Frete anterior da fila.'],
        ['A ou "Aprovar e próximo"', 'Abre a justificativa (já sugerida), aprova e abre o próximo da fila.'],
        ['G', 'Registra a glosa, já com a diferença preenchida.'],
        ['Esc', 'Fecha o Detalhe.'],
    ], [0.3, 0.7])
    s.append(P('Os atalhos só valem com o Detalhe aberto e sem outra janela por cima (ex.: a da justificativa). Quando a fila acaba, '
               'o sistema avisa e fecha o Detalhe.'))
    s += h2('Conferência em detalhe (no detalhe do frete)')
    s.append(P('Abaixo do cálculo, o detalhe do frete mostra a <b>conferência em detalhe</b>: cada componente lado a lado, '
               '<b>tabela × CT-e</b>, com a diferença e a situação (confere, cobrado a mais, cobrado a menos, não prevista na '
               'tabela). Os componentes são frete peso, ad valorem (ou "frete valor"), GRIS, pedágio, TDE, TDA, TRT, despacho '
               '(taxa de emissão, SEC/CAT) e descarga; o sistema reconhece o nome que cada transportadora usa no CT-e.'))
    s += lista([
        '<b>Taxa não prevista</b>: componente cobrado no CT-e que a tabela não tem (ou tem zero) aparece como "não '
        'prevista na tabela".',
        '<b>Cobrado a mais</b>: a soma do que as parcelas passam da tabela, até o quanto o total do CT-e passa do total '
        'da tabela. Se o total confere e só a divisão entre as parcelas está diferente ("parcelas trocadas"), o '
        'apontamento aparece, mas não conta como cobrado a mais.',
        '<b>Peso e volumes</b>: o que está no CT-e contra o das notas (peso com tolerância de 5% ou 1 kg; volumes exatos).',
        '<b>ICMS</b>: CST, CFOP e a rota (UF inicial e final); a base (o valor da prestação, com a redução quando houver), a '
        'alíquota esperada pela rota, o valor (base × alíquota) e o CFOP (5xxx dentro do estado, 6xxx entre estados).',
        '<b>Histórico deste frete</b>: a linha do tempo com a importação, os cálculos pela tabela, a liberação automática, '
        'a aprovação ou reprovação (com a justificativa), a glosa, o cancelamento, a fatura e o pagamento, com quem fez.',
    ])
    s.append(P('Os mesmos apontamentos (componente a mais, taxa não prevista, peso, volumes, base e valor do ICMS, CFOP) '
               'aparecem no relatório <b>Auditoria de Frete</b> e no relatório <b>Cobranças indevidas</b> (capítulo 19).'))
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
        '<b>Glosa</b>: a transportadora aceitou descontar a diferença no boleto. Informe o valor, escolha o <b>motivo</b> '
        'na lista (o sistema já sugere um) e, se quiser, uma observação; o frete é liberado e o Financeiro já exporta o '
        'valor líquido.',
        '<b>Email</b>: manda o espelho do cálculo (valores e taxas) para o email da transportadora, para ela corrigir ou '
        'aceitar a glosa. Precisa do envio de email configurado.',
    ])
    s += aviso('nota', '<b>Limite de alçada</b>: se configurado, fretes acima desse valor só podem ser aprovados por quem '
                       'tem a permissão "Aprovar valores altos".')
    s += aviso('dica', '<b>Fila por responsável</b>: o filtro <b>Responsável</b> da Auditoria mostra "Todos", "Só os meus", '
                       '"Sem responsável" ou um analista. Quem é responsável por alguma transportadora (capítulo 24) já abre em "Só os meus". '
                       'A fila do Detalhe (setas e "Aprovar e próximo") segue o mesmo filtro.')
    s += aviso('dica', '<b>Desfazer</b>: logo depois de aprovar, reprovar ou glosar (no cartão, no Detalhe, em lote ou na tela do '
                       'registro), aparece no rodapé um aviso com o botão <b>Desfazer</b> por 10 segundos. Ele devolve o frete para a '
                       'conferência, sem decisão (a glosa feita junto também sai). Só vale para a decisão da própria pessoa, dos últimos 10 '
                       'minutos, em frete ainda não faturado.')
    s += h3('Motivos de glosa padronizados')
    s.append(P('Toda glosa tem um motivo da lista: frete acima da tabela, taxa acima da tabela, taxa não prevista na tabela, '
               'peso ou volumes diferentes da nota, trecho / cidade errada, ICMS errado, cobrança em dobro, transportadora '
               'não levou a nota, nota cancelada ou outro. O motivo sugerido vem da conferência do CT-e (por exemplo, '
               'cobrança em dobro quando o sistema marcou o alerta, taxa não prevista quando a tabela não tem a taxa). '
               'Com o motivo padronizado dá para ver o que mais gera glosa em cada transportadora (aba <b>Glosas por motivo</b>, '
               'abaixo) e montar relatórios no BI (campo "Motivo da Glosa (padronizado)").'))
    s += h2('Contestação em lote com a transportadora')
    s.append(P('Em vez de mandar um e-mail por CT-e, o botão <b>Contestações</b> da Auditoria junta tudo o que uma '
               'transportadora cobrou acima da tabela no período e manda <b>um e-mail só</b>, com a lista no corpo e a '
               'planilha anexa. Ver precisa de "Ver todos os registros" e de "Aprovar pagamento", "Ver auditoria" ou '
               '"Conferir fatura"; criar, enviar e registrar a resposta precisa de "Aprovar pagamento".'))
    s += passos([
        'Clique em <b>Contestações</b> e em <b>Nova contestação</b>.',
        'Escolha a transportadora e o período (emissão do CT-e) e clique em <b>Buscar CT-e</b>. Entram os CT-e cobrados '
        'acima da tabela <b>fora da tolerância</b>, ainda sem glosa e fora de outra contestação aberta (os marcados como '
        'cobrança em dobro, não levou ou nota cancelada entram com o valor inteiro do CT-e).',
        'Confira cada linha: desmarque o que não quer contestar, ajuste o valor, o motivo e o detalhe (o sistema já '
        'escreve as taxas a mais que achou no XML). CT-e já faturado aparece com o selo "faturado".',
        'Confira o e-mail (vem do cadastro da transportadora) e o <b>prazo para responder</b> (padrão: 10 dias) e clique em '
        '<b>Criar contestação</b>.',
        'No detalhe, clique em <b>Enviar por e-mail</b> (precisa do envio de e-mail configurado) ou, se mandou por outro '
        'meio, em <b>Marcar como enviada</b>. <b>Planilha</b> baixa o mesmo arquivo que vai anexo.',
        'Quando a transportadora responder, marque cada CT-e como <b>Aceito</b> (com o valor aceito, que pode ser menor que '
        'o contestado) ou <b>Recusado</b>, escreva a resposta se quiser e clique em <b>Registrar resposta</b>.',
    ])
    s += tabela(['Situação', 'Quando'], [
        ['Rascunho', 'Criada, ainda não enviada.'],
        ['Enviada', 'Enviada por e-mail ou marcada como enviada.'],
        ['Aceita / Aceita em parte', 'Todos os CT-e aceitos / parte aceita e parte recusada.'],
        ['Recusada', 'A transportadora recusou todos.'],
        ['Abatida na fatura', 'Os créditos (CT-e já faturados) foram descontados na fatura seguinte.'],
        ['Cancelada', 'Cancelada antes da resposta; os CT-e voltam a poder ser contestados.'],
    ], [0.3, 0.7])
    s += h3('Resposta da transportadora pelo link')
    s.append(P('O e-mail da contestação leva o botão <b>Responder a contestação</b>. Ele abre uma página, sem login, em que a '
               'transportadora vê os CT-e contestados (CT-e, NF, valor do CT-e, valor pela tabela, contestado e motivo) e marca cada um '
               'como <b>aceito</b> (pode aceitar um valor menor) ou <b>recusado</b> (com o motivo, obrigatório), informa o nome e envia. '
               'Ela pode mudar e enviar de novo até a empresa confirmar. A página não mostra nome de cliente nem outros dados internos.'))
    s += lista([
        'A resposta <b>não é aplicada sozinha</b>: o sino avisa "transportadora respondeu pelo link", a lista mostra o selo '
        '"Respondida pelo link — confirmar" e, no detalhe, a resposta dela já vem preenchida (aceito/recusado, valor e o '
        'comentário de cada CT-e). Confira e clique em <b>Registrar resposta</b>.',
        'No detalhe também aparece quando a transportadora abriu o link, mesmo sem responder.',
        '<b>Link de resposta</b> (no detalhe) mostra o link para copiar e mandar por WhatsApp. O link usa o <b>endereço público</b> '
        'do sistema (o mesmo do link de rastreio). Se o sistema estiver sendo acessado por um endereço da rede interna '
        '(ex.: localhost ou 192.168...), o link só abre dentro da empresa: o administrador informa ali o endereço público.',
        'Depois que a contestação é encerrada, a página mostra só o resultado.',
    ])
    s += h3('Prazo de resposta e lembrete')
    s.append(P('Ao enviar (ou marcar como enviada), a contestação ganha a data limite para a resposta (hoje + o prazo). A lista '
               'mostra "responder até" e, depois do prazo, <b>"sem resposta, prazo vencido há N dias"</b> em vermelho; o sino de '
               'avisos também mostra as vencidas e leva direto à lista. No detalhe, <b>Reenviar como lembrete</b> manda o e-mail de novo, '
               'com o assunto "Lembrete:" e o pedido de retorno, renova o prazo e conta quantos lembretes foram enviados. Na '
               '<b>conferência da fatura</b> (capítulo 17), ao escolher a transportadora aparece o valor contestado ainda sem resposta '
               '(e quantas contestações estão vencidas), para cobrar a resposta antes de aprovar a fatura.'))
    s += lista([
        '<b>CT-e aceito ainda não faturado</b>: vira <b>glosa</b> no frete, com o motivo da contestação, e o frete é liberado. '
        'A fatura deve vir com o desconto.',
        '<b>CT-e aceito já faturado</b>: vira <b>crédito</b>. Na conferência da próxima fatura dessa transportadora, o crédito '
        'é descontado sozinho do valor que a fatura deveria vir (capítulo 17).',
        '<b>CT-e recusado</b>: nada muda no frete; ele volta à lista de CT-e que podem ser contestados.',
    ])
    s += h3('Diferenças que se repetem')
    s.append(P('A aba <b>Diferenças que se repetem</b> da janela de contestações analisa os CT-e do período (padrão: últimos 90 dias; '
               'dá para filtrar a transportadora) e mostra o padrão por trás das divergências, em vez de CT-e por CT-e:'))
    s += lista([
        '<b>Taxa repetida</b>: um componente cobrado a mais ou sem estar na tabela em boa parte dos CT-e da transportadora '
        '(30% ou mais) ou de um cliente (metade ou mais). Ex.: "TDE cobrado sem estar na tabela em 4 de 4 CT-e do cliente X '
        '(quase sempre R$ 30,00)".',
        '<b>Trecho</b>: um destino em que a transportadora cobra acima da tabela na maioria dos CT-e, com pelo menos 2% a mais. '
        'Ex.: "Para CAMPINAS/SP, 4 de 4 CT-e acima da tabela, quase sempre +8%".',
        'Precisa de pelo menos 3 CT-e. Quando os mesmos CT-e aparecem em dois padrões, fica só o mais específico (o do cliente, o '
        'do trecho).',
    ])
    s.append(P('Cada padrão traz uma sugestão: quando a diferença é <b>sempre a mesma</b> (o mesmo valor ou o mesmo %), o mais '
               'provável é a <b>tabela estar desatualizada</b> (selo "Corrigir a tabela?" e o botão <b>Abrir a tabela de preço</b> já '
               'abre a tabela usada nesses CT-e; para vários trechos de uma vez use o Reajuste em lote, capítulo 15). Quando a '
               'diferença <b>varia</b>, parece erro de cobrança (selo "Contestar"): <b>Contestar N CT-e</b> abre a nova contestação '
               'só com os CT-e daquele padrão que ainda não têm glosa nem contestação.'))
    s += h3('Resultado da auditoria')
    s.append(P('A aba <b>Resultado</b> da janela de contestações mostra o retorno do trabalho da auditoria no período (padrão: os '
               'últimos 12 meses, pela emissão do CT-e; dá para filtrar a transportadora):'))
    s += tabela(['Número', 'O que é'], [
        ['Cobrado a mais', 'O que os CT-e cobraram acima da tabela, fora da tolerância, e em quantos CT-e.'],
        ['Recuperado', 'Glosas (feitas na auditoria, por regra automática ou por contestação aceita) + créditos de contestação '
         'abatidos em fatura + CT-e barrados (reprovados ou da transportadora que não levou). "% recuperado" = glosas e créditos '
         'divididos pelo cobrado a mais.'],
        ['Aprovado mesmo divergente', 'Cobrou a mais e foi aprovado sem glosa, separado entre pessoas e regras automáticas.'],
        ['Em apuração', 'O que os CT-e ainda retidos cobram a mais.'],
        ['Decididos por regra automática', 'Fretes aprovados ou glosados pelas regras (capítulo 24), sem ninguém precisar abrir.'],
    ], [0.3, 0.7])
    s.append(P('Abaixo: de onde veio o recuperado, as principais causas (glosas por motivo), o gráfico por mês (cobrado a mais '
               'e recuperado) e a tabela por transportadora, com a % de CT-e divergentes, o recuperado e a principal causa. '
               '<b>Planilha (CSV)</b> baixa os números (total, por mês e por transportadora) para abrir no Excel.'))
    s += h3('Nota das transportadoras')
    s.append(P('A aba <b>Nota das transportadoras</b> dá a cada transportadora uma nota de 0 a 100 no período (padrão: últimos 90 '
               'dias, pela emissão do CT-e), para comparar e negociar. Passe o mouse na nota para ver os pontos de cada parte:'))
    s += tabela(['Parte', 'Pontos'], [
        ['CT-e acima da tabela (fora da tolerância)', '40 com nenhum; zero com metade ou mais dos CT-e.'],
        ['Cobrado a mais a cada R$ 1.000 de frete', '30 com nada; zero com R$ 50 (5%) ou mais.'],
        ['Contestações: parte do valor contestado que ela aceitou', '20 x a parte aceita (sem contestação respondida: 20).'],
        ['Tempo de resposta das contestações', '10 respondendo no mesmo dia; zero com 20 dias ou mais (sem: 10).'],
    ], [0.55, 0.45])
    s.append(P('Faixas: <b>A</b> (85 ou mais), <b>B</b> (70 ou mais), <b>C</b> (50 ou mais) e <b>D</b> (abaixo de 50). Transportadora '
               'com menos de 5 CT-e no período aparece sem nota ("poucos CT-e").'))
    s += h3('Glosas por motivo')
    s.append(P('A aba <b>Glosas por motivo</b> da janela de contestações mostra, no período, quanto foi glosado em cada motivo '
               '(com barras) e uma tabela por transportadora com o valor de cada motivo, além dos créditos de contestação '
               'a abater e dos já abatidos em fatura.'))
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
        '<b>Créditos de contestação</b>: se a transportadora aceitou uma contestação de CT-e já faturado (capítulo 16), '
        'o crédito entra sozinho como desconto na conferência da próxima fatura dela: o documento mostra a linha "Créditos de '
        'contestação" com os CT-e, e a fatura deveria vir com esse desconto. Desfazer a conferência devolve o crédito '
        'para a fatura seguinte.',
        '<b>Contestações sem resposta</b>: ao escolher a transportadora, um aviso mostra o valor contestado com ela que ainda não '
        'teve resposta (e se o prazo venceu), com o link para as contestações.',
        'A aba "Faturas conferidas" lista o histórico. Só o administrador pode desfazer uma conferência.',
    ])
    s += h2('Importar a fatura em planilha')
    s.append(P('Em vez de marcar os CT-e um a um, clique em <b>Importar arquivo da fatura (Excel/CSV)</b>. Dá para escolher '
               'vários arquivos de uma vez (a fatura dividida). O arquivo precisa de uma coluna <b>CT-e</b> (número) ou '
               '<b>Chave</b>; com a coluna <b>Valor</b>, o sistema compara o cobrado com o valor de cada CT-e. Ele escolhe a '
               'transportadora, marca os CT-e, preenche o número da fatura, o vencimento e o valor (quando estão no arquivo) e avisa:'))
    s += lista([
        'CT-e com valor cobrado diferente do CT-e (e a diferença);',
        '<b>cobrança repetida</b>: o mesmo CT-e duas vezes no arquivo, ou CT-e que já está em outra fatura;',
        'CT-e cancelado cobrado e CT-e não encontrado (sem XML no sistema ou de outra transportadora).',
    ])
    s.append(P('O DOCCOB (EDI) continua em EDI » Com a transportadora, que abre a conferência já preenchida.'))
    s += h2('Situação da fatura: aprovar, bloquear, liberar e pagar')
    s.append(P('Depois de conferida, a fatura segue os passos <b>Conferida » Aprovada » Liberada p/ pagamento » Paga</b>, na aba '
               '"Faturas conferidas". Os botões aparecem conforme a situação e a permissão de cada um.'))
    s += lista([
        '<b>Bloqueio automático</b>: fatura conferida com ressalvas (CT-e divergente ou valor da fatura diferente do esperado) '
        'já nasce <b>Bloqueada</b>, com o motivo. Também dá para bloquear à mão (quem confere fatura, aprova pagamento ou vê o '
        'Financeiro), com o motivo. <b>Fatura bloqueada não pode ser aprovada, liberada nem paga.</b>',
        '<b>Desbloquear</b> (quem aprova pagamento): só com a justificativa (o que foi resolvido ou combinado com a '
        'transportadora). A fatura volta para Conferida.',
        '<b>Aprovar</b> (quem aprova pagamento). Com a <b>alçada da fatura</b> (Configurações da auditoria: "Alçada da fatura"), '
        'fatura acima do valor só é aprovada por quem tem "Aprovar valores altos".',
        '<b>Liberar p/ pagamento</b> (quem aprova pagamento): a fatura aprovada vai para o pagamento.',
        '<b>Registrar pagamento</b> (quem aprova pagamento ou vê o Financeiro): só na fatura liberada; informe a data e o valor '
        'pago. Os CT-e dela contam como <b>fretes pagos</b> nos Indicadores. "Desfazer pagamento" volta para Liberada.',
        '<b>Histórico</b>: cada fatura guarda quem conferiu, bloqueou, desbloqueou, aprovou, liberou e pagou, com data, hora e '
        'o motivo ou justificativa.',
    ])
    s += h2('Vencimentos e CT-e não faturados')
    s += lista([
        'Aba <b>Vencimentos</b>: as faturas ainda não pagas, separadas em vencidas, vencem hoje, próximos 7 dias, depois e '
        'sem vencimento, com o valor a pagar e a situação.',
        'Aba <b>CT-e não faturados</b>: os CT-e recebidos que ainda não entraram em fatura nenhuma (sem os cancelados, '
        'recusados e não cobrados), por transportadora, com o mais antigo e quantos passam de 30 e de 60 dias. Filtre pelos '
        'emitidos há pelo menos 15, 30, 45, 60 ou 90 dias. CT-e antigo sem fatura: a transportadora pode cobrar de surpresa '
        'ou esqueceu de cobrar.',
        'A <b>Visão geral</b> avisa as faturas vencidas, vencendo em 7 dias, bloqueadas e aguardando aprovação ou liberação, '
        'e os CT-e há mais de 30 dias sem fatura. Clicar abre a aba certa.',
    ])

    # 18
    s += h1('18. Financeiro')
    s.append(P('Menu <b>Financeiro » Pagamento de fretes contratados</b> (130): fretes liberados para pagamento, vencimentos e glosas. '
               'O botão <b>Faturas das transportadoras</b>, no alto, abre a lista de faturas (a mesma janela da Auditoria de '
               'frete, capítulo 17): conferir, aprovar, liberar e registrar o pagamento sem trocar de tela.'))
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
    s.append(P('Os relatórios ficam no grupo da área deles no menu, sob o subtítulo <b>Relatórios</b> (capítulo 29, Mapa do menu): '
               '<b>Fretes contratados</b> (Entregas e rastreamento, NF-e x CT-e; e as telas Entregas previstas, Notas sem mapa, Consolidar '
               'rotas, Roteirizar, Inconsistências NF-e x CT-e e Notas e seus CT-e), <b>Auditoria de fretes</b> (Relatórios de auditoria; e '
               'Conferência de CT-e, Cobranças indevidas, Anomalias e duplicidades), <b>Financeiro</b> (Fretes a pagar e pagos), '
               '<b>Transportadoras</b> (Desempenho e ranking, Scorecard; e Melhor transportadora, Comparar cotações) e <b>Painéis e BI</b> '
               '(Indicadores, Gráficos, Montar relatório). Os códigos 309 a 329 continuam valendo no Ctrl+K. Os gráficos podem ser '
               'maximizados ou minimizados, e a tela pode ser impressa.'))
    s.append(P('<b>Excel e PDF em todos os relatórios</b>: o botão <b>Excel</b> no alto de Relatórios baixa uma planilha (.xlsx) com '
               'as tabelas e os gráficos da aba aberta, uma planilha para cada um, com os números como números (o Excel soma). '
               '<b>Imprimir/PDF</b> imprime a tela ou salva em PDF.'))
    s += h2('Indicadores (309)')
    s.append(P('O painel com os principais números numa tela só. Escolha o período (pela emissão do CT-e) e, se quiser, uma '
               'transportadora. Clicar num quadro abre a tela de onde ele vem.'))
    s += lista([
        '<b>Fretes contratados</b>: os CT-e do período, sem os cancelados, os que não são cobrados da empresa e os barrados '
        'pela auditoria; com o % do frete sobre o valor das notas.',
        '<b>Fretes pagos</b>: os CT-e das faturas com o pagamento registrado (capítulo 17). <b>A pagar</b>: faturado e ainda '
        'não pago, liberado sem fatura, em conferência e retido.',
        '<b>Por transportadora, cliente, região, estado e mês</b>: contratado, pago, a pagar, % sobre a NF e R$ por kg. As '
        'regiões são Norte, Nordeste, Centro-Oeste, Sudeste e Sul.',
        '<b>Modalidade</b>: o modal do CT-e (rodoviário, aéreo, aquaviário, ferroviário...), lotação ou fracionada, CIF ou FOB, '
        'direta, por redespacho ou reentrega, e o tipo de serviço (normal, subcontratação, redespacho).',
        '<b>Entregas</b>: entregues no período, pontualidade (entregues até a data prevista, dividido pelas entregues com '
        'previsão) e atraso médio; e, na situação de agora, pendentes, atrasadas, previstas para hoje e para os próximos 7 dias.',
        '<b>Ocorrências</b>: os problemas do rastreio por tipo, por transportadora e por mês, as reentregas, os sinistros '
        '(prejuízo e ressarcido) e as entregas com problema agora.',
        '<b>Economia da auditoria</b>: glosas mais CT-e barrados (recusados na conferência ou da transportadora que não levou a '
        'carga) = o economizado; e o "em apuração", que é o que os CT-e retidos cobram acima da tabela.',
        '<b>Excel</b> (uma aba por bloco: resumo, transportadoras, clientes, regiões, estados, meses, modalidades, '
        'ocorrências, economia) e <b>PDF</b>.',
    ])
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
    s += h2('Relatórios financeiros (tela 329)')
    s.append(P('Em Finanças » Financeiro, sob Relatórios, <b>Fretes a pagar e pagos</b> (Ctrl+K e 329) traz os relatórios 51 a 60 '
               'dos fretes contratados, com os mesmos recursos das outras telas de relatórios. Vê a tela quem tem a permissão do financeiro. '
               'O período vem no mês atual.'))
    s += lista([
        '<b>Valor a pagar do CT-e</b>: o valor do CT-e (ou o negociado, enquanto ele não chega) menos a glosa. <b>Fatura</b>: a que a '
        'transportadora mandou (conferida, aprovada, liberada, paga), com o vencimento; a pagar = o valor informado na fatura ou os CT-e menos as glosas.',
        '<b>Situação do CT-e</b>: Pago, Faturado (a pagar), Liberado (sem fatura), Em conferência ou Retido na auditoria.',
        'Os relatórios 51, 53, 55 e 56 mostram a situação de hoje (o período não vale); os demais usam o período.',
        'Dois cliques numa fatura abrem os CT-e dela, com o atalho para a tela Pagamento de fretes; dois cliques num CT-e abrem a nota.',
    ])
    s += tabela(['Nr.', 'Relatório', 'O que mostra'], [
        ['51', 'Fretes a pagar', 'Todos os CT-e ainda não pagos, com o valor a pagar, a situação, a fatura e o vencimento; os cartões separam faturado, liberado, em conferência e retido.'],
        ['52', 'Fretes pagos', 'Faturas pagas no período: a pagar x pago, quem pagou e quantos dias depois do vencimento. Clique na fatura para ver os CT-e.'],
        ['53', 'Fretes vencidos', 'Faturas não pagas com o vencimento passado e CT-e que a transportadora ainda não faturou há mais de 30 dias.'],
        ['54', 'Faturas por transportadora', 'Faturas emitidas no período: quantas, CT-e, cobrado, glosas, a pagar, pago, em aberto, vencido e bloqueadas. Clique na transportadora para ver as faturas.'],
        ['55', 'Faturas pendentes', 'As faturas ainda não pagas (as contas a pagar do frete), com a situação, o vencimento e o motivo do bloqueio.'],
        ['56', 'Previsão de pagamento', 'O que vence em cada dia, das vencidas aos próximos 60 dias, com o acumulado, e os CT-e liberados ainda sem fatura (a faturar).'],
        ['57', 'Pagamentos por período', 'Pagamentos dia a dia (mês a mês em períodos longos): faturas pagas, CT-e, valor pago e glosas abatidas.'],
        ['58', 'Despesas de transporte', 'O gasto do período por tipo: frete de entrega, reentrega, devolução, redespacho, complementar e outros, com as glosas e a participação.'],
        ['59', 'Custo de frete por faturamento', 'Mês a mês (ou dia a dia): faturamento das notas de venda (o mesmo do Faturamento do dia), o frete dessas notas (com reentregas) e o % de frete sobre as vendas.'],
        ['60', 'Custo de frete por pedido', 'Cada pedido: as notas, o valor, o frete (com o rateio do CT-e de várias notas e as reentregas), o % e as transportadoras.'],
    ], [0.1, 0.28, 0.62])
    s += h2('Relatórios de planejamento (tela 331)')
    s.append(P('No menu, em Gestão » <b>Planejamento</b>, cada relatório tem o seu item (todos abrem a tela 331, Ctrl+K 331, com a lista '
               'dos seis ao lado). Vê a tela quem pode ver relatórios. O período vem nos últimos 3 meses.'))
    s += lista([
        '<b>Curva ABC</b>: as linhas vão do maior para o menor valor; classe A = os que somam até 80% do total (a linha que passa '
        'dos 80% ainda é A), B = até 95%, C = o resto. A coluna "% acumulado" mostra onde cada um fica.',
        '<b>Simulação de histórico</b>: as notas já embarcadas (com CT-e) são recalculadas pela tabela de preço de cada transportadora, '
        'com a mesma conta do "Melhor transportadora por destino" (até onde a transportadora leva, redespacho, peso cubado, ICMS). '
        'Notas FOB e notas de entrada ficam fora. Cada transportadora com tabela ganha uma coluna (as 8 que atendem mais notas).',
        'Dois cliques numa linha agrupada mostram as notas (ou, no 86, os CT-e); dois cliques numa nota abrem a nota.',
    ])
    s += tabela(['Nr.', 'Relatório', 'O que mostra'], [
        ['81', 'Relatório analítico de transportadora', 'Cada CT-e do período (data do CT-e), por transportadora: nota, cliente, destino, tipo (entrega, reentrega, devolução...), peso, volumes, valor da nota, frete, frete por kg, frete sobre a nota, previsão, entrega e se foi no prazo. O resumo por transportadora é o 68 (Comparativo).'],
        ['82', 'Curva ABC de clientes e fornecedores', 'Frete das notas emitidas no período por cliente (notas de saída) e por fornecedor (notas de entrada, o frete da compra), cada lado com a sua curva: classe, posição, frete, notas, valor, peso, frete sobre o valor, participação e % acumulado.'],
        ['83', 'Rotas por transportadora', 'Cada transportadora em cada rota: UF de origem (pela chave da NF-e) até a cidade/UF de destino, com notas, peso, valor, frete, frete por kg, frete sobre o valor, prazo médio e % no prazo.'],
        ['84', 'Volumetria', 'Dia a dia (período de até 62 dias) ou mês a mês: notas, volumes, peso, cubagem, valor e frete, com o peso e os volumes por nota, o kg por volume, a densidade (kg/m3) e o frete por kg.'],
        ['85', 'Resultado analítico da simulação de histórico', 'Cada nota embarcada (até 2000 por consulta): o frete real, o valor pela tabela da própria transportadora (e a diferença), a melhor tabela, o valor dela, a economia que teria havido e uma coluna por transportadora. Os cartões somam o frete real, o da melhor tabela, a economia e as notas sem tabela para o destino.'],
        ['86', 'Curva ABC de fretes extras e complementares', 'Os CT-e a mais do período (reentrega, devolução, complementar, redespacho, retorno) por cliente, com a classe ABC pelo valor, a divisão por tipo e as transportadoras.'],
    ], [0.1, 0.28, 0.62])
    s += h2('Relatórios operacionais (tela 332)')
    s.append(P('No menu, em Operar » <b>Controle operacional</b>, cada relatório tem o seu item (todos abrem a tela 332, Ctrl+K 332). '
               'Vê a tela quem pode ver relatórios; os relatórios que usam tabelas de preço, pátio, arquivos EDI, faturas ou as ações '
               'dos usuários (92, 93, 95 e 96) são só de quem vê todos os fretes. O período vem nos últimos 30 dias.'))
    s += lista([
        '<b>Pré-nota</b>: é o pedido que chega na planilha do ERP antes da NF-e (Importação do ERP). Desde a versão 1.74 o sistema '
        'guarda essa linha na nota quando o XML chega, e o relatório 87 compara as duas. Notas que chegaram antes disso aparecem em '
        '"Notas sem pré-nota".',
        '<b>Comparativo de fretes</b> (88) e <b>Possibilidade de agrupamento de CT-e</b> (94) já existiam: na lista da tela eles '
        'aparecem com a seta e abrem o relatório 13 (Frete contratado x cobrado) e a tela Consolidar rotas (314).',
        'Os relatórios 89 e 99 mostram a situação de hoje (o período não vale).',
    ])
    s += tabela(['Nr.', 'Relatório', 'O que mostra'], [
        ['87', 'Comparativo entre nota fiscal e pré-nota fiscal', 'Cada NF-e do período ao lado da pré-nota: valor (e a diferença), volumes, peso (diferença acima de 2%), transportadora, destino e cliente, com "Confere" ou "Diverge" e o que mudou.'],
        ['88', 'Comparativo de fretes', 'Atalho para o 13 · Frete contratado x cobrado.'],
        ['89', 'Transportadoras que possuem arquivos pendentes', 'Por transportadora: notas CIF emitidas há mais de 3 dias ainda sem o CT-e (e o valor delas), CT-e sem a nota e arquivos EDI aguardando conferência ou com erro, com a pendência mais antiga. Dois cliques mostram as notas sem CT-e.'],
        ['90', 'Relação de conhecimentos de frete', 'Todos os CT-e do período, inclusive os cancelados: tomador, remetente, destinatário, trecho, nota, tipo, valor, valor pela tabela e diferença, glosa, situação (em conferência, retido, liberado, faturado, pago, reprovado, cancelado), fatura e chave.'],
        ['91', 'Relação de integração de conhecimentos de frete', 'Cada CT-e que entrou no período: quando, por onde (envio manual, e-mail, SEFAZ, pasta de XML, NF-Stock), quem enviou e quantos dias depois da emissão ele chegou.'],
        ['92', 'Produtividade de resolução de pendência', 'Por usuário: CT-e aprovados e reprovados, glosas, faturas conferidas e decididas, arquivos EDI tratados, contestações abertas e os dias, em média, entre o CT-e chegar e a decisão.'],
        ['93', 'Vigência de tabela de frete', 'Cada tabela de preço: vigente desde, validade, vencimento, dias para vencer, índice de reajuste e as notas e o frete calculados com ela no período. Situação: válida, vence em até 30 dias, vencida, sem validade ou inativa.'],
        ['94', 'Possibilidade de agrupamento de CT-e', 'Atalho para a tela Consolidar rotas (314).'],
        ['95', 'Restrição pessoa tabela de frete', 'Tabelas que valem só para um cliente (o CNPJ/CPF ou todas as filiais pela raiz do CNPJ) e as que cobram descarga só de alguns clientes, com a situação da tabela e quanto o cliente usa.'],
        ['96', 'Operação doca', 'Por doca (Pátio e portaria): visitas, carregamentos, descargas, concluídas, atrasadas, não compareceram, canceladas, espera até a doca, tempo na doca e no pátio, horas de doca ocupada, volumes e peso.'],
        ['97', 'Relação de justificativas de ação', 'Cada ação com motivo escrito no período: aprovação e reprovação de CT-e, glosa, bloqueio de fatura e manifestação de NF-e, com quem fez e quando.'],
        ['98', 'Operação por documentos', 'Por dia (até 62 dias) ou mês: NF-e e CT-e recebidos, CT-e aprovados e reprovados, comprovantes de entrega, ocorrências, faturas e arquivos EDI.'],
        ['106', 'Transportadora do mapa × NF-e × CT-e', 'Notas com mapa no período (data da coleta): a transportadora da NF-e, a que coletou (mapa) e a do CT-e, com a previsão de entrega. Situação: confere, saiu por outra (a NF-e cita uma e coletou outra), CT-e de outra transportadora e aguardando CT-e.'],
        ['99', 'Relação de pendências', 'Tudo o que está pendente hoje, da mais antiga para a mais nova: notas sem CT-e, CT-e retidos, CT-e sem nota, entregas atrasadas, faturas bloqueadas ou vencidas, arquivos EDI parados e contestações sem resposta.'],
    ], [0.1, 0.28, 0.62])
    s += h2('Recursos de todas as telas de relatórios (324 a 332)')
    s.append(P('As telas Relatórios de entregas (324), Desempenho das transportadoras (325), Relatórios NF-e x CT-e (326), '
               'Relatórios de auditoria (327), Relatórios de rotas e operação (328), Relatórios financeiros (329), Relatórios de planejamento (331) e Relatórios operacionais (332) funcionam do mesmo jeito:'))
    s += lista([
        '<b>Filtros</b>: período, transportadora, cliente (nome ou CNPJ), cidade e UF; em <b>Mais filtros</b>, a filial (a empresa '
        'que emitiu a nota, pelo CNPJ), o número da NF-e e do CT-e (um ou vários, separados por vírgula ou espaço) e o status do '
        'frete. Na 328: veículo, motorista, cidade e UF; em Mais filtros, a unidade, a transportadora (parceiro), o cliente '
        '(destinatário), a NF-e, o CT-e e a situação do romaneio.',
        '<b>Situação (no relatório)</b>: quando o relatório tem uma coluna de situação (Atrasada, Acima da tabela, Confere...), '
        'escolha uma para ver só as linhas com ela; os totais, o gráfico, o Excel e a impressão seguem o filtro.',
        '<b>Ordenação</b>: clique no título da coluna (de novo inverte).',
        '<b>Totalizador</b>: a última linha da tabela soma as quantidades e os valores das linhas mostradas (médias, índices e '
        'percentuais não se somam).',
        '<b>Gráfico</b> (botão para mostrar ou esconder): nos relatórios agrupados e por período, barras da coluna escolhida (os 15 '
        'maiores, ou os meses e dias em ordem); nos relatórios em lista, quantas linhas há em cada situação.',
        '<b>Excel</b>, <b>PDF</b> e <b>Imprimir</b>: o Excel leva as linhas mostradas e o total; o PDF abre o relatório pronto '
        '(título, filtros, totais, gráfico e tabela) para escolher "Salvar como PDF" no destino da impressão.',
        '<b>Drill-down</b>: nos relatórios agrupados (por transportadora, cliente, cidade, estado, rota, mês, dia, veículo, '
        'motorista), clique na linha para ver os documentos daquele grupo (as notas, os CT-e auditados ou os romaneios); '
        '"Voltar" retorna ao relatório. Nas listas, <b>dois cliques</b> abrem o documento de origem: a nota, ou o romaneio na 328.',
        '<b>Tela de trabalho</b>: quando o relatório mostra documentos que se tratam em outra tela (aprovar, glosar, religar, aceitar, '
        'buscar na SSW, pagar), o botão <b>Abrir ...</b> leva até ela: 11 a 18 e 24 para a Auditoria de frete (330), 25 para Notas e seus '
        'CT-e (320), 26 a 28 para Inconsistências NF-e x CT-e (322), 34 para Anomalias e duplicidades (318), 35 e 37 a 39 para Entregas '
        'previstas (311) e 51 a 56 para o Pagamento de fretes (130).',
        '<b>Atalhos</b>: o 16 abre a tela Cobranças indevidas (323) e o 62 abre o relatório 50 (SLA de entrega), que já mostram a mesma coisa; '
        'aparecem na lista em itálico, com a seta.',
    ])
    s += h2('Relatórios de auditoria (tela 327)')
    s.append(P('Em Auditoria de fretes, sob Relatórios, <b>Relatórios de auditoria</b> (Ctrl+K e 327) traz os relatórios 11 a 24 e 100 a 105, na mesma tela dos '
               'relatórios de entregas: lista à esquerda, período (vem nos últimos 30 dias, pela emissão do CT-e), filtros, totais em '
               'cartões, tabela ordenável, <b>Excel</b> e <b>Imprimir</b>; dois cliques numa linha abrem a nota. Os números são os '
               'mesmos das telas de auditoria: o frete pela tabela gravado no cálculo, a tolerância configurada (geral, por '
               'transportadora e por componente), a conferência componente a componente e o Resultado da auditoria.'))
    s += tabela(['Nr.', 'Relatório', 'O que mostra'], [
        ['11', 'Auditoria de CT-e', 'Cada CT-e: cobrado x pela tabela, a situação (confere, acima, abaixo, sem tabela), os apontamentos da conferência e a decisão (retido, aprovado, glosado, reprovado, faturado).'],
        ['12', 'Divergência de frete', 'Só os CT-e fora da tolerância, para mais ou para menos, com o componente que explica a diferença e a tabela usada.'],
        ['13', 'Frete contratado x cobrado', 'Por transportadora: contratado pela tabela, cobrado, diferença e quantos CT-e conferem, vieram acima, abaixo ou sem tabela.'],
        ['14', 'Auditoria por transportadora', 'Cobrado a mais, glosas, créditos, CT-e barrados, recuperado, aprovado divergente e em apuração, mais os apontamentos (taxas não previstas, peso, ICMS/CFOP).'],
        ['15', 'Auditoria por período', 'O mesmo, mês a mês, com o % de CT-e divergentes.'],
        ['16', 'Cobranças indevidas', 'Atalho: abre a tela Cobranças indevidas (323), que faz a mesma conferência componente a componente (não há um relatório repetido).'],
        ['17', 'Fretes acima da tabela', 'CT-e cobrados acima do contratado, do maior excesso para o menor, e quanto ainda está retido.'],
        ['18', 'Fretes abaixo da tabela', 'CT-e cobrados abaixo do calculado. Muitos da mesma transportadora costumam indicar tabela desatualizada no sistema.'],
        ['19', 'Auditoria de ICMS', 'CST, base, alíquota cobrada x esperada pela rota (7% ou 12%; no redespacho, o trecho até o redespacho), valor x base x alíquota e CFOP.'],
        ['20', 'Auditoria de adicionais', 'Pedágio, GRIS, TDE, TDA, TRT, despacho, descarga e outras taxas, cobrado x tabela (taxa que a tabela não prevê aparece como "Não prevista"), e os CT-e de reentrega.'],
        ['21', 'Auditoria de peso', 'Peso real das notas, cubagem, peso cubado, peso considerado no cálculo e o peso do CT-e; aponta o CT-e que cobrou peso maior que o real e o cubado.'],
        ['22', 'Auditoria de distância', 'Km estimado entre as cidades de início e fim do CT-e (linha reta x 1,2; o CT-e e as tabelas não trazem km), a cidade pela qual a tabela foi calculada e o frete por km. Aponta tarifa de outra cidade e frete por km 50% acima do padrão (mediana) da transportadora.'],
        ['23', 'Auditoria de redespacho', 'Notas com redespacho: o CT-e até a cidade do redespacho e o do redespacho, cada um x a tabela, o custo total e as notas sem o CT-e do redespacho.'],
        ['24', 'Economia gerada pela auditoria', 'Recuperado (glosas manuais, por regra e por contestação, créditos em fatura e CT-e barrados) e evitado (o que os CT-e retidos cobram a mais), por transportadora.'],
        ['100', 'Frete complementar', 'Os CT-e complementares do período: o CT-e original, o valor dele, o complemento, quanto ele soma sobre o original e a decisão da auditoria.'],
        ['101', 'Espelho de embarque', 'Cada embarque (o mapa de carregamento do ERP; sem mapa, a transportadora no dia da saída): notas, clientes, destinos, volumes, peso, cubagem, valor, frete previsto pela tabela, frete cobrado nos CT-e e notas ainda sem CT-e. Dois cliques mostram as notas do embarque.'],
        ['102', 'Espelho de pré-conhecimento', 'As notas CIF que ainda esperam o CT-e, com o frete que a transportadora deve cobrar pela tabela, parcela por parcela (frete peso, ad valorem, GRIS, pedágio, outras taxas, ICMS), o prazo, a previsão e a tabela. O botão PDF imprime o espelho para mandar à transportadora.'],
        ['103', 'Conhecimentos por valor', 'Os CT-e em faixas de valor (até R$ 100, R$ 100 a 250, ... acima de R$ 5.000): quantos, quanto somam, participação, valor médio, peso médio e frete por kg. Os complementares ficam no 100.'],
        ['104', 'Fretes por componente', 'O frete aberto por componente (frete peso, ad valorem, GRIS, pedágio, TDE, TDA, TRT, despacho, descarga e outras taxas; o ICMS destacado aparece num cartão à parte): cobrado, pela tabela, diferença, parte no frete e em quantos CT-e veio acima ou não prevista. Só entram os CT-e cujo XML traz a composição do frete.'],
        ['105', 'Estratificação de fretes', 'As notas em faixas de peso (sem peso, até 10 kg, 10 a 30 kg, ... acima de 10 t): notas, peso, valor, frete (com reentregas e rateio), parte do frete, frete por kg, frete médio por nota e frete sobre o valor.'],
    ], [0.1, 0.28, 0.62])
    s.append(P('Nos relatórios 14, 15 e 24 (os do Resultado da auditoria) só o filtro de transportadora vale.'))
    s += h2('Relatórios NF-e x CT-e (tela 326)')
    s.append(P('Em Fretes contratados, sob Relatórios, <b>NF-e x CT-e</b> (Ctrl+K e 326) traz os relatórios 25 a 34, na mesma tela dos '
               'relatórios de entregas: lista à esquerda, período (vem nos últimos 30 dias), filtros de transportadora, cliente, cidade '
               'e UF, totais em cartões, tabela ordenável, <b>Excel</b> e <b>Imprimir</b>; dois cliques numa linha abrem a nota. '
               'Usa as mesmas regras da tela NF-e x CT-e (322) e da regra única de duplicidade.'))
    s += tabela(['Nr.', 'Relatório', 'O que mostra'], [
        ['25', 'NF-e vinculadas ao CT-e', 'Cada CT-e emitido no período e as notas que ele leva (CT-e de várias notas mostra todas; CT-e de reentrega, devolução etc. mostra a nota de origem), com o frete sobre o valor das notas.'],
        ['26', 'NF-e sem CT-e', 'Notas emitidas no período, há pelo menos 3 dias, que precisam de CT-e e ainda não têm, sem as aceitas na tela 322 (a mesma regra da 322). Ficam fora devolução, entrada, sem circulação, FOB e carga direta; os cartões mostram quantas ficaram fora.'],
        ['27', 'CT-e sem NF-e identificada', 'Sem as diferenças aceitas na tela 322: CT-e cuja nota não está no sistema, que cita nota não encontrada, que não cita chave de NF-e ou com vínculo suspeito (destinatário ou cidade diferente da nota ligada).'],
        ['28', 'Conferência de valores NF-e', 'Sem as diferenças aceitas na tela 322: valor da mercadoria e peso do CT-e x soma das notas, e frete cobrado x frete pela tabela. Tolerâncias: valor R$ 1 ou 0,5%, peso 1 kg ou 5%, frete R$ 1 ou 0,5%.'],
        ['29', 'NF-e por transportadora', 'Notas emitidas no período por transportadora (a do CT-e; sem CT-e, a da nota): valor, peso, volumes, com e sem CT-e, entregues e frete.'],
        ['30', 'NF-e por destinatário', 'As mesmas colunas por cliente, com o CNPJ.'],
        ['31', 'NF-e por rota', 'Por região e estado de destino, com quantas cidades foram atendidas.'],
        ['32', 'NF-e por período', 'Dia a dia (mês a mês em períodos de mais de 62 dias): notas emitidas, expedidas (data de saída ou coleta), com CT-e emitido e entregues.'],
        ['33', 'Chaves de acesso', 'Chave de cada nota e a do CT-e que a leva, com a conferência do dígito verificador (Válida, Chave inválida, Sem chave). O botão <b>Copiar chaves</b> copia todas, uma por linha.'],
        ['34', 'Documentos duplicados', 'NF-e repetida (mesmo número e emitente), CT-e repetido (mesmo número e transportadora), nota com mais de um CT-e sem vínculo explicado e nota devolvida e refaturada com CT-e nas duas.'],
    ], [0.1, 0.28, 0.62])
    s += h2('Relatórios de entregas (tela 324)')
    s.append(P('Em Fretes contratados, sob Relatórios, <b>Entregas e rastreamento</b> (Ctrl+K e 324) reúne 16 relatórios de entregas e '
               'rastreamento. Escolha o relatório na lista da esquerda; o período vem nos últimos 30 dias e pode ser trocado. '
               'Filtros: transportadora, cliente (nome ou CNPJ), cidade e UF. Cada relatório mostra os totais em cartões, '
               'a tabela pode ser ordenada clicando no título da coluna, e há os botões <b>Excel</b> e <b>Imprimir</b>. '
               'Dois cliques numa linha abrem o detalhe da nota. Precisa da permissão de ver relatórios.'))
    s += tabela(['Nr.', 'Relatório', 'O que mostra (o período vale para)'], [
        ['35', 'Entregas previstas', 'Notas com previsão de entrega no período, com a situação (entregue no prazo, com atraso, atrasada, no prazo).'],
        ['36', 'Entregas realizadas', 'Notas entregues no período (data da entrega), com os dias de atraso e a origem da data.'],
        ['37', 'Entregas atrasadas', 'Notas sem entrega com a previsão já vencida, e os dias de atraso.'],
        ['38', 'Entregas de hoje', 'Previsão para hoje (não usa o período).'],
        ['39', 'Próximos 7 dias', 'Previsão de amanhã até 7 dias (não usa o período).'],
        ['40', 'Entregas pendentes', 'Todas as notas ainda não entregues emitidas no período (inclusive sem CT-e).'],
        ['41', 'Entregas em trânsito', 'Notas com CT-e, sem entrega e dentro do prazo, com a última ocorrência do rastreio.'],
        ['42 a 45', 'Por transportadora, cliente, cidade e estado', 'Notas emitidas no período agrupadas: entregues, no prazo, atrasadas, pendentes, % no prazo e prazo médio.'],
        ['46', 'Ocorrências de entrega', 'Eventos do rastreamento no período, separados por tipo (recusa, avaria, ausente, reentrega...). "Só problemas" tira entregas e informativos.'],
        ['47', 'Reentregas', 'CT-e de reentrega emitidos e ocorrências de reentrega no período.'],
        ['48', 'Comprovantes de entrega', 'Notas entregues no período, com recebedor, assinatura e foto do canhoto (link para abrir a foto).'],
        ['49', 'Rastreamento por transportadora', 'Quantas notas cada transportadora atualizou, quando foi a última atualização, notas sem rastreio e com problema.'],
        ['50', 'SLA de entrega', 'Notas entregues no período: no prazo, fora do prazo, % SLA, atraso médio e prazo médio por transportadora.'],
    ], [0.1, 0.28, 0.62])
    s += h2('Desempenho das transportadoras (tela 325)')
    s.append(P('Em Gestão » Transportadoras, sob Relatórios, <b>Desempenho e ranking</b> (Ctrl+K e 325) traz os relatórios 61 a 70, na mesma '
               'tela dos relatórios de entregas: lista à esquerda, período (vem nos últimos 3 meses), filtros de transportadora, '
               'cliente, cidade e UF, totais em cartões, tabela ordenável, <b>Excel</b> e <b>Imprimir</b>.'))
    s += lista([
        '<b>Custo</b>: os CT-e emitidos no período (sem os cancelados, os rejeitados e os de transportadora que não levou a nota). '
        'Cada CT-e conta uma vez; o CT-e de várias notas conta cada nota no custo por NF-e. O frete inclui reentregas e complementares.',
        '<b>Prazo</b>: notas entregues no período; no prazo é a entregue até a data prevista.',
        '<b>Ocorrências, rastreamento e atrasos em aberto</b>: notas emitidas no período.',
        '<b>Nota geral (0 a 10)</b>: prazo 35%, custo 30% (frete sobre o valor das notas, comparado entre as transportadoras: '
        'a mais barata tira 10 e a mais cara 0), ocorrências 15% (20% de notas com problema ou mais tira 0), comprovante de '
        'entrega 10% e rastreamento 10%. Critério sem dado sai da conta. Conceito: A 8,5 ou mais, B 7 ou mais, C 5 ou mais, D abaixo de 5.',
    ])
    s += tabela(['Nr.', 'Relatório', 'O que mostra'], [
        ['61', 'Ranking de transportadoras', 'Posição pela nota geral, conceito, % no prazo, frete sobre o valor das notas, notas com problema e custo por entrega.'],
        ['62', 'Índice de entregas no prazo', 'Atalho: abre o relatório 50 · SLA de entrega (tela 324), que mostra o índice de entregas no prazo por transportadora.'],
        ['63', 'Índice de atrasos', 'Entregues com atraso, índice de atraso, atraso médio, maior atraso e notas em aberto já atrasadas.'],
        ['64', 'Índice de ocorrências', 'Notas com problema no transporte e quantas foram de avaria, recusa, extravio, devolução e ausente/endereço/reentrega.'],
        ['65', 'Custo médio por entrega', 'Frete dividido pelas entregas (CT-e principais), com o valor de reentregas e complementares.'],
        ['66', 'Custo médio por kg', 'Frete dividido pelo peso dos CT-e.'],
        ['67', 'Custo médio por NF-e', 'Frete dividido pelas notas transportadas e o frete sobre o valor das notas.'],
        ['68', 'Comparativo de transportadoras', 'Custos e prazo lado a lado, com "vs média": verde quando a transportadora está melhor que a média, vermelho quando pior.'],
        ['69', 'Avaliação das transportadoras', 'A nota de cada critério, a nota geral e o conceito.'],
        ['70', 'Histórico de desempenho', 'Mês a mês, nos 12 meses até a data final: entregues, % no prazo, atraso e prazo médio, frete, custo por entrega e por kg, notas com problema e reentregas. Escolha uma transportadora no filtro para ver só ela.'],
    ], [0.1, 0.28, 0.62])
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
        '"Redespacho (informativo)" na lista e em cinza no histórico — e não muda nenhuma data. Na nota <b>sem redespacho</b>, '
        'a entrega na cidade do cliente vale mesmo quando foi lançada na SSW por um parceiro da transportadora (ex.: a FAST-X '
        'usa um agente para a entrega em Fortaleza): ela baixa a nota. Na nota com redespacho, a entrega da transportadora do CT-e '
        'é a feita no ponto de redespacho (ex.: a Sete Lagoas entrega em Guarulhos para a SOT levar a Cuiabá). A consulta pela '
        'chave da NF-e às vezes traz só os eventos da outra transportadora: o sistema decide olhando também o histórico já '
        'guardado da nota, e o "ANEXADO COMPROVANTE DE ENTREGA" com "Entrega realizada em dd/mm/aa" também conta como entrega.',
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
        'clique em <b>Testar conexão</b>: aparece quantas notas vieram do portal. Atenção: não use o tipo "Lonngren" com o link '
        'do site da LD Rio (o sistema troca sozinho para "Central de Canhotos" se isso acontecer, mantendo o e-mail e a senha). '
        'A busca das 6h30 e o botão de rastreamento '
        'passam a preencher a Data da Entrega (origem "portal"), com quem recebeu e a situação da nota. A nota do portal é '
        'reconhecida pela chave da NF-e, pelo nº do CT-e ou pelo nº da NF (com a data perto da do CT-e, até 25 dias). Se o portal '
        'mudar o formato, o teste mostra as colunas que vieram, para o suporte ajustar.',
        '<b>Conferir no portal</b>: na lista de entregas (atrasadas, hoje, próximos dias), as notas de transportadora com a '
        'Central de Canhotos têm o botão <b>Conferir no portal</b>. Ele procura aquela nota no portal e mostra, passo a passo, '
        'por que ela não baixou: a nota não entra na busca (nome ou CNPJ do cadastro diferente do CT-e, CT-e com mais de 120 '
        'dias), o login não foi aceito, a nota não aparece para esse login, achou com data longe da do CT-e ou o portal não tem '
        'a data da entrega. Se estiver entregue no portal, já dá a baixa. "O que o portal tem desta nota" mostra as colunas que '
        'vieram, para conferir.',
        '<b>EDI (OCOREN)</b>: arquivo de ocorrências de entrega no padrão PROCEDA — veja o documento de solicitação de '
        'integração EDI para enviar à transportadora.',
        '<b>Link de rastreamento</b>: no cadastro da transportadora, o endereço com {NF}, {CTE} ou {CHAVE_NFE} coloca o botão '
        'Rastrear na lista.',
        'Sem nenhuma dessas, a entrega é lançada pelo botão <b>Entregue</b> ou pelo comprovante de entrega do registro. '
        'Na coluna Nota aparecem também a <b>data de emissão do CT-e</b> e um botãozinho com o começo e o fim da <b>chave de acesso '
        'do CT-e</b> (passando o mouse aparece a chave inteira; o clique copia a chave completa); '
        'a busca aceita a chave (ou um pedaço dela, com 20 números ou mais) e o Excel traz a chave numa coluna. '
        'Embaixo do botão <b>Entregue</b> há um campo de data: escolha o dia em que a entrega foi realizada e clique em Entregue, '
        'que a entrega é registrada direto nessa data (sem o campo preenchido, o sistema pergunta a data: ela já vem selecionada, '
        'é só digitar os números por cima, que as barras entram sozinhas; ex.: 19102026, ou 1910 para o ano atual). A data não pode ser '
        'no futuro nem antes da emissão do CT-e.',
    ])
    s += h2('Montar Relatório (BI)')
    s.append(P('Primeiro escolha a <b>Fonte dos dados</b>. Aparecem só as que o seu usuário pode ver:'))
    s += tabela(['Fonte', 'O que tem', 'Quem vê'], [
        ['Fretes contratados', 'Notas e CT-e recebidos das transportadoras (o relatório de sempre, com mais de 120 campos)', 'Quem tem Relatórios'],
        ['CT-e emitidos', 'Os CT-e da própria transportadora: número, chave, situação, tomador, destino, valor, previsão e entrega, '
         'averbação, fatura, filial e vendedor', 'Quem emite CT-e ou vê o financeiro'],
        ['Faturas a receber', 'Faturas aos clientes: valores, recebido, saldo, vencida e dias de atraso, quantidade de CT-e, boleto', 'Quem vê o financeiro'],
        ['Faturas das transportadoras', 'Faturas recebidas: valor x soma dos CT-e x tabela, glosas, conferência, aprovação e pagamento',
         'Quem confere faturas, aprova pagamento, vê o financeiro ou a auditoria'],
        ['Contas a pagar', 'Descrição, categoria, fornecedor, vencimento, competência, valor, pago, saldo, centro de custo, departamento e filial', 'Quem vê o financeiro'],
        ['Acertos de viagem', 'Motorista, contratado, placa, frete, adiantamento, retenções, vale-pedágio, saldo e o piso da ANTT (e se ficou abaixo)',
         'Quem vê o financeiro ou emite CT-e'],
    ], [0.22, 0.53, 0.25])
    s.append(P('Também valem a grade de telas do usuário (Cadastros &gt; Usuários) e as filiais dele: quem só enxerga uma filial vê só '
               'os CT-e e as contas dela. Nas outras fontes, os filtros são: <b>período</b> (escolha por qual data: emissão, vencimento, '
               'pagamento...), <b>situação</b> e <b>procurar</b> (nome, número, CNPJ). Agrupar, totalizar, ordenar, Excel e modelos '
               'funcionam igual em todas as fontes.'))
    s.append(P('Nos fretes contratados, escolha os filtros e os campos, veja a prévia e exporte para Excel. Filtros (todos opcionais): transportadora '
               '(da NF ou do CT-e), cliente (nome ou CNPJ, inclusive só a raiz para pegar todas as filiais), UF de destino, status, '
               'aprovação do pagamento, períodos de emissão da NF, de emissão do CT-e e da entrega, <b>só com diferença CT-e x '
               'tabela</b> e <b>só com glosa</b>. <b>Limpar filtros</b> apaga todos.'))
    s.append(P('São mais de 120 campos, em grupos. Use <b>Procurar campo</b> para achar pelo nome (ex.: "icms", "chave", '
               '"entrega"); com a busca ativa, <b>Marcar todos</b> marca só os campos que aparecem. Os grupos:'))
    s += lista([
        '<b>Identificação</b>: pedido, NF (número, série, chave), CT-e (número, série, chave, protocolo), fatura e mapa.',
        '<b>Datas</b>: pedido, emissão e saída da NF, emissão do CT-e, fatura, vencimento, coleta, entrega, previsão de entrega, '
        'entrega final do redespacho, entrega agendada e data do mapa.',
        '<b>Cliente e destino</b> e <b>Emitente e partes do CT-e</b>: cliente e CNPJ, cidade, UF, redespacho, emitente da NF, '
        'remetente, destinatário e tomador do CT-e, cidades e UF de início e fim.',
        '<b>Transportadora</b>: da NF e do CT-e (com CNPJ), quem definiu, tabela, prazo da tabela, tipo do CT-e, tipo de serviço e modal.',
        '<b>Carga</b>, <b>Valores</b> e <b>Taxas</b>: volumes, pesos, cubagem, valor dos produtos, frete tabelado, negociado, do '
        'CT-e, rateado e as taxas.',
        '<b>Fiscal do CT-e</b>: CFOP, CST, base, alíquota e valor do ICMS.',
        '<b>Entrega e rastreio</b>: situação do prazo, origem da data de entrega, última ocorrência, canhoto e quem recebeu.',
        '<b>Status e glosa</b> e <b>Situações da nota e do CT-e</b>: aprovação (quem, quando, motivo), glosa, NF cancelada, '
        'denegada, devolvida, complementar, CT-e cancelado e alertas (Sim/Não).',
    ])
    s.append(P('<b>Exportar p/ Excel</b> gera uma planilha .xlsx com filtro no cabeçalho: valores como número e datas como data '
               '(dá para somar, filtrar e montar tabela dinâmica direto). Na prévia, datas em dd/mm/aaaa, valores com vírgula e as '
               'situações como Sim/Não.'))
    s += h3('Ordem das colunas e ordenação')
    s += lista([
        'Os campos marcados aparecem no quadro <b>Colunas, ordem e agrupamento</b>, na ordem das colunas do relatório. '
        '<b>Arraste</b> uma coluna para outra posição (ou use as setas); o X tira a coluna.',
        '<b>Ordenar por</b> escolhe a coluna que manda na ordem das linhas e <b>Sentido</b> se é do maior para o menor (ou mais '
        'recente primeiro) ou o contrário. Sem escolher, vêm os registros mais recentes primeiro.',
    ])
    s += h3('Agrupar e totalizar')
    s.append(P('Em <b>Agrupar por</b>, escolha um campo (transportadora, cliente, UF, status...) e, se quiser, um segundo nível em '
               '<b>Depois por</b>. Em vez de uma linha por registro, sai uma linha por grupo, com a <b>quantidade de registros</b> e o '
               'total de cada campo de valor marcado (Valor Faturado, Vlr. CT-e, Valor Total do Frete, pesos, taxas...), e a linha '
               '<b>TOTAL GERAL</b> no fim. Os campos de texto marcados não entram no agrupado.'))
    s += lista([
        'Agrupando por uma data (emissão da NF, do CT-e, entrega...), escolha o <b>período</b>: por mês (padrão), por dia ou por ano. '
        'Exemplo: Agrupar por Transportadora, Depois por Data Emissão NF (mês), com Valor Faturado e Valor Total do Frete marcados, '
        'dá o frete de cada transportadora mês a mês.',
        '<b>Totalizar os valores com</b>: Automático (soma; os percentuais, como % Frete e alíquota do ICMS, pela média), Soma, '
        'Média, Mínimo ou Máximo. O total geral é calculado sobre todos os registros (a média geral não é a média das médias).',
        'Agrupado, o <b>Ordenar por</b> oferece o próprio grupo, a quantidade e os totais (ex.: transportadoras do maior frete para '
        'o menor). Sem escolher: datas em ordem; nos outros grupos, os com mais registros primeiro.',
        'O Excel sai igual à prévia, com a linha TOTAL GERAL. A ordem das colunas e o agrupamento ficam guardados no modelo salvo.',
    ])
    s += h3('Modelos salvos')
    s += lista([
        'Marque os campos e os filtros e clique em <b>Salvar como modelo</b>, com um nome (ex.: "Fretes do mês por transportadora"). '
        'Marque <b>Compartilhar</b> para os outros usuários com acesso a Relatórios também usarem.',
        'Em <b>Modelo salvo</b>, escolha o modelo: os campos e os filtros voltam marcados e a prévia aparece na hora. Depois é só '
        'trocar o período, se quiser, e exportar.',
        '<b>Salvar alterações</b> grava no modelo os campos e filtros de agora; <b>Excluir modelo</b> apaga. Só quem criou (ou o '
        'administrador) altera ou exclui; os outros podem salvar uma cópia com outro nome.',
        'O modelo guarda a fonte: ao escolher um modelo de contas a pagar, a tela muda sozinha para essa fonte.',
    ])
    s += h3('Envio automático por e-mail')
    s.append(P('Com um modelo seu escolhido, clique em <b>Envio por e-mail</b>. O sistema monta o relatório sozinho e manda por e-mail, '
               'com a <b>planilha anexa</b> e as primeiras 30 linhas (e o total geral) no corpo da mensagem.'))
    s += lista([
        '<b>Para</b>: um ou mais e-mails, separados por vírgula (até 20).',
        '<b>Frequência</b>: todo dia (pode ser só em dias úteis), toda semana (escolha o dia) ou todo mês (dia 1 a 28), na <b>hora</b> escolhida.',
        '<b>Período em cada envio</b>: o período salvo no modelo, ou um período que anda sozinho: ontem, últimos 7 dias, semana '
        'anterior (segunda a domingo), últimos 30 dias, mês atual ou mês anterior. Nos fretes vale pela emissão da NF; nas outras '
        'fontes, pela data escolhida no filtro de período do modelo.',
        '<b>Enviar agora (teste)</b> manda na hora, sem mudar o próximo envio. Embaixo do modelo aparecem o próximo envio e o '
        'resultado do último (enviado ou o erro, ex.: e-mail não configurado).',
        'Usa o e-mail configurado em Configurações &gt; E-mail. O relatório é montado com o acesso de quem criou o modelo: se essa '
        'pessoa for desativada ou perder o acesso a Relatórios, o envio para e o motivo aparece no último envio.',
    ])
    s += h3('Limite de linhas')
    s.append(P('Cada relatório traz até 50.000 linhas (ou 5.000 grupos, agrupado). Quando há mais, a prévia avisa em laranja, a '
               'planilha ganha uma linha de aviso no fim e o e-mail também avisa. Use um filtro (ex.: um período menor) ou agrupe para '
               'ver tudo.'))
    s += h2('Comparar Cotações e simulador')
    s.append(P('<b>Comparar</b>: informe cidade, volumes, peso, cubagem e valor da nota; o sistema calcula o frete em '
               '<b>todas</b> as transportadoras com tabela para essa cidade, do mais barato ao mais caro. <b>Simulador '
               '"E se eu tivesse trocado de transportadora?"</b>: recalcula o histórico de uma transportadora com a tabela '
               'de outra, para saber se vale a pena trocar.'))
    s += h2('Anomalias e duplicidades')
    s.append(P('<b>Fretes fora do padrão</b>: compara cada frete com a média da mesma transportadora e mostra os que '
               'ficaram mais de 2 desvios-padrão acima ou abaixo (só transportadoras com pelo menos 5 fretes). '
               '<b>Possíveis duplicidades</b>: o mesmo CT-e (número da mesma transportadora) ou a mesma NF-e (número do mesmo '
               'emitente) em mais de um registro, com a coluna do emitente ou transportadora. Zeros à esquerda não contam '
               '(000123 = 123). Não entram: CT-e cancelado, CT-e a mais da mesma nota (reentrega, devolução, redespacho) e as '
               'notas cobertas por um CT-e de várias notas. É a mesma regra dos avisos "CT-e aparece 2x" / "NF-e aparece 2x" da '
               'Auditoria de frete.'))
    s += h2('Scorecard de transportadoras')
    s.append(P('A nota geral de cada transportadora nos últimos 12 meses, de 0 a 10, com o conceito (A, B, C ou D): a <b>mesma nota</b> do '
               'Ranking (61) e da Avaliação das transportadoras (69), em Desempenho das transportadoras (prazo 35%, custo 30%, ocorrências 15%, '
               'comprovante 10% e rastreamento 10%). Mostra também, só como informação, o % de CT-e retidos pela auditoria e os sinistros. '
               'O link no alto abre o Ranking, onde dá para escolher outro período.'))
    s += h2('NF-e × CT-e')
    s.append(P('Cada nota com todos os CT-e vinculados (principal, reentrega, outra transportadora...), valor da nota, '
               'soma dos fretes e situação. Nota coberta pelo CT-e de outra nota mostra o CT-e e a parte do frete dela.'))
    s += h2('Cobranças indevidas (323)')
    s.append(P('No período (pela emissão do CT-e) e, se quiser, de uma transportadora: cada CT-e conferido componente por '
               'componente com a tabela. Mostra o total <b>cobrado a mais</b>, quantos CT-e têm apontamento, quantos de cada '
               'tipo (componente a mais, taxa não prevista, peso, volumes, base, valor e alíquota do ICMS, CFOP), o cobrado a '
               'mais por componente, por transportadora e por mês, e a lista dos CT-e com os apontamentos. Exporta para Excel. '
               'CT-e que não detalha os componentes é conferido só pelo total, na Auditoria de Frete.'))
    s += h2('Inconsistências NF-e × CT-e (322)')
    s.append(P('<b>Pesquisa</b> no alto: digite o número da NF, do CT-e ou a chave de 44 dígitos e veja cada CT-e com todas '
               'as notas dele (valor, peso, parte do frete, entrega) e os CT-e a mais (reentrega, complementar). Embaixo, a '
               '<b>lista única</b> de problemas, com um filtro por tipo e a exportação para Excel:'))
    s += lista([
        '<b>Nota sem CT-e</b> há pelo menos N dias (escolha 0 a 30; padrão 3), sem as notas canceladas, devolvidas, de '
        'entrada, sem circulação, FOB por conta do cliente e de carga direta.',
        '<b>CT-e sem nota</b>: CT-e importado cuja nota não está no sistema (mostra a NF que ele cita).',
        '<b>Valor da mercadoria diferente</b>: o valor declarado no CT-e contra a soma das notas dele (tolerância de 0,5% ou R$ 1).',
        '<b>Peso diferente</b>: o peso do CT-e contra a soma das notas (5% ou 1 kg).',
        '<b>Destinatário diferente</b> e <b>cidade de destino diferente</b>: o CNPJ e a cidade/UF do CT-e contra os da nota '
        '(com redespacho, a 1ª perna pode terminar na cidade do redespacho). São os <b>vínculos suspeitos</b>.',
        '<b>Transportadora da NF-e × CT-e diferente</b>, <b>CT-e cancelado cobrado</b> (em fatura ou liberado) e '
        '<b>possível cobrança em dobro</b>.',
        '<b>Transportadora do mapa × CT-e diferente</b>: o CT-e da entrega é de uma transportadora que não é a que coletou '
        '(TRANSPORTADORA_MAPA da planilha do ERP). Compara pela raiz do CNPJ ou pelo nome.',
    ])
    s += lista([
        '<b>Religar</b> (quem edita registros ou aprova pagamento): mostra as notas candidatas (as que o CT-e cita e as sem '
        'CT-e do mesmo destinatário) e passa o CT-e para a nota marcada, com o motivo. A nota de onde ele saiu volta a '
        'esperar CT-e. CT-e que já está em fatura não muda (desfaça a conferência da fatura antes).',
        '<b>Desligar</b>: tira o CT-e da nota (ele vira um "CT-e sem nota"), com o motivo. Ele não volta sozinho para essa nota.',
        '<b>Aceitar</b>: quando a diferença está certa (peso cubado, coleta parcial...), explique o motivo; sai da lista e fica '
        'em "Ver as aceitas", onde dá para desfazer.',
    ])
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
    s += h1('20-A. Pátio e portaria')
    s.append(P('Controle de quem vem <b>carregar</b> (a transportadora que coleta as notas) ou <b>descarregar</b> (recebimento de '
               'fornecedor): agendamento da janela, check-in na portaria pelo <b>QR Code</b>, fila do pátio, chamada para a doca, '
               'operação e saída. Menu <b>Pátio e portaria</b> (Painel 420, Portaria 421, Agendamentos 422, Docas e regras 423, Ordens de coleta e descarga 424, Painel de expedição 425, Kanban 426, Minha doca 427). '
               'Para quem só trabalha na portaria, use o modelo de acesso <b>Portaria e pátio</b> (Cadastros, Usuários).'))
    s += h2('Docas e regras (423)')
    s += lista([
        'Cadastre cada doca com a <b>operação</b> (só carregamento, só descarga ou as duas), os <b>veículos aceitos</b> (utilitário, '
        'toco, truck, carreta, bitrem, contêiner; nenhum marcado = todos) e o <b>tempo padrão</b> de uma operação.',
        '<b>Alocação automática</b> (ligada no início): quando uma doca fica livre, o próximo da fila que serve para ela é chamado sozinho.',
        '<b>Tolerância de atraso</b>: quem chega até o fim da janela agendada mais a tolerância mantém a prioridade. '
        '<b>"Não compareceu" depois de</b>: o agendamento que passou desse tempo sem chegar aparece como "Não veio" nas próximas chegadas.',
        'Doca que já foi usada não é apagada: fica inativa e o histórico continua.',
    ])
    s += h2('Kanban gerencial (426)')
    s.append(P('Um quadro com uma coluna por etapa, para o gestor ver onde as coisas estão paradas. Atualiza sozinho a cada 20 segundos e '
               'tem tela cheia. Dois quadros, escolhidos no alto (o navegador lembra a escolha):'))
    s += lista([
        '<b>Veículos (pátio)</b>: Agendado (próximas 24 horas e os atrasados), No pátio aguardando doca, Chamado para a doca, Em operação na '
        'doca, Liberado e Saiu hoje. Cada cartão mostra a placa, a transportadora, o motorista, as notas, a doca e o tempo na etapa; cada '
        'coluna, a contagem, o tempo médio e quantos estão com alerta. O botão do cartão faz o próximo passo (Chegou, Chamar, Encostou, '
        'Terminou, Saída).',
        '<b>Alertas</b> (cartão com a borda vermelha): agendado atrasado ou que não veio, esperando a doca há mais de 1 hora, chamado e '
        'não encostou em 15 minutos, na doca além do tempo previsto (o informado, a média real da doca ou o padrão dela) e liberado há '
        'mais de 20 minutos sem sair.',
        '<b>Notas (expedição)</b>: as mesmas etapas do painel de expedição (sem ordem de coleta, aguardando a transportadora, coleta '
        'confirmada, atrasada, no pátio, expedida hoje), com os volumes e a idade média das notas de cada coluna.',
    ])
    s += h2('Minha doca (427)')
    s.append(P('Tela para o tablet do conferente: escolha a doca (o navegador lembra) e ela mostra só o caminhão daquela doca, em letra '
               'grande, com as notas, os volumes e o tempo, e os botões <b>Encostou, iniciar a operação</b>, <b>Terminou a operação</b> e, '
               'com a doca livre, <b>Chamar o próximo</b>. Ao lado fica a fila prevista para a doca. Atualiza sozinha.'))
    s += h2('Painel de expedição (425)')
    s.append(P('A aba <b>Expedição</b> mostra, de uma vez, todas as notas de venda dos últimos 45 dias que ainda não saíram e as que '
               'saíram hoje, cada uma na sua etapa. Atualiza sozinha a cada 20 segundos e tem <b>tela cheia</b> para a TV da expedição.'))
    s += tabela(['Etapa', 'Quando'], [
        ['Sem ordem de coleta', 'A nota ainda não está em nenhuma ordem de coleta (ou a ordem ainda é rascunho).'],
        ['Aguardando a transportadora', 'A ordem foi mandada e a transportadora ainda não confirmou ("sem resposta" depois de 4 horas ou passada a janela).'],
        ['Coleta confirmada', 'A transportadora confirmou a data, a placa e o motorista.'],
        ['Coleta atrasada', 'Passou da janela confirmada e o caminhão não chegou.'],
        ['No pátio / na doca', 'O caminhão da ordem entrou pela portaria e está aguardando a doca ou carregando.'],
        ['Expedida hoje', 'A nota saiu hoje pela portaria, ou o CT-e da transportadora foi emitido hoje.'],
    ], [0.3, 0.7])
    s += lista([
        'Os cartões do alto somam as notas a expedir (volumes, peso e valor) e as expedidas hoje. Clicar num cartão filtra as notas daquela etapa.',
        '<b>Por transportadora</b>: quantas notas em cada etapa, a nota mais antiga e a próxima coleta. <b>Pedir coleta</b> abre a ordem de '
        'coleta já com as notas dela que estão sem ordem. Clicar no nome filtra as notas da transportadora.',
        '<b>Alertas</b>: nota parada há mais de 2 dias sem ordem de coleta, ordem sem resposta da transportadora e coleta atrasada.',
        'As notas FOB (o cliente busca) ficam fora; marque <b>incluir FOB</b> para vê-las.',
    ])
    s += h2('Ordens de coleta (424)')
    s.append(P('A expedição pede a coleta à transportadora pelo sistema, e a transportadora confirma por um link, sem login.'))
    s += passos([
        '<b>Nova ordem de coleta</b>: escolha a transportadora (filtra as notas) e marque as notas a coletar. Aparecem as notas CIF '
        'dos últimos 45 dias ainda sem CT-e, sem saída e fora de outra ordem aberta. Informe quando a carga fica pronta, a janela '
        '(horas), o veículo e uma observação. O e-mail da transportadora vem do cadastro (Cadastros, Transportadoras).',
        '<b>Salvar e mandar à transportadora</b>: ela recebe o e-mail com o botão <b>Confirmar a coleta</b> e o documento da ordem '
        'anexo. Sem e-mail configurado, a ordem fica salva e dá para <b>copiar o link</b> e mandar pelo WhatsApp.',
        'Pelo link, a transportadora <b>confirma</b> (data e hora de chegada, placa, tipo de veículo, motorista, CPF/CNH e celular) '
        'ou <b>recusa</b> com o motivo. Confirmada, a ordem já vira <b>agendamento no pátio</b>, e a página mostra o link do '
        'motorista (QR Code da portaria). Enquanto o caminhão não chega, ela pode alterar a confirmação pelo mesmo link.',
        '<b>Acompanhamento</b>: a aba mostra as ordens por situação: rascunho, aguardando confirmação, sem resposta (mais de 4 horas), '
        'confirmada, atrasada (passou da janela sem chegar), no pátio, coletada (saiu pela portaria), não compareceu, recusada e '
        'cancelada. <b>Abrir</b> mostra a resposta, o link, o documento para imprimir e as ações (alterar, mandar de novo, cancelar).',
    ])
    s += aviso('nota', 'Cancelar a ordem cancela também o agendamento do pátio, enquanto o caminhão não entrou. A nota só pode estar '
                       'em uma ordem aberta por vez.')
    s += h2('Ordens de descarga (424)')
    s.append(P('Na mesma aba, <b>＋ Ordem de descarga</b> faz o caminho inverso: pede a entrega das compras e agenda o recebimento.'))
    s += lista([
        'As notas da lista são as <b>NF-e de compra</b> que estão para chegar: as NF-e contra o CNPJ (Fiscal, NF-e contra o CNPJ) dos '
        'últimos 60 dias, autorizadas, não desconhecidas e ainda não lançadas na entrada. Do XML saem o fornecedor, a cidade de origem, '
        'a transportadora, os volumes e o peso (se o XML ainda não foi baixado, essas colunas ficam vazias).',
        '<b>Quem entrega</b> vem preenchido com a transportadora do XML (ou o fornecedor). Informe a partir de quando dá para receber e a '
        'janela, e mande por e-mail ou pelo link.',
        'Pelo link, quem entrega <b>agenda a entrega</b> (data, placa e motorista) ou avisa que <b>não consegue entregar</b> com o motivo. '
        'Agendada, a ordem vira um <b>agendamento de descarga</b> no pátio, com o fornecedor, as notas, os volumes e o peso, e vai para '
        'uma doca que aceita descarga.',
        'As situações são as mesmas da coleta. Quando o caminhão sai pela portaria, a ordem fica <b>Descarregada</b>.',
    ])
    s += h2('Agendamentos (422)')
    s += lista([
        '<b>＋ Agendar</b>: operação, data e hora, janela (minutos), transportadora ou fornecedor, placa e carreta, tipo de veículo, '
        'motorista (nome, CPF/CNH, celular), as <b>notas fiscais</b> (números), pedido, volumes, peso e o tempo previsto na doca. '
        'Ao digitar as notas, o sistema confere: mostra o cliente e os volumes, avisa as que não estão no sistema e completa a '
        'transportadora, os volumes e o peso que faltarem.',
        'Ao salvar, abre a visita com o <b>QR Code</b> e o código de 8 letras. <b>Copiar link</b> copia a mensagem pronta para o '
        'motorista; <b>Enviar no WhatsApp</b> (com o celular informado) abre a conversa com a mensagem; <b>Página do motorista</b> '
        'abre o que ele vê.',
        'A lista do dia mostra a ocupação por hora (barras) e cada visita com a situação e a próxima ação.',
    ])
    s += h2('Portaria (421)')
    s += lista([
        'Leia o QR Code do motorista com um <b>leitor USB</b> (ele digita no campo e confirma) ou com o botão <b>Câmera</b> '
        '(Chrome/Edge, inclusive no celular). Também vale digitar o código de 8 letras ou a <b>placa</b> (agendamento de ontem a amanhã).',
        'Quem chegou sem horário: <b>Entrada sem agendamento</b> (operação, placa, transportadora...). Entra direto na fila.',
        'O "Movimento de hoje" tem a ação de cada situação: Chegou, Chamar, Iniciar, Terminou e Saída.',
    ])
    s += h2('Painel do pátio (420)')
    s += lista([
        'Atualiza sozinho a cada 20 segundos; <b>Tela cheia</b> serve para deixar numa TV da portaria ou da expedição.',
        'Cartões do dia: no pátio, aguardando doca, em operação, docas livres, <b>espera média</b> (da chegada até a doca), '
        '<b>tempo médio na doca</b>, permanência média (da chegada até a saída), <b>pontualidade</b> (chegaram dentro da janela) e '
        'agendados, chegaram, saíram, sem agendamento e faltaram.',
        '<b>Docas</b>: livre (verde), chamado (laranja), em operação (azul) ou passou do tempo previsto (vermelho), com o veículo, o '
        'tempo na doca, o fim previsto e o próximo da fila. Botões: Encostou/iniciar, Voltar à fila, Terminou a operação (com o lacre) '
        'e Chamar.',
        '<b>Fila</b>: na ordem de prioridade, com a <b>previsão</b> de cada caminhão: a doca, a hora em que entra, quanto vai esperar e '
        'quando sai da doca. Abaixo, os liberados indo para a saída (Registrar saída).',
        '<b>Próximas chegadas</b> (24 horas): previsto, chegando, atrasado ou não veio, com Chegou e Não veio.',
    ])
    s += h2('Como a alocação e a previsão funcionam')
    s += lista([
        '<b>Prioridade</b>: primeiro quem chegou dentro da janela agendada mais a tolerância, pela hora agendada; depois quem atrasou '
        'ou veio sem agendamento, pela hora de chegada.',
        '<b>Doca</b>: cada caminhão da fila vai para a doca compatível (operação e tipo de veículo) que fica livre primeiro; no empate, '
        'a de menor ordem.',
        '<b>Tempo de cada operação</b>: o informado no agendamento; senão a média real daquela doca naquela operação nos últimos 60 dias '
        '(com pelo menos 3 operações); senão o tempo padrão da doca. Do chamado até encostar contam 5 minutos.',
        'A mesma conta dá a previsão do painel e da página do motorista. Sem doca compatível, a fila avisa "nenhuma doca aceita".',
    ])
    s += h2('Página do motorista')
    s.append(P('O link (patio.html?c=CÓDIGO) abre no celular sem login: mostra o QR Code para a portaria, a situação, a posição na fila e '
               'a previsão. Quando ele é chamado, aparece em destaque "<b>É a sua vez! Dirija-se à Doca X</b>" e o celular vibra. Atualiza '
               'sozinha a cada 15 segundos. Para o link sair com o endereço certo, preencha o endereço público em Cadastros, Empresa.'))
    s += h2('Saída e as notas')
    s.append(P('Na <b>saída</b> de um carregamento, as notas da visita ganham a <b>data de saída</b> (expedição), que aparece na Consulta de '
               'notas e no relatório 32 (NF-e por período: expedidas). Cada passo da visita fica no histórico, com a hora e quem fez.'))

    s += h1('20-B. Cargas')
    s.append(P('Menu <b>Cargas</b> (Operar): montar os embarques, mandar os pré-conhecimentos, comparar fracionado com lotação e '
               'acompanhar a capacidade de cada transportadora. Quatro abas: Embarques (430), Pré-conhecimentos (431), Cargas fracionadas '
               '(432) e Capacidade (433).'))
    s += h2('Embarques (430)')
    s += passos([
        '<b>Montar embarque</b>: escolha a transportadora (filtra as notas), a data, a modalidade (<b>fracionada</b>, frete pela tabela; '
        'ou <b>lotação</b>, veículo exclusivo com o preço da tabela de lotação), o veículo e marque as notas. Aparecem as notas CIF dos '
        'últimos 45 dias sem CT-e, sem saída e fora de outro embarque.',
        'Enquanto marca, o quadro mostra notas, volumes, peso, m³, a <b>ocupação do veículo</b> (o maior entre peso e m³ sobre a capacidade) '
        'e o <b>frete previsto</b> (na lotação, também quanto seria o fracionado).',
        'Ao salvar, o sistema avisa se a carga passa da capacidade do veículo ou da capacidade da transportadora no dia.',
        '<b>Fechar o embarque</b> gera os pré-conhecimentos de cada nota. <b>Pedir a coleta</b> gera a ordem de coleta (Pátio e portaria, '
        '424) com as notas, o veículo e a data, e pode mandar à transportadora na hora.',
        '<b>Imprimir o espelho</b> sai com as notas, os totais, a ocupação e o frete previsto. Cancelar o embarque cancela também os '
        'pré-conhecimentos e a ordem de coleta (enquanto o caminhão não chegou).',
    ])
    s += h2('Pré-conhecimentos (431)')
    s += lista([
        'É o frete que a transportadora deve cobrar em cada nota, numerado: no fracionado, o calculado pela tabela, parcela por parcela '
        '(frete peso, ad valorem, GRIS, pedágio, taxas, ICMS); na lotação, a viagem rateada entre as notas pelo peso (ou pelo valor, se faltar peso).',
        'Saem ao fechar um embarque, ou pelo botão <b>Gerar para notas sem CT-e</b>. Marque e use <b>Imprimir</b> ou <b>Mandar à '
        'transportadora</b> (e-mail com o documento anexo; uma transportadora por vez).',
        'Quando o CT-e chega, a linha mostra o cobrado e a diferença: <b>CT-e confere</b> (até 2% ou R$ 2) ou <b>CT-e divergente</b>. A '
        'auditoria do CT-e continua igual.',
    ])
    s += h2('Cargas fracionadas e lotação (432)')
    s += lista([
        'As notas esperando embarque, juntas por destino (cidade/UF): notas, peso, m³, o frete fracionado somado pela tabela e a '
        '<b>melhor tabela de lotação</b> que serve ao destino e comporta a carga, com a ocupação e a economia.',
        'Sugestão: <b>Virar lotação</b> (a viagem sai mais barata que o fracionado), <b>Manter fracionada</b>, sem tabela de lotação para o '
        'destino, ou notas sem frete calculado. <b>Montar embarque</b> abre o embarque já com as notas e, quando for o caso, a lotação.',
        '<b>Tabelas de lotação</b>: transportadora, UF e cidade de destino (vazia = o estado todo), veículo, valor da viagem, capacidade '
        '(vazia = a do veículo) e prazo.',
    ])
    s += h2('Capacidade das transportadoras (433)')
    s.append(P('Cadastre quantos veículos, kg e m³ cada transportadora atende por dia. A grade mostra os próximos 7 dias: o que está '
               'programado para cada uma (embarques abertos e ordens de coleta enviadas ou aceitas) e quanto isso ocupa da capacidade; em '
               'vermelho, o dia que passou. O mesmo cálculo dá o aviso ao salvar um embarque.'))

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
