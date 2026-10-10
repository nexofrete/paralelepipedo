using System;
using System.Security.Cryptography;
using TransportadoraCTe.Infra;

namespace TransportadoraCTe.CTe
{
    /// <summary>
    /// Chave de acesso do CT-e (44 digitos):
    /// cUF(2) AAMM(4) CNPJ(14) mod(2) serie(3) nCT(9) tpEmis(1) cCT(8) cDV(1)
    /// </summary>
    public static class ChaveAcesso
    {
        public static string Gerar(int cUF, DateTime emissao, string cnpj, int modelo, int serie, int numero,
                                   int tpEmis, string codigoNumerico)
        {
            string semDV =
                cUF.ToString("00") +
                emissao.ToString("yyMM") +
                Util.SoNumeros(cnpj).PadLeft(14, '0') +
                modelo.ToString("00") +
                serie.ToString("000") +
                numero.ToString("000000000") +
                tpEmis.ToString("0") +
                codigoNumerico.PadLeft(8, '0');
            if (semDV.Length != 43) throw new ApplicationException("Erro ao montar a chave de acesso: " + semDV);
            return semDV + DigitoVerificador(semDV);
        }

        /// <summary>Modulo 11 com pesos 2..9 da direita para a esquerda.</summary>
        public static int DigitoVerificador(string base43)
        {
            int peso = 2, soma = 0;
            for (int i = base43.Length - 1; i >= 0; i--)
            {
                soma += (base43[i] - '0') * peso;
                peso = peso == 9 ? 2 : peso + 1;
            }
            int resto = soma % 11;
            int dv = 11 - resto;
            return dv >= 10 ? 0 : dv;
        }

        public static bool Valida(string chave)
        {
            chave = Util.SoNumeros(chave);
            if (chave.Length != 44) return false;
            return DigitoVerificador(chave.Substring(0, 43)) == chave[43] - '0';
        }

        /// <summary>Codigo numerico aleatorio de 8 digitos, diferente do numero do CT-e.</summary>
        public static string GerarCodigoNumerico(int numeroCte)
        {
            byte[] b = new byte[4];
            using (RNGCryptoServiceProvider rng = new RNGCryptoServiceProvider())
            {
                while (true)
                {
                    rng.GetBytes(b);
                    int v = (int)(BitConverter.ToUInt32(b, 0) % 100000000u);
                    string c = v.ToString("00000000");
                    if (v != numeroCte && c != "00000000" && c != "12345678" && c != "11111111" && c != "99999999")
                        return c;
                }
            }
        }
    }
}
