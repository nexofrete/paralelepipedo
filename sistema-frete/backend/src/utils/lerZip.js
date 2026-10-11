const zlib = require('zlib');

// Limites contra .zip malicioso ("bomba de zip"): valem para o .zip inteiro,
// incluindo .zip dentro de .zip.
const LIMITE_POR_ARQUIVO = 50 * 1024 * 1024;     // 50 MB por arquivo descompactado
const LIMITE_TOTAL = 500 * 1024 * 1024;          // 500 MB somando tudo
const LIMITE_ARQUIVOS = 50000;

// Leitor de .zip simples (sem precisar instalar nada): devolve os arquivos
// .xml de dentro do zip como [{ nome, buffer }]. Aceita zip "normal"
// (arquivos guardados ou comprimidos com deflate, o padrão do Windows).
// Zip dentro de zip também é aberto.
function lerXmlDoZip(buffer, profundidade = 0, estado = { total: 0, arquivos: 0 }) {
  // Acha o "fim do diretório central" (assinatura 0x06054b50), procurando de trás pra frente.
  let fim = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65557); i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) { fim = i; break; }
  }
  if (fim < 0) throw new Error('Arquivo .zip inválido ou corrompido.');
  const total = buffer.readUInt16LE(fim + 10);
  let pos = buffer.readUInt32LE(fim + 16);
  const arquivos = [];

  for (let n = 0; n < total; n++) {
    if (buffer.readUInt32LE(pos) !== 0x02014b50) break;
    const metodo = buffer.readUInt16LE(pos + 10);
    const tamanhoComprimido = buffer.readUInt32LE(pos + 20);
    const tamNome = buffer.readUInt16LE(pos + 28);
    const tamExtra = buffer.readUInt16LE(pos + 30);
    const tamComentario = buffer.readUInt16LE(pos + 32);
    const inicioLocal = buffer.readUInt32LE(pos + 42);
    const nome = buffer.slice(pos + 46, pos + 46 + tamNome).toString('utf-8');
    pos += 46 + tamNome + tamExtra + tamComentario;

    const minusculo = nome.toLowerCase();
    const ehXml = minusculo.endsWith('.xml');
    const ehZip = minusculo.endsWith('.zip') && profundidade < 2;
    if (nome.endsWith('/') || (!ehXml && !ehZip)) continue;

    // Cabeçalho local do arquivo: os dados vêm logo depois dele.
    const localNome = buffer.readUInt16LE(inicioLocal + 26);
    const localExtra = buffer.readUInt16LE(inicioLocal + 28);
    const inicioDados = inicioLocal + 30 + localNome + localExtra;
    const dados = buffer.slice(inicioDados, inicioDados + tamanhoComprimido);
    let conteudo;
    if (metodo === 0) conteudo = dados;
    // Limite por arquivo descompactado: um .zip malicioso ("bomba de zip"), que
    // pode chegar até por anexo de e-mail, não consegue esgotar a memória.
    else if (metodo === 8) {
      try { conteudo = zlib.inflateRawSync(dados, { maxOutputLength: LIMITE_POR_ARQUIVO }); } catch (e) {
        if (e.code === 'ERR_BUFFER_TOO_LARGE') throw new Error(`"${nome}" dentro do .zip passa de 50 MB descompactado — arquivo recusado.`);
        throw e;
      }
    }
    else continue; // método de compressão não suportado: pula esse arquivo

    estado.total += conteudo.length;
    if (estado.total > LIMITE_TOTAL) throw new Error('O .zip descompactado passa de 500 MB — divida em arquivos menores.');
    if (++estado.arquivos > LIMITE_ARQUIVOS) throw new Error('O .zip tem arquivos demais (mais de 50 mil).');
    const nomeCurto = nome.split('/').pop();
    if (ehZip) arquivos.push(...lerXmlDoZip(conteudo, profundidade + 1, estado).map((a) => ({ ...a, nome: `${nomeCurto}/${a.nome}` })));
    else arquivos.push({ nome: nomeCurto, buffer: conteudo });
  }
  return arquivos;
}

module.exports = { lerXmlDoZip };
