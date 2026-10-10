using System;
using System.Collections.Generic;
using System.Configuration;
using System.IO;
using System.Net;
using System.Text;
using System.Web.Script.Serialization;
using TransportadoraCTe.CTe;
using TransportadoraCTe.Modelos;

namespace TransportadoraCTe.Infra
{
    /// <summary>Dados cadastrais retornados pela consulta do CNPJ.</summary>
    public class DadosCnpj
    {
        public string CNPJ { get; set; }
        public string RazaoSocial { get; set; }
        public string NomeFantasia { get; set; }
        public Endereco Endereco { get; set; }
        public string Fone { get; set; }
        public string Email { get; set; }
        public string Situacao { get; set; }
        /// <summary>Inscricao estadual ativa na UF do endereco (vazio se nao encontrada).</summary>
        public string IE { get; set; }
        /// <summary>false quando a fonte nao informa inscricoes estaduais (IE nao pode ser deduzida).</summary>
        public bool ConsultouIE { get; set; }
        public bool? SimplesNacional { get; set; }
        public bool? Mei { get; set; }
        public string Fonte { get; set; }

        public DadosCnpj()
        {
            Endereco = new Endereco();
        }
    }

    /// <summary>
    /// Consulta o CNPJ em APIs publicas gratuitas:
    /// 1) CNPJa (open.cnpja.com) - Receita Federal + inscricoes estaduais (CCC/SINTEGRA), limite de 5 consultas por minuto;
    /// 2) BrasilAPI - Receita Federal, usada se a primeira falhar (nao traz inscricao estadual).
    /// As URLs podem ser trocadas no App.config (chaves Cnpj.UrlCnpja e Cnpj.UrlBrasilApi).
    /// </summary>
    public static class ConsultaCnpj
    {
        public static DadosCnpj Consultar(string cnpj)
        {
            cnpj = Util.SoNumeros(cnpj);
            if (!Util.CnpjValido(cnpj)) throw new ApplicationException("CNPJ inválido.");
            SefazWs.ConfigurarTls();

            string erro1;
            try
            {
                return LerCnpja(Baixar(Url("Cnpj.UrlCnpja", "https://open.cnpja.com/office/{0}", cnpj)), cnpj);
            }
            catch (CnpjNaoEncontrado) { throw new ApplicationException("CNPJ " + Util.FormatarDoc(cnpj) + " não encontrado na Receita Federal."); }
            catch (Exception ex) { erro1 = ex.Message; }

            try
            {
                return LerBrasilApi(Baixar(Url("Cnpj.UrlBrasilApi", "https://brasilapi.com.br/api/cnpj/v1/{0}", cnpj)), cnpj);
            }
            catch (CnpjNaoEncontrado) { throw new ApplicationException("CNPJ " + Util.FormatarDoc(cnpj) + " não encontrado na Receita Federal."); }
            catch (Exception ex)
            {
                throw new ApplicationException("Não foi possível consultar o CNPJ. Verifique a conexão com a internet e tente de novo.\r\n\r\n" +
                                               "CNPJa: " + erro1 + "\r\nBrasilAPI: " + ex.Message);
            }
        }

        private class CnpjNaoEncontrado : Exception { }

        private static string Url(string chave, string padrao, string cnpj)
        {
            string cfg = ConfigurationManager.AppSettings[chave];
            return string.Format(string.IsNullOrEmpty(cfg) ? padrao : cfg, cnpj);
        }

        private static Dictionary<string, object> Baixar(string url)
        {
            HttpWebRequest req = (HttpWebRequest)WebRequest.Create(url);
            req.Method = "GET";
            req.Accept = "application/json";
            req.UserAgent = "TransportadoraCTe/1.0";
            req.Timeout = 20000;
            req.ReadWriteTimeout = 20000;
            try
            {
                using (HttpWebResponse resp = (HttpWebResponse)req.GetResponse())
                using (StreamReader sr = new StreamReader(resp.GetResponseStream(), Encoding.UTF8))
                {
                    JavaScriptSerializer js = new JavaScriptSerializer();
                    js.MaxJsonLength = int.MaxValue;
                    Dictionary<string, object> d = js.DeserializeObject(sr.ReadToEnd()) as Dictionary<string, object>;
                    if (d == null) throw new ApplicationException("resposta inesperada.");
                    return d;
                }
            }
            catch (WebException ex)
            {
                HttpWebResponse r = ex.Response as HttpWebResponse;
                if (r != null && r.StatusCode == HttpStatusCode.NotFound) throw new CnpjNaoEncontrado();
                if (r != null && (int)r.StatusCode == 429) throw new ApplicationException("limite de consultas atingido, aguarde um minuto.");
                throw new ApplicationException(ex.Message);
            }
        }

        // ---------------------------------------------------------------- CNPJa
        private static DadosCnpj LerCnpja(Dictionary<string, object> d, string cnpj)
        {
            DadosCnpj r = new DadosCnpj();
            r.Fonte = "CNPJa";
            r.CNPJ = cnpj;
            Dictionary<string, object> company = Obj(d, "company");
            r.RazaoSocial = Str(company, "name");
            r.NomeFantasia = Str(d, "alias");
            r.Situacao = Str(Obj(d, "status"), "text");
            Dictionary<string, object> simples = Obj(company, "simples");
            Dictionary<string, object> simei = Obj(company, "simei");
            if (simples != null) r.SimplesNacional = Bool(simples, "optant");
            if (simei != null) r.Mei = Bool(simei, "optant");

            Dictionary<string, object> a = Obj(d, "address");
            r.Endereco.Logradouro = Str(a, "street");
            r.Endereco.Numero = Str(a, "number");
            r.Endereco.Complemento = Str(a, "details");
            r.Endereco.Bairro = Str(a, "district");
            r.Endereco.CodMunicipio = Str(a, "municipality");
            r.Endereco.Municipio = Str(a, "city");
            r.Endereco.UF = Str(a, "state");
            r.Endereco.CEP = Str(a, "zip");

            foreach (Dictionary<string, object> f in Arr(d, "phones"))
            {
                r.Fone = Telefone(Str(f, "area"), Str(f, "number"));
                break;
            }
            foreach (Dictionary<string, object> e in Arr(d, "emails"))
            {
                r.Email = Str(e, "address");
                break;
            }

            if (d.ContainsKey("registrations"))
            {
                r.ConsultouIE = true;
                string desabilitada = "";
                foreach (Dictionary<string, object> ie in Arr(d, "registrations"))
                {
                    if (Str(ie, "state") != r.Endereco.UF) continue;
                    if (Bool(ie, "enabled") == true) { r.IE = Util.SoNumeros(Str(ie, "number")); break; }
                    if (desabilitada.Length == 0) desabilitada = Util.SoNumeros(Str(ie, "number"));
                }
                if (string.IsNullOrEmpty(r.IE) && desabilitada.Length > 0)
                    r.Situacao += " (inscrição estadual " + desabilitada + " não habilitada)";
            }
            return r;
        }

        // ---------------------------------------------------------------- BrasilAPI
        private static DadosCnpj LerBrasilApi(Dictionary<string, object> d, string cnpj)
        {
            DadosCnpj r = new DadosCnpj();
            r.Fonte = "BrasilAPI";
            r.CNPJ = cnpj;
            r.RazaoSocial = Str(d, "razao_social");
            r.NomeFantasia = Str(d, "nome_fantasia");
            r.Situacao = Str(d, "descricao_situacao_cadastral");
            r.SimplesNacional = Bool(d, "opcao_pelo_simples");
            r.Mei = Bool(d, "opcao_pelo_mei");
            string tipo = Str(d, "descricao_tipo_de_logradouro");
            string logr = Str(d, "logradouro");
            r.Endereco.Logradouro = tipo.Length > 0 && !logr.StartsWith(tipo, StringComparison.OrdinalIgnoreCase) ? tipo + " " + logr : logr;
            r.Endereco.Numero = Str(d, "numero");
            r.Endereco.Complemento = Str(d, "complemento");
            r.Endereco.Bairro = Str(d, "bairro");
            r.Endereco.CodMunicipio = Str(d, "codigo_municipio_ibge");
            r.Endereco.Municipio = Str(d, "municipio");
            r.Endereco.UF = Str(d, "uf");
            r.Endereco.CEP = Str(d, "cep");
            string tel = Util.SoNumeros(Str(d, "ddd_telefone_1"));
            if (tel.Length > 2) r.Fone = Telefone(tel.Substring(0, 2), tel.Substring(2));
            r.Email = Str(d, "email").ToLowerInvariant();
            r.ConsultouIE = false;
            return r;
        }

        // ---------------------------------------------------------------- JSON
        private static Dictionary<string, object> Obj(Dictionary<string, object> d, string k)
        {
            object v;
            if (d == null || !d.TryGetValue(k, out v)) return null;
            return v as Dictionary<string, object>;
        }

        private static IEnumerable<Dictionary<string, object>> Arr(Dictionary<string, object> d, string k)
        {
            object v;
            if (d == null || !d.TryGetValue(k, out v) || !(v is object[])) yield break;
            foreach (object o in (object[])v)
                if (o is Dictionary<string, object>) yield return (Dictionary<string, object>)o;
        }

        private static string Str(Dictionary<string, object> d, string k)
        {
            object v;
            if (d == null || !d.TryGetValue(k, out v) || v == null) return "";
            return Convert.ToString(v, Util.Inv).Trim();
        }

        private static bool? Bool(Dictionary<string, object> d, string k)
        {
            object v;
            if (d == null || !d.TryGetValue(k, out v) || !(v is bool)) return null;
            return (bool)v;
        }

        private static string Telefone(string ddd, string numero)
        {
            ddd = Util.SoNumeros(ddd);
            numero = Util.SoNumeros(numero);
            if (numero.Length == 0) return "";
            string s = ddd.Length > 0 ? "(" + ddd + ") " + numero : numero;
            return s.Length > 15 ? s.Substring(0, 15) : s;
        }
    }
}
