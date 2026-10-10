using System;
using System.Security.Cryptography;

namespace TransportadoraCTe.Infra
{
    /// <summary>
    /// Hash de senhas com PBKDF2 (Rfc2898DeriveBytes, HMAC-SHA1, 10.000 iteracoes).
    /// A senha nunca e gravada em texto puro.
    /// </summary>
    public static class Seguranca
    {
        private const int Iteracoes = 10000;

        public static string GerarSalt()
        {
            byte[] salt = new byte[16];
            using (RNGCryptoServiceProvider rng = new RNGCryptoServiceProvider())
                rng.GetBytes(salt);
            return Convert.ToBase64String(salt);
        }

        public static string Hash(string senha, string saltBase64)
        {
            byte[] salt = Convert.FromBase64String(saltBase64);
            using (Rfc2898DeriveBytes kdf = new Rfc2898DeriveBytes(senha ?? "", salt, Iteracoes))
                return Convert.ToBase64String(kdf.GetBytes(32));
        }

        public static bool Conferir(string senha, string saltBase64, string hashBase64)
        {
            string calc = Hash(senha, saltBase64);
            // comparacao em tempo constante
            if (calc.Length != hashBase64.Length) return false;
            int dif = 0;
            for (int i = 0; i < calc.Length; i++) dif |= calc[i] ^ hashBase64[i];
            return dif == 0;
        }
    }
}
