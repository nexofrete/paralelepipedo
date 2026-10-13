// ZIP sem dependências: grava arquivo por arquivo direto no disco (não junta
// tudo na memória) e lê de volta um arquivo de cada vez. Usado no backup
// completo e no pacote mensal do contador. Formato ZIP padrão (deflate),
// abre no Windows, 7-Zip e WinRAR. Sem ZIP64: até 4 GB por arquivo e no total.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const TABELA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) { let c = n; for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) c = TABELA_CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
// Data/hora no formato do ZIP (MS-DOS).
function dataDos(d = new Date()) {
  return { hora: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2), data: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate() };
}

class EscritorZip {
  constructor(caminho) {
    this.caminho = caminho;
    this.fd = fs.openSync(caminho, 'w');
    this.pos = 0;
    this.entradas = [];
  }

  escrever(buf) { fs.writeSync(this.fd, buf); this.pos += buf.length; }

  // nome: caminho dentro do zip (com "/"); conteudo: Buffer ou string.
  adicionar(nome, conteudo, { data = new Date() } = {}) {
    const dados = Buffer.isBuffer(conteudo) ? conteudo : Buffer.from(String(conteudo), 'utf8');
    const comprimido = zlib.deflateRawSync(dados, { level: 6 });
    const usarDeflate = comprimido.length < dados.length;
    const corpo = usarDeflate ? comprimido : dados;
    if (this.pos + corpo.length > 0xfffffff0) throw new Error('O arquivo .zip passaria de 4 GB.');
    const nomeBuf = Buffer.from(nome.replace(/\\/g, '/'), 'utf8');
    const crc = crc32(dados);
    const { hora, data: dia } = dataDos(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6);   // 0x0800 = nome em UTF-8
    local.writeUInt16LE(usarDeflate ? 8 : 0, 8); local.writeUInt16LE(hora, 10); local.writeUInt16LE(dia, 12);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(corpo.length, 18); local.writeUInt32LE(dados.length, 22);
    local.writeUInt16LE(nomeBuf.length, 26); local.writeUInt16LE(0, 28);
    const inicio = this.pos;
    this.escrever(local); this.escrever(nomeBuf); this.escrever(corpo);
    this.entradas.push({ nomeBuf, crc, comprimido: corpo.length, tamanho: dados.length, metodo: usarDeflate ? 8 : 0, hora, dia, inicio });
  }

  // Põe uma pasta inteira do disco dentro do zip, em "prefixo/".
  adicionarPasta(pasta, prefixo) {
    if (!fs.existsSync(pasta)) return 0;
    let n = 0;
    for (const item of fs.readdirSync(pasta, { withFileTypes: true })) {
      const p = path.join(pasta, item.name);
      if (item.isDirectory()) n += this.adicionarPasta(p, `${prefixo}/${item.name}`);
      else if (item.isFile()) { this.adicionar(`${prefixo}/${item.name}`, fs.readFileSync(p), { data: fs.statSync(p).mtime }); n += 1; }
    }
    return n;
  }

  fechar() {
    const inicioCentral = this.pos;
    for (const e of this.entradas) {
      const c = Buffer.alloc(46);
      c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8);
      c.writeUInt16LE(e.metodo, 10); c.writeUInt16LE(e.hora, 12); c.writeUInt16LE(e.dia, 14);
      c.writeUInt32LE(e.crc, 16); c.writeUInt32LE(e.comprimido, 20); c.writeUInt32LE(e.tamanho, 24);
      c.writeUInt16LE(e.nomeBuf.length, 28); c.writeUInt32LE(e.inicio, 42);
      this.escrever(c); this.escrever(e.nomeBuf);
    }
    const fim = Buffer.alloc(22);
    fim.writeUInt32LE(0x06054b50, 0); fim.writeUInt16LE(this.entradas.length, 8); fim.writeUInt16LE(this.entradas.length, 10);
    fim.writeUInt32LE(this.pos - inicioCentral, 12); fim.writeUInt32LE(inicioCentral, 16);
    this.escrever(fim);
    fs.closeSync(this.fd);
    return { arquivos: this.entradas.length, tamanho: this.pos };
  }
}

// Lista as entradas de um .zip do disco: [{ nome, tamanho, ler() -> Buffer }].
// Confere o CRC de cada arquivo lido (backup corrompido não passa despercebido).
function abrirZip(caminho) {
  const fd = fs.openSync(caminho, 'r');
  const tamanho = fs.fstatSync(fd).size;
  const ler = (pos, n) => { const b = Buffer.alloc(n); fs.readSync(fd, b, 0, n, pos); return b; };
  const cauda = ler(Math.max(0, tamanho - 65557), Math.min(tamanho, 65557));
  let fim = -1;
  for (let i = cauda.length - 22; i >= 0; i -= 1) if (cauda.readUInt32LE(i) === 0x06054b50) { fim = i; break; }
  if (fim < 0) { fs.closeSync(fd); throw new Error('Arquivo .zip inválido ou corrompido.'); }
  const total = cauda.readUInt16LE(fim + 10);
  const central = ler(cauda.readUInt32LE(fim + 16), cauda.readUInt32LE(fim + 12));
  const entradas = [];
  let p = 0;
  for (let i = 0; i < total && central.readUInt32LE(p) === 0x02014b50; i += 1) {
    const metodo = central.readUInt16LE(p + 10); const crc = central.readUInt32LE(p + 16);
    const comprimido = central.readUInt32LE(p + 20); const tam = central.readUInt32LE(p + 24);
    const nNome = central.readUInt16LE(p + 28); const nExtra = central.readUInt16LE(p + 30); const nCom = central.readUInt16LE(p + 32);
    const inicio = central.readUInt32LE(p + 42);
    const nome = central.slice(p + 46, p + 46 + nNome).toString('utf8');
    p += 46 + nNome + nExtra + nCom;
    if (nome.endsWith('/')) continue;
    entradas.push({
      nome, tamanho: tam,
      ler: () => {
        const h = ler(inicio, 30);
        const dados = ler(inicio + 30 + h.readUInt16LE(26) + h.readUInt16LE(28), comprimido);
        const conteudo = metodo === 8 ? zlib.inflateRawSync(dados) : metodo === 0 ? dados : null;
        if (!conteudo) throw new Error(`"${nome}": compressão não suportada.`);
        if (crc32(conteudo) !== crc) throw new Error(`"${nome}" está corrompido dentro do .zip.`);
        return conteudo;
      },
    });
  }
  return { entradas, fechar: () => fs.closeSync(fd) };
}

module.exports = { EscritorZip, abrirZip, crc32 };
