// Averbação automática: depois que a SEFAZ autoriza o CT-e (ou o MDF-e), manda
// o XML para a averbadora configurada e guarda protocolo e número de averbação.
// Cancelamento e encerramento também são avisados à averbadora.
const pool = require('../db');
const { enviar, PROVEDORES } = require('./averbadoras');
const { descriptografar } = require('../cte/certificado');

const TABELA = { cte: 'ctes_emitidos', mdfe: 'mdfes' };

async function configuracao(demonstracao) {
  const { rows } = await pool.query('SELECT averbacao_provedor, averbacao_usuario, averbacao_senha, averbacao_codigo, averbacao_automatica, cte_ambiente FROM empresa WHERE id = 1');
  const e = rows[0] || {};
  let senha = '';
  try { senha = e.averbacao_senha ? descriptografar(e.averbacao_senha).toString('utf8') : ''; } catch { senha = ''; }
  return {
    provedor: e.averbacao_provedor || '', usuario: e.averbacao_usuario || '', senha, codigo: e.averbacao_codigo || '',
    automatica: !!e.averbacao_automatica, ambiente: e.cte_ambiente, simulado: !!demonstracao,
  };
}

async function guardar(tipo, id, resultado, extra = {}) {
  const { rows } = await pool.query(`SELECT averbacao FROM ${TABELA[tipo]} WHERE id = $1`, [id]);
  const antes = rows[0]?.averbacao || {};
  const agora = new Date().toISOString();
  const novo = {
    ...antes, ...extra,
    historico: [...(antes.historico || []), { em: agora, ok: resultado.ok, mensagem: resultado.mensagem, protocolo: resultado.protocolo || null, acao: extra.acao || 'averbar' }].slice(-20),
  };
  delete novo.acao;
  await pool.query(`UPDATE ${TABELA[tipo]} SET averbacao = $2, averbacao_status = $3 WHERE id = $1`, [id, novo, novo.status || null]);
  return novo;
}

const nomeArquivo = (tipo, reg, sufixo = '') => `${reg.chave || `${tipo}-${reg.id}`}${sufixo}.xml`;

// Averba (CT-e) ou declara (MDF-e) o documento autorizado. forcar: mesmo sem a averbação automática ligada.
async function averbar(tipo, id, { forcar = false } = {}) {
  const { rows } = await pool.query(`SELECT * FROM ${TABELA[tipo]} WHERE id = $1`, [id]);
  const reg = rows[0];
  if (!reg) throw new Error('Documento não encontrado.');
  if (!reg.xml_autorizado || !['autorizado', 'encerrado'].includes(reg.status)) throw new Error('Só dá para averbar documento autorizado pela SEFAZ.');
  const cfg = await configuracao(reg.demonstracao);
  if (!cfg.provedor && !cfg.simulado) {
    if (forcar) throw new Error('Escolha a averbadora na Configuração fiscal → Averbação.');
    return null;
  }
  if (!forcar && !cfg.automatica) return null;
  if (reg.averbacao?.status === 'averbado') return reg.averbacao;
  let r;
  try { r = await enviar(cfg, tipo, reg.xml_autorizado, { nomeArquivo: nomeArquivo(tipo, reg) }); } catch (err) { r = { ok: false, mensagem: err.message, tentarDeNovo: true }; }
  return guardar(tipo, id, r, r.ok
    ? { status: 'averbado', protocolo: r.protocolo, numero: r.numero, teste: !!r.teste, mensagem: r.mensagem, em: new Date().toISOString(), provedor: cfg.simulado ? 'demonstração' : PROVEDORES[cfg.provedor] }
    : { status: 'erro', mensagem: r.mensagem, em: new Date().toISOString(), tentarDeNovo: !!r.tentarDeNovo, provedor: cfg.simulado ? 'demonstração' : PROVEDORES[cfg.provedor] });
}

// Depois de cancelar/encerrar na SEFAZ: manda o XML do evento (só se o documento foi averbado).
async function avisarEvento(tipo, id, tipoEvento) {
  const { rows } = await pool.query(`SELECT * FROM ${TABELA[tipo]} WHERE id = $1`, [id]);
  const reg = rows[0];
  if (reg?.averbacao?.status !== 'averbado') return null;
  const ev = (reg.eventos || []).filter((x) => x.ok && x.tipo === tipoEvento && x.xml).slice(-1)[0];
  if (!ev) return null;
  const cfg = await configuracao(reg.demonstracao);
  const cancelamento = tipoEvento === 'cancelamento';
  let r;
  try { r = await enviar(cfg, tipo, ev.xml, { nomeArquivo: nomeArquivo(tipo, reg, `-${tipoEvento}`), cancelamento }); } catch (err) { r = { ok: false, mensagem: err.message }; }
  return guardar(tipo, id, r, {
    acao: tipoEvento,
    ...(cancelamento && r.ok ? { status: 'cancelado' } : {}),
    ...(r.ok ? {} : { pendenciaEvento: tipoEvento, mensagem: `Falhou ao avisar o ${tipoEvento} à averbadora: ${r.mensagem}` }),
  });
}

// Não deixa a falha da averbadora atrapalhar a emissão: registra e segue.
const semFalhar = (p) => p.catch((err) => { console.error('[averbacao]', err.message); return null; });

module.exports = { averbar, avisarEvento, configuracao, semFalhar };
