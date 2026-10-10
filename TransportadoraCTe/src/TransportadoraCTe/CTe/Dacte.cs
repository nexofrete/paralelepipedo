using System;
using System.Drawing.Imaging;
using System.IO;
using System.Text;
using TransportadoraCTe.Infra;
using TransportadoraCTe.Modelos;

namespace TransportadoraCTe.CTe
{
    /// <summary>
    /// Gera o DACTE (modal rodoviario, retrato) em HTML com codigo de barras e QR Code em PNG,
    /// para visualizar e imprimir pelo controle WebBrowser (ou salvar em PDF com impressora virtual).
    /// </summary>
    public static class Dacte
    {
        public static string Gerar(Cte c, Empresa emp)
        {
            if (!ChaveAcesso.Valida(c.Chave)) throw new ApplicationException("CT-e sem chave de acesso. Envie à SEFAZ primeiro.");

            string pasta = Path.Combine(Path.GetTempPath(), "TransportadoraCTe");
            Directory.CreateDirectory(pasta);
            string barras = Path.Combine(pasta, "barras_" + c.Chave + ".png");
            string qr = Path.Combine(pasta, "qr_" + c.Chave + ".png");
            using (System.Drawing.Bitmap b = Code128.Imagem(c.Chave, 2, 60)) b.Save(barras, ImageFormat.Png);
            QrCode.SalvarPng(CteXml.UrlQrCode(SefazWs.UrlQrCode, c.Chave, c.Ambiente), 4, qr);

            StringBuilder h = new StringBuilder();
            h.Append("<!DOCTYPE html><html><head><meta http-equiv=\"X-UA-Compatible\" content=\"IE=edge\">");
            h.Append("<meta charset=\"utf-8\"><title>DACTE ").Append(c.Numero).Append("</title><style>");
            h.Append("body{font-family:Arial,Helvetica,sans-serif;font-size:9px;margin:0;padding:8px;color:#000}");
            h.Append(".pag{width:760px;margin:0 auto;position:relative}");
            h.Append("table{width:100%;border-collapse:collapse;margin-bottom:3px}");
            h.Append("td{border:1px solid #000;padding:2px 4px;vertical-align:top}");
            h.Append(".r{font-size:7px;text-transform:uppercase;color:#333;display:block}");
            h.Append(".v{font-size:10px;font-weight:bold}");
            h.Append(".t{font-size:8px;font-weight:bold;text-align:center;background:#eee}");
            h.Append(".c{text-align:center}.dir{text-align:right}");
            h.Append(".marca{position:absolute;top:330px;left:0;width:760px;text-align:center;font-size:48px;");
            h.Append("color:#c00;font-weight:bold;opacity:0.25;filter:alpha(opacity=25)}");
            h.Append("@media print{body{padding:0}}");
            h.Append("</style></head><body><div class=\"pag\">");

            if (c.Ambiente == 2) h.Append("<div class=\"marca\">SEM VALOR FISCAL<br>HOMOLOGAÇÃO</div>");
            if (c.Status == StatusCte.Cancelado) h.Append("<div class=\"marca\" style=\"top:430px\">CANCELADO</div>");

            // ---------------- cabecalho ----------------
            h.Append("<table><tr>");
            h.Append("<td style=\"width:45%\"><div class=\"v\" style=\"font-size:13px\">").Append(Util.Html(emp.RazaoSocial)).Append("</div>");
            h.Append(Util.Html(emp.Endereco.Logradouro)).Append(", ").Append(Util.Html(emp.Endereco.Numero));
            if (!string.IsNullOrEmpty(emp.Endereco.Complemento)) h.Append(" - ").Append(Util.Html(emp.Endereco.Complemento));
            h.Append("<br>").Append(Util.Html(emp.Endereco.Bairro)).Append(" - ").Append(Util.Html(emp.Endereco.Municipio))
             .Append("/").Append(emp.Endereco.UF).Append(" - CEP ").Append(emp.Endereco.CEP);
            h.Append("<br>CNPJ: ").Append(Util.FormatarDoc(emp.CNPJ)).Append("  IE: ").Append(emp.IE);
            if (!string.IsNullOrEmpty(emp.Fone)) h.Append("  Fone: ").Append(emp.Fone);
            h.Append("</td>");
            h.Append("<td style=\"width:30%\" class=\"c\"><div class=\"v\" style=\"font-size:14px\">DACTE</div>");
            h.Append("Documento Auxiliar do Conhecimento de Transporte Eletrônico<br><br>");
            h.Append("<span class=\"r\">Modal</span><span class=\"v\">RODOVIÁRIO</span></td>");
            h.Append("<td rowspan=\"2\" class=\"c\" style=\"width:25%;vertical-align:middle\"><img src=\"")
             .Append(new Uri(qr).AbsoluteUri).Append("\" style=\"width:150px;height:auto\"></td>");
            h.Append("</tr><tr><td colspan=\"2\" style=\"padding:0\"><table style=\"margin:0\"><tr>");
            Campo(h, "Modelo", "57");
            Campo(h, "Série", c.Serie.ToString());
            Campo(h, "Número", c.Numero.ToString("000000000"));
            Campo(h, "Folha", "1/1");
            Campo(h, "Data e hora de emissão", c.DataEmissao.ToString("dd/MM/yyyy HH:mm:ss"));
            h.Append("</tr></table></td></tr></table>");

            // ---------------- chave e protocolo ----------------
            h.Append("<table><tr><td class=\"c\" style=\"width:55%\"><img src=\"").Append(new Uri(barras).AbsoluteUri)
             .Append("\" style=\"height:45px;width:420px\"><br><span class=\"r\">Chave de acesso</span><span class=\"v\">")
             .Append(Util.FormatarChave(c.Chave)).Append("</span></td>");
            h.Append("<td><span class=\"r\">Consulta de autenticidade</span>Consulte no portal nacional do CT-e ou na SEFAZ autorizadora, ")
             .Append("ou leia o QR Code.<br><br><span class=\"r\">Protocolo de autorização de uso</span><span class=\"v\">");
            if (!string.IsNullOrEmpty(c.Protocolo))
                h.Append(c.Protocolo).Append(c.DataAutorizacao.HasValue ? " - " + c.DataAutorizacao.Value.ToString("dd/MM/yyyy HH:mm:ss") : "");
            else h.Append("NÃO AUTORIZADO");
            h.Append("</span></td></tr></table>");

            // ---------------- tipo / natureza ----------------
            h.Append("<table><tr>");
            Campo(h, "Tipo do CT-e", "NORMAL");
            Campo(h, "Tipo do serviço", "NORMAL");
            Campo(h, "Tomador do serviço", c.Tomador == 3 ? "DESTINATÁRIO" : "REMETENTE");
            Campo(h, "Forma de pagamento", c.ValorReceber > 0 ? "A PAGAR" : "PAGO");
            h.Append("</tr><tr>");
            h.Append("<td colspan=\"4\"><span class=\"r\">CFOP - Natureza da prestação</span><span class=\"v\">")
             .Append(c.CFOP).Append(" - ").Append(Util.Html(c.NaturezaOperacao)).Append("</span></td>");
            h.Append("</tr><tr>");
            h.Append("<td colspan=\"2\"><span class=\"r\">Início da prestação</span><span class=\"v\">")
             .Append(Util.Html(c.MunInicio)).Append(" - ").Append(c.UFInicio).Append("</span></td>");
            h.Append("<td colspan=\"2\"><span class=\"r\">Término da prestação</span><span class=\"v\">")
             .Append(Util.Html(c.MunFim)).Append(" - ").Append(c.UFFim).Append("</span></td>");
            h.Append("</tr></table>");

            // ---------------- remetente / destinatario ----------------
            h.Append("<table><tr>");
            Participante(h, "Remetente", c.Remetente);
            Participante(h, "Destinatário", c.Destinatario);
            h.Append("</tr></table>");

            Cliente t = c.ClienteTomador;
            h.Append("<table><tr><td><span class=\"r\">Tomador do serviço</span><span class=\"v\">").Append(Util.Html(t.RazaoSocial))
             .Append("</span>  CNPJ/CPF: ").Append(Util.FormatarDoc(t.CpfCnpj)).Append("  IE: ").Append(Util.Html(t.IE))
             .Append("<br>").Append(Util.Html(t.Endereco.Logradouro)).Append(", ").Append(Util.Html(t.Endereco.Numero))
             .Append(" - ").Append(Util.Html(t.Endereco.Bairro)).Append(" - ").Append(Util.Html(t.Endereco.Municipio))
             .Append("/").Append(t.Endereco.UF).Append("</td></tr></table>");

            // ---------------- carga ----------------
            h.Append("<table><tr>");
            Campo(h, "Produto predominante", Util.Html(c.ProdutoPredominante));
            Campo(h, "Valor total da carga", "R$ " + Util.Moeda(c.ValorCarga));
            Campo(h, "Peso bruto (kg)", c.PesoKg.ToString("N3", Util.BR));
            h.Append("</tr></table>");

            // ---------------- prestacao e impostos ----------------
            h.Append("<table><tr><td class=\"t\" colspan=\"6\">COMPONENTES DO VALOR DA PRESTAÇÃO DO SERVIÇO</td></tr><tr>");
            Campo(h, "Frete valor", "R$ " + Util.Moeda(c.ValorPrestacao));
            Campo(h, "Valor total do serviço", "R$ " + Util.Moeda(c.ValorPrestacao));
            Campo(h, "Valor a receber", "R$ " + Util.Moeda(c.ValorReceber));
            h.Append("</tr></table>");

            h.Append("<table><tr><td class=\"t\" colspan=\"5\">INFORMAÇÕES RELATIVAS AO IMPOSTO</td></tr><tr>");
            Campo(h, "Situação tributária", DescricaoCst(c.CstIcms));
            Campo(h, "Base de cálculo", Util.Moeda(c.BaseIcms));
            Campo(h, "Alíq. ICMS", Util.Moeda(c.AliquotaIcms) + "%");
            Campo(h, "Valor ICMS", Util.Moeda(c.ValorIcms));
            h.Append("</tr></table>");

            // ---------------- documentos originarios ----------------
            h.Append("<table><tr><td class=\"t\" colspan=\"2\">DOCUMENTOS ORIGINÁRIOS</td></tr>");
            string[] nfes = c.ListaChavesNFe();
            if (nfes.Length == 0)
                h.Append("<tr><td colspan=\"2\">DECLARAÇÃO DO REMETENTE - valor R$ ").Append(Util.Moeda(c.ValorCarga)).Append("</td></tr>");
            for (int i = 0; i < nfes.Length; i += 2)
            {
                h.Append("<tr><td style=\"width:50%\">NF-e ").Append(Util.FormatarChave(nfes[i])).Append("</td><td>");
                if (i + 1 < nfes.Length) h.Append("NF-e ").Append(Util.FormatarChave(nfes[i + 1]));
                h.Append("</td></tr>");
            }
            h.Append("</table>");

            // ---------------- observacoes / modal ----------------
            h.Append("<table><tr><td style=\"height:50px\"><span class=\"r\">Observações</span>").Append(Util.Html(c.Observacoes)).Append("</td></tr></table>");
            h.Append("<table><tr><td class=\"t\" colspan=\"3\">INFORMAÇÕES ESPECÍFICAS DO MODAL RODOVIÁRIO</td></tr><tr>");
            Campo(h, "RNTRC da empresa", emp.RNTRC);
            Campo(h, "Este conhecimento de transporte atende à legislação de transporte rodoviário em vigor", "");
            h.Append("</tr></table>");

            h.Append("<table><tr><td style=\"height:40px;width:50%\"><span class=\"r\">Nome / RG / Assinatura do recebedor</span></td>");
            h.Append("<td><span class=\"r\">Data e hora da entrega</span></td></tr></table>");
            h.Append("<div class=\"c\" style=\"font-size:7px\">Gerado por ").Append(CteXml.VerProc).Append("</div>");
            h.Append("</div></body></html>");

            string arquivo = Path.Combine(pasta, "DACTE_" + c.Chave + ".html");
            File.WriteAllText(arquivo, h.ToString(), new UTF8Encoding(true));
            return arquivo;
        }

        private static void Campo(StringBuilder h, string rotulo, string valor)
        {
            h.Append("<td><span class=\"r\">").Append(rotulo).Append("</span><span class=\"v\">").Append(valor).Append("</span></td>");
        }

        private static void Participante(StringBuilder h, string titulo, Cliente p)
        {
            h.Append("<td style=\"width:50%\"><span class=\"r\">").Append(titulo).Append("</span><span class=\"v\">")
             .Append(Util.Html(p.RazaoSocial)).Append("</span><br>")
             .Append(Util.Html(p.Endereco.Logradouro)).Append(", ").Append(Util.Html(p.Endereco.Numero));
            if (!string.IsNullOrEmpty(p.Endereco.Complemento)) h.Append(" - ").Append(Util.Html(p.Endereco.Complemento));
            h.Append("<br>").Append(Util.Html(p.Endereco.Bairro)).Append(" - ").Append(Util.Html(p.Endereco.Municipio))
             .Append("/").Append(p.Endereco.UF).Append(" CEP ").Append(p.Endereco.CEP)
             .Append("<br>CNPJ/CPF: ").Append(Util.FormatarDoc(p.CpfCnpj)).Append("  IE: ").Append(Util.Html(p.IE))
             .Append("<br>Fone: ").Append(Util.Html(p.Fone)).Append("</td>");
        }

        public static string DescricaoCst(string cst)
        {
            switch (cst)
            {
                case "00": return "00 - TRIBUTAÇÃO NORMAL";
                case "40": return "40 - ISENTO";
                case "41": return "41 - NÃO TRIBUTADO";
                case "51": return "51 - DIFERIDO";
                case "90": return "90 - OUTROS";
                case "SN": return "SIMPLES NACIONAL";
            }
            return cst;
        }
    }
}
