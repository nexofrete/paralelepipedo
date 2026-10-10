using System;
using System.Configuration;
using System.IO;
using System.IO.Compression;
using System.Net;
using System.Net.Security;
using System.Security.Cryptography.X509Certificates;
using System.Text;
using System.Xml;

namespace TransportadoraCTe.CTe
{
    public enum ServicoCTe { RecepcaoSinc, StatusServico, Consulta, RecepcaoEvento }

    /// <summary>
    /// Comunicacao SOAP 1.2 com os webservices do CT-e 4.00.
    /// Padrao: SVRS (atende RJ e a maioria das UFs). As URLs podem ser trocadas no App.config
    /// pelas chaves "CTe.{Servico}.{Ambiente}", ex.: CTe.RecepcaoSinc.1
    /// </summary>
    public static class SefazWs
    {
        private const string WsdlBase = "http://www.portalfiscal.inf.br/cte/wsdl/";

        private static string NomeWs(ServicoCTe s)
        {
            switch (s)
            {
                case ServicoCTe.RecepcaoSinc: return "CTeRecepcaoSincV4";
                case ServicoCTe.StatusServico: return "CTeStatusServicoV4";
                case ServicoCTe.Consulta: return "CTeConsultaV4";
                default: return "CTeRecepcaoEventoV4";
            }
        }

        private static string Metodo(ServicoCTe s)
        {
            switch (s)
            {
                case ServicoCTe.RecepcaoSinc: return "cteRecepcao";
                case ServicoCTe.StatusServico: return "cteStatusServicoCT";
                case ServicoCTe.Consulta: return "cteConsultaCT";
                default: return "cteRecepcaoEvento";
            }
        }

        public static string Url(ServicoCTe s, int ambiente)
        {
            string chave = "CTe." + s + "." + ambiente;
            string cfg = ConfigurationManager.AppSettings[chave];
            if (!string.IsNullOrEmpty(cfg)) return cfg;
            string host = ambiente == 1 ? "https://cte.svrs.rs.gov.br" : "https://cte-homologacao.svrs.rs.gov.br";
            string ws = NomeWs(s);
            return host + "/ws/" + ws + "/" + ws + ".asmx";
        }

        public static string UrlQrCode
        {
            get
            {
                string cfg = ConfigurationManager.AppSettings["CTe.QrCode"];
                return string.IsNullOrEmpty(cfg) ? "https://dfe-portal.svrs.rs.gov.br/cte/qrCode" : cfg;
            }
        }

        /// <summary>
        /// Habilita TLS 1.2 no .NET 4.0. Requer .NET Framework 4.5 ou superior instalado na maquina
        /// (o programa continua compilando contra o 4.0 no Visual Studio 2010).
        /// </summary>
        public static void ConfigurarTls()
        {
            try
            {
                ServicePointManager.SecurityProtocol = (SecurityProtocolType)3072; // Tls12
            }
            catch (NotSupportedException)
            {
                throw new ApplicationException(
                    "Este computador não suporta TLS 1.2, exigido pela SEFAZ. " +
                    "Instale o .NET Framework 4.5 ou superior (recomendado 4.8) e reinicie o sistema.");
            }
            ServicePointManager.Expect100Continue = false;

            string ignorar = ConfigurationManager.AppSettings["CTe.IgnorarErroCertificadoServidor"];
            if (string.Equals(ignorar, "true", StringComparison.OrdinalIgnoreCase))
            {
                // Use somente se a cadeia ICP-Brasil nao estiver instalada e apenas para testes.
                ServicePointManager.ServerCertificateValidationCallback =
                    delegate(object sender, X509Certificate certificate, X509Chain chain, SslPolicyErrors errors) { return true; };
            }
        }

        public static string Compactar(string xml)
        {
            byte[] dados = new UTF8Encoding(false).GetBytes(xml);
            using (MemoryStream ms = new MemoryStream())
            {
                using (GZipStream gz = new GZipStream(ms, CompressionMode.Compress, true))
                    gz.Write(dados, 0, dados.Length);
                return Convert.ToBase64String(ms.ToArray());
            }
        }

        public static string MontarEnvelope(ServicoCTe s, string conteudo)
        {
            string ns = WsdlBase + NomeWs(s);
            string corpo = s == ServicoCTe.RecepcaoSinc ? Compactar(conteudo) : conteudo;
            return "<?xml version=\"1.0\" encoding=\"utf-8\"?>" +
                   "<soap12:Envelope xmlns:xsi=\"http://www.w3.org/2001/XMLSchema-instance\" " +
                   "xmlns:xsd=\"http://www.w3.org/2001/XMLSchema\" xmlns:soap12=\"http://www.w3.org/2003/05/soap-envelope\">" +
                   "<soap12:Body><cteDadosMsg xmlns=\"" + ns + "\">" + corpo + "</cteDadosMsg></soap12:Body></soap12:Envelope>";
        }

        /// <summary>
        /// Envia a mensagem e devolve o elemento de retorno (retCTe, retConsStatServCte, retConsSitCTe ou retEventoCTe).
        /// </summary>
        public static XmlElement Enviar(ServicoCTe s, int ambiente, string conteudo, X509Certificate2 cert,
                                        string elementoRetorno, out string envelope, out string respostaBruta)
        {
            ConfigurarTls();
            envelope = MontarEnvelope(s, conteudo);
            string action = WsdlBase + NomeWs(s) + "/" + Metodo(s);

            HttpWebRequest req = (HttpWebRequest)WebRequest.Create(Url(s, ambiente));
            req.Method = "POST";
            req.ContentType = "application/soap+xml; charset=utf-8; action=\"" + action + "\"";
            req.Timeout = 90000;
            req.ReadWriteTimeout = 90000;
            req.KeepAlive = false;
            req.ClientCertificates.Add(cert);

            byte[] corpo = new UTF8Encoding(false).GetBytes(envelope);
            req.ContentLength = corpo.Length;
            using (Stream st = req.GetRequestStream())
                st.Write(corpo, 0, corpo.Length);

            try
            {
                using (HttpWebResponse resp = (HttpWebResponse)req.GetResponse())
                using (StreamReader sr = new StreamReader(resp.GetResponseStream(), Encoding.UTF8))
                    respostaBruta = sr.ReadToEnd();
            }
            catch (WebException ex)
            {
                string detalhe = "";
                if (ex.Response != null)
                {
                    using (StreamReader sr = new StreamReader(ex.Response.GetResponseStream(), Encoding.UTF8))
                        detalhe = sr.ReadToEnd();
                }
                respostaBruta = detalhe;
                string falha = ExtrairFalhaSoap(detalhe);
                throw new ApplicationException("Falha de comunicação com a SEFAZ (" + NomeWs(s) + "): " + ex.Message +
                    (falha.Length > 0 ? "\r\n" + falha : ""), ex);
            }

            XmlDocument doc = new XmlDocument();
            doc.LoadXml(respostaBruta);
            // aceita nomes alternativos separados por "|" (ex.: retConsStatServCte|retConsStatServCTe)
            foreach (string nome in elementoRetorno.Split('|'))
            {
                XmlNodeList l = doc.GetElementsByTagName(nome, CteXml.NS);
                if (l.Count > 0) return (XmlElement)l[0];
            }
            throw new ApplicationException("Resposta da SEFAZ sem o elemento " + elementoRetorno + ":\r\n" +
                (respostaBruta.Length > 1000 ? respostaBruta.Substring(0, 1000) : respostaBruta));
        }

        private static string ExtrairFalhaSoap(string xml)
        {
            if (string.IsNullOrEmpty(xml)) return "";
            try
            {
                XmlDocument d = new XmlDocument();
                d.LoadXml(xml);
                XmlNodeList t = d.GetElementsByTagName("Text", "http://www.w3.org/2003/05/soap-envelope");
                if (t.Count > 0) return t[0].InnerText;
            }
            catch (XmlException) { }
            return xml.Length > 500 ? xml.Substring(0, 500) : xml;
        }

        /// <summary>Texto do primeiro descendente com o nome informado (namespace do CT-e).</summary>
        public static string Valor(XmlElement pai, string nome)
        {
            if (pai == null) return "";
            XmlNodeList l = pai.GetElementsByTagName(nome, CteXml.NS);
            return l.Count > 0 ? l[0].InnerText : "";
        }

        public static XmlElement Filho(XmlElement pai, string nome)
        {
            if (pai == null) return null;
            XmlNodeList l = pai.GetElementsByTagName(nome, CteXml.NS);
            return l.Count > 0 ? (XmlElement)l[0] : null;
        }
    }
}
