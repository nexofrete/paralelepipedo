const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cron = require('node-cron');
const pool = require('./db');
const { registrar } = require('./auditoria');
const { lerXmlDoZip } = require('./utils/lerZip');

// Pasta monitorada de XML: de tempos em tempos lê a pasta configurada (e as
// subpastas), importa os XML novos de NF-e, CT-e e eventos — nessa ordem, pra
// cada CT-e já achar a nota dele — e, se configurado, move cada arquivo pra
// "Importados" ou "Com erro" dentro da própria pasta.

const USUARIO_SISTEMA = { id: null, nome: 'Importação automática (pasta)', perfil: 'admin', pode_ver_todos: true };
let rodando = false;

async function buscarConfiguracao() {
  const { rows } = await pool.query('SELECT * FROM configuracao_pasta_xml WHERE id = 1');
  if (rows[0]) return rows[0];
  const ins = await pool.query('INSERT INTO configuracao_pasta_xml (id) VALUES (1) RETURNING *');
  return ins.rows[0];
}

async function salvarConfiguracao(dados) {
  await buscarConfiguracao();
  const { rows } = await pool.query(
    `UPDATE configuracao_pasta_xml SET ativo = $1, caminho = $2, intervalo_minutos = $3, mover_processados = $4
      WHERE id = 1 RETURNING *`,
    [!!dados.ativo, String(dados.caminho || '').trim() || null,
     Math.min(1440, Math.max(1, Number(dados.intervalo_minutos) || 5)), dados.mover_processados !== false]
  );
  return rows[0];
}

function listarXml(pasta, profundidade = 0) {
  let arquivos = [];
  for (const item of fs.readdirSync(pasta, { withFileTypes: true })) {
    const caminho = path.join(pasta, item.name);
    if (item.isDirectory()) {
      if (profundidade < 3 && !['Importados', 'Com erro'].includes(item.name)) arquivos = arquivos.concat(listarXml(caminho, profundidade + 1));
    } else if (/\.(xml|zip)$/i.test(item.name)) {
      arquivos.push(caminho);
    }
  }
  return arquivos;
}

function mover(arquivo, pastaBase, subpasta) {
  try {
    const destinoPasta = path.join(pastaBase, subpasta);
    fs.mkdirSync(destinoPasta, { recursive: true });
    let destino = path.join(destinoPasta, path.basename(arquivo));
    if (fs.existsSync(destino)) destino = path.join(destinoPasta, `${Date.now()}-${path.basename(arquivo)}`);
    fs.renameSync(arquivo, destino);
  } catch (err) {
    console.error('[pasta-xml] Não consegui mover', arquivo, err.message);
  }
}

// Lê a pasta e importa o que for novo. Devolve um resumo.
async function executar(motivo = 'automático') {
  if (rodando) return { ok: false, mensagem: 'Já tem uma importação da pasta em andamento.' };
  rodando = true;
  const { importarXmlInterno, tipoDoXml } = require('./routes/upload');
  try {
    const config = await buscarConfiguracao();
    if (!config.caminho) return { ok: false, mensagem: 'Nenhuma pasta configurada.' };
    if (!fs.existsSync(config.caminho)) {
      const msg = `Pasta não encontrada: ${config.caminho}`;
      await pool.query('UPDATE configuracao_pasta_xml SET ultima_execucao_em = NOW(), ultima_mensagem = $1 WHERE id = 1', [msg]);
      return { ok: false, mensagem: msg };
    }

    // XML soltos e XML dentro de .zip (o zip é aberto e cada XML de dentro
    // é tratado como se estivesse solto na pasta).
    const lidos = [];
    const zipsComErro = [];
    for (const arquivo of listarXml(config.caminho)) {
      try {
        const buffer = fs.readFileSync(arquivo);
        if (/\.zip$/i.test(arquivo)) {
          for (const x of lerXmlDoZip(buffer)) {
            const hash = crypto.createHash('sha256').update(x.buffer).digest('hex');
            lidos.push({ arquivo, nome: `${path.basename(arquivo)} › ${x.nome}`, buffer: x.buffer, hash, tipo: tipoDoXml(x.buffer.toString('utf-8')), doZip: true });
          }
        } else {
          const hash = crypto.createHash('sha256').update(buffer).digest('hex');
          lidos.push({ arquivo, nome: path.basename(arquivo), buffer, hash, tipo: tipoDoXml(buffer.toString('utf-8')) });
        }
      } catch (err) {
        // Arquivo ainda sendo gravado fica pra próxima; zip corrompido vai pra "Com erro".
        if (/\.zip$/i.test(arquivo) && /inválido|corrompido/i.test(err.message)) zipsComErro.push(arquivo);
      }
    }
    if (config.mover_processados) zipsComErro.forEach((z) => mover(z, config.caminho, 'Com erro'));
    const { rows: jaVistos } = await pool.query('SELECT hash FROM xml_pasta_processados WHERE hash = ANY($1)', [lidos.map((l) => l.hash)]);
    const vistos = new Set(jaVistos.map((r) => r.hash));
    const ordem = { nfe: 1, cte: 2, evento: 3, retorno: 4 };
    const novos = lidos.filter((l) => !vistos.has(l.hash)).sort((a, b) => (ordem[a.tipo] || 9) - (ordem[b.tipo] || 9));
    // XML soltos repetidos que já tinham sido importados: só tira da pasta.
    if (config.mover_processados) lidos.filter((l) => !l.doZip && vistos.has(l.hash)).forEach((l) => mover(l.arquivo, config.caminho, 'Importados'));
    // Situação de cada zip: só sai da pasta quando todos os XML dele foram resolvidos.
    const situacaoZip = new Map(); // caminho do zip -> { erro, esperando }
    lidos.filter((l) => l.doZip).forEach((l) => { if (!situacaoZip.has(l.arquivo)) situacaoZip.set(l.arquivo, { erro: false, esperando: false }); });

    let importados = 0;
    let comErro = 0;
    for (const item of novos) {
      let r;
      try {
        r = await importarXmlInterno(item.buffer, item.nome, USUARIO_SISTEMA);
      } catch (err) {
        r = { ok: false, tipo: item.tipo, mensagem: err.message };
      }
      // "Já importado antes" não é erro de verdade: conta como lido.
      const jaExistia = !r.ok && r.status === 409;
      const ok = r.ok || jaExistia;
      // CT-e/evento que chegou antes da nota/CT-e: não marca como lido, tenta de novo na próxima.
      const tentarDeNovo = !ok && r.status === 404;
      if (!tentarDeNovo) {
        await pool.query(
          `INSERT INTO xml_pasta_processados (hash, nome_arquivo, tipo, ok, mensagem) VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (hash) DO NOTHING`,
          [item.hash, item.nome.slice(0, 300), r.tipo, ok, r.mensagem]
        );
        if (config.mover_processados && !item.doZip) mover(item.arquivo, config.caminho, ok ? 'Importados' : 'Com erro');
      }
      if (item.doZip) {
        const sit = situacaoZip.get(item.arquivo);
        if (tentarDeNovo) sit.esperando = true;
        else if (!ok) sit.erro = true;
      }
      if (r.ok) importados += 1; else if (!jaExistia && !tentarDeNovo) comErro += 1;
    }

    // Zip resolvido por inteiro sai da pasta (com algum erro, vai pra "Com erro").
    if (config.mover_processados) {
      for (const [zip, sit] of situacaoZip) if (!sit.esperando) mover(zip, config.caminho, sit.erro ? 'Com erro' : 'Importados');
    }
    if (importados) await require('./ctesVinculados').reconciliarCtesSoltos().catch(() => {});
    const msg = novos.length
      ? `${importados} importado(s), ${comErro} com erro, ${novos.length - importados - comErro} já existiam ou aguardam (de ${novos.length} arquivo(s) novo(s))`
      : 'Nenhum arquivo novo na pasta.';
    await pool.query('UPDATE configuracao_pasta_xml SET ultima_execucao_em = NOW(), ultima_mensagem = $1 WHERE id = 1', [msg]);
    if (importados || comErro) {
      registrar({ usuarioId: null, usuarioNome: USUARIO_SISTEMA.nome, acao: 'importar_pasta_xml', detalhes: `Pasta monitorada (${motivo}): ${msg}` });
    }
    return { ok: true, mensagem: msg, importados, comErro };
  } catch (err) {
    console.error('[pasta-xml]', err);
    return { ok: false, mensagem: err.message };
  } finally {
    rodando = false;
  }
}

async function ultimosProcessados(limite = 30) {
  const { rows } = await pool.query(
    'SELECT nome_arquivo, tipo, ok, mensagem, processado_em FROM xml_pasta_processados ORDER BY processado_em DESC LIMIT $1', [limite]);
  return rows;
}

// Confere a cada minuto se já deu o intervalo configurado.
function agendar() {
  cron.schedule('* * * * *', async () => {
    try {
      const config = await buscarConfiguracao();
      if (!config.ativo || !config.caminho) return;
      const ultima = config.ultima_execucao_em ? new Date(config.ultima_execucao_em).getTime() : 0;
      if (Date.now() - ultima >= (config.intervalo_minutos || 5) * 60000 - 5000) await executar('automático');
    } catch (err) {
      console.error('[pasta-xml]', err.message);
    }
  });
}

module.exports = { buscarConfiguracao, salvarConfiguracao, executar, ultimosProcessados, agendar };
