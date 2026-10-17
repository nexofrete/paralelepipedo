// =====================================================================
// CNPJ/CPF em todo o sistema:
//  • Doc.formatar(v)  → "11.222.333/0001-81" / "529.982.247-25" (o que não for CNPJ/CPF volta como veio)
//  • Máscara enquanto digita e aviso de dígito errado em todo campo de CNPJ/CPF
//    (os da lista CAMPOS abaixo e qualquer <input data-doc>).
//  • Ao completar um CNPJ válido, busca na Receita (/api/cnpj) e preenche os
//    campos do mesmo cadastro que estiverem vazios (nunca apaga o que já foi digitado).
// Carregado antes dos outros scripts: as telas usam Doc.formatar ao mostrar documentos.
// =====================================================================
(() => {
  const digitos = (v) => String(v ?? '').replace(/\D/g, '');
  // CNPJ alfanumérico (a partir de 07/2026): letras nas 12 primeiras posições, os 2 dígitos verificadores são números.
  const chars = (v) => String(v ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '');
  const ehCnpjAlfa = (c) => /^[0-9A-Z]{12}\d{2}$/.test(c) && /[A-Z]/.test(c);
  function formatar(v) {
    const c = chars(v);
    if (/^\d{14}$/.test(c) || ehCnpjAlfa(c)) return c.replace(/^(.{2})(.{3})(.{3})(.{4})(.{2})$/, '$1.$2.$3/$4-$5');
    if (/^\d{11}$/.test(c)) return c.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
    return v == null ? '' : String(v);
  }
  // Máscara parcial, enquanto digita (só números até 11 = CPF; mais, ou com letra = CNPJ).
  function mascaraParcial(v) {
    const c = chars(v).slice(0, 14);
    if (c.length <= 11 && /^\d*$/.test(c)) return c.replace(/^(\d{3})(\d)/, '$1.$2').replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d{1,2})$/, '.$1-$2');
    return c.replace(/^(.{2})(.)/, '$1.$2').replace(/^(.{2})\.(.{3})(.)/, '$1.$2.$3').replace(/^(.{2}\..{3}\..{3})(.)/, '$1/$2').replace(/^(.{2}\..{3}\..{3}\/.{4})(.{1,2})$/, '$1-$2');
  }
  // Dígito verificador do CNPJ (numérico ou alfanumérico: cada caractere vale o código ASCII − 48).
  function cnpjValido(v) {
    const d = chars(v);
    if (!/^[0-9A-Z]{12}\d{2}$/.test(d) || /^(\d)\1{13}$/.test(d)) return false;
    const val = (ch) => ch.charCodeAt(0) - 48;
    const calc = (n) => { const p = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]; const r = p.reduce((s, x, i) => s + val(d[i]) * x, 0) % 11; return r < 2 ? 0 : 11 - r; };
    return calc(12) === Number(d[12]) && calc(13) === Number(d[13]);
  }
  function cpfValido(d) {
    if (!/^\d{11}$/.test(d) || /^(\d)\1{10}$/.test(d)) return false;
    const dig = (n) => { let s = 0; for (let i = 0; i < n; i += 1) s += Number(d[i]) * (n + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
    return dig(9) === Number(d[9]) && dig(10) === Number(d[10]);
  }
  const valido = (v) => { const c = chars(v); return c.length === 14 ? cnpjValido(c) : c.length === 11 ? cpfValido(c) : false; };

  // ---------- Campos de CNPJ/CPF e o que cada um preenche ----------
  // seletor do campo do documento → { campo da Receita: seletor do campo da tela } (seletores relativos ao documento inteiro).
  // Campos: razao_social, nome_fantasia, ie, logradouro, numero, complemento, bairro, municipio, codigo_municipio, uf, cep, telefone, email, endereco (tudo junto).
  const CAMPOS = [];
  const registrar = (seletor, mapa = {}, opcoes = {}) => CAMPOS.push({ seletor, mapa, opcoes });

  const statusDe = (input) => {
    let el = input.parentElement?.querySelector(':scope > .doc-status');
    if (!el) { el = document.createElement('small'); el.className = 'doc-status'; el.style.cssText = 'display:block; font-size:11.5px; margin-top:3px;'; input.insertAdjacentElement('afterend', el); }
    return el;
  };
  const avisar = (input, texto, cor) => { const el = statusDe(input); el.textContent = texto; el.style.color = cor || 'var(--texto-fraco)'; };

  // alvo: seletor (procurado dentro de opcoes.raiz, se houver, senão na página) ou função(valor).
  function preencher(alvo, valor, sobrescrever, raiz) {
    if (valor == null || valor === '') return false;
    if (typeof alvo === 'function') { alvo(valor); return true; }
    const el = (raiz || document).querySelector(alvo);
    if (!el || (!sobrescrever && String(el.value || '').trim())) return false;
    if (el.tagName === 'SELECT') {
      const op = [...el.options].find((o) => o.value.toUpperCase() === String(valor).toUpperCase() || o.textContent.trim().toUpperCase() === String(valor).toUpperCase());
      if (!op) return false;
      el.value = op.value;
    } else el.value = valor;
    el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  const ultima = new WeakMap();
  async function buscar(input, cfg) {
    const d = chars(input.value);
    if (d.length !== 14 || !cnpjValido(d) || ultima.get(input) === d) return;
    // CNPJ alfanumérico: os serviços de consulta ainda não trazem; preenche à mão.
    if (!/^\d{14}$/.test(d)) { avisar(input, '✓ CNPJ alfanumérico válido (preencha os dados à mão)', 'var(--verde)'); return; }
    ultima.set(input, d);
    if (!Object.keys(cfg.mapa).length) return;
    avisar(input, '🔎 Buscando os dados do CNPJ na Receita…');
    try {
      const r = await apiFetch(`/api/cnpj/${d}`);
      const j = await r.json().catch(() => ({}));
      if (chars(input.value) !== d) return;                         // trocou o CNPJ enquanto buscava
      if (!r.ok) { avisar(input, `⚠ ${j.erro || 'Não consegui consultar o CNPJ.'}`, 'var(--laranja, #e8890c)'); return; }
      const v = { ...j, nome_curto: j.nome_fantasia || j.razao_social, endereco: [j.logradouro, j.numero].filter(Boolean).join(', ') + (j.complemento ? ` - ${j.complemento}` : ''),
        cep_formatado: j.cep ? j.cep.replace(/^(\d{5})(\d{3})$/, '$1-$2') : null };
      // Ordem: UF antes da cidade (tela que carrega as cidades da UF escolhida).
      const ordem = ['uf', ...Object.keys(cfg.mapa).filter((k) => k !== 'uf')];
      let n = 0;
      const raiz = cfg.opcoes.raiz ? input.closest(cfg.opcoes.raiz) : null;
      for (const k of ordem) {
        if (!cfg.mapa[k]) continue;
        if (preencher(cfg.mapa[k], k === 'cep' && cfg.opcoes.cepComTraco ? v.cep_formatado : v[k], cfg.opcoes.sobrescrever, raiz)) n += 1;
        if (k === 'uf') await new Promise((ok) => setTimeout(ok, 350));
      }
      const situacao = j.situacao && !/ATIVA/i.test(j.situacao) ? ` · ⚠ situação na Receita: ${j.situacao}` : '';
      avisar(input, `✓ ${j.razao_social}${n ? ` — ${n} campo(s) preenchido(s)` : ' — os campos já estavam preenchidos'}${situacao}`, situacao ? 'var(--laranja, #e8890c)' : 'var(--verde)');
      cfg.opcoes.depois?.(j, input);
    } catch { avisar(input, '⚠ Falha de conexão ao consultar o CNPJ.', 'var(--laranja, #e8890c)'); ultima.delete(input); }
  }

  const cfgDo = (input) => CAMPOS.find((c) => input.matches(c.seletor)) || (input.matches('[data-doc]') ? { mapa: {}, opcoes: {} } : null);
  document.addEventListener('input', (e) => {
    const input = e.target;
    if (!(input instanceof HTMLInputElement) || !e.isTrusted) return;
    const cfg = cfgDo(input);
    if (!cfg) return;
    const antes = input.value;
    const pos = input.selectionStart; const antesDoCursor = chars(antes.slice(0, pos)).length;
    input.value = mascaraParcial(antes);
    // Mantém o cursor depois do mesmo caractere.
    let p = 0; let n = 0; while (p < input.value.length && n < antesDoCursor) { if (/[0-9A-Z]/.test(input.value[p])) n += 1; p += 1; }
    try { input.setSelectionRange(p, p); } catch { /* tipo sem cursor */ }
    const d = chars(input.value);
    const status = () => input.parentElement?.querySelector(':scope > .doc-status');
    if (d.length === 14 || (d.length === 11 && /^\d+$/.test(d))) {
      if (!valido(d)) { avisar(input, `⚠ ${d.length === 14 ? 'CNPJ' : 'CPF'} inválido: o dígito verificador não confere.`, 'var(--vermelho)'); input.style.borderColor = 'var(--vermelho)'; return; }
      input.style.borderColor = '';
      if (d.length === 14) buscar(input, cfg); else avisar(input, '✓ CPF válido', 'var(--verde)');
    } else { input.style.borderColor = ''; if (status()) status().textContent = ''; }
  });
  // Campo preenchido pelo sistema (abrir um cadastro): só formata.
  document.addEventListener('focusout', (e) => {
    const input = e.target;
    if (input instanceof HTMLInputElement && cfgDo(input) && [11, 14].includes(chars(input.value).length)) input.value = formatar(input.value);
  });

  // ---------- Cadastros com CNPJ/CPF ----------
  // Pessoa do CT-e (remetente, destinatário, expedidor, recebedor, outro tomador): endereço completo com IBGE.
  ['rem', 'dest', 'exp', 'rec', 'toma'].forEach((p) => registrar(`#${p}_doc`, {
    razao_social: `#${p}_nome`, ie: `#${p}_ie`, logradouro: `#${p}_lgr`, numero: `#${p}_nro`, complemento: `#${p}_cpl`, bairro: `#${p}_bairro`,
    municipio: `#${p}_mun`, codigo_municipio: `#${p}_cmun`, uf: `#${p}_uf`, cep: `#${p}_cep`, telefone: `#${p}_fone`, email: `#${p}_email`,
  }));
  registrar('#ant_doc', { razao_social: '#ant_nome', ie: '#ant_ie', uf: '#ant_uf' });
  // Configuração fiscal (empresa emitente), seguradora e responsável técnico.
  registrar('#cfg_cnpj', { razao_social: '#cfg_razao', nome_fantasia: '#cfg_fantasia', ie: '#cfg_ie', logradouro: '#cfg_lgr', numero: '#cfg_nro', complemento: '#cfg_cpl',
    bairro: '#cfg_bairro', municipio: '#cfg_mun', codigo_municipio: '#cfg_cmun', uf: '#cfg_uf', cep: '#cfg_cep', telefone: '#cfg_fone', email: '#cfg_email' });
  registrar('#cfg_seg_cnpj', { razao_social: '#cfg_seg_nome' });
  registrar('#cfg_rt_cnpj', { email: '#cfg_rt_email', telefone: '#cfg_rt_fone' });
  // Cadastro da empresa (Cadastros → Empresa).
  registrar('#eCnpj', { razao_social: '#eRazaoSocial', nome_fantasia: '#eNomeFantasia', ie: '#eIe', telefone: '#eTelefone', email: '#eEmail', endereco: '#eEndereco',
    bairro: '#eBairro', municipio: '#eMunicipio', uf: '#eUf', cep: '#eCep' });
  // NFS-e (tomador), coleta (remetente e destinatário), cotação.
  registrar('#nsDoc', { razao_social: '#nsNome', email: '#nsEmail', cep: '#nsCep', logradouro: '#nsLgr', numero: '#nsNro', bairro: '#nsBairro', municipio: '#nsMun', codigo_municipio: '#nsCmun', uf: '#nsUf' });
  registrar('#klRemDoc', { razao_social: '#klRemNome', ie: '#klRemIe', logradouro: '#klLgr', numero: '#klNro', complemento: '#klCpl', bairro: '#klBairro', municipio: '#klCidade',
    uf: '#klUf', cep: '#klCep', telefone: '#klContatoFone', codigo_municipio: '#klCodMun' });
  registrar('#klDestDoc', { razao_social: '#klDestNome', municipio: '#klDestCidade', uf: '#klDestUf' });
  registrar('#cqDoc', { razao_social: '#cqCliente', email: '#cqEmail', telefone: '#cqFone' });
  // Vendedor, fornecedor de conta a pagar, acerto de viagem, régua, tabela de preço, licença.
  registrar('#cmVDoc', { razao_social: '#cmVNome', email: '#cmVEmail', telefone: '#cmVFone' });
  registrar('#cpFornDoc', { razao_social: '#cpForn' });
  registrar('#axPropDoc', { razao_social: '#axProp' });
  registrar('#axVpCnpj'); registrar('#axCpf');
  registrar('#rgCDoc', { razao_social: '#rgCNome' });
  registrar('#pClienteDoc', { razao_social: '#pClienteNome' });
  registrar('#tcpDoc', { razao_social: '#tcpNome' });
  registrar('#licCnpj', { razao_social: '#licCliente' });
  // MDF-e, veículo e motorista.
  registrar('#vePropDoc', { razao_social: '#vePropNome', ie: '#vePropIe', uf: '#vePropUf' });
  registrar('#moCpf'); registrar('#icCpf');
  registrar('#mfSegCnpj', { razao_social: '#mfSegNome' });
  registrar('#mfContrDoc', { razao_social: '#mfContrNome' });
  registrar('#mfRespDoc'); registrar('#mfCiotDoc'); registrar('#mfVpForn'); registrar('#mfVpDoc');
  // Frota: posto e oficina (o nome que aparece na fachada).
  registrar('#abPostoDoc', { nome_curto: '#abPosto' });
  registrar('#mnOficinaDoc', { nome_curto: '#mnOficina' });

  window.Doc = { digitos, chars, formatar, mascaraParcial, valido, cnpjValido, cpfValido, registrar };
})();
