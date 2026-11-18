// Etiqueta de volume da NF-e (embarcador), no padrão do ERP: 10 × 7 cm, uma por volume da nota.
//   DESTINATÁRIO (nome em destaque) · rua, número · bairro · cidade/UF · CEP · transportadora
//   Volumes: 1 / 68 · Pedido · Nota
// Os dados saem do XML da NF-e (destinatário, transportadora e volumes); sem XML, do registro da nota.
// Três saídas: HTML (impressão pelo navegador com o driver da Zebra), ZPL (arquivo) e envio direto para a Zebra
// na rede (porta 9100, configurada em empresa.zebra_ip/zebra_porta/zebra_dpi).
const net = require('net');
const pool = require('./db');
const { consultaCliente } = require('./permissoes');

const LARGURA_MM = 100; const ALTURA_MM = 70;
const MAX_ETIQUETAS = 3000;
const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const semAcento = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[\^~\\]/g, ' ');
const cepFmt = (c) => { const d = String(c || '').replace(/\D/g, ''); return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : d; };

// "1-5,8,10-12" → [1,2,3,4,5,8,10,11,12] dentro de 1..total. Vazio ou "todos" = todos.
function volumesDaFaixa(faixa, total) {
  const t = String(faixa || '').trim().toLowerCase();
  if (!t || t === 'todos') return Array.from({ length: total }, (_, i) => i + 1);
  const set = new Set();
  for (const parte of t.split(/[,;\s]+/).filter(Boolean)) {
    const m = parte.match(/^(\d+)(?:-(\d+))?$/);
    if (!m) continue;
    const a = Number(m[1]); const b = m[2] ? Number(m[2]) : a;
    for (let v = Math.max(1, Math.min(a, b)); v <= Math.min(total, Math.max(a, b)); v += 1) set.add(v);
  }
  return [...set].sort((x, y) => x - y);
}

// Destinatário, transportadora e volumes do XML da NF-e.
function doXml(xml) {
  try {
    const { inf } = require('./notasFiscais').lerXml(xml);
    const d = inf.dest || {}; const e = d.enderDest || {};
    const vols = [].concat(inf.transp?.vol || []);
    const qVol = vols.reduce((s, v) => s + (Number(v?.qVol) || 0), 0);
    return {
      nome: d.xNome, rua: [e.xLgr, e.nro].filter((x) => x != null && String(x).trim()).join(', '), complemento: e.xCpl,
      bairro: e.xBairro, cidade: e.xMun, uf: e.UF, cep: e.CEP, transportadora: inf.transp?.transporta?.xNome, volumes: qVol || null,
    };
  } catch { return {}; }
}

// ids: notas (registros); faixas: { [id]: "1-5" }. Devolve a lista de etiquetas, na ordem das notas.
async function etiquetasDasNotas(req, ids, faixas = {}) {
  const lista = [...new Set(ids.map(Number).filter((n) => Number.isInteger(n) && n > 0))].slice(0, 500);
  if (!lista.length) return [];
  const { rows } = await consultaCliente(req, `SELECT f.id, f.numero_nf, f.numero_pedido, f.cliente, f.cidade, f.uf, f.bairro, f.qtd_volumes,
      f.transportadora_nfe, f.transportadora, f.xml_nfe_original FROM fretes f WHERE f.id = ANY($1)`, [lista], { comCteCancelado: true });
  const porId = new Map(rows.map((r) => [r.id, r]));
  const etiquetas = [];
  for (const id of lista) {
    const r = porId.get(id); if (!r) continue;
    const x = r.xml_nfe_original ? doXml(r.xml_nfe_original) : {};
    const total = Math.max(1, Number(x.volumes || r.qtd_volumes) || 1);
    const base = {
      nome: x.nome || r.cliente || '', rua: x.rua || '', complemento: x.complemento || '', bairro: x.bairro || r.bairro || '',
      cidade: x.cidade || r.cidade || '', uf: x.uf || r.uf || '', cep: cepFmt(x.cep), transportadora: x.transportadora || r.transportadora_nfe || r.transportadora || '',
      pedido: r.numero_pedido || '', nota: r.numero_nf || '', total,
    };
    for (const v of volumesDaFaixa(faixas[id] ?? faixas[String(id)], total)) {
      etiquetas.push({ ...base, volume: v });
      if (etiquetas.length >= MAX_ETIQUETAS) return etiquetas;
    }
  }
  return etiquetas;
}

// Página para imprimir pelo navegador (driver da Zebra, papel 100 × 70 mm, margens nenhuma).
function html(etiquetas) {
  const pag = etiquetas.map((t) => `<section class="et">
      <div class="nome">${esc(t.nome)}</div>
      <div class="l">${esc(t.rua)}${t.complemento ? ` <small>${esc(t.complemento)}</small>` : ''}</div>
      <div class="l duas"><span>${esc(t.bairro)}</span><span>${esc(t.cidade)}${t.uf ? `/${esc(t.uf)}` : ''}</span></div>
      <div class="l">${esc(t.cep)}</div>
      <div class="l">${esc(t.transportadora)}</div>
      <div class="vol">Volumes: <b>${t.volume}</b> / <b>${t.total}</b></div>
      <div class="ped"><span>Pedido: <b>${esc(t.pedido)}</b></span><span>Nota: <b>${esc(t.nota)}</b></span></div>
    </section>`).join('');
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>Etiquetas das notas (${etiquetas.length})</title><style>
    @page { size: ${LARGURA_MM}mm ${ALTURA_MM}mm; margin: 0; }
    * { box-sizing: border-box; } body { margin: 0; font-family: "Arial Narrow", Arial, Helvetica, sans-serif; color: #000; background: #fff; }
    .et { width: ${LARGURA_MM}mm; height: ${ALTURA_MM}mm; padding: 4mm 5mm; display: flex; flex-direction: column; gap: 1.6mm; overflow: hidden; page-break-after: always; break-after: page; }
    .nome { font-size: 15pt; font-weight: 700; line-height: 1.1; text-transform: uppercase; max-height: 12mm; overflow: hidden; }
    .l { font-size: 11pt; font-weight: 700; line-height: 1.15; text-transform: uppercase; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .l small { font-size: 9pt; font-weight: 400; }
    .duas { display: flex; gap: 4mm; } .duas span:first-child { flex: 1; overflow: hidden; text-overflow: ellipsis; } .duas span:last-child { flex: 1.1; }
    .vol { font-family: Arial, Helvetica, sans-serif; font-size: 14pt; font-weight: 700; margin-top: auto; }
    .vol b { font-size: 16pt; }
    .ped { font-family: Arial, Helvetica, sans-serif; font-size: 14pt; font-weight: 700; display: flex; gap: 6mm; } .ped span:first-child { flex: 1; }
    .ped b { font-size: 15pt; }
    .acoes { padding: 10px; font-family: Arial; } .acoes button { padding: 8px 14px; }
    @media screen { body { background: #ddd; } .et { background: #fff; margin: 8px auto; box-shadow: 0 1px 4px rgba(0,0,0,.25); } }
    @media print { .acoes { display: none; } }
  </style></head><body><div class="acoes"><button onclick="window.print()">🖨 Imprimir ${etiquetas.length} etiqueta(s)</button>
    <span style="font-size:12px; color:#444;">Na Zebra, escolha o papel ${LARGURA_MM} × ${ALTURA_MM} mm, margens "nenhuma" e escala 100%.</span></div>${pag}</body></html>`;
}

// ZPL para Zebra (203 dpi = 8 pontos/mm; 300 dpi = 11,8). Texto sem acentos (fonte padrão 0).
function zpl(etiquetas, { dpi = 203 } = {}) {
  const k = Number(dpi) >= 300 ? 12 : 8;   // pontos por mm: 203 dpi = 8 (padrão Zebra), 300 dpi = 12
  const p = (mm) => Math.round(mm * k);
  const txt = (t, n) => semAcento(t).toUpperCase().replace(/\s+/g, ' ').trim().slice(0, n);
  // A fonte 0 da Zebra (condensada) estreita pela largura: texto longo encolhe na largura para caber numa linha
  // (texto que passa do bloco ^FB seria impresso por cima). 0,6 = largura média de um caractere em relação à largura da fonte.
  const campo = (x, y, alt, larg, texto, { linhas = 1 } = {}) => {
    const porLinha = Math.max(1, Math.ceil(String(texto).length / linhas));
    const w = Math.max(p(alt * 0.45), Math.min(p(alt * 0.82), Math.floor(p(larg) / (porLinha * 0.6))));
    return `^FO${p(x)},${p(y)}^A0N,${p(alt)},${w}^FB${p(larg)},${linhas},${p(0.6)},L,0^FD${texto}^FS`;
  };
  return etiquetas.map((t) => {
    const nome = txt(t.nome, 70);
    const duas = nome.length > 26;
    const y0 = duas ? 16 : 12;
    return [
      `^XA^CI28^PW${p(LARGURA_MM)}^LL${p(ALTURA_MM)}^LH0,0`,
      campo(5, 4, duas ? 5 : 6.2, 90, nome, { linhas: duas ? 2 : 1 }),
      campo(5, y0, 4.4, 90, txt(t.rua + (t.complemento ? ` ${t.complemento}` : ''), 60)),
      campo(5, y0 + 6.5, 4.4, 44, txt(t.bairro, 30)),
      campo(52, y0 + 6.5, 4.4, 44, txt(`${t.cidade}${t.uf ? `/${t.uf}` : ''}`, 30)),
      campo(5, y0 + 13, 4.4, 60, txt(t.cep, 12)),
      campo(5, y0 + 19.5, 4.4, 90, txt(t.transportadora, 60)),
      campo(5, 50, 6, 90, `VOLUMES:   ${t.volume}  /  ${t.total}`),
      campo(5, 59, 6, 45, `PEDIDO: ${txt(t.pedido, 14)}`),
      campo(52, 59, 6, 44, `NOTA: ${txt(t.nota, 12)}`),
      '^XZ',
    ].join('\n');
  }).join('\n');
}

// Manda o ZPL para a Zebra na rede (porta RAW 9100).
function enviarParaZebra(texto, { ip, porta = 9100 } = {}) {
  return new Promise((ok, falhou) => {
    if (!ip) { falhou(Object.assign(new Error('Informe o IP da impressora Zebra (botão Impressora).'), { status: 400 })); return; }
    const s = net.createConnection({ host: ip, port: Number(porta) || 9100 });
    const tempo = setTimeout(() => { s.destroy(); falhou(Object.assign(new Error(`A impressora ${ip}:${porta} não respondeu em 8 segundos. Confira se ela está ligada e na mesma rede do servidor.`), { status: 502 })); }, 8000);
    s.on('error', (e) => { clearTimeout(tempo); falhou(Object.assign(new Error(`Não consegui falar com a impressora ${ip}:${porta} (${e.code || e.message}).`), { status: 502 })); });
    s.on('connect', () => { s.end(texto, 'utf8', () => { clearTimeout(tempo); ok(); }); });
  });
}

async function config() {
  const { rows: [e] } = await pool.query('SELECT zebra_ip, zebra_porta, zebra_dpi FROM empresa WHERE id = 1').catch(() => ({ rows: [] }));
  return { ip: e?.zebra_ip || '', porta: e?.zebra_porta || 9100, dpi: e?.zebra_dpi || 203 };
}
async function salvarConfig(b = {}) {
  const ip = String(b.ip || '').trim();
  if (ip && !/^[A-Za-z0-9.-]{1,60}$/.test(ip)) throw Object.assign(new Error('IP ou nome da impressora inválido.'), { status: 400 });
  const porta = Number(b.porta) || 9100;
  if (porta < 1 || porta > 65535) throw Object.assign(new Error('Porta inválida.'), { status: 400 });
  const dpi = Number(b.dpi) >= 300 ? 300 : 203;
  await pool.query('UPDATE empresa SET zebra_ip = $1, zebra_porta = $2, zebra_dpi = $3 WHERE id = 1', [ip || null, porta, dpi]);
  return config();
}

module.exports = { volumesDaFaixa, etiquetasDasNotas, html, zpl, enviarParaZebra, config, salvarConfig, LARGURA_MM, ALTURA_MM };
