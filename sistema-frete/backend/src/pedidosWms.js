// Dados do WMS por pedido (tela Pedidos, 405): status, separação, etiquetas, usuário e cancelamento.
// Hoje entram por planilha exportada do WMS (colunas pelo nome, como na planilha de pedidos da empresa:
// "Número Pedido", "Status/WMS", "Data Inicial", "Usuário", "Data/Imp. Etq", "Qtd. Etiquetas", "Data Início",
// "Data Finalização", "Cancelado Wms", "Liberação Haila/Letícia", "Expedição"). A tabela pedidos_wms é a
// mesma que uma ligação direta com o WMS vai preencher depois (origem = 'planilha' | 'wms').
const XLSX = require('xlsx');
const pool = require('./db');

const dois = (n) => String(n).padStart(2, '0');
const semAcento = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// Data e hora: Date do Excel (hora local), número serial, "dd/mm/aaaa hh:mm[:ss]", "aaaa-mm-dd hh:mm" → 'AAAA-MM-DD HH:MM:SS'.
function dataHora(v) {
  if (v == null || v === '') return null;
  // O Excel guarda a hora como fração do dia: 10:20:00 pode chegar como 10:19:59,999. Arredonda para o segundo.
  if (v instanceof Date && !isNaN(v)) v = new Date(Math.round(v.getTime() / 1000) * 1000);
  if (v instanceof Date) return isNaN(v) ? null : `${v.getFullYear()}-${dois(v.getMonth() + 1)}-${dois(v.getDate())} ${dois(v.getHours())}:${dois(v.getMinutes())}:${dois(v.getSeconds())}`;
  if (typeof v === 'number') {
    if (v < 20000 || v > 80000) return null;   // fora de 1954..2119: não é data
    const d = XLSX.SSF.parse_date_code(v);
    return d ? `${d.y}-${dois(d.m)}-${dois(d.d)} ${dois(d.H)}:${dois(d.M)}:${dois(Math.floor(d.S))}` : null;
  }
  const t = String(v).trim();
  let m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})(?:[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (m) { const ano = m[3].length === 2 ? `20${m[3]}` : m[3]; return `${ano}-${dois(m[2])}-${dois(m[1])} ${dois(m[4] || 0)}:${m[5] || '00'}:${m[6] || '00'}`; }
  m = t.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) return `${m[1]}-${m[2]}-${m[3]} ${m[4] || '00'}:${m[5] || '00'}:${m[6] || '00'}`;
  return null;
}
const inteiro = (v) => { if (v == null || v === '' || v instanceof Date) return null; const n = Number(String(v).replace(',', '.')); return Number.isFinite(n) && n >= 0 && n < 1e6 && Number.isInteger(n) ? n : null; };
const simNao = (v) => { const t = semAcento(v); if (!t) return null; if (['s', 'sim', 'x', '1', 'true', 'cancelado', 'y'].includes(t)) return true; if (['n', 'nao', '0', 'false'].includes(t)) return false; return null; };
const texto = (v) => { if (v == null || v instanceof Date) return null; const t = String(v).trim(); return t ? t.slice(0, 120) : null; };
// Número brasileiro: "0,419", "1.234,5", "12%" (ou número do Excel).
const numeroBr = (v) => { if (v == null || v === '' || v instanceof Date) return null; if (typeof v === 'number') return Number.isFinite(v) ? v : null; let t = String(v).replace(/[%\s]/g, ''); if (!t) return null; if (/,/.test(t)) t = t.replace(/\./g, '').replace(',', '.'); const n = Number(t); return Number.isFinite(n) ? n : null; };
const pedido = (v) => { const t = String(v ?? '').trim().replace(/\.0+$/, ''); return t ? t.slice(0, 50) : null; };

// Coluna da planilha → campo. Nomes sem acento, sem pontuação e em minúsculas.
const COLUNAS = [
  // No WMS (Imperium) a Carga é o número do pedido do ERP.
  ['numero_pedido', ['numero pedido', 'nr pedido', 'pedido', 'n pedido', 'num pedido', 'cargas', 'carga', 'cod carga externo'], pedido],
  ['status', ['status wms', 'status', 'situacao wms'], texto],
  ['data_inicial', ['data inicial'], dataHora],
  ['usuario', ['usuario', 'separador'], texto],
  ['etiquetas_impressas_em', ['data imp etq', 'data impressao etiqueta', 'impressao etiquetas', 'data etiqueta'], dataHora],
  ['qtd_etiquetas', ['qtd etiquetas', 'quantidade etiquetas', 'qtde etiquetas'], inteiro],
  ['separacao_inicio', ['data inicio', 'inicio separacao'], dataHora],
  ['separacao_fim', ['data finalizacao', 'fim separacao', 'data fim'], dataHora],
  ['cancelado', ['cancelado wms', 'cancelado'], simNao],
  ['liberacao', ['liberacao haila leticia', 'liberacao'], dataHora],
  ['expedicao', ['expedicao'], texto],
  // Tela Expedição Mercadorias do WMS (consulta automática ou o Exportar dela).
  ['expedicao_numero', ['numero da expedicao', 'numero expedicao', 'expedicao wms'], texto],
  ['tipo_pedido', ['tipo pedido'], texto],
  ['placa', ['placa'], texto],
  ['motorista', ['motorista'], texto],
  ['itinerario', ['itinerarios', 'itinerario'], texto],
  ['expedicao_fim', ['data final'], dataHora],
  ['conferencia_pct', ['conferencia', 'perc conferencia'], numeroBr],
  ['imprimir', ['imprimir'], simNao],
];
const CAMPOS = COLUNAS.map(([c]) => c).filter((c) => c !== 'numero_pedido');

// Lê a planilha: devolve as linhas por pedido e o que não deu para ler (valor que não é do tipo da coluna).
function lerPlanilha(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const linhas = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: null, raw: true });
  if (!linhas.length) throw Object.assign(new Error('A planilha está vazia.'), { status: 400 });
  const cab = Object.keys(linhas[0]);
  const achar = (nomes) => cab.find((h) => nomes.includes(semAcento(h)));
  const mapa = COLUNAS.map(([campo, nomes, conv]) => ({ campo, col: achar(nomes), conv })).filter((m) => m.col);
  // Exportar da tela do WMS: "Cargas" é o pedido e "Expedição" é o número da expedição (não o tipo do ERP).
  const colPedido = mapa.find((m) => m.campo === 'numero_pedido')?.col;
  if (['cargas', 'carga'].includes(semAcento(colPedido))) mapa.forEach((m) => { if (m.campo === 'expedicao') { m.campo = 'expedicao_numero'; m.conv = texto; } });
  if (!mapa.some((m) => m.campo === 'numero_pedido')) throw Object.assign(new Error('Não achei a coluna "Número Pedido".'), { status: 400 });
  if (mapa.length < 2) throw Object.assign(new Error('A planilha não tem nenhuma coluna do WMS (Status/WMS, Data Inicial, Usuário, Data/Imp. Etq, Qtd. Etiquetas, Data Início, Data Finalização, Cancelado Wms).'), { status: 400 });
  const invalidos = {}; const preenchidos = {};
  const porPedido = new Map();
  for (const l of linhas) {
    const o = {};
    for (const { campo, col, conv } of mapa) {
      const bruto = l[col];
      o[campo] = conv(bruto);
      if (bruto != null && String(bruto).trim() !== '') preenchidos[campo] = (preenchidos[campo] || 0) + 1;
      if (o[campo] == null && bruto != null && String(bruto).trim() !== '' && campo !== 'numero_pedido') invalidos[campo] = (invalidos[campo] || 0) + 1;
    }
    if (o.numero_pedido) porPedido.set(o.numero_pedido, o);
  }
  // Coluna em que a maioria dos valores não é do tipo dela (ex.: "Qtd. Etiquetas" com datas): as colunas estão
  // deslocadas e as outras também podem estar trocadas sem dar para perceber. Não grava nada.
  const trocadas = Object.keys(invalidos).filter((c) => invalidos[c] > 0.5 * preenchidos[c]);
  if (trocadas.length) {
    const nome = (c) => mapa.find((m) => m.campo === c)?.col || c;
    throw Object.assign(new Error(`As colunas da planilha parecem deslocadas: ${trocadas.map((c) => `"${nome(c)}" (${invalidos[c]} de ${preenchidos[c]} valores não são do tipo da coluna)`).join(', ')}. Nada foi gravado. Confira se cada coluna traz o dado do título dela.`), { status: 400, invalidos });
  }
  return { linhas: [...porPedido.values()], total: linhas.length, colunas: mapa.map((m) => ({ campo: m.campo, coluna: m.col })), invalidos };
}

// Grava (célula vazia não apaga o que já estava).
async function gravar(linhas, origem = 'planilha') {
  if (!linhas.length) return 0;
  const arr = (c) => linhas.map((l) => l[c] ?? null);
  const tipos = { status: 'text', data_inicial: 'timestamp', usuario: 'text', etiquetas_impressas_em: 'timestamp', qtd_etiquetas: 'int', separacao_inicio: 'timestamp',
    separacao_fim: 'timestamp', cancelado: 'boolean', liberacao: 'timestamp', expedicao: 'text', expedicao_numero: 'text', tipo_pedido: 'text', placa: 'text',
    motorista: 'text', itinerario: 'text', expedicao_fim: 'timestamp', conferencia_pct: 'numeric', imprimir: 'boolean' };
  const params = [arr('numero_pedido'), ...CAMPOS.map(arr), origem];
  const { rowCount } = await pool.query(
    `INSERT INTO pedidos_wms (numero_pedido, ${CAMPOS.join(', ')}, origem, atualizado_em)
     SELECT *, $${CAMPOS.length + 2}::text, NOW() FROM UNNEST($1::text[], ${CAMPOS.map((c, i) => `$${i + 2}::${tipos[c]}[]`).join(', ')})
     ON CONFLICT (numero_pedido) DO UPDATE SET ${CAMPOS.map((c) => `${c} = COALESCE(EXCLUDED.${c}, pedidos_wms.${c})`).join(', ')},
       origem = EXCLUDED.origem, atualizado_em = NOW()`, params);
  return rowCount;
}

async function importar(buffer) {
  const r = lerPlanilha(buffer);
  const gravados = await gravar(r.linhas);
  return { total: r.total, pedidos: r.linhas.length, gravados, colunas: r.colunas, invalidos: r.invalidos };
}

module.exports = { dataHora, numeroBr, lerPlanilha, gravar, importar, COLUNAS };
