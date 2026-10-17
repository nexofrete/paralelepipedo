# Meteoro Amplifier — Pré Power CB150

Montagem do esquema **Pré Power CB150** (Poi 20.60.40.012, rev. 0.0, 18/06/2007):
pré-amplificador com op-amps TL082/TL071, equalização passiva e amplificador
de potência classe AB discreto (±55 V, par 2SC5200/2SA1943).

Esta versão inclui **melhorias** sobre o esquema original (proteções, espelho
de corrente etc.); veja [Melhorias aplicadas](#melhorias-aplicadas). Os
componentes novos ou alterados estão marcados com ★ nas listas.

| Arquivo | Conteúdo |
|---|---|
| `meteoro_cb150.cir` | Netlist SPICE completa (pré + potência), com modelos, pronta para o ngspice |
| `fonte.cir` | Fonte de alimentação (trafo, ponte KBPC606, filtros, reguladores ±12 V) |
| `pcb/meteoro_cb150_pcb.pdf` | **Placa de circuito impresso em PDF** (dupla face: as duas faces em 1:1 para transferência, montagem) |
| `pcb/meteoro_cb150.kicad_pcb` | A mesma placa em KiCad (abre no KiCad 7+, permite gerar Gerber) |

```sh
ngspice -b meteoro_cb150.cir   # ponto de operação, resposta AC e transiente 1 kHz
ngspice -b fonte.cir           # tensões da fonte
```

## Melhorias aplicadas

| Melhoria | Componentes | Para quê |
|---|---|---|
| Espelho de corrente no par diferencial | QM1, QM2 (MPSA42), RM1, RM2 (100 Ω) | menos distorção, offset ≈ 0 |
| Degeneração de emissor + cauda com 5,2 mA | R37, R38 (47 Ω), R15 3k3 → 1k6 | dobra o slew rate e mantém a estabilidade |
| Resistor de emissor e limitador no VAS | R19 560 Ω → 33 Ω no emissor de Q3, Q9 (BC546) | limita o VAS a ~18 mA (necessário para o limitador de saída funcionar) |
| Proteção contra curto na saída | QL1 (BC546), QL2 (BC556), R32/R34 (3k3), R33/R35 (1k) | limita a corrente de saída a ~8,5 A de pico |
| Resistor entre os drivers | R31 (220 Ω) entre emissores de Q5 e Q4 | desligamento mais rápido dos transistores de saída |
| Bobina de saída | L1: 1 µH (≈ 12 voltas de fio 1 mm) enrolada sobre resistor de 10 Ω/2 W | estabilidade com cabos longos e carga capacitiva |
| Offset equilibrado | R17 3k3 → 27k, R16 120 Ω → 1k | mesma impedância nas bases de Q1 e Q2 (ganho continua 28×) |
| Fusíveis nos trilhos | F1, F2 (5 A rápido, porta-fusível 5×20 de placa) | protege alto-falante e transistores se algo entrar em curto |
| Filtro maior | C19, C20 4700 µF → **10 000 µF**/63 V | menos ripple e queda de tensão em potência alta |

Não incluída na placa: **proteção contra DC no alto-falante com relé**. É
recomendada (módulo pronto de proteção para alto-falante, ligado entre SPEAKER
e a caixa).

## Resultado da simulação (carga 8 Ω, bias ≈ 35 mA)

Comparação do estágio de potência original com o melhorado (modelos de
transistor aproximados — valem como comparação):

| Grandeza | Original | Melhorado |
|---|---|---|
| Offset DC na saída | +120 mV | **+4 mV** |
| Distorção 1 kHz / 50 W | 0,21 % | **0,06 %** |
| Distorção 10 kHz / 50 W | 1,7 % | **0,24 %** |
| Distorção 20 kHz / 140 W | 11,6 % | **0,57 %** |
| Overshoot em degrau, 8 Ω ‖ 2,2 µF | 0,1 % | 0,4 % (estável) |
| Corrente de pico com saída em curto (0,1 Ω) | +21 A / −55 A (queima) | **±8,5 A** (limitada) |

| Grandeza | Valor |
|---|---|
| +12 V / −12 V (zener 1N4742A) | +12,1 V / −12,1 V |
| Trilhos com secundário 2 × 39 VAC | ±54 V |
| Referência da fonte de corrente (D3) | 9,1 V |
| Corrente de cauda do par Q1/Q2 | ≈ 5,2 mA |
| Corrente do VAS (Q3) | ≈ 10 mA |
| Ganho do power (R17/R16) | 1 + 27k/1k = 28× (29 dB) |

## Lista de materiais

### Resistores (1/4 W, 5% salvo indicação)
| Ref. | Valor | | Ref. | Valor |
|---|---|---|---|---|
| R1 | 1k5 | | R16 ★ | 1k |
| R2 | 220k | | R17 ★ | 27k |
| R3 | 2k7 | | R19 ★ | 33 Ω |
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
| R15 ★ | 1k6 | | R100 | 5k6 (½ W) |
| R101 | 1k | | R102 | 27k |
| R31 ★ | 220 Ω | | R32, R34 ★ | 3k3 |
| R33, R35 ★ | 1k | | R37, R38 ★ | 47 Ω |
| RM1, RM2 ★ | 100 Ω | | L1 ★ | 10 Ω **2 W** com 1 µH enrolado (ver melhorias) |

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
| C19, C20 ★ | 10 000 µF/63 V | eletrolítico snap-in (35 mm) |
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
| QM1, QM2 ★ | MPSA42 | espelho de corrente (de preferência com hFE parecido) |
| Q9, QL1 ★ | BC546 | limitadores (VAS e saída positiva) |
| QL2 ★ | BC556 | limitador (saída negativa) |
| D1, D2 | 1N4742A | zener 12 V 1 W |
| D3 | 1N4739 | zener 9,1 V (a nota do esquema cita "D100 – 1N4742", ver observações) |
| PT1 | KBPC606 | ponte retificadora 6 A, no chassi |

### Outros
- TR: transformador 127/220 V → **2 × 39 VAC** com center tap, ≥ 250 VA, fusível no primário.
- J1: jaque P10 mono; CH1: chave 1 polo (ganho); bornes SPEAKER e LINE OUT.
- Dissipador ≥ 0,5 °C/W para Q6/Q7, isoladores, pasta térmica.
- ★ F1, F2: fusíveis 5×20 mm de 5 A rápidos + porta-fusíveis de placa.

## Placa de circuito impresso (`pcb/`)

Placa **dupla face** de 230 × 145 mm, **sem jumpers** (só 4 vias), com 98
itens: os componentes do esquema com as melhorias, conectores para as peças
de painel, 2 capacitores de desacoplamento de 100 nF nos op-amps (CD1/CD2) e
a ponte de terra JGND. As melhorias acrescentam ligações que cruzam o estágio
de saída; em face simples isso exigiria cerca de 30 jumpers, por isso a placa
passou a ser dupla face.

- **Página 2 do PDF**: cobre do lado da solda (B.Cu), em escala 1:1.
- **Página 3**: cobre do lado dos componentes (F.Cu), já espelhado para a
  transferência. Alinhe as duas faces pelos 4 furos de fixação.
- **Página 4**: lado dos componentes (referência e valor de cada peça).
- **Página 5**: as duas faces sobrepostas.
- Imprima a 100% (sem "ajustar à página"); o contorno deve medir exatamente
  230 × 145 mm.
- Em placa caseira (sem furos metalizados): passe um fio nas 4 vias e solde
  dos dois lados, e solde **também por cima** os pads que têm trilha na face
  de cima. Ou mande fabricar: o `.kicad_pcb` gera Gerber no KiCad 7+.
- O GND de sinal tem plano de cobre nas duas faces. O GND de potência
  (capacitores de filtro, Zobel, alto-falante) só se une a ele pela ponte
  **JGND** — aterramento em estrela.
- Q4/Q5/Q6/Q7 ficam na borda superior para um único dissipador; Q8 deve ficar
  encostado nele (com fios, se preciso) para o bias acompanhar a temperatura.
- Trilhas: 0,75 mm (sinal), 1,2 mm (GND, bases), 2,0 mm (±55 V, saída,
  emissores); isolação mínima de 0,5 mm, verificada com o DRC do KiCad
  (`verificar.py`).

Para regenerar (precisa de KiCad 7, numpy, scipy, Pillow, reportlab):

```sh
cd pcb
LAYERS=2 POUR=GND python3 gerar_pcb.py 62   # posição em posicao_62.json + roteamento (~5 min)
python3 verificar.py                          # DRC
python3 gerar_pdf.py                          # meteoro_cb150_pcb.pdf
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
   paralelo; desse nó (≈ 9,1 V) → R15 (1k6) → R37/R38 (47 Ω) → emissores de Q1 e Q2.
   Espelho: coletor de Q2 → coletor e base de QM2 e base de QM1; coletor de
   QM1 = coletor de Q1 = base de Q3. Emissores de QM1/QM2 → RM1/RM2 (100 Ω) → −55 V.
7. **Realimentação** — saída → R17 → base de Q2; base de Q2 → R16 → C12 (+ do
   lado de R16) → terra.
8. **VAS** — emissor de Q3 → R19 (33 Ω) → −55 V; C14 entre coletor e base de Q3.
   Q9 (BC546): base no emissor de Q3, coletor na base de Q3, emissor no −55 V.
9. **Bias (Q8)** — coletor de Q8 → R21 → RV5 → R22 → emissor; cursor de RV5 → base
   de Q8. Emissor de Q8 = coletor de Q3 = base de Q4. Coletor de Q8 = base de Q5.
10. **Bootstrap** — base de Q5 → R23 → nó → R24 → +55 V; C15 do nó à saída
    (+ do lado do nó).
11. **Saída** — Q5→Q7 (NPN) e Q4→Q6 (PNP) em Darlington; emissores de Q7/Q6 por
    R28/R27 (0,33 Ω/5 W) à saída. R31 (220 Ω) entre os emissores de Q5 e Q4.
    Limitadores: QL1 (C na base de Q5, E na saída, B no divisor R32/R33 entre
    emissor de Q7 e saída); QL2 igual no lado negativo (C na base de Q4, divisor R34/R35).
    Zobel R26 + C17 da saída ao terra. Saída → L1 (1 µH ‖ 10 Ω) → borne SPEAKER.
    LINE OUT: saída → R29 → nó (R30 ao terra) → C21 → borne.
12. **Fonte** — secundário → KBPC606 → C20 (+55 V) e C19 (−55 V), center tap no
    terra. Dos capacitores para o amplificador, passando pelos fusíveis F1/F2. ±12 V: R88/R20 (2k2 2 W) + zener D1/D2, C18 no −12 V.
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
   Com as melhorias, o RV5 no meio do curso dá pouca corrente — é normal ter
   de girar mais.
6. Teste do limitador (opcional): com o alto-falante desligado e volume baixo,
   encoste uma carga de 4 Ω; a corrente não deve passar de ~8 A de pico.
7. Só então ligue o alto-falante (8 Ω; 4 Ω no máximo, com bom dissipador).

## Observações sobre o esquema

- A nota do esquema lista R100, R101, R102, C100, C101 e "D100 – 1N4742" como
  componentes acrescentados em manutenção/revisão. O desenho mostra D3 = 1N4739
  (9,1 V), o que dá a polarização correta da cauda; com 1N4742 (12 V) a corrente
  do par sobe para ≈ 3,4 mA — também funciona.
- R101 + C101 ligam a base de Q1 à base de Q2 como desenhado; isso atenua o sinal
  vindo do CI2 (divisor R14 × R101). Na simulação eles ajudam na estabilidade
  com carga capacitiva, então foram mantidos.
- Com ±55 V e um único par de saída, use carga de 8 Ω para uso contínuo
  (≈ 150 W); em 4 Ω os 2SC5200/2SA1943 trabalham no limite da SOA (o limitador
  de corrente protege contra curto, mas não substitui um segundo par de saída).
- Os modelos dos transistores e op-amps na netlist são aproximados — servem para
  verificar ligações e polarização, não para prever distorção com precisão.
