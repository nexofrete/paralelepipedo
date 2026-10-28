// Gera PNGs de visualização e o PDF de impressão 1:1.
// Uso: node export.js   (depois de python3 build.py e python3 schematic.py)
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const PCB = path.join(ROOT, 'pcb');
const IMG = path.join(ROOT, 'img');
fs.mkdirSync(IMG, { recursive: true });

function inner(svgFile) {
  // remove o cabeçalho para embutir no HTML de impressão
  return fs.readFileSync(path.join(PCB, svgFile), 'utf8');
}

(async () => {
  const browser = await chromium.launch();
  const shots = [
    [path.join(PCB, 'previa_placa.svg'), path.join(IMG, 'previa_placa.png'), 4],
    [path.join(PCB, 'cobre_espelhado_transferencia.svg'), path.join(IMG, 'cobre_espelhado.png'), 4],
    [path.join(PCB, 'serigrafia_componentes.svg'), path.join(IMG, 'montagem.png'), 4],
    [path.join(ROOT, 'esquema.svg'), path.join(IMG, 'esquema.png'), 1.5],
  ];
  for (const [inp, out, scale] of shots) {
    const p = await browser.newPage({ deviceScaleFactor: scale });
    await p.goto('file://' + inp);
    await (await p.$('svg')).screenshot({ path: out });
    await p.close();
  }

  const ruler = `<svg xmlns="http://www.w3.org/2000/svg" width="52mm" height="8mm" viewBox="-1 0 52 8">
    <path d="M0,1 L50,1" stroke="#000" stroke-width="0.25"/>
    ${Array.from({ length: 11 }, (_, i) => `<path d="M${i * 5},1 L${i * 5},${i % 2 ? 2.5 : 3.5}" stroke="#000" stroke-width="0.25"/>`).join('')}
    <text x="25" y="7" font-size="2.6" text-anchor="middle" font-family="Arial">50 mm — confira com régua</text></svg>`;
  const page = (title, svg, note) => `<section><h1>${title}</h1><div class="b">${svg}</div>
    <div class="r">${ruler}</div><p>${note}</p></section>`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { size: A4; margin: 12mm; }
    body { font-family: Arial, sans-serif; margin: 0; }
    section { page-break-after: always; }
    h1 { font-size: 13pt; margin: 0 0 6mm; }
    p { font-size: 9.5pt; max-width: 170mm; line-height: 1.4; }
    .b svg { display: block; }
    .r { margin: 4mm 0; }
  </style></head><body>
  ${page('TDA7294 mono — COBRE (espelhado, para transferência térmica)', inner('cobre_espelhado_transferencia.svg'),
    'Imprima em impressora a laser, escala 100% (sem "ajustar à página"). A imagem já está espelhada: ' +
    'encoste o lado impresso no cobre. Os pontos brancos no centro das ilhas marcam o centro dos furos. ' +
    'Placa: 81 × 64 mm.')}
  ${page('TDA7294 mono — COBRE (sem espelhar, visto pelo lado dos componentes)', inner('cobre_vista_componentes.svg'),
    'Use para conferência ou para caneta/fotolito positivo visto por cima. Não use esta página para transferência térmica.')}
  ${page('TDA7294 mono — MONTAGEM (lado dos componentes)', inner('serigrafia_componentes.svg'),
    'Guia de montagem visto por cima. A linha tracejada é a face da aba do TDA7294: o dissipador fica atrás dela. ' +
    'W1 é um jumper de fio.')}
  </body></html>`;
  const htmlPath = path.join(PCB, 'impressao_A4.html');
  fs.writeFileSync(htmlPath, html);
  const p = await browser.newPage();
  await p.goto('file://' + htmlPath);
  await p.pdf({ path: path.join(PCB, 'impressao_A4_escala_1-1.pdf'), format: 'A4', preferCSSPageSize: true });
  fs.unlinkSync(htmlPath);
  await browser.close();
  console.log('ok');
})();
