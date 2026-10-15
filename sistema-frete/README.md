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

## Criar login para os clientes e funcionários

Agora isso é feito direto pela tela: logado como administrador, vá em **Usuários → + Novo usuário**. Você escolhe o tipo:

- **Cliente**: só vê os próprios registros (informe o nome do cliente exatamente como aparece na coluna "Cliente")
- **Usuário interno**: você escolhe manualmente o que essa pessoa pode fazer (ver todos os registros, enviar XML, editar, excluir, gerenciar outros usuários)
- **Administrador**: acesso total (só o admin pode criar outro admin)

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
- **Financeiro:** faturas em que ele é o pagador, com a fatura impressa, o **boleto** e a linha digitável para copiar.
- **Coletas:** pede coleta. Ela cai em Coletas com o canal "🌐 Portal" e ele acompanha a situação.
- **Cotações:** pede cotação e aprova ou recusa pelo portal.
  - Com a **cotação automática** ligada (⚙ Configurar), o preço da tabela sai na hora.
  - Desligada, o pedido aparece em Cotações, filtro **"🌐 Do portal"**. A equipe clica em **Calcular o preço**, salva, e a cotação fica para o cliente aprovar.

**Para o cliente acessar de fora da empresa**, o servidor precisa estar publicado na internet com HTTPS (domínio próprio ou redirecionamento de porta + certificado). Informe esse endereço em **⚙ Configurar**. Com ele:
- o sistema manda o acesso por e-mail;
- o cliente recupera a senha sozinho ("Esqueci a senha", com link que vale 1 hora).

CT-e de demonstração só aparecem no portal enquanto a empresa está no modo demonstração.

## Contas a pagar e acerto de viagem

Em **Operação de Transporte → Contas a pagar / Acerto de viagem**:

**Contas a pagar** (quem tem permissão de financeiro):
- Lance qualquer saída: combustível, pedágio, manutenção, pneus, salários, impostos, aluguel...
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
- **App do motorista** em `/motorista.html` (celular, sem login): entra com o código do romaneio (ou pelo QR code da folha), vê as entregas na ordem com mapa e telefone, e dá baixa com nome de quem recebeu, assinatura na tela, foto do canhoto (reduzida no próprio celular) e a localização (GPS). Também lança "não entregue" com o motivo. O código para de funcionar quando o romaneio é fechado; dá para trocar o código a qualquer momento. O GPS e a câmera pedem HTTPS (ou o próprio servidor na rede).
- **Avisos ao cliente** (Configuração fiscal → Avisos de entrega): a cada ocorrência escolhida (saiu para entrega, entregue, não entregue, devolvido...), manda e-mail e/ou WhatsApp ao destinatário e a quem paga o frete, com o link de rastreio (preencha o "Endereço público"). Usa o e-mail e o celular que vieram na NF-e; WhatsApp só para celular. Cada envio (ou erro) fica registrado.
- **EDI:** em EDI → Com o cliente, "OCOREN das ocorrências lançadas" gera o arquivo com o que foi lançado e ainda não foi enviado.

## EDI (PROCEDA 3.1)

Menu **🔁 EDI**: os arquivos texto que embarcadores e transportadoras trocam, no layout PROCEDA (NOTFIS 3.1, CONEMB 3.1, OCOREN 3.1 e DOCCOB 3.0A — não existe DOCCOB 3.1; depois da 3.0A vem a 5.0).

- **Com a transportadora (embarcador):** gera o **NOTFIS** das notas de uma transportadora num período (a partir dos XML das NF-e) e lê o que ela devolve: **CONEMB** (confere cada CT-e com a tabela e mostra os que ainda não mandaram o XML), **OCOREN** (grava a Data da Entrega das notas entregues, só onde ainda não há data; origem "EDI") e **DOCCOB** (abre a Conferência de Fatura já preenchida com número, vencimento, valor e os CT-e).
- **Com o cliente (transportadora):** lê o **NOTFIS** do cliente e cria rascunhos de CT-e (um por destinatário; a chave da NF-e vem do arquivo ou de um XML já importado) e gera, dos CT-e autorizados, o **CONEMB** (com chave e protocolo do CT-e), o **OCOREN** (ocorrência escolhida por CT-e) e o **DOCCOB** (fatura com banco, agência e conta).

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
4. **📈 Contas a receber:** mostra o total a receber, o vencido, o que vence em 7 dias, o recebido no mês e o que falta faturar. Também separa por tempo de atraso e lista os clientes que mais devem.

O QR Code é o **PIX estático do Banco Central** (BR Code). Ele já vem com o valor do saldo e a identificação da fatura (FAT + número), funciona em qualquer banco e não precisa de contrato nem integração. O recebimento é conferido no extrato e baixado aqui. O boleto registrado precisa de convênio com o banco e ainda não faz parte.

## Roteirizar entregas

Em **Relatórios → 🗺️ Roteirizar entregas**, ou pelo botão **🗺️ Roteirizar** da carga montada em "Consolidar rotas":

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
