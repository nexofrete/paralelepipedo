const express = require('express');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const db = require('./src/db');
const authRoutes = require('./src/routes/auth');
const uploadRoutes = require('./src/routes/upload');
const recordsRoutes = require('./src/routes/records');
const auditoriaRoutes = require('./src/routes/auditoria');
const transportadorasRoutes = require('./src/routes/transportadoras');
const empresaRoutes = require('./src/routes/empresa');
const tabelasPrecoRoutes = require('./src/routes/tabelasPreco');
const manutencaoRoutes = require('./src/routes/manutencao');
const avisosRoutes = require('./src/routes/avisos');
const mensagensRoutes = require('./src/routes/mensagens');
const importacaoErpRoutes = require('./src/routes/importacaoErp');
const trocasRoutes = require('./src/routes/trocas');
const clientesRoutes = require('./src/routes/clientes');
const sobreRoutes = require('./src/routes/sobre');
const comprovantesRoutes = require('./src/routes/comprovantes');
const localidadesRoutes = require('./src/routes/localidades');
const segurancaRoutes = require('./src/routes/seguranca');
const emailRoutes = require('./src/routes/email');
const auditoriaConfigRoutes = require('./src/routes/auditoriaConfig');
const backup = require('./src/backup');
const importacaoErp = require('./src/importacaoErp');
const arquivarLogsAuditoria = require('./src/arquivarLogsAuditoria');
const resumoSemanal = require('./src/resumoSemanal');
const canhotoRoutes = require('./src/routes/canhoto');
const whatsappRoutes = require('./src/routes/whatsapp');
const alertaWhatsapp = require('./src/alertaWhatsapp');
const notificacoesRoutes = require('./src/routes/notificacoes');
const metasFreteRoutes = require('./src/routes/metasFrete');
const sinistrosRoutes = require('./src/routes/sinistros');
const faturasRoutes = require('./src/routes/faturas');
const agendaRoutes = require('./src/routes/agenda');
const pastaXmlRoutes = require('./src/routes/pastaXml');
const cteEmissaoRoutes = require('./src/routes/cteEmissao');
const roteirizacaoRoutes = require('./src/routes/roteirizacao');
const ediRoutes = require('./src/routes/edi');
const ocorrenciasRoutes = require('./src/routes/ocorrencias');
const rastreioRoutes = require('./src/routes/rastreio');
const romaneiosRoutes = require('./src/routes/romaneios').router;
const motoristaRoutes = require('./src/routes/motorista');
const coletasRoutes = require('./src/routes/coletas');
const cotacoesRoutes = require('./src/routes/cotacoes');
const conferenciasRoutes = require('./src/routes/conferencias');
const unidadesRoutes = require('./src/routes/unidades');
const contasPagarRoutes = require('./src/routes/contasPagar');
const mdfeRoutes = require('./src/routes/mdfe');
const agenda = require('./src/agenda');
const garantirAdminPadrao = require('./src/criarAdminPadrao');
const pkg = require('./package.json');

const app = express();
// Atrás de proxy/túnel (portal publicado na internet): TRUST_PROXY=1 faz os limites de tentativas valerem por cliente, não pelo proxy.
if (process.env.TRUST_PROXY) app.set('trust proxy', /^\d+$/.test(process.env.TRUST_PROXY) ? Number(process.env.TRUST_PROXY) : process.env.TRUST_PROXY);

// Cabeçalhos de segurança HTTP padrão (protege contra alguns ataques comuns
// de navegador, como clickjacking e sniffing de tipo de arquivo).
// CSP fica desligado porque o sistema usa onclick="" inline nas telas —
// ativar o CSP padrão quebraria a interface inteira.
// Cabeçalhos de segurança. CSP: só scripts do próprio sistema (nenhum de fora),
// e a página só conversa com o próprio servidor (+ BrasilAPI, consulta de CNPJ)
// — mesmo que um script malicioso escapasse, não teria pra onde mandar dados.
// Os "onclick" das telas continuam permitidos (script-src-attr).
// HSTS desligado: ele valeria pro IP inteiro, inclusive a porta HTTP 3333.
app.use(helmet({
  hsts: false,
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      // As imagens do mapa da roteirização passam pelo próprio servidor (/api/roteirizacao/mapa).
      imgSrc: ["'self'", 'data:', 'blob:'],
      fontSrc: ["'self'", 'data:'],
      connectSrc: ["'self'", 'https://brasilapi.com.br'],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'self'"],
    },
  },
}));

// Com o HTTPS ligado, quem abrir as telas pelo endereço http:// é levado pro
// https:// (a API e o ping continuam respondendo nos dois).
app.use((req, res, next) => {
  const h = require('./src/servidorHttps').status();
  if (h.ativo && !req.secure && req.method === 'GET'
      && (req.path === '/' || (req.path.endsWith('.html') && req.path !== '/abrindo-nexofrete.html'))) {
    return res.redirect(302, `https://${req.hostname}:${h.porta}${req.originalUrl}`);
  }
  next();
});

// Certificado da empresa (público) e o instalador dele, pra cada computador.
app.get('/certificado-empresa.crt', (req, res) => {
  res.set({ 'Content-Type': 'application/x-x509-ca-cert', 'Content-Disposition': 'attachment; filename="nexofrete-certificado-empresa.crt"' });
  res.send(require('./src/servidorHttps').certificadoDaEmpresa());
});
app.get('/instalar-certificado-nexofrete.bat', (req, res) => {
  // O instalador já vem com a "impressão digital" esperada. Ele baixa o
  // certificado, calcula a impressão digital do que chegou e SÓ instala se for
  // igual — se alguém trocar o certificado no caminho, a instalação é cancelada.
  // Também mostra o começo do código, pra conferir com a tela do servidor.
  const httpsMod = require('./src/servidorHttps');
  httpsMod.certificadoDaEmpresa();                       // garante que existe
  const esperado = String(httpsMod.impressaoDigital() || '').replace(/:/g, '').toUpperCase();
  const curto = esperado.slice(0, 16).replace(/(..)(?=.)/g, '$1:');
  const base = `http://${req.hostname}:${PORT}`;
  const ps = [
    "$p=[IO.Path]::Combine($env:TEMP,'nexofrete-ac.crt')",
    `Invoke-WebRequest -UseBasicParsing -Uri '${base}/certificado-empresa.crt' -OutFile $p`,
    '$c=New-Object System.Security.Cryptography.X509Certificates.X509Certificate2($p)',
    "$h=[BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash($c.RawData)).Replace('-','')",
    "Write-Host ('Impressao digital recebida: ' + (($h.Substring(0,16) -split '(..)' | Where-Object {$_}) -join ':'))",
    `if ($h -ne '${esperado}') { Write-Host ''; Write-Host 'ATENCAO: o certificado recebido NAO e o do servidor do Nexofrete.'; Write-Host 'A instalacao foi CANCELADA. Avise o responsavel pelo sistema.'; exit 2 }`,
  ].join('; ');
  const bat = [
    '@echo off',
    'echo ============================================',
    'echo   Nexofrete - instalar o certificado da empresa',
    'echo ============================================',
    'echo.',
    `echo Impressao digital esperada:   ${curto}`,
    'echo (confira se e a mesma que aparece na tela do servidor / em Manutencao)',
    'echo.',
    `powershell -NoProfile -ExecutionPolicy Bypass -Command "${ps}"`,
    'if errorlevel 1 (echo. & echo Nada foi instalado. & pause & exit /b 1)',
    'echo.',
    'echo Conferido. O Windows vai perguntar se voce confia no certificado: clique em SIM.',
    'certutil -user -addstore Root "%TEMP%\\nexofrete-ac.crt"',
    'if errorlevel 1 (echo O certificado NAO foi instalado. & pause & exit /b 1)',
    'del "%TEMP%\\nexofrete-ac.crt" >nul 2>&1',
    'echo.',
    'echo Pronto! Feche e abra o navegador e use o endereco https:// do Nexofrete.',
    'pause',
  ].join('\r\n');
  res.set({ 'Content-Type': 'application/octet-stream', 'Content-Disposition': 'attachment; filename="instalar-certificado-nexofrete.bat"' });
  res.send(bat);
});

// Não uso CORS aberto de propósito: o sistema inteiro (páginas + API) roda
// na mesma origem (mesmo endereço:porta), então navegadores normais nunca
// precisam de CORS pra acessar a API. Deixar isso fechado impede que outros
// sites, se abertos no mesmo navegador de alguém logado, consigam chamar a
// API do sistema por fora.

// Limita tentativas de login: no máximo 15 tentativas a cada 15 minutos por
// computador, pra dificultar um ataque de força bruta na senha.
const limitadorLogin = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { erro: 'Muitas tentativas de login. Aguarde alguns minutos e tente de novo.' },
});
app.use('/api/auth/login', limitadorLogin);
// Rastreio público (sem login): no máximo 30 consultas por minuto por computador.
// App do motorista (entra com o código do romaneio): 120 pedidos por minuto por celular.
app.use('/api/motorista', rateLimit({ windowMs: 60 * 1000, max: 120, standardHeaders: true, legacyHeaders: false,
  message: { erro: 'Muitos pedidos seguidos. Aguarde um minuto.' } }));
app.use('/api/rastreio', rateLimit({ windowMs: 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false,
  message: { erro: 'Muitas consultas seguidas. Aguarde um minuto e tente de novo.' } }));

// XML de NF-e lido na emissão de CT-e pode passar do limite padrão (100 KB).
app.use('/api/cte-emissao/ler-nfe', express.json({ limit: '5mb' }));
app.use('/api/cte-emissao/importar-nfe', express.json({ limit: '40mb' }));
// Arquivos EDI (NOTFIS/CONEMB/...) vêm como texto no corpo e podem passar de 1 MB.
app.use('/api/edi', express.json({ limit: '10mb' }));
// API para ERP: NF-e em XML no corpo.
app.use('/api/v1/nfe', express.json({ limit: '10mb' }));
app.use(express.json());

// Licença: sem ativação (ou cópia em outro computador) o sistema não funciona;
// licença vencida deixa só consultar (GET), sem emitir nem alterar nada.
const licenca = require('./src/licenca');
// Entrar e trocar a senha no portal do cliente continuam valendo com a licença vencida.
const PORTAL_LIVRE = ['/portal/entrar', '/portal/esqueci', '/portal/redefinir', '/portal/senha'];
app.use('/api/licenca', require('./src/routes/licenca'));
app.use('/api', (req, res, next) => {
  if (req.path === '/status') return next();
  const e = licenca.estado();
  if (!e.ativo) return res.status(423).json({ erro: e.mensagem, licenca: true, situacao: e.situacao });
  if (!e.emissao && !['GET', 'HEAD', 'OPTIONS'].includes(req.method) && !req.path.startsWith('/auth/') && !PORTAL_LIVRE.includes(req.path)) {
    return res.status(423).json({ erro: e.mensagem, licenca: true, situacao: e.situacao });
  }
  return next();
});
app.use('/api/auth', authRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/fretes', recordsRoutes);
app.use('/api/fretes', canhotoRoutes);
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/auditoria', auditoriaRoutes);
app.use('/api/transportadoras', transportadorasRoutes);
app.use('/api/empresa', empresaRoutes);
app.use('/api/tabelas-preco', tabelasPrecoRoutes);
app.use('/api/manutencao', manutencaoRoutes);
app.use('/api/avisos', avisosRoutes);
app.use('/api/mensagens', mensagensRoutes);
app.use('/api/importacao-erp', importacaoErpRoutes);
app.use('/api/trocas', trocasRoutes);
app.use('/api/clientes', clientesRoutes);
app.use('/api/sobre', sobreRoutes);
app.use('/api/comprovantes', comprovantesRoutes);
app.use('/api/localidades', localidadesRoutes);
app.use('/api/seguranca', segurancaRoutes);
app.use('/api/email', emailRoutes);
app.use('/api/auditoria-config', auditoriaConfigRoutes);
app.use('/api/notificacoes', notificacoesRoutes);
app.use('/api/metas-frete', metasFreteRoutes);
app.use('/api/sinistros', sinistrosRoutes);
app.use('/api/faturas', faturasRoutes);
app.use('/api/agenda', agendaRoutes);
app.use('/api/pasta-xml', pastaXmlRoutes);
app.use('/api/cte-emissao', cteEmissaoRoutes);
app.use('/api/roteirizacao', roteirizacaoRoutes);
app.use('/api/edi', ediRoutes);
app.use('/api/ocorrencias', ocorrenciasRoutes);
app.use('/api/rastreio', rastreioRoutes);
app.use('/api/romaneios', romaneiosRoutes);
app.use('/api/motorista', motoristaRoutes);
app.use('/api/coletas', coletasRoutes);
app.use('/api/cotacoes', cotacoesRoutes);
app.use('/api/etiquetas', conferenciasRoutes.etiquetas);
app.use('/api/conferencias', conferenciasRoutes.conferencias);
app.use('/api/unidades', unidadesRoutes.unidades);
app.use('/api/transferencias', unidadesRoutes.transferencias);
app.use('/api/contas-pagar', contasPagarRoutes.contasPagar);
app.use('/api/acertos', contasPagarRoutes.acertos);
app.use('/api/mdfe', mdfeRoutes);
app.use('/api/nfse', require('./src/routes/nfse'));
app.use('/api/contabil', require('./src/routes/contabil'));
app.use('/api/bancos', require('./src/routes/bancos'));
app.use('/api/hoje', require('./src/routes/hoje'));
app.use('/api/regua', require('./src/routes/regua'));
app.use('/api/comissoes', require('./src/routes/comissoes'));
app.use('/api/centros-custo', require('./src/routes/centrosCusto'));
app.use('/api/frota', require('./src/routes/frota'));
app.use('/api/faturamento', require('./src/routes/faturamento'));
app.use('/api/integracao', require('./src/routes/integracao'));
app.use('/api/v1', require('./src/routes/apiV1'));
app.use('/api/painel-transporte', require('./src/routes/painelTransporte'));
// Portal do cliente (login próprio) e a administração dos acessos.
app.use('/api/portal', require('./src/routes/portal').api);
app.use('/api/portal-acessos', require('./src/routes/portal').admin);

// Carimbo do pacote (data/hora em que foi gerado): todos os pacotes de uma versão
// em desenvolvimento têm o mesmo número — o carimbo mostra QUAL está rodando.
function carimboDoPacote() {
  try {
    const p = JSON.parse(require('fs').readFileSync(require('path').join(__dirname, 'pacote.json'), 'utf8'));
    return p.gerado_em || null;
  } catch { return null; }
}
const CARIMBO_PACOTE = carimboDoPacote();
const textoCarimbo = (iso) => (iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }).replace(',', '') : null);
app.get('/api/status', (req, res) => {
  res.json({ ok: true, mensagem: 'API do sistema de fretes está no ar.', versao: pkg.version, pacote: textoCarimbo(CARIMBO_PACOTE),
    ambienteTeste: process.env.AMBIENTE_TESTE === 'sim' });
});

// Serve as páginas web (login, dashboard, css, js) da pasta public.
// "Estou no ar": a tela de abertura do atalho (que roda do próprio computador)
// fica tentando carregar esta imagenzinha até o servidor responder.
const PIXEL_GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
app.get('/ping.gif', (req, res) => {
  res.set({ 'Content-Type': 'image/gif', 'Cache-Control': 'no-store', 'Cross-Origin-Resource-Policy': 'cross-origin' });
  res.send(PIXEL_GIF);
});

// Instalador do atalho pra cada computador da rede: usa o endereço exato
// (IP:porta) que a pessoa usou pra abrir o sistema.
const { gerarInstalador } = require('./src/atalhoWindows');
app.get('/instalar-atalho-nexofrete.bat', (req, res) => {
  const host = String(req.headers.host || `localhost:${process.env.PORT || 3333}`).replace(/[^\w.:\-\[\]]/g, '');
  const teste = process.env.AMBIENTE_TESTE === 'sim';
  // Atalho aponta primeiro pro NOME do computador servidor (não muda quando o
  // IP muda) e, de reserva, pro endereço que foi usado agora.
  const porta = host.includes(':') ? host.split(':').pop() : (process.env.PORT || 3333);
  const nomeServidor = require('os').hostname().replace(/[^\w.-]/g, '');
  const enderecos = [...new Set([nomeServidor ? `http://${nomeServidor}:${porta}` : null, `http://${host}`].filter(Boolean))];
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="instalar-atalho-nexofrete${teste ? '-teste' : ''}.bat"`);
  res.send(gerarInstalador({ endereco: `http://${host}`, enderecos, teste }));
});

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.redirect('/login.html');
});

const PORT = process.env.PORT || 3333;

async function iniciar() {
  try {
    console.log('Conectando ao PostgreSQL e preparando o banco de dados...');
    await db.inicializarBanco();
    await garantirAdminPadrao();
    await backup.reagendarTarefa();
    await importacaoErp.reagendarMonitor();
    arquivarLogsAuditoria.agendarArquivamentoDiario();
    resumoSemanal.agendarResumoSemanal();
    alertaWhatsapp.agendarAlertaDiario();
    require('./src/rastreioSsw').agendarConsultaDiaria();
    agenda.agendarLembretes();
    require('./src/pastaXml').agendar();
    require('./src/caixaEmail').agendar();
    require('./src/contabil').agendar();
    require('./src/faturamento/regua').agendar();
    require('./src/integracao/webhooks').agendar();
    require('./src/avisosSeguranca').iniciar();
    licenca.agendarConferencia();
    require('./src/unidades').garantirMatriz().catch((e) => console.error('[unidades]', e.message));
    require('./src/servidorHttps').aplicar(app).then((st) => {
      require('./src/servidorHttps').vigiar();
      if (st.ativo) console.log(`Impressão digital do certificado da empresa (confira na instalação): ${String(require('./src/servidorHttps').impressaoDigital() || '').slice(0, 23)}`);
    }).catch((e) => console.error('[https]', e.message));
    // Cadastro de clientes com as NF-e que já estão no banco (em segundo plano).
    setTimeout(() => require('./src/clientes').preencherComNotasAntigas(), 20000);
    // Transportadoras de redespacho das notas antigas: cadastra/completa pelo CNPJ (em segundo plano).
    setTimeout(() => require('./src/transportadorasRedespacho').completarAntigos(), 40000);
    require('./src/ctesVinculados').vincularCtesAntigos().then(() => require('./src/ctesVinculados').reconciliarCtesSoltos()).then(() => require('./src/ctesVinculados').revisarCtesDeOutraTransportadora()).then(() => require('./src/ctesVinculados').calcularRedespachosSemCalculo());

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`\nNexofrete ${pkg.version}${CARIMBO_PACOTE ? ` · pacote de ${textoCarimbo(CARIMBO_PACOTE)}` : ''}`);
      console.log(`Servidor rodando! Acesse no navegador: http://localhost:${PORT}`);
      console.log(`Para outros computadores da rede acessarem, use o IP desta máquina, ex: http://192.168.0.10:${PORT}\n`);
    });
  } catch (err) {
    // Erro de CONEXÃO (banco desligado, senha errada...) é diferente de erro na
    // PREPARAÇÃO das tabelas (o banco respondeu, mas um comando do schema falhou).
    const ehConexao = ['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', '28P01', '3D000', '28000'].includes(err.code);
    if (ehConexao) {
      console.error('\n❌ Não foi possível conectar ao PostgreSQL.');
      console.error('Verifique se o PostgreSQL está instalado, rodando, e se os dados em backend/.env estão corretos.');
    } else {
      console.error('\n❌ O banco de dados conectou, mas a preparação das tabelas falhou.');
      console.error('Nada foi alterado no banco (a preparação é desfeita inteira quando dá erro).');
      console.error('Mande esta mensagem para o suporte do sistema.');
    }
    console.error('Detalhe do erro:', err.message);
    process.exit(1);
  }
}

iniciar();
