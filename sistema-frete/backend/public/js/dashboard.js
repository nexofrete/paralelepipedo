let token = sessionStorage.getItem('token');
let usuario = JSON.parse(sessionStorage.getItem('usuario') || 'null');

// CNPJ com as divisões (00.000.000/0000-00); CPF também (000.000.000-00).
// Só na exibição — no banco continua só com os números.
function formatarCnpj(valor) {
  const d = String(valor || '').replace(/\D/g, '');
  if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  return valor || '';
}

// Telefone com DDD e hífen: (21) 2142-9599 (fixo) ou (21) 99999-9999
// (celular); sem DDD, só o hífen; 0800 no formato 0800 123 4567. Também só
// na exibição.
function formatarTelefone(valor) {
  let d = String(valor || '').replace(/\D/g, '');
  if (!d) return valor || '';
  if (/^0[358]00\d{7}$/.test(d)) return d.replace(/^(\d{4})(\d{3})(\d{4})$/, '$1 $2 $3');
  if (d.length > 11 && d.startsWith('55')) d = d.slice(2);          // +55 do Brasil
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1);         // 0 da operadora antes do DDD
  if (d.length === 12 && d.startsWith('0')) d = d.slice(1);
  if (d.length === 11) return d.replace(/^(\d{2})(\d{5})(\d{4})$/, '($1) $2-$3');
  if (d.length === 10) return d.replace(/^(\d{2})(\d{4})(\d{4})$/, '($1) $2-$3');
  if (d.length === 9) return d.replace(/^(\d{5})(\d{4})$/, '$1-$2');
  if (d.length === 8) return d.replace(/^(\d{4})(\d{4})$/, '$1-$2');
  return valor;
}

const formatoMoeda = (v) =>
  v == null ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

if (!token || !usuario) {
  window.location.href = 'login.html';
}

// Senha provisória: antes de usar o sistema, cadastra a própria senha (no login).
if (usuario?.trocar_senha) window.location.href = 'login.html';

document.getElementById('nomeUsuario').textContent = usuario.nome;
document.getElementById('avatarIniciais').textContent = (usuario.nome || '?')
  .trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
const rotuloPerfil = { admin: 'Administrador', interno: 'Usuário interno', cliente: `Cliente: ${usuario.cliente_nome || ''}` };
// Embaixo do nome: a função (cargo), se tiver; senão, o tipo de usuário.
document.getElementById('perfilUsuario').textContent = usuario.funcao || rotuloPerfil[usuario.perfil] || usuario.perfil;

// ---------- Logout automático por inatividade ----------
let temporizadorInatividade = null;

function encerrarPorInatividade() {
  // Registra no log antes de apagar o token.
  try {
    fetch('/api/auth/sair', {
      method: 'POST', keepalive: true,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ motivo: 'inatividade' }),
    }).catch(() => {});
  } catch (e) { /* sem conexão: encerra assim mesmo */ }
  sessionStorage.removeItem('token');
  sessionStorage.removeItem('usuario');
  clearTimeout(temporizadorInatividade);
  // Vai direto pro login (que mostra o aviso de inatividade). Assim a tela
  // não fica aberta fazendo consultas com a sessão que acabou de ser encerrada.
  window.location.href = 'login.html?motivo=inatividade';
}
document.getElementById('btnVoltarLogin')?.addEventListener('click', () => {
  window.location.href = 'login.html?motivo=inatividade';
});

function reiniciarTemporizadorInatividade(minutos) {
  clearTimeout(temporizadorInatividade);
  if (!minutos || minutos <= 0) return;
  temporizadorInatividade = setTimeout(encerrarPorInatividade, minutos * 60 * 1000);
}

async function iniciarControleInatividade() {
  try {
    const resposta = await fetch('/api/seguranca/configuracao', { headers: { Authorization: `Bearer ${token}` } });
    if (!resposta.ok) return;
    const config = await resposta.json();
    const minutos = config.tempo_inatividade_minutos;
    if (!minutos) return; // desativado

    reiniciarTemporizadorInatividade(minutos);
    ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'].forEach((evento) => {
      document.addEventListener(evento, () => reiniciarTemporizadorInatividade(minutos), { passive: true });
    });
  } catch (err) { /* se falhar, simplesmente não ativa o recurso */ }
}
iniciarControleInatividade();

const podeVerTudo = usuario.perfil === 'admin' || usuario.pode_ver_todos;
const podeEnviarXml = usuario.perfil === 'admin' || usuario.pode_enviar_xml;
const podeEditar = usuario.perfil === 'admin' || usuario.pode_editar_registros;
const podeExcluir = usuario.perfil === 'admin' || usuario.pode_excluir_registros;
const podeAprovarPagamento = usuario.perfil === 'admin' || usuario.pode_aprovar_pagamento;
const podeGerenciarUsuarios = usuario.perfil === 'admin' || usuario.pode_gerenciar_usuarios;
const podeGerenciarTransportadoras = usuario.perfil === 'admin' || usuario.pode_gerenciar_usuarios || usuario.pode_gerenciar_transportadoras;
const podeGerenciarTabelasPreco = usuario.perfil === 'admin' || usuario.pode_gerenciar_usuarios || usuario.pode_gerenciar_tabelas_preco;
const podeAcessarCadastros = podeGerenciarUsuarios || podeGerenciarTransportadoras || podeGerenciarTabelasPreco;
const podeVerAuditoria = usuario.perfil === 'admin' || usuario.pode_ver_auditoria;
const podeVerFinanceiro = usuario.perfil === 'admin' || usuario.pode_ver_financeiro;
const podeVerRelatorios = usuario.perfil === 'admin' || usuario.pode_ver_relatorios;
const podeVerSinistros = usuario.perfil === 'admin' || usuario.pode_ver_sinistros;
const podeConferirFatura = usuario.perfil === 'admin' || (!!usuario.pode_ver_todos && !!usuario.pode_conferir_fatura);
const podeVerFaturas = usuario.perfil === 'admin' || (!!usuario.pode_ver_todos &&
  !!(usuario.pode_conferir_fatura || usuario.pode_aprovar_pagamento || usuario.pode_ver_financeiro || usuario.pode_ver_auditoria));

// Telas que dependem de permissão própria.
[['auditoria-frete', podeVerAuditoria], ['financeiro', podeVerFinanceiro], ['relatorios', podeVerRelatorios], ['sinistros', podeVerSinistros]]
  .forEach(([pagina, pode]) => {
    if (!pode) document.querySelector(`.nav-item[data-pagina="${pagina}"]`)?.classList.add('oculto');
  });

if (!podeEnviarXml) document.getElementById('navUpload').classList.add('oculto');
if (podeAcessarCadastros) document.getElementById('navCadastros').classList.remove('oculto');
if (usuario.perfil === 'admin') document.getElementById('navManutencao').classList.remove('oculto');
if (!podeEditar) document.getElementById('btnNovoRegistro').classList.add('oculto');

// Esconde as sub-abas de Cadastros que o usuário não tem permissão de ver,
// e ativa a primeira sub-aba disponível.
document.querySelector('.sub-tab[data-subpagina="usuarios"]').classList.toggle('oculto', !podeGerenciarUsuarios);
document.querySelector('.sub-tab[data-subpagina="transportadoras"]').classList.toggle('oculto', !podeGerenciarTransportadoras);
document.querySelector('.sub-tab[data-subpagina="clientes"]')?.classList.toggle('oculto',
  !(usuario.perfil === 'admin' || usuario.pode_gerenciar_transportadoras || usuario.pode_editar_registros || usuario.pode_ver_todos));
document.querySelector('.sub-tab[data-subpagina="tabelas-preco"]').classList.toggle('oculto', !podeGerenciarTabelasPreco);
{
  const primeiraSubAbaVisivel = document.querySelector('.sub-tab:not(.oculto)');
  if (primeiraSubAbaVisivel) primeiraSubAbaVisivel.click();
}

// Mostra a versão do sistema no rodapé (vem da API, sem precisar de login).
fetch('/api/status').then((r) => r.json()).then((d) => {
  document.getElementById('versaoSistema').textContent = d.versao ? `Nexofrete v${d.versao}${d.pacote ? ` · pacote ${d.pacote}` : ''}` : '';
}).catch(() => {});

// ---------- Banner de aviso do sistema ----------
const bannerAviso = document.getElementById('bannerAviso');
const textoBannerAviso = document.getElementById('textoBannerAviso');
let ultimoAvisoOcultadoId = Number(sessionStorage.getItem('avisoOcultadoId') || 0);

function mostrarAviso(aviso) {
  bannerAviso.className = `tipo-${aviso.tipo || 'info'}`;
  textoBannerAviso.textContent = aviso.mensagem;
  textoBannerAviso.dataset.avisoId = aviso.id;
  document.body.classList.add('tem-aviso');
}

function esconderAviso() {
  bannerAviso.className = 'oculto';
  document.body.classList.remove('tem-aviso');
}

async function verificarAviso() {
  try {
    const resposta = await apiFetch('/api/avisos/atual');
    if (!resposta.ok) return;
    const aviso = await resposta.json();
    if (aviso && aviso.id !== ultimoAvisoOcultadoId) {
      mostrarAviso(aviso);
    } else if (!aviso) {
      esconderAviso();
    }
  } catch (err) {
    // silencioso — não atrapalha o uso normal do sistema
  }
}
verificarAviso();
setInterval(verificarAviso, 20000);

document.getElementById('fecharBannerAviso').addEventListener('click', () => {
  const idAtual = textoBannerAviso.dataset.avisoId;
  ultimoAvisoOcultadoId = Number(idAtual) || -1;
  sessionStorage.setItem('avisoOcultadoId', ultimoAvisoOcultadoId);
  esconderAviso();
});
function atualizarBotaoTema() {
  const claro = document.documentElement.classList.contains('tema-claro');
  document.getElementById('iconeTema').textContent = claro ? '☀️' : '🌙';
  document.getElementById('textoTema').textContent = claro ? 'Tema claro' : 'Tema escuro';
}
atualizarBotaoTema();

document.getElementById('btnAlternarTema').addEventListener('click', () => {
  const claro = document.documentElement.classList.toggle('tema-claro');
  localStorage.setItem('tema', claro ? 'claro' : 'escuro');
  atualizarBotaoTema();
});

// Sair: registra a saída, encerra a sessão e mostra uma despedida no centro
// da tela antes de voltar pro login (clicar em qualquer lugar pula a espera).
document.getElementById('btnSair').addEventListener('click', () => {
  try {
    fetch('/api/auth/sair', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, keepalive: true }).catch(() => {});
  } catch (e) { /* sem conexão: sai assim mesmo */ }
  sessionStorage.removeItem('token');
  sessionStorage.removeItem('usuario');
  sessionStorage.removeItem('permissoesRecarregadas');

  const primeiroNome = (usuario?.nome || '').trim().split(/\s+/)[0] || '';
  const hora = new Date().getHours();
  const votos = hora < 12 ? 'Tenha um ótimo dia!' : hora < 18 ? 'Boa tarde e bom trabalho!' : 'Bom descanso!';
  document.getElementById('despedidaTitulo').textContent = `Até a próxima${primeiroNome ? `, ${primeiroNome}` : ''}!`;
  document.getElementById('despedidaTexto').textContent = `Sua sessão foi encerrada com segurança. ${votos}`;
  const tela = document.getElementById('telaDespedida');
  tela.classList.remove('oculto');

  const irParaLogin = () => { window.location.href = 'login.html'; };
  tela.addEventListener('click', irParaLogin);
  setTimeout(irParaLogin, 2600);
});

// ---------- Navegação entre seções ----------
let telaCheiaLigadaPeloRelatorio = false;
document.querySelectorAll('.nav-item').forEach((item) => {
  item.addEventListener('click', () => {
    // Tela sem permissão (item escondido no menu): atalhos de outras telas
    // e notificações também não abrem ela.
    if (item.classList.contains('oculto')) return;
    // Já está em Relatórios: o clique só abre/fecha o submenu (continua na tela atual).
    if (item.dataset.pagina === 'relatorios' && !document.getElementById('pagina-relatorios').classList.contains('oculto')) {
      const sub = document.getElementById('navSubRelatorios');
      const abrir = sub.classList.contains('oculto');
      sub.classList.toggle('oculto', !abrir);
      document.getElementById('navRelSeta').textContent = abrir ? '▾' : '▸';
      return;
    }
    document.querySelectorAll('.nav-item').forEach((i) => i.classList.remove('ativo'));
    item.classList.add('ativo');

    document.querySelectorAll('main > section').forEach((s) => s.classList.add('oculto'));
    document.getElementById(`pagina-${item.dataset.pagina}`).classList.remove('oculto');

    // Relatórios precisa do máximo de largura possível pros gráficos — já
    // abre em tela cheia sozinho, e desliga de novo quando você sai daqui
    // (só se foi essa página que ligou, pra não mexer numa tela cheia que
    // você já tinha ligado na mão em "Todos os registros").
    // Relatórios: abre o submenu no menu da esquerda (cada relatório é uma tela).
    // Não liga mais a tela cheia sozinho — ela esconderia o menu (e o submenu).
    document.getElementById('navSubRelatorios')?.classList.toggle('oculto', item.dataset.pagina !== 'relatorios');
    const seta = document.getElementById('navRelSeta');
    if (seta) seta.textContent = item.dataset.pagina === 'relatorios' ? '▾' : '▸';
    if (item.dataset.pagina === 'relatorios') {
      setTimeout(carregarRelatorios, 60); // espera o layout se ajustar antes de medir a largura dos gráficos
    } else if (telaCheiaLigadaPeloRelatorio) {
      document.querySelector('.app-shell').classList.remove('tela-cheia');
      btnTelaCheia.textContent = '⛶ Tela cheia';
      telaCheiaLigadaPeloRelatorio = false;
    }

    if (item.dataset.pagina === 'cadastros') { carregarUsuarios(); carregarAuditoria(); carregarTransportadoras(); carregarEmpresa(); carregarTabelasPreco(); }
    if (item.dataset.pagina === 'visao-geral') carregarResumo();
    if (item.dataset.pagina === 'upload') carregarAguardandoXml();
    if (item.dataset.pagina === 'registros') carregarRegistros();
    if (item.dataset.pagina === 'auditoria-frete') carregarAuditoriaFrete();
    if (item.dataset.pagina === 'financeiro') { carregarFinanceiro(); carregarMetaFrete(); }
    if (item.dataset.pagina === 'manutencao') { carregarConfigBackup(); carregarBackups(); carregarAvisoAtivo(); carregarUsuariosOnline(); carregarConfigErp(); carregarConfigSeguranca(); carregarConfigEmail(); carregarConfigAuditoria(); carregarConfigWhatsapp(); }
    if (item.dataset.pagina === 'mensagens') carregarCaixaMensagens();
    if (item.dataset.pagina === 'agenda') carregarAgenda();
    if (item.dataset.pagina === 'manutencao') { carregarPastaXml(); carregarVersaoSistema(); }
    if (item.dataset.pagina === 'sinistros') carregarSinistros();
  });
});

// Sub-abas dentro de "Cadastros"
document.querySelectorAll('.sub-tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.sub-tab').forEach((t) => t.classList.remove('ativo'));
    tab.classList.add('ativo');
    ['usuarios', 'transportadoras', 'clientes', 'empresa', 'tabelas-preco'].forEach((nome) => {
      document.getElementById(`sub-${nome}`).classList.toggle('oculto', nome !== tab.dataset.subpagina);
    });
    if (tab.dataset.subpagina === 'clientes') carregarClientes(1);
  });
});

// ---------- Chamada autenticada à API (mesma origem, caminho relativo) ----------
async function apiFetch(caminho, opcoes = {}) {
  const resposta = await fetch(caminho, {
    ...opcoes,
    headers: {
      ...(opcoes.headers || {}),
      Authorization: `Bearer ${token}`,
    },
  });
  if (resposta.status === 401) {
    // Diz no login por que a sessão acabou (expirou ou usuário desativado).
    let motivo = 'sessao';
    try {
      const corpo = await resposta.clone().json();
      if (/desativado|removido/i.test(corpo?.erro || '')) motivo = 'desativado';
    } catch (e) { /* resposta sem JSON: fica "sessao" */ }
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('usuario');
    window.location.href = `login.html?motivo=${motivo}`;
    throw new Error('Sessão expirada.');
  }
  if (resposta.status === 403) {
    try {
      const corpo = await resposta.clone().json();
      if (corpo?.trocar_senha) {
        window.location.href = 'login.html';
        throw new Error('Precisa cadastrar a senha.');
      }
    } catch (e) { if (e.message === 'Precisa cadastrar a senha.') throw e; }
  }
  return resposta;
}

// =====================================================================
// Diálogo padrão do sistema: toda mensagem, confirmação ou pergunta aparece
// no centro da tela, com um desenho que mostra o tipo (sucesso, erro,
// atenção, informação, pergunta, perigo, lembrete). Substitui os alert(),
// confirm() e prompt() do navegador, que eram diferentes em cada computador.
// =====================================================================
const DIALOGO_TIPOS = {
  sucesso:  { cor: '#22c55e', titulo: 'Tudo certo!' },
  erro:     { cor: '#ef4444', titulo: 'Algo deu errado' },
  aviso:    { cor: '#f59e0b', titulo: 'Atenção' },
  info:     { cor: '#4d7cff', titulo: 'Aviso' },
  pergunta: { cor: '#4d7cff', titulo: 'Confirma?' },
  perigo:   { cor: '#ef4444', titulo: 'Tem certeza?' },
  lembrete: { cor: '#f59e0b', titulo: 'Lembrete' },
};

function desenhoDialogo(tipo) {
  const cor = (DIALOGO_TIPOS[tipo] || DIALOGO_TIPOS.info).cor;
  const traco = `stroke="${cor}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" fill="none" class="dlg-traco"`;
  const fundo = `<circle cx="40" cy="40" r="36" fill="${cor}" opacity="0.14"/><circle cx="40" cy="40" r="30" ${traco}/>`;
  const figuras = {
    sucesso: `${fundo}<path d="M27 41 L36 50 L54 31" ${traco}/>`,
    erro: `${fundo}<path d="M30 30 L50 50 M50 30 L30 50" ${traco}/>`,
    info: `${fundo}<path d="M40 37 L40 53" ${traco}/><circle cx="40" cy="27.5" r="3.6" fill="${cor}"/>`,
    pergunta: `${fundo}<path d="M32.5 32 C32.5 22 47.5 22 47.5 31.5 C47.5 37.5 40 38 40 45" ${traco}/><circle cx="40" cy="54" r="3.6" fill="${cor}"/>`,
    aviso: `<circle cx="40" cy="40" r="36" fill="${cor}" opacity="0.14"/><path d="M40 13 L68 62 L12 62 Z" ${traco}/><path d="M40 31 L40 45" ${traco}/><circle cx="40" cy="54" r="3.4" fill="${cor}"/>`,
    perigo: `<circle cx="40" cy="40" r="36" fill="${cor}" opacity="0.14"/><path d="M40 13 L68 62 L12 62 Z" ${traco}/><path d="M40 31 L40 45" ${traco}/><circle cx="40" cy="54" r="3.4" fill="${cor}"/>`,
    lembrete: `${fundo}<path d="M40 24 C31 24 28 31 28 38 L28 47 L24 52 L56 52 L52 47 L52 38 C52 31 49 24 40 24 Z" ${traco}/><path d="M36 56 C37 59 43 59 44 56" ${traco}/>`,
  };
  return `<svg viewBox="0 0 80 80" width="84" height="84" aria-hidden="true" class="dlg-desenho ${tipo === 'lembrete' ? 'dlg-balanca' : ''}">${figuras[tipo] || figuras.info}</svg>`;
}

// Descobre o tipo pela mensagem, pra quem chama mostrarAlerta() sem dizer.
function tipoPelaMensagem(texto) {
  const t = String(texto || '').toLowerCase();
  if (/(erro|falha|não foi possível|não consegui|inválid|expirad|negad|sem permiss)/.test(t)) return 'erro';
  if (/(sucesso|salv[oa]|enviad[oa]|concluíd|pronto|✓|atualizad[oa]|importad[oa]|registrad[oa])/.test(t)) return 'sucesso';
  if (/(selecione|informe|preencha|marque|escolha|digite|atenção|nenhum|precisa|antes de)/.test(t)) return 'aviso';
  return 'info';
}

let filaDialogos = Promise.resolve();

// Mostra o diálogo e devolve (numa Promise) o valor do botão escolhido.
// opcoes: { tipo, titulo, mensagem, botoes: [{ texto, valor, estilo }], campo: { valor, placeholder, multilinha } }
function abrirDialogo(opcoes) {
  const execucao = filaDialogos.then(() => new Promise((resolve) => {
    const tipo = opcoes.tipo || 'info';
    const cfg = DIALOGO_TIPOS[tipo] || DIALOGO_TIPOS.info;
    const botoes = opcoes.botoes || [{ texto: 'Ok, entendi', valor: true, estilo: 'primario' }];
    const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    const fundo = document.createElement('div');
    fundo.className = 'dlg-fundo';
    fundo.innerHTML = `
      <div class="dlg-cartao" role="dialog" aria-modal="true" style="--cor-dlg:${cfg.cor};">
        ${desenhoDialogo(tipo)}
        <h3 class="dlg-titulo">${esc(opcoes.titulo || cfg.titulo)}</h3>
        ${opcoes.mensagem ? `<p class="dlg-mensagem">${esc(opcoes.mensagem)}</p>` : ''}
        ${opcoes.campo ? (opcoes.campo.multilinha
          ? `<textarea class="dlg-campo" rows="4" placeholder="${esc(opcoes.campo.placeholder || '')}">${esc(opcoes.campo.valor || '')}</textarea>`
          : `<input class="dlg-campo" type="text" placeholder="${esc(opcoes.campo.placeholder || '')}" value="${esc(opcoes.campo.valor || '')}" />`) : ''}
        <div class="dlg-botoes">
          ${botoes.map((b, i) => `<button class="btn dlg-btn dlg-${b.estilo || 'secundario'} ${(b.estilo || 'secundario') === 'secundario' ? 'btn-secundario' : ''}" data-i="${i}">${esc(b.texto)}</button>`).join('')}
        </div>
      </div>`;
    document.body.appendChild(fundo);

    const campo = fundo.querySelector('.dlg-campo');
    const principal = botoes.findIndex((b) => b.estilo === 'primario' || b.estilo === 'perigo');
    const cancelar = botoes.findIndex((b) => b.valor === false || b.valor === null);
    const fechar = (i) => {
      document.removeEventListener('keydown', teclas, true);
      const botao = botoes[i];
      let valor = botao ? botao.valor : null;
      if (campo && botao && botao.valor === true) valor = campo.value;
      fundo.classList.add('saindo');
      setTimeout(() => fundo.remove(), 160);
      resolve(valor);
    };
    const teclas = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); fechar(cancelar >= 0 ? cancelar : 0); }
      if (e.key === 'Enter' && !(campo && campo.tagName === 'TEXTAREA' && !e.ctrlKey)) {
        e.preventDefault(); fechar(principal >= 0 ? principal : 0);
      }
    };
    document.addEventListener('keydown', teclas, true);
    fundo.querySelectorAll('.dlg-btn').forEach((b) => b.addEventListener('click', () => fechar(Number(b.dataset.i))));
    setTimeout(() => (campo || fundo.querySelectorAll('.dlg-btn')[principal >= 0 ? principal : 0])?.focus(), 30);
  }));
  filaDialogos = execucao.catch(() => {});
  return execucao;
}

// No lugar do alert(): só informa. O tipo é deduzido da mensagem se não vier.
function mostrarAlerta(mensagem, opcoes = {}) {
  return abrirDialogo({ tipo: opcoes.tipo || tipoPelaMensagem(mensagem), titulo: opcoes.titulo, mensagem });
}

// No lugar do confirm(): devolve true ou false.
async function confirmar(mensagem, opcoes = {}) {
  const perigo = opcoes.tipo === 'perigo';
  const valor = await abrirDialogo({
    tipo: opcoes.tipo || 'pergunta', titulo: opcoes.titulo, mensagem,
    botoes: [
      { texto: opcoes.textoCancelar || 'Cancelar', valor: false, estilo: 'secundario' },
      { texto: opcoes.textoOk || 'Confirmar', valor: true, estilo: perigo ? 'perigo' : 'primario' },
    ],
  });
  return valor === true;
}

// No lugar do prompt(): devolve o texto digitado, ou null se cancelar.
async function pedirTexto(mensagem, opcoes = {}) {
  const valor = await abrirDialogo({
    tipo: opcoes.tipo || 'pergunta', titulo: opcoes.titulo || 'Informe', mensagem,
    campo: { valor: opcoes.valor || '', placeholder: opcoes.placeholder || '', multilinha: !!opcoes.multilinha },
    botoes: [
      { texto: 'Cancelar', valor: null, estilo: 'secundario' },
      { texto: opcoes.textoOk || 'Continuar', valor: true, estilo: 'primario' },
    ],
  });
  return valor === null || valor === true ? null : String(valor);
}

// Qualquer alert() que tenha ficado no código também sai no padrão novo.
window.alert = (mensagem) => { mostrarAlerta(mensagem); };

// ---------- Carregar registros ----------
let ultimoRegistrosCarregados = [];
let paginaAtual = 1;
const REGISTROS_POR_PAGINA = 100;
let totalPaginasAtual = 1;
let buscaAtual = '';

// Usada pela "Visão geral": pega até 10000 registros (sem paginar) pra
// calcular os indicadores e mostrar os últimos.
async function carregarResumo() {
  try {
    const resposta = await apiFetch('/api/fretes/resumo');
    const dados = await resposta.json();
    preencherVisaoGeral(dados);
  } catch (err) {
    console.error(err);
  }
}
carregarResumo();

// Tolerância de auditoria: buscada uma vez e guardada aqui, pra usar tanto
// na Auditoria de Frete quanto em qualquer conferência de taxas.
let toleranciaAuditoria = { tolerancia_valor: 0, tolerancia_percentual: 0 };
apiFetch('/api/auditoria-config').then((r) => r.ok ? r.json() : null).then((c) => {
  if (c) toleranciaAuditoria = c;
}).catch(() => {});

// Usada pela aba "Todos os registros": traz uma página de cada vez.

// Usada pela aba "Todos os registros": traz uma página de cada vez.
let periodoAtivo = { de: null, ate: null, rotulo: 'Todo o período' };

async function carregarRegistros(filtroBusca = null, pagina = null) {
  if (filtroBusca !== null) buscaAtual = filtroBusca;
  if (pagina !== null) paginaAtual = pagina;

  try {
    const params = new URLSearchParams({ pagina: paginaAtual, por_pagina: REGISTROS_POR_PAGINA });
    if (buscaAtual) params.set('busca', buscaAtual);
    if (periodoAtivo.de) params.set('data_emissao_nf_de', periodoAtivo.de);
    if (periodoAtivo.ate) params.set('data_emissao_nf_ate', periodoAtivo.ate);

    const resposta = await apiFetch(`/api/fretes?${params.toString()}`);
    const dados = await resposta.json();
    ultimoRegistrosCarregados = dados.registros;
    totalPaginasAtual = dados.total_paginas;

    preencherTabelaCompleta(dados.registros);
    atualizarControlesPaginacao(dados);
  } catch (err) {
    console.error(err);
  }
}
carregarRegistros();

// ---------- Filtro de período (Data Emissão NF), com atalhos rápidos ----------
function formatarDataISO(data) { return data.toISOString().slice(0, 10); }

function calcularPreset(preset) {
  const hoje = new Date();
  const inicioHoje = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  const diaSemana = inicioHoje.getDay(); // 0 = domingo

  switch (preset) {
    case 'todo': return { de: null, ate: null, rotulo: 'Todo o período' };
    case 'hoje': return { de: formatarDataISO(inicioHoje), ate: formatarDataISO(inicioHoje), rotulo: 'Hoje' };
    case 'ultimos-7': {
      const de = new Date(inicioHoje); de.setDate(de.getDate() - 6);
      return { de: formatarDataISO(de), ate: formatarDataISO(inicioHoje), rotulo: 'Últimos 7 dias' };
    }
    case 'ultimos-30': {
      const de = new Date(inicioHoje); de.setDate(de.getDate() - 29);
      return { de: formatarDataISO(de), ate: formatarDataISO(inicioHoje), rotulo: 'Últimos 30 dias' };
    }
    case 'esta-semana': {
      const de = new Date(inicioHoje); de.setDate(de.getDate() - diaSemana);
      return { de: formatarDataISO(de), ate: formatarDataISO(inicioHoje), rotulo: 'Esta semana' };
    }
    case 'semana-passada': {
      const ate = new Date(inicioHoje); ate.setDate(ate.getDate() - diaSemana - 1);
      const de = new Date(ate); de.setDate(de.getDate() - 6);
      return { de: formatarDataISO(de), ate: formatarDataISO(ate), rotulo: 'Semana passada' };
    }
    case 'este-mes': {
      const de = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
      return { de: formatarDataISO(de), ate: formatarDataISO(inicioHoje), rotulo: 'Este mês' };
    }
    case 'mes-passado': {
      const de = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
      const ate = new Date(hoje.getFullYear(), hoje.getMonth(), 0);
      return { de: formatarDataISO(de), ate: formatarDataISO(ate), rotulo: 'Mês passado' };
    }
    case 'este-ano': {
      const de = new Date(hoje.getFullYear(), 0, 1);
      return { de: formatarDataISO(de), ate: formatarDataISO(inicioHoje), rotulo: 'Este ano' };
    }
    case 'ano-passado': {
      const de = new Date(hoje.getFullYear() - 1, 0, 1);
      const ate = new Date(hoje.getFullYear() - 1, 11, 31);
      return { de: formatarDataISO(de), ate: formatarDataISO(ate), rotulo: 'Ano passado' };
    }
    default: return { de: null, ate: null, rotulo: 'Todo o período' };
  }
}

const painelPeriodo = document.getElementById('painelPeriodo');
document.getElementById('btnAbrirPeriodo').addEventListener('click', (e) => {
  e.stopPropagation();
  painelPeriodo.classList.toggle('oculto');
});
document.addEventListener('click', (e) => {
  if (!painelPeriodo.contains(e.target) && e.target.id !== 'btnAbrirPeriodo' && !painelPeriodo.classList.contains('oculto')) {
    painelPeriodo.classList.add('oculto');
  }
});

// Preenche um campo de data (mostra dd/mm/aaaa, guarda o ISO real no dataset).
function definirCampoData(id, isoValor) {
  const el = document.getElementById(id);
  el.dataset.iso = isoValor || '';
  el.value = isoValor ? formatoData(isoValor) : '';
}
function lerCampoData(id) {
  return document.getElementById(id).dataset.iso || null;
}

document.querySelectorAll('.periodo-opcao').forEach((opcao) => {
  opcao.addEventListener('click', () => {
    const resultado = calcularPreset(opcao.dataset.preset);
    periodoAtivo = resultado;
    definirCampoData('periodoDataDe', resultado.de);
    definirCampoData('periodoDataAte', resultado.ate);
    document.querySelectorAll('.periodo-opcao').forEach((o) => o.classList.remove('ativo'));
    opcao.classList.add('ativo');
    document.getElementById('rotuloPeriodoAtual').textContent = resultado.rotulo;
    painelPeriodo.classList.add('oculto');
    carregarRegistros(null, 1);
  });
});

document.getElementById('btnAplicarPeriodo').addEventListener('click', () => {
  const de = lerCampoData('periodoDataDe');
  const ate = lerCampoData('periodoDataAte');
  document.querySelectorAll('.periodo-opcao').forEach((o) => o.classList.remove('ativo'));

  if (!de && !ate) {
    periodoAtivo = { de: null, ate: null, rotulo: 'Todo o período' };
  } else {
    const rotulo = de && ate ? `${formatoData(de)} — ${formatoData(ate)}` : (de ? `A partir de ${formatoData(de)}` : `Até ${formatoData(ate)}`);
    periodoAtivo = { de, ate, rotulo };
  }
  document.getElementById('rotuloPeriodoAtual').textContent = periodoAtivo.rotulo;
  painelPeriodo.classList.add('oculto');
  carregarRegistros(null, 1);
});

document.getElementById('btnCancelarPeriodo').addEventListener('click', () => {
  definirCampoData('periodoDataDe', periodoAtivo.de);
  definirCampoData('periodoDataAte', periodoAtivo.ate);
  painelPeriodo.classList.add('oculto');
});

// ---------- Calendário customizado em português (não depende do idioma do Windows) ----------
const MESES_PT = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const DIAS_PT = ['Do', 'Se', 'Te', 'Qa', 'Qi', 'Se', 'Sa'];
const calendarioPtBr = document.getElementById('calendarioPtBr');
let calendarioAlvoId = null;
let calendarioMesAtual = new Date();

function abrirCalendario(idCampo) {
  calendarioAlvoId = idCampo;
  const isoAtual = lerCampoData(idCampo);
  calendarioMesAtual = isoAtual ? new Date(isoAtual + 'T00:00:00') : new Date();

  const campoEl = document.getElementById(idCampo);
  const rect = campoEl.getBoundingClientRect();
  const painelRect = painelPeriodo.getBoundingClientRect();
  calendarioPtBr.style.left = `${rect.left - painelRect.left}px`;
  calendarioPtBr.style.top = `${rect.bottom - painelRect.top + 4}px`;

  renderizarCalendario();
  calendarioPtBr.classList.remove('oculto');
}

function renderizarCalendario() {
  const ano = calendarioMesAtual.getFullYear();
  const mes = calendarioMesAtual.getMonth();
  const primeiroDiaSemana = new Date(ano, mes, 1).getDay();
  const totalDias = new Date(ano, mes + 1, 0).getDate();
  const isoSelecionado = lerCampoData(calendarioAlvoId);

  let celulas = '';
  for (let i = 0; i < primeiroDiaSemana; i++) celulas += '<span></span>';
  for (let dia = 1; dia <= totalDias; dia++) {
    const isoDia = `${ano}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
    const selecionado = isoDia === isoSelecionado;
    celulas += `<span class="calendario-dia${selecionado ? ' selecionado' : ''}" data-iso="${isoDia}">${dia}</span>`;
  }

  calendarioPtBr.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
      <span id="calNavAnterior" style="cursor:pointer; padding:2px 8px;">‹</span>
      <strong style="font-size:12.5px;">${MESES_PT[mes]} ${ano}</strong>
      <span id="calNavProximo" style="cursor:pointer; padding:2px 8px;">›</span>
    </div>
    <div style="display:grid; grid-template-columns:repeat(7, 1fr); gap:2px; font-size:10px; color:var(--texto-fraco); text-align:center; margin-bottom:4px;">
      ${DIAS_PT.map((d) => `<span>${d}</span>`).join('')}
    </div>
    <div class="calendario-grade" style="display:grid; grid-template-columns:repeat(7, 1fr); gap:2px; text-align:center; font-size:11.5px;">
      ${celulas}
    </div>
  `;

  document.getElementById('calNavAnterior').addEventListener('click', (e) => {
    e.stopPropagation();
    calendarioMesAtual = new Date(ano, mes - 1, 1);
    renderizarCalendario();
  });
  document.getElementById('calNavProximo').addEventListener('click', (e) => {
    e.stopPropagation();
    calendarioMesAtual = new Date(ano, mes + 1, 1);
    renderizarCalendario();
  });
  calendarioPtBr.querySelectorAll('.calendario-dia').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      definirCampoData(calendarioAlvoId, el.dataset.iso);
      calendarioPtBr.classList.add('oculto');
    });
  });
}

document.getElementById('periodoDataDe').addEventListener('click', (e) => { e.stopPropagation(); abrirCalendario('periodoDataDe'); });
document.getElementById('periodoDataAte').addEventListener('click', (e) => { e.stopPropagation(); abrirCalendario('periodoDataAte'); });
document.addEventListener('click', (e) => {
  if (!calendarioPtBr.contains(e.target) && e.target.id !== 'periodoDataDe' && e.target.id !== 'periodoDataAte') {
    calendarioPtBr.classList.add('oculto');
  }
});

// Confronta a transportadora que saiu na NF-e com a que emitiu o CT-e —
// útil pra pegar casos que precisaram de Carta de Correção, onde a
// transportadora informada na nota não é a mesma que efetivamente levou.
function celulaTransportadoraComConfronto(r) {
  const nfe = (r.transportadora_nfe || '').trim().toLowerCase();
  const cte = (r.transportadora_cte || '').trim().toLowerCase();
  const divergente = nfe && cte && nfe !== cte;

  if (!divergente) return r.transportadora || '—';

  return `${r.transportadora || '—'} <span title="Divergência: a NF-e informa '${r.transportadora_nfe}', mas o CT-e foi emitido por '${r.transportadora_cte}'. Confira se precisa de Carta de Correção." style="cursor:help; color:var(--vermelho);">⚠️</span>`;
}

// Compara cada taxa cobrada no CT-e com o que a tabela de preço diz que
// deveria ser — só entram na lista as taxas que têm os dois lados (cobrado
// E esperado) preenchidos, pra não gerar ruído com taxa que nem existe nesse frete.
// Valor "calculado" principal pra comparar com o Negociado: usa o Valor Total
// Calculado (Base + Ad Valorem + GRIS + Pedágio + Taxas) quando disponível;
// cai pro Valor Frete Tabelado (só a base) em registros calculados antes
// dessa mudança, até serem recalculados.
function valorCalculadoPrincipal(l) {
  return l.valor_total_calculado ?? l.valor_frete_tabelado;
}

function conferirTaxas(l) {
  const taxas = [];

  const adicionar = (nome, cobrado, esperado) => {
    if (cobrado == null || esperado == null) return;
    cobrado = Number(cobrado);
    esperado = Number(esperado);
    const diferenca = cobrado - esperado;
    const tolerancia = Math.max(
      Number(toleranciaAuditoria.tolerancia_valor) || 0,
      (Number(toleranciaAuditoria.tolerancia_percentual) || 0) / 100 * esperado
    );
    taxas.push({ nome, cobrado, esperado, diferenca, divergente: Math.abs(diferenca) > tolerancia });
  };

  // GRIS = percentual sobre o valor faturado, respeitando o mínimo.
  if (l.tabela_gris_percentual != null && l.valor_faturado != null) {
    const grisPercentual = Number(l.valor_faturado) * (Number(l.tabela_gris_percentual) / 100);
    const grisEsperado = Math.max(grisPercentual, Number(l.tabela_gris_minimo) || 0);
    adicionar('GRIS', l.gris, grisEsperado);
  }
  // Ad Valorem (seguro) = percentual acordado sobre o valor real das NF-es.
  if (l.tabela_ad_valorem_percentual != null && l.valor_faturado != null) {
    const adValoremEsperado = Number(l.valor_faturado) * (Number(l.tabela_ad_valorem_percentual) / 100);
    adicionar('Ad Valorem', l.ad_valorem, adValoremEsperado);
  }
  adicionar('TDE', l.tde, l.tabela_tde);
  adicionar('TDA', l.tda, l.tabela_tda);
  adicionar('TRT', l.trt, l.tabela_trt);
  // Pedágio = R$ por fração de 100kg.
  if (l.tabela_pedagio != null && l.peso_kg != null) {
    const pedagioEsperado = Number(l.tabela_pedagio) * Math.ceil(Number(l.peso_kg) / 100);
    adicionar('Pedágio', l.pedagio, pedagioEsperado);
  }

  return taxas;
}

// Monta a mensagem automática apontando exatamente onde está a divergência,
// no formato "Divergência em X: Cobrado R$ A | Calculado R$ B" — usada pra
// sugerir o motivo da glosa/aprovação sem precisar digitar tudo de novo.
// Quanto a transportadora cobrou além da tabela (CT-e − tabela): positivo = cobrou a mais.
// No banco, dif_negociado_tabela é o contrário (tabela − CT-e).
const cobradoAMais = (l) => (l?.dif_negociado_tabela == null ? null : (-Number(l.dif_negociado_tabela) || 0));
function gerarResumoDivergencias(l) {
  const linhas = [];
  const dif = Number(l.dif_negociado_tabela);
  if (dif) {
    linhas.push(`Frete Total: Cobrado ${formatoMoeda(l.valor_frete_negociado)} | Calculado ${formatoMoeda(valorCalculadoPrincipal(l))}`);
  }
  conferirTaxas(l).filter((t) => t.divergente).forEach((t) => {
    linhas.push(`${t.nome}: Cobrado ${formatoMoeda(t.cobrado)} | Calculado ${formatoMoeda(t.esperado)}`);
  });
  return linhas.join('\n');
}

function badgeStatus(status) {
  const classe = { Arquivado: 'badge-arquivado', 'Não cobrado': 'badge-arquivado', Pendente: 'badge-pendente', Faturado: 'badge-faturado', Cancelado: 'badge-cancelado', Conferido: 'badge-conferido', 'Liberado p/ Pagamento': 'badge-liberado', 'Frete Retido': 'badge-retido' }[status] || 'badge-pendente';
  return `<span class="badge ${classe}">${status || 'Pendente'}</span>`;
}

function badgeAprovacao(statusAprovacao) {
  const mapa = {
    Aprovado: { classe: 'badge-faturado', texto: '✓ Aprovado' },
    Rejeitado: { classe: 'badge-cancelado', texto: '✕ Rejeitado' },
    Cancelado: { classe: 'badge-cancelado', texto: 'Cancelado' },
  };
  const cfg = mapa[statusAprovacao] || { classe: 'badge-pendente', texto: 'Pendente' };
  return `<span class="badge ${cfg.classe}">${cfg.texto}</span>`;
}

// ---------- Visão geral ----------
let ultimosDadosVisaoGeral = null;

// Abre uma tela pelo menu (só se o usuário tiver permissão pra ela).
function irParaPagina(pagina) {
  const item = document.querySelector(`.nav-item[data-pagina="${pagina}"]`);
  if (!item || item.classList.contains('oculto')) return;
  // Já em Relatórios (aviso do sino, atalho da Visão geral): só garante o submenu aberto —
  // o clique no item, nesse caso, fecharia o submenu.
  if (pagina === 'relatorios' && !document.getElementById('pagina-relatorios').classList.contains('oculto')) {
    document.getElementById('navSubRelatorios')?.classList.remove('oculto');
    const seta = document.getElementById('navRelSeta'); if (seta) seta.textContent = '▾';
    return;
  }
  item.click();
}
const paginaPermitida = (pagina) => {
  const item = document.querySelector(`.nav-item[data-pagina="${pagina}"]`);
  return !!item && !item.classList.contains('oculto');
};

// Subtítulo da Visão geral: dia, hora (atualizada sozinha) e total de fretes.
function atualizarSubtituloVisaoGeral() {
  const el = document.getElementById('vgSubtitulo');
  if (!el) return;
  const agora = new Date();
  const dia = agora.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  const hora = agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const total = ultimosDadosVisaoGeral ? ` · ${Number(ultimosDadosVisaoGeral.total || 0).toLocaleString('pt-BR')} fretes acompanhados` : '';
  el.textContent = `${dia} · ${hora}${total}`;
}
setInterval(atualizarSubtituloVisaoGeral, 15 * 1000);

function preencherVisaoGeral(dados) {
  if (!dados || dados.erro) return;
  ultimosDadosVisaoGeral = dados;
  const hoje = new Date();
  const nomeMesBruto = hoje.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  const nomeMes = nomeMesBruto.charAt(0).toUpperCase() + nomeMesBruto.slice(1);
  atualizarSubtituloVisaoGeral();

  // 1) Fluxo do frete, etapa por etapa.
  const etapas = [
    { titulo: 'Aguardando CT-e', icone: '📄', cor: '#8a94a6', qtd: dados.aguardando_cte, valor: null,
      desc: 'Pedidos que ainda não receberam o CT-e da transportadora', pagina: 'registros' },
    { titulo: 'Em conferência', icone: '🔎', cor: '#4d7cff', qtd: dados.em_conferencia, valor: dados.valor_em_conferencia,
      desc: 'CT-e recebido, falta comparar com a tabela', pagina: 'auditoria-frete' },
    { titulo: 'Frete Retido', icone: '🔶', cor: '#f97316', qtd: dados.retidos, valor: dados.valor_retido,
      desc: 'Cobrado diferente da tabela, precisa de decisão', pagina: 'auditoria-frete' },
    { titulo: 'Liberado p/ Pagamento', icone: '✅', cor: '#22c55e', qtd: dados.liberados, valor: dados.valor_liberado,
      desc: 'Conferido e aprovado, aguardando a fatura', pagina: 'financeiro' },
    { titulo: 'Faturado', icone: '🧾', cor: '#a855f7', qtd: dados.faturados, valor: dados.valor_faturado,
      desc: 'Já entrou numa fatura conferida', pagina: 'financeiro' },
  ];
  const fluxo = document.getElementById('vgFluxo');
  fluxo.innerHTML = etapas.map((e, i) => `
    <div class="vg-etapa ${paginaPermitida(e.pagina) ? 'clicavel' : ''}" style="--cor-etapa:${e.cor};" data-vg-pagina="${e.pagina}" data-vg-i="${i}">
      <div class="vg-etapa-topo"><span>${e.titulo}</span><span>${e.icone}</span></div>
      <div class="vg-etapa-num">${Number(e.qtd || 0).toLocaleString('pt-BR')}</div>
      <div class="vg-etapa-valor">${e.valor != null ? formatoMoeda(e.valor) : ''}</div>
      <div class="vg-etapa-desc">${e.desc}</div>
    </div>`).join('');

  // 2) Precisa de atenção (só aparece o que tem alguma coisa).
  const alertas = [];
  const add = (cond, icone, cor, texto, detalhe, acao) => { if (cond) alertas.push({ icone, cor, texto, detalhe, acao }); };
  add(dados.ctes_outra_transportadora > 0, '⚠️', '#ef4444', `${dados.ctes_outra_transportadora} nota(s) com CT-e de transportadoras DIFERENTES`,
    'Duas transportadoras cobrando a mesma nota — confira antes de pagar', paginaPermitida('auditoria-frete') ? () => irParaPagina('auditoria-frete') : null);
  add(dados.cobranca_dupla > 0, '♻️', '#ef4444', `${dados.cobranca_dupla} frete(s) com possível cobrança em dobro`,
    'Nota devolvida e nota refaturada com CT-e nas duas — a entrega deve ser cobrada uma vez só', paginaPermitida('auditoria-frete') ? () => irParaPagina('auditoria-frete') : null);
  add(dados.notas_sem_mapa > 0, '🗺️', '#f59e0b', `${dados.notas_sem_mapa} nota(s) sem mapa de carregamento`,
    'Emitidas há mais dias que o limite e sem mapa — paradas no estoque?', paginaPermitida('relatorios') ? () => { irParaPagina('relatorios'); mostrarSubabaRelatorio('semMapa'); } : null);
  const badgeSm = document.getElementById('navBadgeSemMapa');
  if (badgeSm) { badgeSm.textContent = dados.notas_sem_mapa || ''; badgeSm.classList.toggle('oculto', !dados.notas_sem_mapa); }
  add(dados.nf_cancelada_com_cte > 0, '🧾', '#ef4444', `${dados.nf_cancelada_com_cte} nota(s) CANCELADA(S) com CT-e cobrado`,
    'Frete de nota cancelada fica retido — confira se deve ir para a nota que substituiu', paginaPermitida('auditoria-frete') ? () => irParaPagina('auditoria-frete') : null);
  add(dados.vencidos > 0, '🚨', '#ef4444', `${dados.vencidos} pagamento(s) de frete vencido(s)`,
    'Liberados com data de vencimento que já passou', paginaPermitida('financeiro') ? () => irParaPagina('financeiro') : null);
  add(dados.retidos > 0, '🔶', '#f97316', `${dados.retidos} frete(s) retido(s) aguardando decisão`,
    `${formatoMoeda(dados.valor_retido)} cobrados diferente da tabela`, paginaPermitida('auditoria-frete') ? () => irParaPagina('auditoria-frete') : null);
  add(dados.vencendo > 0, '⏰', '#eab308', `${dados.vencendo} pagamento(s) vencendo nos próximos 7 dias`,
    'Liberados para pagamento', paginaPermitida('financeiro') ? () => irParaPagina('financeiro') : null);
  add(dados.prontos_fatura > 0, '🧾', '#4d7cff', `${dados.prontos_fatura} CT-e liberado(s) ainda fora de fatura`,
    `${formatoMoeda(dados.valor_prontos_fatura)} prontos para conferir quando a fatura chegar`,
    typeof podeConferirFatura !== 'undefined' && podeConferirFatura && paginaPermitida('auditoria-frete')
      ? () => { irParaPagina('auditoria-frete'); cfAbrir(); } : null);
  add(dados.entregas_atrasadas > 0, '🚚', '#ef4444', `${dados.entregas_atrasadas} entrega(s) atrasada(s) sem entrega registrada`,
    'A data prevista passou e ninguém lançou a entrega', paginaPermitida('relatorios') ? () => { irParaPagina('relatorios'); setTimeout(() => irParaAlvoNotificacao('entregas-previstas'), 400); } : null);
  add(dados.sinistros_cobrar > 0, '📦', '#f97316', `${dados.sinistros_cobrar} sinistro(s) para cobrar da transportadora`,
    'A data de cobrança chegou ou já passou', paginaPermitida('sinistros') ? () => { irParaPagina('sinistros'); setTimeout(() => irParaAlvoNotificacao('sinistros-cobrar'), 300); } : null);
  add(dados.sem_calculo > 0, '📐', '#8a94a6', `${dados.sem_calculo} CT-e sem valor pela tabela`,
    'A transportadora não tem tabela ativa ou falta o trecho da cidade', paginaPermitida('registros') ? () => irParaPagina('registros') : null);
  if (dados.meta && dados.meta.valor_meta > 0) {
    const pct = (dados.meta.realizado / dados.meta.valor_meta) * 100;
    add(pct >= 90, '🎯', pct >= 100 ? '#ef4444' : '#eab308',
      pct >= 100 ? `Meta de frete do mês estourada (${pct.toFixed(0)}%)` : `Meta de frete do mês em ${pct.toFixed(0)}%`,
      `${formatoMoeda(dados.meta.realizado)} de ${formatoMoeda(dados.meta.valor_meta)}`,
      paginaPermitida('financeiro') ? () => irParaPagina('financeiro') : null);
  }
  const areaAlertas = document.getElementById('vgAtencao');
  areaAlertas.innerHTML = alertas.length
    ? alertas.map((a, i) => `
        <div class="vg-alerta ${a.acao ? 'clicavel' : ''}" style="--cor-alerta:${a.cor};" data-vg-alerta="${i}">
          <span class="vg-alerta-icone">${a.icone}</span>
          <span class="vg-alerta-texto">${a.texto}<small>${a.detalhe}</small></span>
          ${a.acao ? '<span class="vg-alerta-seta">›</span>' : ''}
        </div>`).join('')
    : '<div class="vg-tudo-ok">✓ Tudo em dia<small>Nenhum frete retido, vencido ou pendente de ação.</small></div>';
  areaAlertas.querySelectorAll('[data-vg-alerta]').forEach((el) => {
    const alerta = alertas[Number(el.dataset.vgAlerta)];
    if (alerta.acao) el.addEventListener('click', alerta.acao);
  });

  // 3) Gasto com frete no mês.
  const m = dados.mes || {};
  const variacao = m.valor_anterior_mesmo_periodo > 0
    ? ((m.valor_atual - m.valor_anterior_mesmo_periodo) / m.valor_anterior_mesmo_periodo) * 100 : null;
  const percentFrete = m.mercadoria_atual > 0 ? (m.valor_atual / m.mercadoria_atual) * 100 : null;
  let htmlMeta = '';
  if (dados.meta && dados.meta.valor_meta > 0) {
    const pct = (dados.meta.realizado / dados.meta.valor_meta) * 100;
    const corMeta = pct >= 100 ? '#ef4444' : pct >= 90 ? '#eab308' : '#22c55e';
    htmlMeta = `
      <div class="vg-meta">
        <div class="vg-meta-topo"><span>🎯 Meta do mês: ${formatoMoeda(dados.meta.valor_meta)}</span><span>${pct.toFixed(0)}%</span></div>
        <div class="vg-meta-barra"><div style="width:${Math.min(100, pct)}%; background:linear-gradient(90deg, ${ajustarCor(corMeta, 0.25)}, ${corMeta});"></div></div>
      </div>`;
  }
  document.getElementById('vgMes').innerHTML = `
    <div style="font-size:12px; color:var(--texto-fraco);">${nomeMes}</div>
    <div class="vg-mes-valor">${formatoMoeda(m.valor_atual || 0)}</div>
    <div class="vg-mes-variacao" style="color:${variacao == null ? 'var(--texto-fraco)' : (variacao > 0 ? 'var(--vermelho)' : 'var(--verde)')};">
      ${variacao == null ? 'Sem dados do mesmo período no mês anterior'
        : `${variacao > 0 ? '▲' : '▼'} ${Math.abs(variacao).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% em relação ao mesmo período do mês anterior`}
    </div>
    <div class="vg-mes-linhas">
      <div>CT-e no mês<strong>${(m.qtd_atual || 0).toLocaleString('pt-BR')}</strong></div>
      <div>% do frete sobre a mercadoria<strong>${percentFrete == null ? '—' : `${percentFrete.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`}</strong></div>
      <div>Mês anterior (fechado)<strong>${formatoMoeda(m.valor_anterior || 0)}</strong></div>
    </div>
    ${htmlMeta}`;

  desenharGraficosVisaoGeral();
}

function desenharGraficosVisaoGeral() {
  const dados = ultimosDadosVisaoGeral;
  if (!dados || document.getElementById('pagina-visao-geral').classList.contains('oculto')) return;
  const transp = dados.transportadoras_mes || [];
  desenharBarras('vgGraficoTransportadoras', transp.map((t) => t.transportadora || '—'), transp.map((t) => Math.round(t.valor * 100) / 100), null, true, 260, formatoMoeda);
  const evol = dados.evolucao || [];
  // Com um mês só não existe "linha": mostra como barra até ter histórico.
  if (evol.length < 2) {
    desenharBarras('vgGraficoEvolucao', evol.map((e) => e.mes), evol.map((e) => Math.round(e.valor * 100) / 100), '#4d7cff', false, 220, formatoMoeda);
  } else {
    desenharLinha('vgGraficoEvolucao', evol.map((e) => e.mes), evol.map((e) => e.valor), '#4d7cff', 220, formatoMoeda);
  }
}

document.getElementById('vgFluxo').addEventListener('click', (e) => {
  const etapa = e.target.closest('.vg-etapa.clicavel');
  if (etapa) irParaPagina(etapa.dataset.vgPagina);
});

// Redesenha os gráficos da Visão geral ao voltar pra ela ou redimensionar a janela.
let timeoutGraficosVisaoGeral = null;
window.addEventListener('resize', () => {
  clearTimeout(timeoutGraficosVisaoGeral);
  timeoutGraficosVisaoGeral = setTimeout(() => {
    graficosSemAnimacaoAte = Date.now() + 1500;
    desenharGraficosVisaoGeral();
  }, 300);
});

const formatoData = (d) => {
  if (!d) return '—';
  const data = new Date(d);
  if (isNaN(data.getTime())) return d;
  return data.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
};

function preencherTabelaCompleta(registros) {
  const corpo = document.querySelector('#tabelaCompleta tbody');
  corpo.innerHTML = registros.map((r) => {
    // NF cancelada: laranja (mesmo com status Cancelado); pedido cancelado no ERP: vermelho.
    // NF cancelada: laranja; NF devolvida: roxo; pedido cancelado no ERP: vermelho.
    const classeLinha = r.nf_cancelada ? 'linha-nf-cancelada' : r.nf_devolvida ? 'linha-nf-devolvida' : r.nf_retornou ? 'linha-nf-retornou' : (r.status === 'Cancelado' ? 'linha-pedido-cancelado' : '');
    const duploClique = podeEditar ? `ondblclick="abrirFormularioRegistro(${r.id})"` : '';
    return `
    <tr class="${classeLinha}" ${duploClique} style="${podeEditar ? 'cursor:pointer;' : ''}" title="${podeEditar ? 'Duplo clique para abrir' : ''}">
      <td>${podeExcluir ? `<input type="checkbox" class="sel-registro" data-id="${r.id}" title="Selecionar" style="width:auto; margin:0 6px 0 0; vertical-align:middle;" />` : ''}${r.numero_pedido || '—'}</td>
      <td>${r.pedido_mercus || '—'}</td>
      <td>${formatoData(r.data_pedido)}</td>
      <td>${formatoData(r.data_emissao_nf)}</td>
      <td>${r.numero_nf ? `<button type="button" class="btn-copiar-nf" data-nf="${String(r.numero_nf).replace(/&/g, '&amp;').replace(/\"/g, '&quot;')}" title="Clique para copiar a Nota Fiscal" aria-label="Copiar Nota Fiscal ${r.numero_nf}"><span class="icone-copiar-nf">📋</span> <span class="numero-nf-copiar">${r.numero_nf}</span> <span class="contador-copias-nf">×${r.nf_copias || 0}</span></button>` : '—'}</td>
      <td>${formatoData(r.data_emissao_cte)}</td>
      <td>${r.numero_cte
          ? `${r.numero_cte}${r.mesmo_cte_contagem > 1 ? ` <span title="Esse CT-e aparece em ${r.mesmo_cte_contagem} registros (mais de uma nota fiscal no mesmo CT-e)" style="cursor:help;">🔗×${r.mesmo_cte_contagem}</span>` : ''}`
          : '—'}</td>
      <td>${formatoMoeda(r.valor_total_cte)}</td>
      <td>${formatoData(r.data_fatura)}</td>
      <td>${r.numero_fatura || '—'}</td>
      <td>${r.cliente || '—'}</td>
      <td>${r.cidade || '—'}</td>
      <td>${r.bairro || '—'}</td>
      <td>${r.uf || '—'}</td>
      <td>${celulaTransportadoraComConfronto(r)}</td>
      <td>${r.transportadora_cte || '—'}</td>
      <td>${r.tipo_carga || '—'}</td>
      <td>${r.frete_por_conta_cliente ? `<span class="cte-selo" title="Venda com frete por conta do destinatário e sem transportadora informada: o cliente contrata a transportadora ou vem buscar">🧾 Frete por conta do cliente</span>` : (r.frete_cif_fob || '—')}</td>
      <td>${r.redespacho || '—'}</td>
      <td>${r.cidade_redespacho || '—'}</td>
      <td>${formatoMoeda(r.valor_faturado)}</td>
      <td>${r.qtd_volumes ?? '—'}</td>
      <td>${r.peso_kg ?? '—'}</td>
      <td>${r.cubagem_m3 ?? '—'}</td>
      <td>${r.tabela_frete || '—'}</td>
      <td>${r.interior_capital || '—'}</td>
      <td>${formatoMoeda(r.valor_frete_tabelado)}</td>
      <td>${formatoMoeda(r.valor_frete_negociado)}</td>
      <td>${formatoMoeda(r.tde)}</td>
      <td>${formatoMoeda(r.tda)}</td>
      <td>${formatoMoeda(r.gris)}</td>
      <td>${formatoMoeda(r.reentrega)}</td>
      <td>${formatoMoeda(r.devolucao)}</td>
      <td>${formatoMoeda(r.outras_despesas)}</td>
      <td>${formatoMoeda(r.valor_total_frete)}</td>
      <td>${formatoMoeda(r.dif_negociado_tabela)}</td>
      <td>${r.percent_frete != null ? `${r.percent_frete}%` : '—'}</td>
      <td>${r.numero_mapa || '—'}</td>
      <td>${formatoData(r.data_coleta)}</td>
      <td>${formatoData(r.data_entrega)}</td>
      <td>${badgeStatus(r.status)}</td>
      <td>${badgeAprovacao(r.status_aprovacao)}</td>
      <td>${(r.observacoes || '—').replace(/\n/g, '<br>')}</td>
    </tr>
  `;
  }).join('') || `<tr><td colspan="43" style="color:var(--texto-fraco);">Nenhum registro encontrado.</td></tr>`;
}

// Clique na NF: copia automaticamente e registra o contador no banco.
const tabelaCompletaEl = document.getElementById('tabelaCompleta');
if (tabelaCompletaEl) {
  tabelaCompletaEl.addEventListener('click', async (e) => {
    const botao = e.target.closest('.btn-copiar-nf');
    if (!botao) return;
    e.preventDefault();
    e.stopPropagation();

    const numeroNf = botao.dataset.nf || '';
    if (!numeroNf) return;

    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(numeroNf);
      } else {
        const area = document.createElement('textarea');
        area.value = numeroNf;
        area.style.position = 'fixed';
        area.style.opacity = '0';
        document.body.appendChild(area);
        area.focus();
        area.select();
        document.execCommand('copy');
        area.remove();
      }

      const resposta = await apiFetch('/api/fretes/copiar-nf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ numero_nf: numeroNf }),
      });
      const dados = await resposta.json();
      if (!resposta.ok) throw new Error(dados.erro || 'Não foi possível registrar a cópia.');

      const contador = botao.querySelector('.contador-copias-nf');
      if (contador) contador.textContent = `×${dados.quantidade}`;
      const icone = botao.querySelector('.icone-copiar-nf');
      if (icone) icone.textContent = '✓';
      botao.classList.add('nf-copiada');
      botao.title = `NF ${numeroNf} copiada ${dados.quantidade} vez(es). Clique novamente para copiar.`;

      setTimeout(() => {
        if (icone) icone.textContent = '📋';
        botao.classList.remove('nf-copiada');
      }, 900);
    } catch (err) {
      mostrarAlerta(err.message || 'Não foi possível copiar a Nota Fiscal.', { tipo: 'aviso' });
    }
  });
}

let timeoutBusca = null;
document.getElementById('campoBusca').addEventListener('input', (e) => {
  clearTimeout(timeoutBusca);
  const valor = e.target.value.trim();
  timeoutBusca = setTimeout(() => carregarRegistros(valor, 1), 350);
});

// ---------- Paginação ----------
function atualizarControlesPaginacao(dados) {
  const inicio = dados.total === 0 ? 0 : (dados.pagina - 1) * dados.por_pagina + 1;
  const fim = Math.min(dados.pagina * dados.por_pagina, dados.total);
  document.getElementById('infoPaginacao').textContent =
    dados.total === 0 ? 'Nenhum registro' : `Mostrando ${inicio}–${fim} de ${dados.total} registros`;
  document.getElementById('rotuloPagina').textContent = `Página ${dados.pagina} de ${dados.total_paginas}`;
  document.getElementById('btnPaginaAnterior').disabled = dados.pagina <= 1;
  document.getElementById('btnProximaPagina').disabled = dados.pagina >= dados.total_paginas;
}

document.getElementById('btnPaginaAnterior').addEventListener('click', () => {
  if (paginaAtual > 1) carregarRegistros(null, paginaAtual - 1);
});
document.getElementById('btnProximaPagina').addEventListener('click', () => {
  if (paginaAtual < totalPaginasAtual) carregarRegistros(null, paginaAtual + 1);
});

// ---------- Tela cheia (esconde o menu lateral pra tabela ocupar mais espaço) ----------
const btnTelaCheia = document.getElementById('btnTelaCheia');
btnTelaCheia.addEventListener('click', () => {
  const ativo = document.querySelector('.app-shell').classList.toggle('tela-cheia');
  btnTelaCheia.textContent = ativo ? '✕ Sair da tela cheia' : '⛶ Tela cheia';
});

// ---------- Upload de XML ----------
const dropzone = document.getElementById('dropzone');
const inputArquivo = document.getElementById('inputArquivo');
const inputPasta = document.getElementById('inputPasta');
const btnSelecionarPasta = document.getElementById('btnSelecionarPasta');
const listaArquivos = document.getElementById('listaArquivos');
const campoNumeroPedido = document.getElementById('campoNumeroPedido');

dropzone.addEventListener('click', () => inputArquivo.click());
// Botão explícito para escolher arquivos (.xml e .zip, vários de uma vez) sem arrastar.
document.getElementById('btnSelecionarArquivos')?.addEventListener('click', () => inputArquivo.click());
// Antes de abrir a escolha da pasta, avisa (no mesmo padrão das outras
// mensagens) que o navegador vai pedir uma confirmação dele. Essa pergunta
// "Fazer upload de N arquivos para este site?" é uma trava de segurança do
// próprio navegador e não pode ser trocada pelo sistema. Arrastar a pasta pra
// área pontilhada importa do mesmo jeito, sem essa pergunta.
btnSelecionarPasta.addEventListener('click', async () => {
  let naoAvisar = false;
  try { naoAvisar = localStorage.getItem('nexofreteAvisoPasta') === 'nao'; } catch (e) { /* sem armazenamento */ }
  if (!naoAvisar) {
    const escolha = await abrirDialogo({
      tipo: 'info',
      titulo: 'Importar uma pasta inteira',
      mensagem: 'Depois de escolher a pasta, o navegador vai perguntar "Fazer upload de N arquivos para este site?". '
        + 'É uma confirmação de segurança do próprio navegador: clique em "Fazer upload" para continuar.\n\n'
        + 'Dica: arrastando a pasta para a área pontilhada, a importação acontece sem essa pergunta.',
      botoes: [
        { texto: 'Cancelar', valor: null, estilo: 'secundario' },
        { texto: 'Não avisar mais', valor: 'sempre', estilo: 'secundario' },
        { texto: 'Escolher pasta', valor: 'ok', estilo: 'primario' },
      ],
    });
    if (!escolha) return;
    if (escolha === 'sempre') { try { localStorage.setItem('nexofreteAvisoPasta', 'nao'); } catch (e) { /* ok */ } }
  }
  inputPasta.click();
});

inputArquivo.addEventListener('change', () => {
  processarVarios(Array.from(inputArquivo.files));
  inputArquivo.value = '';
});

inputPasta.addEventListener('change', () => {
  const arquivosXml = Array.from(inputPasta.files).filter((f) => /\.(xml|zip)$/i.test(f.name));
  processarVarios(arquivosXml);
  inputPasta.value = '';
});

// ---------- Upload manual da planilha do ERP ----------
const inputPlanilhaErp = document.getElementById('inputPlanilhaErp');
document.getElementById('btnEnviarPlanilhaErp').addEventListener('click', () => inputPlanilhaErp.click());

inputPlanilhaErp.addEventListener('change', async () => {
  const arquivo = inputPlanilhaErp.files[0];
  if (!arquivo) return;
  const resultadoEl = document.getElementById('resultadoPlanilhaErp');
  resultadoEl.textContent = 'Importando planilha, aguarde...';

  const formData = new FormData();
  formData.append('arquivo', arquivo);

  try {
    const resposta = await apiFetch('/api/importacao-erp/upload', { method: 'POST', body: formData });
    const dados = await resposta.json();
    if (!resposta.ok) {
      resultadoEl.innerHTML = `<span style="color:var(--vermelho);">${dados.erro || 'Erro ao importar a planilha.'}</span>`;
      return;
    }
    resultadoEl.innerHTML = `<span style="color:var(--verde);">✓</span> ${dados.total} linha(s) lida(s): ${dados.atualizados} registro(s) completado(s)` +
      (dados.aguardando ? `, <b>${dados.aguardando} aguardando o XML da nota</b> (entram sozinhos quando a NF-e chegar)` : '') +
      (dados.pulados ? `, ${dados.pulados} pulado(s) (pedidos cancelados ou de exportação)` : '') +
      (dados.erros.length ? `. ${dados.erros.length} erro(s): ${dados.erros.slice(0, 3).join('; ')}` : '.');
    carregarResumo();
    carregarAguardandoXml();
  } catch (err) {
    resultadoEl.innerHTML = '<span style="color:var(--vermelho);">Falha de conexão com o servidor.</span>';
  } finally {
    inputPlanilhaErp.value = '';
  }
});

// ---------- Mapa de carregamento → Data da Coleta ----------
const inputMapaCarregamento = document.getElementById('inputMapaCarregamento');
document.getElementById('btnEnviarMapaCarregamento').addEventListener('click', () => inputMapaCarregamento.click());
inputMapaCarregamento.addEventListener('change', async () => {
  const arquivo = inputMapaCarregamento.files[0];
  if (!arquivo) return;
  const resultadoEl = document.getElementById('resultadoMapaCarregamento');
  resultadoEl.textContent = 'Importando o mapa de carregamento, aguarde...';
  const formData = new FormData();
  formData.append('arquivo', arquivo);
  try {
    const resposta = await apiFetch('/api/importacao-erp/mapa-carregamento', { method: 'POST', body: formData });
    const d = await resposta.json();
    if (!resposta.ok) {
      resultadoEl.innerHTML = `<span style="color:var(--vermelho);">${cfEsc(d.erro || 'Erro ao importar o mapa de carregamento.')}</span>`;
      return;
    }
    resultadoEl.innerHTML = `<span style="color:var(--verde);">✓</span> ${d.notasComData} nota(s) com data no mapa: `
      + `<b>${d.preenchidas}</b> data(s) de coleta preenchida(s), <b>${d.atualizadas}</b> atualizada(s)`
      + `${d.jaIguais ? `, ${d.jaIguais} já estavam certas` : ''}.`
      + `${d.semFrete ? `<br>${d.semFrete} nota(s) do mapa ainda não estão no sistema (importe a NF-e/ERP e rode o mapa de novo).` : ''}`
      + `${d.semMapa ? `<br>${d.semMapa} linha(s) sem mapa de carregamento foram ignoradas.` : ''}`;
    carregarResumo();
  } catch (err) {
    resultadoEl.innerHTML = '<span style="color:var(--vermelho);">Falha de conexão com o servidor.</span>';
  } finally {
    inputMapaCarregamento.value = '';
  }
});

['dragenter', 'dragover'].forEach((evento) =>
  dropzone.addEventListener(evento, (e) => { e.preventDefault(); dropzone.classList.add('arrastando'); })
);
['dragleave', 'drop'].forEach((evento) =>
  dropzone.addEventListener(evento, (e) => { e.preventDefault(); dropzone.classList.remove('arrastando'); })
);
// Soltar arquivos OU pastas inteiras (inclusive com subpastas) na área
// pontilhada. Pasta arrastada não passa pela confirmação do navegador.
function lerEntradaArrastada(entrada) {
  return new Promise((resolve) => {
    if (!entrada) return resolve([]);
    if (entrada.isFile) {
      entrada.file((arquivo) => resolve([arquivo]), () => resolve([]));
      return;
    }
    if (entrada.isDirectory) {
      const leitor = entrada.createReader();
      const todas = [];
      const lerLote = () => leitor.readEntries(async (lote) => {
        if (!lote.length) {
          const partes = await Promise.all(todas.map(lerEntradaArrastada));
          resolve(partes.flat());
          return;
        }
        todas.push(...lote);
        lerLote(); // o navegador entrega no máximo ~100 por vez
      }, () => resolve([]));
      lerLote();
      return;
    }
    resolve([]);
  });
}

dropzone.addEventListener('drop', async (e) => {
  const entradas = Array.from(e.dataTransfer.items || [])
    .map((item) => (item.webkitGetAsEntry ? item.webkitGetAsEntry() : null))
    .filter(Boolean);
  let arquivos;
  if (entradas.length && entradas.some((en) => en.isDirectory)) {
    arquivos = (await Promise.all(entradas.map(lerEntradaArrastada))).flat();
  } else {
    arquivos = Array.from(e.dataTransfer.files);
  }
  const arquivosXml = arquivos.filter((f) => /\.(xml|zip)$/i.test(f.name));
  if (!arquivosXml.length) {
    mostrarAlerta('Não encontrei arquivos XML (nem .zip) no que foi arrastado.', { tipo: 'aviso' });
    return;
  }
  processarVarios(arquivosXml);
});

// Processa vários arquivos em sequência e só atualiza a lista de registros
// UMA VEZ no final (evita travar a tela com uma pasta cheia de XML).
const painelProgresso = document.getElementById('painelProgresso');
const progressoTexto = document.getElementById('progressoTexto');
const progressoPercentual = document.getElementById('progressoPercentual');
const progressoBarra = document.getElementById('progressoBarra');

async function processarVarios(arquivos) {
  if (arquivos.length === 0) return;
  painelProgresso.classList.remove('oculto');

  // .zip vai inteiro pro servidor (ele abre e importa cada XML de dentro).
  // Os XML soltos vão em ordem: notas, depois CT-e, depois eventos — assim
  // cada CT-e já acha a nota e cada cancelamento já acha o CT-e.
  const zips = arquivos.filter((f) => /\.zip$/i.test(f.name));
  const xmls = [];
  for (const f of arquivos.filter((a) => !/\.zip$/i.test(a.name))) {
    const conteudo = await f.text();
    xmls.push({ nome: f.name, conteudo, tipo: detectarTipoXml(conteudo) });
  }
  const ordem = { nfe: 1, cte: 2, evento: 3 };
  xmls.sort((a, b) => (ordem[a.tipo] || 9) - (ordem[b.tipo] || 9));

  const total = zips.length + xmls.length;
  let feitos = 0;
  const avancar = (nome) => {
    const percentual = Math.round((feitos / total) * 100);
    progressoTexto.textContent = `Importando ${feitos + 1} de ${total} (${nome})`;
    progressoPercentual.textContent = `${percentual}%`;
    progressoBarra.style.width = `${percentual}%`;
  };

  for (const zip of zips) {
    avancar(zip.name);
    await processarZip(zip);
    feitos += 1;
  }
  for (const x of xmls) {
    avancar(x.nome);
    await processarArquivo(x.nome, x.conteudo);
    feitos += 1;
  }

  progressoTexto.textContent = `Concluído: ${total} de ${total} arquivos`;
  progressoPercentual.textContent = '100%';
  progressoBarra.style.width = '100%';

  carregarRegistros();
  carregarResumo();
}

// Um .zip: manda pro servidor e mostra uma linha pra cada XML de dentro.
async function processarZip(arquivo) {
  const idLinha = `arquivo-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  listaArquivos.insertAdjacentHTML('beforeend', `
    <div class="item-arquivo" id="${idLinha}">
      <span>🗜️ ${cfEsc(arquivo.name)}</span>
      <span class="status-envio enviando">Abrindo o zip e importando…</span>
    </div>`);
  const linhaEl = document.getElementById(idLinha).querySelector('.status-envio');
  try {
    const formData = new FormData();
    formData.append('arquivo', arquivo, arquivo.name);
    const resposta = await apiFetch('/api/upload/zip', { method: 'POST', body: formData });
    const d = await resposta.json();
    if (!resposta.ok) { linhaEl.textContent = d.erro || 'Erro ao abrir o zip.'; linhaEl.className = 'status-envio erro'; return; }
    const ok = d.resultados.filter((r) => r.ok).length;
    linhaEl.textContent = `${d.total} XML dentro do zip: ${ok} importado(s), ${d.total - ok} com erro`;
    linhaEl.className = `status-envio ${ok === d.total ? 'ok' : 'erro'}`;
    d.resultados.forEach((r) => {
      listaArquivos.insertAdjacentHTML('beforeend', `
        <div class="item-arquivo" style="padding-left:28px;">
          <span>↳ ${cfEsc(r.nome)}</span>
          <span class="status-envio ${r.ok ? 'ok' : 'erro'}">${cfEsc(r.mensagem || '')}</span>
        </div>`);
    });
  } catch (err) {
    linhaEl.textContent = 'Falha de conexão com o servidor.';
    linhaEl.className = 'status-envio erro';
  }
}

function detectarTipoXml(conteudo) {
  if (conteudo.includes('<infCte') || conteudo.includes('cteProc')) return 'cte';
  if (conteudo.includes('<infNFe') || conteudo.includes('nfeProc')) return 'nfe';
  if (conteudo.includes('<infEvento') || conteudo.includes('procEvento') || conteudo.includes('retEvento')) return 'evento';
  // Retorno/recibo da SEFAZ ("-ret.xml"): não tem dados da nota; o servidor só explica o que é.
  if (/<(protNFe|protCTe|retConsSitNFe|retConsSitCTe|retConsReciNFe|retConsReciCTe|retEnviNFe|retEnviCte|retCTe)\b/.test(conteudo)) return 'retorno';
  return null;
}

async function processarArquivo(nomeArquivo, conteudo) {
  const idLinha = `arquivo-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  listaArquivos.insertAdjacentHTML('beforeend', `
    <div class="item-arquivo" id="${idLinha}">
      <span>${nomeArquivo}</span>
      <span class="status-envio enviando">Enviando...</span>
    </div>
  `);
  const linhaEl = document.getElementById(idLinha).querySelector('.status-envio');

  const tipo = detectarTipoXml(conteudo);
  if (!tipo) {
    linhaEl.textContent = 'Não reconhecido (não é NF-e, CT-e, evento nem retorno da SEFAZ)';
    linhaEl.className = 'status-envio erro';
    return;
  }

  try {
    const formData = new FormData();
    formData.append('arquivo', new Blob([conteudo], { type: 'text/xml' }), nomeArquivo);
    if (campoNumeroPedido.value.trim()) {
      formData.append('numero_pedido', campoNumeroPedido.value.trim());
    }

    const resposta = await apiFetch(`/api/upload/${tipo}`, { method: 'POST', body: formData });
    const dados = await resposta.json();

    if (!resposta.ok) {
      linhaEl.textContent = dados.erro || 'Erro ao importar';
      linhaEl.className = 'status-envio erro';
      return;
    }

    if (dados.pulado) {
      linhaEl.textContent = dados.mensagem || 'Pulado';
      linhaEl.className = 'status-envio';
      linhaEl.style.color = 'var(--texto-fraco)';
      return;
    }

    linhaEl.textContent = ['evento', 'retorno'].includes(tipo) ? (dados.mensagem || 'Evento vinculado ✓') : `Importado (${tipo.toUpperCase()}) ✓`;
    linhaEl.className = 'status-envio ok';
  } catch (err) {
    linhaEl.textContent = 'Falha de conexão com o servidor';
    linhaEl.className = 'status-envio erro';
  }
}

// ---------- Usuários ----------
const painelFormUsuario = document.getElementById('painelFormUsuario');
painelFormUsuario.addEventListener('click', (e) => {
  if (e.target === painelFormUsuario) painelFormUsuario.classList.add('oculto');
});
const fPerfil = document.getElementById('fPerfil');
const campoClienteNome = document.getElementById('campoClienteNome');
const campoPermissoes = document.getElementById('campoPermissoes');
let editandoUsuarioId = null;

function atualizarCamposConformePerfil() {
  const perfil = fPerfil.value;
  campoClienteNome.classList.toggle('oculto', perfil !== 'cliente');
  campoPermissoes.classList.toggle('oculto', perfil !== 'interno');
}
fPerfil.addEventListener('change', atualizarCamposConformePerfil);

document.getElementById('fEmail').addEventListener('input', async (e) => {
  const email = e.target.value.trim();
  const statusEl = document.getElementById('statusVerificacaoEmail');
  const btnSalvar = document.getElementById('btnSalvarUsuario');
  btnSalvar.disabled = false;

  if (!email.includes('@') || !email.includes('.')) {
    statusEl.textContent = '';
    return;
  }

  try {
    const params = new URLSearchParams({ email });
    if (editandoUsuarioId) params.set('excluir_id', editandoUsuarioId);
    const resposta = await apiFetch(`/api/auth/verificar-email?${params.toString()}`);
    const dados = await resposta.json();
    if (dados.existe) {
      statusEl.innerHTML = `<span style="color:var(--vermelho);">⚠ Já existe um usuário cadastrado com esse email ("${dados.usuario.nome}").</span>`;
      btnSalvar.disabled = true;
    } else {
      statusEl.textContent = '';
    }
  } catch (err) { /* se a checagem falhar, segue o fluxo normal */ }
});

function abrirFormularioUsuario(usuarioParaEditar = null) {
  document.getElementById('erroFormUsuario').classList.remove('visivel');
  editandoUsuarioId = usuarioParaEditar ? usuarioParaEditar.id : null;

  document.getElementById('tituloFormUsuario').textContent = usuarioParaEditar ? 'Editar usuário' : 'Novo usuário';
  document.getElementById('fNome').value = usuarioParaEditar?.nome || '';
  document.getElementById('fFuncao').value = usuarioParaEditar?.funcao || '';
  document.getElementById('fEmail').value = usuarioParaEditar?.email || '';
  document.getElementById('fEmail').disabled = !!usuarioParaEditar;
  document.getElementById('statusVerificacaoEmail').textContent = '';
  document.getElementById('btnSalvarUsuario').disabled = false;
  document.getElementById('fSenha').value = '';
  // Senha provisória: marcada por padrão; some quando o admin edita a si mesmo.
  const editandoASiMesmo = !!usuarioParaEditar && usuarioParaEditar.id === usuario.id;
  document.getElementById('fSenhaProvisoria').checked = !editandoASiMesmo;
  document.getElementById('campoSenhaProvisoria').classList.toggle('oculto', editandoASiMesmo);
  document.getElementById('labelSenha').textContent = usuarioParaEditar ? 'Nova senha (deixe em branco para manter)' : 'Senha';
  fPerfil.value = usuarioParaEditar?.perfil || 'cliente';
  document.getElementById('fClienteNome').value = usuarioParaEditar?.cliente_nome || '';
  document.getElementById('pVerTodos').checked = !!usuarioParaEditar?.pode_ver_todos;
  document.getElementById('pEnviarXml').checked = !!usuarioParaEditar?.pode_enviar_xml;
  document.getElementById('pEditar').checked = !!usuarioParaEditar?.pode_editar_registros;
  document.getElementById('pExcluir').checked = !!usuarioParaEditar?.pode_excluir_registros;
  document.getElementById('pGerenciarUsuarios').checked = !!usuarioParaEditar?.pode_gerenciar_usuarios;
  document.getElementById('pGerenciarTransportadoras').checked = !!usuarioParaEditar?.pode_gerenciar_transportadoras;
  document.getElementById('pGerenciarTabelasPreco').checked = !!usuarioParaEditar?.pode_gerenciar_tabelas_preco;
  document.getElementById('pAprovarPagamento').checked = !!usuarioParaEditar?.pode_aprovar_pagamento;
  document.getElementById('pAprovarValoresAltos').checked = !!usuarioParaEditar?.pode_aprovar_valores_altos;
  document.getElementById('pVerAuditoria').checked = !!usuarioParaEditar?.pode_ver_auditoria;
  document.getElementById('pVerFinanceiro').checked = !!usuarioParaEditar?.pode_ver_financeiro;
  document.getElementById('pVerRelatorios').checked = !!usuarioParaEditar?.pode_ver_relatorios;
  document.getElementById('pVerSinistros').checked = !!usuarioParaEditar?.pode_ver_sinistros;
  document.getElementById('pConferirFatura').checked = !!usuarioParaEditar?.pode_conferir_fatura;
  document.getElementById('pEmitirCte').checked = !!usuarioParaEditar?.pode_emitir_cte;
  document.getElementById('pDoisFatores').checked = !!usuarioParaEditar?.dois_fatores_ativo;

  atualizarCamposConformePerfil();
  painelFormUsuario.classList.remove('oculto');
}

document.getElementById('btnNovoUsuario').addEventListener('click', () => abrirFormularioUsuario());
document.getElementById('btnCancelarUsuario').addEventListener('click', () => painelFormUsuario.classList.add('oculto'));

document.getElementById('btnSalvarUsuario').addEventListener('click', async () => {
  const erroEl = document.getElementById('erroFormUsuario');
  erroEl.classList.remove('visivel');

  const corpo = {
    nome: document.getElementById('fNome').value.trim(),
    funcao: document.getElementById('fFuncao').value.trim(),
    email: document.getElementById('fEmail').value.trim(),
    senha: document.getElementById('fSenha').value,
    trocar_senha: document.getElementById('fSenhaProvisoria').checked,
    perfil: fPerfil.value,
    cliente_nome: fPerfil.value === 'cliente' ? document.getElementById('fClienteNome').value.trim() : null,
    pode_ver_todos: document.getElementById('pVerTodos').checked,
    pode_enviar_xml: document.getElementById('pEnviarXml').checked,
    pode_editar_registros: document.getElementById('pEditar').checked,
    pode_excluir_registros: document.getElementById('pExcluir').checked,
    pode_gerenciar_usuarios: document.getElementById('pGerenciarUsuarios').checked,
    pode_gerenciar_transportadoras: document.getElementById('pGerenciarTransportadoras').checked,
    pode_gerenciar_tabelas_preco: document.getElementById('pGerenciarTabelasPreco').checked,
    pode_aprovar_pagamento: document.getElementById('pAprovarPagamento').checked,
    pode_aprovar_valores_altos: document.getElementById('pAprovarValoresAltos').checked,
    pode_ver_auditoria: document.getElementById('pVerAuditoria').checked,
    pode_ver_financeiro: document.getElementById('pVerFinanceiro').checked,
    pode_ver_relatorios: document.getElementById('pVerRelatorios').checked,
    pode_ver_sinistros: document.getElementById('pVerSinistros').checked,
    pode_conferir_fatura: document.getElementById('pConferirFatura').checked,
    pode_emitir_cte: document.getElementById('pEmitirCte').checked,
    dois_fatores_ativo: document.getElementById('pDoisFatores').checked,
  };

  if (!corpo.nome || (!editandoUsuarioId && (!corpo.email || !corpo.senha))) {
    erroEl.textContent = 'Preencha nome, email e senha.';
    erroEl.classList.add('visivel');
    return;
  }
  if (!editandoUsuarioId) {
    // criação exige email/senha; edição não reenvia email e senha é opcional
  } else {
    delete corpo.email;
    if (!corpo.senha) delete corpo.senha;
  }

  try {
    const resposta = await apiFetch(
      editandoUsuarioId ? `/api/auth/usuarios/${editandoUsuarioId}` : '/api/auth/usuarios',
      { method: editandoUsuarioId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) }
    );
    const dados = await resposta.json();
    if (!resposta.ok) {
      erroEl.textContent = dados.erro || 'Erro ao salvar usuário.';
      erroEl.classList.add('visivel');
      return;
    }
    painelFormUsuario.classList.add('oculto');
    carregarUsuarios();
  } catch (err) {
    erroEl.textContent = 'Falha de conexão com o servidor.';
    erroEl.classList.add('visivel');
  }
});

function resumoPermissoes(u) {
  if (u.perfil === 'admin') return 'Acesso total';
  if (u.perfil === 'cliente') return 'Só os próprios registros';
  const lista = [];
  if (u.pode_ver_todos) lista.push('Ver tudo');
  if (u.pode_enviar_xml) lista.push('Enviar XML');
  if (u.pode_editar_registros) lista.push('Editar');
  if (u.pode_excluir_registros) lista.push('Excluir');
  if (u.pode_gerenciar_usuarios) lista.push('Gerenciar usuários');
  if (u.pode_gerenciar_transportadoras) lista.push('Gerenciar transportadoras');
  if (u.pode_gerenciar_tabelas_preco) lista.push('Gerenciar tabelas de preço');
  if (u.pode_aprovar_pagamento) lista.push('Aprovar pagamento');
  if (u.pode_aprovar_valores_altos) lista.push('Aprovar valores altos');
  if (u.pode_ver_auditoria) lista.push('Auditoria');
  if (u.pode_ver_financeiro) lista.push('Financeiro');
  if (u.pode_ver_relatorios) lista.push('Relatórios');
  if (u.pode_ver_sinistros) lista.push('Sinistros');
  if (u.pode_conferir_fatura) lista.push('Conferir fatura');
  if (u.pode_emitir_cte) lista.push('Emitir CT-e');
  if (u.dois_fatores_ativo) lista.push('Login em duas etapas');
  return lista.join(', ') || 'Nenhuma';
}

async function carregarUsuarios() {
  try {
    const resposta = await apiFetch('/api/auth/usuarios');
    if (!resposta.ok) return;
    const usuarios = await resposta.json();

    // Sugestões pro campo Função: as que já existem + algumas comuns.
    const funcoes = new Set(['Analista de Fretes', 'Assistente de Logística', 'Coordenador de Logística', 'Gerente de Logística',
      'Financeiro', 'Faturamento', 'Expedição', 'Compras', 'Diretoria']);
    usuarios.forEach((u) => { if (u.funcao) funcoes.add(u.funcao); });
    document.getElementById('listaFuncoes').innerHTML = [...funcoes].sort((a, b) => a.localeCompare(b, 'pt-BR'))
      .map((f) => `<option value="${cfEsc(f)}"></option>`).join('');

    const rotulos = { admin: 'Administrador', interno: 'Usuário interno', cliente: 'Cliente' };
    const corpo = document.querySelector('#tabelaUsuarios tbody');
    corpo.innerHTML = usuarios.map((u) => `
      <tr>
        <td>${cfEsc(u.nome)}${u.funcao ? `<div style="font-size:11.5px; color:var(--texto-fraco);">${cfEsc(u.funcao)}</div>` : ''}</td>
        <td>${u.email}</td>
        <td>${rotulos[u.perfil] || u.perfil}</td>
        <td>${u.cliente_nome || '—'}</td>
        <td>${resumoPermissoes(u)}</td>
        <td>${u.ativo ? '<span class="badge badge-faturado">Ativo</span>' : '<span class="badge badge-cancelado">Inativo</span>'}${u.ativo && u.trocar_senha ? ' <span class="badge badge-pendente" title="Ainda não cadastrou a própria senha">🔑 Senha provisória</span>' : ''}</td>
        <td style="text-align:right;">
          <button class="btn btn-secundario" style="width:auto; padding:6px 12px; font-size:12px;" onclick='abrirFormularioUsuario(${JSON.stringify(u).replace(/'/g, "&apos;")})'>Editar</button>
        </td>
      </tr>
    `).join('') || `<tr><td colspan="7" style="color:var(--texto-fraco);">Nenhum usuário cadastrado.</td></tr>`;
  } catch (err) {
    console.error(err);
  }
}

// ---------- Lançamento manual de registro ----------
const CAMPOS_REGISTRO_MANUAL = [
  { id: 'numero_pedido', label: 'Número do Pedido', type: 'text' },
  { id: 'pedido_mercus', label: 'Pedido Mercus', type: 'text' },
  { id: 'data_pedido', label: 'Data do Pedido', type: 'date' },
  { id: 'data_emissao_nf', label: 'Data Emissão NF', type: 'date' },
  { id: 'numero_nf', label: 'Número NF', type: 'text' },
  { id: 'data_emissao_cte', label: 'Data Emissão CT-e', type: 'date' },
  { id: 'numero_cte', label: 'Número CT-e', type: 'text' },
  { id: 'data_fatura', label: 'Data da Fatura', type: 'date' },
  { id: 'data_vencimento', label: 'Data de Vencimento', type: 'date' },
  { id: 'numero_fatura', label: 'Número da Fatura', type: 'text' },
  { id: 'cliente', label: 'Cliente', type: 'text' },
  { id: 'cidade', label: 'Cidade', type: 'text' },
  { id: 'bairro', label: 'Bairro', type: 'text' },
  { id: 'uf', label: 'UF', type: 'text' },
  { id: 'transportadora', label: 'Transportadora', type: 'text' },
  { id: 'transportadora_cte', label: 'Transporte Cte (pode preencher antes do CT-e chegar, pra já calcular o frete)', type: 'text' },
  { id: 'tipo_carga', label: 'Tipo de Carga (ex: Caixa, Tapete)', type: 'text' },
  { id: 'frete_cif_fob', label: 'Frete CIF ou FOB', type: 'select', opcoes: ['', 'CIF', 'FOB'] },
  { id: 'redespacho', label: 'Redespacho', type: 'text' },
  { id: 'cidade_redespacho', label: 'Cidade do Redespacho', type: 'text' },
  { id: 'valor_faturado', label: 'Valor Faturado', type: 'moeda' },
  { id: 'qtd_volumes', label: 'Qtd. Volumes', type: 'number' },
  { id: 'peso_kg', label: 'Peso (kg)', type: 'number' },
  { id: 'cubagem_m3', label: 'Cubagem (m³)', type: 'number' },
  { id: 'tabela_frete', label: 'Tabela de Preço (valor por volume; no Frete Mínimo = mínimo ÷ volume mínimo)', type: 'moeda' },
  { id: 'interior_capital', label: 'Interior ou Capital (preenchido pela Região do trecho)', type: 'text' },
  { id: 'valor_frete_tabelado', label: 'Valor Frete Tabelado (só o Frete Base)', type: 'moeda' },
  { id: 'valor_total_calculado', label: 'Valor Total Calculado (Base + Ad Valorem + GRIS + Pedágio + Taxas)', type: 'moeda' },
  { id: 'valor_frete_negociado', label: 'Valor Frete Negociado', type: 'number' },
  { id: 'tde', label: 'TDE', type: 'number' },
  { id: 'tda', label: 'TDA', type: 'number' },
  { id: 'gris', label: 'GRIS', type: 'number' },
  { id: 'reentrega', label: 'Reentrega', type: 'number' },
  { id: 'devolucao', label: 'Devolução', type: 'number' },
  { id: 'outras_despesas', label: 'Outras Despesas', type: 'number' },
  { id: 'valor_total_frete', label: 'Valor Total do Frete', type: 'number' },
  { id: 'dif_negociado_tabela', label: 'Dif. Negociado x Tabela', type: 'number' },
  { id: 'percent_frete', label: '% Frete (calculado: Valor Total do Frete ÷ Valor Faturado × 100)', type: 'number' },
  { id: 'numero_mapa', label: 'Número do Mapa', type: 'text' },
  { id: 'data_coleta', label: 'Data da Coleta', type: 'date' },
  { id: 'data_entrega', label: 'Data da Entrega', type: 'date' },
  { id: 'data_entrega_prevista', label: 'Data Prevista de Entrega (calculada: Coleta/CT-e + Prazo)', type: 'date' },
  { id: 'sla_status', label: 'SLA (calculado)', type: 'text' },
  { id: 'status', label: 'Status', type: 'select', opcoes: ['Pendente', 'Faturado', 'Cancelado', 'Conferido', 'Frete Retido', 'Liberado p/ Pagamento'] },
  { id: 'observacoes', label: 'Observações', type: 'textarea' },
];

const gridFormRegistro = document.getElementById('gridFormRegistro');
gridFormRegistro.innerHTML = CAMPOS_REGISTRO_MANUAL.map((f) => {
  const elId = `nr_${f.id}`;
  let campoHtml;
  if (f.type === 'select') {
    campoHtml = `<select id="${elId}">${f.opcoes.map((o) => `<option value="${o}">${o || '—'}</option>`).join('')}</select>`;
  } else if (f.type === 'textarea') {
    campoHtml = `<textarea id="${elId}" rows="2" style="width:100%; padding:10px; border-radius:10px; border:1px solid var(--borda); background:var(--bg-elevado); color:var(--texto); font-family:inherit; font-size:14px;"></textarea>`;
  } else if (f.type === 'moeda') {
    campoHtml = `<input type="text" inputmode="numeric" class="campo-moeda" id="${elId}" placeholder="0,00" />`;
  } else {
    campoHtml = `<input type="${f.type}" id="${elId}" />`;
  }
  const rotuloExtra = f.id === 'cidade_redespacho'
    ? `<button type="button" id="btnBuscarCidadeEndereco" title="Buscar cidade a partir de um endereço (rua/número), quando a nota não trouxer a cidade certa" style="margin-left:8px; font-size:11px; padding:2px 8px; border-radius:6px; border:1px solid var(--borda); background:var(--bg-elevado); color:var(--azul); cursor:pointer;">🌍 Buscar por endereço</button>`
    : '';
  return `<div class="campo" style="margin-bottom:0;"><label>${f.label}${rotuloExtra}</label>${campoHtml}</div>`;
}).join('');

const painelFormRegistro = document.getElementById('painelFormRegistro');
const tituloFormRegistro = document.querySelector('#painelFormRegistro h3');
const btnSalvarRegistro = document.getElementById('btnSalvarRegistro');
const btnExcluirRegistro = document.getElementById('btnExcluirRegistro');
let editandoRegistroId = null;

function limparFormularioRegistro() {
  CAMPOS_REGISTRO_MANUAL.forEach((f) => { document.getElementById(`nr_${f.id}`).value = ''; });
  document.getElementById('nr_auditoria_calculo').value = '';
  document.getElementById('nr_tabela_preco_id_usada').value = '';
  document.getElementById('nr_prazo_dias_tabela').value = '';
  document.getElementById('nr_carga_direta').checked = false;
}

function preencherFormularioRegistro(registro) {
  CAMPOS_REGISTRO_MANUAL.forEach((f) => {
    let valor = registro[f.id];
    if (f.type === 'date' && valor) valor = String(valor).slice(0, 10);
    if (f.type === 'moeda') valor = formatarMoedaExibicao(valor);
    document.getElementById(`nr_${f.id}`).value = valor ?? '';
  });
  document.getElementById('nr_auditoria_calculo').value = registro.auditoria_calculo || '';
  document.getElementById('nr_tabela_preco_id_usada').value = registro.tabela_preco_id_usada ?? '';
  document.getElementById('nr_prazo_dias_tabela').value = registro.prazo_dias_tabela ?? '';
  document.getElementById('nr_carga_direta').checked = !!registro.carga_direta;
}

// ---------- Fluxo de Aprovação (liberação de pagamento) ----------
function renderizarPainelAprovacao(registro) {
  const statusEl = document.getElementById('statusAprovacaoAtual');
  const botoesEl = document.getElementById('botoesAprovacao');

  if (!registro) {
    statusEl.innerHTML = '<span style="color:var(--texto-fraco);">Salve o registro primeiro pra poder aprovar.</span>';
    botoesEl.innerHTML = '';
    return;
  }

  statusEl.innerHTML = badgeAprovacao(registro.status_aprovacao);
  if (registro.aprovado_por_nome) {
    statusEl.innerHTML += ` <span style="color:var(--texto-fraco); font-size:12px;">por ${registro.aprovado_por_nome} em ${formatoDataHora(registro.aprovado_em)}</span>`;
  }
  if (registro.status_aprovacao === 'Rejeitado' && registro.motivo_rejeicao) {
    statusEl.innerHTML += `<div style="margin-top:6px; color:var(--vermelho); font-size:12.5px;">Motivo: ${registro.motivo_rejeicao}</div>`;
  }

  if (!podeAprovarPagamento) {
    botoesEl.innerHTML = '';
    return;
  }

  botoesEl.innerHTML = `
    <button type="button" class="btn btn-primario" id="btnAprovarFrete" style="width:auto; padding:8px 16px; font-size:12.5px;">✓ Aprovar</button>
    <button type="button" class="btn btn-secundario" id="btnRejeitarFrete" style="width:auto; padding:8px 16px; font-size:12.5px;">✕ Rejeitar</button>
  `;

  document.getElementById('btnAprovarFrete').addEventListener('click', async () => {
    try {
      const resposta = await apiFetch(`/api/fretes/${editandoRegistroId}/aprovar`, { method: 'PUT' });
      const dados = await resposta.json();
      if (!resposta.ok) { mostrarAlerta(dados.erro || 'Erro ao aprovar.'); return; }
      renderizarPainelAprovacao(dados);
      atualizarRegistroNaListaLocal(dados);
      carregarRegistros();
    } catch (err) { mostrarAlerta('Falha de conexão com o servidor.'); }
  });

  document.getElementById('btnRejeitarFrete').addEventListener('click', async () => {
    const motivo = await pedirTexto('Escreva o motivo da rejeição (opcional).', { tipo: 'aviso', titulo: 'Rejeitar este frete?', textoOk: 'Rejeitar', multilinha: true });
    if (motivo === null) return;
    try {
      const resposta = await apiFetch(`/api/fretes/${editandoRegistroId}/rejeitar`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ motivo }),
      });
      const dados = await resposta.json();
      if (!resposta.ok) { mostrarAlerta(dados.erro || 'Erro ao rejeitar.'); return; }
      renderizarPainelAprovacao(dados);
      atualizarRegistroNaListaLocal(dados);
      carregarRegistros();
    } catch (err) { mostrarAlerta('Falha de conexão com o servidor.'); }
  });
}

// Atualiza o registro na lista já carregada em memória, sem precisar recarregar tudo.
function atualizarRegistroNaListaLocal(registroAtualizado) {
  const indice = ultimoRegistrosCarregados.findIndex((r) => r.id === registroAtualizado.id);
  if (indice >= 0) ultimoRegistrosCarregados[indice] = registroAtualizado;
}

function fecharModalRegistro() {
  painelFormRegistro.classList.add('oculto');
}

// Fecha ao clicar fora do card (na área escura do fundo).
painelFormRegistro.addEventListener('click', (e) => {
  if (e.target === painelFormRegistro) fecharModalRegistro();
});

document.getElementById('btnNovoRegistro').addEventListener('click', () => {
  editandoRegistroId = null;
  tituloFormRegistro.textContent = 'Novo registro manual'; document.getElementById('avisoFreteCliente')?.classList.add('oculto');
  btnSalvarRegistro.disabled = false; btnSalvarRegistro.title = '';
  btnSalvarRegistro.textContent = 'Salvar registro';
  btnExcluirRegistro.classList.add('oculto');
  document.getElementById('btnAbrirCanhoto').classList.add('oculto');
  limparFormularioRegistro();
  renderizarPainelAprovacao(null);
  document.getElementById('erroFormRegistro').classList.remove('visivel');
  painelFormRegistro.classList.remove('oculto');
});

// Chamada ao clicar no Número do Pedido ou no Número NF de cada linha da tabela.
function abrirFormularioRegistro(id) {
  const registro = ultimoRegistrosCarregados.find((r) => r.id === id);
  if (!registro) return;

  editandoRegistroId = id;
  tituloFormRegistro.textContent = `Editar registro #${id}`;
  btnSalvarRegistro.textContent = 'Salvar alterações';
  if (podeExcluir) btnExcluirRegistro.classList.remove('oculto');
  document.getElementById('btnAbrirCanhoto').classList.remove('oculto');
  preencherFormularioRegistro(registro);
  // CT-e cancelado: só pra consulta — não salva, não exclui, não registra canhoto.
  const cancelado = !!registro.cte_cancelado;
  btnSalvarRegistro.disabled = cancelado;
  btnSalvarRegistro.title = cancelado ? 'CT-e cancelado: fica só como histórico e não pode ser alterado.' : '';
  if (cancelado) {
    btnExcluirRegistro.classList.add('oculto');
    document.getElementById('btnAbrirCanhoto').classList.add('oculto');
    tituloFormRegistro.textContent = `Registro #${id} — 🚫 CT-e ${registro.numero_cte || ''} CANCELADO${registro.cte_cancelado_motivo ? ` (${registro.cte_cancelado_motivo})` : ''} · somente consulta`;
  }
  renderizarPainelAprovacao(registro);
  // Venda FOB com transportadora: avisa que o frete é por conta do cliente.
  const avisoFob = document.getElementById('avisoFreteCliente');
  if (avisoFob) {
    avisoFob.classList.toggle('oculto', !registro.frete_por_conta_cliente);
    avisoFob.innerHTML = registro.frete_por_conta_cliente
      ? '🧾 <b>Frete por conta do cliente (FOB)</b> — a nota não informa transportadora: o cliente contrata a transportadora ou vem buscar a mercadoria.' : '';
  }
  document.getElementById('erroFormRegistro').classList.remove('visivel');
  painelFormRegistro.classList.remove('oculto');
}

// Chamada pelo botão "Excluir registro" dentro do modal.
async function excluirRegistro(id) {
  if (!(await confirmarExclusao('Tem certeza que deseja excluir este registro? Essa ação não pode ser desfeita.'))) return;
  try {
    const resposta = await apiFetch(`/api/fretes/${id}`, { method: 'DELETE' });
    if (!resposta.ok && resposta.status !== 204) {
      const dados = await resposta.json().catch(() => ({}));
      mostrarAlerta(dados.erro || 'Erro ao excluir o registro.');
      return;
    }
    fecharModalRegistro();
    carregarRegistros();
    carregarResumo();
  } catch (err) {
    mostrarAlerta('Falha de conexão com o servidor.');
  }
}

btnExcluirRegistro.addEventListener('click', () => {
  if (editandoRegistroId) excluirRegistro(editandoRegistroId);
});

document.getElementById('btnCancelarRegistro').addEventListener('click', fecharModalRegistro);

btnSalvarRegistro.addEventListener('click', async () => {
  const erroEl = document.getElementById('erroFormRegistro');
  erroEl.classList.remove('visivel');

  const corpo = {};
  CAMPOS_REGISTRO_MANUAL.forEach((f) => {
    let valor = document.getElementById(`nr_${f.id}`).value;
    if (f.type === 'moeda') valor = paraNumeroMoeda(valor);
    if (valor !== '') corpo[f.id] = valor;
  });
  const auditoriaCalculo = document.getElementById('nr_auditoria_calculo').value;
  if (auditoriaCalculo) corpo.auditoria_calculo = auditoriaCalculo;
  const tabelaPrecoIdUsada = document.getElementById('nr_tabela_preco_id_usada').value;
  if (tabelaPrecoIdUsada) corpo.tabela_preco_id_usada = tabelaPrecoIdUsada;
  const prazoDiasTabela = document.getElementById('nr_prazo_dias_tabela').value;
  if (prazoDiasTabela) corpo.prazo_dias_tabela = prazoDiasTabela;
  corpo.carga_direta = document.getElementById('nr_carga_direta').checked;

  if (Object.keys(corpo).length === 0) {
    erroEl.textContent = 'Preencha ao menos um campo.';
    erroEl.classList.add('visivel');
    return;
  }

  try {
    const resposta = await apiFetch(
      editandoRegistroId ? `/api/fretes/${editandoRegistroId}` : '/api/fretes',
      {
        method: editandoRegistroId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corpo),
      }
    );
    const dados = await resposta.json();
    if (!resposta.ok) {
      erroEl.textContent = dados.erro || 'Erro ao salvar o registro.';
      erroEl.classList.add('visivel');
      return;
    }
    painelFormRegistro.classList.add('oculto');
    carregarRegistros();
    carregarResumo();
  } catch (err) {
    erroEl.textContent = 'Falha de conexão com o servidor.';
    erroEl.classList.add('visivel');
  }
});

// ---------- Auditoria e Logs ----------
const ROTULOS_ACAO = {
  login: 'Login',
  logout: 'Saiu do sistema',
  erp_aguardando_xml: 'Planilha do ERP aguardando XML',
  redefinir_senha: 'Redefiniu senha (script)',
  atualizar_sistema: 'Atualizou o sistema',
  restaurar_backup: 'Restaurou um backup',
  configurar_pasta_xml: 'Configurou a pasta monitorada de XML',
  importar_pasta_xml: 'Importou XML da pasta monitorada',
  importar_mapa_carregamento: 'Importou mapa de carregamento',
  agenda_criar: 'Criou evento na agenda',
  agenda_editar: 'Alterou evento da agenda',
  agenda_cancelar: 'Cancelou evento da agenda',
  trocar_senha: 'Cadastrou/trocou a própria senha',
  criar_usuario: 'Criou usuário',
  editar_usuario: 'Editou usuário',
  importar_nfe: 'Importou NF-e',
  importar_cte: 'Importou CT-e',
  criar_registro: 'Lançou registro',
  editar_registro: 'Editou registro',
  excluir_registro: 'Excluiu registro',
  criar_transportadora: 'Cadastrou transportadora',
  editar_transportadora: 'Editou transportadora',
  editar_empresa: 'Editou dados da empresa',
  criar_tabela_preco: 'Criou tabela de preço',
  editar_tabela_preco: 'Editou tabela de preço',
  editar_backup_config: 'Configurou backup automático',
  backup_manual: 'Executou backup manual',
  enviar_aviso: 'Enviou aviso aos usuários',
  encerrar_aviso: 'Encerrou aviso',
  importar_erp: 'Importou planilha do ERP',
  editar_importacao_erp_config: 'Configurou importação automática do ERP',
  editar_seguranca_config: 'Configurou segurança (inatividade)',
  aprovar_frete: 'Aprovou frete p/ pagamento',
  rejeitar_frete: 'Rejeitou frete',
  importar_evento: 'Anotou evento (Carta de Correção/Cancelamento)',
  registrar_glosa: 'Registrou glosa',
  editar_email_config: 'Configurou envio de email',
  enviar_espelho_email: 'Enviou espelho de cálculo por email',
  editar_auditoria_config: 'Configurou margem de tolerância',
  recalcular_tudo: 'Recalculou o Valor Frete Tabelado em massa',
};

function formatoDataHora(d) {
  if (!d) return '—';
  const data = new Date(d);
  if (isNaN(data.getTime())) return d;
  return data.toLocaleString('pt-BR');
}

function renderizarLinhasAuditoria(logs) {
  const corpo = document.querySelector('#tabelaAuditoria tbody');
  corpo.innerHTML = logs.map((l) => `
    <tr>
      <td>${formatoDataHora(l.criado_em)}</td>
      <td>${l.usuario_nome || '—'}</td>
      <td>${ROTULOS_ACAO[l.acao] || l.acao}</td>
      <td>${l.detalhes || '—'}</td>
    </tr>
  `).join('') || `<tr><td colspan="4" style="color:var(--texto-fraco);">Nenhum log registrado ainda.</td></tr>`;
}

async function carregarAuditoria() {
  try {
    const resposta = await apiFetch('/api/auditoria');
    if (!resposta.ok) return;
    renderizarLinhasAuditoria(await resposta.json());
    carregarDiasArquivados();
  } catch (err) {
    console.error(err);
  }
}

document.getElementById('btnAtualizarAuditoria').addEventListener('click', carregarAuditoria);

// Lista os dias já arquivados (dropdown), e mostra o dia escolhido na mesma
// tabela — sem misturar com o log de hoje.
async function carregarDiasArquivados() {
  try {
    const resposta = await apiFetch('/api/auditoria/arquivados');
    if (!resposta.ok) return;
    const dias = await resposta.json();
    const seletor = document.getElementById('seletorDiaArquivado');
    const valorAtual = seletor.value;
    seletor.innerHTML = '<option value="">Ver um dia arquivado...</option>'
      + dias.map((d) => `<option value="${d}">${formatoData(d)}</option>`).join('');
    seletor.value = valorAtual;
  } catch (err) {
    console.error(err);
  }
}

document.getElementById('seletorDiaArquivado').addEventListener('change', async (e) => {
  const dia = e.target.value;
  if (!dia) { carregarAuditoria(); return; }
  try {
    const resposta = await apiFetch(`/api/auditoria/arquivados/${dia}`);
    const dados = await resposta.json();
    if (!resposta.ok) { mostrarAlerta(dados.erro || 'Erro ao carregar esse dia.'); return; }
    renderizarLinhasAuditoria(dados);
  } catch (err) {
    mostrarAlerta('Falha de conexão com o servidor.');
  }
});

// ---------- Transportadoras ----------
let ultimasTransportadoras = [];
let editandoTransportadoraId = null;

const painelFormTransportadora = document.getElementById('painelFormTransportadora');
const btnExcluirTransportadora = document.getElementById('btnExcluirTransportadora');

painelFormTransportadora.addEventListener('click', (e) => {
  if (e.target === painelFormTransportadora) painelFormTransportadora.classList.add('oculto');
});

const CAMPOS_TRANSPORTADORA = [
  ['tRazaoSocial', 'razao_social'], ['tNomeFantasia', 'nome_fantasia'], ['tCnpj', 'cnpj'], ['tIe', 'ie'],
  ['tTelefone', 'telefone'], ['tEmail', 'email'], ['tEndereco', 'endereco'],
  ['tBairro', 'bairro'], ['tMunicipio', 'municipio'], ['tUf', 'uf'],
  ['tCep', 'cep'], ['tBanco', 'banco'], ['tAgencia', 'agencia'],
  ['tConta', 'conta'], ['tTipoConta', 'tipo_conta'], ['tChavePix', 'chave_pix'],
  ['tUrlRastreamento', 'url_rastreamento'], ['tObservacoes', 'observacoes'],
  ['tPortalChave', 'portal_chave'], ['tPortalEmpresa', 'portal_empresa'], ['tPortalUsuario', 'portal_usuario'],
];
function atualizarCamposPortal() {
  document.getElementById('tPortalCampos').classList.toggle('oculto', !document.getElementById('tPortalTipo').value);
}
document.getElementById('tPortalTipo')?.addEventListener('change', atualizarCamposPortal);

function abrirFormularioTransportadora(transportadora = null) {
  editandoTransportadoraId = transportadora ? transportadora.id : null;
  document.getElementById('tituloFormTransportadora').textContent = transportadora ? 'Editar transportadora' : 'Nova transportadora';
  btnExcluirTransportadora.classList.toggle('oculto', !transportadora);
  document.getElementById('erroFormTransportadora').classList.remove('visivel');
  document.getElementById('statusBuscaCnpj').innerHTML = transportadora?.cadastro_erro && !transportadora?.municipio
    ? `<span style="color:#e8890c;">⚠ Última tentativa de completar pelo CNPJ falhou: ${cfEsc(transportadora.cadastro_erro)}</span>` : '';
  document.getElementById('btnCompletarCnpj').classList.toggle('oculto', !transportadora);
  document.getElementById('btnSalvarTransportadora').disabled = false;

  CAMPOS_TRANSPORTADORA.forEach(([elId, campo]) => {
    const valor = transportadora ? (transportadora[campo] || '') : '';
    document.getElementById(elId).value = elId === 'tCnpj' ? formatarCnpjExibicao(valor) : valor;
  });
  document.getElementById('tRastreamentoSsw').checked = !!transportadora?.rastreamento_ssw;
  document.getElementById('tPortalTipo').value = transportadora?.portal_tipo || '';
  document.getElementById('tPortalSenha').value = '';
  document.getElementById('tPortalSenhaInfo').textContent = transportadora?.portal_tem_senha ? '✓ Senha cadastrada (deixe em branco para manter).' : '';
  atualizarCamposPortal();
  painelFormTransportadora.classList.remove('oculto');
}

document.getElementById('btnNovaTransportadora').addEventListener('click', () => abrirFormularioTransportadora());
document.getElementById('btnTestarPortal')?.addEventListener('click', async (e) => {
  if (!editandoTransportadoraId) { mostrarAlerta('Salve a transportadora antes de testar a conexão.', { tipo: 'aviso' }); return; }
  const botao = e.currentTarget;
  botao.disabled = true; botao.textContent = 'Testando…';
  try {
    const resposta = await apiFetch(`/api/transportadoras/${editandoTransportadoraId}/testar-portal`, { method: 'POST' });
    const r = await resposta.json();
    mostrarAlerta(r.mensagem || r.erro || 'Sem resposta.', { tipo: r.ok ? 'sucesso' : 'aviso', titulo: r.ok ? 'Conectado' : 'Não conectou' });
  } catch (err) {
    mostrarAlerta('Falha de conexão com o servidor.');
  } finally {
    botao.disabled = false; botao.textContent = '🔌 Testar conexão';
  }
});

document.getElementById('btnDescobrirSsw')?.addEventListener('click', async (e) => {
  const botao = e.currentTarget;
  const ok = await confirmar('O sistema vai consultar na SSW uma nota recente de cada transportadora (leva alguns segundos por transportadora) e ligar o rastreamento automático nas que usam SSW.', { tipo: 'info', titulo: 'Descobrir quais usam SSW?', textoOk: 'Consultar' });
  if (!ok) return;
  botao.disabled = true; botao.textContent = 'Consultando a SSW…';
  try {
    const resposta = await apiFetch('/api/transportadoras/descobrir-ssw', { method: 'POST' });
    const r = await resposta.json();
    if (!resposta.ok) { mostrarAlerta(r.erro || 'Não foi possível consultar a SSW.'); return; }
    const partes = [];
    partes.push(r.usam.length ? `Usam SSW (rastreamento ligado): ${r.usam.join(', ')}.` : 'Nenhuma transportadora nova usando SSW.');
    if (r.naoUsam.length) partes.push(`Não usam: ${r.naoUsam.join(', ')}.`);
    if (r.semNota.length) partes.push(`Sem nota recente para testar: ${r.semNota.length}.`);
    if (r.erros.length) partes.push(`Não deu pra consultar: ${r.erros.join(', ')}.`);
    mostrarAlerta(partes.join(' '), { tipo: r.usam.length ? 'sucesso' : 'info', titulo: 'Resultado' });
    if (typeof carregarTransportadoras === 'function') carregarTransportadoras();
  } catch (err) {
    mostrarAlerta('Falha de conexão com o servidor.');
  } finally {
    botao.disabled = false; botao.textContent = '🔍 Descobrir quais usam SSW';
  }
});
document.getElementById('btnCancelarTransportadora').addEventListener('click', () => painelFormTransportadora.classList.add('oculto'));

// ---------- CNPJ: máscara automática + busca de dados (BrasilAPI) ----------
function formatarCnpjExibicao(valor) {
  const d = (valor || '').replace(/\D/g, '').slice(0, 14);
  let partes = [];
  if (d.length > 0) partes.push(d.slice(0, 2));
  if (d.length > 2) partes.push(d.slice(2, 5));
  if (d.length > 5) partes.push(d.slice(5, 8));
  let resultado = partes.join('.');
  if (d.length > 8) resultado += `/${d.slice(8, 12)}`;
  if (d.length > 12) resultado += `-${d.slice(12, 14)}`;
  return resultado;
}

document.getElementById('tCnpj').addEventListener('input', async (e) => {
  e.target.value = formatarCnpjExibicao(e.target.value);
  const digitos = e.target.value.replace(/\D/g, '');
  const statusEl = document.getElementById('statusBuscaCnpj');
  const btnSalvar = document.getElementById('btnSalvarTransportadora');
  btnSalvar.disabled = false;

  if (digitos.length !== 14) {
    statusEl.textContent = '';
    return;
  }

  // Primeiro confere se esse CNPJ já está cadastrado em outra transportadora.
  try {
    const params = new URLSearchParams({ cnpj: digitos });
    if (editandoTransportadoraId) params.set('excluir_id', editandoTransportadoraId);
    const respDuplicidade = await apiFetch(`/api/transportadoras/verificar-cnpj?${params.toString()}`);
    const dadosDuplicidade = await respDuplicidade.json();
    if (dadosDuplicidade.existe) {
      statusEl.innerHTML = `<span style="color:var(--vermelho);">⚠ Já existe uma transportadora cadastrada com esse CNPJ: "${dadosDuplicidade.transportadora.razao_social}".</span>`;
      btnSalvar.disabled = true;
      return;
    }
  } catch (err) { /* se a checagem falhar, segue o fluxo normal */ }

  statusEl.textContent = 'Buscando dados desse CNPJ...';
  try {
    const resposta = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${digitos}`);
    if (!resposta.ok) {
      statusEl.textContent = 'CNPJ não encontrado na Receita Federal — confira os dados digitados ou preencha manualmente.';
      return;
    }
    const dados = await resposta.json();

    document.getElementById('tRazaoSocial').value = dados.razao_social || document.getElementById('tRazaoSocial').value;
    if (dados.nome_fantasia) document.getElementById('tNomeFantasia').value = dados.nome_fantasia;
    document.getElementById('tEndereco').value = [dados.logradouro, dados.numero].filter(Boolean).join(', ') || document.getElementById('tEndereco').value;
    document.getElementById('tBairro').value = dados.bairro || document.getElementById('tBairro').value;
    document.getElementById('tMunicipio').value = dados.municipio || document.getElementById('tMunicipio').value;
    document.getElementById('tUf').value = dados.uf || document.getElementById('tUf').value;
    document.getElementById('tCep').value = dados.cep || document.getElementById('tCep').value;
    if (dados.ddd_telefone_1) document.getElementById('tTelefone').value = dados.ddd_telefone_1;

    statusEl.innerHTML = '<span style="color:var(--verde);">✓ Dados preenchidos automaticamente</span> a partir do CNPJ.';
  } catch (err) {
    statusEl.textContent = 'Não consegui buscar os dados (precisa de internet). Preencha manualmente.';
  }
});

document.getElementById('btnSalvarTransportadora').addEventListener('click', async () => {
  const erroEl = document.getElementById('erroFormTransportadora');
  erroEl.classList.remove('visivel');

  const corpo = {};
  CAMPOS_TRANSPORTADORA.forEach(([elId, campo]) => {
    let valor = document.getElementById(elId).value.trim();
    if (elId === 'tCnpj') valor = valor.replace(/\D/g, '');
    if (valor) corpo[campo] = valor;
  });
  corpo.rastreamento_ssw = document.getElementById('tRastreamentoSsw').checked;
  corpo.portal_tipo = document.getElementById('tPortalTipo').value;          // vazio = nenhum
  const senhaPortal = document.getElementById('tPortalSenha').value;
  if (senhaPortal) corpo.portal_senha = senhaPortal;

  if (!corpo.razao_social) {
    erroEl.textContent = 'Informe ao menos a razão social.';
    erroEl.classList.add('visivel');
    return;
  }

  try {
    const resposta = await apiFetch(
      editandoTransportadoraId ? `/api/transportadoras/${editandoTransportadoraId}` : '/api/transportadoras',
      {
        method: editandoTransportadoraId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corpo),
      }
    );
    const dados = await resposta.json();
    if (!resposta.ok) {
      erroEl.textContent = dados.erro || 'Erro ao salvar transportadora.';
      erroEl.classList.add('visivel');
      return;
    }
    painelFormTransportadora.classList.add('oculto');
    carregarTransportadoras();
  } catch (err) {
    erroEl.textContent = 'Falha de conexão com o servidor.';
    erroEl.classList.add('visivel');
  }
});

btnExcluirTransportadora.addEventListener('click', async () => {
  if (!editandoTransportadoraId) return;
  if (!(await confirmarExclusao('Tem certeza que deseja excluir essa transportadora?'))) return;
  try {
    await apiFetch(`/api/transportadoras/${editandoTransportadoraId}`, { method: 'DELETE' });
    painelFormTransportadora.classList.add('oculto');
    carregarTransportadoras();
  } catch (err) {
    mostrarAlerta('Falha de conexão com o servidor.');
  }
});

async function carregarTransportadoras() {
  try {
    const resposta = await apiFetch('/api/transportadoras');
    if (!resposta.ok) return;
    ultimasTransportadoras = await resposta.json();
    renderizarListaTransportadoras();
  } catch (err) {
    console.error(err);
  }
}

// Desenha a lista com o que já foi carregado (filtro por tipo + busca).
function renderizarListaTransportadoras() {
  try {
    const corpo = document.querySelector('#tabelaTransportadoras tbody');
    const tipo = document.getElementById('filtroTipoTransportadora')?.value || '';
    // Busca por nome, CNPJ (com ou sem pontuação, inclusive os CNPJs alternativos) ou cidade.
    const termo = (document.getElementById('buscaTransportadoras')?.value || '').trim();
    const semAcento = (v) => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
    const digitos = termo.replace(/\D/g, '');
    const bate = (t) => {
      if (!termo) return true;
      if (digitos.length >= 3 && /^[\d.\/\-\s]+$/.test(termo)) {
        return [t.cnpj, t.cnpj_alternativos].some((c) => String(c || '').replace(/[^\d,]/g, '').includes(digitos));
      }
      const tt = semAcento(termo);
      return [t.razao_social, t.nome_fantasia, t.municipio, t.uf].some((v) => semAcento(v).includes(tt));
    };
    const lista = ultimasTransportadoras.filter((t) => (!tipo || (tipo === 'redespacho' ? t.eh_redespacho : !t.eh_redespacho)) && bate(t));
    corpo.innerHTML = lista.map((t) => `
      <tr>
        <td><a class="link-registro" onclick='abrirFormularioTransportadora(${JSON.stringify(t).replace(/'/g, "&apos;")})'>${t.razao_social}</a>${t.eh_redespacho ? ' <span class="cte-selo" title="Cadastrada sozinha pelo CNPJ do redespacho informado numa NF-e">🔀 Redespacho</span>' : ''}${t.nome_fantasia ? `<br><small style="color:var(--texto-fraco);">${cfEsc(t.nome_fantasia)}</small>` : ''}</td>
        <td style="white-space:nowrap;">${t.cnpj ? formatarCnpj(t.cnpj) : '—'}</td>
        <td>${t.ie || '—'}</td>
        <td>${t.municipio ? `${t.municipio}/${t.uf || ''}` : '—'}</td>
        <td style="white-space:nowrap;">${t.telefone ? formatarTelefone(t.telefone) : '—'}</td>
        <td>${t.portal_tipo ? '<span style="color:var(--verde);">✓ Portal próprio</span>' : ''}${t.rastreamento_ssw ? '<span style="color:var(--verde);">✓ SSW automático</span>' : (t.url_rastreamento ? '<span style="color:var(--verde);">✓ Configurado</span>' : '<span style="color:var(--texto-fraco);">Não configurado</span>')}</td>
      </tr>
    `).join('') || `<tr><td colspan="6" style="color:var(--texto-fraco);">Nenhuma transportadora cadastrada ainda — elas aparecem aqui automaticamente ao importar um CT-e.</td></tr>`;

    // Popula os seletores de transportadora usados nas Tabelas de Preço.
    const seletorFiltro = document.getElementById('filtroTransportadoraTabela');
    if (seletorFiltro) {
      const opcoes = ultimasTransportadoras.map((t) => `<option value="${t.id}">${t.razao_social}</option>`).join('');
      const escolhida = seletorFiltro.value;   // mantém a escolha da tela de Tabelas de Preço
      seletorFiltro.innerHTML = `<option value="">Todas as transportadoras</option>${opcoes}`;
      seletorFiltro.value = escolhida;
    }
    popularSeletorTransportadoraModal();
  } catch (err) {
    console.error(err);
  }
}

// ---------- Empresa ----------
const CAMPOS_EMPRESA = [
  ['eRazaoSocial', 'razao_social'], ['eNomeFantasia', 'nome_fantasia'], ['eCnpj', 'cnpj'],
  ['eIe', 'ie'], ['eTelefone', 'telefone'], ['eEmail', 'email'], ['eEndereco', 'endereco'],
  ['eBairro', 'bairro'], ['eMunicipio', 'municipio'], ['eUf', 'uf'], ['eCep', 'cep'],
];

async function carregarEmpresa() {
  try {
    const resposta = await apiFetch('/api/empresa');
    if (!resposta.ok) return;
    const empresa = await resposta.json();
    CAMPOS_EMPRESA.forEach(([elId, campo]) => {
      document.getElementById(elId).value = (empresa && empresa[campo]) || '';
    });
    logoEmpresa = empresa?.logo || null;
    mostrarPreviaLogo();
  } catch (err) {
    console.error(err);
  }
}

// ---------- Logo da empresa (cabeçalho dos relatórios impressos) ----------
let logoEmpresa = null;
// Carrega a logo uma vez ao entrar (todos os relatórios impressos usam).
(async () => { try { const r = await apiFetch('/api/empresa'); if (r.ok) logoEmpresa = ((await r.json()) || {}).logo || null; } catch (e) { /* sem logo */ } })();
// <img> da logo para os documentos impressos ('' quando não há logo).
function logoImpressao(alturaMax = 56) {
  return logoEmpresa && /^data:image\/(png|jpeg|webp);base64,/.test(logoEmpresa)
    ? `<img src="${logoEmpresa}" alt="Logo" style="max-height:${alturaMax}px; max-width:260px; object-fit:contain; display:block;" />` : '';
}
function mostrarPreviaLogo() {
  const caixa = document.getElementById('eLogoPrevia');
  if (!caixa) return;
  caixa.innerHTML = logoImpressao(80) || 'sem logo';
  document.getElementById('btnRemoverLogo')?.classList.toggle('oculto', !logoEmpresa);
  atualizarCabecalhoImpressaoTela();
}
document.getElementById('btnEscolherLogo')?.addEventListener('click', () => document.getElementById('inputLogoEmpresa').click());
document.getElementById('inputLogoEmpresa')?.addEventListener('change', async (e) => {
  const arquivo = e.target.files[0];
  e.target.value = '';
  if (!arquivo) return;
  const fd = new FormData(); fd.append('logo', arquivo);
  const r = await apiFetch('/api/empresa/logo', { method: 'POST', body: fd });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) { mostrarAlerta(d.erro || 'Não consegui salvar a logo.'); return; }
  logoEmpresa = d.logo; mostrarPreviaLogo();
  mostrarAlerta('Logo salva — já aparece nos relatórios impressos.', { tipo: 'sucesso' });
});
document.getElementById('btnRemoverLogo')?.addEventListener('click', async () => {
  const r = await apiFetch('/api/empresa/logo', { method: 'DELETE' });
  if (!r.ok) { mostrarAlerta('Não consegui remover a logo.'); return; }
  logoEmpresa = null; mostrarPreviaLogo();
});
// Telas impressas direto do navegador (Relatórios, Auditoria): cabeçalho com a
// logo que só aparece na impressão.
function atualizarCabecalhoImpressaoTela() {
  let cab = document.getElementById('cabecalhoImpressao');
  if (!cab) {
    cab = document.createElement('div');
    cab.id = 'cabecalhoImpressao';
    document.querySelector('main')?.prepend(cab);
  }
  cab.innerHTML = logoEmpresa ? `${logoImpressao(50)}<div class="cab-imp-data">Impresso em ${new Date().toLocaleString('pt-BR')}</div>` : '';
}
window.addEventListener('beforeprint', atualizarCabecalhoImpressaoTela);

document.getElementById('btnSalvarEmpresa').addEventListener('click', async () => {
  const erroEl = document.getElementById('erroFormEmpresa');
  const okEl = document.getElementById('okFormEmpresa');
  erroEl.classList.remove('visivel');
  okEl.style.display = 'none';

  const corpo = {};
  CAMPOS_EMPRESA.forEach(([elId, campo]) => { corpo[campo] = document.getElementById(elId).value.trim(); });

  try {
    const resposta = await apiFetch('/api/empresa', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
    });
    const dados = await resposta.json();
    if (!resposta.ok) {
      erroEl.textContent = dados.erro || 'Erro ao salvar os dados da empresa.';
      erroEl.classList.add('visivel');
      return;
    }
    okEl.style.display = 'block';
    setTimeout(() => { okEl.style.display = 'none'; }, 3000);
  } catch (err) {
    erroEl.textContent = 'Falha de conexão com o servidor.';
    erroEl.classList.add('visivel');
  }
});

// ---------- Tabelas de Preço ----------
let editandoTabelaPrecoId = null;
const painelFormTabelaPreco = document.getElementById('painelFormTabelaPreco');
const corpoFaixas = document.getElementById('corpoFaixas');
const btnExcluirTabelaPreco = document.getElementById('btnExcluirTabelaPreco');

painelFormTabelaPreco.addEventListener('click', (e) => {
  if (e.target === painelFormTabelaPreco) painelFormTabelaPreco.classList.add('oculto');
});

// ---------- Campos de moeda com máscara (tipo calculadora: digita "1050" vira "10,50") ----------
function formatarMoedaExibicao(valor) {
  if (valor === null || valor === undefined || valor === '') return '';
  const num = Number(valor);
  if (isNaN(num)) return '';
  return num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function paraNumeroMoeda(texto) {
  if (!texto) return '';
  const limpo = texto.replace(/\./g, '').replace(',', '.');
  return limpo === '' ? '' : limpo;
}

document.addEventListener('input', (e) => {
  if (!e.target.classList || !e.target.classList.contains('campo-moeda')) return;
  let digitos = e.target.value.replace(/\D/g, '');
  if (digitos === '') { e.target.value = ''; return; }
  digitos = digitos.replace(/^0+(?=\d)/, ''); // tira zeros à esquerda
  const comCentavos = (parseInt(digitos, 10) / 100).toFixed(2);
  const [inteiro, centavos] = comCentavos.split('.');
  const inteiroComPontos = inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  e.target.value = `${inteiroComPontos},${centavos}`;
});

function linhaFaixa(faixa = {}) {
  const estiloInput = 'width:100%; padding:7px; border-radius:8px; border:1px solid var(--borda); background:var(--bg-elevado); color:var(--texto);';
  const modo = faixa.modo_calculo || 'volume';
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td style="padding:4px;"><input type="text" class="fx-origem" value="${faixa.origem ?? ''}" placeholder="Ex: RIO I" style="${estiloInput}" /></td>
    <td style="padding:4px;"><input type="text" class="fx-destino" value="${faixa.destino ?? ''}" placeholder="Ex: CAPITAL - SP" style="${estiloInput}" /></td>
    <td style="padding:4px;"><input type="text" class="fx-regiao" value="${faixa.regiao ?? ''}" placeholder="Ex: Capital, Interior 1, Litorânea" style="${estiloInput}" /></td>
    <td style="padding:4px;"><input type="text" class="fx-tipo" value="${faixa.tipo_carga ?? ''}" placeholder="Ex: CAIXA / TAPETE" style="${estiloInput}" /></td>
    <td style="padding:4px; display:flex; gap:4px;">
      <input type="text" class="fx-cidades" value="${faixa.cidades ?? ''}" placeholder="Ex: São Paulo, Guarulhos, Osasco" style="${estiloInput}" />
      <button type="button" style="flex-shrink:0; padding:0 8px; border-radius:8px; border:1px solid var(--borda); background:var(--bg-elevado); color:var(--texto); cursor:pointer;" title="Selecionar cidades por checkbox" onclick="abrirSeletorCidades(this)">🗺️</button>
    </td>
    <td style="padding:4px;">
      <select class="fx-modo" style="${estiloInput}" onchange="alternarModoCalculoTrecho(this)">
        <option value="volume" ${modo === 'volume' ? 'selected' : ''}>Por Volume</option>
        <option value="peso" ${modo === 'peso' ? 'selected' : ''}>Por Peso</option>
      </select>
    </td>
    <td style="padding:4px;" class="col-volume-min"><input type="number" step="1" class="fx-vol-min" value="${faixa.volume_minimo ?? ''}" placeholder="Ex: 10" style="${estiloInput}" /></td>
    <td style="padding:4px;" class="col-peso-min"><input type="number" step="1" class="fx-peso-min" value="${faixa.peso_de ?? ''}" placeholder="Ex: 1000" style="${estiloInput}" /></td>
    <td style="padding:4px;"><input type="text" inputmode="numeric" class="fx-valor campo-moeda" placeholder="0,00" value="${formatarMoedaExibicao(faixa.valor_por_kg)}" style="${estiloInput}" title="Usado quando o Modo for 'Por Volume'" /></td>
    <td style="padding:4px;" class="col-kg-excedente"><input type="text" inputmode="numeric" class="fx-kg-excedente campo-moeda" placeholder="0,00" value="${formatarMoedaExibicao(faixa.valor_kg_excedente)}" style="${estiloInput}" title="R$ por kg excedente (usado quando o Modo for 'Por Peso')" /></td>
    <td style="padding:4px;"><input type="text" inputmode="numeric" class="fx-minimo campo-moeda" placeholder="0,00" value="${formatarMoedaExibicao(faixa.frete_minimo)}" style="${estiloInput}" title="Frete Mínimo (usado nos dois modos)" /></td>
    <td style="padding:4px;"><input type="number" step="1" class="fx-prazo" value="${faixa.prazo_dias ?? ''}" placeholder="dias" style="${estiloInput}" /></td>
    <td style="padding:4px; text-align:center;"><span style="cursor:pointer; color:var(--vermelho);" onclick="this.closest('tr').remove()">✕</span></td>
  `;
  alternarModoCalculoTrecho(tr.querySelector('.fx-modo'));
  return tr;
}

// Mostra só os campos relevantes pro modo escolhido (Volume x Peso), pra não
// confundir com campos que não vão ser usados naquele trecho.
function alternarModoCalculoTrecho(select) {
  const tr = select.closest('tr');
  const ehPeso = select.value === 'peso';
  // Importante: NUNCA usar display:none aqui — isso tira a célula do layout
  // da tabela e desalinha essa linha com o cabeçalho (que sempre mostra
  // todas as colunas). Só apagamos visualmente (opacidade) o que não se
  // aplica àquele modo, mas o campo continua no lugar certo.
  const apagar = (seletor, apagado) => {
    const el = tr.querySelector(seletor);
    if (!el) return;
    const celula = el.closest('td');
    celula.style.opacity = apagado ? '0.3' : '1';
    el.disabled = apagado;
  };
  apagar('.fx-vol-min', ehPeso);
  apagar('.fx-peso-min', !ehPeso);
  apagar('.fx-kg-excedente', !ehPeso);
  apagar('.fx-valor', ehPeso);
}

document.getElementById('btnAdicionarFaixa').addEventListener('click', () => {
  corpoFaixas.appendChild(linhaFaixa());
});

function lerFaixasDoFormulario() {
  return Array.from(corpoFaixas.querySelectorAll('tr')).map((tr) => ({
    origem: tr.querySelector('.fx-origem').value,
    destino: tr.querySelector('.fx-destino').value,
    regiao: tr.querySelector('.fx-regiao').value,
    tipo_carga: tr.querySelector('.fx-tipo').value,
    cidades: tr.querySelector('.fx-cidades').value,
    modo_calculo: tr.querySelector('.fx-modo').value,
    valor_por_kg: paraNumeroMoeda(tr.querySelector('.fx-valor').value),
    volume_minimo: tr.querySelector('.fx-vol-min').value,
    peso_de: tr.querySelector('.fx-peso-min').value,
    valor_kg_excedente: paraNumeroMoeda(tr.querySelector('.fx-kg-excedente').value),
    frete_minimo: paraNumeroMoeda(tr.querySelector('.fx-minimo').value),
    prazo_dias: tr.querySelector('.fx-prazo').value,
  })).filter((f) => f.valor_por_kg !== '' || f.valor_kg_excedente !== '' || f.frete_minimo !== '');
}

const CAMPOS_TABELA_PRECO = [
  ['pTransportadoraId', 'transportadora_id'], ['pNome', 'nome'], ['pUfDestino', 'uf_destino'],
  ['pCidadeDestino', 'cidade_destino'], ['pTipoFrete', 'tipo_frete'], ['pPrazoDias', 'prazo_dias'],
  ['pAdValorem', 'ad_valorem_percentual'],
  ['pGris', 'gris_percentual'], ['pGrisMinimo', 'gris_minimo'], ['pPedagio', 'pedagio'],
  ['pTde', 'tde'], ['pTda', 'tda'], ['pTrt', 'trt'], ['pValorPallet', 'valor_pallet'],
  ['pDespachoValor', 'despacho_valor'], ['pCubagemKgM3', 'cubagem_kg_m3'],
  ['pDevolucaoPercentual', 'devolucao_percentual'], ['pReentregaPercentual', 'reentrega_percentual'],
  ['pSeguradora', 'seguradora'], ['pCondicaoFaturamento', 'condicao_faturamento'],
  ['pIndiceCorrecao', 'indice_correcao'], ['pValidadeMeses', 'validade_meses'],
  ['pObservacoes', 'observacoes'],
  ['pDescargaValor', 'descarga_valor'], ['pDescargaModo', 'descarga_modo'], ['pDescargaMinimo', 'descarga_minimo'],
  ['pDescargaAplicar', 'descarga_aplicar'], ['pDescargaClientes', 'descarga_clientes'],
  ['pIcmsIncluir', 'icms_incluir'], ['pIcmsAliquota', 'icms_aliquota'], ['pIcmsModo', 'icms_modo'],
  ['pRetornoPercentual', 'retorno_percentual'],
];
// Campos novos sempre vão no salvar (vazio = apagar o valor); os outros só quando preenchidos.
const CAMPOS_TABELA_SEMPRE = ['descarga_valor', 'descarga_modo', 'descarga_minimo', 'descarga_aplicar', 'descarga_clientes', 'icms_incluir', 'icms_aliquota', 'icms_modo', 'retorno_percentual'];

function abrirFormularioTabelaPreco(tabela = null) {
  editandoTabelaPrecoId = tabela ? tabela.id : null;
  document.getElementById('tituloFormTabelaPreco').textContent = tabela ? 'Editar tabela de preço' : 'Nova tabela de preço';
  btnExcluirTabelaPreco.classList.toggle('oculto', !tabela);
  document.getElementById('btnVerHistoricoTabelaPreco').classList.toggle('oculto', !tabela);
  document.getElementById('btnImportarTrechosExcel').classList.toggle('oculto', !tabela);
  document.getElementById('erroFormTabelaPreco').classList.remove('visivel');
  document.getElementById('buscaTransportadoraTabela').value = '';
  popularSeletorTransportadoraModal();

  CAMPOS_TABELA_PRECO.forEach(([elId, campo]) => {
    const el = document.getElementById(elId);
    const padrao = { descarga_modo: 'fixo', descarga_aplicar: 'lista', icms_incluir: 'false', icms_modo: 'dentro' }[campo] ?? '';
    const valorBruto = tabela ? (tabela[campo] ?? padrao) : padrao;
    el.value = el.classList.contains('campo-moeda') ? formatarMoedaExibicao(valorBruto) : String(valorBruto);
  });
  atualizarUfTransportadoraSelecionada();
  document.getElementById('pAtiva').checked = tabela ? !!tabela.ativa : true;

  corpoFaixas.innerHTML = '';
  if (tabela && tabela.faixas && tabela.faixas.length) {
    tabela.faixas.forEach((f) => corpoFaixas.appendChild(linhaFaixa(f)));
  } else {
    corpoFaixas.appendChild(linhaFaixa());
  }

  painelFormTabelaPreco.classList.remove('oculto');
}

document.getElementById('btnNovaTabelaPreco').addEventListener('click', () => {
  if (ultimasTransportadoras.length === 0) {
    mostrarAlerta('Cadastre uma transportadora primeiro (na sub-aba Transportadoras).');
    return;
  }
  abrirFormularioTabelaPreco();
});
document.getElementById('btnCancelarTabelaPreco').addEventListener('click', () => painelFormTabelaPreco.classList.add('oculto'));

document.getElementById('btnSalvarTabelaPreco').addEventListener('click', async () => {
  const erroEl = document.getElementById('erroFormTabelaPreco');
  erroEl.classList.remove('visivel');

  const corpo = { ativa: document.getElementById('pAtiva').checked, faixas: lerFaixasDoFormulario() };
  CAMPOS_TABELA_PRECO.forEach(([elId, campo]) => {
    const el = document.getElementById(elId);
    let valor = el.value;
    if (valor !== '' && el.classList.contains('campo-moeda')) valor = paraNumeroMoeda(valor);
    if (valor !== '' || CAMPOS_TABELA_SEMPRE.includes(campo)) corpo[campo] = valor;
  });

  if (!corpo.transportadora_id || !corpo.nome) {
    erroEl.textContent = 'Selecione a transportadora e dê um nome à tabela.';
    erroEl.classList.add('visivel');
    return;
  }

  try {
    const resposta = await apiFetch(
      editandoTabelaPrecoId ? `/api/tabelas-preco/${editandoTabelaPrecoId}` : '/api/tabelas-preco',
      {
        method: editandoTabelaPrecoId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corpo),
      }
    );
    const dados = await resposta.json();
    if (!resposta.ok) {
      erroEl.textContent = dados.erro || 'Erro ao salvar a tabela de preço.';
      erroEl.classList.add('visivel');
      return;
    }
    painelFormTabelaPreco.classList.add('oculto');
    carregarTabelasPreco();
  } catch (err) {
    erroEl.textContent = 'Falha de conexão com o servidor.';
    erroEl.classList.add('visivel');
  }
});

btnExcluirTabelaPreco.addEventListener('click', async () => {
  if (!editandoTabelaPrecoId) return;
  if (!(await confirmarExclusao('Tem certeza que deseja excluir essa tabela de preço?'))) return;
  try {
    await apiFetch(`/api/tabelas-preco/${editandoTabelaPrecoId}`, { method: 'DELETE' });
    painelFormTabelaPreco.classList.add('oculto');
    carregarTabelasPreco();
  } catch (err) {
    mostrarAlerta('Falha de conexão com o servidor.');
  }
});

// Popula (ou filtra) o seletor de transportadora da tela de Tabela de Preço,
// buscando por nome ou CNPJ.
function popularSeletorTransportadoraModal(filtro = '') {
  const seletorModal = document.getElementById('pTransportadoraId');
  if (!seletorModal) return;

  const filtroBusca = filtro.trim().toLowerCase();
  const filtradas = filtroBusca
    ? ultimasTransportadoras.filter((t) =>
        (t.razao_social || '').toLowerCase().includes(filtroBusca) ||
        (t.cnpj || '').includes(filtroBusca.replace(/\D/g, '')))
    : ultimasTransportadoras;

  const valorAnterior = seletorModal.value;
  seletorModal.innerHTML = filtradas.map((t) => `<option value="${t.id}">${t.razao_social}</option>`).join('')
    || '<option value="">Nenhuma transportadora encontrada</option>';

  // Mantém a seleção anterior se ela ainda estiver na lista filtrada.
  if (filtradas.some((t) => String(t.id) === valorAnterior)) seletorModal.value = valorAnterior;
  atualizarUfTransportadoraSelecionada();
}

function atualizarUfTransportadoraSelecionada() {
  const seletorModal = document.getElementById('pTransportadoraId');
  const transportadora = ultimasTransportadoras.find((t) => String(t.id) === seletorModal.value);
  document.getElementById('pTransportadoraUf').value = transportadora?.uf || '';
}

document.getElementById('buscaTransportadoraTabela').addEventListener('input', (e) => {
  popularSeletorTransportadoraModal(e.target.value);
});
document.getElementById('pTransportadoraId').addEventListener('change', atualizarUfTransportadoraSelecionada);
document.getElementById('filtroTransportadoraTabela').addEventListener('change', carregarTabelasPreco);

async function carregarTabelasPreco() {
  try {
    const transportadoraId = document.getElementById('filtroTransportadoraTabela').value;
    const query = transportadoraId ? `?transportadora_id=${transportadoraId}` : '';
    const resposta = await apiFetch(`/api/tabelas-preco${query}`);
    if (!resposta.ok) return;
    const tabelas = await resposta.json();

    const corpo = document.querySelector('#tabelaTabelasPreco tbody');
    corpo.innerHTML = tabelas.map((t) => `
      <tr>
        <td><a class="link-registro" onclick="abrirTabelaPrecoParaEdicao(${t.id})">${t.nome}</a>
          <a class="link-registro" title="Imprimir / salvar em PDF só esta tabela" style="margin-left:8px; text-decoration:none;" onclick="imprimirTabelasPreco({ tabela_id: ${t.id} })">🖨</a>
          <a class="link-registro" title="Exportar a tabela completa (dados + trechos) em Excel, para usar em outra empresa" style="margin-left:6px; text-decoration:none;" onclick="exportarTabelaCompleta(${t.id})">⬇</a></td>
        <td>${t.transportadora_nome}</td>
        <td>${t.cidade_destino ? `${t.cidade_destino}/${t.uf_destino || ''}` : (t.uf_destino || 'Todos')}</td>
        <td>${formatoMoeda(t.valor_minimo)}</td>
        <td>${t.total_faixas ?? '—'}</td>
        <td>${t.ativa ? '<span class="badge badge-faturado">Ativa</span>' : '<span class="badge badge-cancelado">Inativa</span>'} ${selarVigenciaTabela(t)}</td>
      </tr>
    `).join('') || `<tr><td colspan="6" style="color:var(--texto-fraco);">Nenhuma tabela de preço cadastrada ainda.</td></tr>`;
  } catch (err) {
    console.error(err);
  }
}

// Mostra se a tabela está perto de vencer ou já vencida (Validade em meses,
// contada a partir de quando foi criada).
function selarVigenciaTabela(t) {
  if (!t.validade_meses || !t.criado_em) return '';
  const vencimento = new Date(t.criado_em);
  vencimento.setMonth(vencimento.getMonth() + Number(t.validade_meses));
  const diasRestantes = Math.ceil((vencimento - new Date()) / (1000 * 60 * 60 * 24));
  if (diasRestantes < 0) return `<span class="badge badge-cancelado">⏰ Vencida há ${Math.abs(diasRestantes)}d</span>`;
  if (diasRestantes <= 30) return `<span class="badge badge-pendente">⏰ Vence em ${diasRestantes}d</span>`;
  return '';
}

// Exporta a tabela completa (.xlsx com abas "Tabela" e "Trechos").
async function exportarTabelaCompleta(id) {
  try {
    const resposta = await apiFetch(`/api/tabelas-preco/${id}/exportar`);
    if (!resposta.ok) { const e = await resposta.json().catch(() => ({})); mostrarAlerta(e.erro || 'Não foi possível exportar.'); return; }
    const nome = (resposta.headers.get('Content-Disposition') || '').match(/filename="([^"]+)"/)?.[1] || `tabela_${id}.xlsx`;
    const blob = await resposta.blob();
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = nome;
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 2000);
  } catch (err) {
    mostrarAlerta('Falha de conexão com o servidor.');
  }
}

document.getElementById('btnImportarTabelaCompleta')?.addEventListener('click', () => document.getElementById('inputImportarTabelaCompleta').click());
document.getElementById('inputImportarTabelaCompleta')?.addEventListener('change', async (e) => {
  const arquivo = e.target.files[0];
  e.target.value = '';
  if (!arquivo) return;
  const formData = new FormData();
  formData.append('arquivo', arquivo);
  try {
    const resposta = await apiFetch('/api/tabelas-preco/importar-completa', { method: 'POST', body: formData });
    const r = await resposta.json();
    if (!resposta.ok) { mostrarAlerta(r.erro || 'Não foi possível importar.'); return; }
    mostrarAlerta(`Tabela "${r.nome}" importada com ${r.trechos} trecho(s).${r.transportadora_criada ? ' A transportadora não existia e foi cadastrada — complete os dados dela em Transportadoras.' : ''}${r.erros?.length ? ` ${r.erros.length} trecho(s) com erro: ${r.erros.slice(0, 3).join('; ')}` : ''} Confira a tabela e ajuste as cidades dos trechos se esta empresa atender outras praças.`,
      { tipo: r.erros?.length ? 'aviso' : 'sucesso', titulo: 'Tabela importada' });
    carregarTabelasPreco();
  } catch (err) {
    mostrarAlerta('Falha de conexão com o servidor.');
  }
});

async function abrirTabelaPrecoParaEdicao(id) {
  try {
    const resposta = await apiFetch(`/api/tabelas-preco/${id}`);
    if (!resposta.ok) return;
    const tabela = await resposta.json();
    abrirFormularioTabelaPreco(tabela);
  } catch (err) {
    mostrarAlerta('Falha de conexão com o servidor.');
  }
}

// ---------- Calcular Valor Frete Tabelado (usa as Tabelas de Preço) ----------
let trechosEncontrados = [];

// Mesma normalização do backend: tira acentos e espaços extras, pra "São
// Paulo" e "Sao Paulo" serem tratados como a mesma cidade.
function normalizarCidadeFrontend(texto) {
  return (texto || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .trim().toLowerCase().replace(/\s+/g, ' ');
}

async function buscarTrechosAutomatico() {
  const resultadoEl = document.getElementById('resultadoCalculoFrete');
  const transportadoraCte = document.getElementById('nr_transportadora_cte').value.trim();
  const selecao = document.getElementById('selecaoTrecho');

  if (!transportadoraCte) {
    resultadoEl.textContent = 'Esse registro não tem "Transporte Cte" preenchido (só vem do XML do CT-e) — importe o CT-e primeiro.';
    return;
  }

  try {
    const resposta = await apiFetch(`/api/tabelas-preco/trechos/buscar?transportadora_nome=${encodeURIComponent(transportadoraCte)}`);
    const dados = await resposta.json();
    if (!resposta.ok) {
      resultadoEl.textContent = dados.erro || 'Erro ao buscar trechos.';
      return;
    }
    trechosEncontrados = dados;
    if (dados.length === 0) {
      selecao.innerHTML = '<option value="">Nenhum trecho cadastrado pra essa transportadora</option>';
      resultadoEl.textContent = 'Cadastre uma tabela de preço pra essa transportadora (Transporte Cte) em Cadastros → Tabelas de Preço.';
      return;
    }
    selecao.innerHTML = dados.map((t, i) => `
      <option value="${i}">${t.origem || '?'} → ${t.destino || '?'} | ${t.tipo_carga || 'Geral'} (R$${Number(t.valor_por_kg).toFixed(4)}/volume, mín R$${t.frete_minimo || 0})</option>
    `).join('');

    // Sugestão automática, na mesma ordem de prioridade do cálculo em massa:
    // 1) Redespacho preenchido → Cidade do Redespacho
    // 2) Sem redespacho → procura uma cidade cadastrada mencionada nas Observações
    // 3) Se não achar → Cidade OU Bairro do cliente (algumas transportadoras
    //    organizam a Capital por bairro, não pelo nome da cidade)
    const temRedespacho = (document.getElementById('nr_redespacho').value || '').trim() !== '';
    const cidadeRedespacho = (document.getElementById('nr_cidade_redespacho').value || '').trim();
    const cidadeCliente = (document.getElementById('nr_cidade').value || '').trim();
    const bairroCliente = (document.getElementById('nr_bairro').value || '').trim();
    const observacoesTexto = (document.getElementById('nr_observacoes').value || '');

    let candidatosCidade = [];
    let origemDaCidade = '';

    if (temRedespacho) {
      if (cidadeRedespacho) { candidatosCidade = [cidadeRedespacho]; origemDaCidade = 'cidade do redespacho'; }
    } else {
      const todasCidades = new Set();
      dados.forEach((t) => (t.cidades || '').split(',').map((c) => c.trim()).filter(Boolean).forEach((c) => todasCidades.add(c)));
      const cidadeNasObs = [...todasCidades].find((c) => normalizarCidadeFrontend(observacoesTexto).includes(normalizarCidadeFrontend(c)));
      if (cidadeNasObs) { candidatosCidade = [cidadeNasObs]; origemDaCidade = 'cidade mencionada nas Observações'; }
      else { candidatosCidade = [cidadeCliente, bairroCliente]; origemDaCidade = 'cidade/bairro do cliente'; }
    }
    candidatosCidade = candidatosCidade.filter(Boolean);

    let indiceSugerido = -1;
    let cidadeParaComparar = candidatosCidade[0] || '';
    if (candidatosCidade.length > 0) {
      const alvos = candidatosCidade.map(normalizarCidadeFrontend);
      indiceSugerido = dados.findIndex((t) => {
        const cidadesTrecho = (t.cidades || '').split(',').map((c) => normalizarCidadeFrontend(c));
        return alvos.some((alvo) => cidadesTrecho.includes(alvo));
      });
      // Pra mostrar qual dos candidatos foi o que bateu de verdade.
      if (indiceSugerido >= 0) {
        const cidadesTrecho = (dados[indiceSugerido].cidades || '').split(',').map((c) => normalizarCidadeFrontend(c));
        cidadeParaComparar = candidatosCidade.find((c) => cidadesTrecho.includes(normalizarCidadeFrontend(c))) || cidadeParaComparar;
      }
    }

    if (indiceSugerido >= 0) {
      selecao.value = indiceSugerido;
      resultadoEl.innerHTML = `<span style="color:var(--verde);">✓ Trecho sugerido automaticamente</span> com base na ${origemDaCidade} ("${cidadeParaComparar}"). Confira e clique em "Calcular e preencher".`;
    } else if (temRedespacho && !cidadeRedespacho) {
      resultadoEl.innerHTML = `${dados.length} trecho(s) encontrado(s). Esse registro tem redespacho, mas o campo "Cidade do Redespacho" está vazio — preencha ele pra sugestão automática funcionar. Por enquanto, escolha o trecho manualmente.`;
    } else {
      resultadoEl.textContent = `${dados.length} trecho(s) encontrado(s). Não achei nenhuma cidade (${origemDaCidade || 'cliente'}) batendo com os trechos cadastrados — escolha manualmente.`;
    }
  } catch (err) {
    resultadoEl.textContent = 'Falha de conexão com o servidor.';
  }
}

document.getElementById('btnBuscarTrechos').addEventListener('click', buscarTrechosAutomatico);

// Assim que você mexe no campo "Transporte Cte" (digitando ou colando), já
// carrega sozinho os trechos e tenta sugerir o certo — sem precisar clicar
// no botão "Buscar trechos" separado. Dispara com uma pausa curta enquanto
// digita, e também ao sair do campo (cobre os dois jeitos de editar).
let timeoutBuscaTrechosAuto = null;
document.getElementById('nr_transportadora_cte').addEventListener('input', () => {
  clearTimeout(timeoutBuscaTrechosAuto);
  timeoutBuscaTrechosAuto = setTimeout(() => {
    if (document.getElementById('nr_transportadora_cte').value.trim()) buscarTrechosAutomatico();
  }, 700);
});
document.getElementById('nr_transportadora_cte').addEventListener('blur', () => {
  clearTimeout(timeoutBuscaTrechosAuto);
  if (document.getElementById('nr_transportadora_cte').value.trim()) buscarTrechosAutomatico();
});

document.getElementById('btnCalcularFrete').addEventListener('click', async () => {
  const resultadoEl = document.getElementById('resultadoCalculoFrete');
  const indice = document.getElementById('selecaoTrecho').value;

  if (indice === '' || !trechosEncontrados[indice]) {
    resultadoEl.textContent = 'Busque e escolha um trecho primeiro.';
    return;
  }

  const trecho = trechosEncontrados[indice];
  const qtdVolumes = Number(document.getElementById('nr_qtd_volumes').value) || 0;
  const pesoKg = document.getElementById('nr_peso_kg').value ? Number(document.getElementById('nr_peso_kg').value) : null;
  const cubagemM3 = document.getElementById('nr_cubagem_m3').value ? Number(document.getElementById('nr_cubagem_m3').value) : null;
  const valorFaturado = document.getElementById('nr_valor_faturado').value ? Number(paraNumeroMoeda(document.getElementById('nr_valor_faturado').value)) : null;

  if (trecho.modo_calculo === 'peso' ? (!pesoKg && !cubagemM3) : qtdVolumes <= 0) {
    resultadoEl.textContent = trecho.modo_calculo === 'peso'
      ? 'Preencha "Peso (kg)" ou "Cubagem (m³)" pra poder calcular (esse trecho é por peso).'
      : 'Preencha o campo "Qtd. Volumes" pra poder calcular.';
    return;
  }

  resultadoEl.textContent = 'Calculando...';

  try {
    const resposta = await apiFetch('/api/tabelas-preco/calcular-completo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        trecho_id: trecho.id, qtd_volumes: qtdVolumes, peso_kg: pesoKg,
        cubagem_m3: cubagemM3, valor_faturado: valorFaturado,
      }),
    });
    const dados = await resposta.json();
    if (!resposta.ok) { resultadoEl.innerHTML = `<span style="color:var(--vermelho);">${dados.erro || 'Erro ao calcular.'}</span>`; return; }

    const { freteBase, explicacao, componentes, taxaAplicada } = dados;

    document.getElementById('nr_valor_frete_tabelado').value = formatarMoedaExibicao(freteBase);
    document.getElementById('nr_valor_total_calculado').value = formatarMoedaExibicao(componentes.total);
    document.getElementById('nr_tabela_preco_id_usada').value = trecho.tabela_preco_id || '';
    document.getElementById('nr_prazo_dias_tabela').value = trecho.prazo_dias ?? trecho.tabela_prazo_dias ?? '';
    if (taxaAplicada != null) document.getElementById('nr_tabela_frete').value = formatarMoedaExibicao(taxaAplicada);
    if (trecho.regiao) document.getElementById('nr_interior_capital').value = trecho.regiao;

    resultadoEl.innerHTML = `
      <span style="color:var(--verde);">✓ Calculado:</span> ${explicacao}<br>
      <span style="font-size:11.5px;">
        Frete Base: ${formatoMoeda(freteBase)} + Ad Valorem: ${formatoMoeda(componentes.adValorem)}
        + GRIS: ${formatoMoeda(componentes.gris)} + Pedágio: ${formatoMoeda(componentes.pedagio)}
        + TDE: ${formatoMoeda(componentes.tde)} + TDA: ${formatoMoeda(componentes.tda)}
        + TRT: ${formatoMoeda(componentes.trt)} + Despacho: ${formatoMoeda(componentes.despacho)}
        ${componentes.descarga ? `+ Descarga: ${formatoMoeda(componentes.descarga)}` : ''}
        ${componentes.icms ? `+ ICMS ${componentes.icmsAliquota}% (${componentes.icmsOrigem}, por ${componentes.icmsModo}): ${formatoMoeda(componentes.icms)}` : ''}
        = <strong>Valor Total Calculado: ${formatoMoeda(componentes.total)}</strong>
      </span>`;

    // Guarda um "retrato" de como chegou nesse valor, pra tela de Auditoria de Frete
    // poder mostrar o detalhe depois (não só o resultado final).
    document.getElementById('nr_auditoria_calculo').value = JSON.stringify({
      tabela_nome: trecho.tabela_nome || null,
      transportadora_nome: trecho.transportadora_nome || null,
      origem: trecho.origem || null,
      destino: trecho.destino || null,
      tipo_carga: trecho.tipo_carga || null,
      modo_calculo: trecho.modo_calculo || 'volume',
      valor_por_volume: trecho.valor_por_kg != null ? Number(trecho.valor_por_kg) : null,
      volume_minimo: trecho.volume_minimo != null ? Number(trecho.volume_minimo) : null,
      frete_minimo: trecho.frete_minimo != null ? Number(trecho.frete_minimo) : null,
      qtd_volumes_usada: qtdVolumes,
      explicacao,
      valor_resultado: freteBase,
      componentes,
      valor_total_calculado: componentes.total,
      calculado_em: new Date().toISOString(),
    });
  } catch (err) {
    resultadoEl.innerHTML = '<span style="color:var(--vermelho);">Falha de conexão com o servidor.</span>';
  }
});

// ---------- Manutenção (backup automático) ----------
document.getElementById('bkFrequencia').addEventListener('change', (e) => {
  document.getElementById('campoDiaSemana').classList.toggle('oculto', e.target.value !== 'semanal');
});

function formatoTamanho(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function carregarConfigBackup() {
  try {
    const resposta = await apiFetch('/api/manutencao/configuracao');
    if (!resposta.ok) return;
    const c = await resposta.json();

    document.getElementById('bkAtivo').checked = !!c.ativo;
    document.getElementById('bkFrequencia').value = c.frequencia || 'diario';
    document.getElementById('bkDiaSemana').value = c.dia_semana ?? '0';
    document.getElementById('bkHorario').value = c.horario || '02:00';
    document.getElementById('bkManterUltimos').value = c.manter_ultimos ?? 7;
    document.getElementById('bkCaminhoPgDump').value = c.caminho_pg_dump || '';
    document.getElementById('bkPastaCopia').value = c.pasta_copia || '';
    document.getElementById('campoDiaSemana').classList.toggle('oculto', c.frequencia !== 'semanal');

    const statusEl = document.getElementById('statusUltimoBackup');
    if (c.ultimo_backup_em) {
      const cor = c.ultimo_backup_status === 'sucesso' ? 'var(--verde)' : 'var(--vermelho)';
      statusEl.innerHTML = `Último backup: ${formatoDataHora(c.ultimo_backup_em)} — <span style="color:${cor};">${c.ultimo_backup_mensagem || c.ultimo_backup_status}</span>`;
    } else {
      statusEl.textContent = 'Nenhum backup foi feito ainda.';
    }
  } catch (err) {
    console.error(err);
  }
}

// Mostra uma mensagem verde de sucesso por alguns segundos (reaproveitada nas
// telas de configuração, que antes salvavam sem dar nenhum retorno visual).
function mostrarSucessoTemporario(elemento, texto = '✓ Configuração salva com sucesso.') {
  elemento.textContent = texto;
  elemento.style.color = 'var(--verde)';
  elemento.style.background = 'rgba(52,199,123,0.12)';
  elemento.style.borderColor = 'rgba(52,199,123,0.4)';
  elemento.classList.add('visivel');
  setTimeout(() => {
    elemento.classList.remove('visivel');
    elemento.style.color = '';
    elemento.style.background = '';
    elemento.style.borderColor = '';
  }, 2500);
}

document.getElementById('btnSalvarConfigBackup').addEventListener('click', async () => {
  const erroEl = document.getElementById('erroBackup');
  erroEl.classList.remove('visivel');

  const corpo = {
    ativo: document.getElementById('bkAtivo').checked,
    frequencia: document.getElementById('bkFrequencia').value,
    dia_semana: Number(document.getElementById('bkDiaSemana').value),
    horario: document.getElementById('bkHorario').value || '02:00',
    manter_ultimos: Number(document.getElementById('bkManterUltimos').value) || 7,
    caminho_pg_dump: document.getElementById('bkCaminhoPgDump').value.trim() || null,
    pasta_copia: document.getElementById('bkPastaCopia').value.trim() || null,
  };

  try {
    const resposta = await apiFetch('/api/manutencao/configuracao', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
    });
    const dados = await resposta.json();
    if (!resposta.ok) {
      erroEl.textContent = dados.erro || 'Erro ao salvar.';
      erroEl.classList.add('visivel');
      return;
    }
    carregarConfigBackup();
    mostrarSucessoTemporario(erroEl);
  } catch (err) {
    erroEl.textContent = 'Falha de conexão com o servidor.';
    erroEl.classList.add('visivel');
  }
});

document.getElementById('btnBackupAgora').addEventListener('click', async () => {
  const erroEl = document.getElementById('erroBackup');
  const botao = document.getElementById('btnBackupAgora');
  erroEl.classList.remove('visivel');
  botao.disabled = true;
  botao.textContent = 'Fazendo backup...';

  try {
    const resposta = await apiFetch('/api/manutencao/backup-agora', { method: 'POST' });
    const dados = await resposta.json();
    if (!resposta.ok) {
      erroEl.textContent = dados.erro || 'Erro ao fazer backup.';
      erroEl.classList.add('visivel');
      return;
    }
    carregarConfigBackup();
    carregarBackups();
  } catch (err) {
    erroEl.textContent = 'Falha de conexão com o servidor.';
    erroEl.classList.add('visivel');
  } finally {
    botao.disabled = false;
    botao.textContent = 'Fazer backup agora';
  }
});

async function carregarBackups() {
  try {
    const resposta = await apiFetch('/api/manutencao/backups');
    if (!resposta.ok) return;
    const arquivos = await resposta.json();

    const corpo = document.querySelector('#tabelaBackups tbody');
    corpo.innerHTML = arquivos.map((a) => `
      <tr>
        <td>${a.nome}</td>
        <td>${formatoTamanho(a.tamanho)}</td>
        <td>${formatoDataHora(a.criado_em)}</td>
        <td style="text-align:right;">
          <a class="link-registro" href="/api/manutencao/backups/${encodeURIComponent(a.nome)}/download?token=${encodeURIComponent(token)}" style="margin-right:14px;">Baixar</a>
          <a class="link-registro" style="margin-right:14px;" onclick="restaurarBackup('${a.nome}')">Restaurar</a>
          <a class="link-registro" style="color:var(--vermelho);" onclick="excluirBackup('${a.nome}')">Excluir</a>
        </td>
      </tr>
    `).join('') || `<tr><td colspan="4" style="color:var(--texto-fraco);">Nenhum backup ainda. Clique em "Fazer backup agora" pra criar o primeiro.</td></tr>`;
  } catch (err) {
    console.error(err);
  }
}

document.getElementById('btnAtualizarBackups').addEventListener('click', carregarBackups);

// Volta o banco inteiro para um backup. Pede pra digitar RESTAURAR.
async function restaurarBackup(nome) {
  const texto = await pedirTexto(
    `O banco vai voltar a ficar EXATAMENTE como estava no backup "${nome}". Tudo o que foi feito depois dele se perde `
    + '(antes, o sistema faz um backup de segurança do jeito que está agora).\n\nPara confirmar, digite RESTAURAR:',
    { tipo: 'perigo', titulo: 'Restaurar este backup?', placeholder: 'RESTAURAR', textoOk: 'Restaurar o banco' });
  if (texto === null) return;
  if (texto.trim().toUpperCase() !== 'RESTAURAR') { mostrarAlerta('Restauração cancelada: a palavra digitada não foi RESTAURAR.', { tipo: 'aviso' }); return; }
  mostrarAlerta('Restaurando o banco… isso pode levar alguns minutos. Não feche o sistema.', { tipo: 'info' });
  try {
    const resposta = await apiFetch(`/api/manutencao/backups/${encodeURIComponent(nome)}/restaurar`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirmacao: 'RESTAURAR' }),
    });
    const d = await resposta.json();
    mostrarAlerta(resposta.ok ? d.mensagem : d.erro, { tipo: resposta.ok ? 'sucesso' : 'erro' });
    carregarBackups();
  } catch (err) {
    mostrarAlerta('Falha de conexão com o servidor.');
  }
}

async function excluirBackup(nome) {
  if (!(await confirmarExclusao(`Excluir o backup "${nome}"? Essa ação não pode ser desfeita.`))) return;
  try {
    await apiFetch(`/api/manutencao/backups/${encodeURIComponent(nome)}`, { method: 'DELETE' });
    carregarBackups();
  } catch (err) {
    mostrarAlerta('Falha de conexão com o servidor.');
  }
}

// ---------- Avisos aos usuários (disparados pelo admin) ----------
document.querySelectorAll('.btn-modelo-aviso').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.getElementById('avMensagem').value = btn.dataset.msg;
    document.getElementById('avTipo').value = btn.dataset.tipo;
  });
});

async function carregarAvisoAtivo() {
  try {
    const resposta = await apiFetch('/api/avisos/atual');
    if (!resposta.ok) return;
    const aviso = await resposta.json();
    const bloco = document.getElementById('avisoAtivoAtual');
    if (aviso) {
      document.getElementById('textoAvisoAtivo').textContent = aviso.mensagem;
      bloco.dataset.avisoId = aviso.id;
      bloco.classList.remove('oculto');
    } else {
      bloco.classList.add('oculto');
    }
  } catch (err) {
    console.error(err);
  }
}

document.getElementById('btnEnviarAviso').addEventListener('click', async () => {
  const erroEl = document.getElementById('erroAviso');
  erroEl.classList.remove('visivel');

  const mensagem = document.getElementById('avMensagem').value.trim();
  const tipo = document.getElementById('avTipo').value;
  const minutosExpira = document.getElementById('avMinutosExpira').value;

  if (!mensagem) {
    erroEl.textContent = 'Escreva a mensagem do aviso.';
    erroEl.classList.add('visivel');
    return;
  }

  try {
    const resposta = await apiFetch('/api/avisos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mensagem, tipo, minutos_expira: minutosExpira || null }),
    });
    const dados = await resposta.json();
    if (!resposta.ok) {
      erroEl.textContent = dados.erro || 'Erro ao enviar aviso.';
      erroEl.classList.add('visivel');
      return;
    }
    document.getElementById('avMensagem').value = '';
    document.getElementById('avMinutosExpira').value = '';
    carregarAvisoAtivo();
  } catch (err) {
    erroEl.textContent = 'Falha de conexão com o servidor.';
    erroEl.classList.add('visivel');
  }
});

document.getElementById('btnEncerrarAviso').addEventListener('click', async () => {
  const id = document.getElementById('avisoAtivoAtual').dataset.avisoId;
  if (!id) return;
  try {
    await apiFetch(`/api/avisos/${id}/encerrar`, { method: 'PUT' });
    carregarAvisoAtivo();
  } catch (err) {
    mostrarAlerta('Falha de conexão com o servidor.');
  }
});

// ---------- Mensagens internas ----------
let caixaAtual = 'recebidas';
let ultimasMensagens = [];
let destinatariosCarregados = [];

function formatoDataHoraCurta(d) {
  if (!d) return '—';
  const data = new Date(d);
  const hoje = new Date();
  const mesmoDia = data.toDateString() === hoje.toDateString();
  return mesmoDia
    ? data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : data.toLocaleDateString('pt-BR');
}

async function verificarMensagensNaoLidas() {
  try {
    const resposta = await apiFetch('/api/mensagens/nao-lidas');
    if (!resposta.ok) return;
    const dados = await resposta.json();
    const badge = document.getElementById('badgeMensagens');
    if (dados.total > 0) {
      badge.textContent = dados.total;
      badge.classList.remove('oculto');
    } else {
      badge.classList.add('oculto');
    }
  } catch (err) { /* silencioso */ }
}
verificarMensagensNaoLidas();
setInterval(verificarMensagensNaoLidas, 20000);

document.querySelectorAll('#pagina-mensagens .sub-tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('#pagina-mensagens .sub-tab').forEach((t) => t.classList.remove('ativo'));
    tab.classList.add('ativo');
    caixaAtual = tab.dataset.caixa;
    document.getElementById('colOutraPessoa').textContent = caixaAtual === 'recebidas' ? 'De' : 'Para';
    carregarCaixaMensagens();
  });
});

async function carregarCaixaMensagens() {
  try {
    const resposta = await apiFetch(`/api/mensagens/${caixaAtual}`);
    if (!resposta.ok) return;
    ultimasMensagens = await resposta.json();

    const corpo = document.querySelector('#tabelaMensagens tbody');
    corpo.innerHTML = ultimasMensagens.map((m) => `
      <tr style="cursor:pointer; ${!m.lida && caixaAtual === 'recebidas' ? 'font-weight:700;' : ''}" onclick="abrirMensagem(${m.id})">
        <td>${caixaAtual === 'recebidas' ? (m.remetente_nome || '—') : (m.destinatario_nome || '—')}</td>
        <td>${m.assunto || '(sem assunto)'}</td>
        <td>${m.total_anexos > 0 ? `📎 ${m.total_anexos}` : '—'}</td>
        <td>${formatoDataHoraCurta(m.criado_em)}</td>
      </tr>
    `).join('') || `<tr><td colspan="4" style="color:var(--texto-fraco); font-weight:400;">Nenhuma mensagem ${caixaAtual === 'recebidas' ? 'recebida' : 'enviada'} ainda.</td></tr>`;

    verificarMensagensNaoLidas();
  } catch (err) {
    console.error(err);
  }
}

async function carregarDestinatarios() {
  if (destinatariosCarregados.length > 0) return;
  try {
    const resposta = await apiFetch('/api/mensagens/destinatarios');
    if (!resposta.ok) return;
    destinatariosCarregados = await resposta.json();
    document.getElementById('msgDestinatario').innerHTML = destinatariosCarregados
      .map((u) => `<option value="${u.id}">${u.nome}</option>`).join('');
  } catch (err) {
    console.error(err);
  }
}

const painelNovaMensagem = document.getElementById('painelNovaMensagem');
painelNovaMensagem.addEventListener('click', (e) => {
  if (e.target === painelNovaMensagem) painelNovaMensagem.classList.add('oculto');
});

document.getElementById('btnNovaMensagem').addEventListener('click', async () => {
  await carregarDestinatarios();
  document.getElementById('msgAssunto').value = '';
  document.getElementById('msgCorpo').value = '';
  document.getElementById('msgAnexos').value = '';
  document.getElementById('listaNomesAnexos').textContent = 'Nenhum arquivo (até 5, 20MB cada)';
  document.getElementById('erroMensagem').classList.remove('visivel');
  painelNovaMensagem.classList.remove('oculto');
});

document.getElementById('msgAnexos').addEventListener('change', (e) => {
  const nomes = Array.from(e.target.files).map((f) => f.name);
  document.getElementById('listaNomesAnexos').textContent = nomes.length
    ? nomes.join(', ')
    : 'Nenhum arquivo (até 5, 20MB cada)';
});

document.getElementById('btnCancelarMensagem').addEventListener('click', () => painelNovaMensagem.classList.add('oculto'));

document.getElementById('btnEnviarMensagem').addEventListener('click', async () => {
  const erroEl = document.getElementById('erroMensagem');
  erroEl.classList.remove('visivel');

  const destinatarioId = document.getElementById('msgDestinatario').value;
  const assunto = document.getElementById('msgAssunto').value.trim();
  const corpo = document.getElementById('msgCorpo').value.trim();
  const arquivos = document.getElementById('msgAnexos').files;

  if (!destinatarioId || (!corpo && arquivos.length === 0)) {
    erroEl.textContent = 'Escolha o destinatário e escreva uma mensagem ou anexe um arquivo.';
    erroEl.classList.add('visivel');
    return;
  }

  const formData = new FormData();
  formData.append('destinatario_id', destinatarioId);
  formData.append('assunto', assunto);
  formData.append('corpo', corpo);
  Array.from(arquivos).forEach((f) => formData.append('anexos', f));

  try {
    const resposta = await apiFetch('/api/mensagens', { method: 'POST', body: formData });
    const dados = await resposta.json();
    if (!resposta.ok) {
      erroEl.textContent = dados.erro || 'Erro ao enviar mensagem.';
      erroEl.classList.add('visivel');
      return;
    }
    painelNovaMensagem.classList.add('oculto');
    if (caixaAtual === 'enviadas') carregarCaixaMensagens();
  } catch (err) {
    erroEl.textContent = 'Falha de conexão com o servidor.';
    erroEl.classList.add('visivel');
  }
});

const painelVerMensagem = document.getElementById('painelVerMensagem');
painelVerMensagem.addEventListener('click', (e) => {
  if (e.target === painelVerMensagem) painelVerMensagem.classList.add('oculto');
});

let mensagemAbertaAtual = null;

async function abrirMensagem(id) {
  try {
    const resposta = await apiFetch(`/api/mensagens/${id}`);
    if (!resposta.ok) return;
    const m = await resposta.json();
    mensagemAbertaAtual = m;

    document.getElementById('verMensagemAssunto').textContent = m.assunto || '(sem assunto)';
    document.getElementById('verMensagemMeta').textContent =
      `De: ${m.remetente_nome || '—'} · Para: ${m.destinatario_nome || '—'} · ${formatoDataHora(m.criado_em)}`;
    document.getElementById('verMensagemCorpo').textContent = m.corpo || '';

    const anexosEl = document.getElementById('verMensagemAnexos');
    anexosEl.innerHTML = (m.anexos || []).map((a) => `
      <div class="item-arquivo">
        <span>📎 ${a.nome_original} (${formatoTamanho(a.tamanho)})</span>
        <a class="link-registro" href="/api/mensagens/anexos/${a.id}/download?token=${encodeURIComponent(token)}">Baixar</a>
      </div>
    `).join('');

    painelVerMensagem.classList.remove('oculto');
    carregarCaixaMensagens();
  } catch (err) {
    mostrarAlerta('Falha de conexão com o servidor.');
  }
}

document.getElementById('btnResponderMensagem').addEventListener('click', async () => {
  if (!mensagemAbertaAtual) return;
  await carregarDestinatarios();

  const outraPessoaId = mensagemAbertaAtual.remetente_id === usuario.id
    ? mensagemAbertaAtual.destinatario_id
    : mensagemAbertaAtual.remetente_id;

  painelVerMensagem.classList.add('oculto');
  document.getElementById('msgDestinatario').value = outraPessoaId;
  document.getElementById('msgAssunto').value = mensagemAbertaAtual.assunto
    ? (mensagemAbertaAtual.assunto.startsWith('Re: ') ? mensagemAbertaAtual.assunto : `Re: ${mensagemAbertaAtual.assunto}`)
    : '';
  document.getElementById('msgCorpo').value = '';
  document.getElementById('msgAnexos').value = '';
  document.getElementById('listaNomesAnexos').textContent = 'Nenhum arquivo (até 5, 20MB cada)';
  document.getElementById('erroMensagem').classList.remove('visivel');
  painelNovaMensagem.classList.remove('oculto');
});

// ---------- Usuários online (Manutenção) ----------
function tempoRelativo(d) {
  if (!d) return 'Nunca acessou';
  const segundos = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (segundos < 60) return 'Agora mesmo';
  if (segundos < 3600) return `Há ${Math.floor(segundos / 60)} min`;
  if (segundos < 86400) return `Há ${Math.floor(segundos / 3600)} h`;
  return `Há ${Math.floor(segundos / 86400)} dia(s)`;
}

async function carregarUsuariosOnline() {
  try {
    const resposta = await apiFetch('/api/auth/usuarios-online');
    if (!resposta.ok) return;
    const usuarios = await resposta.json();

    const rotulos = { admin: 'Administrador', interno: 'Usuário interno', cliente: 'Cliente' };
    const corpo = document.querySelector('#tabelaOnline tbody');
    corpo.innerHTML = usuarios.map((u) => {
      const online = u.ultimo_acesso && (Date.now() - new Date(u.ultimo_acesso).getTime()) < 60000;
      return `
        <tr>
          <td>${online
            ? '<span class="badge badge-faturado">● Online agora</span>'
            : '<span class="badge" style="background:rgba(255,255,255,0.08); color:var(--texto-fraco);">○ Offline</span>'}</td>
          <td>${u.nome}</td>
          <td>${u.email}</td>
          <td>${rotulos[u.perfil] || u.perfil}</td>
          <td>${tempoRelativo(u.ultimo_acesso)}</td>
        </tr>
      `;
    }).join('') || `<tr><td colspan="5" style="color:var(--texto-fraco);">Nenhum usuário cadastrado.</td></tr>`;
  } catch (err) {
    console.error(err);
  }
}

document.getElementById('btnAtualizarOnline').addEventListener('click', carregarUsuariosOnline);

// ---------- Importação automática da planilha do ERP ----------
async function carregarConfigErp() {
  try {
    const resposta = await apiFetch('/api/importacao-erp/configuracao');
    if (!resposta.ok) return;
    const c = await resposta.json();

    document.getElementById('erpAtivo').checked = !!c.ativo;
    document.getElementById('erpCaminhoArquivo').value = c.caminho_arquivo || '';
    document.getElementById('erpIntervaloMinutos').value = c.intervalo_minutos ?? 15;

    const statusEl = document.getElementById('statusImportacaoErp');
    if (c.ultima_importacao_em) {
      const cor = c.ultima_importacao_status === 'sucesso' ? 'var(--verde)' : 'var(--vermelho)';
      statusEl.innerHTML = `Última verificação: ${formatoDataHora(c.ultima_importacao_em)} — <span style="color:${cor};">${c.ultima_importacao_mensagem || c.ultima_importacao_status}</span>`;
    } else {
      statusEl.textContent = 'Nenhuma importação automática feita ainda.';
    }
  } catch (err) {
    console.error(err);
  }
}

document.getElementById('btnSalvarConfigErp').addEventListener('click', async () => {
  const erroEl = document.getElementById('erroImportacaoErp');
  erroEl.classList.remove('visivel');

  const corpo = {
    ativo: document.getElementById('erpAtivo').checked,
    caminho_arquivo: document.getElementById('erpCaminhoArquivo').value.trim().replace(/^["']|["']$/g, '') || null,
    intervalo_minutos: Number(document.getElementById('erpIntervaloMinutos').value) || 15,
  };

  try {
    const resposta = await apiFetch('/api/importacao-erp/configuracao', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
    });
    const dados = await resposta.json();
    if (!resposta.ok) {
      erroEl.textContent = dados.erro || 'Erro ao salvar.';
      erroEl.classList.add('visivel');
      return;
    }
    carregarConfigErp();
    mostrarSucessoTemporario(erroEl);
  } catch (err) {
    erroEl.textContent = 'Falha de conexão com o servidor.';
    erroEl.classList.add('visivel');
  }
});

document.getElementById('btnImportarErpAgora').addEventListener('click', async () => {
  const erroEl = document.getElementById('erroImportacaoErp');
  const botao = document.getElementById('btnImportarErpAgora');
  erroEl.classList.remove('visivel');
  botao.disabled = true;
  botao.textContent = 'Verificando...';

  try {
    const resposta = await apiFetch('/api/importacao-erp/importar-agora', { method: 'POST' });
    const dados = await resposta.json();
    if (!resposta.ok) {
      erroEl.textContent = dados.erro || 'Erro ao importar.';
      erroEl.classList.add('visivel');
      return;
    }
    carregarConfigErp();
    carregarResumo();
    if (dados.ultima_importacao_status === 'erro') {
      erroEl.textContent = dados.ultima_importacao_mensagem || 'Erro na verificação.';
      erroEl.classList.add('visivel');
    } else {
      mostrarSucessoTemporario(erroEl, `✓ ${dados.ultima_importacao_mensagem || 'Verificado.'}`);
    }
  } catch (err) {
    erroEl.textContent = 'Falha de conexão com o servidor.';
    erroEl.classList.add('visivel');
  } finally {
    botao.disabled = false;
    botao.textContent = 'Verificar e importar agora';
  }
});

// ---------- Auditoria de Frete ----------
let ultimasLinhasAuditoria = [];
let fretesSelecionadosLote = new Set();
// Quantos cartões cada coluna do kanban mostra (cresce com "Mostrar mais").
const KANBAN_POR_VEZ = 30;
let kanbanLimite = {};
function mostrarMaisKanban(chave) {
  kanbanLimite[chave] = (kanbanLimite[chave] || KANBAN_POR_VEZ) + KANBAN_POR_VEZ * 3;
  renderizarAuditoriaFrete();
}

// Mostra no lugar do kanban por que ele não carregou (antes ficava só vazio).
function mostrarErroKanbanAuditoria(texto) {
  const alvo = document.getElementById('kanbanAuditoria');
  if (alvo) alvo.innerHTML = `<div class="cte-alerta-grande" style="grid-column:1/-1;">⚠ Não consegui carregar a auditoria: ${cfEsc(texto)}</div>`;
}

async function carregarAuditoriaFrete() {
  try {
    const resposta = await apiFetch('/api/fretes/auditoria/divergencias');
    if (!resposta.ok) {
      const corpo = await resposta.json().catch(() => ({}));
      mostrarErroKanbanAuditoria(corpo.erro || `o servidor respondeu ${resposta.status}.`);
      return;
    }
    ultimasLinhasAuditoria = await resposta.json();

    // Popula o filtro de transportadora com as que aparecem na auditoria.
    const transportadorasNaLista = [...new Set(ultimasLinhasAuditoria.map((l) => l.transportadora).filter(Boolean))].sort();
    const seletorTransp = document.getElementById('afFiltroTransportadora');
    const valorAnterior = seletorTransp.value;
    seletorTransp.innerHTML = '<option value="">Todas</option>' + transportadorasNaLista.map((t) => `<option value="${t}">${t}</option>`).join('');
    if (transportadorasNaLista.includes(valorAnterior)) seletorTransp.value = valorAnterior;

    renderizarAuditoriaFrete();
  } catch (err) {
    console.error(err);
    mostrarErroKanbanAuditoria(`erro na tela (${err.message || err}).`);
  }
}

function renderizarAuditoriaFrete() {
  const filtroTransp = document.getElementById('afFiltroTransportadora').value;
  const filtroStatus = document.getElementById('afFiltroStatus').value;
  const filtroBusca = document.getElementById('afFiltroBusca').value.trim().toLowerCase();

  const linhas = ultimasLinhasAuditoria.filter((l) => {
    if (filtroTransp && l.transportadora !== filtroTransp) return false;
    const divergente = Number(l.dif_negociado_tabela) !== 0;
    if (filtroStatus === 'ok' && (l.carga_direta || divergente)) return false;
    if (filtroStatus === 'divergente' && (l.carga_direta || !divergente)) return false;
    if (filtroStatus === 'carga_direta' && !l.carga_direta) return false;
    if (filtroBusca) {
      const alvo = `${l.numero_cte || ''} ${l.numero_pedido || ''} ${l.cliente || ''}`.toLowerCase();
      if (!alvo.includes(filtroBusca)) return false;
    }
    return true;
  });

  const total = linhas.length;
  // Carga Direta é negociação avulsa (caminhão dedicado) — não faz sentido comparar
  // com a tabela padrão, então fica de fora da soma de "pago a mais/menos".
  const linhasComparaveis = linhas.filter((l) => !l.carga_direta);
  const pagoMais = linhasComparaveis.filter((l) => cobradoAMais(l) > 0).reduce((s, l) => s + cobradoAMais(l), 0);
  const pagoMenos = linhasComparaveis.filter((l) => cobradoAMais(l) < 0).reduce((s, l) => s + cobradoAMais(l), 0);

  document.getElementById('afTotal').textContent = total;
  document.getElementById('afPagoMais').textContent = formatoMoeda(pagoMais);
  document.getElementById('afPagoMenos').textContent = formatoMoeda(pagoMenos);
  const liquida = pagoMais + pagoMenos;
  const elLiquida = document.getElementById('afDiferencaLiquida');
  elLiquida.textContent = formatoMoeda(liquida);
  elLiquida.style.color = liquida > 0 ? 'var(--vermelho)' : (liquida < 0 ? 'var(--verde)' : 'var(--texto)');

  // Monta o conteúdo de cada cartão (reaproveitado em qualquer coluna do Kanban).
  const montarCartao = (l) => {
    const semDif = l.dif_negociado_tabela == null; // ainda não conferido
    const dif = semDif ? 0 : cobradoAMais(l);   // positivo = cobrou a mais que a tabela
    const toleranciaFrete = Math.max(
      Number(toleranciaAuditoria.tolerancia_valor) || 0,
      (Number(toleranciaAuditoria.tolerancia_percentual) || 0) / 100 * (Number(valorCalculadoPrincipal(l)) || 0)
    );
    const divergente = Math.abs(dif) > toleranciaFrete;
    // CT-e a mais da nota (reentrega, devolução, complementar...): o esperado vem do
    // CT-e principal, não da tabela — o redespacho é um frete inteiro e confere pela tabela.
    const vinculado = !!l.frete_principal_id && !['redespacho', 'redespacho_nota'].includes(l.vinculo_cte);
    const esperado = valorCalculadoPrincipal(l);
    const pctReentrega = Number(toleranciaAuditoria.percentual_reentrega ?? 50);
    const rotuloEsperado = vinculado ? 'Esperado' : 'Tabela';
    const dicaEsperado = !vinculado ? 'Valor pela tabela de preço'
      : ['reentrega', 'devolucao'].includes(l.vinculo_cte) ? `${pctReentrega}% do CT-e original ${l.numero_cte_principal || ''} (Configurações → Auditoria)`
        : 'Valor esperado a partir do CT-e principal da nota';

    const jaAprovado = l.status_aprovacao === 'Aprovado';
    const jaRejeitado = l.status_aprovacao === 'Rejeitado';
    let badgeAprov = '';
    if (jaAprovado) badgeAprov = `<span class="badge badge-conferido" style="margin-left:4px; font-size:10px;">✓ Aprovado</span>`;
    else if (jaRejeitado) badgeAprov = '<span class="badge badge-cancelado" style="margin-left:4px; font-size:10px;">✕ Rejeitado</span>';

    const taxasDivergentes = conferirTaxas(l).filter((t) => t.divergente);
    const badgeTaxas = taxasDivergentes.length
      ? `<span class="badge badge-cancelado" style="margin-left:4px; font-size:10px;">⚠ ${taxasDivergentes.length} taxa(s)</span>`
      : '';

    // Só as taxas divergentes (o frete total já está nos valores acima).
    const resumoDivergencia = (l.status === 'Frete Retido' && !jaAprovado && taxasDivergentes.length)
      ? `<div class="cartao-auditoria-nota" style="margin-top:8px; padding:8px; font-size:11.5px;">${taxasDivergentes.map((t) => `${cfEsc(t.nome)}: cobrado ${formatoMoeda(t.cobrado)} · tabela ${formatoMoeda(t.esperado)}`).join('<br>')}</div>`
      : '';
    // Diferença enorme (mais que o dobro, ou menos da metade da tabela): quase sempre é
    // o trecho/tabela errado (ex.: lotação calculada como fracionado), não cobrança indevida.
    const calc = Number(valorCalculadoPrincipal(l)) || 0;
    const cobrado = Number(l.valor_total_cte ?? l.valor_frete_negociado) || 0;
    const suspeita = !semDif && !l.carga_direta && !vinculado && calc > 0 && cobrado > 0 && (cobrado / calc > 2 || cobrado / calc < 0.5);
    const avisoSuspeita = suspeita
      ? `<div class="cte-selo" style="color:#e8890c;" title="Confira no Detalhe o trecho e a tabela usados antes de cobrar a transportadora">🔎 Diferença de ${Math.round((cobrado / calc) * 100)}% da tabela — confira o trecho/tabela usado</div>` : '';

    // Complementar não tem valor esperado: alguém precisa olhar o motivo e aprovar.
    const notaSemEsperado = (esperado == null && vinculado && !jaAprovado)
      ? `<div class="cartao-auditoria-nota" style="margin-top:8px; padding:8px; font-size:11.5px;">${l.vinculo_cte === 'complementar'
        ? 'CT-e complementar não tem valor pela tabela: confira o motivo no Detalhe (XML do CT-e) e aprove ou glose manualmente.'
        : 'Sem valor esperado: o CT-e principal da nota ainda não foi calculado.'}</div>` : '';
    const notaAprovacao = jaAprovado && l.justificativa_aprovacao
      ? `<div class="cartao-auditoria-nota" style="margin-top:8px; padding:8px;">${l.justificativa_aprovacao}</div>` : '';
    const notaGlosa = l.glosa_valor
      ? `<div class="cartao-auditoria-nota" style="margin-top:8px; padding:8px;"><strong>Glosa:</strong> ${formatoMoeda(l.glosa_valor)}${l.glosa_motivo ? ` — ${l.glosa_motivo}` : ''}</div>` : '';

    const naoLevou = !!l.cte_nao_levou;
    const botaoAprovar = (podeAprovarPagamento && !jaAprovado && !naoLevou)
      ? `<button class="acao-primaria" onclick="aprovarComJustificativaAuditoria(${l.id})">✓ Aprovar</button>` : '';
    // Glosa só faz sentido quando a transportadora cobrou a mais.
    const botaoGlosa = (podeAprovarPagamento && !jaAprovado && divergente && dif > 0 && !naoLevou)
      ? `<button onclick="registrarGlosaAuditoria(${l.id})">💸 Glosa</button>` : '';
    const botaoEmail = (podeAprovarPagamento && divergente)
      ? `<button onclick="enviarEspelhoEmailAuditoria(${l.id})">📧 Email</button>` : '';

    const checkboxLote = (podeAprovarPagamento && !jaAprovado && !naoLevou)
      ? `<input type="checkbox" class="checkbox-lote-auditoria" data-id="${l.id}" onclick="event.stopPropagation(); atualizarBarraLoteAuditoria();" style="margin-right:6px;" ${fretesSelecionadosLote.has(l.id) ? 'checked' : ''} />`
      : '';

    const liberadoComAlerta = ['Conferido', 'Liberado p/ Pagamento'].includes(l.status) && alertasDoCartao(l).length > 0;
    return `
      <div class="kanban-cartao ${l.alerta_transportadora_diferente ? 'kanban-alerta-transp' : ''} ${naoLevou ? 'kanban-nao-levou' : ''} ${liberadoComAlerta ? 'kanban-liberado-alerta' : ''}">
        ${liberadoComAlerta ? `<div class="cte-selo perigo" title="O sistema liberou pelo valor, mas este CT-e tem alerta (${alertasDoCartao(l).join(', ')}). Confira antes de pagar.">⚠ Liberado com alerta (${alertasDoCartao(l).join(', ')}) — confira antes de pagar</div>` : ''}
        ${l.alerta_transportadora_diferente ? `<div class="cte-alerta-faixa" style="cursor:pointer;" onclick="abrirDetalheAuditoria(${l.id})" title="Clique para abrir o Detalhe e marcar qual transportadora levou a nota">⚠ CT-e de transportadoras DIFERENTES — clique e defina quem levou</div>` : ''}
        ${l.nf_substitui ? `<div class="cte-selo" title="Troca de nota informada por e-mail">↪ Substitui a NF ${cfEsc(l.nf_substitui)}</div>` : ''}
        ${l.nf_devolvida ? `<div class="cte-selo" title="Nota devolvida">↩ Devolvida${l.nf_substituida_por ? ` — refaturada pela NF ${cfEsc(l.nf_substituida_por)}` : ''}</div>` : ''}
        ${l.nf_retornou ? '<div class="cte-selo" title="Remessa para feira/demonstração que já voltou">↩ Retornou da feira/demonstração</div>' : ''}
        ${l.alerta_cobranca_dupla ? '<div class="cte-alerta-faixa" title="A nota devolvida e a refaturada são a mesma entrega e as duas têm CT-e. A transportadora deve cobrar uma vez só.">♻️ POSSÍVEL COBRANÇA EM DOBRO — conferir</div>' : ''}
        ${l.nf_cancelada ? '<div class="cte-alerta-faixa" title="A NF-e desta nota foi cancelada. O frete fica retido até alguém conferir (normalmente vai para a nota que substituiu).">🧾 NF CANCELADA — conferir antes de pagar</div>' : ''}
        ${naoLevou ? `<div class="cte-nao-levou-faixa" title="Quem levou: ${cfEsc(l.transportadora_que_levou || '—')}">🚫 Não levou a nota — não pagar</div>` : ''}
        <div class="kanban-cartao-topo">
          <span class="kanban-cartao-id">${checkboxLote}Pedido ${l.numero_pedido || '—'}</span>
          <span>${l.carga_direta ? '🚚' : ''}${badgeAprov}${badgeTaxas}</span>
        </div>
        <div class="kanban-cartao-transp">CT-e ${l.numero_cte || '—'} · ${l.transportadora || '—'}</div>
        ${seloVinculoCte(l)}
        <div class="kanban-cartao-valores">
          <div title="Valor cobrado no CT-e"><span>Cobrado</span><strong>${formatoMoeda(l.valor_frete_negociado)}</strong></div>
          <div title="${dicaEsperado}"><span>${rotuloEsperado}</span><strong>${esperado == null ? '—' : formatoMoeda(esperado)}</strong></div>
          <div class="kanban-cartao-dif" title="Cobrado − ${rotuloEsperado.toLowerCase()}: positivo = a transportadora cobrou a mais"><span>${semDif ? 'Diferença' : dif > 0 ? 'A mais' : dif < 0 ? 'A menos' : 'Diferença'}</span><strong style="color:${dif > 0.009 ? 'var(--vermelho)' : (dif < -0.009 ? 'var(--verde)' : 'inherit')};">${semDif ? '—' : `${dif > 0 ? '+' : ''}${formatoMoeda(dif)}`}</strong></div>
        </div>
        ${avisoSuspeita}${notaSemEsperado}${resumoDivergencia}${notaAprovacao}${notaGlosa}
        <div class="kanban-cartao-acoes">
          <button onclick="abrirDetalheAuditoria(${l.id})">🔍 Detalhe</button>
          ${botaoAprovar}${botaoGlosa}${botaoEmail}
        </div>
      </div>
    `;
  };

  // Agrupa pelo status, seguindo as etapas do fluxograma: conferência → retenção → liberação → pago.
  const recente = (l) => Date.parse(l.data_emissao_cte || l.atualizado_em || 0) || 0;
  const COLUNAS = [
    { chave: 'pendente', titulo: '🔎 Pendente de Conferência', cor: '#8a94a6', filtro: (l) => !['Frete Retido', 'Liberado p/ Pagamento', 'Faturado', 'Cancelado', 'Conferido'].includes(l.status) },
    { chave: 'retido', titulo: '🔶 Frete Retido', cor: '#e8890c', filtro: (l) => l.status === 'Frete Retido' },
    { chave: 'liberado', titulo: '✅ Liberado p/ Pagamento', cor: '#1f9d5c', filtro: (l) => ['Conferido', 'Liberado p/ Pagamento'].includes(l.status) },
    { chave: 'faturado', titulo: '💰 Faturado', cor: '#4d7cff', filtro: (l) => l.status === 'Faturado',
      vazio: 'Nenhum frete faturado ainda. Os liberados vêm para cá quando você fecha a fatura da transportadora em 🧾 Conferir Fatura.' },
  ];

  document.getElementById('kanbanAuditoria').innerHTML = COLUNAS.map((coluna) => {
    const itens = linhas.filter(coluna.filtro);
    // Retidos e pendentes: os que mais cobraram além da tabela primeiro (o que mais vale conferir).
    if (coluna.chave === 'retido' || coluna.chave === 'pendente') itens.sort((a, b) => (cobradoAMais(b) ?? -Infinity) - (cobradoAMais(a) ?? -Infinity));
    // Liberados e faturados: os com alerta primeiro, depois os mais recentes.
    const comAlerta = coluna.chave === 'liberado' ? itens.filter((l) => alertasDoCartao(l).length).length : 0;
    if (coluna.chave === 'liberado' || coluna.chave === 'faturado') {
      itens.sort((a, b) => (alertasDoCartao(b).length > 0) - (alertasDoCartao(a).length > 0) || recente(b) - recente(a));
    }
    const somaValores = itens.reduce((s, l) => s + Number(l.valor_frete_negociado || 0), 0);
    const limite = kanbanLimite[coluna.chave] || KANBAN_POR_VEZ;
    const visiveis = itens.slice(0, limite);
    const faltam = itens.length - visiveis.length;
    return `
      <div class="kanban-coluna" style="--cor-coluna:${coluna.cor};">
        <div class="kanban-coluna-cabecalho">
          <div>
            <div class="kanban-coluna-titulo">${coluna.titulo}</div>
            <div class="kanban-coluna-total">${formatoMoeda(somaValores)}${comAlerta ? ` · <span style="color:#ef4444; font-weight:600;" title="Liberados pelo valor, mas com alerta (ICMS, taxa, NF cancelada...): aparecem no topo da coluna">⚠ ${comAlerta} com alerta</span>` : ''}</div>
          </div>
          <span class="kanban-coluna-contagem">${itens.length}</span>
        </div>
        <div class="kanban-cartoes">
          ${itens.length ? visiveis.map(montarCartao).join('') : `<div class="kanban-vazio">${coluna.vazio || 'Nenhum frete aqui.'}</div>`}
          ${faltam > 0 ? `<button class="kanban-mais" onclick="mostrarMaisKanban('${coluna.chave}')">Mostrar mais ${Math.min(faltam, KANBAN_POR_VEZ * 3)} (faltam ${faltam})</button>` : ''}
        </div>
      </div>
    `;
  }).join('');
}

// Aprovação direta pelo cartão de auditoria, com justificativa opcional.
async function aprovarComJustificativaAuditoria(id) {
  const linha = ultimasLinhasAuditoria.find((l) => l.id === id);
  const sugestao = linha ? gerarResumoDivergencias(linha) : '';
  const justificativa = await pedirTexto('Justificativa para aprovar este frete (edite se quiser).', { titulo: 'Aprovar o frete?', valor: sugestao, textoOk: 'Aprovar', multilinha: true });
  if (justificativa === null) return;
  try {
    const resposta = await apiFetch(`/api/fretes/${id}/aprovar`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ justificativa }),
    });
    const dados = await resposta.json();
    if (!resposta.ok) { mostrarAlerta(dados.erro || 'Erro ao aprovar.'); return; }

    const indice = ultimasLinhasAuditoria.findIndex((l) => l.id === id);
    if (indice >= 0) ultimasLinhasAuditoria[indice] = { ...ultimasLinhasAuditoria[indice], ...dados };
    renderizarAuditoriaFrete();
  } catch (err) {
    mostrarAlerta('Falha de conexão com o servidor.');
  }
}

// Acordo Comercial: a transportadora aceita descontar a diferença no boleto.
async function registrarGlosaAuditoria(id) {
  const linhaGlosa = ultimasLinhasAuditoria.find((l) => l.id === id);
  const valorTexto = await pedirTexto('Valor da glosa combinada com a transportadora (R$).', { titulo: 'Registrar glosa', placeholder: 'Ex: 25,00' });
  if (!valorTexto) return;
  const valor = Number(valorTexto.replace(',', '.'));
  if (!valor || valor <= 0) { mostrarAlerta('Digite um valor válido, maior que zero.'); return; }
  const sugestaoMotivo = linhaGlosa ? gerarResumoDivergencias(linhaGlosa) : '';
  const motivo = await pedirTexto('Motivo ou observação da glosa (edite se quiser).', { titulo: 'Motivo da glosa', valor: sugestaoMotivo, textoOk: 'Registrar glosa', multilinha: true });
  if (motivo === null) return;

  try {
    const resposta = await apiFetch(`/api/fretes/${id}/glosa`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ valor, motivo }),
    });
    const dados = await resposta.json();
    if (!resposta.ok) { mostrarAlerta(dados.erro || 'Erro ao registrar a glosa.'); return; }

    const indice = ultimasLinhasAuditoria.findIndex((l) => l.id === id);
    if (indice >= 0) ultimasLinhasAuditoria[indice] = { ...ultimasLinhasAuditoria[indice], ...dados };
    renderizarAuditoriaFrete();
  } catch (err) {
    mostrarAlerta('Falha de conexão com o servidor.');
  }
}

// Manda o espelho do cálculo (valores + taxas) direto pro email cadastrado
// da transportadora, pra ela conferir e responder com correção ou glosa.
async function enviarEspelhoEmailAuditoria(id) {
  const linha = ultimasLinhasAuditoria.find((l) => l.id === id);
  if (!linha) return;

  if (!(await confirmar(`Enviar o espelho do cálculo por email para a transportadora "${linha.transportadora || '—'}"?`, { titulo: 'Enviar espelho por email?', textoOk: 'Enviar email' }))) return;

  try {
    const resposta = await apiFetch(`/api/email/enviar-espelho/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taxas: conferirTaxas(linha) }),
    });
    const dados = await resposta.json();
    if (!resposta.ok) { mostrarAlerta(dados.erro || 'Erro ao enviar o email.'); return; }
    mostrarAlerta(dados.mensagem || 'Email enviado ✓');
  } catch (err) {
    mostrarAlerta('Falha de conexão com o servidor.');
  }
}

['afFiltroTransportadora', 'afFiltroStatus'].forEach((id) => {
  document.getElementById(id).addEventListener('change', () => { kanbanLimite = {}; renderizarAuditoriaFrete(); });
});
document.getElementById('afFiltroBusca').addEventListener('input', () => { kanbanLimite = {}; renderizarAuditoriaFrete(); });

// ---------- Financeiro ----------
async function carregarFinanceiro() {
  try {
    const [respLiberados, respTodos] = await Promise.all([
      apiFetch('/api/fretes/financeiro/exportar'),
      apiFetch(`/api/fretes?status=${encodeURIComponent('Frete Retido')}&por_pagina=10000`),
    ]);
    const liberados = await respLiberados.json();
    const retidosDados = await respTodos.json();
    const retidos = retidosDados.registros || [];

    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    const em7dias = new Date(hoje); em7dias.setDate(em7dias.getDate() + 7);

    let totalPagar = 0, totalVencendo = 0, totalVencidos = 0;
    let qtdVencendo = 0, qtdVencidos = 0;

    liberados.forEach((l) => {
      const liquido = Number(l.valor_liquido_acordado) || 0;
      totalPagar += liquido;
      if (l.data_vencimento) {
        const venc = new Date(l.data_vencimento);
        if (venc < hoje) { totalVencidos += liquido; qtdVencidos++; }
        else if (venc <= em7dias) { totalVencendo += liquido; qtdVencendo++; }
      }
    });
    const totalRetido = retidos.reduce((s, r) => s + (Number(r.valor_frete_negociado) || 0), 0);

    document.getElementById('finTotalPagar').textContent = formatoMoeda(totalPagar);
    document.getElementById('finTotalPagarQtd').textContent = `${liberados.length} frete(s) liberado(s)`;
    document.getElementById('finVencendo').textContent = formatoMoeda(totalVencendo);
    document.getElementById('finVencendoQtd').textContent = `${qtdVencendo} frete(s)`;
    document.getElementById('finVencidos').textContent = formatoMoeda(totalVencidos);
    document.getElementById('finVencidosQtd').textContent = `${qtdVencidos} frete(s)`;
    document.getElementById('finRetido').textContent = formatoMoeda(totalRetido);
    document.getElementById('finRetidoQtd').textContent = `${retidos.length} frete(s) retido(s)`;

    const corpo = document.querySelector('#tabelaFinanceiro tbody');
    corpo.innerHTML = liberados.map((l) => {
      let corVencimento = '';
      if (l.data_vencimento) {
        const venc = new Date(l.data_vencimento);
        if (venc < hoje) corVencimento = 'color:var(--vermelho); font-weight:600;';
        else if (venc <= em7dias) corVencimento = 'color:#e8890c; font-weight:600;';
      }
      return `
        <tr>
          <td style="${corVencimento}">${l.data_vencimento ? formatoData(l.data_vencimento) : '—'}</td>
          <td>${l.numero_pedido || '—'}</td>
          <td>${l.numero_nf || '—'}</td>
          <td>${l.numero_cte || '—'}</td>
          <td>${l.transportadora || '—'}</td>
          <td>${l.banco || '—'}</td>
          <td>${l.agencia && l.conta ? `${l.agencia} / ${l.conta}` : '—'}</td>
          <td>${l.chave_pix || '—'}</td>
          <td>${formatoMoeda(l.valor_frete_negociado)}</td>
          <td>${l.glosa_valor ? formatoMoeda(l.glosa_valor) : '—'}</td>
          <td><strong>${formatoMoeda(l.valor_liquido_acordado)}</strong></td>
        </tr>
      `;
    }).join('') || `<tr><td colspan="11" style="color:var(--texto-fraco);">Nenhum frete liberado pra pagamento no momento.</td></tr>`;

    const comGlosa = [...liberados, ...retidos].filter((l) => l.glosa_valor).slice(0, 8);
    document.getElementById('listaGlosasRecentes').innerHTML = comGlosa.length
      ? comGlosa.map((l) => `
          <div style="padding:8px 0; border-bottom:1px solid var(--borda);">
            <strong>${formatoMoeda(l.glosa_valor)}</strong> — Pedido ${l.numero_pedido || '—'} (${l.transportadora || '—'})
            ${l.glosa_motivo ? ` — ${l.glosa_motivo}` : ''}
          </div>
        `).join('')
      : '<p style="color:var(--texto-fraco);">Nenhuma glosa registrada ainda.</p>';
  } catch (err) {
    console.error(err);
  }
}

// ---------- Detalhe do cálculo ----------
const formatoPercentualCte = (v) =>
  v == null ? '—' : `${Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 4 })}%`;

// Busca no servidor a composição do CT-e (lida do XML) e preenche a coluna
// da direita do Detalhe do Frete.
async function carregarComposicaoCte(id) {
  const alvo = document.getElementById('detalheComposicaoCte');
  if (!alvo) return;
  const titulo = '<p style="margin:0 0 10px;"><strong>Como a transportadora calculou o CT-e:</strong></p>';

  let c;
  try {
    const resposta = await apiFetch(`/api/fretes/${id}/composicao-cte`);
    c = await resposta.json();
    if (!resposta.ok) throw new Error(c.erro || 'Erro');
  } catch (err) {
    alvo.innerHTML = `${titulo}<p style="color:var(--vermelho);">Não foi possível ler o XML do CT-e.</p>`;
    return;
  }
  // O painel pode ter sido fechado/reaberto em outro frete enquanto carregava.
  const atual = document.getElementById('detalheComposicaoCte');
  if (!atual || atual !== alvo) return;

  if (c.semXml) {
    alvo.innerHTML = `${titulo}<p style="color:var(--texto-fraco);">Esse frete não tem o XML do CT-e guardado.</p>`;
    return;
  }

  const linhaValor = (rotulo, valor, extra = '') =>
    `<tr><td style="padding:3px 0;">${rotulo}</td><td style="padding:3px 0; text-align:right; white-space:nowrap; ${extra}">${valor}</td></tr>`;

  const componentes = c.componentes.length
    ? c.componentes.map((comp) => linhaValor(comp.nome, formatoMoeda(comp.valor))).join('')
    : linhaValor('<span style="color:var(--texto-fraco);">CT-e sem componentes detalhados</span>', '');
  const somaComp = c.componentes.reduce((s, comp) => s + (comp.valor || 0), 0);
  const somaBate = c.vTPrest == null || Math.abs(somaComp - c.vTPrest) < 0.01;

  const i = c.icms;
  const ib = c.ibscbs;
  const temIbsCbs = ib.vIBS != null || ib.vCBS != null;

  const conta = [];
  if (i.vBC != null && i.pICMS != null) {
    conta.push(`ICMS: ${formatoMoeda(i.vBC)} × ${formatoPercentualCte(i.pICMS)}${i.pRedBC ? ` (base reduzida em ${formatoPercentualCte(i.pRedBC)})` : ''} = ${formatoMoeda(i.vICMS)}`);
  }
  if (ib.vBC != null && ib.pIBSUF != null) conta.push(`IBS UF: ${formatoMoeda(ib.vBC)} × ${formatoPercentualCte(ib.pIBSUF)} = ${formatoMoeda(ib.vIBSUF)}`);
  if (ib.vBC != null && ib.pIBSMun != null) conta.push(`IBS Mun.: ${formatoMoeda(ib.vBC)} × ${formatoPercentualCte(ib.pIBSMun)} = ${formatoMoeda(ib.vIBSMun)}`);
  if (ib.vBC != null && ib.pCBS != null) conta.push(`CBS: ${formatoMoeda(ib.vBC)} × ${formatoPercentualCte(ib.pCBS)} = ${formatoMoeda(ib.vCBS)}`);

  alvo.innerHTML = `
    ${titulo}
    <p style="margin:0 0 4px; color:var(--texto-fraco); font-size:12px;">Componentes da prestação:</p>
    <table style="width:100%; font-size:13px; border-collapse:collapse;">
      ${componentes}
      ${linhaValor('<strong>Valor total da prestação</strong>', `<strong>${formatoMoeda(c.vTPrest)}</strong>`, 'border-top:1px solid var(--borda);')}
      ${c.vRec != null && c.vRec !== c.vTPrest ? linhaValor('Valor a receber', formatoMoeda(c.vRec)) : ''}
    </table>
    ${somaBate ? '' : `<p style="margin:6px 0 0; color:var(--vermelho); font-size:12px;">⚠ A soma dos componentes (${formatoMoeda(somaComp)}) não bate com o total da prestação.</p>`}

    <p style="margin:14px 0 4px; color:var(--texto-fraco); font-size:12px;">Impostos:</p>
    <table style="width:100%; font-size:13px; border-collapse:collapse;">
      ${linhaValor(`ICMS${i.cst ? ` (CST ${i.cst})` : ''}`, formatoMoeda(i.vICMS))}
      ${temIbsCbs ? linhaValor('IBS', formatoMoeda(ib.vIBS)) : ''}
      ${temIbsCbs ? linhaValor('CBS', formatoMoeda(ib.vCBS)) : ''}
      ${c.vTotDFe != null ? linhaValor('<strong>Total do CT-e c/ impostos</strong>', `<strong>${formatoMoeda(c.vTotDFe)}</strong>`, 'border-top:1px solid var(--borda);') : ''}
    </table>
    ${conta.length ? `<p style="margin:10px 0; padding:10px; background:var(--bg-elevado); border-radius:var(--raio); white-space:pre-line;">${conta.join('\n')}</p>` : ''}
    ${(() => {
      const icms = conferirIcmsCte(ultimasLinhasAuditoria.find((x) => x.id === Number(id)));
      if (!icms) return '';
      return icms.divergente
        ? `<div class="cte-alerta-grande">⚠ Alíquota de ICMS <b>${icms.cobrada.toLocaleString('pt-BR')}%</b>, mas para transporte <b>${icms.ini} → ${icms.fim}</b> a alíquota interestadual é <b>${icms.esperada}%</b>${icms.motivo ? ` (${cfEsc(icms.motivo)})` : ''}. Confira com a transportadora.</div>`
        : icms.esperada == null
          ? `<p style="margin:6px 0 0; font-size:12px; color:var(--texto-fraco);">ICMS ${icms.cobrada.toLocaleString('pt-BR')}%: ${cfEsc(icms.motivo || '')} — trecho dentro do estado, alíquota interna (não conferida).</p>`
          : `<p style="margin:6px 0 0; font-size:12px; color:var(--verde);">✓ Alíquota de ICMS ${icms.cobrada.toLocaleString('pt-BR')}% correta para ${icms.ini} → ${icms.fim}${icms.motivo ? ` (${cfEsc(icms.motivo)})` : ''}.</p>`;
    })()}
    ${c.vCarga != null ? `<p style="margin:0 0 4px; color:var(--texto-fraco); font-size:12px;">Valor da carga declarado: ${formatoMoeda(c.vCarga)}</p>` : ''}
  `;
}

// Selo do CT-e no card: é um CT-e a mais da nota (e de que tipo) ou é o
// principal com outros CT-e vinculados.
const ROTULOS_VINCULO = {
  complementar: { txt: '➕ Complementar', cls: 'info' },
  reentrega: { txt: '↩ Reentrega', cls: 'info' },
  devolucao: { txt: '↩ Devolução', cls: 'info' },
  redespacho: { txt: '⚠ Outra transportadora', cls: 'perigo' },
  redespacho_nota: { txt: '🔀 Redespacho', cls: 'info' },
  reposicao: { txt: '🔁 Reposição', cls: 'info' },
  retorno: { txt: '↩ Retorno (feira/demonstração)', cls: 'info' },
};
// ---------- Conferência da alíquota de ICMS do CT-e ----------
// Transporte entre estados: 7% quando sai do Sul/Sudeste (menos ES) para
// Norte, Nordeste, Centro-Oeste ou ES; 12% nos demais casos. Dentro do mesmo
// estado a alíquota varia por estado e não é conferida. Só confere CT-e com
// ICMS normal (CST 00 ou 20) — isento, Simples Nacional etc. ficam de fora.
const UF_SUL_SUDESTE = ['SP', 'RJ', 'MG', 'PR', 'SC', 'RS'];
const UF_N_NE_CO_ES = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'PA', 'PB', 'PE', 'PI', 'RN', 'RO', 'RR', 'SE', 'TO'];
function conferirIcmsCte(l) {
  // A auditoria já manda a conferência pronta do servidor, que sabe o trecho
  // do redespacho (a 1ª transportadora tributa só até a cidade do redespacho).
  if (l && 'icms_conferencia' in l) return l.icms_conferencia;
  // IMPORTANTE: a rota usada para determinar a alíquota vem somente dos
  // campos UFIni/UFFim do CT-e, persistidos como uf_inicio_cte/uf_fim_cte.
  // Não usar "uf" (NF-e), UF da transportadora ou outro campo auxiliar.
  const ini = String(l?.uf_inicio_cte ?? '').trim().toUpperCase();
  const fim = String(l?.uf_fim_cte ?? '').trim().toUpperCase();
  if (!ini || !fim || ini === fim) return null;
  let imp = {};
  try { imp = JSON.parse(l.impostos_cte || '{}') || {}; } catch (e) { return null; }
  const cst = String(imp.cst ?? '').padStart(2, '0');
  if (!['00', '20'].includes(cst) || imp.pICMS == null) return null;
  const esperada = imp.aliquotaEsperadaPelaRota != null
    ? Number(imp.aliquotaEsperadaPelaRota)
    : (UF_SUL_SUDESTE.includes(ini) && UF_N_NE_CO_ES.includes(fim) ? 7 : 12);
  const cobrada = Number(imp.pICMS);
  return { ini, fim, esperada, cobrada, divergente: Math.abs(cobrada - esperada) > 0.01 };
}

// Alertas que valem conferir mesmo num frete já liberado pelo valor.
function alertasDoCartao(l) {
  const a = [];
  if (conferirIcmsCte(l)?.divergente) a.push('ICMS');
  if (conferirTaxas(l).some((t) => t.divergente)) a.push('taxas');
  if (l.alerta_cobranca_dupla) a.push('cobrança em dobro');
  if (l.nf_cancelada) a.push('NF cancelada');
  if (l.alerta_transportadora_diferente) a.push('transportadoras diferentes');
  return a;
}

function seloVinculoCte(l) {
  const icms = conferirIcmsCte(l);
  const seloIcms = icms?.divergente
    ? `<div class="cte-selo perigo" title="Transporte ${icms.ini} → ${icms.fim}: alíquota interestadual esperada ${icms.esperada}%${icms.motivo ? ` (${cfEsc(icms.motivo)})` : ''}">⚠ ICMS ${icms.cobrada.toLocaleString('pt-BR')}% (esperado ${icms.esperada}% · ${icms.ini}→${icms.fim})</div>` : '';
  if (l.vinculo_cte && ROTULOS_VINCULO[l.vinculo_cte]) {
    const r = ROTULOS_VINCULO[l.vinculo_cte];
    return `<div class="cte-selo ${r.cls}">${r.txt} do CT-e ${cfEsc(l.numero_cte_principal || '—')} · NF ${cfEsc(l.numero_nf || '—')}</div>${seloIcms}`;
  }
  let html = seloIcms;
  if (l.qtd_ctes_vinculados > 0) html += `<div class="cte-selo">📎 +${l.qtd_ctes_vinculados} CT-e vinculado(s) a esta nota</div>`;
  if (l.ctes_cancelados) html += `<div class="cte-selo cancelado">🚫 CT-e cancelado nesta nota: ${cfEsc(l.ctes_cancelados)}</div>`;
  return html;
}

// No detalhe do frete: todos os CT-e da nota e o total pago. Se a nota tem
// CT-e de transportadoras diferentes, é aqui que se marca qual delas levou.
async function carregarCtesDaNota(id) {
  const alvo = document.getElementById('detalheCtesDaNota');
  if (!alvo) return;
  try {
    const resposta = await apiFetch(`/api/fretes/${id}/ctes-da-nota`);
    const d = await resposta.json();
    if (!resposta.ok || !d.ctes || d.ctes.length < 2) { alvo.innerHTML = ''; return; }
    const rot = { complementar: 'Complementar', reentrega: 'Reentrega', devolucao: 'Devolução', redespacho: 'Outra transportadora', reposicao: 'Reposição', cancelado: 'Cancelado', redespacho_nota: 'Redespacho da nota', retorno: 'Retorno (feira/demonstração)' };
    // Quem paga o frete desse CT-e (tomador), lido do XML.
    const PAPEL = { remetente: 'Remetente', expedidor: 'Expedidor', recebedor: 'Recebedor', 'destinatário': 'Destinatário', outros: 'Terceiro' };
    const quemPaga = (c) => (c.tomador_cte_papel ? `${PAPEL[c.tomador_cte_papel] || c.tomador_cte_papel}${c.tomador_cte_nome ? `<br><small style="color:var(--texto-fraco);">${cfEsc(c.tomador_cte_nome)}</small>` : ''}` : '—');
    const decisao = d.decisao;
    // Só o 1º CT-e de cada transportadora ganha o botão (o principal ou o de outra transportadora).
    const podeEscolher = podeAprovarPagamento && d.tem_varias_transportadoras;
    const botaoEscolher = (c) => {
      if (!podeEscolher || c.cte_cancelado || (c.frete_principal_id && c.vinculo_cte !== 'redespacho')) return '';
      if (decisao && decisao.cte_id === c.id) return '<span class="cte-selo sucesso" style="margin:0;">✓ Levou a nota</span>';
      return `<button class="btn btn-secundario" style="width:auto; padding:4px 10px; font-size:11.5px;" onclick="definirTransportadoraQueLevou(${id}, ${c.id})">${decisao ? '↔ Trocar p/ esta' : '🚚 Foi esta que levou'}</button>`;
    };
    const statusCte = (c) => {
      if (c.cte_nao_levou) return `<span style="color:var(--vermelho); font-weight:600;">🚫 Não levou — não pagar</span>${c.status === 'Faturado' ? ' <small>(já faturado: cobrar estorno)</small>' : ''}`;
      if (c.status === 'Não cobrado') return '<span style="color:var(--texto-fraco);" title="O tomador deste CT-e não é a empresa: ele não é pago por vocês e fica só como histórico da nota.">Não cobrado de vocês</span>';
      return cfEsc(c.status || 'Pendente');
    };
    const cabecalho = d.transportadoras_diferentes
      ? `<div class="cte-alerta-grande">⚠ Esta nota tem CT-e emitidos por <b>transportadoras diferentes</b>. Normalmente só uma delas deveria cobrar — ${podeAprovarPagamento ? 'marque abaixo <b>qual transportadora levou</b> a nota. Os CT-e das outras ficam como "não levou" e não são pagos.' : 'quem aprova pagamentos precisa definir qual transportadora levou a nota.'}</div>`
      : (decisao ? `<div class="cte-decisao-ok">✅ Quem levou a nota: <b>${cfEsc(decisao.transportadora || '—')}</b> (CT-e ${cfEsc(decisao.numero_cte || '—')})
          <small>— definido por ${cfEsc(decisao.definida_por || '—')}${decisao.definida_em ? ` em ${formatoDataHora(decisao.definida_em)}` : ''}</small>
          ${podeAprovarPagamento ? `<button class="btn btn-secundario" style="width:auto; padding:4px 10px; font-size:11.5px; margin-left:8px;" onclick="desfazerTransportadoraQueLevou(${id})">↺ Desfazer</button>` : ''}</div>` : '');
    alvo.innerHTML = `
      ${cabecalho}
      <p style="margin:0 0 8px;"><strong>CT-e desta nota (${d.ctes.length}):</strong></p>
      <table style="width:100%; font-size:12.5px; border-collapse:collapse;">
        <thead><tr><th style="text-align:left;">CT-e</th><th style="text-align:left;">Tipo</th><th style="text-align:left;">Transportadora</th><th style="text-align:left;">Emissão</th><th style="text-align:left;">Quem paga</th><th style="text-align:right;">Cobrado</th><th style="text-align:right;">Esperado</th><th style="text-align:left;">Status</th>${podeEscolher ? '<th></th>' : ''}</tr></thead>
        <tbody>${d.ctes.map((c) => `
          <tr class="${c.cte_cancelado ? 'cte-linha-cancelada' : ''} ${c.cte_nao_levou ? 'cte-linha-nao-levou' : ''} ${c.status === 'Não cobrado' ? 'cte-linha-nao-cobrado' : ''}" style="${c.id === id ? 'background:var(--bg-elevado);' : ''}">
            <td><b>${cfEsc(c.numero_cte || '—')}</b></td>
            <td>${c.cte_cancelado
              ? `<span class="cte-selo cancelado" style="margin:0;" title="${cfEsc(c.cte_cancelado_motivo || '')}">🚫 Cancelado${c.cte_cancelado_em ? ` em ${formatoData(c.cte_cancelado_em)}` : ''}${c.cte_cancelado_motivo ? ` — ${cfEsc(c.cte_cancelado_motivo)}` : ''}</span>`
              : (c.frete_principal_id ? (rot[c.vinculo_cte] || 'Adicional') : 'Principal')}</td>
            <td style="${d.transportadoras_diferentes && c.vinculo_cte === 'redespacho' ? 'color:var(--vermelho); font-weight:600;' : ''}">${cfEsc(c.transportadora || '—')}</td>
            <td>${formatoData(c.data_emissao_cte)}</td>
            <td>${quemPaga(c)}</td>
            <td style="text-align:right;">${formatoMoeda(c.valor_cte)}</td>
            <td style="text-align:right;">${c.valor_esperado != null ? formatoMoeda(c.valor_esperado) : '—'}</td>
            <td>${statusCte(c)}</td>
            ${podeEscolher ? `<td style="text-align:right;">${botaoEscolher(c)}</td>` : ''}
          </tr>`).join('')}
        </tbody>
        <tfoot>
          <tr><td colspan="5" style="padding-top:6px;"><b>Total pago de frete nesta nota</b> <small style="color:var(--texto-fraco);">(sem os cancelados${d.total_nao_levou ? ', sem quem não levou' : ''}${d.total_nao_cobrado ? ', sem o que outra pessoa paga' : ''})</small></td><td style="text-align:right; padding-top:6px;"><b>${formatoMoeda(d.total_pago)}</b></td><td colspan="${podeEscolher ? 3 : 2}"></td></tr>
          ${d.total_nao_cobrado ? `<tr><td colspan="5" style="color:var(--texto-fraco);">Cobrado de outra pessoa (não é pago por vocês)</td><td style="text-align:right; color:var(--texto-fraco);">${formatoMoeda(d.total_nao_cobrado)}</td><td colspan="${podeEscolher ? 3 : 2}"></td></tr>` : ''}
          ${d.total_nao_levou ? `<tr><td colspan="5" style="color:var(--texto-fraco);">Cobrado por quem não levou (não pagar)</td><td style="text-align:right; color:var(--vermelho); text-decoration:line-through;">${formatoMoeda(d.total_nao_levou)}</td><td colspan="${podeEscolher ? 3 : 2}"></td></tr>` : ''}
        </tfoot>
      </table>`;
  } catch (err) { alvo.innerHTML = ''; }
}

// Depois de uma ação no detalhe: recarrega o kanban e reabre o mesmo frete.
async function reabrirDetalheAuditoria(id) {
  await carregarAuditoriaFrete();
  if (ultimasLinhasAuditoria.some((l) => l.id === id)) abrirDetalheAuditoria(id);
}

async function definirTransportadoraQueLevou(freteId, cteId) {
  const ok = await confirmar('Os CT-e das outras transportadoras desta nota vão ficar marcados como "não levou" e não serão pagos. O CT-e de quem levou é conferido pela tabela dela.', { tipo: 'aviso', titulo: 'Confirmar quem levou a nota?', textoOk: 'Confirmar' });
  if (!ok) return;
  try {
    const resposta = await apiFetch(`/api/fretes/${freteId}/transportadora-que-levou`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cte_id: cteId }),
    });
    const dados = await resposta.json();
    if (!resposta.ok) { mostrarAlerta(dados.erro || 'Erro ao definir a transportadora.'); return; }
    await reabrirDetalheAuditoria(freteId);
    mostrarAlerta(dados.mensagem);
  } catch (err) {
    mostrarAlerta('Falha de conexão com o servidor.');
  }
}

async function desfazerTransportadoraQueLevou(freteId) {
  const ok = await confirmar('A nota volta a ficar com o alerta de transportadoras diferentes, e os CT-e de outra transportadora ficam retidos de novo.', { tipo: 'aviso', titulo: 'Desfazer quem levou a nota?', textoOk: 'Desfazer' });
  if (!ok) return;
  try {
    const resposta = await apiFetch(`/api/fretes/${freteId}/transportadora-que-levou`, { method: 'DELETE' });
    const dados = await resposta.json();
    if (!resposta.ok) { mostrarAlerta(dados.erro || 'Erro ao desfazer.'); return; }
    await reabrirDetalheAuditoria(freteId);
  } catch (err) {
    mostrarAlerta('Falha de conexão com o servidor.');
  }
}

// Recalcula este frete pela tabela de preço, direto do detalhe.
async function recalcularFreteDetalhe(id, botao) {
  const aviso = document.getElementById('detalheRecalculoAviso');
  if (botao) { botao.disabled = true; botao.textContent = 'Recalculando…'; }
  try {
    const resposta = await apiFetch(`/api/fretes/${id}/recalcular`, { method: 'POST' });
    const dados = await resposta.json();
    if (!resposta.ok || !dados.ok) {
      if (aviso) aviso.innerHTML = `<div class="cte-alerta-grande" style="margin:8px 0 0;">Não deu pra calcular: ${cfEsc(dados.motivo || dados.erro || 'erro desconhecido')}</div>`;
      return;
    }
    await reabrirDetalheAuditoria(id);
  } catch (err) {
    if (aviso) aviso.innerHTML = '<div class="cte-alerta-grande" style="margin:8px 0 0;">Falha de conexão com o servidor.</div>';
  } finally {
    if (botao && document.body.contains(botao)) { botao.disabled = false; botao.textContent = '🔄 Recalcular pela tabela'; }
  }
}

function abrirDetalheAuditoria(id) {
  const linha = ultimasLinhasAuditoria.find((l) => l.id === id);
  if (!linha) return;

  document.getElementById('detalheAuditoriaTitulo').textContent =
    `Detalhe do Frete — Pedido ${linha.numero_pedido || '—'} · NF ${linha.numero_nf || '—'} · CT-e ${linha.numero_cte || '—'}`;

  // ---- Faixa de resumo (cliente, transportadora, rota, status) ----
  const semCalculo = linha.dif_negociado_tabela == null;
  const divergente = !semCalculo && Number(linha.dif_negociado_tabela) !== 0;
  let statusTxt; let statusCor;
  if (linha.cte_nao_levou) { statusTxt = '🚫 NÃO LEVOU — não pagar'; statusCor = 'var(--vermelho)'; }
  else if (linha.carga_direta) { statusTxt = '🚚 Carga Direta'; statusCor = 'var(--azul)'; }
  else if (semCalculo) { statusTxt = 'SEM CÁLCULO'; statusCor = 'var(--laranja, #e8890c)'; }
  else if (divergente) { statusTxt = 'DIVERGENTE'; statusCor = 'var(--vermelho)'; }
  else { statusTxt = 'OK'; statusCor = 'var(--verde)'; }
  // Quem levou a nota: só aparece quando a nota tem CT-e de transportadoras diferentes.
  const quemLevou = linha.transportadora_que_levou
    ? `<div><div style="color:var(--texto-fraco); font-size:11px;">QUEM LEVOU A NOTA</div><strong style="color:var(--verde);">✓ ${cfEsc(linha.transportadora_que_levou)}</strong></div>`
    : (linha.alerta_transportadora_diferente
      ? `<div><div style="color:var(--texto-fraco); font-size:11px;">QUEM LEVOU A NOTA</div><strong style="color:var(--vermelho);">⚠ A definir</strong></div>` : '');
  const PAPEIS_TOMADOR = { remetente: 'Remetente', expedidor: 'Expedidor', recebedor: 'Recebedor', 'destinatário': 'Destinatário', outros: 'Terceiro' };
  const tomadorOutro = linha.tomador_cte_papel && linha.tomador_eh_empresa === false;
  const quemPagaResumo = linha.tomador_cte_papel
    ? `<div><div style="color:var(--texto-fraco); font-size:11px;">QUEM PAGA ESTE CT-E (TOMADOR)</div><strong style="${tomadorOutro ? 'color:var(--laranja, #e8890c);' : ''}">${PAPEIS_TOMADOR[linha.tomador_cte_papel] || cfEsc(linha.tomador_cte_papel)}${linha.tomador_cte_nome ? ` — ${cfEsc(linha.tomador_cte_nome)}` : ''}</strong></div>` : '';
  const redespachoNota = linha.redespacho_da_nota
    ? `<div><div style="color:var(--texto-fraco); font-size:11px;">REDESPACHO DA NOTA</div><strong>${cfEsc(linha.redespacho_da_nota)}</strong></div>` : '';
  document.getElementById('detalheAuditoriaResumo').innerHTML = `
    <div><div style="color:var(--texto-fraco); font-size:11px;">CLIENTE</div><strong>${linha.cliente || '—'}</strong></div>
    <div><div style="color:var(--texto-fraco); font-size:11px;">TRANSPORTADORA DESTE CT-E</div><strong>${linha.transportadora_cte || linha.transportadora || '—'}</strong></div>
    ${redespachoNota}${quemPagaResumo}
    ${quemLevou}
    <div><div style="color:var(--texto-fraco); font-size:11px;">ROTA</div><strong>${linha.cidade ? `${linha.cidade}/${linha.uf || ''}` : '—'}</strong></div>
    <div><div style="color:var(--texto-fraco); font-size:11px;">VOLUMES</div><strong>${linha.qtd_volumes ?? '—'}</strong></div>
    <div><div style="color:var(--texto-fraco); font-size:11px;">STATUS</div><strong style="color:${statusCor};">${statusTxt}</strong></div>
  `;

  // ---- Corpo: como o cálculo foi feito ----
  const conteudoEl = document.getElementById('detalheAuditoriaConteudo');
  let detalheHtml = '';

  if (linha.auditoria_calculo) {
    let c;
    try { c = JSON.parse(linha.auditoria_calculo); } catch (e) { c = null; }
    if (c) {
      detalheHtml = `
        <p style="margin:0 0 10px;"><strong>Como o sistema calculou o Valor Tabelado:</strong></p>
        <p style="margin:0 0 4px;">Tabela: <strong>${c.tabela_nome || '—'}</strong> (${c.transportadora_nome || linha.transportadora || '—'})</p>
        <p style="margin:0 0 4px;">Trecho: ${c.origem || '?'} → ${c.destino || '?'} | ${c.tipo_carga || 'Geral'}</p>
        <p style="margin:0 0 4px;">Valor por Volume: ${formatoMoeda(c.valor_por_volume)}</p>
        <p style="margin:0 0 4px;">Volume Mínimo: ${c.volume_minimo ?? '—'} | Frete Mínimo: ${formatoMoeda(c.frete_minimo)}</p>
        <p style="margin:0 0 4px;">Qtd. Volumes usada no cálculo: ${c.qtd_volumes_usada}</p>
        <p style="margin:10px 0; padding:10px; background:var(--bg-elevado); border-radius:var(--raio);">${c.explicacao}</p>
        ${(() => {
          // Composição do total (taxas, descarga e ICMS), quando o cálculo guardou.
          const k = c.componentes;
          if (!k) return '';
          const itens = [['Frete base', c.valor_resultado], ['Ad Valorem', k.adValorem], ['GRIS', k.gris], ['Pedágio', k.pedagio],
            ['TDE', k.tde], ['TDA', k.tda], ['TRT', k.trt], ['Despacho', k.despacho],
            [`Descarga${k.descargaInfo ? ` (${({ fixo: 'por entrega', volume: 'por volume', kg: 'por kg', tonelada: 'por tonelada' })[k.descargaInfo.modo] || ''})` : ''}`, k.descarga],
            [k.icms ? `ICMS ${k.icmsAliquota}% — ${k.icmsOrigem}, por ${k.icmsModo}` : 'ICMS', k.icms]]
            .filter(([, v]) => Number(v) > 0);
          return `<div style="font-size:12.5px; margin:0 0 8px;">${itens.map(([n, v]) => `<div style="display:flex; justify-content:space-between;"><span>${n}</span><span>${formatoMoeda(v)}</span></div>`).join('')}
            <div style="display:flex; justify-content:space-between; font-weight:700; border-top:1px solid var(--borda); margin-top:4px; padding-top:4px;"><span>Total calculado</span><span>${formatoMoeda(k.total)}</span></div></div>`;
        })()}
        <p style="margin:0 0 4px; color:var(--texto-fraco); font-size:12px;">Calculado em: ${formatoDataHora(c.calculado_em)}</p>
      `;
    }
  }
  const ehAdicional = linha.frete_principal_id && !['redespacho', 'redespacho_nota'].includes(linha.vinculo_cte);
  if (!detalheHtml) {
    if (ehAdicional && ['reentrega', 'devolucao'].includes(linha.vinculo_cte)) {
      detalheHtml = `<p style="margin:0 0 10px;"><strong>Como o sistema calculou o esperado:</strong></p><p style="margin:0;">CT-e de ${linha.vinculo_cte === 'reentrega' ? 'reentrega' : 'devolução'}: o esperado é ${Number(toleranciaAuditoria.percentual_reentrega ?? 50)}% do CT-e original (${cfEsc(linha.numero_cte_principal || '—')}), configurável em Manutenção.</p>`;
    } else if (ehAdicional && linha.vinculo_cte === 'reposicao') {
      detalheHtml = `<p style="margin:0 0 10px;"><strong>Como o sistema calculou o esperado:</strong></p><p style="margin:0;">CT-e de reposição: o esperado é o frete cheio da tabela para esta nota (o mesmo cálculo do CT-e ${cfEsc(linha.numero_cte_principal || '—')}).</p>`;
    } else if (ehAdicional && linha.vinculo_cte === 'complementar') {
      detalheHtml = '<p style="color:var(--texto-fraco);">CT-e complementar não tem valor esperado pela tabela: é aprovado manualmente.</p>';
    } else {
      detalheHtml = `<p style="color:var(--texto-fraco);">Esse frete ainda não tem o cálculo pela tabela salvo${['redespacho', 'redespacho_nota'].includes(linha.vinculo_cte) ? ` (é calculado pela tabela da ${cfEsc(linha.transportadora_cte || linha.transportadora || 'transportadora dele')}${linha.vinculo_cte === 'redespacho_nota' ? ', da cidade do redespacho até o cliente' : ''})` : ''}. Clique em "🔄 Recalcular pela tabela" pra calcular e guardar o detalhe.</p>`;
    }
  }
  const podeRecalcular = (podeEditar || podeAprovarPagamento) && !linha.carga_direta && linha.vinculo_cte !== 'complementar'
    && !['Faturado', 'Cancelado'].includes(linha.status);
  if (podeRecalcular) {
    detalheHtml += `
      <div style="margin-top:12px;">
        <button class="btn btn-secundario" style="width:auto; padding:7px 14px; font-size:12.5px;" onclick="recalcularFreteDetalhe(${linha.id}, this)">🔄 Recalcular pela tabela</button>
        <div id="detalheRecalculoAviso"></div>
      </div>`;
  }

  if (tomadorOutro) {
    detalheHtml = `<div class="cte-alerta-grande" style="border-color:#e8890c; border-left-color:#e8890c; background:rgba(232,137,12,0.10);">⚠ O tomador deste CT-e (quem paga o frete) é <b>${cfEsc(linha.tomador_cte_nome || PAPEIS_TOMADOR[linha.tomador_cte_papel] || '—')}</b>, não a empresa da nota. Confira se este CT-e é mesmo cobrado de vocês antes de pagar.</div>` + detalheHtml;
  }
  // Duas colunas: à esquerda o cálculo do sistema, à direita o do CT-e
  // (carregado do XML logo abaixo, depois que o painel abre).
  detalheHtml = `
    <div id="detalheCtesDaNota" style="margin-bottom:16px;"></div>
    <div class="detalhe-calculo-colunas">
      <div class="detalhe-calculo-coluna">${detalheHtml}</div>
      <div class="detalhe-calculo-coluna" id="detalheComposicaoCte">
        <p style="margin:0 0 10px;"><strong>Como a transportadora calculou o CT-e:</strong></p>
        <p style="color:var(--texto-fraco);">Carregando o XML do CT-e…</p>
      </div>
    </div>
  `;

  // ---- Conferência de taxas (GRIS/TDE/TDA/TRT/Pedágio): cobrado x esperado ----
  const taxas = conferirTaxas(linha);
  if (taxas.length > 0) {
    detalheHtml += `
      <hr style="border-color:var(--borda); margin:16px 0;" />
      <p style="margin:0 0 10px;"><strong>Conferência de taxas (cobrado no CT-e × tabela de preço):</strong></p>
      <table style="width:100%; font-size:12.5px;">
        <thead><tr>
          <th style="text-align:left; padding:4px 8px;">Taxa</th>
          <th style="text-align:right; padding:4px 8px;">Cobrado</th>
          <th style="text-align:right; padding:4px 8px;">Esperado</th>
          <th style="text-align:right; padding:4px 8px;">Diferença</th>
        </tr></thead>
        <tbody>
          ${taxas.map((t) => `
            <tr>
              <td style="padding:4px 8px;">${t.nome}</td>
              <td style="padding:4px 8px; text-align:right;">${formatoMoeda(t.cobrado)}</td>
              <td style="padding:4px 8px; text-align:right;">${formatoMoeda(t.esperado)}</td>
              <td style="padding:4px 8px; text-align:right; color:${t.divergente ? 'var(--vermelho)' : 'var(--verde)'}; font-weight:600;">
                ${t.divergente ? '⚠ ' : '✓ '}${t.diferenca > 0 ? '+' : ''}${formatoMoeda(t.diferenca)}
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }
  conteudoEl.innerHTML = detalheHtml;

  // ---- Rodapé estilo ERP: valores e impostos do CT-e ----
  let impostosCte = {};
  if (linha.impostos_cte) {
    try { impostosCte = JSON.parse(linha.impostos_cte) || {}; } catch (e) { impostosCte = {}; }
  }

  const campoRodape = (rotulo, valor) => `
    <div><div style="opacity:0.75; font-size:10.5px;">${rotulo}</div><strong>${formatoMoeda(valor)}</strong></div>
  `;
  const campoRodapePct = (rotulo, valor) => `
    <div><div style="opacity:0.75; font-size:10.5px;">${rotulo}</div><strong>${formatoPercentualCte(valor)}</strong></div>
  `;

  document.getElementById('detalheAuditoriaRodape').innerHTML = [
    campoRodape('Valor Negociado (CT-e)', linha.valor_frete_negociado),
    campoRodape('Valor Calculado (Total)', valorCalculadoPrincipal(linha)),
    campoRodape('Valor Frete Base (só o frete)', linha.valor_frete_tabelado),
    `<div><div style="opacity:0.75; font-size:10.5px;">Cobrado − tabela</div><strong style="color:${cobradoAMais(linha) > 0 ? '#ffb3b3' : '#b3ffcf'};">${linha.dif_negociado_tabela == null ? '—' : formatoMoeda(cobradoAMais(linha))}</strong></div>`,
    campoRodape('Base ICMS (CT-e)', impostosCte.vBC),
    campoRodapePct('Alíquota ICMS (CT-e)', impostosCte.pICMS),
    campoRodape('ICMS (CT-e)', impostosCte.vICMS),
    campoRodape('IBS (CT-e)', impostosCte.vIBS),
    campoRodape('CBS (CT-e)', impostosCte.vCBS),
    campoRodape('Total do CT-e c/ impostos', impostosCte.vTotDFe),
    campoRodape('TDE', linha.tde),
    campoRodape('TDA', linha.tda),
    campoRodape('GRIS', linha.gris),
    campoRodape('Reentrega', linha.reentrega),
    campoRodape('Devolução', linha.devolucao),
    campoRodape('Outras Despesas', linha.outras_despesas),
    campoRodape('Valor Total do Frete', linha.valor_total_frete),
  ].join('');

  carregarComposicaoCte(linha.id);
  carregarCtesDaNota(linha.id);

  document.getElementById('painelDetalheAuditoria').classList.remove('oculto');
}

document.getElementById('btnFecharDetalheAuditoria').addEventListener('click', () => {
  document.getElementById('painelDetalheAuditoria').classList.add('oculto');
});
document.getElementById('painelDetalheAuditoria').addEventListener('click', (e) => {
  if (e.target.id === 'painelDetalheAuditoria') document.getElementById('painelDetalheAuditoria').classList.add('oculto');
});

// ---------- Exportar CSV/Excel ----------
document.getElementById('btnExportarAuditoriaCsv').addEventListener('click', () => {
  const cabecalho = ['Pedido', 'NF', 'CT-e', 'Cliente', 'Transportadora', 'Volumes', 'Valor Calculado', 'Valor Negociado', 'Diferença', 'Diferença %', 'Status'];
  const linhas = ultimasLinhasAuditoria.map((l) => {
    const divergente = Number(l.dif_negociado_tabela) !== 0;
    const status = l.carga_direta ? 'CARGA DIRETA' : (divergente ? 'DIVERGENTE' : 'OK');
    return [
      l.numero_pedido || '', l.numero_nf || '', l.numero_cte || '', l.cliente || '', l.transportadora || '',
      l.qtd_volumes ?? '', valorCalculadoPrincipal(l) ?? '', l.valor_frete_negociado ?? '', l.dif_negociado_tabela ?? '',
      l.diferenca_percentual ?? '', status,
    ];
  });

  const csv = [cabecalho, ...linhas]
    .map((linha) => linha.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';'))
    .join('\r\n');

  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `auditoria-frete-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
});

document.getElementById('btnImprimirAuditoria').addEventListener('click', () => {
  window.print();
});

// Exportação enxuta pro financeiro: só banco, vencimento e valor líquido acordado.
document.getElementById('btnExportarFinanceiro').addEventListener('click', async () => {
  try {
    const resposta = await apiFetch('/api/fretes/financeiro/exportar');
    const linhas = await resposta.json();
    if (!resposta.ok) { mostrarAlerta(linhas.erro || 'Erro ao exportar.'); return; }
    if (linhas.length === 0) {
      mostrarAlerta('Nenhum frete "Liberado p/ Pagamento" encontrado pra exportar.');
      return;
    }

    const cabecalho = ['Pedido', 'NF', 'CT-e', 'Transportadora', 'CNPJ', 'Banco', 'Agência', 'Conta', 'Tipo de Conta', 'Chave PIX', 'Vencimento', 'Valor Negociado', 'Glosa', 'Valor Líquido a Pagar'];
    const corpo = linhas.map((l) => [
      l.numero_pedido || '', l.numero_nf || '', l.numero_cte || '', l.transportadora || '', l.cnpj || '',
      l.banco || '', l.agencia || '', l.conta || '', l.tipo_conta || '', l.chave_pix || '',
      l.data_vencimento ? formatoData(l.data_vencimento) : '', l.valor_frete_negociado ?? '',
      l.glosa_valor ?? '', l.valor_liquido_acordado ?? '',
    ]);

    const csv = [cabecalho, ...corpo]
      .map((linha) => linha.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';'))
      .join('\r\n');

    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `exportacao-financeiro-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    mostrarAlerta('Falha de conexão com o servidor.');
  }
});

document.getElementById('btnAtualizarAuditoriaFrete').addEventListener('click', carregarAuditoriaFrete);

// ---------- Seletor de cidades por estado (usa a API pública do IBGE) ----------
const ESTADOS_BRASIL = [
  ['AC', 'Acre'], ['AL', 'Alagoas'], ['AP', 'Amapá'], ['AM', 'Amazonas'], ['BA', 'Bahia'],
  ['CE', 'Ceará'], ['DF', 'Distrito Federal'], ['ES', 'Espírito Santo'], ['GO', 'Goiás'],
  ['MA', 'Maranhão'], ['MT', 'Mato Grosso'], ['MS', 'Mato Grosso do Sul'], ['MG', 'Minas Gerais'],
  ['PA', 'Pará'], ['PB', 'Paraíba'], ['PR', 'Paraná'], ['PE', 'Pernambuco'], ['PI', 'Piauí'],
  ['RJ', 'Rio de Janeiro'], ['RN', 'Rio Grande do Norte'], ['RS', 'Rio Grande do Sul'],
  ['RO', 'Rondônia'], ['RR', 'Roraima'], ['SC', 'Santa Catarina'], ['SP', 'São Paulo'],
  ['SE', 'Sergipe'], ['TO', 'Tocantins'],
];

const seletorUf = document.getElementById('seletorUf');
seletorUf.innerHTML += ESTADOS_BRASIL.map(([sigla, nome]) => `<option value="${sigla}">${nome} (${sigla})</option>`).join('');

const painelSeletorCidades = document.getElementById('painelSeletorCidades');
const listaMunicipios = document.getElementById('listaMunicipios');
let inputCidadesAlvo = null;

// Municípios do IBGE: um estado por vez, ou todos de uma vez (pra buscar o
// município sem precisar escolher o estado). Fica guardado enquanto a tela
// estiver aberta, pra não baixar de novo.
const cacheMunicipios = {}; // { SP: [{ nome, uf }], '*': [...] }
let municipiosCarregados = [];
// Marcações feitas neste diálogo (não se perdem ao trocar a busca ou o estado).
let cidadesMarcadas = new Set();
let cidadesDesmarcadas = new Set();

const semAcento = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

painelSeletorCidades.addEventListener('click', (e) => {
  if (e.target === painelSeletorCidades) painelSeletorCidades.classList.add('oculto');
});

async function carregarMunicipios(uf) {
  if (cacheMunicipios[uf]) return cacheMunicipios[uf];
  // Pelo servidor (que guarda uma cópia — funciona até sem internet depois da 1ª vez).
  const resposta = await apiFetch(`/api/localidades/municipios?uf=${uf === '*' ? 'BR' : uf}`);
  const dados = await resposta.json();
  if (!resposta.ok) throw new Error(dados.erro || 'erro');
  if (dados.aviso) setTimeout(() => mostrarAlerta(dados.aviso, { tipo: 'info' }), 50);
  const lista = (dados.municipios || []).map((m) => ({ nome: m.nome, uf: m.uf || (uf === '*' ? '' : uf) }))
    .filter((m) => m.nome)
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR') || a.uf.localeCompare(b.uf));
  lista.forEach((m) => { m.chave = semAcento(m.nome); });
  cacheMunicipios[uf] = lista;
  return lista;
}

function abrirSeletorCidades(botao) {
  inputCidadesAlvo = botao.previousElementSibling; // o input .fx-cidades logo antes do botão
  cidadesMarcadas = new Set((inputCidadesAlvo.value || '').split(',').map((c) => c.trim()).filter(Boolean));
  cidadesDesmarcadas = new Set();

  // Já abre no estado do trecho, se o Destino terminar com a UF (ex: "CAPITAL - SP").
  const destino = botao.closest('tr')?.querySelector('.fx-destino')?.value || '';
  const ufDestino = (destino.toUpperCase().match(/\b([A-Z]{2})\s*$/) || [])[1];
  seletorUf.value = ESTADOS_BRASIL.some(([sigla]) => sigla === ufDestino) ? ufDestino : '*';

  document.getElementById('buscaMunicipio').value = '';
  painelSeletorCidades.classList.remove('oculto');
  trocarEstadoSeletor();
  setTimeout(() => document.getElementById('buscaMunicipio').focus(), 50);
}

async function trocarEstadoSeletor() {
  const uf = seletorUf.value || '*';
  municipiosCarregados = [];
  listaMunicipios.innerHTML = `<p style="color:var(--texto-fraco); font-size:13px; margin:0;">Carregando ${uf === '*' ? 'os municípios do Brasil' : 'os municípios'}...</p>`;
  try {
    municipiosCarregados = await carregarMunicipios(uf);
    renderizarListaMunicipios(document.getElementById('buscaMunicipio').value);
  } catch (err) {
    listaMunicipios.innerHTML = `<p style="color:var(--vermelho); font-size:13px; margin:0;">${cfEsc(err.message && err.message !== 'erro' ? err.message : 'Não consegui buscar os municípios.')} Você pode digitar as cidades direto no campo de texto.</p>`;
  }
}
seletorUf.addEventListener('change', trocarEstadoSeletor);

let municipiosVisiveis = [];
function renderizarListaMunicipios(filtro = '') {
  const todosEstados = (seletorUf.value || '*') === '*';
  const busca = semAcento(filtro);
  const info = document.getElementById('infoBuscaMunicipio');

  // Em "Todos os estados" são 5.570 municípios: só lista depois de digitar.
  if (todosEstados && busca.length < 2) {
    municipiosVisiveis = [];
    info.textContent = 'Digite pelo menos 2 letras do município.';
    listaMunicipios.innerHTML = '<p style="color:var(--texto-fraco); font-size:13px; margin:0;">Digite o nome do município acima para buscar em todos os estados, ou escolha um estado para ver a lista inteira.</p>';
    atualizarContadorSelecionadas();
    return;
  }

  // Primeiro os que começam com o que foi digitado, depois os que contêm.
  const comeca = [], contem = [];
  municipiosCarregados.forEach((m) => {
    if (!busca || m.chave.startsWith(busca)) comeca.push(m);
    else if (m.chave.includes(busca)) contem.push(m);
  });
  const encontrados = [...comeca, ...contem];
  const LIMITE = 300;
  municipiosVisiveis = encontrados.slice(0, LIMITE);
  info.textContent = encontrados.length > LIMITE
    ? `${encontrados.length} encontrados — mostrando os ${LIMITE} primeiros. Refine a busca.`
    : `${encontrados.length} município(s)${todosEstados ? ' em todos os estados' : ''}.`;

  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const marcada = (nome) => [...cidadesMarcadas].some((c) => semAcento(c) === semAcento(nome));
  listaMunicipios.innerHTML = municipiosVisiveis.map((m) => `
    <label style="display:flex; align-items:center; gap:8px; padding:5px 4px; font-size:13px; cursor:pointer;">
      <input type="checkbox" class="checkbox-municipio" value="${esc(m.nome)}" ${marcada(m.nome) ? 'checked' : ''} />
      <span style="flex:1;">${esc(m.nome)}</span>
      ${todosEstados ? `<span style="font-size:11px; font-weight:600; color:var(--texto-fraco); background:var(--bg-elevado); border-radius:4px; padding:1px 6px;">${m.uf}</span>` : ''}
    </label>
  `).join('') || '<p style="color:var(--texto-fraco); font-size:13px; margin:0;">Nenhum município encontrado.</p>';
  atualizarContadorSelecionadas();
}

function marcarCidade(nome, marcar) {
  const existente = [...cidadesMarcadas].find((c) => semAcento(c) === semAcento(nome));
  if (marcar) {
    if (!existente) cidadesMarcadas.add(nome);
    cidadesDesmarcadas.delete(semAcento(nome));
  } else if (existente) {
    cidadesMarcadas.delete(existente);
    cidadesDesmarcadas.add(semAcento(nome));
  }
}

listaMunicipios.addEventListener('change', (e) => {
  if (!e.target.classList.contains('checkbox-municipio')) return;
  marcarCidade(e.target.value, e.target.checked);
  atualizarContadorSelecionadas();
});

function atualizarContadorSelecionadas() {
  document.getElementById('contadorSelecionadas').textContent = cidadesMarcadas.size;
}

document.getElementById('buscaMunicipio').addEventListener('input', (e) => {
  renderizarListaMunicipios(e.target.value);
});
// Enter com um único resultado: marca ele e limpa a busca, pra já digitar o próximo.
document.getElementById('buscaMunicipio').addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  if (municipiosVisiveis.length === 1 || (municipiosVisiveis.length > 1 && semAcento(municipiosVisiveis[0].nome) === semAcento(e.target.value))) {
    marcarCidade(municipiosVisiveis[0].nome, true);
    e.target.value = '';
    renderizarListaMunicipios('');
  }
});

document.getElementById('btnMarcarVisiveisMunicipios').addEventListener('click', (e) => {
  e.preventDefault();
  municipiosVisiveis.forEach((m) => marcarCidade(m.nome, true));
  renderizarListaMunicipios(document.getElementById('buscaMunicipio').value);
});
document.getElementById('btnDesmarcarVisiveisMunicipios').addEventListener('click', (e) => {
  e.preventDefault();
  municipiosVisiveis.forEach((m) => marcarCidade(m.nome, false));
  renderizarListaMunicipios(document.getElementById('buscaMunicipio').value);
});

document.getElementById('btnCancelarSeletorCidades').addEventListener('click', () => {
  painelSeletorCidades.classList.add('oculto');
});

document.getElementById('btnAdicionarCidadesSelecionadas').addEventListener('click', () => {
  if (!inputCidadesAlvo) return;
  // Mantém a ordem que já existia, tira o que foi desmarcado e põe as novas no fim.
  const existentes = (inputCidadesAlvo.value || '').split(',').map((c) => c.trim()).filter(Boolean)
    .filter((c) => !cidadesDesmarcadas.has(semAcento(c)));
  const todas = [...existentes];
  cidadesMarcadas.forEach((nome) => {
    if (!todas.some((c) => semAcento(c) === semAcento(nome))) todas.push(nome);
  });
  inputCidadesAlvo.value = todas.join(', ');
  painelSeletorCidades.classList.add('oculto');
});

// ---------- Configuração de segurança (tempo de inatividade) ----------
async function carregarConfigSeguranca() {
  try {
    const resposta = await apiFetch('/api/seguranca/configuracao');
    if (!resposta.ok) return;
    const config = await resposta.json();
    document.getElementById('segTempoInatividade').value = config.tempo_inatividade_minutos ?? '';
  } catch (err) {
    console.error(err);
  }
}

document.getElementById('btnSalvarSeguranca').addEventListener('click', async () => {
  const erroEl = document.getElementById('erroSeguranca');
  erroEl.classList.remove('visivel');

  const valor = document.getElementById('segTempoInatividade').value;

  try {
    const resposta = await apiFetch('/api/seguranca/configuracao', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tempo_inatividade_minutos: valor === '' ? null : Number(valor) }),
    });
    const dados = await resposta.json();
    if (!resposta.ok) {
      erroEl.textContent = dados.erro || 'Erro ao salvar.';
      erroEl.classList.add('visivel');
      return;
    }
    // Aplica já nessa sessão também, sem precisar recarregar a página.
    reiniciarTemporizadorInatividade(dados.tempo_inatividade_minutos);
    mostrarSucessoTemporario(erroEl);
  } catch (err) {
    erroEl.textContent = 'Falha de conexão com o servidor.';
    erroEl.classList.add('visivel');
  }
});

// ---------- Configuração de Email (SMTP) ----------
async function carregarConfigEmail() {
  try {
    const resposta = await apiFetch('/api/email/configuracao');
    if (!resposta.ok) return;
    const c = await resposta.json();
    document.getElementById('emailAtivo').checked = !!c.ativo;
    document.getElementById('emailSmtpHost').value = c.smtp_host || '';
    document.getElementById('emailSmtpPorta').value = c.smtp_porta ?? 587;
    document.getElementById('emailSmtpSeguro').checked = !!c.smtp_seguro;
    document.getElementById('emailSmtpUsuario').value = c.smtp_usuario || '';
    document.getElementById('emailSmtpSenha').value = ''; // nunca volta a senha
    document.getElementById('emailNomeRemetente').value = c.nome_remetente || '';
    document.getElementById('emailRemetente').value = c.email_remetente || '';
    document.getElementById('resumoSemanalAtivo').checked = !!c.resumo_semanal_ativo;
    document.getElementById('resumoSemanalEmail').value = c.resumo_semanal_email || '';
  } catch (err) {
    console.error(err);
  }
}

document.getElementById('btnSalvarEmail').addEventListener('click', async () => {
  const erroEl = document.getElementById('erroEmail');
  erroEl.classList.remove('visivel');

  const corpo = {
    ativo: document.getElementById('emailAtivo').checked,
    smtp_host: document.getElementById('emailSmtpHost').value.trim() || null,
    smtp_porta: Number(document.getElementById('emailSmtpPorta').value) || 587,
    smtp_seguro: document.getElementById('emailSmtpSeguro').checked,
    smtp_usuario: document.getElementById('emailSmtpUsuario').value.trim() || null,
    nome_remetente: document.getElementById('emailNomeRemetente').value.trim() || null,
    email_remetente: document.getElementById('emailRemetente').value.trim() || null,
  };
  // Só manda a senha se o usuário digitou algo novo — assim não apaga a senha
  // já salva toda vez que a tela é reaberta (ela vem sempre em branco por segurança).
  const senhaDigitada = document.getElementById('emailSmtpSenha').value;
  if (senhaDigitada) corpo.smtp_senha = senhaDigitada;

  try {
    const resposta = await apiFetch('/api/email/configuracao', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
    });
    const dados = await resposta.json();
    if (!resposta.ok) {
      erroEl.textContent = dados.erro || 'Erro ao salvar.';
      erroEl.classList.add('visivel');
      return;
    }
    carregarConfigEmail();
    mostrarSucessoTemporario(erroEl);
  } catch (err) {
    erroEl.textContent = 'Falha de conexão com o servidor.';
    erroEl.classList.add('visivel');
  }
});

// ---------- Configuração de tolerância da auditoria ----------
async function carregarConfigAuditoria() {
  try {
    const resposta = await apiFetch('/api/auditoria-config');
    if (!resposta.ok) return;
    const c = await resposta.json();
    document.getElementById('audTolerValor').value = c.tolerancia_valor ?? 0;
    document.getElementById('audTolerPercentual').value = c.tolerancia_percentual ?? 0;
    document.getElementById('audLimiteAlcada').value = c.limite_alcada_aprovacao ? formatarMoedaExibicao(c.limite_alcada_aprovacao) : '';
    document.getElementById('audPctReentrega').value = c.percentual_reentrega ?? 50;
  } catch (err) {
    console.error(err);
  }
}

document.getElementById('btnSalvarAuditoriaConfig').addEventListener('click', async () => {
  const erroEl = document.getElementById('erroAuditoriaConfig');
  erroEl.classList.remove('visivel');

  const corpo = {
    tolerancia_valor: Number(document.getElementById('audTolerValor').value) || 0,
    tolerancia_percentual: Number(document.getElementById('audTolerPercentual').value) || 0,
    limite_alcada_aprovacao: paraNumeroMoeda(document.getElementById('audLimiteAlcada').value) || null,
    percentual_reentrega: document.getElementById('audPctReentrega').value === '' ? 50 : Number(document.getElementById('audPctReentrega').value),
  };

  try {
    const resposta = await apiFetch('/api/auditoria-config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
    });
    const dados = await resposta.json();
    if (!resposta.ok) {
      erroEl.textContent = dados.erro || 'Erro ao salvar.';
      erroEl.classList.add('visivel');
      return;
    }
    toleranciaAuditoria = dados; // já aplica nessa sessão também
    mostrarSucessoTemporario(erroEl);
  } catch (err) {
    erroEl.textContent = 'Falha de conexão com o servidor.';
    erroEl.classList.add('visivel');
  }
});

// ---------- Recalcular Tudo (Valor Frete Tabelado em massa) ----------
document.getElementById('btnRecalcularTudo').addEventListener('click', async () => {
  if (!(await confirmar('Isso vai recalcular o Valor Frete Tabelado de TODOS os registros do sistema, usando as Tabelas de Preço atuais. Pode levar alguns segundos.', { tipo: 'aviso', titulo: 'Recalcular todos os registros?', textoOk: 'Recalcular tudo' }))) return;

  const botao = document.getElementById('btnRecalcularTudo');
  const resultadoEl = document.getElementById('resultadoRecalcularTudo');
  botao.disabled = true;
  botao.textContent = 'Recalculando...';
  resultadoEl.textContent = 'Isso pode levar um tempinho, aguarde...';

  try {
    const resposta = await apiFetch('/api/fretes/recalcular-tudo', { method: 'POST' });
    const dados = await resposta.json();
    if (!resposta.ok) {
      resultadoEl.innerHTML = `<span style="color:var(--vermelho);">${dados.erro || 'Erro ao recalcular.'}</span>`;
      return;
    }
    resultadoEl.innerHTML = `
      <span style="color:var(--verde);">✓ Concluído!</span>
      ${dados.recalculados} de ${dados.total} registro(s) recalculado(s).<br>
      Não recalculados: ${dados.semTabela} sem tabela de preço da transportadora,
      ${dados.semCidade} sem cidade preenchida, ${dados.semTrecho} sem trecho correspondente às cidades cadastradas.
      ${dados.falhas ? `<div style="margin-top:8px; color:var(--vermelho);">⚠ ${dados.falhas} registro(s) não puderam ser atualizados:</div>
        <ul style="margin:4px 0 0; font-size:12px;">${(dados.falhasDetalhe || []).map((f) => `<li>NF ${cfEsc(f.numero_nf || '—')} · CT-e ${cfEsc(f.numero_cte || '—')} (#${f.id}, ${cfEsc(f.status || '—')} / aprovação ${cfEsc(f.status_aprovacao || '—')}): ${cfEsc(f.motivo)}</li>`).join('')}</ul>` : ''}
    `;
    carregarResumo();
    if (dados.semTabela > 0) carregarDiagnosticoTransportadoras();
  } catch (err) {
    resultadoEl.innerHTML = '<span style="color:var(--vermelho);">Falha de conexão com o servidor.</span>';
  } finally {
    botao.disabled = false;
    botao.textContent = 'Recalcular todos agora';
  }
});

// ---------- Diagnóstico: transportadoras com mais fretes parados ----------
async function carregarDiagnosticoTransportadoras() {
  try {
    const resposta = await apiFetch('/api/fretes/recalcular-tudo/diagnostico');
    if (!resposta.ok) return;
    const linhas = await resposta.json();

    document.getElementById('areaDiagnosticoTransportadoras').classList.remove('oculto');
    document.getElementById('corpoDiagnosticoTransportadoras').innerHTML = linhas.map((l) => `
      <tr>
        <td style="padding:4px 8px;">${l.transportadora}</td>
        <td style="padding:4px 8px; text-align:right; font-weight:600;">${l.qtd_fretes}</td>
        <td style="padding:4px 8px; text-align:center;">${l.tem_tabela ? '✓' : '<span style="color:var(--vermelho);">✕ Sem tabela</span>'}</td>
      </tr>
    `).join('') || '<tr><td colspan="3" style="color:var(--texto-fraco); padding:8px;">Nenhuma pendência encontrada.</td></tr>';
  } catch (err) {
    console.error(err);
  }
}

// ---------- Diagnosticar por que um registro não calculou ----------
document.getElementById('btnDiagnosticarCalculo').addEventListener('click', async () => {
  const resultadoEl = document.getElementById('resultadoCalculoFrete');
  if (!editandoRegistroId) {
    resultadoEl.textContent = 'Salve o registro primeiro pra poder diagnosticar.';
    return;
  }

  resultadoEl.textContent = 'Verificando...';
  try {
    const resposta = await apiFetch(`/api/fretes/${editandoRegistroId}/diagnosticar-calculo`);
    const dados = await resposta.json();
    if (!resposta.ok) { resultadoEl.innerHTML = `<span style="color:var(--vermelho);">${dados.erro}</span>`; return; }

    if (dados.ok) {
      resultadoEl.innerHTML = `<span style="color:var(--verde);">✓ Esse registro CONSEGUE calcular</span> (trecho: ${dados.trecho.origem || '?'} → ${dados.trecho.destino || '?'}, cidade usada: "${dados.cidadeUsada}"). Se ainda não calculou, clique em "Buscar trechos" e depois "Calcular e preencher".`;
    } else {
      resultadoEl.innerHTML = `<span style="color:var(--vermelho);">✕ Não calcula porque:</span> ${dados.motivo}`;
    }
  } catch (err) {
    resultadoEl.innerHTML = '<span style="color:var(--vermelho);">Falha de conexão com o servidor.</span>';
  }
});

// Apertar Enter num campo do formulário de registro pula pro próximo campo
// (igual Tab), pra agilizar quem digita muito rápido. Não mexe em textarea
// (Observações precisa do Enter pra quebrar linha) nem em botões.
document.getElementById('painelFormRegistro').addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  const alvo = e.target;
  if (alvo.tagName !== 'INPUT' && alvo.tagName !== 'SELECT') return;
  e.preventDefault();

  const focaveis = Array.from(
    document.getElementById('painelFormRegistro').querySelectorAll('input, select, textarea')
  ).filter((el) => !el.disabled && el.type !== 'hidden' && el.offsetParent !== null);

  const indiceAtual = focaveis.indexOf(alvo);
  if (indiceAtual >= 0 && indiceAtual < focaveis.length - 1) {
    const proximo = focaveis[indiceAtual + 1];
    proximo.focus();
    if (proximo.select) proximo.select();
  }
});

// ---------- Relatórios (gráficos desenhados sozinhos, sem biblioteca externa) ----------
// Feito com Canvas puro pra funcionar mesmo em computadores sem acesso à
// internet (nada de CDN — tudo roda local, dentro do próprio sistema).

function corTextoAtual() { return getComputedStyle(document.documentElement).getPropertyValue('--texto').trim() || '#333'; }
function corTextoFracoAtual() { return getComputedStyle(document.documentElement).getPropertyValue('--texto-fraco').trim() || '#8a94a6'; }
function corFundoCardAtual() { return getComputedStyle(document.documentElement).getPropertyValue('--bg-card').trim() || '#fff'; }

function truncarTextoGrafico(t, n) { return t && t.length > n ? t.slice(0, n - 1) + '…' : (t || '—'); }

// Guarda como cada gráfico foi desenhado, pra poder redesenhar ele igualzinho
// (só que maior) na hora de "Maximizar".
let graficosRegistrados = {};
function chamarGrafico(fn, canvasId, ...args) {
  graficosRegistrados[canvasId] = (destino) => {
    // No modal maximizado, aumenta a altura de verdade (não só a largura) —
    // cada função tem a "altura" numa posição diferente dos argumentos.
    const argsMaior = [...args];
    if (fn === desenharBarras) argsMaior[4] = 480; // (labels, valores, cor, horizontal, alturaPadrao, formatarValor)
    if (fn === desenharLinha) argsMaior[3] = 420;  // (labels, valores, cor, alturaPadrao, formatarEixoY)
    fn(destino, ...argsMaior);
  };
  fn(canvasId, ...args);
}

// Prepara o canvas pra desenhar nítido em qualquer tela (inclusive as de alta
// densidade de pixels), e limpa o desenho anterior.
function prepararCanvas(canvasId, alturaPadrao) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return null;
  const dpr = window.devicePixelRatio || 1;
  const larguraCss = canvas.parentElement.clientWidth || 400;
  const alturaCss = alturaPadrao || 220;
  canvas.style.width = larguraCss + 'px';
  canvas.style.height = alturaCss + 'px';
  canvas.width = Math.round(larguraCss * dpr);
  canvas.height = Math.round(alturaCss * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, larguraCss, alturaCss);
  return { ctx, largura: larguraCss, altura: alturaCss };
}

// ---------- Visual dos gráficos: cores, degradê, sombra e animação ----------

// Paleta viva. Cada nome (transportadora, cidade, UF...) sempre cai na mesma
// cor, em qualquer gráfico — assim dá pra reconhecer de relance.
const PALETA_GRAFICOS = ['#4d7cff', '#22c55e', '#f97316', '#a855f7', '#ef4444', '#06b6d4', '#eab308', '#ec4899', '#14b8a6', '#6366f1', '#84cc16', '#f43f5e'];
function indiceCorPorNome(nome) {
  const texto = String(nome || '');
  let h = 0;
  for (let i = 0; i < texto.length; i++) h = (h * 31 + texto.charCodeAt(i)) >>> 0;
  return h % PALETA_GRAFICOS.length;
}
function corPorNome(nome) { return PALETA_GRAFICOS[indiceCorPorNome(nome)]; }
// Cores de uma lista de nomes: cada um fica com a "sua" cor, mas se dois
// caírem na mesma dentro do mesmo gráfico, o segundo pula pra próxima livre.
function coresPorNomes(nomes) {
  const usadas = new Set();
  return nomes.map((nome) => {
    let i = indiceCorPorNome(nome);
    for (let t = 0; t < PALETA_GRAFICOS.length && usadas.has(i); t++) i = (i + 1) % PALETA_GRAFICOS.length;
    usadas.add(i);
    return PALETA_GRAFICOS[i];
  });
}

// Clareia (fator > 0) ou escurece (fator < 0) uma cor. Aceita #hex e var(--x).
function ajustarCor(cor, fator) {
  let c = String(cor || '#888').trim();
  if (c.startsWith('var(')) {
    c = getComputedStyle(document.documentElement).getPropertyValue(c.slice(4, -1).trim()).trim() || '#888';
  }
  let hex = c.replace('#', '');
  if (hex.length === 3) hex = hex.split('').map((x) => x + x).join('');
  if (!/^[0-9a-f]{6}$/i.test(hex)) return c;
  const n = parseInt(hex, 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const alvo = fator >= 0 ? 255 : 0;
  const f = Math.abs(fator);
  r = Math.round(r + (alvo - r) * f); g = Math.round(g + (alvo - g) * f); b = Math.round(b + (alvo - b) * f);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}
function corComAlfa(cor, alfa) {
  const hex = ajustarCor(cor, 0).replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(hex)) return cor;
  const n = parseInt(hex, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alfa})`;
}

function caminhoRetanguloArredondado(ctx, x, y, w, h, raios) {
  const [tl, tr, br, bl] = raios.map((r) => Math.max(0, Math.min(r, w / 2, h / 2)));
  ctx.beginPath();
  ctx.moveTo(x + tl, y);
  ctx.lineTo(x + w - tr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + tr);
  ctx.lineTo(x + w, y + h - br);
  ctx.quadraticCurveTo(x + w, y + h, x + w - br, y + h);
  ctx.lineTo(x + bl, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - bl);
  ctx.lineTo(x, y + tl);
  ctx.quadraticCurveTo(x, y, x + tl, y);
  ctx.closePath();
}

// Animação de entrada (as barras crescem, a rosca gira, a linha se desenha).
// Não anima ao redimensionar a janela nem pra quem pediu menos movimento no sistema.
const animacoesGraficos = {};
let graficosSemAnimacaoAte = 0;
function animarGrafico(canvasId, desenhar) {
  cancelAnimationFrame(animacoesGraficos[canvasId]);
  const semAnimacao = Date.now() < graficosSemAnimacaoAte ||
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (semAnimacao) { desenhar(1); return; }
  const duracao = 750;
  const inicio = performance.now();
  const passo = (agora) => {
    const t = Math.min(1, (agora - inicio) / duracao);
    desenhar(1 - Math.pow(1 - t, 3)); // desacelera no final
    if (t < 1) animacoesGraficos[canvasId] = requestAnimationFrame(passo);
  };
  animacoesGraficos[canvasId] = requestAnimationFrame(passo);
}

// Contexto só pra medir texto antes de dimensionar o canvas.
const medidorTextoGraficos = document.createElement('canvas').getContext('2d');
function larguraTexto(texto, fonte) {
  medidorTextoGraficos.font = fonte;
  return medidorTextoGraficos.measureText(String(texto ?? '')).width;
}
// Quebra um texto em linhas que caibam em larguraMax (por palavra; se uma
// palavra sozinha não couber, quebra ela no meio).
function quebrarTexto(texto, larguraMax, fonte) {
  const palavras = String(texto ?? '—').split(/\s+/).filter(Boolean);
  const linhas = [];
  let atual = '';
  const cabe = (t) => larguraTexto(t, fonte) <= larguraMax;
  palavras.forEach((palavra) => {
    const tentativa = atual ? `${atual} ${palavra}` : palavra;
    if (cabe(tentativa)) { atual = tentativa; return; }
    if (atual) linhas.push(atual);
    atual = '';
    let resto = palavra;
    while (!cabe(resto) && resto.length > 1) {
      let n = resto.length - 1;
      while (n > 1 && !cabe(resto.slice(0, n))) n--;
      linhas.push(resto.slice(0, n));
      resto = resto.slice(n);
    }
    atual = resto;
  });
  if (atual) linhas.push(atual);
  return linhas.length ? linhas : ['—'];
}

function textoSemDados(ctx, largura, altura) {
  ctx.fillStyle = corTextoFracoAtual();
  ctx.font = '12px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('Sem dados ainda.', largura / 2, altura / 2);
}

// Gráfico de rosca, com degradê nas fatias, sombra, total no centro e legenda embaixo.
function desenharRosca(canvasId, labels, valores, cores, formatarValor) {
  const larguraDisponivel = document.getElementById(canvasId)?.parentElement.clientWidth || 260;
  const tamanho = Math.min(larguraDisponivel, 420);
  // Legenda: cada item quebra em quantas linhas precisar pra caber na largura.
  const fonteLegenda = '11.5px sans-serif';
  const somaPrevia = valores.reduce((a, v) => a + v, 0) || 1;
  const fmtPrevio = (v) => (formatarValor ? formatarValor(v) : v.toLocaleString('pt-BR'));
  const textosLegenda = labels.map((l, i) =>
    `${l}: ${fmtPrevio(valores[i])} (${((valores[i] / somaPrevia) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%)`);
  const larguraTextoMax = Math.max(60, larguraDisponivel - 16 - 16);
  const linhasLegenda = textosLegenda.map((t) => quebrarTexto(t, larguraTextoMax, fonteLegenda));
  const alturaLegenda = linhasLegenda.reduce((a, ls) => a + ls.length * 15 + 5, 0);
  const alturaTotal = tamanho + alturaLegenda + 20;
  const p = prepararCanvas(canvasId, alturaTotal);
  if (!p) return;
  const { ctx, largura, altura } = p;

  const soma = valores.reduce((s, v) => s + v, 0);
  if (!soma) { textoSemDados(ctx, largura, tamanho); return; }
  const cx = largura / 2, cy = tamanho / 2;
  const raioExterno = Math.min(cx, cy) * 0.8;
  const raioInterno = raioExterno * 0.58;
  const corTexto = corTextoAtual();
  const corFraca = corTextoFracoAtual();
  const fundo = corFundoCardAtual();
  const coresReserva = coresPorNomes(labels);
  const coresFatias = labels.map((l, i) => cores[i] || coresReserva[i]);
  const fmt = (v) => (formatarValor ? formatarValor(v) : v.toLocaleString('pt-BR'));

  animarGrafico(canvasId, (prog) => {
    ctx.clearRect(0, 0, largura, altura);

    // Fatias (desenhadas com sombra, pra "saltarem" do fundo).
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.28)';
    ctx.shadowBlur = 14;
    ctx.shadowOffsetY = 5;
    let angulo = -Math.PI / 2;
    const giroTotal = 2 * Math.PI * prog;
    valores.forEach((v, i) => {
      const fatia = (v / soma) * giroTotal;
      if (fatia <= 0) return;
      const grad = ctx.createRadialGradient(cx, cy - raioExterno * 0.3, raioInterno * 0.5, cx, cy, raioExterno);
      grad.addColorStop(0, ajustarCor(coresFatias[i], 0.35));
      grad.addColorStop(1, ajustarCor(coresFatias[i], -0.12));
      ctx.beginPath();
      ctx.arc(cx, cy, raioExterno, angulo, angulo + fatia);
      ctx.arc(cx, cy, raioInterno, angulo + fatia, angulo, true);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();
      angulo += fatia;
    });
    ctx.restore();

    // Linhas finas separando as fatias.
    if (valores.filter((v) => v > 0).length > 1) {
      ctx.strokeStyle = fundo;
      ctx.lineWidth = 2;
      let a = -Math.PI / 2;
      valores.forEach((v) => {
        a += (v / soma) * 2 * Math.PI * prog;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * (raioInterno - 1), cy + Math.sin(a) * (raioInterno - 1));
        ctx.lineTo(cx + Math.cos(a) * (raioExterno + 1), cy + Math.sin(a) * (raioExterno + 1));
        ctx.stroke();
      });
    }

    // Brilho sutil na borda de cima do anel.
    const brilho = ctx.createLinearGradient(0, cy - raioExterno, 0, cy);
    brilho.addColorStop(0, 'rgba(255,255,255,0.18)');
    brilho.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.beginPath();
    ctx.arc(cx, cy, raioExterno, Math.PI, 2 * Math.PI); // metade de cima
    ctx.arc(cx, cy, raioInterno, 2 * Math.PI, Math.PI, true);
    ctx.closePath();
    ctx.fillStyle = brilho;
    ctx.globalAlpha = prog;
    ctx.fill();
    ctx.globalAlpha = 1;

    // Total no centro.
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = corFraca;
    ctx.font = '11px sans-serif';
    ctx.fillText('Total', cx, cy - 11);
    ctx.fillStyle = corTexto;
    const textoTotal = String(fmt(soma));
    let tamanhoFonte = 18;
    ctx.font = `bold ${tamanhoFonte}px sans-serif`;
    while (ctx.measureText(textoTotal).width > raioInterno * 1.7 && tamanhoFonte > 10) {
      tamanhoFonte -= 1;
      ctx.font = `bold ${tamanhoFonte}px sans-serif`;
    }
    ctx.fillText(textoTotal, cx, cy + 8);

    // Legenda: bolinha colorida, nome, valor e % — centralizada como bloco,
    // sem nunca passar da borda (textos longos quebram de linha).
    ctx.font = fonteLegenda;
    ctx.textAlign = 'left';
    const maiorLinha = Math.max(...linhasLegenda.flat().map((t) => ctx.measureText(t).width));
    const xBolinha = Math.max(8, (largura - (maiorLinha + 16)) / 2) + 5;
    let ly = tamanho + 14;
    linhasLegenda.forEach((linhas, i) => {
      ctx.beginPath();
      ctx.arc(xBolinha, ly, 5.5, 0, 2 * Math.PI);
      ctx.fillStyle = coresFatias[i];
      ctx.fill();
      ctx.fillStyle = corTexto;
      linhas.forEach((t) => { ctx.fillText(t, xBolinha + 11, ly); ly += 15; });
      ly += 5;
    });
  });
}

// Gráfico de barras — horizontal (pra listas com nomes longos) ou vertical.
// Cada barra tem a cor do seu nome, com degradê, brilho e sombra.
function desenharBarras(canvasId, labels, valores, cor, horizontal, alturaPadrao, formatarValor) {
  // Altura proporcional à quantidade de itens (barras horizontais) ou ao
  // tamanho do maior nome (barras verticais) — pra nunca sobrar espaço vazio
  // nem cortar informação.
  // Tudo medido antes de dimensionar, pra todos os nomes caberem inteiros.
  const larguraTela = document.getElementById(canvasId)?.parentElement.clientWidth || 400;
  const fonteNome = '11px sans-serif';
  const larguraNomes = labels.map((l) => larguraTexto(l || '—', fonteNome));
  const maiorNomePx = Math.max(...larguraNomes, 30);

  // Horizontal: coluna de nomes com até 45% da largura; nome maior que isso quebra em linhas.
  const margemEsquerdaH = Math.min(larguraTela * 0.45, Math.max(70, maiorNomePx + 16));
  const linhasNomesH = labels.map((l) => quebrarTexto(l || '—', margemEsquerdaH - 14, fonteNome));
  const alturasLinhaH = linhasNomesH.map((ls) => Math.max(30, ls.length * 13 + 14));
  // Vertical: nomes em pé, embaixo da barra; a margem de baixo é do tamanho do maior.
  const margemBaixoV = Math.max(40, maiorNomePx + 18);

  const alturaCalculada = horizontal
    ? Math.max(70, alturasLinhaH.reduce((a, h) => a + h, 0) + 10)
    : Math.max(alturaPadrao, margemBaixoV + 150);
  const p = prepararCanvas(canvasId, alturaCalculada);
  if (!p) return;
  const { ctx, largura, altura } = p;
  if (!labels.length) { textoSemDados(ctx, largura, altura); return; }

  const max = Math.max(...valores, 1);
  const corTexto = corTextoFracoAtual();
  const corTextoForte = corTextoAtual();
  const coresBarras = coresPorNomes(labels);
  const fmt = (v) => (formatarValor ? formatarValor(v) : v);

  const pintarBarra = (x, y, w, h, corBase) => {
    if (w <= 0 || h <= 0) return;
    const grad = horizontal ? ctx.createLinearGradient(0, y, 0, y + h) : ctx.createLinearGradient(x, 0, x + w, 0);
    grad.addColorStop(0, ajustarCor(corBase, 0.28));
    grad.addColorStop(0.55, corBase);
    grad.addColorStop(1, ajustarCor(corBase, -0.22));
    const raio = Math.min(6, (horizontal ? h : w) / 2);
    const raios = horizontal ? [0, raio, raio, 0] : [raio, raio, 0, 0];

    ctx.save();
    ctx.shadowColor = corComAlfa(corBase, 0.45);
    ctx.shadowBlur = 10;
    ctx.shadowOffsetX = horizontal ? 2 : 0;
    ctx.shadowOffsetY = horizontal ? 3 : 2;
    caminhoRetanguloArredondado(ctx, x, y, w, h, raios);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.restore();

    // Faixa de brilho, dando volume.
    ctx.save();
    caminhoRetanguloArredondado(ctx, x, y, w, h, raios);
    ctx.clip();
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    if (horizontal) ctx.fillRect(x, y, w, h * 0.38);
    else ctx.fillRect(x, y, w * 0.38, h);
    ctx.restore();
  };

  if (horizontal) {
    const margemEsquerda = margemEsquerdaH;
    const margemDireita = Math.max(...valores.map((v) => larguraTexto(fmt(v), 'bold 11px sans-serif')), 20) + 14;
    const larguraDisponivel = Math.max(20, largura - margemEsquerda - margemDireita);
    const inicios = [];
    alturasLinhaH.reduce((acc, h) => { inicios.push(acc); return acc + h; }, 5);

    animarGrafico(canvasId, (prog) => {
      ctx.clearRect(0, 0, largura, altura);
      labels.forEach((l, i) => {
        const espaco = alturasLinhaH[i];
        const alturaBarra = Math.min(22, Math.max(12, espaco * 0.55));
        const y = inicios[i] + (espaco - alturaBarra) / 2;
        const larguraBarra = Math.max(3, (valores[i] / max) * larguraDisponivel) * prog;

        // Trilho de fundo bem suave, mostrando o "100%".
        caminhoRetanguloArredondado(ctx, margemEsquerda, y, larguraDisponivel, alturaBarra, [0, 6, 6, 0]);
        ctx.fillStyle = corComAlfa(corTexto, 0.07);
        ctx.fill();

        pintarBarra(margemEsquerda, y, larguraBarra, alturaBarra, coresBarras[i]);

        // Nome (em uma ou mais linhas), alinhado à direita, centrado na barra.
        ctx.font = fonteNome;
        ctx.fillStyle = corTexto;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        const linhas = linhasNomesH[i];
        const yPrimeira = y + alturaBarra / 2 - ((linhas.length - 1) * 13) / 2;
        linhas.forEach((t, k) => ctx.fillText(t, margemEsquerda - 8, yPrimeira + k * 13));

        ctx.globalAlpha = prog;
        ctx.fillStyle = corTextoForte;
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(fmt(valores[i]), margemEsquerda + larguraBarra + 6, y + alturaBarra / 2);
        ctx.globalAlpha = 1;
      });
    });
  } else {
    const margemTopo = 22;
    // A margem debaixo (onde fica o nome em pé) já veio medida lá em cima,
    // do tamanho exato do maior nome — por isso nenhum nome é cortado.
    const margemBaixo = margemBaixoV;
    const espacamento = (largura - 20) / labels.length;
    const larguraBarra = Math.min(46, espacamento * 0.62);
    const alturaDisponivel = altura - margemBaixo - margemTopo;
    const base = margemTopo + alturaDisponivel;

    animarGrafico(canvasId, (prog) => {
      ctx.clearRect(0, 0, largura, altura);

      // Linhas de grade bem leves.
      ctx.strokeStyle = corComAlfa(corTexto, 0.12);
      ctx.lineWidth = 1;
      [0.25, 0.5, 0.75, 1].forEach((f) => {
        const gy = Math.round(base - alturaDisponivel * f) + 0.5;
        ctx.beginPath(); ctx.moveTo(10, gy); ctx.lineTo(largura - 10, gy); ctx.stroke();
      });

      ctx.font = '11px sans-serif';
      labels.forEach((l, i) => {
        const x = 10 + i * espacamento + (espacamento - larguraBarra) / 2;
        const alturaBarra = Math.max(3, (valores[i] / max) * alturaDisponivel) * prog;
        const y = base - alturaBarra;
        pintarBarra(x, y, larguraBarra, alturaBarra, coresBarras[i]);

        // Valor escrito em cima da barra, pra sempre mostrar a informação
        // mesmo sem precisar passar o mouse em cima.
        ctx.globalAlpha = prog;
        ctx.fillStyle = corTextoForte;
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(fmt(valores[i]), x + larguraBarra / 2, y - 4);
        ctx.globalAlpha = 1;
        ctx.font = '11px sans-serif';

        ctx.save();
        ctx.fillStyle = corTexto;
        ctx.translate(x + larguraBarra / 2, altura - margemBaixo + 10);
        ctx.rotate(-Math.PI / 2); // em pé: não invade a lateral nem o nome vizinho
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(l || '—', 0, 0); // nome completo, sem cortar
        ctx.restore();
      });
    });
  }
}

// Gráfico de linha, com área em degradê embaixo, linha com brilho e pontos destacados.
function desenharLinha(canvasId, labels, valores, cor, alturaPadrao, formatarEixoY) {
  const p = prepararCanvas(canvasId, alturaPadrao);
  if (!p) return;
  const { ctx, largura, altura } = p;
  if (!valores.length) { textoSemDados(ctx, largura, altura); return; }

  const corTexto = corTextoFracoAtual();
  const corTextoForte = corTextoAtual();
  const fundo = corFundoCardAtual();
  const corLinha = ajustarCor(cor, 0);
  const margemEsquerda = 46, margemDireita = 28, margemTopo = 26, margemBaixo = 30;
  const fmt = (v) => (formatarEixoY ? formatarEixoY(v) : `${v}%`);

  // Com um ponto só não dá pra desenhar linha nenhuma (fica em branco) — em
  // vez disso, mostra só o ponto e o valor bem visível.
  if (valores.length === 1) {
    const cx = margemEsquerda + (largura - margemEsquerda - margemDireita) / 2;
    const cy = (altura - margemBaixo + margemTopo) / 2;
    ctx.save();
    ctx.shadowColor = corComAlfa(corLinha, 0.6);
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(cx, cy, 6, 0, 2 * Math.PI);
    ctx.fillStyle = corLinha;
    ctx.fill();
    ctx.restore();
    ctx.font = 'bold 14px sans-serif';
    ctx.fillStyle = corTextoForte;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(fmt(valores[0]), cx, cy - 10);
    ctx.font = '11px sans-serif';
    ctx.fillStyle = corTexto;
    ctx.textBaseline = 'top';
    ctx.fillText(labels[0] || '', cx, cy + 10);
    return;
  }

  const max = Math.max(...valores, 0.01);
  const min = Math.min(...valores, 0);
  const larguraGrafico = largura - margemEsquerda - margemDireita;
  const alturaGrafico = altura - margemTopo - margemBaixo;
  const passo = larguraGrafico / (valores.length - 1);
  const escala = (v) => margemTopo + alturaGrafico - ((v - min) / (max - min || 1)) * alturaGrafico;
  const pontos = valores.map((v, i) => ({ x: margemEsquerda + i * passo, y: escala(v) }));
  const base = altura - margemBaixo;
  const passoLabel = Math.max(1, Math.ceil(labels.length / 8));
  const limiteInferiorRotulo = base - 16;

  animarGrafico(canvasId, (prog) => {
    ctx.clearRect(0, 0, largura, altura);

    // Grade leve + valores do eixo.
    ctx.strokeStyle = corComAlfa(corTexto, 0.12);
    ctx.lineWidth = 1;
    [0, 0.5, 1].forEach((f) => {
      const gy = Math.round(margemTopo + alturaGrafico * f) + 0.5;
      ctx.beginPath(); ctx.moveTo(margemEsquerda, gy); ctx.lineTo(largura - margemDireita, gy); ctx.stroke();
    });
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = corTexto;
    ctx.fillText(formatarEixoY ? formatarEixoY(max) : `${max.toFixed(1)}%`, margemEsquerda - 6, margemTopo + 4);
    ctx.fillText(formatarEixoY ? formatarEixoY(min) : `${min.toFixed(1)}%`, margemEsquerda - 6, base);

    // A linha "se desenha" da esquerda pra direita.
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, margemEsquerda + larguraGrafico * prog + 1, altura);
    ctx.clip();

    const area = ctx.createLinearGradient(0, margemTopo, 0, base);
    area.addColorStop(0, corComAlfa(corLinha, 0.42));
    area.addColorStop(1, corComAlfa(corLinha, 0.02));
    ctx.beginPath();
    pontos.forEach((pt, i) => (i === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)));
    ctx.lineTo(pontos[pontos.length - 1].x, base);
    ctx.lineTo(pontos[0].x, base);
    ctx.closePath();
    ctx.fillStyle = area;
    ctx.fill();

    const traco = ctx.createLinearGradient(margemEsquerda, 0, largura - margemDireita, 0);
    traco.addColorStop(0, ajustarCor(corLinha, 0.25));
    traco.addColorStop(1, ajustarCor(corLinha, -0.1));
    ctx.shadowColor = corComAlfa(corLinha, 0.55);
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 3;
    ctx.beginPath();
    pontos.forEach((pt, i) => (i === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)));
    ctx.strokeStyle = traco;
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.restore();

    // Ponto + valor em cada marco (pula alguns se tiver muitos pontos, pra
    // não virar uma bagunça de números grudados). O rótulo do valor nunca fica
    // mais perto do que 16px do eixo/mês debaixo.
    const limiteX = margemEsquerda + larguraGrafico * prog + 1;
    pontos.forEach((pt, i) => {
      if (pt.x > limiteX) return;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 4, 0, 2 * Math.PI);
      ctx.fillStyle = fundo;
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = corLinha;
      ctx.stroke();
      if (i % passoLabel === 0 || i === valores.length - 1) {
        ctx.fillStyle = corTextoForte;
        ctx.font = 'bold 10px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(fmt(valores[i]), pt.x, Math.min(pt.y - 7, limiteInferiorRotulo));
      }
    });

    ctx.textBaseline = 'alphabetic';
    ctx.font = '10px sans-serif';
    ctx.fillStyle = corTexto;
    labels.forEach((l, i) => {
      if (i % passoLabel === 0 || i === labels.length - 1) {
        // Primeiro rótulo encosta na esquerda, último na direita, os do meio
        // ficam centralizados — assim nenhum extrapola a borda do gráfico.
        ctx.textAlign = i === 0 ? 'left' : (i === labels.length - 1 ? 'right' : 'center');
        ctx.fillText(l, margemEsquerda + i * passo, altura - 8);
      }
    });
  });
}

// Barras horizontais empilhadas (ex: por cidade, quanto foi via redespacho e
// quanto foi direto ao cliente). series = [{ nome, cor, valores: [...] }].
// Mesmas regras das outras barras: todo nome cabe, gráfico cresce na altura.
function desenharBarrasEmpilhadas(canvasId, labels, series, formatarValor) {
  const fmtV = (v) => (formatarValor ? formatarValor(v) : v);
  const larguraTela = document.getElementById(canvasId)?.parentElement.clientWidth || 400;
  const fonteNome = '11px sans-serif';
  const totais = labels.map((_, i) => series.reduce((s, se) => s + (se.valores[i] || 0), 0));
  const maiorNomePx = Math.max(...labels.map((l) => larguraTexto(l || '—', fonteNome)), 30);
  const margemEsquerda = Math.min(larguraTela * 0.45, Math.max(70, maiorNomePx + 16));
  const linhasNomes = labels.map((l) => quebrarTexto(l || '—', margemEsquerda - 14, fonteNome));
  const alturasLinha = linhasNomes.map((ls) => Math.max(32, ls.length * 13 + 16));
  const alturaLegenda = 28;
  const alturaCalculada = Math.max(70, alturaLegenda + alturasLinha.reduce((a, h) => a + h, 0) + 10);

  const p = prepararCanvas(canvasId, alturaCalculada);
  if (!p) return;
  const { ctx, largura, altura } = p;
  if (!labels.length) { textoSemDados(ctx, largura, altura); return; }

  const corTexto = corTextoFracoAtual();
  const corTextoForte = corTextoAtual();
  const max = Math.max(...totais, 1);
  const margemDireita = Math.max(...totais.map((t) => larguraTexto(fmtV(t), 'bold 11px sans-serif')), 16) + 14;
  const larguraDisponivel = Math.max(20, largura - margemEsquerda - margemDireita);
  const inicios = [];
  alturasLinha.reduce((acc, h) => { inicios.push(acc); return acc + h; }, alturaLegenda + 4);

  animarGrafico(canvasId, (prog) => {
    ctx.clearRect(0, 0, largura, altura);

    // Legenda no topo.
    ctx.font = '11.5px sans-serif';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    let lx = margemEsquerda;
    series.forEach((se) => {
      caminhoRetanguloArredondado(ctx, lx, 7, 12, 12, [3, 3, 3, 3]);
      ctx.fillStyle = se.cor;
      ctx.fill();
      ctx.fillStyle = corTextoForte;
      ctx.fillText(se.nome, lx + 17, 13);
      lx += 17 + ctx.measureText(se.nome).width + 22;
    });

    labels.forEach((l, i) => {
      const espaco = alturasLinha[i];
      const alturaBarra = Math.min(22, Math.max(14, espaco * 0.55));
      const y = inicios[i] + (espaco - alturaBarra) / 2;
      const larguraTotal = Math.max(3, (totais[i] / max) * larguraDisponivel) * prog;
      const raios = [0, 6, 6, 0];

      // Trilho de fundo.
      caminhoRetanguloArredondado(ctx, margemEsquerda, y, larguraDisponivel, alturaBarra, raios);
      ctx.fillStyle = corComAlfa(corTexto, 0.07);
      ctx.fill();

      // Sombra da barra inteira.
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.35)';
      ctx.shadowBlur = 8;
      ctx.shadowOffsetY = 3;
      caminhoRetanguloArredondado(ctx, margemEsquerda, y, larguraTotal, alturaBarra, raios);
      ctx.fillStyle = series[0].cor;
      ctx.fill();
      ctx.restore();

      // Segmentos, recortados pelo formato arredondado da barra.
      ctx.save();
      caminhoRetanguloArredondado(ctx, margemEsquerda, y, larguraTotal, alturaBarra, raios);
      ctx.clip();
      let x = margemEsquerda;
      series.forEach((se) => {
        const v = se.valores[i] || 0;
        if (!v) return;
        const w = (v / totais[i]) * larguraTotal;
        const grad = ctx.createLinearGradient(0, y, 0, y + alturaBarra);
        grad.addColorStop(0, ajustarCor(se.cor, 0.28));
        grad.addColorStop(0.55, se.cor);
        grad.addColorStop(1, ajustarCor(se.cor, -0.22));
        ctx.fillStyle = grad;
        ctx.fillRect(x, y, w + 0.5, alturaBarra);
        // Quantidade dentro do pedaço, quando couber.
        ctx.font = 'bold 10.5px sans-serif';
        if (prog === 1 && ctx.measureText(fmtV(v)).width + 8 < w) {
          ctx.fillStyle = '#fff';
          ctx.textAlign = 'center';
          ctx.fillText(fmtV(v), x + w / 2, y + alturaBarra / 2);
        }
        x += w;
      });
      ctx.fillStyle = 'rgba(255,255,255,0.14)';
      ctx.fillRect(margemEsquerda, y, larguraTotal, alturaBarra * 0.38);
      ctx.restore();

      // Nome da cidade (uma ou mais linhas) e total no fim da barra.
      ctx.font = fonteNome;
      ctx.fillStyle = corTexto;
      ctx.textAlign = 'right';
      const linhas = linhasNomes[i];
      const yPrimeira = y + alturaBarra / 2 - ((linhas.length - 1) * 13) / 2;
      linhas.forEach((t, k) => ctx.fillText(t, margemEsquerda - 8, yPrimeira + k * 13));

      ctx.globalAlpha = prog;
      ctx.fillStyle = corTextoForte;
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(fmtV(totais[i]), margemEsquerda + larguraTotal + 6, y + alturaBarra / 2);
      ctx.globalAlpha = 1;
    });
  });
}

// Relatórios: entregas previstas (fretes sem entrega registrada).
const epEstado = { dados: null, aba: 'atrasadas', faixa: '' };
async function carregarEntregasPrevistas() {
  let d;
  try {
    const resposta = await apiFetch('/api/fretes/relatorios/entregas-previstas');
    d = await resposta.json();
    if (!resposta.ok) throw new Error(d.erro);
  } catch (err) {
    document.getElementById('epResumo').innerHTML = '<span style="color:var(--vermelho); font-size:12px;">Não foi possível carregar as entregas previstas.</span>';
    return;
  }
  epEstado.dados = d;
  const r = d.resumo || {};
  const sla = r.sla_mes || {};
  const pctSla = sla.total ? (sla.no_prazo / sla.total) * 100 : null;
  document.getElementById('epResumo').innerHTML = `
    <div style="border-left-color:#ef4444;">Atrasadas, sem entrega<strong style="color:${r.atrasadas ? 'var(--vermelho)' : 'inherit'};">${(r.atrasadas || 0).toLocaleString('pt-BR')}</strong></div>
    <div style="border-left-color:#f59e0b;">Previstas para hoje<strong>${(r.hoje || 0).toLocaleString('pt-BR')}</strong></div>
    <div>Próximos 7 dias<strong>${(r.proximos_7 || 0).toLocaleString('pt-BR')}</strong></div>
    <div style="border-left-color:#8a94a6;">Depois disso<strong>${(r.depois || 0).toLocaleString('pt-BR')}</strong></div>
    <div style="border-left-color:#8a94a6;">Com CT-e e sem previsão<strong>${(r.sem_previsao || 0).toLocaleString('pt-BR')}</strong></div>
    <div style="border-left-color:#22c55e;">Entregues no prazo (mês)<strong>${pctSla == null ? '—' : `${pctSla.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`}${sla.total ? ` <small style="font-size:11px; color:var(--texto-fraco);">de ${sla.total}</small>` : ''}</strong></div>`;

  const dias = d.por_dia || [];
  const rotuloDia = (iso) => {
    const dt = new Date(`${iso}T12:00:00`);
    return `${dt.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')} ${dt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}`;
  };
  chamarGrafico(desenharBarras, 'graficoEpDias', dias.map((x, i) => (i === 0 ? `hoje ${rotuloDia(x.data).split(' ')[1]}` : rotuloDia(x.data))), dias.map((x) => x.qtd), null, false, 220);
  const t = d.por_transportadora || [];
  chamarGrafico(desenharBarras, 'graficoEpTransp', t.map((x) => x.transportadora), t.map((x) => x.qtd), null, true, 300);

  const seletor = document.getElementById('epTransportadora');
  const escolhida = seletor.value;
  const nomes = [...new Set((d.lista || []).map((x) => x.transportadora).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  seletor.innerHTML = '<option value="">Todas as transportadoras</option>' + nomes.map((n) => `<option value="${cfEsc(n)}">${cfEsc(n)}</option>`).join('');
  if (nomes.includes(escolhida)) seletor.value = escolhida;
  epRenderizarLista();
}

// Busca por NF, CT-e, pedido ou cliente. Com algo digitado, procura em todas as
// abas (atrasadas, hoje, próximos) — o selo da linha mostra a situação.
const epSemAcento = (v) => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
const epSemZeros = (v) => String(v || '').replace(/\D/g, '').replace(/^0+/, '');
function epBate(x, termo) {
  const numero = epSemZeros(termo);
  if (numero && /^\d[\d.\-\/ ]*$/.test(termo.trim())) {
    return [x.numero_nf, x.numero_cte, x.numero_pedido, x.pedido_mercus].some((v) => epSemZeros(v) && epSemZeros(v).includes(numero));
  }
  const t = epSemAcento(termo).trim();
  return [x.cliente, x.numero_nf, x.numero_cte, x.numero_pedido, x.cidade].some((v) => epSemAcento(v).includes(t));
}
function epLinhasFiltradas() {
  const lista = epEstado.dados?.lista || [];
  const transp = document.getElementById('epTransportadora').value;
  const termo = (document.getElementById('epBusca')?.value || '').trim();
  return lista.filter((x) => {
    if (transp && x.transportadora !== transp) return false;
    if (termo) return epBate(x, termo);
    if (epEstado.aba === 'atrasadas') {
      if (x.dias >= 0) return false;
      const atraso = -x.dias;
      if (epEstado.faixa === '7') return atraso <= 7;
      if (epEstado.faixa === '30') return atraso > 7 && atraso <= 30;
      if (epEstado.faixa === 'mais') return atraso > 30;
      return true;
    }
    if (epEstado.aba === 'hoje') return x.dias === 0;
    return x.dias > 0;
  }).sort((a, b) => {
    // Atrasadas: por padrão as de atraso menor (as que ainda dá para resolver) primeiro.
    if (epEstado.aba !== 'atrasadas' || termo) return 0;
    return document.getElementById('epOrdem')?.value === 'antigas' ? a.dias - b.dias : b.dias - a.dias;
  });
}

function montarUrlRastreamento(urlModelo, dados) {
  const modelo = String(urlModelo || '').trim();
  if (!modelo) return '';
  const valores = {
    NF: dados.numero_nf || '',
    CTE: dados.numero_cte || '',
    CHAVE_NFE: dados.chave_nfe || '',
    CHAVE_CTE: dados.chave_cte || '',
  };
  const url = modelo.replace(/\{(NF|CTE|CHAVE_NFE|CHAVE_CTE)\}/g, (_, chave) => encodeURIComponent(String(valores[chave] || '')));
  try {
    const parsed = new URL(url, window.location.origin);
    if (!['http:', 'https:'].includes(parsed.protocol)) return '';
    return parsed.href;
  } catch (_) {
    return '';
  }
}

function epAbrirRastreamento(dados) {
  const url = montarUrlRastreamento(dados.url_rastreamento, dados);
  if (!url) {
    mostrarAlerta('Esta transportadora ainda não tem um endereço de rastreamento configurado.', { tipo: 'aviso' });
    return;
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}

function epRenderizarLista() {
  const linhas = epLinhasFiltradas();
  const termo = (document.getElementById('epBusca')?.value || '').trim();
  // Contagem em cada aba (com o filtro de transportadora).
  const transp = document.getElementById('epTransportadora').value;
  const base = (epEstado.dados?.lista || []).filter((x) => !transp || x.transportadora === transp);
  const cont = { atrasadas: base.filter((x) => x.dias < 0).length, hoje: base.filter((x) => x.dias === 0).length, proximos: base.filter((x) => x.dias > 0).length };
  const rotulos = { atrasadas: 'Atrasadas', hoje: 'Hoje', proximos: 'Próximos 7 dias' };
  document.querySelectorAll('#epAbas [data-ep]').forEach((b) => { b.textContent = `${rotulos[b.dataset.ep]} (${cont[b.dataset.ep].toLocaleString('pt-BR')})`; });
  const atrasadas = base.filter((x) => x.dias < 0);
  const faixaQtd = { '': atrasadas.length, 7: atrasadas.filter((x) => -x.dias <= 7).length, 30: atrasadas.filter((x) => -x.dias > 7 && -x.dias <= 30).length, mais: atrasadas.filter((x) => -x.dias > 30).length };
  const nomesFaixa = { '': 'Todos', 7: '1 a 7 dias', 30: '8 a 30 dias', mais: 'Mais de 30 dias' };
  document.querySelectorAll('#epFaixas [data-faixa]').forEach((b) => {
    b.textContent = `${nomesFaixa[b.dataset.faixa]} (${faixaQtd[b.dataset.faixa]})`;
    b.classList.toggle('ativa', b.dataset.faixa === epEstado.faixa);
  });
  document.getElementById('epFiltrosAtraso').classList.toggle('oculto', epEstado.aba !== 'atrasadas' || !!termo);
  document.getElementById('epAvisoAntigas').innerHTML = epEstado.aba === 'atrasadas' && !termo && faixaQtd.mais
    ? `<div class="mt-aviso">${faixaQtd.mais} nota(s) com <b>mais de 30 dias</b> de atraso — normalmente a entrega aconteceu e não foi baixada.
       Use <b>Buscar entregas</b>, <b>Lançar entregas do WhatsApp</b> ou o comprovante para dar baixa, e o atraso real fica visível.</div>` : '';

  const selo = (dias) => dias < 0 ? `<span class="ep-selo atraso${dias < -30 ? ' antigo' : ''}">${Math.abs(dias)} dia(s) de atraso</span>`
    : dias === 0 ? '<span class="ep-selo hoje">hoje</span>' : `<span class="ep-selo breve">em ${dias} dia(s)</span>`;
  const sub = (t) => `<small class="ep-sub">${t}</small>`;
  document.getElementById('epCorpo').innerHTML = linhas.length ? linhas.map((x) => `
    <tr data-ep-id="${x.id}">
      <td><b>${formatoData(x.data_entrega_prevista)}</b> ${selo(x.dias)}
        ${sub(`${x.data_coleta ? `coleta ${formatoData(x.data_coleta)}` : `CT-e ${formatoData(x.data_emissao_cte)}`}${x.prazo_dias_tabela != null ? ` + ${x.prazo_dias_tabela} dia(s)` : ''}`)}</td>
      <td>${x.numero_nf ? `<button type="button" class="btn-copiar-nf" data-nf="${String(x.numero_nf).replace(/&/g, '&amp;').replace(/"/g, '&quot;')}" title="Clique para copiar a Nota Fiscal (já copiada ${x.nf_copias || 0} vez(es))" aria-label="Copiar Nota Fiscal ${cfEsc(x.numero_nf)}"><span class="icone-copiar-nf">📋</span> <span class="numero-nf-copiar">${cfEsc(x.numero_nf)}</span>${x.nf_copias ? ` <span class="contador-copias-nf">×${x.nf_copias}</span>` : ''}</button>` : '—'}
        ${sub(`${x.numero_pedido ? `ped. ${cfEsc(x.numero_pedido)}` : ''}${x.numero_pedido && x.numero_cte ? ' · ' : ''}${x.numero_cte ? `CT-e ${cfEsc(x.numero_cte)}` : ''}`)}</td>
      <td class="ep-cli" title="${cfEsc(x.cliente || '')}">${cfEsc(x.cliente || '—')}${sub(cfEsc([x.cidade, x.uf].filter(Boolean).join('/') || '—'))}</td>
      <td class="ep-transp" title="${cfEsc(x.transportadora || '')}">${cfEsc(x.transportadora || '—')}
        ${x.url_rastreamento ? `<br><button type="button" class="btn-rastrear-transp" data-ep-rastrear="${x.id}" title="Abrir rastreamento da transportadora">🔎 Rastrear</button>` : ''}</td>
      <td class="ep-ocorrencia">${epCelulaOcorrencia(x)}</td>
      <td>${podeEditar ? `<button class="btn btn-secundario" data-ep-entregue="${x.id}" style="width:auto; padding:4px 10px; font-size:11.5px;">✓ Entregue</button>` : ''}</td>
    </tr>`).join('')
    : `<tr><td colspan="6" style="color:var(--texto-fraco); padding:14px;">${termo ? 'Nenhuma nota em aberto com essa busca. (Notas já entregues não aparecem aqui — procure em Todos os registros.)' : epEstado.aba === 'atrasadas' ? (epEstado.faixa ? 'Nenhuma nota nessa faixa de atraso.' : 'Nenhuma entrega atrasada. ✓') : 'Nenhuma entrega prevista nesse período.'}</td></tr>`;
}

// Última ocorrência da SSW na lista (clicável: abre o histórico).
function epCelulaOcorrencia(x) {
  if (!x.rastreio_ultima_ocorrencia) {
    return x.rastreio_ssw ? `<small style="color:var(--texto-fraco);">${x.rastreio_consultado_em ? 'sem ocorrência na SSW' : 'ainda não consultado'}</small>` : '<span class="sem-rastreamento">—</span>';
  }
  // "[Redespacho EVI] ..." = evento de outra transportadora: só informação, em cinza.
  const redesp = String(x.rastreio_ultima_ocorrencia).match(/^\[Redespacho[^\]]*\]\s*/);
  const [titulo] = String(x.rastreio_ultima_ocorrencia).replace(/^\[Redespacho[^\]]*\]\s*/, '').split(' — ');
  const quando = x.rastreio_ultima_em ? new Date(x.rastreio_ultima_em).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '';
  const agendada = x.rastreio_entrega_agendada ? ` <span class="ep-selo hoje" title="Entrega agendada">agendada p/ ${formatoData(x.rastreio_entrega_agendada).slice(0, 5)}</span>` : '';
  return `<button type="button" class="ep-btn-ocorrencia ${x.rastreio_problema ? 'problema' : ''}" data-ep-ocorrencias="${x.id}" title="${cfEsc(x.rastreio_ultima_ocorrencia)} — clique para ver o histórico">
    ${redesp ? '<small style="color:var(--texto-fraco);">Redespacho (informativo): </small>' : ''}${x.rastreio_problema ? '⚠ ' : ''}${cfEsc(titulo.replace(/\s*\(\d+\)\s*$/, ''))}${quando ? ` <small>${quando}</small>` : ''}</button>${agendada}`;
}

async function epVerOcorrencias(id) {
  try {
    const resposta = await apiFetch(`/api/fretes/${id}/ocorrencias-rastreio`);
    const lista = await resposta.json();
    if (!resposta.ok) { mostrarAlerta(lista.erro || 'Não foi possível buscar o histórico.'); return; }
    const item = (epEstado.dados?.lista || []).find((x) => Number(x.id) === Number(id)) || {};
    // Código SSW da transportadora do CT-e (aprendido pelo servidor). Eventos de
    // outro código são do redespacho: só informação.
    const dominioTransp = resposta.headers.get('X-Dominio-Transportadora') || '';
    const fundo = document.createElement('div');
    fundo.className = 'ep-historico-fundo';
    fundo.innerHTML = `<div class="ep-historico">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
        <strong>Rastreamento SSW — NF ${cfEsc(item.numero_nf || '')} · ${cfEsc(item.cliente || '')}</strong>
        <button type="button" class="btn btn-secundario" data-fechar style="width:auto; padding:4px 10px;">Fechar</button></div>
      ${lista.length ? `<table class="ep-tabela" style="font-size:12px;"><thead><tr><th>Data/hora</th><th>Cidade</th><th>Ocorrência</th></tr></thead><tbody>
        ${lista.map((o) => `<tr style="${o.dominio && dominioTransp && o.dominio !== dominioTransp ? 'opacity:0.65;' : ''}"><td style="white-space:nowrap;">${o.data_hora ? new Date(o.data_hora).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—'}</td>
          <td style="white-space:nowrap;">${cfEsc(o.cidade || '—')}<br><small style="color:var(--texto-fraco);">${o.dominio && o.dominio !== dominioTransp && (dominioTransp || item.redespacho) ? `Outra transportadora (${cfEsc(o.dominio)}) — só informação` : cfEsc(o.dominio || '')}</small></td>
          <td><b style="${o.tipo === 'Entrega' ? 'color:var(--verde);' : ''}">${cfEsc(o.ocorrencia || '')}</b><br><small>${cfEsc(o.descricao || '')}</small>${o.recebedor ? `<br><small>Recebido por: ${cfEsc(o.recebedor)}</small>` : ''}</td></tr>`).join('')}
      </tbody></table>` : '<p style="color:var(--texto-fraco);">Nenhuma ocorrência guardada para esta nota ainda.</p>'}
    </div>`;
    fundo.addEventListener('click', (e) => { if (e.target === fundo || e.target.closest('[data-fechar]')) fundo.remove(); });
    document.body.appendChild(fundo);
  } catch (err) {
    mostrarAlerta('Falha de conexão com o servidor.');
  }
}

// Busca de entregas na SSW (roda no servidor; a tela acompanha o andamento).
async function epBuscarNaSsw() {
  const botao = document.getElementById('btnEpSsw');
  const transportadora = document.getElementById('epTransportadora').value || null;
  try {
    const resposta = await apiFetch('/api/fretes/rastreio-ssw/iniciar', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ transportadora }),
    });
    let st = await resposta.json();
    if (!resposta.ok) { mostrarAlerta(st.erro || 'Não foi possível iniciar a busca.'); return; }
    if (!st.total) {
      mostrarAlerta('Nenhuma nota em aberto para consultar. Ligue "Rastreamento automático pela SSW" ou configure o "Portal de rastreamento" no cadastro da transportadora (Cadastros » Transportadoras).', { tipo: 'aviso' });
      return;
    }
    botao.disabled = true;
    while (st.rodando) {
      botao.textContent = `Buscando entregas… ${st.feitos}/${st.total}`;
      await new Promise((r) => setTimeout(r, 2000));
      st = await (await apiFetch('/api/fretes/rastreio-ssw/status')).json();
    }
    await carregarEntregasPrevistas();
    const partesPortal = st.portalAchou || st.portalErro || st.portalNaoAchadas
      ? ` Portal da transportadora: ${st.portalAchou || 0} nota(s) encontrada(s), ${st.portalEntregues || 0} entregue(s)`
        + `${st.portalNaoAchadas ? `, ${st.portalNaoAchadas} não encontrada(s) no portal (ex.: NF ${(st.portalNaoAchadasNfs || []).slice(0, 8).join(', ')})` : ''}`
        + `${st.portalErro ? ` — ${st.portalErro}` : ''}.` : '';
    mostrarAlerta(`Busca concluída: ${st.entregues} entrega(s) registrada(s) agora${st.comOcorrencia ? `, ${st.comOcorrencia} com ocorrência de problema` : ''}.${st.erros ? ` ${st.erros} consulta(s) na SSW falharam (${st.ultimoErro || 'erro'}).` : ''}${partesPortal}`, { tipo: st.erros || st.portalErro ? 'aviso' : 'sucesso' });
  } catch (err) {
    mostrarAlerta('Falha de conexão com o servidor.');
  } finally {
    botao.disabled = false;
    botao.textContent = '🔄 Buscar entregas';
  }
}
document.getElementById('btnEpSsw')?.addEventListener('click', epBuscarNaSsw);

// Refaz as datas de entrega da busca automática (mostra antes quantas são).
document.getElementById('btnEpRefazer')?.addEventListener('click', async () => {
  try {
    const previa = await (await apiFetch('/api/fretes/rastreio/refazer-entregas', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}),
    })).json();
    if (previa.erro) { mostrarAlerta(previa.erro); return; }
    if (!previa.quantidade) { mostrarAlerta('Nenhuma data de entrega da busca automática para refazer.', { tipo: 'info' }); return; }
    const ok = await confirmar(`${previa.quantidade} data(s) de entrega preenchida(s) pela busca automática (SSW/portal) nos últimos 120 dias serão apagadas e buscadas de novo com as regras atuais. Datas lançadas à mão e comprovantes de entrega não são mexidos.`,
      { tipo: 'aviso', titulo: 'Refazer entregas automáticas?', textoOk: 'Refazer' });
    if (!ok) return;
    const r = await (await apiFetch('/api/fretes/rastreio/refazer-entregas', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirmar: true }),
    })).json();
    if (r.erro) { mostrarAlerta(r.erro); return; }
    mostrarAlerta(`${r.apagadas} data(s) apagada(s). A busca de entregas começou de novo — acompanhe no botão "Buscar entregas".`, { tipo: 'sucesso' });
    // Acompanha a busca que o servidor iniciou.
    const botao = document.getElementById('btnEpSsw');
    let st = r.busca || {};
    if (botao) botao.disabled = true;
    while (st.rodando) {
      if (botao) botao.textContent = `Buscando entregas… ${st.feitos}/${st.total}`;
      await new Promise((ok2) => setTimeout(ok2, 2000));
      st = await (await apiFetch('/api/fretes/rastreio-ssw/status')).json();
    }
    if (botao) { botao.disabled = false; botao.textContent = '🔄 Buscar entregas'; }
    await carregarEntregasPrevistas();
  } catch (err) {
    mostrarAlerta('Falha de conexão com o servidor.');
  }
});

async function epRegistrarEntrega(id) {
  const hoje = new Date();
  const padrao = hoje.toLocaleDateString('pt-BR');
  const texto = await pedirTexto('Data em que a carga foi entregue (dd/mm/aaaa).', { titulo: 'Registrar entrega', valor: padrao, textoOk: 'Registrar entrega' });
  if (texto === null) return;
  const m = texto.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) { mostrarAlerta('Informe a data no formato dd/mm/aaaa.', { tipo: 'aviso' }); return; }
  const data = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  try {
    const resposta = await apiFetch(`/api/fretes/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data_entrega: data }),
    });
    const d = await resposta.json();
    if (!resposta.ok) { mostrarAlerta(d.erro || 'Não foi possível registrar a entrega.'); return; }
    carregarEntregasPrevistas();
  } catch (err) {
    mostrarAlerta('Falha de conexão com o servidor.');
  }
}

async function epAbrirRegistro(id) {
  try {
    const resposta = await apiFetch(`/api/fretes/${id}`);
    const registro = await resposta.json();
    if (!resposta.ok) return;
    if (!ultimoRegistrosCarregados.some((r) => r.id === registro.id)) ultimoRegistrosCarregados.push(registro);
    abrirFormularioRegistro(registro.id);
  } catch (err) { /* sem conexão */ }
}

function epExportar() {
  const linhas = epLinhasFiltradas();
  if (!linhas.length) { mostrarAlerta('Não há linhas para exportar nessa aba.', { tipo: 'aviso' }); return; }
  const cab = ['Previsão', 'Dias', 'Pedido', 'NF', 'CT-e', 'Cliente', 'Cidade', 'UF', 'Transportadora', 'Última ocorrência (SSW)', 'Rastreamento', 'Data da coleta', 'Emissão do CT-e', 'Prazo (dias)'];
  const dataBr = (v) => (v ? new Date(`${String(v).slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR') : '');
  const csv = [cab, ...linhas.map((x) => [dataBr(x.data_entrega_prevista), x.dias, x.numero_pedido, x.numero_nf, x.numero_cte, x.cliente,
    x.cidade, x.uf, x.transportadora, x.rastreio_ultima_ocorrencia || '', x.url_rastreamento || '', dataBr(x.data_coleta), dataBr(x.data_emissao_cte), x.prazo_dias_tabela])]
    .map((l) => l.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `entregas-previstas-${epEstado.aba}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 2000);
}

document.getElementById('epAbas').addEventListener('click', (e) => {
  const aba = e.target.closest('[data-ep]');
  if (!aba) return;
  epEstado.aba = aba.dataset.ep;
  document.querySelectorAll('.ep-aba').forEach((b) => b.classList.toggle('ativa', b === aba));
  epRenderizarLista();
});
document.getElementById('epTransportadora').addEventListener('change', epRenderizarLista);
document.getElementById('epFaixas')?.addEventListener('click', (e) => {
  const b = e.target.closest('[data-faixa]');
  if (!b) return;
  epEstado.faixa = b.dataset.faixa;
  epRenderizarLista();
});
document.getElementById('epOrdem')?.addEventListener('change', epRenderizarLista);
document.getElementById('epBusca')?.addEventListener('input', epRenderizarLista);
document.getElementById('btnEpExportar').addEventListener('click', epExportar);
document.getElementById('epCorpo').addEventListener('click', async (e) => {
  const ocorrencias = e.target.closest('[data-ep-ocorrencias]');
  if (ocorrencias) { epVerOcorrencias(ocorrencias.dataset.epOcorrencias); return; }
  const rastrear = e.target.closest('[data-ep-rastrear]');
  if (rastrear) {
    const item = (epEstado.dados?.lista || []).find((x) => Number(x.id) === Number(rastrear.dataset.epRastrear));
    if (item) epAbrirRastreamento(item);
    return;
  }
  const botaoNf = e.target.closest('.btn-copiar-nf');
  if (botaoNf) {
    e.preventDefault();
    e.stopPropagation();
    const numeroNf = botaoNf.dataset.nf || '';
    if (!numeroNf) return;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(numeroNf);
      } else {
        const area = document.createElement('textarea');
        area.value = numeroNf;
        area.style.position = 'fixed';
        area.style.opacity = '0';
        document.body.appendChild(area);
        area.focus();
        area.select();
        document.execCommand('copy');
        area.remove();
      }
      const resposta = await apiFetch('/api/fretes/copiar-nf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ numero_nf: numeroNf }),
      });
      const dados = await resposta.json();
      if (!resposta.ok) throw new Error(dados.erro || 'Não foi possível registrar a cópia.');
      const contador = botaoNf.querySelector('.contador-copias-nf');
      if (contador) contador.textContent = `×${dados.quantidade}`;
      const icone = botaoNf.querySelector('.icone-copiar-nf');
      if (icone) icone.textContent = '✓';
      botaoNf.classList.add('nf-copiada');
      botaoNf.title = `NF ${numeroNf} copiada ${dados.quantidade} vez(es). Clique novamente para copiar.`;
      setTimeout(() => {
        if (icone) icone.textContent = '📋';
        botaoNf.classList.remove('nf-copiada');
      }, 900);
    } catch (err) {
      mostrarAlerta(err.message || 'Não foi possível copiar a Nota Fiscal.', { tipo: 'aviso' });
    }
    return;
  }
  const entregue = e.target.closest('[data-ep-entregue]');
  if (entregue) { epRegistrarEntrega(Number(entregue.dataset.epEntregue)); return; }
  const linha = e.target.closest('[data-ep-id]');
  if (linha) epAbrirRegistro(Number(linha.dataset.epId));
});

// Relatórios: cidades dos clientes que mais faturamos.
async function carregarFaturamentoCidades() {
  const uf = document.getElementById('fcUf').value;
  const periodo = document.getElementById('fcPeriodo').value;
  let d;
  try {
    const resposta = await apiFetch(`/api/fretes/relatorios/faturamento-cidades?periodo=${periodo}${uf ? `&uf=${uf}` : ''}`);
    d = await resposta.json();
    if (!resposta.ok) throw new Error(d.erro);
  } catch (err) {
    document.getElementById('fcResumo').innerHTML = '<span style="color:var(--vermelho); font-size:12px;">Não foi possível carregar o faturamento por cidade.</span>';
    return;
  }
  const seletor = document.getElementById('fcUf');
  seletor.innerHTML = '<option value="">Todos os estados</option>' + (d.ufs || []).map((u) => `<option value="${u}">${u}</option>`).join('');
  seletor.value = (d.ufs || []).includes(uf) ? uf : '';

  const total = d.faturamento_total || 0;
  const pct = (v) => (total > 0 ? (v / total) * 100 : 0);
  const fmtPct = (v) => `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
  const c = d.cidades || [];
  const top5 = c.slice(0, 5).reduce((s, x) => s + x.faturado, 0);
  document.getElementById('fcResumo').innerHTML = `
    <div>Faturamento total<strong>${formatoMoeda(total)}</strong></div>
    ${uf ? `<div>Faturamento em ${uf}<strong>${formatoMoeda(d.faturamento_filtro)} <small style="font-size:11px; color:var(--verde);">${fmtPct(pct(d.faturamento_filtro))}</small></strong></div>` : ''}
    <div>Cidades atendidas<strong>${(d.qtd_cidades || 0).toLocaleString('pt-BR')}</strong></div>
    <div>Maior cidade<strong>${c[0] ? `${cfEsc(c[0].cidade)} <small style="font-size:11px; color:var(--verde);">${fmtPct(pct(c[0].faturado))}</small>` : '—'}</strong></div>
    <div>Top 5 cidades somam<strong>${formatoMoeda(top5)} <small style="font-size:11px; color:var(--verde);">${fmtPct(pct(top5))}</small></strong></div>`;

  const top15 = c.slice(0, 15);
  chamarGrafico(desenharBarras, 'graficoFatCidades', top15.map((x) => `${x.cidade}${x.uf ? `/${x.uf}` : ''}`),
    top15.map((x) => Math.round(x.faturado * 100) / 100), null, true, 520, formatoMoeda);

  let acumulado = 0;
  const maior = c[0]?.faturado || 1;
  document.getElementById('fcCorpo').innerHTML = c.length ? c.map((x, i) => {
    acumulado += x.faturado;
    const pctFrete = x.faturado > 0 ? (x.frete / x.faturado) * 100 : null;
    return `<tr>
      <td>${i + 1}</td>
      <td><b>${cfEsc(x.cidade)}</b>${x.uf ? `/${cfEsc(x.uf)}` : ''}</td>
      <td class="n">${x.qtd_notas.toLocaleString('pt-BR')}</td>
      <td class="n">${x.qtd_clientes.toLocaleString('pt-BR')}</td>
      <td class="n">${formatoMoeda(x.faturado)}</td>
      <td class="n"><b>${fmtPct(pct(x.faturado))}</b><span class="fc-part" style="width:${Math.max(2, (x.faturado / maior) * 50)}px;"></span></td>
      <td class="n">${fmtPct(pct(acumulado))}</td>
      <td class="n">${formatoMoeda(x.frete)}</td>
      <td class="n">${pctFrete == null ? '—' : fmtPct(pctFrete)}</td>
    </tr>`;
  }).join('') : '<tr><td colspan="9" style="color:var(--texto-fraco);">Sem notas nesse período.</td></tr>';
}
document.getElementById('fcUf').addEventListener('change', carregarFaturamentoCidades);
document.getElementById('fcPeriodo').addEventListener('change', carregarFaturamentoCidades);

// Relatórios: Frete CIF x CIF — entrega direta x redespacho, por transportadora.
const COR_CIF_DIRETO = '#06b6d4';
const COR_CIF_REDESP = '#a855f7';
async function carregarGraficoCif() {
  let d;
  try {
    const resposta = await apiFetch(`/api/fretes/relatorios/cif-direto-redespacho?periodo=${document.getElementById('cifPeriodo').value}`);
    d = await resposta.json();
    if (!resposta.ok) throw new Error(d.erro);
  } catch (err) {
    document.getElementById('cifResumo').innerHTML = '<span style="color:var(--vermelho); font-size:12px;">Não foi possível carregar o CIF direto x redespacho.</span>';
    return;
  }
  const t = d.transportadoras || [];
  const soma = (c) => t.reduce((s, x) => s + (x[c] || 0), 0);
  const tot = { qd: soma('qtd_direto'), qr: soma('qtd_redespacho'), vd: soma('valor_direto'), vr: soma('valor_redespacho') };
  const pct = (a, b) => (a + b > 0 ? (a / (a + b)) * 100 : null);
  const fmtPct = (v) => (v == null ? '—' : `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`);
  const pvD = pct(tot.vd, tot.vr);
  document.getElementById('cifResumo').innerHTML = `
    <div>Fretes CIF<strong>${(tot.qd + tot.qr).toLocaleString('pt-BR')}</strong></div>
    <div>Valor total CIF<strong>${formatoMoeda(tot.vd + tot.vr)}</strong></div>
    <div style="border-left-color:${COR_CIF_DIRETO};">Entrega direta<strong>${formatoMoeda(tot.vd)} <small style="font-size:11px; color:${COR_CIF_DIRETO};">${fmtPct(pvD)}</small></strong></div>
    <div style="border-left-color:${COR_CIF_REDESP};">Via redespacho<strong>${formatoMoeda(tot.vr)} <small style="font-size:11px; color:${COR_CIF_REDESP};">${fmtPct(pvD == null ? null : 100 - pvD)}</small></strong></div>
    <div style="border-left-color:${COR_CIF_DIRETO};">Direto (quantidade)<strong>${tot.qd.toLocaleString('pt-BR')} <small style="font-size:11px; color:var(--texto-fraco);">${fmtPct(pct(tot.qd, tot.qr))}</small></strong></div>
    <div style="border-left-color:${COR_CIF_REDESP};">Redespacho (quantidade)<strong>${tot.qr.toLocaleString('pt-BR')} <small style="font-size:11px; color:var(--texto-fraco);">${fmtPct(pct(tot.qr, tot.qd))}</small></strong></div>`;

  chamarGrafico(desenharBarrasEmpilhadas, 'graficoCif', t.map((x) => x.transportadora), [
    { nome: 'Entrega direta ao cliente', cor: COR_CIF_DIRETO, valores: t.map((x) => Math.round(x.valor_direto * 100) / 100) },
    { nome: 'Via redespacho', cor: COR_CIF_REDESP, valores: t.map((x) => Math.round(x.valor_redespacho * 100) / 100) },
  ], formatoMoeda);

  const barra = (vd, vr) => {
    const p = pct(vd, vr);
    if (p == null) return '—';
    return `<div class="cif-barra" title="Direto ${fmtPct(p)} · Redespacho ${fmtPct(100 - p)}">
      <span style="width:${p}%; background:${COR_CIF_DIRETO};">${p >= 18 ? fmtPct(p) : ''}</span>
      <span style="width:${100 - p}%; background:${COR_CIF_REDESP};">${100 - p >= 18 ? fmtPct(100 - p) : ''}</span></div>`;
  };
  const linha = (x) => `
    <tr>
      <td>${cfEsc(x.transportadora)}</td>
      <td class="n">${x.qtd_direto.toLocaleString('pt-BR')}</td>
      <td class="n">${x.qtd_redespacho.toLocaleString('pt-BR')}</td>
      <td class="n">${fmtPct(pct(x.qtd_direto, x.qtd_redespacho))}</td>
      <td class="n">${formatoMoeda(x.valor_direto)}</td>
      <td class="n">${formatoMoeda(x.valor_redespacho)}</td>
      <td class="n"><b>${formatoMoeda(x.valor_direto + x.valor_redespacho)}</b></td>
      <td>${barra(x.valor_direto, x.valor_redespacho)}</td>
    </tr>`;
  document.getElementById('cifCorpo').innerHTML = t.length
    ? t.map(linha).join('') + `<tr class="cif-total"><td><b>Total</b></td><td class="n"><b>${tot.qd.toLocaleString('pt-BR')}</b></td><td class="n"><b>${tot.qr.toLocaleString('pt-BR')}</b></td>
        <td class="n"><b>${fmtPct(pct(tot.qd, tot.qr))}</b></td><td class="n"><b>${formatoMoeda(tot.vd)}</b></td><td class="n"><b>${formatoMoeda(tot.vr)}</b></td>
        <td class="n"><b>${formatoMoeda(tot.vd + tot.vr)}</b></td><td>${barra(tot.vd, tot.vr)}</td></tr>`
    : '<tr><td colspan="8" style="color:var(--texto-fraco);">Nenhum frete CIF de transportadora com tabela nesse período.</td></tr>';
}
document.getElementById('cifPeriodo').addEventListener('change', carregarGraficoCif);

// Relatórios: sinistros (resumo, 3 gráficos e as cobranças pendentes).
async function carregarGraficoSinistros() {
  let d;
  try {
    const resposta = await apiFetch('/api/sinistros/relatorio');
    d = await resposta.json();
    if (!resposta.ok) throw new Error(d.erro);
  } catch (err) {
    document.getElementById('sinRelResumo').innerHTML = '<span style="color:var(--vermelho); font-size:12px;">Não foi possível carregar os dados de sinistros.</span>';
    return;
  }
  const r = d.resumo || {};
  const recuperado = r.prejuizo > 0 ? (r.ressarcido / r.prejuizo) * 100 : null;
  document.getElementById('sinRelResumo').innerHTML = `
    <div>Sinistros<strong>${(r.qtd || 0).toLocaleString('pt-BR')}</strong></div>
    <div>Em aberto<strong>${(r.qtd_abertos || 0).toLocaleString('pt-BR')}</strong></div>
    <div>Prejuízo total<strong>${formatoMoeda(r.prejuizo || 0)}</strong></div>
    <div>Ressarcido<strong>${formatoMoeda(r.ressarcido || 0)}${recuperado == null ? '' : ` <small style="font-size:11px; color:var(--verde);">${recuperado.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%</small>`}</strong></div>
    <div>A recuperar<strong style="color:${r.a_recuperar > 0 ? 'var(--vermelho)' : 'inherit'};">${formatoMoeda(r.a_recuperar || 0)}</strong></div>
    <div>Cobranças atrasadas<strong style="color:${r.cobrancas_atrasadas ? 'var(--vermelho)' : 'inherit'};">${r.cobrancas_atrasadas || 0}${r.cobrancas_semana ? ` <small style="font-size:11px; color:var(--texto-fraco);">+${r.cobrancas_semana} na semana</small>` : ''}</strong></div>`;

  const t = d.por_transportadora || [];
  chamarGrafico(desenharBarrasEmpilhadas, 'graficoSinTransportadoras', t.map((x) => x.transportadora), [
    { nome: 'Ressarcido', cor: '#22c55e', valores: t.map((x) => Math.round(x.ressarcido * 100) / 100) },
    { nome: 'A recuperar', cor: '#ef4444', valores: t.map((x) => Math.round(x.pendente * 100) / 100) },
  ], formatoMoeda);
  const tipos = d.por_tipo || [];
  const corTipo = { Avaria: '#f97316', Extravio: '#a855f7', Furto: '#ef4444', Outro: '#8a94a6' };
  chamarGrafico(desenharRosca, 'graficoSinTipo', tipos.map((x) => x.tipo), tipos.map((x) => x.qtd), tipos.map((x) => corTipo[x.tipo] || '#4d7cff'));
  const m = d.por_mes || [];
  chamarGrafico(desenharLinha, 'graficoSinMes', m.map((x) => x.mes), m.map((x) => x.prejuizo), '#f97316', 200, formatoMoeda);

  const hoje = agDataLocal(new Date());
  const lista = d.cobrancas || [];
  document.getElementById('sinRelCobrancas').innerHTML = lista.length ? lista.map((c) => {
    const data = String(c.data_cobranca).slice(0, 10);
    const selo = data < hoje ? '<span class="sin-cobrar atrasada">atrasada</span>' : data === hoje ? '<span class="sin-cobrar hoje">hoje</span>' : '';
    return `<div class="sin-rel-linha">
      <span>${cfEsc(c.transportadora || '—')}<small>NF ${cfEsc(c.numero_nf || c.numero_pedido || '—')} · ${cfEsc(c.tipo)}</small></span>
      <span style="text-align:right; white-space:nowrap;">${formatoData(c.data_cobranca)}${selo}<small>${formatoMoeda(c.a_recuperar)}</small></span>
    </div>`;
  }).join('') : '<div class="ag-vazio">Nenhuma cobrança pendente. ✓</div>';
}

// Relatórios: fretes de carga direta (resumo + 3 gráficos).
async function carregarGraficoCargaDireta() {
  let d;
  try {
    const resposta = await apiFetch('/api/fretes/relatorios/carga-direta');
    d = await resposta.json();
    if (!resposta.ok) throw new Error(d.erro);
  } catch (err) {
    document.getElementById('cdResumo').innerHTML = '<span style="color:var(--vermelho); font-size:12px;">Não foi possível carregar os dados de carga direta.</span>';
    return;
  }
  const r = d.resumo || {};
  const percent = r.mercadoria > 0 ? (r.valor / r.mercadoria) * 100 : null;
  document.getElementById('cdResumo').innerHTML = `
    <div>Fretes de carga direta<strong>${(r.qtd || 0).toLocaleString('pt-BR')}</strong></div>
    <div>Valor total de frete<strong>${formatoMoeda(r.valor || 0)}</strong></div>
    <div>Média por frete<strong>${r.qtd ? formatoMoeda(r.valor / r.qtd) : '—'}</strong></div>
    <div>% do frete sobre a mercadoria<strong>${percent == null ? '—' : `${percent.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`}</strong></div>
    <div>Peso transportado<strong>${(r.peso || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} kg</strong></div>`;

  const t = d.por_transportadora || [];
  chamarGrafico(desenharBarras, 'graficoCdTransportadoras', t.map((x) => x.transportadora), t.map((x) => Math.round(x.valor * 100) / 100), null, true, 360, formatoMoeda);
  const c = d.por_cidade || [];
  chamarGrafico(desenharBarras, 'graficoCdCidades', c.map((x) => x.cidade), c.map((x) => x.qtd), null, true, 360);
  const m = d.por_mes || [];
  chamarGrafico(desenharLinha, 'graficoCdMes', m.map((x) => x.mes), m.map((x) => x.valor), '#06b6d4', 200, formatoMoeda);
}

// Gráfico "Cidades onde as transportadoras entregaram" (com filtro próprio de transportadora).
function desenharGraficoCidades(dados) {
  const seletor = document.getElementById('relCidadesTransportadora');
  const escolhida = seletor.value;
  seletor.innerHTML = '<option value="">Todas (com tabela de preço)</option>' +
    (dados.transportadoras || []).map((t) => `<option value="${cfEsc(t)}">${cfEsc(t)}</option>`).join('');
  if ((dados.transportadoras || []).includes(escolhida)) seletor.value = escolhida;

  const cidades = dados.cidades || [];
  chamarGrafico(desenharBarrasEmpilhadas, 'graficoCidades', cidades.map((c) => c.cidade), [
    { nome: 'Via redespacho', cor: '#a855f7', valores: cidades.map((c) => c.qtd_redespacho) },
    { nome: 'Direto ao cliente', cor: '#06b6d4', valores: cidades.map((c) => c.qtd_direto) },
  ]);
}

function urlRelatorioCidades() {
  const t = document.getElementById('relCidadesTransportadora')?.value;
  return `/api/fretes/relatorios/cidades${t ? `?transportadora=${encodeURIComponent(t)}` : ''}`;
}

document.getElementById('relCidadesTransportadora').addEventListener('change', async () => {
  try {
    const resposta = await apiFetch(urlRelatorioCidades());
    const dados = await resposta.json();
    if (!resposta.ok) throw new Error(dados.erro);
    desenharGraficoCidades(dados);
  } catch (err) {
    mostrarAlerta('Não foi possível atualizar o gráfico de cidades.');
  }
});

document.getElementById('btnVoltarInicioRelatorios').addEventListener('click', () => {
  document.querySelector('.nav-item[data-pagina="visao-geral"]').click();
});

document.getElementById('btnImprimirRelatorios').addEventListener('click', () => {
  window.print();
});

async function carregarRelatorios() {
  try {
    const [respTransp, respRedespacho, respCidades, respMensal, respDiario, respCifFob,
           respStatus, respRetido, respValorMensal, respValorTransp, respGlosas, respUf,
           respSla, respAtrasos] = await Promise.all([
      apiFetch('/api/fretes/relatorios/transportadoras'),
      apiFetch('/api/fretes/relatorios/redespacho'),
      apiFetch(urlRelatorioCidades()),
      apiFetch('/api/fretes/relatorios/percent-frete-mensal'),
      apiFetch('/api/fretes/relatorios/percent-frete-diario'),
      apiFetch('/api/fretes/relatorios/cif-fob'),
      apiFetch('/api/fretes/relatorios/status'),
      apiFetch('/api/fretes/relatorios/retido-por-transportadora'),
      apiFetch('/api/fretes/relatorios/valor-total-mensal'),
      apiFetch('/api/fretes/relatorios/valor-por-transportadora'),
      apiFetch('/api/fretes/relatorios/glosas-por-transportadora'),
      apiFetch('/api/fretes/relatorios/por-uf'),
      apiFetch('/api/fretes/relatorios/sla'),
      apiFetch('/api/fretes/relatorios/atrasos-por-transportadora'),
    ]);
    const transportadoras = await respTransp.json();
    const redespacho = await respRedespacho.json();
    const cidades = await respCidades.json();
    const percentMensal = await respMensal.json();
    const percentDiario = await respDiario.json();
    const cifFob = await respCifFob.json();
    const statusDados = await respStatus.json();
    const retidoPorTransp = await respRetido.json();
    const valorTotalMensal = await respValorMensal.json();
    const valorPorTransp = await respValorTransp.json();
    const glosasPorTransp = await respGlosas.json();
    const porUf = await respUf.json();
    const slaDados = await respSla.json();
    const atrasosPorTransp = await respAtrasos.json();

    const corAzul = '#4d7cff', corVerde = '#1f9d5c', corLaranja = '#e8890c', corCinza = '#8a94a6';
    const paletaBarras = ['#4d7cff', '#1f9d5c', '#e8890c', '#a855f7', '#ef4444', '#14b8a6', '#eab308', '#ec4899', '#64748b', '#22c55e'];

    // 1) % de fretes com tabela cadastrada x sem.
    const comTabela = transportadoras.filter((t) => t.tem_tabela).reduce((s, t) => s + t.qtd_fretes, 0);
    const semTabela = transportadoras.filter((t) => !t.tem_tabela).reduce((s, t) => s + t.qtd_fretes, 0);
    chamarGrafico(desenharRosca, 'graficoPercentualTabela', ['Com tabela cadastrada', 'Sem tabela cadastrada'], [comTabela, semTabela], [corVerde, corLaranja]);

    // 2) Top 10 transportadoras que mais carrego.
    const top10Carrego = transportadoras.slice(0, 10);
    chamarGrafico(desenharBarras, 'graficoTransportadorasMaisCarrego', top10Carrego.map((t) => t.transportadora), top10Carrego.map((t) => t.qtd_fretes), paletaBarras, true, 260);

    // 3) Top 15 transportadoras de redespacho.
    chamarGrafico(desenharBarras, 'graficoRedespacho', redespacho.map((r) => r.redespacho), redespacho.map((r) => r.qtd_fretes), corAzul, false, 200);

    // 4) Top 15 cidades que mais entrego.
    desenharGraficoCidades(cidades);

    // 5) % Frete médio por mês.
    chamarGrafico(desenharLinha, 'graficoPercentFreteMensal', percentMensal.map((p) => p.mes), percentMensal.map((p) => Number(p.percent_medio)), corAzul, 160);

    // 6) % Frete médio por dia.
    chamarGrafico(desenharLinha, 'graficoPercentFreteDiario', percentDiario.map((p) => p.dia), percentDiario.map((p) => Number(p.percent_medio)), corVerde, 160);

    // 7 e 8) Frete CIF x FOB (quantidade e valor).
    const coresCifFob = cifFob.map((c) => ({ CIF: corAzul, FOB: corLaranja, 'Não informado': corCinza }[c.tipo] || corCinza));
    chamarGrafico(desenharRosca, 'graficoCifFobQtd', cifFob.map((c) => c.tipo), cifFob.map((c) => c.qtd_fretes), coresCifFob);
    chamarGrafico(desenharRosca, 'graficoCifFobValor', cifFob.map((c) => c.tipo), cifFob.map((c) => Math.round(c.valor_total)), coresCifFob, formatoMoeda);

    // 9) Distribuição por Status.
    const coresStatus = { Pendente: corCinza, 'Frete Retido': corLaranja, Conferido: corAzul, 'Liberado p/ Pagamento': corVerde, Faturado: corVerde, Cancelado: '#ef4444' };
    chamarGrafico(desenharRosca, 'graficoStatus', statusDados.map((s) => s.status), statusDados.map((s) => s.qtd_fretes), statusDados.map((s) => coresStatus[s.status] || corCinza));

    // 10) Frete Retido por Transportadora.
    chamarGrafico(desenharBarras, 'graficoRetidoPorTransportadora', retidoPorTransp.map((r) => r.transportadora), retidoPorTransp.map((r) => r.qtd_fretes), corLaranja, true, 220);

    // 11) Gasto Total com Frete por Mês (R$).
    chamarGrafico(desenharLinha, 'graficoValorTotalMensal', valorTotalMensal.map((v) => v.mes), valorTotalMensal.map((v) => Number(v.valor_total)), corVerde, 160, formatoMoeda);

    // 12) Transportadoras por Valor Total (R$).
    chamarGrafico(desenharBarras, 'graficoValorPorTransportadora', valorPorTransp.map((v) => v.transportadora), valorPorTransp.map((v) => Math.round(v.valor_total)), corAzul, true, 220, formatoMoeda);

    // 13) Glosas Recuperadas por Transportadora (R$).
    chamarGrafico(desenharBarras, 'graficoGlosasPorTransportadora', glosasPorTransp.map((g) => g.transportadora), glosasPorTransp.map((g) => Math.round(g.valor_glosa)), corLaranja, true, 220, formatoMoeda);

    // 14) Entregas por Estado (UF).
    carregarGraficoCargaDireta();
    carregarEntregasPrevistas();
    carregarGraficoSinistros();
    carregarGraficoCif();
    carregarFaturamentoCidades();
    carregarCustoClientes();
    carregarReentregas();
    chamarGrafico(desenharBarras, 'graficoPorUf', porUf.map((u) => u.uf), porUf.map((u) => u.qtd_fretes), corVerde, false, 180);

    // 15) SLA — No Prazo x Atrasado.
    const coresSla = { 'No Prazo': corVerde, Atrasado: '#ef4444', 'Sem dados': corCinza };
    chamarGrafico(desenharRosca, 'graficoSla', slaDados.map((s) => s.sla_status), slaDados.map((s) => s.qtd_fretes), slaDados.map((s) => coresSla[s.sla_status] || corCinza));

    // 16) Atrasos por Transportadora.
    chamarGrafico(desenharBarras, 'graficoAtrasos', atrasosPorTransp.map((a) => a.transportadora), atrasosPorTransp.map((a) => a.qtd_fretes), '#ef4444', true, 220);
  } catch (err) {
    console.error(err);
  }
}

// Redesenha os gráficos quando a janela muda de tamanho (evita ficarem
// "presos" numa largura antiga depois de redimensionar a janela).
let timeoutRedimensionarGraficos = null;
window.addEventListener('resize', () => {
  if (document.getElementById('pagina-relatorios')?.classList.contains('oculto')) return;
  clearTimeout(timeoutRedimensionarGraficos);
  timeoutRedimensionarGraficos = setTimeout(() => {
    graficosSemAnimacaoAte = Date.now() + 3000; // redimensionar não precisa animar de novo
    carregarRelatorios();
  }, 300);
});

// ---------- Maximizar / Minimizar cada gráfico de Relatórios ----------
document.getElementById('pagina-relatorios').addEventListener('click', (e) => {
  const botaoMax = e.target.closest('.btn-grafico-max');
  const botaoMin = e.target.closest('.btn-grafico-min');

  if (botaoMax) {
    const canvasId = botaoMax.dataset.grafico;
    document.getElementById('tituloGraficoMaximizado').textContent = botaoMax.dataset.titulo || '';
    document.getElementById('painelGraficoMaximizado').classList.remove('oculto');
    // Espera o modal abrir (e o canvas ganhar o tamanho de verdade) antes de
    // redesenhar o gráfico nele, senão a largura medida fica errada.
    setTimeout(() => {
      const redesenhar = graficosRegistrados[canvasId];
      if (redesenhar) redesenhar('graficoModalMaximizado');
    }, 30);
    return;
  }

  if (botaoMin) {
    botaoMin.closest('.painel').classList.toggle('grafico-minimizado');
    botaoMin.textContent = botaoMin.closest('.painel').classList.contains('grafico-minimizado') ? '+' : '–';
  }
});

document.getElementById('btnFecharGraficoMaximizado').addEventListener('click', () => {
  document.getElementById('painelGraficoMaximizado').classList.add('oculto');
});

// ---------- Confirmação de exclusão (modal central, com ícone de alerta) ----------
// Usada em todo o sistema no lugar do confirm() padrão do navegador.
function confirmarExclusao(mensagem) {
  return confirmar(mensagem, { tipo: 'perigo', titulo: 'Tem certeza?', textoOk: '🗑️ Sim, excluir' });
}

// ---------- Montar Relatório (BI) ----------
const CAMPOS_BI = [
  { grupo: 'Identificação', campos: [
    ['numero_pedido', 'Número do Pedido'], ['pedido_mercus', 'Pedido Mercus'],
    ['numero_nf', 'Número NF'], ['numero_cte', 'Número CT-e'], ['numero_fatura', 'Número da Fatura'],
    ['numero_mapa', 'Número do Mapa'],
  ]},
  { grupo: 'Datas', campos: [
    ['data_pedido', 'Data do Pedido'], ['data_emissao_nf', 'Data Emissão NF'],
    ['data_emissao_cte', 'Data Emissão CT-e'], ['data_fatura', 'Data da Fatura'],
    ['data_vencimento', 'Data de Vencimento'], ['data_coleta', 'Data da Coleta'], ['data_entrega', 'Data da Entrega'],
  ]},
  { grupo: 'Cliente e Destino', campos: [
    ['cliente', 'Cliente'], ['cidade', 'Cidade'], ['bairro', 'Bairro'], ['uf', 'UF'],
    ['redespacho', 'Redespacho'], ['cidade_redespacho', 'Cidade do Redespacho'],
  ]},
  { grupo: 'Transportadora', campos: [
    ['transportadora', 'Transportadora'], ['transportadora_cte', 'Transporte Cte'],
    ['tabela_frete', 'Tabela de Preço'], ['interior_capital', 'Interior ou Capital'],
  ]},
  { grupo: 'Carga', campos: [
    ['tipo_carga', 'Tipo de Carga'], ['frete_cif_fob', 'Frete CIF/FOB'],
    ['qtd_volumes', 'Qtd. Volumes'], ['peso_kg', 'Peso (kg)'], ['cubagem_m3', 'Cubagem (m³)'],
  ]},
  { grupo: 'Valores', campos: [
    ['valor_faturado', 'Valor Faturado'], ['valor_frete_tabelado', 'Valor Frete Tabelado'],
    ['valor_total_calculado', 'Valor Total Calculado'], ['valor_frete_negociado', 'Valor Frete Negociado'],
    ['valor_total_cte', 'Vlr. CT-e'], ['valor_total_frete', 'Valor Total do Frete'],
    ['dif_negociado_tabela', 'Dif. Negociado x Tabela'], ['percent_frete', '% Frete'],
  ]},
  { grupo: 'Taxas', campos: [
    ['tde', 'TDE'], ['tda', 'TDA'], ['gris', 'GRIS'], ['pedagio', 'Pedágio'], ['trt', 'TRT'],
    ['ad_valorem', 'Ad Valorem'], ['reentrega', 'Reentrega'], ['devolucao', 'Devolução'], ['outras_despesas', 'Outras Despesas'],
  ]},
  { grupo: 'Status e Glosa', campos: [
    ['status', 'Status'], ['status_aprovacao', 'Aprovação'], ['glosa_valor', 'Valor da Glosa'],
    ['glosa_motivo', 'Motivo da Glosa'], ['observacoes', 'Observações'],
  ]},
];

document.getElementById('listaCamposBI').innerHTML = CAMPOS_BI.map((g) => `
  <div style="grid-column: 1 / -1; font-size:10.5px; color:var(--texto-fraco); text-transform:uppercase; margin-top:8px;">${g.grupo}</div>
  ${g.campos.map(([id, rotulo]) => `
    <label style="display:flex; align-items:center; gap:6px; font-size:12.5px; cursor:pointer;">
      <input type="checkbox" class="campo-bi-checkbox" value="${id}" data-rotulo="${rotulo}" />
      ${rotulo}
    </label>
  `).join('')}
`).join('');

// Relatórios: mostra uma sub-tela (gráficos, entregas, notas sem mapa, BI...).
const SUBABAS_RELATORIO = { graficos: 'subabaGraficos', entregas: 'subabaEntregas', semMapa: 'subabaSemMapa', melhorTransp: 'subabaMelhorTransp', consolidacao: 'subabaConsolidacao', roteirizar: 'subabaRoteirizar', bi: 'subabaBI',
  comparador: 'subabaComparador', anomalias: 'subabaAnomalias', scorecard: 'subabaScorecard', nfeCte: 'subabaNfeCte', auditoriaFrete: 'subabaAuditoriaFrete' };
function mostrarSubabaRelatorio(nome) {
  if (!SUBABAS_RELATORIO[nome]) nome = 'graficos';
  Object.entries(SUBABAS_RELATORIO).forEach(([k, id]) => document.getElementById(id)?.classList.toggle('oculto', k !== nome));
  document.querySelectorAll('.botao-subaba').forEach((b) => {
    const ativo = b.dataset.subaba === nome;
    b.classList.toggle('ativo', ativo); b.classList.toggle('btn-primario', ativo); b.classList.toggle('btn-secundario', !ativo);
  });
  document.querySelectorAll('.nav-subitem').forEach((i) => i.classList.toggle('ativo', i.dataset.subaba === nome));
  if (nome === 'graficos') setTimeout(carregarRelatorios, 60);
  if (nome === 'entregas') carregarEntregasPrevistas();
  if (nome === 'semMapa') carregarSemMapa();
  if (nome === 'melhorTransp') carregarMelhorTransp();
  if (nome === 'consolidacao') carregarRotas();
  if (nome === 'roteirizar') window.carregarRoteirizacao?.();
  if (nome === 'anomalias') { carregarAnomalias(); carregarDuplicidades(); }
  if (nome === 'scorecard') carregarScorecard();
  if (nome === 'nfeCte') carregarNfeCte();
  if (nome === 'auditoriaFrete') carregarRelatorioAuditoriaFrete();
}
document.querySelectorAll('.botao-subaba').forEach((botao) => {
  botao.addEventListener('click', () => mostrarSubabaRelatorio(botao.dataset.subaba));
});
// Itens do submenu de Relatórios no menu da esquerda.
document.querySelectorAll('.nav-subitem').forEach((sub) => {
  sub.addEventListener('click', (e) => {
    e.stopPropagation();
    if (document.getElementById('pagina-relatorios').classList.contains('oculto')) irParaPagina('relatorios');
    mostrarSubabaRelatorio(sub.dataset.subaba);
  });
});

document.getElementById('btnBiMarcarTodos').addEventListener('click', () => {
  document.querySelectorAll('.campo-bi-checkbox').forEach((c) => { c.checked = true; });
});
document.getElementById('btnBiDesmarcarTodos').addEventListener('click', () => {
  document.querySelectorAll('.campo-bi-checkbox').forEach((c) => { c.checked = false; });
});

function montarQueryStringBI() {
  const campos = Array.from(document.querySelectorAll('.campo-bi-checkbox:checked')).map((c) => c.value);
  const params = new URLSearchParams({ campos: campos.join(',') });
  const transportadora = document.getElementById('biFiltroTransportadora').value.trim();
  const status = document.getElementById('biFiltroStatus').value;
  const dataDe = document.getElementById('biFiltroDataDe').value;
  const dataAte = document.getElementById('biFiltroDataAte').value;
  if (transportadora) params.set('transportadora', transportadora);
  if (status) params.set('status', status);
  if (dataDe) params.set('data_de', dataDe);
  if (dataAte) params.set('data_ate', dataAte);
  return { params, campos };
}

async function buscarDadosBI() {
  const { params, campos } = montarQueryStringBI();
  if (campos.length === 0) {
    mostrarAlerta('Escolha pelo menos um campo primeiro.');
    return null;
  }
  const resposta = await apiFetch(`/api/fretes/bi?${params.toString()}`);
  const dados = await resposta.json();
  if (!resposta.ok) { mostrarAlerta(dados.erro || 'Erro ao gerar o relatório.'); return null; }
  return dados;
}

document.getElementById('btnBiGerarPrevia').addEventListener('click', async () => {
  const infoEl = document.getElementById('biResultadoInfo');
  infoEl.textContent = 'Gerando prévia...';
  const dados = await buscarDadosBI();
  if (!dados) { infoEl.textContent = 'Escolha os campos e clique em "Ver prévia".'; return; }

  const rotulos = Array.from(document.querySelectorAll('.campo-bi-checkbox:checked')).map((c) => c.dataset.rotulo);
  document.getElementById('cabecalhoTabelaBI').innerHTML = rotulos.map((r) => `<th>${r}</th>`).join('');

  const corpo = document.querySelector('#tabelaBI tbody');
  const primeiras200 = dados.linhas.slice(0, 200);
  const formatarCelula = (campo, valor) => {
    if (valor == null || valor === '') return '—';
    if (campo.startsWith('data_')) return formatoData(valor);
    return valor;
  };
  corpo.innerHTML = primeiras200.map((linha) => `
    <tr>${dados.campos.map((c) => `<td>${formatarCelula(c, linha[c])}</td>`).join('')}</tr>
  `).join('') || `<tr><td colspan="${dados.campos.length}" style="color:var(--texto-fraco);">Nenhum registro encontrado com esses filtros.</td></tr>`;

  infoEl.textContent = `${dados.linhas.length} registro(s) encontrado(s)${dados.linhas.length > 200 ? ' — mostrando os primeiros 200 na prévia (a exportação leva todos)' : ''}.`;
});

document.getElementById('btnBiExportarExcel').addEventListener('click', async () => {
  const infoEl = document.getElementById('biResultadoInfo');
  infoEl.textContent = 'Gerando arquivo...';
  const dados = await buscarDadosBI();
  if (!dados) { infoEl.textContent = 'Escolha os campos e clique em "Ver prévia".'; return; }

  const rotulos = Array.from(document.querySelectorAll('.campo-bi-checkbox:checked')).map((c) => c.dataset.rotulo);
  const linhasCsv = [rotulos, ...dados.linhas.map((linha) => dados.campos.map((c) => {
    const v = linha[c];
    if (v == null || v === '') return '';
    return c.startsWith('data_') ? formatoData(v) : v;
  }))];
  const csv = linhasCsv.map((linha) => linha.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\r\n');

  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `relatorio-personalizado-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);

  infoEl.textContent = `${dados.linhas.length} registro(s) exportado(s).`;
});

// ---------- Histórico de versões da Tabela de Preço ----------
document.getElementById('btnVerHistoricoTabelaPreco').addEventListener('click', async () => {
  if (!editandoTabelaPrecoId) return;
  const lista = document.getElementById('listaVersoesTabelaPreco');
  lista.innerHTML = 'Carregando...';
  document.getElementById('painelHistoricoTabelaPreco').classList.remove('oculto');

  try {
    const resposta = await apiFetch(`/api/tabelas-preco/${editandoTabelaPrecoId}/versoes`);
    const versoes = await resposta.json();
    if (!resposta.ok) { lista.textContent = versoes.erro || 'Erro ao carregar.'; return; }

    lista.innerHTML = versoes.length
      ? versoes.map((v) => `
          <div style="display:flex; justify-content:space-between; align-items:center; padding:12px 4px; border-bottom:1px solid var(--borda);">
            <div>
              <strong>${formatoDataHora(v.criado_em)}</strong>
              <div style="font-size:11.5px; color:var(--texto-fraco);">Editado por ${v.usuario_nome || '—'}</div>
            </div>
            <button class="btn btn-secundario" style="width:auto; padding:7px 14px; font-size:12px;" onclick="verDetalheVersaoTabela(${v.id}, '${formatoDataHora(v.criado_em)}')">Ver como estava</button>
          </div>
        `).join('')
      : '<p style="color:var(--texto-fraco); padding:20px 4px;">Essa tabela ainda não teve nenhuma edição registrada — o histórico começa a partir da próxima vez que ela for editada.</p>';
  } catch (err) {
    lista.textContent = 'Falha de conexão com o servidor.';
  }
});

document.getElementById('btnFecharHistoricoTabelaPreco').addEventListener('click', () => {
  document.getElementById('painelHistoricoTabelaPreco').classList.add('oculto');
});

async function verDetalheVersaoTabela(versaoId, quando) {
  const painel = document.getElementById('painelDetalheVersaoTabela');
  const conteudo = document.getElementById('conteudoDetalheVersaoTabela');
  document.getElementById('tituloDetalheVersaoTabela').textContent = `Como estava em ${quando}`;
  conteudo.textContent = 'Carregando...';
  painel.classList.remove('oculto');

  try {
    const resposta = await apiFetch(`/api/tabelas-preco/versoes/${versaoId}`);
    const versao = await resposta.json();
    if (!resposta.ok) { conteudo.textContent = versao.erro || 'Erro ao carregar.'; return; }

    const dados = versao.dados_json;
    const faixas = dados.faixas || [];
    conteudo.innerHTML = `
      <p><strong>Nome:</strong> ${dados.nome || '—'} · <strong>Prazo padrão:</strong> ${dados.prazo_dias ?? '—'} dias ·
         <strong>GRIS:</strong> ${dados.gris_percentual ?? '—'}% · <strong>Ad Valorem:</strong> ${dados.ad_valorem_percentual ?? '—'}% ·
         <strong>Pedágio:</strong> ${formatoMoeda(dados.pedagio)} · <strong>TDE:</strong> ${formatoMoeda(dados.tde)} · <strong>TDA:</strong> ${formatoMoeda(dados.tda)}</p>
      <table style="width:100%; margin-top:10px;">
        <thead><tr><th>Origem</th><th>Destino</th><th>Tipo</th><th>Modo</th><th>Valor/Volume</th><th>Volume Mín.</th><th>Frete Mín.</th><th>Cidades</th></tr></thead>
        <tbody>
          ${faixas.map((f) => `
            <tr>
              <td>${f.origem || '—'}</td><td>${f.destino || '—'}</td><td>${f.tipo_carga || '—'}</td>
              <td>${f.modo_calculo === 'peso' ? 'Por Peso' : 'Por Volume'}</td>
              <td>${formatoMoeda(f.valor_por_kg)}</td><td>${f.volume_minimo ?? '—'}</td><td>${formatoMoeda(f.frete_minimo)}</td>
              <td style="max-width:200px; white-space:normal;">${f.cidades || '—'}</td>
            </tr>
          `).join('') || '<tr><td colspan="8" style="color:var(--texto-fraco);">Sem trechos nessa versão.</td></tr>'}
        </tbody>
      </table>
    `;
  } catch (err) {
    conteudo.textContent = 'Falha de conexão com o servidor.';
  }
}

document.getElementById('btnFecharDetalheVersaoTabela').addEventListener('click', () => {
  document.getElementById('painelDetalheVersaoTabela').classList.add('oculto');
});

// ---------- Comparador de Cotações ----------
document.getElementById('btnComparar').addEventListener('click', async () => {
  const resultadoEl = document.getElementById('resultadoComparador');
  const cidade = document.getElementById('compCidade').value.trim();
  const bairro = document.getElementById('compBairro').value.trim();

  if (!cidade && !bairro) {
    resultadoEl.textContent = 'Preencha pelo menos a cidade.';
    return;
  }

  resultadoEl.textContent = 'Comparando...';

  const params = new URLSearchParams({
    cidade, bairro,
    qtd_volumes: document.getElementById('compQtdVolumes').value || '0',
    peso_kg: document.getElementById('compPesoKg').value || '',
    cubagem_m3: document.getElementById('compCubagemM3').value || '',
    valor_faturado: paraNumeroMoeda(document.getElementById('compValorFaturado').value) || '',
  });

  try {
    const resposta = await apiFetch(`/api/tabelas-preco/comparar?${params.toString()}`);
    const resultados = await resposta.json();
    if (!resposta.ok) { resultadoEl.textContent = resultados.erro || 'Erro ao comparar.'; return; }

    if (resultados.length === 0) {
      resultadoEl.innerHTML = `Nenhuma transportadora tem trecho cadastrado pra "${cidade || bairro}" ainda.`;
      return;
    }

    resultadoEl.innerHTML = `
      <p style="margin-top:0;">${resultados.length} transportadora(s) encontrada(s), da mais barata pra mais cara:</p>
      <table style="width:100%;">
        <thead><tr>
          <th>#</th><th>Transportadora</th><th>Tabela</th><th>Trecho</th><th>Modo</th><th>Prazo</th><th>Frete Base</th><th>Valor Total Calculado</th>
        </tr></thead>
        <tbody>
          ${resultados.map((r, i) => `
            <tr style="${i === 0 ? 'background:rgba(31,157,92,0.12);' : ''}">
              <td>${i === 0 ? '🏆' : i + 1}</td>
              <td>${r.transportadora}</td>
              <td>${r.tabela_nome || '—'}</td>
              <td>${r.origem || '?'} → ${r.destino || '?'} (${r.tipo_carga || 'Geral'})</td>
              <td>${r.modo === 'peso' ? 'Por Peso' : 'Por Volume'}</td>
              <td>${r.prazo_dias != null ? `${r.prazo_dias} dia(s)` : '—'}</td>
              <td>${formatoMoeda(r.freteBase)}</td>
              <td><strong>${formatoMoeda(r.valorTotal)}</strong></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  } catch (err) {
    resultadoEl.textContent = 'Falha de conexão com o servidor.';
  }
});

// ---------- Comparador de Cotações ----------
document.getElementById('btnComparar').addEventListener('click', async () => {
  const resultadoEl = document.getElementById('resultadoComparador');
  const cidade = document.getElementById('compCidade').value.trim();
  const bairro = document.getElementById('compBairro').value.trim();

  if (!cidade && !bairro) {
    resultadoEl.textContent = 'Preencha pelo menos a cidade.';
    return;
  }

  const params = new URLSearchParams();
  if (cidade) params.set('cidade', cidade);
  if (bairro) params.set('bairro', bairro);
  const qtdVolumes = document.getElementById('compQtdVolumes').value;
  const pesoKg = document.getElementById('compPesoKg').value;
  const cubagemM3 = document.getElementById('compCubagemM3').value;
  const valorFaturado = paraNumeroMoeda(document.getElementById('compValorFaturado').value);
  if (qtdVolumes) params.set('qtd_volumes', qtdVolumes);
  if (pesoKg) params.set('peso_kg', pesoKg);
  if (cubagemM3) params.set('cubagem_m3', cubagemM3);
  if (valorFaturado) params.set('valor_faturado', valorFaturado);

  resultadoEl.textContent = 'Comparando...';

  try {
    const resposta = await apiFetch(`/api/tabelas-preco/comparar?${params.toString()}`);
    const resultados = await resposta.json();
    if (!resposta.ok) { resultadoEl.textContent = resultados.erro || 'Erro ao comparar.'; return; }

    if (resultados.length === 0) {
      resultadoEl.innerHTML = `Nenhuma transportadora cadastrada tem um trecho cobrindo "${cidade || bairro}".`;
      return;
    }

    resultadoEl.innerHTML = `
      <table style="width:100%; font-size:12.5px;">
        <thead>
          <tr>
            <th style="text-align:left;">#</th><th style="text-align:left;">Transportadora</th>
            <th style="text-align:left;">Trajeto</th><th style="text-align:left;">Modo</th>
            <th style="text-align:left;">Prazo</th><th style="text-align:right;">Frete Base</th>
            <th style="text-align:right;">Valor Total</th>
          </tr>
        </thead>
        <tbody>
          ${resultados.map((r, i) => `
            <tr style="${i === 0 ? 'background:rgba(31,157,92,0.12);' : ''}">
              <td>${i === 0 ? '🏆' : i + 1}</td>
              <td>${r.transportadora}</td>
              <td>${r.origem || '—'} → ${r.destino || '—'}</td>
              <td>${r.modo === 'peso' ? 'Por Peso' : 'Por Volume'}</td>
              <td>${r.prazo_dias != null ? `${r.prazo_dias} dia(s)` : '—'}</td>
              <td style="text-align:right;">${formatoMoeda(r.freteBase)}</td>
              <td style="text-align:right;"><strong>${formatoMoeda(r.valorTotal)}</strong></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      <p style="font-size:11px; color:var(--texto-fraco); margin-top:10px;">🏆 = opção mais barata. "Valor Total" já inclui Ad Valorem, GRIS, Pedágio e Taxas.</p>
    `;
  } catch (err) {
    resultadoEl.textContent = 'Falha de conexão com o servidor.';
  }
});

// ---------- Central de Notificações ----------
// O sino junta os alertas do sistema (retidos, vencimentos...) com os avisos
// da agenda de cada usuário (convites, alterações e lembretes).
let notificacoesSistema = [];
async function carregarNotificacoes() {
  try {
    const resposta = await apiFetch('/api/notificacoes');
    if (!resposta.ok) return;
    notificacoesSistema = await resposta.json();
    renderizarSino();
  } catch (err) {
    console.error(err);
  }
}

function renderizarSino() {
  const avisosAgenda = (typeof agAvisos !== 'undefined' ? agAvisos : []).map((a) => ({
    tipo: a.tipo.startsWith('lembrete') ? 'alerta' : 'aviso',
    icone: AG_ICONES[a.tipo] || '📅', pagina: 'agenda', avisoAgenda: a,
    texto: `<strong>${cfEsc(a.titulo || '')}</strong> — ${cfEsc(a.texto || '')}`,
  }));
  const todas = [...avisosAgenda, ...notificacoesSistema];

  const contador = document.getElementById('contadorNotificacoes');
  if (todas.length > 0) {
    contador.textContent = todas.length;
    contador.classList.remove('oculto');
  } else {
    contador.classList.add('oculto');
  }

  const coresPorTipo = { urgente: 'var(--vermelho)', alerta: '#e8890c', aviso: '#8a94a6' };
  document.getElementById('painelNotificacoes').innerHTML = todas.length
    ? todas.map((n) => `
        <div class="notificacao-item" data-pagina="${n.pagina}" data-alvo="${n.alvo || ''}" ${n.avisoAgenda ? `data-aviso-agenda="${n.avisoAgenda.id}" data-evento-agenda="${n.avisoAgenda.evento_id || ''}"` : ''} style="display:flex; gap:10px; padding:12px 14px; border-bottom:1px solid var(--borda); cursor:pointer; align-items:flex-start;">
          <span style="font-size:16px;">${n.icone}</span>
          <span style="font-size:12.5px; color:${n.avisoAgenda ? 'var(--texto)' : (coresPorTipo[n.tipo] || 'var(--texto)')};">${n.texto}</span>
        </div>
      `).join('')
    : '<div style="padding:20px 14px; font-size:12.5px; color:var(--texto-fraco);">Nenhuma notificação — tudo em dia! ✓</div>';
}
carregarNotificacoes();
setInterval(carregarNotificacoes, 5 * 60 * 1000); // atualiza sozinho a cada 5 minutos

// O painel abre "por cima" da tela (posição fixa): dentro do menu lateral, que tem
// rolagem, ele era recortado. Fica logo abaixo do sino e sempre dentro da janela.
// O painel vai para o nível da página (fora do menu lateral): dentro do menu ele
// ficava preso à "camada" do menu e aparecia por trás dos cartões da tela.
{ const painelNotif = document.getElementById('painelNotificacoes'); if (painelNotif && painelNotif.parentElement !== document.body) document.body.appendChild(painelNotif); }
function posicionarPainelNotificacoes() {
  const painel = document.getElementById('painelNotificacoes');
  const r = document.getElementById('btnNotificacoes').getBoundingClientRect();
  const largura = Math.min(400, window.innerWidth - 16);
  const esquerda = Math.max(8, Math.min(r.left, window.innerWidth - largura - 8));
  painel.style.left = `${esquerda}px`;
  painel.style.top = `${Math.min(r.bottom + 8, window.innerHeight - 120)}px`;
}
document.getElementById('btnNotificacoes').addEventListener('click', (e) => {
  e.stopPropagation();
  const painel = document.getElementById('painelNotificacoes');
  painel.classList.toggle('oculto');
  if (!painel.classList.contains('oculto')) posicionarPainelNotificacoes();
});
window.addEventListener('resize', () => { if (!document.getElementById('painelNotificacoes').classList.contains('oculto')) posicionarPainelNotificacoes(); });
document.addEventListener('click', (e) => {
  const painel = document.getElementById('painelNotificacoes');
  if (!painel.classList.contains('oculto') && !painel.contains(e.target) && e.target.id !== 'btnNotificacoes') {
    painel.classList.add('oculto');
  }
});
document.getElementById('painelNotificacoes').addEventListener('click', (e) => {
  const item = e.target.closest('.notificacao-item');
  if (!item) return;
  document.getElementById('painelNotificacoes').classList.add('oculto');
  const navItem = document.querySelector(`.nav-item[data-pagina="${item.dataset.pagina}"]`);
  if (navItem) navItem.click();
  if (item.dataset.alvo) setTimeout(() => irParaAlvoNotificacao(item.dataset.alvo), 150);
  if (item.dataset.avisoAgenda) {
    agMarcarLidos([Number(item.dataset.avisoAgenda)]);
    if (item.dataset.eventoAgenda) carregarAgenda().then(() => agAbrirDetalheId(item.dataset.eventoAgenda));
  }
});

// Depois de abrir a tela, leva ao ponto exato do aviso (aba, painel) e
// destaca por um instante, pra ficar claro onde está o que precisa de atenção.
function irParaAlvoNotificacao(alvo) {
  const destacar = (el) => {
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    el.classList.remove('destaque-notificacao');
    void el.offsetWidth; // reinicia a animação
    el.classList.add('destaque-notificacao');
  };
  switch (alvo) {
    case 'backup': destacar(document.getElementById('btnBackupAgora')?.closest('.painel')); break;
    case 'tabelas-preco': document.querySelector('.sub-tab[data-subpagina="tabelas-preco"]')?.click(); break;
    case 'anomalias': {
      const botao = document.querySelector('.botao-subaba[data-subaba="anomalias"]');
      botao?.click();
      destacar(document.getElementById('listaAnomalias')?.closest('.painel'));
      break;
    }
    case 'retidos': destacar(document.getElementById('kanbanAuditoria')); break;
    case 'vencimentos': destacar(document.querySelector('#pagina-financeiro .painel')); break;
    case 'meta': destacar(document.getElementById('areaProgressoMeta')?.closest('.painel')); break;
    case 'entregas-previstas': mostrarSubabaRelatorio('entregas'); destacar(document.getElementById('painelEntregasPrevistas')); break;
    case 'sem-mapa': mostrarSubabaRelatorio('semMapa'); break;
    case 'sinistros-cobrar': destacar(document.getElementById('tabelaSinistros')?.closest('.painel') || document.getElementById('tabelaSinistros')); break;
    default: break;
  }
}

// ---------- Meta de Gasto com Frete (mês atual) ----------
async function carregarMetaFrete() {
  const mesAtual = new Date().toISOString().slice(0, 7);
  try {
    const resposta = await apiFetch(`/api/metas-frete/comparativo?mes=${mesAtual}`);
    const dados = await resposta.json();
    if (!resposta.ok) return;

    const areaEl = document.getElementById('areaProgressoMeta');
    if (dados.metaGeral == null) {
      document.getElementById('metaValorGeral').value = '';
      areaEl.innerHTML = `<p style="font-size:12.5px; color:var(--texto-fraco); margin:0;">Nenhuma meta definida ainda pra esse mês. Gasto até agora: <strong>${formatoMoeda(dados.realizadoGeral)}</strong>.</p>`;
      return;
    }

    document.getElementById('metaValorGeral').value = formatarMoedaExibicao(dados.metaGeral);
    const percentual = Math.min(100, (dados.realizadoGeral / dados.metaGeral) * 100);
    const estourou = dados.realizadoGeral > dados.metaGeral;
    const cor = estourou ? 'var(--vermelho)' : (percentual >= 90 ? '#e8890c' : 'var(--verde)');

    areaEl.innerHTML = `
      <div style="display:flex; justify-content:space-between; font-size:12.5px; margin-bottom:6px;">
        <span>${formatoMoeda(dados.realizadoGeral)} de ${formatoMoeda(dados.metaGeral)}</span>
        <span style="color:${cor}; font-weight:600;">${percentual.toFixed(0)}%${estourou ? ' — ESTOUROU' : ''}</span>
      </div>
      <div style="height:10px; border-radius:6px; background:var(--bg-elevado); overflow:hidden;">
        <div style="height:100%; width:${percentual}%; background:${cor};"></div>
      </div>
    `;
  } catch (err) {
    console.error(err);
  }
}

document.getElementById('btnSalvarMeta').addEventListener('click', async () => {
  const mesAtual = new Date().toISOString().slice(0, 7);
  const valor = paraNumeroMoeda(document.getElementById('metaValorGeral').value);
  if (!valor) { mostrarAlerta('Digite um valor de meta.'); return; }

  try {
    const resposta = await apiFetch('/api/metas-frete', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mes_referencia: mesAtual, valor_meta: valor }),
    });
    if (!resposta.ok) { const d = await resposta.json(); mostrarAlerta(d.erro || 'Erro ao salvar.'); return; }
    carregarMetaFrete();
  } catch (err) {
    mostrarAlerta('Falha de conexão com o servidor.');
  }
});

// ---------- Sinistros e Avarias ----------
let editandoSinistroId = null;

// "Cobrar em": data + aviso quando já passou ou é hoje (enquanto não resolvido).
function sinCelulaCobranca(s) {
  if (!s.data_cobranca) return '—';
  const data = String(s.data_cobranca).slice(0, 10);
  const pendente = s.status !== 'Resolvido' && !s.ressarcido;
  const hoje = agDataLocal(new Date());
  const selo = !pendente ? '' : data < hoje ? '<span class="sin-cobrar atrasada">atrasada</span>' : data === hoje ? '<span class="sin-cobrar hoje">hoje</span>' : '';
  return `${formatoData(s.data_cobranca)}${selo}`;
}

async function carregarSinistros() {
  try {
    const [respLista, respResumo] = await Promise.all([
      apiFetch('/api/sinistros'),
      apiFetch('/api/sinistros/resumo'),
    ]);
    const lista = await respLista.json();
    const resumo = await respResumo.json();

    document.getElementById('sinQtdTotal').textContent = resumo.qtd_total;
    document.getElementById('sinQtdAbertos').textContent = resumo.qtd_abertos;
    document.getElementById('sinTotalPrejuizo').textContent = formatoMoeda(resumo.total_prejuizo);
    document.getElementById('sinTotalRessarcido').textContent = formatoMoeda(resumo.total_ressarcido);

    const coresStatusSinistro = { Aberto: 'badge-cancelado', 'Em Negociação': 'badge-pendente', Resolvido: 'badge-faturado' };
    const corpo = document.querySelector('#tabelaSinistros tbody');
    corpo.innerHTML = lista.map((s) => `
      <tr style="cursor:pointer;" onclick="abrirFormularioSinistro(${s.id})">
        <td>${s.numero_nf ? cfEsc(s.numero_nf) : (s.numero_pedido ? `<span style="color:var(--texto-fraco);">Pedido ${cfEsc(s.numero_pedido)}</span>` : '—')}</td>
        <td>${s.transportadora ? cfEsc(s.transportadora) : '—'}</td>
        <td>${s.tipo}</td>
        <td>${s.data_ocorrencia ? formatoData(s.data_ocorrencia) : '—'}</td>
        <td>${formatoMoeda(s.valor_prejuizo)}</td>
        <td>${s.ressarcido ? `✓ ${formatoMoeda(s.valor_ressarcido)}${s.data_ressarcimento ? `<div style="font-size:11px; color:var(--texto-fraco);">em ${formatoData(s.data_ressarcimento)}</div>` : ''}` : '—'}</td>
        <td style="white-space:nowrap;">${sinCelulaCobranca(s)}</td>
        <td><span class="badge ${coresStatusSinistro[s.status] || 'badge-pendente'}">${s.status}</span></td>
      </tr>
    `).join('') || `<tr><td colspan="8" style="color:var(--texto-fraco);">Nenhum sinistro registrado ainda.</td></tr>`;
  } catch (err) {
    console.error(err);
  }
}

let sinPedidoDaNota = null; // número do pedido achado pela nota (vai junto ao salvar)

function sinAtualizarRessarcido() {
  const marcado = document.getElementById('sinRessarcido').checked;
  document.querySelectorAll('.sin-campo-ressarc').forEach((el) => el.classList.toggle('oculto', !marcado));
  // Marcou agora e a data está vazia: já sugere hoje.
  const data = document.getElementById('sinDataRessarcimento');
  if (marcado && !data.value) data.value = agDataLocal(new Date());
}

function limparFormularioSinistro() {
  editandoSinistroId = null;
  sinPedidoDaNota = null;
  document.getElementById('tituloFormSinistro').textContent = 'Novo Sinistro';
  ['sinNumeroNf', 'sinTransportadora', 'sinDataOcorrencia', 'sinValorPrejuizo', 'sinValorRessarcido', 'sinDataRessarcimento', 'sinDataCobranca', 'sinDescricao']
    .forEach((id) => { document.getElementById(id).value = ''; });
  document.getElementById('sinTipo').value = 'Avaria';
  document.getElementById('sinStatus').value = 'Aberto';
  document.getElementById('sinRessarcido').checked = false;
  document.getElementById('sinInfoNf').classList.add('oculto');
  document.getElementById('sinSugestoesTransp').classList.add('oculto');
  document.getElementById('btnExcluirSinistro').classList.add('oculto');
  sinAtualizarRessarcido();
}

document.getElementById('btnNovoSinistro').addEventListener('click', () => {
  limparFormularioSinistro();
  document.getElementById('painelFormSinistro').classList.remove('oculto');
  setTimeout(() => document.getElementById('sinNumeroNf').focus(), 50);
});

async function abrirFormularioSinistro(id) {
  try {
    const resposta = await apiFetch('/api/sinistros');
    const lista = await resposta.json();
    const s = lista.find((x) => x.id === id);
    if (!s) return;

    limparFormularioSinistro();
    editandoSinistroId = id;
    sinPedidoDaNota = s.numero_pedido || null;
    document.getElementById('tituloFormSinistro').textContent = `Sinistro #${id}`;
    document.getElementById('sinNumeroNf').value = s.numero_nf || '';
    document.getElementById('sinTransportadora').value = s.transportadora || '';
    document.getElementById('sinTipo').value = s.tipo;
    document.getElementById('sinDataOcorrencia').value = s.data_ocorrencia ? String(s.data_ocorrencia).slice(0, 10) : '';
    document.getElementById('sinValorPrejuizo').value = formatarMoedaExibicao(s.valor_prejuizo);
    document.getElementById('sinStatus').value = s.status;
    document.getElementById('sinRessarcido').checked = !!s.ressarcido;
    document.getElementById('sinValorRessarcido').value = formatarMoedaExibicao(s.valor_ressarcido);
    document.getElementById('sinDataRessarcimento').value = s.data_ressarcimento ? String(s.data_ressarcimento).slice(0, 10) : '';
    document.getElementById('sinDataCobranca').value = s.data_cobranca ? String(s.data_cobranca).slice(0, 10) : '';
    document.getElementById('sinDescricao').value = s.descricao || '';
    sinAtualizarRessarcido();
    if (s.numero_nf) sinBuscarNota(false);
    else if (s.numero_pedido) {
      const info = document.getElementById('sinInfoNf');
      info.className = 'sin-info-nf nao-achou';
      info.textContent = `Registro antigo, feito pelo número do pedido (${s.numero_pedido}). Informe a nota fiscal para atualizar.`;
    }
    document.getElementById('btnExcluirSinistro').classList.remove('oculto');
    document.getElementById('painelFormSinistro').classList.remove('oculto');
  } catch (err) {
    mostrarAlerta('Falha de conexão com o servidor.');
  }
}

// ---- Nota fiscal: acha o frete e preenche pedido e transportadora ----
let sinUltimaNotaBuscada = '';
async function sinBuscarNota(preencher = true) {
  const nf = document.getElementById('sinNumeroNf').value.trim();
  const info = document.getElementById('sinInfoNf');
  if (!nf) { info.classList.add('oculto'); sinPedidoDaNota = null; return; }
  if (nf === sinUltimaNotaBuscada && !info.classList.contains('oculto')) return;
  sinUltimaNotaBuscada = nf;
  try {
    const resposta = await apiFetch(`/api/sinistros/buscar-nf?nf=${encodeURIComponent(nf)}`);
    const f = resposta.ok ? await resposta.json() : null;
    info.classList.remove('oculto');
    if (!f) {
      info.className = 'sin-info-nf nao-achou';
      info.textContent = `Nota fiscal ${nf} não encontrada nos fretes. Dá para salvar mesmo assim; informe a transportadora.`;
      if (preencher) sinPedidoDaNota = null;
      return;
    }
    info.className = 'sin-info-nf';
    info.innerHTML = `📄 NF <b>${cfEsc(f.numero_nf)}</b> · Pedido <b>${cfEsc(f.numero_pedido || '—')}</b> · ${cfEsc(f.cliente || '—')}`
      + `${f.cidade ? ` · ${cfEsc(f.cidade)}${f.uf ? `/${cfEsc(f.uf)}` : ''}` : ''}`
      + `${f.numero_cte ? ` · CT-e ${cfEsc(f.numero_cte)}` : ''}`
      + `${f.valor_faturado != null ? ` · Mercadoria ${formatoMoeda(f.valor_faturado)}` : ''}`;
    sinPedidoDaNota = f.numero_pedido || null;
    const campoTransp = document.getElementById('sinTransportadora');
    if (preencher && f.transportadora && !campoTransp.value.trim()) campoTransp.value = f.transportadora;
  } catch (err) { /* sem conexão: segue sem os dados da nota */ }
}
document.getElementById('sinNumeroNf').addEventListener('blur', () => sinBuscarNota(true));
document.getElementById('sinNumeroNf').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); sinBuscarNota(true); document.getElementById('sinTransportadora').focus(); }
});

// ---- Transportadora: busca por nome ou CNPJ enquanto digita ----
let sinTimerBusca = null;
let sinSugestoes = [];
let sinSugestaoAtiva = -1;
function sinFecharSugestoes() {
  document.getElementById('sinSugestoesTransp').classList.add('oculto');
  sinSugestaoAtiva = -1;
}
function sinEscolherTransportadora(i) {
  const t = sinSugestoes[i];
  if (!t) return;
  document.getElementById('sinTransportadora').value = t.nome;
  sinFecharSugestoes();
}
function sinRenderizarSugestoes() {
  const caixa = document.getElementById('sinSugestoesTransp');
  if (!sinSugestoes.length) {
    caixa.innerHTML = '<div class="sin-sugestao" style="cursor:default; color:var(--texto-fraco);">Nenhuma transportadora encontrada — o nome digitado será usado.</div>';
  } else {
    caixa.innerHTML = sinSugestoes.map((t, i) => `
      <div class="sin-sugestao ${i === sinSugestaoAtiva ? 'ativa' : ''}" data-sin-i="${i}">
        ${cfEsc(t.nome)}${t.cnpj ? `<small>CNPJ ${cfEsc(formatarCnpj(t.cnpj))}</small>` : ''}
      </div>`).join('');
  }
  caixa.classList.remove('oculto');
}
document.getElementById('sinTransportadora').addEventListener('input', (e) => {
  clearTimeout(sinTimerBusca);
  const q = e.target.value.trim();
  if (q.length < 2) { sinFecharSugestoes(); return; }
  sinTimerBusca = setTimeout(async () => {
    try {
      const resposta = await apiFetch(`/api/sinistros/transportadoras?q=${encodeURIComponent(q)}`);
      sinSugestoes = resposta.ok ? await resposta.json() : [];
      sinSugestaoAtiva = sinSugestoes.length ? 0 : -1;
      sinRenderizarSugestoes();
    } catch (err) { sinFecharSugestoes(); }
  }, 220);
});
document.getElementById('sinTransportadora').addEventListener('keydown', (e) => {
  const aberta = !document.getElementById('sinSugestoesTransp').classList.contains('oculto');
  if (!aberta || !sinSugestoes.length) return;
  if (e.key === 'ArrowDown') { e.preventDefault(); sinSugestaoAtiva = (sinSugestaoAtiva + 1) % sinSugestoes.length; sinRenderizarSugestoes(); }
  if (e.key === 'ArrowUp') { e.preventDefault(); sinSugestaoAtiva = (sinSugestaoAtiva - 1 + sinSugestoes.length) % sinSugestoes.length; sinRenderizarSugestoes(); }
  if (e.key === 'Enter') { e.preventDefault(); sinEscolherTransportadora(Math.max(0, sinSugestaoAtiva)); }
  if (e.key === 'Escape') { e.stopPropagation(); sinFecharSugestoes(); }
});
document.getElementById('sinSugestoesTransp').addEventListener('mousedown', (e) => {
  const item = e.target.closest('[data-sin-i]');
  if (item) { e.preventDefault(); sinEscolherTransportadora(Number(item.dataset.sinI)); }
});
document.getElementById('sinTransportadora').addEventListener('blur', () => setTimeout(sinFecharSugestoes, 120));

document.getElementById('sinRessarcido').addEventListener('change', sinAtualizarRessarcido);
document.querySelectorAll('.sin-prazo').forEach((b) => b.addEventListener('click', () => {
  const d = new Date(); d.setDate(d.getDate() + Number(b.dataset.dias));
  document.getElementById('sinDataCobranca').value = agDataLocal(d);
}));
document.getElementById('btnSinLimparCobranca').addEventListener('click', () => { document.getElementById('sinDataCobranca').value = ''; });

document.getElementById('btnCancelarSinistro').addEventListener('click', () => {
  document.getElementById('painelFormSinistro').classList.add('oculto');
});

document.getElementById('btnSalvarSinistro').addEventListener('click', async () => {
  const numeroNf = document.getElementById('sinNumeroNf').value.trim();
  if (!numeroNf) { mostrarAlerta('Informe o número da nota fiscal do sinistro.'); return; }
  const ressarcido = document.getElementById('sinRessarcido').checked;
  const corpo = {
    numero_nf: numeroNf,
    numero_pedido: sinPedidoDaNota,
    transportadora: document.getElementById('sinTransportadora').value.trim() || null,
    tipo: document.getElementById('sinTipo').value,
    data_ocorrencia: document.getElementById('sinDataOcorrencia').value || null,
    valor_prejuizo: paraNumeroMoeda(document.getElementById('sinValorPrejuizo').value) || null,
    status: document.getElementById('sinStatus').value,
    ressarcido,
    valor_ressarcido: ressarcido ? (paraNumeroMoeda(document.getElementById('sinValorRessarcido').value) || null) : null,
    data_ressarcimento: ressarcido ? (document.getElementById('sinDataRessarcimento').value || null) : null,
    data_cobranca: document.getElementById('sinDataCobranca').value || null,
    descricao: document.getElementById('sinDescricao').value.trim() || null,
  };

  try {
    const resposta = await apiFetch(
      editandoSinistroId ? `/api/sinistros/${editandoSinistroId}` : '/api/sinistros',
      { method: editandoSinistroId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) }
    );
    if (!resposta.ok) { const d = await resposta.json(); mostrarAlerta(d.erro || 'Erro ao salvar.'); return; }
    document.getElementById('painelFormSinistro').classList.add('oculto');
    carregarSinistros();
  } catch (err) {
    mostrarAlerta('Falha de conexão com o servidor.');
  }
});

document.getElementById('btnExcluirSinistro').addEventListener('click', async () => {
  if (!editandoSinistroId) return;
  if (!(await confirmarExclusao('Tem certeza que deseja excluir esse sinistro?'))) return;
  try {
    await apiFetch(`/api/sinistros/${editandoSinistroId}`, { method: 'DELETE' });
    document.getElementById('painelFormSinistro').classList.add('oculto');
    carregarSinistros();
  } catch (err) {
    mostrarAlerta('Falha de conexão com o servidor.');
  }
});

// ---------- Aviso de Ambiente de Teste ----------
fetch('/api/status').then((r) => r.json()).then((d) => {
  if (d.ambienteTeste) {
    document.getElementById('faixaAmbienteTeste').classList.remove('oculto');
    // Ícone laranja no teste: na barra de tarefas dá pra saber qual janela é qual.
    document.querySelectorAll('link[rel~="icon"]').forEach((l) => { l.href = 'img/nexofrete-icone-teste.svg'; l.type = 'image/svg+xml'; });
  }
}).catch(() => {});

// ---------- Aprovação em Lote (Auditoria de Frete) ----------
function atualizarBarraLoteAuditoria() {
  document.querySelectorAll('.checkbox-lote-auditoria').forEach((cb) => {
    const id = Number(cb.dataset.id);
    if (cb.checked) fretesSelecionadosLote.add(id); else fretesSelecionadosLote.delete(id);
  });
  const barra = document.getElementById('barraLoteAuditoria');
  if (fretesSelecionadosLote.size > 0) {
    barra.classList.remove('oculto');
    document.getElementById('textoLoteAuditoria').textContent = `${fretesSelecionadosLote.size} frete(s) selecionado(s)`;
  } else {
    barra.classList.add('oculto');
  }
}

document.getElementById('btnLimparLoteAuditoria').addEventListener('click', () => {
  fretesSelecionadosLote.clear();
  renderizarAuditoriaFrete();
});

document.getElementById('btnAprovarLoteAuditoria').addEventListener('click', async () => {
  if (fretesSelecionadosLote.size === 0) return;
  const ids = [...fretesSelecionadosLote];
  const justificativa = await pedirTexto(`Justificativa para aprovar esses ${ids.length} frete(s) (opcional).`, { titulo: `Aprovar ${ids.length} frete(s)?`, textoOk: 'Aprovar todos', multilinha: true });
  if (justificativa === null) return;

  try {
    const resposta = await apiFetch('/api/fretes/aprovar-lote', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids, justificativa }),
    });
    const dados = await resposta.json();
    if (!resposta.ok) { mostrarAlerta(dados.erro || 'Erro ao aprovar em lote.'); return; }

    let mensagem = `✓ ${dados.aprovados} de ${dados.total} frete(s) aprovado(s).`;
    if (dados.bloqueadosPorAlcada?.length) {
      mensagem += `\n\n${dados.bloqueadosPorAlcada.length} frete(s) NÃO aprovado(s) por passarem do limite de alçada (precisam de um gerente): ${dados.bloqueadosPorAlcada.join(', ')}`;
    }
    mostrarAlerta(mensagem);
    fretesSelecionadosLote.clear();
    carregarAuditoriaFrete();
  } catch (err) {
    mostrarAlerta('Falha de conexão com o servidor.');
  }
});

// ---------- Anomalias (desvio do padrão histórico) ----------
async function carregarAnomalias() {
  const lista = document.getElementById('listaAnomalias');
  lista.textContent = 'Carregando...';
  try {
    const resposta = await apiFetch('/api/fretes/relatorios/anomalias');
    const anomalias = await resposta.json();
    if (!resposta.ok) { lista.textContent = anomalias.erro || 'Erro ao carregar.'; return; }

    lista.innerHTML = anomalias.length
      ? `<table style="width:100%;">
          <thead><tr>
            <th style="text-align:left;">Pedido</th><th style="text-align:left;">NF</th>
            <th style="text-align:left;">Transportadora</th><th style="text-align:right;">Valor do Frete</th>
            <th style="text-align:right;">Média da Transportadora</th><th style="text-align:right;">Desvio</th>
          </tr></thead>
          <tbody>
            ${anomalias.map((a) => `
              <tr>
                <td>${a.numero_pedido || '—'}</td>
                <td>${a.numero_nf || '—'}</td>
                <td>${a.transportadora}</td>
                <td style="text-align:right;">${formatoMoeda(a.valor_total_frete)}</td>
                <td style="text-align:right; color:var(--texto-fraco);">${formatoMoeda(a.media_transportadora)}</td>
                <td style="text-align:right; color:${a.desvios_padrao > 0 ? 'var(--vermelho)' : '#e8890c'}; font-weight:600;">${a.desvios_padrao > 0 ? '+' : ''}${a.desvios_padrao}σ</td>
              </tr>
            `).join('')}
          </tbody>
        </table>`
      : '<p style="color:var(--texto-fraco);">Nenhuma anomalia encontrada — todos os fretes estão dentro do padrão histórico de cada transportadora.</p>';
  } catch (err) {
    lista.textContent = 'Falha de conexão com o servidor.';
  }
}

// ---------- Importar trechos da Tabela de Preço via Excel ----------
document.getElementById('btnImportarTrechosExcel').addEventListener('click', () => {
  if (!editandoTabelaPrecoId) { mostrarAlerta('Salve a tabela primeiro (com um nome e a transportadora), depois importe os trechos.'); return; }
  document.getElementById('inputImportarTrechosExcel').click();
});

document.getElementById('inputImportarTrechosExcel').addEventListener('change', async (e) => {
  const arquivo = e.target.files[0];
  if (!arquivo) return;

  const formData = new FormData();
  formData.append('arquivo', arquivo);

  try {
    const resposta = await apiFetch(`/api/tabelas-preco/${editandoTabelaPrecoId}/importar-trechos`, {
      method: 'POST',
      body: formData,
    });
    const dados = await resposta.json();
    if (!resposta.ok) { mostrarAlerta(dados.erro || 'Erro ao importar.'); return; }

    let mensagem = `✓ ${dados.importados} de ${dados.total} trecho(s) importado(s).`;
    if (dados.erros?.length) mensagem += `\n\nErros:\n${dados.erros.slice(0, 5).join('\n')}`;
    mostrarAlerta(mensagem);

    // Recarrega a tabela pra já mostrar os trechos novos na tela.
    abrirFormularioTabelaPreco(await (await apiFetch(`/api/tabelas-preco/${editandoTabelaPrecoId}`)).json());
  } catch (err) {
    mostrarAlerta('Falha de conexão com o servidor.');
  } finally {
    e.target.value = '';
  }
});

// ---------- Resumo Executivo Semanal ----------
document.getElementById('btnSalvarResumoSemanal').addEventListener('click', async () => {
  const erroEl = document.getElementById('erroResumoSemanal');
  erroEl.classList.remove('visivel');

  const corpo = {
    resumo_semanal_ativo: document.getElementById('resumoSemanalAtivo').checked,
    resumo_semanal_email: document.getElementById('resumoSemanalEmail').value.trim() || null,
  };

  try {
    const resposta = await apiFetch('/api/email/configuracao', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
    });
    if (!resposta.ok) { const d = await resposta.json(); erroEl.textContent = d.erro || 'Erro ao salvar.'; erroEl.classList.add('visivel'); return; }
    mostrarSucessoTemporario(erroEl);
  } catch (err) {
    erroEl.textContent = 'Falha de conexão com o servidor.';
    erroEl.classList.add('visivel');
  }
});

document.getElementById('btnEnviarResumoAgora').addEventListener('click', async () => {
  const erroEl = document.getElementById('erroResumoSemanal');
  erroEl.classList.remove('visivel');
  try {
    // Salva junto o que está na tela, pra não precisar clicar em Salvar antes do teste.
    const emailDestino = document.getElementById('resumoSemanalEmail').value.trim();
    await apiFetch('/api/email/configuracao', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resumo_semanal_ativo: document.getElementById('resumoSemanalAtivo').checked, resumo_semanal_email: emailDestino || null }),
    });
    const resposta = await apiFetch('/api/email/enviar-resumo-semanal-agora', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: emailDestino }),
    });
    const dados = await resposta.json();
    if (!resposta.ok) { erroEl.textContent = dados.erro || 'Erro ao enviar.'; erroEl.classList.add('visivel'); return; }
    mostrarAlerta(dados.mensagem);
  } catch (err) {
    erroEl.textContent = 'Falha de conexão com o servidor.';
    erroEl.classList.add('visivel');
  }
});

// ---------- Scorecard de Transportadoras ----------
async function carregarScorecard() {
  const lista = document.getElementById('listaScorecard');
  lista.textContent = 'Carregando...';
  try {
    const resposta = await apiFetch('/api/fretes/relatorios/scorecard');
    const dados = await resposta.json();
    if (!resposta.ok) { lista.textContent = dados.erro || 'Erro ao carregar.'; return; }

    const corNota = (n) => n >= 80 ? 'var(--verde)' : n >= 50 ? '#e8890c' : 'var(--vermelho)';

    lista.innerHTML = dados.length
      ? `<table style="width:100%;">
          <thead><tr>
            <th style="text-align:left;">Transportadora</th><th style="text-align:right;">Nota</th>
            <th style="text-align:right;">Fretes</th><th style="text-align:right;">% No Prazo</th>
            <th style="text-align:right;">% Retido</th><th style="text-align:right;">Sinistros</th>
            <th style="text-align:right;">Preço Médio</th>
          </tr></thead>
          <tbody>
            ${dados.map((t) => `
              <tr>
                <td>${t.transportadora}</td>
                <td style="text-align:right;"><span style="background:${corNota(t.nota)}; color:#fff; padding:3px 10px; border-radius:12px; font-weight:700;">${t.nota}</span></td>
                <td style="text-align:right;">${t.qtd_fretes}</td>
                <td style="text-align:right;">${t.percentual_no_prazo != null ? `${t.percentual_no_prazo}%` : '—'}</td>
                <td style="text-align:right; color:${t.percentual_retido > 10 ? 'var(--vermelho)' : 'var(--texto-fraco)'};">${t.percentual_retido}%</td>
                <td style="text-align:right;">${t.qtd_sinistros}</td>
                <td style="text-align:right;">${formatoMoeda(t.preco_medio)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>`
      : '<p style="color:var(--texto-fraco);">Nenhuma transportadora com fretes suficientes ainda (mínimo 3).</p>';
  } catch (err) {
    lista.textContent = 'Falha de conexão com o servidor.';
  }
}

// ---------- Relação NF-e × CT-e ----------
let nfeCteDados = [];
async function carregarNfeCte() {
  const corpo = document.getElementById('nfeCteCorpo');
  const resumo = document.getElementById('nfeCteResumo');
  if (!corpo) return;
  corpo.innerHTML = '<tr><td colspan="8" style="color:var(--texto-fraco);">Carregando...</td></tr>';
  try {
    const busca = document.getElementById('nfeCteBusca')?.value.trim() || '';
    const url = '/api/fretes/relatorios/nfe-cte' + (busca ? `?busca=${encodeURIComponent(busca)}` : '');
    const resposta = await apiFetch(url);
    const dados = await resposta.json();
    if (!resposta.ok) throw new Error(dados.erro || 'Erro ao carregar.');
    nfeCteDados = dados;
    const sem = dados.filter(x => Number(x.qtd_ctes || 0) === 0).length;
    const multi = dados.filter(x => Number(x.qtd_ctes || 0) > 1).length;
    if (resumo) resumo.innerHTML = [
      `<div>NF-e<strong>${dados.length}</strong></div>`,
      `<div>Com CT-e<strong>${dados.length - sem}</strong></div>`,
      `<div>Sem CT-e<strong style="color:${sem ? 'var(--vermelho)' : 'inherit'}">${sem}</strong></div>`,
      `<div>Múltiplos CT-e<strong>${multi}</strong></div>`
    ].join('');
    renderNfeCte();
  } catch (err) {
    corpo.innerHTML = `<tr><td colspan="8" style="color:var(--vermelho);">${cfEsc(err.message || 'Falha de conexão com o servidor.')}</td></tr>`;
  }
}
function renderNfeCte() {
  const corpo = document.getElementById('nfeCteCorpo');
  if (!corpo) return;
  if (!nfeCteDados.length) {
    corpo.innerHTML = '<tr><td colspan="8" style="color:var(--texto-fraco);">Nenhuma NF-e encontrada.</td></tr>';
    return;
  }
  corpo.innerHTML = nfeCteDados.map((r, idx) => {
    const ctes = Array.isArray(r.ctes) ? r.ctes : [];
    const idDetalhe = `nfeCteDetalhe_${idx}`;
    const classeSituacao = Number(r.qtd_ctes || 0) === 0 ? 'badge-pendente' : Number(r.qtd_ctes) > 1 ? 'badge-retido' : 'badge-conferido';
    return `
      <tr>
        <td>${r.numero_nf ? `<button type="button" class="btn-copiar-nf" data-nf="${String(r.numero_nf).replace(/&/g, '&amp;').replace(/"/g, '&quot;')}" title="Clique para copiar a Nota Fiscal"><span class="icone-copiar-nf">📋</span> <span class="numero-nf-copiar">${cfEsc(r.numero_nf)}</span> <span class="contador-copias-nf">×${r.nf_copias || 0}</span></button>` : '—'}</td>
        <td>${cfEsc(r.pedidos || '—')}</td>
        <td>${cfEsc(r.cliente || '—')}</td>
        <td>${cfEsc(r.transportadora_nfe || '—')}</td>
        <td style="text-align:center;"><button type="button" class="btn btn-secundario nfe-cte-toggle" data-alvo="${idDetalhe}" style="width:auto;padding:4px 9px;">${Number(r.qtd_ctes || 0)} ${Number(r.qtd_ctes || 0) === 1 ? 'CT-e' : 'CT-e(s)'} ▾</button></td>
        <td style="text-align:right;">${r.valor_nf != null ? formatoMoeda(r.valor_nf) : '—'}</td>
        <td style="text-align:right;">${r.total_ctes != null ? formatoMoeda(r.total_ctes) : '—'}</td>
        <td style="text-align:center;"><span class="badge ${classeSituacao}">${cfEsc(r.situacao)}</span></td>
      </tr>
      <tr id="${idDetalhe}" class="oculto"><td colspan="8" style="padding:0 10px 12px; background:var(--bg-elevado);">
        ${ctes.length ? `<div style="overflow-x:auto; margin-top:8px;"><table style="width:100%; font-size:11.5px;"><thead><tr><th>CT-e</th><th>Emissão</th><th>Transportadora</th><th>Tipo</th><th>Valor CT-e</th><th>Status</th><th>Chave</th></tr></thead><tbody>${ctes.map(c => `<tr><td><b>${cfEsc(c.numero_cte || '—')}</b>${c.cte_cancelado ? ' 🚫' : ''}</td><td>${formatoData(c.data_emissao_cte)}</td><td>${cfEsc(c.transportadora_cte || '—')}</td><td>${cfEsc(ROTULOS_VINCULO[c.vinculo_cte]?.txt || (c.vinculo_cte || 'Principal'))}</td><td>${c.valor_total_cte != null ? formatoMoeda(c.valor_total_cte) : '—'}</td><td>${cfEsc(c.status || '—')}</td><td style="max-width:230px; word-break:break-all;">${cfEsc(c.chave_cte || '—')}</td></tr>`).join('')}</tbody></table></div>` : '<div style="padding:12px 0; color:var(--vermelho);">⚠ Esta NF-e ainda não possui CT-e vinculado.</div>'}
      </td></tr>`;
  }).join('');
}

document.getElementById('btnNfeCteAtualizar')?.addEventListener('click', carregarNfeCte);
document.getElementById('nfeCteBusca')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') carregarNfeCte(); });
document.addEventListener('click', (e) => {
  const btn = e.target.closest('.nfe-cte-toggle');
  if (!btn) return;
  document.getElementById(btn.dataset.alvo)?.classList.toggle('oculto');
});

// ---------- Auditoria de Frete (sub-aba de Relatórios) ----------
// Nome próprio: a página ⚖️ Auditoria de Frete (kanban) tem a sua
// carregarAuditoriaFrete(); com o mesmo nome, uma sobrescrevia a outra.
let auditoriaFreteDados = [];
async function carregarRelatorioAuditoriaFrete() {
  const corpo = document.getElementById('auditoriaFreteCorpo');
  const resumo = document.getElementById('auditoriaFreteResumo');
  if (!corpo) return;
  corpo.innerHTML = '<tr><td colspan="7" style="color:var(--texto-fraco);">Auditando...</td></tr>';
  const p = new URLSearchParams();
  const de = document.getElementById('auditoriaDataDe')?.value || '';
  const ate = document.getElementById('auditoriaDataAte')?.value || '';
  const trans = document.getElementById('auditoriaTransportadora')?.value.trim() || '';
  const busca = document.getElementById('auditoriaBusca')?.value.trim() || '';
  if (de) p.set('data_de', de); if (ate) p.set('data_ate', ate); if (trans) p.set('transportadora', trans); if (busca) p.set('busca', busca);
  try {
    const resposta = await apiFetch('/api/fretes/relatorios/auditoria-frete' + (p.toString() ? `?${p}` : ''));
    const body = await resposta.json();
    if (!resposta.ok) throw new Error(body.erro || 'Erro ao auditar.');
    auditoriaFreteDados = body.dados || [];
    const divergentes = auditoriaFreteDados.filter(x => x.qtd_problemas > 0).length;
    const semTabela = auditoriaFreteDados.filter(x => (x.problemas || []).some(p => p.codigo === 'SEM_TABELA')).length;
    const valor = auditoriaFreteDados.reduce((s, x) => s + Math.abs(Number(x.diferenca || 0)), 0);
    if (resumo) resumo.innerHTML = [
      `<div>Auditados<strong>${auditoriaFreteDados.length}</strong></div>`,
      `<div>Conferidos<strong>${auditoriaFreteDados.length - divergentes}</strong></div>`,
      `<div>Com divergência<strong style="color:${divergentes ? 'var(--vermelho)' : 'inherit'}">${divergentes}</strong></div>`,
      `<div>Sem tabela<strong style="color:${semTabela ? 'var(--vermelho)' : 'inherit'}">${semTabela}</strong></div>`,
      `<div>Diferenças absolutas<strong>${formatoMoeda(valor)}</strong></div>`
    ].join('');
    renderAuditoriaFrete();
  } catch (err) {
    corpo.innerHTML = `<tr><td colspan="7" style="color:var(--vermelho);">${cfEsc(err.message || 'Falha de conexão com o servidor.')}</td></tr>`;
  }
}
function renderAuditoriaFrete() {
  const corpo = document.getElementById('auditoriaFreteCorpo');
  if (!corpo) return;
  if (!auditoriaFreteDados.length) { corpo.innerHTML = '<tr><td colspan="7" style="color:var(--texto-fraco);">Nenhum frete encontrado para os filtros.</td></tr>'; return; }
  corpo.innerHTML = auditoriaFreteDados.map(x => {
    const problemas = Array.isArray(x.problemas) ? x.problemas : [];
    const cor = problemas.length ? 'var(--vermelho)' : 'var(--verde)';
    return `<tr>
      <td><b>${cfEsc(x.numero_nf || '—')}</b><br><span style="color:var(--texto-fraco);">CT-e ${cfEsc(x.numero_cte || '—')}</span></td>
      <td>${cfEsc(x.transportadora_cte || x.transportadora || '—')}</td>
      <td style="text-align:right;">${x.valor_total_calculado != null ? formatoMoeda(x.valor_total_calculado) : (x.carga_direta ? 'Carga direta' : '—')}</td>
      <td style="text-align:right;">${x.valor_total_cte != null ? formatoMoeda(x.valor_total_cte) : '—'}</td>
      <td style="text-align:right; color:${x.diferenca != null && Math.abs(x.diferenca) > 0.01 ? 'var(--vermelho)' : 'var(--texto-fraco)'};">${x.diferenca != null ? formatoMoeda(x.diferenca) : '—'}</td>
      <td>${problemas.length ? problemas.map(p => `<span class="badge badge-retido" style="display:inline-block; margin:2px;">⚠ ${cfEsc(p.texto)}</span>`).join('') : '<span style="color:var(--verde);">✓ Nenhuma divergência identificada</span>'}</td>
      <td><span class="badge" style="background:${cor}; color:#fff;">${x.situacao}</span></td>
    </tr>`;
  }).join('');
}
document.getElementById('btnAuditoriaFreteAtualizar')?.addEventListener('click', carregarRelatorioAuditoriaFrete);
document.getElementById('btnAuditoriaFreteFiltrar')?.addEventListener('click', carregarRelatorioAuditoriaFrete);
['auditoriaTransportadora','auditoriaBusca'].forEach(id => document.getElementById(id)?.addEventListener('keydown', e => { if (e.key === 'Enter') carregarRelatorioAuditoriaFrete(); }));

// ---------- Detecção de Duplicidade (CT-e / NF-e) ----------
async function carregarDuplicidades() {
  const lista = document.getElementById('listaDuplicidades');
  lista.textContent = 'Carregando...';
  try {
    const resposta = await apiFetch('/api/fretes/relatorios/duplicidades');
    const dados = await resposta.json();
    if (!resposta.ok) { lista.textContent = dados.erro || 'Erro ao carregar.'; return; }

    lista.innerHTML = dados.length
      ? `<table style="width:100%;">
          <thead><tr><th style="text-align:left;">Tipo</th><th style="text-align:left;">Número</th><th style="text-align:left;">Aparece em quantos registros</th><th style="text-align:left;">Pedidos</th></tr></thead>
          <tbody>
            ${dados.map((d) => `
              <tr>
                <td>${d.tipo}</td>
                <td>${d.numero}</td>
                <td style="color:var(--vermelho); font-weight:600;">${d.qtd}x</td>
                <td>${d.pedidos}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>`
      : '<p style="color:var(--texto-fraco);">Nenhuma duplicidade encontrada.</p>';
  } catch (err) {
    lista.textContent = 'Falha de conexão com o servidor.';
  }
}

// ---------- Simulador "E se eu tivesse trocado de transportadora?" ----------
document.getElementById('btnSimular').addEventListener('click', async () => {
  const resultadoEl = document.getElementById('resultadoSimulador');
  const de = document.getElementById('simDe').value.trim();
  const para = document.getElementById('simPara').value.trim();
  if (!de || !para) { resultadoEl.textContent = 'Preencha as duas transportadoras.'; return; }

  const params = new URLSearchParams({ de, para });
  const dataDe = document.getElementById('simDataDe').value;
  const dataAte = document.getElementById('simDataAte').value;
  if (dataDe) params.set('data_de', dataDe);
  if (dataAte) params.set('data_ate', dataAte);

  resultadoEl.textContent = 'Simulando...';

  try {
    const resposta = await apiFetch(`/api/tabelas-preco/simulador?${params.toString()}`);
    const dados = await resposta.json();
    if (!resposta.ok) { resultadoEl.textContent = dados.erro || 'Erro ao simular.'; return; }

    if (dados.qtdFretes === 0) {
      resultadoEl.innerHTML = `Nenhum frete encontrado de "${de}" nesse período.`;
      return;
    }
    if (dados.comparaveis === 0) {
      resultadoEl.innerHTML = `"${para}" não tem tabela de preço cobrindo nenhuma das cidades dos ${dados.qtdFretes} frete(s) de "${de}" nesse período.`;
      return;
    }

    const economia = -dados.diferenca;
    const corResultado = economia > 0 ? 'var(--verde)' : 'var(--vermelho)';
    resultadoEl.innerHTML = `
      <p>Analisando <strong>${dados.comparaveis}</strong> de ${dados.qtdFretes} frete(s) de "${de}" que "${para}" também cobre${dados.semCobertura ? ` (${dados.semCobertura} ficaram de fora, sem cobertura de "${para}")` : ''}:</p>
      <table style="width:100%; margin-top:8px;">
        <tr><td>Gasto real (proporcional aos comparáveis)</td><td style="text-align:right;">${formatoMoeda(dados.totalReal * (dados.comparaveis / dados.qtdFretes))}</td></tr>
        <tr><td>Gasto simulado com "${para}"</td><td style="text-align:right;">${formatoMoeda(dados.totalSimulado)}</td></tr>
      </table>
      <p style="margin-top:10px; font-size:14px; color:${corResultado}; font-weight:700;">
        ${economia > 0 ? `✓ Teria ECONOMIZADO ${formatoMoeda(economia)}` : `✗ Teria GASTO MAIS ${formatoMoeda(-economia)}`}
      </p>
    `;
  } catch (err) {
    resultadoEl.textContent = 'Falha de conexão com o servidor.';
  }
});

// ---------- Canhoto Digital (Comprovante de Entrega) ----------
const canvasAssinatura = document.getElementById('canvasAssinatura');
const ctxAssinatura = canvasAssinatura.getContext('2d');
let desenhando = false;

function ajustarTamanhoCanvasAssinatura() {
  const dpr = window.devicePixelRatio || 1;
  const largura = canvasAssinatura.clientWidth;
  const altura = canvasAssinatura.clientHeight;
  canvasAssinatura.width = largura * dpr;
  canvasAssinatura.height = altura * dpr;
  ctxAssinatura.scale(dpr, dpr);
  ctxAssinatura.lineWidth = 2;
  ctxAssinatura.lineCap = 'round';
  ctxAssinatura.strokeStyle = '#1a1a1a';
}

function posicaoCanvas(e) {
  const rect = canvasAssinatura.getBoundingClientRect();
  const ponto = e.touches ? e.touches[0] : e;
  return { x: ponto.clientX - rect.left, y: ponto.clientY - rect.top };
}

function iniciarDesenho(e) {
  desenhando = true;
  const p = posicaoCanvas(e);
  ctxAssinatura.beginPath();
  ctxAssinatura.moveTo(p.x, p.y);
  e.preventDefault();
}
function desenhar(e) {
  if (!desenhando) return;
  const p = posicaoCanvas(e);
  ctxAssinatura.lineTo(p.x, p.y);
  ctxAssinatura.stroke();
  e.preventDefault();
}
function pararDesenho() { desenhando = false; }

['mousedown', 'touchstart'].forEach((ev) => canvasAssinatura.addEventListener(ev, iniciarDesenho));
['mousemove', 'touchmove'].forEach((ev) => canvasAssinatura.addEventListener(ev, desenhar));
['mouseup', 'mouseleave', 'touchend'].forEach((ev) => canvasAssinatura.addEventListener(ev, pararDesenho));

document.getElementById('btnLimparAssinatura').addEventListener('click', () => {
  ctxAssinatura.clearRect(0, 0, canvasAssinatura.width, canvasAssinatura.height);
});

document.getElementById('btnAbrirCanhoto').addEventListener('click', () => {
  if (!editandoRegistroId) return;
  document.getElementById('painelCanhoto').classList.remove('oculto');
  setTimeout(() => {
    ajustarTamanhoCanvasAssinatura();
    ctxAssinatura.clearRect(0, 0, canvasAssinatura.width, canvasAssinatura.height);
  }, 50);
  document.getElementById('canhotoRecebidoPor').value = '';
  document.getElementById('canhotoFoto').value = '';
  const regCanhoto = ultimoRegistrosCarregados.find((r) => r.id === editandoRegistroId);
  document.getElementById('canhotoDataEntrega').value = regCanhoto?.data_entrega ? String(regCanhoto.data_entrega).slice(0, 10) : agDataLocal(new Date());
  document.getElementById('erroCanhoto').classList.remove('visivel');

  const registro = ultimoRegistrosCarregados.find((r) => r.id === editandoRegistroId);
  const avisoEl = document.getElementById('avisoCanhotoExistente');
  if (registro?.canhoto_registrado_em) {
    avisoEl.textContent = `✓ Já tem comprovante registrado, recebido por ${registro.canhoto_recebido_por || '—'} em ${formatoDataHora(registro.canhoto_registrado_em)}. Salvar de novo substitui.`;
    avisoEl.classList.remove('oculto');
  } else {
    avisoEl.classList.add('oculto');
  }
});

document.getElementById('btnFecharCanhoto').addEventListener('click', () => {
  document.getElementById('painelCanhoto').classList.add('oculto');
});

document.getElementById('btnSalvarCanhoto').addEventListener('click', async () => {
  const erroEl = document.getElementById('erroCanhoto');
  erroEl.classList.remove('visivel');

  const recebidoPor = document.getElementById('canhotoRecebidoPor').value.trim();
  const arquivoFoto = document.getElementById('canhotoFoto').files[0];
  const assinaturaVazia = !ctxAssinatura.getImageData(0, 0, canvasAssinatura.width, canvasAssinatura.height).data.some((v, i) => i % 4 === 3 && v > 0);

  if (!recebidoPor) { erroEl.textContent = 'Informe quem recebeu.'; erroEl.classList.add('visivel'); return; }
  if (assinaturaVazia && !arquivoFoto) { erroEl.textContent = 'Desenhe a assinatura ou anexe uma foto.'; erroEl.classList.add('visivel'); return; }

  const formData = new FormData();
  formData.append('recebido_por', recebidoPor);
  formData.append('data_entrega', document.getElementById('canhotoDataEntrega').value || '');
  if (!assinaturaVazia) formData.append('assinatura', canvasAssinatura.toDataURL('image/png'));
  if (arquivoFoto) formData.append('foto', arquivoFoto);

  try {
    const resposta = await apiFetch(`/api/fretes/${editandoRegistroId}/canhoto`, { method: 'POST', body: formData });
    const dados = await resposta.json();
    if (!resposta.ok) { erroEl.textContent = dados.erro || 'Erro ao salvar.'; erroEl.classList.add('visivel'); return; }
    mostrarAlerta('✓ Comprovante de entrega salvo!');
    document.getElementById('painelCanhoto').classList.add('oculto');
    carregarRegistros(null, paginaAtual);
  } catch (err) {
    erroEl.textContent = 'Falha de conexão com o servidor.';
    erroEl.classList.add('visivel');
  }
});

// ---------- Notificações por WhatsApp ----------
async function carregarConfigWhatsapp() {
  try {
    const resposta = await apiFetch('/api/whatsapp/configuracao');
    if (!resposta.ok) return;
    const c = await resposta.json();
    document.getElementById('whatsappAtivo').checked = !!c.ativo;
    document.getElementById('whatsappAccountSid').value = c.twilio_account_sid || '';
    document.getElementById('whatsappAuthToken').value = '';
    document.getElementById('whatsappNumeroTwilio').value = c.twilio_numero_whatsapp || '';
    document.getElementById('whatsappNumeroDestino').value = c.numero_destino || '';
  } catch (err) {
    console.error(err);
  }
}

document.getElementById('btnSalvarWhatsapp').addEventListener('click', async () => {
  const erroEl = document.getElementById('erroWhatsapp');
  erroEl.classList.remove('visivel');

  const corpo = {
    ativo: document.getElementById('whatsappAtivo').checked,
    twilio_account_sid: document.getElementById('whatsappAccountSid').value.trim(),
    twilio_numero_whatsapp: document.getElementById('whatsappNumeroTwilio').value.trim(),
    numero_destino: document.getElementById('whatsappNumeroDestino').value.trim(),
  };
  const token = document.getElementById('whatsappAuthToken').value.trim();
  if (token) corpo.twilio_auth_token = token;

  try {
    const resposta = await apiFetch('/api/whatsapp/configuracao', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
    });
    if (!resposta.ok) { const d = await resposta.json(); erroEl.textContent = d.erro || 'Erro ao salvar.'; erroEl.classList.add('visivel'); return; }
    mostrarSucessoTemporario(erroEl);
    carregarConfigWhatsapp();
  } catch (err) {
    erroEl.textContent = 'Falha de conexão com o servidor.';
    erroEl.classList.add('visivel');
  }
});

document.getElementById('btnTestarWhatsapp').addEventListener('click', async () => {
  const erroEl = document.getElementById('erroWhatsapp');
  erroEl.classList.remove('visivel');
  try {
    const resposta = await apiFetch('/api/whatsapp/testar', { method: 'POST' });
    const dados = await resposta.json();
    if (!resposta.ok) { erroEl.textContent = dados.erro || 'Erro ao enviar.'; erroEl.classList.add('visivel'); return; }
    mostrarAlerta(dados.mensagem);
  } catch (err) {
    erroEl.textContent = 'Falha de conexão com o servidor.';
    erroEl.classList.add('visivel');
  }
});

// ---------- Buscar cidade por endereço (quando a NF não traz cidade clara) ----------
document.addEventListener('click', (e) => {
  if (e.target.id === 'btnBuscarCidadeEndereco') {
    document.getElementById('resultadoBuscaEndereco').innerHTML = '';
    document.getElementById('painelBuscarEndereco').classList.remove('oculto');

    // Tenta achar o endereço sozinho, olhando as Observações do registro —
    // aceita "Entrega", "Entregar" ou "Local de Entrega" escrito de
    // qualquer um desses jeitos, já que cada representante escreve diferente.
    const registro = ultimoRegistrosCarregados?.find((r) => r.id === editandoRegistroId);
    const observacoes = registro?.observacoes || document.getElementById('nr_observacoes')?.value || '';
    const matchEndereco = observacoes.match(/(?:local de entrega|entregar|entrega)\s*:?\s*([\s\S]{5,150}?)(?:\n\s*\n|\.\s|$)/i);
    document.getElementById('enderecoParaBuscar').value = matchEndereco ? matchEndereco[1].trim() : '';
  }
});

document.getElementById('btnFecharBuscaEndereco').addEventListener('click', () => {
  document.getElementById('painelBuscarEndereco').classList.add('oculto');
});

document.getElementById('btnExecutarBuscaEndereco').addEventListener('click', async () => {
  const endereco = document.getElementById('enderecoParaBuscar').value.trim();
  const resultadoEl = document.getElementById('resultadoBuscaEndereco');
  if (!endereco) { resultadoEl.textContent = 'Digite o endereço primeiro.'; return; }

  const ufAtual = document.getElementById('nr_uf')?.value || '';
  resultadoEl.textContent = 'Buscando...';

  try {
    const params = new URLSearchParams({ endereco });
    if (ufAtual) params.set('uf', ufAtual);
    const resposta = await apiFetch(`/api/fretes/buscar-cidade-por-endereco?${params.toString()}`);
    const candidatos = await resposta.json();
    if (!resposta.ok) { resultadoEl.textContent = candidatos.erro || 'Erro ao buscar.'; return; }

    if (candidatos.length === 0) {
      resultadoEl.innerHTML = 'Nenhuma cidade encontrada pra esse endereço. Tente digitar de um jeito diferente, ou preencha manualmente.';
      return;
    }

    resultadoEl.innerHTML = `<p style="color:var(--texto-fraco); margin-bottom:10px;">Escolha a opção certa (confira o endereço completo antes de aplicar):</p>` +
      candidatos.map((c, i) => `
        <div style="padding:10px; border:1px solid var(--borda); border-radius:8px; margin-bottom:8px; cursor:pointer;" onclick="aplicarCidadeEncontrada('${c.cidade.replace(/'/g, "\\'")}')">
          <strong>${c.cidade}${c.uf ? ` / ${c.uf}` : ''}</strong>
          <div style="font-size:11px; color:var(--texto-fraco); margin-top:2px;">${c.enderecoCompleto}</div>
        </div>
      `).join('');
  } catch (err) {
    resultadoEl.textContent = 'Falha de conexão com o servidor.';
  }
});

function aplicarCidadeEncontrada(cidade) {
  document.getElementById('nr_cidade_redespacho').value = cidade;
  document.getElementById('painelBuscarEndereco').classList.add('oculto');
}

// =====================================================================
// Conferência de Fatura: junta os CT-e de uma fatura da transportadora,
// fecha como "Faturado" e gera o documento conferido pro financeiro.
// =====================================================================
const cfEstado = { ctes: [], marcados: new Set() };

const cfEsc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cfNumCte = (v) => String(v ?? '').replace(/\D/g, '').replace(/^0+(?=\d)/, '');
const cfBadgeConferencia = (c) => {
  const cls = { Conferido: 'badge-liberado', Divergente: 'badge-retido' }[c] || 'badge-pendente';
  return `<span class="badge ${cls}">${cfEsc(c)}</span>`;
};

function cfTrocarAba(aba) {
  document.querySelectorAll('.cf-aba').forEach((b) => b.classList.toggle('ativa', b.dataset.cfAba === aba));
  document.getElementById('cfAbaNova').classList.toggle('oculto', aba !== 'nova');
  document.getElementById('cfRodapeNova').classList.toggle('oculto', aba !== 'nova');
  document.getElementById('cfAbaLista').classList.toggle('oculto', aba !== 'lista');
  if (aba === 'lista') cfCarregarLista();
}

async function cfAbrir() {
  document.getElementById('painelConferenciaFatura').classList.remove('oculto');
  if (!podeConferirFatura) { cfTrocarAba('lista'); return; }
  cfTrocarAba('nova');
  const seletor = document.getElementById('cfTransportadora');
  try {
    const resposta = await apiFetch('/api/faturas/transportadoras');
    const nomes = await resposta.json();
    if (!resposta.ok) throw new Error(nomes.erro);
    const atual = seletor.value;
    seletor.innerHTML = '<option value="">Selecione...</option>' +
      nomes.map((n) => `<option value="${cfEsc(n)}">${cfEsc(n)}</option>`).join('');
    if (nomes.includes(atual)) seletor.value = atual;
  } catch (err) {
    mostrarAlerta('Não foi possível carregar as transportadoras.');
  }
}

async function cfCarregarCtes() {
  const transp = document.getElementById('cfTransportadora').value;
  cfEstado.ctes = [];
  cfEstado.marcados.clear();
  const corpo = document.getElementById('cfCorpo');
  if (!transp) {
    corpo.innerHTML = '<tr><td colspan="11" style="text-align:center; color:var(--texto-fraco); padding:20px;">Selecione a transportadora.</td></tr>';
    cfAtualizarResumo();
    return;
  }
  corpo.innerHTML = '<tr><td colspan="11" style="text-align:center; color:var(--texto-fraco); padding:20px;">Carregando...</td></tr>';
  try {
    const resposta = await apiFetch(`/api/faturas/ctes-disponiveis?transportadora=${encodeURIComponent(transp)}`);
    const dados = await resposta.json();
    if (!resposta.ok) throw new Error(dados.erro);
    cfEstado.ctes = dados;
  } catch (err) {
    corpo.innerHTML = '<tr><td colspan="11" style="text-align:center; color:var(--vermelho); padding:20px;">Erro ao carregar os CT-e.</td></tr>';
    return;
  }
  cfRenderizarTabela();
}

function cfValorCte(c) {
  return c.valor_total_cte != null ? Number(c.valor_total_cte) : (c.valor_frete_negociado != null ? Number(c.valor_frete_negociado) : null);
}

function cfRenderizarTabela() {
  const corpo = document.getElementById('cfCorpo');
  const busca = document.getElementById('cfBusca').value.trim().toLowerCase();
  const soMarcados = document.getElementById('cfSoMarcados').checked;

  const visiveis = cfEstado.ctes.filter((c) => {
    if (soMarcados && !cfEstado.marcados.has(c.id)) return false;
    if (!busca) return true;
    return [c.numero_cte, c.numero_pedido, c.numero_nf, c.cliente, c.cidade].some((v) => String(v ?? '').toLowerCase().includes(busca));
  });

  if (visiveis.length === 0) {
    corpo.innerHTML = `<tr><td colspan="11" style="text-align:center; color:var(--texto-fraco); padding:20px;">${cfEstado.ctes.length ? 'Nenhum CT-e com esse filtro.' : 'Nenhum CT-e em aberto dessa transportadora.'}</td></tr>`;
  } else {
    corpo.innerHTML = visiveis.map((c) => {
      const marcado = cfEstado.marcados.has(c.id);
      const dif = cobradoAMais(c);   // CT-e − tabela
      const corDif = dif == null || Math.abs(dif) < 0.01 ? 'inherit' : (dif > 0 ? 'var(--vermelho)' : 'var(--verde)');
      return `
        <tr data-cf-id="${c.id}" class="${marcado ? 'cf-marcado' : ''}">
          <td><input type="checkbox" ${marcado ? 'checked' : ''} tabindex="-1" /></td>
          <td><strong>${cfEsc(c.numero_cte)}</strong></td>
          <td>${formatoData(c.data_emissao_cte)}</td>
          <td>${cfEsc(c.numero_pedido || '—')}</td>
          <td>${cfEsc(c.numero_nf || '—')}</td>
          <td>${cfEsc(c.cliente || '—')}</td>
          <td>${cfEsc([c.cidade, c.uf].filter(Boolean).join('/') || '—')}</td>
          <td style="text-align:right;">${formatoMoeda(c.valor_total_frete)}</td>
          <td style="text-align:right;">${formatoMoeda(cfValorCte(c))}</td>
          <td style="text-align:right; color:${corDif};">${dif == null ? '—' : formatoMoeda(dif)}</td>
          <td>${cfBadgeConferencia(c.conferencia)}${Number(c.glosa_valor) > 0 ? ` <span class="badge badge-retido" title="${cfEsc(c.glosa_motivo || '')}">Glosa ${formatoMoeda(c.glosa_valor)}</span>` : ''}</td>
        </tr>`;
    }).join('');
  }

  const todosVisiveisMarcados = visiveis.length > 0 && visiveis.every((c) => cfEstado.marcados.has(c.id));
  document.getElementById('cfMarcarTodos').checked = todosVisiveisMarcados;
  cfAtualizarResumo();
}

function cfAtualizarResumo() {
  const marcados = cfEstado.ctes.filter((c) => cfEstado.marcados.has(c.id));
  const soma = Math.round(marcados.reduce((s, c) => s + (cfValorCte(c) || 0), 0) * 100) / 100;
  const pendentes = marcados.filter((c) => c.conferencia !== 'Conferido').length;
  const valorTexto = document.getElementById('cfValor').value;
  const valorFatura = valorTexto ? Number(paraNumeroMoeda(valorTexto)) : null;
  // Glosas combinadas nos CT-e marcados: a fatura deveria vir com esse desconto.
  const glosas = Math.round(marcados.reduce((s, c) => s + (Number(c.glosa_valor) || 0), 0) * 100) / 100;
  const esperado = Math.round((soma - glosas) * 100) / 100;
  const diferenca = valorFatura != null ? Math.round((valorFatura - esperado) * 100) / 100 : null;

  const item = (rotulo, valor, cor) =>
    `<div><div style="opacity:0.75; font-size:10.5px;">${rotulo}</div><strong${cor ? ` style="color:${cor};"` : ''}>${valor}</strong></div>`;

  document.getElementById('cfResumo').innerHTML = [
    item('CT-e marcados', marcados.length),
    item('Soma dos CT-e', formatoMoeda(soma)),
    ...(glosas > 0 ? [item('Glosas combinadas', `− ${formatoMoeda(glosas)}`, '#ffd28a'), item('Fatura deveria vir', formatoMoeda(esperado))] : []),
    item('Valor da fatura', valorFatura != null ? formatoMoeda(valorFatura) : '—'),
    item(glosas > 0 ? 'Fatura − esperado' : 'Fatura − CT-e', diferenca == null ? '—' : formatoMoeda(diferenca), diferenca == null ? null : (Math.abs(diferenca) < 0.01 ? '#b3ffcf' : '#ffb3b3')),
    item('Não conferidos', pendentes, pendentes ? '#ffd28a' : '#b3ffcf'),
  ].join('');
}

function cfMarcarColados() {
  const texto = document.getElementById('cfColarCtes').value;
  const aviso = document.getElementById('cfAvisoColados');
  // De cada linha/pedaço pega o primeiro número com 3+ dígitos: assim dá pra
  // colar linhas inteiras da fatura ("3 00003883 10/09/26 ...") sem pegar a série.
  const numeros = texto.split(/[\n,;]+/)
    .map((pedaco) => (pedaco.match(/\d{3,}/) || [])[0])
    .filter(Boolean)
    .map(cfNumCte);
  if (numeros.length === 0) { aviso.innerHTML = ''; return; }

  const porNumero = new Map(cfEstado.ctes.map((c) => [cfNumCte(c.numero_cte), c]));
  const naoEncontrados = [];
  numeros.forEach((n) => {
    const cte = porNumero.get(n);
    if (cte) cfEstado.marcados.add(cte.id); else naoEncontrados.push(n);
  });

  const achados = numeros.length - naoEncontrados.length;
  aviso.innerHTML = `<span style="color:var(--verde);">✓ ${achados} marcado(s).</span>` +
    (naoEncontrados.length
      ? ` <span style="color:var(--vermelho);">Não encontrados em aberto: ${naoEncontrados.map(cfEsc).join(', ')}</span>`
      : '');
  cfRenderizarTabela();
}

async function cfGerar() {
  const transportadora = document.getElementById('cfTransportadora').value;
  const numero = document.getElementById('cfNumero').value.trim();
  const valorTexto = document.getElementById('cfValor').value;
  const ids = [...cfEstado.marcados];

  if (!transportadora) { mostrarAlerta('Selecione a transportadora.'); return; }
  if (!numero) { mostrarAlerta('Informe o número da fatura.'); return; }
  if (ids.length === 0) { mostrarAlerta('Marque os CT-e que fazem parte da fatura.'); return; }

  const marcados = cfEstado.ctes.filter((c) => cfEstado.marcados.has(c.id));
  const soma = Math.round(marcados.reduce((s, c) => s + (cfValorCte(c) || 0), 0) * 100) / 100;
  const valorFatura = valorTexto ? Number(paraNumeroMoeda(valorTexto)) : null;
  const pendentes = marcados.filter((c) => c.conferencia !== 'Conferido');

  const avisos = [];
  const glosasMarcadas = Math.round(marcados.reduce((s2, c) => s2 + (Number(c.glosa_valor) || 0), 0) * 100) / 100;
  const esperadoFatura = Math.round((soma - glosasMarcadas) * 100) / 100;
  if (valorFatura == null) avisos.push('• O valor da fatura não foi informado, então o documento não vai comparar com ele.');
  else if (Math.abs(valorFatura - esperadoFatura) >= 0.01) {
    avisos.push(glosasMarcadas > 0 && Math.abs(valorFatura - soma) < 0.01
      ? `• A fatura veio SEM o desconto das glosas combinadas (${formatoMoeda(glosasMarcadas)}): deveria ser ${formatoMoeda(esperadoFatura)}.`
      : `• O valor da fatura (${formatoMoeda(valorFatura)}) é diferente do esperado (${formatoMoeda(esperadoFatura)}${glosasMarcadas > 0 ? `, já descontando ${formatoMoeda(glosasMarcadas)} de glosas` : ''}).`);
  }
  if (pendentes.length) avisos.push(`• ${pendentes.length} CT-e marcado(s) não estão conferidos (divergentes ou sem aprovação): ${pendentes.map((c) => c.numero_cte).join(', ')}.`);

  const mensagem = `Conferir a fatura ${numero} com ${ids.length} CT-e (${formatoMoeda(soma)})?\n\n` +
    (avisos.length ? `Atenção:\n${avisos.join('\n')}\n\nO documento vai sair como "Conferida com ressalvas".\n\n` : '') +
    'Os CT-e marcados passam para o status "Faturado".';
  if (!(await confirmar(mensagem, { tipo: avisos.length ? 'aviso' : 'pergunta', titulo: avisos.length ? 'Conferir com ressalvas?' : 'Conferir a fatura?', textoOk: 'Conferir e gerar documento' }))) return;

  const botao = document.getElementById('btnCfGerar');
  botao.disabled = true;
  try {
    const resposta = await apiFetch('/api/faturas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        numero, transportadora,
        data_emissao: document.getElementById('cfEmissao').value || null,
        data_vencimento: document.getElementById('cfVencimento').value || null,
        valor_informado: valorFatura,
        observacoes: document.getElementById('cfObservacoes').value.trim() || null,
        frete_ids: ids,
      }),
    });
    const dados = await resposta.json();
    if (!resposta.ok) { mostrarAlerta(dados.erro || 'Erro ao conferir a fatura.'); return; }

    ['cfNumero', 'cfEmissao', 'cfVencimento', 'cfValor', 'cfObservacoes', 'cfColarCtes'].forEach((id) => { document.getElementById(id).value = ''; });
    document.getElementById('cfAvisoColados').innerHTML = '';
    await cfCarregarCtes();
    if (typeof carregarAuditoriaFrete === 'function') carregarAuditoriaFrete();
    await cfImprimir(dados.id);
  } catch (err) {
    mostrarAlerta('Falha de conexão com o servidor.');
  } finally {
    botao.disabled = false;
  }
}

async function cfCarregarLista() {
  const corpo = document.getElementById('cfCorpoLista');
  corpo.innerHTML = '<tr><td colspan="9" style="text-align:center; color:var(--texto-fraco); padding:20px;">Carregando...</td></tr>';
  try {
    const resposta = await apiFetch('/api/faturas');
    const faturas = await resposta.json();
    if (!resposta.ok) throw new Error(faturas.erro);
    if (faturas.length === 0) {
      corpo.innerHTML = '<tr><td colspan="9" style="text-align:center; color:var(--texto-fraco); padding:20px;">Nenhuma fatura conferida ainda.</td></tr>';
      return;
    }
    const ehAdmin = usuario.perfil === 'admin';
    corpo.innerHTML = faturas.map((f) => `
      <tr>
        <td><strong>${cfEsc(f.numero)}</strong></td>
        <td>${cfEsc(f.transportadora)}</td>
        <td>${formatoData(f.data_vencimento)}</td>
        <td style="text-align:right;">${f.qtd_ctes}</td>
        <td style="text-align:right;">${formatoMoeda(f.valor_ctes)}</td>
        <td style="text-align:right;">${formatoMoeda(f.valor_informado)}</td>
        <td><span class="badge ${f.parecer === 'Conferida' ? 'badge-liberado' : 'badge-retido'}">${cfEsc(f.parecer)}</span></td>
        <td>${cfEsc(f.conferido_por_nome || '—')}<div style="font-size:11px; color:var(--texto-fraco);">${formatoDataHora(f.conferido_em)}</div></td>
        <td style="text-align:right; white-space:nowrap;">
          <button class="btn btn-secundario" data-cf-imprimir="${f.id}" style="width:auto; padding:5px 10px; font-size:12px;">🖨 Documento</button>
          ${ehAdmin ? `<button class="btn btn-secundario" data-cf-desfazer="${f.id}" data-cf-numero="${cfEsc(f.numero)}" style="width:auto; padding:5px 10px; font-size:12px; color:var(--vermelho);">Desfazer</button>` : ''}
        </td>
      </tr>`).join('');
  } catch (err) {
    corpo.innerHTML = '<tr><td colspan="9" style="text-align:center; color:var(--vermelho); padding:20px;">Erro ao carregar as faturas.</td></tr>';
  }
}

async function cfDesfazer(id, numero) {
  if (!(await confirmar(`Os CT-e da fatura ${numero} saem da fatura e voltam ao status que tinham antes.`, { tipo: 'perigo', titulo: 'Desfazer a conferência?', textoOk: 'Desfazer conferência' }))) return;
  try {
    const resposta = await apiFetch(`/api/faturas/${id}`, { method: 'DELETE' });
    const dados = await resposta.json();
    if (!resposta.ok) { mostrarAlerta(dados.erro || 'Erro ao desfazer.'); return; }
    cfCarregarLista();
    if (typeof carregarAuditoriaFrete === 'function') carregarAuditoriaFrete();
  } catch (err) {
    mostrarAlerta('Falha de conexão com o servidor.');
  }
}

// Monta o documento de conferência (no estilo da fatura da transportadora,
// sem o boleto) e abre a janela de impressão — dá pra "Salvar como PDF".
async function cfImprimir(id) {
  let dados;
  try {
    const resposta = await apiFetch(`/api/faturas/${id}`);
    dados = await resposta.json();
    if (!resposta.ok) throw new Error(dados.erro);
  } catch (err) {
    mostrarAlerta('Não foi possível carregar a fatura pra imprimir.');
    return;
  }

  const { fatura: f, empresa: emp, transportadora: tr } = dados;
  const itens = f.itens || [];
  const m = (v) => (v == null ? '—' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  const soma = (campo) => itens.reduce((s, i) => s + (Number(i[campo]) || 0), 0);
  const totalGlosas = Number(f.total_glosas || 0);
  const valorEsperadoFatura = Number(f.valor_ctes) - totalGlosas;
  const difFatura = f.valor_informado != null ? Number(f.valor_informado) - valorEsperadoFatura : null;
  const difTabela = Number(f.valor_ctes) - soma('valor_tabela');
  const conferidos = itens.filter((i) => i.conferencia === 'Conferido').length;
  const ok = f.parecer === 'Conferida';
  const endereco = (o) => o ? [o.endereco, o.bairro, [o.municipio, o.uf].filter(Boolean).join(' - '), o.cep].filter(Boolean).join(', ') : '';

  const linhas = itens.map((i) => {
    const dif = i.diferenca != null ? Number(i.diferenca) : null;
    return `
      <tr>
        <td>${cfEsc(i.numero_cte)}</td>
        <td>${formatoData(i.data_emissao_cte)}</td>
        <td>${cfEsc(i.numero_pedido || '')}</td>
        <td>${cfEsc(i.numero_nf || '')}</td>
        <td class="cli">${cfEsc(i.cliente || '')}</td>
        <td>${cfEsc([i.cidade, i.uf].filter(Boolean).join('/'))}</td>
        <td class="n">${m(i.valor_mercadoria)}</td>
        <td class="n">${i.peso_kg != null ? Number(i.peso_kg).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) : '—'}</td>
        <td class="n">${i.qtd_volumes ?? '—'}</td>
        <td class="n">${m(i.icms)}</td>
        <td class="n">${m(i.valor_tabela)}</td>
        <td class="n"><b>${m(i.valor_cte)}</b></td>
        <td class="n ${dif != null && Math.abs(dif) >= 0.01 ? 'alerta' : ''}">${dif == null ? '—' : m(dif)}</td>
        <td class="n">${i.glosa ? m(i.glosa) : '—'}</td>
        <td class="${i.conferencia === 'Conferido' ? 'okc' : 'alerta'}">${i.conferencia === 'Conferido' ? '✓ Conferido' : cfEsc(i.conferencia)}</td>
      </tr>`;
  }).join('');

  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Conferência Fatura ${cfEsc(f.numero)} - ${cfEsc(f.transportadora)}</title>
<style>
  @page { size: A4 landscape; margin: 10mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 8.5pt; color: #000; margin: 0; }
  .topo { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #000; padding-bottom: 6px; margin-bottom: 8px; }
  .topo h1 { font-size: 13pt; margin: 0 0 2px; }
  .topo .sub { font-size: 8pt; color: #333; }
  .carimbo { border: 2px solid ${ok ? '#1a7f3c' : '#b36b00'}; color: ${ok ? '#1a7f3c' : '#b36b00'}; font-weight: bold; font-size: 11pt; padding: 6px 12px; text-align: center; text-transform: uppercase; }
  .carimbo small { display: block; font-size: 7.5pt; font-weight: normal; text-transform: none; margin-top: 2px; }
  .caixas { display: grid; grid-template-columns: 1.4fr 1.4fr 0.8fr 0.8fr 0.8fr 0.9fr; border: 1px solid #000; margin-bottom: 8px; }
  .caixas > div { border-right: 1px solid #000; padding: 3px 6px; }
  .caixas > div:last-child { border-right: none; }
  .rot { font-size: 6.8pt; color: #444; text-transform: uppercase; }
  .val { font-weight: bold; font-size: 9pt; }
  .val small { font-weight: normal; font-size: 7.5pt; display: block; }
  h2 { font-size: 9.5pt; margin: 8px 0 3px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #888; padding: 2px 4px; }
  th { background: #e6e6e6; font-size: 7.3pt; text-align: left; }
  td.n, th.n { text-align: right; white-space: nowrap; }
  td.cli { max-width: 170px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  td.alerta { color: #b00000; font-weight: bold; }
  td.okc { color: #1a7f3c; }
  tfoot td { font-weight: bold; background: #f2f2f2; }
  .resumo { display: flex; gap: 16px; margin-top: 8px; align-items: flex-start; }
  .resumo table { width: auto; min-width: 260px; }
  .resumo td { padding: 2px 6px; }
  .resumo tr.total td { font-weight: bold; background: #f2f2f2; }
  .obs { flex: 1; border: 1px solid #888; padding: 4px 6px; min-height: 40px; white-space: pre-wrap; }
  .assinaturas { display: flex; gap: 40px; margin-top: 34px; }
  .assinaturas div { flex: 1; border-top: 1px solid #000; text-align: center; padding-top: 3px; font-size: 7.5pt; }
  .rodape { margin-top: 12px; border-top: 1px dashed #666; padding-top: 4px; font-size: 7pt; color: #333; display: flex; justify-content: space-between; }
  tr { page-break-inside: avoid; }
</style></head><body>
  <div class="topo">
    <div>
      ${logoImpressao(48) ? `<div style="margin-bottom:6px;">${logoImpressao(48)}</div>` : ''}
      <h1>CONFERÊNCIA DE FATURA DE FRETE</h1>
      <div class="sub"><b>${cfEsc(emp?.razao_social || emp?.nome_fantasia || '')}</b>${emp?.cnpj ? ` — CNPJ ${cfEsc(formatarCnpj(emp.cnpj))}` : ''}${emp?.ie ? ` — IE ${cfEsc(emp.ie)}` : ''}</div>
      <div class="sub">${cfEsc(endereco(emp))}</div>
    </div>
    <div class="carimbo">${ok ? '✓ Fatura conferida' : '⚠ Conferida com ressalvas'}<small>${conferidos} de ${itens.length} CT-e conferidos</small></div>
  </div>

  <div class="caixas">
    <div><div class="rot">Transportadora</div><div class="val">${cfEsc(f.transportadora)}<small>${tr?.cnpj ? `CNPJ ${cfEsc(formatarCnpj(tr.cnpj))}` : ''}</small></div></div>
    <div><div class="rot">Pagador</div><div class="val">${cfEsc(emp?.razao_social || '—')}<small>${emp?.cnpj ? `CNPJ ${cfEsc(formatarCnpj(emp.cnpj))}` : ''}</small></div></div>
    <div><div class="rot">Fatura Nº</div><div class="val">${cfEsc(f.numero)}</div></div>
    <div><div class="rot">Emissão</div><div class="val">${formatoData(f.data_emissao)}</div></div>
    <div><div class="rot">Vencimento</div><div class="val">${formatoData(f.data_vencimento)}</div></div>
    <div><div class="rot">Valor a pagar</div><div class="val">R$ ${m(f.valor_informado ?? f.valor_ctes)}</div></div>
  </div>

  <h2>CT-e da fatura</h2>
  <table>
    <thead><tr>
      <th>CT-e</th><th>Emissão</th><th>Pedido</th><th>NF</th><th>Destinatário</th><th>Cidade/UF</th>
      <th class="n">Val. mercad. R$</th><th class="n">Peso kg</th><th class="n">Vol.</th><th class="n">ICMS R$</th>
      <th class="n">Frete tabela R$</th><th class="n">Frete CT-e R$</th><th class="n">Diferença R$</th><th class="n">Glosa R$</th><th>Conferência</th>
    </tr></thead>
    <tbody>${linhas}</tbody>
    <tfoot><tr>
      <td colspan="6">Quantidade de documentos: ${itens.length}</td>
      <td class="n">${m(soma('valor_mercadoria'))}</td>
      <td class="n">${soma('peso_kg').toLocaleString('pt-BR', { maximumFractionDigits: 1 })}</td>
      <td class="n">${soma('qtd_volumes')}</td>
      <td class="n">${m(soma('icms'))}</td>
      <td class="n">${m(soma('valor_tabela'))}</td>
      <td class="n">${m(f.valor_ctes)}</td>
      <td class="n">${m(difTabela)}</td>
      <td class="n">${m(soma('glosa'))}</td>
      <td></td>
    </tr></tfoot>
  </table>

  <div class="resumo">
    <table>
      <tr><td>Quantidade de CT-e</td><td class="n">${itens.length}</td></tr>
      <tr><td>CT-e conferidos</td><td class="n">${conferidos}</td></tr>
      <tr><td>CT-e com pendência</td><td class="n">${itens.length - conferidos}</td></tr>
      <tr><td>Valor total ICMS</td><td class="n">${m(soma('icms'))}</td></tr>
    </table>
    <table>
      <tr><td>Valor pela tabela de frete</td><td class="n">${m(soma('valor_tabela'))}</td></tr>
      <tr><td>Soma dos CT-e</td><td class="n">${m(f.valor_ctes)}</td></tr>
      ${totalGlosas > 0 ? `<tr><td>Glosas combinadas (desconto)</td><td class="n">− ${m(totalGlosas)}</td></tr>
      <tr><td>Fatura deveria vir</td><td class="n">${m(valorEsperadoFatura)}</td></tr>` : ''}
      <tr><td>Valor da fatura (transportadora)</td><td class="n">${m(f.valor_informado)}</td></tr>
      <tr><td>${totalGlosas > 0 ? 'Diferença fatura × esperado' : 'Diferença fatura × CT-e'}</td><td class="n ${difFatura != null && Math.abs(difFatura) >= 0.01 ? 'alerta' : ''}">${difFatura == null ? '—' : m(difFatura)}</td></tr>
      <tr class="total"><td>VALOR CONFERIDO</td><td class="n">R$ ${m(f.valor_ctes)}</td></tr>
    </table>
    <div class="obs"><div class="rot">Observações</div>${cfEsc(f.observacoes || '')}</div>
  </div>

  <div class="assinaturas">
    <div>Conferido por: ${cfEsc(f.conferido_por_nome || '')}</div>
    <div>Aprovado — Financeiro</div>
  </div>

  <div class="rodape">
    <span>Conferido no Nexofrete em ${formatoDataHora(f.conferido_em)} por ${cfEsc(f.conferido_por_nome || '')}. Valores registrados no momento da conferência.</span>
    <span>Código de verificação: <b>${cfEsc(f.codigo_verificacao)}</b></span>
  </div>
</body></html>`;

  const quadro = document.createElement('iframe');
  quadro.style.cssText = 'position:fixed; right:0; bottom:0; width:0; height:0; border:0;';
  document.body.appendChild(quadro);
  const doc = quadro.contentWindow.document;
  doc.open();
  doc.write(html);
  doc.close();
  setTimeout(() => {
    quadro.contentWindow.focus();
    quadro.contentWindow.print();
    setTimeout(() => quadro.remove(), 1000);
  }, 250);
}

if (!podeVerFaturas) document.getElementById('btnAbrirConferenciaFatura').classList.add('oculto');
if (!podeConferirFatura) {
  document.getElementById('btnAbrirConferenciaFatura').textContent = '🧾 Faturas conferidas';
  document.querySelector('.cf-aba[data-cf-aba="nova"]').classList.add('oculto');
}
document.getElementById('btnAbrirConferenciaFatura').addEventListener('click', cfAbrir);
document.getElementById('btnFecharConferenciaFatura').addEventListener('click', () => {
  document.getElementById('painelConferenciaFatura').classList.add('oculto');
});
document.querySelectorAll('.cf-aba').forEach((b) => b.addEventListener('click', () => cfTrocarAba(b.dataset.cfAba)));
document.getElementById('cfTransportadora').addEventListener('change', cfCarregarCtes);
document.getElementById('cfBusca').addEventListener('input', cfRenderizarTabela);
document.getElementById('cfSoMarcados').addEventListener('change', cfRenderizarTabela);
// setTimeout: espera a máscara de moeda (listener no document) formatar o valor primeiro.
document.getElementById('cfValor').addEventListener('input', () => setTimeout(cfAtualizarResumo, 0));
document.getElementById('btnCfMarcarColados').addEventListener('click', cfMarcarColados);
document.getElementById('btnCfGerar').addEventListener('click', cfGerar);

document.getElementById('cfMarcarTodos').addEventListener('change', (e) => {
  document.querySelectorAll('#cfCorpo tr[data-cf-id]').forEach((tr) => {
    const id = Number(tr.dataset.cfId);
    if (e.target.checked) cfEstado.marcados.add(id); else cfEstado.marcados.delete(id);
  });
  cfRenderizarTabela();
});

document.getElementById('cfCorpo').addEventListener('click', (e) => {
  const tr = e.target.closest('tr[data-cf-id]');
  if (!tr) return;
  const id = Number(tr.dataset.cfId);
  if (cfEstado.marcados.has(id)) cfEstado.marcados.delete(id); else cfEstado.marcados.add(id);
  cfRenderizarTabela();
});

document.getElementById('cfCorpoLista').addEventListener('click', (e) => {
  const imprimir = e.target.closest('[data-cf-imprimir]');
  if (imprimir) { cfImprimir(imprimir.dataset.cfImprimir); return; }
  const desfazer = e.target.closest('[data-cf-desfazer]');
  if (desfazer) cfDesfazer(desfazer.dataset.cfDesfazer, desfazer.dataset.cfNumero);
});


// ---------- Permissões sempre atualizadas ----------
// O servidor já aplica na hora qualquer mudança de permissão. Aqui a tela
// acompanha: ao abrir, se algo mudou desde o login, recarrega com o menu
// certo; depois, confere de minuto em minuto e avisa pra atualizar.
const CAMPOS_PERMISSAO_TELA = ['perfil', 'cliente_nome', 'pode_ver_todos', 'pode_enviar_xml', 'pode_editar_registros',
  'pode_excluir_registros', 'pode_gerenciar_usuarios', 'pode_gerenciar_transportadoras', 'pode_gerenciar_tabelas_preco',
  'pode_aprovar_pagamento', 'pode_aprovar_valores_altos', 'pode_ver_auditoria', 'pode_ver_financeiro',
  'pode_ver_relatorios', 'pode_ver_sinistros', 'pode_conferir_fatura', 'pode_emitir_cte'];
const assinaturaPermissoes = (u) => JSON.stringify(CAMPOS_PERMISSAO_TELA.map((c) => (c === 'perfil' || c === 'cliente_nome' ? u?.[c] ?? null : !!u?.[c])));

let permissoesAvisoAberto = false;
async function sincronizarPermissoes(naAbertura) {
  try {
    const resposta = await apiFetch('/api/auth/eu');
    if (!resposta.ok) return;
    const atual = await resposta.json();
    if (assinaturaPermissoes(atual) === assinaturaPermissoes(usuario)) {
      sessionStorage.removeItem('permissoesRecarregadas');
      return;
    }
    sessionStorage.setItem('usuario', JSON.stringify({ ...usuario, ...atual }));
    if (naAbertura && !sessionStorage.getItem('permissoesRecarregadas')) {
      sessionStorage.setItem('permissoesRecarregadas', '1'); // evita recarregar em loop
      window.location.reload();
      return;
    }
    if (!permissoesAvisoAberto) {
      permissoesAvisoAberto = true;
      abrirDialogo({
        tipo: 'info', titulo: 'Suas permissões mudaram',
        mensagem: 'O administrador alterou o que você pode acessar no sistema. Atualize a tela para ver o menu certo.',
        botoes: [{ texto: 'Depois', valor: false, estilo: 'secundario' }, { texto: 'Atualizar agora', valor: true, estilo: 'primario' }],
      }).then((ok) => { if (ok) window.location.reload(); });
    }
  } catch (err) { /* sem conexão agora: tenta de novo no próximo ciclo */ }
}
sincronizarPermissoes(true);
setInterval(() => sincronizarPermissoes(false), 60 * 1000);

// =====================================================================
// Agenda compartilhada
// =====================================================================
const AG_CORES = { azul: '#4d7cff', verde: '#22c55e', laranja: '#f97316', roxo: '#a855f7', vermelho: '#ef4444', ciano: '#06b6d4' };
const AG_ICONES = { convite: '📅', alterado: '✏️', cancelado: '🚫', removido: '👋', lembrete_1dia: '⏰', lembrete_1hora: '⏰' };
const AG_TITULOS_AVISO = { convite: 'Novo evento', alterado: 'Evento alterado', cancelado: 'Evento cancelado', removido: 'Você saiu do evento', lembrete_1dia: 'Lembrete', lembrete_1hora: 'Lembrete' };
const agEstado = { mes: new Date(new Date().getFullYear(), new Date().getMonth(), 1), eventos: [], usuarios: null, editando: null, cor: 'azul', selecionados: new Set() };
let agAvisos = []; // avisos não lidos (também aparecem no sino)

const agPad = (n) => String(n).padStart(2, '0');
const agDataLocal = (d) => `${d.getFullYear()}-${agPad(d.getMonth() + 1)}-${agPad(d.getDate())}`;
const agHora = (d) => `${agPad(d.getHours())}:${agPad(d.getMinutes())}`;
const agCorDe = (ev) => AG_CORES[ev?.cor] || AG_CORES.azul;
const agIniciais = (nome) => (nome || '?').trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
const agCorPessoa = (nome) => (typeof corPorNome === 'function' ? corPorNome(nome) : '#4d7cff');
function agQuando(ev) {
  const ini = new Date(ev.inicio);
  const dia = ini.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  if (ev.dia_inteiro) return `${dia} · dia inteiro`;
  return ev.fim ? `${dia} · ${agHora(ini)} às ${agHora(new Date(ev.fim))}` : `${dia} · ${agHora(ini)}`;
}

// Camadas do calendário (liga/desliga, guardado neste navegador).
const AG_CAMADAS = {
  eventos: { rotulo: 'Meus eventos', cor: '#4d7cff' },
  fatura: { rotulo: '💰 Vencimento de faturas', cor: '#f97316' },
  entregas: { rotulo: '🚚 Entregas previstas', cor: '#22c55e' },
};
function agCamadasLigadas() {
  try { return { eventos: true, fatura: true, entregas: true, ...JSON.parse(localStorage.getItem('agCamadas') || '{}') }; } catch { return { eventos: true, fatura: true, entregas: true }; }
}
function agLigarCamada(chave, ligada) {
  const c = agCamadasLigadas(); c[chave] = ligada;
  try { localStorage.setItem('agCamadas', JSON.stringify(c)); } catch { /* só não lembra */ }
  agRenderizarCalendario(agEstado.inicioGrade, agEstado.semanas);
}
const agDiaMais = (chave, n) => { const d = new Date(`${chave}T12:00:00`); d.setDate(d.getDate() + n); return agDataLocal(d); };

async function carregarAgenda() {
  // Só as semanas do mês (5 ou 6, às vezes 4), sem uma semana inteira do mês seguinte.
  const inicioGrade = new Date(agEstado.mes); inicioGrade.setDate(1 - inicioGrade.getDay());
  const diasNoMes = new Date(agEstado.mes.getFullYear(), agEstado.mes.getMonth() + 1, 0).getDate();
  const semanas = Math.ceil((agEstado.mes.getDay() + diasNoMes) / 7);
  const fimGrade = new Date(inicioGrade); fimGrade.setDate(fimGrade.getDate() + semanas * 7 - 1);
  const hoje = agDataLocal(new Date());
  const json = async (r) => (r.ok ? r.json() : []);
  try {
    const [respEv, respProx, respSis, respSemana] = await Promise.all([
      apiFetch(`/api/agenda/eventos?de=${agDataLocal(inicioGrade)}&ate=${agDataLocal(fimGrade)}`),
      apiFetch('/api/agenda/proximos'),
      apiFetch(`/api/agenda/sistema?de=${agDataLocal(inicioGrade)}&ate=${agDataLocal(fimGrade)}`).catch(() => ({ ok: false })),
      apiFetch(`/api/agenda/sistema?de=${hoje}&ate=${agDiaMais(hoje, 6)}`).catch(() => ({ ok: false })),
    ]);
    agEstado.eventos = await json(respEv);
    agEstado.sistema = await json(respSis);
    agEstado.inicioGrade = inicioGrade; agEstado.semanas = semanas;
    agRenderizarCalendario(inicioGrade, semanas);
    agRenderizarProximos(await json(respProx));
    agRenderizarResumoFrete(await json(respSemana), respSemana.ok);
  } catch (err) { console.error(err); }
  agRenderizarAvisos();
}

// Itens de um dia: eventos (inclusive os de vários dias) e as datas do sistema.
function agItensPorDia() {
  const camadas = agCamadasLigadas();
  const porDia = {};
  const por = (chave, item) => (porDia[chave] = porDia[chave] || []).push(item);
  if (camadas.eventos) {
    agEstado.eventos.forEach((ev) => {
      const ini = agDataLocal(new Date(ev.inicio));
      const fim = ev.fim ? agDataLocal(new Date(ev.fim)) : ini;
      for (let d = ini, k = 0; d <= fim && k < 62; d = agDiaMais(d, 1), k += 1) por(d, { tipo: 'evento', ev, continua: d !== ini });
    });
  }
  (agEstado.sistema || []).forEach((it) => { if (camadas[it.tipo]) por(it.data, it); });
  return porDia;
}

function agChip(item) {
  if (item.tipo === 'evento') {
    const ev = item.ev;
    return `<div class="ag-chip" style="--cor-ev:${agCorDe(ev)};" data-ag-evento="${ev.id}" title="${cfEsc(ev.titulo)}">
        ${item.continua ? '↳ ' : (ev.dia_inteiro ? '' : `<b>${agHora(new Date(ev.inicio))}</b>`)}${cfEsc(ev.titulo)}</div>`;
  }
  if (item.tipo === 'fatura') {
    return `<div class="ag-chip ag-chip-sis" style="--cor-ev:${AG_CAMADAS.fatura.cor};" data-ag-sis="fatura"
        title="Vence a fatura ${cfEsc(item.numero)} de ${cfEsc(item.transportadora)}: ${formatoMoeda(item.valor)}${item.parecer ? ` (${cfEsc(item.parecer)})` : ''}">💰 ${cfEsc(item.numero)} · ${cfEsc(item.transportadora)}</div>`;
  }
  return `<div class="ag-chip ag-chip-sis" style="--cor-ev:${AG_CAMADAS.entregas.cor};" data-ag-sis="entregas"
      title="${item.qtd} nota(s) com entrega prevista para este dia, de ${item.transportadoras} transportadora(s)">🚚 ${item.qtd} entrega${item.qtd > 1 ? 's' : ''}</div>`;
}

function agRenderizarFiltros() {
  const area = document.getElementById('agFiltros');
  const camadas = agCamadasLigadas();
  // Só mostra as camadas do sistema que este usuário pode ver (o servidor manda o que é permitido).
  const disponiveis = ['eventos', ...(agEstado.sistemaPermitido || [])];
  area.innerHTML = disponiveis.length > 1 ? disponiveis.map((k) => `
    <label class="ag-filtro" style="--cor-ev:${AG_CAMADAS[k].cor};"><input type="checkbox" data-ag-camada="${k}" ${camadas[k] ? 'checked' : ''} />${AG_CAMADAS[k].rotulo}</label>`).join('') : '';
}

function agRenderizarCalendario(inicioGrade, semanas = 6) {
  const titulo = agEstado.mes.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  document.getElementById('agMesTitulo').textContent = titulo.charAt(0).toUpperCase() + titulo.slice(1);
  agRenderizarFiltros();
  const hoje = agDataLocal(new Date());
  const porDia = agItensPorDia();
  agEstado.porDia = porDia;
  let html = '';
  for (let i = 0; i < semanas * 7; i++) {
    const d = new Date(inicioGrade); d.setDate(d.getDate() + i);
    const chave = agDataLocal(d);
    const itens = porDia[chave] || [];
    const classes = ['ag-dia', d.getMonth() !== agEstado.mes.getMonth() ? 'fora' : '', chave === hoje ? 'hoje' : '', chave < hoje ? 'passado' : ''].join(' ');
    const mais = itens.length > 3 ? `<div class="ag-mais" data-ag-dia-lista="${chave}">+${itens.length - 3} mais</div>` : '';
    html += `<div class="${classes}" data-ag-dia="${chave}" title="Clique para marcar um evento neste dia"><span class="ag-dia-num">${d.getDate()}</span>${itens.slice(0, 3).map(agChip).join('')}${mais}</div>`;
  }
  document.getElementById('agGrade').innerHTML = html;
}

// Tudo o que tem num dia (quando não cabe na célula).
function agAbrirDia(chave) {
  const itens = agEstado.porDia?.[chave] || [];
  const dia = new Date(`${chave}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  document.getElementById('agDetalheConteudo').innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
      <h3 style="margin:0;">${cfEsc(dia.charAt(0).toUpperCase() + dia.slice(1))}</h3>
      <span style="cursor:pointer; font-size:18px;" data-ag-fechar-detalhe>✕</span>
    </div>
    <div class="ag-dia-lista">${itens.map(agChip).join('')}</div>
    <div style="display:flex; justify-content:flex-end; margin-top:16px;">
      <button class="btn btn-primario" data-ag-novo-no-dia="${chave}" style="width:auto;">+ Novo evento neste dia</button>
    </div>`;
  document.getElementById('painelAgDetalhe').classList.remove('oculto');
}

// Clique numa data do sistema: leva para a tela de onde ela vem.
function agAbrirSistema(tipo) {
  document.getElementById('painelAgDetalhe').classList.add('oculto');
  if (tipo === 'fatura') {
    document.getElementById('painelConferenciaFatura').classList.remove('oculto');
    cfTrocarAba('lista');
  } else if (tipo === 'entregas') {
    irParaPagina('relatorios');
    setTimeout(() => irParaAlvoNotificacao('entregas-previstas'), 150);
  }
}

function agRenderizarResumoFrete(itens, permitido) {
  const bloco = document.getElementById('agBlocoFrete');
  // Quais camadas do sistema este usuário enxerga (para os filtros).
  agEstado.sistemaPermitido = permitido ? [
    ...(podeVerFaturas ? ['fatura'] : []), ...(podeVerRelatorios ? ['entregas'] : []),
  ] : [];
  agRenderizarFiltros();
  if (!agEstado.sistemaPermitido.length) { bloco.classList.add('oculto'); return; }
  bloco.classList.remove('oculto');
  const faturas = itens.filter((i) => i.tipo === 'fatura');
  const entregas = itens.filter((i) => i.tipo === 'entregas');
  const qtdEntregas = entregas.reduce((s, e) => s + e.qtd, 0);
  const valorFaturas = faturas.reduce((s, f) => s + (Number(f.valor) || 0), 0);
  const linhas = [];
  if (podeVerFaturas) {
    linhas.push(`<div class="ag-item" style="--cor-ev:${AG_CAMADAS.fatura.cor};" data-ag-sis="fatura">
      <div style="font-size:18px;">💰</div>
      <div class="ag-item-texto">${faturas.length ? `${faturas.length} fatura(s) vencem · ${formatoMoeda(valorFaturas)}` : 'Nenhuma fatura vence'}
        <small>${faturas.length ? faturas.slice(0, 3).map((f) => `${new Date(`${f.data}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} ${cfEsc(f.transportadora)}`).join(' · ') : 'com data de vencimento informada na conferência'}</small></div>
    </div>`);
  }
  if (podeVerRelatorios) {
    const pico = entregas.reduce((m, e) => (!m || e.qtd > m.qtd ? e : m), null);
    linhas.push(`<div class="ag-item" style="--cor-ev:${AG_CAMADAS.entregas.cor};" data-ag-sis="entregas">
      <div style="font-size:18px;">🚚</div>
      <div class="ag-item-texto">${qtdEntregas ? `${qtdEntregas} entrega(s) previstas` : 'Nenhuma entrega prevista'}
        <small>${pico ? `Dia mais cheio: ${new Date(`${pico.data}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })} (${pico.qtd})` : 'notas em aberto com previsão de entrega'}</small></div>
    </div>`);
  }
  document.getElementById('agResumoFrete').innerHTML = linhas.join('');
}

function agRenderizarProximos(lista) {
  const area = document.getElementById('agProximos');
  area.dataset.cache = '';
  agEstado.proximos = lista;
  area.innerHTML = lista.length ? lista.map((ev) => {
    const d = new Date(ev.inicio);
    return `
      <div class="ag-item" style="--cor-ev:${agCorDe(ev)};" data-ag-evento-lista="${ev.id}">
        <div class="ag-item-data"><strong>${d.getDate()}</strong><span>${d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')}</span></div>
        <div class="ag-item-texto">${cfEsc(ev.titulo)}<small>${ev.dia_inteiro ? 'Dia inteiro' : agHora(d)}${ev.local ? ` · ${cfEsc(ev.local)}` : ''}${ev.participantes.length ? ` · ${ev.participantes.length + 1} pessoas` : ''}</small></div>
      </div>`;
  }).join('') : '<div class="ag-vazio">Nenhum compromisso pela frente. Clique num dia do calendário para marcar um.</div>';
}

function agRenderizarAvisos() {
  const area = document.getElementById('agAvisos');
  if (!area) return;
  area.innerHTML = agAvisos.length ? agAvisos.map((a) => `
    <div class="ag-item" data-ag-aviso="${a.id}" style="--cor-ev:${a.tipo.startsWith('lembrete') ? '#eab308' : a.tipo === 'cancelado' ? '#ef4444' : '#4d7cff'};">
      <div style="font-size:18px;">${AG_ICONES[a.tipo] || '📅'}</div>
      <div class="ag-item-texto"><strong style="font-weight:600;">${cfEsc(a.titulo || '')}</strong><small>${cfEsc(a.texto || '')}</small></div>
    </div>`).join('') : '<div class="ag-vazio">Nenhum aviso novo.</div>';
}

function agBuscarEvento(id) {
  id = Number(id);
  return agEstado.eventos.find((e) => e.id === id) || (agEstado.proximos || []).find((e) => e.id === id) || null;
}

function agAbrirDetalhe(ev) {
  if (!ev) return;
  const lembretes = [ev.lembrete_1dia ? '1 dia antes' : null, ev.lembrete_1hora ? '1 hora antes' : null].filter(Boolean);
  const pessoas = [{ nome: ev.criado_por_nome || '—', dono: true }, ...ev.participantes.map((p) => ({ nome: p.nome }))];
  document.getElementById('agDetalheConteudo').innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:10px;">
      <div class="ag-detalhe-topo" style="--cor-ev:${agCorDe(ev)};">
        <h3>${cfEsc(ev.titulo)}</h3>
        <div style="font-size:13px; color:var(--texto-fraco);">${cfEsc(agQuando(ev))}</div>
      </div>
      <span style="cursor:pointer; font-size:18px;" data-ag-fechar-detalhe>✕</span>
    </div>
    ${ev.local ? `<div class="ag-detalhe-linha"><span>📍</span><span>${cfEsc(ev.local)}</span></div>` : ''}
    ${ev.descricao ? `<div class="ag-detalhe-linha"><span>📝</span><span style="white-space:pre-wrap;">${cfEsc(ev.descricao)}</span></div>` : ''}
    <div class="ag-detalhe-linha"><span>⏰</span><span>${lembretes.length ? `Lembrete ${lembretes.join(' e ')}` : 'Sem lembrete'}</span></div>
    <div class="ag-detalhe-linha"><span>👥</span>
      <div class="ag-pessoas">${pessoas.map((p) => `
        <span class="ag-pessoa"><span class="ag-avatar" style="background:${agCorPessoa(p.nome)};">${cfEsc(agIniciais(p.nome))}</span>${cfEsc(p.nome)}${p.dono ? ' <small style="color:var(--texto-fraco);">(criou)</small>' : ''}</span>`).join('')}
      </div>
    </div>
    ${ev.eh_dono ? `
      <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:16px;">
        <button class="btn btn-secundario" data-ag-excluir="${ev.id}" style="width:auto; color:var(--vermelho);">Cancelar evento</button>
        <button class="btn btn-primario" data-ag-editar="${ev.id}" style="width:auto;">Editar</button>
      </div>` : '<p style="font-size:12px; color:var(--texto-fraco); margin:14px 0 0;">Só quem criou o evento pode alterar ou cancelar.</p>'}`;
  document.getElementById('painelAgDetalhe').classList.remove('oculto');
}

// ---------- Formulário ----------
async function agCarregarUsuarios() {
  if (agEstado.usuarios) return agEstado.usuarios;
  try {
    const resposta = await apiFetch('/api/agenda/usuarios');
    agEstado.usuarios = resposta.ok ? await resposta.json() : [];
  } catch (e) { agEstado.usuarios = []; }
  return agEstado.usuarios;
}

function agRenderizarUsuarios() {
  const busca = document.getElementById('agBuscaUsuario').value.trim().toLowerCase();
  const lista = (agEstado.usuarios || []).filter((u) => !busca || u.nome.toLowerCase().includes(busca));
  document.getElementById('agListaUsuarios').innerHTML = lista.length ? lista.map((u) => `
    <label class="ag-usuario">
      <input type="checkbox" data-ag-usuario="${u.id}" ${agEstado.selecionados.has(u.id) ? 'checked' : ''} />
      <span class="ag-avatar" style="background:${agCorPessoa(u.nome)};">${cfEsc(agIniciais(u.nome))}</span>
      <span style="min-width:0;">${cfEsc(u.nome)}${u.funcao ? `<small style="display:block; color:var(--texto-fraco); font-size:11px;">${cfEsc(u.funcao)}</small>` : ''}</span>
    </label>`).join('') : '<div class="ag-vazio">Ninguém encontrado.</div>';
  const n = agEstado.selecionados.size;
  document.getElementById('agContParticipantes').textContent = n ? `Você + ${n} pessoa(s)` : 'Só você';
}

function agRenderizarCores() {
  document.getElementById('agCores').innerHTML = Object.entries(AG_CORES).map(([nome, cor]) =>
    `<span class="ag-cor ${agEstado.cor === nome ? 'ativa' : ''}" data-ag-cor="${nome}" style="background:${cor};" title="${nome}"></span>`).join('');
}

function agAtualizarDiaInteiro() {
  const dia = document.getElementById('agDiaInteiro').checked;
  document.querySelectorAll('#painelAgEvento .ag-so-hora').forEach((el) => el.classList.toggle('oculto', dia));
}

async function agAbrirFormulario(ev = null, dataInicial = null) {
  document.getElementById('painelAgDetalhe').classList.add('oculto');
  agEstado.editando = ev;
  document.getElementById('agErroForm').classList.remove('visivel');
  document.getElementById('agFormTitulo').textContent = ev ? 'Editar evento' : 'Novo evento';
  document.getElementById('btnAgExcluir').classList.toggle('oculto', !ev);
  document.getElementById('btnAgSalvar').textContent = ev ? 'Salvar e avisar' : 'Criar e avisar';

  const agora = new Date();
  const inicio = ev ? new Date(ev.inicio) : null;
  document.getElementById('agTitulo').value = ev?.titulo || '';
  document.getElementById('agData').value = inicio ? agDataLocal(inicio) : (dataInicial || agDataLocal(agora));
  const horaPadrao = new Date(agora); horaPadrao.setMinutes(0); horaPadrao.setHours(horaPadrao.getHours() + 1);
  document.getElementById('agHoraInicio').value = inicio && !ev.dia_inteiro ? agHora(inicio) : agHora(horaPadrao);
  document.getElementById('agHoraFim').value = ev?.fim ? agHora(new Date(ev.fim)) : '';
  document.getElementById('agDiaInteiro').checked = !!ev?.dia_inteiro;
  document.getElementById('agLocal').value = ev?.local || '';
  document.getElementById('agDescricao').value = ev?.descricao || '';
  document.getElementById('agLembrete1Dia').checked = ev ? !!ev.lembrete_1dia : true;
  document.getElementById('agLembrete1Hora').checked = ev ? !!ev.lembrete_1hora : true;
  agEstado.cor = ev?.cor || 'azul';
  agEstado.selecionados = new Set((ev?.participantes || []).map((p) => p.id));
  document.getElementById('agBuscaUsuario').value = '';
  agAtualizarDiaInteiro();
  agRenderizarCores();
  document.getElementById('painelAgEvento').classList.remove('oculto');
  await agCarregarUsuarios();
  agRenderizarUsuarios();
  document.getElementById('agTitulo').focus();
}

async function agSalvar() {
  const erro = document.getElementById('agErroForm');
  const mostrarErroAg = (t) => { erro.textContent = t; erro.classList.add('visivel'); };
  erro.classList.remove('visivel');
  const data = document.getElementById('agData').value;
  const diaInteiro = document.getElementById('agDiaInteiro').checked;
  const horaIni = document.getElementById('agHoraInicio').value;
  const horaFim = document.getElementById('agHoraFim').value;
  if (!document.getElementById('agTitulo').value.trim()) { mostrarErroAg('Dê um título ao evento.'); return; }
  if (!data) { mostrarErroAg('Escolha a data do evento.'); return; }
  if (!diaInteiro && !horaIni) { mostrarErroAg('Informe a hora de início (ou marque "Dia inteiro").'); return; }
  if (!diaInteiro && horaFim && horaFim < horaIni) { mostrarErroAg('O término não pode ser antes do início.'); return; }

  const corpo = {
    titulo: document.getElementById('agTitulo').value.trim(),
    inicio: diaInteiro ? data : `${data}T${horaIni}`,
    fim: !diaInteiro && horaFim ? `${data}T${horaFim}` : null,
    dia_inteiro: diaInteiro,
    local: document.getElementById('agLocal').value.trim(),
    descricao: document.getElementById('agDescricao').value.trim(),
    lembrete_1dia: document.getElementById('agLembrete1Dia').checked,
    lembrete_1hora: document.getElementById('agLembrete1Hora').checked,
    cor: agEstado.cor,
    participantes: [...agEstado.selecionados],
  };
  const botao = document.getElementById('btnAgSalvar');
  botao.disabled = true;
  try {
    const ev = agEstado.editando;
    const resposta = await apiFetch(ev ? `/api/agenda/eventos/${ev.id}` : '/api/agenda/eventos', {
      method: ev ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
    });
    const dados = await resposta.json();
    if (!resposta.ok) { mostrarErroAg(dados.erro || 'Não foi possível salvar o evento.'); return; }
    document.getElementById('painelAgEvento').classList.add('oculto');
    // Vai pro mês do evento, pra ele aparecer na hora.
    const d = new Date(dados.inicio);
    agEstado.mes = new Date(d.getFullYear(), d.getMonth(), 1);
    carregarAgenda();
  } catch (err) {
    mostrarErroAg('Falha de conexão com o servidor.');
  } finally {
    botao.disabled = false;
  }
}

async function agExcluir(id) {
  const ev = agBuscarEvento(id) || agEstado.editando;
  const qtd = ev?.participantes?.length || 0;
  if (!(await confirmar(`"${ev?.titulo || ''}"${qtd ? ` — as ${qtd} pessoa(s) convidada(s) vão ser avisadas do cancelamento.` : ''}`, { tipo: 'perigo', titulo: 'Cancelar o evento?', textoOk: 'Cancelar evento', textoCancelar: 'Voltar' }))) return;
  try {
    const resposta = await apiFetch(`/api/agenda/eventos/${id}`, { method: 'DELETE' });
    const dados = await resposta.json();
    if (!resposta.ok) { mostrarAlerta(dados.erro || 'Não foi possível cancelar.'); return; }
    document.getElementById('painelAgDetalhe').classList.add('oculto');
    document.getElementById('painelAgEvento').classList.add('oculto');
    carregarAgenda();
  } catch (err) {
    mostrarAlerta('Falha de conexão com o servidor.');
  }
}

// ---------- Avisos: sino, contador no menu e lembretes na tela ----------
const agAvisosJaMostrados = new Set(JSON.parse(sessionStorage.getItem('agAvisosMostrados') || '[]'));

async function agVerificarAvisos() {
  try {
    const resposta = await apiFetch('/api/agenda/notificacoes');
    if (!resposta.ok) return;
    agAvisos = await resposta.json();
  } catch (e) { return; }

  const badge = document.getElementById('badgeAgenda');
  badge.textContent = agAvisos.length;
  badge.classList.toggle('oculto', agAvisos.length === 0);
  agRenderizarAvisos();
  if (typeof renderizarSino === 'function') renderizarSino();

  // Pop-up no canto da tela para cada aviso novo desta sessão.
  agAvisos.filter((a) => !agAvisosJaMostrados.has(a.id)).slice(0, 4).reverse().forEach(agMostrarToast);
  agAvisos.forEach((a) => agAvisosJaMostrados.add(a.id));
  sessionStorage.setItem('agAvisosMostrados', JSON.stringify([...agAvisosJaMostrados].slice(-200)));
}

function agMostrarToast(aviso) {
  // Mesmo padrão de todas as mensagens: no centro da tela, com desenho.
  const lembrete = aviso.tipo.startsWith('lembrete');
  const tipo = lembrete ? 'lembrete' : aviso.tipo === 'cancelado' ? 'erro' : aviso.tipo === 'removido' ? 'aviso' : 'info';
  const botoes = [{ texto: 'Ok, entendi', valor: 'ok', estilo: aviso.evento_id ? 'secundario' : 'primario' }];
  if (aviso.evento_id) botoes.push({ texto: 'Ver evento', valor: 'ver', estilo: 'primario' });
  abrirDialogo({
    tipo,
    titulo: `${AG_TITULOS_AVISO[aviso.tipo] || 'Agenda'}: ${aviso.titulo || ''}`,
    mensagem: aviso.texto || '',
    botoes,
  }).then(async (escolha) => {
    if (escolha === 'ok' || escolha === 'ver') agMarcarLidos([aviso.id]);
    if (escolha === 'ver') { irParaPagina('agenda'); await carregarAgenda(); agAbrirDetalheId(aviso.evento_id); }
  });
}

async function agAbrirDetalheId(id) {
  let ev = agBuscarEvento(id);
  if (!ev) {
    // Evento fora do mês visível: busca direto e vai pro mês dele.
    try {
      const resposta = await apiFetch('/api/agenda/eventos');
      const todos = resposta.ok ? await resposta.json() : [];
      ev = todos.find((e) => e.id === Number(id));
      if (ev) {
        const d = new Date(ev.inicio);
        agEstado.mes = new Date(d.getFullYear(), d.getMonth(), 1);
        await carregarAgenda();
        ev = agBuscarEvento(id) || ev;
      }
    } catch (e) { /* segue sem abrir */ }
  }
  if (ev) agAbrirDetalhe(ev);
}

async function agMarcarLidos(ids = null) {
  try {
    await apiFetch('/api/agenda/notificacoes/lidas', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ids ? { ids } : {}),
    });
  } catch (e) { /* tenta de novo na próxima */ }
  agVerificarAvisos();
}

// ---------- Eventos da tela ----------
document.getElementById('btnAgNovoEvento').addEventListener('click', () => agAbrirFormulario());
document.getElementById('btnAgMesAnterior').addEventListener('click', () => { agEstado.mes.setMonth(agEstado.mes.getMonth() - 1); carregarAgenda(); });
document.getElementById('btnAgMesSeguinte').addEventListener('click', () => { agEstado.mes.setMonth(agEstado.mes.getMonth() + 1); carregarAgenda(); });
document.getElementById('btnAgHoje').addEventListener('click', () => { const h = new Date(); agEstado.mes = new Date(h.getFullYear(), h.getMonth(), 1); carregarAgenda(); });
document.getElementById('btnAgMarcarLidos').addEventListener('click', () => agMarcarLidos());

document.getElementById('agGrade').addEventListener('click', (e) => {
  const chip = e.target.closest('[data-ag-evento]');
  if (chip) { agAbrirDetalhe(agBuscarEvento(chip.dataset.agEvento)); return; }
  const sis = e.target.closest('[data-ag-sis]');
  if (sis) { agAbrirSistema(sis.dataset.agSis); return; }
  const lista = e.target.closest('[data-ag-dia-lista]');
  if (lista) { agAbrirDia(lista.dataset.agDiaLista); return; }
  const dia = e.target.closest('[data-ag-dia]');
  if (dia) agAbrirFormulario(null, dia.dataset.agDia);
});
document.getElementById('agFiltros').addEventListener('change', (e) => {
  const caixa = e.target.closest('[data-ag-camada]');
  if (caixa) agLigarCamada(caixa.dataset.agCamada, caixa.checked);
});
document.getElementById('agResumoFrete').addEventListener('click', (e) => {
  const item = e.target.closest('[data-ag-sis]');
  if (item) agAbrirSistema(item.dataset.agSis);
});
document.getElementById('agProximos').addEventListener('click', (e) => {
  const item = e.target.closest('[data-ag-evento-lista]');
  if (item) agAbrirDetalhe(agBuscarEvento(item.dataset.agEventoLista));
});
document.getElementById('agAvisos').addEventListener('click', (e) => {
  const item = e.target.closest('[data-ag-aviso]');
  if (!item) return;
  const aviso = agAvisos.find((a) => a.id === Number(item.dataset.agAviso));
  agMarcarLidos([Number(item.dataset.agAviso)]);
  if (aviso?.evento_id) agAbrirDetalheId(aviso.evento_id);
});
document.getElementById('painelAgDetalhe').addEventListener('click', (e) => {
  if (e.target.id === 'painelAgDetalhe' || e.target.closest('[data-ag-fechar-detalhe]')) {
    document.getElementById('painelAgDetalhe').classList.add('oculto'); return;
  }
  const evLista = e.target.closest('[data-ag-evento]');
  if (evLista) { agAbrirDetalhe(agBuscarEvento(evLista.dataset.agEvento)); return; }
  const sisLista = e.target.closest('[data-ag-sis]');
  if (sisLista) { agAbrirSistema(sisLista.dataset.agSis); return; }
  const novoNoDia = e.target.closest('[data-ag-novo-no-dia]');
  if (novoNoDia) { document.getElementById('painelAgDetalhe').classList.add('oculto'); agAbrirFormulario(null, novoNoDia.dataset.agNovoNoDia); return; }
  const editar = e.target.closest('[data-ag-editar]');
  if (editar) { agAbrirFormulario(agBuscarEvento(editar.dataset.agEditar)); return; }
  const excluir = e.target.closest('[data-ag-excluir]');
  if (excluir) agExcluir(excluir.dataset.agExcluir);
});

['btnAgFecharForm', 'btnAgCancelarForm'].forEach((id) => document.getElementById(id).addEventListener('click', () => {
  document.getElementById('painelAgEvento').classList.add('oculto');
}));
document.getElementById('btnAgSalvar').addEventListener('click', agSalvar);
document.getElementById('btnAgExcluir').addEventListener('click', () => { if (agEstado.editando) agExcluir(agEstado.editando.id); });
document.getElementById('agDiaInteiro').addEventListener('change', agAtualizarDiaInteiro);
document.getElementById('agCores').addEventListener('click', (e) => {
  const cor = e.target.closest('[data-ag-cor]');
  if (cor) { agEstado.cor = cor.dataset.agCor; agRenderizarCores(); }
});
document.getElementById('agBuscaUsuario').addEventListener('input', agRenderizarUsuarios);
document.getElementById('agListaUsuarios').addEventListener('change', (e) => {
  const id = Number(e.target.dataset.agUsuario);
  if (!id) return;
  if (e.target.checked) agEstado.selecionados.add(id); else agEstado.selecionados.delete(id);
  agRenderizarUsuarios();
});
document.getElementById('btnAgTodos').addEventListener('click', () => {
  const busca = document.getElementById('agBuscaUsuario').value.trim().toLowerCase();
  (agEstado.usuarios || []).filter((u) => !busca || u.nome.toLowerCase().includes(busca)).forEach((u) => agEstado.selecionados.add(u.id));
  agRenderizarUsuarios();
});
document.getElementById('btnAgNinguem').addEventListener('click', () => { agEstado.selecionados.clear(); agRenderizarUsuarios(); });

agVerificarAvisos();
setInterval(agVerificarAvisos, 60 * 1000); // lembretes chegam em até 1 minuto


// ---------- Atalho do Nexofrete no computador do usuário ----------
// Baixa um instalador gerado pelo servidor (já com o endereço certo), que
// baixa o ícone do N e cria o atalho na área de trabalho deste computador.
// Só o administrador vê o botão (é ele quem instala o atalho nos computadores).
if (usuario.perfil !== 'admin') document.getElementById('btnInstalarAtalho')?.classList.add('oculto');
document.getElementById('btnInstalarAtalho')?.addEventListener('click', async () => {
  const ok = await confirmar(
    'Vou baixar um pequeno instalador. Depois de baixar:\n\n'
    + '1. Abra o arquivo "instalar-atalho-nexofrete.bat" (na barra de downloads do navegador).\n'
    + '2. Se o Windows avisar "O Windows protegeu o computador", clique em "Mais informações" e depois em "Executar assim mesmo".\n'
    + '3. Pronto: o atalho Nexofrete, com o ícone do N, aparece na área de trabalho.\n\n'
    + 'Se o navegador perguntar se quer manter o arquivo, escolha "Manter".',
    { tipo: 'info', titulo: 'Atalho neste computador', textoOk: 'Baixar instalador' }
  );
  if (!ok) return;
  const link = document.createElement('a');
  link.href = '/instalar-atalho-nexofrete.bat';
  link.download = '';
  document.body.appendChild(link);
  link.click();
  link.remove();
});


// ---------- Manutenção: pasta monitorada de XML ----------
async function carregarPastaXml() {
  try {
    const resposta = await apiFetch('/api/pasta-xml/configuracao');
    if (!resposta.ok) return;
    const c = await resposta.json();
    document.getElementById('pxAtivo').checked = !!c.ativo;
    document.getElementById('pxCaminho').value = c.caminho || '';
    document.getElementById('pxIntervalo').value = c.intervalo_minutos || 5;
    document.getElementById('pxMover').checked = c.mover_processados !== false;
    document.getElementById('statusPastaXml').textContent = c.ultima_execucao_em
      ? `Última conferência: ${formatoDataHora(c.ultima_execucao_em)} — ${c.ultima_mensagem || ''}`
      : 'Ainda não rodou.';
    const lista = c.ultimos || [];
    document.getElementById('ultimosPastaXml').innerHTML = lista.length ? `<table style="font-size:12px;">
      <thead><tr><th>Arquivo</th><th>Tipo</th><th>Resultado</th><th>Quando</th></tr></thead>
      <tbody>${lista.map((x) => `<tr>
        <td style="max-width:260px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${cfEsc(x.nome_arquivo)}">${cfEsc(x.nome_arquivo)}</td>
        <td>${cfEsc((x.tipo || '—').toUpperCase())}</td>
        <td style="color:${x.ok ? 'var(--verde)' : 'var(--vermelho)'};">${x.ok ? '✓ ' : '✕ '}${cfEsc(x.mensagem || '')}</td>
        <td style="white-space:nowrap;">${formatoDataHora(x.processado_em)}</td></tr>`).join('')}</tbody></table>` : '';
  } catch (err) { /* sem permissão ou sem conexão */ }
}
document.getElementById('btnSalvarPastaXml')?.addEventListener('click', async () => {
  try {
    const resposta = await apiFetch('/api/pasta-xml/configuracao', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ativo: document.getElementById('pxAtivo').checked,
        caminho: document.getElementById('pxCaminho').value.trim(),
        intervalo_minutos: Number(document.getElementById('pxIntervalo').value) || 5,
        mover_processados: document.getElementById('pxMover').checked,
      }),
    });
    const d = await resposta.json();
    if (!resposta.ok) { mostrarAlerta(d.erro || 'Erro ao salvar.'); return; }
    mostrarAlerta('Configuração da pasta de XML salva.', { tipo: 'sucesso' });
    carregarPastaXml();
  } catch (err) { mostrarAlerta('Falha de conexão com o servidor.'); }
});
document.getElementById('btnExecutarPastaXml')?.addEventListener('click', async () => {
  const botao = document.getElementById('btnExecutarPastaXml');
  botao.disabled = true;
  document.getElementById('statusPastaXml').textContent = 'Importando os XML da pasta…';
  try {
    const resposta = await apiFetch('/api/pasta-xml/executar', { method: 'POST' });
    const d = await resposta.json();
    mostrarAlerta(resposta.ok ? d.mensagem : (d.erro || 'Erro ao importar.'), { tipo: resposta.ok ? 'sucesso' : 'erro' });
  } catch (err) { mostrarAlerta('Falha de conexão com o servidor.'); }
  botao.disabled = false;
  carregarPastaXml();
});


// ---------- Manutenção: atualizar o sistema pela tela ----------
async function carregarVersaoSistema() {
  try {
    const d = await (await fetch('/api/status', { cache: 'no-store' })).json();
    document.getElementById('versaoAtualSistema').textContent = d.versao || '—';
    return d.versao;
  } catch (e) { return null; }
}
document.getElementById('btnAtualizarSistema')?.addEventListener('click', () => document.getElementById('inputAtualizacao').click());
document.getElementById('inputAtualizacao')?.addEventListener('change', async (e) => {
  const arquivo = e.target.files[0];
  e.target.value = '';
  if (!arquivo) return;
  const ok = await confirmar(
    `Instalar "${arquivo.name}"?\n\nAntes, o sistema faz um backup do banco. Durante a atualização (1 a 2 minutos) o sistema fica fora do ar para todos, e depois reinicia sozinho.`,
    { tipo: 'aviso', titulo: 'Atualizar o sistema?', textoOk: 'Atualizar agora' });
  if (!ok) return;
  const status = document.getElementById('statusAtualizacao');
  status.textContent = 'Enviando o arquivo e fazendo o backup…';
  const botao = document.getElementById('btnAtualizarSistema');
  botao.disabled = true;
  try {
    const formData = new FormData();
    formData.append('arquivo', arquivo);
    const resposta = await apiFetch('/api/manutencao/atualizar', { method: 'POST', body: formData });
    const d = await resposta.json();
    if (!resposta.ok) { mostrarAlerta(d.erro || 'A atualização não foi feita.'); status.textContent = ''; botao.disabled = false; return; }
    status.textContent = `Versão ${d.versaoNova} instalada (backup antes: ${d.seguranca}). Esperando o servidor reiniciar…`;
    // Espera o servidor voltar já com a versão nova e recarrega a tela.
    const inicio = Date.now();
    const esperar = async () => {
      const v = await carregarVersaoSistema();
      if (v === d.versaoNova) { location.reload(); return; }
      if (Date.now() - inicio > 180000) {
        status.textContent = 'O servidor não voltou sozinho. Feche a janela preta do servidor e abra o iniciar.bat de novo.';
        botao.disabled = false;
        return;
      }
      setTimeout(esperar, 2000);
    };
    setTimeout(esperar, 4000);
  } catch (err) {
    mostrarAlerta('Falha de conexão com o servidor.');
    botao.disabled = false;
  }
});


// ---------- Relatórios: custo de frete por cliente ----------
async function carregarCustoClientes() {
  let d;
  try {
    const resposta = await apiFetch(`/api/fretes/relatorios/custo-clientes?periodo=${document.getElementById('ccPeriodo').value}`);
    d = await resposta.json();
    if (!resposta.ok) throw new Error(d.erro);
  } catch (err) { return; }
  const c = d.clientes || [];
  const pct = (x) => (x.faturado > 0 ? (x.frete / x.faturado) * 100 : null);
  const fmtPct = (v) => (v == null ? '—' : `${v.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`);
  const top = c.slice(0, 15).filter((x) => pct(x) != null).sort((a, b) => pct(b) - pct(a));
  chamarGrafico(desenharBarras, 'graficoCustoClientes', top.map((x) => x.cliente), top.map((x) => Math.round(pct(x) * 100) / 100), null, true, 520, (v) => `${v.toLocaleString('pt-BR')}%`);
  document.getElementById('ccCorpo').innerHTML = c.length ? c.map((x, i) => `
    <tr>
      <td>${i + 1}</td><td>${cfEsc(x.cliente)}</td><td>${cfEsc(x.cif_fob || '—')}</td>
      <td class="n">${x.qtd_notas.toLocaleString('pt-BR')}</td>
      <td class="n">${formatoMoeda(x.faturado)}</td>
      <td class="n"><b>${formatoMoeda(x.frete)}</b></td>
      <td class="n" style="color:${pct(x) != null && pct(x) > 8 ? 'var(--vermelho)' : 'inherit'};">${fmtPct(pct(x))}</td>
      <td class="n">${x.qtd_reentregas || '—'}</td>
      <td class="n">${x.frete_reentrega ? formatoMoeda(x.frete_reentrega) : '—'}</td>
    </tr>`).join('') : '<tr><td colspan="9" style="color:var(--texto-fraco);">Sem fretes nesse período.</td></tr>';
}
document.getElementById('ccPeriodo')?.addEventListener('change', carregarCustoClientes);

// ---------- Relatórios: reentregas e devoluções ----------
async function carregarReentregas() {
  let d;
  try {
    const resposta = await apiFetch(`/api/fretes/relatorios/reentregas?periodo=${document.getElementById('rePeriodo').value}`);
    d = await resposta.json();
    if (!resposta.ok) throw new Error(d.erro);
  } catch (err) { return; }
  const r = d.resumo || {};
  const fmtPct = (v) => `${v.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;
  document.getElementById('reResumo').innerHTML = `
    <div>Reentregas / devoluções<strong>${(r.qtd_reentrega || 0).toLocaleString('pt-BR')} / ${(r.qtd_devolucao || 0).toLocaleString('pt-BR')}</strong></div>
    <div>Custo total<strong style="color:${r.valor > 0 ? 'var(--vermelho)' : 'inherit'};">${formatoMoeda(r.valor || 0)}</strong></div>
    <div>% sobre todo o frete<strong>${r.frete_total > 0 ? fmtPct((r.valor / r.frete_total) * 100) : '—'}</strong></div>
    <div>% sobre o CT-e original<strong>${r.valor_original > 0 ? fmtPct((r.valor / r.valor_original) * 100) : '—'} <small style="font-size:11px; color:var(--texto-fraco);">esperado 50%</small></strong></div>
    <div>Retidas (acima do esperado)<strong style="color:${r.retidas ? 'var(--vermelho)' : 'inherit'};">${r.retidas || 0}</strong></div>`;
  const t = d.por_transportadora || [];
  chamarGrafico(desenharBarras, 'graficoReTransp', t.map((x) => `${x.transportadora} (${x.qtd})`), t.map((x) => Math.round(x.valor * 100) / 100), null, true, 360, formatoMoeda);
  const c = d.por_cliente || [];
  chamarGrafico(desenharBarras, 'graficoReCliente', c.map((x) => `${x.cliente} (${x.qtd})`), c.map((x) => Math.round(x.valor * 100) / 100), null, true, 360, formatoMoeda);
}
document.getElementById('rePeriodo')?.addEventListener('change', carregarReentregas);


// ---------- Planilha do ERP aguardando o XML ----------
async function carregarAguardandoXml() {
  if (usuario.perfil !== 'admin') return;
  try {
    const resposta = await apiFetch('/api/importacao-erp/aguardando-xml');
    if (!resposta.ok) return;
    const d = await resposta.json();
    document.getElementById('painelAguardandoXml').classList.remove('oculto');
    document.getElementById('textoAguardandoXml').innerHTML =
      `📋 <b>${d.aguardando.toLocaleString('pt-BR')}</b> pedido(s) da planilha aguardando o XML da nota.`
      + (d.so_planilha ? `<br>⚠ Há <b>${d.so_planilha.toLocaleString('pt-BR')}</b> registro(s) antigo(s) na lista que vieram <b>só da planilha</b> (sem XML de NF-e nem CT-e e sem nada lançado).` : '');
    document.getElementById('btnDevolverAguardando').classList.toggle('oculto', !d.so_planilha);
  } catch (e) { /* ok */ }
}
document.getElementById('btnDevolverAguardando')?.addEventListener('click', async () => {
  const ok = await confirmar(
    'Os registros que vieram SÓ da planilha do ERP (sem XML de NF-e nem de CT-e, sem fatura, entrega, canhoto ou sinistro) saem da lista e ficam aguardando o XML da nota.\n\nNada se perde: quando a NF-e de cada um chegar, ele volta com os dados da planilha. Antes, faça um backup.',
    { tipo: 'aviso', titulo: 'Tirar da lista os registros só da planilha?', textoOk: 'Tirar da lista' });
  if (!ok) return;
  try {
    const resposta = await apiFetch('/api/importacao-erp/devolver-aguardando', { method: 'POST' });
    const d = await resposta.json();
    mostrarAlerta(resposta.ok ? d.mensagem : d.erro, { tipo: resposta.ok ? 'sucesso' : 'erro' });
    carregarAguardandoXml();
    carregarResumo();
  } catch (err) { mostrarAlerta('Falha de conexão com o servidor.'); }
});


// ---------- Relatório das tabelas de preço (imprimir / salvar em PDF) ----------
async function imprimirTabelasPreco(filtro = {}) {
  const params = new URLSearchParams();
  if (filtro.tabela_id) params.set('tabela_id', filtro.tabela_id);
  else {
    const transp = document.getElementById('filtroTransportadoraTabela').value;
    if (transp) params.set('transportadora_id', transp);
    const escolha = await abrirDialogo({
      tipo: 'pergunta', titulo: 'Imprimir tabelas de preço',
      mensagem: transp ? 'Imprimir as tabelas da transportadora escolhida no filtro.' : 'Imprimir as tabelas de TODAS as transportadoras (uma transportadora por página).',
      botoes: [
        { texto: 'Cancelar', valor: null, estilo: 'secundario' },
        { texto: 'Todas (inclusive inativas)', valor: 'todas', estilo: 'secundario' },
        { texto: 'Só as ativas', valor: 'ativas', estilo: 'primario' },
      ],
    });
    if (!escolha) return;
    if (escolha === 'ativas') params.set('apenas_ativas', '1');
  }
  let d;
  try {
    const resposta = await apiFetch(`/api/tabelas-preco/impressao?${params}`);
    d = await resposta.json();
    if (!resposta.ok) throw new Error(d.erro);
  } catch (err) { mostrarAlerta('Não foi possível montar o relatório das tabelas.'); return; }
  if (!d.tabelas.length) { mostrarAlerta('Nenhuma tabela de preço para imprimir com esse filtro.', { tipo: 'aviso' }); return; }

  const m = (v, casas = 2) => (v == null || v === '' ? '—' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas }));
  const pct = (v) => (v == null || v === '' ? '—' : `${Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 3 })}%`);
  const txt = (v) => (v == null || v === '' ? '—' : cfEsc(v));
  const vigencia = (t) => {
    if (!t.validade_meses || !t.criado_em) return '—';
    const fim = new Date(t.criado_em); fim.setMonth(fim.getMonth() + Number(t.validade_meses));
    return `${t.validade_meses} meses (até ${fim.toLocaleDateString('pt-BR')})`;
  };

  // Agrupa por transportadora (cada uma começa numa página nova).
  const grupos = [];
  d.tabelas.forEach((t) => {
    let g = grupos.find((x) => x.nome === t.transportadora_nome);
    if (!g) { g = { nome: t.transportadora_nome, cnpj: t.transportadora_cnpj, tel: t.transportadora_telefone, cidade: [t.transportadora_municipio, t.transportadora_uf].filter(Boolean).join('/'), tabelas: [] }; grupos.push(g); }
    g.tabelas.push(t);
  });

  const rs = (v) => (v == null || v === '' ? '—' : `R$ ${m(v)}`);
  const blocoTabela = (t) => {
    const taxas = [
      ['Ad Valorem', pct(t.ad_valorem_percentual)], ['GRIS', pct(t.gris_percentual)], ['GRIS mínimo', rs(t.gris_minimo)],
      ['Pedágio (100 kg)', rs(t.pedagio)], ['TDE', rs(t.tde)], ['TDA', rs(t.tda)], ['TRT', rs(t.trt)],
      ['Pallet', rs(t.valor_pallet)], ['Despacho / CT-e', rs(t.despacho_valor)], ['Cubagem', t.cubagem_kg_m3 ? `${m(t.cubagem_kg_m3, 0)} kg/m³` : '—'],
      ['Devolução', pct(t.devolucao_percentual)], ['Reentrega', pct(t.reentrega_percentual)],
    ];
    const linhas = t.faixas.map((f) => {
      const porPeso = f.modo_calculo === 'peso';
      // Cidades dessa praça, sempre separadas por vírgula.
      const cidades = String(f.cidades || '').split(/[,;\n]+/).map((c) => c.trim()).filter(Boolean)
        .sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' })).join(', ');
      return `<tr>
        <td>${txt(f.origem)}</td><td>${txt(f.destino)}</td><td>${txt(f.regiao)}</td><td>${txt(f.tipo_carga)}</td>
        <td>${porPeso ? 'Peso' : 'Volume'}</td>
        <td class="n"><b>${m(f.valor_por_kg, porPeso ? 4 : 2)}</b><small>${porPeso ? '/kg' : '/vol'}</small></td>
        <td class="n">${porPeso ? (f.peso_de != null ? `${m(f.peso_de, 0)} kg` : '—') : (f.volume_minimo ?? '—')}</td>
        <td class="n">${m(f.frete_minimo)}</td>
        <td class="n">${porPeso ? m(f.valor_kg_excedente, 4) : '—'}</td>
        <td class="n">${f.prazo_dias ?? '—'}</td>
        <td class="cidades">${cidades ? cfEsc(cidades) : '—'}</td>
      </tr>`;
    }).join('');
    return `
      <div class="tabela">
        <div class="t-topo">
          <div><h3>${cfEsc(t.nome)}</h3>
            <div class="sub">Destino: ${t.cidade_destino ? `${cfEsc(t.cidade_destino)}/${cfEsc(t.uf_destino || '')}` : cfEsc(t.uf_destino || 'Todos')} · Frete: ${txt(t.tipo_frete)} · Prazo padrão: ${t.prazo_dias ?? '—'} dia(s) · Vigência: ${vigencia(t)}</div></div>
          <span class="selo ${t.ativa ? 'ativa' : 'inativa'}">${t.ativa ? 'ATIVA' : 'INATIVA'}</span>
        </div>
        <div class="taxas">${taxas.map(([r, v]) => `<div><span>${r}</span><b>${v}</b></div>`).join('')}</div>
        ${t.seguradora || t.condicao_faturamento || t.indice_correcao ? `<div class="sub" style="margin:4px 0 6px;">${t.seguradora ? `Seguradora: ${cfEsc(t.seguradora)} · ` : ''}${t.condicao_faturamento ? `Faturamento: ${cfEsc(t.condicao_faturamento)} · ` : ''}${t.indice_correcao ? `Reajuste: ${cfEsc(t.indice_correcao)}` : ''}</div>` : ''}
        <table>
          <thead><tr><th>Origem</th><th>Destino</th><th>Região</th><th>Tipo de carga</th><th>Cálculo</th><th class="n">Valor R$</th><th class="n">Vol./peso mín.</th><th class="n">Frete mín. R$</th><th class="n">Kg exced. R$</th><th class="n">Prazo (dias)</th><th class="cidades">Cidades dessa praça</th></tr></thead>
          <tbody>${linhas || '<tr><td colspan="11">Sem trechos cadastrados.</td></tr>'}</tbody>
        </table>
        ${t.observacoes ? `<div class="obs"><b>Observações:</b> ${cfEsc(t.observacoes)}</div>` : ''}
      </div>`;
  };

  const emp = d.empresa;
  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Tabelas de preço${grupos.length === 1 ? ` - ${cfEsc(grupos[0].nome)}` : ''}</title>
<style>
  @page { size: A4 landscape; margin: 10mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 8.6pt; color: #111; margin: 0; }
  .transp { page-break-after: always; }
  .transp:last-child { page-break-after: auto; }
  .cab { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #1F4E78; padding-bottom: 6px; margin-bottom: 10px; }
  .cab h1 { font-size: 14pt; margin: 0; color: #1F4E78; }
  .cab h2 { font-size: 11.5pt; margin: 3px 0 0; }
  .sub { font-size: 8pt; color: #444; }
  .tabela { border: 1px solid #b7c3d4; border-radius: 4px; padding: 8px 10px; margin-bottom: 12px; page-break-inside: auto; }
  .t-topo { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 6px; }
  .t-topo h3 { margin: 0 0 2px; font-size: 10.5pt; }
  .selo { font-size: 7.5pt; font-weight: bold; padding: 2px 8px; border-radius: 10px; }
  .selo.ativa { background: #dff5e8; color: #1a7f3c; } .selo.inativa { background: #f4e0e0; color: #9b1c1c; }
  .taxas { display: grid; grid-template-columns: repeat(6, 1fr); gap: 3px 10px; margin: 4px 0 8px; background: #f3f6fa; padding: 6px 8px; border-radius: 3px; }
  .taxas div { display: flex; justify-content: space-between; font-size: 7.8pt; border-bottom: 1px dotted #c9d3e0; }
  .taxas span { color: #555; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #c9d3e0; padding: 2px 5px; vertical-align: top; }
  th { background: #1F4E78; color: #fff; font-size: 7.4pt; text-align: left; }
  td.n, th.n { text-align: right; white-space: nowrap; }
  td small { color: #666; margin-left: 2px; }
  th.cidades { width: 30%; }
  td.cidades { font-size: 7.4pt; color: #222; line-height: 1.3; }
  tr { page-break-inside: avoid; }
  .obs { margin-top: 5px; font-size: 7.8pt; }
  .rodape { margin-top: 6px; font-size: 7pt; color: #666; text-align: right; }
</style></head><body>
${grupos.map((g) => `
  <div class="transp">
    <div class="cab">
      <div>
        <h1>Tabela de preço de frete</h1>
        <h2>${cfEsc(g.nome)}</h2>
        <div class="sub">${g.cnpj ? `CNPJ ${cfEsc(formatarCnpj(g.cnpj))}` : ''}${g.tel ? ` · Tel. ${cfEsc(formatarTelefone(g.tel))}` : ''}${g.cidade ? ` · ${cfEsc(g.cidade)}` : ''}</div>
      </div>
      <div class="sub" style="text-align:right;">${logoImpressao(44) ? `<div style="display:flex; justify-content:flex-end; margin-bottom:4px;">${logoImpressao(44)}</div>` : ''}${emp ? `<b>${cfEsc(emp.razao_social || emp.nome_fantasia || '')}</b><br>` : ''}${g.tabelas.length} tabela(s) · emitido em ${new Date().toLocaleString('pt-BR')}</div>
    </div>
    ${g.tabelas.map(blocoTabela).join('')}
    <div class="rodape">Nexofrete — relatório de tabelas de preço</div>
  </div>`).join('')}
</body></html>`;

  const quadro = document.createElement('iframe');
  quadro.style.cssText = 'position:fixed; right:0; bottom:0; width:0; height:0; border:0;';
  document.body.appendChild(quadro);
  const doc = quadro.contentWindow.document;
  doc.open(); doc.write(html); doc.close();
  setTimeout(() => { quadro.contentWindow.focus(); quadro.contentWindow.print(); setTimeout(() => quadro.remove(), 1000); }, 300);
}
document.getElementById('btnImprimirTabelasPreco')?.addEventListener('click', () => imprimirTabelasPreco());


// ---------- Manutenção: limpeza das notas "Aguardando CT-e" ----------
const LIMPEZA_GRUPOS = [
  ['recentes', 'Aguardando de verdade', 'Notas CIF recentes: o CT-e ainda deve chegar. Nada a fazer.', null],
  ['fob', 'Frete FOB (pago pelo cliente)', 'O CT-e é cobrado do cliente e nunca vem para a empresa.', 'Marcar como "Não cobrado"'],
  ['sem_frete', 'NF-e sem frete', 'Retirada pelo cliente ou transporte próprio: não existe CT-e.', 'Marcar como "Não cobrado"'],
  ['so_planilha', 'Vieram só da planilha do ERP', 'Sem o XML da nota. Voltam sozinhos quando a NF-e for importada.', 'Tirar da lista'],
  ['antigas', 'Antigas sem CT-e', 'Histórico: o CT-e nunca foi importado (ou se perdeu).', 'Arquivar'],
];
async function analisarLimpeza() {
  const alvo = document.getElementById('limpezaResultado');
  const dias = document.getElementById('limpezaDias').value || 60;
  alvo.innerHTML = '<span style="color:var(--texto-fraco);">Analisando…</span>';
  try {
    const resposta = await apiFetch(`/api/manutencao/limpeza-aguardando?dias=${encodeURIComponent(dias)}`);
    const d = await resposta.json();
    if (!resposta.ok) { alvo.innerHTML = `<div class="cte-alerta-grande">${cfEsc(d.erro || 'Erro')}</div>`; return; }
    alvo.innerHTML = `
      <p style="margin:0 0 8px;"><strong>${d.total.toLocaleString('pt-BR')}</strong> nota(s) em "Aguardando CT-e":</p>
      <table style="width:100%; font-size:12.5px;"><tbody>
      ${LIMPEZA_GRUPOS.map(([k, nome, desc, acao]) => `<tr>
        <td style="padding:6px 4px;"><b>${nome}</b><br><small style="color:var(--texto-fraco);">${k === 'antigas' ? `Sem CT-e há mais de ${d.dias} dias. ` : ''}${desc}</small></td>
        <td style="text-align:right; font-size:15px; font-weight:700; padding:6px 10px;">${(d.grupos[k] || 0).toLocaleString('pt-BR')}</td>
        <td style="text-align:right;">${acao && d.grupos[k] ? `<button class="btn btn-secundario" style="width:auto; padding:5px 12px; font-size:12px;" onclick="executarLimpeza('${k}', ${d.grupos[k]}, '${acao.replace(/'/g, '')}')">${acao}</button>` : ''}</td>
      </tr>`).join('')}
      </tbody></table>
      ${d.antigas_por_mes.length ? `<details style="margin-top:10px;"><summary style="cursor:pointer; font-size:12.5px;">Antigas por mês e por transportadora (para conferir antes de arquivar)</summary>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:14px; margin-top:8px; font-size:12px;">
          <table><thead><tr><th style="text-align:left;">Mês da NF</th><th style="text-align:right;">Notas</th></tr></thead><tbody>
            ${d.antigas_por_mes.map((m) => `<tr><td>${m.mes}</td><td style="text-align:right;">${m.qtd.toLocaleString('pt-BR')}</td></tr>`).join('')}</tbody></table>
          <table><thead><tr><th style="text-align:left;">Transportadora (da NF-e)</th><th style="text-align:right;">Notas</th></tr></thead><tbody>
            ${d.antigas_por_transportadora.map((t) => `<tr><td>${cfEsc(t.transportadora)}</td><td style="text-align:right;">${t.qtd.toLocaleString('pt-BR')}</td></tr>`).join('')}</tbody></table>
        </div></details>` : ''}`;
  } catch (err) {
    alvo.innerHTML = '<div class="cte-alerta-grande">Falha de conexão com o servidor.</div>';
  }
}
async function executarLimpeza(grupo, qtd, acao) {
  const dias = document.getElementById('limpezaDias').value || 60;
  const ok = await confirmar(`${acao}: ${Number(qtd).toLocaleString('pt-BR')} nota(s). Nada é apagado — elas continuam em Todos os registros e voltam sozinhas se o CT-e chegar.`,
    { tipo: 'aviso', titulo: 'Confirmar limpeza?', textoOk: acao });
  if (!ok) return;
  try {
    const resposta = await apiFetch(`/api/manutencao/limpeza-aguardando/${grupo}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dias }),
    });
    const r = await resposta.json();
    mostrarAlerta(r.mensagem || r.erro || 'Feito.', { tipo: resposta.ok ? 'sucesso' : 'erro' });
    analisarLimpeza();
  } catch (err) {
    mostrarAlerta('Falha de conexão com o servidor.');
  }
}
document.getElementById('btnLimpezaAnalisar')?.addEventListener('click', analisarLimpeza);
document.getElementById('btnDesarquivar')?.addEventListener('click', async () => {
  const ok = await confirmar('Todas as notas arquivadas (sem CT-e) voltam para "Aguardando CT-e".', { tipo: 'aviso', titulo: 'Desfazer arquivamento?', textoOk: 'Desfazer' });
  if (!ok) return;
  const r = await (await apiFetch('/api/manutencao/desarquivar', { method: 'POST' })).json();
  mostrarAlerta(r.mensagem || r.erro, { tipo: r.ok ? 'sucesso' : 'erro' });
  analisarLimpeza();
});


// ---------- Devolução / troca de nota colada do e-mail ----------
const TR_CAMPOS = [['trNfOriginal', 'nf_original'], ['trNfSubstituta', 'nf_substituta'], ['trNfRetorno', 'nf_retorno'], ['trPedido', 'pedido'],
  ['trRepresentante', 'representante'], ['trCliente', 'cliente'], ['trMotivo', 'motivo'], ['trMovimentacao', 'movimentacao']];
let trCnpjCliente = null;
document.getElementById('btnLerEmailTroca')?.addEventListener('click', async () => {
  const texto = document.getElementById('emailTrocaTexto').value;
  const saida = document.getElementById('emailTrocaResultado');
  try {
    const resposta = await apiFetch('/api/trocas/ler', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ texto }) });
    const d = await resposta.json();
    if (!resposta.ok) { saida.innerHTML = `<span style="color:var(--vermelho);">${cfEsc(d.erro)}</span>`; return; }
    TR_CAMPOS.forEach(([id, campo]) => { document.getElementById(id).value = d[campo] || ''; });
    document.getElementById('trTipo').value = d.tipo || 'devolucao';
    document.getElementById('trComTransportador').checked = !!d.mercadoria_com_transportador;
    trCnpjCliente = d.cnpj_cliente || null;
    document.getElementById('emailTrocaConferencia').classList.remove('oculto');
    saida.innerHTML = d.completo
      ? '<span style="color:var(--verde);">E-mail lido. Confira os campos e clique em "Conferido — registrar".</span>'
      : '<span style="color:#e8890c;">Não achei a NF original no texto. Preencha à mão antes de registrar.</span>';
  } catch (err) { saida.textContent = 'Falha de conexão com o servidor.'; }
});
document.getElementById('btnRegistrarTroca')?.addEventListener('click', async () => {
  const corpo = { tipo: document.getElementById('trTipo').value, mercadoria_com_transportador: document.getElementById('trComTransportador').checked,
    cnpj_cliente: trCnpjCliente, texto: document.getElementById('emailTrocaTexto').value };
  TR_CAMPOS.forEach(([id, campo]) => { corpo[campo] = document.getElementById(id).value.trim(); });
  const saida = document.getElementById('emailTrocaResultado');
  try {
    const resposta = await apiFetch('/api/trocas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
    const r = await resposta.json();
    if (!resposta.ok) { saida.innerHTML = `<span style="color:var(--vermelho);">${cfEsc(r.erro)}</span>`; return; }
    saida.innerHTML = `<span style="color:var(--verde);">✓ Registrado.</span> ${cfEsc(r.mensagem)}`;
    document.getElementById('emailTrocaTexto').value = '';
    document.getElementById('emailTrocaConferencia').classList.add('oculto');
    carregarListaTrocas();
  } catch (err) { saida.textContent = 'Falha de conexão com o servidor.'; }
});
async function carregarListaTrocas() {
  const alvo = document.getElementById('emailTrocaLista');
  if (!alvo) return;
  try {
    const lista = await (await apiFetch('/api/trocas')).json();
    const ok = (v) => (v ? '✓' : '<span title="Ainda não está no sistema — aplica quando a nota for importada">⏳</span>');
    alvo.innerHTML = Array.isArray(lista) && lista.length ? `<table style="width:100%;"><thead><tr><th style="text-align:left;">Data</th><th style="text-align:left;">Tipo</th>
      <th style="text-align:left;">NF original</th><th style="text-align:left;">Substituta</th><th style="text-align:left;">Retorno</th><th style="text-align:left;">Cliente</th></tr></thead><tbody>
      ${lista.map((t) => `<tr><td>${new Date(t.criado_em).toLocaleDateString('pt-BR')}</td><td>${t.tipo === 'troca' ? 'Troca' : t.tipo === 'retorno' ? 'Retorno de remessa' : 'Devolução'}</td>
        <td>${cfEsc(t.nf_original)} ${ok(t.aplicado_original)}</td><td>${t.nf_substituta ? `${cfEsc(t.nf_substituta)} ${ok(t.aplicado_substituta)}` : '—'}</td>
        <td>${t.nf_retorno ? `${cfEsc(t.nf_retorno)} ${ok(t.aplicado_retorno)}` : '—'}</td><td>${cfEsc(t.cliente || '—')}</td></tr>`).join('')}</tbody></table>`
      : '<span style="color:var(--texto-fraco);">Nenhuma ainda.</span>';
  } catch (err) { /* segue */ }
}
document.querySelector('#emailTrocaLista')?.closest('details')?.addEventListener('toggle', (e) => { if (e.target.open) carregarListaTrocas(); });


// ---------- Manutenção: leitura automática de e-mail (várias caixas) ----------
let emEditandoId = null;
async function carregarContasEmail() {
  const alvo = document.getElementById('emListaContas');
  if (!alvo) return;
  try {
    const resposta = await apiFetch('/api/manutencao/email/contas');
    if (!resposta.ok) return;
    const contas = await resposta.json();
    window.__emContas = contas;
    alvo.innerHTML = contas.length ? `<table style="width:100%;"><thead><tr><th style="text-align:left;">Caixa</th><th style="text-align:left;">Pasta</th>
      <th style="text-align:left;">Remetentes</th><th style="text-align:left;">Última leitura</th><th></th></tr></thead><tbody>
      ${contas.map((c) => `<tr style="${c.ativo ? '' : 'opacity:0.55;'}">
        <td><b>${cfEsc(c.nome || c.usuario || '—')}</b><br><small style="color:var(--texto-fraco);">${cfEsc(c.usuario || '')}${c.ativo ? '' : ' · desligada'}</small></td>
        <td>${cfEsc(c.pasta || '—')}</td>
        <td><small>${cfEsc(c.remetentes || 'todos')}</small></td>
        <td><small>${c.ultima_execucao ? new Date(c.ultima_execucao).toLocaleString('pt-BR') : '—'}<br>
          ${c.ultimo_erro ? `<span style="color:var(--vermelho);">⚠ ${cfEsc(c.ultimo_erro)}</span>` : cfEsc(c.ultimo_resultado || '')}</small></td>
        <td style="white-space:nowrap; text-align:right;">
          <button class="btn btn-secundario" style="width:auto; padding:4px 9px; font-size:11.5px;" onclick="emEditar(${c.id})">Editar</button>
          <button class="btn btn-secundario" style="width:auto; padding:4px 9px; font-size:11.5px;" onclick="emTestar(${c.id}, this)">🔌 Testar</button>
          <button class="btn btn-secundario" style="width:auto; padding:4px 9px; font-size:11.5px;" onclick="emLer(${c.id}, this)">📥 Ler</button>
          <button class="btn btn-secundario" style="width:auto; padding:4px 9px; font-size:11.5px; color:var(--vermelho);" onclick="emExcluir(${c.id})">✕</button>
        </td></tr>`).join('')}</tbody></table>`
      : '<span style="color:var(--texto-fraco);">Nenhuma caixa cadastrada ainda.</span>';
  } catch (err) { /* segue */ }
}
function emAbrirForm(c) {
  emEditandoId = c?.id || null;
  document.getElementById('emNome').value = c?.nome || '';
  document.getElementById('emServidor').value = c?.servidor || 'mail.imporiente.com.br';
  document.getElementById('emPorta').value = c?.porta || 993;
  document.getElementById('emUsuario').value = c?.usuario || '';
  document.getElementById('emSenha').value = '';
  document.getElementById('emSenhaInfo').textContent = c?.tem_senha ? '✓ Senha cadastrada (deixe em branco para manter).' : '';
  document.getElementById('emPasta').value = c?.pasta || '';
  document.getElementById('emIntervalo').value = c?.intervalo_minutos || 15;
  document.getElementById('emRemetentes').value = c?.remetentes || '';
  document.getElementById('emAtivo').checked = c ? !!c.ativo : true;
  document.getElementById('emFormConta').classList.remove('oculto');
}
function emEditar(id) { emAbrirForm((window.__emContas || []).find((c) => c.id === id)); }
async function emTestar(id, botao) {
  botao.disabled = true;
  try {
    const r = await (await apiFetch(`/api/manutencao/email/contas/${id}/testar`, { method: 'POST' })).json();
    if (!r.ok) { mostrarAlerta(`Não conectou: ${r.erro}`, { tipo: 'aviso', titulo: 'Não conectou' }); return; }
    document.getElementById('emPastasLista').innerHTML = r.pastas.map((p) => `<option value="${cfEsc(p)}"></option>`).join('');
    mostrarAlerta(`Conectou. ${r.pastaExiste ? 'A pasta configurada existe.' : 'A pasta configurada NÃO existe — edite a caixa e escolha uma destas.'} Pastas: ${r.pastas.join(', ')}`,
      { tipo: r.pastaExiste ? 'sucesso' : 'aviso', titulo: 'Conectado' });
  } catch (err) { mostrarAlerta('Falha de conexão com o servidor.'); } finally { botao.disabled = false; }
}
async function emLer(id, botao) {
  if (botao) botao.disabled = true;
  try {
    const url = id ? `/api/manutencao/email/contas/${id}/ler` : '/api/manutencao/email/ler-todas';
    const r = await (await apiFetch(url, { method: 'POST' })).json();
    mostrarAlerta(r.mensagem || r.erro || 'Feito.', { tipo: r.ok ? 'sucesso' : 'aviso' });
    carregarContasEmail();
  } catch (err) { mostrarAlerta('Falha de conexão com o servidor.'); } finally { if (botao) botao.disabled = false; }
}
async function emExcluir(id) {
  const ok = await confirmar('A caixa sai da lista e deixa de ser lida. As devoluções já registradas continuam.', { tipo: 'aviso', titulo: 'Excluir caixa de e-mail?', textoOk: 'Excluir' });
  if (!ok) return;
  await apiFetch(`/api/manutencao/email/contas/${id}`, { method: 'DELETE' });
  carregarContasEmail();
}
document.getElementById('btnEmNova')?.addEventListener('click', () => emAbrirForm(null));
document.getElementById('btnEmCancelar')?.addEventListener('click', () => document.getElementById('emFormConta').classList.add('oculto'));
document.getElementById('btnEmLerTodas')?.addEventListener('click', (e) => emLer(null, e.currentTarget));
document.getElementById('btnEmSalvar')?.addEventListener('click', async () => {
  const corpo = {
    nome: document.getElementById('emNome').value, servidor: document.getElementById('emServidor').value,
    porta: document.getElementById('emPorta').value, usuario: document.getElementById('emUsuario').value,
    senha: document.getElementById('emSenha').value, pasta: document.getElementById('emPasta').value,
    intervalo_minutos: document.getElementById('emIntervalo').value, remetentes: document.getElementById('emRemetentes').value,
    ativo: document.getElementById('emAtivo').checked,
  };
  const url = emEditandoId ? `/api/manutencao/email/contas/${emEditandoId}` : '/api/manutencao/email/contas';
  const resposta = await apiFetch(url, { method: emEditandoId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
  const r = await resposta.json();
  if (!resposta.ok) { mostrarAlerta(r.erro || 'Erro ao salvar.'); return; }
  document.getElementById('emFormConta').classList.add('oculto');
  mostrarAlerta('Caixa de e-mail salva. Use "🔌 Testar" na lista para ver as pastas e confirmar a conexão.', { tipo: 'sucesso' });
  carregarContasEmail();
});
carregarContasEmail();


// ---------- Cadastros: clientes (montados pelo XML da NF-e) ----------
const clEstado = { pagina: 1, total: 0, lista: [], editandoId: null };
const CL_CAMPOS = [['clRazaoSocial', 'razao_social'], ['clNomeFantasia', 'nome_fantasia'], ['clIe', 'ie'], ['clIndIe', 'ind_ie'],
  ['clTelefone', 'telefone'], ['clEmail', 'email'], ['clLogradouro', 'logradouro'], ['clNumero', 'numero'], ['clComplemento', 'complemento'],
  ['clBairro', 'bairro'], ['clMunicipio', 'municipio'], ['clUf', 'uf'], ['clCep', 'cep'], ['clObservacoes', 'observacoes']];
const clDoc = (d) => { const x = String(d || ''); return x.length === 14 ? formatarCnpj(x) : x.length === 11 ? x.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : x || '—'; };
const clIe = (c) => (c.ie ? cfEsc(c.ie) : c.ind_ie === '2' ? 'ISENTO' : c.ind_ie === '9' ? '<span style="color:var(--texto-fraco);">não contribuinte</span>' : '—');
let clTimerBusca = null;
async function carregarClientes(pagina = clEstado.pagina) {
  const corpo = document.getElementById('corpoClientes');
  if (!corpo) return;
  const q = document.getElementById('buscaClientes').value.trim();
  try {
    const resposta = await apiFetch(`/api/clientes?pagina=${pagina}&q=${encodeURIComponent(q)}`);
    const d = await resposta.json();
    if (!resposta.ok) { corpo.innerHTML = `<tr><td colspan="8">${cfEsc(d.erro || 'Erro')}</td></tr>`; return; }
    Object.assign(clEstado, { pagina: d.pagina, total: d.total, lista: d.clientes });
    const paginas = Math.max(1, Math.ceil(d.total / 100));
    document.getElementById('clientesResumo').textContent = `${d.total.toLocaleString('pt-BR')} cliente(s)${q ? ` com "${q}"` : ''}.`;
    document.getElementById('clientesPagina').textContent = `Página ${d.pagina} de ${paginas}`;
    document.getElementById('btnClientesAnterior').disabled = d.pagina <= 1;
    document.getElementById('btnClientesProxima').disabled = d.pagina >= paginas;
    corpo.innerHTML = d.clientes.length ? d.clientes.map((c) => `
      <tr style="cursor:pointer;" onclick="abrirCliente(${c.id})">
        <td><b>${cfEsc(c.razao_social || '—')}</b>${c.nome_fantasia ? `<br><small style="color:var(--texto-fraco);">${cfEsc(c.nome_fantasia)}</small>` : ''}${c.editado_manual ? ' <small title="Corrigido à mão">✎</small>' : ''}</td>
        <td style="white-space:nowrap;">${clDoc(c.documento)}</td>
        <td>${clIe(c)}</td>
        <td>${cfEsc(c.municipio || '—')}${c.uf ? `/${cfEsc(c.uf)}` : ''}</td>
        <td style="white-space:nowrap;">${c.telefone ? cfEsc(formatarTelefone(c.telefone)) : '—'}</td>
        <td>${cfEsc(c.email || '—')}</td>
        <td style="text-align:right;">${c.qtd_notas}</td>
        <td style="white-space:nowrap;">${c.ultima_nf ? `${cfEsc(c.ultima_nf)}<br><small style="color:var(--texto-fraco);">${formatoData(c.ultima_nf_em)}</small>` : '—'}</td>
      </tr>`).join('') : `<tr><td colspan="8" style="color:var(--texto-fraco); padding:14px;">${q ? 'Nenhum cliente com essa busca.' : 'Nenhum cliente ainda — eles são cadastrados sozinhos quando as NF-e são importadas (e, ao ligar o servidor, a partir das notas que já estão no sistema).'}</td></tr>`;
  } catch (err) { corpo.innerHTML = '<tr><td colspan="8">Falha de conexão com o servidor.</td></tr>'; }
}
async function abrirCliente(id) {
  try {
    const resposta = await apiFetch(`/api/clientes/${id}`);
    const c = await resposta.json();
    if (!resposta.ok) { mostrarAlerta(c.erro || 'Erro ao abrir o cliente.'); return; }
    clEstado.editandoId = id;
    document.getElementById('tituloFormCliente').textContent = c.razao_social || 'Cliente';
    document.getElementById('clDocumento').value = clDoc(c.documento);
    CL_CAMPOS.forEach(([el, campo]) => { document.getElementById(el).value = c[campo] ?? ''; });
    const r = c.resumo || {};
    document.getElementById('clienteResumoFretes').innerHTML = `${r.notas || 0} nota(s) no sistema · frete cobrado ${formatoMoeda(r.frete_total)} · faturado ${formatoMoeda(r.faturado_total)}`
      + `${r.faturado_total ? ` · ${(100 * r.frete_total / r.faturado_total).toFixed(2).replace('.', ',')}% de frete` : ''}`
      + `${c.primeira_nf_em ? ` · cliente desde ${formatoData(c.primeira_nf_em)}` : ''}${c.editado_manual ? ' · ✎ corrigido à mão' : ''}`;
    const painel = document.getElementById('painelFormCliente');
    painel.classList.remove('oculto');
    painel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (err) { mostrarAlerta('Falha de conexão com o servidor.'); }
}
document.getElementById('btnSalvarCliente')?.addEventListener('click', async () => {
  const corpo = {};
  CL_CAMPOS.forEach(([el, campo]) => { corpo[campo] = document.getElementById(el).value.trim(); });
  const resposta = await apiFetch(`/api/clientes/${clEstado.editandoId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
  const r = await resposta.json();
  if (!resposta.ok) { mostrarAlerta(r.erro || 'Erro ao salvar.'); return; }
  mostrarAlerta('Cliente salvo. As próximas notas não vão desfazer essa correção.', { tipo: 'sucesso' });
  document.getElementById('painelFormCliente').classList.add('oculto');
  carregarClientes();
});
document.getElementById('btnCancelarCliente')?.addEventListener('click', () => document.getElementById('painelFormCliente').classList.add('oculto'));
document.getElementById('buscaClientes')?.addEventListener('input', () => { clearTimeout(clTimerBusca); clTimerBusca = setTimeout(() => carregarClientes(1), 350); });
document.getElementById('btnClientesAnterior')?.addEventListener('click', () => carregarClientes(clEstado.pagina - 1));
document.getElementById('btnClientesProxima')?.addEventListener('click', () => carregarClientes(clEstado.pagina + 1));
document.getElementById('btnExportarClientes')?.addEventListener('click', async () => {
  // Exporta todos os clientes da busca atual (percorre as páginas).
  const q = document.getElementById('buscaClientes').value.trim();
  const todos = [];
  for (let p = 1; p <= 200; p++) {
    const d = await (await apiFetch(`/api/clientes?pagina=${p}&q=${encodeURIComponent(q)}`)).json();
    todos.push(...(d.clientes || []));
    if (!d.clientes || todos.length >= d.total) break;
  }
  const cab = ['Razão social', 'Nome fantasia', 'CNPJ/CPF', 'Inscrição estadual', 'Contribuinte', 'Telefone', 'E-mail', 'Endereço', 'Número', 'Complemento', 'Bairro', 'Cidade', 'UF', 'CEP', 'Notas', 'Última NF', 'Data da última NF'];
  const ind = { 1: 'Contribuinte', 2: 'Isento', 9: 'Não contribuinte' };
  const linhas = todos.map((c) => [c.razao_social, c.nome_fantasia, clDoc(c.documento), c.ie, ind[c.ind_ie] || '', c.telefone, c.email, c.logradouro, c.numero, c.complemento, c.bairro, c.municipio, c.uf, c.cep, c.qtd_notas, c.ultima_nf, c.ultima_nf_em ? formatoData(c.ultima_nf_em) : '']);
  const csv = [cab, ...linhas].map((l) => l.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }));
  link.download = `clientes_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link); link.click(); link.remove();
});


// ---------- Manutenção: HTTPS ----------
async function carregarHttps() {
  const alvo = document.getElementById('httpsStatus');
  if (!alvo) return;
  try {
    const resposta = await apiFetch('/api/seguranca/https');
    if (!resposta.ok) return;
    const h = await resposta.json();
    document.getElementById('httpsAtivo').checked = !!h.configurado;
    document.getElementById('httpsPorta').value = h.porta || 3443;
    const endereco = `https://${location.hostname}:${h.porta || 3443}`;
    alvo.innerHTML = h.ativo
      ? `<span style="color:var(--verde);">✓ HTTPS ligado:</span> <a href="${endereco}">${endereco}</a>${h.validade ? ` · certificado válido até ${new Date(h.validade).toLocaleDateString('pt-BR')}` : ''}`
        + `${location.protocol === 'https:' ? ' · 🔒 você está usando o HTTPS agora.' : ''}`
      : (h.erro ? `<span style="color:var(--vermelho);">⚠ Não ligou: ${cfEsc(h.erro)}</span>` : '<span style="color:var(--texto-fraco);">HTTPS desligado.</span>');
    if (h.impressaoDigital) {
      alvo.innerHTML += `<div style="margin-top:8px; padding:8px 10px; background:var(--bg-elevado); border-radius:var(--raio);">
        🔎 <b>Impressão digital do certificado da empresa:</b> <code style="font-size:13px;">${cfEsc(String(h.impressaoDigital).slice(0, 23))}</code>
        <small style="display:block; color:var(--texto-fraco); margin-top:3px;">O instalador mostra esse mesmo código e confere sozinho o código inteiro. Se aparecer diferente num computador, não instale — avise o responsável.
        Certificado limitado ao servidor e à rede interna (não vale para sites da internet).</small></div>`;
    }
  } catch (err) { /* segue */ }
}
document.getElementById('btnSalvarHttps')?.addEventListener('click', async () => {
  const ativo = document.getElementById('httpsAtivo').checked;
  if (ativo) {
    const ok = await confirmar('Todos os computadores já instalaram o certificado da empresa? Os que ainda não instalaram vão ver um alerta de segurança ao abrir o sistema.',
      { tipo: 'aviso', titulo: 'Ligar o HTTPS?', textoOk: 'Ligar' });
    if (!ok) return;
  }
  const resposta = await apiFetch('/api/seguranca/https', { method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ativo, porta: document.getElementById('httpsPorta').value }) });
  const r = await resposta.json();
  if (!resposta.ok || r.erro) mostrarAlerta(r.erro || 'Erro ao salvar.', { tipo: 'aviso' });
  else mostrarAlerta(ativo ? 'HTTPS ligado. A partir de agora, quem abrir o sistema pelo http:// vai para o https://.' : 'HTTPS desligado.', { tipo: 'sucesso' });
  carregarHttps();
});
carregarHttps();


// ---------- Todos os registros: selecionar e excluir em lote (só a página atual) ----------
function regSelecionados() { return [...document.querySelectorAll('#tabelaCompleta .sel-registro:checked')].map((c) => Number(c.dataset.id)); }
function regAtualizarSelecao() {
  const marcados = regSelecionados().length;
  const total = document.querySelectorAll('#tabelaCompleta .sel-registro').length;
  const todos = document.getElementById('selTodosRegistros');
  if (todos) { todos.checked = total > 0 && marcados === total; todos.indeterminate = marcados > 0 && marcados < total; }
  const botao = document.getElementById('btnExcluirSelecionados');
  if (botao) { botao.classList.toggle('oculto', !marcados); botao.textContent = `🗑 Excluir selecionados (${marcados})`; }
}
if (podeExcluir) document.getElementById('selTodosRegistros')?.classList.remove('oculto');
document.getElementById('selTodosRegistros')?.addEventListener('change', (e) => {
  document.querySelectorAll('#tabelaCompleta .sel-registro').forEach((c) => { c.checked = e.target.checked; });
  regAtualizarSelecao();
});
document.querySelector('#tabelaCompleta tbody')?.addEventListener('change', (e) => { if (e.target.classList.contains('sel-registro')) regAtualizarSelecao(); });
// Clique na caixinha não conta como "duplo clique" na linha.
document.querySelector('#tabelaCompleta tbody')?.addEventListener('dblclick', (e) => { if (e.target.classList?.contains('sel-registro')) e.stopPropagation(); }, true);
// A tabela foi redesenhada (outra página, busca, filtro): começa sem nada marcado.
new MutationObserver(() => regAtualizarSelecao()).observe(document.querySelector('#tabelaCompleta tbody'), { childList: true });
document.getElementById('btnExcluirSelecionados')?.addEventListener('click', async () => {
  const ids = regSelecionados();
  if (!ids.length) return;
  const texto = await pedirTexto(`Excluir ${ids.length} registro(s) desta página? Isso é permanente. Fretes já faturados e CT-e cancelados são pulados.\n\nPara confirmar, digite EXCLUIR:`,
    { tipo: 'perigo', titulo: `Excluir ${ids.length} registro(s)?`, placeholder: 'EXCLUIR', textoOk: 'Excluir' });
  if (texto == null) return;
  if (String(texto).trim().toUpperCase() !== 'EXCLUIR') { mostrarAlerta('Exclusão cancelada: o texto digitado não foi EXCLUIR.', { tipo: 'aviso' }); return; }
  try {
    const resposta = await apiFetch('/api/fretes/excluir-lote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }) });
    const r = await resposta.json();
    if (!resposta.ok) { mostrarAlerta(r.erro || 'Erro ao excluir.'); return; }
    const p = r.pulados || {};
    const pulos = [p.faturado ? `${p.faturado} faturado(s)` : '', p.cteCancelado ? `${p.cteCancelado} com CT-e cancelado` : '', p.semAcesso ? `${p.semAcesso} sem acesso` : '', p.naoEncontrado ? `${p.naoEncontrado} não encontrado(s)` : ''].filter(Boolean);
    mostrarAlerta(`${r.excluidos} registro(s) excluído(s).${pulos.length ? ` Pulados: ${pulos.join(', ')}.` : ''}`, { tipo: pulos.length ? 'aviso' : 'sucesso' });
    if (typeof carregarRegistros === 'function') carregarRegistros();
  } catch (err) { mostrarAlerta('Falha de conexão com o servidor.'); }
});


// ---------- Relatório: notas sem mapa de carregamento ----------
const SM_SITUACAO = {
  sem_mapa: { txt: 'Sem mapa', cor: '#f59e0b' },
  retira: { txt: '🧾 Frete por conta do cliente — cobrar retirada', cor: '#8b5cf6' },
  cte: { txt: 'CT-e emitido e sem mapa', cor: '#ef4444' },
};
let smDados = null;
let smTimer = null;
async function carregarSemMapa() {
  const corpo = document.getElementById('smCorpo');
  if (!corpo) return;
  const desdeEl = document.getElementById('smDesde');
  if (!desdeEl.value) desdeEl.value = dataParaBr(new Date(Date.now() - 60 * 86400000));
  const params = new URLSearchParams({ desde: dataBrParaIso(desdeEl.value) || '', ate: dataBrParaIso(document.getElementById('smAte').value) || '',
    situacao: document.getElementById('smSituacao').value, busca: document.getElementById('smBusca').value.trim() });
  if (document.getElementById('smDias').dataset.mexido) params.set('dias', document.getElementById('smDias').value);
  corpo.innerHTML = '<tr><td colspan="12" style="color:var(--texto-fraco); padding:14px;">Carregando…</td></tr>';
  try {
    const resposta = await apiFetch(`/api/fretes/relatorios/sem-mapa?${params}`);
    const d = await resposta.json();
    if (!resposta.ok) { corpo.innerHTML = `<tr><td colspan="12">${cfEsc(d.erro || 'Erro')}</td></tr>`; return; }
    smDados = d;
    if (!document.getElementById('smDias').dataset.mexido) document.getElementById('smDias').value = d.diasConfig;
    const r = d.resumo;
    document.getElementById('smResumo').innerHTML = `
      <div>Notas paradas<strong>${r.total}</strong>${r.volumes.toLocaleString('pt-BR')} volume(s)</div>
      <div style="border-left-color:${SM_SITUACAO.sem_mapa.cor};">Sem mapa<strong>${r.sem_mapa}</strong></div>
      <div style="border-left-color:${SM_SITUACAO.retira.cor};">Frete por conta do cliente<strong>${r.retira}</strong></div>
      <div style="border-left-color:${SM_SITUACAO.cte.cor};">CT-e emitido e sem mapa<strong>${r.cte}</strong></div>`;
    corpo.innerHTML = d.notas.length ? d.notas.map((n) => {
      const sit = SM_SITUACAO[n.situacao] || SM_SITUACAO.sem_mapa;
      return `<tr>
        <td><b>${cfEsc(n.numero_nf || '—')}</b></td>
        <td style="white-space:nowrap;">${formatoData(n.data_emissao_nf)}</td>
        <td style="text-align:right;"><span class="ep-selo atraso">${n.dias_parada} dia(s)</span></td>
        <td><span style="color:${sit.cor}; font-weight:600; font-size:12px;">${sit.txt}</span></td>
        <td>${cfEsc(n.numero_pedido || '—')}</td>
        <td>${cfEsc(n.cliente || '—')}</td>
        <td style="text-align:right;">${n.qtd_volumes ?? '—'}</td>
        <td>${cfEsc(n.numero_mapa || '—')}</td>
        <td>${cfEsc(n.mapa_descricao || '—')}</td>
        <td style="white-space:nowrap;">${n.mapa_data_referencia ? formatoData(n.mapa_data_referencia) : '—'}</td>
        <td>${cfEsc(n.mapa_ajudante || '—')}</td>
        <td>${n.numero_cte ? `CT-e ${cfEsc(n.numero_cte)}<br><small style="color:var(--texto-fraco);">${cfEsc(n.transportadora || '')}</small>` : '—'}</td>
      </tr>`;
    }).join('') : `<tr><td colspan="12" style="color:var(--verde); padding:14px;">✓ Nenhuma nota parada há mais de ${d.dias} dia(s) sem mapa de carregamento neste período.</td></tr>`;
  } catch (err) {
    corpo.innerHTML = '<tr><td colspan="12">Falha de conexão com o servidor.</td></tr>';
  }
}
['smSituacao', 'smDesde', 'smAte'].forEach((id) => document.getElementById(id)?.addEventListener('change', carregarSemMapa));
document.getElementById('smBusca')?.addEventListener('input', () => { clearTimeout(smTimer); smTimer = setTimeout(carregarSemMapa, 350); });
document.getElementById('smDias')?.addEventListener('change', (e) => { e.target.dataset.mexido = '1'; carregarSemMapa(); });
document.getElementById('btnSmSalvarDias')?.addEventListener('click', async () => {
  const dias = document.getElementById('smDias').value;
  const resposta = await apiFetch('/api/fretes/relatorios/sem-mapa/config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dias }) });
  const r = await resposta.json();
  if (!resposta.ok) { mostrarAlerta(r.erro || 'Erro ao salvar.'); return; }
  delete document.getElementById('smDias').dataset.mexido;
  mostrarAlerta(`Prazo salvo: o alerta (sino e Visão geral) avisa das notas sem mapa há mais de ${r.dias} dia(s).`, { tipo: 'sucesso' });
  carregarSemMapa();
});
function smLinhasExportacao() {
  const cab = ['Nr. nota', 'Emissão', 'Dias parada', 'Situação', 'Nr. pedido', 'Cliente', 'Volumes', 'Nr. mapa', 'Ds. mapa', 'Dt. referência', '1º ajudante', 'CT-e', 'Transportadora'];
  const linhas = (smDados?.notas || []).map((n) => [n.numero_nf, formatoData(n.data_emissao_nf), n.dias_parada, (SM_SITUACAO[n.situacao] || {}).txt, n.numero_pedido,
    n.cliente, n.qtd_volumes, n.numero_mapa, n.mapa_descricao, n.mapa_data_referencia ? formatoData(n.mapa_data_referencia) : '', n.mapa_ajudante, n.numero_cte, n.numero_cte ? n.transportadora : '']);
  return { cab, linhas };
}
document.getElementById('btnSmExcel')?.addEventListener('click', () => {
  if (!smDados?.notas?.length) { mostrarAlerta('Nada para exportar com esses filtros.', { tipo: 'info' }); return; }
  const { cab, linhas } = smLinhasExportacao();
  const csv = [cab, ...linhas].map((l) => l.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }));
  link.download = `notas-sem-mapa_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link); link.click(); link.remove();
});
document.getElementById('btnSmPdf')?.addEventListener('click', () => {
  if (!smDados?.notas?.length) { mostrarAlerta('Nada para imprimir com esses filtros.', { tipo: 'info' }); return; }
  const { cab, linhas } = smLinhasExportacao();
  const r = smDados.resumo;
  const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Notas sem mapa de carregamento</title><style>
    @page { size: A4 landscape; margin: 10mm; } body { font-family: Arial, sans-serif; font-size: 9.5px; color: #111; }
    h1 { font-size: 15px; margin: 0 0 2px; } .sub { color: #555; margin-bottom: 8px; }
    table { width: 100%; border-collapse: collapse; } th { color: #000; text-align: left; padding: 4px; border-top: 1.5px solid #000; border-bottom: 1.5px solid #000; text-transform: uppercase; font-size: 9px; }
    td { border-bottom: 1px solid #bbb; padding: 3px 4px; vertical-align: top; color: #000; } tr:nth-child(even) td { background: #f1f1f1; }
    * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .cab { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #000; padding-bottom: 6px; margin-bottom: 8px; }</style></head><body>
    <div class="cab"><div><h1>Notas sem mapa de carregamento</h1></div>${logoImpressao(44)}</div>
    <div class="sub">Emitidas de ${esc(document.getElementById('smDesde').value || '—')} até ${esc(document.getElementById('smAte').value || 'hoje')} · Paradas há mais de ${smDados.dias} dia(s) após a emissão · ${r.total} nota(s), ${r.volumes} volume(s) · sem mapa: ${r.sem_mapa} · cliente retira: ${r.retira} · CT-e sem mapa: ${r.cte} · emitido em ${new Date().toLocaleString('pt-BR')}</div>
    <table><thead><tr>${cab.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead>
    <tbody>${linhas.map((l) => `<tr>${l.map((v) => `<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></body></html>`;
  const quadro = document.createElement('iframe');
  quadro.style.cssText = 'position:fixed; width:0; height:0; border:0; right:0; bottom:0;';
  document.body.appendChild(quadro);
  quadro.contentDocument.open(); quadro.contentDocument.write(html); quadro.contentDocument.close();
  setTimeout(() => { quadro.contentWindow.focus(); quadro.contentWindow.print(); setTimeout(() => quadro.remove(), 1500); }, 300);
});


// ---------- Sobre o sistema: proposta, versão e novidades ----------
const chaveSobreVisto = () => `nexofrete_sobre_visto_${usuario?.id || 'x'}`;
let sobreDados = null;
async function carregarSobre() {
  try {
    const resposta = await apiFetch('/api/sobre');
    if (!resposta.ok) return null;
    sobreDados = await resposta.json();
    let visto = null;
    try { visto = localStorage.getItem(chaveSobreVisto()); } catch (e) { /* segue */ }
    document.getElementById('seloNovoSobre')?.classList.toggle('oculto', visto === sobreDados.versao);
    return sobreDados;
  } catch (err) { return null; }
}
async function abrirSobre() {
  const d = sobreDados || await carregarSobre();
  if (!d) { mostrarAlerta('Não foi possível carregar as informações do sistema.'); return; }
  try { localStorage.setItem(chaveSobreVisto(), d.versao); } catch (e) { /* segue */ }
  document.getElementById('seloNovoSobre')?.classList.add('oculto');
  const porArea = (itens) => {
    const grupos = {};
    (itens || []).forEach((i) => { (grupos[i.area || 'Geral'] = grupos[i.area || 'Geral'] || []).push(i.texto); });
    return Object.entries(grupos).map(([area, textos]) => `<div style="margin:8px 0 4px; font-weight:700; font-size:12.5px; color:var(--azul);">${cfEsc(area)}</div>
      <ul style="margin:0 0 4px 18px; padding:0; font-size:12.5px; line-height:1.55;">${textos.map((t) => `<li>${cfEsc(t)}</li>`).join('')}</ul>`).join('');
  };
  const fundo = document.createElement('div');
  fundo.className = 'ep-historico-fundo';
  fundo.innerHTML = `<div class="ep-historico" style="width:min(780px, 100%);">
    <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px;">
      <div><div style="font-size:20px; font-weight:800;">nexofrete</div>
        <div style="font-size:12.5px; color:var(--texto-fraco);">Versão ${cfEsc(d.versao)}${d.pacote ? ` · pacote de ${cfEsc(d.pacote)}` : ''}${d.empresa ? ` · ${cfEsc(d.empresa)}` : ''}</div></div>
      <button type="button" class="btn btn-secundario" data-fechar style="width:auto; padding:4px 10px;">Fechar</button>
    </div>
    <h3 style="font-size:14px; margin:16px 0 6px;">Para que serve</h3>
    <p style="font-size:13px; line-height:1.6; margin:0;">${cfEsc(d.proposta || '')}</p>
    ${d.manual ? '<p style="margin:10px 0 0;"><button type="button" class="btn btn-secundario" data-manual style="width:auto; padding:6px 12px; font-size:12.5px;">📘 Baixar o manual completo (PDF)</button></p>' : ''}
    <h3 style="font-size:14px; margin:18px 0 6px;">Novidades de cada versão</h3>
    ${(d.versoes || []).map((v, i) => `<details ${i === 0 ? 'open' : ''} style="border:1px solid var(--borda); border-radius:var(--raio); padding:8px 12px; margin-bottom:8px;">
      <summary style="cursor:pointer; font-weight:700;">Versão ${cfEsc(v.versao)}${v.titulo ? ` — ${cfEsc(v.titulo)}` : ''}${v.versao === d.versao ? ' <span class="nav-badge" style="margin-left:6px;">instalada</span>' : ''}</summary>
      ${porArea(v.itens)}</details>`).join('') || '<p style="color:var(--texto-fraco);">Sem novidades registradas.</p>'}
  </div>`;
  fundo.addEventListener('click', async (e) => {
    if (e.target === fundo || e.target.closest('[data-fechar]')) { fundo.remove(); return; }
    if (e.target.closest('[data-manual]')) {
      const resposta = await apiFetch('/api/sobre/manual');
      if (!resposta.ok) { mostrarAlerta('O manual não está na pasta do sistema.'); return; }
      const link = document.createElement('a');
      link.href = URL.createObjectURL(await resposta.blob());
      link.download = 'Manual_Nexofrete.pdf';
      document.body.appendChild(link); link.click(); link.remove();
    }
  });
  document.body.appendChild(fundo);
}
document.getElementById('btnSobre')?.addEventListener('click', abrirSobre);
carregarSobre();


// ---------- Relatório: melhor transportadora para cada nota ----------
let mtDados = null;
let mtTimer = null;
// Até onde a transportadora leva: redespacho, local de entrega da nota ou o cliente.
const MT_DESTINO = { redespacho: '🔀 Redespacho', local: '📍 Local de entrega citado na nota', observacoes: '📝 Cidade citada na nota (com UF)' };
function mtDestino(n) {
  const d = n.destino || { tipo: 'cliente', cidade: n.cidade };
  const cliente = `${cfEsc(n.cidade || '—')}${n.uf ? `/${cfEsc(n.uf)}` : ''}`;
  if (d.tipo === 'cliente') return cliente;
  return `<b>${cfEsc(d.cidade || '— sem cidade —')}</b><br><small style="color:#8b5cf6;" title="${cfEsc(d.detalhe || '')}">${MT_DESTINO[d.tipo]}${d.detalhe && d.tipo === 'redespacho' ? `: ${cfEsc(d.detalhe)}` : ''}</small>`
    + `<br><small style="color:var(--texto-fraco);">cliente em ${cliente}</small>`;
}
const mtPontual = (p) => (p ? `<span title="${p.entregas} entrega(s) nos últimos 6 meses${p.porUf ? ' para esta UF' : ''}" style="color:${p.pct >= 90 ? 'var(--verde)' : p.pct >= 75 ? '#e8890c' : 'var(--vermelho)'};">${p.pct}%</span>` : '<span style="color:var(--texto-fraco);">—</span>');
async function carregarMelhorTransp() {
  const corpo = document.getElementById('mtCorpo');
  if (!corpo) return;
  const embarcadas = document.getElementById('mtEmbarcadas').value;
  const desdeEl = document.getElementById('mtDesde');
  if (!desdeEl.value) desdeEl.value = new Date(Date.now() - (embarcadas === '1' ? 30 : 60) * 86400000).toISOString().slice(0, 10);
  const criterio = document.getElementById('mtCriterio').value;
  document.getElementById('mtPrazoCampo').classList.toggle('oculto', criterio !== 'prazo');
  const params = new URLSearchParams({ criterio, embarcadas, desde: desdeEl.value, busca: document.getElementById('mtBusca').value.trim(), prazo_max: document.getElementById('mtPrazoMax').value });
  corpo.innerHTML = '<tr><td colspan="6" style="color:var(--texto-fraco); padding:14px;">Calculando o frete de cada transportadora…</td></tr>';
  try {
    const resposta = await apiFetch(`/api/fretes/relatorios/melhor-transportadora?${params}`);
    const d = await resposta.json();
    if (!resposta.ok) { corpo.innerHTML = `<tr><td colspan="6">${cfEsc(d.erro || 'Erro')}</td></tr>`; return; }
    mtDados = d;
    desenharMelhorTransp();
  } catch (err) {
    corpo.innerHTML = '<tr><td colspan="6">Falha de conexão com o servidor.</td></tr>';
  }
}

// Notas visíveis com o filtro "Mostrar" e a ordem escolhida (sem buscar de novo no servidor).
function mtNotasVisiveis() {
  const mostrar = document.getElementById('mtMostrar').value;
  const ordem = document.getElementById('mtOrdem').value;
  const lista = mtDados.notas.map((n, i) => ({ n, i })).filter(({ n }) => (
    mostrar === 'economia' ? n.economia > 0
      : mostrar === 'outra' ? n.sugerida && !n.mesma_transportadora && n.transportadora_atual
        : mostrar === 'semtabela' ? !n.sugerida : true));
  if (ordem === 'economia') lista.sort((a, b) => (b.n.economia || 0) - (a.n.economia || 0));
  if (ordem === 'valor') lista.sort((a, b) => (b.n.valor_atual || 0) - (a.n.valor_atual || 0));
  return lista;
}

function desenharMelhorTransp() {
  const d = mtDados;
  if (!d) return;
  const r = d.resumo;
  const corpo = document.getElementById('mtCorpo');
  document.getElementById('mtResumo').innerHTML = `
    <div>Notas analisadas<strong>${r.notas}</strong>${r.totalPeriodo > r.notas ? `de ${r.totalPeriodo} no período` : 'todas do período'}</div>
    <div class="mt-clicavel" data-mt-mostrar="economia" style="border-left-color:var(--verde);" title="Mostrar só essas notas">${d.embarcadas ? 'Teria economizado' : 'Economia possível'}<strong>${formatoMoeda(r.economiaTotal)}</strong>em ${r.comEconomia || 0} nota(s)</div>
    <div class="mt-clicavel" data-mt-mostrar="outra" style="border-left-color:#8b5cf6;" title="Mostrar só essas notas">Com outra transportadora sugerida<strong>${r.comSugestaoDiferente}</strong></div>
    <div class="mt-clicavel" data-mt-mostrar="semtabela" style="border-left-color:var(--amarelo);" title="Mostrar só essas notas">Sem tabela para a cidade<strong>${r.semOpcao}</strong>${r.notas ? `${Math.round((100 * r.semOpcao) / r.notas)}% das notas` : ''}</div>`;
  const avisos = [];
  if (r.totalPeriodo > r.notas) {
    avisos.push(`<div class="mt-aviso">O período tem <b>${r.totalPeriodo}</b> notas; foram analisadas as <b>${r.notas}</b> mais recentes. Para ver as outras, mude a data inicial ou use a busca.</div>`);
  }
  if (r.cidadesSemTabela?.length) {
    avisos.push(`<details class="mt-aviso"><summary style="cursor:pointer;">Cidades sem nenhuma tabela de preço (${r.cidadesSemTabela.length}${r.cidadesSemTabela.length === 20 ? '+' : ''}) — onde vale pedir cotação às transportadoras</summary>
      <div class="mt-cidades">${r.cidadesSemTabela.map((c) => `<span>${cfEsc(c.cidade)} · ${c.notas} nota(s)</span>`).join('')}</div></details>`);
  }
  document.getElementById('mtAvisos').innerHTML = avisos.join('');
  const filtroAtivo = document.getElementById('mtMostrar').value;
  document.querySelectorAll('#mtResumo [data-mt-mostrar]').forEach((c) => c.classList.toggle('mt-ativo', c.dataset.mtMostrar === filtroAtivo));

  const visiveis = mtNotasVisiveis();
  corpo.innerHTML = visiveis.length ? visiveis.map(({ n, i }) => {
    const s = n.sugerida;
    const sugerida = !s ? '<span style="color:var(--texto-fraco);">nenhuma tabela atende</span>'
      : n.mesma_transportadora ? `<span style="color:var(--verde);">✓ a atual já é a melhor</span><span class="mt-sub">${formatoMoeda(s.valor)}${s.prazo != null ? ` · ${s.prazo} d` : ''}</span>`
        : `<b>${cfEsc(s.transportadora)}</b><span class="mt-sub">${formatoMoeda(s.valor)}${s.prazo != null ? ` · ${s.prazo} dia(s)` : ''} · no prazo ${mtPontual(s.pontualidade)}</span>`;
    const atual = n.transportadora_atual
      ? `${cfEsc(n.transportadora_atual)}<span class="mt-sub">${n.valor_atual != null ? formatoMoeda(n.valor_atual) : (d.embarcadas ? '' : 'sem tabela para a cidade')}${d.embarcadas && n.numero_cte ? ` · CT-e ${cfEsc(n.numero_cte)}` : ''}</span>`
      : '<span style="color:var(--texto-fraco);">não definida</span>';
    return `<tr class="mt-linha${n.economia ? ' mt-economia' : ''}" data-i="${i}" style="cursor:pointer;" title="Clique para ver todas as transportadoras">
      <td style="white-space:nowrap;"><b>${cfEsc(n.numero_nf || '—')}</b><span class="mt-sub">${formatoData(n.data_emissao_nf)}${n.numero_pedido ? ` · ped. ${cfEsc(n.numero_pedido)}` : ''}</span></td>
      <td>${cfEsc(n.cliente || '—')}<span class="mt-sub">${mtDestino(n)}</span></td>
      <td style="text-align:right; white-space:nowrap;">${n.qtd_volumes ?? '—'} vol<span class="mt-sub">${n.peso_kg != null ? `${Number(n.peso_kg).toLocaleString('pt-BR')} kg` : ''}</span></td>
      <td>${atual}</td>
      <td>${sugerida}</td>
      <td style="text-align:right; white-space:nowrap;">${n.economia ? formatoMoeda(n.economia) : '<span style="color:var(--texto-fraco);">—</span>'}</td>
    </tr>`;
  }).join('') : `<tr><td colspan="6" style="color:var(--texto-fraco); padding:14px;">${d.notas.length ? 'Nenhuma nota com esse filtro.' : `Nenhuma nota ${d.embarcadas ? 'embarcada' : 'aguardando saída'} neste período.`}</td></tr>`;
}
document.getElementById('mtResumo')?.addEventListener('click', (e) => {
  const card = e.target.closest('[data-mt-mostrar]');
  if (!card) return;
  const sel = document.getElementById('mtMostrar');
  sel.value = sel.value === card.dataset.mtMostrar ? 'todas' : card.dataset.mtMostrar;
  if (sel.value === 'economia') document.getElementById('mtOrdem').value = 'economia';
  desenharMelhorTransp();
});
['mtMostrar', 'mtOrdem'].forEach((id) => document.getElementById(id)?.addEventListener('change', desenharMelhorTransp));
// Clique na nota: abre/fecha o ranking de todas as transportadoras.
document.getElementById('mtCorpo')?.addEventListener('click', (e) => {
  const linha = e.target.closest('tr.mt-linha');
  if (!linha || !mtDados) return;
  const prox = linha.nextElementSibling;
  if (prox && prox.classList.contains('mt-detalhe')) { prox.remove(); return; }
  const n = mtDados.notas[Number(linha.dataset.i)];
  const det = document.createElement('tr');
  det.className = 'mt-detalhe';
  det.innerHTML = `<td colspan="6" style="background:var(--bg-elevado); padding:10px 14px;">
    ${n.opcoes.length ? `<table style="width:100%; font-size:12.5px;"><thead><tr><th style="text-align:left;">#</th><th style="text-align:left;">Transportadora</th><th style="text-align:left;">Tabela</th>
      <th style="text-align:right;">Frete pela tabela</th><th style="text-align:right;">Prazo</th><th style="text-align:right;">No prazo (6 meses)</th><th style="text-align:right;">Diferença p/ a atual</th></tr></thead><tbody>
      ${n.opcoes.map((o, k) => {
        const atual = n.transportadora_atual && o.transportadora.toUpperCase() === String(n.transportadora_atual).toUpperCase();
        const dif = n.valor_atual != null ? o.valor - n.valor_atual : null;
        return `<tr style="${atual ? 'font-weight:700;' : ''}"><td>${k + 1}º</td><td>${cfEsc(o.transportadora)}${atual ? ' <small>(atual)</small>' : ''}${n.sugerida && o.transportadora === n.sugerida.transportadora ? ' <small style="color:var(--verde);">★ sugerida</small>' : ''}</td>
          <td>${cfEsc(o.tabela || '—')}</td><td style="text-align:right;">${formatoMoeda(o.valor)}</td><td style="text-align:right;">${o.prazo != null ? `${o.prazo} d` : '—'}</td>
          <td style="text-align:right;">${mtPontual(o.pontualidade)}</td>
          <td style="text-align:right; color:${dif == null ? 'var(--texto-fraco)' : dif < 0 ? 'var(--verde)' : dif > 0 ? 'var(--vermelho)' : 'inherit'};">${dif == null ? '—' : `${dif > 0 ? '+' : ''}${formatoMoeda(dif)}`}</td></tr>`;
      }).join('')}</tbody></table>` : '<span style="color:var(--texto-fraco);">Nenhuma tabela de preço atende essa cidade — cadastre o trecho para comparar.</span>'}</td>`;
  linha.after(det);
});
['mtCriterio', 'mtEmbarcadas', 'mtDesde', 'mtPrazoMax'].forEach((id) => document.getElementById(id)?.addEventListener('change', (e) => {
  if (e.target.id === 'mtEmbarcadas') document.getElementById('mtDesde').value = '';
  carregarMelhorTransp();
}));
document.getElementById('mtBusca')?.addEventListener('input', () => { clearTimeout(mtTimer); mtTimer = setTimeout(carregarMelhorTransp, 400); });
document.getElementById('btnMtExcel')?.addEventListener('click', () => {
  if (!mtDados?.notas?.length) { mostrarAlerta('Nada para exportar com esses filtros.', { tipo: 'info' }); return; }
  const cab = ['Nr. nota', 'Emissão', 'Pedido', 'Cliente', 'Cidade do cliente', 'UF', 'Entrega até (cidade comparada)', 'Por quê', 'Volumes', 'Peso (kg)', 'Valor da NF', 'Transportadora atual', 'Valor atual',
    'Sugerida', 'Valor sugerida', 'Prazo sugerida (dias)', '% no prazo sugerida', 'Economia', '2ª opção', 'Valor 2ª', '3ª opção', 'Valor 3ª'];
  const linhas = mtDados.notas.map((n) => {
    const outras = n.opcoes.filter((o) => o.transportadora !== n.sugerida?.transportadora);
    return [n.numero_nf, formatoData(n.data_emissao_nf), n.numero_pedido, n.cliente, n.cidade, n.uf, n.destino?.cidade,
      ({ redespacho: `Redespacho${n.destino?.detalhe ? `: ${n.destino.detalhe}` : ''}`, local: 'Local de entrega da nota', observacoes: 'Cidade citada na nota', cliente: 'Cidade do cliente' })[n.destino?.tipo] || '',
      n.qtd_volumes, n.peso_kg, n.valor_faturado,
      n.transportadora_atual, n.valor_atual, n.sugerida?.transportadora, n.sugerida?.valor, n.sugerida?.prazo, n.sugerida?.pontualidade?.pct, n.economia,
      outras[0]?.transportadora, outras[0]?.valor, outras[1]?.transportadora, outras[1]?.valor]
      .map((v) => (typeof v === 'number' ? String(v).replace('.', ',') : v));
  });
  const csv = [cab, ...linhas].map((l) => l.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }));
  link.download = `melhor-transportadora_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link); link.click(); link.remove();
});

document.getElementById('filtroTipoTransportadora')?.addEventListener('change', renderizarListaTransportadoras);

// Completa a transportadora aberta pelo CNPJ (no servidor: BrasilAPI, CNPJ.ws ou ReceitaWS).
document.getElementById('btnCompletarCnpj')?.addEventListener('click', async (e) => {
  if (!editandoTransportadoraId) return;
  const botao = e.currentTarget; const status = document.getElementById('statusBuscaCnpj');
  botao.disabled = true; status.textContent = 'Buscando os dados pelo CNPJ (pode levar alguns segundos)…';
  try {
    const resposta = await apiFetch(`/api/transportadoras/${editandoTransportadoraId}/completar-cnpj`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cnpj: document.getElementById('tCnpj').value }) });
    const t = await resposta.json();
    if (!resposta.ok) { status.innerHTML = `<span style="color:var(--vermelho);">${cfEsc(t.erro || 'Não consegui buscar.')}</span>`; return; }
    [['tRazaoSocial', 'razao_social'], ['tNomeFantasia', 'nome_fantasia'], ['tTelefone', 'telefone'], ['tEmail', 'email'], ['tEndereco', 'endereco'], ['tBairro', 'bairro'],
      ['tMunicipio', 'municipio'], ['tUf', 'uf'], ['tCep', 'cep']].forEach(([id, campo]) => { const el = document.getElementById(id); if (el && t[campo]) el.value = t[campo]; });
    status.innerHTML = t.municipio ? `<span style="color:var(--verde);">✓ Dados completados pelo CNPJ (${cfEsc(t.municipio)}/${cfEsc(t.uf || '')}) e já salvos.</span>`
      : `<span style="color:#e8890c;">⚠ ${cfEsc(t.cadastro_erro || 'O CNPJ não trouxe a cidade.')}</span>`;
    carregarTransportadoras();
  } catch (err) { status.textContent = 'Falha de conexão com o servidor.'; } finally { botao.disabled = false; }
});
document.getElementById('btnCompletarTodasCnpj')?.addEventListener('click', async () => {
  const r = await (await apiFetch('/api/transportadoras/completar-todas', { method: 'POST' })).json();
  mostrarAlerta(r.mensagem || r.erro, { tipo: r.ok ? 'sucesso' : 'erro' });
});

// Busca na lista de transportadoras (refiltra o que já está carregado, sem ir ao servidor).
let buscaTranspTimer = null;
document.getElementById('buscaTransportadoras')?.addEventListener('input', () => { clearTimeout(buscaTranspTimer); buscaTranspTimer = setTimeout(renderizarListaTransportadoras, 200); });


// ---------- Calendário do sistema (sempre em português) ----------
// O calendário do navegador segue o idioma do navegador (Chrome em inglês = meses
// em inglês). Este é do próprio sistema: campo de texto dd/mm/aaaa (digitável) +
// calendário em português ao clicar. Uso: <input class="campo-data">.
const MESES_CALENDARIO = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const DIAS_CALENDARIO = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
function dataParaBr(d) { return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`; }
function dataBrParaIso(txt) {
  const m = String(txt || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  if (d.getDate() !== Number(m[1]) || d.getMonth() !== Number(m[2]) - 1) return null;   // 31/02 não existe
  return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}
function ativarCampoData(input) {
  if (!input || input.dataset.calendario) return;
  input.dataset.calendario = '1';
  input.setAttribute('autocomplete', 'off');
  input.maxLength = 10;
  // Máscara dd/mm/aaaa enquanto digita.
  input.addEventListener('input', () => {
    const n = input.value.replace(/\D/g, '').slice(0, 8);
    input.value = n.length > 4 ? `${n.slice(0, 2)}/${n.slice(2, 4)}/${n.slice(4)}` : n.length > 2 ? `${n.slice(0, 2)}/${n.slice(2)}` : n;
    if (n.length === 8 && dataBrParaIso(input.value)) input.dispatchEvent(new Event('change'));
  });
  let pop = null;
  const fechar = () => { if (pop) { pop.remove(); pop = null; document.removeEventListener('mousedown', foraClique, true); } };
  const foraClique = (e) => { if (pop && !pop.contains(e.target) && e.target !== input) fechar(); };
  const escolher = (txt) => { input.value = txt; fechar(); input.dispatchEvent(new Event('change')); };
  const abrir = () => {
    if (pop) return;
    const iso = dataBrParaIso(input.value);
    let ref = iso ? new Date(`${iso}T12:00:00`) : new Date();
    pop = document.createElement('div');
    pop.className = 'calendario-pt';
    const desenhar = () => {
      const ano = ref.getFullYear(); const mes = ref.getMonth();
      const primeiro = new Date(ano, mes, 1).getDay(); const diasNoMes = new Date(ano, mes + 1, 0).getDate();
      const hoje = new Date(); const selecionado = dataBrParaIso(input.value);
      let celulas = '';
      for (let i = 0; i < primeiro; i++) celulas += '<span></span>';
      for (let d = 1; d <= diasNoMes; d++) {
        const isoDia = `${ano}-${String(mes + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const ehHoje = d === hoje.getDate() && mes === hoje.getMonth() && ano === hoje.getFullYear();
        celulas += `<button type="button" data-dia="${d}" class="${isoDia === selecionado ? 'sel' : ''}${ehHoje ? ' hoje' : ''}">${d}</button>`;
      }
      pop.innerHTML = `<div class="cal-topo"><button type="button" data-nav="-1" title="Mês anterior">‹</button>
          <b>${MESES_CALENDARIO[mes]} de ${ano}</b><button type="button" data-nav="1" title="Próximo mês">›</button></div>
        <div class="cal-semana">${DIAS_CALENDARIO.map((x) => `<span>${x}</span>`).join('')}</div>
        <div class="cal-dias">${celulas}</div>
        <div class="cal-rodape"><button type="button" data-acao="hoje">Hoje</button><button type="button" data-acao="limpar">Limpar</button></div>`;
    };
    desenhar();
    pop.addEventListener('mousedown', (e) => e.preventDefault());   // não tira o foco do campo
    pop.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.nav) { ref = new Date(ref.getFullYear(), ref.getMonth() + Number(b.dataset.nav), 1); desenhar(); return; }
      if (b.dataset.dia) { escolher(dataParaBr(new Date(ref.getFullYear(), ref.getMonth(), Number(b.dataset.dia)))); return; }
      if (b.dataset.acao === 'hoje') escolher(dataParaBr(new Date()));
      if (b.dataset.acao === 'limpar') escolher('');
    });
    document.body.appendChild(pop);
    const r = input.getBoundingClientRect();
    const topo = r.bottom + 4 + 280 > window.innerHeight ? r.top - 284 : r.bottom + 4;
    pop.style.top = `${Math.max(4, topo + window.scrollY)}px`;
    pop.style.left = `${Math.min(r.left + window.scrollX, window.innerWidth - 260)}px`;
    document.addEventListener('mousedown', foraClique, true);
  };
  input.addEventListener('focus', abrir);
  input.addEventListener('click', abrir);
  input.addEventListener('keydown', (e) => { if (e.key === 'Escape' || e.key === 'Tab') fechar(); });
}
document.querySelectorAll('input.campo-data').forEach(ativarCampoData);


// ---------- Relatório: juntar notas para economizar frete (consolidação) ----------
let csDados = null;
let csTimer = null;
const MT_DESTINO_CS = { redespacho: '🔀 Redespacho', local: '📍 Local de entrega', observacoes: '📝 Cidade citada na nota', cliente: '' };
async function carregarConsolidacao() {
  const caixa = document.getElementById('csGrupos');
  if (!caixa) return;
  const embarcadas = document.getElementById('csEmbarcadas').value;
  const desdeEl = document.getElementById('csDesde');
  if (!desdeEl.value) desdeEl.value = dataParaBr(new Date(Date.now() - (embarcadas === '1' ? 60 : 15) * 86400000));
  const params = new URLSearchParams({ embarcadas, modo: document.getElementById('csModo').value, janela: document.getElementById('csJanela').value || '3',
    desde: dataBrParaIso(desdeEl.value) || '', ate: dataBrParaIso(document.getElementById('csAte').value) || '', busca: document.getElementById('csBusca').value.trim() });
  caixa.innerHTML = '<p style="color:var(--texto-fraco);">Procurando notas que podem ir juntas e calculando o frete…</p>';
  try {
    const resposta = await apiFetch(`/api/fretes/relatorios/consolidacao?${params}`);
    const d = await resposta.json();
    if (!resposta.ok) { caixa.innerHTML = `<p>${cfEsc(d.erro || 'Erro')}</p>`; return; }
    csDados = d;
    const r = d.resumo;
    if (d.modo === 'destino') { renderizarConsolidacaoPorDestino(d); return; }
    document.getElementById('csResumo').innerHTML = `
      <div>Grupos que podem ir juntos<strong>${r.grupos}</strong>${r.notas} nota(s)</div>
      <div style="border-left-color:var(--verde);">${d.embarcadas ? 'Teria economizado' : 'Economia possível'}<strong>${formatoMoeda(r.economiaTotal)}</strong></div>
      <div style="border-left-color:#8b5cf6;">Grupos sem tabela para calcular<strong>${r.semTabela}</strong>cadastre o trecho para comparar</div>`;
    if (!d.grupos.length) {
      caixa.innerHTML = `<p style="color:var(--verde);">✓ Nenhum grupo de notas ${d.embarcadas ? 'saiu em CT-e separados' : 'para juntar'} neste período${d.embarcadas ? '' : ' — nenhuma nota do mesmo cliente, mesma cidade e mesma transportadora aguardando juntas'}.</p>`;
      return;
    }
    caixa.innerHTML = d.grupos.map((g) => {
      const dest = g.destino || {};
      const ondeTxt = `${cfEsc(dest.cidade || '—')}${dest.uf ? `/${cfEsc(dest.uf)}` : ''}${dest.tipo && dest.tipo !== 'cliente' ? ` <small style="color:#8b5cf6;">${MT_DESTINO_CS[dest.tipo] || ''}${dest.detalhe && dest.tipo === 'redespacho' ? `: ${cfEsc(dest.detalhe)}` : ''}</small>` : ''}`;
      const nfs = g.notas.map((n) => n.numero_nf).join(', ');
      return `<div style="border:1px solid var(--borda); border-radius:var(--raio); padding:12px 14px; margin-bottom:12px;">
        <div style="display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap; align-items:flex-start;">
          <div><b>${cfEsc(g.cliente || '—')}</b> <small style="color:var(--texto-fraco);">${cfEsc(g.cliente_documento || '')}</small><br>
            <span style="font-size:12.5px;">Entrega até ${ondeTxt} · ${cfEsc(g.transportadora)}${g.transportadora_definida ? '' : ' <small style="color:var(--texto-fraco);">(sem transportadora na nota: a mais barata para o grupo)</small>'}</span>${linhaCargaCs(g)}</div>
          <div style="text-align:right;"><div style="font-size:12px; color:var(--texto-fraco);">${d.embarcadas ? 'Pago em CT-e separados' : 'Em CT-e separados'}: ${formatoMoeda(g.separado)}<br>Num CT-e só: ${formatoMoeda(g.junto)}</div>
            <div style="font-size:16px; font-weight:800; color:var(--verde);">${d.embarcadas ? 'Teria economizado' : 'Economia'} ${formatoMoeda(g.economia)}</div></div>
        </div>
        <table style="width:100%; font-size:12.5px; margin-top:8px;"><thead><tr><th style="text-align:left;">NF</th><th style="text-align:left;">Pedido</th><th style="text-align:left;">Emissão</th>
          <th style="text-align:right;">Volumes</th><th style="text-align:right;">Peso</th><th style="text-align:right;">Valor da NF</th><th style="text-align:right;">${d.embarcadas ? 'CT-e pago' : 'Frete sozinha'}</th></tr></thead><tbody>
          ${g.notas.map((n) => `<tr><td><b>${cfEsc(n.numero_nf)}</b></td><td>${cfEsc(n.numero_pedido || '—')}</td><td>${formatoData(n.data_emissao_nf)}</td>
            <td style="text-align:right;">${n.qtd_volumes ?? '—'}</td><td style="text-align:right;">${n.peso_kg != null ? `${Number(n.peso_kg).toLocaleString('pt-BR')} kg` : '—'}</td>
            <td style="text-align:right;">${formatoMoeda(n.valor_faturado)}</td><td style="text-align:right;">${formatoMoeda(n.frete)}${n.numero_cte ? `<br><small style="color:var(--texto-fraco);">CT-e ${cfEsc(n.numero_cte)}</small>` : ''}</td></tr>`).join('')}
          <tr style="font-weight:700;"><td colspan="3">Juntas</td><td style="text-align:right;">${g.volumes}</td><td style="text-align:right;">${Number(g.peso).toLocaleString('pt-BR')} kg</td>
            <td style="text-align:right;">${formatoMoeda(g.valor)}</td><td style="text-align:right;">${formatoMoeda(g.junto)}</td></tr></tbody></table>
        ${d.embarcadas ? '' : `<div style="margin-top:8px; font-size:12.5px; background:var(--bg-elevado); padding:8px 10px; border-radius:6px;">📋 <b>Para a expedição:</b> despachar juntas e pedir à ${cfEsc(g.transportadora)} <b>um único CT-e</b> citando as NF-e ${cfEsc(nfs)}.</div>`}
      </div>`;
    }).join('');
  } catch (err) {
    caixa.innerHTML = '<p>Falha de conexão com o servidor.</p>';
  }
}
['csModo', 'csEmbarcadas', 'csJanela', 'csDesde', 'csAte'].forEach((id) => document.getElementById(id)?.addEventListener('change', (e) => {
  if (e.target.id === 'csEmbarcadas') document.getElementById('csDesde').value = '';
  carregarConsolidacao();
}));
document.getElementById('csBusca')?.addEventListener('input', () => { clearTimeout(csTimer); csTimer = setTimeout(carregarConsolidacao, 400); });
document.getElementById('btnCsExcel')?.addEventListener('click', () => {
  if (!csDados?.grupos?.length) { mostrarAlerta('Nada para exportar com esses filtros.', { tipo: 'info' }); return; }
  const cab = ['Grupo', 'Cliente', 'CNPJ/CPF', 'Entrega até', 'UF', 'Transportadora', 'NF', 'Pedido', 'Emissão', 'Volumes', 'Peso (kg)', 'Valor da NF',
    csDados.embarcadas ? 'CT-e pago' : 'Frete sozinha', 'CT-e', 'Grupo: separado', 'Grupo: num CT-e só', 'Grupo: economia',
    'Grupo: peso total (kg)', 'Grupo: m³ total', 'Grupo: veículo indicado'];
  const veicTxt = (g) => (g.veiculo ? `${g.veiculo.quantidade > 1 ? `${g.veiculo.quantidade}x ` : ''}${g.veiculo.nome} (${g.veiculo.pesoPct}% peso${g.veiculo.m3Pct != null ? `, ${g.veiculo.m3Pct}% volume` : ''}${g.veiculo.porPeso ? ', só pelo peso' : ''})` : '');
  const num = (v) => (typeof v === 'number' ? String(v).replace('.', ',') : v);
  const linhas = [];
  if (csDados.modo === 'destino') {
    cab.splice(5, 1, 'Transportadora (carga junta)', 'Tipo');
    csDados.grupos.forEach((g, i) => g.clientes.forEach((c) => c.notas.forEach((n) => linhas.push([i + 1, c.cliente, c.cliente_documento,
      g.tipo === 'redespacho' ? `Redespacho: ${g.destino?.detalhe || ''} (${g.destino?.cidade || ''})` : g.destino?.cidade, g.destino?.uf, g.transportadora,
      g.um_cliente ? 'Um CT-e comum' : 'Negociar carga consolidada / CT-e globalizado',
      n.numero_nf, n.numero_pedido, formatoData(n.data_emissao_nf), n.qtd_volumes, n.peso_kg, n.valor_faturado, n.frete, n.numero_cte, g.separado, g.junto, g.economia, g.peso, g.cubagem, veicTxt(g)].map(num)))));
  } else {
    csDados.grupos.forEach((g, i) => g.notas.forEach((n) => linhas.push([i + 1, g.cliente, g.cliente_documento, g.destino?.cidade, g.destino?.uf, g.transportadora,
      n.numero_nf, n.numero_pedido, formatoData(n.data_emissao_nf), n.qtd_volumes, n.peso_kg, n.valor_faturado, n.frete, n.numero_cte, g.separado, g.junto, g.economia, g.peso, g.cubagem, veicTxt(g)].map(num))));
  }
  const csv = [cab, ...linhas].map((l) => l.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }));
  link.download = `juntar-notas_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link); link.click(); link.remove();
});
document.querySelectorAll('input.campo-data').forEach(ativarCampoData);

// Peso, m³ e veículo indicado de um grupo.
function linhaCargaCs(g) {
  const v = g.veiculo;
  const ocup = v ? `${v.pesoPct}% do peso${v.m3Pct != null ? ` · ${v.m3Pct}% do volume` : ''}` : '';
  return `<div style="display:flex; gap:14px; flex-wrap:wrap; align-items:center; margin-top:6px; font-size:12.5px;">
    <span>⚖ <b>${Number(g.peso || 0).toLocaleString('pt-BR')} kg</b></span>
    <span>📦 <b>${g.cubagem ? `${Number(g.cubagem).toLocaleString('pt-BR')} m³` : '— m³'}</b>${g.notas_sem_cubagem ? ` <small style="color:#e8890c;" title="Sem cubagem informada (a NF-e não traz m³; vem do CT-e ou da planilha do ERP)">m³ não informado em ${g.notas_sem_cubagem} nota(s)</small>` : ''}</span>
    ${v ? `<span style="background:rgba(77,124,255,.12); color:var(--azul); padding:3px 8px; border-radius:999px; font-weight:700;"
      title="${v.porPeso ? 'Escolhido só pelo peso (falta o m³ de alguma nota)' : 'Menor veículo que comporta o peso e o volume'}">🚚 ${v.quantidade > 1 ? `${v.quantidade}× ` : ''}${cfEsc(v.nome)} <small style="font-weight:400;">(${ocup}${v.porPeso ? ' — só pelo peso' : ''})</small></span>` : ''}
  </div>`;
}

// Grupos por DESTINO (cidade de entrega ou redespacho), com clientes diferentes.
function renderizarConsolidacaoPorDestino(d) {
  const r = d.resumo;
  document.getElementById('csResumo').innerHTML = `
    <div>Destinos com notas para juntar<strong>${r.grupos}</strong>${r.notas} nota(s)</div>
    <div style="border-left-color:var(--verde);">${d.embarcadas ? 'Teria economizado' : 'Economia possível'}<strong>${formatoMoeda(r.economiaTotal)}</strong></div>
    <div style="border-left-color:#06b6d4;">📄 Um cliente — um CT-e comum<strong>${r.umCliente}</strong></div>
    <div style="border-left-color:#8b5cf6;">🤝 Vários clientes — negociar carga<strong>${r.variosClientes}</strong>${r.semTabela ? `${r.semTabela} sem tabela` : ''}</div>`;
  const caixa = document.getElementById('csGrupos');
  if (!d.grupos.length) { caixa.innerHTML = `<p style="color:var(--verde);">✓ Nenhum destino com notas para juntar neste período.</p>`; return; }
  caixa.innerHTML = d.grupos.map((g) => {
    const dest = g.destino || {};
    const titulo = g.tipo === 'redespacho'
      ? `🔀 Redespacho ${cfEsc(dest.detalhe || '')} — ${cfEsc(dest.cidade || '')}${dest.uf ? `/${cfEsc(dest.uf)}` : ''}`
      : `📍 ${cfEsc(dest.cidade || '—')}${dest.uf ? `/${cfEsc(dest.uf)}` : ''}`;
    const selo = g.um_cliente
      ? '<span class="cte-selo" style="background:rgba(6,182,212,.15); color:#06b6d4;" title="Mesmo destinatário: cabe num CT-e comum citando todas as NF-e">📄 Um CT-e comum</span>'
      : '<span class="cte-selo" style="background:rgba(139,92,246,.15); color:#a78bfa;" title="Destinatários diferentes: um CT-e comum não pode juntar. Negocie com a transportadora o preço como uma carga só (CT-e separados) ou, se ela emitir e as regras permitirem, um CT-e globalizado — confirme com o contador.">🤝 Vários clientes — negociar carga consolidada / CT-e globalizado</span>';
    const nfs = g.clientes.flatMap((c) => c.notas.map((n) => n.numero_nf)).join(', ');
    return `<div style="border:1px solid var(--borda); border-radius:var(--raio); padding:12px 14px; margin-bottom:12px;">
      <div style="display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap; align-items:flex-start;">
        <div><b style="font-size:14px;">${titulo}</b><br>${selo}
          <div style="font-size:12.5px; margin-top:4px;">${g.clientes.length} cliente(s) · ${g.qtd_notas} nota(s) · ${g.volumes} volume(s) · ${formatoMoeda(g.valor)} em mercadoria</div>${linhaCargaCs(g)}</div>
        <div style="text-align:right;"><div style="font-size:12px; color:var(--texto-fraco);">${d.embarcadas ? 'Pago em CT-e separados' : 'Cada nota com a sua transportadora'}: ${formatoMoeda(g.separado)}<br>Como uma carga só (${cfEsc(g.transportadora)}): ${formatoMoeda(g.junto)}</div>
          <div style="font-size:16px; font-weight:800; color:var(--verde);">${d.embarcadas ? 'Teria economizado' : 'Economia'} ${formatoMoeda(g.economia)}</div></div>
      </div>
      <table style="width:100%; font-size:12.5px; margin-top:8px;"><thead><tr><th style="text-align:left;">Cliente</th><th style="text-align:left;">NF</th><th style="text-align:left;">Emissão</th>
        <th style="text-align:left;">Transportadora da nota</th><th style="text-align:right;">Volumes</th><th style="text-align:right;">Peso</th><th style="text-align:right;">${d.embarcadas ? 'CT-e pago' : 'Frete sozinha'}</th></tr></thead><tbody>
        ${g.clientes.map((c) => c.notas.map((n, k) => `<tr><td>${k === 0 ? `<b>${cfEsc(c.cliente || '—')}</b>` : ''}</td><td>${cfEsc(n.numero_nf)}</td><td>${formatoData(n.data_emissao_nf)}</td>
          <td>${cfEsc(n.transportadora_nf || '— (sem transportadora)')}</td><td style="text-align:right;">${n.qtd_volumes ?? '—'}</td>
          <td style="text-align:right;">${n.peso_kg != null ? `${Number(n.peso_kg).toLocaleString('pt-BR')} kg` : '—'}</td>
          <td style="text-align:right;">${formatoMoeda(n.frete)}${n.numero_cte ? `<br><small style="color:var(--texto-fraco);">CT-e ${cfEsc(n.numero_cte)}</small>` : ''}</td></tr>`).join('')).join('')}
      </tbody></table>
      ${d.embarcadas ? '' : `<div style="margin-top:8px; font-size:12.5px; background:var(--bg-elevado); padding:8px 10px; border-radius:6px;">📋 <b>Para a expedição:</b> ${g.um_cliente
        ? `despachar juntas pela ${cfEsc(g.transportadora)} e pedir <b>um único CT-e</b> citando as NF-e ${cfEsc(nfs)}.`
        : `despachar juntas pela ${cfEsc(g.transportadora)} (NF-e ${cfEsc(nfs)}) e <b>negociar o preço como uma carga só</b>${g.tipo === 'redespacho' ? ' até o redespacho' : ''} — CT-e por cliente, ou um CT-e globalizado se a transportadora emitir e as regras permitirem.`}</div>`}
    </div>`;
  }).join('');
}

// ⚙ Veículos: capacidade de peso e m³ de cada veículo (usada para indicar o veículo da carga).
document.getElementById('btnCsVeiculos')?.addEventListener('click', async () => {
  const d = await (await apiFetch('/api/fretes/relatorios/consolidacao/veiculos')).json();
  const fundo = document.createElement('div');
  fundo.className = 'ep-historico-fundo';
  const linha = (v = {}) => `<tr><td><input type="text" class="vNome" value="${cfEsc(v.nome || '')}" placeholder="Ex.: 3/4" /></td>
    <td><input type="number" class="vKg" value="${v.kg ?? ''}" min="1" style="width:110px;" /></td>
    <td><input type="number" class="vM3" value="${v.m3 ?? ''}" min="0" step="0.1" style="width:90px;" /></td>
    <td><button type="button" class="btn btn-secundario" data-remover style="width:auto; padding:4px 8px;">✕</button></td></tr>`;
  fundo.innerHTML = `<div class="ep-historico" style="width:min(620px, 100%);">
    <h3 style="margin:0 0 4px;">⚙ Capacidade dos veículos</h3>
    <p style="font-size:12.5px; color:var(--texto-fraco); margin:0 0 10px;">O relatório indica o <b>menor</b> veículo que comporta o peso e o volume da carga.
      Ajuste à realidade das transportadoras de vocês (modelo e carroceria mudam bastante a capacidade).</p>
    <table style="width:100%; font-size:13px;"><thead><tr><th style="text-align:left;">Veículo</th><th style="text-align:left;">Peso máx. (kg)</th><th style="text-align:left;">Volume (m³)</th><th></th></tr></thead>
      <tbody id="vLinhas">${d.veiculos.map(linha).join('')}</tbody></table>
    <div style="display:flex; gap:8px; justify-content:space-between; margin-top:12px; flex-wrap:wrap;">
      <div style="display:flex; gap:8px;"><button type="button" class="btn btn-secundario" data-add style="width:auto;">+ Veículo</button>
        <button type="button" class="btn btn-secundario" data-padrao style="width:auto;">Voltar ao padrão</button></div>
      <div style="display:flex; gap:8px;"><button type="button" class="btn btn-secundario" data-fechar style="width:auto;">Cancelar</button>
        <button type="button" class="btn btn-primario" data-salvar style="width:auto;">Salvar</button></div>
    </div></div>`;
  const salvar = async (lista) => {
    const r = await apiFetch('/api/fretes/relatorios/consolidacao/veiculos', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ veiculos: lista }) });
    if (!r.ok) { mostrarAlerta('Não consegui salvar as capacidades.'); return; }
    fundo.remove(); mostrarAlerta('Capacidades salvas.', { tipo: 'sucesso' }); carregarRotas();
  };
  fundo.addEventListener('click', (e) => {
    if (e.target === fundo || e.target.closest('[data-fechar]')) { fundo.remove(); return; }
    if (e.target.closest('[data-remover]')) { e.target.closest('tr').remove(); return; }
    if (e.target.closest('[data-add]')) { fundo.querySelector('#vLinhas').insertAdjacentHTML('beforeend', linha()); return; }
    if (e.target.closest('[data-padrao]')) { salvar([]); return; }
    if (e.target.closest('[data-salvar]')) {
      const lista = [...fundo.querySelectorAll('#vLinhas tr')].map((tr) => ({ nome: tr.querySelector('.vNome').value.trim(),
        kg: Number(tr.querySelector('.vKg').value), m3: Number(tr.querySelector('.vM3').value) || null })).filter((v) => v.nome && v.kg > 0);
      if (!lista.length) { mostrarAlerta('Informe pelo menos um veículo com nome e peso.'); return; }
      salvar(lista);
    }
  });
  document.body.appendChild(fundo);
});


// ---------- Lançar entregas a partir de mensagens do WhatsApp ----------
document.getElementById('btnEpWhatsapp')?.addEventListener('click', () => {
  const fundo = document.createElement('div');
  fundo.className = 'ep-historico-fundo';
  fundo.innerHTML = `<div class="ep-historico" style="width:min(980px, 100%);">
    <div style="display:flex; justify-content:space-between; gap:12px;"><h3 style="margin:0;">📋 Lançar entregas do WhatsApp</h3>
      <button type="button" class="btn btn-secundario" data-fechar style="width:auto; padding:4px 10px;">Fechar</button></div>
    <ol style="font-size:12.5px; color:var(--texto-fraco); margin:8px 0 10px 18px; padding:0; line-height:1.6;">
      <li>No WhatsApp Web, abra o grupo dos comprovantes, passe o mouse numa mensagem, clique na setinha ⌄ » <b>Selecionar mensagens</b> e marque as do dia (as fotos com o número da NF).</li>
      <li>Copie com <b>Ctrl+C</b> (cada mensagem vem com a data) e cole abaixo com <b>Ctrl+V</b>. Também serve o texto de "Exportar conversa" do celular, ou uma lista de NF.</li>
      <li>Clique em <b>Ler</b>, confira as datas e clique em <b>Lançar</b>.</li>
    </ol>
    <textarea id="waTexto" rows="7" style="width:100%; font-family:monospace; font-size:12.5px;" placeholder="[14:16, 06/10/2026] Denis de souza medeiros: 193233"></textarea>
    <div style="display:flex; gap:10px; align-items:flex-end; margin:8px 0; flex-wrap:wrap;">
      <div class="campo" style="margin-bottom:0;"><label>Data para linhas sem data</label><input type="text" id="waDataPadrao" class="campo-data" placeholder="dd/mm/aaaa" style="width:130px;" /></div>
      <button type="button" class="btn btn-primario" data-ler style="width:auto;">🔎 Ler</button>
    </div>
    <div id="waPrevia"></div>
    <hr style="border:none; border-top:1px solid var(--borda); margin:16px 0;">
    <h3 style="margin:0 0 4px; font-size:15px;">📸 Importar fotos dos comprovantes</h3>
    <p style="font-size:12.5px; color:var(--texto-fraco); margin:0 0 8px;">Quando o grupo só tem as fotos: no WhatsApp, baixe as fotos do dia e arraste aqui (ou clique).
      Para cada foto informe a NF e a <b>data do canhoto</b> — a data vem preenchida com a data da foto; confira no canhoto (clique na miniatura para ampliar).
      <span id="waIaAviso"></span></p>
    <div id="waFotosZona" style="border:2px dashed var(--borda); border-radius:var(--raio); padding:18px; text-align:center; cursor:pointer; font-size:13px; color:var(--texto-fraco);">
      📸 Arraste as fotos aqui ou clique para selecionar (jpg, png)<input type="file" id="waFotosInput" accept="image/*" multiple class="oculto" /></div>
    <div id="waFotos" style="margin-top:10px;"></div>
  </div>`;
  document.body.appendChild(fundo);
  ativarImportacaoFotos(fundo);
  const dataPadrao = fundo.querySelector('#waDataPadrao');
  dataPadrao.value = dataParaBr(new Date());
  ativarCampoData(dataPadrao);
  let itens = [];
  const desenhar = (d) => {
    const caixa = fundo.querySelector('#waPrevia');
    itens = d.itens;
    if (!itens.length) { caixa.innerHTML = `<p style="color:#e8890c;">Nenhuma NF do sistema encontrada no texto.${d.naoEncontradas?.length ? ` Números que não são NF cadastrada: ${cfEsc(d.naoEncontradas.join(', '))}.` : ''}</p>`; return; }
    caixa.innerHTML = `<div style="font-size:12.5px; margin-bottom:6px;">${itens.length} nota(s) encontrada(s)${d.naoEncontradas?.length ? ` · <span style="color:var(--texto-fraco);" title="${cfEsc(d.naoEncontradas.join(', '))}">${d.naoEncontradas.length} número(s) ignorado(s) — não são NF cadastrada (pedidos, telefones...)</span>` : ''}</div>
      <div style="max-height:46vh; overflow:auto;"><table style="width:100%; font-size:12.5px;"><thead><tr><th><input type="checkbox" id="waTodas" checked title="Marcar/desmarcar todas" /></th>
        <th style="text-align:left;">NF</th><th style="text-align:left;">Cliente</th><th style="text-align:left;">Transportadora</th><th style="text-align:left;">Emissão</th>
        <th style="text-align:left;">Data de entrega</th><th style="text-align:left;">Mensagem</th></tr></thead><tbody>
        ${itens.map((it, k) => `<tr><td><input type="checkbox" class="waMarca" data-k="${k}" ${it.marcar ? 'checked' : ''} /></td>
          <td><b>${cfEsc(it.numero_nf)}</b></td><td>${cfEsc(it.cliente || '—')}<br><small style="color:var(--texto-fraco);">${cfEsc(it.cidade || '')}${it.uf ? `/${cfEsc(it.uf)}` : ''}</small></td>
          <td>${cfEsc(it.transportadora || '—')}</td><td>${it.data_emissao_nf ? it.data_emissao_nf.split('-').reverse().join('/') : '—'}</td>
          <td><input type="text" class="campo-data waData" data-k="${k}" value="${it.data ? it.data.split('-').reverse().join('/') : ''}" style="width:115px;" />
            ${it.avisos.length ? `<br><small style="color:#e8890c;">⚠ ${cfEsc(it.avisos.join('; '))}</small>` : ''}</td>
          <td><small style="color:var(--texto-fraco);">${cfEsc(it.remetente ? `${it.remetente}: ` : '')}${cfEsc(it.mensagem || '')}</small></td></tr>`).join('')}
      </tbody></table></div>
      <div style="display:flex; justify-content:flex-end; margin-top:10px;"><button type="button" class="btn btn-primario" data-lancar style="width:auto;">✅ Lançar as marcadas</button></div>`;
    caixa.querySelectorAll('input.campo-data').forEach(ativarCampoData);
    caixa.querySelector('#waTodas').addEventListener('change', (e) => caixa.querySelectorAll('.waMarca').forEach((c) => { c.checked = e.target.checked; }));
  };
  fundo.addEventListener('click', async (e) => {
    if (e.target === fundo || e.target.closest('[data-fechar]')) { fundo.remove(); return; }
    if (e.target.closest('[data-ler]')) {
      const texto = fundo.querySelector('#waTexto').value;
      if (!texto.trim()) { mostrarAlerta('Cole as mensagens do WhatsApp no campo.', { tipo: 'info' }); return; }
      const r = await apiFetch('/api/fretes/entregas-whatsapp/previa', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texto, data_padrao: dataBrParaIso(dataPadrao.value) }) });
      const d = await r.json();
      if (!r.ok) { mostrarAlerta(d.erro || 'Erro ao ler.'); return; }
      desenhar(d);
      return;
    }
    if (e.target.closest('[data-lancar]')) {
      const escolhidos = [...fundo.querySelectorAll('.waMarca:checked')].map((c) => {
        const k = Number(c.dataset.k);
        return { id: itens[k].id, data: dataBrParaIso(fundo.querySelector(`.waData[data-k="${k}"]`).value) };
      });
      const semData = escolhidos.filter((i) => !i.data);
      if (!escolhidos.length) { mostrarAlerta('Marque pelo menos uma nota.', { tipo: 'info' }); return; }
      if (semData.length) { mostrarAlerta(`${semData.length} nota(s) marcada(s) estão sem data válida (dd/mm/aaaa).`); return; }
      const r = await apiFetch('/api/fretes/entregas-whatsapp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ itens: escolhidos }) });
      const d = await r.json();
      if (!r.ok) { mostrarAlerta(d.erro || 'Erro ao lançar.'); return; }
      fundo.remove();
      mostrarAlerta(`✓ ${d.lancadas} data(s) de entrega lançada(s).`, { tipo: 'sucesso' });
      carregarEntregasPrevistas();
    }
  });
});


// ---------- Importar fotos dos comprovantes (canhotos) ----------
// A data vem do nome do arquivo do WhatsApp ("WhatsApp Image 2026-10-06 at 14.16.23.jpeg");
// com a IA ligada, o nº da NF e a data do canhoto são lidos da própria foto.
function dataDoNomeArquivo(nome) {
  const m = String(nome).match(/(20\d{2})[-_.]?(\d{2})[-_.]?(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : dataParaBr(new Date());
}
function ampliarFoto(url) {
  const f = document.createElement('div');
  f.className = 'ep-historico-fundo';
  f.style.zIndex = 10050;
  f.innerHTML = `<img src="${url}" style="max-width:95vw; max-height:92vh; border-radius:8px; box-shadow:0 10px 40px rgba(0,0,0,.6);" title="Clique para fechar" />`;
  f.addEventListener('click', () => f.remove());
  document.body.appendChild(f);
}
async function ativarImportacaoFotos(fundo) {
  const zona = fundo.querySelector('#waFotosZona'); const input = fundo.querySelector('#waFotosInput'); const caixa = fundo.querySelector('#waFotos');
  let ia = false; let ocr = false;
  try { const c = await (await apiFetch('/api/comprovantes/capacidades')).json(); ia = !!c.ia; ocr = !!c.ocr; } catch (e) { /* manual */ }
  fundo.querySelector('#waIaAviso').innerHTML = ia ? ' <b style="color:var(--verde);">🤖 Leitura por IA ligada: a NF e a data são lidas da foto.</b>'
    : ocr ? ' <b style="color:var(--verde);">🔎 O número da NF impresso no canhoto é lido sozinho</b> <small>(a data vem da foto — confira no canhoto; a IA, em Manutenção, lê também a data).</small>'
      : ' <small>(Leitura automática desligada — o leitor gratuito precisa do "npm install" no servidor; a IA pode ser ligada em Manutenção.)</small>';
  const linhas = [];
  const desenharLinha = (l) => {
    const n = l.nota;
    l.el.querySelector('.cfInfo').innerHTML = !l.nfCampo.value ? '<small style="color:var(--texto-fraco);">informe a NF</small>'
      : !n ? '<small style="color:#e8890c;">NF não encontrada no sistema</small>'
        : `<small>${cfEsc(n.cliente || '—')} · ${cfEsc(n.cidade || '')}${n.uf ? `/${cfEsc(n.uf)}` : ''}<br>${cfEsc(n.transportadora || '—')}`
          + `${n.data_entrega ? `<br><span style="color:#e8890c;">⚠ já tem entrega em ${formatoData(n.data_entrega)}${n.data_entrega_origem ? ` (${cfEsc(n.data_entrega_origem)})` : ''}</span>` : ''}</small>`;
  };
  const buscarNota = async (l) => {
    const nf = l.nfCampo.value.replace(/\D/g, '');
    if (!nf) { l.nota = null; desenharLinha(l); return; }
    const r = await apiFetch(`/api/comprovantes/nf/${nf}`);
    l.nota = r.ok ? await r.json() : null;
    desenharLinha(l);
  };
  const adicionar = (arquivos) => {
    [...arquivos].filter((a) => /^image\//.test(a.type)).forEach((arquivo) => {
      const url = URL.createObjectURL(arquivo);
      const el = document.createElement('div');
      el.style.cssText = 'display:grid; grid-template-columns:90px 120px 140px 1fr 90px; gap:10px; align-items:center; padding:8px 0; border-bottom:1px solid var(--borda);';
      el.innerHTML = `<img src="${url}" style="width:90px; height:70px; object-fit:cover; border-radius:6px; cursor:zoom-in;" title="Clique para ampliar" />
        <div><label style="font-size:11px; color:var(--texto-fraco);">NF</label><input type="text" class="cfNf" inputmode="numeric" style="width:110px;" /></div>
        <div><label style="font-size:11px; color:var(--texto-fraco);">Data do canhoto</label><input type="text" class="campo-data cfData" style="width:125px;" value="${dataDoNomeArquivo(arquivo.name)}" /></div>
        <div class="cfInfo"></div><div class="cfStatus" style="font-size:12px;"></div>`;
      caixa.appendChild(el);
      const l = { arquivo, url, el, nfCampo: el.querySelector('.cfNf'), dataCampo: el.querySelector('.cfData'), nota: null, feito: false };
      linhas.push(l);
      ativarCampoData(l.dataCampo);
      el.querySelector('img').addEventListener('click', () => ampliarFoto(url));
      let t = null;
      l.nfCampo.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => buscarNota(l), 350); });
      desenharLinha(l);
    });
    garantirBotao();
    if (ia || ocr) lerComIa();
  };
  // IA: lê uma foto por vez (as que ainda não foram lidas).
  let lendo = false;
  const lerComIa = async () => {
    if (lendo) return; lendo = true;
    for (const l of linhas.filter((x) => !x.lida)) {
      l.lida = true;
      const st = l.el.querySelector('.cfStatus'); st.textContent = ia ? '🤖 lendo…' : '🔎 lendo…';
      try {
        const fd = new FormData(); fd.append('foto', l.arquivo);
        fd.append('ano_provavel', (dataBrParaIso(l.dataCampo.value) || '').slice(0, 4));
        const r = await apiFetch('/api/comprovantes/ler', { method: 'POST', body: fd });
        const d = await r.json();
        if (!r.ok) { st.innerHTML = `<span style="color:#e8890c;" title="${cfEsc(d.erro || '')}">não leu</span>`; continue; }
        if (d.nf && !l.nfCampo.value) l.nfCampo.value = d.nf;
        if (d.data) l.dataCampo.value = d.data.split('-').reverse().join('/');
        l.nota = d.nota || null; desenharLinha(l);
        if (d.metodo === 'ocr') {
          st.innerHTML = d.nf ? '<span style="color:var(--verde);">🔎 NF lida — confira a data</span>'
            : `<span style="color:#e8890c;" title="${cfEsc((d.lidos || []).length ? `Números lidos: ${d.lidos.join(', ')} — nenhum é NF cadastrada` : 'Nenhum número legível')}">🔎 NF não lida — digite</span>`;
          continue;
        }
        const baixa = d.confianca_nf === 'baixa' || d.confianca_data === 'baixa' || !d.nf || !d.data;
        st.innerHTML = baixa ? '<span style="color:#e8890c;">🤖 confira com atenção</span>' : '<span style="color:var(--verde);">🤖 lido — confira</span>';
      } catch (e) { st.textContent = 'não leu'; }
    }
    lendo = false;
  };
  let botao = null;
  const garantirBotao = () => {
    if (botao) return;
    botao = document.createElement('div');
    botao.style.cssText = 'display:flex; justify-content:flex-end; margin-top:10px;';
    botao.innerHTML = '<button type="button" class="btn btn-primario" style="width:auto;">✅ Lançar entregas com as fotos</button>';
    caixa.after(botao);
    botao.querySelector('button').addEventListener('click', async (e) => {
      const btn = e.currentTarget; btn.disabled = true;
      let ok = 0; let falhas = 0;
      for (const l of linhas.filter((x) => !x.feito)) {
        const st = l.el.querySelector('.cfStatus');
        const nf = l.nfCampo.value.replace(/\D/g, ''); const data = dataBrParaIso(l.dataCampo.value);
        if (!nf || !data) { st.innerHTML = '<span style="color:#e8890c;">falta NF ou data</span>'; falhas += 1; continue; }
        const fd = new FormData(); fd.append('foto', l.arquivo); fd.append('nf', nf); fd.append('data', data);
        st.textContent = 'lançando…';
        const r = await apiFetch('/api/comprovantes/lancar', { method: 'POST', body: fd });
        const d = await r.json().catch(() => ({}));
        if (r.ok) { l.feito = true; ok += 1; st.innerHTML = '<span style="color:var(--verde);">✓ lançada</span>'; l.nfCampo.disabled = true; l.dataCampo.disabled = true; }
        else { falhas += 1; st.innerHTML = `<span style="color:var(--vermelho);" title="${cfEsc(d.erro || '')}">✕ ${cfEsc(d.erro || 'erro')}</span>`; }
      }
      btn.disabled = false;
      mostrarAlerta(`${ok} entrega(s) lançada(s) com a foto do canhoto${falhas ? ` · ${falhas} com pendência (veja na lista)` : ''}.`, { tipo: falhas ? 'info' : 'sucesso' });
      if (ok) carregarEntregasPrevistas();
    });
  };
  zona.addEventListener('click', () => input.click());
  input.addEventListener('change', () => { adicionar(input.files); input.value = ''; });
  zona.addEventListener('dragover', (e) => { e.preventDefault(); zona.style.borderColor = 'var(--azul)'; });
  zona.addEventListener('dragleave', () => { zona.style.borderColor = ''; });
  zona.addEventListener('drop', (e) => { e.preventDefault(); zona.style.borderColor = ''; adicionar(e.dataTransfer.files); });
}

// ---------- Manutenção: configuração da leitura por IA ----------
async function carregarConfigIa() {
  const st = document.getElementById('iaStatus');
  if (!st) return;
  try {
    const r = await apiFetch('/api/comprovantes/ia');
    if (!r.ok) return;
    const d = await r.json();
    document.getElementById('iaAtiva').checked = d.ativa;
    document.getElementById('iaModelo').value = d.modelo || d.modeloPadrao;
    st.innerHTML = d.temChave ? `Chave guardada. ${d.ativa ? '<b style="color:var(--verde);">Ligada.</b>' : 'Desligada.'}` : 'Nenhuma chave informada (leitura manual).';
  } catch (e) { /* segue */ }
}
document.getElementById('btnIaSalvar')?.addEventListener('click', async () => {
  const corpo = { ativa: document.getElementById('iaAtiva').checked, modelo: document.getElementById('iaModelo').value };
  const chave = document.getElementById('iaChave').value.trim();
  if (chave) corpo.chave = chave;
  const r = await apiFetch('/api/comprovantes/ia', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
  document.getElementById('iaChave').value = '';
  mostrarAlerta(r.ok ? 'Configuração salva.' : 'Não consegui salvar.', { tipo: r.ok ? 'sucesso' : 'erro' });
  carregarConfigIa();
});
document.getElementById('btnIaTestar')?.addEventListener('click', async () => {
  const st = document.getElementById('iaStatus'); st.textContent = 'Testando…';
  const r = await apiFetch('/api/comprovantes/ia/testar', { method: 'POST' });
  const d = await r.json();
  st.innerHTML = r.ok ? `<span style="color:var(--verde);">✓ ${cfEsc(d.mensagem)}</span>` : `<span style="color:var(--vermelho);">${cfEsc(d.erro)}</span>`;
});
carregarConfigIa();


// ---------- Consolidar rotas (pedidos liberados, antes da nota fiscal) ----------
let crDados = null;
const crMarcados = new Set();
let crTimer = null;
const crPorId = new Map();
// Pedidos marcados guardados (id -> pedido): continuam marcados ao trocar a busca
// ou o filtro — a carga vai acumulando de uma busca para outra.
const crGuardados = new Map();
const crChaveDestino = (d) => `${d.tipo}|${d.redespacho || ''}|${d.cidade || ''}|${d.uf || ''}`.toUpperCase();
let crSoMarcados = false;
function veiculoParaCarga(veiculos, kg, m3, m3Completo) {
  const lista = [...(veiculos || [])].sort((a, b) => a.kg - b.kg);
  if (!lista.length || (!(kg > 0) && !(m3 > 0))) return null;   // sem peso e sem m³ não dá para indicar
  // Usa o m³ informado mesmo incompleto (é o mínimo); se faltar medida, avisa que pode ser maior.
  const usaM3 = m3 > 0;
  const cabe = lista.find((v) => kg <= v.kg && (!usaM3 || !v.m3 || m3 <= v.m3));
  const maior = lista[lista.length - 1];
  const v = cabe || maior;
  const qtd = cabe ? 1 : Math.max(Math.ceil(kg / maior.kg), usaM3 && maior.m3 ? Math.ceil(m3 / maior.m3) : 1);
  return { nome: v.nome, quantidade: qtd, pesoPct: kg > 0 ? Math.round((100 * kg) / (v.kg * qtd)) : null, m3Pct: usaM3 && v.m3 ? Math.round((100 * m3) / (v.m3 * qtd)) : null,
    porPeso: !usaM3, porM3: !(kg > 0), m3Incompleto: usaM3 && !m3Completo };
}
function textoVeiculo(v) {
  if (!v) return '';
  const partes = [v.pesoPct != null ? `${v.pesoPct}% do peso` : '', v.m3Pct != null ? `${v.m3Pct}% do volume` : ''].filter(Boolean).join(' · ');
  return `🚚 <b>${v.quantidade > 1 ? `${v.quantidade}× ` : ''}${cfEsc(v.nome)}</b> <small>(${partes}${v.porPeso ? ' — só pelo peso' : ''}${v.porM3 ? ' — só pelo m³, sem peso na planilha' : ''}${v.m3Incompleto ? ' — <span style="color:#e8890c;">m³ pode ser maior</span>' : ''})</small>`;
}
function totaisDe(pedidos) {
  const kg = pedidos.reduce((a, p) => a + (p.peso || 0), 0);
  const m3 = pedidos.reduce((a, p) => a + (p.cubagem || 0), 0);
  const semCub = pedidos.filter((p) => !(p.cubagem > 0)).length;
  const semMedida = pedidos.filter((p) => p.itens_sem_medida > 0);   // pedidos com item sem medida (ITENS_SEM_MEDIDA > 0)
  return { qtd: pedidos.length, vol: pedidos.reduce((a, p) => a + (p.volumes || 0), 0), kg, m3, semCub,
    semMedida: semMedida.length, itensSemMedida: semMedida.reduce((a, p) => a + p.itens_sem_medida, 0),
    veiculo: veiculoParaCarga(crDados?.veiculos, kg, m3, semCub === 0 && semMedida.length === 0) };
}
const tituloDestino = (d) => (d.tipo === 'redespacho'
  ? `🔀 Redespacho ${cfEsc(d.redespacho || '')}${d.cidade ? ` — ${cfEsc(d.cidade)}` : ' — <span style="color:#e8890c;">cidade do redespacho não informada</span>'}`
  : `📍 ${cfEsc(d.cidade || '— sem cidade —')}${d.uf ? `/${cfEsc(d.uf)}` : ''}`);
async function carregarRotas() {
  const caixa = document.getElementById('crGrupos');
  if (!caixa) return;
  const desdeEl = document.getElementById('crDesde');
  if (!desdeEl.value) desdeEl.value = dataParaBr(new Date(Date.now() - 30 * 86400000));
  const params = new URLSearchParams({ desde: dataBrParaIso(desdeEl.value) || '', ate: dataBrParaIso(document.getElementById('crAte').value) || '',
    busca: document.getElementById('crBusca').value.trim(), faturados: document.getElementById('crFaturados').checked ? '1' : '0' });
  caixa.innerHTML = '<p style="color:var(--texto-fraco);">Carregando os pedidos liberados…</p>';
  try {
    const r = await apiFetch(`/api/fretes/relatorios/consolidar-rotas?${params}`);
    const d = await r.json();
    if (!r.ok) { caixa.innerHTML = `<p>${cfEsc(d.erro || 'Erro')}</p>`; return; }
    crDados = d; crPorId.clear();
    d.grupos.forEach((g, gi) => g.pedidos.forEach((p) => {
      p._grupo = gi; p._destino = g.destino; p._destKey = crChaveDestino(g.destino);
      crPorId.set(String(p.id), p);
      if (crMarcados.has(String(p.id))) crGuardados.set(String(p.id), p);   // atualiza o guardado com os dados novos
    }));
    // "Ver só os marcados": a lista passa a ser só os pedidos guardados (de qualquer busca).
    if (crSoMarcados) {
      const porDest = new Map();
      [...crMarcados].map((id) => crGuardados.get(id)).filter(Boolean).forEach((p) => {
        if (!porDest.has(p._destKey)) porDest.set(p._destKey, { destino: p._destino, pedidos: [] });
        porDest.get(p._destKey).pedidos.push(p);
      });
      d.grupos = [...porDest.values()].map((g) => ({ ...g, qtd: g.pedidos.length, peso: g.pedidos.reduce((a, p) => a + (p.peso || 0), 0) }))
        .sort((a, b) => b.peso - a.peso);
      d.grupos.forEach((g, gi) => g.pedidos.forEach((p) => { p._grupo = gi; crPorId.set(String(p.id), p); }));
      const marcados = d.grupos.flatMap((g) => g.pedidos);
      d.resumo = { destinos: d.grupos.length, pedidos: crMarcados.size, peso: d.grupos.reduce((a, g) => a + g.peso, 0),
        cubagem: marcados.reduce((a, p) => a + (p.cubagem || 0), 0), volumes: marcados.reduce((a, p) => a + (p.volumes || 0), 0),
        semPeso: marcados.filter((p) => !(p.peso > 0)).length, semCubagem: marcados.filter((p) => !(p.cubagem > 0)).length };
    }
    const rs = d.resumo;
    document.getElementById('crResumo').innerHTML = `
      <div>Destinos<strong>${rs.destinos}</strong>${rs.pedidos} pedido(s) ${crSoMarcados ? 'marcado(s) — <a href="#" id="crVerTodos" style="color:var(--azul);">ver todos</a>' : 'liberado(s)'}</div>
      <div style="border-left-color:#f59e0b;">Peso total<strong>${Number(rs.peso || 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} kg</strong>${rs.semPeso ? `<span style="color:#e8890c;">${rs.semPeso} pedido(s) sem peso</span>` : ''}</div>
      <div style="border-left-color:#8b5cf6;">Cubagem total<strong>${Number(rs.cubagem || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} m³</strong>${rs.semCubagem ? `<span style="color:#e8890c;">${rs.semCubagem} pedido(s) sem m³</span>` : ''}</div>
      ${rs.volumes != null ? `<div style="border-left-color:var(--verde);">Volumes<strong>${numVolumes(rs.volumes)}</strong></div>` : ''}`;
    // Planilha sem peso: o caminhão fica só pelo m³ — avisa onde está o problema.
    const avisoPeso = rs.semPeso && rs.pedidos && rs.semPeso / rs.pedidos >= 0.5
      ? `<div class="cr-aviso" style="margin:0 0 10px;">⚠ ${rs.semPeso === rs.pedidos ? 'Nenhum pedido' : `${rs.semPeso} de ${rs.pedidos} pedidos`} veio com peso da planilha do ERP. Confira se a planilha tem a coluna
        <b>PESO_KG</b> (também vale PESO, PESO_BRUTO ou PESO_TOTAL) e importe de novo. Sem o peso, o caminhão é indicado só pelo m³.</div>` : '';
    if (!d.grupos.length) { caixa.innerHTML = '<p style="color:var(--texto-fraco);">Nenhum pedido liberado sem nota fiscal neste período. Importe a planilha do ERP em Enviar XML.</p>'; atualizarBarraRotas(); return; }
    const ordem = document.getElementById('crOrdem')?.value || 'carga';
    const grupos = d.grupos.map((g, gi) => ({ g, gi, t: totaisDe(g.pedidos) }));
    if (ordem === 'pedidos') grupos.sort((a, b) => b.g.pedidos.length - a.g.pedidos.length || b.t.kg - a.t.kg);
    else if (ordem === 'cidade') grupos.sort((a, b) => String(a.g.destino.cidade || '').localeCompare(String(b.g.destino.cidade || ''), 'pt-BR'));
    else grupos.sort((a, b) => b.t.kg - a.t.kg || b.t.m3 - a.t.m3 || b.g.pedidos.length - a.g.pedidos.length);
    // Muitos destinos: começam recolhidos (só o cabeçalho com os totais e o caminhão).
    const recolher = crAbertos === null ? grupos.length > 8 : null;
    caixa.innerHTML = avisoPeso + `<div style="display:flex; gap:10px; justify-content:flex-end; margin-bottom:8px; font-size:12.5px;">
        <a href="#" id="crExpandirTodos" style="color:var(--azul);">Expandir todos</a><a href="#" id="crRecolherTodos" style="color:var(--azul);">Recolher todos</a></div>`
      + grupos.map(({ g, gi, t }, k) => {
        const aberto = recolher === null ? crAbertos.has(gi) || g.pedidos.some((p) => crMarcados.has(String(p.id))) : !recolher;
        const veic = t.veiculo ? textoVeiculo(t.veiculo) : '<small style="color:var(--texto-fraco);">sem peso e sem m³ para indicar o caminhão</small>';
        return `<div class="cr-grupo" data-g="${gi}" style="border:1px solid var(--borda); border-radius:var(--raio); margin-bottom:10px;">
        <div style="display:flex; gap:10px; align-items:center; padding:10px 14px ${aberto ? '4px' : '10px'}; flex-wrap:wrap;">
          <button type="button" class="cr-alternar" data-g="${gi}" title="${aberto ? 'Recolher' : 'Mostrar os pedidos'}" style="background:none; border:0; color:var(--texto); cursor:pointer; font-size:14px; width:20px;">${aberto ? '▾' : '▸'}</button>
          <label style="display:flex; gap:10px; align-items:center; cursor:pointer;">
            <input type="checkbox" class="cr-grupo-marca" data-g="${gi}" title="Marcar todos os pedidos deste destino" />
            <span style="font-weight:800; font-size:15px;">${k + 1}. ${tituloDestino(g.destino)}</span></label>
          <span style="font-size:12.5px; color:var(--texto-fraco);">— ${g.pedidos.length} pedido(s) · ${numVolumes(t.vol)} vol · ${t.kg ? `${t.kg.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} kg` : '<span style="color:#e8890c;">sem peso</span>'} ·
            ${t.m3 ? `${t.m3.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} m³` : '— m³'}${t.semCub ? ` <span style="color:#e8890c;">(${t.semCub} sem m³)</span>` : ''}
            ${t.semMedida ? ` · <span style="color:#e8890c; font-weight:700;" title="Pedidos com itens sem medida: a cubagem real é maior que a informada">⚠ ${t.semMedida} pedido(s) com itens sem medida</span>` : ''}</span>
          <span style="font-size:12.5px; margin-left:auto;">${veic}</span>
        </div>
        <div class="cr-pedidos${aberto ? '' : ' oculto'}" data-g="${gi}" style="padding:0 14px 10px; overflow-x:auto;">
          <table class="cr-tabela" style="width:100%; font-size:12.5px;"><thead><tr><th style="width:28px;"></th><th style="text-align:left;">Cliente</th><th style="text-align:left;">Pedido</th>
            <th style="text-align:left;">Cidade / bairro</th><th style="text-align:left;">Transportadora</th><th style="text-align:left;">Liberado</th>
            <th style="text-align:right;">Volumes</th><th style="text-align:right;">Peso</th><th style="text-align:right;">m³</th></tr></thead><tbody>
            ${g.pedidos.map((p) => `<tr class="cr-linha${crMarcados.has(String(p.id)) ? ' cr-sel' : ''}" data-id="${p.id}" style="cursor:pointer;"><td><input type="checkbox" class="cr-marca" data-id="${p.id}" ${crMarcados.has(String(p.id)) ? 'checked' : ''} /></td>
              <td>${cfEsc(p.cliente || '—')}</td><td style="white-space:nowrap;">${cfEsc(p.pedido)}${p.mercus ? `<br><small style="color:var(--texto-fraco);">Mercus ${cfEsc(p.mercus)}</small>` : ''}</td>
              <td>${cfEsc(p.cidade || '—')}${p.bairro ? ` — ${cfEsc(p.bairro)}` : ''}${p.redespacho ? `<br><small style="color:#8b5cf6;">🔀 ${cfEsc(p.redespacho)}</small>` : ''}${p.entrega_em ? `<br><small style="color:#8b5cf6;" title="Endereço de entrega informado na observação do pedido">📍 Entrega em ${cfEsc(p.entrega_em)}</small>` : ''}</td>
              <td>${cfEsc(p.transportadora || '—')}</td><td style="white-space:nowrap;">${p.data_liberacao ? formatoData(p.data_liberacao) : '—'}</td>
              <td style="text-align:right;">${p.volumes ? numVolumes(p.volumes) : '—'}</td><td style="text-align:right; white-space:nowrap;">${p.peso ? `${p.peso.toLocaleString('pt-BR')} kg` : '<span style="color:#e8890c;">—</span>'}</td>
              <td style="text-align:right; white-space:nowrap;">${p.cubagem ? p.cubagem.toLocaleString('pt-BR') : '<span style="color:#e8890c;">—</span>'}${p.itens_sem_medida > 0
                ? `<br><span style="color:#e8890c; font-weight:700;" title="ITENS_SEM_MEDIDA na planilha: a cubagem deste pedido está incompleta">⚠ ${p.itens_sem_medida} item(ns) sem medida</span>` : ''}</td></tr>`).join('')}
          </tbody></table></div></div>`;
      }).join('');
    if (recolher !== null) crAbertos = new Set(grupos.filter(() => !recolher).map(({ gi }) => gi));
    sincronizarMarcasGrupos(); atualizarBarraRotas();
  } catch (err) { caixa.innerHTML = '<p>Falha de conexão com o servidor.</p>'; }
}
// Volumes da planilha podem vir fracionados: no máximo 2 casas.
const numVolumes = (v) => (Number(v) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
let crAbertos = null;   // destinos abertos (null = decidir pela quantidade de destinos)
document.getElementById('crGrupos')?.addEventListener('click', (e) => {
  const alternar = e.target.closest('.cr-alternar');
  if (alternar) {
    const gi = Number(alternar.dataset.g);
    const div = document.querySelector(`.cr-pedidos[data-g="${gi}"]`);
    const abrir = div.classList.contains('oculto');
    div.classList.toggle('oculto', !abrir);
    alternar.textContent = abrir ? '▾' : '▸';
    if (crAbertos) { if (abrir) crAbertos.add(gi); else crAbertos.delete(gi); }
    return;
  }
  if (e.target.id === 'crExpandirTodos' || e.target.id === 'crRecolherTodos') {
    e.preventDefault();
    const abrir = e.target.id === 'crExpandirTodos';
    document.querySelectorAll('.cr-pedidos').forEach((div) => div.classList.toggle('oculto', !abrir));
    document.querySelectorAll('.cr-alternar').forEach((b) => { b.textContent = abrir ? '▾' : '▸'; });
    crAbertos = new Set(abrir ? (crDados?.grupos || []).map((_, gi) => gi) : []);
  }
});
document.getElementById('crOrdem')?.addEventListener('change', () => carregarRotas());
function sincronizarMarcasGrupos() {
  document.querySelectorAll('.cr-grupo-marca').forEach((cb) => {
    const ped = crDados.grupos[Number(cb.dataset.g)].pedidos;
    const n = ped.filter((p) => crMarcados.has(String(p.id))).length;
    cb.checked = n === ped.length && n > 0; cb.indeterminate = n > 0 && n < ped.length;
  });
}
function atualizarBarraRotas() {
  const barra = document.getElementById('crBarra');
  if (!barra) return;
  const sel = [...crMarcados].map((id) => crGuardados.get(id)).filter(Boolean);
  document.querySelectorAll('.cr-linha').forEach((tr) => tr.classList.toggle('cr-sel', crMarcados.has(String(tr.dataset.id))));
  if (!sel.length) {
    document.getElementById('crBarraTexto').innerHTML = '<div class="cr-titulo">🚚 Carga montada</div><div style="color:var(--texto-fraco); margin-top:6px; font-size:14px;">Marque os pedidos abaixo — o peso, os volumes, o m³ e o caminhão aparecem aqui a cada clique.</div>';
    return;
  }
  const t = totaisDe(sel);
  const destinos = new Set(sel.map((p) => p._destKey)).size;
  const foraDaBusca = sel.filter((p) => !crPorId.has(String(p.id))).length;
  const semPeso = sel.filter((p) => !(p.peso > 0)).length;
  const semVol = sel.filter((p) => !(p.volumes > 0)).length;
  const num = (v, d = 0) => (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
  const numVol = (v) => (Number(v) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
  const tile = (rotulo, valor, extra = '', alerta = false) => `<div class="cr-tile${alerta ? ' cr-tile-alerta' : ''}"><span>${rotulo}</span><b>${valor}</b>${extra ? `<small>${extra}</small>` : ''}</div>`;
  const barraOcup = (rot, pct) => (pct == null ? '' : `<div class="cr-ocup"><span>${rot}</span><div class="cr-ocup-trilho"><div style="width:${Math.min(100, pct)}%; background:${pct > 100 ? 'var(--vermelho)' : pct >= 85 ? '#e8890c' : 'var(--verde)'};"></div></div><b>${pct}%</b></div>`);
  const v = t.veiculo;
  document.getElementById('crBarraTexto').innerHTML = `<div class="cr-titulo">🚚 Carga montada</div>
    <div class="cr-tiles">
      ${tile('Pedidos', num(t.qtd), `${destinos} destino(s)`)}
      ${tile('Volumes', numVol(t.vol), semVol ? `${semVol} pedido(s) sem volume na planilha` : '', !!semVol)}
      ${tile('Peso', `${num(t.kg, 1)} kg`, semPeso ? `${semPeso} pedido(s) sem peso na planilha` : '', !!semPeso)}
      ${tile('Cubagem', t.m3 ? `${num(t.m3, 2)} m³` : '— m³', t.semCub ? `${t.semCub} pedido(s) sem m³` : (t.semMedida ? 'pode ser maior' : ''), !!(t.semCub || t.semMedida))}
      <div class="cr-tile cr-tile-veic"><span>Caminhão indicado</span>
        <b>${v ? `${v.quantidade > 1 ? `${v.quantidade}× ` : ''}${cfEsc(v.nome)}` : '—'}</b>
        ${v ? `${barraOcup('Peso', v.pesoPct)}${barraOcup('Volume', v.m3Pct)}${v.porPeso ? '<small>escolhido só pelo peso</small>' : ''}${v.porM3 ? '<small>escolhido só pelo m³ (sem peso)</small>' : ''}${v.m3Incompleto ? '<small style="color:#e8890c;">m³ pode ser maior</small>' : ''}` : ''}
      </div>
    </div>
    ${semPeso || semVol ? `<div class="cr-aviso">⚠ ${[semPeso ? `${semPeso} pedido(s) sem peso` : '', semVol ? `${semVol} sem volumes` : ''].filter(Boolean).join(' e ')} na planilha do ERP — o caminhão indicado ${semPeso ? 'não considera o peso desses pedidos' : 'pode estar subestimado'}.</div>` : ''}
    ${t.semMedida ? `<div class="cr-aviso">⚠ ${t.semMedida} pedido(s) com ${t.itensSemMedida} item(ns) sem medida — a cubagem real é maior que a mostrada; confira antes de fechar o caminhão.</div>` : ''}
    ${foraDaBusca ? `<div style="font-size:13px; color:var(--texto-fraco); margin-top:8px;">Inclui ${foraDaBusca} pedido(s) marcado(s) em outras buscas —
      <a href="#" id="crVerMarcados" style="color:var(--azul);">ver só os marcados</a></div>` : ''}`;
}
document.getElementById('crGrupos')?.addEventListener('click', (e) => {
  const tr = e.target.closest('tr.cr-linha');
  if (!tr || e.target.closest('input')) return;   // clique na linha = clique na caixinha
  const cb = tr.querySelector('.cr-marca');
  cb.checked = !cb.checked;
  cb.dispatchEvent(new Event('change', { bubbles: true }));
});
document.getElementById('crGrupos')?.addEventListener('change', (e) => {
  if (e.target.classList.contains('cr-marca')) {
    const id = String(e.target.dataset.id);
    if (e.target.checked) {
      crMarcados.add(id); crGuardados.set(id, crPorId.get(id));
      const p = crPorId.get(id);
      if (p?.itens_sem_medida > 0) mostrarAlerta(`⚠ O pedido ${p.pedido} (${p.cliente || ''}) tem ${p.itens_sem_medida} item(ns) sem medida: a cubagem real é maior que a informada.`, { tipo: 'info' });
    } else { crMarcados.delete(id); crGuardados.delete(id); }
  } else if (e.target.classList.contains('cr-grupo-marca')) {
    const g = Number(e.target.dataset.g);
    crDados.grupos[g].pedidos.forEach((p) => { const id = String(p.id); if (e.target.checked) { crMarcados.add(id); crGuardados.set(id, p); } else { crMarcados.delete(id); crGuardados.delete(id); } });
    const comFalta = e.target.checked ? crDados.grupos[g].pedidos.filter((p) => p.itens_sem_medida > 0) : [];
    if (comFalta.length) mostrarAlerta(`⚠ ${comFalta.length} pedido(s) deste destino têm itens sem medida (${comFalta.map((p) => p.pedido).slice(0, 8).join(', ')}${comFalta.length > 8 ? '…' : ''}): a cubagem real é maior que a informada.`, { tipo: 'info' });
    document.querySelectorAll(`.cr-pedidos[data-g="${g}"] .cr-marca`).forEach((cb) => { cb.checked = e.target.checked; });
  } else return;
  sincronizarMarcasGrupos(); atualizarBarraRotas();
});
['crDesde', 'crAte', 'crFaturados'].forEach((id) => document.getElementById(id)?.addEventListener('change', () => { crSoMarcados = false; crAbertos = null; carregarRotas(); }));
document.getElementById('crBusca')?.addEventListener('input', () => { crSoMarcados = false; crAbertos = null; clearTimeout(crTimer); crTimer = setTimeout(carregarRotas, 400); });
document.getElementById('crResumo')?.addEventListener('click', (e) => { if (e.target.id === 'crVerTodos') { e.preventDefault(); crSoMarcados = false; carregarRotas(); } });
document.getElementById('btnCrLimpar')?.addEventListener('click', () => { crMarcados.clear(); crGuardados.clear(); crSoMarcados = false; document.querySelectorAll('.cr-marca').forEach((c) => { c.checked = false; }); sincronizarMarcasGrupos(); atualizarBarraRotas(); });
// Concluir: a carga montada (por destino), com totais, caminhão, impressão e Excel.
function abrirCargaMontada(acao, janela = null) {
  const sel = [...crMarcados].map((id) => crGuardados.get(id)).filter(Boolean);
  if (!sel.length) return;
  const t = totaisDe(sel);
  const porDestino = new Map();
  sel.forEach((p) => { if (!porDestino.has(p._destKey)) porDestino.set(p._destKey, []); porDestino.get(p._destKey).push(p); });
  // [destino, pedidos] — o destino vem do próprio pedido (pode ter sido marcado em outra busca)
  const blocos = [...porDestino.values()].map((ped) => [ped[0]._destino, ped]).sort((a, b) => totaisDe(b[1]).kg - totaisDe(a[1]).kg);
  const fundo = document.createElement('div');
  fundo.className = 'ep-historico-fundo';
  fundo.innerHTML = `<div class="ep-historico" style="width:min(1000px, 100%);">
    <div style="display:flex; justify-content:space-between; gap:12px; align-items:flex-start;"><div><h3 style="margin:0;">🚚 Carga montada</h3>
      <div style="font-size:13px; margin-top:6px;">${t.qtd} pedido(s) · ${blocos.length} destino(s) · ${numVolumes(t.vol)} volume(s) · ⚖ <b>${t.kg.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} kg</b>
        · 📦 <b>${t.m3 ? `${t.m3.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} m³` : '— m³'}</b>${t.semCub ? ` <small style="color:#e8890c;">(${t.semCub} pedido(s) sem m³ — caminhão escolhido só pelo peso)</small>` : ''}</div>
      <div style="font-size:15px; margin-top:6px;">${textoVeiculo(t.veiculo)}</div></div>
      <div style="display:flex; gap:8px;"><button class="btn btn-secundario" data-imprimir style="width:auto;">🖨 Imprimir / PDF</button>
        <button class="btn btn-secundario" data-excel style="width:auto;">⬇ Excel</button><button class="btn btn-secundario" data-fechar style="width:auto;">Fechar</button></div></div>
    <div style="max-height:62vh; overflow:auto; margin-top:10px;">
    ${blocos.map(([gi, ped], k) => { const g = ({ destino: gi }); const tg = totaisDe(ped); return `
      <div style="margin-bottom:12px;"><div style="font-weight:700; margin-bottom:4px;">${k + 1}. ${tituloDestino(g.destino)} <small style="font-weight:400; color:var(--texto-fraco);">— ${ped.length} pedido(s) · ${numVolumes(tg.vol)} vol · ${tg.kg.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} kg${tg.m3 ? ` · ${tg.m3.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} m³` : ''}</small></div>
      <table style="width:100%; font-size:12.5px;"><thead><tr><th style="text-align:left;">Cliente</th><th style="text-align:left;">Pedido</th><th style="text-align:left;">Nr. Mercus</th><th style="text-align:left;">Cidade / bairro</th>
        <th style="text-align:left;">Transportadora</th><th style="text-align:right;">Volumes</th><th style="text-align:right;">Peso</th><th style="text-align:right;">m³</th></tr></thead><tbody>
        ${ped.map((p) => `<tr><td>${cfEsc(p.cliente || '—')}</td><td>${cfEsc(p.pedido)}</td><td>${cfEsc(p.mercus || '—')}</td><td>${cfEsc(p.cidade || '')}${p.bairro ? ` — ${cfEsc(p.bairro)}` : ''}</td>
          <td>${cfEsc(p.transportadora || '—')}</td><td style="text-align:right;">${p.volumes || '—'}</td><td style="text-align:right;">${p.peso ? p.peso.toLocaleString('pt-BR') : '—'}</td>
          <td style="text-align:right;">${p.cubagem ? p.cubagem.toLocaleString('pt-BR') : '—'}</td></tr>`).join('')}</tbody></table></div>`; }).join('')}
    </div>
    <p style="font-size:12px; color:var(--texto-fraco); margin:8px 0 0;">A ordem de entrega com a rota, o tempo entre as paradas e as restrições de cada destino entram na próxima etapa.</p>
  </div>`;
  const linhasPlanas = () => blocos.flatMap(([gi, ped], k) => ped.map((p) => [k + 1, ({ destino: gi }).destino.tipo === 'redespacho' ? `Redespacho ${({ destino: gi }).destino.redespacho || ''} - ${({ destino: gi }).destino.cidade || ''}` : `${({ destino: gi }).destino.cidade || ''}/${({ destino: gi }).destino.uf || ''}`,
    p.cliente, p.pedido, p.mercus, p.data_liberacao ? formatoData(p.data_liberacao) : '', p.transportadora, p.redespacho, p.cidade, p.bairro, p.volumes, p.peso, p.cubagem]));
  const cab = ['Ordem', 'Destino', 'Cliente', 'Pedido', 'Nr. Mercus', 'Dt. Liberação', 'Transportadora', 'Redespacho', 'Cidade', 'Bairro', 'Volumes', 'Peso (kg)', 'm³'];
  fundo.addEventListener('click', (e) => {
    if (e.target === fundo || e.target.closest('[data-fechar]')) { fundo.remove(); return; }
    if (e.target.closest('[data-excel]')) {
      const num = (v) => (typeof v === 'number' ? String(v).replace('.', ',') : v);
      const csv = [cab, ...linhasPlanas().map((l) => l.map(num))].map((l) => l.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
      const link = document.createElement('a');
      link.href = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }));
      link.download = `carga-montada_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link); link.click(); link.remove();
    }
    if (e.target.closest('[data-imprimir]')) imprimirRomaneio(blocos, t, janela || window.open('', '_blank'));
  });
  // Imprimir/Excel direto do topo: monta e já dispara, sem mostrar a janela.
  if (acao) { fundo.querySelector(`[data-${acao}]`).click(); return; }
  document.body.appendChild(fundo);
}
document.getElementById('btnCrImprimir')?.addEventListener('click', () => {
  if (!crMarcados.size) { mostrarAlerta('Marque os pedidos primeiro.', { tipo: 'info' }); return; }
  // A aba é aberta JÁ no clique (senão o navegador bloqueia); o romaneio é escrito nela em seguida.
  const janela = window.open('', '_blank');
  if (janela) janela.document.write('<p style="font-family:Arial; padding:20px;">Montando o romaneio…</p>');
  abrirCargaMontada('imprimir', janela);
});
// Roteirizar os pedidos marcados: abre "Roteirizar entregas" já com eles marcados.
document.getElementById('btnCrRoteirizar')?.addEventListener('click', () => {
  const ids = [...crMarcados].filter((id) => /^\d+$/.test(id));
  if (!ids.length) { mostrarAlerta(crMarcados.size ? 'Os pedidos marcados ainda não estão no sistema (só na planilha do ERP) — eles entram depois da importação.' : 'Marque os pedidos primeiro.', { tipo: 'info' }); return; }
  if (ids.length < crMarcados.size) mostrarAlerta(`${crMarcados.size - ids.length} pedido(s) marcados só existem na planilha do ERP e ficaram de fora.`, { tipo: 'info' });
  window.roteirizarIds?.(ids);
  document.querySelector('.nav-subitem[data-subaba="roteirizar"]')?.click();
});
document.getElementById('btnCrExcel')?.addEventListener('click', () => { if (!crMarcados.size) { mostrarAlerta('Marque os pedidos primeiro.', { tipo: 'info' }); return; } abrirCargaMontada('excel'); });
document.querySelectorAll('input.campo-data').forEach(ativarCampoData);

document.getElementById('crBarra')?.addEventListener('click', (e) => {
  if (e.target.id !== 'crVerMarcados') return;
  e.preventDefault();
  document.getElementById('crBusca').value = '';
  crSoMarcados = true;
  carregarRotas();
});


// ---------- Romaneio de carga (impressão / PDF para enviar à transportadora) ----------
// Tudo em preto com bordas (os navegadores não imprimem cores de fundo por padrão).
async function imprimirRomaneio(blocos, t, janela = null) {
  try { await montarEImprimirRomaneio(blocos, t, janela); } catch (err) {
    console.error(err);
    try { janela?.close(); } catch (e) { /* segue */ }
    mostrarAlerta(`Não consegui montar o romaneio: ${err.message}`);
  }
}
async function montarEImprimirRomaneio(blocos, t, janela) {
  let emp = {};
  // Empresa ainda não cadastrada: o servidor devolve null — o romaneio sai sem os dados dela.
  try { const r = await apiFetch('/api/empresa'); if (r.ok) emp = (await r.json()) || {}; } catch (e) { emp = {}; }
  const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const n0 = (v, d = 0) => (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
  const cnpj = String(emp.cnpj || '').replace(/\D/g, '').replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  const agora = new Date();
  const v = t.veiculo;
  const veic = v ? `${v.quantidade > 1 ? `${v.quantidade}× ` : ''}${esc(v.nome)}` : '—';
  const ocup = v ? `${v.pesoPct}% do peso${v.m3Pct != null ? ` · ${v.m3Pct}% do volume` : ''}${v.porPeso ? ' (só pelo peso)' : ''}${v.m3Incompleto ? ' — m³ pode ser maior' : ''}` : '';
  const tituloDest = (d) => (d.tipo === 'redespacho' ? `Redespacho ${esc(d.redespacho || '')}${d.cidade ? ` — ${esc(d.cidade)}` : ''}` : `${esc(d.cidade || '—')}${d.uf ? `/${esc(d.uf)}` : ''}`);
  let seq = 0;
  const secoes = blocos.map(([dest, ped], k) => {
    const tg = totaisDe(ped);
    return `<section class="destino">
      <h2><span class="num">${k + 1}</span> ${tituloDest(dest)} <small>${ped.length} pedido(s) · ${n0(tg.vol)} vol · ${n0(tg.kg, 1)} kg${tg.m3 ? ` · ${n0(tg.m3, 2)} m³` : ''}</small></h2>
      <table class="itens"><colgroup><col style="width:4%"><col style="width:25%"><col style="width:7%"><col style="width:7.5%"><col style="width:14%"><col style="width:18%"><col style="width:7%"><col style="width:8.5%"><col style="width:5%"><col style="width:4%"></colgroup>
        <thead><tr><th class="c">#</th><th>Cliente</th><th>Pedido</th><th>Nr. Mercus</th><th>Cidade / bairro</th><th>Transportadora</th>
        <th class="d">Volumes</th><th class="d">Peso (kg)</th><th class="d">m³</th><th class="c">Conf.</th></tr></thead><tbody>
        ${ped.map((p) => { seq += 1; return `<tr><td class="c">${seq}</td><td><b>${esc(p.cliente || '—')}</b>${p.redespacho ? `<div class="red">Redespacho: ${esc(p.redespacho)}</div>` : ''}</td>
          <td>${esc(p.pedido)}${p.itens_sem_medida > 0 ? `<div class="red"><b>⚠ ${p.itens_sem_medida} item(ns) sem medida</b></div>` : ''}</td><td>${esc(p.mercus || '—')}</td><td>${esc(p.cidade || '')}${p.uf ? `/${esc(p.uf)}` : ''}${p.bairro ? `<div class="sub">${esc(p.bairro)}</div>` : ''}</td>
          <td>${esc(p.transportadora || '—')}</td><td class="d">${n0(p.volumes)}</td><td class="d">${p.peso ? n0(p.peso, 1) : '—'}</td><td class="d">${p.cubagem ? n0(p.cubagem, 2) : '—'}</td><td class="c caixa">☐</td></tr>`; }).join('')}
        <tr class="sub-total"><td colspan="6">Subtotal ${tituloDest(dest)}</td><td class="d">${n0(tg.vol)}</td><td class="d">${n0(tg.kg, 1)}</td><td class="d">${tg.m3 ? n0(tg.m3, 2) : '—'}</td><td></td></tr>
      </tbody></table></section>`;
  }).join('');
  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>Romaneio de carga ${agora.toLocaleDateString('pt-BR')}</title><style>
    @page { size: A4 landscape; margin: 10mm 10mm 12mm; }
    * { -webkit-print-color-adjust: exact; print-color-adjust: exact; box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; color: #000; font-size: 12px; margin: 0; }
    .topo { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2.5px solid #000; padding-bottom: 8px; margin-bottom: 10px; }
    .empresa b { font-size: 16px; } .empresa div { font-size: 11.5px; margin-top: 2px; }
    .titulo { text-align: right; } .titulo h1 { font-size: 22px; margin: 0; letter-spacing: .5px; } .titulo div { font-size: 12px; margin-top: 3px; }
    table.resumo { border-collapse: separate; border-spacing: 6px 0; margin: 0 -6px 12px; width: calc(100% + 12px); }
    table.resumo td { border: 1.5px solid #000; border-radius: 6px; padding: 6px 8px; background: #fff !important; vertical-align: top; }
    table.resumo span { display: block; font-size: 10.5px; text-transform: uppercase; letter-spacing: .4px; }
    table.resumo b { font-size: 16px; } table.resumo small { display: block; font-size: 11px; font-weight: normal; }
    h2 { font-size: 14.5px; margin: 14px 0 5px; }
    h2 small { font-weight: normal; font-size: 12px; margin-left: 8px; }
    h2 .num { display: inline-block; min-width: 22px; height: 22px; line-height: 19px; text-align: center; border: 2px solid #000; border-radius: 50%; font-size: 12px; margin-right: 6px; }
    table { width: 100%; border-collapse: collapse; page-break-inside: auto; }
    table.itens { table-layout: fixed; } table.itens td { word-wrap: break-word; }
    tr { page-break-inside: avoid; }
    th { text-align: left; font-size: 11.5px; text-transform: uppercase; border-top: 1.5px solid #000; border-bottom: 1.5px solid #000; padding: 5px 5px; color: #000; }
    td { border-bottom: 1px solid #999; padding: 5px 5px; vertical-align: top; font-size: 12px; color: #000; }
    tbody tr:nth-child(even) td { background: #f1f1f1; }
    .d { text-align: right; white-space: nowrap; } .c { text-align: center; } .caixa { font-size: 15px; }
    .sub { font-size: 11px; } .red { font-size: 11px; font-style: italic; }
    .sub-total td { font-weight: bold; border-top: 1.5px solid #000; border-bottom: 1.5px solid #000; background: #fff !important; }
    .geral { margin-top: 12px; border: 2px solid #000; border-radius: 6px; padding: 8px 12px; display: flex; justify-content: space-between; font-size: 13.5px; font-weight: bold; }
    table.assinaturas { border-collapse: separate; border-spacing: 18px 0; margin: 38px -18px 0; width: calc(100% + 36px); page-break-inside: avoid; }
    table.assinaturas td { border: none; border-top: 1.5px solid #000; padding-top: 4px; font-size: 11px; text-align: center; background: #fff !important; }
    .rodape { margin-top: 14px; font-size: 10.5px; text-align: center; }
  </style></head><body>
    <div class="topo">
      <div class="empresa">${logoImpressao(56) ? `<div style="margin-bottom:6px;">${logoImpressao(56)}</div>` : ''}<b>${esc(emp.razao_social || emp.nome_fantasia || 'Empresa')}</b>
        ${cnpj ? `<div>CNPJ ${esc(cnpj)}${emp.ie ? ` · IE ${esc(emp.ie)}` : ''}</div>` : ''}
        ${emp.endereco || emp.municipio ? `<div>${[emp.endereco, emp.bairro, emp.municipio ? `${emp.municipio}${emp.uf ? `/${emp.uf}` : ''}` : '', emp.cep ? `CEP ${emp.cep}` : ''].filter(Boolean).map(esc).join(' — ')}</div>` : ''}
        ${emp.telefone || emp.email ? `<div>${esc(emp.telefone || '')}${emp.telefone && emp.email ? ' · ' : ''}${esc(emp.email || '')}</div>` : ''}</div>
      <div class="titulo"><h1>ROMANEIO DE CARGA</h1><div>Emitido em ${agora.toLocaleDateString('pt-BR')} às ${agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</div></div>
    </div>
    <table class="resumo"><tr>
      <td style="width:13%;"><span>Pedidos</span><b>${n0(t.qtd)}</b></td>
      <td style="width:13%;"><span>Destinos</span><b>${blocos.length}</b></td>
      <td style="width:13%;"><span>Volumes</span><b>${n0(t.vol)}</b></td>
      <td style="width:17%;"><span>Peso total</span><b>${n0(t.kg, 1)} kg</b></td>
      <td style="width:14%;"><span>Cubagem</span><b>${t.m3 ? `${n0(t.m3, 2)} m³` : '—'}</b>${t.semCub ? `<small>${t.semCub} pedido(s) sem m³</small>` : ''}${t.semMedida ? `<small><b>⚠ ${t.semMedida} pedido(s) com itens sem medida — m³ pode ser maior</b></small>` : ''}</td>
      <td><span>Caminhão indicado</span><b>${veic}</b><small>${ocup}</small></td>
    </tr></table>
    ${secoes}
    <div class="geral"><span>TOTAL GERAL — ${n0(t.qtd)} pedido(s) · ${blocos.length} destino(s)</span><span>${n0(t.vol)} volumes · ${n0(t.kg, 1)} kg${t.m3 ? ` · ${n0(t.m3, 2)} m³` : ''}</span></div>
    <table class="assinaturas" style="table-layout:fixed;"><tr><td>Conferente (expedição)</td><td>Motorista</td><td>Placa do veículo</td><td>Transportadora</td><td>Data e hora da saída</td></tr></table>
    <div class="rodape">Documento gerado pelo Nexofrete — conferir volumes no carregamento.</div>
  </body></html>`;
  // Aba nova (aberta no clique): mostra o romaneio e abre a impressão.
  if (janela && !janela.closed) {
    janela.document.open(); janela.document.write(html); janela.document.close();
    setTimeout(() => { try { janela.focus(); janela.print(); } catch (e) { /* o usuário imprime pela aba */ } }, 500);
    return;
  }
  // Navegador bloqueou a aba: imprime por um quadro escondido.
  mostrarAlerta('O navegador bloqueou a aba do romaneio — libere pop-ups para este endereço para ver antes de imprimir.', { tipo: 'info' });
  const q = document.createElement('iframe');
  q.style.cssText = 'position:fixed;width:0;height:0;border:0;right:0;bottom:0;';
  document.body.appendChild(q);
  q.contentDocument.open(); q.contentDocument.write(html); q.contentDocument.close();
  setTimeout(() => { q.contentWindow.focus(); q.contentWindow.print(); setTimeout(() => q.remove(), 2000); }, 400);
}
