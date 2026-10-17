"""Lista de componentes, footprints e ligacoes (nets) do Pre Power CB150.

Mesma topologia de ../meteoro_cb150.cir. Potenciometros, jaque, chave e
ponte retificadora ficam fora da placa, ligados por conectores.
"""

LIB = "/usr/share/kicad/footprints"

# footprints (biblioteca, nome)
R14W = ("Resistor_THT", "R_Axial_DIN0207_L6.3mm_D2.5mm_P10.16mm_Horizontal")
R12W = ("Resistor_THT", "R_Axial_DIN0309_L9.0mm_D3.2mm_P12.70mm_Horizontal")
R2W = ("Resistor_THT", "R_Axial_DIN0414_L11.9mm_D4.5mm_P15.24mm_Horizontal")
R5W = ("Resistor_THT", "R_Axial_Power_L20.0mm_W6.4mm_P25.40mm")
C_CER = ("Capacitor_THT", "C_Disc_D5.0mm_W2.5mm_P5.00mm")
C_FILM = ("Capacitor_THT", "C_Rect_L7.2mm_W3.5mm_P5.00mm_FKS2_FKP2_MKS2_MKP2")
C_FILM10 = ("Capacitor_THT", "C_Rect_L13.0mm_W5.0mm_P10.00mm_FKS3_FKP3_MKS4")
CP5 = ("Capacitor_THT", "CP_Radial_D5.0mm_P2.50mm")
CP6 = ("Capacitor_THT", "CP_Radial_D6.3mm_P2.50mm")
CP8 = ("Capacitor_THT", "CP_Radial_D8.0mm_P5.00mm")
CP10 = ("Capacitor_THT", "CP_Radial_D10.0mm_P5.00mm")
CP35 = ("Capacitor_THT", "CP_Radial_D35.0mm_P10.00mm_SnapIn")
DZ = ("Diode_THT", "D_DO-41_SOD81_P10.16mm_Horizontal")
TO92 = ("Package_TO_SOT_THT", "TO-92_Inline_Wide")
TO126 = ("Package_TO_SOT_THT", "TO-126-3_Vertical")
TO264 = ("Package_TO_SOT_THT", "TO-264-3_Vertical")
DIP8 = ("Package_DIP", "DIP-8_W7.62mm")
TRIM = ("Potentiometer_THT", "Potentiometer_Bourns_3296W_Vertical")
H2 = ("Connector_PinHeader_2.54mm", "PinHeader_1x02_P2.54mm_Vertical")
H3 = ("Connector_PinHeader_2.54mm", "PinHeader_1x03_P2.54mm_Vertical")
TB2 = ("TerminalBlock_Phoenix", "TerminalBlock_Phoenix_MKDS-1,5-2_1x02_P5.00mm_Horizontal")
TB3 = ("TerminalBlock_Phoenix", "TerminalBlock_Phoenix_MKDS-1,5-3_1x03_P5.00mm_Horizontal")
FUSE = ("Fuse", "Fuseholder_Clip-5x20mm_Littelfuse_100_Inline_P20.50x4.60mm_D1.30mm_Horizontal")

# ref: (footprint, valor, {pad: net}, grupo)
# eletroliticos: pad 1 = +   | diodos: pad 1 = catodo
# TO-92 MPSA: 1=E 2=B 3=C | TO-92 BC546/BC556: 1=C 2=B 3=E
# TO-126 BD: 1=E 2=C 3=B | TO-264: 1=B 2=C 3=E
# TL082: 1 OUT1 2 IN1- 3 IN1+ 4 V- 5 IN2+ 6 IN2- 7 OUT2 8 V+
P = {}


def part(ref, fp, val, nets, grp):
    P[ref] = (fp, val, {str(i + 1): n for i, n in enumerate(nets)} if isinstance(nets, (list, tuple)) else nets, grp)


# ---- pre-amplificador ----
part("J1", H2, "ENTRADA", ["IN", "GND"], "pre")
part("JCH1", H2, "CH1", ["N3", "GND"], "pre")
part("JRV1", H2, "RV1 20KB", ["OUT3", "IN2N"], "pre")
part("JRV2", H3, "RV2 100KB", ["TONEM", "RV2W", "TREB"], "pre")
part("JRV3", H2, "RV3 10KB", ["TONEN", "GND"], "pre")
part("JRV4", H2, "RV4 50KA", ["TONEN", "TONEM"], "pre")
part("R1", R14W, "1k5", ["IN", "N1"], "pre")
part("C1", C_FILM, "22n", ["N1", "IN1P"], "pre")
part("R2", R14W, "220k", ["IN1P", "GND"], "pre")
part("CI1", DIP8, "TL082", ["OUT1", "IN1N", "IN1P", "VN12", "IN1BP", "IN1BN", "OUT2", "VP12"], "pre")
part("R4", R14W, "22k", ["OUT1", "IN1N"], "pre")
part("C3", C_CER, "330p", ["OUT1", "IN1N"], "pre")
part("R50", R14W, "47k", ["OUT1", "N50"], "pre")
part("C11", C_FILM, "22n", ["N50", "IN1N"], "pre")
part("C2", CP5, "10u/63V", ["IN1N", "N2"], "pre")
part("R3", R14W, "2k7", ["N2", "N3"], "pre")
part("R13", R14W, "10k", ["N3", "GND"], "pre")
part("C4", C_FILM, "2n2", ["OUT1", "TREB"], "pre")
part("R6", R14W, "12k", ["OUT1", "TONEM"], "pre")
part("C5", C_FILM, "100n", ["TONEN", "TONEM"], "pre")
part("R5", R14W, "2k7", ["TONEN", "GND"], "pre")
part("C6", C_FILM, "47n", ["RV2W", "IN1BP"], "pre")
part("R7", R14W, "270k", ["IN1BP", "GND"], "pre")
part("R9", R14W, "2k2", ["GND", "N9"], "pre")
part("C8", CP6, "22u/63V", ["IN1BN", "N9"], "pre")
part("R8", R14W, "22k", ["OUT2", "IN1BN"], "pre")
part("C7", C_CER, "120p", ["OUT2", "IN1BN"], "pre")
part("R10", R14W, "47k", ["OUT2", "N10"], "pre")
part("R12", R14W, "4k7", ["OUT2", "N12"], "pre")
part("C10", C_FILM, "2n2", ["N12", "N10"], "pre")
part("C9", C_FILM10, "1u", ["N10", "IN2N"], "pre")
part("CI2", DIP8, "TL071", {"2": "IN2N", "3": "GND", "4": "VN12", "6": "OUT3", "7": "VP12"}, "pre")
part("C13", C_CER, "330p", ["OUT3", "IN2N"], "pre")
part("CD1", C_CER, "100n", ["VP12", "GND"], "pre")
part("CD2", C_CER, "100n", ["GND", "VN12"], "pre")

# ---- entrada do power / par diferencial / VAS ----
part("R14", R14W, "4k7", ["OUT3", "N14"], "drv")
part("C100", CP5, "2u2/63V", ["N14", "QB1"], "drv")
part("R102", R14W, "27k", ["QB1", "GND"], "drv")
part("R101", R14W, "1k", ["QB1", "N101"], "drv")
part("C101", CP5, "4u7/50V", ["N101", "FB"], "drv")
part("R100", R12W, "5k6", ["VP55", "VZ"], "drv")
part("D3", DZ, "1N4739", ["VZ", "GND"], "drv")
part("C16", CP5, "10u/63V", ["VZ", "GND"], "drv")
part("R15", R14W, "1k6", ["VZ", "EDIF"], "drv")
part("Q1", TO92, "MPSA92", ["E1", "QB1", "VASB"], "drv")
part("Q2", TO92, "MPSA92", ["E2", "FB", "NM"], "drv")
# melhorias: degeneracao de emissor e espelho de corrente no par diferencial
part("R37", R14W, "47R", ["E1", "EDIF"], "drv")
part("R38", R14W, "47R", ["E2", "EDIF"], "drv")
part("QM1", TO92, "MPSA42", ["EM1", "NM", "VASB"], "drv")
part("QM2", TO92, "MPSA42", ["EM2", "NM", "NM"], "drv")
part("RM1", R14W, "100R", ["EM1", "VN55"], "drv")
part("RM2", R14W, "100R", ["EM2", "VN55"], "drv")
part("R17", R14W, "27k", ["OUT", "FB"], "drv")
part("R16", R14W, "1k", ["FB", "N16"], "drv")
part("C12", CP10, "220u/63V", ["N16", "GND"], "drv")
part("R19", R14W, "33R", ["E3", "VN55"], "drv")
part("Q3", TO126, "BD139", ["E3", "VAS", "VASB"], "drv")
# melhoria: limitador de corrente do VAS
part("Q9", TO92, "BC546", ["VASB", "E3", "VN55"], "drv")
part("C14", C_CER, "470p", ["VAS", "VASB"], "drv")

# ---- bias / drivers / saida ----
part("Q8", TO92, "MPSA42", ["VAS", "Q8B", "BIAST"], "out")
part("R21", R14W, "1k5", ["BIAST", "RV5T"], "out")
part("RV5", TRIM, "1k", ["RV5T", "Q8B", "RV5B"], "out")
part("R22", R14W, "680R", ["RV5B", "VAS"], "out")
part("R23", R12W, "2k7", ["BIAST", "NBOOT"], "out")
part("R24", R12W, "2k7", ["NBOOT", "VP55"], "out")
part("C15", CP8, "47u/63V", ["NBOOT", "OUT"], "out")
part("Q5", TO126, "BD139", ["Q7B", "VP55", "BIAST"], "out")
part("Q4", TO126, "BD140", ["Q6B", "VN55", "VAS"], "out")
part("Q7", TO264, "2SC5200", ["Q7B", "VP55", "Q7E"], "out")
part("Q6", TO264, "2SA1943", ["Q6B", "VN55", "Q6E"], "out")
part("R28", R5W, "0R33 5W", ["Q7E", "OUT"], "out")
part("R27", R5W, "0R33 5W", ["Q6E", "OUT"], "out")
part("R26", R2W, "4R7 2W", ["OUT", "N26"], "out")
part("C17", C_FILM, "100n", ["N26", "GNDP"], "out")
part("R29", R14W, "12k", ["OUT", "LINE"], "out")
part("R30", R14W, "470R", ["LINE", "GND"], "out")
part("C21", C_FILM10, "1u", ["LINE", "LINEOUT"], "out")
part("JLINE", H2, "LINE OUT", ["LINEOUT", "GND"], "out")
# melhorias: resistor entre drivers, limitadores de corrente da saida, bobina de saida
part("R31", R14W, "220R", ["Q7B", "Q6B"], "out")
part("R32", R14W, "3k3", ["Q7E", "QL1B"], "out")
part("R33", R14W, "1k", ["QL1B", "OUT"], "out")
part("QL1", TO92, "BC546", ["BIAST", "QL1B", "OUT"], "out")
part("R34", R14W, "3k3", ["Q6E", "QL2B"], "out")
part("R35", R14W, "1k", ["QL2B", "OUT"], "out")
part("QL2", TO92, "BC556", ["VAS", "QL2B", "OUT"], "out")
part("L1", R2W, "10R 2W + 1uH", ["OUT", "SPK"], "out")
part("JSPK", TB2, "SPEAKER", ["SPK", "GNDP"], "out")

# ---- fonte ----
part("JPWR", TB3, "+55 GND -55", ["VP55R", "GNDP", "VN55R"], "psu")
part("C20", CP35, "10000u/63V", ["VP55R", "GNDP"], "psu")
part("C19", CP35, "10000u/63V", ["GNDP", "VN55R"], "psu")
# melhoria: fusiveis 5 A rapidos entre os capacitores e o amplificador
part("F1", FUSE, "5A rapido", {"1": "VP55R", "2": "VP55"}, "psu")
part("F2", FUSE, "5A rapido", {"1": "VN55", "2": "VN55R"}, "psu")
part("R88", R2W, "2k2 2W", ["VP55", "VP12"], "psu")
part("D1", DZ, "1N4742A", ["VP12", "GND"], "psu")
part("R20", R2W, "2k2 2W", ["VN12", "VN55"], "psu")
part("D2", DZ, "1N4742A", ["GND", "VN12"], "psu")
part("C18", CP5, "10u/63V", ["GND", "VN12"], "psu")
# GND (sinal) e GNDP (potencia) se unem num unico ponto: o jumper de estrela
part("JGND", R14W, "PONTE FIO", ["GND", "GNDP"], "psu")

# largura de trilha (mm) por net
# (grade de roteamento de 1,27 mm: trilhas <= 0,8 mm podem ficar em celulas vizinhas)
WIDTH = {"VP55": 2.0, "VN55": 2.0, "VP55R": 2.0, "VN55R": 2.0, "SPK": 2.0, "OUT": 2.0, "Q7E": 2.0, "Q6E": 2.0, "GNDP": 2.0,
         "GND": 1.2, "Q7B": 1.2, "Q6B": 1.2}
DEFAULT_WIDTH = 0.75
CLEARANCE = 0.5
