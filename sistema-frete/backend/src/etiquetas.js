// Etiquetas de volume (uma por volume do CT-e, "VOL 3/12") com código de
// barras Code 128, em HTML para qualquer impressora (térmica com driver ou
// A4) e em ZPL para mandar direto à Zebra/Argox. O mesmo código é lido na
// conferência de carga e de descarga.
const pool = require('./db');
const { code128Svg } = require('./cte/codigoBarras');

// 77 + id do CT-e (8 dígitos) + volume (4 dígitos) = 14 dígitos (Code 128 C, compacto).
const PREFIXO = '77';
const FORMATOS = { '100x150': { l: 100, a: 150 }, '100x100': { l: 100, a: 100 }, '100x50': { l: 100, a: 50 } };
const MAX_VOLUMES = 999;

const codigoVolume = (cteId, volume) => `${PREFIXO}${String(cteId).padStart(8, '0')}${String(volume).padStart(4, '0')}`;

// O que foi lido: { cteId, volume } (etiqueta), { chave } (DACTE) ou null.
function lerCodigo(texto) {
  const d = String(texto || '').replace(/\D/g, '');
  if (d.length === 14 && d.startsWith(PREFIXO)) {
    const cteId = Number(d.slice(2, 10)); const volume = Number(d.slice(10));
    return cteId > 0 && volume > 0 ? { cteId, volume } : null;
  }
  if (d.length === 44 && d.slice(20, 22) === '57') return { chave: d };   // chave do CT-e (modelo 57)
  return null;
}

// Volumes declarados no CT-e (quantidade com unidade "03 - UNIDADE"/VOLUMES); sem isso, 1.
function volumesDoCte(dados) {
  const q = (dados?.carga?.quantidades || []).filter((x) => String(x.cUnid) === '03' || /VOLUME/i.test(x.tpMed || ''))
    .reduce((s, x) => s + (Number(x.qCarga) || 0), 0);
  return Math.min(Math.max(Math.round(q) || 1, 1), MAX_VOLUMES);
}

const nfDaChave = (c) => (String(c).length === 44 ? String(Number(String(c).slice(25, 34))) : null);
const peso = (dados) => (dados?.carga?.quantidades || []).filter((x) => String(x.cUnid) === '01' || /PESO/i.test(x.tpMed || '')).reduce((s, x) => s + (Number(x.qCarga) || 0), 0);

// Lista de etiquetas dos CT-e (só autorizados), na ordem pedida.
async function etiquetasDosCtes(ids, { volumes = null } = {}) {
  const lista = [...new Set((ids || []).map(Number).filter(Number.isInteger))];
  if (!lista.length) throw Object.assign(new Error('Escolha pelo menos um CT-e.'), { status: 400 });
  const { rows } = await pool.query(`SELECT id, serie, numero, chave, status, dados, autorizado_em FROM ctes_emitidos WHERE id = ANY($1::int[])`, [lista]);
  const porId = new Map(rows.map((r) => [r.id, r]));
  const etiquetas = [];
  for (const id of lista) {
    const c = porId.get(id);
    if (!c) continue;
    if (c.status !== 'autorizado') throw Object.assign(new Error(`O CT-e ${c.numero || `#${c.id}`} não está autorizado (${c.status}).`), { status: 400 });
    const d = c.dados || {};
    const total = volumesDoCte(d);
    const so = Array.isArray(volumes) && lista.length === 1 ? volumes.map(Number).filter((v) => v >= 1 && v <= total) : null;
    const dest = d.destinatario || {}; const e = dest.endereco || {};
    const base = {
      cteId: c.id, serie: c.serie, numero: c.numero, total,
      nfs: (d.nfes || []).map(nfDaChave).filter(Boolean),
      remetente: d.remetente?.xNome || '', destinatario: dest.xNome || '',
      endereco: [e.xLgr, e.nro].filter(Boolean).join(', '), bairro: e.xBairro || '', cep: e.CEP || '',
      cidade: d.fim?.xMun || e.xMun || '', uf: d.fim?.UF || e.UF || '', origem: [d.inicio?.xMun, d.inicio?.UF].filter(Boolean).join('/'),
      peso: peso(d), emissao: c.autorizado_em,
    };
    for (let v = 1; v <= total; v += 1) if (!so || so.includes(v)) etiquetas.push({ ...base, volume: v, codigo: codigoVolume(c.id, v) });
  }
  return etiquetas;
}

const esc = (v) => String(v ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const kg = (v) => (v ? `${Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} kg` : '');

function html(etiquetas, { formato = '100x100', empresa = {} } = {}) {
  const f = FORMATOS[formato] || FORMATOS['100x100'];
  const baixa = f.a <= 50;
  const nome = empresa.nome_fantasia || empresa.razao_social || '';
  const pag = etiquetas.map((t) => `<section class="et">
      <div class="topo"><b>${esc(nome)}</b><span>CT-e ${esc(t.serie)}/${esc(t.numero)}</span></div>
      <div class="dest">${esc(t.cidade)}<small>/${esc(t.uf)}</small></div>
      ${baixa ? '' : `<div class="linha"><b>${esc(t.destinatario)}</b></div>
      <div class="linha">${esc(t.endereco)}${t.bairro ? ` — ${esc(t.bairro)}` : ''}${t.cep ? ` · CEP ${esc(t.cep)}` : ''}</div>
      <div class="linha fraco">Rem.: ${esc(t.remetente)}${t.origem ? ` · ${esc(t.origem)}` : ''}</div>`}
      <div class="meio"><div class="vol">VOL <b>${t.volume}</b>/${t.total}</div><div class="info">${t.nfs.length ? `NF ${esc(t.nfs.join(', '))}<br>` : ''}${esc(kg(t.peso))}</div></div>
      <div class="barras">${code128Svg(t.codigo, { altura: baixa ? 34 : 60, modulo: 2 })}<div class="cod">${esc(t.codigo)}</div></div>
    </section>`).join('');
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>Etiquetas (${etiquetas.length})</title><style>
    @page { size: ${f.l}mm ${f.a}mm; margin: 0; }
    * { box-sizing: border-box; } body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #000; background: #fff; }
    .et { width: ${f.l}mm; height: ${f.a}mm; padding: 3mm 4mm; display: flex; flex-direction: column; gap: ${baixa ? '0.6mm' : '1.2mm'}; overflow: hidden; page-break-after: always; break-after: page; }
    .topo { display: flex; justify-content: space-between; font-size: ${baixa ? '9pt' : '10pt'}; border-bottom: 0.4mm solid #000; padding-bottom: 0.8mm; }
    .topo b { max-width: 60%; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
    .dest { font-size: ${baixa ? '17pt' : '24pt'}; font-weight: 800; line-height: 1.05; text-transform: uppercase; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
    .dest small { font-size: 60%; }
    .linha { font-size: 9.5pt; line-height: 1.2; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; } .fraco { font-size: 8.5pt; }
    .meio { display: flex; justify-content: space-between; align-items: center; border-top: 0.3mm solid #000; padding-top: 0.8mm; }
    .vol { font-size: ${baixa ? '12pt' : '15pt'}; } .vol b { font-size: ${baixa ? '18pt' : '26pt'}; } .info { text-align: right; font-size: 9pt; }
    .barras { margin-top: auto; } .cod { text-align: center; font-family: monospace; font-size: 9pt; letter-spacing: 1px; }
    .acoes { padding: 10px; font-family: Arial; } .acoes button { padding: 8px 14px; }
    @media screen { body { background: #ddd; } .et { background: #fff; margin: 8px auto; box-shadow: 0 1px 4px rgba(0,0,0,.25); } }
    @media print { .acoes { display: none; } }
  </style></head><body><div class="acoes"><button onclick="window.print()">🖨 Imprimir ${etiquetas.length} etiqueta(s)</button>
    <span style="font-size:12px; color:#444;">Na impressora térmica, escolha o papel ${f.l} × ${f.a} mm e margens "nenhuma".</span></div>${pag}</body></html>`;
}

// ZPL (Zebra / Argox em modo ZPL), 203 dpi = 8 pontos por mm. Sem acentos (fonte padrão).
const semAcento = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[\^~\\]/g, ' ');
function zpl(etiquetas, { formato = '100x100', empresa = {} } = {}) {
  const f = FORMATOS[formato] || FORMATOS['100x100'];
  const L = f.l * 8; const A = f.a * 8; const baixa = f.a <= 50;
  const corta = (t, n) => semAcento(t).slice(0, n);
  const nome = empresa.nome_fantasia || empresa.razao_social || '';
  return etiquetas.map((t) => {
    const linhas = [`^XA^CI28^PW${L}^LL${A}^LH0,0`,
      `^FO24,16^A0N,24,24^FD${corta(nome, 34)}^FS`, `^FO${L - 270},16^A0N,24,24^FDCT-e ${t.serie}/${t.numero}^FS`, `^FO24,46^GB${L - 48},2,2^FS`,
      `^FO24,58^A0N,${baixa ? 44 : 62},${baixa ? 40 : 56}^FD${corta(`${t.cidade}/${t.uf}`, baixa ? 26 : 20).toUpperCase()}^FS`];
    let y = baixa ? 110 : 132;
    if (!baixa) {
      linhas.push(`^FO24,${y}^A0N,26,26^FD${corta(t.destinatario, 44)}^FS`); y += 32;
      linhas.push(`^FO24,${y}^A0N,22,22^FD${corta(`${t.endereco}${t.bairro ? ` - ${t.bairro}` : ''}`, 56)}^FS`); y += 28;
      linhas.push(`^FO24,${y}^A0N,20,20^FDRem.: ${corta(t.remetente, 50)}^FS`); y += 30;
    }
    linhas.push(`^FO24,${y}^A0N,${baixa ? 36 : 50},${baixa ? 36 : 50}^FDVOL ${t.volume}/${t.total}^FS`);
    linhas.push(`^FO${L - 330},${y + 4}^A0N,22,22^FB306,2,0,R^FD${corta([t.nfs.length ? `NF ${t.nfs.join(',')}` : '', kg(t.peso)].filter(Boolean).join(' \\& '), 60)}^FS`);
    const alturaBarras = baixa ? 70 : 150;
    // Code 128 C com 14 dígitos ≈ 123 módulos × 3 pontos ≈ 370 pontos: centraliza.
    linhas.push(`^FO${Math.round((L - 370) / 2)},${A - alturaBarras - 46}^BY3^BCN,${alturaBarras},Y,N,N,A^FD${t.codigo}^FS`);
    linhas.push('^XZ');
    return linhas.join('\n');
  }).join('\n');
}

module.exports = { FORMATOS, codigoVolume, lerCodigo, volumesDoCte, etiquetasDosCtes, html, zpl };
