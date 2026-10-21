const nodemailer = require('nodemailer');
const pool = require('./db');

// Conexão com o servidor de email. A "conexão segura" depende da porta:
// na 465 a conexão já começa criptografada (SSL); na 587 (Gmail, Outlook) ela
// começa normal e vira segura logo em seguida (STARTTLS). Marcar SSL na 587
// fazia o envio falhar — agora a porta decide sozinha.
function criarTransportador(config) {
  const porta = Number(config.smtp_porta) || 587;
  return nodemailer.createTransport({
    host: config.smtp_host,
    port: porta,
    secure: porta === 465,
    requireTLS: porta !== 465 && !!config.smtp_seguro,
    auth: { user: config.smtp_usuario, pass: senhaSmtp(config.smtp_senha) },
  });
}

// Senha do SMTP fica criptografada no banco (e nos backups). Uma senha antiga,
// gravada antes disso em texto aberto, ainda funciona e é criptografada no
// próximo "Salvar".
function senhaSmtp(guardada) {
  if (!guardada) return guardada;
  if (!String(guardada).startsWith('v1:')) return guardada;
  try { return require('./rastreioLonngren').descriptografar(guardada); } catch { return null; }
}

async function buscarConfiguracao() {
  const { rows } = await pool.query('SELECT * FROM configuracao_email WHERE id = 1');
  if (rows[0]) return rows[0];
  const inserido = await pool.query('INSERT INTO configuracao_email (id) VALUES (1) RETURNING *');
  return inserido.rows[0];
}

async function salvarConfiguracao(dados) {
  const campos = ['ativo', 'smtp_host', 'smtp_porta', 'smtp_seguro', 'smtp_usuario', 'smtp_senha', 'email_remetente', 'nome_remetente', 'resumo_semanal_ativo', 'resumo_semanal_email'];
  const presentes = campos.filter((c) => dados[c] !== undefined);
  if (presentes.length === 0) return buscarConfiguracao();

  await pool.query('INSERT INTO configuracao_email (id) VALUES (1) ON CONFLICT (id) DO NOTHING');
  const sets = presentes.map((c, i) => `${c} = $${i + 1}`);
  const valores = presentes.map((c) => (c === 'smtp_senha' && dados[c] ? require('./rastreioLonngren').criptografar(dados[c]) : dados[c]));
  const { rows } = await pool.query(
    `UPDATE configuracao_email SET ${sets.join(', ')} WHERE id = 1 RETURNING *`,
    valores
  );
  return rows[0];
}

// Monta e manda o "espelho do cálculo" pra transportadora, com os valores
// cobrados x esperados, pra ela conferir e responder com correção ou glosa.
async function enviarEspelhoCalculo({ destinatarioEmail, destinatarioNome, frete, taxas }) {
  const config = await buscarConfiguracao();
  if (!config.ativo || !config.smtp_host || !config.smtp_usuario) {
    throw new Error('O envio de email não está configurado. Configure o SMTP em Manutenção → Email.');
  }

  const transportador = criarTransportador(config);

  const moeda = (v) => v == null ? '—' : `R$ ${Number(v).toFixed(2).replace('.', ',')}`;

  const linhasTaxas = (taxas || []).map((t) => `
    <tr>
      <td style="padding:6px 10px; border-bottom:1px solid #eee;">${t.nome}</td>
      <td style="padding:6px 10px; border-bottom:1px solid #eee; text-align:right;">${moeda(t.cobrado)}</td>
      <td style="padding:6px 10px; border-bottom:1px solid #eee; text-align:right;">${moeda(t.esperado)}</td>
      <td style="padding:6px 10px; border-bottom:1px solid #eee; text-align:right; color:${t.divergente ? '#c0392b' : '#1f9d5c'};">${moeda(t.diferenca)}</td>
    </tr>
  `).join('');

  const html = `
    <div style="font-family:Arial,sans-serif; max-width:600px; margin:0 auto;">
      <h2 style="color:#1F4E78;">Espelho de Cálculo de Frete</h2>
      <p>Prezados, ${destinatarioNome || ''},</p>
      <p>Identificamos uma divergência entre o valor cobrado no CT-e <strong>${frete.numero_cte || '—'}</strong>
         (Pedido ${frete.numero_pedido || '—'} / NF ${frete.numero_nf || '—'}) e o valor calculado pela nossa tabela de frete acordada.</p>
      <table style="width:100%; border-collapse:collapse; margin:16px 0;">
        <tr style="background:#f1f5f9;">
          <td style="padding:8px 10px;"><strong>Valor Negociado (CT-e)</strong></td>
          <td style="padding:8px 10px; text-align:right;">${moeda(frete.valor_frete_negociado)}</td>
        </tr>
        <tr>
          <td style="padding:8px 10px;"><strong>Valor Tabelado (acordado)</strong></td>
          <td style="padding:8px 10px; text-align:right;">${moeda(frete.valor_frete_tabelado)}</td>
        </tr>
        <tr style="background:#f1f5f9;">
          <td style="padding:8px 10px;"><strong>${-Number(frete.dif_negociado_tabela) > 0 ? 'Cobrado a mais que o acordado' : 'Diferença (CT-e − acordado)'}</strong></td>
          <td style="padding:8px 10px; text-align:right; color:#c0392b;"><strong>${frete.dif_negociado_tabela != null ? moeda(-Number(frete.dif_negociado_tabela)) : '—'}</strong></td>
        </tr>
      </table>
      ${linhasTaxas ? `
        <h3 style="color:#1F4E78; font-size:15px;">Conferência de taxas</h3>
        <table style="width:100%; border-collapse:collapse; font-size:13px;">
          <thead>
            <tr style="background:#1F4E78; color:#fff;">
              <th style="padding:6px 10px; text-align:left;">Taxa</th>
              <th style="padding:6px 10px; text-align:right;">Cobrado</th>
              <th style="padding:6px 10px; text-align:right;">Esperado</th>
              <th style="padding:6px 10px; text-align:right;">Diferença</th>
            </tr>
          </thead>
          <tbody>${linhasTaxas}</tbody>
        </table>
      ` : ''}
      <p style="margin-top:20px;">Pedimos a gentileza de verificar o valor e retornar com a <strong>correção</strong> (Carta de Correção)
         ou com a <strong>confirmação de desconto (glosa)</strong> na próxima fatura.</p>
      <p style="color:#888; font-size:12px; margin-top:30px;">Email gerado automaticamente pelo Nexofrete.</p>
    </div>
  `;

  await transportador.sendMail({
    from: `"${config.nome_remetente || 'Nexofrete'}" <${config.email_remetente || config.smtp_usuario}>`,
    to: destinatarioEmail,
    subject: `Divergência de Frete — CT-e ${frete.numero_cte || ''} / Pedido ${frete.numero_pedido || ''}`,
    html,
  });
}

// Manda um resumo executivo, com os números da semana, pra quem for
// configurado em Manutenção — pra saber como está a operação sem precisar
// abrir o sistema.
async function enviarResumoSemanal({ destinatarioEmail, dados }) {
  const config = await buscarConfiguracao();
  if (!config.ativo || !config.smtp_host || !config.smtp_usuario) {
    throw new Error('O envio de email não está configurado.');
  }

  const transportador = criarTransportador(config);

  const moeda = (v) => v == null ? 'R$ 0,00' : `R$ ${Number(v).toFixed(2).replace('.', ',')}`;

  const html = `
    <div style="font-family:Arial,sans-serif; max-width:600px; margin:0 auto;">
      <h2 style="color:#1F4E78;">📊 Resumo Semanal — Nexofrete</h2>
      <p>Aqui está como ficou a última semana:</p>
      <table style="width:100%; border-collapse:collapse; margin:16px 0;">
        <tr style="background:#f1f5f9;"><td style="padding:8px 10px;">Fretes emitidos na semana</td><td style="padding:8px 10px; text-align:right;"><strong>${dados.qtdFretesSemana}</strong></td></tr>
        <tr><td style="padding:8px 10px;">Gasto total com frete na semana</td><td style="padding:8px 10px; text-align:right;"><strong>${moeda(dados.gastoSemana)}</strong></td></tr>
        <tr style="background:#f1f5f9;"><td style="padding:8px 10px;">Fretes Retidos (aguardando resolução)</td><td style="padding:8px 10px; text-align:right; color:#c0392b;"><strong>${dados.qtdRetidos}</strong></td></tr>
        <tr><td style="padding:8px 10px;">Liberado p/ Pagamento (total)</td><td style="padding:8px 10px; text-align:right; color:#1f9d5c;"><strong>${moeda(dados.valorLiberado)}</strong></td></tr>
        <tr style="background:#f1f5f9;"><td style="padding:8px 10px;">Vencendo nos próximos 7 dias</td><td style="padding:8px 10px; text-align:right;"><strong>${moeda(dados.vencendo7dias)}</strong></td></tr>
        ${dados.metaGeral != null ? `
        <tr><td style="padding:8px 10px;">Meta de gasto do mês</td><td style="padding:8px 10px; text-align:right;"><strong>${moeda(dados.realizadoMes)} de ${moeda(dados.metaGeral)} (${dados.percentualMeta.toFixed(0)}%)</strong></td></tr>
        ` : ''}
      </table>
      <p style="color:#888; font-size:12px; margin-top:30px;">Email gerado automaticamente pelo Nexofrete, toda segunda-feira.</p>
    </div>
  `;

  await transportador.sendMail({
    from: `"${config.nome_remetente || 'Nexofrete'}" <${config.email_remetente || config.smtp_usuario}>`,
    to: destinatarioEmail,
    subject: `📊 Resumo Semanal do Nexofrete`,
    html,
  });
}

// Manda o código de verificação (login em duas etapas).
async function enviarCodigo2FA({ destinatarioEmail, destinatarioNome, codigo }) {
  const config = await buscarConfiguracao();
  if (!config.ativo || !config.smtp_host || !config.smtp_usuario) {
    throw new Error('O envio de email não está configurado — fale com o administrador do sistema.');
  }

  const transportador = criarTransportador(config);

  const html = `
    <div style="font-family:Arial,sans-serif; max-width:480px; margin:0 auto;">
      <h2 style="color:#1F4E78;">Código de acesso</h2>
      <p>Olá, ${destinatarioNome || ''}. Use o código abaixo para entrar no Nexofrete:</p>
      <div style="font-size:32px; font-weight:700; letter-spacing:6px; text-align:center; background:#f1f5f9; padding:18px; border-radius:10px; color:#1F4E78; margin:20px 0;">${codigo}</div>
      <p style="color:#888; font-size:12px;">Esse código vale por 5 minutos. Se não foi você quem tentou entrar, ignore este email.</p>
    </div>
  `;

  await transportador.sendMail({
    from: `"${config.nome_remetente || 'Nexofrete'}" <${config.email_remetente || config.smtp_usuario}>`,
    to: destinatarioEmail,
    subject: `${codigo} — Seu código de acesso`,
    html,
  });
}

// Aviso da agenda (convite, lembrete, alteração ou cancelamento). Só manda se
// o envio de email estiver configurado; se não estiver, não faz nada — o aviso
// dentro do sistema continua valendo.
async function enviarAvisoAgenda({ destinatarioEmail, destinatarioNome, assunto, titulo, linhas }) {
  const config = await buscarConfiguracao();
  if (!config.ativo || !config.smtp_host || !config.smtp_usuario || !destinatarioEmail) return false;
  const transportador = criarTransportador(config);
  const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const html = `
    <div style="font-family:Arial,sans-serif; max-width:520px; margin:0 auto;">
      <h2 style="color:#1F4E78; margin-bottom:6px;">📅 ${esc(titulo)}</h2>
      <p style="margin-top:0;">Olá, ${esc(destinatarioNome || '')}.</p>
      ${linhas.map((l) => `<p style="margin:6px 0;">${esc(l)}</p>`).join('')}
      <p style="color:#888; font-size:12px; margin-top:26px;">Aviso automático da agenda do Nexofrete.</p>
    </div>`;
  await transportador.sendMail({
    from: `"${config.nome_remetente || 'Nexofrete'}" <${config.email_remetente || config.smtp_usuario}>`,
    to: destinatarioEmail,
    subject: assunto,
    html,
  });
  return true;
}

// Aviso de entrega para o cliente da transportadora (saiu para entrega, entregue...).
async function enviarAvisoEntrega({ destinatarioEmail, assunto, titulo, linhas, link, rodape }) {
  const config = await buscarConfiguracao();
  if (!config.ativo || !config.smtp_host || !config.smtp_usuario) throw new Error('E-mail (SMTP) não está configurado.');
  const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const html = `
    <div style="font-family:Arial,sans-serif; max-width:540px; margin:0 auto;">
      <h2 style="color:#1F4E78; margin-bottom:10px;">${esc(titulo)}</h2>
      ${linhas.map((l) => `<p style="margin:6px 0;">${esc(l)}</p>`).join('')}
      ${link ? `<p style="margin:22px 0;"><a href="${esc(link)}" style="background:#2f5bea; color:#fff; padding:10px 18px; border-radius:6px; text-decoration:none;">Acompanhar a entrega</a></p>` : ''}
      <p style="color:#888; font-size:12px; margin-top:26px;">${esc(rodape || 'Aviso automático.')}</p>
    </div>`;
  await criarTransportador(config).sendMail({
    from: `"${config.nome_remetente || 'Nexofrete'}" <${config.email_remetente || config.smtp_usuario}>`,
    to: destinatarioEmail, subject: assunto, html,
  });
  return true;
}

// Fatura para o cliente: a fatura vai no corpo do e-mail (com o QR Code do PIX
// como imagem embutida) e também anexada em HTML, para imprimir.
async function enviarFatura({ destinatarioEmail, copia, assunto, html, anexos = [] }) {
  const config = await buscarConfiguracao();
  if (!config.ativo || !config.smtp_host || !config.smtp_usuario) throw new Error('E-mail (SMTP) não está configurado (Cadastros → Configurações).');
  await criarTransportador(config).sendMail({
    from: `"${config.nome_remetente || 'Nexofrete'}" <${config.email_remetente || config.smtp_usuario}>`,
    to: destinatarioEmail, cc: copia || undefined, subject: assunto, html, attachments: anexos,
  });
  return true;
}

// SAC: aviso ao cliente/equipe; "responderPara" faz a resposta cair na caixa do SAC.
async function enviarSac({ para, assunto, html, responderPara }) {
  const config = await buscarConfiguracao();
  if (!config.ativo || !config.smtp_host || !config.smtp_usuario) throw new Error('E-mail (SMTP) não está configurado.');
  await criarTransportador(config).sendMail({
    from: `"${config.nome_remetente || 'Nexofrete'}" <${config.email_remetente || config.smtp_usuario}>`,
    to: para, replyTo: responderPara || undefined, subject: assunto, html,
  });
  return true;
}

module.exports = { enviarSac, buscarConfiguracao, salvarConfiguracao, enviarEspelhoCalculo, enviarResumoSemanal, enviarCodigo2FA, enviarAvisoAgenda, enviarAvisoEntrega, enviarFatura };
