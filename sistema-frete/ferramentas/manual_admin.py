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
    s += h2('Senhas')
    s += lista([
        'Mínimo de 8 caracteres.',
        '<b>Senha provisória</b>: ao criar ou editar um usuário, marque essa opção para que ele cadastre a própria senha '
        'no primeiro acesso.',
        'Esqueceu a senha e ninguém consegue entrar: use o <b>redefinir-senha-admin.bat</b> no servidor (seção 4).',
    ])
    s += h2('Login em duas etapas (2FA)')
    s.append(P('Com a opção ligada para um usuário, depois do email e da senha o sistema manda um código de 6 números '
               'para o email dele, válido por 5 minutos. Só funciona com o envio de email configurado (seção 24).'))
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
    ])
    s += h2('Sobre o sistema')
    s.append(P('O botão <b>ℹ️ Sobre o sistema</b>, no rodapé do menu, explica para que serve o Nexofrete, mostra a versão instalada, '
               'as <b>novidades de cada versão</b> e um link para baixar este manual. Quando o sistema é atualizado, o botão mostra o selo '
               '<b>Novo</b> para cada usuário até ele abrir e ver o que mudou. As novidades ficam no arquivo backend/novidades.json, '
               'atualizado junto com cada versão.'))
    s += h2('Dados da empresa')
    s.append(P('Razão social, nome fantasia, CNPJ, IE, contato e endereço da empresa que usa o sistema. No alto do quadro, a '
               '<b>logo da empresa</b> (🖼 Escolher imagem — PNG, JPG ou WEBP até 1 MB, de preferência com fundo transparente ou branco): '
               'ela sai no cabeçalho do romaneio de carga, das notas sem mapa, da conferência de fatura, da tabela de preço e das telas '
               'impressas pelo navegador (Relatórios, Auditoria). A logo fica no banco de dados e vai junto no backup.'))

    # 24
    s += h1('24. Manutenção')
    s.append(P('Configurações gerais do sistema. Cada quadro da tela:'))
    s += tabela(['Quadro', 'Para que serve'], [
        ['Atualizar o sistema', 'Instala uma versão nova a partir do .zip, com backup antes (seção 9).'],
        ['Pasta monitorada de XML', 'Importação automática dos XML que chegam numa pasta (seção 12).'],
        ['Importação automática da planilha do ERP', 'Se a planilha é salva sempre no mesmo caminho, o sistema confere a '
         'cada X minutos se ela mudou e importa sozinho. "Verificar e importar agora" força a importação.'],
        ['Usuários no sistema', 'Quem está usando agora e a última atividade de cada um.'],
        ['Segurança', 'Tempo de inatividade até o logout automático (em branco = desligado).'],
        ['Margem de tolerância da auditoria', 'Diferença aceitável para liberar sozinho: usa o que for <b>maior</b> entre '
         'o valor fixo (R$) e o percentual. Também: limite de alçada e o % da reentrega/devolução (padrão 50%).'],
        ['Leitura automática de e-mail', 'Aceita várias caixas (uma para cada pessoa que envia devoluções). Lê uma pasta de cada caixa (IMAP; no webmail da hospedagem: servidor '
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
        ['Backup automático', 'Veja a seção 25.'],
    ], [0.3, 0.7])
    s += aviso('atencao', 'Mudar o % da reentrega/devolução refaz o valor esperado das reentregas e devoluções que ainda '
                          'não foram decididas. As já aprovadas por uma pessoa, faturadas ou canceladas não mudam.')
    s += aviso('dica', 'Antes de uma manutenção no servidor, use "Avisar todos os usuários" com a mensagem pronta '
                       '"Manutenção em 5 min", e "Manutenção concluída" no final.')

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
    s += h2('Restaurar um backup')
    s.append(P('Na lista "Backups salvos", clique em <b>Restaurar</b> e digite RESTAURAR para confirmar. Antes de '
               'restaurar, o sistema faz um backup de segurança do banco do jeito que está, para dar para voltar atrás.'))
    s += aviso('importante', 'Restaurar substitui <b>todo</b> o banco pelo conteúdo do backup: tudo o que foi feito depois '
                             'dele se perde. Avise os usuários antes.')
    s += h2('Se aparecer "pg_dump não encontrado"')
    s.append(P('O backup usa o programa pg_dump, que vem com o PostgreSQL. Informe o caminho completo dele em "Caminho do '
               'pg_dump", algo como:'))
    s += codigo('C:\\Program Files\\PostgreSQL\\17\\bin\\pg_dump.exe')

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
