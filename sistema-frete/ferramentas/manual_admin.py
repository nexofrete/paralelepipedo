# -*- coding: utf-8 -*-
"""Manual do Nexofrete — Parte 3: administração, segurança e solução de problemas."""


def parte_admin(g):
    P, h1, h2, h3, lista, passos, aviso, tabela, codigo, parte = (
        g['P'], g['h1'], g['h2'], g['h3'], g['lista'], g['passos'], g['aviso'], g['tabela'], g['codigo'], g['parte'])
    s = []
    s += parte('Parte 3 — Administração e segurança',
               'Usuários e permissões, cadastros, configurações de Manutenção, backup e o que fazer quando algo dá errado.')

    # 22
    s += h1('22. Usuários e permissões')
    s.append(P('Em <b>Cadastros » Usuários</b> (precisa de "Gerenciar usuários").'))
    s += h2('Tipos de usuário')
    s += tabela(['Tipo', 'O que pode'], [
        ['Administrador', 'Acesso total. Só um administrador cria outro administrador.'],
        ['Usuário interno', 'Só o que for marcado nas permissões.'],
        ['Cliente', 'Só vê os registros do próprio cliente. O nome do cliente precisa ser escrito exatamente como aparece '
         'na coluna "Cliente" dos registros.'],
    ], [0.25, 0.75])
    s += h2('Permissões')
    s += tabela(['Permissão', 'Libera'], [
        ['Ver todos os registros', 'Ver fretes de todos os clientes. Sem ela, só os do cliente vinculado.'],
        ['Enviar XML', 'Subir XML de NF-e e CT-e.'],
        ['Editar / lançar registros', 'Corrigir campos, lançar registros manuais, recalcular pela tabela.'],
        ['Excluir registros', 'Apagar um registro de frete (permanente).'],
        ['Auditoria de Frete', 'Ver o kanban, a comparação CT-e × tabela e o detalhe de cada frete.'],
        ['Financeiro', 'Ver liberados, vencimentos, meta e exportar para o financeiro.'],
        ['Relatórios', 'Ver gráficos, BI, anomalias e scorecard.'],
        ['Sinistros', 'Ver os sinistros (para registrar, também "Editar / lançar registros").'],
        ['Gerenciar usuários', 'Criar e editar usuários e ver Auditoria e Logs.'],
        ['Gerenciar transportadoras', 'Cadastrar e editar transportadoras.'],
        ['Gerenciar tabelas de preço', 'Criar e editar tabelas; usar "Recalcular todos".'],
        ['Aprovar pagamento', 'Aprovar, rejeitar, registrar glosa e definir quem levou a nota.'],
        ['Conferir fatura', 'Conferir faturas da transportadora (precisa também de "Ver todos os registros").'],
        ['Aprovar valores altos', 'Aprovar fretes acima do limite de alçada.'],
        ['Login em duas etapas (2FA)', 'Exige um código enviado por email a cada login (precisa do email configurado).'],
    ], [0.32, 0.68])
    s += aviso('nota', 'O servidor confere a permissão em cada ação: esconder um botão na tela não é a única proteção. '
                       'Mesmo quem tenta acessar direto pelo endereço da ação recebe "sem permissão".')
    s += h2('Perfis de acesso')
    s.append(P('Um perfil junta as permissões, as telas (com o nível) e as ações de uma função (ex.: Faturamento, Operador de '
               'CT-e, Auditor de frete, Consulta). Crie em <b>Cadastros » Usuários » Perfis de acesso</b>.'))
    s += lista([
        'No cadastro do usuário interno, escolha o perfil em <b>Perfil de acesso</b>: as permissões e as telas dele são '
        'marcados de uma vez (dá para ajustar à mão depois).',
        'Mudar um perfil atualiza na hora todos os usuários que seguem esse perfil (administradores não mudam). A tela de '
        'quem está usando o sistema se atualiza sozinha em até um minuto.',
        'Excluir um perfil não tira acesso de ninguém: os usuários ficam com as permissões que já têm.',
        'O login em duas etapas é de cada pessoa e não faz parte do perfil. Só o administrador cria um perfil com '
        '"Gerenciar usuários".',
    ])
    s += h2('Acesso por tela (o que cada funcionário usa)')
    s.append(P('No cadastro do usuário interno (e no perfil de acesso), o quadro <b>Telas que este usuário usa</b> lista todas as '
               'telas, por área (Operação, Financeiro, Frota, Gestão, Fretes contratados e Cadastros). Para cada uma, escolha:'))
    s += tabela(['Nível', 'O que acontece'], [
        ['Não vê', 'A tela some do menu, do "Ir para" e da tela Hoje, e o servidor recusa o acesso direto.'],
        ['Só consulta', 'Vê tudo, mas não altera nada: o servidor recusa gravar, lançar, transmitir, excluir. Um aviso no canto '
         'da tela lembra que é só consulta.'],
        ['Opera', 'Vê e altera.'],
    ], [0.2, 0.8])
    s += lista([
        'Os links <b>Todas: Não vê · Só consulta · Opera</b> marcam a área inteira de uma vez.',
        'Listas que uma tela usa de outra continuam funcionando: por exemplo, quem opera Coletas vê a lista de veículos e '
        'motoristas, e quem opera o Faturamento vê a lista de contas bancárias (mas não o extrato nem o saldo). Os cadastros '
        '(clientes, cadastros básicos) podem ser lidos por todos; o nível vale para alterar.',
        '<b>Ações sensíveis</b> têm chave própria, mesmo para quem opera a tela: cancelar CT-e e NFS-e; dar baixa em faturas '
        '(recebimento, retorno de boleto, PIX); pagar contas; estornar recebimentos e pagamentos e desfazer conciliação; '
        'cancelar faturas, contas a pagar, acertos e fechamentos de comissão; fechar e reabrir acerto de viagem.',
        'As chaves antigas "Emitir CT-e", "Financeiro", "Auditoria de frete", "Relatórios" e "Sinistros" agora saem da grade '
        '(e somem do formulário). As outras continuam: ver todos os registros, enviar XML, editar e excluir registros, '
        'gerenciar usuários/transportadoras/tabelas, aprovar pagamento e valores altos, conferir fatura.',
        'Na atualização, cada usuário ganhou a grade igual ao acesso que já tinha (com todas as ações), e os módulos '
        'bloqueados viraram "Não vê". Ninguém perdeu acesso: revise e tire o que não deve. Atenção: antes, "Emitir CT-e" '
        'também abria o Faturamento e o Painel gerencial; eles aparecem como "Opera" para esses usuários até você mudar.',
        'O administrador sempre vê tudo. Usuário do tipo Cliente não usa a grade.',
    ])
    s += h2('Modelos prontos por função')
    s.append(P('Para não montar a grade do zero, há modelos com as telas, as ações e as permissões típicas de cada função. '
               'Eles são só o ponto de partida: confira e ajuste antes de salvar.'))
    s += tabela(['Modelo', 'O que já vem marcado'], [
        ['Comercial', 'Cotações, coletas, clientes e SAC; consulta entregas, monitoramento e cadastros básicos'],
        ['Emissor de CT-e', 'CT-e, MDF-e, NFS-e, veículos, coletas, romaneios, ocorrências, conferência, EDI e cadastros básicos; '
         'pode cancelar CT-e e NFS-e'],
        ['Expedição e entregas', 'Romaneios, ocorrências, conferência, monitoramento, coletas, filiais, paletes e MDF-e; consulta '
         'CT-e, veículos e armazém'],
        ['Conferente e armazém', 'Conferência e etiquetas, armazém, filiais e paletes; consulta romaneios e ocorrências'],
        ['Faturista', 'Faturamento e clientes; consulta CT-e, NFS-e, ocorrências e SAC; pode dar baixa em faturas'],
        ['Contas a pagar', 'Contas a pagar, acerto de viagem e cadastros básicos (fornecedores); pode pagar e fechar acerto'],
        ['Tesouraria', 'Caixa e bancos, faturamento e contas a pagar; pode dar baixa, pagar e estornar'],
        ['Fiscal / contador', 'Fiscal e contabilidade; consulta CT-e, MDF-e, NFS-e, faturamento, contas a pagar e bancos'],
        ['Frota', 'Frota, veículos e monitoramento; consulta acertos e contas a pagar'],
        ['SAC / atendimento', 'SAC e ocorrências; consulta monitoramento, CT-e, coletas, cotações e romaneios'],
        ['Gerente', 'Consulta todas as telas, opera o painel e os relatórios; aprova pagamento e valores altos'],
        ['Auditor de fretes', 'Auditoria de frete e relatórios (embarcador); consulta notas, CT-e recebidos, financeiro e sinistros'],
        ['Só consulta', 'Todas as telas em só consulta, sem nenhuma ação'],
    ], [0.25, 0.75])
    s += lista([
        'No cadastro do usuário: <b>Começar de um modelo pronto</b> marca tudo de uma vez (o usuário não fica ligado ao modelo).',
        'Em <b>Perfis de acesso</b>: <b>A partir de um modelo pronto</b> abre um perfil novo já preenchido; salve com o nome que '
        'quiser. Quem segue o perfil é atualizado quando ele muda.',
    ])
    s += h2('Quem pode o quê (relatório)')
    s.append(P('Em <b>Cadastros » Usuários</b>, o botão <b>📋 Quem pode o quê</b> mostra todos os usuários ativos lado a lado, tela '
               'por tela (círculo cheio = opera, meio = só consulta, vazio = não vê), as ações sensíveis, as outras permissões e as '
               'filiais. <b>Excel</b> baixa a mesma tabela para revisar com a direção. Para mudar, edite o usuário ou o perfil dele.'))
    s += h2('Filiais por usuário')
    s.append(P('Em <b>Filiais que este usuário enxerga</b>, marque as filiais dele. Nenhuma marcada = todas. Com filiais '
               'marcadas, ele só vê:'))
    s += lista([
        '<b>CT-e</b> que saem, estão ou vão para uma dessas filiais (abrir, DACTE, XML e as ações de um CT-e de outra filial '
        'respondem "não encontrado");',
        '<b>Romaneios</b> e <b>contas a pagar</b> lançados nessas filiais;',
        '<b>Onde está a mercadoria</b> só com as filiais dele.',
    ])
    s.append(P('Os documentos sem filial (empresa que não usa filiais, ou lançados sem escolher) continuam aparecendo para '
               'todos. Faturas, coletas, cotações e MDF-e ainda não têm filial no sistema e aparecem inteiros.'))
    s += h2('Senhas')
    s += lista([
        'As regras ficam em <b>Manutenção » Segurança</b>: tamanho mínimo (nunca menos de 8), exigir letras e números e, se '
        'quiser, troca obrigatória a cada N dias (quem está com a senha vencida cadastra uma nova ao entrar).',
        '<b>Bloqueio por senhas erradas</b>: depois de N senhas erradas seguidas (padrão 5), a conta fica bloqueada por alguns '
        'minutos (padrão 15) e os administradores recebem um aviso por e-mail. Para liberar antes: Cadastros » Usuários » '
        'Editar » <b>Desbloquear</b>.',
        '<b>Esqueci minha senha</b> (tela de login): a pessoa digita o e-mail e recebe um código de 8 números, que vale 30 '
        'minutos e uma vez só (5 tentativas). Com o código, cria a senha nova; as sessões abertas dela são encerradas. Precisa '
        'do envio de e-mail configurado. A tela não diz se o e-mail existe ou não. É um código, e não um link, para não '
        'depender do endereço do servidor.',
        '<b>Senha provisória</b>: ao criar ou editar um usuário, marque essa opção para que ele cadastre a própria senha '
        'no primeiro acesso.',
        'Esqueceu a senha e ninguém consegue entrar: use o <b>redefinir-senha-admin.bat</b> no servidor (seção 4).',
    ])
    s += h2('Login em duas etapas (2FA)')
    s.append(P('Há dois jeitos. <b>Por e-mail</b>: com a opção ligada no cadastro do usuário, depois do e-mail e da senha o '
               'sistema manda um código de 6 números, válido por 5 minutos (precisa do envio de e-mail configurado). '
               '<b>Por aplicativo autenticador</b> (recomendado): cada pessoa liga em <b>🔐 Minha segurança</b>, no rodapé do '
               'menu, lendo o QR Code com o Google Authenticator, Microsoft Authenticator ou Authy. O código sai do celular, '
               'sem depender do e-mail.'))
    s += lista([
        'Ao ligar o aplicativo, aparecem <b>8 códigos de recuperação</b>: guarde. Cada um entra uma vez, se o celular for '
        'perdido. Em Minha segurança dá para gerar códigos novos (pede a senha).',
        'O mesmo código do aplicativo não entra duas vezes, e o login aceita no máximo 5 códigos errados.',
        'Perdeu o celular e os códigos: o administrador desliga o aplicativo da pessoa em Cadastros » Usuários » Editar » '
        '<b>Desligar o aplicativo autenticador</b>.',
        '<b>Obrigatório</b> (Manutenção » Segurança): para ninguém, para os administradores ou para todos. Quem ainda não tem '
        'nenhum dos dois configura o aplicativo no próximo login, antes de usar o sistema. Para ligar a exigência, o '
        'administrador precisa ter a dele.',
    ])
    s += h2('Sessões')
    s.append(P('Cada login abre uma <b>sessão</b> (aparelho, IP, quando entrou e o último uso). Em <b>🔐 Minha segurança</b> '
               'cada um vê as próprias sessões e encerra uma ou todas as outras; no cadastro do usuário, quem gerencia '
               'usuários vê as sessões da pessoa e pode <b>encerrar todas</b>.'))
    s += lista([
        'Sair encerra a sessão no servidor: o acesso daquele computador para de valer na hora.',
        'Trocar a senha encerra as outras sessões; a senha trocada pelo administrador, a redefinida pelo "Esqueci minha '
        'senha" e o usuário desativado encerram todas.',
        'Quem já estava no sistema antes desta versão continua até a sessão vencer (8 horas) e passa a ter a sessão '
        'controlada no próximo login.',
    ])
    s += h2('Histórico de alterações campo a campo')
    s.append(P('Toda mudança feita por uma pessoa em fretes, usuários, perfis de acesso, transportadoras, parceiros, '
               'clientes, tabelas de preço (e faixas), faturas e contas a pagar fica guardada: <b>o campo, o valor de antes, '
               'o de depois, quem mudou e quando</b>. Também a criação e a exclusão (com o que havia no registro).'))
    s += lista([
        'Em <b>Cadastros » Auditoria e Logs » 🕘 Alterações campo a campo</b>: filtros por cadastro, número do registro, '
        'quem, campo e período.',
        'No detalhe de cada frete, o histórico mostra as alterações junto com cálculo, aprovação, eventos e fatura.',
        'No cadastro do usuário, <b>Alterações deste usuário</b> mostra o que mudou nele (permissões, perfil, módulos...).',
        'Senhas nunca aparecem: só "*** → (nova)". As mudanças automáticas do sistema (cálculo, conferência, rastreio) não '
        'entram aqui; ficam no histórico do frete.',
        'O histórico é guardado pelo prazo definido em Manutenção » LGPD (padrão: 5 anos).',
    ])
    s += h2('Auditoria e Logs')
    s.append(P('Todo login, importação, criação, edição, exclusão, aprovação, glosa, decisão de quem levou a nota e '
               'mudança de configuração fica registrado com usuário, data/hora e detalhe. A tela mostra o dia de hoje; '
               'os dias anteriores são arquivados sozinhos de madrugada, em pastas por dia, em '
               'backend/dados/logs-auditoria.'))

    # 23
    s += h1('23. Transportadoras e dados da empresa')
    s += h2('Transportadoras')
    s += lista([
        'São cadastradas <b>sozinhas</b> quando chega um CT-e de uma transportadora nova. Também podem ser cadastradas à '
        'mão, com preenchimento automático pelo CNPJ.',
        '<b>Dados bancários</b> (banco, agência, conta, tipo, PIX): usados na exportação para o Financeiro.',
        '<b>Rastreamento</b>: endereço de rastreamento da transportadora, com as marcações {NF}, {CTE}, {CHAVE_NFE} e '
        '{CHAVE_CTE}, que o sistema troca pelos dados de cada frete. Exemplo: https://site.com/rastrear?nf={NF}. O link '
        'aparece em Entregas previstas.',
        'Email: usado no envio do espelho do cálculo.',
        '<b>Rastreamento automático pela SSW</b>: marque para as transportadoras que usam o sistema SSW; as entregas '
        'delas passam a ser preenchidas sozinhas (seção 19).',
    ])
    s += h2('Clientes')
    s.append(P('Em <b>Cadastros » Clientes</b>. O cadastro é montado <b>sozinho</b> a partir do XML de cada NF-e importada: CNPJ ou CPF, '
               '<b>inscrição estadual</b> (ou "isento" / "não contribuinte"), razão social, endereço completo com CEP, telefone e e-mail '
               'do destinatário. Ao ligar o servidor, os clientes das notas que já estavam no sistema também são cadastrados.'))
    s += lista([
        'Cada nota nova atualiza os dados do cliente (endereço e IE mudam com o tempo) — sempre pela nota mais recente.',
        'Se você corrigir um cliente à mão, as notas seguintes <b>não desfazem</b> a correção: só preenchem campos vazios. O ✎ na lista '
        'mostra quem foi corrigido.',
        'Clicando no cliente: dados completos e o resumo dos fretes dele (notas, frete cobrado, faturado e % de frete).',
        'Busca por nome, CNPJ, IE ou cidade, e exportação para Excel.',
        '<b>🔎 SEFAZ</b>, ao lado da inscrição estadual: consulta a situação da IE na SEFAZ da UF do cliente (serviço Consulta '
        'Cadastro, com o certificado digital da Configuração fiscal): habilitada, não habilitada (baixada, suspensa ou inapta) ou '
        'sem IE naquela UF, com a razão social, o regime de apuração e a data da baixa. Se a SEFAZ tiver uma IE habilitada '
        'diferente da cadastrada, aparece o botão "Usar a IE ...". A consulta fica guardada por 24 horas e aparece de novo ao '
        'abrir o cliente. Nem toda UF oferece o serviço: quando não oferece, o sistema avisa "Consulta indisponível".',
    ])
    s += h2('Sobre o sistema')
    s.append(P('O botão <b>ℹ️ Sobre o sistema</b>, no rodapé do menu, explica para que serve o Nexofrete, mostra a versão instalada, '
               'as <b>novidades de cada versão</b> e um link para baixar este manual. Quando o sistema é atualizado, o botão mostra o selo '
               '<b>Novo</b> para cada usuário até ele abrir e ver o que mudou. As novidades ficam no arquivo backend/novidades.json, '
               'atualizado junto com cada versão.'))
    s += h2('Cadastros básicos (907)')
    s.append(P('No menu, o grupo <b>📇 Cadastros</b> (logo abaixo de Operação) tem um item para cada cadastro: Clientes, '
               'Fornecedores, Transportadoras, Veículos e motoristas, Conjuntos, Ajudantes, Produtos, Tipos de mercadoria, Tabelas de '
               'preço, Regiões de atendimento, Tipos de operação, Condições de pagamento, Departamentos, Usuários e Empresa (códigos '
               '905 a 920 no "Ir para"). Cada item abre direto a aba daquele cadastro.'))
    s.append(P('Na tela <b>🗂 Cadastros básicos</b> (907), uma aba para cada cadastro de apoio. Cada aba tem busca, '
               '"só ativos", <b>＋ Novo</b>, Editar e o botão 🕘 com as alterações daquele registro. Um cadastro já usado em '
               'outro lugar não é excluído: desmarque <b>Ativo</b> para tirá-lo das listas.'))
    s += tabela(['Cadastro', 'Para que serve', 'Quem edita'], [
        ['Fornecedores', 'Quem a empresa paga (posto, oficina, seguradora, aluguel...): CNPJ/CPF (completa sozinho pela '
         'Receita), endereço, categoria de despesa padrão, condição de pagamento e PIX. "Trazer dos lançamentos" cadastra os '
         'fornecedores que já aparecem nas contas a pagar e nas notas de entrada.', 'Financeiro'],
        ['Ajudantes', 'Ajudantes de carga e descarga: nome, CPF, telefone, diária, PIX e filial.', 'Emitir CT-e'],
        ['Conjuntos (cavalo + carretas)', 'O cavalo mecânico com até 3 carretas/implementos e o motorista de costume. As '
         'carretas são cadastradas em Veículos e motoristas, com o tipo reboque.', 'Emitir CT-e'],
        ['Produtos', 'Código, descrição, NCM, unidade, embalagem, peso e medidas por unidade, valor, tipo de mercadoria, '
         'perigoso (ONU e classe de risco) e o cliente dono.', 'Emitir CT-e'],
        ['Tipos de mercadoria', 'Natureza da carga: geral, fracionada, refrigerada, perigosa, granel, alto valor, frágil, '
         'mudança (já vêm cadastrados), com as marcas perigosa, refrigerada e exige escolta.', 'Emitir CT-e'],
        ['Departamentos', 'Setores da empresa, com responsável e centro de custo.', 'Gerenciar usuários ou Financeiro'],
        ['Regiões de atendimento', 'O que cada filial atende: estados, cidades (CIDADE/UF) e faixas de CEP, prazo de entrega '
         'e dias da semana. Para achar a região de um destino, a faixa de CEP vale mais que a cidade, e a cidade mais que o '
         'estado.', 'Emitir CT-e'],
        ['Tipos de operação', 'Modelos de CT-e com CFOP dentro e fora do estado, natureza, tipo de serviço, tomador e tipo de '
         'mercadoria. Já vêm: frete para comércio, indústria e não contribuinte, FOB, subcontratação, redespacho e prestação '
         'iniciada em outra UF (confira os CFOP com o seu contador).', 'Emitir CT-e'],
        ['Condições de pagamento', 'Prazos em dias, uma parcela por número: à vista (0), 30, 30/60, 30/60/90... Já vêm as mais '
         'comuns.', 'Financeiro'],
    ], [0.22, 0.6, 0.18])
    s.append(P('<b>Onde cada cadastro é usado:</b>'))
    s += tabela(['Cadastro', 'Onde aparece'], [
        ['Fornecedores', 'Contas a pagar: escolha o fornecedor na lista e o CNPJ, a categoria e a condição de pagamento '
         'entram sozinhos. Ao lançar uma nota de entrada, o emitente vira fornecedor (ou é atualizado).'],
        ['Condições de pagamento', 'Contas a pagar: com a condição, as parcelas saem pelos dias dela, contados da competência '
         '(30/60/90 = três parcelas, 30, 60 e 90 dias depois). No cliente (Clientes, campo Condição de pagamento): o '
         'vencimento da fatura usa o primeiro prazo dela; sem condição, vale o prazo padrão da empresa.'],
        ['Departamentos', 'Na conta a pagar (campo Departamento) e no usuário (Acessos).'],
        ['Ajudantes', 'No romaneio (Ajudantes da viagem). Ao <b>Fechar</b> o romaneio, a diária de cada ajudante vira uma '
         'conta a pagar ("Diária de ajudante", com o PIX na observação), uma vez só.'],
        ['Conjuntos', 'No MDF-e, ao escolher o cavalo, as carretas e o motorista de costume entram sozinhos. No romaneio, a '
         'placa do cavalo preenche o campo Veículo com as carretas.'],
        ['Tipos de operação', 'Na emissão do CT-e (quadro Tipo de operação): preenche o CFOP, o tipo de serviço, o tomador e '
         'o tipo de mercadoria. Tudo pode ser mudado à mão depois.'],
        ['Tipos de mercadoria', 'Na emissão do CT-e, preenche "Outras características da carga" quando estiver vazio.'],
        ['Produtos', 'Sugestões do "Produto predominante" no CT-e. Na cotação, escolha o produto e a quantidade: peso, '
         'cubagem, valor e volumes são calculados.'],
        ['Regiões de atendimento', 'Prazo de entrega do CT-e quando a tabela de frete não tem prazo (antes do prazo padrão), '
         'filial de entrega quando a cidade não está numa filial, e o prazo da cotação quando a tabela não tem.'],
    ], [0.24, 0.76])
    s.append(P('Também fazem parte dos cadastros: empresa e usuários (Cadastros), filiais (901), clientes, transportadoras, '
               'parceiros, motoristas e veículos (Veículos e motoristas), centros de custo (302) e tabelas de frete. Cidades e '
               'estados vêm da lista oficial do IBGE e não precisam ser cadastrados.'))
    s += h2('Dados da empresa')
    s.append(P('Razão social, nome fantasia, CNPJ, IE, contato e endereço da empresa que usa o sistema. No alto do quadro, a '
               '<b>logo da empresa</b> (🖼 Escolher imagem — PNG, JPG ou WEBP até 1 MB, de preferência com fundo transparente ou branco): '
               'ela sai no cabeçalho do romaneio de carga, das notas sem mapa, da conferência de fatura, da tabela de preço e das telas '
               'impressas pelo navegador (Relatórios, Auditoria). A logo fica no banco de dados e vai junto no backup.'))

    # 24
    s += h1('24. Manutenção')
    s.append(P('Só o <b>administrador</b> vê e muda. A tela tem duas abas (no menu Configuração: <b>Manutenção</b>, 903, e '
               '<b>Integrações</b>, 904):'))
    s += lista([
        '<b>🖥 Sistema</b>: licença, atualização, usuários conectados, atalho, fuso do banco, HTTPS, segurança, margem da '
        'auditoria, limpezas, resumo semanal, aviso aos usuários, backup, LGPD e zerar o banco.',
        '<b>🔗 Integrações</b>: tudo o que liga o Nexofrete a outro sistema: NF-Stock (Alterdata), EDI por SFTP / FTP (capítulo 38), chaves de API e webhooks do '
        'ERP, modelos de planilha, leitura automática de e-mail, envio de e-mail (SMTP), WhatsApp, pasta monitorada de XML, '
        'planilha automática do ERP e leitura de comprovantes por IA (capítulo 53).',
        'O quadro <b>Outras integrações</b>, no fim da aba, leva direto às que ficam na tela do assunto: seguro da carga '
        '(averbação), CT-e na SEFAZ, NF-e contra o CNPJ, PIX com baixa automática, boleto, CIOT e vale-pedágio, gerenciamento '
        'de risco, NFS-e, mapas e roteirização, EDI e rastreio nos portais das transportadoras. Essas também só o '
        'administrador configura: os outros usuários veem a configuração, mas não mudam (a do boleto, a busca automática '
        'de NF-e e a senha do portal da transportadora passaram a ser só do administrador).',
    ])
    s.append(P('Cada quadro da tela:'))
    s += tabela(['Quadro', 'Para que serve'], [
        ['Atualizar o sistema', 'Instala uma versão nova a partir do .zip, com backup antes (seção 9).'],
        ['Zerar o banco de dados', 'Apaga a movimentação para começar sem informações (veja "Zerar o banco de dados", abaixo).'],
        ['Pasta monitorada de XML', 'Importação automática dos XML que chegam numa pasta (seção 12).'],
        ['Importação automática da planilha do ERP', 'Se a planilha é salva sempre no mesmo caminho, o sistema confere a '
         'cada X minutos se ela mudou e importa sozinho. "Verificar e importar agora" força a importação.'],
        ['Usuários no sistema', 'Quem está usando agora e a última atividade de cada um.'],
        ['Segurança', 'Tempo de inatividade até o logout automático (em branco = desligado), regras de senha, bloqueio por '
         'senhas erradas, troca periódica e verificação em duas etapas obrigatória (capítulo 22).'],
        ['Margem de tolerância da auditoria', 'Diferença aceitável para liberar sozinho: usa o que for <b>maior</b> entre '
         'o valor fixo (R$) e o percentual. Também: limite de alçada e o % da reentrega/devolução (padrão 50%).'],
        ['Leitura automática de e-mail', 'Finalidades: devoluções/trocas e XML (embarcador), NF-e que viram CT-e, SAC e '
         '<b>EDI das transportadoras</b> (OCOREN, CONEMB, DOCCOB e NOTFIS anexados; capítulo 38). Aceita várias caixas (uma para cada pessoa que envia devoluções). Lê uma pasta de cada caixa (IMAP; no webmail da hospedagem: servidor '
         'mail.dominio, porta 993, o mesmo usuário e senha do webmail). Registra sozinho as devoluções/trocas de nota escritas no '
         'modelo padrão e importa os XML anexados. O mais simples é apontar a pasta de Enviados (ex.: INBOX.Sent) de quem manda '
         'esses e-mails e preencher "Só e-mails enviados por" com o(s) endereço(s). Lê por data (1ª vez: últimos 30 dias), cada '
         'e-mail uma vez só, sem alterar nada na caixa. "Testar conexão" mostra as pastas. A senha fica criptografada.'],
        ['Limpeza: notas "Aguardando CT-e"', 'Separa as notas sem CT-e por motivo — FOB (o CT-e é cobrado do cliente), sem '
         'frete, só da planilha do ERP, antigas (sem CT-e há mais de N dias) e as que aguardam de verdade — e limpa grupo a '
         'grupo, com confirmação. Nada é apagado: FOB e sem frete viram "Não cobrado", as antigas viram "Arquivado", e '
         'qualquer uma volta sozinha para a conferência se o CT-e chegar. "Desfazer arquivamento" desfaz as arquivadas.'],
        ['Recalcular Valor Frete Tabelado', 'Refaz o cálculo de todos os registros com as tabelas atuais. Mostra as '
         'transportadoras com mais fretes parados por falta de tabela — cadastre essas primeiro.'],
        ['Envio de Email', 'Servidor SMTP da empresa, para o espelho do cálculo, o 2FA e o resumo semanal. No Gmail, use '
         'uma "senha de app", não a senha normal da conta.'],
        ['Resumo Executivo Semanal', 'Toda segunda-feira, às 7h, manda por email os números da semana.'],
        ['Notificações por WhatsApp', 'Todo dia às 8h, se houver frete retido ou pagamento vencido, manda um resumo por '
         'WhatsApp (via Twilio). Não manda nada quando não há urgência.'],
        ['Avisar todos os usuários', 'Faixa no topo da tela de todo mundo, em até 20 segundos. Tem mensagens prontas de '
         'manutenção e pode encerrar sozinha depois de X minutos.'],
        ['Fuso do banco', 'Confere se as horas estão no horário de Brasília. Compara a hora de autorização de cada CT-e e '
         'MDF-e com a hora do protocolo da SEFAZ que está no XML. Em versões antigas, um PostgreSQL em UTC gravava essa hora '
         '3 horas adiantada (o CT-e das 22h caía no dia seguinte, e no último dia do mês, no mês seguinte). "Corrigir pelo '
         'protocolo da SEFAZ" faz um backup e acerta só esses documentos, um a um. Hoje o sistema grava sempre no horário de '
         'Brasília, qualquer que seja o fuso do PostgreSQL. Se houver documento com hora errada, o aviso aparece também no sino.'],
        ['Backup automático', 'Veja a seção 25.'],
    ], [0.3, 0.7])
    s += aviso('importante', 'Depois de corrigir o fuso, se algum mês já foi mandado ao contador com esses documentos, '
                             'gere de novo o livro de saídas daquele mês e confira com ele: um CT-e pode ter mudado de dia ou de mês.')
    s += aviso('atencao', 'Mudar o % da reentrega/devolução refaz o valor esperado das reentregas e devoluções que ainda '
                          'não foram decididas. As já aprovadas por uma pessoa, faturadas ou canceladas não mudam.')
    s += aviso('dica', 'Antes de uma manutenção no servidor, use "Avisar todos os usuários" com a mensagem pronta '
                       '"Manutenção em 5 min", e "Manutenção concluída" no final.')

    s += h2('Zerar o banco de dados')
    s.append(P('No fim da tela de Manutenção, o quadro <b>Zerar o banco de dados</b> apaga as informações para começar do zero '
               '(por exemplo, depois de testar o sistema). Só o administrador vê.'))
    s += passos([
        'Clique em <b>Zerar o banco de dados</b>. A janela mostra o que vai sair e quanto há de cada coisa: fretes e notas, '
        'CT-e, MDF-e, NFS-e, coletas, cotações, romaneios, faturas, contas a pagar, caixa e bancos, ocorrências, agenda, '
        'frota, registro de atividades etc., mais as fotos de canhoto, assinaturas e anexos.',
        'Marque <b>Apagar também os cadastros</b> se quiser tirar também transportadoras, tabelas de preço, clientes, '
        'parceiros, veículos, motoristas, filiais e contas bancárias. Sem marcar, os cadastros ficam.',
        'Digite <b>ZERAR</b> e a sua senha e clique em <b>Fazer backup e zerar</b>. A tela recarrega já vazia.',
    ])
    s += lista([
        '<b>Nunca são apagados</b>: os usuários, os perfis de acesso, os dados da empresa (certificado digital, séries) e as '
        'configurações (e-mail, backup, segurança, WhatsApp, pasta de XML, ERP, chaves de API).',
        '<b>Backup antes, sempre</b>: o sistema faz um backup completo antes de apagar. Se o backup falhar, nada é apagado. '
        'Para voltar atrás: Backups salvos » Restaurar o backup feito na hora.',
        '<b>Numeração fiscal</b>: o próximo número do CT-e, MDF-e e NFS-e em produção continua de onde parou, porque a SEFAZ '
        'rejeita número repetido. Os documentos de homologação (teste) não contam.',
        'O que foi feito fica no novo registro de atividades (quem zerou, quando e o nome do backup).',
    ])

    # 25
    s += h1('25. Backup do banco de dados')
    s += h2('Configuração')
    s += lista([
        'Em <b>Manutenção » Backup automático</b>: ative e escolha a frequência (diário ou semanal, com o dia da semana) '
        'e o horário.',
        'Escolha quantos backups manter: os mais antigos são apagados sozinhos.',
        '<b>Copiar cada backup também para</b> uma pasta fora do servidor (pasta de rede ou outro computador, ex: '
        '\\\\OUTRO-PC\\Backups-Nexofrete). Se o disco do servidor falhar, o backup continua existindo lá.',
        '"Fazer backup agora" gera um backup imediato.',
    ])
    s.append(P('Os backups ficam em backend/dados/backups e podem ser baixados pela lista "Backups salvos". O sistema '
               'também faz um backup sozinho antes de cada atualização. O sino avisa se nenhum backup foi feito ou se o '
               'último está atrasado.'))
    s += h2('Backup inteiro protegido pela senha')
    s.append(P('Com a <b>senha do backup</b> definida, marque <b>Proteger o backup inteiro com a senha</b>: o arquivo todo '
               '(banco, fotos de canhoto, assinaturas, anexos e a chave do sistema) sai embaralhado, com a extensão .nxbk, e '
               'aparece com um cadeado na lista. Uma cópia na nuvem ou num pendrive não serve para nada sem a senha.'))
    s += aviso('importante', '<b>Anote a senha do backup em lugar seguro.</b> Sem ela, um backup .nxbk não abre de jeito '
                             'nenhum, nem para restaurar. Ao restaurar, o sistema pede a senha e confere antes de mexer no '
                             'banco: senha errada não muda nada.')
    s += h2('Restaurar um backup')
    s.append(P('Na lista "Backups salvos", clique em <b>Restaurar</b> e digite RESTAURAR para confirmar. Antes de '
               'restaurar, o sistema faz um backup de segurança do banco do jeito que está, para dar para voltar atrás.'))
    s += aviso('importante', 'Restaurar substitui <b>todo</b> o banco pelo conteúdo do backup: tudo o que foi feito depois '
                             'dele se perde. Avise os usuários antes.')
    s += h2('Se aparecer "pg_dump não encontrado"')
    s.append(P('O backup usa o programa pg_dump, que vem com o PostgreSQL. Informe o caminho completo dele em "Caminho do '
               'pg_dump", algo como:'))
    s += codigo('C:\\Program Files\\PostgreSQL\\17\\bin\\pg_dump.exe')

    s += h2('LGPD: dados pessoais')
    s.append(P('Em <b>Manutenção » 🛡 LGPD</b> (só administrador), para atender o pedido de uma pessoa (o titular):'))
    s += lista([
        '<b>Consultar</b> pelo CPF, CNPJ, e-mail ou nome: mostra em que lugares do sistema há dados dela, quantos registros '
        'e por que são guardados.',
        '<b>Exportar tudo</b> em JSON ou Excel, para entregar ao titular. Cada exportação fica no registro de atividades.',
        '<b>Anonimizar</b> (por CPF, pessoa física): troca o nome por "TITULAR ANONIMIZADO" e apaga CPF, e-mail, telefone e '
        'endereço nos cadastros e registros que não são obrigatórios por lei: clientes, motoristas, vendedores, parceiros, '
        'cotações, coletas e SAC. Pede ANONIMIZAR e a senha, e não dá para desfazer (só restaurando um backup). O histórico '
        'de alterações desses registros também é apagado.',
        '<b>Ficam guardados por obrigação legal</b> (LGPD, art. 16): notas fiscais e CT-e, financeiro e contas a pagar, '
        'acertos de viagem, romaneios e a jornada do motorista. Usuários e acessos ao portal saem desativando o acesso.',
        '<b>Prazo de guarda</b>: o histórico de alterações e os registros de atividades arquivados mais antigos que o prazo '
        '(padrão 1825 dias = 5 anos; mínimo 365; 0 = sem prazo) são apagados sozinhos, uma vez por dia.',
        '<b>Aviso de privacidade</b>: aparece no link "Aviso de privacidade" da tela de login e do portal do cliente. Há um '
        'texto padrão (o que é tratado, para quê, com quem e os direitos do titular); escreva o da empresa no quadro se quiser.',
    ])

    # 26
    s += h1('26. Segurança do sistema')
    s.append(P('Proteções que já vêm ativas:'))
    s += tabela(['Proteção', 'Como funciona'], [
        ['Senhas com hash', 'As senhas nunca são guardadas em texto: só um hash (bcrypt) que não pode ser revertido.'],
        ['Sessão temporária', 'O login expira em 8 horas e também ao fechar o navegador ou a janela sem clicar em "Sair".'],
        ['Logout por inatividade', 'Configurável em Manutenção: depois de X minutos sem uso, desconecta e avisa.'],
        ['Limite de tentativas', 'No máximo 15 tentativas de login a cada 15 minutos por computador.'],
        ['Login em duas etapas', 'Opcional por usuário, com código por email.'],
        ['Senha mínima', '8 caracteres.'],
        ['Permissões no servidor', 'Toda ação sensível confere a permissão no servidor, não só na tela.'],
        ['Log de auditoria', 'Registro de quem fez o quê e quando, arquivado por dia.'],
        ['Cabeçalhos de segurança', 'Proteções padrão contra ataques comuns de navegador (Helmet).'],
        ['Sem acesso de outros sites', 'O sistema não aceita chamadas feitas por outros sites.'],
        ['Consultas parametrizadas', 'Evitam ataques de injeção de SQL.'],
        ['CT-e cancelado travado', 'Não pode ser alterado, aprovado, faturado nem excluído.'],
        ['Textos de fora não viram código', 'Tudo que chega de XML, e-mail, SSW e portais passa por uma limpeza no banco: os caracteres '
         'usados para montar código numa página (< > " \') viram equivalentes visuais (‹ › ” ’). Impede que um XML preparado rode '
         'um script no navegador e roube a sessão de alguém.'],
        ['Proteção contra .zip malicioso', 'Cada arquivo descompactado pode ter no máximo 50 MB, e o .zip inteiro 500 MB e 50 mil '
         'arquivos — um .zip "bomba" (pequeno, que se expande para gigabytes) é recusado em vez de derrubar o servidor.'],
        ['Limite de tamanho nos envios', 'XML até 20 MB, planilha do ERP até 60 MB, tabela de preço até 30 MB, .zip e atualização até 200 MB.'],
        ['Senhas guardadas criptografadas', 'Senha do e-mail de envio (SMTP), das caixas de leitura de e-mail e dos portais das '
         'transportadoras ficam criptografadas no banco e nos backups, e nunca voltam para a tela.'],
        ['Proteção do navegador (CSP)', 'A página só roda scripts do próprio sistema e só conversa com o próprio servidor (e a '
         'BrasilAPI, na consulta de CNPJ). Mesmo que um script malicioso entrasse, não teria para onde mandar os dados.'],
        ['HTTPS (opcional)', 'Em Manutenção » HTTPS: o sistema cria um certificado próprio da empresa. Cada computador instala o '
         'certificado uma vez (instalador no próprio quadro); depois, ligando o HTTPS, senhas e dados viajam criptografados na rede, '
         'com o cadeado no navegador. Quem abrir pelo http:// é levado ao https://. Se o IP do servidor mudar, o certificado do '
         'servidor é refeito sozinho, sem reinstalar nada nos computadores. Segurança do certificado: ele só vale para o próprio '
         'servidor e para endereços de rede interna (não serve para imitar sites da internet); o instalador confere a impressão '
         'digital e cancela se o certificado tiver sido trocado no caminho; a chave secreta fica fora da pasta do sistema '
         '(C:\\ProgramData\\Nexofrete\\certificado), com acesso só do usuário do servidor — não copie essa pasta.'],
        ['Links de download sem a senha', 'DACTE, XML, boleto, fatura, planilhas, anexos e as imagens do mapa abrem em outra aba '
         'por um link. Esse link não leva a sessão do usuário: na hora do clique o sistema gera um ticket que só abre aquele '
         'arquivo, só para leitura, e vence em 2 minutos (o do mapa da roteirização, em 8 horas, e só serve para as imagens do '
         'mapa). Assim o histórico do navegador, um proxy ou um log não guardam nada que dê acesso ao sistema. Vale também no '
         'portal do cliente. Link antigo copiado ou salvo nos favoritos não abre mais: volte à tela e clique de novo no botão.'],
        ['Aviso de senha de fábrica', 'Enquanto o administrador padrão usar a senha "admin123", ou o arquivo PRIMEIRO_ACESSO.txt '
         'existir, os administradores veem um aviso 🔐 no sino.'],
    ], [0.3, 0.7])

    # 27
    s += h1('27. Boas práticas fora do sistema')
    s += h2('Nunca exponha o sistema para a internet')
    s += lista(['Não configure "port forwarding" da porta 3333 no roteador.',
                'Para acesso de fora da empresa, use uma VPN em vez de expor o sistema.'])
    s += h2('Backup fora do computador (regra 3-2-1)')
    s.append(P('Mantenha pelo menos <b>3 cópias</b> dos dados, em <b>2 tipos</b> de mídia diferentes, sendo <b>1 fora</b> '
               'da empresa (pendrive levado para casa ou serviço de nuvem). A cópia automática para outra pasta cobre a '
               'segunda mídia; a cópia fora do local ainda precisa ser feita de tempos em tempos.'))
    s += h2('Mantenha os programas atualizados')
    s += lista(['Atualize o Node.js e o PostgreSQL periodicamente.', 'Mantenha o Windows do servidor atualizado.'])
    s += h2('Usuário de banco com menos privilégio (avançado, opcional)')
    s.append(P('O sistema se conecta ao PostgreSQL com o usuário "postgres", que tem acesso total ao servidor de banco. '
               'Em ambientes mais sensíveis, um administrador de banco pode criar um usuário com acesso só ao banco '
               '"sistema_frete" e trocar esse dado no arquivo backend/.env.'))
    s += h2('Acesso físico ao servidor')
    s += lista(['Tela protegida por senha do Windows.', 'Servidor fora de local de acesso público.',
                'No-break, se possível: queda de energia no meio de uma gravação é a principal causa de problema em banco.'])

    # 28
    s += h1('28. Solução de problemas')
    problemas = [
        ('"EADDRINUSE: porta 3333 já em uso"',
         'Já existe outra janela do servidor rodando. Feche todas as janelas do iniciar.bat, ou reinicie o computador, e '
         'tente de novo.'),
        ('Os outros computadores não conseguem acessar',
         'Confira se o servidor está ligado, se o endereço usa o IP (não o nome do computador), se o IP do servidor não '
         'mudou e se o Firewall do Windows libera a porta 3333 na rede privada.'),
        ('O sistema estava funcionando e depois de ligar o computador parou',
         'O IP do servidor pode ter mudado (IP automático). Deixe o IP fixo (seção 5) e recrie os atalhos.'),
        ('Mudei algo e não aparece / o problema continua igual',
         'Quase sempre há mais de uma cópia da pasta do sistema e é outra que está rodando. Confira qual pasta a janela do '
         'servidor está usando e mantenha uma só.'),
        ('Arquivo .bat fecha na hora ou dá erro de caminho',
         'Caminho com acento ou espaço (ex: "C:\\Users\\André Luiz"). Os .bat do sistema usam o caminho curto do Windows; '
         'se criar um .bat novo, use o mesmo recurso — ou mova o sistema para uma pasta sem acentos.'),
        ('"Não encontrei o programa pg_dump"',
         'Informe o caminho completo do pg_dump.exe em Manutenção » Backup (seção 25).'),
        ('CT-e sem valor pela tabela ("SEM CÁLCULO")',
         'Abra o Detalhe e clique em "Recalcular pela tabela": o motivo aparece ali. Os mais comuns: a transportadora não '
         'tem tabela ativa, ou a cidade (ou bairro) do cliente não está em nenhum trecho. Corrija a tabela e recalcule.'),
        ('Nota com transportadoras diferentes',
         'Confirme com as transportadoras qual levou a mercadoria e use "Foi esta que levou" no Detalhe (seção 16).'),
        ('Um XML não entrou pela pasta monitorada',
         'Veja a subpasta "Com erro" e a última mensagem no quadro da pasta, em Manutenção. XML já importado antes (mesma '
         'chave) é ignorado de propósito.'),
        ('Planilha do ERP "não encontrada"',
         'Confira se o caminho está exatamente igual ao do Explorador de Arquivos, sem aspas no começo e no fim, e clique '
         'em "Salvar configuração" antes de "Verificar".'),
        ('Pedido da planilha não aparece na lista',
         'A planilha não cria registros: o pedido aparece quando o XML da NF-e dele chegar (seção 12).'),
        ('Não consigo aprovar um frete',
         'Veja a mensagem: pode faltar a permissão, o valor pode estar acima do limite de alçada, o CT-e pode estar '
         'cancelado ou ser de uma transportadora que não levou a nota.'),
        ('Ícone do atalho genérico ou antigo',
         'Cache de ícones do Windows ou mais de uma cópia da pasta. Apague o atalho e crie de novo.'),
        ('Anexo de mensagem sumiu',
         'O servidor foi ligado a partir de outra cópia da pasta do sistema. Mantenha uma única pasta.'),
        ('Ninguém consegue entrar',
         'Use o redefinir-senha-admin.bat no servidor para gerar uma senha provisória (seção 4).'),
    ]
    for titulo, texto in problemas:
        s += h3(titulo)
        s.append(P(texto))

    return s


def parte_glossario(g):
    P, h1, tabela = g['P'], g['h1'], g['tabela']
    s = []
    s += h1('Glossário')
    s += tabela(['Termo', 'Significado'], [
        ['NF-e', 'Nota fiscal eletrônica da venda.'],
        ['CT-e', 'Conhecimento de transporte eletrônico: o documento da transportadora que cobra o frete.'],
        ['CIF', 'Frete pago pela empresa que vende (remetente).'],
        ['FOB', 'Frete pago por quem compra (destinatário).'],
        ['Redespacho', 'Quando a transportadora passa a carga para outra, que faz a entrega final.'],
        ['Carga Direta', 'Caminhão dedicado negociado à parte, fora da tabela padrão.'],
        ['Ad Valorem', 'Taxa percentual sobre o valor da mercadoria (seguro).'],
        ['GRIS', 'Gerenciamento de risco: percentual sobre o valor da mercadoria, com um mínimo.'],
        ['TDE / TDA / TRT', 'Taxas de dificuldade de entrega, dificuldade de acesso e restrição de trânsito.'],
        ['Peso cubado', 'Peso calculado pelo volume da carga (m³ × fator de cubagem).'],
        ['Glosa', 'Desconto combinado com a transportadora quando ela cobrou a mais.'],
        ['Alçada', 'Valor acima do qual só um gerente pode aprovar.'],
        ['Tolerância', 'Diferença pequena aceita sem travar o pagamento.'],
        ['SLA', 'Prazo de entrega combinado; no prazo × atrasado.'],
        ['Canhoto', 'Comprovante de entrega assinado por quem recebeu.'],
        ['MDF-e', 'Manifesto eletrônico da viagem: lista os CT-e que vão no caminhão.'],
        ['NFS-e', 'Nota fiscal de serviço: usada no frete dentro do mesmo município (ISS).'],
        ['Romaneio', 'Lista de entregas (e coletas) de um caminhão, com a ordem e o motorista.'],
        ['CNAB 240', 'Padrão dos arquivos de remessa e retorno de boletos com o banco.'],
        ['OFX', 'Arquivo do extrato bancário, para a conciliação.'],
        ['Webhook', 'Aviso automático que o Nexofrete manda ao ERP quando algo muda.'],
        ['Chave de API', 'Senha de acesso que o ERP usa para consultar o Nexofrete.'],
        ['OUTRAUF', 'ICMS devido a outra UF, recolhido por GNRE, fora da apuração própria.'],
    ], [0.25, 0.75])
    return s
