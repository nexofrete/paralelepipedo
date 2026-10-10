# TransportadoraCTe

Sistema desktop (WinForms) para transportadora, em C# para Visual Studio 2010 (.NET Framework 4.0), com banco PostgreSQL.

**Funcionalidades**

- Login com usuários e perfis: ADMIN, OPERADOR e CONSULTA. As senhas são gravadas com hash PBKDF2.
- Cadastro de clientes: pessoa jurídica ou física, validação de CNPJ/CPF, indicador de IE e endereço com código IBGE.
- Consulta automática do CNPJ: ao sair do campo CNPJ (clientes e empresa), o sistema busca razão social, endereço com código IBGE, telefone, e-mail e a **inscrição estadual** (APIs públicas CNPJá e BrasilAPI; precisa de internet).
- Cadastro da empresa emitente, com série, numeração, ambiente e certificado digital A1/A3.
- CT-e 4.00, modelo 57, modal rodoviário, transmitido direto à SEFAZ (SVRS, que atende o RJ):
  - montagem do XML, chave de acesso e assinatura digital;
  - envio síncrono, com o XML compactado em GZip;
  - consulta de situação, que recupera o protocolo se a conexão cair no meio do envio;
  - cancelamento (evento 110111, prazo de 168 h);
  - status do serviço;
  - DACTE em HTML com código de barras Code128 e QR Code, para imprimir ou salvar em PDF;
  - exportação do XML `procCTe` e do evento de cancelamento.
- Relatórios com totais, exportação para CSV/Excel e impressão:
  - CT-es por período;
  - faturamento por tomador;
  - resumo mensal;
  - fretes por rota;
  - cancelados.

---

## 1. Pré-requisitos

| Item | Observação |
|---|---|
| Visual Studio 2010 (SP1 recomendado) | Abre o `TransportadoraCTe.sln` direto |
| .NET Framework **4.5 ou superior instalado** (recomendado 4.8) | O projeto compila para 4.0, mas a SEFAZ exige **TLS 1.2**, que só existe com o 4.5+ instalado na máquina. Vale para o PC de desenvolvimento e para os PCs dos usuários. |
| PostgreSQL 9.4 ou superior | Testado no 16 |
| Npgsql **2.2.7** | Última versão que roda no .NET 4.0 (ver passo 2) |
| Certificado digital e-CNPJ A1 ou A3 | Instalado no Windows (repositório "Pessoal") |

## 2. Npgsql (driver do PostgreSQL)

1. Acesse https://www.nuget.org/packages/Npgsql/2.2.7 e clique em **Download package**.
2. Renomeie o arquivo `npgsql.2.2.7.nupkg` para `.zip` e extraia.
3. Copie `lib\net40\Npgsql.dll` e `lib\net40\Mono.Security.dll` para a pasta `lib\` desta solução.

> **Importante – autenticação:** o Npgsql 2.2.7 não suporta `scram-sha-256`, que é o padrão do PostgreSQL 14+. Configure o usuário do banco com **md5**:
>
> 1. No `postgresql.conf`: `password_encryption = md5`
> 2. No `pg_hba.conf`, troque `scram-sha-256` por `md5` nas linhas usadas pelo sistema.
> 3. Reinicie o serviço do PostgreSQL e **redefina a senha** para ela ser regravada em md5:
>    ```sql
>    ALTER USER postgres PASSWORD 'sua_senha';
>    ```
>
> Se aparecer o erro *"Only AuthenticationClearTextPassword and AuthenticationMD5Password supported"*, é exatamente isso.

## 3. Banco de dados

```sql
CREATE DATABASE transportadora ENCODING 'UTF8';
```

Conecte no banco `transportadora` (pgAdmin ou psql) e execute `database\schema.sql`.

Usuário inicial: **admin**, senha **admin**. Troque em *Sistema > Trocar minha senha*.

## 4. Compilar e executar

1. Abra `TransportadoraCTe.sln` no Visual Studio 2010.
2. Ajuste a conexão em `src\TransportadoraCTe\App.config`, ou depois pelo botão **Conexão...** na tela de login.
3. Pressione **F5**.

As telas podem ser editadas no designer do Visual Studio: dê dois cliques no formulário na Solution Explorer (ou **Shift+F7**). O layout fica no arquivo `.Designer.cs` de cada tela; a lógica fica no `.cs` (**F7**).

## 5. Primeiro uso

1. **Cadastros > Empresa e certificado**:
   - preencha CNPJ, IE, RNTRC, endereço com o código IBGE do município (Rio de Janeiro = 3304557) e o regime tributário;
   - deixe o ambiente em **Homologação**;
   - clique em **Selecionar...** e escolha o certificado da empresa;
   - clique em **Testar SEFAZ**. Deve retornar `107 - Serviço em Operação`.
2. **Cadastros > Clientes**: cadastre remetentes e destinatários.
3. **CT-e > Novo CT-e** (F3):
   - escolha remetente, destinatário e tomador. O percurso e o CFOP (5xxx ou 6xxx, 5357/6357 para não contribuinte) são sugeridos;
   - informe os valores, o ICMS, a carga e as chaves das NF-e;
   - clique em **Salvar e enviar à SEFAZ**.
4. Quando autorizado, o sistema oferece o DACTE. Em **CT-e > Gerenciar CT-es** (F4) você consulta, cancela, reimprime e salva o XML.
5. Depois de validar tudo em homologação:
   - mude o ambiente para **Produção**;
   - confira a série e o próximo número.

> Em homologação, o sistema troca automaticamente o nome do remetente e do destinatário por `CTE EMITIDO EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL`, como a SEFAZ exige.

## 6. Estrutura

```
TransportadoraCTe.sln
database\schema.sql            tabelas: usuarios, empresa, clientes, ctes, sefaz_log
lib\                           Npgsql.dll + Mono.Security.dll (passo 2)
src\TransportadoraCTe\
  App.config                   conexao e URLs da SEFAZ
  Program.cs                   inicializacao + Sessao (usuario logado)
  Infra\                       Db (acesso ao Postgres), Util (CNPJ/CPF, formatos), Seguranca (hash)
  Modelos\                     Usuario, Empresa, Cliente, Cte
  Repositorios\                SQL de cada tabela + relatorios
  CTe\
    ChaveAcesso.cs             chave de 44 digitos e DV modulo 11
    CteXml.cs                  XML do CT-e 4.00, status, consulta e cancelamento
    Assinador.cs               XMLDSig RSA-SHA1 / C14N
    Certificado.cs             selecao do certificado no Windows
    SefazWs.cs                 SOAP 1.2, TLS 1.2, GZip/Base64
    CteServico.cs              regras: emitir, consultar, cancelar, validar
    Dacte.cs, CodigosBarras.cs DACTE em HTML, Code128 e QR Code
  Telas\                       formularios WinForms (FrmX.cs = logica, FrmX.Designer.cs = layout)
```

## 7. Outras UFs

Por padrão, o sistema usa os webservices da **SVRS**. Ela autoriza o CT-e do RJ e da maioria dos estados.

Empresas de **MG, MS, MT, PR ou SP** usam a SEFAZ própria. Nesse caso, descomente as chaves `CTe.{Servico}.{Ambiente}` no `App.config` e informe as URLs do estado, que estão no Portal do CT-e.

## 8. Limitações desta versão

- Atende só o CT-e normal, modal rodoviário, sem expedidor/recebedor. Também não há CT-e complementar, de substituição, CC-e (carta de correção), EPEC/contingência nem MDF-e.
- O ICMS cobre os CSTs 00, 40, 41, 51 e 90, além do Simples Nacional. Ainda não há CST 20 (redução de base) nem ICMS para outra UF.
- Se o certificado do servidor da SEFAZ for recusado, instale a cadeia ICP-Brasil no Windows. A chave `CTe.IgnorarErroCertificadoServidor` serve **somente para testes**.
- O DACTE é um layout simplificado com os campos obrigatórios. Confira com a sua contabilidade antes de usar em produção.
