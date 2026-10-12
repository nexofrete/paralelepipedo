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

## Criar login para os clientes e funcionários

Agora isso é feito direto pela tela: logado como administrador, vá em **Usuários → + Novo usuário**. Você escolhe o tipo:

- **Cliente**: só vê os próprios registros (informe o nome do cliente exatamente como aparece na coluna "Cliente")
- **Usuário interno**: você escolhe manualmente o que essa pessoa pode fazer (ver todos os registros, enviar XML, editar, excluir, gerenciar outros usuários)
- **Administrador**: acesso total (só o admin pode criar outro admin)

## Importar vários XML de uma vez

Na aba "Enviar XML" tem um botão **"Selecionar uma pasta inteira"** — escolha a pasta onde estão os XMLs de NF-e/CT-e e o sistema importa todos automaticamente, sem precisar clicar arquivo por arquivo.

## Ocorrências de entrega (estilo SSW)

Menu **📍 Ocorrências de entrega** (quem emite CT-e): acompanha cada CT-e autorizado até a entrega.

- **Previsão de entrega** automática na autorização: prazo da tabela de preço da própria empresa para a cidade de destino, ou o "Prazo de entrega padrão" da Configuração fiscal (3 dias úteis se vazio), contando só dias úteis.
- **Painel** com contadores (em aberto, atrasados, previsão hoje, com ocorrência, entregues hoje, % no prazo) e filtros, busca por CT-e, NF, chave, cliente ou cidade.
- **Lançar ocorrência** (códigos PROCEDA): coletado, chegada na filial, saiu para entrega, agendada (com nova data), entregue (com quem recebeu, documento e foto do canhoto/PDF), não entregue (fechado, ausente, endereço...), recusa, avaria/extravio/roubo e devolução. Dá para lançar em lote nos CT-e marcados. A situação do CT-e segue a última ocorrência; apagar uma ocorrência refaz a situação.
- **Rastreio público** em `/rastreio.html` (sem login), para mandar ao cliente: consulta pela chave do CT-e ou pelo CNPJ/CPF (remetente ou destinatário) + nº da NF. Mostra só o andamento, sem valores nem observações internas; o nome de quem recebeu aparece abreviado. Limite de 30 consultas por minuto por computador.
- **EDI:** em EDI → Com o cliente, "OCOREN das ocorrências lançadas" gera o arquivo com o que foi lançado e ainda não foi enviado.

## EDI (PROCEDA 3.1)

Menu **🔁 EDI**: os arquivos texto que embarcadores e transportadoras trocam, no layout PROCEDA (NOTFIS 3.1, CONEMB 3.1, OCOREN 3.1 e DOCCOB 3.0A — não existe DOCCOB 3.1; depois da 3.0A vem a 5.0).

- **Com a transportadora (embarcador):** gera o **NOTFIS** das notas de uma transportadora num período (a partir dos XML das NF-e) e lê o que ela devolve: **CONEMB** (confere cada CT-e com a tabela e mostra os que ainda não mandaram o XML), **OCOREN** (grava a Data da Entrega das notas entregues, só onde ainda não há data; origem "EDI") e **DOCCOB** (abre a Conferência de Fatura já preenchida com número, vencimento, valor e os CT-e).
- **Com o cliente (transportadora):** lê o **NOTFIS** do cliente e cria rascunhos de CT-e (um por destinatário; a chave da NF-e vem do arquivo ou de um XML já importado) e gera, dos CT-e autorizados, o **CONEMB** (com chave e protocolo do CT-e), o **OCOREN** (ocorrência escolhida por CT-e) e o **DOCCOB** (fatura com banco, agência e conta).

Cada parceiro às vezes muda um campo ou outro do padrão: se ele mandar o manual dele, o layout fica em `backend/src/edi/arquivos.js` (uma linha por registro, com os tamanhos).

## Emissão de CT-e (para transportadoras)

Para a transportadora que usa o Nexofrete, o menu **🚛 Emissão de CT-e** monta, transmite e imprime o CT-e (modelo 57, modal rodoviário, versão 4.00).

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

Depois de autorizado, também dá para baixar o XML, consultar na SEFAZ, registrar carta de correção e cancelar com justificativa. Se a SEFAZ rejeitar, o motivo aparece na lista: corrija e transmita de novo, que o número continua o mesmo. Se a SEFAZ não responder, **Tentar de novo** consulta primeiro, para não emitir o mesmo CT-e duas vezes.

Ainda não fazem parte: MDF-e, CT-e complementar/substituto/anulação, expedidor e recebedor, inutilização de numeração e emissão em contingência.

Testes automáticos do CT-e: `npm test` dentro de `backend`. A validação nos schemas oficiais precisa do `xmllint`.

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
