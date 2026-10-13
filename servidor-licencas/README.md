# Servidor de licenças do Nexofrete

Pequeno servidor que as instalações com licença **conferida pela internet** consultam a cada 6 horas. Por ele você **bloqueia, desbloqueia e renova** clientes sem mandar chave nova.

- Sem dependências: só precisa do Node 18 ou mais novo. Guarda tudo em `dados/licencas.json`.
- **Não vai para o cliente.** Fica fora da pasta `sistema-frete` e roda num servidor seu na internet.

## O que você precisa

1. **A chave privada do servidor** (`servidor-chave-privada.pem`). É diferente da chave do licenciador. A chave pública dela já está dentro do sistema e é com ela que o sistema confere que a resposta veio deste servidor. **Não perca e não divulgue.** Sem ela o servidor não sobe, e quem a tiver consegue se passar pelo seu servidor.
2. **Uma senha para o painel** (12 caracteres ou mais).
3. **Um endereço com HTTPS** (ex.: `https://licencas.seudominio.com.br`). O emissor de chaves só aceita `https://`.

## Variáveis de ambiente

| Variável | O que é |
|---|---|
| `ADMIN_SENHA` | Senha do painel (usuário: `admin`). Obrigatória. |
| `CHAVE_PRIVADA_SERVIDOR` | Conteúdo do `servidor-chave-privada.pem` (pode colar com as quebras de linha ou com `\n`). |
| `CHAVE_PRIVADA_SERVIDOR_ARQUIVO` | Ou: o caminho do arquivo .pem. |
| `PORT` | Porta (padrão 8080). |
| `DADOS_DIR` | Onde guardar `licencas.json` (padrão `./dados`). Use um disco persistente. |
| `CONFIAR_PROXY` | `1` quando roda atrás de proxy ou HTTPS de plataforma (Render, Railway, Nginx), para registrar o IP real. |

## Colocar no ar

**Render / Railway (mais fácil):** crie um serviço a partir desta pasta (tem `Dockerfile`), configure as variáveis acima e um **disco persistente** montado em `/dados`. A plataforma já dá o HTTPS.

**VPS com Docker:**
```
docker build -t nexofrete-licencas .
docker run -d --restart=always -p 8080:8080 -v licencas:/dados \
  -e ADMIN_SENHA='sua-senha-forte' \
  -e CHAVE_PRIVADA_SERVIDOR="$(cat servidor-chave-privada.pem)" \
  nexofrete-licencas
```
Ponha um Nginx/Caddy na frente para o HTTPS.

**Sem Docker:** `ADMIN_SENHA=... CHAVE_PRIVADA_SERVIDOR_ARQUIVO=/caminho/servidor-chave-privada.pem node servidor.js`

Para testar: `https://seu-endereco/saude` deve responder `{"ok":true}`.

## Usar

1. No seu Nexofrete (computador do licenciador), em **Manutenção → Licença**, marque **Conferir pela internet** ao gerar a chave e informe o endereço do servidor.
2. Quando o sistema do cliente conferir pela primeira vez, a licença aparece no painel (`https://seu-endereco/`). Se quiser, cole a chave no painel para cadastrá-la antes.
3. No painel:
   - **Bloquear:** escreva a mensagem que aparece para o cliente. O sistema dele fica só para consulta.
   - **Desbloquear:** o sistema volta ao normal.
   - **Salvar validade / Sem vencimento:** renova sem chave nova.
   - **Anotação:** só você vê.

   Também mostra a última conferência, a versão e o IP. Destaca quem está há 3 dias ou mais sem conferir.
4. O cliente recebe a mudança na próxima conferência (até 6 horas). Para ser na hora, ele clica em **Conferir agora** em Manutenção → Licença.

Faça backup de `dados/licencas.json` de vez em quando (os bloqueios e renovações ficam nele). Se ele se perder, as licenças voltam a aparecer como ativas, com a validade original da chave, na próxima conferência.

## Testes

`npm test`
