// Etiqueta de volume da NF-e (embarcador), no padrão do ERP: 10 × 7 cm, uma por volume da nota, em quadros:
//   logo | Remetente (nome, endereço, CEP) | Pedido | NF-e | Volume "1 de 68"
//   Destinatário (nome em destaque) · Endereço de entrega (rua, número, complemento, bairro; cidade - UF | CEP)
//   Transportadora | Peso líquido | Peso bruto
// Os dados saem do XML da NF-e (emitente, destinatário, transportadora, volumes e pesos); sem XML, do registro da nota.
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

// Remetente, destinatário, transportadora, volumes e pesos do XML da NF-e.
function doXml(xml) {
  try {
    const { inf } = require('./notasFiscais').lerXml(xml);
    const d = inf.dest || {}; const e = d.enderDest || {};
    const em = inf.emit || {}; const ee = em.enderEmit || {};
    const vols = [].concat(inf.transp?.vol || []);
    const soma = (c) => vols.reduce((s, v) => s + (Number(v?.[c]) || 0), 0);
    const qVol = soma('qVol');
    const juntar = (...p) => p.filter((x) => x != null && String(x).trim()).join(', ');
    return {
      nome: d.xNome, rua: juntar(e.xLgr, e.nro), complemento: e.xCpl,
      bairro: e.xBairro, cidade: e.xMun, uf: e.UF, cep: e.CEP, transportadora: inf.transp?.transporta?.xNome, volumes: qVol || null,
      remetente: em.xNome, remetenteCnpj: em.CNPJ || em.CPF,
      remetenteEndereco: [juntar(ee.xLgr, ee.nro), ee.xBairro, [ee.xMun, ee.UF].filter(Boolean).join('/')].filter((x) => x && String(x).trim()).join(' - '),
      remetenteCep: ee.CEP, pesoLiquido: soma('pesoL') || null, pesoBruto: soma('pesoB') || null,
    };
  } catch { return {}; }
}

// Transportadora da etiqueta: a do XML; senão a do CT-e; senão a do registro; senão o redespacho escrito na nota.
function transportadoraDe(r, x = {}) {
  const red = (() => { try { const e = typeof r.redespacho_endereco === 'string' ? JSON.parse(r.redespacho_endereco) : r.redespacho_endereco; return e?.nome || r.redespacho || ''; } catch { return r.redespacho || ''; } })();
  return x.transportadora || r.transportadora_nfe || r.transportadora_cte || r.transportadora || (red ? `REDESP. ${red}` : '');
}

const pesoFmt = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) || Number(v) <= 0) ? ''
  : `${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg`;
const dig = (v) => String(v || '').replace(/\D/g, '');

// ids: notas (registros); faixas: { [id]: "1-5" }; transps: { [id]: "NOME" } (a transportadora digitada na tela, que
// vale no lugar da encontrada). Devolve a lista de etiquetas, na ordem das notas.
// O logo da empresa (Cadastros » Empresa) entra quando a empresa é a remetente da nota (mesmo CNPJ), como na DANFE.
async function etiquetasDasNotas(req, ids, faixas = {}, transps = {}) {
  const lista = [...new Set(ids.map(Number).filter((n) => Number.isInteger(n) && n > 0))].slice(0, 500);
  if (!lista.length) return [];
  const { rows } = await consultaCliente(req, `SELECT f.id, f.numero_nf, f.numero_pedido, f.cliente, f.cidade, f.uf, f.bairro, f.qtd_volumes,
      f.transportadora_nfe, f.transportadora_cte, f.transportadora, f.redespacho, f.redespacho_endereco, f.xml_nfe_original,
      f.emitente_nome, f.emitente_cnpj, f.peso_liquido::float AS peso_liquido, f.peso_bruto::float AS peso_bruto FROM fretes f WHERE f.id = ANY($1)`, [lista], { comCteCancelado: true });
  const { rows: [emp] } = await pool.query('SELECT logo, cnpj FROM empresa WHERE id = 1').catch(() => ({ rows: [] }));
  const porId = new Map(rows.map((r) => [r.id, r]));
  const etiquetas = [];
  for (const id of lista) {
    const r = porId.get(id); if (!r) continue;
    const x = r.xml_nfe_original ? doXml(r.xml_nfe_original) : {};
    const total = Math.max(1, Number(x.volumes || r.qtd_volumes) || 1);
    const cnpjRem = dig(x.remetenteCnpj || r.emitente_cnpj);
    const base = {
      nome: x.nome || r.cliente || '', rua: x.rua || '', complemento: x.complemento || '', bairro: x.bairro || r.bairro || '',
      cidade: x.cidade || r.cidade || '', uf: x.uf || r.uf || '', cep: cepFmt(x.cep),
      transportadora: (transps[id] ?? transps[String(id)]) != null ? String(transps[id] ?? transps[String(id)]).slice(0, 80) : transportadoraDe(r, x),
      pedido: r.numero_pedido || '', nota: r.numero_nf || '', total,
      remetente: x.remetente || r.emitente_nome || '', remetenteEndereco: x.remetenteEndereco || '', remetenteCep: cepFmt(x.remetenteCep),
      pesoLiquido: pesoFmt(x.pesoLiquido ?? r.peso_liquido), pesoBruto: pesoFmt(x.pesoBruto ?? r.peso_bruto),
      logo: emp?.logo && (!dig(emp.cnpj) || !cnpjRem || dig(emp.cnpj) === cnpjRem) ? emp.logo : '',
    };
    for (const v of volumesDaFaixa(faixas[id] ?? faixas[String(id)], total)) {
      etiquetas.push({ ...base, volume: v });
      if (etiquetas.length >= MAX_ETIQUETAS) return etiquetas;
    }
  }
  return etiquetas;
}

// Endereço de entrega em duas linhas: "Rua A, 49 - 1601 - Bairro" e "Cidade - UF | CEP: 00000-000".
const linhaRua = (t) => [t.rua, t.complemento, t.bairro].filter((x) => x && String(x).trim()).join(' - ');
const linhaCidade = (t) => [[t.cidade, t.uf].filter(Boolean).join(' - '), t.cep ? `CEP: ${t.cep}` : ''].filter(Boolean).join(' | ');

// Página para imprimir pelo navegador (driver da Zebra, papel 100 × 70 mm, margens nenhuma).
// Layout em quadros: logo | Remetente | Pedido | NF-e | Volume; Destinatário; Endereço de entrega;
// Transportadora | Peso líquido | Peso bruto.
function html(etiquetas) {
  const logoOk = (l) => /^data:image\/(png|jpe?g|gif|webp);base64,[A-Za-z0-9+/=]+$/.test(String(l || ''));
  // Fonte pelo tamanho do texto, para caber no quadro sem cortar.
  const tam = (t, faixas) => { const n = String(t ?? '').length; for (const [ate, pt] of faixas) if (n <= ate) return pt; return faixas[faixas.length - 1][1]; };
  const num = (v) => `<span style="font-size:${tam(v, [[5, 10], [7, 8.5], [9, 7], [99, 6]])}pt">${esc(v)}</span>`;
  const pag = etiquetas.map((t) => {
    const comLogo = logoOk(t.logo);
    return `<section class="et">
      <div class="lin topo${comLogo ? '' : ' sem-logo'}">
        ${comLogo ? `<div class="q logo"><img src="${t.logo}" alt=""></div>` : ''}
        <div class="q rem"><b>Remetente:</b><div class="rn">${esc(t.remetente)}</div><div class="re">${esc(t.remetenteEndereco)}</div>${t.remetenteCep ? `<div class="re">CEP: ${esc(t.remetenteCep)}</div>` : ''}</div>
        <div class="q num"><b>Pedido</b>${num(t.pedido)}</div>
        <div class="q num"><b>NF-e</b>${num(t.nota)}</div>
        <div class="q num"><b>Volume</b>${num(`${t.volume} de ${t.total}`)}</div>
      </div>
      <div class="lin q dest"><b>Destinatário:</b><div class="dn" style="font-size:${tam(t.nome, [[30, 14], [44, 11.5], [999, 9.5]])}pt">${esc(t.nome)}</div></div>
      <div class="lin q end"><b>Endereço de entrega:</b><div class="el">${esc(linhaRua(t))}</div><div class="el">${esc(linhaCidade(t))}</div></div>
      <div class="lin base">
        <div class="q tr"><b>Transportadora</b><span>${esc(t.transportadora)}</span></div>
        <div class="q pe"><b>Peso Líquido</b><span>${esc(t.pesoLiquido)}</span></div>
        <div class="q pe"><b>Peso Bruto</b><span>${esc(t.pesoBruto)}</span></div>
      </div>
    </section>`;
  }).join('');
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>Etiquetas das notas (${etiquetas.length})</title><style>
    @page { size: ${LARGURA_MM}mm ${ALTURA_MM}mm; margin: 0; }
    * { box-sizing: border-box; } body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #000; background: #fff; }
    .et { width: ${LARGURA_MM}mm; height: ${ALTURA_MM}mm; padding: 2mm; overflow: hidden; page-break-after: always; break-after: page;
      display: grid; grid-template-rows: 15mm 14mm 22mm 1fr; }
    .lin { border: 0.3mm solid #000; border-top: none; overflow: hidden; } .lin.topo { border-top: 0.3mm solid #000; }
    .q { padding: 0.8mm 1.4mm; overflow: hidden; } .q > b { display: block; font-size: 6.5pt; }
    .topo { display: grid; grid-template-columns: 18mm 1fr 15mm 12mm 14mm; } .topo.sem-logo { grid-template-columns: 1fr 15mm 12mm 14mm; }
    .topo > .q + .q, .base > .q + .q { border-left: 0.3mm solid #000; }
    .logo { display: flex; align-items: center; justify-content: center; padding: 1mm; } .logo img { max-width: 100%; max-height: 100%; object-fit: contain; }
    .rn { font-size: 7pt; font-weight: 700; line-height: 1.1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .re { font-size: 6pt; line-height: 1.15; max-height: 4.4mm; overflow: hidden; }
    .num { padding-left: 0.6mm; padding-right: 0.6mm; display: flex; flex-direction: column; align-items: center; text-align: center; } .num > b { font-size: 7pt; }
    .num span { margin-top: auto; margin-bottom: auto; font-size: 10pt; font-weight: 700; white-space: nowrap; }
    .dest .dn { font-weight: 700; line-height: 1.1; text-transform: uppercase; max-height: 9.6mm; overflow: hidden; margin-top: 0.6mm; }
    .end .el { font-size: 11pt; font-weight: 700; line-height: 1.25; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 0.8mm; }
    .base { display: grid; grid-template-columns: 1fr 22mm 22mm; }
    .base span { display: block; font-size: 10pt; font-weight: 700; line-height: 1.15; margin-top: 1mm; max-height: 8.2mm; overflow: hidden; }
    .tr span { text-transform: uppercase; font-size: 9pt; } .pe span { white-space: nowrap; }
    .acoes { padding: 10px; font-family: Arial; } .acoes button { padding: 8px 14px; }
    @media screen { body { background: #ddd; } .et { background: #fff; margin: 8px auto; box-shadow: 0 1px 4px rgba(0,0,0,.25); } }
    @media print { .acoes { display: none; } }
  </style></head><body><div class="acoes"><button onclick="window.print()">Imprimir ${etiquetas.length} etiqueta(s)</button>
    <span style="font-size:12px; color:#444;">Na Zebra, escolha o papel ${LARGURA_MM} × ${ALTURA_MM} mm, margens "nenhuma" e escala 100%.</span></div>${pag}</body></html>`;
}

// Logo PNG da empresa em ^GFA (preto e branco), cabendo em larg × alt pontos. JPEG ou outro formato: sem logo no ZPL.
function logoGfa(dataUrl, larg, alt) {
  try {
    const m = String(dataUrl || '').match(/^data:image\/png;base64,(.+)$/); if (!m) return null;
    const png = require('pngjs').PNG.sync.read(Buffer.from(m[1], 'base64'));
    const esc2 = Math.min(larg / png.width, alt / png.height);
    const w = Math.max(1, Math.floor(png.width * esc2)); const h = Math.max(1, Math.floor(png.height * esc2));
    const bpl = Math.ceil(w / 8); const bytes = Buffer.alloc(bpl * h);
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const i = (Math.min(png.height - 1, Math.floor(y / esc2)) * png.width + Math.min(png.width - 1, Math.floor(x / esc2))) * 4;
        const a = png.data[i + 3] / 255; const lum = (0.299 * png.data[i] + 0.587 * png.data[i + 1] + 0.114 * png.data[i + 2]) * a + 255 * (1 - a);
        if (lum < 140) bytes[y * bpl + (x >> 3)] |= 0x80 >> (x & 7);
      }
    }
    return { w, h, gf: `^GFA,${bytes.length},${bytes.length},${bpl},${bytes.toString('hex').toUpperCase()}` };
  } catch { return null; }
}

// ZPL para Zebra (203 dpi = 8 pontos/mm; 300 dpi = 11,8). Texto sem acentos (fonte padrão 0). Mesmo layout do HTML.
function zpl(etiquetas, { dpi = 203 } = {}) {
  const k = Number(dpi) >= 300 ? 12 : 8;   // pontos por mm: 203 dpi = 8 (padrão Zebra), 300 dpi = 12
  const p = (mm) => Math.round(mm * k);
  const txt = (t, n) => semAcento(t).toUpperCase().replace(/\s+/g, ' ').trim().slice(0, n);
  // A fonte 0 da Zebra (condensada) estreita pela largura: texto longo encolhe na largura para caber numa linha
  // (texto que passa do bloco ^FB seria impresso por cima). 0,6 = largura média de um caractere em relação à largura da fonte.
  const campo = (x, y, alt, larg, texto, { linhas = 1, al = 'L' } = {}) => {
    const porLinha = Math.max(1, Math.ceil(String(texto).length / linhas));
    const w = Math.max(p(alt * 0.45), Math.min(p(alt * 0.82), Math.floor(p(larg) / (porLinha * 0.6))));
    return `^FO${p(x)},${p(y)}^A0N,${p(alt)},${w}^FB${p(larg)},${linhas},${p(0.6)},${al},0^FD${texto}^FS`;
  };
  const caixa = (x, y, w, h, t = 0.3) => `^FO${p(x)},${p(y)}^GB${p(w)},${p(h)},${Math.max(2, p(t))}^FS`;
  const cacheLogo = new Map();
  // Quadros (mm): borda de 2 a 98 × 2 a 68; linhas em 17, 31 e 53.
  return etiquetas.map((t) => {
    if (!cacheLogo.has(t.logo || '')) cacheLogo.set(t.logo || '', t.logo ? logoGfa(t.logo, p(16), p(13)) : null);
    const lg = cacheLogo.get(t.logo || '');
    const xr = lg ? 20 : 2;   // início do quadro do remetente
    const nome = txt(t.nome, 70); const duas = nome.length > 30;
    const transp = txt(t.transportadora, 70); const tDuas = transp.length > 30;
    const ruaL = txt(linhaRua(t), 70); const cidL = txt(linhaCidade(t), 60);
    return [
      `^XA^CI28^PW${p(LARGURA_MM)}^LL${p(ALTURA_MM)}^LH0,0`,
      caixa(2, 2, 96, 66),
      caixa(2, 17, 96, 0), caixa(2, 31, 96, 0), caixa(2, 53, 96, 0),
      lg ? caixa(20, 2, 0, 15) : '', caixa(60, 2, 0, 15), caixa(73, 2, 0, 15), caixa(85, 2, 0, 15),
      caixa(54, 53, 0, 15), caixa(76, 53, 0, 15),
      lg ? `^FO${p(3) + Math.floor((p(16) - lg.w) / 2)},${p(3) + Math.floor((p(13) - lg.h) / 2)}${lg.gf}^FS` : '',
      campo(xr + 1.2, 3, 2.2, 60 - xr - 2.4, 'REMETENTE:'),
      campo(xr + 1.2, 5.6, 2.6, 60 - xr - 2.4, txt(t.remetente, 50)),
      campo(xr + 1.2, 8.6, 2, 60 - xr - 2.4, txt(t.remetenteEndereco, 90), { linhas: 2 }),
      t.remetenteCep ? campo(xr + 1.2, 14, 2, 60 - xr - 2.4, `CEP: ${txt(t.remetenteCep, 10)}`) : '',
      campo(60.5, 3.3, 2.4, 12, 'PEDIDO', { al: 'C' }), campo(60.5, 9, 3.6, 12, txt(t.pedido, 12), { al: 'C' }),
      campo(73.5, 3.3, 2.4, 11, 'NF-E', { al: 'C' }), campo(73.5, 9, 3.6, 11, txt(t.nota, 10), { al: 'C' }),
      campo(85.5, 3.3, 2.4, 12, 'VOLUME', { al: 'C' }), campo(85.5, 9, 3.6, 12, `${t.volume} DE ${t.total}`, { al: 'C' }),
      campo(3.4, 18.3, 2.4, 93, 'DESTINATARIO:'),
      campo(3.4, 21.6, duas ? 4 : 5.4, 93, nome, { linhas: duas ? 2 : 1 }),
      campo(3.4, 32.3, 2.4, 93, 'ENDERECO DE ENTREGA:'),
      campo(3.4, 36.5, 4.4, 93, ruaL),
      campo(3.4, 43.5, 4.4, 93, cidL),
      campo(3.4, 54.3, 2.4, 50, 'TRANSPORTADORA'),
      campo(3.4, 57.8, tDuas ? 3.2 : 4, 50, transp, { linhas: tDuas ? 2 : 1 }),
      campo(55.2, 54.3, 2.4, 20, 'PESO LIQUIDO'), campo(55.2, 59, 3.8, 20, txt(t.pesoLiquido, 16)),
      campo(77.2, 54.3, 2.4, 20, 'PESO BRUTO'), campo(77.2, 59, 3.8, 20, txt(t.pesoBruto, 16)),
      '^XZ',
    ].filter(Boolean).join('\n');
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

module.exports = { doXml, transportadoraDe, volumesDaFaixa, etiquetasDasNotas, html, zpl, enviarParaZebra, config, salvarConfig, LARGURA_MM, ALTURA_MM };
