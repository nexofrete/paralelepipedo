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
  function formatar(v) {
    const d = digitos(v);
    if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
    if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
    return v == null ? '' : String(v);
  }
  // Máscara parcial, enquanto digita (até 11 dígitos = CPF; mais = CNPJ).
  function mascaraParcial(v) {
    const d = digitos(v).slice(0, 14);
    if (d.length <= 11) return d.replace(/^(\d{3})(\d)/, '$1.$2').replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d{1,2})$/, '.$1-$2');
    return d.replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d{1,2})$/, '$1-$2');
  }
  function cnpjValido(d) {
    if (!/^\d{14}$/.test(d) || /^(\d)\1{13}$/.test(d)) return false;
    const calc = (n) => { const p = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]; const r = p.reduce((s, x, i) => s + Number(d[i]) * x, 0) % 11; return r < 2 ? 0 : 11 - r; };
    return calc(12) === Number(d[12]) && calc(13) === Number(d[13]);
  }
  function cpfValido(d) {
    if (!/^\d{11}$/.test(d) || /^(\d)\1{10}$/.test(d)) return false;
    const dig = (n) => { let s = 0; for (let i = 0; i < n; i += 1) s += Number(d[i]) * (n + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
    return dig(9) === Number(d[9]) && dig(10) === Number(d[10]);
  }
  const valido = (v) => { const d = digitos(v); return d.length === 14 ? cnpjValido(d) : d.length === 11 ? cpfValido(d) : false; };

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
    const d = digitos(input.value);
    if (d.length !== 14 || !cnpjValido(d) || ultima.get(input) === d) return;
    ultima.set(input, d);
    if (!Object.keys(cfg.mapa).length) return;
    avisar(input, '🔎 Buscando os dados do CNPJ na Receita…');
    try {
      const r = await apiFetch(`/api/cnpj/${d}`);
      const j = await r.json().catch(() => ({}));
      if (digitos(input.value) !== d) return;                       // trocou o CNPJ enquanto buscava
      if (!r.ok) { avisar(input, `⚠ ${j.erro || 'Não consegui consultar o CNPJ.'}`, 'var(--laranja, #e8890c)'); return; }
      const v = { ...j, endereco: [j.logradouro, j.numero].filter(Boolean).join(', ') + (j.complemento ? ` - ${j.complemento}` : ''),
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
    const pos = input.selectionStart; const digAntes = digitos(antes.slice(0, pos)).length;
    input.value = mascaraParcial(antes);
    // Mantém o cursor depois do mesmo dígito.
    let p = 0; let n = 0; while (p < input.value.length && n < digAntes) { if (/\d/.test(input.value[p])) n += 1; p += 1; }
    try { input.setSelectionRange(p, p); } catch { /* tipo sem cursor */ }
    const d = digitos(input.value);
    if (d.length === 14 || d.length === 11) {
      if (!valido(d)) { avisar(input, `⚠ ${d.length === 14 ? 'CNPJ' : 'CPF'} inválido: o dígito verificador não confere.`, 'var(--vermelho)'); input.style.borderColor = 'var(--vermelho)'; return; }
      input.style.borderColor = '';
      if (d.length === 14) buscar(input, cfg); else avisar(input, '✓ CPF válido', 'var(--verde)');
    } else { input.style.borderColor = ''; const el = input.parentElement?.querySelector(':scope > .doc-status'); if (el) el.textContent = ''; }
  });
  // Campo preenchido pelo sistema (abrir um cadastro): só formata.
  document.addEventListener('focusout', (e) => {
    const input = e.target;
    if (input instanceof HTMLInputElement && cfgDo(input) && digitos(input.value).length && [11, 14].includes(digitos(input.value).length)) input.value = formatar(input.value);
  });

  window.Doc = { digitos, formatar, mascaraParcial, valido, cnpjValido, cpfValido, registrar };
})();
