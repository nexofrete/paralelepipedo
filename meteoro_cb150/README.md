# Meteoro Amplifier — Pré Power CB150

Montagem do esquema **Pré Power CB150** (Poi 20.60.40.012, rev. 0.0, 18/06/2007):
pré-amplificador com op-amps TL082/TL071, equalização passiva e amplificador
de potência classe AB discreto (±55 V, par 2SC5200/2SA1943).

| Arquivo | Conteúdo |
|---|---|
| `meteoro_cb150.cir` | Netlist SPICE completa (pré + potência), com modelos, pronta para o ngspice |
| `fonte.cir` | Fonte de alimentação (trafo, ponte KBPC606, filtros, reguladores ±12 V) |
| `pcb/meteoro_cb150_pcb.pdf` | **Placa de circuito impresso em PDF** (trilhas 1:1 para transferência, montagem, jumpers) |
| `pcb/meteoro_cb150.kicad_pcb` | A mesma placa em KiCad (abre no KiCad 7+, permite gerar Gerber) |

```sh
ngspice -b meteoro_cb150.cir   # ponto de operação, resposta AC e transiente 1 kHz
ngspice -b fonte.cir           # tensões da fonte
```

## Resultado da simulação (potenciômetros a 50%, carga 8 Ω)

| Grandeza | Valor |
|---|---|
| +12 V / −12 V (zener 1N4742A) | +12,1 V / −12,1 V |
| Trilhos com secundário 2 × 39 VAC | ±54 V |
| Referência da fonte de corrente (D3) | 9,1 V |
| Corrente de cauda do par Q1/Q2 | ≈ 2,6 mA |
| Corrente do VAS (Q3) | ≈ 10 mA |
| Offset DC na saída | ≈ +0,12 V |
| Ganho do power (R17/R16) | 1 + 3k3/120 = 28,5× (29 dB) |
| Ganho total entrada→alto-falante a 1 kHz | 35,6 dB |

## Lista de materiais

### Resistores (1/4 W, 5% salvo indicação)
| Ref. | Valor | | Ref. | Valor |
|---|---|---|---|---|
| R1 | 1k5 | | R16 | 120 Ω |
| R2 | 220k | | R17 | 3k3 |
| R3 | 2k7 | | R19 | 560 Ω |
| R4 | 22k | | R20 | 2k2 **2 W** |
| R5 | 2k7 | | R21 | 1k5 |
| R6 | 12k | | R22 | 680 Ω |
| R7 | 270k | | R23, R24 | 2k7 (½ W) |
| R8 | 22k | | R26 | 4,7 Ω **2 W** |
| R9 | 2k2 | | R27, R28 | 0,33 Ω **5 W** |
| R10 | 47k | | R29 | 12k |
| R12 | 4k7 | | R30 | 470 Ω |
| R13 | 10k | | R50 | 47k |
| R14 | 4k7 | | R88 | 2k2 **2 W** |
| R15 | 3k3 | | R100 | 5k6 (½ W) |
| R101 | 1k | | R102 | 27k |

### Potenciômetros
| Ref. | Valor | Função |
|---|---|---|
| RV1 | 20k linear (B) | ganho/master do CI2 (ligado como reostato) |
| RV2 | 100k linear (B) | agudos |
| RV3 | 10k linear (B) | equalização (reostato, cursor ligado a um extremo) |
| RV4 | 50k log (A) | equalização (reostato) |
| RV5 | 1k trimpot multivoltas | **ajuste de corrente de repouso (bias)** |

### Capacitores
| Ref. | Valor | Tipo |
|---|---|---|
| C1 | 22 nF | poliéster |
| C2 | 10 µF/63 V | eletrolítico |
| C3, C13 | 330 pF | cerâmico |
| C4, C10 | 2,2 nF | poliéster |
| C5 | 100 nF | poliéster |
| C6 | 47 nF | poliéster |
| C7 | 120 pF | cerâmico |
| C8 | 22 µF/63 V | eletrolítico |
| C9 | 1 µF | poliéster |
| C11 | 22 nF | poliéster |
| C12 | 220 µF/63 V | eletrolítico |
| C14 | 470 pF | cerâmico 100 V |
| C15 | 47 µF/63 V | eletrolítico (no esquema 50 V; use 63 V) |
| C16 | 10 µF/63 V | eletrolítico |
| C17 | 100 nF/250 V | poliéster |
| C18 | 10 µF/63 V | eletrolítico |
| C19, C20 | 4700 µF/63 V | eletrolítico |
| C21 | 1 µF | poliéster |
| C100 | 2,2 µF/63 V | eletrolítico |
| C101 | 4,7 µF/50 V | eletrolítico |

> No esquema "22K", "47K", "100K", "2K2" em capacitores significam **nF**
> (22K = 22 nF, 100K = 100 nF, 2K2 = 2,2 nF).

### Semicondutores
| Ref. | Peça | Observação |
|---|---|---|
| CI1 | TL082 | duplo (CI1A + CI1B) |
| CI2 | TL071 | pinos 1/5 (BAL) sem ligação |
| Q1, Q2 | MPSA92 (PNP 300 V) | parear hFE |
| Q3, Q5 | BD139 | Q5 em dissipador pequeno |
| Q4 | BD140 | em dissipador pequeno |
| Q6 | 2SA1943 | dissipador principal, isolado (mica/silicone) |
| Q7 | 2SC5200 | dissipador principal, isolado |
| Q8 | MPSA42 | **colar no dissipador** dos transistores de saída (compensação térmica) |
| D1, D2 | 1N4742A | zener 12 V 1 W |
| D3 | 1N4739 | zener 9,1 V (a nota do esquema cita "D100 – 1N4742", ver observações) |
| PT1 | KBPC606 | ponte retificadora 6 A, no chassi |

### Outros
- TR: transformador 127/220 V → **2 × 39 VAC** com center tap, ≥ 250 VA, fusível no primário.
- J1: jaque P10 mono; CH1: chave 1 polo (ganho); bornes SPEAKER e LINE OUT.
- Dissipador ≥ 0,5 °C/W para Q6/Q7, isoladores, pasta térmica.

## Placa de circuito impresso (`pcb/`)

Placa **face simples** de 210 × 135 mm, para confecção caseira (transferência
térmica ou fotolito), com 81 itens: os componentes do esquema, conectores para
as peças de painel, 2 capacitores de desacoplamento de 100 nF nos op-amps
(CD1/CD2, que não estão no esquema original) e a ponte de terra JGND.

- **Página 2 do PDF**: lado do cobre em escala 1:1 para imprimir (a 100%, sem
  "ajustar à página") e transferir para a placa. O contorno impresso deve medir
  exatamente 210 × 135 mm.
- **Página 3**: o cobre visto por baixo, para conferir e soldar.
- **Página 4**: lado dos componentes (referência e valor de cada peça).
- **Página 5**: componentes e trilhas sobrepostos.
- O GND de sinal é um plano de cobre (área preenchida). O GND de potência
  (capacitores de filtro, Zobel, alto-falante) só se une a ele pela ponte
  **JGND**, que é o aterramento em estrela.
- **15 jumpers** (W1…W15): fios no lado dos componentes, listados com o
  comprimento na página 1. São necessários porque a placa tem só uma face.
- Q4/Q5/Q6/Q7 ficam na borda superior para um único dissipador; Q8 deve ficar
  encostado nele (com fios, se preciso) para o bias acompanhar a temperatura.
- Potenciômetros (JRV1…JRV4), jaque (J1), chave CH1, ponte KBPC606 e
  transformador ficam fora da placa, ligados por fios.
- Trilhas: 0,75 mm (sinal), 1,2 mm (bases), 2,0 mm (±55 V, saída, emissores);
  isolação mínima de 0,5 mm, verificada com o DRC do KiCad (`verificar.py`).

Para regenerar (precisa de KiCad 7, numpy, scipy, Pillow, reportlab):

```sh
cd pcb
POUR=GND JUMP_COST=100 python3 gerar_pcb.py 43   # posição em posicao_43.json + roteamento (~15 min)
python3 verificar.py                               # DRC
python3 gerar_pdf.py                               # meteoro_cb150_pcb.pdf
```

## Como ligar (por blocos)

1. **Entrada / CI1A** — J1 → R1 → C1 → pino 3. R2 do pino 3 ao terra.
   Realimentação: R4 ‖ C3 entre pinos 1 e 2, e R50 + C11 em série também do
   pino 1 ao pino 2. Do pino 2: C2 (+ no pino 2) → R3 → R13 → terra.
   **CH1** curto-circuita R13 (fechada = mais ganho: 9× em vez de 2,7×).
2. **Equalização** — saída do CI1A → C4 → extremo direito de RV2; → R6 → extremo
   esquerdo de RV2. Esse mesmo ponto (R6/RV2) vai a C5 e a RV4 (reostato);
   do outro lado, C5/RV4 → R5 ‖ RV3 (reostato) → terra. Cursor de RV2 → C6 →
   pino 5 do CI1B, com R7 270k ao terra.
3. **CI1B** — R8 ‖ C7 entre pinos 7 e 6; pino 6 → C8 (+ no pino 6) → R9 → terra.
   Saída → R10 47k e → R12 4k7 + C10 2n2 em série, ambos ao mesmo nó → C9.
4. **CI2 (TL071)** — inversor: C9 → pino 2; pino 3 no terra; RV1 (reostato) ‖ C13
   entre pinos 6 e 2. Alimentação dos três op-amps: +12 V (pino 8 do TL082 /
   pino 7 do TL071) e −12 V (pino 4). Ponha 100 nF de desacoplamento junto de
   cada CI.
5. **Entrada do power** — pino 6 do CI2 → R14 → C100 (+ do lado de R14) → base de
   Q1; R102 da base de Q1 ao terra; R101 + C101 em série da base de Q1 ao nó de
   realimentação (base de Q2).
6. **Par diferencial** — +55 V → R100 → catodo de D3 (anodo no terra), C16 em
   paralelo; desse nó (≈ 9,1 V) → R15 → emissores de Q1 e Q2.
   Coletor de Q2 → −55 V. Coletor de Q1 → base de Q3 e R19 (560 Ω) ao −55 V.
7. **Realimentação** — saída → R17 → base de Q2; base de Q2 → R16 → C12 (+ do
   lado de R16) → terra.
8. **VAS** — Q3 emissor no −55 V; C14 entre coletor e base de Q3.
9. **Bias (Q8)** — coletor de Q8 → R21 → RV5 → R22 → emissor; cursor de RV5 → base
   de Q8. Emissor de Q8 = coletor de Q3 = base de Q4. Coletor de Q8 = base de Q5.
10. **Bootstrap** — base de Q5 → R23 → nó → R24 → +55 V; C15 do nó à saída
    (+ do lado do nó).
11. **Saída** — Q5→Q7 (NPN) e Q4→Q6 (PNP) em Darlington; emissores de Q7/Q6 por
    R28/R27 (0,33 Ω/5 W) à saída. Zobel R26 + C17 da saída ao terra.
    LINE OUT: saída → R29 → nó (R30 ao terra) → C21 → borne.
12. **Fonte** — secundário → KBPC606 → C20 (+55 V) e C19 (−55 V), center tap no
    terra. ±12 V: R88/R20 (2k2 2 W) + zener D1/D2, C18 no −12 V.
    Use **terra em estrela**: terra de sinal (J1, R2, R9, C12) separado do terra
    de potência (C19/C20, Zobel, alto-falante), unidos num só ponto nos capacitores.

## Primeira ligação e calibração

1. Antes de ligar: confira polaridade de todos os eletrolíticos e zeners, e
   isolação dos transistores de saída ao dissipador (multímetro em continuidade).
2. Gire **RV5** para a **mínima** corrente (menor resistência entre cursor e R21).
3. Ligue pela primeira vez **sem alto-falante** e com **lâmpada em série** no
   primário (60–100 W) ou com fonte variável.
4. Meça: ±55 V, ±12 V, ≈ 9,1 V em D3, saída **< ±50 mV** DC.
5. Ajuste **RV5** medindo a tensão sobre R27 ou R28: **7–10 mV**
   (≈ 20–30 mA de repouso). Deixe aquecer 15 min e reajuste.
6. Só então ligue o alto-falante (8 Ω; 4 Ω no máximo, com bom dissipador).

## Observações sobre o esquema

- A nota do esquema lista R100, R101, R102, C100, C101 e "D100 – 1N4742" como
  componentes acrescentados em manutenção/revisão. O desenho mostra D3 = 1N4739
  (9,1 V), o que dá a polarização correta da cauda; com 1N4742 (12 V) a corrente
  do par sobe para ≈ 3,4 mA — também funciona.
- R101 + C101 ligam a base de Q1 à base de Q2 como desenhado; isso atenua o sinal
  vindo do CI2 (divisor R14 × R101). A netlist segue o desenho.
- Com ±55 V e um único par de saída, use carga de 8 Ω para uso contínuo
  (≈ 150 W); em 4 Ω os 2SC5200/2SA1943 trabalham no limite da SOA.
- Os modelos dos transistores e op-amps na netlist são aproximados — servem para
  verificar ligações e polarização, não para prever distorção com precisão.
