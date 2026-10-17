# -*- coding: utf-8 -*-
"""
Conteúdo do Manual do Nexofrete.

A cada função nova (não só a cada versão): atualize o texto das seções que
mudaram — Partes 1 a 3 aqui, em manual_uso.py e manual_admin.py; Partes 4 a 6
(transportadora, financeiro e gestão, integrações) em manual_transportadora.py —
e rode ferramentas/gerar-manual.py. Use só caracteres do Latin-1 (acentos,
travessão, «», ×, ³ estão ok; setas, emojis e ✓ não).
Negrito: <b>...</b>  |  "&" precisa ser escrito como &amp;
"""
from manual_uso import parte_uso
from manual_admin import parte_admin, parte_glossario
from manual_transportadora import parte_operacao, parte_financeiro, parte_integracoes


def parte_instalacao(g):
    P, h1, h2, h3, lista, passos, aviso, tabela, codigo, parte = (
        g['P'], g['h1'], g['h2'], g['h3'], g['lista'], g['passos'], g['aviso'], g['tabela'], g['codigo'], g['parte'])
    s = []
    s += parte('Parte 1 — Instalação e infraestrutura',
               'O que é preciso para o sistema funcionar no servidor e ficar disponível para toda a empresa.')

    # 1
    s += h1('1. Como o Nexofrete funciona')
    s.append(P('O Nexofrete acompanha cada frete da empresa desde a emissão da nota fiscal até o pagamento da '
               'transportadora. Ele lê os XML de NF-e e CT-e, junta cada CT-e com a nota que ele transporta, calcula '
               'quanto aquele frete deveria custar pela tabela de preço negociada e compara com o que a transportadora '
               'cobrou. O que bate é liberado para pagamento sozinho; o que diverge fica retido até alguém decidir.'))
    s += h2('Onde o sistema roda')
    s += lista([
        '<b>Um computador servidor</b> (Windows) guarda o banco de dados PostgreSQL e roda o programa do sistema '
        '(Node.js). É o único computador onde se instala alguma coisa.',
        '<b>Os demais computadores</b> da empresa só usam o navegador (Chrome ou Edge), pelo endereço do servidor na '
        'rede local. Não instalam nada.',
        'O sistema <b>não fica na internet</b>: funciona só dentro da rede da empresa.',
    ])
    s += h2('O caminho de um frete dentro do sistema')
    s += tabela(['Etapa', 'O que acontece'], [
        ['1. Nota emitida', 'O XML da NF-e é importado (manualmente, pela pasta monitorada ou pelo .zip). O registro do '
         'frete é criado com os dados da nota: pedido, cliente, cidade, valor, volumes, peso.'],
        ['2. Aguardando CT-e', 'A nota espera o CT-e da transportadora. Dados do ERP e do mapa de carregamento completam '
         'o registro.'],
        ['3. CT-e chega', 'O CT-e é ligado à nota. O sistema calcula o frete pela tabela de preço da transportadora do '
         'CT-e.'],
        ['4. Conferência', 'Valor cobrado no CT-e × valor calculado. Dentro da margem de tolerância: <b>Liberado p/ '
         'Pagamento</b> (aprovado pelo sistema). Fora da margem: <b>Frete Retido</b>.'],
        ['5. Decisão', 'No frete retido, alguém com permissão aprova (com justificativa), registra uma glosa ou manda o '
         'espelho do cálculo para a transportadora.'],
        ['6. Fatura', 'Quando a fatura da transportadora chega, os CT-e dela são conferidos juntos e passam a '
         '<b>Faturado</b>.'],
        ['7. Pagamento', 'O Financeiro exporta os fretes liberados, com dados bancários e vencimentos.'],
    ], [0.22, 0.78])

    # 2
    s += h1('2. Requisitos do computador servidor')
    s.append(P('O servidor é o computador onde ficam o banco de dados e todos os arquivos do sistema. Ele precisa '
               'ficar ligado enquanto as pessoas usam o sistema.'))
    s += h2('Programas necessários (instalar uma vez só)')
    s += lista([
        '<b>Node.js</b>, versão LTS — baixe em nodejs.org.',
        '<b>PostgreSQL</b> — baixe em postgresql.org/download. Durante a instalação, <b>anote a senha</b> definida para o '
        'usuário "postgres": ela será pedida na instalação do sistema. Deixe a porta padrão (5432).',
        '<b>Google Chrome ou Microsoft Edge</b> — para acessar o sistema e para o atalho estilo aplicativo.',
    ])
    s += aviso('dica', 'O PostgreSQL, depois de instalado, já fica configurado para iniciar sozinho junto com o '
                       'Windows. Não é preciso fazer nada extra para isso.')
    s += h2('Recomendações para o servidor')
    s += lista([
        'IP fixo na rede (veja a seção 5).',
        'Espaço em disco para os backups diários e para os comprovantes de entrega (fotos).',
        'Tela protegida por senha do Windows e local sem acesso público.',
    ])

    # 3
    s += h1('3. Instalação passo a passo')
    s += passos([
        'Extraia a pasta do sistema em um local fixo do servidor (ex: Documentos). <b>Mantenha uma única cópia da '
        'pasta</b> no computador: várias cópias são a causa mais comum de confusão (uma cópia roda, outra é a que '
        'foi alterada).',
        'Dê dois cliques em <b>instalar.bat</b>.',
        'Quando pedir, digite a senha do PostgreSQL definida na instalação dele. A digitação fica invisível na tela — '
        'isso é normal.',
        'Aguarde a instalação das dependências (1 a 2 minutos).',
        'Ao final aparece "Instalação concluída!" — pode fechar a janela.',
    ])
    s.append(P('O arquivo <b>backend/.env</b> é criado sozinho nesse processo, com os dados de conexão do banco. Se a '
               'senha foi digitada errada, apague esse arquivo e rode o instalar.bat de novo.'))
    s += aviso('atencao', 'Pastas com acento no caminho (por exemplo, dentro de "C:\\Users\\André Luiz\\...") '
                          'costumam quebrar arquivos .bat. Os arquivos do sistema já contornam isso usando o caminho '
                          'curto do Windows, mas, se for possível, prefira instalar numa pasta sem acentos e sem '
                          'espaços, como C:\\Nexofrete.')
    s += h2('Quando rodar o instalar.bat de novo')
    s.append(P('Só é preciso rodar o instalar.bat outra vez quando uma versão nova trouxer uma biblioteca nova. A '
               'atualização feita pela tela de Manutenção (seção 9) já faz isso sozinha quando precisa.'))
    s += h2('Instalação no Mac (opcional)')
    s.append(P('Os arquivos <b>instalar.command</b> e <b>iniciar.command</b> fazem o mesmo que os .bat no Mac. Se o '
               'Mac pedir permissão, autorize em Ajustes do Sistema » Privacidade e Segurança.'))

    # 4
    s += h1('4. Ligando o sistema e primeiro acesso')
    s += passos([
        'Confirme que o PostgreSQL está rodando (normalmente ele já inicia sozinho com o Windows).',
        'Dê dois cliques em <b>iniciar.bat</b>.',
        'Deixe essa janela aberta enquanto o sistema estiver em uso. Minimizar pode; <b>fechar a janela desliga o '
        'servidor</b> para todo mundo.',
        'Quando aparecer "Servidor rodando!", abra o navegador nesse mesmo computador em <b>http://localhost:3333</b>.',
    ])
    s += h2('Primeiro login')
    s.append(P('Na primeira vez que o sistema é ligado, um administrador é criado automaticamente:'))
    s += tabela(['Campo', 'Valor'], [['Email', 'admin@empresa.com'], ['Senha', 'admin123']], [0.3, 0.7])
    s += aviso('importante', 'Troque essa senha no primeiro acesso, em Cadastros » Usuários » editar o Administrador. '
                             'Os dados do primeiro acesso também ficam salvos em backend/dados/PRIMEIRO_ACESSO.txt — '
                             'apague esse arquivo depois de trocar a senha.')
    s += h2('Se ninguém consegue entrar')
    s.append(P('No servidor, dê dois cliques em <b>redefinir-senha-admin.bat</b> e informe o email do usuário. O '
               'sistema gera uma <b>senha provisória</b>; no próximo login a pessoa cadastra uma senha nova.'))
    s += h2('Reinício automático')
    s.append(P('Se o servidor pedir para reiniciar (por exemplo, depois de "Atualizar o sistema" em Manutenção), o '
               'iniciar.bat liga o servidor de novo sozinho, já com a versão nova.'))

    # 5
    s += h1('5. Acesso pela rede da empresa')
    s.append(P('Por padrão, só o computador que roda o iniciar.bat acessa o sistema. Para os outros computadores '
               'acessarem também:'))
    s += passos([
        'Descubra o IP do servidor: no Prompt de Comando, digite <b>ipconfig</b> e procure "Endereço IPv4".',
        'Deixe esse IP <b>fixo</b>: reserve o endereço para a máquina no roteador ("DHCP reservation") ou configure o '
        'IP fixo nas propriedades da placa de rede do Windows. Com IP automático, o endereço muda a cada reinício e '
        'os atalhos de todo mundo param de funcionar.',
        'Na primeira vez que o iniciar.bat rodar, o Windows pergunta se o Node.js pode se comunicar na rede: marque '
        '<b>Rede Privada</b> e clique em Permitir. Se a pergunta não aparecer e os outros computadores não '
        'conectarem, libere a porta 3333 no Firewall do Windows para a rede privada.',
        'Nos outros computadores, acesse pelo navegador: <b>http://IP-DO-SERVIDOR:3333</b> (exemplo: '
        'http://192.168.0.10:3333).',
    ])
    s += aviso('atencao', 'Nesta rede, acessar o servidor pelo <b>nome do computador</b> não funciona — use sempre o '
                          'número de IP.')

    # 6
    s += h1('6. Atalho estilo aplicativo')
    s.append(P('Em vez de digitar o endereço toda vez, cada computador pode ter um ícone que abre o sistema direto, sem '
               'barra de endereço nem abas — parecido com um aplicativo. Há duas formas:'))
    s += h2('Pelo próprio sistema (mais fácil nos computadores dos usuários)')
    s.append(P('Abra o sistema no navegador do computador do usuário, entre como <b>administrador</b> (só o '
               'administrador vê essa opção) e, em <b>Manutenção » Atalho do Nexofrete</b>, clique em <b>Baixar o instalador do atalho</b>. O sistema '
               'baixa um pequeno instalador, <b>instalar-atalho-nexofrete.bat</b>, já com o endereço certo do servidor. '
               'Abra esse arquivo pela barra de downloads: ele baixa o ícone do Nexofrete e cria o atalho na Área de '
               'Trabalho. Não é preciso copiar a pasta do sistema para esse computador.'))
    s += aviso('dica', 'Se o Windows mostrar "O Windows protegeu o computador", clique em "Mais informações" e depois '
                       'em "Executar assim mesmo". Se o navegador perguntar se quer manter o arquivo, escolha "Manter".')
    s += h2('Pelo arquivo criar-atalho-desktop.bat')
    s += passos([
        'Dê dois cliques em <b>criar-atalho-desktop.bat</b> (precisa ter a pasta do sistema no computador).',
        'Digite <b>localhost</b> se for o próprio servidor, ou o IP do servidor se for outro computador. Se a porta '
        'for diferente, digite junto (ex: 192.168.0.10:3300).',
        'Aparece o ícone do Nexofrete na Área de Trabalho.',
    ])
    s.append(P('No servidor, o atalho abre primeiro a tela "Abrindo o Nexofrete...", que espera o servidor responder '
               'e só então mostra o login — sem erro de conexão se o servidor ainda estiver subindo.'))
    s += aviso('nota', 'Por segurança, fechar a janela do sistema sem clicar em "Sair" já exige login de novo na '
                       'próxima vez. Se o IP do servidor mudar, rode o criar-atalho-desktop.bat de novo com o endereço '
                       'novo (ele substitui o atalho antigo).')

    # 7
    s += h1('7. Ligar o servidor sozinho com o Windows')
    s.append(P('Só no computador servidor:'))
    s += passos([
        'Dê dois cliques em <b>configurar-inicio-automatico.bat</b>. Se aparecer o aviso "O fornecedor não pôde ser verificado", '
        'clique em <b>Executar</b> — é a última vez: o próprio arquivo libera todos os arquivos do sistema, e o aviso não aparece mais.',
        'Pronto: da próxima vez que o computador for ligado e alguém entrar no Windows, o servidor liga sozinho, '
        'numa janela minimizada na barra de tarefas.',
    ])
    s.append(P('O aviso aparece porque o Windows marca como "baixados da internet" os arquivos de um .zip baixado e descompactado à '
               'mão. O <b>iniciar.bat</b> e o <b>configurar-inicio-automatico.bat</b> tiram essa marca sozinhos; versões instaladas pela '
               'tela de atualização já chegam sem ela.'))
    s.append(P('Para o servidor ligar <b>sem ninguém digitar a senha do Windows</b>, é preciso ligar o login automático do Windows '
               '(Windows+R, <b>netplwiz</b>, desmarcar "Os usuários devem digitar um nome de usuário e uma senha"). Só faça isso se o '
               'computador servidor ficar em local de acesso restrito: qualquer pessoa que ligá-lo entra no Windows.'))
    s.append(P('Para conferir, clique na janela minimizada: ela deve mostrar "Servidor rodando!". Para cancelar o '
               'início automático: aperte Windows+R, digite <b>shell:startup</b> e apague o atalho do servidor que '
               'aparecer.'))
    s += aviso('atencao', 'O início automático depende de alguém entrar no Windows do servidor. Se o servidor '
                          'reiniciar sozinho (queda de energia, atualização do Windows) e ficar na tela de login, o '
                          'sistema fica fora do ar até alguém entrar.')

    # 8
    s += h1('8. Ambiente de teste')
    s.append(P('O ambiente de teste é uma segunda cópia do sistema rodando no mesmo servidor, com <b>banco de dados '
               'separado</b> (sistema_frete_teste) e <b>porta diferente</b> (3334). Serve para experimentar uma versão '
               'nova ou uma configuração arriscada sem mexer nos dados de verdade.'))
    s += passos([
        'Com o sistema principal já instalado, dê dois cliques em <b>instalar-teste.bat</b> e digite a senha do '
        'PostgreSQL.',
        'Para ligar, use <b>iniciar-teste.bat</b> (deixe a janela aberta enquanto testa).',
        'Acesse http://localhost:3334, ou crie um atalho próprio com <b>criar-atalho-teste.bat</b>.',
    ])
    s.append(P('No ambiente de teste aparece uma faixa no topo: "AMBIENTE DE TESTE — os dados aqui são separados da '
               'produção de verdade". Tudo o que for feito ali não afeta o sistema principal.'))

    # 9
    s += h1('9. Atualizar o sistema para uma versão nova')
    s.append(P('A atualização é feita pela própria tela, sem copiar pastas à mão:'))
    s += passos([
        'Em <b>Manutenção » Atualizar o sistema</b>, clique em "Escolher o .zip e atualizar" e selecione o arquivo da '
        'versão nova (ex: Nexofrete-1.72.0.zip).',
        'O sistema faz um <b>backup do banco</b> antes de tudo.',
        'Instala a versão nova por cima, <b>sem mexer</b> na configuração (.env), nos backups e nos comprovantes de '
        'entrega. Se a versão nova trouxer bibliotecas novas, ele mesmo as instala.',
        'O servidor reinicia sozinho. Todos os usuários só precisam recarregar a tela (F5).',
    ])
    s += aviso('dica', 'Para versões com mudanças grandes, teste primeiro no ambiente de teste (seção 8). A versão '
                       'atual aparece no mesmo quadro de Manutenção.')
    s += aviso('atencao', 'Antes de diagnosticar qualquer problema depois de uma atualização, confirme que existe '
                          'uma única pasta do sistema no servidor e que é ela que está rodando.')
    return s


def montar(g):
    s = []
    s += parte_instalacao(g)
    s += parte_uso(g)
    s += parte_admin(g)
    s += parte_operacao(g)
    s += parte_financeiro(g)
    s += parte_integracoes(g)
    s += parte_glossario(g)
    return s
