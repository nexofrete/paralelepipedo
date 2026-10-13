// Leitura automática da caixa de e-mail (IMAP) — ex.: webmail Roundcube da
// hospedagem (servidor mail.imporiente.com.br, porta 993).
//
// Lê SÓ a pasta configurada — ex.: a de ENVIADOS de quem manda os e-mails de
// devolução ("INBOX.Sent"), ou uma pasta com regra — e, se informado, só os
// e-mails enviados pelos remetentes cadastrados. Para cada e-mail novo:
//   - texto no modelo de devolução/troca -> registra e liga as notas
//     (o mesmo que colar o e-mail em Enviar XML);
//   - anexos .xml / .zip (NF-e, CT-e, cancelamento...) -> importa, como a
//     pasta monitorada;
//   - não altera nada na caixa (nem marca como lido). Cada mensagem é
//     processada uma vez só (controle pelo Message-ID).
// Caixa com finalidade "cte" (transportadora): cada NF-e anexada vira um
// rascunho de CT-e (src/cte/rascunhoDaNfe.js); o texto e os outros XML são ignorados.
// A senha fica criptografada no banco (mesma chave do portal da transportadora).
const cron = require('node-cron');
const pool = require('./db');
const { criptografar, descriptografar } = require('./rastreioLonngren');
const { lerEmailTroca } = require('./leitorEmailTroca');

const USUARIO = { id: null, nome: 'Leitura automática de e-mail', perfil: 'admin', pode_ver_todos: true };
let rodando = false;

// "a@x.com; b@x.com, c@x.com" -> ['a@x.com', 'b@x.com', 'c@x.com']
function listaRemetentes(texto) {
  return [...new Set(String(texto || '').toLowerCase().split(/[\s,;]+/).map((e) => e.trim()).filter((e) => e.includes('@')))];
}

function semSenha(c) {
  const { senha, ...resto } = c || {};
  return { ...resto, tem_senha: !!senha };
}
async function listarContas() {
  const { rows } = await pool.query('SELECT * FROM contas_email ORDER BY id');
  return rows;
}
async function buscarConta(id) {
  const { rows } = await pool.query('SELECT * FROM contas_email WHERE id = $1', [id]);
  return rows[0] || null;
}
async function salvarConta(d, id = null) {
  const atual = id ? await buscarConta(id) : null;
  if (id && !atual) throw new Error('Caixa de e-mail não encontrada.');
  const senha = d.senha ? criptografar(d.senha) : atual?.senha || null;   // vazio = mantém
  const valores = [String(d.nome || d.usuario || '').trim() || null, d.ativo !== false && d.ativo !== 'false',
    String(d.servidor || '').trim() || null, Number(d.porta) || 993, String(d.usuario || '').trim() || null, senha,
    String(d.pasta || '').trim() || 'INBOX', listaRemetentes(d.remetentes).join(', ') || null,
    Math.min(Math.max(Number(d.intervalo_minutos) || 15, 5), 1440), d.finalidade === 'cte' ? 'cte' : (d.finalidade ? 'auditoria' : atual?.finalidade || 'auditoria')];
  const { rows } = id
    ? await pool.query(`UPDATE contas_email SET nome = $1, ativo = $2, servidor = $3, porta = $4, usuario = $5, senha = $6, pasta = $7,
                          remetentes = $8, intervalo_minutos = $9, finalidade = $10 WHERE id = $11 RETURNING *`, [...valores, id])
    : await pool.query(`INSERT INTO contas_email (nome, ativo, servidor, porta, usuario, senha, pasta, remetentes, intervalo_minutos, finalidade)
                        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`, valores);
  return semSenha(rows[0]);
}
async function excluirConta(id) {
  await pool.query('DELETE FROM contas_email WHERE id = $1', [id]);
}

async function conectar(c) {
  let ImapFlow;
  try { ({ ImapFlow } = require('imapflow')); } catch {
    throw new Error('faltam as bibliotecas de e-mail no servidor — atualize pela tela de Manutenção (ela instala sozinha) ou rode o instalar.bat');
  }
  const senha = descriptografar(c.senha);
  if (!c.servidor || !c.usuario || !senha) throw new Error('Preencha servidor, usuário e senha e salve antes.');
  const cliente = new ImapFlow({
    host: c.servidor, port: Number(c.porta) || 993, secure: Number(c.porta || 993) === 993,
    auth: { user: c.usuario, pass: senha }, logger: false,
    tls: { rejectUnauthorized: false },   // hospedagens costumam usar certificado do servidor compartilhado
    socketTimeout: 60000,
  });
  await cliente.connect();
  return cliente;
}

// Testa o login e devolve as pastas da caixa (pra escolher a certa).
async function testar(id) {
  const c = await buscarConta(id);
  if (!c) throw new Error('Caixa de e-mail não encontrada.');
  const cliente = await conectar(c);
  try {
    const pastas = (await cliente.list()).map((p) => p.path).sort();
    return { ok: true, pastas, pastaExiste: pastas.includes(c.pasta || 'INBOX') };
  } finally {
    await cliente.logout().catch(() => {});
  }
}

// Anexos .xml e os .xml de dentro dos .zip.
function anexosXml(email) {
  const { lerXmlDoZip } = require('./utils/lerZip');
  const xmls = []; let erros = 0;
  for (const a of email.attachments || []) {
    const nome = String(a.filename || '').toLowerCase();
    if (nome.endsWith('.xml') || /xml/.test(a.contentType || '')) xmls.push({ nome: a.filename || 'anexo.xml', buffer: a.content });
    else if (nome.endsWith('.zip')) { try { xmls.push(...lerXmlDoZip(a.content)); } catch { erros += 1; } }
  }
  return { xmls, erros };
}

// Transportadora: NF-e do cliente -> rascunho de CT-e.
async function processarParaCte(email, conta) {
  const { xmls } = anexosXml(email);
  const resultado = { cte: 0, nfes: 0, ignoradas: [], assunto: email.subject || '(sem assunto)' };
  if (!xmls.length) return resultado;
  const r = await require('./cte/rascunhoDaNfe').rascunhosDosXml(xmls, {
    tipo: 'email', caixa: conta.nome || conta.usuario, remetente: email.from?.text || '', assunto: email.subject || '',
    recebido_em: email.date || null, usuario: `E-mail (${conta.nome || conta.usuario})`,
  });
  resultado.cte = r.criados.length;
  resultado.nfes = r.criados.reduce((s, c) => s + c.nfs.length, 0);
  resultado.ignoradas = r.ignoradas;
  resultado.criados = r.criados;
  return resultado;
}

async function processarMensagem(fonte, conta = {}) {
  const { simpleParser } = require('mailparser');
  const email = await simpleParser(fonte);
  const idMsg = email.messageId || `${email.date?.toISOString() || ''}|${email.subject || ''}|${email.from?.text || ''}`;
  const { rowCount } = await pool.query('INSERT INTO emails_processados (message_id, assunto, remetente, recebido_em) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING',
    [idMsg.slice(0, 500), (email.subject || '').slice(0, 300), (email.from?.text || '').slice(0, 300), email.date || null]);
  if (!rowCount) return { repetido: true };
  if (conta.finalidade === 'cte') return { ...(await processarParaCte(email, conta)), finalidade: 'cte' };

  const resultado = { troca: null, xml: 0, xmlErros: 0, assunto: email.subject || '(sem assunto)' };
  // 1) Texto no modelo de devolução / troca
  const texto = email.text || (email.html ? String(email.html).replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<[^>]+>/g, ' ') : '');
  const lido = lerEmailTroca(texto);
  if (lido.completo && (lido.tipo || lido.nf_substituta || lido.nf_retorno)) {
    const cabecalho = `De: ${email.from?.text || ''}\nAssunto: ${email.subject || ''}\nData: ${email.date ? email.date.toLocaleString('pt-BR') : ''}\n\n`;
    const r = await require('./trocasNota').registrar({ ...lido, texto: cabecalho + texto }, USUARIO, 'email');
    resultado.troca = { nf: lido.nf_original, id: r.troca.id };
  }
  // 2) Anexos XML / ZIP
  const { importarXmlInterno } = require('./routes/upload');
  const { xmls, erros } = anexosXml(email);
  resultado.xmlErros += erros;
  const ordem = (b) => { const t = b.toString('utf-8', 0, 3000); return /<infNFe|nfeProc/.test(t) ? 1 : /<infCte|cteProc/.test(t) ? 2 : 3; };
  xmls.sort((a, b) => ordem(a.buffer) - ordem(b.buffer));
  for (const x of xmls) {
    try { const r = await importarXmlInterno(x.buffer, x.nome, USUARIO); if (r.ok) resultado.xml += 1; else resultado.xmlErros += 1; } catch { resultado.xmlErros += 1; }
  }
  return resultado;
}

// Lê UMA caixa.
async function executarConta(c, motivo = 'agendado') {
  const resumo = { mensagens: 0, trocas: 0, xml: 0, xmlErros: 0, ignoradas: 0, cte: 0, nfes: 0, detalhes: [] };
  let cliente;
  try {
    cliente = await conectar(c);
    const trava = await cliente.getMailboxLock(c.pasta || 'INBOX');
    try {
      // Por data, não por "não lido": funciona também na pasta de ENVIADOS (onde
      // tudo já está lido). A 1ª leitura olha os últimos 30 dias; as seguintes,
      // desde 2 dias antes da última. O controle por Message-ID evita repetir.
      const desde = c.ultima_execucao ? new Date(new Date(c.ultima_execucao).getTime() - 2 * 86400000) : new Date(Date.now() - 30 * 86400000);
      const uids = (await cliente.search({ since: desde }, { uid: true })) || [];
      const remetentes = listaRemetentes(c.remetentes);
      const candidatos = [];
      if (uids.length) {
        for await (const m of cliente.fetch(uids.slice(-2000).join(','), { envelope: true, uid: true }, { uid: true })) {
          const de = (m.envelope?.from || []).map((f) => String(f.address || '').toLowerCase());
          if (remetentes.length && !de.some((e) => remetentes.includes(e))) continue;   // só de quem foi indicado
          candidatos.push(m.uid);
        }
      }
      resumo.foraDoFiltro = uids.length - candidatos.length;
      for (const uid of candidatos.slice(-300)) {
        const msg = await cliente.fetchOne(String(uid), { source: true }, { uid: true });
        if (!msg?.source) continue;
        const r = await processarMensagem(msg.source, c);
        if (r.repetido) continue;
        resumo.mensagens += 1;
        if (r.finalidade === 'cte') {
          resumo.cte += r.cte; resumo.nfes += r.nfes;
          if (r.cte) resumo.detalhes.push(`"${r.assunto}": ${r.cte} rascunho(s) com NF ${r.criados.flatMap((x) => x.nfs).join(', ')}`);
          r.ignoradas.forEach((i) => resumo.detalhes.push(`${i.nf ? `NF ${i.nf}` : i.arquivo}: ${i.motivo}`));
          if (!r.cte && !r.ignoradas.length) resumo.ignoradas += 1;
          continue;
        }
        resumo.xml += r.xml; resumo.xmlErros += r.xmlErros;
        if (r.troca) { resumo.trocas += 1; resumo.detalhes.push(`Devolução/troca da NF ${r.troca.nf}`); }
        if (!r.troca && !r.xml) { resumo.ignoradas += 1; resumo.detalhes.push(`Sem dados reconhecidos: "${r.assunto}"`); }
      }
    } finally {
      trava.release();
    }
    const texto = c.finalidade === 'cte'
      ? `${resumo.mensagens} e-mail(s) novo(s): ${resumo.cte} rascunho(s) de CT-e com ${resumo.nfes} NF-e${resumo.ignoradas ? `, ${resumo.ignoradas} sem NF-e anexada` : ''}.`
      : `${resumo.mensagens} e-mail(s) novo(s): ${resumo.trocas} devolução(ões)/troca(s), ${resumo.xml} XML importado(s)`
      + `${resumo.xmlErros ? `, ${resumo.xmlErros} XML com erro` : ''}${resumo.ignoradas ? `, ${resumo.ignoradas} sem dados reconhecidos` : ''}.`;
    await pool.query('UPDATE contas_email SET ultima_execucao = NOW(), ultimo_resultado = $1, ultimo_erro = NULL WHERE id = $2',
      [`${texto}${resumo.detalhes.length ? ` ${resumo.detalhes.slice(0, 10).join('; ')}` : ''}`, c.id]);
    if (resumo.mensagens) require('./auditoria').registrar({ usuarioId: null, usuarioNome: USUARIO.nome, acao: 'ler_caixa_email', detalhes: `(${motivo}) ${c.nome || c.usuario}: ${texto}` });
    return { ok: true, ...resumo, mensagem: texto, detalhes: resumo.detalhes };
  } catch (err) {
    const erro = err.authenticationFailed ? 'usuário ou senha recusados pelo servidor de e-mail'
      : err.code === 'ENOTFOUND' ? `servidor "${c.servidor}" não encontrado`
      : err.mailboxMissing || /Mailbox doesn't exist|NONEXISTENT/i.test(err.message || '') ? `a pasta "${c.pasta}" não existe na caixa`
      : (err.responseText || err.message || String(err));
    await pool.query('UPDATE contas_email SET ultima_execucao = NOW(), ultimo_erro = $1 WHERE id = $2', [erro, c.id]).catch(() => {});
    return { ok: false, mensagem: `Não consegui ler a caixa ${c.nome || c.usuario}: ${erro}` };
  } finally {
    if (cliente) await cliente.logout().catch(() => {});
  }
}

// Lê uma caixa (id) ou todas as ativas. Uma de cada vez.
// finalidade: só as caixas dessa finalidade (ex.: 'cte', pelo botão da tela de CT-e).
async function executar(id = null, motivo = 'manual', finalidade = null) {
  if (rodando) return { ok: false, mensagem: 'Já existe uma leitura de e-mail em andamento. Tente de novo em instantes.' };
  rodando = true;
  try {
    const contas = id ? [await buscarConta(id)].filter(Boolean) : (await listarContas()).filter((c) => c.ativo && (!finalidade || c.finalidade === finalidade));
    if (!contas.length) return { ok: false, mensagem: finalidade === 'cte' ? 'Nenhuma caixa de e-mail de NF-e cadastrada. Cadastre em Manutenção → Leitura automática de e-mail, escolhendo "NF-e dos clientes viram rascunho de CT-e".' : 'Nenhuma caixa de e-mail ativa cadastrada.' };
    const resultados = [];
    for (const c of contas) resultados.push(await executarConta(c, motivo));
    return { ok: resultados.every((r) => r.ok), mensagem: resultados.map((r) => r.mensagem).join(' | '), cte: resultados.reduce((s, r) => s + (r.cte || 0), 0), detalhes: resultados.flatMap((r) => r.detalhes || []) };
  } finally {
    rodando = false;
  }
}

function agendar() {
  cron.schedule('* * * * *', async () => {
    if (rodando) return;
    try {
      for (const c of (await listarContas()).filter((x) => x.ativo)) {
        const passou = c.ultima_execucao ? Date.now() - new Date(c.ultima_execucao).getTime() : Infinity;
        if (passou < (Number(c.intervalo_minutos) || 15) * 60000) continue;
        rodando = true;
        try { await executarConta(c, 'agendado'); } finally { rodando = false; }
      }
    } catch (err) {
      console.error('[email]', err.message);
    }
  });
}

module.exports = { listarContas, buscarConta, salvarConta, excluirConta, semSenha, testar, executar, agendar, processarMensagem };
