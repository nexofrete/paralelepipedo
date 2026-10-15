// =====================================================================
// Tela "Hoje" (primeira tela da transportadora): pendências do dia por área.
// Cada cartão abre a tela certa já com o filtro aplicado.
// Usa do dashboard.js: usuario, apiFetch, mostrarAlerta.
// =====================================================================
(() => {
  const pode = usuario?.perfil === 'admin' || !!usuario?.pode_emitir_cte || !!usuario?.pode_ver_financeiro;
  const nav = document.getElementById('navHoje');
  if (!pode || !nav) return;
  nav.classList.remove('oculto');

  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const brl = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const AREAS = { operacao: '🚛 Operação', financeiro: '💰 Financeiro', frota: '🔧 Frota' };
  const NIVEL = { perigo: 'var(--vermelho)', atencao: '#f59e0b', info: 'var(--azul)' };
  let dados = null;

  // Abre a tela do cartão e aplica o filtro quando ela terminar de desenhar.
  function irPara(d) {
    const sub = document.querySelector(`.nav-tsub[data-ir="${d.ir}"]${d.aba ? `[data-aba="${d.aba}"]` : ''}`) || document.querySelector(`.nav-tsub[data-ir="${d.ir}"]`);
    if (sub && !sub.classList.contains('oculto')) sub.click(); else document.querySelector(`.nav-item[data-pagina="${d.ir}"]`)?.click();
    if (!d.selecionar && !d.clicar) return;
    let tentativas = 0;
    const aplicar = () => {
      if (d.selecionar) {
        const el = $(d.selecionar[0]);
        if (el && el.offsetParent !== null && [...el.options].some((o) => o.value === d.selecionar[1])) { el.value = d.selecionar[1]; el.dispatchEvent(new Event('change', { bubbles: true })); return; }
      } else {
        const el = document.querySelector(d.clicar);
        if (el && el.offsetParent !== null) { el.click(); return; }
      }
      if ((tentativas += 1) < 30) setTimeout(aplicar, 150);
    };
    setTimeout(aplicar, 200);
  }

  function saudacao() {
    const h = new Date().getHours();
    const nome = String(usuario?.nome || '').split(' ')[0];
    return `${h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'}${nome ? `, ${esc(nome)}` : ''}`;
  }

  async function carregar() {
    $('hjConteudo').innerHTML = '<div class="kanban-vazio">Conferindo o que está pendente…</div>';
    const r = await apiFetch('/api/hoje');
    dados = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(dados.erro || 'Erro ao carregar.');
    desenhar();
  }

  function cartao(it, i) {
    const numero = it.so_valor ? brl(it.valor) : it.qtd;
    return `<button type="button" class="hj-cartao" data-hj="${i}" style="--hj-cor:${NIVEL[it.nivel]};">
      <div class="hj-topo"><span class="hj-icone">${it.icone}</span><span class="hj-num" style="${it.so_valor && it.valor < 0 ? 'color:var(--vermelho);' : ''}">${numero}</span></div>
      <div class="hj-titulo">${esc(it.titulo)}</div>
      ${!it.so_valor && it.valor ? `<div class="hj-valor">${brl(it.valor)}</div>` : ''}
      ${it.detalhe ? `<div class="hj-det">${esc(it.detalhe)}</div>` : ''}
      <div class="hj-ir">Abrir →</div></button>`;
  }

  function desenhar() {
    const d = dados;
    const data = new Date(`${d.hoje}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
    $('hjTitulo').innerHTML = `🏠 ${saudacao()}`;
    $('hjSub').textContent = `${data.charAt(0).toUpperCase()}${data.slice(1)} · ${d.resumo.perigo ? `${d.resumo.perigo} para resolver agora` : 'nada urgente'}${d.resumo.atencao ? ` · ${d.resumo.atencao} para hoje` : ''}`;
    const areas = Object.keys(AREAS).filter((a) => d.areas[a]);
    $('hjConteudo').innerHTML = areas.map((a) => {
      const lista = d.itens.map((it, i) => [it, i]).filter(([it]) => it.area === a);
      return `<div class="hj-area"><h3>${AREAS[a]}</h3>${lista.length
        ? `<div class="hj-grade">${lista.map(([it, i]) => cartao(it, i)).join('')}</div>`
        : '<div class="hj-ok">✓ Nada pendente aqui.</div>'}</div>`;
    }).join('') || '<div class="kanban-vazio">Nada pendente. ✓</div>';
    document.querySelectorAll('[data-hj]').forEach((b) => b.addEventListener('click', () => irPara(d.itens[Number(b.dataset.hj)].destino)));
  }

  const abrir = () => carregar().catch((e) => mostrarAlerta(e.message, { tipo: 'erro' }));
  nav.addEventListener('click', abrir);
  $('hjAtualizar').addEventListener('click', abrir);
  // Atualiza sozinha a cada 5 minutos enquanto está aberta.
  setInterval(() => { if (!$('pagina-hoje').classList.contains('oculto') && !document.hidden) carregar().catch(() => {}); }, 5 * 60 * 1000);
  // É a primeira tela de quem trabalha na transportadora.
  setTimeout(() => nav.click(), 0);
})();
