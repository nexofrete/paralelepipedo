// Painel do servidor de licenças: bloquear, desbloquear, renovar e anotar.
(() => {
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const dia = (v) => (v ? String(v).split('-').reverse().join('/') : 'sem vencimento');
  const quando = (ms) => (ms ? new Date(ms).toLocaleString('pt-BR') : 'nunca');
  let lista = [];

  function aviso(t) { const m = $('msg'); m.textContent = t; m.style.display = 'block'; clearTimeout(aviso.t); aviso.t = setTimeout(() => { m.style.display = 'none'; }, 4000); }
  async function api(url, opcoes = {}) {
    const r = await fetch(url, { ...opcoes, headers: { 'Content-Type': 'application/json' } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.erro || `Erro ${r.status}`);
    return j;
  }

  function semContato(l) {
    if (!l.ultimoContato) return '<span class="fraco">ainda não conferiu</span>';
    const dias = Math.floor((Date.now() - l.ultimoContato) / 86400000);
    return `${quando(l.ultimoContato)}${dias >= 3 ? ` <b style="color:var(--vermelho)">(${dias} dias sem conferir)</b>` : ''}`;
  }

  function desenhar() {
    const b = $('busca').value.trim().toLowerCase();
    const itens = lista.filter((l) => !b || [l.cliente, l.cnpj, l.maquina, l.nota].join(' ').toLowerCase().includes(b));
    $('lista').innerHTML = itens.length ? itens.map((l) => `<div class="cartao" data-id="${esc(l.id)}">
      <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;"><b style="font-size:15px;">${esc(l.cliente)}</b> <span class="selo ${esc(l.status)}">${l.status === 'bloqueada' ? 'Bloqueada' : 'Ativa'}</span></div>
      <div class="linha" style="margin-top:8px;">
        <div><span class="fraco">CNPJ</span><br>${esc(l.cnpj)}</div>
        <div><span class="fraco">Computador</span><br><span class="mono">${esc(l.maquina)}</span></div>
        <div><span class="fraco">Validade</span><br><b>${dia(l.validade)}</b>${l.validade !== l.validadeOriginal ? `<br><span class="fraco">na chave: ${dia(l.validadeOriginal)}</span>` : ''}</div>
        <div><span class="fraco">Última conferência</span><br>${semContato(l)}</div>
        <div><span class="fraco">Versão / IP</span><br>${esc(l.versao || '—')} · ${esc(l.ip || '—')}</div>
      </div>
      <div class="acoes">
        ${l.status === 'bloqueada' ? '<button data-acao="desbloquear">Desbloquear</button>' : '<button class="perigo" data-acao="bloquear">Bloquear</button>'}
        <input type="date" data-campo="validade" value="${esc(l.validade || '')}" />
        <button class="sec" data-acao="validade">Salvar validade</button>
        <button class="sec" data-acao="semvenc">Sem vencimento</button>
      </div>
      <div class="acoes"><input data-campo="nota" style="flex:1; min-width:200px;" placeholder="Anotação (só você vê)" value="${esc(l.nota || '')}" /><button class="sec" data-acao="nota">Salvar anotação</button>
        <button class="sec" data-acao="excluir">Excluir</button></div>
      ${l.status === 'bloqueada' && l.mensagem ? `<p class="fraco">Mensagem ao cliente: ${esc(l.mensagem)}</p>` : ''}
    </div>`).join('') : '<p class="fraco">Nenhuma licença ainda. Elas aparecem aqui quando o sistema do cliente conferir pela primeira vez.</p>';
  }

  async function carregar() { lista = await api('/admin/licencas'); desenhar(); }

  $('lista').addEventListener('click', async (ev) => {
    const b = ev.target.closest('button[data-acao]'); if (!b) return;
    const c = b.closest('[data-id]'); const id = c.dataset.id; const acao = b.dataset.acao;
    const campo = (n) => c.querySelector(`[data-campo="${n}"]`).value;
    let corpo;
    if (acao === 'bloquear') {
      const mensagem = prompt('Mensagem que aparece no sistema do cliente:', 'Licença suspensa. Entre em contato com o fornecedor do sistema.');
      if (mensagem === null) return;
      corpo = { status: 'bloqueada', mensagem };
    } else if (acao === 'desbloquear') corpo = { status: 'ativa' };
    else if (acao === 'validade') { if (!campo('validade')) return aviso('Escolha a data.'); corpo = { validade: campo('validade') }; }
    else if (acao === 'semvenc') corpo = { validade: null };
    else if (acao === 'nota') corpo = { nota: campo('nota') };
    try {
      if (acao === 'excluir') {
        if (!confirm('Excluir do painel? Se o sistema do cliente conferir de novo, ela volta como ativa.')) return;
        await api(`/admin/licencas/${encodeURIComponent(id)}`, { method: 'DELETE' });
      } else await api(`/admin/licencas/${encodeURIComponent(id)}`, { method: 'POST', body: JSON.stringify(corpo) });
      aviso('Salvo. O sistema do cliente recebe a mudança na próxima conferência (até 6 horas, ou em "Conferir agora").');
      carregar();
    } catch (e) { aviso(e.message); }
  });
  $('cadastrar').addEventListener('click', async () => {
    try { await api('/admin/licencas', { method: 'POST', body: JSON.stringify({ chave: $('novaChave').value }) }); $('novaChave').value = ''; aviso('Cadastrada.'); carregar(); } catch (e) { aviso(e.message); }
  });
  $('busca').addEventListener('input', desenhar);
  carregar().catch((e) => aviso(e.message));
})();
