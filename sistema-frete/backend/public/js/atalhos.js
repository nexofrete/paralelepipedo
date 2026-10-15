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

  // Códigos das telas (fixos, para decorar). 001 = Coletas, como no SSW.
  // Chave: "t:<página>:<aba>" (Operação de Transporte), "p:<página>" (menu) ou "r:<subaba>" (Relatórios).
  const CODIGOS = {
    't:coletas:': ['001', 'coleta pedido recolher'], 't:cotacoes:': ['002', 'cotacao orcamento preco proposta'],
    't:emissao-cte:lista': ['004', 'cte conhecimento emitir dacte'], 't:emissao-cte:mdfe': ['006', 'mdfe manifesto'],
    't:emissao-cte:nfse': ['007', 'nfse nota servico iss municipal'], 't:ocorrencias:entregas': ['010', 'ocorrencia entrega baixa comprovante canhoto'],
    't:ocorrencias:romaneios': ['011', 'romaneio saida motorista app'], 't:conferencia:conferir': ['012', 'bipagem conferencia leitor codigo barras'],
    't:conferencia:etiquetas': ['013', 'etiqueta volume imprimir zpl'], 't:filiais:estoque': ['014', 'estoque filial onde esta mercadoria armazem'],
    't:filiais:transferencias': ['015', 'transferencia filial'], 't:faturamento:faturas': ['020', 'fatura faturar cobranca'],
    't:faturamento:resumo': ['021', 'contas receber receber'], 't:faturamento:boletos': ['022', 'boleto cnab remessa retorno banco'],
    't:pagar:contas': ['023', 'contas pagar despesa fornecedor'], 't:pagar:acertos': ['024', 'acerto viagem motorista ciot vale pedagio agregado'],
    't:frota:painel': ['030', 'frota custo km'], 't:frota:abastecimentos': ['031', 'abastecimento combustivel diesel consumo'],
    't:frota:manutencoes': ['032', 'manutencao oficina preventiva'], 't:emissao-cte:frota': ['033', 'veiculo motorista placa cadastro'],
    't:painel-transporte:geral': ['040', 'painel gerencial indicadores'], 't:painel-transporte:resultado': ['041', 'margem resultado lucro cliente dre'],
    't:edi:': ['050', 'edi notfis conemb ocoren doccob'], 't:portal-cliente:': ['051', 'portal cliente embarcador acesso'],
    't:filiais:unidades': ['052', 'filial unidade'], 't:emissao-cte:config': ['053', 'configuracao fiscal certificado'],
    'p:visao-geral': ['060', 'inicio'], 'p:upload': ['061', 'xml importar nota'], 'p:registros': ['062', 'registros fretes notas'],
    'p:auditoria-frete': ['063', 'auditoria frete'], 'p:financeiro': ['064', 'financeiro'], 'p:sinistros': ['070', 'sinistro avaria'],
    'p:mensagens': ['071', 'mensagem'], 'p:agenda': ['072', 'agenda compromisso'], 'p:cadastros': ['080', 'cadastro usuario transportadora tabela preco'],
    'p:manutencao': ['081', 'manutencao sistema backup atualizacao'],
    'r:graficos': ['090', 'relatorio grafico'], 'r:entregas': ['091', 'entregas previstas'], 'r:semMapa': ['092', 'mapa'],
    'r:melhorTransp': ['093', 'melhor transportadora'], 'r:consolidacao': ['094', 'consolidar rotas'], 'r:roteirizar': ['095', 'roteirizar rota'],
    'r:bi': ['096', 'bi relatorio montar'], 'r:comparador': ['097', 'comparar cotacoes'], 'r:anomalias': ['098', 'anomalias'],
    'r:scorecard': ['099', 'scorecard'], 'r:nfeCte': ['100', 'nfe cte'], 'r:auditoriaFrete': ['101', 'conferencia cte'],
  };
  // Ações diretas: abrem a tela e clicam no botão de "novo".
  const ACOES = [
    { codigo: '003', rotulo: '＋ Nova cotação', chave: 't:cotacoes:', botao: 'ctNova', palavras: 'nova cotacao' },
    { codigo: '005', rotulo: '＋ Novo CT-e', chave: 't:emissao-cte:lista', botao: 'btnNovoCte', palavras: 'novo cte emitir' },
    { codigo: '008', rotulo: '＋ Nova NFS-e', chave: 't:emissao-cte:nfse', botao: 'nsNova', palavras: 'nova nfse', tardio: true },
    { codigo: '009', rotulo: '＋ Nova coleta', chave: 't:coletas:', botao: 'colNova', palavras: 'nova coleta' },
    { codigo: '025', rotulo: '＋ Conta a pagar', chave: 't:pagar:contas', botao: 'cpNova', palavras: 'nova conta pagar' },
    { codigo: '034', rotulo: '＋ Abastecimento', chave: 't:frota:abastecimentos', botao: 'fvNovoAbast', palavras: 'novo abastecimento' },
    { codigo: '035', rotulo: '＋ Manutenção', chave: 't:frota:manutencoes', botao: 'fvNovaManut', palavras: 'nova manutencao' },
  ];

  const visivel = (el) => el && !el.classList.contains('oculto');
  // Nome do item sem os contadores (ex.: "Notas sem mapa 5").
  const limpo = (el) => { const c = el.cloneNode(true); c.querySelectorAll('.nav-badge, [id^="badge"]').forEach((b) => b.remove()); return c.textContent.replace(/\s+/g, ' ').trim(); };

  // Destinos que este usuário pode abrir (o menu já esconde o que ele não pode).
  function destinos() {
    const lista = [];
    document.querySelectorAll('.nav-tsub').forEach((el) => {
      if (!visivel(el)) return;
      const chave = `t:${el.dataset.ir}:${el.dataset.aba || ''}`;
      lista.push({ chave, rotulo: limpo(el), grupo: 'Operação de Transporte', abrir: () => el.click() });
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
    lista.push({ chave: 'x:compacto', codigo: '900', rotulo: document.body.classList.contains('modo-compacto') ? 'Desligar o modo compacto' : 'Ligar o modo compacto', grupo: 'Tela', palavras: 'compacto denso tela', abrir: alternarCompacto });
    if ($('btnAlternarTema')) lista.push({ chave: 'x:tema', codigo: '901', rotulo: 'Trocar tema claro / escuro', grupo: 'Tela', palavras: 'tema claro escuro', abrir: () => $('btnAlternarTema').click() });
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
      <div class="ir-rodape"><span><kbd>↑</kbd><kbd>↓</kbd> escolher</span><span><kbd>Enter</kbd> abrir</span><span><kbd>Esc</kbd> fechar</span><span><kbd>999</kbd> lista de códigos</span></div></div>`;
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
      <div class="ir-codigos">${todos.map((d) => `<div><b>${esc(d.codigo)}</b> ${esc(d.rotulo)}</div>`).join('')}</div>
      <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:12px;"><button class="btn btn-secundario" id="irImprimir" style="width:auto;">🖨 Imprimir</button><button class="btn btn-primario" data-ir-fechar style="width:auto;">Fechar</button></div></div>`;
    document.body.appendChild(caixa);
    caixa.addEventListener('click', (e) => { if (e.target === caixa || e.target.closest('[data-ir-fechar]')) caixa.remove(); });
    caixa.querySelector('#irImprimir').addEventListener('click', () => {
      const w = window.open('', '_blank');
      if (!w) return;
      w.document.write(`<!doctype html><meta charset="utf-8"><title>Códigos das telas — Nexofrete</title><style>body{font-family:Arial;font-size:13px;columns:2;} div{padding:3px 0;break-inside:avoid;} b{display:inline-block;width:38px;}</style>
        <h2 style="column-span:all;">Nexofrete — códigos das telas (Ctrl+K)</h2>${todos.map((d) => `<div><b>${esc(d.codigo)}</b> ${esc(d.rotulo.replace(/^[^\wÀ-ú＋]+/, ''))}</div>`).join('')}`);
      w.document.close(); w.focus(); w.print();
    });
  }

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
