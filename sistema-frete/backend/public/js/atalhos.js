// =====================================================================
// Atalhos para quem trabalha rápido (como no SSW):
//  • "Ir para…" (Ctrl+K ou F2): digite o código da tela (ex.: 001 = Coletas)
//    ou parte do nome e aperte Enter.
//  • Modo compacto: menos espaço, mais linhas na tela.
//  • Formulários (janelas): Enter passa para o próximo campo e Ctrl+Enter
//    aciona o botão principal (Salvar / Transmitir / Lançar).
// Usa só o que já está na tela: cada destino é um item do menu (que já
// respeita as permissões do usuário).
// =====================================================================
(() => {
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const norm = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const guardado = { ler: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, por: (k, v) => { try { localStorage.setItem(k, v); } catch { /* sem armazenamento */ } } };

  // Códigos das telas (fixos, para decorar). O primeiro número diz a área:
  //   0xx operação · 1xx financeiro · 2xx frota · 3xx gestão e relatórios · 4xx notas e fretes contratados
  //   5xx comunicação · 9xx sistema. Na mesma área, o número seguinte ao da tela é o "novo" (001 Coletas → 002 Nova coleta).
  // 001 = Coletas, como no SSW.
  // Chave: "t:<página>:<aba>" (Operação de Transporte), "p:<página>" (menu) ou "r:<subaba>" (Relatórios).
  const AREAS = { 0: 'Operação', 1: 'Financeiro', 2: 'Frota', 3: 'Gestão e relatórios', 4: 'Notas e fretes contratados', 5: 'Comunicação', 9: 'Sistema e tela' };
  const CODIGOS = {
    'p:hoje': ['000', 'hoje inicio pendencias tarefas do dia'],
    't:coletas:': ['001', 'coleta pedido recolher'], 't:cotacoes:': ['010', 'cotacao orcamento preco proposta'],
    't:emissao-cte:lista': ['020', 'cte conhecimento emitir dacte'], 't:emissao-cte:mdfe': ['025', 'mdfe manifesto'],
    't:emissao-cte:nfse': ['030', 'nfse nota servico iss municipal'],
    't:ocorrencias:romaneios': ['040', 'romaneio saida motorista app'], 't:ocorrencias:entregas': ['041', 'ocorrencia entrega baixa comprovante canhoto'],
    't:conferencia:conferir': ['050', 'bipagem conferencia leitor codigo barras'], 't:conferencia:etiquetas': ['051', 'etiqueta volume imprimir zpl'],
    't:filiais:estoque': ['060', 'estoque filial onde esta mercadoria armazem'], 't:filiais:transferencias': ['061', 'transferencia filial'], 't:parceiros:': ['065', 'parceiros agentes redespacho subcontratacao conta corrente acerto'],
    't:sac:': ['090', 'sac chamado protocolo atendimento reclamacao cliente suporte'],
    't:edi:': ['070', 'edi notfis conemb ocoren doccob'], 't:portal-cliente:': ['080', 'portal cliente embarcador acesso'],
    't:faturamento:faturas': ['100', 'fatura faturar cobranca'], 't:faturamento:resumo': ['101', 'contas receber receber'],
    't:faturamento:boletos': ['102', 'boleto cnab remessa retorno banco'], 't:faturamento:regua': ['103', 'regua cobranca lembrete vencimento atraso inadimplencia'], 't:faturamento:extras': ['104', 'servicos extras reentrega devolucao estadia armazenagem descarga cobranca complementar'], 't:pagar:contas': ['110', 'contas pagar despesa fornecedor'],
    't:pagar:acertos': ['120', 'acerto viagem motorista ciot vale pedagio agregado'], 't:comissoes:apuracao': ['125', 'comissao vendedor representante carteira'], 'p:financeiro': ['130', 'financeiro'],
    't:contabil:livro': ['140', 'fiscal contabilidade contador livro saidas apuracao icms iss cfop sped lancamentos'], 't:contabil:pacote': ['141', 'pacote contador xml zip mensal enviar'], 't:contabil:entradas': ['142', 'notas de entrada compras livro de entradas credito icms apuracao diesel fornecedor xml'], 't:contabil:dfe': ['143', 'nfe contra cnpj sefaz distribuicao dfe manifestacao destinatario ciencia baixar xml compras'],
    't:bancos:contas': ['150', 'caixa banco saldo conta bancaria tesouraria'], 't:bancos:conciliacao': ['151', 'conciliacao extrato ofx banco'], 't:bancos:fluxo': ['152', 'fluxo caixa previsao projecao'],
    't:frota:painel': ['200', 'frota custo km'], 't:frota:abastecimentos': ['201', 'abastecimento combustivel diesel consumo'],
    't:frota:manutencoes': ['210', 'manutencao oficina preventiva'], 't:frota:documentos': ['230', 'documentos vencimento crlv rntrc tacografo cnh toxicologico mopp'], 't:frota:pneus': ['240', 'pneus fogo rodizio recapagem sulco'], 't:frota:jornada': ['250', 'jornada motorista lei 13103 horas extras direcao pausa espelho'], 't:emissao-cte:frota': ['220', 'veiculo motorista placa cadastro'],
    't:painel-transporte:geral': ['300', 'painel gerencial indicadores'], 't:painel-transporte:resultado': ['301', 'margem resultado lucro cliente dre'], 't:centros:resultado': ['302', 'centro de custo resultado filial veiculo rota'],
    'r:graficos': ['310', 'relatorio grafico'], 'r:entregas': ['311', 'entregas previstas'], 'r:semMapa': ['312', 'mapa'],
    'r:melhorTransp': ['313', 'melhor transportadora'], 'r:consolidacao': ['314', 'consolidar rotas'], 'r:roteirizar': ['315', 'roteirizar rota'],
    'r:bi': ['316', 'bi relatorio montar'], 'r:comparador': ['317', 'comparar cotacoes'], 'r:anomalias': ['318', 'anomalias'],
    'r:scorecard': ['319', 'scorecard'], 'r:nfeCte': ['320', 'nfe cte'], 'r:auditoriaFrete': ['321', 'conferencia cte'],
    'p:auditoria-frete': ['330', 'auditoria frete'],
    'p:visao-geral': ['400', 'inicio'], 'p:upload': ['401', 'xml importar nota'], 'p:registros': ['402', 'registros fretes notas'],
    'p:sinistros': ['410', 'sinistro avaria'],
    'p:mensagens': ['500', 'mensagem'], 'p:agenda': ['501', 'agenda compromisso'],
    'p:cadastros': ['900', 'cadastro usuario transportadora tabela preco'], 't:filiais:unidades': ['901', 'filial unidade'],
    't:emissao-cte:config': ['902', 'configuracao fiscal certificado'], 'p:manutencao': ['903', 'manutencao sistema backup atualizacao'], 'p:integracao': ['904', 'integracao api erp webhook chave'],
  };
  // Ações diretas: abrem a tela e clicam no botão de "novo" (código = o da tela + 1).
  const ACOES = [
    { codigo: '002', rotulo: '＋ Nova coleta', chave: 't:coletas:', botao: 'colNova', palavras: 'nova coleta' },
    { codigo: '011', rotulo: '＋ Nova cotação', chave: 't:cotacoes:', botao: 'ctNova', palavras: 'nova cotacao' },
    { codigo: '021', rotulo: '＋ Novo CT-e', chave: 't:emissao-cte:lista', botao: 'btnNovoCte', palavras: 'novo cte emitir' },
    { codigo: '031', rotulo: '＋ Nova NFS-e', chave: 't:emissao-cte:nfse', botao: 'nsNova', palavras: 'nova nfse', tardio: true },
    { codigo: '153', rotulo: '📥 Importar extrato do banco (OFX)', chave: 't:bancos:conciliacao', botao: 'bxImportar', palavras: 'importar extrato ofx banco' },
    { codigo: '111', rotulo: '＋ Nova conta a pagar', chave: 't:pagar:contas', botao: 'cpNova', palavras: 'nova conta pagar' },
    { codigo: '202', rotulo: '＋ Novo abastecimento', chave: 't:frota:abastecimentos', botao: 'fvNovoAbast', palavras: 'novo abastecimento' },
    { codigo: '211', rotulo: '＋ Nova manutenção', chave: 't:frota:manutencoes', botao: 'fvNovaManut', palavras: 'nova manutencao' },
  ];

  const visivel = (el) => el && !el.classList.contains('oculto') && !window.Modulos?.fora(el);
  // Nome do item sem os contadores (ex.: "Notas sem mapa 5").
  const limpo = (el) => { const c = el.cloneNode(true); c.querySelectorAll('.nav-badge, .nav-cod, [id^="badge"]').forEach((b) => b.remove()); return c.textContent.replace(/\s+/g, ' ').trim(); };

  // Destinos que este usuário pode abrir (o menu já esconde o que ele não pode).
  function destinos() {
    const lista = [];
    document.querySelectorAll('.nav-tsub').forEach((el) => {
      if (!visivel(el)) return;
      const chave = `t:${el.dataset.ir}:${el.dataset.aba || ''}`;
      const g = el.closest('.nav-sub')?.dataset.grupo;
      const nomeGrupo = g ? limpo(document.querySelector(`.nav-grupo[data-grupo="${g}"]`)).replace(/[▸▾]/g, '').trim() : 'Menu';
      lista.push({ chave, rotulo: limpo(el), grupo: nomeGrupo, abrir: () => el.click() });
    });
    document.querySelectorAll('.barra-lateral .nav-item[data-pagina]').forEach((el) => {
      if (!visivel(el) || el.classList.contains('nav-no-grupo') || el.dataset.pagina === 'relatorios') return;
      lista.push({ chave: `p:${el.dataset.pagina}`, rotulo: limpo(el).replace(/\s*\d+$/, ''), grupo: 'Menu', abrir: () => el.click() });
    });
    const rel = document.querySelector('.nav-item[data-pagina="relatorios"]');
    if (visivel(rel)) {
      document.querySelectorAll('.nav-subitem[data-subaba]').forEach((el) => {
        lista.push({ chave: `r:${el.dataset.subaba}`, rotulo: limpo(el), grupo: 'Relatórios', abrir: () => { if (!document.getElementById('pagina-relatorios') || document.getElementById('pagina-relatorios').classList.contains('oculto')) rel.click(); el.click(); } });
      });
    }
    const porChave = new Map(lista.map((d) => [d.chave, d]));
    ACOES.forEach((a) => {
      const tela = porChave.get(a.chave);
      if (!tela || (!a.tardio && !$(a.botao))) return;   // tardio: o botão só aparece quando a aba abre
      lista.push({ chave: `a:${a.codigo}`, codigo: a.codigo, rotulo: a.rotulo, grupo: 'Ação', palavras: a.palavras,
        abrir: () => {
          tela.abrir();
          let tentativas = 0;
          const clicar = () => { const b = $(a.botao); if (b && b.offsetParent !== null) b.click(); else if ((tentativas += 1) < 20) setTimeout(clicar, 150); };
          setTimeout(clicar, 250);
        } });
    });
    lista.push({ chave: 'x:compacto', codigo: '990', rotulo: document.body.classList.contains('modo-compacto') ? 'Desligar o modo compacto' : 'Ligar o modo compacto', grupo: 'Tela', palavras: 'compacto denso tela', abrir: alternarCompacto });
    if ($('btnAlternarTema')) lista.push({ chave: 'x:tema', codigo: '991', rotulo: 'Trocar tema claro / escuro', grupo: 'Tela', palavras: 'tema claro escuro', abrir: () => $('btnAlternarTema').click() });
    lista.push({ chave: 'x:ajuda', codigo: '999', rotulo: 'Lista de todos os códigos', grupo: 'Tela', palavras: 'ajuda codigos atalhos', abrir: () => setTimeout(mostrarCodigos, 50) });
    return lista.map((d) => ({ ...d, codigo: d.codigo || CODIGOS[d.chave]?.[0] || '', palavras: `${d.palavras || ''} ${CODIGOS[d.chave]?.[1] || ''}` }));
  }

  function buscar(q, lista) {
    const t = norm(q);
    if (!t) {
      const recentes = (guardado.ler('irRecentes') || '').split('|').filter(Boolean);
      const r = recentes.map((k) => lista.find((d) => d.chave === k)).filter(Boolean);
      return [...r, ...lista.filter((d) => !recentes.includes(d.chave) && d.codigo).sort((a, b) => a.codigo.localeCompare(b.codigo))].slice(0, 40);
    }
    if (/^\d+$/.test(t)) {
      const exato = lista.filter((d) => d.codigo === t.padStart(3, '0'));
      return [...exato, ...lista.filter((d) => d.codigo.startsWith(t) && !exato.includes(d)).sort((a, b) => a.codigo.localeCompare(b.codigo))];
    }
    const palavras = t.split(' ');
    return lista.map((d) => {
      const nome = norm(d.rotulo); const tudo = `${nome} ${norm(d.palavras)} ${norm(d.grupo)}`;
      if (!palavras.every((p) => tudo.includes(p))) return null;
      const pontos = (nome.startsWith(t) ? 0 : nome.includes(t) ? 1 : 2) + (d.grupo === 'Ação' ? 0.5 : 0);
      return { d, pontos };
    }).filter(Boolean).sort((a, b) => a.pontos - b.pontos).map((x) => x.d);
  }

  // ---------- Janela "Ir para…" ----------
  const fundo = document.createElement('div');
  fundo.id = 'irFundo'; fundo.className = 'ir-fundo oculto';
  fundo.innerHTML = `<div class="ir-caixa" role="dialog" aria-label="Ir para">
      <input id="irCampo" class="ir-campo" placeholder="Código da tela (ex.: 001) ou nome (ex.: fatura, abastecimento)…" autocomplete="off" spellcheck="false" />
      <div id="irLista" class="ir-lista" role="listbox"></div>
      <div class="ir-rodape"><span><kbd>↑</kbd><kbd>↓</kbd> escolher</span><span><kbd>Enter</kbd> abrir</span><span><kbd>Esc</kbd> fechar</span><span><kbd>999</kbd> lista de códigos</span><span>0 operação · 1 financeiro · 2 frota · 3 gestão</span></div></div>`;
  document.body.appendChild(fundo);
  let atuais = []; let sel = 0; let lista = [];

  function desenhar() {
    atuais = buscar($('irCampo').value, lista).slice(0, 12);
    sel = Math.min(sel, Math.max(atuais.length - 1, 0));
    $('irLista').innerHTML = atuais.length ? atuais.map((d, i) => `<div class="ir-item ${i === sel ? 'ativo' : ''}" data-i="${i}" role="option" aria-selected="${i === sel}">
        <span class="ir-cod">${esc(d.codigo || '—')}</span><span class="ir-nome">${esc(d.rotulo)}</span><span class="ir-grupo">${esc(d.grupo)}</span></div>`).join('')
      : '<div class="ir-vazio">Nada com esse código ou nome. Digite 999 para ver todos os códigos.</div>';
  }
  function abrirPaleta() {
    lista = destinos();
    $('irCampo').value = ''; sel = 0;
    fundo.classList.remove('oculto');
    desenhar();
    $('irCampo').focus();   // já na hora: quem digita rápido não perde a primeira tecla
  }
  const fecharPaleta = () => fundo.classList.add('oculto');
  function escolher(d) {
    if (!d) return;
    fecharPaleta();
    const recentes = [d.chave, ...(guardado.ler('irRecentes') || '').split('|').filter((k) => k && k !== d.chave)].slice(0, 5);
    guardado.por('irRecentes', recentes.join('|'));
    document.querySelectorAll('.modal-overlay:not(.oculto)').forEach((m) => { if (m.id !== 'painelInatividade') m.classList.add('oculto'); });
    d.abrir();
  }
  $('irCampo').addEventListener('input', () => { sel = 0; desenhar(); });
  $('irCampo').addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(sel + 1, atuais.length - 1); desenhar(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(sel - 1, 0); desenhar(); }
    else if (e.key === 'Enter') { e.preventDefault(); escolher(atuais[sel]); }
    else if (e.key === 'Escape') { e.preventDefault(); fecharPaleta(); }
  });
  $('irLista').addEventListener('mousedown', (e) => { const it = e.target.closest('[data-i]'); if (it) { e.preventDefault(); escolher(atuais[Number(it.dataset.i)]); } });
  fundo.addEventListener('mousedown', (e) => { if (e.target === fundo) fecharPaleta(); });

  function mostrarCodigos() {
    const todos = destinos().filter((d) => d.codigo).sort((a, b) => a.codigo.localeCompare(b.codigo));
    const caixa = document.createElement('div');
    caixa.className = 'modal-overlay';
    caixa.innerHTML = `<div class="painel modal-card" style="max-width:720px; width:100%; max-height:90vh; overflow-y:auto; padding:22px 24px;">
      <div style="display:flex; justify-content:space-between; align-items:center;"><h3 style="margin:0;">⌨ Códigos das telas</h3><span style="cursor:pointer; font-size:18px;" data-ir-fechar>✕</span></div>
      <p style="font-size:13px; color:var(--texto-fraco);">Aperte <kbd>Ctrl</kbd>+<kbd>K</kbd> (ou <kbd>F2</kbd>) em qualquer tela, digite o código e <kbd>Enter</kbd>. Também dá para digitar parte do nome.</p>
      <div class="ir-codigos">${Object.entries(AREAS).map(([n, nome]) => {
        const daArea = todos.filter((d) => d.codigo[0] === n);
        return daArea.length ? `<h4>${n}xx · ${esc(nome)}</h4>${daArea.map((d) => `<div><b>${esc(d.codigo)}</b> ${esc(d.rotulo)}</div>`).join('')}` : '';
      }).join('')}</div>
      <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:12px;"><button class="btn btn-secundario" id="irImprimir" style="width:auto;">🖨 Imprimir</button><button class="btn btn-primario" data-ir-fechar style="width:auto;">Fechar</button></div></div>`;
    document.body.appendChild(caixa);
    caixa.addEventListener('click', (e) => { if (e.target === caixa || e.target.closest('[data-ir-fechar]')) caixa.remove(); });
    caixa.querySelector('#irImprimir').addEventListener('click', () => {
      const w = window.open('', '_blank');
      if (!w) return;
      w.document.write(`<!doctype html><meta charset="utf-8"><title>Códigos das telas — Nexofrete</title><style>body{font-family:Arial;font-size:13px;columns:2;} div{padding:3px 0;break-inside:avoid;} b{display:inline-block;width:38px;}</style>
        <h2 style="column-span:all;">Nexofrete — códigos das telas (Ctrl+K)</h2>${Object.entries(AREAS).map(([n, nome]) => {
        const daArea = todos.filter((d) => d.codigo[0] === n);
        return daArea.length ? `<h4 style="margin:10px 0 4px;">${n}xx · ${esc(nome)}</h4>${daArea.map((d) => `<div><b>${esc(d.codigo)}</b> ${esc(d.rotulo.replace(/^[^\wÀ-ú＋]+/, ''))}</div>`).join('')}` : '';
      }).join('')}`);
      w.document.close(); w.focus(); w.print();
    });
  }

  // Código ao lado de cada item do menu (cinza, para ir decorando).
  function codigosNoMenu() {
    const por = (el, chave) => {
      const cod = CODIGOS[chave]?.[0];
      if (!cod || el.querySelector('.nav-cod')) return;
      const sp = document.createElement('span');
      sp.className = 'nav-cod'; sp.textContent = cod; sp.title = `Código ${cod}: Ctrl+K, ${cod}, Enter`;
      el.classList.add('tem-cod');
      // Item com contador (Mensagens, Agenda) ou seta (Relatórios): o código fica antes deles, no fluxo do texto.
      const fim = el.querySelector('.nav-badge, [id^="badge"], [id$="Seta"]');
      if (el.style.display === 'flex' && fim) { el.classList.add('cod-antes'); el.insertBefore(sp, fim); }
      else if (fim) { sp.style.cssText = 'position:static; transform:none; float:right; margin-right:8px;'; el.classList.add('cod-antes'); el.insertBefore(sp, fim); }
      else el.appendChild(sp);
    };
    document.querySelectorAll('.nav-tsub').forEach((el) => por(el, `t:${el.dataset.ir}:${el.dataset.aba || ''}`));
    document.querySelectorAll('.barra-lateral .nav-item[data-pagina]').forEach((el) => { if (!el.classList.contains('nav-no-grupo')) por(el, `p:${el.dataset.pagina}`); });
    document.querySelectorAll('.nav-subitem[data-subaba]').forEach((el) => por(el, `r:${el.dataset.subaba}`));
  }
  codigosNoMenu();

  // Botão no menu lateral.
  const marca = document.querySelector('.barra-lateral .marca');
  if (marca) {
    const b = document.createElement('button');
    b.type = 'button'; b.id = 'irBotao'; b.className = 'ir-botao'; b.title = 'Ir para uma tela pelo código ou pelo nome';
    b.innerHTML = '<span>🔎 Ir para…</span><kbd>Ctrl K</kbd>';
    b.addEventListener('click', abrirPaleta);
    marca.insertAdjacentElement('afterend', b);
  }

  // ---------- Modo compacto ----------
  function aplicarCompacto(ligado) {
    document.body.classList.toggle('modo-compacto', ligado);
    const bt = $('irCompacto');
    if (bt) bt.querySelector('span:last-child').textContent = ligado ? 'Modo compacto: ligado' : 'Modo compacto';
  }
  function alternarCompacto() {
    const ligado = !document.body.classList.contains('modo-compacto');
    guardado.por('modoCompacto', ligado ? '1' : '0');
    aplicarCompacto(ligado);
  }
  const tema = $('btnAlternarTema');
  if (tema) {
    const b = document.createElement('button');
    b.type = 'button'; b.id = 'irCompacto'; b.className = 'alternador-tema'; b.title = 'Menos espaço e letra menor: mais linhas na tela';
    b.style.cssText = 'margin-top:6px; display:flex; align-items:center; gap:6px;';
    b.innerHTML = '<span>▤</span> <span>Modo compacto</span>';
    b.addEventListener('click', alternarCompacto);
    tema.insertAdjacentElement('afterend', b);
  }
  aplicarCompacto(guardado.ler('modoCompacto') === '1');

  // ---------- Teclas ----------
  const digitando = (el) => el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
  const janelaAberta = (el) => el?.closest?.('.modal-overlay:not(.oculto)');
  document.addEventListener('keydown', (e) => {
    if (document.getElementById('painelInatividade') && !document.getElementById('painelInatividade').classList.contains('oculto')) return;
    // Ctrl+K / F2: Ir para (de qualquer lugar).
    if ((e.key === 'k' || e.key === 'K') && (e.ctrlKey || e.metaKey) && !e.altKey) { e.preventDefault(); if (fundo.classList.contains('oculto')) abrirPaleta(); else fecharPaleta(); return; }
    if (e.key === 'F2') { e.preventDefault(); abrirPaleta(); return; }
    if (!fundo.classList.contains('oculto') || e.defaultPrevented) return;
    const alvo = e.target;
    const janela = janelaAberta(alvo);
    if (!janela || document.querySelector('.dlg-fundo')) return;
    // Ctrl+Enter: botão principal da janela (o destacado; o último, se houver mais de um).
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      const principais = [...janela.querySelectorAll('.btn-primario')].filter((b) => !b.disabled && b.offsetParent !== null && !b.matches('[data-fv-fechar], [data-ct-fechar], [data-pc-fechar], [data-ns-fechar], [data-cp-fechar]'));
      const botao = principais[principais.length - 1];
      if (botao) { e.preventDefault(); botao.click(); }
      return;
    }
    // Enter num campo: vai para o próximo (como Tab). Não mexe em textarea, botões, nem em campos com Enter próprio.
    if (e.key !== 'Enter' || e.shiftKey || e.altKey || !digitando(alvo) || alvo.tagName === 'TEXTAREA' || alvo.dataset.enterProprio != null) return;
    if (alvo.tagName === 'INPUT' && ['button', 'submit', 'reset', 'file'].includes(alvo.type)) return;
    const campos = [...janela.querySelectorAll('input, select, textarea')]
      .filter((el) => !el.disabled && !el.readOnly && el.type !== 'hidden' && el.type !== 'file' && el.offsetParent !== null);
    const i = campos.indexOf(alvo);
    if (i < 0) return;
    e.preventDefault();
    const prox = campos[i + 1];
    if (prox) { prox.focus(); if (prox.select && prox.type !== 'checkbox' && prox.type !== 'radio' && prox.type !== 'date') prox.select(); }
  });
})();
