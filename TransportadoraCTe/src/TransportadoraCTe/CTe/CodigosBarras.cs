using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.Text;

namespace TransportadoraCTe.CTe
{
    /// <summary>
    /// Codigo de barras Code 128 subconjunto C (somente digitos, quantidade par),
    /// usado para a chave de acesso no DACTE.
    /// </summary>
    public static class Code128
    {
        private static readonly string[] Padroes = {
            "212222","222122","222221","121223","121322","131222","122213","122312","132212","221213",
            "221312","231212","112232","122132","122231","113222","123122","123221","223211","221132",
            "221231","213212","223112","312131","311222","321122","321221","312212","322112","322211",
            "212123","212321","232121","111323","131123","131321","112313","132113","132311","211313",
            "231113","231311","112133","112331","132131","113123","113321","133121","313121","211331",
            "231131","213113","213311","213131","311123","311321","331121","312113","312311","332111",
            "314111","221411","431111","111224","111422","121124","121421","141122","141221","112214",
            "112412","122114","122411","142112","142211","241211","221114","413111","241112","134111",
            "111242","121142","121241","114212","124112","124211","411212","421112","421211","212141",
            "214121","412121","111143","111341","131141","114113","114311","411113","411311","113141",
            "114131","311141","411131","211412","211214","211232","2331112" };

        /// <summary>Sequencia de modulos (true = barra) para os digitos informados.</summary>
        public static bool[] Modulos(string digitos)
        {
            if (digitos.Length % 2 != 0) digitos = "0" + digitos;
            List<int> valores = new List<int>();
            valores.Add(105); // Start C
            for (int i = 0; i < digitos.Length; i += 2)
                valores.Add(int.Parse(digitos.Substring(i, 2)));
            int soma = valores[0];
            for (int i = 1; i < valores.Count; i++) soma += valores[i] * i;
            valores.Add(soma % 103);
            valores.Add(106); // Stop

            List<bool> mods = new List<bool>();
            foreach (int v in valores)
            {
                bool barra = true;
                foreach (char ch in Padroes[v])
                {
                    int largura = ch - '0';
                    for (int k = 0; k < largura; k++) mods.Add(barra);
                    barra = !barra;
                }
            }
            return mods.ToArray();
        }

        public static Bitmap Imagem(string digitos, int larguraModulo, int altura)
        {
            bool[] m = Modulos(digitos);
            int margem = 10 * larguraModulo;
            Bitmap bmp = new Bitmap(m.Length * larguraModulo + margem * 2, altura);
            using (Graphics g = Graphics.FromImage(bmp))
            {
                g.Clear(Color.White);
                for (int i = 0; i < m.Length; i++)
                    if (m[i]) g.FillRectangle(Brushes.Black, margem + i * larguraModulo, 0, larguraModulo, altura);
            }
            return bmp;
        }
    }

    /// <summary>
    /// Gerador de QR Code (modo byte, correcao de erro nivel M, versoes 1 a 10 - ate 213 bytes).
    /// Suficiente para a URL do QR Code do DACTE.
    /// </summary>
    public static class QrCode
    {
        // ec por bloco, {qtd blocos, bytes de dados} do grupo 1 e 2 - nivel M
        private static readonly int[] EcPorBloco = { 0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26 };
        private static readonly int[][] Grupos = {
            null,
            new int[] { 1, 16 }, new int[] { 1, 28 }, new int[] { 1, 44 }, new int[] { 2, 32 }, new int[] { 2, 43 },
            new int[] { 4, 27 }, new int[] { 4, 31 }, new int[] { 2, 38, 2, 39 }, new int[] { 3, 36, 2, 37 },
            new int[] { 4, 43, 1, 44 } };
        private static readonly int[][] Alinhamento = {
            null, new int[0], new int[] { 6, 18 }, new int[] { 6, 22 }, new int[] { 6, 26 }, new int[] { 6, 30 },
            new int[] { 6, 34 }, new int[] { 6, 22, 38 }, new int[] { 6, 24, 42 }, new int[] { 6, 26, 46 },
            new int[] { 6, 28, 50 } };
        private static readonly int[] BitsRestantes = { 0, 0, 7, 7, 7, 7, 7, 0, 0, 0, 0 };

        private static readonly int[] Exp = new int[512];
        private static readonly int[] Log = new int[256];

        static QrCode()
        {
            int x = 1;
            for (int i = 0; i < 255; i++)
            {
                Exp[i] = x; Log[x] = i;
                x <<= 1;
                if ((x & 0x100) != 0) x ^= 0x11D;
            }
            for (int i = 255; i < 512; i++) Exp[i] = Exp[i - 255];
        }

        private static int GMul(int a, int b)
        {
            if (a == 0 || b == 0) return 0;
            return Exp[Log[a] + Log[b]];
        }

        private static int[] Gerador(int n)
        {
            int[] g = new int[] { 1 };
            for (int i = 0; i < n; i++)
            {
                int[] ng = new int[g.Length + 1];
                for (int j = 0; j < g.Length; j++)
                {
                    ng[j] ^= g[j];
                    ng[j + 1] ^= GMul(g[j], Exp[i]);
                }
                g = ng;
            }
            return g;
        }

        private static int[] CorrecaoErro(int[] dados, int n)
        {
            int[] g = Gerador(n);
            int[] res = new int[n];
            foreach (int d in dados)
            {
                int f = d ^ res[0];
                Array.Copy(res, 1, res, 0, n - 1);
                res[n - 1] = 0;
                for (int j = 0; j < n; j++) res[j] ^= GMul(g[j + 1], f);
            }
            return res;
        }

        private static int Capacidade(int v)
        {
            int[] gr = Grupos[v];
            int cap = 0;
            for (int i = 0; i < gr.Length; i += 2) cap += gr[i] * gr[i + 1];
            return cap;
        }

        /// <summary>Matriz do QR Code (true = modulo escuro).</summary>
        public static bool[,] Gerar(string texto)
        {
            byte[] dados = Encoding.UTF8.GetBytes(texto);
            int ver = 0;
            for (int v = 1; v <= 10; v++)
            {
                int ccb = v < 10 ? 8 : 16;
                if (4 + ccb + 8 * dados.Length <= Capacidade(v) * 8) { ver = v; break; }
            }
            if (ver == 0) throw new ArgumentException("Texto longo demais para o QR Code.");

            int cap = Capacidade(ver);
            int ccBits = ver < 10 ? 8 : 16;
            List<int> bits = new List<int>();
            Colocar(bits, 4, 4);
            Colocar(bits, dados.Length, ccBits);
            foreach (byte b in dados) Colocar(bits, b, 8);
            Colocar(bits, 0, Math.Min(4, cap * 8 - bits.Count));
            while (bits.Count % 8 != 0) bits.Add(0);

            List<int> cw = new List<int>();
            for (int i = 0; i < bits.Count; i += 8)
            {
                int v = 0;
                for (int k = 0; k < 8; k++) v = (v << 1) | bits[i + k];
                cw.Add(v);
            }
            int pad = 0;
            while (cw.Count < cap) { cw.Add(pad % 2 == 0 ? 0xEC : 0x11); pad++; }

            // separa em blocos e calcula correcao de erro
            int ec = EcPorBloco[ver];
            List<int[]> blocos = new List<int[]>();
            int pos = 0;
            int[] gr = Grupos[ver];
            for (int i = 0; i < gr.Length; i += 2)
                for (int b = 0; b < gr[i]; b++)
                {
                    int[] bl = cw.GetRange(pos, gr[i + 1]).ToArray();
                    pos += gr[i + 1];
                    blocos.Add(bl);
                }
            List<int[]> ecs = new List<int[]>();
            int maxDados = 0;
            foreach (int[] bl in blocos)
            {
                ecs.Add(CorrecaoErro(bl, ec));
                if (bl.Length > maxDados) maxDados = bl.Length;
            }
            List<int> final = new List<int>();
            for (int i = 0; i < maxDados; i++)
                foreach (int[] bl in blocos) if (i < bl.Length) final.Add(bl[i]);
            for (int i = 0; i < ec; i++)
                foreach (int[] e in ecs) final.Add(e[i]);

            int n = 17 + 4 * ver;
            bool[,] m = new bool[n, n];
            bool[,] f = new bool[n, n];   // modulos de funcao (nao recebem dados/mascara)

            Finder(m, f, 0, 0); Finder(m, f, 0, n - 7); Finder(m, f, n - 7, 0);
            for (int i = 8; i < n - 8; i++)
            {
                Set(m, f, 6, i, i % 2 == 0);
                Set(m, f, i, 6, i % 2 == 0);
            }
            int[] al = Alinhamento[ver];
            for (int a = 0; a < al.Length; a++)
                for (int b = 0; b < al.Length; b++)
                {
                    int r = al[a], c = al[b];
                    bool canto = (a == 0 && b == 0) || (a == 0 && b == al.Length - 1) || (a == al.Length - 1 && b == 0);
                    if (canto) continue;
                    for (int dr = -2; dr <= 2; dr++)
                        for (int dc = -2; dc <= 2; dc++)
                            Set(m, f, r + dr, c + dc, Math.Max(Math.Abs(dr), Math.Abs(dc)) != 1);
                }
            Set(m, f, n - 8, 8, true); // modulo escuro fixo
            for (int i = 0; i < 9; i++)
            {
                if (!f[8, i]) Set(m, f, 8, i, false);
                if (!f[i, 8]) Set(m, f, i, 8, false);
            }
            for (int i = 0; i < 8; i++)
            {
                Set(m, f, 8, n - 1 - i, false);
                Set(m, f, n - 1 - i, 8, false);
            }
            if (ver >= 7)
            {
                int rem = ver;
                for (int i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >> 11) * 0x1F25);
                int vinfo = (ver << 12) | rem;
                for (int i = 0; i < 18; i++)
                {
                    bool bit = ((vinfo >> i) & 1) != 0;
                    Set(m, f, n - 11 + i % 3, i / 3, bit);
                    Set(m, f, i / 3, n - 11 + i % 3, bit);
                }
            }

            // posiciona os dados em zigue-zague
            List<bool> todos = new List<bool>();
            foreach (int b in final)
                for (int i = 7; i >= 0; i--) todos.Add(((b >> i) & 1) != 0);
            for (int i = 0; i < BitsRestantes[ver]; i++) todos.Add(false);
            int idx = 0;
            bool subindo = true;
            for (int col = n - 1; col > 0; col -= 2)
            {
                if (col == 6) col--;
                for (int k = 0; k < n; k++)
                {
                    int r = subindo ? n - 1 - k : k;
                    for (int dc = 0; dc < 2; dc++)
                    {
                        int c = col - dc;
                        if (!f[r, c])
                        {
                            m[r, c] = idx < todos.Count && todos[idx];
                            idx++;
                        }
                    }
                }
                subindo = !subindo;
            }

            // escolhe a mascara com menor penalidade
            bool[,] melhor = null;
            int menor = int.MaxValue;
            for (int mask = 0; mask < 8; mask++)
            {
                bool[,] r = AplicarMascara(m, f, n, mask);
                int p = Penalidade(r, n);
                if (p < menor) { menor = p; melhor = r; }
            }
            return melhor;
        }

        private static void Colocar(List<int> bits, int valor, int qtd)
        {
            for (int i = qtd - 1; i >= 0; i--) bits.Add((valor >> i) & 1);
        }

        private static void Set(bool[,] m, bool[,] f, int r, int c, bool v)
        {
            m[r, c] = v; f[r, c] = true;
        }

        private static void Finder(bool[,] m, bool[,] f, int r0, int c0)
        {
            int n = m.GetLength(0);
            for (int dr = -1; dr <= 7; dr++)
                for (int dc = -1; dc <= 7; dc++)
                {
                    int r = r0 + dr, c = c0 + dc;
                    if (r < 0 || r >= n || c < 0 || c >= n) continue;
                    bool on = (dr >= 0 && dr <= 6 && (dc == 0 || dc == 6)) ||
                              (dc >= 0 && dc <= 6 && (dr == 0 || dr == 6)) ||
                              (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4);
                    Set(m, f, r, c, on);
                }
        }

        private static bool Mascara(int mask, int r, int c)
        {
            switch (mask)
            {
                case 0: return (r + c) % 2 == 0;
                case 1: return r % 2 == 0;
                case 2: return c % 3 == 0;
                case 3: return (r + c) % 3 == 0;
                case 4: return (r / 2 + c / 3) % 2 == 0;
                case 5: return (r * c) % 2 + (r * c) % 3 == 0;
                case 6: return ((r * c) % 2 + (r * c) % 3) % 2 == 0;
                default: return ((r + c) % 2 + (r * c) % 3) % 2 == 0;
            }
        }

        private static bool[,] AplicarMascara(bool[,] m, bool[,] f, int n, int mask)
        {
            bool[,] r = (bool[,])m.Clone();
            for (int y = 0; y < n; y++)
                for (int x = 0; x < n; x++)
                    if (!f[y, x] && Mascara(mask, y, x)) r[y, x] = !r[y, x];

            int fmt = mask; // nivel M = 00
            int rem = fmt;
            for (int i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >> 9) * 0x537);
            int bitsF = ((fmt << 10) | rem) ^ 0x5412;
            for (int i = 0; i < 15; i++)
            {
                bool b = ((bitsF >> i) & 1) != 0;
                if (i < 6) r[i, 8] = b;
                else if (i < 8) r[i + 1, 8] = b;
                else if (i == 8) r[8, 7] = b;
                else r[8, 14 - i] = b;

                if (i < 8) r[8, n - 1 - i] = b;
                else r[n - 15 + i, 8] = b;
            }
            r[n - 8, 8] = true;
            return r;
        }

        private static int Penalidade(bool[,] m, int n)
        {
            int p = 0;
            for (int dir = 0; dir < 2; dir++)
            {
                for (int a = 0; a < n; a++)
                {
                    int run = 1;
                    for (int b = 1; b < n; b++)
                    {
                        bool atual = dir == 0 ? m[a, b] : m[b, a];
                        bool ant = dir == 0 ? m[a, b - 1] : m[b - 1, a];
                        if (atual == ant)
                        {
                            run++;
                            if (run == 5) p += 3; else if (run > 5) p += 1;
                        }
                        else run = 1;
                    }
                    for (int b = 0; b < n - 10; b++)
                    {
                        bool p1 = true, p2 = true;
                        for (int k = 0; k < 11; k++)
                        {
                            bool v = dir == 0 ? m[a, b + k] : m[b + k, a];
                            if (v != Padrao1[k]) p1 = false;
                            if (v != Padrao2[k]) p2 = false;
                        }
                        if (p1) p += 40;
                        if (p2) p += 40;
                    }
                }
            }
            for (int y = 0; y < n - 1; y++)
                for (int x = 0; x < n - 1; x++)
                {
                    bool v = m[y, x];
                    if (m[y + 1, x] == v && m[y, x + 1] == v && m[y + 1, x + 1] == v) p += 3;
                }
            int escuros = 0;
            for (int y = 0; y < n; y++)
                for (int x = 0; x < n; x++) if (m[y, x]) escuros++;
            int pct = escuros * 100 / (n * n);
            p += Math.Abs(pct - 50) / 5 * 10;
            return p;
        }

        private static readonly bool[] Padrao1 = { true, false, true, true, true, false, true, false, false, false, false };
        private static readonly bool[] Padrao2 = { false, false, false, false, true, false, true, true, true, false, true };

        public static Bitmap Imagem(string texto, int escala)
        {
            bool[,] m = Gerar(texto);
            int n = m.GetLength(0);
            int margem = 4;
            int tam = (n + margem * 2) * escala;
            Bitmap bmp = new Bitmap(tam, tam);
            using (Graphics g = Graphics.FromImage(bmp))
            {
                g.Clear(Color.White);
                for (int y = 0; y < n; y++)
                    for (int x = 0; x < n; x++)
                        if (m[y, x])
                            g.FillRectangle(Brushes.Black, (x + margem) * escala, (y + margem) * escala, escala, escala);
            }
            return bmp;
        }

        public static void SalvarPng(string texto, int escala, string arquivo)
        {
            using (Bitmap b = Imagem(texto, escala)) b.Save(arquivo, ImageFormat.Png);
        }
    }
}
