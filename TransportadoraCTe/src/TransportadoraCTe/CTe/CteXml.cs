using System;
using System.Text;
using System.Xml;
using TransportadoraCTe.Infra;
using TransportadoraCTe.Modelos;

namespace TransportadoraCTe.CTe
{
    /// <summary>
    /// Monta o XML do CT-e versao 4.00 (modelo 57, modal rodoviario, tipo normal)
    /// e os XMLs de status, consulta e evento de cancelamento.
    /// </summary>
    public static class CteXml
    {
        public const string NS = "http://www.portalfiscal.inf.br/cte";
        public const string Versao = "4.00";
        public const string VerProc = "TransportadoraCTe 1.0";
        public const string NomeHomologacao = "CTE EMITIDO EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL";

        private static XmlWriter NovoWriter(StringBuilder sb)
        {
            XmlWriterSettings s = new XmlWriterSettings();
            s.OmitXmlDeclaration = true;
            s.Indent = false;
            s.Encoding = new UTF8Encoding(false);
            return XmlWriter.Create(sb, s);
        }

        private static void El(XmlWriter w, string nome, string valor)
        {
            w.WriteElementString(nome, NS, valor);
        }

        /// <summary>Escreve o elemento apenas se o valor nao for vazio.</summary>
        private static void ElOpc(XmlWriter w, string nome, string valor)
        {
            if (!string.IsNullOrEmpty(valor)) w.WriteElementString(nome, NS, valor);
        }

        // =================================================================
        // CT-e
        // =================================================================
        public static XmlDocument MontarCTe(Cte c, Empresa emp, string urlQrCode)
        {
            if (c.Remetente == null || c.Destinatario == null)
                throw new ApplicationException("Remetente e destinatário devem estar carregados.");

            Cliente tomador = c.ClienteTomador;
            int cUF = Util.CodigoUF(emp.Endereco.UF);
            bool homolog = c.Ambiente == 2;

            StringBuilder sb = new StringBuilder();
            using (XmlWriter w = NovoWriter(sb))
            {
                w.WriteStartElement("CTe", NS);
                w.WriteStartElement("infCte", NS);
                w.WriteAttributeString("versao", Versao);
                w.WriteAttributeString("Id", "CTe" + c.Chave);

                // ---------------- ide ----------------
                w.WriteStartElement("ide", NS);
                El(w, "cUF", cUF.ToString());
                El(w, "cCT", c.CodigoNumerico);
                El(w, "CFOP", c.CFOP);
                El(w, "natOp", Util.Texto(c.NaturezaOperacao, 60));
                El(w, "mod", "57");
                El(w, "serie", c.Serie.ToString());
                El(w, "nCT", c.Numero.ToString());
                El(w, "dhEmi", c.DataEmissao.ToString("yyyy-MM-dd'T'HH:mm:sszzz"));
                El(w, "tpImp", "1");                    // DACTE retrato
                El(w, "tpEmis", "1");                   // emissao normal
                El(w, "cDV", c.Chave.Substring(43, 1));
                El(w, "tpAmb", c.Ambiente.ToString());
                El(w, "tpCTe", "0");                    // CT-e normal
                El(w, "procEmi", "0");                  // aplicativo do contribuinte
                El(w, "verProc", VerProc);
                El(w, "cMunEnv", emp.Endereco.CodMunicipio);
                El(w, "xMunEnv", Util.Texto(emp.Endereco.Municipio, 60));
                El(w, "UFEnv", emp.Endereco.UF);
                El(w, "modal", "01");                   // rodoviario
                El(w, "tpServ", "0");                   // normal
                El(w, "cMunIni", c.CodMunInicio);
                El(w, "xMunIni", Util.Texto(c.MunInicio, 60));
                El(w, "UFIni", c.UFInicio);
                El(w, "cMunFim", c.CodMunFim);
                El(w, "xMunFim", Util.Texto(c.MunFim, 60));
                El(w, "UFFim", c.UFFim);
                El(w, "retira", "1");                   // 1 = nao (recebedor nao retira no aeroporto/filial)
                El(w, "indIEToma", IndIEToma(tomador).ToString());
                w.WriteStartElement("toma3", NS);
                El(w, "toma", c.Tomador.ToString());
                w.WriteEndElement(); // toma3
                w.WriteEndElement(); // ide

                // ---------------- compl ----------------
                string obs = Util.Texto(c.Observacoes, 2000);
                if (obs.Length > 0)
                {
                    w.WriteStartElement("compl", NS);
                    El(w, "xObs", obs);
                    w.WriteEndElement();
                }

                // ---------------- emit ----------------
                w.WriteStartElement("emit", NS);
                El(w, "CNPJ", emp.CNPJ);
                El(w, "IE", emp.IE);
                El(w, "xNome", Util.Texto(emp.RazaoSocial, 60));
                ElOpc(w, "xFant", Util.Texto(emp.NomeFantasia, 60));
                w.WriteStartElement("enderEmit", NS);
                El(w, "xLgr", Util.Texto(emp.Endereco.Logradouro, 255));
                El(w, "nro", Util.Texto(emp.Endereco.Numero, 60));
                ElOpc(w, "xCpl", Util.Texto(emp.Endereco.Complemento, 60));
                El(w, "xBairro", Util.Texto(emp.Endereco.Bairro, 60));
                El(w, "cMun", emp.Endereco.CodMunicipio);
                El(w, "xMun", Util.Texto(emp.Endereco.Municipio, 60));
                El(w, "CEP", emp.Endereco.CEP);
                El(w, "UF", emp.Endereco.UF);
                ElOpc(w, "fone", FoneXml(emp.Fone));
                w.WriteEndElement(); // enderEmit
                El(w, "CRT", emp.CRT.ToString());
                w.WriteEndElement(); // emit

                // ---------------- rem / dest ----------------
                Participante(w, "rem", "enderReme", c.Remetente, homolog);
                Participante(w, "dest", "enderDest", c.Destinatario, homolog);

                // ---------------- vPrest ----------------
                w.WriteStartElement("vPrest", NS);
                El(w, "vTPrest", Util.Dec(c.ValorPrestacao, 2));
                El(w, "vRec", Util.Dec(c.ValorReceber, 2));
                w.WriteStartElement("Comp", NS);
                El(w, "xNome", "FRETE VALOR");
                El(w, "vComp", Util.Dec(c.ValorPrestacao, 2));
                w.WriteEndElement();
                w.WriteEndElement(); // vPrest

                // ---------------- imp ----------------
                w.WriteStartElement("imp", NS);
                w.WriteStartElement("ICMS", NS);
                Icms(w, c);
                w.WriteEndElement(); // ICMS
                w.WriteEndElement(); // imp

                // ---------------- infCTeNorm ----------------
                w.WriteStartElement("infCTeNorm", NS);
                w.WriteStartElement("infCarga", NS);
                El(w, "vCarga", Util.Dec(c.ValorCarga, 2));
                El(w, "proPred", Util.Texto(c.ProdutoPredominante, 60));
                w.WriteStartElement("infQ", NS);
                El(w, "cUnid", "01");                   // KG
                El(w, "tpMed", "PESO BRUTO");
                El(w, "qCarga", Util.Dec(c.PesoKg, 4));
                w.WriteEndElement(); // infQ
                w.WriteEndElement(); // infCarga

                w.WriteStartElement("infDoc", NS);
                string[] nfes = c.ListaChavesNFe();
                if (nfes.Length > 0)
                {
                    foreach (string ch in nfes)
                    {
                        w.WriteStartElement("infNFe", NS);
                        El(w, "chave", ch);
                        w.WriteEndElement();
                    }
                }
                else
                {
                    // sem NF-e: declaracao do remetente
                    w.WriteStartElement("infOutros", NS);
                    El(w, "tpDoc", "00");
                    El(w, "descOutros", "DECLARACAO");
                    El(w, "nDoc", c.Numero.ToString());
                    El(w, "dEmi", c.DataEmissao.ToString("yyyy-MM-dd"));
                    El(w, "vDocFisc", Util.Dec(c.ValorCarga, 2));
                    w.WriteEndElement();
                }
                w.WriteEndElement(); // infDoc

                w.WriteStartElement("infModal", NS);
                w.WriteAttributeString("versaoModal", Versao);
                w.WriteStartElement("rodo", NS);
                El(w, "RNTRC", emp.RNTRC);
                w.WriteEndElement(); // rodo
                w.WriteEndElement(); // infModal
                w.WriteEndElement(); // infCTeNorm

                // ---------------- infRespTec (opcional) ----------------
                if (!string.IsNullOrEmpty(emp.RespTecCNPJ))
                {
                    w.WriteStartElement("infRespTec", NS);
                    El(w, "CNPJ", emp.RespTecCNPJ);
                    El(w, "xContato", Util.Texto(emp.RespTecContato, 60));
                    El(w, "email", Util.Texto(emp.RespTecEmail, 60));
                    El(w, "fone", FoneXml(emp.RespTecFone));
                    w.WriteEndElement();
                }

                w.WriteEndElement(); // infCte

                // ---------------- infCTeSupl (QR Code) ----------------
                w.WriteStartElement("infCTeSupl", NS);
                w.WriteStartElement("qrCodCTe", NS);
                w.WriteCData(UrlQrCode(urlQrCode, c.Chave, c.Ambiente));
                w.WriteEndElement();
                w.WriteEndElement();

                w.WriteEndElement(); // CTe
            }

            XmlDocument doc = new XmlDocument();
            doc.PreserveWhitespace = true;
            doc.LoadXml(sb.ToString());
            return doc;
        }

        public static string UrlQrCode(string urlBase, string chave, int ambiente)
        {
            return urlBase + "?chCTe=" + chave + "&tpAmb=" + ambiente;
        }

        public static int IndIEToma(Cliente tomador)
        {
            if (tomador.TipoPessoa == "F" && tomador.Contribuinte == 1) return 1; // produtor rural com IE
            return tomador.Contribuinte == 1 || tomador.Contribuinte == 2 ? tomador.Contribuinte : 9;
        }

        private static string FoneXml(string fone)
        {
            string f = Util.SoNumeros(fone);
            return f.Length >= 6 && f.Length <= 14 ? f : "";
        }

        private static void Participante(XmlWriter w, string tag, string tagEnder, Cliente p, bool homolog)
        {
            w.WriteStartElement(tag, NS);
            if (p.TipoPessoa == "F") El(w, "CPF", p.CpfCnpj); else El(w, "CNPJ", p.CpfCnpj);
            if (p.Contribuinte == 1 && p.IE.Length > 0) El(w, "IE", p.IE);
            else if (p.Contribuinte == 2) El(w, "IE", "ISENTO");
            El(w, "xNome", homolog ? NomeHomologacao : Util.Texto(p.RazaoSocial, 60));
            if (tag == "rem") ElOpc(w, "xFant", Util.Texto(p.NomeFantasia, 60));
            ElOpc(w, "fone", FoneXml(p.Fone));
            w.WriteStartElement(tagEnder, NS);
            El(w, "xLgr", Util.Texto(p.Endereco.Logradouro, 255));
            El(w, "nro", Util.Texto(p.Endereco.Numero, 60));
            ElOpc(w, "xCpl", Util.Texto(p.Endereco.Complemento, 60));
            El(w, "xBairro", Util.Texto(p.Endereco.Bairro, 60));
            El(w, "cMun", p.Endereco.CodMunicipio);
            El(w, "xMun", Util.Texto(p.Endereco.Municipio, 60));
            ElOpc(w, "CEP", p.Endereco.CEP);
            El(w, "UF", p.Endereco.UF);
            El(w, "cPais", "1058");
            El(w, "xPais", "BRASIL");
            w.WriteEndElement();
            ElOpc(w, "email", Util.Texto(p.Email, 60));
            w.WriteEndElement();
        }

        private static void Icms(XmlWriter w, Cte c)
        {
            switch (c.CstIcms)
            {
                case "00":
                    w.WriteStartElement("ICMS00", NS);
                    El(w, "CST", "00");
                    El(w, "vBC", Util.Dec(c.BaseIcms, 2));
                    El(w, "pICMS", Util.Dec(c.AliquotaIcms, 2));
                    El(w, "vICMS", Util.Dec(c.ValorIcms, 2));
                    w.WriteEndElement();
                    break;
                case "40":
                case "41":
                case "51":
                    w.WriteStartElement("ICMS45", NS);
                    El(w, "CST", c.CstIcms);
                    w.WriteEndElement();
                    break;
                case "90":
                    w.WriteStartElement("ICMS90", NS);
                    El(w, "CST", "90");
                    El(w, "vBC", Util.Dec(c.BaseIcms, 2));
                    El(w, "pICMS", Util.Dec(c.AliquotaIcms, 2));
                    El(w, "vICMS", Util.Dec(c.ValorIcms, 2));
                    w.WriteEndElement();
                    break;
                case "SN":
                    w.WriteStartElement("ICMSSN", NS);
                    El(w, "CST", "90");
                    El(w, "indSN", "1");
                    w.WriteEndElement();
                    break;
                default:
                    throw new ApplicationException("CST de ICMS não suportado: " + c.CstIcms);
            }
        }

        // =================================================================
        // Status do servico
        // =================================================================
        public static string MontarStatus(int ambiente, int cUF)
        {
            StringBuilder sb = new StringBuilder();
            using (XmlWriter w = NovoWriter(sb))
            {
                w.WriteStartElement("consStatServCTe", NS);
                w.WriteAttributeString("versao", Versao);
                El(w, "tpAmb", ambiente.ToString());
                El(w, "cUF", cUF.ToString());
                El(w, "xServ", "STATUS");
                w.WriteEndElement();
            }
            return sb.ToString();
        }

        // =================================================================
        // Consulta situacao
        // =================================================================
        public static string MontarConsulta(int ambiente, string chave)
        {
            StringBuilder sb = new StringBuilder();
            using (XmlWriter w = NovoWriter(sb))
            {
                w.WriteStartElement("consSitCTe", NS);
                w.WriteAttributeString("versao", Versao);
                El(w, "tpAmb", ambiente.ToString());
                El(w, "xServ", "CONSULTAR");
                El(w, "chCTe", chave);
                w.WriteEndElement();
            }
            return sb.ToString();
        }

        // =================================================================
        // Evento de cancelamento (110111)
        // =================================================================
        public static XmlDocument MontarCancelamento(int ambiente, int cUF, string cnpj, string chave,
                                                     string protocolo, string justificativa, int seq)
        {
            string id = "ID110111" + chave + seq.ToString("000");
            StringBuilder sb = new StringBuilder();
            using (XmlWriter w = NovoWriter(sb))
            {
                w.WriteStartElement("eventoCTe", NS);
                w.WriteAttributeString("versao", Versao);
                w.WriteStartElement("infEvento", NS);
                w.WriteAttributeString("Id", id);
                El(w, "cOrgao", cUF.ToString());
                El(w, "tpAmb", ambiente.ToString());
                El(w, "CNPJ", cnpj);
                El(w, "chCTe", chave);
                El(w, "dhEvento", DateTime.Now.ToString("yyyy-MM-dd'T'HH:mm:sszzz"));
                El(w, "tpEvento", "110111");
                El(w, "nSeqEvento", seq.ToString());
                w.WriteStartElement("detEvento", NS);
                w.WriteAttributeString("versaoEvento", Versao);
                w.WriteStartElement("evCancCTe", NS);
                El(w, "descEvento", "Cancelamento");
                El(w, "nProt", protocolo);
                El(w, "xJust", Util.Texto(justificativa, 255));
                w.WriteEndElement(); // evCancCTe
                w.WriteEndElement(); // detEvento
                w.WriteEndElement(); // infEvento
                w.WriteEndElement(); // eventoCTe
            }
            XmlDocument doc = new XmlDocument();
            doc.PreserveWhitespace = true;
            doc.LoadXml(sb.ToString());
            return doc;
        }
    }
}
