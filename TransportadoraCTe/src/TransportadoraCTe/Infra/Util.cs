using System;
using System.Globalization;
using System.Text;

namespace TransportadoraCTe.Infra
{
    public static class Util
    {
        public static readonly CultureInfo Inv = CultureInfo.InvariantCulture;
        public static readonly CultureInfo BR = new CultureInfo("pt-BR");

        public static readonly string[] UFs = {
            "AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT","PA","PB",
            "PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO" };

        /// <summary>Codigo IBGE da UF (usado em cUF e na chave de acesso).</summary>
        public static int CodigoUF(string uf)
        {
            switch ((uf ?? "").ToUpperInvariant())
            {
                case "RO": return 11; case "AC": return 12; case "AM": return 13; case "RR": return 14;
                case "PA": return 15; case "AP": return 16; case "TO": return 17; case "MA": return 21;
                case "PI": return 22; case "CE": return 23; case "RN": return 24; case "PB": return 25;
                case "PE": return 26; case "AL": return 27; case "SE": return 28; case "BA": return 29;
                case "MG": return 31; case "ES": return 32; case "RJ": return 33; case "SP": return 35;
                case "PR": return 41; case "SC": return 42; case "RS": return 43; case "MS": return 50;
                case "MT": return 51; case "GO": return 52; case "DF": return 53;
            }
            throw new ArgumentException("UF invalida: " + uf);
        }

        public static string SoNumeros(string s)
        {
            if (string.IsNullOrEmpty(s)) return "";
            StringBuilder sb = new StringBuilder(s.Length);
            foreach (char c in s) if (c >= '0' && c <= '9') sb.Append(c);
            return sb.ToString();
        }

        /// <summary>Valor decimal no formato do XML (ponto, casas fixas).</summary>
        public static string Dec(decimal v, int casas)
        {
            return Math.Round(v, casas, MidpointRounding.AwayFromZero).ToString("F" + casas, Inv);
        }

        public static string Moeda(decimal v)
        {
            return v.ToString("N2", BR);
        }

        public static decimal ParseDec(string s)
        {
            if (string.IsNullOrWhiteSpace(s)) return 0m;
            decimal v;
            s = s.Trim().Replace("R$", "").Trim();
            if (decimal.TryParse(s, NumberStyles.Number, BR, out v)) return v;
            if (decimal.TryParse(s, NumberStyles.Number, Inv, out v)) return v;
            throw new FormatException("Valor invalido: " + s);
        }

        /// <summary>Limpa texto para o XML fiscal: sem espacos duplos, sem quebra de linha, tamanho maximo.</summary>
        public static string Texto(string s, int max)
        {
            if (s == null) return "";
            StringBuilder sb = new StringBuilder();
            bool espaco = false;
            foreach (char c in s.Trim())
            {
                char ch = char.IsControl(c) ? ' ' : c;
                if (ch == ' ')
                {
                    if (!espaco) sb.Append(ch);
                    espaco = true;
                }
                else { sb.Append(ch); espaco = false; }
            }
            string r = sb.ToString().Trim();
            if (max > 0 && r.Length > max) r = r.Substring(0, max).Trim();
            return r;
        }

        public static bool CnpjValido(string cnpj)
        {
            cnpj = SoNumeros(cnpj);
            if (cnpj.Length != 14 || new string(cnpj[0], 14) == cnpj) return false;
            int[] m1 = { 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2 };
            int[] m2 = { 6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2 };
            int soma = 0;
            for (int i = 0; i < 12; i++) soma += (cnpj[i] - '0') * m1[i];
            int d1 = soma % 11; d1 = d1 < 2 ? 0 : 11 - d1;
            soma = 0;
            for (int i = 0; i < 13; i++) soma += (cnpj[i] - '0') * m2[i];
            int d2 = soma % 11; d2 = d2 < 2 ? 0 : 11 - d2;
            return cnpj[12] - '0' == d1 && cnpj[13] - '0' == d2;
        }

        public static bool CpfValido(string cpf)
        {
            cpf = SoNumeros(cpf);
            if (cpf.Length != 11 || new string(cpf[0], 11) == cpf) return false;
            int soma = 0;
            for (int i = 0; i < 9; i++) soma += (cpf[i] - '0') * (10 - i);
            int d1 = soma % 11; d1 = d1 < 2 ? 0 : 11 - d1;
            soma = 0;
            for (int i = 0; i < 10; i++) soma += (cpf[i] - '0') * (11 - i);
            int d2 = soma % 11; d2 = d2 < 2 ? 0 : 11 - d2;
            return cpf[9] - '0' == d1 && cpf[10] - '0' == d2;
        }

        public static string FormatarDoc(string doc)
        {
            doc = SoNumeros(doc);
            if (doc.Length == 14)
                return doc.Substring(0, 2) + "." + doc.Substring(2, 3) + "." + doc.Substring(5, 3) + "/" + doc.Substring(8, 4) + "-" + doc.Substring(12, 2);
            if (doc.Length == 11)
                return doc.Substring(0, 3) + "." + doc.Substring(3, 3) + "." + doc.Substring(6, 3) + "-" + doc.Substring(9, 2);
            return doc;
        }

        public static string FormatarChave(string chave)
        {
            chave = SoNumeros(chave);
            StringBuilder sb = new StringBuilder();
            for (int i = 0; i < chave.Length; i++)
            {
                if (i > 0 && i % 4 == 0) sb.Append(' ');
                sb.Append(chave[i]);
            }
            return sb.ToString();
        }

        public static string Html(string s)
        {
            if (string.IsNullOrEmpty(s)) return "";
            return s.Replace("&", "&amp;").Replace("<", "&lt;").Replace(">", "&gt;").Replace("\"", "&quot;");
        }
    }
}
