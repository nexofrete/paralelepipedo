using System;
using System.Security.Cryptography.X509Certificates;

namespace TransportadoraCTe.CTe
{
    /// <summary>
    /// Certificado digital A1 ou A3 instalado no repositorio pessoal do Windows (Usuario atual).
    /// Para A1: de dois cliques no arquivo .pfx e conclua o assistente de importacao do Windows.
    /// </summary>
    public static class Certificado
    {
        public static X509Certificate2 Selecionar()
        {
            X509Store store = new X509Store(StoreName.My, StoreLocation.CurrentUser);
            store.Open(OpenFlags.ReadOnly | OpenFlags.OpenExistingOnly);
            try
            {
                X509Certificate2Collection validos = store.Certificates
                    .Find(X509FindType.FindByTimeValid, DateTime.Now, false);
                X509Certificate2Collection escolha = X509Certificate2UI.SelectFromCollection(
                    validos, "Certificado digital", "Selecione o certificado da empresa (e-CNPJ)",
                    X509SelectionFlag.SingleSelection);
                return escolha.Count > 0 ? escolha[0] : null;
            }
            finally { store.Close(); }
        }

        public static X509Certificate2 Obter(string thumbprint)
        {
            if (string.IsNullOrEmpty(thumbprint))
                throw new ApplicationException("Nenhum certificado digital configurado. Vá em Configurações > Empresa e selecione o certificado.");

            foreach (StoreLocation local in new StoreLocation[] { StoreLocation.CurrentUser, StoreLocation.LocalMachine })
            {
                X509Store store = new X509Store(StoreName.My, local);
                try
                {
                    store.Open(OpenFlags.ReadOnly | OpenFlags.OpenExistingOnly);
                    X509Certificate2Collection c = store.Certificates.Find(X509FindType.FindByThumbprint, thumbprint, false);
                    if (c.Count > 0)
                    {
                        X509Certificate2 cert = c[0];
                        if (DateTime.Now > cert.NotAfter)
                            throw new ApplicationException("O certificado digital venceu em " + cert.NotAfter.ToString("dd/MM/yyyy") + ".");
                        if (!cert.HasPrivateKey)
                            throw new ApplicationException("O certificado selecionado não possui chave privada.");
                        return cert;
                    }
                }
                catch (System.Security.Cryptography.CryptographicException) { }
                finally { store.Close(); }
            }
            throw new ApplicationException("Certificado digital não encontrado no Windows (thumbprint " + thumbprint + ").");
        }

        public static string Descrever(X509Certificate2 cert)
        {
            if (cert == null) return "(nenhum)";
            return cert.GetNameInfo(X509NameType.SimpleName, false) + "  -  válido até " + cert.NotAfter.ToString("dd/MM/yyyy");
        }
    }
}
