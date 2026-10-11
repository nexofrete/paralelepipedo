// Gera o instalador do atalho para o computador de cada usuário.
//
// O instalador é um .bat que roda um script do PowerShell (passado já
// codificado, pra não ter problema com aspas, acentos ou espaços). Ele baixa
// o ícone do N direto deste servidor e cria o atalho "Nexofrete" na área de
// trabalho apontando pro endereço exato que a pessoa usou pra abrir o sistema.
// Assim cada computador fica igual ao servidor, sem precisar copiar pastas.

function montarScript({ endereco, enderecos, teste }) {
  const lista = (enderecos && enderecos.length ? enderecos : [endereco]).filter(Boolean);
  const nomeAtalho = teste ? 'Nexofrete - TESTE' : 'Nexofrete';
  const arquivoIcone = teste ? 'nexofrete-teste.ico' : 'nexofrete.ico';
  // Nome do ícone local com a versão: se o ícone mudar numa versão futura, o
  // Windows não reaproveita o antigo do cache.
  const iconeLocal = teste ? 'nexofrete-teste-v2.ico' : 'nexofrete-v2.ico';
  const q = (t) => `'${String(t).replace(/'/g, "''")}'`; // texto entre aspas simples do PowerShell

  return `
$ErrorActionPreference = 'Stop'
try {
  # Endereços do servidor: o NOME do computador primeiro (continua valendo se
  # o IP mudar) e o IP de agora como reserva. Usa o primeiro que responder.
  $enderecos = @(${lista.map(q).join(', ')})
  $endereco = $null
  foreach ($e in $enderecos) {
    try { Invoke-WebRequest -UseBasicParsing -Uri ($e + '/ping.gif') -TimeoutSec 5 | Out-Null; $endereco = $e; break } catch {}
  }
  if (-not $endereco) { throw 'Nao consegui falar com o servidor do Nexofrete pela rede.' }
  $pasta = Join-Path $env:LOCALAPPDATA 'Nexofrete'
  New-Item -ItemType Directory -Force -Path $pasta | Out-Null
  $icone = Join-Path $pasta ${q(iconeLocal)}
  Write-Host 'Baixando o icone do Nexofrete...'
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  Invoke-WebRequest -UseBasicParsing -Uri ($endereco + '/img/${arquivoIcone}') -OutFile $icone

  # Tela "Abrindo o Nexofrete...": fica neste computador e espera o servidor
  # responder antes de abrir o login (nada de erro se o servidor estiver ligando).
  $abrindo = Join-Path $pasta 'abrindo-nexofrete.html'
  Invoke-WebRequest -UseBasicParsing -Uri ($endereco + '/abrindo-nexofrete.html') -OutFile $abrindo
  $abrindoUrl = ([System.Uri]$abrindo).AbsoluteUri + '?' + (($enderecos | ForEach-Object { 'u=' + $_ }) -join '&')

  $candidatos = @(
    (Join-Path $env:ProgramFiles 'Google\\Chrome\\Application\\chrome.exe'),
    (Join-Path \${env:ProgramFiles(x86)} 'Google\\Chrome\\Application\\chrome.exe'),
    (Join-Path $env:LOCALAPPDATA 'Google\\Chrome\\Application\\chrome.exe'),
    (Join-Path \${env:ProgramFiles(x86)} 'Microsoft\\Edge\\Application\\msedge.exe'),
    (Join-Path $env:ProgramFiles 'Microsoft\\Edge\\Application\\msedge.exe')
  )
  $navegador = $candidatos | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
  if (-not $navegador) { throw 'Nao encontrei o Google Chrome nem o Microsoft Edge neste computador.' }

  $desktop = [Environment]::GetFolderPath('Desktop')
  foreach ($antigo in @('Sistema de Fretes.lnk', 'Sistema de Fretes - TESTE.lnk', ${q(nomeAtalho + '.lnk')})) {
    $caminho = Join-Path $desktop $antigo
    if (Test-Path $caminho) { Remove-Item $caminho -Force }
  }
  $shell = New-Object -ComObject WScript.Shell
  $atalho = $shell.CreateShortcut((Join-Path $desktop ${q(nomeAtalho + '.lnk')}))
  $atalho.TargetPath = $navegador
  $atalho.Arguments = '--app="' + $abrindoUrl + '" --start-maximized'
  $atalho.IconLocation = $icone + ',0'
  $atalho.Description = ${q(nomeAtalho)}
  $atalho.WorkingDirectory = Split-Path $navegador
  $atalho.Save()

  # Pede pro Windows redesenhar os icones (senao pode mostrar o antigo por um tempo).
  try { Start-Process -FilePath 'ie4uinit.exe' -ArgumentList '-show' -WindowStyle Hidden } catch {}

  Write-Host ''
  Write-Host 'Pronto! O atalho ${nomeAtalho.replace(/'/g, '')} foi criado na Area de Trabalho.' -ForegroundColor Green
  Write-Host ('Enderecos: ' + ($enderecos -join '  ou  '))
} catch {
  Write-Host ''
  Write-Host ('Nao consegui criar o atalho: ' + $_.Exception.Message) -ForegroundColor Red
  Write-Host 'Confira se este computador consegue abrir o sistema pelo navegador e tente de novo.'
}
`;
}

function gerarInstalador({ endereco, enderecos, teste }) {
  const script = montarScript({ endereco, enderecos, teste });
  // A linha de comando do Windows tem limite de ~8 mil caracteres: tira os
  // comentários e o recuo do script antes de codificar, pra caber folgado.
  const enxuto = script.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#')).join('\n');
  const codificado = Buffer.from(enxuto, 'utf16le').toString('base64');
  const linhas = [
    '@echo off',
    `title Instalar atalho do Nexofrete${teste ? ' (TESTE)' : ''}`,
    'echo ============================================',
    `echo   Instalando o atalho do Nexofrete${teste ? ' - TESTE' : ''}`,
    'echo ============================================',
    'echo.',
    `powershell -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${codificado}`,
    'echo.',
    'pause',
  ];
  return linhas.join('\r\n') + '\r\n';
}

module.exports = { gerarInstalador };
