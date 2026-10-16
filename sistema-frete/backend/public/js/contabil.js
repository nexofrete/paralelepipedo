// =====================================================================
// Fiscal e contabilidade: livro de saídas (CFOP, CST, UF, ICMS e ISS),
// lançamentos contábeis pelo plano de contas do contador e o pacote do
// mês (.zip com todos os XML), com envio por e-mail.
// Usa do dashboard.js: usuario, apiFetch, mostrarAlerta, pedirTexto, token.
// =====================================================================
(() => {
  const pode = usuario?.perfil === 'admin' || !!usuario?.pode_ver_financeiro;
  const nav = document.getElementById('navContabil');
  if (!pode || !nav) return;
  nav.classList.remove('oculto');

  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const brl = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const num = (v) => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const dia = (v) => (v ? String(v).slice(0, 10).split('-').reverse().join('/') : '—');
  const docFmt = (d) => { const x = String(d || ''); return x.length === 14 ? x.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : x.length === 11 ? x.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4') : x; };
  const erro = (e) => mostrarAlerta(e.message, { tipo: 'erro' });
  const api = async (caminho, opcoes = {}) => {
    const r = await apiFetch(`/api/contabil${caminho}`, { ...opcoes, headers: { 'Content-Type': 'application/json' } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.erro || 'Erro ao falar com o servidor.');
    return j;
  };
  const SITUACAO = { autorizado: ['Autorizado', 'entregue'], cancelado: ['Cancelado', 'cancelado'], substituido: ['Substituído', 'pendente'] };
  const tabela = (cab, linhas, vazio = 'Nada no período.') => (linhas.length
    ? `<div style="overflow-x:auto;"><table class="edi-tabela"><thead><tr>${cab}</tr></thead><tbody>${linhas.join('')}</tbody></table></div>`
    : `<div class="kanban-vazio">${vazio}</div>`);

  let aba = 'livro'; let cfg = null;
  const per = { de: '', ate: '' };
  const qs = () => `de=${per.de}&ate=${per.ate}`;
  const link = (c) => `/api/contabil/${c}?${qs()}&token=${encodeURIComponent(token)}`;
  const mostrarPeriodo = () => { $('cblBaixar').href = link('pacote.zip'); };
  // Período igual ao das outras telas (js/periodo.js); o contador fecha o mês passado.
  Periodo.ligar({ select: $('cblPer'), de: $('cblDe'), ate: $('cblAte'), chave: 'contabil', padrao: 'mes_passado',
    aoMudar: (de, ate) => { per.de = de; per.ate = ate; mostrarPeriodo(); carregar().catch(erro); } });
  Object.assign(per, { de: $('cblDe').value, ate: $('cblAte').value }); mostrarPeriodo();

  function mostrarAba(nome) {
    aba = nome;
    document.querySelectorAll('[data-cbl-aba]').forEach((x) => x.classList.toggle('ativo', x.dataset.cblAba === nome));
    $('cblBarra').classList.toggle('oculto', nome === 'config');
  }
  async function carregar() {
    mostrarPeriodo();
    if (!cfg) cfg = await api('/config');
    $('cblConteudo').innerHTML = '<div class="kanban-vazio">Carregando…</div>';
    await ({ livro: telaLivro, lancamentos: telaLancamentos, pacote: telaPacote, config: telaConfig }[aba])();
  }
  document.querySelectorAll('[data-cbl-aba]').forEach((a) => a.addEventListener('click', () => { mostrarAba(a.dataset.cblAba); carregar().catch(erro); }));
  nav.addEventListener('click', () => { mostrarAba(aba); carregar().catch(erro); });
  $('cblEnviar').addEventListener('click', () => enviar().catch(erro));

  // ---------- Livro de saídas ----------
  async function telaLivro() {
    const l = await api(`/livro?${qs()}`);
    const t = l.totais;
    const grupo = (titulo, lista, rotulo) => `<div class="painel" style="padding:12px 14px; min-width:0;"><h4 style="margin:0 0 8px;">${titulo}</h4>${tabela(
      `<th>${rotulo}</th><th class="n">Qtd</th><th class="n">Valor</th><th class="n">Base ICMS</th><th class="n">ICMS</th><th class="n">Isentas/outras</th>`,
      lista.map((g) => `<tr><td>${esc(g.chave)}</td><td class="n">${g.qtd}</td><td class="n">${num(g.valor)}</td><td class="n">${num(g.base)}</td><td class="n">${num(g.icms)}</td><td class="n">${num(g.isentas_outras)}</td></tr>`))}</div>`;
    const avisos = [
      t.demonstracao ? 'O sistema está no modo demonstração: aqui aparecem só os documentos de demonstração (sem valor fiscal). Em produção, aparecem só os de produção.' : '',
      t.homologacao ? 'O CT-e está em homologação (ambiente de testes): estes documentos não têm valor fiscal.' : '',
      t.icms_outra_uf ? `ICMS devido a outra UF (OUTRAUF): ${brl(t.icms_outra_uf)} fora da base e do débito próprios — recolhido por GNRE.` : '',
      t.ajustes ? `${t.ajustes} documento(s) de meses anteriores cancelado(s) ou substituído(s) neste período: −${brl(t.ajustes_valor)} (ICMS −${brl(t.ajustes_icms)}). Veja "Ajustes de meses anteriores" abaixo; os lançamentos já trazem o estorno.` : '',
      l.ctes.some((d) => d.sem_base) ? `CT-e com CST tributado e alíquota, mas sem base de cálculo no XML: ${l.ctes.filter((d) => d.sem_base).map((d) => `${d.serie}/${d.numero}`).join(', ')}. O ICMS deles está zerado aqui — confira com o contador (os novos já saem com a base calculada).` : '',
      l.ctes.some((d) => !d.cfop) ? 'Há CT-e sem CFOP gravado (emitidos antes desta versão): confira no XML.' : '',
    ].filter(Boolean);
    $('cblConteudo').innerHTML = `
      <div style="display:flex; justify-content:flex-end; gap:8px; flex-wrap:wrap; margin-bottom:10px;">
        <a class="btn btn-secundario" href="${link('livro.html')}" target="_blank" style="width:auto; text-decoration:none;">🖨 Imprimir / PDF</a>
        <a class="btn btn-secundario" href="${link('livro.csv')}" style="width:auto; text-decoration:none;">⬇ Planilha (Excel)</a></div>
      <div class="oc-resumo">
        <div>CT-e válidos<b>${t.ctes}</b><span>${[t.cancelados ? `${t.cancelados} cancelado(s)` : '', t.substituidos ? `${t.substituidos} substituído(s)` : ''].filter(Boolean).join(' · ') || 'nenhum cancelado'}</span></div>
        <div>Valor das prestações<b>${brl(t.valor)}</b><span>base ICMS ${brl(t.base)}</span></div>
        <div>ICMS das saídas<b>${brl(t.icms)}</b><span>isentas/outras ${brl(t.isentas_outras)}</span></div>
        <div>NFS-e (frete municipal)<b>${brl(t.nfse_valor)}</b><span>${t.nfse} nota(s) · ISS ${brl(t.iss)}${t.iss_retido ? ` (retido ${brl(t.iss_retido)})` : ''}</span></div>
      </div>
      ${avisos.length ? `<div class="cte-aviso" style="margin-bottom:12px;"><ul style="margin:0; padding-left:18px; line-height:1.6;">${avisos.map((a) => `<li>${a}</li>`).join('')}</ul></div>` : ''}
      <p style="font-size:12.5px; color:var(--texto-fraco); margin:0 0 12px;">O ICMS acima é o <b>débito</b> das saídas. Os créditos (diesel, peças, CT-e de subcontratação) e o saldo a recolher saem do SPED que o contador gera com as notas de entrada. Cancelados e substituídos aparecem na lista, mas não entram nas somas.</p>
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(min(380px, 100%), 1fr)); gap:12px; margin-bottom:14px;">
        ${grupo('Por CFOP', l.por_cfop, 'CFOP')}${grupo('Por CST e alíquota', l.por_cst, 'CST')}${grupo('Por UF de início → fim', l.por_uf, 'Trajeto')}
      </div>
      <div class="painel" style="padding:12px 14px; margin-bottom:14px;"><h4 style="margin:0 0 8px;">CT-e do período (${l.ctes.length})</h4>${tabela(
        '<th>Data</th><th>Série/nº</th><th>Situação</th><th>CFOP</th><th>CST</th><th class="n">Alíq.</th><th>Trajeto</th><th>Tomador</th><th class="n">Valor</th><th class="n">Base</th><th class="n">ICMS</th>',
        l.ctes.map((d) => `<tr${d.situacao !== 'autorizado' ? ' style="opacity:.6;"' : ''}><td>${dia(d.data)}</td><td>${d.serie}/${d.numero}${d.demonstracao ? ' <small title="Demonstração">🧪</small>' : ''}</td>
          <td><span class="oc-sit ${SITUACAO[d.situacao]?.[1] || ''}">${SITUACAO[d.situacao]?.[0] || esc(d.situacao)}</span>${d.tipo !== 'normal' ? ` <small>${esc(d.tipo)}</small>` : ''}</td>
          <td>${esc(d.cfop || '—')}</td><td>${esc(d.cst || '—')}</td><td class="n">${d.aliquota ? `${num(d.aliquota)}%` : ''}${d.outra_uf ? ' <small>outra UF</small>' : ''}</td><td>${esc(d.mun_ini || '')}/${esc(d.uf_ini || '?')} → ${esc(d.mun_fim || '')}/${esc(d.uf_fim || '?')}</td>
          <td>${esc(d.tomador_nome)}<br><small style="color:var(--texto-fraco);">${docFmt(d.tomador_doc)}</small></td><td class="n">${num(d.valor_original)}</td><td class="n">${num(d.base)}</td><td class="n">${num(d.icms)}</td></tr>`),
        'Nenhum CT-e autorizado no período.')}</div>
      ${l.ajustes?.length ? `<div class="painel" style="padding:12px 14px; margin-bottom:14px;"><h4 style="margin:0 0 8px;">Ajustes de meses anteriores (${l.ajustes.length})</h4>${tabela(
        '<th>Data do ajuste</th><th>Documento</th><th>Emitido em</th><th>Motivo</th><th>Tomador</th><th class="n">Valor</th><th class="n">ICMS/ISS</th>',
        l.ajustes.map((a) => `<tr><td>${dia(a.data)}</td><td>${esc(a.documento)}</td><td>${dia(a.data_original)}</td><td>${esc(a.motivo)}</td><td>${esc(a.tomador_nome)}</td>
          <td class="n">−${num(a.valor)}</td><td class="n">${a.icms || a.iss ? `−${num(a.icms || a.iss)}` : ''}</td></tr>`))}</div>` : ''}
      ${l.nfse.length ? `<div class="painel" style="padding:12px 14px;"><h4 style="margin:0 0 8px;">NFS-e do período (${l.nfse.length})</h4>${tabela(
        '<th>Data</th><th>Número</th><th>Situação</th><th>Tomador</th><th class="n">Valor</th><th class="n">Alíq. ISS</th><th class="n">ISS</th><th>ISS retido</th>',
        l.nfse.map((x) => `<tr${x.cancelada ? ' style="opacity:.6;"' : ''}><td>${dia(x.data)}</td><td>${esc(x.numero_nfse)}</td><td><span class="oc-sit ${x.cancelada ? 'cancelado' : 'entregue'}">${x.cancelada ? 'Cancelada' : 'Autorizada'}</span></td>
          <td>${esc(x.tomador_nome)}</td><td class="n">${num(x.valor)}</td><td class="n">${x.iss_aliquota != null ? `${num(x.iss_aliquota)}%` : ''}</td><td class="n">${num(x.iss_valor)}</td><td>${x.iss_retido ? 'Sim' : 'Não'}</td></tr>`))}</div>` : ''}`;
  }

  // ---------- Lançamentos ----------
  async function telaLancamentos() {
    const r = await api(`/lancamentos?${qs()}`);
    const deb = r.por_conta.reduce((s, c) => s + c.debito, 0); const cred = r.por_conta.reduce((s, c) => s + c.credito, 0);
    $('cblConteudo').innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:10px;">
        <span style="font-size:12.5px; color:var(--texto-fraco);">Regime de <b>${r.regime === 'caixa' ? 'caixa' : 'competência'}</b> · ${r.totais.linhas} lançamento(s) · contas do plano em ⚙ Contador e plano de contas</span>
        <a class="btn btn-primario" href="${link('lancamentos.csv')}" style="width:auto; text-decoration:none;">⬇ Planilha para importar</a></div>
      <div class="painel" style="padding:12px 14px; margin-bottom:14px;"><h4 style="margin:0 0 8px;">Resumo por conta</h4>${tabela(
        '<th>Conta</th><th>Nome</th><th class="n">Débitos</th><th class="n">Créditos</th><th class="n">Saldo do período</th>',
        r.por_conta.map((c) => `<tr><td>${esc(c.conta)}</td><td>${esc(c.nome)}</td><td class="n">${num(c.debito)}</td><td class="n">${num(c.credito)}</td><td class="n">${num(Math.abs(c.saldo))} ${c.saldo > 0 ? 'D' : c.saldo < 0 ? 'C' : ''}</td></tr>`)
          .concat(r.por_conta.length ? [`<tr style="font-weight:700;"><td colspan="2">Total (débitos = créditos)</td><td class="n">${num(deb)}</td><td class="n">${num(cred)}</td><td></td></tr>`] : []),
        'Nenhum lançamento no período.')}</div>
      <div class="painel" style="padding:12px 14px;"><h4 style="margin:0 0 8px;">Lançamentos</h4>${tabela(
        '<th>Data</th><th>Débito</th><th>Crédito</th><th class="n">Valor</th><th>Histórico</th><th>Documento</th>',
        r.linhas.map((x) => `<tr><td>${dia(x.data)}</td><td>${esc(x.debito)}</td><td>${esc(x.credito)}</td><td class="n">${num(x.valor)}</td><td style="white-space:normal;">${esc(x.historico)}</td><td>${esc(x.documento)}</td></tr>`))}</div>`;
  }

  // ---------- Pacote ----------
  async function telaPacote() {
    const [l, c] = await Promise.all([api(`/livro?${qs()}`), api('/config')]);
    cfg = c;
    const u = c.ultimo_envio;
    $('cblConteudo').innerHTML = `
      <div class="painel" style="padding:16px 18px; margin-bottom:14px; max-width:860px;">
        <h4 style="margin:0 0 6px;">O que vai no .zip de ${dia(per.de)} a ${dia(per.ate)}</h4>
        <ul style="margin:0 0 12px; padding-left:18px; line-height:1.8; font-size:13.5px;">
          <li><b>CT-e</b>: XML autorizado de ${l.totais.ctes} válido(s), ${l.totais.cancelados} cancelado(s) e ${l.totais.substituidos} substituído(s), em pastas separadas, com os eventos (cancelamento, carta de correção)</li>
          <li><b>MDF-e</b> e <b>NFS-e</b> do período (${l.totais.nfse + l.totais.nfse_canceladas} NFS-e)</li>
          <li><b>Livro de saídas</b> (HTML para imprimir e planilha) com o resumo por CFOP, CST e UF</li>
          <li><b>Lançamentos contábeis</b> (data, débito, crédito, valor, histórico, documento, CNPJ) para importar no sistema do contador</li>
        </ul>
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          <a class="btn btn-primario" href="${link('pacote.zip')}" style="width:auto; text-decoration:none;">⬇ Baixar o pacote (.zip)</a>
          <button class="btn btn-secundario" id="cblEnviar2" style="width:auto;">✉ Enviar ao contador${c.contador_email ? ` (${esc(c.contador_email)})` : ''}</button>
        </div>
        <p style="font-size:12.5px; color:var(--texto-fraco); margin:12px 0 0;">O SPED (EFD ICMS/IPI e EFD Contribuições) é gerado pelo sistema do contador: ele importa estes XML junto com as notas de <b>entrada</b> (diesel, peças, pneus), que não passam pelo Nexofrete.</p>
      </div>
      <div class="painel" style="padding:16px 18px; max-width:860px;">
        <h4 style="margin:0 0 6px;">Envio automático</h4>
        <p style="margin:0; font-size:13.5px;">${c.envio_ativo
    ? `Ligado: todo dia <b>${c.envio_dia}</b>, o pacote do mês anterior vai para <b>${esc(c.contador_email)}</b>.`
    : 'Desligado. Ligue em ⚙ Contador e plano de contas para o pacote ir sozinho todo mês.'}</p>
        ${u ? `<p style="margin:8px 0 0; font-size:13px;">Último envio automático: ${dia(u.de)} a ${dia(u.ate)} em ${new Date(u.em).toLocaleString('pt-BR')} para ${esc(u.para || '')} —
          ${u.ok ? '<span class="oc-sit entregue">Enviado</span>' : `<span class="oc-sit cancelado">Falhou</span> ${esc(u.erro || '')}`}</p>` : ''}
      </div>`;
    $('cblEnviar2').addEventListener('click', () => enviar().catch(erro));
  }

  async function enviar() {
    if (!cfg) cfg = await api('/config');
    const para = await pedirTexto(`Mandar o pacote de ${dia(per.de)} a ${dia(per.ate)} por e-mail para:`, { titulo: 'Enviar ao contador', valor: cfg.contador_email || '', placeholder: 'contador@escritorio.com.br', textoOk: 'Enviar' });
    if (para == null) return;
    const botoes = [$('cblEnviar'), $('cblEnviar2')].filter(Boolean);
    const textos = botoes.map((x) => x.textContent);
    botoes.forEach((x) => { x.disabled = true; x.textContent = 'Enviando…'; });
    let r;
    try { r = await api('/enviar', { method: 'POST', body: JSON.stringify({ de: per.de, ate: per.ate, para: para.trim() }) }); } finally { botoes.forEach((x, i) => { x.disabled = false; x.textContent = textos[i]; }); }
    mostrarAlerta(`Pacote enviado para ${r.para}: ${r.contagem.cte} CT-e, ${r.contagem.mdfe} MDF-e, ${r.contagem.nfse} NFS-e e ${r.lancamentos.linhas} lançamentos.`, { tipo: 'sucesso' });
  }

  // ---------- Configuração ----------
  async function telaConfig() {
    const c = cfg = await api('/config');
    const campo = (id, rotulo, valor, extra = '') => `<div class="campo"><label for="${id}">${rotulo}</label><input id="${id}" class="cte-entrada" value="${esc(valor ?? '')}" ${extra} /></div>`;
    $('cblConteudo').innerHTML = `
      <div style="display:grid; grid-template-columns:minmax(320px, 440px) minmax(0, 1fr); gap:14px; align-items:start;" class="cbl-grade">
        <div class="painel" style="padding:16px 18px;">
          <h4 style="margin:0 0 10px;">Contador</h4>
          ${campo('cblNome', 'Nome / escritório', c.contador_nome)}
          ${campo('cblEmail', 'E-mail (vários: separe com ;)', c.contador_email, 'type="text" placeholder="contador@escritorio.com.br"')}
          ${campo('cblCrc', 'CRC', c.contador_crc)}
          <div class="campo"><label for="cblRegime">Regime dos lançamentos</label><select id="cblRegime" class="cte-entrada">
            <option value="competencia" ${c.regime !== 'caixa' ? 'selected' : ''}>Competência — despesa quando lança, receita na emissão</option>
            <option value="caixa" ${c.regime === 'caixa' ? 'selected' : ''}>Caixa — despesa quando paga</option></select></div>
          <div class="campo"><label for="cblSep">Separador da planilha</label><select id="cblSep" class="cte-entrada">
            <option value=";" ${c.separador === ';' ? 'selected' : ''}>Ponto e vírgula (Excel brasileiro, Domínio, Alterdata)</option>
            <option value="," ${c.separador === ',' ? 'selected' : ''}>Vírgula (valor com ponto)</option>
            <option value="tab" ${c.separador === 'tab' ? 'selected' : ''}>Tabulação</option></select></div>
          <label style="display:flex; gap:8px; align-items:center; margin:12px 0 6px; font-size:13.5px;"><input type="checkbox" id="cblAuto" ${c.envio_ativo ? 'checked' : ''} /> Enviar o pacote do mês anterior automaticamente</label>
          ${campo('cblDia', 'Dia do mês do envio (1 a 28)', c.envio_dia, 'type="number" min="1" max="28" style="width:110px;"')}
          <button class="btn btn-primario" id="cblSalvar" style="width:auto; margin-top:8px;">Salvar</button>
        </div>
        <div class="painel" style="padding:16px 18px; min-width:0;">
          <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; flex-wrap:wrap;"><h4 style="margin:0;">Plano de contas</h4>
            <button class="btn btn-secundario" id="cblPadrao" style="width:auto;">Voltar ao padrão</button></div>
          <p style="font-size:12.5px; color:var(--texto-fraco); margin:6px 0 10px;">Troque pelos códigos (ou reduzidos) do plano do seu contador — é o que vai nas colunas débito e crédito.</p>
          <div style="overflow-x:auto;"><table class="edi-tabela"><thead><tr><th>Conta</th><th style="width:170px;">Código</th></tr></thead><tbody>
            ${Object.keys(c.padrao).map((k) => `<tr><td>${esc(c.nomes[k] || k)}</td><td><input class="cte-entrada cbl-conta" data-conta="${k}" value="${esc(c.contas[k])}" style="padding:5px 8px;" /></td></tr>`).join('')}
          </tbody></table></div>
        </div>
      </div>`;
    $('cblPadrao').addEventListener('click', () => document.querySelectorAll('.cbl-conta').forEach((i) => { i.value = c.padrao[i.dataset.conta]; }));
    $('cblSalvar').addEventListener('click', async () => {
      const contas = {}; document.querySelectorAll('.cbl-conta').forEach((i) => { contas[i.dataset.conta] = i.value; });
      try {
        cfg = await api('/config', { method: 'PUT', body: JSON.stringify({ contador_nome: $('cblNome').value, contador_email: $('cblEmail').value, contador_crc: $('cblCrc').value,
          regime: $('cblRegime').value, separador: $('cblSep').value, envio_ativo: $('cblAuto').checked, envio_dia: $('cblDia').value, contas }) });
        mostrarAlerta(cfg.envio_ativo ? `Salvo. O pacote vai para ${cfg.contador_email} todo dia ${cfg.envio_dia}.` : 'Salvo.', { tipo: 'sucesso' });
      } catch (e) { erro(e); }
    });
  }
})();
