using System;
using System.Globalization;
using System.Security.Cryptography.X509Certificates;
using System.Xml;
using TransportadoraCTe.Infra;
using TransportadoraCTe.Modelos;
using TransportadoraCTe.Repositorios;

namespace TransportadoraCTe.CTe
{
    public class ResultadoSefaz
    {
        public bool Sucesso { get; set; }
        public string CStat { get; set; }
        public string XMotivo { get; set; }
        public string Protocolo { get; set; }

        public override string ToString()
        {
            string s = CStat + " - " + XMotivo;
            if (!string.IsNullOrEmpty(Protocolo)) s += "\r\nProtocolo: " + Protocolo;
            return s;
        }
    }

    /// <summary>
    /// Regras de emissao, consulta e cancelamento do CT-e, usando o banco e a SEFAZ.
    /// </summary>
    public static class CteServico
    {
        private static readonly string[] CStatDenegado = { "110", "301", "302", "303", "304", "305", "306" };

        // =================================================================
        // Status do servico
        // =================================================================
        public static ResultadoSefaz StatusServico()
        {
            Empresa emp = ObterEmpresa();
            X509Certificate2 cert = Certificado.Obter(emp.CertThumbprint);
            string xml = CteXml.MontarStatus(emp.Ambiente, Util.CodigoUF(emp.Endereco.UF));
            string env, resp;
            XmlElement ret = SefazWs.Enviar(ServicoCTe.StatusServico, emp.Ambiente, xml, cert,
                "retConsStatServCte|retConsStatServCTe", out env, out resp);
            CteRepo.Log(null, "StatusServico", env, resp);

            ResultadoSefaz r = new ResultadoSefaz();
            r.CStat = SefazWs.Valor(ret, "cStat");
            r.XMotivo = SefazWs.Valor(ret, "xMotivo");
            string tMed = SefazWs.Valor(ret, "tMed");
            if (tMed.Length > 0) r.XMotivo += " (tempo médio " + tMed + "s)";
            r.Sucesso = r.CStat == "107";
            return r;
        }

        // =================================================================
        // Emissao
        // =================================================================
        public static ResultadoSefaz Emitir(int cteId)
        {
            Empresa emp = ObterEmpresa();
            Cte c = CteRepo.Obter(cteId);
            if (c == null) throw new ApplicationException("CT-e não encontrado.");
            if (c.Status == StatusCte.Autorizado) throw new ApplicationException("Este CT-e já está autorizado.");
            if (c.Status == StatusCte.Cancelado || c.Status == StatusCte.Denegado)
                throw new ApplicationException("CT-e " + c.Status.ToLower() + " não pode ser reenviado.");

            X509Certificate2 cert = Certificado.Obter(emp.CertThumbprint);

            // Ja foi assinado/enviado antes e nao temos o retorno? Consulta primeiro para nao duplicar.
            if (c.Status == StatusCte.Digitacao && !string.IsNullOrEmpty(c.XmlAssinado) && ChaveAcesso.Valida(c.Chave))
            {
                ResultadoSefaz cons = Consultar(c, emp, cert);
                if (cons.Sucesso) return cons;
            }

            Validar(c, emp);

            c.DataEmissao = DateTime.Now;
            if (string.IsNullOrEmpty(c.CodigoNumerico)) c.CodigoNumerico = ChaveAcesso.GerarCodigoNumerico(c.Numero);
            c.Chave = ChaveAcesso.Gerar(Util.CodigoUF(emp.Endereco.UF), c.DataEmissao, emp.CNPJ, 57,
                                        c.Serie, c.Numero, 1, c.CodigoNumerico);

            XmlDocument doc = CteXml.MontarCTe(c, emp, SefazWs.UrlQrCode);
            Assinador.Assinar(doc, "infCte", cert);
            string xmlAssinado = doc.OuterXml;
            CteRepo.GravarAssinado(c.Id, c.Chave, c.CodigoNumerico, c.DataEmissao, xmlAssinado);

            string env = null, resp = null;
            XmlElement ret;
            try
            {
                ret = SefazWs.Enviar(ServicoCTe.RecepcaoSinc, c.Ambiente, xmlAssinado, cert, "retCTe", out env, out resp);
            }
            finally
            {
                CteRepo.Log(c.Id, "RecepcaoSinc", xmlAssinado, resp);
            }

            ResultadoSefaz r = new ResultadoSefaz();
            XmlElement prot = SefazWs.Filho(ret, "protCTe");
            if (prot != null)
            {
                XmlElement inf = SefazWs.Filho(prot, "infProt");
                r.CStat = SefazWs.Valor(inf, "cStat");
                r.XMotivo = SefazWs.Valor(inf, "xMotivo");
                r.Protocolo = SefazWs.Valor(inf, "nProt");
                ProcessarProtocolo(c, xmlAssinado, prot, r);
            }
            else
            {
                r.CStat = SefazWs.Valor(ret, "cStat");
                r.XMotivo = SefazWs.Valor(ret, "xMotivo");
                if (r.CStat == "204" || r.CStat == "539")
                {
                    // duplicidade: o CT-e ja existe na SEFAZ, busca o protocolo
                    ResultadoSefaz cons = Consultar(c, emp, cert);
                    if (cons.Sucesso) return cons;
                }
                CteRepo.GravarRetorno(c.Id, StatusCte.Rejeitado, r.CStat, r.XMotivo, null, null, null);
            }
            return r;
        }

        private static void ProcessarProtocolo(Cte c, string xmlAssinado, XmlElement prot, ResultadoSefaz r)
        {
            if (r.CStat == "100" || r.CStat == "150")
            {
                string proc = "<cteProc versao=\"" + CteXml.Versao + "\" xmlns=\"" + CteXml.NS + "\">" +
                              RemoverDeclaracao(xmlAssinado) + prot.OuterXml + "</cteProc>";
                DateTime? dh = ParseData(SefazWs.Valor(prot, "dhRecbto"));
                CteRepo.GravarRetorno(c.Id, StatusCte.Autorizado, r.CStat, r.XMotivo, r.Protocolo, dh, proc);
                r.Sucesso = true;
            }
            else if (Array.IndexOf(CStatDenegado, r.CStat) >= 0)
            {
                CteRepo.GravarRetorno(c.Id, StatusCte.Denegado, r.CStat, r.XMotivo, r.Protocolo, null, null);
            }
            else
            {
                CteRepo.GravarRetorno(c.Id, StatusCte.Rejeitado, r.CStat, r.XMotivo, null, null, null);
            }
        }

        // =================================================================
        // Consulta
        // =================================================================
        public static ResultadoSefaz Consultar(int cteId)
        {
            Empresa emp = ObterEmpresa();
            Cte c = CteRepo.Obter(cteId);
            if (c == null) throw new ApplicationException("CT-e não encontrado.");
            if (!ChaveAcesso.Valida(c.Chave)) throw new ApplicationException("Este CT-e ainda não foi enviado à SEFAZ.");
            return Consultar(c, emp, Certificado.Obter(emp.CertThumbprint));
        }

        private static ResultadoSefaz Consultar(Cte c, Empresa emp, X509Certificate2 cert)
        {
            string xml = CteXml.MontarConsulta(c.Ambiente, c.Chave);
            string env, resp;
            XmlElement ret = SefazWs.Enviar(ServicoCTe.Consulta, c.Ambiente, xml, cert, "retConsSitCTe", out env, out resp);
            CteRepo.Log(c.Id, "Consulta", env, resp);

            ResultadoSefaz r = new ResultadoSefaz();
            r.CStat = SefazWs.Valor(ret, "cStat");
            r.XMotivo = SefazWs.Valor(ret, "xMotivo");

            XmlElement prot = SefazWs.Filho(ret, "protCTe");
            if ((r.CStat == "100" || r.CStat == "150") && prot != null && c.Status != StatusCte.Autorizado)
            {
                r.Protocolo = SefazWs.Valor(prot, "nProt");
                ProcessarProtocolo(c, c.XmlAssinado, prot, r);
            }
            else if (r.CStat == "101" && c.Status != StatusCte.Cancelado)
            {
                CteRepo.GravarCancelamento(c.Id, "", null, r.CStat, r.XMotivo);
                r.Sucesso = true;
            }
            else
            {
                r.Sucesso = r.CStat == "100" || r.CStat == "101";
                if (prot != null) r.Protocolo = SefazWs.Valor(prot, "nProt");
            }
            return r;
        }

        // =================================================================
        // Cancelamento (evento 110111)
        // =================================================================
        public static ResultadoSefaz Cancelar(int cteId, string justificativa)
        {
            justificativa = Util.Texto(justificativa, 255);
            if (justificativa.Length < 15) throw new ApplicationException("A justificativa deve ter no mínimo 15 caracteres.");

            Empresa emp = ObterEmpresa();
            Cte c = CteRepo.Obter(cteId);
            if (c == null) throw new ApplicationException("CT-e não encontrado.");
            if (c.Status != StatusCte.Autorizado) throw new ApplicationException("Somente CT-e autorizado pode ser cancelado.");
            if (string.IsNullOrEmpty(c.Protocolo)) throw new ApplicationException("CT-e sem protocolo de autorização.");
            if (c.DataAutorizacao.HasValue && (DateTime.Now - c.DataAutorizacao.Value).TotalHours > 168)
                throw new ApplicationException("Prazo de cancelamento (168 horas) expirado.");

            X509Certificate2 cert = Certificado.Obter(emp.CertThumbprint);
            int cUF = Util.CodigoUF(emp.Endereco.UF);
            XmlDocument doc = CteXml.MontarCancelamento(c.Ambiente, cUF, emp.CNPJ, c.Chave, c.Protocolo, justificativa, 1);
            Assinador.Assinar(doc, "infEvento", cert);
            string xmlEvento = doc.OuterXml;

            string env = null, resp = null;
            XmlElement ret;
            try
            {
                ret = SefazWs.Enviar(ServicoCTe.RecepcaoEvento, c.Ambiente, xmlEvento, cert, "retEventoCTe", out env, out resp);
            }
            finally
            {
                CteRepo.Log(c.Id, "Cancelamento", xmlEvento, resp);
            }

            ResultadoSefaz r = new ResultadoSefaz();
            r.CStat = SefazWs.Valor(ret, "cStat");
            r.XMotivo = SefazWs.Valor(ret, "xMotivo");
            r.Protocolo = SefazWs.Valor(ret, "nProt");
            if (r.CStat == "134" || r.CStat == "135" || r.CStat == "136")
            {
                string proc = "<procEventoCTe versao=\"" + CteXml.Versao + "\" xmlns=\"" + CteXml.NS + "\">" +
                              RemoverDeclaracao(xmlEvento) + ret.OuterXml + "</procEventoCTe>";
                CteRepo.GravarCancelamento(c.Id, r.Protocolo, proc, r.CStat, r.XMotivo);
                r.Sucesso = true;
            }
            return r;
        }

        // =================================================================
        // Validacoes antes de assinar
        // =================================================================
        public static void Validar(Cte c, Empresa emp)
        {
            System.Text.StringBuilder erros = new System.Text.StringBuilder();
            if (string.IsNullOrEmpty(emp.RNTRC) || emp.RNTRC.Length != 8) erros.AppendLine("- RNTRC da empresa inválido.");
            if (Util.SoNumeros(c.CFOP).Length != 4) erros.AppendLine("- CFOP inválido.");
            if (Util.SoNumeros(c.CodMunInicio).Length != 7) erros.AppendLine("- Código IBGE do município de início inválido.");
            if (Util.SoNumeros(c.CodMunFim).Length != 7) erros.AppendLine("- Código IBGE do município de fim inválido.");
            if (c.ValorPrestacao <= 0) erros.AppendLine("- Valor da prestação deve ser maior que zero.");
            if (c.ValorReceber < 0 || c.ValorReceber > c.ValorPrestacao) erros.AppendLine("- Valor a receber inválido.");
            if (c.ValorCarga <= 0) erros.AppendLine("- Valor da carga deve ser maior que zero.");
            if (c.PesoKg <= 0) erros.AppendLine("- Peso da carga deve ser maior que zero.");
            if (string.IsNullOrWhiteSpace(c.ProdutoPredominante)) erros.AppendLine("- Informe o produto predominante.");
            if (c.CstIcms == "00" || c.CstIcms == "90")
            {
                decimal calc = Math.Round(c.BaseIcms * c.AliquotaIcms / 100m, 2, MidpointRounding.AwayFromZero);
                if (Math.Abs(calc - c.ValorIcms) > 0.01m) erros.AppendLine("- Valor do ICMS não confere com base x alíquota.");
            }
            if (c.CstIcms == "SN" && emp.CRT != 1 && emp.CRT != 4)
                erros.AppendLine("- CST Simples Nacional só pode ser usado por empresa do Simples (CRT 1) ou MEI.");

            bool interestadual = c.UFInicio != c.UFFim;
            if (interestadual && !c.CFOP.StartsWith("6") && !c.CFOP.StartsWith("7"))
                erros.AppendLine("- Prestação interestadual exige CFOP iniciado por 6.");
            if (!interestadual && !c.CFOP.StartsWith("5"))
                erros.AppendLine("- Prestação dentro do estado exige CFOP iniciado por 5.");

            if (!string.IsNullOrEmpty(c.ChavesNFe))
            {
                foreach (string linha in c.ChavesNFe.Split(new char[] { '\r', '\n', ';', ',', ' ' }, StringSplitOptions.RemoveEmptyEntries))
                {
                    string ch = Util.SoNumeros(linha);
                    if (ch.Length != 44 || !ChaveAcesso.Valida(ch) || ch.Substring(20, 2) != "55")
                        erros.AppendLine("- Chave de NF-e inválida: " + linha);
                }
            }
            if (erros.Length > 0) throw new ApplicationException("Corrija antes de emitir:\r\n" + erros);
        }

        // =================================================================
        private static Empresa ObterEmpresa()
        {
            Empresa e = EmpresaRepo.Obter();
            if (e == null) throw new ApplicationException("Cadastre os dados da empresa em Configurações > Empresa.");
            return e;
        }

        private static string RemoverDeclaracao(string xml)
        {
            if (xml != null && xml.StartsWith("<?xml"))
            {
                int fim = xml.IndexOf("?>");
                if (fim > 0) return xml.Substring(fim + 2);
            }
            return xml;
        }

        private static DateTime? ParseData(string s)
        {
            DateTimeOffset dto;
            if (DateTimeOffset.TryParse(s, CultureInfo.InvariantCulture, DateTimeStyles.None, out dto))
                return dto.LocalDateTime;
            return null;
        }
    }
}
