# -*- coding: utf-8 -*-
"""Manual do Nexofrete — Partes 4 a 6: transportadora (operação), financeiro e gestão, integrações.

Só caracteres do Latin-1/WinAnsi (sem setas, emojis ou ✓). Negrito: <b>...</b>; "&" como &amp;.
"""


def _g(g):
    return (g['P'], g['h1'], g['h2'], g['h3'], g['lista'], g['passos'], g['aviso'], g['tabela'], g['codigo'], g['parte'])


# ======================================================================
# Parte 4 — Transportadora: operação
# ======================================================================
def parte_operacao(g):
    P, h1, h2, h3, lista, passos, aviso, tabela, codigo, parte = _g(g)
    s = []
    s += parte('Parte 4 — Transportadora: operação',
               'Para a empresa que emite CT-e: menu, cotação, coleta, CT-e, MDF-e, NFS-e, entregas, filiais, frota e portal do cliente.')

    # 29
    s += h1('29. Menu por área, tela Hoje e códigos de tela')
    s.append(P('O menu da esquerda é organizado por área: <b>Operação, Financeiro, Frota, Gestão, Notas e fretes</b> (a '
               'parte do embarcador) e <b>Configuração</b>. O grupo da tela aberta abre sozinho; os que você abrir à mão '
               'ficam abertos e o navegador lembra. No celular, o botão <b>Menu</b> abre o menu como uma gaveta.'))
    s += h2('Módulos da empresa')
    s.append(P('Em <b>Cadastros » Empresa » Módulos usados pela empresa</b>, o administrador escolhe o que aparece:'))
    s += lista([
        '<b>Transportadora e embarcador (tudo)</b>: o padrão, todo o menu.',
        '<b>Só transportadora</b>: some <b>Notas e fretes</b> e <b>Relatórios</b> (a parte do embarcador); a primeira tela é a Hoje.',
        '<b>Só embarcador</b>: somem Hoje, Operação, Financeiro, Frota, Gestão, Filiais (unidades) e Configuração fiscal; '
        'a primeira tela é a Visão geral.',
    ])
    s += aviso('nota', 'A escolha esconde os itens do menu, do "Ir para" (Ctrl+K) e da tela Hoje para todos os usuários; '
                       'não apaga nada nem muda permissões. Volte para "tudo" a qualquer momento.')
    s += h2('Recolher o menu e cores pelo tema')
    s += lista([
        'A <b>seta na borda do menu</b> (botão redondo no alto) recolhe o menu: ficam só os ícones e a tela ganha '
        'espaço. Clique de novo para abrir.',
        'Com o menu recolhido, <b>passe o mouse</b> sobre ele para abri-lo por cima da tela, sem empurrar o conteúdo; '
        'tirando o mouse, ele volta a ficar só com os ícones. Parado sobre um ícone, aparece o nome da tela.',
        'O navegador lembra se o menu fica aberto ou recolhido. No celular, o menu continua sendo a gaveta do botão Menu.',
        'O menu acompanha o <b>tema</b> escolhido (Tema claro / Tema escuro, no rodapé do menu): claro no tema claro e '
        'escuro no tema escuro, com o logo na cor certa.',
    ])
    s += h2('Tela Hoje (código 000)')
    s.append(P('É a primeira tela de quem emite CT-e ou cuida do financeiro. Mostra, por área, o que precisa de atenção, '
               'em cartões que abrem a tela certa já filtrada. Vermelho é para resolver já, amarelo é para hoje e azul é '
               'só para saber. Atualiza sozinha a cada 5 minutos.'))
    s += lista([
        '<b>Operação:</b> CT-e rejeitados ou com erro, rascunhos, entregas atrasadas, com ocorrência ou previstas para '
        'hoje, coletas a programar, cotações pedidas no portal e MDF-e em aberto.',
        '<b>Financeiro:</b> faturas vencidas e a receber na semana, CT-e a faturar, contas a pagar, boletos rejeitados, '
        'extrato a conciliar, saldo em caixa e bancos, lembretes da régua e falha no envio ao contador.',
        '<b>Frota:</b> manutenção vencida ou vencendo, CNH vencendo e veículos na oficina.',
    ])
    s += h2('Ir para (Ctrl+K ou F2)')
    s.append(P('Em qualquer tela, aperte <b>Ctrl+K</b> (ou F2), digite o código da tela ou parte do nome ("fatura", '
               '"novo cte") e aperte Enter. O código aparece ao lado de cada item do menu e o <b>999</b> mostra a lista '
               'completa para imprimir. O primeiro número é a área; o número seguinte ao da tela abre o "novo" '
               '(001 Coletas, 002 Nova coleta).'))
    s += tabela(['Área', 'Códigos principais'], [
        ['0xx Operação', '000 Hoje · 001 Coletas · 010 Cotações · 020 CT-e · 021 Novo CT-e · 025 MDF-e · 030 NFS-e · '
         '040 Romaneios · 041 Ocorrências · 050 Conferência · 051 Etiquetas · 060 Onde está a mercadoria · '
         '061 Transferências · 070 EDI · 080 Portal do cliente'],
        ['1xx Financeiro', '100 Faturamento · 101 Contas a receber · 102 Boletos · 103 Régua de cobrança · '
         '110 Contas a pagar · 120 Acerto de viagem · 125 Comissões · 140 Fiscal e contabilidade · 141 Pacote do '
         'contador · 142 Notas de entrada · 143 NF-e contra o CNPJ · 150 Caixa e bancos · 151 Conciliação · 152 Fluxo de caixa · 153 Importar OFX'],
        ['2xx Frota', '200 Custos e alertas · 201 Abastecimentos · 210 Manutenções · 220 Veículos e motoristas'],
        ['3xx Gestão', '300 Painel gerencial · 301 Margem por CT-e e cliente · 302 Centros de custo · 310 a 321 '
         'Relatórios · 330 Auditoria de frete'],
        ['4xx Notas e fretes', '400 Visão geral · 401 Enviar XML · 402 Todos os registros · 410 Sinistros'],
        ['5xx e 9xx', '500 Mensagens · 501 Agenda · 900 Cadastros · 901 Filiais · 902 Configuração fiscal · '
         '903 Manutenção · 904 Integração (API e ERP) · 990 Modo compacto · 991 Tema · 999 Lista de códigos'],
    ], [0.2, 0.8])
    s += h2('Filtro de período')
    s.append(P('As telas com período (Painel e Margem, Frota, Fiscal e contabilidade, Movimentação do caixa, '
               'Ocorrências, Coletas) usam o mesmo filtro: um atalho (Este mês, Mês passado, Últimos 30 dias, Este '
               'ano...) e as datas "de" e "até". Aplica na hora e cada tela lembra a última escolha neste navegador.'))
    s += aviso('dica', 'Nos formulários, <b>Enter</b> passa para o próximo campo e <b>Ctrl+Enter</b> aciona o botão '
                       'principal (Salvar, Lançar, Transmitir). O <b>modo compacto</b> (990) mostra mais linhas na tela.')

    # 30
    s += h1('30. Cotações de frete')
    s += passos([
        '<b>Nova cotação</b>: busque o cliente e informe destino, peso, volumes, cubagem e valor da mercadoria.',
        '<b>Calcular pela tabela</b>: usa a tabela de preço da própria empresa (a do cliente, se houver), com peso '
        'cubado, ad valorem, GRIS, pedágio e taxas, e mostra o prazo do trecho.',
        'Ajuste valores ou aplique um <b>desconto %</b>. A cotação guarda o valor da tabela para comparar.',
        'Envie por <b>PDF</b>, <b>e-mail</b> ou <b>WhatsApp</b>.',
        '<b>Aprovada</b> abre a coleta já preenchida e o CT-e sai com o preço combinado. <b>Recusada</b> pede o motivo.',
    ])
    s.append(P('A cotação vence sozinha na data de validade e pode ser reaberta ou duplicada. No topo aparecem as '
               'cotações em aberto, o valor em negociação e a taxa de conversão.'))

    # 31
    s += h1('31. Coletas')
    s += passos([
        '<b>Nova coleta</b>: digite o nome ou o CNPJ do remetente (o endereço vem do cadastro), a data, a janela de '
        'horário, volumes, peso, destino e quem paga o frete. <b>Repetir</b> cria outra igual.',
        '<b>Programar no caminhão</b>: marque as coletas e escolha ou crie o romaneio. Coletas e entregas saem na mesma '
        'folha e no mesmo código do app do motorista.',
        'No celular, o motorista dá <b>Coletado</b> (volumes, peso, assinatura, foto) ou <b>Não coletado</b> (motivo).',
        '<b>Gerar CT-e</b> cria o rascunho com o remetente, o destino e a carga coletada.',
    ])
    s += aviso('nota', 'Ao fechar o romaneio, a coleta sem baixa volta para "A programar". A NF-e que chega por e-mail '
                       'já se liga à coleta do mesmo remetente.')

    # 32
    s += h1('32. Emissão de CT-e')
    s += h2('Antes de emitir (administrador, Configuração fiscal, código 902)')
    s += passos([
        'Preencha os dados da empresa. Ao digitar o CNPJ, os dados da Receita entram sozinhos (veja a seção 51).',
        'Informe o RNTRC, o regime tributário, a série e o próximo número do CT-e.',
        'Envie o certificado digital A1 (.pfx) com a senha.',
        '<b>Testar conexão com a SEFAZ</b>: o esperado é "107 - Serviço em Operação".',
        'Comece em <b>Homologação</b> e só depois mude para <b>Produção</b>.',
    ])
    s += aviso('dica', '<b>Modo demonstração</b>: para apresentar e treinar sem certificado, escolha o ambiente '
                       '"Demonstração (simulada)" e gere o certificado de demonstração. Tudo é simulado no servidor e '
                       'nada tem valor fiscal.')
    s += h2('No dia a dia')
    s += passos([
        '<b>Novo CT-e</b> e <b>Ler XML da NF-e</b>: preenche remetente, destinatário, carga e o percurso.',
        'Lance os componentes do frete ou use <b>Calcular pela tabela</b>.',
        'Confira o ICMS: o sistema sugere CFOP e alíquota (7% ou 12% interestadual).',
        '<b>Salvar e transmitir</b>. Autorizado, o DACTE abre para imprimir.',
    ])
    s.append(P('<b>NF-e viram rascunho de CT-e sozinhas</b>: pelo e-mail (Manutenção » Leitura automática de e-mail), '
               'pelos arquivos (<b>Importar NF-e</b>), pela SEFAZ (<b>NF-e da SEFAZ</b>: as notas em que a sua empresa é a '
               'transportadora, buscadas em NF-e contra o CNPJ, seção 49), pelo EDI NOTFIS ou pela API do ERP (seção 53). Notas do mesmo '
               'remetente para o mesmo destino viram um CT-e só; notas de outra transportadora, sem frete ou já em CT-e '
               'ficam de fora.'))
    s += h2('Casos especiais')
    s += lista([
        '<b>Redespacho e subcontratação</b>: escolha o tipo de serviço e leia o XML do CT-e anterior.',
        '<b>Complementar</b>: cobra um valor a mais (estadia, reentrega). <b>Substituir</b>: corrige um CT-e autorizado '
        'há até 60 dias, depois do evento de desacordo do tomador.',
        '<b>Contingência</b>: com a SEFAZ fora do ar, ligue a contingência (SVC). Desligue quando ela voltar.',
        '<b>Averbação do seguro</b>: com AT&amp;M ou Porto Seguro, cada CT-e autorizado é averbado na hora.',
        '<b>Carta de correção, consulta e cancelamento</b> ficam na lista. Se a SEFAZ não responder, '
        '<b>Tentar de novo</b> consulta antes, para não emitir duas vezes.',
    ])

    # 33
    s += h1('33. MDF-e (manifesto da viagem)')
    s += passos([
        'Cadastre caminhões, carretas e motoristas em <b>Veículos e motoristas</b> (código 220).',
        'Monte o MDF-e pelos CT-e autorizados ou pelo romaneio (<b>Emitir MDF-e</b>). Sai um MDF-e por UF de descarga.',
        'Confira veículo, motoristas, seguro, CIOT, vale-pedágio e contratante, e <b>Salvar e transmitir</b>.',
        'No fim da viagem, <b>Encerrar</b>. Com MDF-e aberto para a placa, a SEFAZ recusa outro.',
    ])
    s += h2('Gerenciamento de risco (GR)')
    s.append(P('Em <b>MDF-e » 🛡 Gerenciamento de risco</b> escolha a gerenciadora (Buonny, Telerisco, Opentech, Tecnorisk ou o '
               'simulador), as credenciais e as regras do plano de gerenciamento de risco da apólice: validade da liberação, '
               'limite de valor por veículo e os valores a partir dos quais a viagem precisa de rastreador, escolta e '
               'solicitação de monitoramento (SM). Dá para só avisar ou impedir a transmissão do MDF-e com pendência.'))
    s += lista([
        '<b>Liberação de motorista e veículo</b>: "Consultar na GR" pede a liberação à gerenciadora; "Registrar à mão" guarda '
        'o resultado da consulta feita no site da GR (resultado, protocolo e validade). A situação aparece em Veículos e '
        'motoristas (coluna GR) e no MDF-e: liberado até a data, vencida, negado, em análise ou sem consulta.',
        '<b>Rastreador</b>: tecnologia e ID no cadastro do veículo.',
        '<b>No MDF-e</b>, o quadro Gerenciamento de risco mostra cada motorista e veículo, as regras da apólice para o valor da '
        'carga, a escolta (marque quando contratada) e a SM. "Salvar e conferir de novo" refaz a conferência depois de '
        'trocar motorista ou veículo.',
        '<b>Enviar SM</b>: manda a viagem (motoristas, veículo e rastreador, carretas, origem, destinos, valor e produto) para '
        'a gerenciadora monitorar; só com motorista e veículo liberados. A SM pode ser cancelada com motivo.',
    ])
    s += aviso('importante', 'Buonny, Telerisco, Opentech e Tecnorisk só liberam a API com o contrato. Até lá a gerenciadora '
                             'escolhida avisa e nada é enviado: registre à mão a consulta do site da GR. O simulador faz o fluxo '
                             'inteiro, sem valor para a seguradora.')

    # 34
    s += h1('34. NFS-e do frete municipal')
    s.append(P('Frete com coleta e entrega no mesmo município sai em <b>NFS-e</b> (ISS), pelo emissor nacional, com o '
               'mesmo certificado do CT-e. Configure a inscrição municipal e a alíquota do ISS e comece em homologação.'))
    s += lista([
        '<b>Nova NFS-e</b>: tomador, descrição, valor, desconto e se o cliente retém o ISS.',
        'Ao transmitir um CT-e com origem e destino na mesma cidade, o sistema oferece trocar por NFS-e.',
        'A NFS-e autorizada entra no faturamento com os CT-e do mesmo cliente. Para cancelar uma NFS-e que está numa '
        'fatura, cancele a fatura antes.',
        'No modo demonstração, a NFS-e é simulada e numerada à parte (não gasta a numeração de produção). A recusada '
        'na demonstração pode ser excluída.',
    ])

    # 35
    s += h1('35. Entregas: ocorrências, romaneio e app do motorista')
    s += lista([
        '<b>Previsão de entrega</b> na autorização, pelo prazo da tabela, contando só dias úteis e pulando os feriados '
        'nacionais e os cadastrados em <b>Feriados</b>.',
        '<b>Ocorrências</b> (041): coletado, chegada na filial, saiu para entrega, agendada, entregue (com quem recebeu e '
        'foto do canhoto), não entregue, recusa, avaria e devolução. Dá para lançar em lote.',
        '<b>Romaneio</b> (040): monte com motorista, placa e ordem de entrega. A folha sai com QR code do app. '
        '"Dar saída" e "Fechar" atualizam as entregas.',
        '<b>App do motorista</b> (motorista.html, no celular, sem login): entra com o código do romaneio, vê as entregas '
        'com mapa e dá baixa com nome, assinatura, foto e GPS.',
        '<b>Avisos ao cliente</b> (Configuração fiscal » Avisos de entrega): e-mail e/ou WhatsApp ao destinatário e ao '
        'pagador a cada ocorrência escolhida, com o link de rastreio.',
        '<b>Rastreio público</b> (rastreio.html): o cliente consulta pela chave do CT-e ou CNPJ + NF, sem valores.',
    ])
    s += aviso('atencao', 'GPS e câmera do celular só funcionam com HTTPS (ou no próprio servidor da rede).')
    s.append(P('<b>Agendamento de entrega</b>. Para o cliente que só recebe com hora marcada (atacadista, '
               'supermercado, centro de distribuição):'))
    s += passos([
        'Em Cadastros &gt; Clientes, abra o cliente, marque <b>Exige agendamento da entrega</b> e escreva em '
        '<b>Como agendar</b> o caminho (e-mail, portal, telefone, antecedência).',
        'Os CT-e para esse cliente (destinatário ou local de entrega) aparecem no filtro <b>A agendar</b> das '
        'Ocorrências (041) e na tela Hoje.',
        'Clique no botão <b>calendário</b> da linha: informe a data, a janela (das / até as), a senha ou protocolo, a '
        'doca, com quem agendou e uma observação para o motorista. Salve.',
        'Entra a ocorrência "Entrega agendada" e a previsão passa a ser a data marcada. Para mudar, use o mesmo botão '
        '(<b>Reagendar</b>); o anterior fica no histórico. Para desfazer, <b>cancelar agendamento</b> com o motivo: a '
        'previsão volta à original.',
    ])
    s += lista([
        'O romaneio mostra o agendamento de cada entrega (e avisa quando é de outro dia); a folha impressa traz '
        '"AGENDADO" com janela, senha e doca.',
        'O app do motorista mostra a janela, a senha, a doca e a observação.',
        'O portal do cliente e o aviso por e-mail/WhatsApp mostram só a data e a janela: senha e doca não saem da '
        'transportadora.',
        'Filtro <b>Agendados</b> e "Entregas agendadas para hoje" na tela Hoje, para conferir se estão no caminhão.',
    ])

    # 36
    s += h1('36. Filiais e transferências')
    s += passos([
        '<b>Filiais</b> (901, administrador): cadastre cada filial com a lista de cidades que ela entrega.',
        'Cada CT-e sabe <b>onde a mercadoria está</b> e <b>qual filial entrega</b>.',
        '<b>Onde está a mercadoria</b> (060): marque os "a transferir" e crie a transferência.',
        'Na origem: manifesto, etiquetas, MDF-e, conferência e saída. No destino: conferir a chegada e registrar.',
    ])

    # 37
    s += h1('37. Etiquetas de volume e conferência (bipagem)')
    s.append(P('Cada volume ganha uma etiqueta com destino em letra grande, NF, peso, <b>VOL 3/12</b> e código de barras '
               '(100 × 100, 100 × 150 ou 100 × 50 mm; ZPL para impressora Zebra). Na <b>conferência</b>, bipe com leitor '
               'USB/Bluetooth ou a câmera do celular: verde quando certo, vermelho quando o volume é de outro romaneio, '
               'amarelo quando já foi lido. Faltas e sobras ficam registradas.'))

    # 38
    s += h1('38. EDI (PROCEDA)')
    s.append(P('Arquivos NOTFIS 3.1, CONEMB 3.1, OCOREN 3.1 e DOCCOB 3.0A, nos dois sentidos: com o cliente, lê o NOTFIS '
               '(cria rascunhos de CT-e) e gera CONEMB, OCOREN e DOCCOB; com a transportadora (embarcador), gera o '
               'NOTFIS e lê o que ela devolve.'))

    # 39
    s += h1('39. Portal do cliente')
    s.append(P('Página própria para o cliente (portal.html, funciona no celular), com login separado do sistema. '
               'Libere em <b>Portal do cliente » Novo acesso</b>: escolha o cliente, os CNPJ/CPF dele, o nome e o e-mail. '
               'A senha provisória aparece uma vez só.'))
    s.append(P('<b>Endereço de coleta do acesso</b>: ao escolher o cliente do cadastro, o endereço dele (razão social, IE, '
               'endereço, cidade com o código IBGE, UF, CEP e telefone) é preenchido no quadro "Endereço de coleta" do acesso; '
               'cliente fora do cadastro é buscado na Receita pelo CNPJ. Esse endereço vem pronto quando o cliente pede coleta '
               'pelo portal. Sem endereço no acesso, o portal usa o do cadastro de clientes ou o do último CT-e em que o '
               'cliente foi remetente.'))
    s += lista([
        '<b>Cargas</b>: situação, previsão, histórico, DACTE, XML, foto do comprovante e assinatura.',
        '<b>Valores</b> só nos CT-e em que ele é o pagador, e só se o acesso "vê valores".',
        '<b>Quem não vê valores</b> (acesso sem "vê valores", ou CT-e pago por outra empresa): o DACTE sai com o quadro '
        '"Valores do frete não exibidos neste acesso" no lugar dos componentes, do total, do valor a receber e do ICMS, e '
        'valores em R$ nas observações viram "R$ ***". O XML não fica disponível (ele é assinado, traz os valores e não '
        'pode ser alterado), nem sozinho nem no .zip do período. O valor da mercadoria (da nota do próprio cliente) continua.',
        '<b>Financeiro</b>: faturas, boleto e linha digitável. <b>Coletas</b> e <b>cotações</b> pedidas pelo portal.',
        '<b>Pedir coleta</b>: "Coleta no meu endereço" já vem com o endereço do acesso (dá para alterar só nesta coleta). '
        '"Coleta reversa" é para buscar em outro local (fornecedor ou cliente dele) e trazer para a empresa dele: o cliente '
        'informa onde buscar, e a entrega fica no endereço dele, com o frete por conta da empresa dele (destinatário). '
        'A coleta reversa aparece com a etiqueta "Reversa".',
        '<b>Coletas</b>: cada coleta mostra as etapas (pedida, programada, saiu para coletar, coletada), a data em que foi '
        'pedida, a data agendada com o horário, quando saiu e quando foi coletada, o <b>motorista</b> e o <b>veículo com a '
        'placa</b>, os volumes (pedidos e coletados), quem entregou a mercadoria e o CT-e gerado. Motorista e placa vêm do '
        'romaneio em que a coleta foi programada (Coletas » Programar): coleta sem romaneio não mostra motorista. O '
        'documento e o telefone do motorista não aparecem para o cliente.',
    ])
    s.append(P('Visual: entrada com a marca da transportadora (nome e logo do cadastro da empresa), cabeçalho com o '
               'usuário, abas com ícones, resumo com saudação e indicadores, e a cor de cada cartão pela situação. '
               'Segue o tema claro ou escuro do aparelho e funciona no celular.'))
    s += aviso('atencao', 'Para o cliente acessar de fora, o servidor precisa estar publicado na internet com HTTPS. '
                          'Informe o endereço em Configurar (só aceita https:// ou http:// sem aspas e símbolos).')

    # 40
    s += h1('40. Frota: abastecimento e manutenção')
    s += lista([
        '<b>Abastecimentos</b>: km, combustível, litros, valor, posto (o nome entra pelo CNPJ) e tanque cheio. O consumo '
        'é medido de tanque cheio a tanque cheio. O km aceita "123.456" (milhar) ou "123,5" (decimal).',
        '<b>Pagamento</b>: à vista (conta já paga — só para quem vê o financeiro), a prazo, pago pelo motorista (vai para '
        'o acerto) ou já lançado.',
        '<b>Manutenções</b>: agendada, na oficina, concluída. Ao concluir, o custo vai para Contas a pagar e o plano '
        'preventivo recomeça. Ao excluir, o plano volta ao km da última manutenção com km.',
        '<b>Plano preventivo</b> por km e/ou tempo, com aviso antes. <b>Custos e alertas</b>: custo por km de cada veículo.',
    ])
    s += aviso('importante', 'Uma conta de frota já paga não é desfeita se o pagamento foi conciliado com o extrato do '
                             'banco, ou se tiver mais de um pagamento: estorne no Caixa e bancos antes.')
    return s


# ======================================================================
# Parte 5 — Financeiro e gestão
# ======================================================================
def parte_financeiro(g):
    P, h1, h2, h3, lista, passos, aviso, tabela, codigo, parte = _g(g)
    s = []
    s += parte('Parte 5 — Financeiro e gestão',
               'Faturamento, boleto, cobrança, caixa e bancos, contas a pagar, comissões, centros de custo, margem e contabilidade.')

    # 41
    s += h1('41. Faturamento e contas a receber')
    s += passos([
        '<b>Cobrança (PIX e banco)</b>: chave PIX, dados bancários, prazo de vencimento e instruções.',
        '<b>A faturar</b>: os CT-e e NFS-e autorizados sem fatura, por cliente. Gere a fatura dos marcados ou "Faturar tudo".',
        '<b>Faturas</b>: imprimir, enviar por e-mail (com o QR Code PIX e o boleto), prorrogar, dar baixa (parcial, em '
        'várias vezes; o que passa do saldo entra como juros), estornar e cancelar.',
        '<b>Contas a receber</b>: a receber, vencido, vence em 7 dias, recebido no mês e os que mais devem.',
    ])
    s += aviso('nota', 'Dois cliques na baixa, ou a baixa manual junto com o retorno do banco ou a conciliação, não '
                       'geram dois recebimentos: a fatura fica travada enquanto um recebimento é gravado.')
    s += h2('PIX com baixa automática (API Pix do banco)')
    s.append(P('Em <b>Cobrança (PIX e banco) » PIX com baixa automática</b>, ligue a cobrança pela API Pix do banco. A API é '
               'o padrão do Banco Central, igual em todos os bancos: no portal do desenvolvedor do seu banco pegue a URL da '
               'API, a URL do token, o client_id, o client_secret, o certificado (.pfx/.p12) e, se o banco pedir, um '
               'parâmetro extra (ex.: gw-dev-app-key). "Testar conexão" confere se o banco aceitou as credenciais.'))
    s += lista([
        'Cada fatura sai com um PIX <b>dinâmico</b> (cobrança registrada no banco) no QR Code e no copia e cola da fatura, do '
        'e-mail, da régua e do portal: com vencimento (multa e juros) ou imediata. Cliente sem CPF/CNPJ válido vai como imediata.',
        'Mudou o saldo (pagamento parcial, desconto) ou o vencimento: a cobrança antiga sai do banco e outra é criada.',
        '<b>Baixa sozinha</b>: o sistema confere os PIX recebidos a cada 5 minutos ("Conferir PIX recebidos agora" força). '
        'Com o sistema publicado em HTTPS, cadastre no banco o webhook /api/pix/webhook para a baixa sair na hora; o aviso '
        'do banco só dispara a conferência, e o valor é o que o banco confirma.',
        'Cada PIX dá baixa uma vez só. PIX de fatura já paga ou cancelada fica marcado na fatura para devolução ou crédito.',
        'Se o banco não responder, a fatura sai com o PIX estático, como antes.',
        'O <b>Simulador</b> faz o fluxo sem banco: na fatura, "Simular pagamento do PIX" (administrador) mostra a baixa automática.',
    ])

    # 42
    s += h1('42. Boleto registrado (CNAB 240)')
    s.append(P('Bancos: Banco do Brasil, Itaú, Bradesco, Santander, Caixa e Sicoob. Peça ao banco a cobrança registrada com '
               'arquivo CNAB 240, preencha o contrato em <b>Boletos » Configuração</b> e faça a homologação.'))
    s += passos([
        'Na fatura, <b>Gerar boleto</b>: sai na fatura impressa e no e-mail, ao lado do PIX.',
        '<b>Remessa</b>: gere o arquivo e envie pelo internet banking (leva os boletos novos e os pedidos de baixa).',
        '<b>Retorno</b>: todo dia, importe o arquivo do banco. Os pagos dão baixa sozinhos na fatura, na conta do banco '
        'do boleto, com a tarifa lançada. Reimportar o mesmo arquivo não baixa duas vezes.',
    ])
    s += aviso('nota', 'Fatura recebida por outro meio (PIX, depósito, conciliação) gera o pedido de baixa do boleto na '
                       'próxima remessa. Fatura com pagamento parcial não manda o boleto antigo (de valor maior) nos lembretes.')

    # 43
    s += h1('43. Régua de cobrança')
    s.append(P('Em <b>Faturamento » Régua de cobrança</b> (103): manda lembretes das faturas em aberto, uma vez por dia a '
               'partir da hora escolhida, por e-mail e/ou WhatsApp. As etapas (padrão: 3 dias antes, no dia, 3 e 10 dias '
               'depois) têm mensagem editável com {cliente} {fatura} {valor} {vencimento} {quando} {dias} {empresa} {contato}.'))
    s += lista([
        'Cada etapa vai uma vez por fatura e canal; a régua para quando a fatura é paga.',
        'Envio com erro tenta de novo no mesmo dia (até 2 vezes, de 2 em 2 horas) e no dia seguinte.',
        '<b>Exceções</b>: cliente pausado, contato de cobrança próprio e <b>pagamento prometido</b> (pausa a fatura até '
        'uma data, no máximo 90 dias; só quem vê o financeiro).',
    ])

    # 44
    s += h1('44. Caixa e bancos')
    s += lista([
        '<b>Contas e saldos</b> (150): cada conta bancária e o caixa, a partir do saldo de um dia.',
        '<b>Conciliação</b> (151/153): importe o extrato OFX. O que bate é conciliado sozinho; o resto vem com sugestão '
        '(baixar a fatura, pagar a conta, lançar tarifa ou rendimento). Ao baixar uma fatura pela conciliação, o boleto '
        'dela é baixado no banco na próxima remessa.',
        '<b>Lançamentos avulsos e transferências</b>, <b>movimentação</b> com saldo dia a dia e <b>fluxo de caixa</b> '
        '(152) de 30/60/90 dias, que avisa a semana em que o saldo fica negativo.',
    ])

    # 45
    s += h1('45. Contas a pagar e acerto de viagem')
    s += lista([
        '<b>Contas a pagar</b> (110): qualquer saída, em parcelas, com centro de custo. Pagar total ou parcial; o '
        'pagamento pode ser estornado. Ao editar uma conta, o centro de custo só muda se você mexer nele.',
        '<b>Competência</b>: o dia da despesa (data da nota ou do serviço), que define o mês em que ela entra na '
        'contabilidade. Vem com o dia de hoje; corrija quando a nota for de outro mês. Compra parcelada fica toda no mês '
        'da compra; conta que se repete ("o valor é de cada parcela", ex.: aluguel) vai um mês para cada parcela. '
        'Abastecimento e manutenção usam a data do registro; comissão, o último dia do período fechado.',
        '<b>Acerto de viagem</b> (120): motorista próprio (adiantamento e despesas) ou terceiro/agregado (frete, '
        'adiantamento, CIOT, vale-pedágio; retenções do TAC calculadas). Gera as contas a pagar e o demonstrativo para assinar.',
    ])
    s += h2('CIOT e vale-pedágio pelo provedor (pagamento eletrônico de frete)')
    s.append(P('Contratar terceiro (TAC ou agregado) exige o CIOT, gerado por um provedor habilitado pela ANTT (Pamcard, '
               'Repom, e-Frete, Target), e o vale-pedágio pago pela empresa fora do frete. Em <b>Acerto de viagem » '
               '⚙ CIOT e vale-pedágio</b> (administrador) escolha o provedor, o ambiente (homologação ou produção), as '
               'credenciais, a fornecedora do vale-pedágio, os eixos padrão e a forma de pagamento ao contratado.'))
    s += lista([
        'No acerto com terceiro, o quadro <b>CIOT e vale-pedágio</b> mostra o contratado, o RNTRC, o motorista, a placa e os '
        'valores; rota e peso vêm do MDF-e do acerto (sem MDF-e, informe origem e destino).',
        '<b>Declarar CIOT</b>: o sistema confere o que a ANTT exige (CNPJ e RNTRC da empresa, CPF/CNPJ e RNTRC do contratado, '
        'CPF do motorista, placa, rota, frete e peso) e lista tudo o que falta de uma vez. O CIOT vai para o acerto e para o MDF-e '
        'ainda não transmitido.',
        '<b>Comprar vale-pedágio</b>: pelo valor informado ou calculado pelo provedor pela rota e pelos eixos; número da compra, '
        'valor e fornecedora vão para o acerto e para o MDF-e, e o valor vira <b>conta a pagar</b> para a fornecedora '
        '(categoria Pedágio, ligada ao acerto). Fechar e reabrir o acerto não mexem nela; cancelar o CIOT cancela a conta se '
        'ainda não foi paga (paga, a tela avisa para conferir o estorno com o provedor). O demonstrativo do período não conta '
        'o pedágio duas vezes: ele já está no custo da viagem.',
        '<b>Fechar o acerto</b> encerra a operação no provedor com o valor final (frete ± acréscimos e descontos) e o peso. Se o '
        'provedor falhar, o acerto fecha e a tela avisa para usar "Encerrar agora".',
        '<b>Cancelar CIOT</b>: até 24 horas depois da declaração, com motivo; tira o CIOT e o vale-pedágio do acerto e do MDF-e. '
        'Acerto com CIOT aberto não pode ser cancelado antes do CIOT.',
    ])
    s += aviso('importante', 'Pamcard, Repom, e-Frete e Target só liberam a API (manual, endereço e credenciais de homologação) '
                             'com o contrato. Até lá o provedor escolhido avisa que a integração aguarda o contrato e nada é '
                             'enviado. O <b>Simulador</b> faz o fluxo inteiro sem valor legal, para treinar a equipe.')

    # 46
    s += h1('46. Comissão de vendedores')
    s += lista([
        '<b>Vendedores</b> (125): percentual e base — sobre o <b>recebido</b> (fatura quitada) ou o <b>faturado</b> (CT-e autorizado).',
        '<b>Carteira</b>: liga cada cliente a um vendedor, com percentual próprio se quiser.',
        '<b>Fechamento</b>: vira conta a pagar (centro Comercial). Cada documento é comissionado uma vez por ciclo.',
        '<b>Estornos</b>: CT-e cancelado ou substituído, e, na base recebido, fatura cujo recebimento foi estornado. Se '
        'for paga de novo, a comissão volta no fechamento seguinte. O desconto dado na fatura reduz a base.',
        'Não dá para cancelar um fechamento que já tem estorno ou nova comissão em outro mais novo: cancele o mais novo antes.',
    ])

    # 47
    s += h1('47. Centros de custo')
    s.append(P('Em <b>Gestão » Centros de custo</b> (302): filial, veículo, rota, comercial, administrativo e outro. O botão '
               '<b>Criar automático</b> cria um por filial e por veículo. Abastecimento, manutenção e acerto pegam o '
               'centro do veículo. O <b>resultado por centro</b> mostra receita, despesas e o detalhe por categoria.'))

    # 48
    s += h1('48. Painel gerencial e margem por CT-e')
    s += lista([
        '<b>Painel</b> (300): faturamento, CT-e, peso, frete/kg, ticket médio, entregas no prazo e a receber, comparado ao '
        'período anterior; clientes e rotas; resultado por viagem (MDF-e).',
        '<b>Margem</b> (301): receita menos ICMS/ISS, outros impostos, seguro, comissão, custo da viagem e frota própria. '
        'Por cliente, por documento e o demonstrativo do período (até 1 ano por consulta).',
        'Avisos: documentos sem custo, combustível em dobro, custos sem CT-e no período e <b>seguro em dobro</b> (seguro '
        'pelo % da configuração e também contas "Seguro" no período).',
    ])

    # 49
    s += h1('49. Fiscal e contabilidade')
    s += lista([
        '<b>Livro de saídas</b> (140): CT-e com CFOP, CST, alíquota, base e ICMS; NFS-e com ISS pela competência. Só '
        'entram os documentos do ambiente em uso (produção, ou demonstração no modo demonstração).',
        '<b>Ajustes de meses anteriores</b>: CT-e de um mês já fechado cancelado ou substituído agora aparece como ajuste '
        'no mês do cancelamento, com o estorno do ICMS; os eventos vão no pacote.',
        '<b>ICMS devido a outra UF</b> (OUTRAUF) fica fora da base e do débito próprios (é recolhido por GNRE). No '
        'Simples, o ISS não retido não é lançado.',
        '<b>Lançamentos contábeis</b>: receita, impostos, recebimentos (juros à parte), descontos concedidos, contas a '
        'pagar e o adiantamento do acerto.',
        '<b>Regime de competência</b>: receita e impostos na emissão do CT-e/NFS-e; despesa no mês da <b>competência</b> '
        'da conta a pagar (não no dia em que foi cadastrada); o pagamento baixa o fornecedor. Conta cancelada depois '
        'do mês fechado continua no mês dela e sai como estorno no mês do cancelamento.',
        '<b>Regime de caixa</b>: só o que passa pelo caixa. A receita entra no recebimento da fatura (dividida entre '
        'CT-e e NFS-e na proporção dos documentos da fatura), a despesa no pagamento. Emissão, estornos de documentos e '
        'descontos não geram lançamento; ICMS e ISS entram quando pagos (conta a pagar, categoria Impostos). A tela e o '
        'LEIA-ME mostram a receita recebida no período. O livro de saídas é o mesmo nos dois regimes.',
        '<b>Pacote do contador</b> (141): XML de CT-e, MDF-e e NFS-e, livro, lançamentos e LEIA-ME, por download ou '
        'e-mail; o envio automático manda o mês anterior no dia escolhido (o envio à mão do mês inteiro conta).',
    ])
    s.append(P('<b>Notas de entrada e apuração</b> (142): as compras da transportadora (diesel, ARLA, peças, pneus) e '
               'os CT-e de agregados e redespacho em que a empresa é a tomadora.'))
    s += passos([
        '<b>Importar XML (NF-e / CT-e)</b>: escolha um ou vários arquivos. O sistema confere se a nota é para a sua '
        'empresa e se já não foi lançada, e mostra fornecedor, itens, ICMS e as duplicatas.',
        'Confira a <b>data de entrada</b>, a <b>categoria</b> (sugerida pelo NCM: combustível, pneus, manutenção; CT-e '
        'vira frete de terceiro) e o <b>crédito de ICMS</b> sugerido.',
        'Deixe marcado <b>Gerar conta(s) a pagar</b>: sai uma conta por duplicata da nota (sem duplicatas, informe o '
        'vencimento e as parcelas), com a competência na data de entrada.',
        'Clique em <b>Lançar</b>. Nota em papel ou sem XML: <b>Nota sem XML</b>, com fornecedor, número, valor, CFOP e '
        'ICMS digitados.',
    ])
    s += lista([
        '<b>Crédito de ICMS</b> (em Contador e plano de contas): <b>pelas notas</b> (sugere o ICMS dos combustíveis, '
        'lubrificantes e do CT-e tomado; peças e pneus de uso e consumo ficam sem crédito), <b>crédito presumido</b> de '
        '20% do ICMS das saídas (Convênio ICMS 106/96) ou <b>sem crédito</b> (Simples Nacional).',
        '<b>Apuração</b>: débitos das saídas menos os créditos e o saldo credor dos meses anteriores = ICMS a recolher '
        '(ou saldo credor para o mês seguinte). Saldo de antes da primeira nota lançada: informe em Contador e plano '
        'de contas.',
        '<b>Livro de entradas</b> por nota e CFOP de entrada (sugerido: 1653/2653 combustível, 1556/2556 uso e consumo, '
        '1351/2351 frete contratado), para imprimir e em planilha.',
        'Os lançamentos contábeis trazem o crédito (ICMS a recuperar contra a despesa) e a compensação no fim do mês; '
        'o pacote do contador leva os XML de entrada (pasta Entradas) e o livro de entradas.',
        '<b>Cancelar</b> uma nota lançada errada cancela junto as contas a pagar em aberto dela (com pagamento, estorne '
        'antes). Depois dá para lançar o XML de novo.',
    ])
    s.append(P('<b>NF-e contra o CNPJ</b> (143): o sistema busca na SEFAZ (Ambiente Nacional), com o mesmo certificado do '
               'CT-e, todas as NF-e emitidas para a sua empresa, sem pedir o XML ao fornecedor.'))
    s += passos([
        'Clique em <b>Buscar na SEFAZ agora</b> (ou marque <b>Buscar sozinho</b>, a cada hora). Primeiro chega o '
        '<b>resumo</b> de cada nota: fornecedor, valor e situação.',
        'Dê <b>Ciência</b> na nota (ou marque <b>Dar ciência automaticamente</b>): com a ciência, a SEFAZ libera o XML '
        'completo. Se ele não vier na hora, use <b>Baixar XML</b> mais tarde.',
        'Clique em <b>Lançar</b>: abre o mesmo lançamento das Notas de entrada (categoria, crédito, contas a pagar).',
        'Faça a <b>manifestação final</b>: Confirmar a operação, Desconhecer (não comprou) ou Operação não realizada '
        '(com justificativa). É definitiva na SEFAZ; o prazo costuma ser de 180 dias da emissão.',
    ])
    s += lista([
        'Filtros: <b>Para lançar</b>, <b>Sem manifestação final</b>, <b>Já lançadas</b>, <b>Carga sem CT-e</b>, <b>Como '
        'transportador</b> (notas em que a sua empresa aparece como transportadora: chegam completas e não pedem '
        'manifestação) e Todas.',
        '<b>Emitir CT-e</b> na nota em que a sua empresa é a transportadora: monta o rascunho do CT-e (remetente, '
        'destinatário, carga e o frete pela tabela), como as NF-e que chegam por e-mail. Em CT-e (020), o botão <b>NF-e '
        'da SEFAZ</b> mostra todas essas notas para gerar os rascunhos de uma vez. Marcando <b>NF-e em que somos a '
        'transportadora vira rascunho de CT-e sozinha</b>, a busca automática já gera os rascunhos. Nota de outra '
        'transportadora ou sem frete fica com o motivo e não é tentada de novo.',
        'NF-e cancelada pelo emitente fica marcada como cancelada. Nota que não é compra pode ser <b>ignorada</b> (sai '
        'das pendências).',
        'A SEFAZ só aceita nova consulta 1 hora depois de responder que não há nada novo; a tela mostra o horário '
        'liberado. No modo demonstração aparecem três notas de exemplo.',
        'A tela Hoje avisa as NF-e de compra prontas para lançar e as que estão sem manifestação.',
    ])
    s += aviso('importante', 'O SPED não é gerado aqui: o contador importa os XML do pacote (saídas e as entradas lançadas). '
                             'A apuração da tela é uma prévia para conferência; o crédito de cada nota (em especial o '
                             'diesel com ICMS monofásico) deve ser confirmado com o contador.')
    s += aviso('dica', 'Nas planilhas (CSV) geradas pelo sistema, um texto que começa com =, +, - ou @ vira texto puro, '
                       'para o Excel não executá-lo como fórmula.')

    # 50
    s += h1('50. Tabela de frete por cliente')
    s.append(P('Em <b>Cadastros » Tabelas de Preço</b>, na tabela geral, <b>Copiar para um cliente</b> com desconto ou '
               'acréscimo em % (e se vale para todas as filiais). Na cotação, no CT-e e no prazo, vale primeiro a tabela '
               'de quem paga o frete; destino fora dela usa a tabela geral, com aviso.'))
    return s


# ======================================================================
# Parte 6 — Integrações e cadastros
# ======================================================================
def parte_integracoes(g):
    P, h1, h2, h3, lista, passos, aviso, tabela, codigo, parte = _g(g)
    s = []
    s += parte('Parte 6 — Cadastros e integrações',
               'CNPJ automático, rastreamento pelas transportadoras, API para ERP, webhooks e modelos de planilha.')

    # 51
    s += h1('51. CNPJ e CPF nos cadastros')
    s.append(P('Em todo cadastro com CNPJ (transportadora, empresa, configuração fiscal, CT-e, NFS-e, coleta, cotação, '
               'vendedor, contas a pagar, acerto, MDF-e, posto, oficina, régua, tabela de preço e licença), basta digitar '
               'o número:'))
    s += lista([
        'A <b>máscara</b> entra sozinha (00.000.000/0000-00 ou 000.000.000-00).',
        'Dígito verificador errado: o campo fica vermelho na hora.',
        'CNPJ certo: o sistema busca na Receita e preenche razão social, fantasia, IE (quando o serviço informa), '
        'logradouro, número, complemento, bairro, cidade com o código IBGE, UF, CEP, telefone e e-mail. <b>Só nos '
        'campos vazios</b>: o que já foi digitado fica. Empresa que não está ativa na Receita gera aviso.',
        '<b>CNPJ alfanumérico</b> (a partir de julho de 2026, ex.: 12.ABC.345/01DE-35) é aceito e validado; os dados vão à mão.',
    ])
    s.append(P('<b>CNPJ alfanumérico gravado como foi digitado.</b> O servidor guarda as letras (sempre em maiúsculas) '
               'em todos os cadastros: transportadora, empresa, configuração do CT-e, tomador da NFS-e, vendedor, '
               'contas a pagar, proprietário e vale-pedágio do acerto, posto e oficina da frota e cliente da tabela de '
               'preço. O dígito verificador é conferido pela regra nova da Receita (cada letra vale o seu código menos 48), '
               'que também vale para o CNPJ só de números. A busca de transportadora repetida e a NFS-e (tag CNPJ) '
               'também usam o CNPJ com letras. Como os serviços públicos de consulta ainda não trazem esse CNPJ, '
               'a tela avisa "CNPJ alfanumérico: preencha os campos à mão" em vez de dar erro.'))
    s += aviso('nota', 'A consulta é feita pelo servidor em três serviços públicos (BrasilAPI, CNPJ.ws e ReceitaWS) e '
                       'fica guardada 30 dias. Sem internet, aparece o aviso para preencher à mão.')

    # 52
    s += h1('52. Rastreamento pelas transportadoras')
    s.append(P('A Data da Entrega das notas é preenchida sozinha todo dia às 6h30 e pelo botão em Entregas previstas: pela '
               'SSW, pelos portais da <b>Andrade e Abreu</b> (Lonngren) e da <b>LD Rio Pizzo</b> (Central de Canhotos) e pelo '
               'EDI OCOREN. Veja a seção 19 (rastreamento automático) para configurar cada um no cadastro da transportadora.'))

    # 53
    s += h1('53. Integração com ERP: API e webhooks')
    s.append(P('Em <b>Configuração » Integração (API e ERP)</b> (904, só administrador). Cada empresa usa um ERP; a '
               'integração serve para qualquer um que chame um endereço web.'))
    s += h2('Chaves de API')
    s.append(P('Crie uma chave por sistema (ex.: "ERP Bapx") e escolha o que ela pode: <b>Consultar</b> (CT-e, entregas, '
               'faturas) e/ou <b>Enviar NF-e</b>. A chave aparece uma vez só; guarde e passe ao fornecedor do ERP. A lista '
               'mostra o último uso e permite <b>revogar</b>.'))
    s += h2('O que o ERP faz com a chave')
    s += tabela(['Chamada', 'Para quê'], [
        ['GET /api/v1/ctes?alterado_desde=...', 'CT-e que mudaram desde a última consulta (de 100 em 100, com "próxima página").'],
        ['GET /api/v1/ctes/&lt;chave&gt; e /xml', 'Um CT-e (tomador, NF-e, valor, entrega, fatura) e o XML autorizado.'],
        ['GET /api/v1/entregas?desde=&amp;ate=', 'CT-e entregues no período, com data, hora e recebedor.'],
        ['GET /api/v1/faturas', 'Faturas com documentos, pagamentos, saldo e boleto.'],
        ['POST /api/v1/nfe', 'Manda a NF-e (XML); ela vira rascunho de CT-e com o frete da tabela.'],
    ], [0.38, 0.62])
    s += h2('Webhooks (avisos automáticos para o ERP)')
    s.append(P('Cadastre o endereço que o ERP deu (https). O Nexofrete avisa quando o CT-e é autorizado, cancelado ou '
               'substituído, quando a entrega é registrada e quando a fatura é criada, paga ou cancelada. Cada aviso vai '
               'assinado (o ERP confere com o segredo, que aparece uma vez) e, sem resposta, é reenviado em 1 min, 5 min, '
               '15 min, 1 h, 3 h, 6 h, 12 h e 24 h. Botões: <b>Testar</b>, <b>Reenviar</b> e <b>Novo segredo</b>.'))
    s += aviso('atencao', 'Por segurança, o endereço do webhook precisa ser público (https). Para um ERP instalado na rede '
                          'da empresa, o técnico liga a opção WEBHOOK_REDE_INTERNA=1 no servidor.')
    s += aviso('dica', 'A tela traz as instruções completas para o fornecedor do ERP: botão <b>Copiar instruções</b>.')

    # 54
    s += h1('54. Modelos de planilha (ERP que só troca planilha)')
    s += h2('Importar a planilha que o ERP gera')
    s += passos([
        'Em Integração, <b>Modelo de importação</b>: suba uma planilha de exemplo (.xlsx, .xls ou .csv).',
        'O sistema sugere qual coluna é qual pelo nome (pedido, NF, chave, cliente, CNPJ, cidade, peso, volumes, valor, '
        'CIF/FOB, cancelado). Confira e troque o que precisar; ao lado aparece um exemplo de cada coluna.',
        '<b>Usar na importação</b>: a importação manual e a automática (pela pasta) passam a ler por esse modelo.',
    ])
    s += aviso('nota', 'Sem número de pedido, a nota fiscal identifica a linha. Números brasileiros ("1.250,75"), CNPJ com '
                       'pontuação e colunas de cancelado S/N, X ou 1 são entendidos.')
    s += h2('Exportar no formato que o ERP lê')
    s.append(P('<b>Modelo de exportação</b>: escolha o que exportar (CT-e emitidos, notas e fretes, ou faturas), as colunas, '
               'os títulos e a ordem, e o formato (CSV com separador e decimal à escolha, ou Excel). Depois, escolha o '
               'período e <b>Exportar</b>.'))

    # 55
    s += h1('55. Mantendo o manual em dia')
    s.append(P('Este manual é gerado pelo próprio sistema a partir de ferramentas/manual_*.py, com '
               'ferramentas/gerar-manual.bat (ou "py ferramentas/gerar-manual.py"). A cada função nova, o texto é '
               'atualizado junto com as Novidades da tela "Sobre o sistema". A versão impressa na capa vem do sistema instalado.'))
    return s
