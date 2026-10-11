const campoEmail = document.getElementById('campoEmail');
const campoSenha = document.getElementById('campoSenha');
const btnEntrar = document.getElementById('btnEntrar');
const mensagemErro = document.getElementById('mensagemErro');

// ---------- Tema claro/escuro ----------
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

fetch('/api/status').then((r) => r.json()).then((d) => {
  document.getElementById('versaoSistemaLogin').textContent = d.versao ? `Nexofrete v${d.versao}` : '';
}).catch(() => {});

// Aviso de por que a pessoa caiu no login (inatividade, sessão expirada ou
// acesso desativado). Tira o "?motivo=" da barra de endereço depois de ler,
// pra o aviso não voltar se a página for recarregada.
const MOTIVOS_LOGIN = {
  inatividade: { icone: '🔒', texto: 'Sua sessão foi encerrada por inatividade, para proteger seus dados. Entre de novo para continuar.' },
  sessao: { icone: '⏱', texto: 'Sua sessão expirou. Entre de novo para continuar.' },
  desativado: { icone: '⛔', texto: 'Seu acesso foi desativado. Fale com o administrador do sistema.', alerta: true },
};
{
  const motivo = new URLSearchParams(window.location.search).get('motivo');
  const aviso = MOTIVOS_LOGIN[motivo];
  if (aviso) {
    const el = document.getElementById('avisoLogin');
    el.innerHTML = `<span class="aviso-login-icone">${aviso.icone}</span><span>${aviso.texto}</span>`;
    el.classList.toggle('alerta', !!aviso.alerta);
    el.classList.remove('oculto');
    history.replaceState(null, '', window.location.pathname);
  }
}

// Se já tem sessão salva: confere no servidor se ainda precisa cadastrar a
// senha (senha provisória); se não precisa, vai direto pro dashboard.
let senhaProvisoriaDigitada = null; // guardada do login, pra não pedir de novo
if (sessionStorage.getItem('token')) {
  fetch('/api/auth/eu', { headers: { Authorization: `Bearer ${sessionStorage.getItem('token')}` } })
    .then(async (r) => {
      if (r.status === 401) { sessionStorage.removeItem('token'); sessionStorage.removeItem('usuario'); return; }
      const eu = await r.json();
      if (eu.trocar_senha) mostrarEtapaNovaSenha(eu.nome);
      else window.location.href = 'dashboard.html';
    })
    .catch(() => { window.location.href = 'dashboard.html'; });
}

// ---------- Cadastro da própria senha (primeiro acesso) ----------
function mostrarEtapaNovaSenha(nome) {
  document.getElementById('etapaSenhaLogin').classList.add('oculto');
  document.getElementById('etapaCodigoLogin').classList.add('oculto');
  document.getElementById('etapaNovaSenha').classList.remove('oculto');
  const primeiroNome = (nome || '').trim().split(/\s+/)[0];
  document.getElementById('novaSenhaTitulo').textContent = `Bem-vindo${primeiroNome ? `, ${primeiroNome}` : ''}! Crie a sua senha`;
  // Se veio direto do login, já temos a provisória: não pede de novo.
  document.getElementById('campoSenhaAtualWrap').classList.toggle('oculto', !!senhaProvisoriaDigitada);
  validarNovaSenha();
  (senhaProvisoriaDigitada ? document.getElementById('campoNovaSenha') : document.getElementById('campoSenhaAtual')).focus();
}

function validarNovaSenha() {
  const nova = document.getElementById('campoNovaSenha').value;
  const confirma = document.getElementById('campoConfirmaSenha').value;
  const atual = senhaProvisoriaDigitada ?? document.getElementById('campoSenhaAtual').value;
  const regras = {
    tamanho: nova.length >= 8,
    letrasNumeros: /[A-Za-zÀ-ÿ]/.test(nova) && /\d/.test(nova),
    diferente: nova.length > 0 && nova !== atual,
    confere: nova.length > 0 && nova === confirma,
  };
  document.querySelectorAll('#regrasSenha li').forEach((li) => li.classList.toggle('ok', !!regras[li.dataset.regra]));
  const tudoOk = Object.values(regras).every(Boolean) && atual.length > 0;
  document.getElementById('btnSalvarNovaSenha').disabled = !tudoOk;
  return tudoOk;
}
['campoSenhaAtual', 'campoNovaSenha', 'campoConfirmaSenha'].forEach((id) => {
  document.getElementById(id).addEventListener('input', validarNovaSenha);
  document.getElementById(id).addEventListener('keydown', (e) => { if (e.key === 'Enter') salvarNovaSenha(); });
});
document.querySelectorAll('.btn-olho').forEach((b) => b.addEventListener('click', () => {
  const campo = document.getElementById(b.dataset.alvo);
  campo.type = campo.type === 'password' ? 'text' : 'password';
}));

async function salvarNovaSenha() {
  esconderErro();
  if (!validarNovaSenha()) return;
  const botao = document.getElementById('btnSalvarNovaSenha');
  botao.disabled = true;
  botao.textContent = 'Salvando...';
  try {
    const resposta = await fetch('/api/auth/trocar-senha', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionStorage.getItem('token')}` },
      body: JSON.stringify({
        senha_atual: senhaProvisoriaDigitada ?? document.getElementById('campoSenhaAtual').value,
        nova_senha: document.getElementById('campoNovaSenha').value,
      }),
    });
    const dados = await resposta.json();
    if (resposta.status === 401) {
      sessionStorage.removeItem('token'); sessionStorage.removeItem('usuario');
      mostrarErro('Sua sessão expirou. Entre de novo com a senha provisória.');
      setTimeout(() => window.location.reload(), 1800);
      return;
    }
    if (!resposta.ok) { mostrarErro(dados.erro || 'Não foi possível salvar a senha.'); return; }

    const u = JSON.parse(sessionStorage.getItem('usuario') || '{}');
    u.trocar_senha = false;
    sessionStorage.setItem('usuario', JSON.stringify(u));
    botao.textContent = '✓ Senha cadastrada! Entrando...';
    setTimeout(() => { window.location.href = 'dashboard.html'; }, 900);
    return;
  } catch (err) {
    mostrarErro('Não foi possível conectar ao servidor.');
  }
  botao.textContent = 'Salvar senha e entrar';
  validarNovaSenha();
}
document.getElementById('btnSalvarNovaSenha').addEventListener('click', salvarNovaSenha);
document.getElementById('btnCancelarNovaSenha').addEventListener('click', () => {
  const t = sessionStorage.getItem('token');
  if (t) fetch('/api/auth/sair', { method: 'POST', headers: { Authorization: `Bearer ${t}` }, keepalive: true }).catch(() => {});
  sessionStorage.removeItem('token');
  sessionStorage.removeItem('usuario');
  window.location.href = 'login.html';
});

// Depois do login (com ou sem 2FA): senha provisória vai pro cadastro da senha.
function concluirLogin(dados) {
  sessionStorage.setItem('token', dados.token);
  sessionStorage.setItem('usuario', JSON.stringify(dados.usuario));
  if (dados.usuario?.trocar_senha) { mostrarEtapaNovaSenha(dados.usuario.nome); return; }
  window.location.href = 'dashboard.html';
}

function mostrarErro(texto) {
  document.getElementById('avisoLogin')?.classList.add('oculto');
  mensagemErro.textContent = texto;
  mensagemErro.classList.add('visivel');
}
function esconderErro() {
  mensagemErro.classList.remove('visivel');
}

async function fazerLogin() {
  esconderErro();

  const email = campoEmail.value.trim();
  const senha = campoSenha.value;
  if (!email || !senha) {
    mostrarErro('Preencha email e senha.');
    return;
  }

  btnEntrar.disabled = true;
  btnEntrar.textContent = 'Entrando...';

  try {
    const resposta = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, senha }),
    });
    const dados = await resposta.json();

    if (!resposta.ok) {
      mostrarErro(dados.erro || 'Não foi possível entrar.');
      return;
    }

    if (dados.precisaCodigo) {
      senhaProvisoriaDigitada = senha;
      tempToken2FA = dados.tempToken;
      document.getElementById('textoEtapaCodigo').textContent = dados.mensagem || 'Enviamos um código para o seu email.';
      document.getElementById('etapaSenhaLogin').classList.add('oculto');
      document.getElementById('etapaCodigoLogin').classList.remove('oculto');
      document.getElementById('campoCodigo2FA').focus();
      return;
    }

    senhaProvisoriaDigitada = senha;
    concluirLogin(dados);
  } catch (err) {
    mostrarErro('Não foi possível conectar ao servidor.');
  } finally {
    btnEntrar.disabled = false;
    btnEntrar.textContent = 'Entrar';
  }
}

let tempToken2FA = null;

async function confirmarCodigo2FA() {
  esconderErro();
  const codigo = document.getElementById('campoCodigo2FA').value.trim();
  if (!codigo) { mostrarErro('Digite o código recebido por email.'); return; }

  const botao = document.getElementById('btnConfirmarCodigo');
  botao.disabled = true;
  botao.textContent = 'Confirmando...';

  try {
    const resposta = await fetch('/api/auth/verificar-codigo-2fa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tempToken: tempToken2FA, codigo }),
    });
    const dados = await resposta.json();
    if (!resposta.ok) { mostrarErro(dados.erro || 'Código incorreto.'); return; }

    concluirLogin(dados);
  } catch (err) {
    mostrarErro('Não foi possível conectar ao servidor.');
  } finally {
    botao.disabled = false;
    botao.textContent = 'Confirmar código';
  }
}

document.getElementById('btnConfirmarCodigo').addEventListener('click', confirmarCodigo2FA);
document.getElementById('campoCodigo2FA').addEventListener('keydown', (e) => { if (e.key === 'Enter') confirmarCodigo2FA(); });
document.getElementById('btnVoltarLogin').addEventListener('click', () => {
  document.getElementById('etapaCodigoLogin').classList.add('oculto');
  document.getElementById('etapaSenhaLogin').classList.remove('oculto');
  esconderErro();
});

btnEntrar.addEventListener('click', fazerLogin);
campoSenha.addEventListener('keydown', (e) => { if (e.key === 'Enter') fazerLogin(); });

// ---------- Tela cheia (opcional) ----------
// O sistema abre numa janela maximizada, com os botões de minimizar e fechar
// (X) à mostra. Quem preferir tela cheia usa o botão (ou F11); Esc sai dela.
const btnTelaCheiaLogin = document.getElementById('btnTelaCheiaLogin');

function atualizarBotaoTelaCheia() {
  btnTelaCheiaLogin.style.display = document.fullscreenElement ? 'none' : 'block';
}
atualizarBotaoTelaCheia();
document.addEventListener('fullscreenchange', atualizarBotaoTelaCheia);

btnTelaCheiaLogin.addEventListener('click', () => {
  document.documentElement.requestFullscreen?.().catch(() => {});
});

// ---------- Aviso de Ambiente de Teste ----------
fetch('/api/status').then((r) => r.json()).then((d) => {
  if (d.ambienteTeste) {
    document.getElementById('faixaAmbienteTeste').classList.remove('oculto');
    // Ícone laranja no teste: na barra de tarefas dá pra saber qual janela é qual.
    document.querySelectorAll('link[rel~="icon"]').forEach((l) => { l.href = 'img/nexofrete-icone-teste.svg'; l.type = 'image/svg+xml'; });
  }
}).catch(() => {});
