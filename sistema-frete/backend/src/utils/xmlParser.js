const { XMLParser } = require('fast-xml-parser');

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  // IMPORTANTE: sem isso, o parser tenta converter qualquer texto "parecido
  // com número" em número de verdade — e a chave de acesso (44 dígitos) é
  // grande demais pro JavaScript representar direito, virando algo tipo
  // "3.326e+43" em vez do texto original. Em todo lugar que precisamos de um
  // número de verdade (valores, quantidades), o código já converte na mão
  // com Number()/parseFloat(), então desligar isso aqui é seguro.
  parseTagValue: false,
});

/**
 * Extrai os dados relevantes de um XML de NF-e (Nota Fiscal Eletrônica).
 * Cobre o layout padrão da NF-e modelo 55 (nfeProc / NFe / infNFe).
 * Se o XML vier apenas com a tag <NFe> (sem nfeProc), também funciona.
 *
 * Campos que a SEFAZ pode variar de layout entre versões (3.10, 4.00) foram
 * tratados com verificação defensiva (?.) para não quebrar o processamento.
 */
function parseNFe(xmlString) {
  const json = parser.parse(xmlString);

  const raiz = json.nfeProc?.NFe || json.NFe;
  const infNFe = raiz?.infNFe;
  if (!infNFe) {
    throw new Error('XML não parece ser uma NF-e válida (tag infNFe não encontrada).');
  }

  const ide = infNFe.ide || {};
  const dest = infNFe.dest || {};
  const enderDest = dest.enderDest || {};
  const total = infNFe.total?.ICMSTot || {};
  const transp = infNFe.transp || {};
  const vols = Array.isArray(transp.vol) ? transp.vol : [transp.vol].filter(Boolean);
  const somaVol = (campo) => {
    const valores = vols.map((v) => v?.[campo]).filter((v) => v != null && v !== '');
    return valores.length ? valores.reduce((s, v) => s + Number(v), 0) : null;
  };
  // Valor faturado = o que foi pago/cobrado na nota (<detPag><vPag>, somando
  // as formas de pagamento); sem pagamento informado, o total da nota (vNF).
  const pagamentos = [infNFe.pag?.detPag].flat().filter(Boolean);
  const valorPago = pagamentos.length ? pagamentos.reduce((s, p) => s + (Number(p.vPag) || 0), 0) : null;

  // Texto livre de "Informações Complementares" — é onde emissores costumam
  // colocar o número do pedido e os dados do redespacho.
  const infCpl = infNFe.infAdic?.infCpl || '';

  // Ex: "...VIOLACAO.Pedido: 211174. Nr. pedido do cliente: 134561..."
  // Usamos "Pedido:" com P maiúsculo para não confundir com "pedido do cliente".
  const matchPedido = infCpl.match(/Pedido:\s*(\d+)/);
  const numeroPedidoDoTexto = matchPedido ? matchPedido[1] : null;

  // "Pedido Mercus" = número do pedido do cliente, citado no mesmo texto.
  // Ex: "...Nr. pedido do cliente: 134328..." ou simplesmente "pedido do cliente: 135802..."
  const matchPedidoCliente = infCpl.match(/(?:Nr\.?\s*)?pedido do cliente:\s*(\d+)/i);
  let pedidoMercus = matchPedidoCliente ? matchPedidoCliente[1] : null;

  // Ex: "...//REDESPACHO:TORRES TRANSPORTES RODOFLUVIAL LTDA RUA MINEIROS, 289
  // - CIDADE INDUSTRIAL SATELITE - GUARULHOS - SP - CEP:07.122-100 - I.E:... -
  // FRETE POR CONTA DO DESTINO..."
  const matchRedespacho = infCpl.match(/REDESPACHO\s*:\s*([\s\S]*?)(?:\s*-?\s*FRETE POR CONTA|\s*TERMO DE ISENCAO|\.\s*Pedido:|$)/i);
  const blocoRedespacho = matchRedespacho ? matchRedespacho[1].trim() : null;
  // Só o NOME da transportadora de redespacho (o bloco traz endereço, bairro,
  // CNPJ...): vai até o "LTDA/S.A./EIRELI/ME/EPP" ou até onde começa o endereço.
  let redespacho = blocoRedespacho;
  if (blocoRedespacho) {
    const porSufixo = blocoRedespacho.match(/^(.*?\b(?:LTDA|S\/A|S\.A\.?|EIRELI|EPP|ME)\b\.?)/i);
    const porEndereco = blocoRedespacho.split(/\s+(?=(?:RUA|R\.|AV\.?|AVENIDA|ROD\.?|RODOVIA|ESTRADA|ALAMEDA|TRAVESSA|PRACA|BAIRRO\s*:|CIDADE\s*:|CNPJ|CEP|END\.?|ENDERECO)\b)|,/i)[0];
    redespacho = (porSufixo ? porSufixo[1] : porEndereco).replace(/[\s,-]+$/, '').trim() || blocoRedespacho;
  }

  // A Cidade do Redespacho é o dado de MAIOR prioridade pro motor de cálculo
  // achar o trecho certo — por isso vale a pena tentar separar ela sozinha do
  // bloco de texto do redespacho, em vez de deixar só o texto inteiro (que
  // mistura nome da transportadora, CNPJ, endereço etc).
  let cidadeRedespacho = null;
  // A cidade termina antes de palavras que nunca fazem parte do nome dela
  // ("CIDADE:GUARULHOS FRETE POR CONTA..." sem traço) e sem a UF no fim.
  const limparCidade = (c) => String(c || '')
    .replace(/\s+(?:FRETE|POR\s+CONTA|CEP|CNPJ|I\.?\s?E\b|INSCR|FONE|TEL|E-?MAIL|UF\b|ESTADO|\d).*$/i, '')
    .replace(/\s+I\.?$/i, '')   // sobra do "I.E" (inscrição estadual): "SAO PAULO I" 
    .replace(/\s*[-\/]?\s*\b(?:AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)\s*$/, '')
    .replace(/[\s,.-]+$/, '').trim() || null;
  if (blocoRedespacho) {
    // Formato mais comum: "...BAIRRO:VILA AUGUSTA CIDADE:GUARULHOS-FRETE...".
    const matchCidadeExplicita = blocoRedespacho.match(/CIDADE\s*:\s*([A-ZÀ-Úa-zà-ú\s]+?)(?:[-.]|$)/i);
    if (matchCidadeExplicita) {
      cidadeRedespacho = limparCidade(matchCidadeExplicita[1]);
    } else {
      // Formato por endereço: "...RUA MINEIROS, 289 - CIDADE INDUSTRIAL
      // SATELITE - GUARULHOS - SP - CEP:...", onde a cidade fica logo antes
      // de " - UF - " (duas letras maiúsculas).
      const matchCidadePorUf = blocoRedespacho.match(/-\s*([A-ZÀ-Ú][A-ZÀ-Úa-zà-ú\s]+?)\s*-\s*[A-Z]{2}\s*-/);
      if (matchCidadePorUf) cidadeRedespacho = limparCidade(matchCidadePorUf[1]);
    }
  }

  // Se o texto não trouxer o "Nr. pedido do cliente", usamos o <xPed> do
  // primeiro item da nota como alternativa (também é o número do pedido do cliente).
  if (!pedidoMercus) {
    const detalhes = Array.isArray(infNFe.det) ? infNFe.det : [infNFe.det].filter(Boolean);
    const primeiroItem = detalhes[0]?.prod || {};
    // Só os números (ex: "132237ANTECIPAD" → "132237").
    pedidoMercus = primeiroItem.xPed != null ? (String(primeiroItem.xPed).match(/\d+/) || [null])[0] : null;
  }

  // Chave de acesso: vem no atributo Id="NFe{44 dígitos}"
  const chaveCompleta = infNFe['@_Id'] || '';
  const chave = chaveCompleta.replace('NFe', '');

  // modFrete: 0 = Contratação por conta do Remetente (CIF), 1 = Destinatário (FOB)
  const modFreteMap = { '0': 'CIF', '1': 'FOB', '2': 'Terceiros', '3': 'Próprio remetente', '4': 'Próprio destinatário', '9': 'Sem frete' };

  // A própria NF-e pode trazer o nome da transportadora (quando o emissor
  // preenche esse bloco) — útil mesmo antes do CT-e ser importado.
  const transportadoraNfe = transp.transporta?.xNome ?? null;

  return {
    chave_nfe: chave || null,
    numero_nf: ide.nNF ?? null,
    data_emissao_nf: (ide.dhEmi || ide.dEmi || '').toString().slice(0, 10) || null,
    cliente: dest.xNome ?? null,
    cidade: enderDest.xMun ?? null,
    bairro: enderDest.xBairro ?? null,
    uf: enderDest.UF ?? null,
    valor_faturado: valorPago != null && valorPago > 0 ? Math.round(valorPago * 100) / 100 : (total.vNF != null ? Number(total.vNF) : null),
    qtd_volumes: somaVol('qVol'),
    peso_kg: somaVol('pesoB') ?? somaVol('pesoL'),
    frete_cif_fob: modFreteMap[String(transp.modFrete)] ?? null,
    // tpNF 0 = nota de ENTRADA (ex.: retorno de devolução emitido pela própria empresa);
    // finNFe 4 = devolução de mercadoria. Nenhuma das duas gera frete de venda a acompanhar.
    nf_entrada: String(infNFe?.ide?.tpNF ?? '') === '0',
    nf_devolucao: String(infNFe?.ide?.finNFe ?? '') === '4',
    // finNFe 2 = complementar, 3 = ajuste: complementa imposto/valor de outra nota, sem mercadoria.
    nf_complementar: ['2', '3'].includes(String(infNFe?.ide?.finNFe ?? '')),
    natureza_operacao: infNFe?.ide?.natOp != null ? String(infNFe.ide.natOp) : null,
    // Venda + frete por conta do destinatário (modFrete 1) + SEM transportadora
    // informada: o frete é por conta do CLIENTE (ele contrata ou vem buscar).
    frete_por_conta_cliente: /VENDA/i.test(String(infNFe?.ide?.natOp ?? '')) && String(transp.modFrete ?? '') === '1'
      && !String(transp.transporta?.xNome ?? '').trim(),
    // Destinatário completo (vira o cadastro do cliente).
    destinatario: {
      documento: String(dest.CNPJ ?? dest.CPF ?? dest.idEstrangeiro ?? '').replace(/\D/g, '') || null,
      tipo_pessoa: dest.CNPJ != null ? 'J' : (dest.CPF != null ? 'F' : 'E'),
      razao_social: dest.xNome != null ? String(dest.xNome).trim() : null,
      ie: dest.IE != null ? String(dest.IE).trim() : null,
      ind_ie: dest.indIEDest != null ? String(dest.indIEDest) : null,   // 1 contribuinte, 2 isento, 9 não contribuinte
      email: dest.email != null ? String(dest.email).trim() : null,
      telefone: enderDest.fone != null ? String(enderDest.fone) : null,
      logradouro: enderDest.xLgr ?? null, numero: enderDest.nro != null ? String(enderDest.nro) : null,
      complemento: enderDest.xCpl ?? null, bairro: enderDest.xBairro ?? null,
      cod_municipio: enderDest.cMun != null ? String(enderDest.cMun) : null, municipio: enderDest.xMun ?? null,
      uf: enderDest.UF ?? null, cep: enderDest.CEP != null ? String(enderDest.CEP).replace(/\D/g, '') : null,
      pais: enderDest.xPais ?? null,
    },
    transportadora: transportadoraNfe,
    transportadora_nfe: transportadoraNfe,
    numero_pedido: numeroPedidoDoTexto,
    pedido_mercus: pedidoMercus != null ? String(pedidoMercus) : null,
    redespacho,
    cidade_redespacho: cidadeRedespacho,
    infCpl: infCpl.trim() || null,
    // Notas referenciadas (NFref) — na NF-e de devolução, é a nota de origem.
    nf_referenciadas: [].concat(infNFe?.ide?.NFref || []).map((r) => String(r?.refNFe || '').replace(/\D/g, '')).filter((c) => c.length === 44),
    // CFOPs dos itens (ex.: 1914 = retorno de mercadoria remetida para feira).
    cfops: [...new Set([].concat(infNFe?.det || []).map((d) => String(d?.prod?.CFOP ?? '')).filter(Boolean))],
    // Sem circulação de mercadoria (não há transporte): destinatário com o MESMO CNPJ
    // do emitente (ex.: baixa de estoque), ou todos os itens com CFOP que não
    // movimenta mercadoria. Transferência para OUTRA filial (CNPJ diferente) é transporte.
    ...(() => {
      const SEM_CIRCULACAO = ['5926', '5927', '6927', '5929', '6929', '5601', '5602', '5603', '6603', '5605', '5606'];
      const cfopsNota = [...new Set([].concat(infNFe?.det || []).map((d) => String(d?.prod?.CFOP ?? '')).filter(Boolean))];
      const emitCnpj = String(infNFe?.emit?.CNPJ ?? '').replace(/\D/g, '');
      const destCnpj = String(dest.CNPJ ?? '').replace(/\D/g, '');
      const mesmoCnpj = emitCnpj.length === 14 && emitCnpj === destCnpj;
      const soCfopSemCirculacao = cfopsNota.length > 0 && cfopsNota.every((c) => SEM_CIRCULACAO.includes(c));
      return { sem_circulacao: mesmoCnpj || soCfopSemCirculacao,
        motivo_sem_circulacao: mesmoCnpj ? 'o destinatário é a própria empresa (mesmo CNPJ)' : soCfopSemCirculacao ? `CFOP ${cfopsNota.join(', ')} não movimenta mercadoria` : null };
    })(),
    // Impostos/valores totais da nota, pra mostrar no detalhe da auditoria.
    impostos_nfe: JSON.stringify({
      vBC: total.vBC != null ? Number(total.vBC) : null,
      vICMS: total.vICMS != null ? Number(total.vICMS) : null,
      vICMSDeson: total.vICMSDeson != null ? Number(total.vICMSDeson) : null,
      vFCP: total.vFCP != null ? Number(total.vFCP) : null,
      vBCST: total.vBCST != null ? Number(total.vBCST) : null,
      vST: total.vST != null ? Number(total.vST) : null,
      vProd: total.vProd != null ? Number(total.vProd) : null,
      vFrete: total.vFrete != null ? Number(total.vFrete) : null,
      vSeg: total.vSeg != null ? Number(total.vSeg) : null,
      vDesc: total.vDesc != null ? Number(total.vDesc) : null,
      vII: total.vII != null ? Number(total.vII) : null,
      vIPI: total.vIPI != null ? Number(total.vIPI) : null,
      vPIS: total.vPIS != null ? Number(total.vPIS) : null,
      vCOFINS: total.vCOFINS != null ? Number(total.vCOFINS) : null,
      vOutro: total.vOutro != null ? Number(total.vOutro) : null,
      vNF: total.vNF != null ? Number(total.vNF) : null,
      vTotTrib: total.vTotTrib != null ? Number(total.vTotTrib) : null,
    }),
  };
}

/**
 * Extrai os dados relevantes de um XML de CT-e (Conhecimento de Transporte Eletrônico).
 * Cobre o layout padrão do CT-e modelo 57 (cteProc / CTe / infCte).
 */
function parseCTe(xmlString) {
  const json = parser.parse(xmlString);

  const raiz = json.cteProc?.CTe || json.CTe;
  const infCte = raiz?.infCte;
  if (!infCte) {
    throw new Error('XML não parece ser um CT-e válido (tag infCte não encontrada).');
  }

  const ide = infCte.ide || {};
  // A rota tributária do ICMS do CT-e deve vir exclusivamente de UFIni/UFFim
  // do próprio CT-e, nunca da UF do emitente, transportadora ou NF-e.
  const ufInicioCte = String(ide.UFIni ?? '').trim().toUpperCase();
  const ufFimCte = String(ide.UFFim ?? '').trim().toUpperCase();
  const ufSulSudeste = ['SP', 'RJ', 'MG', 'PR', 'SC', 'RS'];
  const ufNorteNordesteCentroOesteEs = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'PA', 'PB', 'PE', 'PI', 'RN', 'RO', 'RR', 'SE', 'TO'];
  const aliquotaIcmsInterestadual = (
    ufInicioCte && ufFimCte && ufInicioCte !== ufFimCte
  ) ? (ufSulSudeste.includes(ufInicioCte) && ufNorteNordesteCentroOesteEs.includes(ufFimCte) ? 7 : 12) : null;
  const emit = infCte.emit || {};
  const enderEmit = emit.enderEmit || {};
  const vPrest = infCte.vPrest || {};
  const imp = infCte.imp || {};
  const infCTeNorm = infCte.infCTeNorm || {};
  const infCarga = infCTeNorm.infCarga || {};
  const infQ = infCarga.infQ
    ? (Array.isArray(infCarga.infQ) ? infCarga.infQ : [infCarga.infQ])
    : [];

  const pesoInfo = infQ.find((q) => (q.cUnid === '01' || q.tpMed?.toUpperCase().includes('PESO')));
  const cubagemInfo = infQ.find((q) => q.tpMed?.toUpperCase().includes('CUBAGEM'));

  // O jeito CONFIÁVEL de linkar o CT-e com a NF-e é pela chave de acesso, que
  // fica num campo estruturado do XML (infDoc/infNFe/chave) — cada CT-e pode
  // citar uma ou mais NF-es transportadas juntas.
  const infDoc = infCTeNorm.infDoc || {};
  const infNFeDoc = infDoc.infNFe
    ? (Array.isArray(infDoc.infNFe) ? infDoc.infNFe : [infDoc.infNFe])
    : [];
  const chavesNfeReferenciadas = infNFeDoc.map((d) => d.chave).filter(Boolean);

  // Se por algum motivo o CT-e não tiver esse campo estruturado preenchido
  // (alguns emissores não preenchem certinho), tenta como último recurso ler
  // o número da NF-e do texto livre das observações, ex: "...NF: 190015...".
  const xObs = infCte.compl?.xObs || '';
  const matchNumeroNF = xObs.match(/NF:?\s*(\d+)/i);
  const numeroNfReferenciada = matchNumeroNF ? matchNumeroNF[1] : null;

  const chaveCompleta = infCte['@_Id'] || '';
  const chave = chaveCompleta.replace('CTe', '');

  // O grupo de ICMS do CT-e muda de nome conforme a situação tributária
  // (ICMS00, ICMS20, ICMS45, ICMS60, ICMS90, ICMSOutraUF, ICMSSN) — pegamos
  // qualquer um desses que existir, sem precisar saber qual vai vir.
  const gruposIcms = imp.ICMS || {};
  const chaveIcms = Object.keys(gruposIcms)[0];
  const dadosIcms = chaveIcms ? gruposIcms[chaveIcms] : {};

  // Novos tributos da reforma tributária (IBS/CBS), quando presentes.
  const ibscbs = imp.IBSCBS?.gIBSCBS || {};

  // Muitas transportadoras detalham GRIS/TDE/TDA como "componentes" do valor
  // da prestação (cada um com um nome livre e um valor) — procuramos por
  // palavras-chave no nome, já que cada emissor escreve de um jeito.
  const componentes = vPrest.Comp
    ? (Array.isArray(vPrest.Comp) ? vPrest.Comp : [vPrest.Comp])
    : [];
  const buscarComponente = (padrao) => {
    const achado = componentes.find((c) => padrao.test((c.xNome || '').toUpperCase()));
    return achado?.vComp != null ? Number(achado.vComp) : null;
  };
  const gris = buscarComponente(/GRIS/);
  const tde = buscarComponente(/\bTDE\b|DIFICULDADE DE ENTREGA/);
  const tda = buscarComponente(/\bTDA\b|DIFICULDADE DE ACESSO/);
  const pedagio = buscarComponente(/PEDAGIO|PED[ÁA]GIO/);
  const trt = buscarComponente(/\bTRT\b|RESTRI[CÇ][ÃA]O DE TR[ÂA]NSITO/);
  const adValorem = buscarComponente(/AD ?VALOREM/);

  // Tipo do CT-e: 0 normal, 1 complementar, 2 anulação, 3 substituto. Nos
  // três últimos, o XML traz a chave do CT-e original a que ele se refere.
  const tipoCte = Number(ide.tpCTe ?? 0) || 0;
  const primeiro = (v) => (Array.isArray(v) ? v[0] : v);
  const chaveCteReferenciada = primeiro(infCte.infCteComp)?.chCTe || primeiro(infCte.infCteComp)?.chave
    || infCte.infCteAnu?.chCte || infCte.infCteAnu?.chCTe
    || infCTeNorm.infCteSub?.chCte || infCTeNorm.infCteSub?.chCTe || null;

  // Tipo de serviço: 0 normal, 1 subcontratação, 2 redespacho, 3 redespacho
  // intermediário, 4 vinculado a multimodal. E o TOMADOR (quem paga o frete):
  // toma3/toma03 aponta um dos participantes (0 remetente, 1 expedidor,
  // 2 recebedor, 3 destinatário); toma4/toma04 traz um terceiro com CNPJ.
  const tpServ = ide.tpServ != null && String(ide.tpServ).trim() !== '' ? Number(ide.tpServ) : null;
  const toma3 = ide.toma3 || ide.toma03;
  const toma4 = ide.toma4 || ide.toma04;
  const PAPEIS = { 0: ['remetente', infCte.rem], 1: ['expedidor', infCte.exped], 2: ['recebedor', infCte.receb], 3: ['destinatário', infCte.dest] };
  let tomadorPapel = null; let tomadorNo = null;
  if (toma4) { tomadorPapel = 'outros'; tomadorNo = toma4; }
  else if (toma3 && PAPEIS[String(toma3.toma)]) [tomadorPapel, tomadorNo] = PAPEIS[String(toma3.toma)];

  return {
    tp_serv: Number.isFinite(tpServ) ? tpServ : null,
    tomador_papel: tomadorPapel,
    tomador_cnpj: tomadorNo ? String(tomadorNo.CNPJ || tomadorNo.CPF || '') || null : null,
    tomador_nome: tomadorNo?.xNome ? String(tomadorNo.xNome) : null,
    tipo_cte: tipoCte,
    chave_cte_referenciada: chaveCteReferenciada ? String(chaveCteReferenciada) : null,
    observacoes_cte: String(xObs || ''),
    chave_cte: chave || null,
    numero_cte: ide.nCT ?? null,
    uf_inicio: ufInicioCte || null,
    uf_fim: ufFimCte || null,
    data_emissao_cte: (ide.dhEmi || '').toString().slice(0, 10) || null,
    transportadora: emit.xNome ?? null,
    transportadora_cte: emit.xNome ?? null,
    valor_frete_negociado: vPrest.vTPrest != null ? Number(vPrest.vTPrest) : null,
    // vTotDFe só existe nos CT-e com o grupo da reforma tributária (IBS/CBS).
    // Nos demais (a maioria), o valor total do documento é o próprio vTPrest.
    // Sem esse fallback o campo ficava vazio e a conferência automática nunca rodava.
    valor_total_cte: imp.vTotDFe != null
      ? Number(imp.vTotDFe)
      : (vPrest.vTPrest != null ? Number(vPrest.vTPrest) : null),
    gris, tde, tda, pedagio, trt, ad_valorem: adValorem,
    peso_kg: pesoInfo ? Number(pesoInfo.qCarga) : null,
    cubagem_m3: cubagemInfo ? Number(cubagemInfo.qCarga) : null,
    numero_nf_referenciada: numeroNfReferenciada,
    chaves_nfe_referenciadas: chavesNfeReferenciadas,
    transportador_cnpj: emit.CNPJ ?? null,
    transportador_ie: emit.IE ?? null,
    transportador_endereco: enderEmit.xLgr ? `${enderEmit.xLgr}, ${enderEmit.nro || 's/n'}` : null,
    transportador_bairro: enderEmit.xBairro ?? null,
    transportador_municipio: enderEmit.xMun ?? null,
    transportador_uf: enderEmit.UF ?? null,
    transportador_cep: enderEmit.CEP ?? null,
    transportador_telefone: enderEmit.fone ?? null,
    // Impostos do CT-e, pra mostrar no detalhe da auditoria de frete.
    impostos_cte: JSON.stringify({
      cst: dadosIcms.CST ?? null,
      vBC: dadosIcms.vBC != null ? Number(dadosIcms.vBC) : null,
      pICMS: dadosIcms.pICMS != null ? Number(dadosIcms.pICMS) : null,
      // Alíquota esperada calculada somente pela UFIni -> UFFim do CT-e.
      aliquotaEsperadaPelaRota: aliquotaIcmsInterestadual,
      vICMS: dadosIcms.vICMS != null ? Number(dadosIcms.vICMS) : null,
      vIBS: ibscbs.vIBS != null ? Number(ibscbs.vIBS) : null,
      vCBS: ibscbs.gCBS?.vCBS != null ? Number(ibscbs.gCBS.vCBS) : null,
      vTotDFe: imp.vTotDFe != null ? Number(imp.vTotDFe) : null,
    }),
  };
}

// Eventos (Carta de Correção, Cancelamento, Ciência da Operação etc) vêm num
// XML separado do documento original, referenciando a chave do NF-e ou CT-e
// que estão corrigindo/cancelando. A estrutura muda bastante — às vezes o
// evento fica em <evento>, às vezes em <eventoCTe>/<eventoNFe>, dentro de
// <procEventoCTe>/<procEventoNFe>/<retEventoCTe>... Em vez de adivinhar cada
// nome de campo, procuramos o primeiro "infEvento" em qualquer lugar da
// árvore do XML (o do documento original vem antes do da SEFAZ, e é o que
// tem o detalhe/justificativa de verdade).
function encontrarInfEvento(no, profundidade = 6) {
  if (!no || typeof no !== 'object' || profundidade < 0) return null;
  if (no.infEvento) return no.infEvento;
  for (const chave of Object.keys(no)) {
    const valor = no[chave];
    if (valor && typeof valor === 'object') {
      const achado = encontrarInfEvento(valor, profundidade - 1);
      if (achado) return achado;
    }
  }
  return null;
}

// O texto explicativo (Carta de Correção, motivo do cancelamento etc) quase
// sempre fica um nível mais dentro de detEvento, num bloco cujo nome muda
// conforme o tipo de evento (evCancCTe, evCCeCTe, evCancNFe...). Procuramos
// em detEvento e em qualquer um dos seus filhos.
function extrairDetalheEvento(detEvento) {
  if (!detEvento) return { descEvento: null, texto: null, nProt: null };
  const candidatos = [detEvento, ...Object.values(detEvento).filter((v) => v && typeof v === 'object')];
  for (const c of candidatos) {
    if (c.descEvento || c.xCorrecao || c.xJust) {
      return { descEvento: c.descEvento || null, texto: c.xCorrecao || c.xJust || c.xCondUso || null, nProt: c.nProt || null };
    }
  }
  return { descEvento: null, texto: null, nProt: null };
}

function parseEvento(xmlString) {
  const obj = parser.parse(xmlString);
  const infEvento = encontrarInfEvento(obj);
  if (!infEvento) return { chave: null };

  const chaveNfe = infEvento.chNFe ?? null;
  const chaveCte = infEvento.chCTe ?? null;
  const { descEvento, texto, nProt } = extrairDetalheEvento(infEvento.detEvento);

  return {
    chave: chaveNfe || chaveCte || null,
    tipoDocumento: chaveNfe ? 'nfe' : (chaveCte ? 'cte' : null),
    tpEvento: infEvento.tpEvento ?? null,
    descEvento: descEvento || infEvento.xEvento || null,
    // Texto explicativo do evento: Carta de Correção usa xCorrecao,
    // Cancelamento usa xJust — pegamos qualquer um que existir.
    textoDetalhe: texto,
    dhEvento: (infEvento.dhEvento || infEvento.dhRegEvento || '').toString().slice(0, 10) || null,
    numeroProtocolo: infEvento.nProt ?? nProt ?? null,
    // Comprovante de Entrega (CT-e 110180 / NF-e 110130): quando e para quem foi entregue.
    ...dadosComprovanteEntrega(infEvento.detEvento),
    // Situação do registro na SEFAZ (retEvento): 135/136/155 = registrado. Nulo = arquivo sem retorno.
    cStatRegistro: (() => { const r = encontrarNo(obj, (n) => n.cStat != null && (n.tpEvento != null || n.dhRegEvento != null)); return r ? String(r.cStat) : null; })(),
  };
}
function dadosComprovanteEntrega(detEvento) {
  const no = encontrarNo(detEvento, (n) => n.dhEntrega != null);
  if (!no) return { dhEntrega: null, recebedorNome: null, recebedorDoc: null };
  return {
    dhEntrega: String(no.dhEntrega).slice(0, 10) || null,
    recebedorNome: no.xNome ? String(no.xNome) : null,
    recebedorDoc: no.nDoc ? String(no.nDoc) : null,
  };
}

/**
 * Monta a "memória de cálculo" do CT-e a partir do XML guardado: os
 * componentes da prestação, os impostos (ICMS, IBS, CBS) e os totais.
 * Usado pelo Detalhe do Frete da auditoria, pra mostrar lado a lado com
 * o cálculo do sistema.
 */
function extrairComposicaoCTe(xmlString) {
  const json = parser.parse(xmlString);
  const infCte = (json.cteProc?.CTe || json.CTe)?.infCte;
  if (!infCte) throw new Error('XML do CT-e inválido (tag infCte não encontrada).');

  const num = (v) => (v != null && v !== '' ? Number(v) : null);
  const lista = (v) => (v == null ? [] : (Array.isArray(v) ? v : [v]));

  const vPrest = infCte.vPrest || {};
  const imp = infCte.imp || {};
  const infCarga = infCte.infCTeNorm?.infCarga || {};

  const gruposIcms = imp.ICMS || {};
  const nomeGrupoIcms = Object.keys(gruposIcms)[0] || null;
  const icms = nomeGrupoIcms ? gruposIcms[nomeGrupoIcms] || {} : {};

  const ibscbsRaiz = imp.IBSCBS || {};
  const g = ibscbsRaiz.gIBSCBS || {};

  return {
    componentes: lista(vPrest.Comp).map((c) => ({ nome: c.xNome || '—', valor: num(c.vComp) })),
    vTPrest: num(vPrest.vTPrest),
    vRec: num(vPrest.vRec),
    icms: {
      grupo: nomeGrupoIcms,
      cst: icms.CST ?? null,
      vBC: num(icms.vBC),
      pRedBC: num(icms.pRedBC),
      pICMS: num(icms.pICMS),
      vICMS: num(icms.vICMS),
    },
    ibscbs: {
      cst: ibscbsRaiz.CST ?? null,
      vBC: num(g.vBC),
      pIBSUF: num(g.gIBSUF?.pIBSUF),
      vIBSUF: num(g.gIBSUF?.vIBSUF),
      pIBSMun: num(g.gIBSMun?.pIBSMun),
      vIBSMun: num(g.gIBSMun?.vIBSMun),
      vIBS: num(g.vIBS),
      pCBS: num(g.gCBS?.pCBS),
      vCBS: num(g.gCBS?.vCBS),
    },
    vTotTrib: num(imp.vTotTrib),
    vTotDFe: num(imp.vTotDFe),
    vCarga: num(infCarga.vCarga),
    quantidades: lista(infCarga.infQ).map((q) => ({ tipo: q.tpMed || '—', qtd: num(q.qCarga) })),
  };
}

// Retorno da SEFAZ (recibo de autorização/consulta: protNFe, retConsSitNFe,
// retConsReciNFe, protCTe...). Não traz os dados da nota — só a chave, a
// situação (cStat/xMotivo) e o protocolo. O ERP costuma salvar como "-ret.xml".
function encontrarNo(no, teste, profundidade = 6) {
  if (!no || typeof no !== 'object' || profundidade < 0) return null;
  if (teste(no)) return no;
  for (const valor of Object.values(no)) {
    const achado = encontrarNo(valor, teste, profundidade - 1);
    if (achado) return achado;
  }
  return null;
}
function parseRetorno(xmlString) {
  const obj = parser.parse(xmlString);
  const no = encontrarNo(obj, (n) => (n.chNFe || n.chCTe) && n.cStat != null)
    || encontrarNo(obj, (n) => n.cStat != null);
  if (!no) return { chave: null };
  const chave = String(no.chNFe || no.chCTe || '').replace(/\D/g, '') || null;
  return {
    chave,
    tipoDocumento: no.chNFe ? 'nfe' : (no.chCTe ? 'cte' : null),
    cStat: String(no.cStat),
    xMotivo: no.xMotivo ? String(no.xMotivo) : null,
    nProt: no.nProt ? String(no.nProt) : null,
    data: String(no.dhRecbto || no.dhRegEvento || '').slice(0, 10) || null,
  };
}

module.exports = { parseNFe, parseCTe, parseEvento, parseRetorno, extrairComposicaoCTe };
