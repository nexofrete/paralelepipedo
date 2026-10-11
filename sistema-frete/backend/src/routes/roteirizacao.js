// Roteirização: escolhe as notas, monta as paradas (endereço do cliente, do
// local de entrega da NF-e ou da transportadora de redespacho), acha no mapa,
// calcula tempo/distância entre todas e devolve a melhor sequência com horário
// de chegada, restrições de circulação e pausas do motorista.
const express = require('express');
const pool = require('../db');
const { autenticar, apenasAdmin } = require('../middlewareAuth');
const { permitirAlguma, consultaCliente } = require('../permissoes');
const { registrar } = require('../auditoria');
const mapa = require('../roteirizacao/servicosMapa');
const { simular, otimizar } = require('../roteirizacao/otimizar');
const { deBrasilia, relogio, CATEGORIAS } = require('../roteirizacao/restricoes');
const { norm } = require('../roteirizacao/municipios');
const { lerNfe } = require('../cte/lerNfe');

const router = express.Router();
const podeVer = permitirAlguma('pode_ver_relatorios');
const MAX_PARADAS = 60;

// Notas que ainda não foram entregues (para escolher na tela).
router.get('/notas', autenticar, podeVer, async (req, res) => {
  try {
    const valores = [];
    let filtros = `f.frete_principal_id IS NULL AND f.data_entrega IS NULL AND f.nf_cancelada IS NOT TRUE AND f.nf_devolvida IS NOT TRUE
      AND COALESCE(f.status, 'Pendente') NOT IN ('Cancelado', 'Arquivado') AND NULLIF(TRIM(COALESCE(f.cidade, '')), '') IS NOT NULL`;
    if (req.query.pedidos !== '1') filtros += " AND NULLIF(TRIM(COALESCE(f.numero_nf, '')), '') IS NOT NULL";
    const desde = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.desde || '')) ? req.query.desde : null;
    if (desde) { valores.push(desde); filtros += ` AND COALESCE(f.data_emissao_nf, f.data_pedido, f.criado_em::date) >= $${valores.length}::date`; }
    else filtros += ' AND COALESCE(f.data_emissao_nf, f.data_pedido, f.criado_em::date) >= CURRENT_DATE - 30';
    if (req.query.uf) { valores.push(String(req.query.uf).toUpperCase()); filtros += ` AND f.uf = $${valores.length}`; }
    const busca = String(req.query.busca || '').trim();
    if (busca) {
      valores.push(`%${busca}%`);
      filtros += ` AND (f.numero_nf ILIKE $${valores.length} OR f.numero_pedido ILIKE $${valores.length} OR f.cliente ILIKE $${valores.length}
        OR f.cidade ILIKE $${valores.length} OR f.bairro ILIKE $${valores.length} OR f.redespacho ILIKE $${valores.length})`;
    }
    const { rows } = await consultaCliente(req,
      `SELECT f.id, f.numero_nf, f.numero_pedido, f.data_emissao_nf, f.cliente, f.cidade, f.bairro, f.uf, f.qtd_volumes, f.peso_kg, f.cubagem_m3,
              COALESCE(f.transportadora_cte, f.transportadora) AS transportadora, f.redespacho
         FROM fretes f WHERE ${filtros}
        ORDER BY f.uf, f.cidade, f.cliente LIMIT 1500`, valores);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao listar as notas.' });
  }
});

// Endereço de entrega de uma nota: redespacho (a transportadora que recebe) →
// local de entrega da NF-e → cadastro do cliente → endereço do destinatário na NF-e → cidade/bairro.
function enderecoDaNota(n, cliente, redesp) {
  if (n.redespacho && redesp) {
    return { nome: `Redespacho: ${redesp.razao_social}`, redespacho: true,
      e: { xLgr: redesp.endereco, nro: null, xBairro: redesp.bairro, xMun: redesp.municipio, UF: redesp.uf, CEP: String(redesp.cep || '').replace(/\D/g, '') } };
  }
  let nfe = null;
  if (n.xml_nfe_original) { try { nfe = lerNfe(n.xml_nfe_original); } catch { nfe = null; } }
  if (nfe?.entrega?.cMun) return { nome: n.cliente, e: { xMun: nfe.entrega.xMun, UF: nfe.entrega.UF, cMun: nfe.entrega.cMun } };
  if (cliente?.logradouro) {
    return { nome: n.cliente, e: { xLgr: cliente.logradouro, nro: cliente.numero, xBairro: cliente.bairro, xMun: cliente.municipio, UF: cliente.uf,
      CEP: String(cliente.cep || '').replace(/\D/g, ''), cMun: cliente.cod_municipio } };
  }
  const d = nfe?.destinatario?.endereco;
  if (d?.xLgr) return { nome: n.cliente, e: { ...d, CEP: String(d.CEP || '').replace(/\D/g, '') } };
  return { nome: n.cliente, e: { xBairro: n.bairro, xMun: n.cidade, UF: n.uf } };
}
const textoEndereco = (e) => [[e.xLgr, e.nro].filter(Boolean).join(', '), e.xBairro, `${e.xMun || ''}${e.UF ? `/${e.UF}` : ''}`].filter(Boolean).join(' — ');

router.post('/calcular', autenticar, podeVer, async (req, res) => {
  try {
    const b = req.body || {};
    const ids = [...new Set((Array.isArray(b.ids) ? b.ids : []).map(Number).filter((x) => Number.isInteger(x) && x > 0))];
    if (!ids.length) return res.status(400).json({ erro: 'Selecione as notas a entregar.' });
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(String(b.saida || ''))) return res.status(400).json({ erro: 'Informe a data e a hora de saída.' });
    const veiculo = { categoria: CATEGORIAS[b.veiculo?.categoria] ? b.veiculo.categoria : 'toco', placaFinal: String(b.veiculo?.placa || '').replace(/\D/g, '').slice(-1) || null };
    const cfg = await mapa.configuracao();
    const servicoPadrao = Number.isFinite(Number(b.servicoMin)) ? Math.max(0, Number(b.servicoMin)) : Number(cfg.tempo_parada_min || 30);

    const { rows: notas } = await consultaCliente(req,
      `SELECT f.id, f.numero_nf, f.numero_pedido, f.cliente, f.cliente_documento, f.cidade, f.bairro, f.uf, f.qtd_volumes, f.peso_kg, f.cubagem_m3,
              f.redespacho, f.redespacho_cnpj, f.xml_nfe_original
         FROM fretes f WHERE f.id = ANY($1)`, [ids]);
    if (!notas.length) return res.status(404).json({ erro: 'Nenhuma das notas foi encontrada.' });
    const docs = [...new Set(notas.map((n) => String(n.cliente_documento || '').replace(/\D/g, '')).filter(Boolean))];
    const { rows: clientes } = docs.length ? await pool.query('SELECT * FROM clientes WHERE documento = ANY($1)', [docs]) : { rows: [] };
    const cnpjsRed = [...new Set(notas.map((n) => String(n.redespacho_cnpj || '').replace(/\D/g, '')).filter((c) => c.length === 14))];
    const { rows: redesps } = cnpjsRed.length
      ? await pool.query(`SELECT *, REGEXP_REPLACE(cnpj, '[^0-9]', '', 'g') AS cnpj_limpo FROM transportadoras WHERE REGEXP_REPLACE(COALESCE(cnpj, ''), '[^0-9]', '', 'g') = ANY($1)`, [cnpjsRed])
      : { rows: [] };

    // Paradas: notas no mesmo endereço viram uma parada só.
    const paradasMap = new Map();
    for (const n of notas) {
      const cli = clientes.find((c) => c.documento === String(n.cliente_documento || '').replace(/\D/g, ''));
      const red = redesps.find((t) => t.cnpj_limpo === String(n.redespacho_cnpj || '').replace(/\D/g, ''));
      const { nome, e, redespacho } = enderecoDaNota(n, cli, red);
      const chave = norm(textoEndereco(e));
      if (!paradasMap.has(chave)) {
        paradasMap.set(chave, { nome, redespacho: !!redespacho, e, endereco: textoEndereco(e), cidade: e.xMun, uf: e.UF, bairro: e.xBairro,
          notas: [], volumes: 0, peso: 0, cubagem: 0, servicoMin: servicoPadrao });
      }
      const p = paradasMap.get(chave);
      p.notas.push({ id: n.id, nf: n.numero_nf, pedido: n.numero_pedido, cliente: n.cliente });
      p.volumes += Number(n.qtd_volumes) || 0; p.peso += Number(n.peso_kg) || 0; p.cubagem += Number(n.cubagem_m3) || 0;
    }
    let paradas = [...paradasMap.values()];
    if (paradas.length > MAX_PARADAS) return res.status(400).json({ erro: `São ${paradas.length} endereços: o limite por rota é ${MAX_PARADAS}. Divida em mais de uma rota.` });

    // Origem: o endereço informado na tela ou o da empresa.
    const { rows: emp } = await pool.query('SELECT * FROM empresa WHERE id = 1');
    const o = b.origem && (b.origem.xMun || b.origem.cidade) ? {
      xLgr: b.origem.xLgr || b.origem.endereco, nro: b.origem.nro, xBairro: b.origem.xBairro || b.origem.bairro, xMun: b.origem.xMun || b.origem.cidade,
      UF: b.origem.UF || b.origem.uf, CEP: String(b.origem.CEP || b.origem.cep || '').replace(/\D/g, ''),
    } : { xLgr: emp[0]?.endereco, nro: emp[0]?.numero, xBairro: emp[0]?.bairro, xMun: emp[0]?.municipio, UF: emp[0]?.uf,
      CEP: String(emp[0]?.cep || '').replace(/\D/g, ''), cMun: emp[0]?.codigo_municipio };
    if (!o.xMun || !o.UF) return res.status(400).json({ erro: 'Informe de onde o caminhão sai (ou preencha a cidade e a UF da empresa em Cadastros → Empresa).' });
    const origemPonto = await mapa.geocodificar(o, cfg);
    if (!origemPonto) return res.status(400).json({ erro: `Não achei no mapa o ponto de saída (${textoEndereco(o)}).` });
    const origem = { nome: 'Saída', endereco: textoEndereco(o), cidade: o.xMun, uf: o.UF, ...origemPonto };

    // Coordenadas de cada parada (as que não forem achadas ficam de fora, com aviso).
    const naoLocalizadas = [];
    for (const p of paradas) {
      const g = await mapa.geocodificar(p.e, cfg);
      if (g) Object.assign(p, g); else naoLocalizadas.push({ nome: p.nome, endereco: p.endereco, notas: p.notas });
    }
    paradas = paradas.filter((p) => p.lat != null);
    if (!paradas.length) return res.status(400).json({ erro: 'Nenhum endereço foi achado no mapa.', naoLocalizadas });

    const pontos = [origem, ...paradas];
    const m = await mapa.matriz(pontos, cfg);
    const { rows: regras } = await pool.query('SELECT * FROM restricoes_circulacao WHERE ativo');
    // Horário de recebimento dos clientes: o da tela, ou o padrão da configuração.
    const { rows: rc } = await pool.query('SELECT recebimento_inicio, recebimento_fim, recebimento_sabado FROM configuracao_roteirizacao WHERE id = 1');
    const hora = /^([01]\d|2[0-3]):[0-5]\d$/;
    const rec = b.recebimento === false ? null : {
      inicio: hora.test(b.recebimento?.inicio || '') ? b.recebimento.inicio : (rc[0]?.recebimento_inicio || '08:00'),
      fim: hora.test(b.recebimento?.fim || '') ? b.recebimento.fim : (rc[0]?.recebimento_fim || '18:00'),
    };
    if (rec) rec.dias = (b.recebimento?.sabado ?? rc[0]?.recebimento_sabado) ? [1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5];
    const ctx = { dur: m.dur, dist: m.dist, paradas: pontos, saidaMs: deBrasilia(b.saida), regras, veiculo, voltar: !!b.voltar, pernoite: !b.doisMotoristas, recebimento: rec };

    // Ordem: a melhor, ou a que a pessoa arrumou na tela (lista de ids de notas, na ordem das paradas).
    let ordem;
    if (b.otimizar === false && Array.isArray(b.ordemNotas) && b.ordemNotas.length) {
      const pos = (p) => Math.min(...p.notas.map((x) => { const k = b.ordemNotas.map(Number).indexOf(x.id); return k < 0 ? 1e9 : k; }));
      ordem = paradas.map((p, k) => ({ i: k + 1, pos: pos(p) })).sort((a, c) => a.pos - c.pos).map((x) => x.i);
    } else ordem = otimizar(ctx);
    const sim = simular(ordem, ctx);
    const geo = await mapa.geometria([origem, ...ordem.map((i) => pontos[i]), ...(b.voltar ? [origem] : [])], cfg);

    const passos = sim.passos.map((s) => {
      const p = pontos[s.indice];
      return { ...s, nome: s.indice === 0 ? 'Retorno à saída' : p.nome, endereco: p.endereco, cidade: p.cidade, uf: p.uf, lat: p.lat, lon: p.lon,
        precisao: p.precisao, notas: p.notas || [], volumes: p.volumes, peso: p.peso, cubagem: p.cubagem, servicoMin: s.indice === 0 ? 0 : p.servicoMin,
        redespacho: !!p.redespacho };
    });
    registrar({ usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'roteirizar',
      detalhes: `Roteirizou ${notas.length} nota(s) em ${paradas.length} parada(s): ${Math.round(sim.km)} km, ${Math.round(sim.jornadaMin / 60 * 10) / 10} h` });
    res.json({
      origem, passos, geometria: geo, fonte: m.fonte, veiculo, saida: relogio(ctx.saidaMs).texto, fim: relogio(sim.fimMs).texto,
      totais: { paradas: paradas.length, notas: notas.length, km: Math.round(sim.km * 10) / 10, dirigindoMin: sim.dirigindoMin, jornadaMin: sim.jornadaMin,
        pausas: sim.pausas, pernoites: sim.pernoites, esperaMin: passos.reduce((a, p) => a + p.esperaMin, 0),
        alertas: passos.reduce((a, p) => a + p.alertas.length, 0) + sim.alertasJornada.length,
        aproximadas: paradas.filter((p) => p.precisao === 'cidade').length },
      alertasJornada: sim.alertasJornada, naoLocalizadas,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: `Erro ao roteirizar. Detalhe técnico: ${err.message}` });
  }
});

// ---------- Configuração (serviço de mapas) ----------
router.get('/config', autenticar, podeVer, async (req, res) => {
  try {
    const c = await mapa.configuracao();
    const { rows } = await pool.query('SELECT tempo_parada_min, recebimento_inicio, recebimento_fim, recebimento_sabado FROM configuracao_roteirizacao WHERE id = 1').catch(() => ({ rows: [] }));
    const { ors_chave, ...semChave } = c;
    res.json({ ...semChave, tem_chave_ors: !!ors_chave, tempo_parada_min: rows[0]?.tempo_parada_min ?? 30, recebimento_inicio: rows[0]?.recebimento_inicio || '08:00',
      recebimento_fim: rows[0]?.recebimento_fim || '18:00', recebimento_sabado: !!rows[0]?.recebimento_sabado, categorias: CATEGORIAS });
  } catch (err) { res.status(500).json({ erro: 'Erro ao ler a configuração.' }); }
});
router.put('/config', autenticar, apenasAdmin, async (req, res) => {
  try {
    const b = req.body || {};
    const sets = []; const v = [];
    const set = (col, val) => { v.push(val); sets.push(`${col} = $${v.length}`); };
    if (['osrm', 'ors', 'estimado'].includes(b.provedor)) set('provedor', b.provedor);
    if (b.ors_chave !== undefined && b.ors_chave !== '') set('ors_chave', String(b.ors_chave).trim() || null);
    if (b.remover_chave_ors) set('ors_chave', null);
    if (b.geocodificar_endereco !== undefined) set('geocodificar_endereco', !!b.geocodificar_endereco);
    if (b.fator_caminhao !== undefined) set('fator_caminhao', Math.min(3, Math.max(1, Number(b.fator_caminhao) || 1.25)));
    if (b.velocidade_estimada !== undefined) set('velocidade_estimada', Math.min(110, Math.max(20, parseInt(b.velocidade_estimada, 10) || 55)));
    if (b.tempo_parada_min !== undefined) set('tempo_parada_min', Math.min(600, Math.max(0, parseInt(b.tempo_parada_min, 10) || 0)));
    const hhmm = /^([01]\d|2[0-3]):[0-5]\d$/;
    if (hhmm.test(b.recebimento_inicio || '')) set('recebimento_inicio', b.recebimento_inicio);
    if (hhmm.test(b.recebimento_fim || '')) set('recebimento_fim', b.recebimento_fim);
    if (b.recebimento_sabado !== undefined) set('recebimento_sabado', !!b.recebimento_sabado);
    for (const k of ['osrm_url', 'ors_url', 'nominatim_url']) {
      if (b[k] !== undefined) {
        const url = String(b[k] || '').trim().replace(/\/+$/, '');
        if (url && !/^https?:\/\//.test(url)) return res.status(400).json({ erro: `Endereço inválido em ${k}.` });
        set(k, url || null);
      }
    }
    if (sets.length) await pool.query(`UPDATE configuracao_roteirizacao SET ${sets.join(', ')} WHERE id = 1`, v);
    registrar({ usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'roteirizacao_config', detalhes: 'Alterou a configuração da roteirização' });
    res.json({ ok: true });
  } catch (err) { console.error(err); res.status(500).json({ erro: 'Erro ao salvar a configuração.' }); }
});

// ---------- Restrições de circulação ----------
router.get('/restricoes', autenticar, podeVer, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM restricoes_circulacao ORDER BY uf, cidade, inicio');
    res.json(rows);
  } catch (err) { res.status(500).json({ erro: 'Erro ao listar as restrições.' }); }
});
function validarRestricao(b) {
  const hora = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (!String(b.cidade || '').trim() || !/^[A-Za-z]{2}$/.test(String(b.uf || ''))) return 'Informe a cidade e a UF.';
  if (!String(b.descricao || '').trim()) return 'Dê um nome para a restrição.';
  if (!hora.test(b.inicio || '') || !hora.test(b.fim || '')) return 'Horários no formato HH:MM.';
  const dias = String(b.dias || '').split(',').map((d) => d.trim()).filter(Boolean);
  if (!dias.length || dias.some((d) => !/^[0-6]$/.test(d))) return 'Escolha pelo menos um dia da semana.';
  const cats = String(b.categorias || '').split(',').map((c) => c.trim()).filter(Boolean);
  if (cats.some((c) => !CATEGORIAS[c])) return 'Tipo de veículo inválido.';
  if (!['proibido', 'rodizio'].includes(b.tipo || 'proibido') || !['esperar', 'avisar'].includes(b.efeito || 'esperar')) return 'Tipo ou efeito inválido.';
  return null;
}
const colunasRestricao = (b) => [String(b.cidade).trim().toUpperCase(), String(b.uf).toUpperCase(), String(b.bairros || '').trim() || null, String(b.descricao).trim().slice(0, 200),
  String(b.categorias || '').trim(), String(b.dias).replace(/\s/g, ''), b.inicio, b.fim, b.tipo || 'proibido', b.tipo === 'rodizio' ? b.finais || null : null,
  b.efeito || 'esperar', String(b.observacao || '').trim() || null, b.ativo !== false];
router.post('/restricoes', autenticar, apenasAdmin, async (req, res) => {
  const erro = validarRestricao(req.body || {});
  if (erro) return res.status(400).json({ erro });
  try {
    const { rows } = await pool.query(
      `INSERT INTO restricoes_circulacao (cidade, uf, bairros, descricao, categorias, dias, inicio, fim, tipo, finais, efeito, observacao, ativo)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`, colunasRestricao(req.body));
    registrar({ usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'restricao_circulacao', detalhes: `Cadastrou a restrição "${rows[0].descricao}" (${rows[0].cidade}/${rows[0].uf})` });
    res.status(201).json(rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ erro: 'Erro ao salvar a restrição.' }); }
});
router.put('/restricoes/:id(\\d+)', autenticar, apenasAdmin, async (req, res) => {
  const erro = validarRestricao(req.body || {});
  if (erro) return res.status(400).json({ erro });
  try {
    const { rows } = await pool.query(
      `UPDATE restricoes_circulacao SET cidade=$1, uf=$2, bairros=$3, descricao=$4, categorias=$5, dias=$6, inicio=$7, fim=$8, tipo=$9, finais=$10, efeito=$11, observacao=$12, ativo=$13
        WHERE id = $14 RETURNING *`, [...colunasRestricao(req.body), req.params.id]);
    if (!rows[0]) return res.status(404).json({ erro: 'Restrição não encontrada.' });
    registrar({ usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'restricao_circulacao', detalhes: `Alterou a restrição "${rows[0].descricao}" (${rows[0].cidade}/${rows[0].uf})` });
    res.json(rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ erro: 'Erro ao salvar a restrição.' }); }
});
router.delete('/restricoes/:id(\\d+)', autenticar, apenasAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query('DELETE FROM restricoes_circulacao WHERE id = $1 RETURNING descricao, cidade, uf', [req.params.id]);
    if (rows[0]) registrar({ usuarioId: req.usuario.id, usuarioNome: req.usuario.nome, acao: 'restricao_circulacao', detalhes: `Excluiu a restrição "${rows[0].descricao}" (${rows[0].cidade}/${rows[0].uf})` });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ erro: 'Erro ao excluir.' }); }
});

module.exports = router;
