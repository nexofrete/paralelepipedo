// Cotação de frete (estilo SSW): calcula pela tabela de preço da própria
// transportadora, permite ajustar (desconto/negociação), gera a proposta
// para o cliente (impressão/PDF, e-mail, WhatsApp) e, aprovada, vira coleta
// e depois CT-e com o preço combinado.
const pool = require('./db');
const emissao = require('./cte/emissao');
const { aliquotaInterestadual } = require('./icmsCte');

const STATUS = { solicitada: 'Pedida no portal', aberta: 'Em aberto', enviada: 'Enviada', aprovada: 'Aprovada', recusada: 'Recusada', cancelada: 'Cancelada', vencida: 'Vencida' };
const falha = (msg, status = 400) => Object.assign(new Error(msg), { status });
const texto = (v, max) => { const t = String(v ?? '').trim(); return t ? t.slice(0, max) : null; };
const doc = (v) => String(v ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 20) || null;
const centavos = (v) => Math.round((Number(v) || 0) * 100) / 100;
const numero = (v, casas = 3) => {
  if (v === '' || v == null) return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/\./g, '').replace(',', '.'));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 10 ** casas) / 10 ** casas;
};
const hojeBr = () => new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
const somarDias = (iso, dias) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + dias); return d.toISOString().slice(0, 10); };
const UF = (v) => { const u = String(v || '').trim().toUpperCase(); return /^[A-Z]{2}$/.test(u) ? u : null; };

// Componentes digitados (nome + valor). Nomes no padrão do CT-e (maiúsculas, até 15 letras).
function lerComponentes(lista) {
  return (Array.isArray(lista) ? lista : []).map((c) => ({ xNome: String(c.xNome || '').trim().toUpperCase().slice(0, 15), vComp: centavos(numero(c.vComp, 2)) }))
    .filter((c) => c.xNome && c.vComp > 0).slice(0, 20);
}

function lerCotacao(b = {}, { validadeDias = 10 } = {}) {
  const c = {
    cliente_doc: doc(b.cliente_doc), cliente_nome: texto(b.cliente_nome, 200), cliente_papel: b.cliente_papel === 'destinatario' ? 'destinatario' : 'remetente',
    contato_nome: texto(b.contato_nome, 120), email: texto(b.email, 250), telefone: texto(b.telefone, 30),
    origem_cidade: texto(b.origem_cidade, 120), origem_uf: UF(b.origem_uf), destino_cidade: texto(b.destino_cidade, 120), destino_uf: UF(b.destino_uf),
    destino_bairro: texto(b.destino_bairro, 120),
    volumes: numero(b.volumes, 0), peso_kg: numero(b.peso_kg), cubagem_m3: numero(b.cubagem_m3), valor_mercadoria: numero(b.valor_mercadoria, 2), produto: texto(b.produto, 120),
    componentes: lerComponentes(b.componentes),
    valor_tabela: numero(b.valor_tabela, 2), prazo_dias: numero(b.prazo_dias, 0), tabela_nome: texto(b.tabela_nome, 150), explicacao: texto(b.explicacao, 2000),
    validade: /^\d{4}-\d{2}-\d{2}$/.test(String(b.validade || '')) ? b.validade : somarDias(hojeBr(), validadeDias),
    observacao: texto(b.observacao, 2000),
  };
  c.valor_total = centavos(c.componentes.reduce((s, x) => s + x.vComp, 0));
  if (!c.cliente_nome) throw falha('Informe o cliente.');
  if (c.cliente_doc && ![11, 14].includes(c.cliente_doc.length)) throw falha('CNPJ/CPF do cliente inválido.');
  if (!c.origem_cidade || !c.origem_uf) throw falha('Informe a cidade e a UF de origem.');
  if (!c.destino_cidade || !c.destino_uf) throw falha('Informe a cidade e a UF de destino.');
  if (!c.peso_kg && !c.volumes && !c.cubagem_m3) throw falha('Informe o peso, os volumes ou a cubagem da carga.');
  if (!c.componentes.length) throw falha('Calcule o frete (ou lance os valores) antes de salvar.');
  if (c.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email)) throw falha('E-mail do cliente inválido.');
  return c;
}
const CAMPOS = ['cliente_doc', 'cliente_nome', 'cliente_papel', 'contato_nome', 'email', 'telefone', 'origem_cidade', 'origem_uf', 'destino_cidade', 'destino_uf',
  'destino_bairro', 'volumes', 'peso_kg', 'cubagem_m3', 'valor_mercadoria', 'produto', 'componentes', 'valor_total', 'valor_tabela', 'prazo_dias', 'tabela_nome',
  'explicacao', 'validade', 'observacao'];

async function empresa() {
  const { rows } = await pool.query('SELECT * FROM empresa WHERE id = 1');
  return rows[0] || {};
}

// Calcula pela tabela de preço da empresa (a mesma do CT-e).
async function calcular(b = {}) {
  const e = await emissao.carregarEmitente();
  const destino = texto(b.destino_cidade, 120); const uf = UF(b.destino_uf);
  if (!destino || !uf) throw falha('Informe a cidade e a UF de destino.');
  const peso = numero(b.peso_kg) || 0; const vol = numero(b.volumes, 0) || 0; const cub = numero(b.cubagem_m3);
  if (!peso && !vol && !cub) throw falha('Informe o peso, os volumes ou a cubagem.');
  const calc = require('./calculoFrete');
  const r = await calc.calcularParaRegistro({
    transportadoraCte: e.razao_social, transportadoraCnpj: e.cnpj, cidade: destino, bairro: texto(b.destino_bairro, 120),
    qtdVolumes: vol, pesoKg: peso, cubagemM3: cub, valorFaturado: numero(b.valor_mercadoria, 2) || 0, clienteDoc: doc(b.cliente_doc),
    registro: { uf, cliente: texto(b.cliente_nome, 200), tipo_carga: null }, xmlNfe: null,
  });
  if (r.erro) {
    const semTabela = /tabela de pre/i.test(r.erro);
    throw falha(semTabela ? 'A empresa ainda não tem tabela de preço ativa. Cadastre em Cadastros → Transportadoras (a própria empresa) → Tabela de preço, ou lance os valores à mão.' : r.erro, 422);
  }
  const k = r.componentes;
  const componentes = [['FRETE PESO', r.freteBase], ['AD VALOREM', k.adValorem], ['GRIS', k.gris], ['PEDAGIO', k.pedagio], ['TDE', k.tde], ['TDA', k.tda],
    ['TRT', k.trt], ['DESPACHO', k.despacho], ['DESCARGA', k.descarga]].filter(([, v]) => Number(v) > 0).map(([xNome, v]) => ({ xNome, vComp: centavos(v) }));
  const total = centavos(componentes.reduce((s, x) => s + x.vComp, 0));
  return { componentes, total, prazo_dias: calc.prazoDoTrecho(r.trecho), tabela_nome: r.trecho?.tabela_nome || null, explicacao: r.explicacao || null, cidade_usada: r.cidadeUsada };
}

async function criar(b, usuarioNome) {
  const e = await empresa();
  const c = lerCotacao(b, { validadeDias: e.cotacao_validade_dias || 10 });
  const { rows } = await pool.query(
    `INSERT INTO cotacoes (${CAMPOS.join(', ')}, criado_por_nome) VALUES (${CAMPOS.map((_, i) => `$${i + 1}`).join(', ')}, $${CAMPOS.length + 1}) RETURNING *`,
    [...CAMPOS.map((k) => (k === 'componentes' ? JSON.stringify(c[k]) : c[k])), usuarioNome]);
  return rows[0];
}

async function alterar(id, b) {
  const e = await empresa();
  const c = lerCotacao(b, { validadeDias: e.cotacao_validade_dias || 10 });
  const { rows } = await pool.query(
    `UPDATE cotacoes SET ${CAMPOS.map((k, i) => `${k} = $${i + 2}`).join(', ')}, atualizado_em = NOW(),
            status = CASE WHEN status = 'solicitada' THEN 'aberta' ELSE status END
      WHERE id = $1 AND status IN ('solicitada', 'aberta', 'enviada') RETURNING *`,
    [id, ...CAMPOS.map((k) => (k === 'componentes' ? JSON.stringify(c[k]) : c[k]))]);
  if (!rows[0]) throw falha('Esta cotação não pode mais ser alterada (já foi aprovada, recusada ou cancelada).', 409);
  return rows[0];
}

// Situação que a tela mostra (vencida não é gravada: depende do dia).
const situacao = (c) => (['aberta', 'enviada'].includes(c.status) && String(c.validade instanceof Date ? c.validade.toISOString() : c.validade).slice(0, 10) < hojeBr() ? 'vencida' : c.status);

// ---------- Proposta (impressão / e-mail / WhatsApp) ----------
const esc = (v) => String(v ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const moeda = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const n = (v, c = 0) => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: c, maximumFractionDigits: c });
const diaBr = (v) => { const s = v instanceof Date ? v.toISOString().slice(0, 10) : String(v || '').slice(0, 10); return s ? s.split('-').reverse().join('/') : ''; };
// Telefone legível: (19) 3210-1000 / (11) 98888-7777.
const foneFmt = (t) => { const d = String(t || '').replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, ''); return d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : d.length === 10 ? `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}` : String(t || ''); };
const docFmt = (d) => { const x = String(d || ''); return x.length === 14 ? x.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : x.length === 11 ? x.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4') : x; };

function propostaHtml(c, e, { paraEmail = false } = {}) {
  const nomeEmpresa = e.nome_fantasia || e.razao_social || 'Transportadora';
  const carga = [c.volumes ? `${n(c.volumes)} volume(s)` : '', c.peso_kg ? `${n(c.peso_kg, 1)} kg` : '', c.cubagem_m3 ? `${n(c.cubagem_m3, 3)} m³` : '',
    c.valor_mercadoria ? `mercadoria de ${moeda(c.valor_mercadoria)}` : '', c.produto].filter(Boolean).join(' · ');
  const condicoes = String(e.cotacao_condicoes || '').trim();
  const corpo = `
    <div style="font-family:Arial,sans-serif; color:#1d2433; max-width:680px; margin:0 auto;">
      <table style="width:100%; border-collapse:collapse;"><tr>
        <td>${e.logo && !paraEmail ? `<img src="${esc(e.logo)}" alt="" style="max-height:52px; max-width:180px;"><br>` : ''}<b style="font-size:16px;">${esc(nomeEmpresa)}</b><br>
          <span style="font-size:12px; color:#667085;">${esc(e.razao_social || '')}${e.cnpj ? ` · CNPJ ${esc(docFmt(e.cnpj))}` : ''}<br>${esc([foneFmt(e.telefone), e.email].filter(Boolean).join(' · '))}</span></td>
        <td style="text-align:right; vertical-align:top;"><b style="font-size:18px;">Cotação de frete nº ${c.id}</b><br>
          <span style="font-size:12px; color:#667085;">Emitida em ${diaBr(c.criado_em instanceof Date ? c.criado_em.toISOString() : c.criado_em)} · válida até <b>${diaBr(c.validade)}</b></span></td></tr></table>
      <hr style="border:0; border-top:2px solid #2f5bea; margin:12px 0 16px;">
      <p style="margin:4px 0;"><b>Para:</b> ${esc(c.cliente_nome)}${c.cliente_doc ? ` · ${esc(docFmt(c.cliente_doc))}` : ''}${c.contato_nome ? ` · A/C ${esc(c.contato_nome)}` : ''}</p>
      <p style="margin:4px 0;"><b>Trajeto:</b> ${esc(c.origem_cidade)}/${esc(c.origem_uf)} → ${esc(c.destino_cidade)}${c.destino_bairro ? ` (${esc(c.destino_bairro)})` : ''}/${esc(c.destino_uf)}</p>
      <p style="margin:4px 0;"><b>Carga:</b> ${esc(carga)}</p>
      <table style="width:100%; border-collapse:collapse; margin-top:14px; font-size:14px;">
        <thead><tr><th style="text-align:left; border-bottom:1px solid #d0d5dd; padding:6px 4px;">Composição do frete</th><th style="text-align:right; border-bottom:1px solid #d0d5dd; padding:6px 4px;">Valor</th></tr></thead>
        <tbody>${(c.componentes || []).map((x) => `<tr><td style="padding:5px 4px; border-bottom:1px solid #eef0f4;">${esc(x.xNome)}</td><td style="padding:5px 4px; text-align:right; border-bottom:1px solid #eef0f4;">${moeda(x.vComp)}</td></tr>`).join('')}
        <tr><td style="padding:8px 4px; font-weight:bold; font-size:16px;">Total do frete</td><td style="padding:8px 4px; text-align:right; font-weight:bold; font-size:18px; color:#2f5bea;">${moeda(c.valor_total)}</td></tr></tbody></table>
      ${c.prazo_dias ? `<p style="margin:10px 0 4px;"><b>Prazo de entrega:</b> ${n(c.prazo_dias)} dia(s) útil(eis) após a coleta.</p>` : ''}
      <p style="margin:4px 0;"><b>Frete pago por:</b> ${c.cliente_papel === 'destinatario' ? 'destinatário (FOB)' : 'remetente (CIF)'}.</p>
      ${c.observacao ? `<p style="margin:10px 0 4px;"><b>Observações:</b> ${esc(c.observacao)}</p>` : ''}
      ${condicoes ? `<div style="margin-top:14px; font-size:12px; color:#475467; white-space:pre-line; border-top:1px solid #eef0f4; padding-top:10px;"><b>Condições gerais</b>\n${esc(condicoes)}</div>` : ''}
      <p style="margin-top:18px; font-size:13px;">Para aprovar, responda esta mensagem ou fale com a gente${e.telefone ? ` pelo ${esc(foneFmt(e.telefone))}` : ''}, informando o número da cotação.</p>
    </div>`;
  if (paraEmail) return corpo;
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>Cotação ${c.id} — ${esc(nomeEmpresa)}</title>
    <style>@page { size: A4; margin: 14mm; } body { margin: 0; padding: 16px; background: #fff; } button { margin: 0 0 14px; padding: 8px 16px; } @media print { button { display: none; } body { padding: 0; } }</style></head>
    <body><button onclick="window.print()">Imprimir / salvar em PDF</button>${corpo}</body></html>`;
}

function textoWhatsapp(c, e) {
  const nomeEmpresa = e.nome_fantasia || e.razao_social || 'Transportadora';
  return [
    `*Cotação de frete nº ${c.id} — ${nomeEmpresa}*`,
    `${c.origem_cidade}/${c.origem_uf} → ${c.destino_cidade}/${c.destino_uf}`,
    [c.volumes ? `${n(c.volumes)} vol.` : '', c.peso_kg ? `${n(c.peso_kg, 1)} kg` : '', c.valor_mercadoria ? `NF ${moeda(c.valor_mercadoria)}` : ''].filter(Boolean).join(' · '),
    `*Frete: ${moeda(c.valor_total)}*${c.prazo_dias ? ` · prazo ${n(c.prazo_dias)} dia(s) útil(eis)` : ''}`,
    `Válida até ${diaBr(c.validade)}. Para aprovar, é só responder com o número da cotação.`,
  ].filter(Boolean).join('\n');
}

// ---------- Preço combinado no CT-e ----------
// Põe os componentes da cotação no CT-e (rascunho), com o ICMS recalculado.
function aplicarNoCte(dados, cot, e) {
  const comps = (cot.componentes || []).map((x) => ({ xNome: x.xNome, vComp: centavos(x.vComp) }));
  const total = centavos(comps.reduce((s, x) => s + x.vComp, 0));
  dados.valores = { ...(dados.valores || {}), vTPrest: total, componentes: comps };
  const ini = dados.inicio?.UF; const fim = dados.fim?.UF;
  const cst = dados.icms?.cst || ([1, 4].includes(Number(e.crt)) ? 'SN' : (e.cte_cst_padrao || '00'));
  const aliq = dados.icms?.pICMS || (ini && fim && ini !== fim ? aliquotaInterestadual(ini, fim) : Number(e.cte_aliquota_interna) || null);
  dados.icms = ['00', '20', '90', 'OUTRAUF'].includes(cst) && aliq ? { ...dados.icms, cst, pICMS: aliq, vBC: total, vICMS: centavos((total * aliq) / 100) } : { ...(dados.icms || {}), cst };
  const aviso = `Valores da cotação nº ${cot.id} (preço combinado com o cliente).`;
  dados.avisosImportacao = [...(dados.avisosImportacao || []).filter((a) => !/^frete não calculado/.test(a)), aviso];
  return dados;
}

async function cotacaoDaColeta(coletaId) {
  const { rows } = await pool.query('SELECT t.* FROM coletas c JOIN cotacoes t ON t.id = c.cotacao_id WHERE c.id = $1', [coletaId]);
  return rows[0] || null;
}

module.exports = { STATUS, lerCotacao, lerComponentes, calcular, criar, alterar, situacao, propostaHtml, textoWhatsapp, aplicarNoCte, cotacaoDaColeta, empresa, hojeBr };
