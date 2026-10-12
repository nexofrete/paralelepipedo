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
