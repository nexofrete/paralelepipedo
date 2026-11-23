// Pessoas (RH): funcionários e férias (telas 270 Painel de férias, 271 Programação, 272 Funcionários).
// Regras da CLT usadas aqui:
//  - Período aquisitivo: cada 12 meses desde a admissão dão 30 dias; o concessivo são os 12 meses seguintes. Férias que
//    terminam depois do concessivo (ou saldo com o concessivo vencido) são pagas em dobro (art. 137).
//  - Até 3 períodos por aquisitivo, um com pelo menos 14 dias e nenhum com menos de 5 (art. 134 §1º).
//  - Abono pecuniário: vender até 1/3 (10 dias de 30) (art. 143).
//  - O início não pode cair nos 2 dias antes de feriado ou do repouso semanal (domingo) (art. 134 §3º): sexta e sábado,
//    e as vésperas dos feriados nacionais (aviso, não bloqueia: a empresa pode ter outro dia de repouso).
//  - Aviso por escrito com 30 dias de antecedência (art. 135) e pagamento até 2 dias antes do início (art. 145).
// Avisos: quem entra e quem volta nos próximos dias, quem está de férias, aviso a entregar, férias vencidas e vencendo,
// na tela Hoje, no sino e num e-mail diário (opcional, para os e-mails da configuração).
const pool = require('./db');

const falha = (msg, status = 400) => Object.assign(new Error(msg), { status });
const texto = (v, max) => (v == null || String(v).trim() === '' ? null : String(v).trim().slice(0, max));
const dataOk = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : null);
const hojeSP = () => new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
const D = (iso) => new Date(`${String(iso).slice(0, 10)}T12:00:00Z`);
const iso = (d) => d.toISOString().slice(0, 10);
const somaDias = (s, n) => { const d = D(s); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
const somaAnos = (s, n) => { const d = D(s); d.setUTCFullYear(d.getUTCFullYear() + n); return iso(d); };
const entre = (a, b) => Math.round((D(b) - D(a)) / 86400000);
const DIREITO = 30;
const DIAS_VENCENDO = 90;

// Feriados nacionais (fixos e a Sexta-feira Santa).
function pascoa(ano) {
  const a = ano % 19; const b = Math.floor(ano / 100); const c = ano % 100; const d = Math.floor(b / 4); const e = b % 4; const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3); const h = (19 * a + b - d - g + 15) % 30; const i = Math.floor(c / 4); const k = c % 4; const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451); const mes = Math.floor((h + l - 7 * m + 114) / 31); const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}
function feriados(ano) {
  const fixos = ['01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '12-25'];
  if (ano >= 2024) fixos.push('11-20');
  return new Set([...fixos.map((x) => `${ano}-${x}`), somaDias(pascoa(ano), -2)]);
}
// Aviso do art. 134 §3º para a data de início (null = pode).
function avisoInicio(inicio) {
  const dow = D(inicio).getUTCDay();
  if (dow === 5 || dow === 6) return 'O início cai nos 2 dias antes do domingo (repouso semanal): a CLT não deixa começar na sexta nem no sábado.';
  for (const n of [1, 2]) {
    const x = somaDias(inicio, n);
    if (feriados(D(x).getUTCFullYear()).has(x)) return `O início cai nos 2 dias antes do feriado de ${D(x).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}: a CLT não deixa.`;
  }
  return null;
}

// Períodos aquisitivos desde a admissão até hoje (e o que está correndo).
function periodos(admissao, hoje = hojeSP(), demissao = null) {
  const lista = [];
  const limite = demissao && demissao < hoje ? demissao : hoje;
  for (let i = 0; i < 60; i += 1) {
    const inicio = somaAnos(admissao, i);
    if (inicio > limite) break;
    const fim = somaDias(somaAnos(admissao, i + 1), -1);
    lista.push({ inicio, fim, concessivo_fim: somaDias(somaAnos(admissao, i + 2), -1), completo: fim < hoje });
  }
  return lista;
}
// Situação de cada período com as férias (não canceladas) dele.
function saldoPeriodo(p, ferias, hoje = hojeSP()) {
  const doPer = ferias.filter((f) => f.status !== 'cancelada' && f.aquisitivo_inicio === p.inicio);
  const usados = doPer.reduce((t, f) => t + f.dias + (f.abono_dias || 0), 0);
  const gozados = doPer.filter((f) => f.fim < hoje).reduce((t, f) => t + f.dias + (f.abono_dias || 0), 0);
  const meses = Math.min(12, Math.max(0, Math.floor(entre(p.inicio, hoje) / 30.44)));
  const direito = p.completo ? DIREITO : Math.round(meses * 2.5);
  const saldo = Math.max(0, DIREITO - usados);
  const diasLimite = entre(hoje, p.concessivo_fim);
  let situacao;
  if (!p.completo) situacao = 'Em aquisição';
  else if (saldo === 0) situacao = gozados >= DIREITO ? 'Gozadas' : 'Programadas';
  else if (diasLimite < 0) situacao = 'Vencidas';
  else if (diasLimite <= DIAS_VENCENDO) situacao = 'Vencendo';
  else situacao = 'A programar';
  return { ...p, direito, usados, saldo, gozados, dias_limite: diasLimite, situacao, periodos_usados: doPer.length };
}
// Situação de uma férias (sem banco).
function situacaoFerias(f, hoje = hojeSP()) {
  if (f.status === 'cancelada') return 'Cancelada';
  if (f.inicio <= hoje && f.fim >= hoje) return 'Em férias';
  if (f.fim < hoje) return 'Concluída';
  return f.status === 'aprovada' ? 'Aprovada' : 'Programada';
}

// Confere uma programação: erros (bloqueiam) e avisos (deixam salvar).
function validar({ funcionario, periodo, ferias, inicio, dias, abono, hoje = hojeSP(), idAtual = null }) {
  const erros = []; const avisos = [];
  if (!periodo) erros.push('Período aquisitivo não encontrado para este funcionário.');
  if (!(dias >= 5)) erros.push('Cada período de férias precisa ter pelo menos 5 dias.');
  if (abono < 0 || abono > 10) erros.push('O abono (dias vendidos) vai de 0 a 10.');
  if (erros.length) return { erros, avisos };
  const outras = ferias.filter((f) => f.status !== 'cancelada' && f.aquisitivo_inicio === periodo.inicio && f.id !== idAtual);
  const usados = outras.reduce((t, f) => t + f.dias + (f.abono_dias || 0), 0);
  const abonoAntes = outras.reduce((t, f) => t + (f.abono_dias || 0), 0);
  if (abonoAntes + abono > 10) erros.push('O abono do período passa de 10 dias.');
  if (usados + dias + abono > DIREITO) erros.push(`Passa do saldo do período: restam ${DIREITO - usados} dia(s).`);
  const partes = [...outras.map((f) => f.dias), dias];
  if (partes.length > 3) erros.push('A CLT permite dividir as férias em até 3 períodos.');
  const restante = DIREITO - usados - dias - abono;
  if (!partes.some((d) => d >= 14) && (restante < 14 || partes.length === 3)) erros.push('Um dos períodos precisa ter pelo menos 14 dias.');
  if (restante > 0 && restante < 5 && partes.length < 3) erros.push(`Sobrariam ${restante} dia(s): cada período precisa ter pelo menos 5 dias. Ajuste os dias.`);
  const fim = somaDias(inicio, dias - 1);
  // Sobreposição com outra férias do mesmo funcionário.
  const sob = ferias.find((f) => f.status !== 'cancelada' && f.id !== idAtual && !(fim < f.inicio || inicio > f.fim));
  if (sob) erros.push(`Já há férias de ${D(sob.inicio).toLocaleDateString('pt-BR', { timeZone: 'UTC' })} a ${D(sob.fim).toLocaleDateString('pt-BR', { timeZone: 'UTC' })} nessas datas.`);
  if (funcionario.demissao && inicio > funcionario.demissao) erros.push('O funcionário foi desligado antes dessa data.');
  if (!periodo.completo && inicio <= periodo.fim) avisos.push('Férias antes de completar o período aquisitivo (férias antecipadas): confira com o RH.');
  if (fim > periodo.concessivo_fim) avisos.push(`Termina depois do fim do período concessivo (${D(periodo.concessivo_fim).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}): a CLT manda pagar em dobro.`);
  const a = avisoInicio(inicio); if (a) avisos.push(a);
  if (inicio >= hoje && entre(hoje, inicio) < 30) avisos.push('A CLT pede o aviso de férias por escrito com 30 dias de antecedência.');
  return { erros, avisos, fim, retorno: somaDias(fim, 1), pagamento_ate: somaDias(inicio, -2) };
}

// ---------------- Banco ----------------
const CAMPOS_F = `f.*, to_char(f.admissao, 'YYYY-MM-DD') AS admissao, to_char(f.demissao, 'YYYY-MM-DD') AS demissao, d.nome AS departamento, u.nome AS unidade`;
async function funcionarios({ todos = false } = {}) {
  const { rows } = await pool.query(`SELECT ${CAMPOS_F} FROM funcionarios f LEFT JOIN departamentos d ON d.id = f.departamento_id LEFT JOIN unidades u ON u.id = f.unidade_id
    ${todos ? '' : 'WHERE f.ativo'} ORDER BY f.nome`);
  return rows;
}
async function funcionario(id) {
  const { rows: [f] } = await pool.query(`SELECT ${CAMPOS_F} FROM funcionarios f LEFT JOIN departamentos d ON d.id = f.departamento_id LEFT JOIN unidades u ON u.id = f.unidade_id WHERE f.id = $1`, [id]);
  if (!f) throw falha('Funcionário não encontrado.', 404);
  return f;
}
async function salvarFuncionario(id, b) {
  const v = [texto(b.nome, 150), String(b.cpf || '').replace(/\D/g, '').slice(0, 11) || null, texto(b.matricula, 30), texto(b.cargo, 100), parseInt(b.departamento_id, 10) || null,
    parseInt(b.unidade_id, 10) || null, dataOk(b.admissao), dataOk(b.demissao), texto(b.email, 150), texto(b.telefone, 30), texto(b.gestor, 150), texto(b.email_gestor, 150),
    b.ativo !== false && !dataOk(b.demissao), texto(b.observacoes, 1000)];
  if (!v[0]) throw falha('Informe o nome.');
  if (!v[6]) throw falha('Informe a data de admissão (é dela que saem os períodos de férias).');
  if (v[7] && v[7] < v[6]) throw falha('A data de desligamento é antes da admissão.');
  try {
    if (id) await pool.query(`UPDATE funcionarios SET nome=$1, cpf=$2, matricula=$3, cargo=$4, departamento_id=$5, unidade_id=$6, admissao=$7, demissao=$8, email=$9, telefone=$10, gestor=$11,
      email_gestor=$12, ativo=$13, observacoes=$14, atualizado_em=NOW() WHERE id=$15`, [...v, id]);
    else ({ rows: [{ id }] } = await pool.query(`INSERT INTO funcionarios (nome, cpf, matricula, cargo, departamento_id, unidade_id, admissao, demissao, email, telefone, gestor, email_gestor, ativo, observacoes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id`, v));
  } catch (e) { if (e.code === '23505') throw falha('Já há um funcionário com este CPF.', 409); throw e; }
  return funcionario(id);
}
async function feriasDe(ids = null) {
  const { rows } = await pool.query(`SELECT fe.*, to_char(fe.aquisitivo_inicio, 'YYYY-MM-DD') AS aquisitivo_inicio, to_char(fe.aquisitivo_fim, 'YYYY-MM-DD') AS aquisitivo_fim,
      to_char(fe.inicio, 'YYYY-MM-DD') AS inicio, to_char(fe.fim, 'YYYY-MM-DD') AS fim, to_char(fe.aviso_em, 'YYYY-MM-DD') AS aviso_em
    FROM ferias fe ${ids ? 'WHERE fe.funcionario_id = ANY($1)' : ''} ORDER BY fe.inicio`, ids ? [ids] : []);
  return rows;
}

// Painel: cada funcionário ativo com os períodos, o saldo e a situação; as férias com a situação; os avisos.
async function painel() {
  const hoje = hojeSP();
  const [fs, todas] = await Promise.all([funcionarios(), feriasDe()]);
  const porFunc = new Map(); todas.forEach((f) => { if (!porFunc.has(f.funcionario_id)) porFunc.set(f.funcionario_id, []); porFunc.get(f.funcionario_id).push(f); });
  const ORDEM = { Vencidas: 0, Vencendo: 1, 'A programar': 2, Programadas: 3, 'Em aquisição': 4, Gozadas: 5 };
  const lista = fs.map((fu) => {
    const fer = porFunc.get(fu.id) || [];
    const pers = periodos(fu.admissao, hoje, fu.demissao).map((p) => saldoPeriodo(p, fer, hoje));
    const pendentes = pers.filter((p) => p.completo && p.saldo > 0);
    const pior = pers.filter((p) => p.situacao !== 'Gozadas').sort((a, b) => ORDEM[a.situacao] - ORDEM[b.situacao])[0] || pers[pers.length - 1] || null;
    const proximas = fer.filter((f) => f.status !== 'cancelada' && f.fim >= hoje).sort((a, b) => a.inicio.localeCompare(b.inicio));
    return { ...fu, periodos: pers, saldo_total: pendentes.reduce((t, p) => t + p.saldo, 0), situacao: pior?.situacao || 'Em aquisição', periodo_alvo: pendentes[0] || pers[pers.length - 1] || null,
      em_ferias: fer.some((f) => f.status !== 'cancelada' && f.inicio <= hoje && f.fim >= hoje), proxima: proximas[0] || null };
  }).sort((a, b) => ORDEM[a.situacao] - ORDEM[b.situacao] || a.nome.localeCompare(b.nome));
  const nomes = new Map(fs.map((f) => [f.id, f]));
  const ferias = todas.filter((f) => nomes.has(f.funcionario_id)).map((f) => ({ ...f, nome: nomes.get(f.funcionario_id).nome, cargo: nomes.get(f.funcionario_id).cargo,
    departamento: nomes.get(f.funcionario_id).departamento, situacao: situacaoFerias(f, hoje), retorno: somaDias(f.fim, 1), pagamento_ate: somaDias(f.inicio, -2) }));
  return { hoje, funcionarios: lista, ferias, avisos: avisosDe(lista, ferias, hoje), departamentos: (await pool.query('SELECT id, nome FROM departamentos WHERE ativo ORDER BY nome').catch(() => ({ rows: [] }))).rows,
    unidades: (await pool.query('SELECT id, nome FROM unidades WHERE ativa IS NOT FALSE ORDER BY nome').catch(() => ({ rows: [] }))).rows, config: await config() };
}
function avisosDe(lista, ferias, hoje = hojeSP(), dias = 7) {
  const ativas = ferias.filter((f) => f.status !== 'cancelada');
  const saem = ativas.filter((f) => f.inicio >= hoje && entre(hoje, f.inicio) <= dias).sort((a, b) => a.inicio.localeCompare(b.inicio));
  const voltam = ativas.filter((f) => { const r = somaDias(f.fim, 1); return r >= hoje && entre(hoje, r) <= dias; }).sort((a, b) => a.fim.localeCompare(b.fim));
  return {
    em_ferias: ativas.filter((f) => f.inicio <= hoje && f.fim >= hoje),
    saem, voltam,
    aviso_pendente: ativas.filter((f) => !f.aviso_em && f.inicio >= hoje && entre(hoje, f.inicio) <= 30),
    vencidas: lista.filter((f) => f.periodos.some((p) => p.situacao === 'Vencidas')).map((f) => ({ id: f.id, nome: f.nome, saldo: f.periodos.filter((p) => p.situacao === 'Vencidas').reduce((t, p) => t + p.saldo, 0) })),
    vencendo: lista.filter((f) => f.periodos.some((p) => p.situacao === 'Vencendo')).map((f) => ({ id: f.id, nome: f.nome, limite: f.periodos.find((p) => p.situacao === 'Vencendo').concessivo_fim })),
  };
}

async function salvarFerias(id, b, usuario) {
  const fu = await funcionario(Number(b.funcionario_id));
  const fer = await feriasDe([fu.id]);
  const atual = id ? fer.find((f) => f.id === id) : null;
  if (id && !atual) throw falha('Férias não encontradas.', 404);
  if (atual && atual.status === 'cancelada') throw falha('Estas férias foram canceladas.', 409);
  const inicio = dataOk(b.inicio); if (!inicio) throw falha('Informe o início das férias.');
  const dias = parseInt(b.dias, 10) || 0; const abono = parseInt(b.abono_dias, 10) || 0;
  const pers = periodos(fu.admissao, hojeSP(), fu.demissao);
  // Período aquisitivo: o escolhido, ou o mais antigo com saldo, ou o que está correndo.
  const comSaldo = pers.map((p) => saldoPeriodo(p, fer.filter((f) => f.id !== id))).filter((p) => p.saldo > 0);
  const periodo = pers.find((p) => p.inicio === dataOk(b.aquisitivo_inicio)) || comSaldo[0] || pers[pers.length - 1];
  const v = validar({ funcionario: fu, periodo, ferias: fer, inicio, dias, abono, idAtual: id });
  if (v.erros.length) throw falha(v.erros.join(' '));
  const vals = [fu.id, periodo.inicio, periodo.fim, inicio, v.fim, dias, abono, !!b.adiantar_13, texto(b.observacao, 1000)];
  if (id) await pool.query(`UPDATE ferias SET funcionario_id=$1, aquisitivo_inicio=$2, aquisitivo_fim=$3, inicio=$4, fim=$5, dias=$6, abono_dias=$7, adiantar_13=$8, observacao=$9,
      aviso_em = CASE WHEN inicio = $4 THEN aviso_em ELSE NULL END, atualizado_em=NOW() WHERE id=$10`, [...vals, id]);
  else ({ rows: [{ id }] } = await pool.query(`INSERT INTO ferias (funcionario_id, aquisitivo_inicio, aquisitivo_fim, inicio, fim, dias, abono_dias, adiantar_13, observacao, criado_por_nome)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`, [...vals, usuario]));
  // Quem mais do mesmo departamento estará de férias nas mesmas datas.
  const { rows: juntos } = await pool.query(`SELECT fu.nome FROM ferias fe JOIN funcionarios fu ON fu.id = fe.funcionario_id
    WHERE fe.id <> $1 AND fe.status <> 'cancelada' AND fu.departamento_id IS NOT DISTINCT FROM $2 AND $2 IS NOT NULL AND NOT (fe.fim < $3::date OR fe.inicio > $4::date)`, [id, fu.departamento_id, inicio, v.fim]);
  if (juntos.length) v.avisos.push(`Também de férias no mesmo departamento nesse período: ${juntos.map((j) => j.nome).join(', ')}.`);
  return { id, avisos: v.avisos, fim: v.fim, retorno: v.retorno, pagamento_ate: v.pagamento_ate };
}
async function mudarFerias(id, acao, usuario) {
  const { rows: [f] } = await pool.query('SELECT id, status FROM ferias WHERE id = $1', [id]);
  if (!f) throw falha('Férias não encontradas.', 404);
  if (acao === 'aprovar') await pool.query("UPDATE ferias SET status = 'aprovada', aprovado_por = $2, aprovado_em = NOW(), atualizado_em = NOW() WHERE id = $1 AND status <> 'cancelada'", [id, usuario]);
  else if (acao === 'cancelar') await pool.query("UPDATE ferias SET status = 'cancelada', atualizado_em = NOW() WHERE id = $1", [id]);
  else if (acao === 'aviso') await pool.query('UPDATE ferias SET aviso_em = CURRENT_DATE, atualizado_em = NOW() WHERE id = $1', [id]);
  else throw falha('Ação inválida.');
  return { ok: true };
}

// Aviso de férias (art. 135): documento para o funcionário assinar.
async function documentoAviso(id) {
  const { rows: [f] } = await pool.query(`SELECT fe.*, to_char(fe.inicio, 'YYYY-MM-DD') AS ini, to_char(fe.fim, 'YYYY-MM-DD') AS fi, to_char(fe.aquisitivo_inicio, 'YYYY-MM-DD') AS ai,
      to_char(fe.aquisitivo_fim, 'YYYY-MM-DD') AS af, fu.nome, fu.cpf, fu.cargo, fu.matricula, d.nome AS departamento
    FROM ferias fe JOIN funcionarios fu ON fu.id = fe.funcionario_id LEFT JOIN departamentos d ON d.id = fu.departamento_id WHERE fe.id = $1`, [id]);
  if (!f) throw falha('Férias não encontradas.', 404);
  const { rows: [e] } = await pool.query('SELECT razao_social, cnpj, municipio, uf FROM empresa WHERE id = 1').catch(() => ({ rows: [{}] }));
  const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const br = (s) => (s ? D(s).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '');
  const cpf = String(f.cpf || '').replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  const hoje = hojeSP();
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>Aviso de férias — ${esc(f.nome)}</title><style>
    @page { size: A4; margin: 20mm; } body { font-family: Arial, Helvetica, sans-serif; font-size: 13px; color: #111; line-height: 1.5; margin: 0; }
    @media screen { body { padding: 24px; max-width: 800px; margin: 0 auto; } } .acoes { margin-bottom: 12px; } @media print { .acoes { display: none; } }
    h1 { font-size: 18px; text-align: center; margin: 0 0 18px; } table { width: 100%; border-collapse: collapse; margin: 14px 0; } td { border: 1px solid #111; padding: 6px 8px; } td b { display: block; font-size: 10px; text-transform: uppercase; color: #444; }
    .ass { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 60px; } .ass div { border-top: 1px solid #111; text-align: center; padding-top: 4px; }
  </style></head><body><div class="acoes"><button type="button" onclick="window.print()">Imprimir</button></div>
  <h1>AVISO DE FÉRIAS</h1>
  <p><b>${esc(e?.razao_social || '')}</b>${e?.cnpj ? `, CNPJ ${esc(e.cnpj)}` : ''}, comunica, nos termos do art. 135 da CLT, que as férias de <b>${esc(f.nome)}</b> serão concedidas conforme abaixo.</p>
  <table><tr><td><b>Funcionário</b>${esc(f.nome)}</td><td><b>CPF</b>${esc(cpf)}</td><td><b>Matrícula</b>${esc(f.matricula || '')}</td></tr>
    <tr><td><b>Cargo</b>${esc(f.cargo || '')}</td><td colspan="2"><b>Departamento</b>${esc(f.departamento || '')}</td></tr>
    <tr><td><b>Período aquisitivo</b>${br(f.ai)} a ${br(f.af)}</td><td><b>Período de gozo</b>${br(f.ini)} a ${br(f.fi)}</td><td><b>Dias de férias</b>${f.dias}</td></tr>
    <tr><td><b>Abono pecuniário (dias vendidos)</b>${f.abono_dias || 0}</td><td><b>Retorno ao trabalho</b>${br(somaDias(f.fi, 1))}</td><td><b>Adiantamento do 13º</b>${f.adiantar_13 ? 'Sim' : 'Não'}</td></tr></table>
  <p>O pagamento da remuneração das férias, acrescida de 1/3, será feito até ${br(somaDias(f.ini, -2))} (art. 145 da CLT).</p>
  <p>${esc(e?.municipio || '')}${e?.uf ? `/${esc(e.uf)}` : ''}, ${br(f.aviso_em ? String(f.aviso_em).slice(0, 10) : hoje)}.</p>
  <div class="ass"><div>${esc(e?.razao_social || 'Empresa')}</div><div>${esc(f.nome)}<br><small>Ciente em ___/___/______</small></div></div></body></html>`;
}

// ---------------- Configuração e avisos ----------------
async function config() {
  const { rows: [c] } = await pool.query('SELECT * FROM ferias_config WHERE id = 1').catch(() => ({ rows: [] }));
  return { emails: c?.emails || '', dias_aviso: c?.dias_aviso || 7, email_diario: !!c?.email_diario };
}
async function salvarConfig(b) {
  const emails = String(b.emails || '').split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean);
  if (emails.some((x) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x))) throw falha('Há um e-mail inválido na lista.');
  await pool.query(`INSERT INTO ferias_config (id, emails, dias_aviso, email_diario) VALUES (1, $1, $2, $3)
    ON CONFLICT (id) DO UPDATE SET emails = $1, dias_aviso = $2, email_diario = $3`, [emails.join(', '), Math.min(60, Math.max(1, parseInt(b.dias_aviso, 10) || 7)), !!b.email_diario]);
  return config();
}
// Para a tela Hoje e o sino.
async function pendencias() {
  const hoje = hojeSP();
  const cfg = await config();
  const { rows: fs } = await pool.query("SELECT id, nome, to_char(admissao, 'YYYY-MM-DD') AS admissao, to_char(demissao, 'YYYY-MM-DD') AS demissao FROM funcionarios WHERE ativo").catch(() => ({ rows: [] }));
  if (!fs.length) return null;
  const fer = await feriasDe();
  const nomes = new Map(fs.map((f) => [f.id, f.nome]));
  const ferias = fer.filter((f) => nomes.has(f.funcionario_id)).map((f) => ({ ...f, nome: nomes.get(f.funcionario_id) }));
  const lista = fs.map((fu) => ({ ...fu, periodos: periodos(fu.admissao, hoje, fu.demissao).map((p) => saldoPeriodo(p, ferias.filter((f) => f.funcionario_id === fu.id), hoje)) }));
  return avisosDe(lista, ferias, hoje, cfg.dias_aviso);
}
// E-mail diário (07:20): quem sai e quem volta nos próximos dias, quem está de férias, aviso a entregar e férias vencendo.
async function emailDiario() {
  const cfg = await config();
  if (!cfg.email_diario) return;
  const p = await pendencias(); if (!p) return;
  const hoje = hojeSP();
  const br = (s) => D(s).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
  const linhas = [];
  const sec = (t, ls) => { if (ls.length) linhas.push(`<h3 style="margin:16px 0 6px;">${t}</h3><ul>${ls.map((l) => `<li>${l}</li>`).join('')}</ul>`); };
  const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  sec('Entram de férias', p.saem.map((f) => `<b>${esc(f.nome)}</b>: ${br(f.inicio)}${f.inicio === hoje ? ' (hoje)' : ''} a ${br(f.fim)} · ${f.dias} dias · volta ${br(somaDias(f.fim, 1))}`));
  sec('Voltam de férias', p.voltam.map((f) => `<b>${esc(f.nome)}</b>: volta ${br(somaDias(f.fim, 1))}${somaDias(f.fim, 1) === hoje ? ' (hoje)' : ''}`));
  sec('De férias hoje', p.em_ferias.map((f) => `${esc(f.nome)} (até ${br(f.fim)})`));
  sec('Aviso de férias a entregar (30 dias antes)', p.aviso_pendente.map((f) => `${esc(f.nome)}: férias em ${br(f.inicio)}`));
  sec('Férias vencidas (pagamento em dobro)', p.vencidas.map((f) => `${esc(f.nome)}: ${f.saldo} dia(s)`));
  sec('Férias vencendo', p.vencendo.map((f) => `${esc(f.nome)}: programe até ${br(f.limite)}`));
  if (!linhas.length) return;
  const para = cfg.emails;
  if (!para) return;
  await require('./email').enviarRelatorio({ para, assunto: `Férias: avisos de ${br(hoje)}`, html: `<div style="font-family:Arial,sans-serif; max-width:640px;"><h2 style="color:#1F4E78;">Avisos de férias</h2>${linhas.join('')}<p style="color:#888; font-size:12px;">Aviso automático do Nexofrete (Pessoas, Férias).</p></div>` })
    .catch((e) => console.error('[férias] e-mail:', e.message));
}
function agendar() {
  try { require('node-cron').schedule('20 7 * * *', () => emailDiario().catch((e) => console.error('[férias]', e.message)), { timezone: 'America/Sao_Paulo' }); } catch (e) { console.error('[férias] agenda:', e.message); }
}

// Quem pode ver o módulo (dados de pessoas): administrador, quem gerencia usuários ou quem tem a tela na grade de acesso.
function pode(u) {
  if (!u) return false;
  if (u.perfil === 'admin') return true;
  const acesso = require('./acessoTelas');
  if (acesso.usaGrade(u)) return acesso.nivelDe(u, 'ferias') !== 'nenhum';
  return !!u.pode_gerenciar_usuarios;
}

module.exports = { DIREITO, pascoa, feriados, avisoInicio, periodos, saldoPeriodo, situacaoFerias, validar, funcionarios, funcionario, salvarFuncionario, feriasDe, painel,
  salvarFerias, mudarFerias, documentoAviso, config, salvarConfig, pendencias, emailDiario, agendar, pode, somaDias };
