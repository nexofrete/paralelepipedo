// Os quatro arquivos do EDI PROCEDA, na família 3.1:
//   NOTFIS 3.1  — notas fiscais (embarcador → transportadora)           linhas de 240
//   CONEMB 3.1  — conhecimentos embarcados (transportadora → embarcador) linhas de 680
//                 (o 322 vai até 740: modelo, chave e protocolo do CT-e)
//   OCOREN 3.1  — ocorrências na entrega (transportadora → embarcador)   linhas de 120
//   DOCCOB 3.0A — cobrança / fatura (transportadora → embarcador)        linhas de 170
//                 (não houve DOCCOB 3.1: depois da 3.0A vem a 5.0)
// Fontes: manuais PROCEDA NOTFIS 3.1 (28/03/2000) e OCOREN 3.1 (15/05/2000);
// CONEMB 3.1 "com CFOP de 4 posições".
// montarX(dados) devolve o texto do arquivo; lerX(texto) devolve os dados.
const { A, N, D8, D6, H4, layout, linha, ler, identificacoes } = require('./proceda');

const CABECALHO = [A('remetente', 35), A('destinatario', 35), D6('data'), H4('hora'), A('intercambio', 12)];
const soDigitos = (v) => String(v ?? '').replace(/\D/g, '');
const docLimpo = (v) => String(v ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '');
const QUEBRA = '\r\n';
const juntar = (linhas) => linhas.join(QUEBRA) + QUEBRA;

function cabecalho(lay, dados, p3, p5, idDoc) {
  const quando = dados.data ? new Date(dados.data) : new Date();
  const ids = identificacoes(p3, p5, quando, dados.sequencia || 1);
  return [
    linha(lay, '000', { remetente: dados.remetente, destinatario: dados.destinatario, data: quando, hora: quando, intercambio: ids.intercambio }),
    linha(lay, idDoc, { identificacao: ids.documento }),
  ];
}
function lerCabecalho(regs, idDoc) {
  const c = regs.find((r) => r.id === '000')?.campos || {};
  const d = regs.find((r) => r.id === idDoc)?.campos || {};
  return { remetente: c.remetente || '', destinatario: c.destinatario || '', data: c.data, hora: c.hora, intercambio: c.intercambio || '', documento: d.identificacao || '' };
}
// Linhas que o layout não conhece (outra versão, registro opcional) — avisa sem quebrar a leitura.
const desconhecidos = (regs) => regs.filter((r) => !r.campos).map((r) => `linha ${r.numeroLinha}: registro "${r.id}" ignorado`);

// Consignatário (315), redespacho (316) e responsável pelo frete (317): mesmo bloco de endereço.
function PESSOA(comAreaFrete) {
  return [A('razao', 40), A('cnpj', 14), A('ie', 15), A('endereco', 40), A('bairro', 20), A('cidade', 35), A('cep', 9), A('codigoMunicipio', 9),
    A('uf', 9), ...(comAreaFrete ? [A('areaFrete', 4)] : []), A('telefone', 35)];
}

// ---------------------------------------------------------------- NOTFIS
const NOTFIS = layout('NOTFIS', 240, {
  '000': CABECALHO,
  310: [A('identificacao', 14)],
  311: [A('cnpj', 14), A('ie', 15), A('endereco', 40), A('cidade', 35), A('cep', 9), A('uf', 9), D8('dataEmbarque'), A('razao', 40)],
  312: [A('razao', 40), A('cnpj', 14), A('ie', 15), A('endereco', 40), A('bairro', 20), A('cidade', 35), A('cep', 9), A('codigoMunicipio', 9),
    A('uf', 9), A('areaFrete', 4), A('telefone', 35), N('tipoIdentificacao', 1)],
  313: [A('romaneio', 15), A('rota', 7), N('meioTransporte', 1), N('tipoTransporte', 1), N('tipoCarga', 1), A('condicaoFrete', 1),
    A('serie', 3), N('numero', 8), D8('emissao'), A('natureza', 15), A('especie', 15), N('volumes', 7, 2), N('valor', 15, 2),
    N('peso', 7, 2), N('cubagem', 5, 2), A('tipoIcms', 1), A('seguro', 1), N('valorSeguro', 15, 2), N('valorCobrado', 15, 2),
    A('placa', 7), A('planoCargaRapida', 1), N('fretePesoVolume', 15, 2), N('adValorem', 15, 2), N('taxas', 15, 2), N('freteTotal', 15, 2),
    A('acao', 1), N('icms', 12, 2), N('icmsRetido', 12, 2), A('bonificacao', 1)],
  // 333 (novo na 3.1): CFOP, janela de entrega, entrega casada e redespacho.
  333: [N('cfop', 4), N('tipoPeriodoEntrega', 1), D8('entregaDataInicial'), H4('entregaHoraInicial'), D8('entregaDataFinal'), H4('entregaHoraFinal'),
    A('localDesembarque', 15), A('calculoDiferenciado', 1), A('tabelaFrete', 10),
    ...Array.from({ length: 5 }, (_, i) => [A(`casadaCnpj${i}`, 15), A(`casadaSerie${i}`, 3), N(`casadaNumero${i}`, 8)]).flat(),
    N('despesasAdicionais', 15, 2), A('tipoVeiculo', 5), A('redespachoFilialCte', 10), A('redespachoSerieCte', 5), A('redespachoNumeroCte', 12)],
  314: Array.from({ length: 4 }, (_, i) => [N(`volumes${i}`, 7, 2), A(`especie${i}`, 15), A(`mercadoria${i}`, 30)]).flat(),
  315: PESSOA(false),
  316: PESSOA(true),
  317: PESSOA(false),
  318: [N('valorNotas', 15, 2), N('peso', 15, 2), N('pesoCubado', 15, 2), N('volumes', 15, 2), N('valorCobrado', 15, 2), N('valorSeguro', 15, 2)],
});
// Tipo de ICMS do 313 (3.1).
const TIPOS_ICMS = { D: 'Diferido', R: 'Reduzido', P: 'Presumido', T: 'Substituição', S: 'Alíquota normal', N: 'Não incidência / isento' };

function montarNotfis(dados) {
  const linhas = cabecalho(NOTFIS, dados, 'NOT', 'NOTFI', '310');
  const tot = { valorNotas: 0, peso: 0, pesoCubado: 0, volumes: 0, valorCobrado: 0, valorSeguro: 0 };
  // Um embarcador (embarcador + destinatarios) ou vários (embarcadores: [{ ..., destinatarios }]).
  const embarcadores = dados.embarcadores || [{ ...(dados.embarcador || {}), destinatarios: dados.destinatarios }];
  embarcadores.forEach((e) => {
    linhas.push(linha(NOTFIS, '311', { ...e, cnpj: docLimpo(e.cnpj), cep: soDigitos(e.cep), dataEmbarque: e.dataEmbarque || dados.data || new Date() }));
    (e.destinatarios || []).forEach((d) => {
      const doc = docLimpo(d.cnpj);
      linhas.push(linha(NOTFIS, '312', { ...d, cnpj: doc, cep: soDigitos(d.cep), tipoIdentificacao: doc.length === 11 ? 2 : 1 }));
      (d.notas || []).forEach((n) => {
        linhas.push(linha(NOTFIS, '313', {
          meioTransporte: 1, tipoTransporte: 2, tipoCarga: 2, condicaoFrete: n.condicaoFrete || 'C', tipoIcms: 'S', seguro: 'S',
          acao: 'I', bonificacao: 'N', ...n, natureza: n.natureza || 'DIVERSOS', especie: n.especie || 'VOLUMES',
        }));
        // 333 (condicional na 3.1): CFOP da nota, tirado do XML da NF-e.
        if (n.cfop || n.redespacho) linhas.push(linha(NOTFIS, '333', { cfop: n.cfop, tipoPeriodoEntrega: 0, calculoDiferenciado: 'N' }));
        if (n.mercadorias?.length) {
          const m = {};
          n.mercadorias.slice(0, 4).forEach((x, i) => { m[`volumes${i}`] = x.volumes; m[`especie${i}`] = x.especie; m[`mercadoria${i}`] = x.mercadoria; });
          linhas.push(linha(NOTFIS, '314', m));
        }
        if (n.redespacho) linhas.push(linha(NOTFIS, '316', { ...n.redespacho, cnpj: docLimpo(n.redespacho.cnpj), cep: soDigitos(n.redespacho.cep) }));
        tot.valorNotas += Number(n.valor) || 0; tot.peso += Number(n.peso) || 0; tot.pesoCubado += Number(n.cubagem) || 0;
        tot.volumes += Number(n.volumes) || 0; tot.valorCobrado += Number(n.valorCobrado) || 0; tot.valorSeguro += Number(n.valorSeguro) || 0;
      });
    });
  });
  linhas.push(linha(NOTFIS, '318', tot));
  return juntar(linhas);
}

// O NOTFIS 3.1 não tem campo para a chave da NF-e; alguns parceiros mandam a
// chave numa linha extra ou no fim do 333. Procura uma chave depois da nota.
// Chave de NF-e de verdade: UF válida, modelo 55 e dígito verificador (módulo 11).
function chaveValida(c) {
  if (!/^\d{44}$/.test(c) || c.slice(20, 22) !== '55' || !/^(1[1-7]|2[1-9]|3[1235]|4[1-3]|5[0-3])/.test(c)) return false;
  let soma = 0; let peso = 2;
  for (let i = 42; i >= 0; i -= 1) { soma += Number(c[i]) * peso; peso = peso === 9 ? 2 : peso + 1; }
  const dv = 11 - (soma % 11);
  return (dv >= 10 ? 0 : dv) === Number(c[43]);
}
const acharChave = (texto) => {
  for (const m of String(texto).matchAll(/\d{44,}/g)) {
    for (let i = 0; i + 44 <= m[0].length; i += 1) { const c = m[0].slice(i, i + 44); if (chaveValida(c)) return c; }
  }
  return null;
};
function lerNotfis(texto) {
  const regs = ler(NOTFIS, texto);
  if (!regs.some((r) => r.id === '313')) throw new Error('O arquivo não parece um NOTFIS: não tem nenhuma nota (registro 313).');
  const r = { ...lerCabecalho(regs, '310'), embarcadores: [], avisos: [] };
  let emb = null; let dest = null; let nota = null;
  regs.forEach((reg) => {
    if (reg.id === '311') { emb = { ...reg.campos, destinatarios: [] }; r.embarcadores.push(emb); dest = null; nota = null; }
    else if (reg.id === '312') {
      if (!emb) { emb = { destinatarios: [] }; r.embarcadores.push(emb); }
      dest = { ...reg.campos, notas: [] }; emb.destinatarios.push(dest); nota = null;
    } else if (reg.id === '313') {
      if (!dest) { r.avisos.push(`linha ${reg.numeroLinha}: nota sem destinatário (312) antes`); return; }
      nota = { ...reg.campos, chave: null, tipoIcmsDescricao: TIPOS_ICMS[reg.campos.tipoIcms] || null }; dest.notas.push(nota);
      nota.chave = acharChave(reg.bruta.slice(3));
    } else if (reg.id === '333' && nota) {
      const c = reg.campos;
      nota.cfop = c.cfop || null;
      nota.janelaEntrega = c.tipoPeriodoEntrega ? { tipo: c.tipoPeriodoEntrega, de: c.entregaDataInicial, horaDe: c.entregaHoraInicial, ate: c.entregaDataFinal, horaAte: c.entregaHoraFinal } : null;
      nota.entregaCasada = Array.from({ length: 5 }, (_, i) => ({ cnpj: c[`casadaCnpj${i}`], serie: c[`casadaSerie${i}`], numero: c[`casadaNumero${i}`] })).filter((x) => x.numero);
      nota.tipoVeiculo = c.tipoVeiculo || null; nota.localDesembarque = c.localDesembarque || null;
      if (!nota.chave) nota.chave = acharChave(reg.bruta);
    } else if (reg.id === '314' && nota) {
      nota.mercadorias = [...(nota.mercadorias || []), ...Array.from({ length: 4 }, (_, i) => ({ volumes: reg.campos[`volumes${i}`], especie: reg.campos[`especie${i}`], mercadoria: reg.campos[`mercadoria${i}`] })).filter((x) => x.mercadoria || x.volumes)];
    } else if (['315', '316', '317'].includes(reg.id) && nota) {
      nota[{ 315: 'consignatario', 316: 'redespacho', 317: 'responsavelFrete' }[reg.id]] = reg.campos;
    } else if (reg.id === '318') r.totais = reg.campos;
    else if (!reg.campos && nota && !nota.chave) {
      nota.chave = acharChave(reg.bruta);
    }
  });
  r.avisos.push(...desconhecidos(regs).filter((t) => !/registro "(319|33\d)"/.test(t)));
  return r;
}

// ---------------------------------------------------------------- CONEMB
const NOTAS_POR_LINHA = 40;
const CONEMB = layout('CONEMB', 680, {
  '000': CABECALHO,
  320: [A('identificacao', 14)],
  321: [A('cnpj', 14), A('razao', 40)],
  322: [A('filial', 10), A('serie', 5), N('numero', 12), D8('emissao'), A('condicaoFrete', 1), N('peso', 7, 2), N('valorFrete', 15, 2),
    N('baseIcms', 15, 2), N('aliquotaIcms', 4, 2), N('valorIcms', 15, 2), N('fretePeso', 15, 2), N('freteValor', 15, 2), N('secCat', 15, 2),
    N('itr', 15, 2), N('despacho', 15, 2), N('pedagio', 15, 2), N('ademe', 15, 2), N('substituicao', 1), A('reservado', 3),
    A('cnpjEmissorNf', 14), A('cnpjEmbarcadora', 14),
    ...Array.from({ length: NOTAS_POR_LINHA }, (_, i) => [A(`serieNf${i}`, 3), N(`numeroNf${i}`, 8)]).flat(),
    A('acao', 1), A('tipo', 1), A('continuidade', 1), A('cfop', 4), A('modelo', 2), A('chaveCte', 44), A('protocoloCte', 15)],
  // 329 (3.1): dados complementares do conhecimento.
  329: [A('tipoVeiculo', 5), N('despesasExtras', 15, 2), N('iss', 15, 2), A('origemFilial', 10), A('origemSerie', 5), A('origemNumero', 12),
    A('solicitacaoColeta', 15), A('documentoEmbarcadora', 20), A('autorizacaoCarregamento', 20)],
  323: [N('quantidade', 4), N('valorTotal', 15, 2)],
}, ['322']);
// Tipo do conhecimento no 322.
const TIPOS_CONHECIMENTO = { N: 'Normal', C: 'Complementar', D: 'Devolução', E: 'Normal de entrada', O: 'Normal de retorno', R: 'Reentrega', S: 'Normal de saída', T: 'Transferência interna' };

function montarConemb(dados) {
  const linhas = cabecalho(CONEMB, dados, 'CON', 'CONHE', '320');
  const t = dados.transportadora || {};
  linhas.push(linha(CONEMB, '321', { cnpj: docLimpo(t.cnpj), razao: t.razao }));
  let total = 0;
  (dados.conhecimentos || []).forEach((c) => {
    const notas = c.notas?.length ? c.notas : [{}];
    for (let i = 0; i < notas.length; i += NOTAS_POR_LINHA) {
      const bloco = notas.slice(i, i + NOTAS_POR_LINHA);
      const v = { condicaoFrete: 'C', substituicao: 2, acao: 'I', tipo: 'N', modelo: c.chaveCte ? '57' : '', ...c, cfop: soDigitos(c.cfop).slice(0, 4), cnpjEmissorNf: docLimpo(c.cnpjEmissorNf), cnpjEmbarcadora: docLimpo(c.cnpjEmbarcadora || c.cnpjEmissorNf),
        continuidade: i + NOTAS_POR_LINHA >= notas.length ? 'U' : 'C', numero: Number(soDigitos(c.numero)) };
      bloco.forEach((n, k) => { v[`serieNf${k}`] = n.serie; v[`numeroNf${k}`] = n.numero; });
      linhas.push(linha(CONEMB, '322', v));
    }
    total += Number(c.valorFrete) || 0;
  });
  linhas.push(linha(CONEMB, '323', { quantidade: (dados.conhecimentos || []).length, valorTotal: total }));
  return juntar(linhas);
}

function lerConemb(texto) {
  const regs = ler(CONEMB, texto);
  if (!regs.some((r) => r.id === '322')) throw new Error('O arquivo não parece um CONEMB: não tem nenhum conhecimento (registro 322).');
  const r = { ...lerCabecalho(regs, '320'), transportadora: regs.find((x) => x.id === '321')?.campos || {}, conhecimentos: [], avisos: desconhecidos(regs) };
  let anterior = null;
  regs.filter((x) => x.id === '322' || x.id === '329').forEach(({ id, campos: c }) => {
    if (id === '329') { if (anterior) anterior.complemento = c; return; }
    const notas = [];
    for (let k = 0; k < NOTAS_POR_LINHA; k += 1) if (c[`numeroNf${k}`]) notas.push({ serie: c[`serieNf${k}`], numero: c[`numeroNf${k}`] });
    // Continuação (mais de 40 notas): mesma série e número da linha anterior.
    if (anterior && anterior.continuidade === 'C' && anterior.serie === c.serie && anterior.numero === c.numero) {
      anterior.notas.push(...notas); anterior.continuidade = c.continuidade; return;
    }
    const limpo = Object.fromEntries(Object.entries(c).filter(([k]) => !/^(serieNf|numeroNf)\d+$/.test(k)));
    anterior = { ...limpo, notas, tipoDescricao: TIPOS_CONHECIMENTO[c.tipo] || null };
    r.conhecimentos.push(anterior);
  });
  r.totais = regs.find((x) => x.id === '323')?.campos || null;
  return r;
}

// ---------------------------------------------------------------- OCOREN
const OCOREN = layout('OCOREN', 120, {
  '000': CABECALHO,
  340: [A('identificacao', 14)],
  341: [A('cnpj', 14), A('razao', 40)],
  342: [A('cnpjEmissorNf', 14), A('serie', 3), N('numero', 8), N('codigo', 2), D8('data'), H4('hora'), N('codigoObservacao', 2), A('texto', 70)],
  // 343 (3.1): redespacho — quem contratou e o conhecimento que originou a ocorrência.
  343: [A('cnpjContratante', 14), A('filial', 10), A('serieCte', 5), A('numeroCte', 12)],
});
const OBSERVACOES_OCORRENCIA = { 1: 'Devolução / recusa total', 2: 'Devolução / recusa parcial', 3: 'Aceite / entrega por acordo' };

// Códigos de ocorrência PROCEDA mais usados.
const OCORRENCIAS = {
  0: 'Processo de transporte já iniciado', 1: 'Entrega realizada normalmente', 2: 'Entrega fora da data programada',
  3: 'Recusa por falta de pedido de compra', 4: 'Recusa por pedido de compra cancelado', 5: 'Falta de espaço físico no depósito do cliente',
  6: 'Endereço do cliente destino não localizado', 7: 'Devolução não autorizada pelo cliente', 8: 'Preço da mercadoria em desacordo com o pedido',
  9: 'Mercadoria em desacordo com o pedido', 10: 'Cliente destino só recebe com frete pago', 11: 'Recusa por deficiência da embalagem',
  12: 'Redespacho não indicado', 13: 'Transportadora não atende a cidade', 14: 'Mercadoria sinistrada', 15: 'Embalagem sinistrada',
  16: 'Pedido de compra em duplicidade', 17: 'Mercadoria fora da embalagem de atacadista', 18: 'Mercadorias trocadas',
  19: 'Reentrega solicitada pelo cliente', 20: 'Entrega prejudicada por horário / falta de tempo hábil', 21: 'Estabelecimento fechado',
  22: 'Reentrega sem cobrança do cliente', 23: 'Extravio de mercadoria em trânsito', 24: 'Mercadoria reentregue ao cliente destino',
  25: 'Mercadoria devolvida ao cliente de origem', 26: 'Nota fiscal retida pela fiscalização', 27: 'Roubo de carga',
  28: 'Mercadoria retida até segunda ordem', 29: 'Cliente retira a mercadoria na transportadora', 30: 'Problema com a documentação (NF / CT-e)',
  31: 'Entrega com indenização efetuada', 32: 'Falta com solicitação de reposição', 33: 'Falta com busca / reconferência',
  34: 'Cliente fechado para balanço', 35: 'Quantidade de produto em desacordo', 36: 'Extravio de mercadoria / falta',
  91: 'Entrega programada', 92: 'Problemas no sistema do cliente', 98: 'Chegada na cidade ou filial', 99: 'Outros tipos de ocorrência',
};
// Ocorrências que significam "entregue" (vira a Data da Entrega da nota).
const OCORRENCIAS_ENTREGA = [1, 2, 24, 31];

function montarOcoren(dados) {
  const linhas = cabecalho(OCOREN, dados, 'OCO', 'OCORR', '340');
  const t = dados.transportadora || {};
  linhas.push(linha(OCOREN, '341', { cnpj: docLimpo(t.cnpj), razao: t.razao }));
  (dados.ocorrencias || []).forEach((o) => {
    const quando = o.hora ? `${String(o.data).slice(0, 10)}T${o.hora}` : o.data;
    linhas.push(linha(OCOREN, '342', { ...o, cnpjEmissorNf: docLimpo(o.cnpjEmissorNf), data: quando, hora: quando, texto: o.texto || OCORRENCIAS[Number(o.codigo)] || '' }));
    if (o.redespacho) linhas.push(linha(OCOREN, '343', { ...o.redespacho, cnpjContratante: docLimpo(o.redespacho.cnpjContratante) }));
  });
  return juntar(linhas);
}

function lerOcoren(texto) {
  const regs = ler(OCOREN, texto);
  if (!regs.some((r) => r.id === '342')) throw new Error('O arquivo não parece um OCOREN: não tem nenhuma ocorrência (registro 342).');
  const ocorrencias = [];
  regs.forEach(({ id, campos: c }) => {
    if (id === '342') {
      ocorrencias.push({ ...c, descricao: OCORRENCIAS[c.codigo] || `Código ${c.codigo}`, observacao: OBSERVACOES_OCORRENCIA[c.codigoObservacao] || null,
        entregue: OCORRENCIAS_ENTREGA.includes(c.codigo) });
    } else if (id === '343' && ocorrencias.length) ocorrencias[ocorrencias.length - 1].redespacho = c;
  });
  return { ...lerCabecalho(regs, '340'), transportadora: regs.find((x) => x.id === '341')?.campos || {}, avisos: desconhecidos(regs), ocorrencias };
}

// ---------------------------------------------------------------- DOCCOB
const DOCCOB = layout('DOCCOB', 170, {
  '000': CABECALHO,
  350: [A('identificacao', 14)],
  351: [A('cnpj', 14), A('razao', 40)],
  352: [A('filial', 10), N('tipo', 1), A('serie', 3), A('numero', 10), D8('emissao'), D8('vencimento'), N('valor', 15, 2), A('tipoCobranca', 3),
    N('icms', 15, 2), N('juros', 15, 2), D8('limiteDesconto'), N('desconto', 15, 2), A('banco', 35), N('agencia', 4), A('agenciaDv', 1),
    N('conta', 10), A('contaDv', 2), A('acao', 1)],
  353: [A('filial', 10), A('serie', 5), N('numero', 12), N('valorFrete', 15, 2), D8('emissao'), A('cnpjRemetente', 14), A('cnpjDestinatario', 14), A('cnpjEmissor', 14)],
  354: [A('serie', 3), N('numero', 8), D8('emissao'), N('peso', 7, 2), N('valor', 15, 2), A('cnpjEmissor', 14)],
  355: [N('quantidade', 4), N('valorTotal', 15, 2)],
});

function montarDoccob(dados) {
  const linhas = cabecalho(DOCCOB, dados, 'COB', 'COBRA', '350');
  const t = dados.transportadora || {};
  linhas.push(linha(DOCCOB, '351', { cnpj: docLimpo(t.cnpj), razao: t.razao }));
  let total = 0;
  (dados.cobrancas || []).forEach((f) => {
    linhas.push(linha(DOCCOB, '352', { tipo: 0, tipoCobranca: 'BCO', acao: 'I', ...f }));
    total += Number(f.valor) || 0;
    (f.conhecimentos || []).forEach((c) => {
      linhas.push(linha(DOCCOB, '353', { ...c, numero: Number(soDigitos(c.numero)), cnpjRemetente: docLimpo(c.cnpjRemetente), cnpjDestinatario: docLimpo(c.cnpjDestinatario), cnpjEmissor: docLimpo(c.cnpjEmissor) }));
      (c.notas || []).forEach((n) => linhas.push(linha(DOCCOB, '354', { ...n, cnpjEmissor: docLimpo(n.cnpjEmissor || c.cnpjRemetente) })));
    });
  });
  linhas.push(linha(DOCCOB, '355', { quantidade: (dados.cobrancas || []).length, valorTotal: total }));
  return juntar(linhas);
}

function lerDoccob(texto) {
  const regs = ler(DOCCOB, texto);
  if (!regs.some((r) => r.id === '352')) throw new Error('O arquivo não parece um DOCCOB: não tem nenhum documento de cobrança (registro 352).');
  const r = { ...lerCabecalho(regs, '350'), transportadora: regs.find((x) => x.id === '351')?.campos || {}, cobrancas: [], avisos: desconhecidos(regs) };
  let fat = null; let cte = null;
  regs.forEach((reg) => {
    if (reg.id === '352') { fat = { ...reg.campos, conhecimentos: [] }; r.cobrancas.push(fat); cte = null; }
    else if (reg.id === '353' && fat) { cte = { ...reg.campos, notas: [] }; fat.conhecimentos.push(cte); }
    else if (reg.id === '354' && cte) cte.notas.push(reg.campos);
    else if (reg.id === '355') r.totais = reg.campos;
  });
  return r;
}

// Descobre o tipo pelo registro de cabeçalho do documento (310/320/340/350).
function tipoDoArquivo(texto) {
  const ids = new Set(String(texto || '').split(/\r?\n/).map((l) => l.replace(/^﻿/, '').slice(0, 3)));
  if (ids.has('310') || ids.has('313')) return 'NOTFIS';
  if (ids.has('320') || ids.has('322')) return 'CONEMB';
  if (ids.has('340') || ids.has('342')) return 'OCOREN';
  if (ids.has('350') || ids.has('352')) return 'DOCCOB';
  return null;
}

module.exports = {
  TIPOS_ICMS, TIPOS_CONHECIMENTO, OBSERVACOES_OCORRENCIA, NOTFIS, CONEMB, OCOREN, DOCCOB, OCORRENCIAS, OCORRENCIAS_ENTREGA, chaveValida,
  montarNotfis, lerNotfis, montarConemb, lerConemb, montarOcoren, lerOcoren, montarDoccob, lerDoccob, tipoDoArquivo,
};
