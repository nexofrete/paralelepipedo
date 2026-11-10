# Nexofrete — Sistema de Acompanhamento de Fretes

Banco de dados: **PostgreSQL**. O sistema cria o banco e as tabelas sozinho — você só precisa ter o PostgreSQL instalado e rodando.

## Instalação (só uma vez)

1. Instale o **Node.js** (versão LTS): https://nodejs.org
2. Instale o **PostgreSQL**: https://www.postgresql.org/download/ — durante a instalação, ele vai pedir para você criar uma senha para o usuário `postgres`. **Anote essa senha**, você vai usá-la no próximo passo. Deixe a porta padrão (5432).
3. Extraia a pasta deste sistema em algum lugar fácil de achar (ex: Documentos).
4. **Windows:** dê dois cliques em `instalar.bat`.
   **Mac:** dê dois cliques em `instalar.command` (se pedir permissão, vá em Preferências do Sistema → Privacidade e Segurança e autorize).
5. Ele vai pedir a senha do PostgreSQL que você definiu no passo 2 — digite e aperte Enter.
6. Espere terminar (1-2 minutos) e feche a janela quando ela mandar.

Isso cria o arquivo `backend/.env` sozinho com os dados de conexão — você não precisa editar nada manualmente. Quando o sistema for ligado pela primeira vez, ele mesmo cria o banco `sistema_frete` e todas as tabelas dentro do PostgreSQL.

## Ligar o sistema (toda vez que for usar)

1. Confirme que o **PostgreSQL está rodando** (normalmente ele já inicia sozinho com o computador, como um serviço do Windows/Mac).
2. **Windows:** dois cliques em `iniciar.bat`.
   **Mac:** dois cliques em `iniciar.command`.
3. Deixe essa janela **aberta** enquanto estiver usando o sistema. Minimizar pode, fechar não.
4. Abra o navegador nesse mesmo computador e acesse: **http://localhost:3333**

Se aparecer um erro de conexão no terminal, normalmente é: PostgreSQL não está rodando, ou a senha salva no `.env` está errada (você pode apagar o arquivo `backend/.env` e rodar `instalar.bat`/`instalar.command` de novo para digitar a senha certa).

## Primeiro login

Na primeira vez que o sistema é ligado com sucesso, ele cria um usuário administrador automaticamente e mostra os dados no terminal, além de salvar em `backend/dados/PRIMEIRO_ACESSO.txt`:

```
Email: admin@empresa.com
Senha: admin123
```

Troque essa senha assim que possível (posso adicionar uma tela para isso quando quiser).

## Deixar outros computadores da rede acessarem

Por padrão, só o computador onde o sistema está ligado consegue acessar. Para os outros computadores da empresa acessarem também:

1. Descubra o IP dessa máquina: no Windows, abra o Prompt de Comando e digite `ipconfig` (procure "Endereço IPv4"); no Mac, vá em Preferências do Sistema → Rede.
2. Nos outros computadores, acesse `http://SEU_IP_AQUI:3333` (exemplo: `http://192.168.100.10:3333`).
3. Se não conectar, provavelmente é o firewall do Windows bloqueando — quando o Windows perguntar "Permitir que o Node.js se comunique em redes..." na primeira vez que rodar `iniciar.bat`, marque **Rede Privada** e clique em Permitir.
4. Para o IP não mudar toda hora, reserve um IP fixo pra essa máquina no roteador (posso te explicar quando chegar nessa etapa).

## Acesso de fora da empresa (Cloudflare Tunnel)

Para o app do motorista na rua, o portal do cliente e o rastreio, o sistema precisa estar na internet com HTTPS. O mais simples é o **Cloudflare Tunnel** (grátis, sem abrir porta no roteador), com um domínio da empresa:

1. Conta grátis em cloudflare.com → adicionar o domínio → trocar os nameservers no registro.br pelos da Cloudflare (copie antes os registros DNS de site/e-mail que já existam).
2. Zero Trust → Networks → Tunnels → **Create a tunnel** (Cloudflared, nome "nexofrete") → Windows 64-bit: instale o `.msi` e rode, no Prompt **como administrador**, o comando `cloudflared.exe service install <código>` que a tela mostra (vira serviço do Windows).
3. **Public Hostname**: `sistema` + o domínio, Type **HTTP**, URL **localhost:3333**.
4. Em `backend/.env`, acrescente `TRUST_PROXY=loopback` e reinicie (o sistema passa a reconhecer o HTTPS do túnel e os limites de tentativas valem por pessoa, não pelo túnel).
5. Informe `https://sistema.seudominio.com.br` em **CT-e → Configuração → Endereço público** e em **Portal do cliente → Configurar**.

Só para testar, sem domínio: `cloudflared tunnel --url http://localhost:3333` (endereço `trycloudflare.com` temporário, muda a cada vez).

## Ligar o servidor sozinho ao ligar o computador

Se este computador é o servidor (o que roda o `iniciar.bat`), você pode fazer isso acontecer sozinho, sem precisar clicar em nada:

1. Dê dois cliques em **`configurar-inicio-automatico.bat`**
2. Pronto — da próxima vez que você ligar o computador e entrar no Windows, o servidor liga sozinho (numa janela minimizada na barra de tarefas)

Detalhes importantes:
- O PostgreSQL já costuma iniciar sozinho com o Windows (isso é configurado automaticamente na instalação dele) — então, combinando os dois, tudo fica de pé sem intervenção.
- Se quiser conferir se está tudo certo, clique na janela minimizada na barra de tarefas — deve mostrar "Servidor rodando!".
- Pra **cancelar** esse início automático no futuro: aperte `Windows+R`, digite `shell:startup` e apague o atalho "Sistema de Fretes - Servidor" que aparecer.

## Criar um atalho estilo "aplicativo" na Área de Trabalho

Em vez de abrir o navegador e digitar o endereço toda vez, você pode ter um ícone na Área de Trabalho que já abre o sistema direto (sem barra de endereço, sem abas — parece um aplicativo de verdade):

1. Dê dois cliques em **`criar-atalho-desktop.bat`**
2. Digite o endereço do servidor quando ele pedir:
   - `localhost` se esse for o próprio computador onde o sistema roda
   - o IP da rede (ex: `192.168.0.10`) se for outro computador
3. Pronto — vai aparecer um ícone **"Sistema de Fretes"** na Área de Trabalho

Cada usuário faz isso uma vez no computador dele. O login continua sendo necessário (por segurança), mas não precisa mais digitar nenhum endereço — é só abrir o ícone e entrar com email/senha.

Se o IP do servidor mudar no futuro, é só rodar o `criar-atalho-desktop.bat` de novo com o novo endereço (ele substitui o atalho antigo).

## Licença e ativação (proteção contra cópia)

Cada instalação só funciona **ativada com uma chave emitida por você**.
- A chave vale para **um computador** e **um CNPJ**. Copiar a pasta do sistema para outro computador, ou usá-la com outra empresa, não funciona.
- A chave é assinada digitalmente: não dá para inventar uma nem alterar a validade.
- Sem ativação, as telas vão para **ativar.html** e nada funciona: nem o rastreio, nem o app do motorista, nem as leituras automáticas.

**Ativar um cliente:**
1. Na instalação do cliente, a tela de ativação mostra o **código do computador**. O cliente copia e te envia.
2. No **seu** computador, em **Manutenção → Licença do sistema**, preencha cliente, CNPJ, código e validade (30 dias, 90 dias, 1 ano ou sem vencimento) e clique em **Gerar chave**.
3. Envie a chave (começa com `NXF1.`). O cliente cola na tela de ativação.

**O emissor de chaves só aparece no seu computador**, porque depende da sua **chave privada** em `backend/dados/licenciador/chave-privada.pem`. A pasta `dados` nunca vai nos pacotes nem no Git. Guarde uma cópia dessa chave em lugar seguro (pendrive, gerenciador de senhas): sem ela você não emite mais chaves e precisaria trocar a chave do sistema.

**No seu próprio computador** você não precisa de chave de ativação. Crie a pasta `backend\dados\licenciador` e coloque nela o arquivo `chave-privada.pem`. Confira se o nome não ficou `chave-privada.pem.txt`: no Explorador, ative **Exibir → Extensões de nomes de arquivos**. Em até 5 segundos a tela de ativação libera o sistema; é só recarregar a página. Em **Manutenção → Licença** aparece "Computador do licenciador" e o emissor de chaves.

**Validade:**
- 15 dias antes de vencer, aparece um aviso.
- Depois de vencida, há 7 dias de tolerância. Em seguida o sistema fica **só para consulta**: o cliente continua vendo os seus documentos fiscais, mas não emite nem altera nada até receber a chave nova.

**Seus dados de contato:** preencha `backend/licenca-contato.json` (nome, WhatsApp e e-mail). Com isso, a tela de ativação ganha os botões "Pedir pelo WhatsApp" e "Pedir por e-mail", já com o código da máquina na mensagem.

**Conferência pela internet (bloquear ou renovar à distância):**
- Ao gerar a chave, marque **Conferir pela internet** e informe o endereço do seu servidor de licenças (pasta `servidor-licencas` do repositório; o README dela explica como colocar no ar). O endereço fica gravado para as próximas chaves.
- O sistema do cliente confere sozinho ao ligar e a cada 6 horas. Em **Manutenção → Licença** aparece a última confirmação e um botão **Conferir agora**.
- No painel do servidor você **bloqueia** (com uma mensagem para o cliente), **desbloqueia**, muda a **validade** e anota. O cliente recebe a mudança na próxima conferência.
- Bloqueada, a licença deixa o sistema **só para consulta**. Ao desbloquear, volta ao normal sozinho, sem chave nova.
- Sem internet: avisa a partir de 3 dias sem conferir. Depois de **10 dias**, fica só para consulta até conseguir conferir de novo. O prazo conta da última confirmação, ou da emissão da chave se nunca conferiu, então colar a chave de novo não reinicia a contagem.
- As respostas do servidor são assinadas com uma **segunda chave privada**, só do servidor. Ninguém consegue montar um "servidor falso" que responda "ativa".

**Pacote ofuscado (dificulta mexer no código):** para instalar ou atualizar clientes, gere o .zip com o código do servidor embaralhado:

```
cd ferramentas/empacotador
npm install          (só da primeira vez)
npm run empacotar    → saida/Nexofrete-<versão>.zip
```

O pacote deixa de fora `dados`, `.env`, os testes e o próprio empacotador, e se recusa a empacotar se encontrar uma chave privada na pasta. Use o .zip para instalar no cliente ou em **Manutenção → Atualizar o sistema**. O código legível continua só com você (no Git).

**Limites (para saber o que esperar):** nenhuma proteção de software instalado no computador do cliente é impossível de quebrar. Um programador experiente, com tempo, consegue remover a verificação mesmo do código ofuscado. Juntas, a chave assinada, a conferência online e a ofuscação tiram a cópia do alcance de quem só "pegou a pasta" e tornam o desvio caro e trabalhoso. Para o restante, vale o contrato de licença de uso.

## Fuso do banco (Manutenção)

O sistema grava sempre no horário de Brasília, qualquer que seja o fuso do PostgreSQL (`TimeZone` fixado em cada conexão; troque com `DB_TIMEZONE` no `.env` só se a empresa for de outro fuso). Em versões antigas, com o PostgreSQL em UTC, a hora de autorização do CT-e/MDF-e ficava **3 horas adiantada**: o CT-e das 22h caía no dia seguinte (e, no último dia do mês, no mês seguinte).

Em **Manutenção → 🕒 Fuso do banco** o sistema mostra o fuso do PostgreSQL, o da sessão e compara a hora de autorização de cada CT-e/MDF-e com a hora do **protocolo da SEFAZ** (`dhRecbto`, que vem com fuso no XML). Se achar diferença, o botão **Corrigir pelo protocolo da SEFAZ** faz um backup e acerta só esses documentos, cada um pela hora do próprio protocolo. A conferência roda ao ligar; havendo documento errado, o aviso aparece no sino dos administradores. Depois de corrigir, gere de novo o livro dos meses já mandados ao contador e confira com ele.

## Telas leves (compressão e cache)

O servidor manda as telas comprimidas (brotli/gzip) e as páginas `.html` saem com cada script, estilo e imagem do sistema versionado pela impressão do conteúdo (`js/x.js?v=<hash>`), com cache de um ano; a própria página vai sem cache (confere a cada abertura). Ao atualizar o sistema, a impressão muda e o navegador baixa só o que mudou. As respostas JSON grandes da API também vão comprimidas. A lista de fretes do embarcador e a Visão geral só carregam quando a tela é aberta. Medido com internet de 4 Mbps/150 ms: 1ª abertura de 2,4 MB e 5,0 s para ~0,6 MB e 2,3 s; aberturas seguintes de 2,0 s para 0,3 s. Código em `src/estaticos.js`.

## Backup (faça antes de começar a usar)

Fica em **Manutenção → Backup automático**. Ligue o backup diário e preencha a **pasta de cópia**. O recomendado é uma pasta do OneDrive ou do Google Drive para computador, para a cópia subir sozinha para a nuvem. Se o computador do servidor queimar, o backup continua lá.

O backup é um arquivo **.zip completo**, conferido depois de gravado, que leva:
- o banco de dados inteiro;
- as fotos e assinaturas de entrega (app do motorista) e os anexos;
- a **chave do sistema** (`dados/config.json`). Sem ela, o certificado digital e as senhas guardadas não abrem num computador novo.

**Senha do backup (recomendada):** com ela, a chave vai protegida dentro do .zip, e uma cópia na nuvem não abre o certificado de ninguém. Anote a senha em lugar seguro: ela é pedida para restaurar num computador novo.

**Para restaurar num computador novo:**
1. Instale o Nexofrete.
2. Copie o .zip para `backend\dados\backups`.
3. Em Manutenção → Backups salvos → **Restaurar**, digite RESTAURAR e a senha do backup.
4. Reinicie o servidor.

Os backups antigos, que são só `.sql`, continuam restaurando normalmente.

**Zerar o banco de dados** (Manutenção, só administrador; `src/zerarBanco.js`, rotas `GET /api/manutencao/zerar/previa` e `POST /api/manutencao/zerar` com `confirmacao: "ZERAR"` e a senha do admin): faz o backup antes (falhou = não apaga), guarda o próximo número de CT-e/MDF-e/NFS-e de produção em `empresa`, e dá `TRUNCATE … RESTART IDENTITY` em todas as tabelas menos as que ficam sempre (usuários, perfis, empresa, `configuracao_*`, contas de e-mail, chaves de API, webhooks, modelos de ERP, feriados) e, se não marcar, os cadastros (transportadoras, tabelas de preço, clientes, parceiros, veículos, motoristas, filiais, centros de custo, contas bancárias...). Tabela que fica e aponta para uma que sai tem o campo limpo (ou, se for obrigatório, a apontada fica também) — nada é apagado em cascata sem querer. Também esvazia `dados/comprovantes-cte`, `comprovantes-coleta` e `anexos`.

## Criar login para os clientes e funcionários

Agora isso é feito direto pela tela: logado como administrador, vá em **Usuários → + Novo usuário**. Você escolhe o tipo:

- **Cliente**: só vê os próprios registros (informe o nome do cliente exatamente como aparece na coluna "Cliente")
- **Usuário interno**: você escolhe manualmente o que essa pessoa pode fazer (ver todos os registros, enviar XML, editar, excluir, gerenciar outros usuários)
- **Administrador**: acesso total (só o admin pode criar outro admin)

O campo **Função** (`#fFuncao`, datalist `#listaFuncoes`) sugere `FUNCOES_COMUNS` (em `public/js/dashboard.js`, mais de cem funções agrupadas por área), os nomes dos modelos de acesso (`Acessos.modelos()`) e as funções já gravadas nos usuários; aceita texto livre e é só informativo.

**Segurança das contas** (`src/segurancaContas.js`):
- **Sessões** (`sessoes`): cada login cria uma sessão e o JWT leva o `sid`; `autenticar` recusa sessão encerrada. Sair (`/api/auth/sair`), encerrar pela tela (`/api/auth/sessoes`), trocar a senha (as outras), senha trocada pelo admin, senha redefinida e usuário desativado encerram. Tokens antigos sem `sid` param de valer com `usuarios.sessoes_invalidadas_em`.
- **Política** (`configuracao_seguranca`: `senha_min`, `senha_variedade`, `bloqueio_tentativas`, `bloqueio_minutos`, `senha_validade_dias`, `exigir_2fa`): validada na criação, troca e redefinição; bloqueio por senhas erradas com aviso por e-mail aos admins; senha vencida liga o `trocar_senha` no login.
- **Esqueci a senha**: `POST /api/auth/esqueci` (resposta sempre igual) manda um código de 8 números (hash em `senha_redefinicoes`, 30 min, 5 tentativas, uso único); `POST /api/auth/redefinir`. Código em vez de link para não depender do `Host` do pedido.
- **2FA por aplicativo** (TOTP RFC 6238, sem biblioteca: `codigoTotp`/`verificarTotp`): segredo criptografado em `usuarios.totp_segredo`, QR Code em SVG, 8 códigos de recuperação (hash), passo usado guardado (sem repetição); 5 tentativas por login. `exigir_2fa` (`nao`/`admins`/`todos`): sem 2FA, a API responde 403 `configurar_2fa` (menos as rotas de configuração) e o login mostra a configuração. Rotas `/api/auth/2fa-app/*`, `/api/auth/usuarios/:id/seguranca`. Limite de tentativas por IP em `/verificar-codigo-2fa`, `/esqueci` e `/redefinir`.

**Cadastros básicos** (`src/cadastrosBasicos.js`, rotas `/api/cadastros-basicos/:tipo`, tela `public/js/cadastrosBasicos.js`, código **907**): um motor só para `fornecedores`, `ajudantes`, `conjuntos_veiculo` (cavalo + até 3 reboques), `produtos`, `tipos_mercadoria`, `departamentos`, `regioes_atendimento` (UFs, cidades CIDADE/UF, faixas de CEP, prazo, dias da semana; `regiaoDe()` = CEP > cidade > UF), `tipos_operacao` (CFOP estadual/interestadual, natureza, tpServ, tomador) e `condicoes_pagamento` (dias das parcelas; `vencimentos()`). Cada um é descrito em `DEFS` (campos, tipo, obrigatórios, quem edita) e a tela é montada a partir disso. Tipos de mercadoria, tipos de operação e condições de pagamento já vêm com os mais comuns. Todos entram no histórico de alterações.
Ligações: `contasPagar.completarCadastros()` liga o fornecedor (por id ou documento) e, com `condicao_pagamento_id`, gera as parcelas pelos dias da condição contados da competência; `entradas.js` grava o emitente da nota de entrada em `fornecedores`; a fatura vence pelo primeiro prazo da condição do cliente (`clientes.condicao_pagamento_id`); o prazo do CT-e é tabela > região > padrão (`cte/ocorrencias.js`) e a filial de entrega é cidade da filial > região > origem (`unidades.js`); o formulário do CT-e aplica o tipo de operação (CFOP, tpServ, tomador) e sugere produtos; o MDF-e aplica o conjunto do cavalo; o romaneio guarda `ajudante_ids` e, ao fechar, lança a diária de cada ajudante em contas a pagar (uma vez, `diarias_lancadas`); a cotação calcula peso/cubagem/valor pelo produto e usa o prazo da região; o usuário tem `departamento_id`.

**Histórico de alterações** (`alteracoes`, gatilhos `registrar_alteracao()` em fretes, usuários, perfis, transportadoras, parceiros, clientes, tabelas de preço e faixas, faturas e contas a pagar): o `autenticar` guarda o usuário num `AsyncLocalStorage` (`src/contextoUsuario.js`); o `src/db.js`, nas gravações dessas tabelas, passa `app.usuario` ao PostgreSQL (e limpa ao devolver a conexão), e o gatilho anota campo, antes, depois, quem e quando — sem usuário (rotinas automáticas), nada é anotado. Senhas viram `***`. Tela: `public/js/alteracoes.js`; rota `GET /api/alteracoes`; também no histórico do frete.

**LGPD** (`src/lgpd.js`, Manutenção » LGPD): consulta por titular (CPF/CNPJ, e-mail ou nome) em `FONTES`, exportação (JSON/Excel, registrada), anonimização por CPF só nos cadastros não obrigatórios (sem o usuário no contexto, para o histórico não guardar o que sai, e apagando o histórico daqueles registros), prazo de guarda (`configuracao_seguranca.lgpd_retencao_dias`: apaga `alteracoes` e os logs arquivados), aviso de privacidade (`GET /api/privacidade`, login e portal).

**Backup inteiro com senha** (`configuracao_backup.criptografar_tudo`): o .zip vira `.nxbk` (scrypt + AES-256-GCM, gravado em partes: `NXBK1` + sal + iv + dados + etiqueta). Restaurar pede a senha e abre num .zip temporário antes de mexer no banco. O backup também passou a levar `dados/comprovantes-coleta`.

**Acesso por tela** (`src/acessoTelas.js`; usuário interno): `TELAS` (área, nome, destinos do menu, abas, prefixos de rota, `leituraPara`/`leituraRotas`/`leituraLivre`, `chave` antiga) e `ACOES` sensíveis (método + rota). `usuarios.acesso_telas` (JSONB tela → `nenhum`/`consulta`/`opera`) e `acesso_acoes` (TEXT[]); o mesmo em `perfis_acesso.telas/acoes`. `middlewareAuth` chama `conferir()` em toda rota: nível da tela (GET e os POST de leitura `POST_LEITURA` valem como consulta) e a ação. As chaves `pode_emitir_cte`, `pode_ver_financeiro`, `pode_ver_auditoria`, `pode_ver_relatorios` e `pode_ver_sinistros` são derivadas da grade (`chavesDaGrade`) ao salvar. `migrar()` na subida dá a grade equivalente (`gradeDoLegado`) a quem não tinha. Menu: `Acessos.destinoBloqueado` (usado por `Navegar.acessivel`) esconde as telas "nenhum"; aviso "só consulta"; tela Hoje sem cartões de telas bloqueadas (`destinoBloqueado`). Catálogo: `GET /api/acesso/catalogo` (com `MODELOS` prontos por função: telas, ações e as permissões que continuam no formulário; "Começar de um modelo" no usuário e "A partir de um modelo" nos perfis). Relatório "quem pode o quê": `GET /api/perfis-acesso/relatorio` (`relatorio()`: usuários ativos admin/interno × telas, ações, chaves e filiais), na tela de Usuários com exportação para Excel.

**Perfis de acesso, módulos e filiais** (usuário interno):
- **Perfis de acesso** (`perfis_acesso`, rotas `/api/perfis-acesso`, tela `public/js/acessos.js`): nome + permissões + módulos bloqueados. O usuário guarda `perfil_acesso_id`; escolher o perfil no cadastro marca tudo; `PUT` no perfil copia para os usuários dele (menos administradores). O 2FA não faz parte do perfil; só o admin cria perfil com "Gerenciar usuários".
- **Módulos bloqueados** (`usuarios.modulos_bloqueados`): `MODULOS` em `src/permissoes.js` (operação, frota, armazém, faturamento, contas a pagar, bancos, fiscal, SAC, gerencial) liga cada módulo às rotas da API e às telas. `autenticar` recusa (403) a rota de módulo bloqueado (`moduloDaRota`); a tela esconde o menu e o "Ir para"; a Hoje tira os cartões. Só restringe: as permissões de base continuam valendo; admin nunca é bloqueado.
- **Filiais** (`usuarios.unidades_permitidas`, vazio = todas): `condicaoUnidades` filtra CT-e emitidos (origem, atual ou destino; abrir e ações de um CT-e de outra filial = 404), romaneios, contas a pagar (lista e resumo) e "Onde está a mercadoria". Documentos sem filial aparecem para todos.

**Links de download sem a senha de acesso.** Os links que abrem em outra aba (DACTE, XML, boleto, fatura, planilhas, anexos, imagens do mapa) não levam o token da sessão: na hora do clique a tela pede `POST /api/auth/ticket` (no portal, `POST /api/portal/ticket`) e troca o `?token=` por um ticket que só vale para aquele caminho, só GET, por 2 minutos (mapa da roteirização: 8 horas, só `/api/roteirizacao/mapa/`). O servidor recusa o token da sessão na URL e o ticket no cabeçalho. Na tela, isso fica em `public/js/linkSeguro.js` (cliques, nova aba, `window.open` e `LinkSeguro.ir(url)` para baixar na mesma aba); no servidor, em `src/ticketDownload.js`.

## Importar vários XML de uma vez

Na aba "Enviar XML" tem um botão **"Selecionar uma pasta inteira"** — escolha a pasta onde estão os XMLs de NF-e/CT-e e o sistema importa todos automaticamente, sem precisar clicar arquivo por arquivo.

## Boleto registrado (CNAB 240)

Bancos: **Banco do Brasil (001), Itaú (341), Bradesco (237), Santander (033), Caixa (104) e Sicoob (756)**.

**Antes de usar:**
1. Peça ao banco a **cobrança registrada com arquivo CNAB 240**.
2. Preencha em **Faturamento → 🏦 Boletos → Configuração** os dados do contrato: agência, conta, carteira, convênio/código do beneficiário e versão do layout.
3. Faça a **homologação**: gere um boleto de teste, mande a primeira remessa ao banco e espere a aprovação. Cada banco confere o boleto e o arquivo do jeito dele.

**No dia a dia:**
1. Na fatura, **🏦 Gerar boleto**. Ele sai junto com a fatura impressa e no e-mail (linha digitável no corpo, boleto no anexo), ao lado do PIX.
2. **Remessa:** em **🏦 Boletos**, **Gerar arquivo de remessa** e envie pelo internet banking.
   - A remessa leva os boletos novos e os **pedidos de baixa**.
   - O pedido de baixa é gerado sozinho quando a fatura é cancelada ou recebida por outro meio (PIX, depósito).
3. **Retorno:** todo dia, baixe o arquivo de retorno no internet banking e escolha-o na mesma tela.
   - Boletos **pagos dão baixa sozinhos** na fatura, com juros/multa e a tarifa anotados.
   - Também são tratados: registrados, rejeitados (com o motivo do banco) e baixados.
   - Reimportar o mesmo arquivo não baixa duas vezes.
4. **Prorrogar:**
   - Antes da remessa, o boleto é descartado e um novo é gerado com a data nova.
   - Depois da remessa, o sistema bloqueia, para não ficar diferente do que está no banco.

Juros ao mês, multa, protesto e baixa automática são configurados uma vez e vão no boleto e na remessa. O fator de vencimento já segue a regra nova da FEBRABAN (que voltou a 1000 em 22/02/2025).

## Tabela de frete por cliente

Cadastro de clientes (Cadastros » Clientes, `abrirCliente` em `public/js/dashboard.js`): dois cliques na linha abrem o `#painelFormCliente` numa janela (`clJanela`, `#modalCliente`), fechando com Esc, ✕ ou Fechar; estilo dos campos em `public/css/style.css`.

Trechos da tabela (`linhaFaixa` em `public/js/dashboard.js`): "Cidades dessa praça" é um `textarea` que cresce com o texto (`ajustarAlturaCidades`; quebras de linha viram vírgula em `lerFaixasDoFormulario`), com larguras mínimas nas colunas Origem, Destino, Região, Tipo de carga e Cidades.

Cada cliente pode ter a **tabela negociada dele**, como no SSW. Fica em **Cadastros → Tabelas de Preço**, na tabela da própria empresa.

- **⭐ Copiar para um cliente** (abra a tabela geral):
  - escolha o cliente e o **desconto ou acréscimo em %** (ex.: −8);
  - marque se vale para **todas as filiais** (mesma raiz de CNPJ);
  - marque se o % vale também para as taxas (pedágio, TDE, TDA, ad valorem, GRIS...).

  O sistema cria a tabela do cliente com todos os trechos, e depois dá para ajustar trecho por trecho.
- Também dá para preencher o **Cliente da tabela** em qualquer tabela. Em branco, é a tabela geral.
- **Como o preço é escolhido:**
  - na **cotação**, no **CT-e** (botão "Calcular pela tabela"), no rascunho de CT-e que vem da NF-e/coleta e no prazo de entrega, o sistema usa primeiro a tabela de **quem paga o frete (tomador)**;
  - destino que não está na tabela do cliente usa a **tabela geral**, com aviso na explicação do cálculo;
  - a tabela de um cliente **nunca** é usada para outro.
- Na lista de tabelas, as de cliente aparecem com ⭐ e o nome do cliente. O filtro "Só as de clientes ⭐" mostra todas.

### Reajuste de tabelas em lote

Botão **📈 Reajuste em lote** em Cadastros → Tabelas de Preço (`public/js/reajusteTabelas.js`; regras em `src/reajusteTabelas.js`):

- **Filtro:** transportadora, gerais/de clientes, cliente (CNPJ exato ou tabela por raiz), UF de destino, inativas opcionais; tabelas desmarcadas na prévia vão em `excluir`.
- **Grupos** (`GRUPOS`): `frete` (faixas `valor_por_kg`/`valor_kg_excedente` e `excedente_por_kg`), `minimos` (`frete_minimo` dos trechos e `valor_minimo`), `taxas` (pedágio, TDE, TDA, TRT, despacho, GRIS mínimo, pallet, descarga) e `percentuais` (ad valorem e GRIS, desligado por padrão). Arredonda com as casas da coluna.
- **Aplicar:** guarda a foto de cada tabela em `tabelas_preco_versoes` ("antes do reajuste"), anota nas observações e, com "renovar a validade", grava `tabelas_preco.vigencia_desde` (a validade em meses passa a contar daí: lista e aviso de tabela vencendo).
- **Agendar:** vigência futura fica `agendado` em `reajustes_tabela`; `agendar()` (na subida e de hora em hora) aplica os que chegaram na data, com o filtro de então.
- **Desfazer:** volta os valores das fotos (`versoes`), pulando a tabela editada depois (`atualizado_em` > `aplicado_em`) e recusando se houver reajuste mais novo nas mesmas tabelas. Cancelar só no agendado.
- **Rotas:** `POST /api/tabelas-preco/reajustes/previa`, `GET|POST /api/tabelas-preco/reajustes`, `POST /api/tabelas-preco/reajustes/:id/desfazer`, `DELETE /api/tabelas-preco/reajustes/:id` (todas com "Gerenciar tabelas de preço").

## Menu por área e tela "Hoje"

- **Menu único, por área** (`public/dashboard.html`, `js/menuTransporte.js`): Hoje, Fretes contratados (visão geral), 🚚 Operação, 🤝 Transportadoras e parceiros, 📄 Documentos, ⚖️ Auditoria de fretes, 💰 Financeiro, 🔧 Frota, 📊 Gestão e relatórios, 🌐 Clientes, Mensagens, Agenda e ⚙️ Configuração. As telas da transportadora (TMS) e do embarcador ficam no mesmo menu, cada uma no grupo do assunto (a antiga chave TMS | Embarcador saiu). Subitens `.nav-tsub`: `data-ir` (+ `data-aba`) abre uma página, `data-subaba` uma tela de Relatórios e `data-familia` um grupo de telas parecidas. Os itens escondidos `.nav-no-grupo` guardam a permissão de cada página.
- **📇 Cadastros** (grupo logo abaixo de Operação): um subitem por cadastro, abrindo a aba certa — `t:cadastros:<subpagina>` (Clientes, Transportadoras, Tabelas de preço, Usuários, Empresa), `t:cadastros-basicos:<tipo>` (`data-cb-aba`; `Navegar.ir` espera as abas aparecerem, porque a tela as monta depois de abrir) e `t:emissao-cte:frota` (Veículos e motoristas). Os itens `navCadastros` e `navCadastrosBasicos` ficam escondidos (`nav-no-grupo`) só para guardar a permissão; aba escondida pela tela (`oculto`) some do menu.
- **Telas parecidas juntas** (`js/familias.js`, `window.Navegar`): Painel de indicadores (300 / 309 / 310), Auditoria de frete (330 / 321 / 323), NF-e × CT-e (322 / 320) e Parceiros, ranking e escolha (065 / 319 / 313) são um item só no menu, com uma barra no alto da tela para trocar entre elas (só as que o usuário pode abrir). Destinos no formato `p:<página>`, `t:<página>:<aba>` e `r:<subaba>`.
- **Regras únicas:** duplicidade de documentos em `src/duplicidade.js` (auditoria de frete e `/api/fretes/relatorios/duplicidades`: CT-e = número sem zeros + raiz do CNPJ da transportadora; NF-e = número sem zeros + emitente da chave ou `emitente_cnpj`; fora CT-e cancelado, CT-e a mais da mesma nota e notas cobertas por CT-e de várias notas) e alíquota interestadual do ICMS em `src/icmsCte.js` (usada também por `calculoFrete.js`).
- **Módulos da empresa** (Cadastros → Empresa → *Módulos usados pela empresa*): **tudo** (padrão), **só transportadora** (somem as telas do embarcador) ou **só embarcador** (somem Hoje, Operação, Frota, Clientes, o financeiro da transportadora, Filiais e Configuração fiscal; abre na Visão geral, que no menu vira "Início"). Esconde do menu, do "Ir para" e da Hoje; não mexe em permissões. Coluna `empresa.modulos`; na tela, `public/js/modulos.js` marca `html[data-modulos]` e os itens com `data-modulo` somem pelo CSS.

- **🏠 Hoje** (código **000**) é a primeira tela de quem emite CT-e ou cuida do financeiro. Ela mostra, por área, o que precisa de atenção:
  - **Operação:** CT-e rejeitados ou com erro, rascunhos, entregas atrasadas, com ocorrência ou previstas para hoje, coletas a programar, cotações pedidas no portal e MDF-e em aberto.
  - **Financeiro:** faturas vencidas e a receber na semana, CT-e a faturar, contas a pagar vencidas, de hoje e da semana, boletos rejeitados, extrato a conciliar, saldo em caixa e bancos e falha no envio ao contador.
  - **Frota:** manutenção vencida e vencendo, CNH vencendo e veículos na oficina.
  - Vermelho é para resolver já, amarelo é para hoje e azul é só para saber.
  - Cada cartão abre a tela certa **já filtrada**. A tela se atualiza sozinha a cada 5 minutos.
- **Menu em grupos**, com os mesmos números do "Ir para": o grupo da tela aberta abre sozinho. Os que você abrir à mão ficam abertos, e o navegador lembra.
- **Recolher o menu:** a seta redonda na borda do menu deixa só os ícones (a tela ganha espaço). Recolhido, passar o mouse abre o menu por cima, sem empurrar o conteúdo; o nome de cada tela aparece ao parar o mouse no ícone. O navegador lembra a escolha (`js/menuRecolher.js`; aplicada antes de desenhar em `js/tema.js`).
- **Cores pelo tema:** o menu segue o tema escolhido (claro ou escuro), com o logo na cor certa — as cores ficam nas variáveis `--lat-*` de `css/style.css`.
- **No celular**, o menu vira uma gaveta: o botão **☰ Menu** abre, e escolher a tela fecha.
- **Filtro de período igual em todas as telas** (Painel gerencial e Margem, Frota, Fiscal e contabilidade, Movimentação do caixa, Ocorrências e Coletas):
  - Tem um atalho (Este mês, Mês passado, Últimos 30 dias, Últimos 3 meses, Este ano…) e as datas "de" e "até". Aplica na hora, sem botão "Filtrar".
  - Cada tela lembra a última escolha neste navegador. Os atalhos acompanham o calendário ("Este mês" vira o mês novo sozinho). Datas escolhidas à mão ficam como estão.

## Atalhos para trabalhar rápido (quem vem do SSW)

- **Ir para… (Ctrl+K ou F2)**, em qualquer tela: digite o **código da tela** e aperte Enter. Também dá para digitar parte do nome ("fatura", "abastecimento", "novo cte").
  - O código aparece ao lado de cada item do menu.
  - **999** mostra a lista completa por área (dá para imprimir e deixar ao lado do computador).
  - Os últimos destinos usados aparecem primeiro.
  - Cada usuário só vê as telas que tem permissão de abrir.
- **Como os códigos são formados:** o primeiro número é a **área**. Na mesma área, o número logo depois do da tela abre o formulário de **novo** (001 Coletas → 002 Nova coleta).
  - **0xx Operação:** 000 Hoje · 001 Coletas · 002 Nova coleta · 010 Cotações · 011 Nova cotação · 020 CT-e · 021 Novo CT-e · 025 MDF-e · 030 NFS-e · 031 Nova NFS-e · 040 Romaneios · 041 Ocorrências de entrega · 045 Monitoramento (mapa) · 050 Conferência (bipagem) · 051 Etiquetas · 055 Armazém · 060 Onde está a mercadoria · 061 Transferências · 065 Parceiros e redespacho · 066 Paletes · 070 EDI · 080 Portal do cliente · 090 SAC (chamados)
  - **1xx Financeiro:** 100 Faturamento · 101 Contas a receber · 102 Boletos · 103 Régua de cobrança · 104 Serviços extras · 110 Contas a pagar · 111 Nova conta a pagar · 120 Acerto de viagem · 125 Comissões · 130 Pagamento de fretes (embarcador) · 140 Fiscal e contabilidade · 141 Pacote do contador · 142 Notas de entrada · 143 NF-e contra o CNPJ · 144 GNRE · 150 Caixa e bancos · 151 Conciliação bancária · 152 Fluxo de caixa · 153 Importar extrato (OFX)
  - **2xx Frota:** 200 Custos e alertas · 201 Abastecimentos · 202 Novo abastecimento · 210 Manutenções · 211 Nova manutenção · 220 Veículos e motoristas · 230 Documentos · 240 Pneus · 250 Jornada
  - **3xx Gestão e relatórios:** 300 Painel gerencial · 301 Margem por CT-e e cliente · 302 Centros de custo · 309 Indicadores · 310 a 323 Relatórios · 330 Auditoria de frete
  - **4xx Fretes contratados:** 400 Visão geral · 401 Enviar XML · 402 Todos os registros · 403 Notas fiscais · 404 CT-e recebidos · 410 Sinistros
  - **5xx Comunicação:** 500 Mensagens · 501 Agenda
  - **9xx Sistema:** 900 Cadastros · 901 Filiais · 902 Configuração fiscal · 903 Manutenção (aba Sistema) · 904 Integrações (aba da Manutenção) · 905 Transportadoras contratadas · 906 Tabelas de preço · 907 Cadastros básicos · 908 Usuários · 909 Empresa · 910 Clientes · 911 Fornecedores · 912 Veículos e motoristas · 913 Conjuntos · 914 Ajudantes · 915 Produtos · 916 Tipos de mercadoria · 917 Regiões de atendimento · 918 Tipos de operação · 919 Condições de pagamento · 920 Departamentos · 990 Modo compacto · 991 Tema · 999 Lista de códigos
- **Modo compacto** (botão no menu lateral, ou código 990): menos espaço e letra menor, para ver mais linhas na tela. Fica salvo naquele computador.
- **Nos formulários** (janelas de cadastro e lançamento):
  - **Enter** passa para o próximo campo, como o Tab;
  - **Ctrl+Enter** aciona o botão principal (Salvar, Lançar, Transmitir);
  - nos campos de texto longo, o Enter continua quebrando linha.

## Margem por CT-e e por cliente

Em **Painel gerencial → 💹 Margem por CT-e e cliente** (mesmo período escolhido no topo do painel).

**Como cada documento é calculado** (CT-e e NFS-e):
- **Receita do frete** − **ICMS** do CT-e / **ISS** da NFS-e − **outros impostos** (% configurado: PIS, COFINS, IR, CSLL) − **seguro** (% do valor da mercadoria).
- − **custo da viagem**: o custo lançado no MDF-e (à mão ou pelo acerto de viagem), ou o acerto do romaneio de entrega / da transferência entre filiais. É dividido entre os CT-e da viagem pelo **peso** (sem peso, pela receita).
- − **frota própria**: combustível e manutenção do caminhão no período, divididos pelo peso que ele levou (pelo MDF-e, romaneio ou transferência). O combustível pago pelo motorista não entra aqui, porque já está no acerto.
- = **margem** em R$ e em %, colorida conforme a **meta de margem**.

**Na tela:**
- **Por cliente** (quem paga o frete): receita, custos, margem, % e frete/kg contra custo/kg. Os que estão abaixo da meta aparecem destacados. Clicar no cliente filtra os documentos dele.
- **Documentos:** filtros de margem negativa, abaixo da meta e **sem custo lançado** (a margem desses aparece maior do que é).
- **Demonstrativo do período:** receita, impostos, custos, margem de contribuição, despesas da empresa (salários, aluguel, administrativo, seguro e outros, de Contas a pagar) e **resultado**.
- **Avisos:** documentos sem custo, combustível possivelmente contado duas vezes (lançado à mão no MDF-e e também nos abastecimentos), custos sem CT-e para dividir.
- **⬇ Planilha:** abre no Excel com a margem de cada documento.
- **⚙ Percentuais e meta** (administrador): impostos sobre o faturamento (peça ao contador), seguro e meta de margem.

## Frota: abastecimento, manutenção, documentos, pneus e jornada

Em **Operação de Transporte → 🔧 Frota** (quem emite CT-e ou vê o financeiro). Usa os veículos de **🚛 Veículos e motoristas**.

**Abastecimentos** (＋ Abastecimento): veículo, km do hodômetro, combustível (diesel S10/S500, ARLA 32, gasolina, etanol, GNV), litros, valor, posto e se completou o tanque.
- **Consumo (km/l)** medido de tanque cheio a tanque cheio. Os abastecimentos parciais entram no trecho seguinte, e o ARLA fica fora da conta.
- O sistema recusa km que volta para trás e preço por litro fora do normal.
- Com o **consumo esperado** do veículo ("Ajustar" no painel), avisa quando a média fica 15% abaixo (vazamento, pneus, desvio).
- **Pagamento:**
  - **à vista**: entra em Contas a pagar já pago;
  - **a prazo**: conta em aberto com vencimento;
  - **motorista pagou**: despesa no acerto de viagem aberto;
  - **já lançado / cartão frota**: só registra.

**Manutenções** (＋ Manutenção): preventiva ou corretiva, agendada → na oficina → concluída. Lance peças e serviços (quantidade × valor) ou só o total, a oficina e a NF/OS.
- **Ao concluir:** o custo vai para Contas a pagar (à vista ou a prazo, parcelado), o km do veículo é atualizado e os itens do plano preventivo marcados recomeçam a contar.
- **Ao excluir:** as contas geradas saem (se não tiverem pagamento) e o plano volta como estava.

**Plano preventivo:** cada item vence por km e/ou por tempo, o que vier primeiro, com aviso antes.
- Exemplos: troca de óleo a cada 20.000 km ou 180 dias, licenciamento a cada 365 dias, aferição do tacógrafo a cada 2 anos.
- "✨ Plano sugerido" cria os itens mais comuns num veículo. Ajuste pelo manual do fabricante.

**📄 Documentos** (código **230**): validade dos documentos de cada veículo (CRLV/licenciamento, RNTRC, aferição do tacógrafo, seguro, CIV/CIPP, AET, vistoria) e de cada motorista (CNH, exame toxicológico, MOPP, exame médico, cursos).
- Situação: vencido (vermelho), vencendo dentro do aviso (amarelo, padrão 30 dias, ajustável por documento) e os obrigatórios ainda não cadastrados (tracejado). A tela Hoje avisa vencidos e vencendo.
- Documento vencido do veículo ou do motorista (CRLV, RNTRC, tacógrafo, CIV, CNH, toxicológico, MOPP) **barra a transmissão do MDF-e** e aparece em vermelho no romaneio.
- A CNH segue sincronizada com o cadastro do motorista (a validade que já existia virou documento).

**🛞 Pneus** (código **240**): cada pneu pelo **número de fogo**, com marca, medida, DOT, vida (recapagens), valor e sulco.
- **Mapa do veículo** por eixo (1º eixo simples, os demais duplos; reboque todo duplo; estepes) — ajuste o número de eixos. Clique na posição vazia para montar, no pneu para rodízio, medir sulco, desmontar, recapar ou sucata.
- **Rodízio** troca os dois pneus quando a posição de destino está ocupada. Montagem e desmontagem pedem o km do veículo: os km rodados de cada montagem somam no pneu.
- **Recapagem**: na volta, o valor soma no custo do pneu (com vencimento, vira conta a pagar na categoria Pneus) e o pneu ganha uma vida.
- **Custo por km** = (compra + recapagens) ÷ km rodados. Sulco até 3 mm em amarelo e abaixo de 1,6 mm (limite legal) em vermelho; a tela Hoje avisa os montados com sulco baixo. Histórico de cada pneu com todos os movimentos.

**⏱ Jornada** (código **250**), pela Lei 13.103/2015:
- O motorista marca no **app do romaneio**: Dirigindo, Carga/descarga, Esperando, Pausa, Refeição e Encerrar (com a hora do servidor e a localização). O app mostra jornada, direção, direção contínua e refeição, e avisa perto das 5h30 dirigindo.
- O sistema soma direção, trabalho, espera (não conta na jornada), refeição e pausas, calcula as **horas extras** (acima de 8h) e avisa: direção contínua acima de 5h30 sem 30 min de descanso (o descanso pode ser fracionado), jornada acima de 10h, refeição menor que 1h em jornada acima de 6h, menos de 11h entre jornadas e jornada esquecida aberta.
- O escritório pode lançar a jornada de quem não usa o app e incluir/apagar marcações (fica o nome de quem ajustou). **Espelho do mês** por motorista para imprimir e assinar. A tela Hoje avisa jornadas abertas com alerta.
- O motorista é identificado pelo CPF do romaneio (campo documento); sem CPF, pelo nome.

**Custos e alertas:** por veículo e no período, mostra km rodados, litros, média km/l, combustível, manutenção e **custo por km**. Também lista o que está vencido ou vencendo no plano, os veículos na oficina, as manutenções agendadas para a semana, o consumo alto e as CNH vencendo.

## NFS-e do frete municipal (Padrão Nacional)

Frete com coleta e entrega no **mesmo município** não leva CT-e: é serviço de transporte municipal (item 16.02 da LC 116), com **ISS**, e sai em **NFS-e**. O sistema emite pelo **emissor nacional** (Sistema Nacional NFS-e, leiaute 1.01), com o mesmo certificado A1 do CT-e.

**Antes de usar** (administrador, em **Emissão de CT-e → 🧾 NFS-e → ⚙ Configurar**):
1. Confirme com a prefeitura ou o contador que o município da empresa aderiu ao **emissor nacional**. Município com sistema próprio que não aceita o nacional precisa de outra integração.
2. Preencha a **inscrição municipal**, a **alíquota do ISS** e, se for o caso, o código de tributação municipal.
   - O código nacional padrão é **160201** (outros serviços de transporte de natureza municipal).
3. Comece em **homologação** (produção restrita), emita algumas notas de teste e só depois mude para **produção**.

**No dia a dia:**
- **＋ Nova NFS-e**: tomador (busca no cadastro de clientes), descrição, valor do frete, desconto e se o cliente **retém o ISS**.
- **Pelo CT-e:** ao transmitir um CT-e com origem e destino na mesma cidade, o sistema pergunta se quer trocar por NFS-e. O rascunho vira NFS-e com o tomador, o endereço, o valor e as NF-e transportadas. Depois de autorizada, o rascunho de CT-e é apagado.
- **Transmitir:** a nota volta com número, chave de 50 dígitos e o ISS calculado pelo Sistema Nacional. Se a resposta se perder, "Tentar de novo" confere antes se a nota já existe (não duplica).
- **DANFSe** para imprimir/PDF, **XML** e **cancelamento** (com motivo).
- A NFS-e autorizada entra em **Faturamento → A faturar** junto com os CT-e do mesmo cliente. Com ISS retido, a fatura cobra o valor líquido.
- Não dá para cancelar uma NFS-e que está numa fatura: cancele a fatura antes.
- O resumo mostra o **ISS a recolher no mês** (guia do município) e o retido pelos clientes.

No modo demonstração, a NFS-e é simulada no próprio servidor (nada vai ao governo).

## Portal do cliente (embarcador)

Página própria para o cliente da transportadora: **`/portal.html`** (funciona no celular). O acesso é separado dos usuários do sistema: um login do portal não abre nada do sistema interno.

**Liberar um cliente** (administrador): **Operação de Transporte → 🌐 Portal do cliente → ＋ Novo acesso**.
- Escolha o cliente, os CNPJ/CPF dele (ou marque "todas as filiais" para a raiz do CNPJ), o nome e o e-mail de quem vai usar.
- O sistema gera uma **senha provisória** (aparece uma vez só). No primeiro acesso o cliente cria a própria senha.
- "Nova senha" e "Desativar" derrubam na hora quem estiver conectado.
- Desmarque "vê valores" para quem só acompanha entregas (expedição, SAC do cliente).

**O que o cliente vê:**
- **Início:** cargas em andamento, atrasadas, % de entregas no prazo (30 dias), frete do mês, faturas em aberto e as últimas movimentações.
- **Cargas** em que ele aparece (remetente, destinatário, expedidor, recebedor ou pagador): situação, previsão, histórico, **DACTE, XML, foto do comprovante e assinatura**. Busca por NF, CT-e ou cidade. **XML do período** num .zip, para o fiscal dele.
- **Valores do frete** só nos CT-e em que ele é o **pagador**.
- **Quem não vê valores** (acesso sem "vê valores", ou CT-e pago por outra empresa): o DACTE sai **sem os valores do frete** (componentes, total, valor a receber e ICMS; R$ nas observações vira `R$ ***`) e o **XML não fica disponível** — nem avulso nem no .zip do período —, porque o XML assinado traz os valores e não pode ser alterado. O .zip só leva os CT-e que ele paga. O botão do .zip some para acesso sem "vê valores".
- **Financeiro:** faturas em que ele é o pagador, com a fatura impressa, o **boleto** e a linha digitável para copiar.
- **Endereço de coleta do acesso:** no "Novo acesso", escolher o cliente do cadastro preenche também o endereço de coleta (razão social, IE, endereço, cidade com IBGE, UF, CEP, telefone); fora do cadastro, busca na Receita pelo CNPJ. Sem endereço no acesso, o portal usa o cadastro de clientes ou o último CT-e em que o cliente foi remetente (CEP gravado no campo do bairro volta para o CEP).
- **Pedir coleta:** "Coleta no meu endereço" já vem preenchida (com "Alterar" só para essa coleta); **"Coleta reversa"** busca em outro local (fornecedor, cliente dele) e entrega na empresa dele, com frete a pagar pelo destinatário (`tomador = destinatario`); aparece com a etiqueta "Reversa".
- **Coletas:** pede coleta. Ela cai em Coletas com o canal "🌐 Portal" e ele acompanha cada etapa (pedida → programada → saiu para coletar → coletada), com data do pedido, data agendada e horário, saída, hora da coleta, **motorista e veículo com a placa** (do romaneio em que a coleta foi programada; sem documento nem telefone do motorista), volumes pedidos e coletados, quem entregou e o CT-e gerado.
- **Visual:** entrada com a marca da transportadora, cabeçalho com o usuário, abas com ícones, indicadores e cartões coloridos pela situação; tema claro/escuro e celular.
- **Cotações:** pede cotação e aprova ou recusa pelo portal.
  - Com a **cotação automática** ligada (⚙ Configurar), o preço da tabela sai na hora.
  - Desligada, o pedido aparece em Cotações, filtro **"🌐 Do portal"**. A equipe clica em **Calcular o preço**, salva, e a cotação fica para o cliente aprovar.

**Para o cliente acessar de fora da empresa**, o servidor precisa estar publicado na internet com HTTPS (domínio próprio ou redirecionamento de porta + certificado). Informe esse endereço em **⚙ Configurar**. Com ele:
- o sistema manda o acesso por e-mail;
- o cliente recupera a senha sozinho ("Esqueci a senha", com link que vale 1 hora).

CT-e de demonstração só aparecem no portal enquanto a empresa está no modo demonstração.

## Comissão de vendedores

**Financeiro → 🤝 Comissões** (código **125**).

- **Vendedores:** cada um tem o percentual e a base de cálculo.
  - **Sobre o recebido:** só entra quando a fatura do cliente é quitada. É o padrão.
  - **Sobre o faturado:** entra quando o CT-e é autorizado.
- **Carteira de clientes:** liga cada cliente (quem paga o frete) a um vendedor, com percentual próprio se quiser. Salva na hora.
  - Na apuração dá para trocar o vendedor de um CT-e específico.
- **Apuração do período:** documentos de cada vendedor, base, percentual e comissão. Avisa quando há recebimento de cliente sem vendedor.
- **Fechamento:**
  - Vira uma conta a pagar (categoria Comissão, no centro de custo Comercial) com o vencimento escolhido.
  - Cada documento é comissionado uma vez só.
  - CT-e cancelado ou substituído depois de comissionado volta como **estorno** no fechamento seguinte.
  - **Cancelar o fechamento** devolve os documentos para a apuração. Só dá se a comissão ainda não foi paga.
- A **Margem por CT-e e cliente** passa a descontar a comissão (estimada pelo percentual de cada cliente).

## Centros de custo

**Gestão → 🎯 Centros de custo** (código **302**).

- **Tipos:** filial, veículo, rota, comercial, administrativo e outro.
  - O botão **⚡ Criar automático** cria um centro para cada filial e cada veículo, mais Comercial e Administrativo.
  - As contas a pagar antigas são classificadas pelo veículo (abastecimento, manutenção, acerto) ou pela filial.
- **Nas contas a pagar:**
  - Campo "Centro de custo". Em branco, a conta pega o centro do veículo ou da filial sozinha.
  - Abastecimento, manutenção e acerto de viagem pegam o centro do veículo.
- **Resultado por centro:** receita (CT-e e NFS-e pela filial de origem; sem filial, vai para a matriz) − despesas (contas a pagar pelo vencimento), com o detalhe por categoria.
  - O botão "Contas" de cada centro abre as contas para conferir e mover de centro, inclusive as que estão sem centro.

## Régua de cobrança

**Faturamento → 📣 Régua de cobrança** (código **103**). Manda lembretes das faturas em aberto, sozinha, uma vez por dia a partir da hora escolhida.

- **Etapas** em dias em relação ao vencimento. O padrão é 3 dias antes, no dia, 3 dias depois e 10 dias depois.
  - Cada etapa tem assunto e mensagem editáveis, com as variáveis {cliente} {fatura} {valor} {vencimento} {quando} {dias} {empresa} {contato}.
  - **{quando}** é calculado no dia do envio: "vence em 3 dias", "vence amanhã", "vence hoje", "venceu há 5 dias".
- **Canais:**
  - **E-mail:** a fatura com o boleto e o PIX, com a mensagem da etapa em cima. Dá para mandar cópia para o financeiro.
  - **WhatsApp:** a mensagem com o PIX copia e cola e a linha digitável do boleto. Precisa do WhatsApp configurado em Manutenção.
- **Regras:**
  - Cada etapa vai uma vez por fatura e canal. O lembrete mandado à mão conta como enviado.
  - A régua para quando a fatura é paga, seja pela baixa, pelo retorno do boleto ou pela conciliação do extrato.
  - Lembrete de antes do vencimento não sai depois que a fatura venceu.
  - Etapa que passou há mais de N dias (a "janela") não é mandada atrasada. Assim, ao ligar a régua, quem está 60 dias vencido não recebe "vence em 3 dias".
  - Envio com erro tenta de novo no dia seguinte. Canal desligado ou sem contato é só pulado.
- **Exceções:**
  - **Cliente pausado:** acordo, ou paga por outro meio.
  - **E-mail ou WhatsApp de cobrança próprio do cliente:** usado no lugar do e-mail da fatura.
  - **Pagamento prometido:** pausa só aquela fatura até uma data, pela seção 📣 Cobrança da fatura.
- **Hoje:** mostra o que sai no dia, quem está sem contato e o que está pausado. Também tem "✉ Lembrar" para mandar na hora e "Mandar os de hoje agora".
- **Histórico:** cada envio, com o canal, o destinatário, a situação e quem mandou.
- Na tela **Hoje**: lembretes do dia, faturas sem contato de cobrança e faturas vencidas há mais de 30 dias.

## Caixa e bancos (conciliação bancária e fluxo de caixa)

Menu **Operação de Transporte → 🏦 Caixa e bancos** (códigos **150** contas, **151** conciliação, **152** fluxo de caixa e **153** importar extrato). Pede a permissão de ver o financeiro.

- **Contas e saldos:** cada conta bancária e o caixa (dinheiro), com o saldo de um dia (o do extrato).
  - A partir dessa data, o saldo é calculado assim: saldo inicial + recebimentos de faturas − pagamentos de contas + lançamentos avulsos.
  - A primeira conta de cada tipo assume os recebimentos e pagamentos já lançados desde essa data: o que foi em dinheiro vai para o caixa, o resto para o banco.
- **Conta no recebimento e no pagamento:** ao dar baixa numa fatura ou numa conta a pagar, escolha a conta.
  - Sem escolha, dinheiro vai para o caixa e o resto para a conta padrão.
  - Retorno de boleto e abastecimento pago à vista também caem na conta padrão.
- **Conciliação (extrato OFX):** no internet banking, exporte o extrato em OFX e importe.
  - Aceita OFX 1.x e 2.x. Importar o mesmo período de novo não duplica nada.
  - O que já estava lançado (boleto baixado pelo retorno, PIX recebido, conta paga) é conciliado sozinho quando o valor e a data batem sem dúvida.
  - O resto vem com uma sugestão:
    - baixar a fatura de mesmo valor (★ quando o histórico cita o cliente ou o CNPJ);
    - pagar a conta de mesmo valor;
    - lançar como tarifa ou rendimento.
  - Marque as sugestões certas e clique em **Confirmar marcadas**, ou escolha linha a linha.
  - **Desfazer** estorna a baixa ou exclui o lançamento que a conciliação criou.
  - O quadro de cima compara o saldo do banco (do último extrato) com o do sistema na mesma data.
- **Lançamentos avulsos e transferências:** tarifa, rendimento, aporte ou retirada dos sócios, despesa paga no caixa, saque e depósito entre contas.
- **Movimentação:** lançamentos da conta no período, com o saldo dia a dia e a marca do que já foi conferido com o extrato.
- **Fluxo de caixa (30/60/90 dias):** saldo de hoje + faturas a receber − contas a pagar, semana a semana, pelo vencimento.
  - Os vencidos entram na primeira semana.
  - Avisa a semana em que o saldo fica negativo.
- **Contabilidade:** os lançamentos contábeis usam a conta contábil de cada conta bancária. Tarifas, rendimentos, sócios e transferências também viram lançamento.

## Fiscal e contabilidade

Menu **Operação de Transporte → 🧮 Fiscal e contabilidade** (código **140**; **141** abre direto o pacote do contador). Pede a permissão de ver o financeiro.

- **Livro de saídas e apuração:** CT-e do período com CFOP, CST, alíquota, base, ICMS e isentas/outras.
  - Resumos por CFOP, por CST/alíquota e por UF de início → fim.
  - NFS-e com o ISS (e o ISS retido).
  - Cancelados e substituídos aparecem na lista, mas não entram nas somas: vale o CT-e substituto.
  - Imprime em PDF e baixa em planilha.
- **Lançamentos contábeis:** partidas dobradas pelo plano de contas do contador:
  - receita dos CT-e e NFS-e, com o ICMS e o ISS;
  - recebimentos das faturas;
  - contas a pagar, no regime de competência ou de caixa.
  - **Competência:** receita e impostos na emissão; despesa no mês da **competência** da conta a pagar (campo novo, não o dia do cadastro). Conta cancelada depois do mês fechado continua no mês dela e sai como estorno no mês do cancelamento.
  - **Caixa:** receita no **recebimento** da fatura (dividida entre CT-e e NFS-e na proporção dos documentos da fatura) e despesa no pagamento; emissão, estornos e descontos não geram lançamento (ICMS e ISS entram quando pagos). A tela e o LEIA-ME mostram a receita recebida no período.
  - Traz o resumo por conta (débitos = créditos) e a planilha para importar (separador `;`, `,` ou tabulação).
- **Pacote do contador (.zip):** XML dos CT-e (autorizados, cancelados e substituídos em pastas separadas, mais os eventos), dos MDF-e e das NFS-e, junto com o livro, os lançamentos e um LEIA-ME.
  - Baixa na tela ou vai por e-mail para o contador.
  - Com o **envio automático** ligado, o pacote do mês anterior sai sozinho no dia escolhido; se falhar, tenta de novo a cada 6 horas.
- **📥 Notas de entrada e apuração** (código **142**): compras da transportadora (diesel, ARLA, peças, pneus) e CT-e de agregados/redespacho em que a empresa é a tomadora.
  - **Importar XML** (um ou vários): confere se a nota é para a empresa (destinatário ou tomador) e se já foi lançada; sugere a categoria pelo NCM, o CFOP de entrada (1653/2653 combustível, 1556/2556 uso e consumo, 1351/2351 frete contratado) e o crédito de ICMS. Lê o ICMS monofásico do diesel (CST 61).
  - **Gera as contas a pagar** pelas duplicatas da nota (ou pelo vencimento e parcelas informados), com a competência na data de entrada. **Nota sem XML** para nota em papel.
  - **Crédito de ICMS** (em Contador e plano de contas): pelas notas, crédito presumido de 20% (Convênio ICMS 106/96) ou sem crédito (Simples; é o automático quando o CRT é 1).
  - **Apuração:** débitos das saídas − créditos − saldo credor anterior (levado mês a mês desde a primeira nota, mais o saldo inicial informado) = ICMS a recolher ou saldo credor.
  - **Livro de entradas** por nota e CFOP (HTML e planilha). Os lançamentos contábeis trazem o crédito (ICMS a recuperar × despesa) e a compensação no fim do período; o pacote do contador leva os XML em `Entradas/` e o livro de entradas.
  - **Cancelar** o lançamento cancela as contas a pagar em aberto da nota (com pagamento: estorne antes).
- **📡 NF-e contra o CNPJ** (código **143**): busca na SEFAZ (Distribuição DF-e do Ambiente Nacional, NT 2014.002) as NF-e emitidas para a empresa, com o certificado A1 do CT-e e o ambiente da Configuração fiscal.
  - Busca à mão ou **automática** (a cada hora); respeita a regra da SEFAZ de 1 hora de espera quando não há nada novo (evita o bloqueio 656) e mostra o horário liberado.
  - Chega o **resumo**; com a **ciência da operação** (à mão ou automática) vem o XML completo (ou "Baixar XML" pela chave). **Lançar** abre o lançamento das Notas de entrada com o XML.
  - **Manifestação do destinatário** assinada (evento no Ambiente Nacional): ciência, confirmação, desconhecimento e operação não realizada (com justificativa). Cancelamento da NF-e pelo emitente marca a nota como cancelada.
  - Notas em que a empresa é a **transportadora** chegam completas (filtros "Carga sem CT-e" e "Como transportador") e viram rascunho de CT-e pelo botão **Emitir CT-e** (ou sozinhas, com a opção ligada). Nota que não é compra pode ser ignorada. A tela Hoje avisa as que estão para lançar e sem manifestação. No modo demonstração há um simulador com três notas.
- **Contador e plano de contas:** nome, e-mail e CRC do contador, regime, separador, modo de crédito do ICMS, saldo credor inicial e o código de cada conta.

**O SPED não é gerado aqui.** A EFD ICMS/IPI e a EFD Contribuições precisam também das notas de **entrada** (diesel, peças, pneus, CT-e de subcontratação), que não passam pelo Nexofrete. O sistema do contador importa os XML do pacote junto com essas notas e apura o saldo do ICMS (débitos − créditos).

- **🧾 GNRE (ICMS de outra UF)** (código **144**): CT-e com ICMSOutraUF (CST 90) sem guia, por UF de início, fora as UFs onde a empresa tem inscrição (⚙, apuração mensal lá). **Dados para a guia** (receita 100030 ICMS Transporte, emitente, CT-e de origem, referência, vencimento, valor, com copiar e impressão) para gerar no Portal GNRE; **Registrar a guia** confere a linha digitável/código de barras de arrecadação (DV módulo 10/11 e valor) e cria a conta a pagar (categoria `gnre`, fornecedor SEFAZ-UF). Contabilidade: na competência, D ICMS devido a outra UF / C Fornecedores; no caixa, ICMS sobre o frete no pagamento. O romaneio avisa CT-e sem guia paga; a Hoje mostra CT-e sem guia e guias vencendo. Anexos (PDF da guia e comprovante) em `dados/gnre`. O webservice da GNRE ainda não é usado (guia gerada no portal). Código em `src/gnre.js`.

## Contas a pagar e acerto de viagem

Em **Operação de Transporte → Contas a pagar / Acerto de viagem**:

**Contas a pagar** (quem tem permissão de financeiro):
- Lance qualquer saída: combustível, pedágio, manutenção, pneus, salários, impostos, aluguel...
- **Competência**: o dia da despesa (data da nota/serviço) — define o mês na contabilidade. Compra parcelada fica toda no mês dela; conta que se repete (valor de cada parcela) vai mês a mês. Abastecimento e manutenção usam a data do registro; comissão, o fim do período.
- **Parcelas mensais:** o valor pode ser o total (dividido entre as parcelas) ou o de cada parcela (ex.: aluguel).
- **Pagar:** total ou parcial, com forma de pagamento. O pagamento pode ser estornado.
- **Topo da tela:** vencidas, vence hoje, próximos 7 dias, pago no mês e o **saldo dos próximos 30 dias** (faturas a receber − contas a pagar).

**Acerto de viagem:**
- **Motorista próprio:** abra o acerto na saída com o **adiantamento**. Na volta, lance as **despesas comprovadas** (combustível, pedágio, alimentação, hospedagem...). O saldo diz se a empresa reembolsa ou se o motorista devolve.
- **Terceiro / agregado:**
  - Informe o frete contratado, o adiantamento, o CIOT e o vale-pedágio.
  - **Autônomo pessoa física (TAC):** o sistema calcula a retenção de **INSS (11%)** e **SEST/SENAT (2,5%)** sobre 20% do frete. O **IRRF** depende da tabela do mês e é lançado à mão.
  - Lance descontos (avaria, falta) e acréscimos (estadia, descarga).
- **O que acontece sozinho:**
  - O adiantamento e, ao fechar, o saldo viram **contas a pagar**.
  - O CIOT e o vale-pedágio vão para o **MDF-e** ainda não transmitido.
- **CIOT e vale-pedágio pelo provedor** (pagamento eletrônico de frete, Res. ANTT 5.862/2019): em *⚙ CIOT e vale-pedágio* (admin) escolha o provedor — **Pamcard, Repom, e-Frete, Target** ou o **Simulador** —, o ambiente, as credenciais (senha guardada criptografada), a fornecedora do vale-pedágio, eixos e forma de pagamento. No acerto com terceiro: **Declarar CIOT** (confere CNPJ/RNTRC da empresa, CPF/CNPJ e RNTRC do contratado, CPF do motorista, placa, rota do MDF-e, frete e peso), **Comprar vale-pedágio** (vira conta a pagar para a fornecedora, categoria Pedágio, ligada ao acerto: fica ao fechar/reabrir o acerto e é cancelada com o CIOT se não foi paga), **Encerrar** (automático ao fechar o acerto, com o valor final) e **Cancelar** (até 24 h, com motivo). CIOT e vale-pedágio vão para o acerto e para o MDF-e não transmitido; cada passo fica em `pef_operacoes`. Código em `src/pef/` (`provedores.js`: uma interface por provedor). Os provedores reais aguardam o manual da API e as credenciais do contrato; até lá respondem com aviso e não enviam nada.
  - O custo da viagem vai para o **resultado por viagem** do painel.
- **🖨 Demonstrativo:** para o motorista assinar. Dá para reabrir o acerto enquanto o saldo não foi pago.

## Filiais e transferências

Para transportadora com mais de uma unidade (matriz e filiais), em **Operação de Transporte**:

1. **Filiais (unidades)** (administrador): cadastre cada filial com sigla, cidade e a **lista de cidades que ela entrega**. A matriz é criada sozinha com os dados da empresa.
2. Todo CT-e autorizado sabe **onde a mercadoria está** (nasce na unidade que atende a cidade de início, ou na matriz) e **qual filial vai entregar** (a que atende a cidade de destino).
3. **Onde está a mercadoria:** um quadro por unidade (a entregar, **a transferir**, chegando, volumes e peso) e a lista de CT-e com o local atual. Marque os "a transferir" e clique em **🔀 Transferir os marcados**.
4. **Transferência (manifesto):** origem, destino, motorista, placa e lacre.
   - Na origem: **🖨 Manifesto**, **🏷 Etiquetas**, **📋 MDF-e**, **🔎 Conferir carregamento** (bipagem) e **▶ Dar saída**. Os CT-e ficam "em transferência" e ganham a ocorrência.
   - No destino: **🔎 Conferir chegada** (bipagem) e depois **Registrar a chegada**; ou **✓ Receber** sem bipar.
   - Os CT-e passam a estar na filial, com a ocorrência "Chegada na filial" e as faltas anotadas. O CT-e de que nenhum volume chegou continua "em trânsito" até alguém clicar em **chegou depois**.
5. **acertar** (administrador): corrige onde a mercadoria está ou qual filial entrega, para os casos fora do fluxo. Fica registrado na auditoria.

## Parceiros e redespacho

Em **Operação → 🤝 Parceiros e redespacho** (código **065**): agentes e transportadoras que entregam onde a empresa não tem filial.

- **Cadastro:** CNPJ/CPF (nome, IE e endereço pela Receita), inscrição estadual, RNTRC, endereço, contato principal e outros contatos (função, telefone, e-mail), dados bancários (banco, agência, conta, tipo) e PIX, **serviços** oferecidos (fracionado, lotação, dedicado, coleta, agendada, expressa, refrigerada, perigosa, reversa, reentrega, armazenagem), **estados inteiros** e **cidades** atendidas (Cidade/UF, uma por linha), custo padrão por CT-e (% do frete + R$/kg + fixo, com mínimo) e o prazo padrão (dias a mais na previsão).
- **Tabela de frete por região** (Abrir → Tabela de frete): linhas por UF ou cidade, com faixa de peso ("até" kg), % do frete, R$/kg, fixo, mínimo e **prazo por região**. Vale a linha da cidade antes da do estado e, na mesma região, a menor faixa de peso que cabe; destino sem linha usa o custo padrão. Ter linha num estado/cidade também conta como área atendida.
- **Documentos com vencimento** (Abrir → Documentos): RNTRC, seguro RCTR-C (os dois obrigatórios), RCF-DC, contrato, CND, alvará, licença. RNTRC ou RCTR-C vencido **trava o repasse** (o administrador pode liberar caso a caso, registrado na auditoria). A tela Hoje avisa os vencidos e os que vencem dentro do aviso.
- **Desempenho** (Abrir → Desempenho, e o **Ranking** no alto da tela): pontualidade (entregues no prazo do parceiro ÷ entregues + em aberto já atrasadas), atraso médio, ocorrências de problema, devolvidas, por mês e por estado, e a lista das entregas atrasadas. O prazo do parceiro conta do repasse (ou da previsão do CT-e, se for depois) mais os dias dele: CT-e que já chegou atrasado não conta contra ele. A lista mostra a pontualidade dos últimos 90 dias.
- **Avaliação:** nota de 1 a 5 por carga entregue (Cargas → ⭐ Avaliar) ou geral, com comentário (obrigatório em nota 1 ou 2). **Nota geral** = pontualidade em 5 estrelas (100% = 5) e, com avaliações, a média das duas.
- **Bloqueio e liberação** (Abrir → Bloqueio): bloquear com motivo (quem opera) tira o parceiro da sugestão e impede o repasse; só o administrador libera, com motivo. Fica o histórico.
- **Repasse:** em Ocorrências de entrega, marque os CT-e → **🤝 Repassar a parceiro**. Mostra quem atende cada destino (pela cidade, pela UF ou pela tabela), o custo previsto (pela tabela da região), a margem do frete, o prazo, os serviços, a pontualidade e a nota; bloqueados e com documento vencido aparecem travados. Ao confirmar, cria um **romaneio de redespacho** com o parceiro: os CT-e ficam "Entregue ao redespacho" (ocorrência 52), a previsão ganha o prazo do parceiro, o custo previsto entra na conta dele e sai o **código do app** para o parceiro dar baixa nas entregas (o mesmo app do motorista, sem jornada).
- **Conta-corrente:** custo (a empresa deve), pagamento ao parceiro, frete recebido pelo parceiro (fica com ele), recebido do parceiro e ajuste; saldo positivo = a empresa deve. O **CT-e do parceiro** lançado em Notas de entrada (emitente = parceiro, citando o nosso CT-e no docAnt ou as NF-e) baixa os custos desses CT-e (a conta a pagar sai da nota).
- **Acerto** (permissão do financeiro): fecha os lançamentos até a data; saldo a favor do parceiro vira conta a pagar (Frete de terceiro) com o PIX na observação.
- O custo do redespacho entra na **margem** por CT-e (Painel gerencial → Resultado). A tela Hoje avisa entregas atrasadas com parceiros. Código em `src/parceiros.js`.

## Armazém (armazenagem)

Em **Operação → 🏬 Armazém** (código **055**): mercadoria dos clientes (depositantes) guardada e cobrada por mês.

- **Contrato** (financeiro): cobra por posição-palete, m³, tonelada ou volume — diária por unidade, taxa de entrada e de saída por unidade, ad valorem (% ao mês sobre o valor médio guardado) e mínimo mensal.
- **Entrada:** XML da NF-e (remessa para armazenagem ou compra entregue no armazém; depositante = emitente quando a nota é para a empresa) ou à mão; peso/paletes/m³/volumes da nota repartidos entre os produtos pelo valor; lote, validade e endereço (rua-prédio-nível). Recibo impresso; a mesma NF-e não entra duas vezes.
- **Estoque e inventário:** saldo por lote com endereço, validade e dias guardados; contagem física vira ajuste com motivo.
- **Saída:** por lote (ou por produto, FEFO/FIFO), com destinatário, NF e CT-e; lista de separação impressa; saída com data passada só usa lotes que já tinham entrado. Cancelamento devolve o estoque (bloqueado em mês já cobrado).
- **Portal:** aba Armazém com estoque, movimentos e **pedido de saída**, que a equipe atende ou recusa.
- **Cobrança mensal:** ocupação no fim de cada dia × diária + taxas + ad valorem, com mínimo; com o mês fechado gera a NFS-e (rascunho, serviço 11.04.01) com a memória de cálculo. A tela Hoje avisa pedidos, lotes vencendo e meses a cobrar. Código em `src/armazem.js`.

## Monitoramento de veículos (mapa)

Em **Operação → 🛰 Monitoramento (mapa)** (código **045**): os caminhões em rota no mapa, pela posição do GPS do celular que o **app do motorista** manda enquanto o romaneio está em rota (a cada 60 s; sem internet guarda e manda depois; opção de manter a tela ligada).

- **Cartão de cada veículo:** situação (em movimento, no cliente, parado, sem sinal, sem posição), velocidade, entregas feitas, próxima entrega com a chegada prevista e os alertas.
- **Detalhe:** trajeto do dia, rota planejada (OSRM/ORS da roteirização), entregas numeradas com a chegada prevista (distância × 1,3 pela velocidade média + tempo por entrega), pontos das baixas e km rodados.
- **Alertas** (também na tela Hoje): parado fora de cliente, sem sinal, fora da rota (km da linha planejada) e entrega que vai chegar depois do agendamento ou da previsão. Limites em ⚙ Limites; posições apagadas depois de N dias (padrão 90).
- **Cliente:** hora prevista de chegada no portal e no rastreio público, sem mostrar onde o caminhão está. Código em `src/monitoramento.js`.

## Paletes e vale-palete

Em **Operação → 🟫 Paletes (vale-palete)** (código **066**): saldo de paletes de cada cliente (pelo CNPJ) e por tipo (PBR, CHEP, plástico, outro).

- **Troca na baixa:** na entrega (app do motorista ou Ocorrências → Entregue), "Carga paletizada? Troca de paletes": paletes deixados com a carga e vazios recebidos. Na coleta: vazios deixados e paletes carregados levados. Cada troca vira movimento de saída/entrada no saldo.
- **Vale-palete:** se voltaram menos vazios do que os deixados, sai sozinho um vale numerado com a diferença, em nome do recebedor (ou destinatário) do CT-e, com prazo (padrão 30 dias). Impressão em duas vias para assinar; o app avisa o motorista antes da assinatura.
- **Devolução, envio e ajuste:** lançamentos manuais; a devolução baixa os vales do que vence antes (ou o escolhido). Cancelar um vale tira o pendente do saldo. Apagar a ocorrência de entrega desfaz a troca e o vale.
- **Cobrança:** vales vencidos → **nota de débito** (valor do palete em ⚙ Valores e prazo, só o financeiro), uma por cliente; ela aparece em Faturamento → A faturar e entra na fatura (boleto/PIX). Contabilidade: D Clientes / C Outras receitas. Cancelar a nota reabre os vales.
- **Portal:** aba Paletes (saldo e vales, com o documento). A tela Hoje avisa os vales vencidos. Código em `src/paletes.js`.

## SAC com protocolo

Em **Operação → 🎧 SAC (chamados)** (código **090**): cada pedido do cliente vira um chamado com **protocolo** (AAAAMMDD-0001), assunto, prioridade, responsável, **prazo de resposta e de solução** e o CT-e ligado, com a conversa inteira.

- **Por onde chega:** portal do cliente (aba **Atendimento**, ou "Falar sobre esta carga" no detalhe da carga); **e-mail** (caixa em Manutenção → Leitura automática de e-mail com a finalidade "Chamados do SAC": e-mail novo abre chamado, a resposta com `[SAC protocolo]` no assunto entra no mesmo, só se vier do e-mail de contato); **WhatsApp** (webhook da Twilio em `/api/sac/whatsapp`, com a assinatura conferida; o cliente recebe o protocolo na hora); **telefone** (＋ Chamado).
- O assunto de e-mail/WhatsApp é adivinhado pelo texto e a NF/CT-e citada é procurada; por e-mail/WhatsApp o CT-e só é ligado se quem escreveu é parte dele (senão fica anotado para a equipe conferir).
- **Atendimento:** filtros (em aberto, meus, sem responsável, fora do prazo, aguardando o cliente, encerrados), resposta (avisa o cliente por e-mail e, se veio de lá, WhatsApp), responder e resolver, **nota interna**, mudar situação/prioridade (recalcula os prazos)/responsável/assunto/CT-e. Quando o cliente escreve de novo, o chamado volta para "em andamento" e o prazo de resposta recomeça.
- **Prazos padrão** (⚙ Prazos e avisos): urgente 1 h/4 h, alta 4 h/24 h (atraso, avaria e reclamação), normal 8 h/48 h, baixa 24 h/120 h; e-mail "responder para", e-mail da equipe para chamado novo e os avisos ao cliente.
- **Indicadores:** em aberto, tempo médio da 1ª resposta, % resolvidos no prazo, nota média (o cliente avalia de 1 a 5 no portal) e assuntos mais pedidos. A tela Hoje avisa os chamados fora do prazo e sem responsável. Código em `src/sac.js`.

## Etiquetas de volume e conferência (bipagem)

**Etiquetas:** cada volume do CT-e ganha uma etiqueta com cidade/UF de destino em letra grande, destinatário, endereço, remetente, NF, peso, **VOL 3/12** e o **código de barras** do volume.
- Onde imprimir: botão **🏷 Etiquetas** no CT-e autorizado, no romaneio, ou em **Operação de Transporte → Etiquetas de volume** (marque vários CT-e de uma vez).
- Tamanhos: 100 × 100, 100 × 150 ou 100 × 50 mm. O administrador escolhe o padrão em "Usar sempre".
- Impressora térmica (Zebra, Argox, Elgin...) com driver: escolha o papel do mesmo tamanho e margens "nenhuma". Sem driver: **⬇ ZPL (Zebra)** gera o arquivo para mandar direto à impressora.

**Conferência:** use um leitor de código de barras USB ou Bluetooth (ele "digita" o código e dá Enter) ou a **câmera do celular** (Chrome no Android).
- **Carga:** no romaneio, **🔎 Conferir carga**. Bipe os volumes que sobem no caminhão. A tela fica verde e apita quando está certo. Fica vermelha, com apito grave, quando o volume é de **outro romaneio** ("separe") ou o código não existe. Fica amarela quando o volume **já foi lido**. A barra mostra quantos volumes faltam e de quais CT-e; dá para **reimprimir** só as etiquetas que faltam.
- **Recebimento no armazém (descarga):** bipe o que chega (coleta, devolução, transferência) e veja, por CT-e, quantos volumes chegaram.
- A chave de acesso do DACTE também pode ser lida: conta o CT-e inteiro, para quem ainda não etiqueta.
- Ao concluir, faltas e sobras ficam registradas. O romaneio mostra o resultado ("carga conferida: 24/24 ✓" ou "faltaram 2") antes de dar saída.

## Cotações de frete

Em **Operação de Transporte → Cotações**:

1. **＋ Nova cotação:** busque o cliente pelo cadastro e informe destino, peso, volumes, cubagem e valor da mercadoria. Clique em **🧮 Calcular pela tabela**: o sistema usa a **tabela de preço da própria empresa** (a mesma do CT-e), com peso cubado, ad valorem, GRIS, pedágio e as taxas, e mostra o prazo do trecho.
2. Dá para **mudar valores**, incluir ou tirar linhas, ou aplicar um **desconto %** (sai do frete peso). A cotação guarda o valor da tabela, então você sempre vê quanto de desconto deu.
3. Envie a proposta:
   - **🖨 Proposta / PDF**: abre para imprimir ou salvar em PDF;
   - **✉ E-mail**: vai no corpo do e-mail e como anexo;
   - **💬 WhatsApp**: abre a conversa já com o texto pronto.
4. Quando o cliente responder:
   - **✓ Aprovada**: abre a **coleta já preenchida** (endereço do cadastro, carga e destino). Depois, o **CT-e sai com o preço combinado**, tanto pelo "Gerar CT-e" da coleta quanto pela NF-e que chega por e-mail.
   - **✗ Recusada**: pede o motivo, para você ver por que as cotações não fecham.
5. A cotação vence sozinha na data de validade e pode ser **reaberta** ou **duplicada**.

No topo: cotações em aberto, valor em negociação, aprovadas no mês e a **taxa de conversão**. Em **⚙ Validade e condições** (só administrador) você define a validade padrão e as condições gerais que saem no fim de toda proposta.

## Coletas

Em **Operação de Transporte → Coletas**:

1. **Nova coleta** quando o cliente pedir (por telefone, WhatsApp, e-mail ou no balcão). Digite o nome ou o CNPJ do remetente e o endereço vem do cadastro de clientes. Informe a data, a janela de horário, os volumes, o peso, o destino e quem paga o frete. **↻ Repetir** cria outra igual, para o cliente que pede toda semana.
2. **Programar no caminhão:** marque as coletas e escolha um romaneio que já existe (pode ser um caminhão que já está na rua) ou crie um novo com o motorista e a placa. As coletas entram no **mesmo romaneio das entregas**: uma folha impressa só e um código só no app do motorista.
3. **No celular**, o motorista vê as coletas (em roxo) junto com as entregas. Para **Coletado**, informa os volumes, o peso, quem entregou, a assinatura e/ou a foto. Para **Não coletado**, escolhe o motivo (mercadoria não estava pronta, local fechado...). O escritório também pode dar a baixa pela tela.
4. Ao **fechar o romaneio**, a coleta sem baixa fica como "Não coletada" e volta para a lista **A programar**.
5. **CT-e:** **Gerar CT-e** cria o rascunho com o remetente, o destino e a carga coletada; falta incluir as NF-e e conferir os valores. Se a NF-e do cliente chegar por e-mail, o rascunho criado sozinho já se liga à coleta.
6. Quem pediu a coleta recebe o aviso de "coletada" ou "não coletada" por e-mail ou WhatsApp, se os avisos automáticos estiverem ligados na Configuração fiscal.

O resumo no topo mostra quantas coletas estão a programar (e quantas atrasadas), quantas estão no caminhão, quantas foram coletadas hoje e quantas ainda estão sem CT-e.

## Ocorrências de entrega (estilo SSW)

Em **🚛 Operação de Transporte → 📍 Ocorrências de entrega** (quem emite CT-e): acompanha cada CT-e autorizado até a entrega.

- **Previsão de entrega** automática na autorização: prazo da tabela de preço da própria empresa para a cidade de destino, ou o "Prazo de entrega padrão" da Configuração fiscal (3 dias úteis se vazio), contando só dias úteis.
- **Painel** com contadores (em aberto, atrasados, previsão hoje, com ocorrência, entregues hoje, % no prazo) e filtros, busca por CT-e, NF, chave, cliente ou cidade.
- **Lançar ocorrência** (códigos PROCEDA): coletado, chegada na filial, saiu para entrega, agendada (com nova data), entregue (com quem recebeu, documento e foto do canhoto/PDF), não entregue (fechado, ausente, endereço...), recusa, avaria/extravio/roubo e devolução. Dá para lançar em lote nos CT-e marcados. A situação do CT-e segue a última ocorrência; apagar uma ocorrência refaz a situação.
- **Rastreio público** em `/rastreio.html` (sem login), para mandar ao cliente: consulta pela chave do CT-e ou pelo CNPJ/CPF (remetente ou destinatário) + nº da NF. Mostra só o andamento, sem valores nem observações internas; o nome de quem recebeu aparece abreviado. Limite de 30 consultas por minuto por computador.
- **Feriados:** a previsão pula sábados, domingos, os feriados nacionais (inclusive Carnaval, Sexta-feira Santa e Corpus Christi, calculados pela Páscoa) e os feriados estaduais/municipais cadastrados no botão "📅 Feriados".
- **Romaneio (aba 🚚 Romaneios):** marque os CT-e em Entregas → "Montar romaneio" (motorista, placa, veículo e a ordem de entrega). Imprime a folha com QR code do app, "Dar saída" põe todos em "Saiu para entrega" e "Fechar" (no retorno) deixa o que não foi entregue como "Voltou para a base sem entregar". Um CT-e não entra em dois romaneios abertos.
- **App do motorista** em `/motorista.html` (celular, sem login): entra com o código do romaneio (ou pelo QR code da folha), vê as entregas na ordem com mapa e telefone, e dá baixa com nome de quem recebeu, assinatura na tela, foto do canhoto (reduzida no próprio celular) e a localização (GPS). Também lança "não entregue" com o motivo. O código para de funcionar quando o romaneio é fechado; dá para trocar o código a qualquer momento. O GPS e a câmera pedem HTTPS (ou o próprio servidor na rede). **Como o celular chega ao sistema:** no Wi-Fi da empresa, `http://IP-DO-SERVIDOR:3333/motorista.html` (sem HTTPS o navegador bloqueia o GPS); na rua, o servidor precisa estar na internet com HTTPS (túnel tipo Cloudflare Tunnel, ou domínio + porta + certificado) e esse endereço informado em CT-e → Configuração → **Endereço público**: o QR code da folha e o link copiado na tela do romaneio usam esse endereço. No celular, "Adicionar à tela inicial" deixa um ícone como app.
- **Avisos ao cliente** (Configuração fiscal → Avisos de entrega): a cada ocorrência escolhida (saiu para entrega, entregue, não entregue, devolvido...), manda e-mail e/ou WhatsApp ao destinatário e a quem paga o frete, com o link de rastreio (preencha o "Endereço público"). Usa o e-mail e o celular que vieram na NF-e; WhatsApp só para celular. Cada envio (ou erro) fica registrado.
- **Agendamento de entrega:** marque no cadastro do cliente (Cadastros → Clientes) "📅 Exige agendamento da entrega" e, se quiser, "Como agendar" (e-mail, portal, antecedência). Os CT-e com esse cliente como destinatário ou local de entrega ficam no filtro **A agendar** (e na tela Hoje) até alguém clicar em 📅 e informar a data, a janela (das/até), a senha ou protocolo, a doca, com quem foi agendado e uma observação para o motorista. Agendar lança a ocorrência "Entrega agendada" (PROCEDA 91) e a previsão passa a ser a data marcada; reagendar guarda o anterior no histórico; cancelar (com motivo) apaga a ocorrência e a previsão volta à original. O agendamento aparece no romaneio (tela e folha impressa, com aviso se for de outro dia), no app do motorista (com senha e doca), no portal do cliente e no aviso por e-mail/WhatsApp (só data e janela; a senha e a doca não saem da transportadora). Filtro **Agendados** e o item "Entregas agendadas para hoje" na tela Hoje.
- **EDI:** em EDI → Com o cliente, "OCOREN das ocorrências lançadas" gera o arquivo com o que foi lançado e ainda não foi enviado.
- **Tratamento das ocorrências de problema** (aba **⚠ Em tratamento**; regras em `src/cte/tratamento.js`): toda ocorrência de tipo "problema" nasce **aberta**, com prazo (2 dias não entregue, 3 recusa, 7 sinistro), culpa provável (cliente, empresa, motorista, parceiro, terceiros) e a justificativa (obrigatória ao lançar à mão). Responsável (assumir/repassar), situação (em tratamento, aguardando terceiro), prazo, comentários, **várias fotos** (`cte_ocorrencia_fotos`, até 10 no lançamento e 6 pelo app do motorista), e o encerramento com solução, descrição, prejuízo e culpa definida; dá para reabrir. Entrega ou devolução do CT-e encerra sozinha os "não entregue" e as recusas. Histórico de cada passo em `cte_ocorrencia_historico`. Nova ocorrência **Falta de volumes** (com a quantidade; no OCOREN vai como 81, extravio parcial). Culpa do cliente ou de terceiros não conta no desempenho dos parceiros. **Relatório** por tipo, culpa, responsável, solução, cliente e parceiro (tempo médio, vencidas, prejuízo) com Excel. A tela Hoje avisa prazos vencidos e ocorrências sem responsável.

## Rastreamento pelas transportadoras (embarcador)

A Data da Entrega das notas é preenchida sozinha todo dia às 6h30 e pelo botão em **Entregas previstas**, sem mexer na data lançada à mão:
- **SSW** (pela chave da NF-e), para as transportadoras marcadas "Rastreamento pela SSW".
- **Portais próprios**, no cadastro da transportadora em **Portal de rastreamento** (senha criptografada, botão **Testar conexão**):
  - **Lonngren** (Andrade e Abreu / ATA): link de login, empresa, usuário e senha.
  - **Central de Canhotos (LD Rio Pizzo)**: só o e-mail e a senha do site. Lê as notas do portal e casa pela chave da NF-e ou pelo nº da NF + data (`src/rastreioLdrio.js`). Se o formato do portal mudar, o teste mostra as colunas que vieram.
- **EDI OCOREN** e **Comprovante de Entrega da SEFAZ**.

## CNPJ/CPF em todos os cadastros

- **Ao digitar o CNPJ**, o cadastro se preenche com os dados da Receita: razão social, nome fantasia, IE (quando o serviço informa), logradouro, número, complemento, bairro, cidade com o **código IBGE**, UF, CEP, telefone e e-mail — só nos campos vazios (o que já foi digitado fica). Vale em: transportadora, empresa, configuração fiscal (emitente, seguradora, responsável técnico), CT-e (remetente, destinatário, expedidor, recebedor, tomador, CT-e anterior), NFS-e, coleta, cotação, vendedor, contas a pagar, acerto de viagem, MDF-e (seguradora, contratante, proprietário do veículo), posto e oficina, régua, tabela de preço e licença.
- A consulta é do servidor (`GET /api/cnpj/:cnpj`, `src/cnpjConsulta.js`): BrasilAPI, depois CNPJ.ws, depois ReceitaWS, guardada 30 dias. CNPJ com dígito verificador errado é avisado na hora (e a consulta sugere o certo).
- **Máscara** enquanto digita (`00.000.000/0000-00` e `000.000.000-00`), aviso de CPF/CNPJ inválido e suporte ao **CNPJ alfanumérico** (a partir de 07/2026, ex.: `12.ABC.345/01DE-35`; os serviços públicos ainda não o consultam, então os dados vão à mão). O servidor grava só os caracteres do documento: no CNPJ alfanumérico, letras maiúsculas e números (regra única em `backend/src/utils/documento.js`, usada em transportadora, empresa, configuração do CT-e, NFS-e, vendedor, contas a pagar, acerto, frota e tabela de preço); a consulta `/api/cnpj` responde com aviso amigável para esse CNPJ, sem chamar os serviços.
- Os documentos aparecem formatados nas telas (`Doc.formatar` em `public/js/documento.js`).

## Integração com ERP (API v1 e webhooks)

**🛠 Manutenção → 🔗 Integrações** (menu Configuração → Integrações, código **904**, só administrador; `#mnAbaIntegracoes`, abas `data-mn-aba` em `public/dashboard.html`). A aba junta NF-Stock, API/webhooks, modelos de planilha, leitura e envio de e-mail, WhatsApp, pasta de XML, planilha automática do ERP e IA; o quadro "Outras integrações" (`public/js/integracao.js`, lista `OUTRAS`) leva às que ficam na tela do assunto. No servidor, `PUT /api/faturamento/boleto/config`, `PUT /api/contabil/dfe/config` e a `portal_senha` das transportadoras passaram a exigir administrador (as demais configurações de integração já exigiam):

- **NF-Stock (Alterdata)** (`src/integracao/nfstock.js`, rotas `/api/integracao/nfstock*`, tabelas `configuracao_nfstock`, `nfstock_docs`, `nfstock_envios`):
  - *Buscar* (MS-Exportação): `GET {base}/api/v1/{codigoCrm 6 dígitos}/{cnpj}/documentos/{nsu}/novos?Tamanho=50&Xml=true` com `Authorization: Bearer <token>`; repete enquanto vier página cheia e guarda o último NSU. Início: `nsu_inicial` (grava `estado.ult_nsu`; 0 = desde o começo) e `buscar_desde` (pula, sem gravar, os documentos com `data_emissao` em Brasília antes da data; páginas só de antigos não contam no limite de 40 por busca, até 400). O `xml` pode vir em texto, base64, gzip ou .zip; sem ele, baixa pela `url_download`. Roteamento: NF-e da própria empresa → `importarXmlInterno` (fretes); NF-e de outro emitente → `dfe.processarDoc` (NF-e contra o CNPJ); CT-e de terceiro → `importarXmlInterno` (CT-e recebidos); CT-e próprio e NFS-e → só registro; eventos por último.
  - *Enviar* (MS-Importação): CT-e, eventos do CT-e, MDF-e e NFS-e autorizados em produção desde `enviar_desde` entram na fila (`nfstock_envios`, `ref` único); `POST /storage {size, extension}` → `PUT` do XML na `url` assinada (1 min, sem `Content-Type`) → `GET /storage/arquivo/{id}`: `Uploaded` = importado, `Com Erro` = recusado (com o `log`). Falha de conexão tenta de novo até 6 vezes (15 min × tentativas).
  - Bases: produção `ms-exportacao-nfstock.pack.alterdata.com.br` e `ms-importacao-service-nfstock.alterdatasoftware.com.br`; desenvolvimento `ms-exportacao.dev.pack.alterdata.com.br`; ambiente `simulador` responde no próprio servidor. Token criptografado (`criptografar` do certificado), nunca devolvido. Agendador a cada 5 min (busca no intervalo configurado). Tela Hoje (admin): envios recusados ou sem conexão.

- **Chaves de API:** uma por sistema (ex.: "ERP Bapx"), com o que pode fazer: *Consultar* (CT-e, entregas, faturas) e/ou *Enviar NF-e*. A chave aparece uma vez só, ao criar (o banco guarda só o SHA-256); dá para revogar a qualquer momento. Mostra o último uso e o IP.
- **API** (`/api/v1`, cabeçalho `Authorization: Bearer nxf_...`, 120 chamadas/min por chave):
  - `GET /status` · `GET /ctes?alterado_desde=ISO&limite=100` (paginação por `proxima`) · `GET /ctes/<chave>` · `GET /ctes/<chave>/xml` · `GET /entregas?desde=&ate=` · `GET /faturas?alterado_desde=&status=` · `GET /faturas/<id>`
  - `POST /nfe` `{"xml": "..."}` ou `{"xmls": [...]}`: cada NF-e destinada à transportadora vira **rascunho de CT-e** (mesmo caminho da importação por e-mail).
- **Webhooks (avisos automáticos):** o Nexofrete faz POST no endereço do ERP quando o **CT-e é autorizado/cancelado/substituído**, a **entrega é registrada** e a **fatura é criada/paga/cancelada**. Os eventos vêm de gatilhos no banco (pegam a mudança venha de onde vier), saem com a assinatura `X-Nexofrete-Assinatura: t=<unix>,v1=<HMAC-SHA256>` e, sem resposta 2xx, são reenviados em 1 min, 5 min, 15 min, 1 h, 3 h, 6 h, 12 h e 24 h. Botões para testar, reenviar e gerar novo segredo.
- **Segurança:** webhook só para `https://` e endereço público (localhost, rede interna e 169.254.x são recusados, também na hora da conexão). Para um ERP instalado na rede da empresa, ligue `WEBHOOK_REDE_INTERNA=1` no servidor.
- A tela traz as instruções prontas para copiar e mandar ao fornecedor do ERP.
- **Modelos de planilha (ERP que só troca planilha)** — cada empresa com o seu ERP:
  - *Importação:* sobe uma planilha de exemplo do ERP (.xlsx, .xls ou .csv com `;` ou `,`, UTF-8 ou ANSI), o Nexofrete sugere qual coluna é qual pelo nome (pedido, NF, chave, cliente, CNPJ, cidade, peso, volumes, valor, CIF/FOB, cancelado…) e a pessoa confere. "Usar na importação" faz a importação manual e a automática (pela pasta) lerem por esse modelo; sem nº de pedido, a NF identifica a linha. Na tela de upload dá para escolher o modelo na hora. Planilha de outro ERP no formato padrão avisa que falta um modelo.
  - *Exportação:* CT-e emitidos, notas e fretes (custo do frete por nota) ou faturas do período, com as colunas, títulos e ordem que o ERP espera; CSV (separador e decimal à escolha) ou Excel. Célula que parece fórmula vira texto.

## EDI (PROCEDA 3.1)

Menu **🔁 EDI**: os arquivos texto que embarcadores e transportadoras trocam, no layout PROCEDA (NOTFIS 3.1, CONEMB 3.1, OCOREN 3.1 e DOCCOB 3.0A — não existe DOCCOB 3.1; depois da 3.0A vem a 5.0).

- **Com a transportadora (embarcador):** gera o **NOTFIS** das notas de uma transportadora num período (a partir dos XML das NF-e) e lê o que ela devolve: **CONEMB** (confere cada CT-e com a tabela e mostra os que ainda não mandaram o XML), **OCOREN** (grava a Data da Entrega das notas entregues, só onde ainda não há data; origem "EDI") e **DOCCOB** (abre a Conferência de Fatura já preenchida com número, vencimento, valor e os CT-e).
- **Com o cliente (transportadora):** lê o **NOTFIS** do cliente e cria rascunhos de CT-e (um por destinatário; a chave da NF-e vem do arquivo ou de um XML já importado) e gera, dos CT-e autorizados, o **CONEMB** (com chave e protocolo do CT-e), o **OCOREN** (ocorrência escolhida por CT-e) e o **DOCCOB** (fatura com banco, agência e conta).
- **Dos parceiros (transportadora, redespacho):** lê os arquivos da transportadora parceira para quem as cargas foram repassadas (parceiro achado pelo CNPJ; CT-e pelas notas, com preferência ao repassado a ele): **OCOREN** lança as ocorrências e entregas nos nossos CT-e (origem "EDI", cliente avisado; repetidas e notas de outros ficam de fora), **CONEMB** confere o valor do CT-e do parceiro com o custo previsto e ajusta o custo, **DOCCOB** fecha os custos da fatura num acerto do parceiro (diferença como ajuste) e cria a conta a pagar (Frete de terceiro). Código em `backend/src/ediParceiros.js`.

- **Recebidos automaticamente** (`src/ediEntrada.js`, tabela `edi_recebidos`, rotas `/api/edi/recebidos*`, aba 📬 da tela EDI): os anexos EDI dos e-mails (`caixaEmail.processarMensagem`, qualquer finalidade menos SAC; finalidade `edi` = caixa só para isso) entram por `receber()`: hash do conteúdo (nunca duas vezes), lado pelo CNPJ do cabeçalho (`parceiros` → parceiro; senão embarcador; NOTFIS → cliente). OCOREN aplicado na hora (`ediParceiros.aplicarOcoren` ou data de entrega nas notas via `lerEmbarcador`, agora exportado de `routes/edi.js`); CONEMB/DOCCOB/NOTFIS ficam `aguardando` — **Conferir** reabre o arquivo no passo a passo manual (input com arquivo "virtual"). Tela Hoje: `edi_recebidos`.

- **EDI por SFTP / FTP** (`src/ediConexoes.js`, tabelas `edi_conexoes` e `edi_conexao_vistos`, rotas `/api/edi/conexoes*` só admin, quadro em Manutenção » Integrações): `ssh2-sftp-client` (SFTP, senha ou chave privada) e `basic-ftp` 6.x (FTP/FTPS); lista a pasta (filtro `*.txt; OCO*`), baixa cada arquivo (até 30 MB, 200 por rodada) para `ediEntrada.receber` e depois move para a pasta de processados (com data no nome), apaga ou guarda em `edi_conexao_vistos` (nome+tamanho+data) para não baixar de novo. Agendador a cada 5 min respeitando o intervalo de cada conexão; protocolo `simulador` com OCOREN/CONEMB de exemplo. Senha/chave com `criptografar`, nunca devolvidas.

Cada parceiro às vezes muda um campo ou outro do padrão: se ele mandar o manual dele, o layout fica em `backend/src/edi/arquivos.js` (uma linha por registro, com os tamanhos).

## Emissão de CT-e (para transportadoras)

Para a transportadora que usa o Nexofrete, tudo fica no menu **🚛 Operação de Transporte**. Os submenus são CT-e, MDF-e, Ocorrências de entrega, Romaneios, EDI, Veículos e motoristas e Configuração fiscal (esta só para o administrador).

O submenu **📄 CT-e** monta, transmite e imprime o CT-e (modelo 57, modal rodoviário, versão 4.00).

**Modo demonstração (para apresentar e treinar sem certificado):** em Configuração fiscal → Ambiente, escolha **Demonstração (simulada)**, salve e clique em **🧪 Gerar certificado de demonstração**. A SEFAZ passa a ser simulada dentro do próprio servidor: emite, imprime o DACTE (com a tarja "DEMONSTRAÇÃO — NÃO ENVIADO À SEFAZ"), consulta, cancela e faz carta de correção, sem internet. A assinatura digital, a chave de acesso e o ambiente são conferidos de verdade; nada é enviado e nada tem valor fiscal. Para emitir de verdade, envie o certificado A1 (.pfx) da empresa e troque o ambiente para Homologação — o certificado de demonstração é recusado fora desse modo, e os CT-e de demonstração ficam marcados na lista.

**Antes de emitir (administrador), em Emissão de CT-e → ⚙️ Configuração fiscal:**

1. Preencha os dados da empresa. O botão **Preencher pelo CNPJ** busca razão social, endereço e código IBGE do município.
2. Informe o **RNTRC** (ANTT), o regime tributário, a série e o próximo número do CT-e.
3. Envie o **certificado digital A1** (.pfx) com a senha. Ele fica guardado criptografado.
4. Clique em **Testar conexão com a SEFAZ**. O retorno esperado é "107 - Serviço em Operação".
5. Comece em **Homologação** (testes, sem valor fiscal). Quando os testes derem certo, mude para **Produção**.

**No dia a dia** (quem tem a permissão "Emitir CT-e"):

1. Clique em **+ Novo CT-e** e em **📄 Ler XML da NF-e**. Isso preenche remetente, destinatário, peso, volumes, valor da carga e o início e fim da prestação.
2. Lance os componentes do frete, à mão ou com **🧮 Calcular pela tabela**. Para usar a tabela, cadastre a própria empresa em Cadastros → Transportadoras, com a tabela de preço dela.
3. Confira o ICMS. O sistema sugere o CFOP e a alíquota interestadual (7% ou 12%) e avisa casos especiais.
4. **Salvar e transmitir**. Se autorizado, o DACTE abre para imprimir.

**NF-e dos clientes viram rascunho de CT-e sozinhas.** Há dois jeitos de fazer:
- **Pelo e-mail:** em Manutenção → Leitura automática de e-mail, cadastre a caixa que recebe as notas dos clientes (por exemplo nfe@suaempresa.com.br, pasta INBOX) e escolha "NF-e dos clientes viram rascunho de CT-e". A caixa é lida no intervalo configurado, ou na hora pelo botão **📥 Buscar NF-e no e-mail**.
- **Pelos arquivos:** em **📄 Importar NF-e**, escolha vários XML ou ZIP.
- **Pela SEFAZ:** em **📡 NF-e da SEFAZ**, as NF-e em que a empresa é a transportadora, buscadas em Fiscal e contabilidade → NF-e contra o CNPJ (Distribuição DF-e), viram rascunhos de CT-e (marque quais). Com "NF-e em que somos a transportadora vira rascunho de CT-e sozinha", a busca automática já gera os rascunhos; o rascunho aparece com o selo "📡 veio da SEFAZ". A tela Hoje avisa as NF-e de carga sem CT-e.

O que o sistema faz com cada nota:
- Notas do mesmo remetente para o mesmo destino, no mesmo e-mail, viram um CT-e só.
- O rascunho já sai com:
  - remetente e destinatário;
  - tomador CIF/FOB pela nota;
  - início e fim da prestação, com o local de entrega da nota;
  - CFOP e ICMS (alíquota interna ou 7%/12%);
  - carga somada;
  - frete pela tabela de preço da própria empresa, quando cadastrada.
- Não viram CT-e:
  - notas de outra transportadora;
  - notas sem frete (modFrete 9);
  - notas que já estão em CT-e;
  - e-mails já lidos.
- Na lista, o rascunho aparece com "✉ chegou por e-mail" e os avisos do que conferir.

Depois de autorizado, também dá para baixar o XML, consultar na SEFAZ, registrar carta de correção e cancelar com justificativa. Se a SEFAZ rejeitar, o motivo aparece na lista: corrija e transmita de novo, que o número continua o mesmo. Se a SEFAZ não responder, **Tentar de novo** consulta primeiro, para não emitir o mesmo CT-e duas vezes.

**Redespacho, subcontratação e expedidor/recebedor:** no formulário, escolha o **tipo de serviço**. No redespacho, clique em **📄 Ler XML do CT-e anterior** e escolha o CT-e da transportadora que contratou. O sistema preenche o documento anterior, o remetente, o destinatário, as NF-e, a carga e o expedidor, e a prestação passa a começar no expedidor. Assim o ICMS sai pela UF certa: por exemplo, um redespacho a partir de Guarulhos/SP. O tomador pode ser o expedidor ou o recebedor. No redespacho intermediário, só são obrigatórios o expedidor e o recebedor.

**CT-e complementar e de substituição** (botões na lista, em CT-e autorizado):
- **➕ Complementar** cobra um valor a mais, como estadia, reentrega ou diferença de frete. Ele usa os mesmos participantes do original e você lança só os componentes e o ICMS do valor extra. Cada CT-e aceita até 10 complementares. O complementar não entra no acompanhamento de entregas nem no MDF-e.
- **♻ Substituir** corrige valores, impostos, carga ou o tomador de um CT-e autorizado há até 60 dias. Antes, o tomador precisa registrar na SEFAZ o evento "Prestação do serviço em desacordo". Quando o substituto é autorizado, o original fica como "Substituído" e as ocorrências e o romaneio passam para o substituto.

**Contingência (SEFAZ fora do ar):** em Configuração fiscal → Contingência, marque **Contingência ligada** e escreva o motivo. Os CT-e passam a ser autorizados pela SEFAZ Virtual de Contingência da UF: SVC-RS para SP, MS, MT, PE, AP e RR, e SVC-SP para as demais. O DACTE sai marcado "emitido em contingência". Desligue assim que a SEFAZ voltar. O CT-e de substituição não pode ser emitido em contingência.

**Situação da SEFAZ** (`src/sefazServicos.js`, `/api/sefaz/status`): a cada 15 min, `statusServico` da SEFAZ da UF e da SVC, gravado em `sefaz_status` (7 dias). Duas falhas seguidas = fora do ar: aviso na tela Hoje (`sefaz_status`) com a sugestão de ligar a contingência, e outro quando a SEFAZ volta com a contingência ligada. Em Configuração fiscal, o quadro Contingência mostra as últimas verificações e o botão Verificar agora.

**IE na SEFAZ** (`/api/sefaz/cadastro?doc=&uf=&ie=`): Consulta Cadastro (`CadConsultaCadastro4`, NF-e 4.00) na UF; endereços próprios de BA, GO, MG, MS, MT, PE, PR, RS e SP, e SVRS para as demais (a UF que não oferece o serviço volta "indisponível"). Resultado guardado 24 h em `sefaz_cadastros`. Usada no cadastro do cliente (botão 🔎 SEFAZ, com "Usar a IE ...") e na emissão do CT-e (aviso quando a IE do tomador está não habilitada ou não confere).

Se um CT-e foi enviado à SEFAZ de origem, ficou sem resposta e depois foi reemitido na contingência, a lista mostra **⚠ Chave pendente**. Quando a SEFAZ voltar e a contingência for desligada, clique nesse aviso. Se a origem também tiver autorizado aquela chave, o sistema oferece cancelá-la.

O CT-e 4.00 não tem mais inutilização de numeração nem CT-e de anulação: a SEFAZ eliminou os dois nessa versão. No lugar da anulação, use o evento de desacordo seguido do CT-e de substituição.

**Averbação do seguro de carga:** configure em Configuração fiscal → Seguro da carga e averbação:
- a averbadora: AT&M (usuário, senha e código AT&M) ou Porto Seguro/AverbePorto (usuário e senha);
- a seguradora, o CNPJ dela e a apólice.

Com a averbação automática ligada:
- cada CT-e autorizado é averbado na hora, e o protocolo e o número aparecem na lista (🛡);
- o MDF-e é declarado à averbadora;
- cancelamentos e encerramentos também são enviados à averbadora;
- o MDF-e montado dos CT-e já sai com a seguradora, a apólice e os números de averbação.

Se a averbadora estiver fora do ar ou recusar, a lista mostra o motivo. Use **🛡 Averbar**, no CT-e, ou **🛡 Averbar pendentes**, que tenta de novo os CT-e dos últimos 30 dias. A senha fica criptografada no banco.

Algumas observações:
- CT-e de homologação volta da AT&M com protocolo "TESTE".
- No modo demonstração, a averbação é simulada.
- Desligue a averbação automática se o seguro da carga for do embarcador.

Testes automáticos do CT-e: `npm test` dentro de `backend`. A validação nos schemas oficiais precisa do `xmllint`.

## MDF-e (manifesto da viagem)

Em **🚛 Operação de Transporte → 📋 MDF-e**, o sistema emite o MDF-e (modelo 58, rodoviário, versão 3.00) na SEFAZ Virtual do RS (SVRS), que autoriza o MDF-e de todos os estados. Ele usa o mesmo certificado e o mesmo ambiente do CT-e, inclusive o modo demonstração. A série e o próximo número ficam em Configuração fiscal.

1. Cadastre os caminhões, as carretas e os motoristas em **🚛 Veículos e motoristas**: placa, RENAVAM, tara, capacidade, tipo de rodado e carroceria, CPF e CNH. Para veículo de agregado ou TAC, informe também os dados do proprietário.
2. Monte o MDF-e de um destes jeitos:
   - Em **+ MDF-e dos CT-e autorizados**, marque os CT-e da viagem.
   - Num romaneio (Operação de Transporte → Romaneios), clique em **📋 Emitir MDF-e**. Ele já traz o veículo e o motorista do romaneio.

   Sai um MDF-e por UF de descarregamento. O sistema sugere as UFs do percurso e soma o valor e o peso da carga.
3. Confira o veículo, a carreta, os motoristas, o seguro (seguradora, apólice e averbação) e, se houver, o CIOT, o vale-pedágio e o contratante. Depois clique em **Salvar e transmitir**. O DAMDFE abre para imprimir e vai com o motorista.
4. No fim da viagem, clique em **🏁 Encerrar**. Enquanto houver MDF-e aberto para a placa, a SEFAZ recusa outro (rejeição 686). O botão **Não encerrados na SEFAZ** mostra o que ficou aberto.

Com o MDF-e autorizado, também dá para **incluir motorista** (troca durante a viagem), consultar e cancelar. O cancelamento só vale antes de o caminhão sair; depois disso, encerre.

**🛡 Gerenciamento de risco (GR).** Na lista de MDF-e, *🛡 Gerenciamento de risco* configura a gerenciadora (**Buonny, Telerisco, Opentech, Tecnorisk** ou **Simulador**), as credenciais (senha criptografada) e as regras da apólice: validade da liberação (dias), limite de valor por veículo e valores que exigem rastreador, escolta e SM; e se a pendência só avisa ou **impede a transmissão** do MDF-e.
- Liberação de motorista (CPF) e veículo (placa): **Consultar na GR** ou **Registrar à mão** (resultado, protocolo, validade) a consulta feita no site da GR. Situação na coluna **GR** de Veículos e motoristas e no MDF-e.
- Rastreador (tecnologia e ID) no cadastro do veículo.
- No MDF-e, o quadro **Gerenciamento de risco** confere tudo para o valor da carga, marca a escolta e envia/cancela a **SM** (só com motorista e veículo liberados).
- Tabelas `gr_consultas` e `gr_sm`; código em `src/gr/` (`provedores.js`: uma interface por gerenciadora). As gerenciadoras reais aguardam o manual da API e as credenciais do contrato.

## Painel gerencial

Fica em **🚛 Operação de Transporte → 📊 Painel gerencial**. Acessa quem emite CT-e ou tem a permissão do Financeiro ou de Relatórios.

- **Visão geral do período:** este mês, mês passado, 3 meses, ano, 12 meses ou datas à escolha. O painel compara com o período anterior de mesmo tamanho e mostra:
  - faturamento;
  - CT-e emitidos e peso transportado;
  - frete por kg e ticket médio por CT-e;
  - frete sobre o valor da mercadoria;
  - entregas no prazo;
  - quanto há a receber.

  O CT-e complementar soma no faturamento, mas não conta como carga nova.
- **Faturamento por mês:** cobre os últimos 12 meses, mostra os números ao passar o mouse e tem versão em tabela.
- **Clientes e rotas:** mostra faturamento, CT-e, peso, frete por kg e % de entregas no prazo de cada cliente e de cada rota (origem → destino).
- **Resultado por viagem:** cada MDF-e soma a receita dos CT-e que leva. Em **Lançar custos** você informa combustível, pedágio, motorista, terceiro/agregado e outros. O painel mostra a margem da viagem e marca ⚠ prejuízo quando ela é negativa.

## Faturamento e contas a receber

Fica em **🚛 Operação de Transporte → 🧾 Faturamento / 📈 Contas a receber**. Acessa quem emite CT-e ou tem a permissão do Financeiro.

1. **⚙️ Cobrança (PIX e banco):** cadastre a chave PIX da empresa, a cidade, os dados bancários para depósito, o prazo padrão de vencimento e as instruções do rodapé (multa e juros, por exemplo).
2. **➕ A faturar:** mostra os CT-e autorizados que ainda não estão em fatura, separados por cliente (quem paga o frete). Há dois jeitos de faturar:
   - marcar os CT-e e clicar em **Gerar fatura dos marcados**;
   - clicar em **Faturar tudo**, que gera uma fatura por cliente com o período inteiro.

   O sistema não deixa um CT-e entrar em duas faturas, nem misturar clientes na mesma fatura.
3. **🧾 Faturas:** na fatura dá para:
   - imprimir;
   - **enviar por e-mail**: a fatura vai no corpo do e-mail e anexada, com o QR Code do PIX;
   - copiar o PIX copia e cola;
   - baixar o **DOCCOB** (EDI);
   - prorrogar o vencimento;
   - **dar baixa**: o recebimento pode ser parcial, lançado em várias vezes, e um valor acima do saldo entra como juros/multa;
   - estornar um recebimento;
   - cancelar a fatura (só sem recebimentos), e os CT-e voltam para "A faturar".
- **PIX com baixa automática (API Pix do banco, padrão Bacen):** em ⚙️ Cobrança, ligue a API com a URL da API, a URL do token (OAuth2 client_credentials), client_id, client_secret, certificado .pfx (mTLS, gravado em `dados/pix-certificado.pfx`) e parâmetro extra (ex.: `gw-dev-app-key`). A fatura passa a sair com cobrança **dinâmica** (`PUT /v2/cobv/{txid}` com vencimento, multa e juros, ou `/v2/cob/{txid}`); saldo ou vencimento mudou → a antiga é retirada (`PATCH status=REMOVIDA_PELO_USUARIO_RECEBEDOR`) e outra é criada. A baixa sai pela conferência de 5 em 5 minutos (`GET /v2/pix`) e pelo webhook `POST /api/pix/webhook` (só gatilho: cada txid é consultado na API antes de baixar). Um PIX baixa uma vez só (`origem_chave = pix:<endToEndId>`). Banco fora do ar → PIX estático. **Simulador** com "Simular pagamento do PIX". Código em `src/faturamento/pixApi.js`; tabela `pix_cobrancas`.
4. **📈 Contas a receber:** mostra o total a receber, o vencido, o que vence em 7 dias, o recebido no mês e o que falta faturar. Também separa por tempo de atraso e lista os clientes que mais devem.
5. **➕ Serviços extras** (código **104**): cobrança de reentrega, devolução, estadia, armazenagem e descarga.
   - **⚙ Preços:** padrão da empresa e por cliente (quem paga o frete): % do frete, valor fixo, R$ por hora/dia depois da franquia ou % da mercadoria por dia, com mínimo. Valor zero não cobra.
   - **Sozinho:** ocorrência de entrega não feita por motivo do cliente (fechado, ausente, horário, reentrega pedida, balanço, endereço, mudou) → reentrega pendente; "Devolvido ao remetente" → devolução pendente; botão **📍 Cheguei** no app do motorista + baixa → estadia pendente com as horas acima da franquia. Falha da transportadora não gera cobrança.
   - **Aprovar** (ajustando valor/horas) ou cancelar com motivo; **Gerar CT-e complementar / NFS-e** das aprovadas: um CT-e complementar por CT-e com um componente por serviço (REENTREGA, DEVOLUCAO, ESTADIA, DESCARGA) e o ICMS na alíquota do original; armazenagem em NFS-e (cTribNac 11.04.01). Os documentos saem como rascunho; documento excluído/cancelado/rejeitado → "Reabrir". A tela Hoje avisa o que está para aprovar e para cobrar. Código em `src/servicosExtras.js`.

O QR Code é o **PIX estático do Banco Central** (BR Code). Ele já vem com o valor do saldo e a identificação da fatura (FAT + número), funciona em qualquer banco e não precisa de contrato nem integração. O recebimento pelo PIX é conferido no extrato (Caixa e bancos → Conciliação) ou baixado aqui. Para boleto registrado, veja "Boleto registrado (CNAB 240)".

## Notas fiscais (embarcador)

Em **Documentos → 🧾 Notas fiscais** (código **403**). Regras em `src/notasFiscais.js`, DANFE em `src/danfe.js`, rotas em `/api/notas`.

- **Dados completos da nota**, lidos do XML na importação (e do XML guardado nas notas antigas, ao ligar o sistema — `nf_dados_em` marca as já lidas): série, emitente (nome e CNPJ), valor dos produtos, peso bruto e líquido separados, data/hora de saída e endereço de entrega (`entrega_endereco`, com o grupo `<entrega>` quando a nota tem local de entrega diferente).
- **Consulta** com filtros (número, chave, cliente, pedido, emitente, destinatário, série, cidade, UF, período por emissão ou saída, situação) e totais; **Excel**; **XML** da nota e **.zip** dos XML filtrados (`GET /api/notas/zip`).
- **DANFE** (`GET /api/notas/:id/danfe`): HTML A4 retrato a partir do XML — emitente, chave com código de barras Code 128, protocolo, destinatário, local de entrega, duplicatas, cálculo do imposto, transportador/volumes, itens e dados adicionais —, para imprimir ou salvar em PDF.
- **DANFE em lote** (`GET /api/notas/danfes?ids=…` ou com os filtros da tela, até 300): uma página com um DANFE por folha (`danfeLote` em `src/danfe.js`, quebra de página entre as notas) para imprimir ou salvar tudo num PDF; nota cancelada com a marca CANCELADA.
- **Eventos da nota** (`GET /api/notas/:id/eventos` e `/:id/eventos/:ev/xml`): os XML de evento guardados em `documento_eventos` (cancelamento, Carta de Correção, Comprovante de Entrega), no detalhe da nota.
- **Denegação**: `protNFe` com cStat 110/301/302/303 no XML ou no recibo da SEFAZ importado marca `nf_denegada` (e `nf_cancelada`, para o frete se comportar como nota cancelada); o DANFE sai com a marca "USO DENEGADO".

## CT-e recebidos (embarcador)

Em **Documentos → 🚛 CT-e recebidos** (código **404**). Regras em `src/ctesRecebidos.js`, rotas em `/api/ctes-recebidos`, tela em `public/js/ctesRecebidos.js`.

- **📡 CT-e na SEFAZ** (`src/sefazServicos.js`, rotas `/api/sefaz/ctes`): distribuição DF-e do CT-e no Ambiente Nacional (`CTeDistribuicaoDFe`, `cteDistDFeInteresse`, por NSU), com o certificado A1 e o ambiente da Configuração fiscal. Cada `procCTe` entra por `importarXmlInterno` (o mesmo caminho do XML enviado à mão); os `procEventoCTe` vêm depois dos CT-e do lote. CT-e emitido pelo próprio CNPJ fica de fora. Cada documento fica registrado em `cte_dist_docs` (resultado e mensagem); o NSU e a próxima consulta em `empresa.cte_dist_estado`. Regra da SEFAZ: com 137 (nada novo) ou 656, só 1 hora depois. Busca automática (`cte_dist_config.ativo`) a cada hora; no modo demonstração, simulada.

- **Dados completos do CT-e**, lidos do XML (`parseCTe` em `src/utils/xmlParser.js`) e gravados em colunas próprias: série, remetente e destinatário (nome e CNPJ/CPF), municípios de origem e destino, modal (`cte_modal`: 01 rodoviário … 06 multimodal), CFOP, ICMS (CST, base, alíquota e valor — também ICMSOutraUF, ICMS60 e Simples Nacional) e protocolo. Os CT-e antigos são lidos do XML guardado ao ligar o sistema e ao abrir a tela (`cte_dados_em`; o gatilho `trg_fretes_cte_reler` limpa a marca quando o XML do CT-e muda).
- **Consulta** com filtros (número/chave/NF/pedido, transportadora, tomador, remetente, destinatário, município e UF de origem e destino, modal, tipo de serviço, CFOP, período, situação — os cancelados também aparecem) e totais de frete e ICMS; **Excel**; **XML** do CT-e e **.zip** dos filtrados com os XML dos eventos (`GET /api/ctes-recebidos/zip`).
- **DACTE** do CT-e recebido (`GET /api/ctes-recebidos/:id/dacte`): o mesmo desenho do DACTE emitido (`src/cte/dacte.js`, agora com o modal do XML), montado a partir do XML; tarja CANCELADO no CT-e cancelado.
- **Eventos guardados** (`documento_eventos`): todo XML de evento importado (Carta de Correção, Cancelamento, Comprovante de Entrega...) fica guardado uma vez só (hash), mesmo antes de o documento chegar. Aparecem no histórico do frete (`GET /api/fretes/:id/historico`) com download (`GET /api/ctes-recebidos/:id/eventos/:ev/xml`). A Carta de Correção do CT-e mostra os campos corrigidos (`infCorrecao`) e o protocolo do retorno da SEFAZ.

## Auditoria de frete em detalhe (embarcador)

Regras em `src/auditoriaDetalhada.js`. Além do total do CT-e × tabela (conferência automática, `trg_calcular_dif_frete`):

- **Componentes lado a lado** (`GET /api/fretes/:id/auditoria-detalhada`, no detalhe do frete): frete peso, ad valorem, GRIS, pedágio, TDE, TDA, TRT, despacho e descarga — o nome livre de cada componente do CT-e (`vPrest/Comp/xNome`) é classificado e comparado com a parcela gravada no cálculo (`auditoria_calculo.componentes`), com a tolerância da auditoria. **Taxa não prevista**: cobrada no CT-e e zero/ausente na tabela.
- **Cobrado a mais** = soma das parcelas acima da tabela, limitada ao excesso do total do CT-e sobre o total da tabela (parcelas trocadas com o total certo não contam).
- **Peso e volumes** do CT-e (`infQ` 01/02 e 03) × os das notas (inclui as cobertas pelo mesmo CT-e).
- **ICMS**: base (vTPrest com redução), alíquota pela rota (`icmsCte.conferirIcms`), valor (base × alíquota) e CFOP (5xxx no estado, 6xxx entre estados).
- **Histórico do frete** (`GET /api/fretes/:id/historico`): importação, cálculo, liberação/aprovação/reprovação, glosa, cancelamento, registro de atividades (`auditoria.registro_id`), fatura e pagamento.
- Os apontamentos entram no relatório **Auditoria de Frete** e no relatório **Cobranças indevidas** (Auditoria de fretes → Auditoria de frete → 💸 Cobranças indevidas, código **323**, `GET /api/fretes/relatorios/cobrancas-indevidas`): cobrado a mais por componente, transportadora e mês, com Excel.

## NF-e × CT-e (embarcador)

Regras em `src/nfeCte.js`, rotas em `src/routes/nfeCte.js` (`/api/nfe-cte`), tela em **Documentos → 🔗 NF-e × CT-e → Inconsistências e vínculos** (322).

- **Vinculação:** pela chave da NF-e citada no CT-e (infDoc); sem ela, pedido, número da NF dentro da chave (posições 26–34) ou das observações. CT-e que chega antes da nota é juntado quando a nota chega.
- **Um CT-e para várias notas:** o CT-e fica no registro de uma nota e as outras citadas ficam **cobertas** (`fretes.cte_coberto_por`, com o número do CT-e); nenhuma fica "aguardando CT-e". O frete é **rateado** (`fretes.frete_rateado`) pelo peso, senão pelo valor, senão em partes iguais. A conferência pela tabela soma peso, volumes, cubagem e valor de todas as notas. A data de entrega do CT-e passa para as cobertas (gatilho `trg_nf_entrega_notas_cobertas`). Nota que chega depois é coberta na reconciliação após cada importação.
- **Conferência campo a campo** (CT-e × notas dele): valor da mercadoria (`vCarga`, tolerância 0,5% ou R$ 1), peso (5% ou 1 kg), destinatário (CNPJ) e cidade/UF de destino (`xMunFim`/`UFFim`; com redespacho, vale a cidade do redespacho na 1ª perna).
- **Lista única de inconsistências:** nota sem CT-e há N dias, CT-e sem nota, valor, peso, destinatário e cidade diferentes (vínculo suspeito), transportadora diferente, CT-e cancelado cobrado e cobrança em dobro; **aceitar** com motivo (`nfe_cte_aceites`) e Excel.
- **Religar / desligar:** passa o CT-e para a nota certa (candidatas: as citadas e as sem CT-e do mesmo destinatário) ou tira da nota (vira CT-e sem nota); CT-e em fatura não muda. O desligamento fica em `nfe_cte_desvinculos` e a reconciliação não religa sozinha.
- **Pesquisa** por número da NF, do CT-e ou chave: cada CT-e com todas as notas (valor, peso, parte do frete, entrega) e os CT-e a mais da nota.

## Faturas das transportadoras (embarcador)

Em **Auditoria de Frete → 🧾 Conferir Fatura** (código 330). Regras em `src/faturasFrete.js`, rotas em `src/routes/faturas.js`.

- **Importação:** DOCCOB (EDI) ou **planilha** (Excel/CSV, vários arquivos de uma vez) com coluna CT-e ou Chave (e Valor): escolhe a transportadora, marca os CT-e, preenche número, vencimento e valor, e avisa valor cobrado diferente do CT-e, **cobrança repetida** (no arquivo ou CT-e já em outra fatura), CT-e cancelado e não encontrado (`POST /api/faturas/importar`).
- **Associação e conferência:** marcar ou colar os CT-e; tabela × CT-e × fatura, glosas, parecer e documento com código de verificação. Mesma fatura duas vezes e CT-e em duas faturas são barrados.
- **Situação:** Conferida → Aprovada → Liberada p/ pagamento → Paga (`faturas_frete.situacao`). Conferida com ressalvas já nasce **Bloqueada** (bloqueio automático); bloquear à mão pede motivo e desbloquear pede justificativa. Fatura bloqueada não é aprovada, liberada nem paga; o pagamento só entra na liberada.
- **Aprovação com alçada:** `configuracao_auditoria.limite_alcada_fatura` ("Alçada da fatura" nas configurações da auditoria): acima dele, só quem tem "Aprovar valores altos".
- **Vencimentos:** aba com vencidas, hoje, 7 dias, depois e sem vencimento (só não pagas). **CT-e não faturados:** aba por transportadora com os dias desde a emissão (+30, +60).
- **Histórico:** `faturas_frete_historico` guarda cada passo (quem, quando, motivo/justificativa); botão 🕘 Histórico na fatura.
- **Visão geral:** avisa faturas vencidas, vencendo, bloqueadas, aguardando aprovação/liberação e CT-e há mais de 30 dias sem fatura.

## Indicadores (Relatórios)

Em **Gestão e relatórios → 📊 Painel de indicadores → Fretes contratados (KPIs)** (código **309**), tudo numa tela, no período (emissão do CT-e) e, se quiser, de uma transportadora só:

- **Fretes:** contratados (CT-e do período, sem cancelados, não cobrados e barrados), **pagos** (CT-e de faturas com o pagamento registrado), **a pagar** (faturado e não pago, liberado sem fatura, em conferência, retido) e o % do frete sobre o valor das notas.
- **Pagamento da fatura:** em Auditoria de Frete → Conferir Fatura → Faturas conferidas, **💸 Registrar pagamento** na fatura liberada (veja "Faturas das transportadoras"). Colunas `faturas_frete.pago_em`, `valor_pago`, `pago_por`.
- **Gasto** por transportadora, cliente, **região** (Norte, Nordeste, Centro-Oeste, Sudeste, Sul), estado e mês: contratado, pago, a pagar, % sobre a NF e R$/kg.
- **Modalidade:** modal do CT-e (rodoviário, aéreo, aquaviário… lido do XML), lotação × fracionada, CIF × FOB, direta × redespacho × reentrega e tipo de serviço (normal, subcontratação, redespacho).
- **Entregas:** entregues no período, pontualidade (no prazo ÷ entregues com prazo) e atraso médio; pendentes, atrasadas, previstas para hoje e para os próximos 7 dias (situação de agora).
- **Ocorrências:** problemas do rastreio por tipo, por transportadora e por mês, reentregas, sinistros (prejuízo e ressarcido) e entregas com problema agora.
- **Economia da auditoria:** glosas + CT-e barrados (recusados, da transportadora que não levou a carga) = economizado, e o "em apuração" (o que os retidos cobram acima da tabela), por transportadora e por mês.
- **Excel e PDF:** o **⬇ Excel** do painel gera um .xlsx com uma aba por bloco; o **⬇ Excel** do alto de Relatórios exporta as tabelas e os gráficos da aba aberta (uma planilha cada) em qualquer relatório; **🖨 PDF / Imprimir** imprime ou salva em PDF. Código em `src/indicadores.js` e `public/js/indicadores.js`; a planilha sai de `POST /api/indicadores/xlsx`.

## Roteirizar entregas

Em **Gestão e relatórios → 🗺️ Roteirizar entregas**, ou pelo botão **🗺️ Roteirizar** da carga montada em "Consolidar rotas":

1. Marque as notas que vão no caminhão. Notas para o mesmo endereço viram uma parada só. Nota com redespacho para na transportadora do redespacho.
2. Informe a saída: data, hora, veículo (VUC, 3/4, toco, truck...), placa (para o rodízio), tempo de descarga e o horário em que os clientes recebem.
3. **Roteirizar** devolve:
   - a **sequência de entrega**;
   - a **distância e o tempo de cada trecho**;
   - o **horário de chegada** em cada cliente;
   - as **restrições de circulação** encontradas;
   - as **pausas e pernoites do motorista** (Lei 13.103: 30 min a cada 5h30 de direção e 11h de descanso a cada 10h de jornada).
4. Junto vem o mapa. Com as setas ↑ ↓ você muda a ordem e os horários são recalculados. Também dá para abrir no Google Maps, imprimir o roteiro e exportar para Excel.

**De onde vêm as informações:**
- **Endereço:** do cadastro do cliente ou do XML da NF-e.
- **Localização no mapa:** a rua é procurada no OpenStreetMap e fica guardada no banco. Se não for achada, a parada fica no centro da cidade e aparece marcada como aproximada.
- **Distância e tempo:** pelo OSRM (gratuito, ajustado para caminhão) ou pelo OpenRouteService (perfil caminhão; precisa de uma chave gratuita). Sem internet, o sistema estima pela distância em linha reta.
- **Restrições de circulação:** em **⚙ Restrições e mapa**. Já vêm a ZMRC e o rodízio de São Paulo como **base para conferir na CET/Prefeitura**. Cadastre as das outras cidades com dias, horários, bairros e veículos afetados.

## O que já está pronto

- Login com perfis admin (vê tudo) e cliente (vê só os registros do seu nome)
- Upload de XML de NF-e e CT-e por arraste-e-solte, com leitura automática dos campos
- Vínculo opcional por "Número do Pedido" para juntar NF-e e CT-e no mesmo registro
- Dashboard com indicadores e tabela completa com busca
- Banco de dados PostgreSQL, criado e configurado automaticamente

## Próximos passos sugeridos

- Tela de troca de senha e de cadastro de clientes dentro do próprio sistema
- Tela de edição de registro no dashboard (hoje só via API)
- Exportar para Excel/PDF
- Ajuste fino do parser de XML — se algum campo vier vazio, me envie um XML de exemplo (removendo dados sensíveis) que eu ajusto o mapeamento
