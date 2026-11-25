const XLSX = require('xlsx');

// Data do mapa de carregamento. O mapa agora vem na planilha do ERP (Timeline de
// pedidos, ver importacaoErp.js); a importação separada do relatório do mapa saiu.

const dois = (n) => String(n).padStart(2, '0');

// "01/09/2026 15:17:23", "01/09/2026", data do Excel (Date) ou número serial → 'AAAA-MM-DD'.
function paraData(valor) {
  if (valor == null || valor === '') return null;
  if (valor instanceof Date && !isNaN(valor)) {
    return `${valor.getFullYear()}-${dois(valor.getMonth() + 1)}-${dois(valor.getDate())}`;
  }
  if (typeof valor === 'number') {
    const d = XLSX.SSF.parse_date_code(valor);
    return d ? `${d.y}-${dois(d.m)}-${dois(d.d)}` : null;
  }
  const texto = String(valor).trim();
  let m = texto.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/);
  if (m) return `${m[3]}-${dois(m[2])}-${dois(m[1])}`;
  m = texto.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
}

module.exports = { paraData };
