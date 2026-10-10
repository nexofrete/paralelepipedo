using System;
using System.Data;
using Npgsql;
using TransportadoraCTe.Infra;
using TransportadoraCTe.Modelos;

namespace TransportadoraCTe.Repositorios
{
    public static class CteRepo
    {
        public static DataTable Pesquisar(DateTime de, DateTime ate, string status, string texto)
        {
            string sql =
                "SELECT c.id AS \"Id\", c.numero AS \"Número\", c.serie AS \"Série\", " +
                "to_char(c.data_emissao,'DD/MM/YYYY HH24:MI') AS \"Emissão\", " +
                "r.razao_social AS \"Remetente\", d.razao_social AS \"Destinatário\", " +
                "c.mun_inicio || '/' || c.uf_inicio AS \"Origem\", c.mun_fim || '/' || c.uf_fim AS \"Destino\", " +
                "c.valor_prestacao AS \"Valor\", c.status AS \"Status\", c.cstat || ' ' || coalesce(c.xmotivo,'') AS \"Retorno SEFAZ\", " +
                "c.chave AS \"Chave\", CASE c.ambiente WHEN 1 THEN 'Produção' ELSE 'Homologação' END AS \"Ambiente\" " +
                "FROM ctes c JOIN clientes r ON r.id = c.remetente_id JOIN clientes d ON d.id = c.destinatario_id " +
                "WHERE c.data_emissao >= @de AND c.data_emissao < @ate ";
            if (!string.IsNullOrEmpty(status)) sql += "AND c.status = @st ";
            if (!string.IsNullOrWhiteSpace(texto))
                sql += "AND (r.razao_social ILIKE @tx OR d.razao_social ILIKE @tx OR c.chave LIKE @tx OR CAST(c.numero AS TEXT) = @num) ";
            sql += "ORDER BY c.data_emissao DESC, c.numero DESC LIMIT 2000";
            return Db.Tabela(sql, Db.P("@de", de.Date), Db.P("@ate", ate.Date.AddDays(1)), Db.P("@st", status),
                Db.P("@tx", "%" + (texto ?? "").Trim() + "%"), Db.P("@num", (texto ?? "").Trim()));
        }

        public static Cte Obter(int id)
        {
            DataTable dt = Db.Tabela("SELECT * FROM ctes WHERE id = @id", Db.P("@id", id));
            if (dt.Rows.Count == 0) return null;
            DataRow r = dt.Rows[0];
            Cte c = new Cte();
            c.Id = Db.I(r, "id");
            c.Serie = Db.I(r, "serie");
            c.Numero = Db.I(r, "numero");
            c.Chave = Db.S(r, "chave");
            c.CodigoNumerico = Db.S(r, "codigo_numerico");
            c.Ambiente = Db.I(r, "ambiente");
            c.DataEmissao = Db.Dt(r, "data_emissao") ?? DateTime.Now;
            c.CFOP = Db.S(r, "cfop");
            c.NaturezaOperacao = Db.S(r, "natureza_operacao");
            c.RemetenteId = Db.I(r, "remetente_id");
            c.DestinatarioId = Db.I(r, "destinatario_id");
            c.Tomador = Db.I(r, "tomador");
            c.CodMunInicio = Db.S(r, "cod_mun_inicio");
            c.MunInicio = Db.S(r, "mun_inicio");
            c.UFInicio = Db.S(r, "uf_inicio");
            c.CodMunFim = Db.S(r, "cod_mun_fim");
            c.MunFim = Db.S(r, "mun_fim");
            c.UFFim = Db.S(r, "uf_fim");
            c.ValorPrestacao = Db.D(r, "valor_prestacao");
            c.ValorReceber = Db.D(r, "valor_receber");
            c.CstIcms = Db.S(r, "cst_icms");
            c.BaseIcms = Db.D(r, "base_icms");
            c.AliquotaIcms = Db.D(r, "aliquota_icms");
            c.ValorIcms = Db.D(r, "valor_icms");
            c.ProdutoPredominante = Db.S(r, "produto_predominante");
            c.ValorCarga = Db.D(r, "valor_carga");
            c.PesoKg = Db.D(r, "peso_kg");
            c.ChavesNFe = Db.S(r, "chaves_nfe");
            c.Observacoes = Db.S(r, "observacoes");
            c.Status = Db.S(r, "status");
            c.CStat = Db.S(r, "cstat");
            c.XMotivo = Db.S(r, "xmotivo");
            c.Protocolo = Db.S(r, "protocolo");
            c.DataAutorizacao = Db.Dt(r, "data_autorizacao");
            c.ProtocoloCancel = Db.S(r, "protocolo_cancel");
            c.XmlAssinado = Db.S(r, "xml_assinado");
            c.XmlAutorizado = Db.S(r, "xml_autorizado");
            c.XmlCancelamento = Db.S(r, "xml_cancelamento");
            int u = Db.I(r, "usuario_id");
            c.UsuarioId = u == 0 ? (int?)null : u;
            c.Remetente = ClienteRepo.Obter(c.RemetenteId);
            c.Destinatario = ClienteRepo.Obter(c.DestinatarioId);
            return c;
        }

        private static NpgsqlParameter[] Parametros(Cte c)
        {
            return new NpgsqlParameter[] {
                Db.P("@serie", c.Serie), Db.P("@numero", c.Numero), Db.P("@chave", c.Chave), Db.P("@cnum", c.CodigoNumerico),
                Db.P("@amb", (short)c.Ambiente), Db.P("@dtemi", c.DataEmissao), Db.P("@cfop", c.CFOP),
                Db.P("@natop", c.NaturezaOperacao), Db.P("@remid", c.RemetenteId), Db.P("@destid", c.DestinatarioId),
                Db.P("@toma", (short)c.Tomador), Db.P("@cmi", c.CodMunInicio), Db.P("@mi", c.MunInicio), Db.P("@ufi", c.UFInicio),
                Db.P("@cmf", c.CodMunFim), Db.P("@mf", c.MunFim), Db.P("@uff", c.UFFim),
                Db.P("@vprest", c.ValorPrestacao), Db.P("@vrec", c.ValorReceber), Db.P("@cst", c.CstIcms),
                Db.P("@vbc", c.BaseIcms), Db.P("@picms", c.AliquotaIcms), Db.P("@vicms", c.ValorIcms),
                Db.P("@propred", c.ProdutoPredominante), Db.P("@vcarga", c.ValorCarga), Db.P("@peso", c.PesoKg),
                Db.P("@nfes", c.ChavesNFe), Db.P("@obs", c.Observacoes), Db.P("@usu", c.UsuarioId), Db.P("@id", c.Id) };
        }

        /// <summary>Grava um CT-e novo em digitacao, reservando numero. Retorna id.</summary>
        public static int Inserir(Cte c)
        {
            using (NpgsqlConnection cn = Db.Abrir())
            using (NpgsqlTransaction tx = cn.BeginTransaction())
            {
                c.Numero = EmpresaRepo.ReservarNumero(cn, tx, c.Serie, c.Ambiente);
                c.Status = StatusCte.Digitacao;
                object id = Db.Escalar(cn, tx,
                    "INSERT INTO ctes (serie, numero, chave, codigo_numerico, ambiente, data_emissao, cfop, natureza_operacao, " +
                    "remetente_id, destinatario_id, tomador, cod_mun_inicio, mun_inicio, uf_inicio, cod_mun_fim, mun_fim, uf_fim, " +
                    "valor_prestacao, valor_receber, cst_icms, base_icms, aliquota_icms, valor_icms, produto_predominante, " +
                    "valor_carga, peso_kg, chaves_nfe, observacoes, usuario_id, status) VALUES (@serie, @numero, @chave, @cnum, " +
                    "@amb, @dtemi, @cfop, @natop, @remid, @destid, @toma, @cmi, @mi, @ufi, @cmf, @mf, @uff, @vprest, @vrec, @cst, " +
                    "@vbc, @picms, @vicms, @propred, @vcarga, @peso, @nfes, @obs, @usu, 'DIGITACAO') RETURNING id",
                    Parametros(c));
                tx.Commit();
                c.Id = Convert.ToInt32(id);
                return c.Id;
            }
        }

        /// <summary>Atualiza dados de um CT-e ainda nao autorizado (digitacao/rejeitado).</summary>
        public static void Atualizar(Cte c)
        {
            int n = Db.Executar(
                "UPDATE ctes SET chave=@chave, codigo_numerico=@cnum, data_emissao=@dtemi, cfop=@cfop, natureza_operacao=@natop, " +
                "remetente_id=@remid, destinatario_id=@destid, tomador=@toma, cod_mun_inicio=@cmi, mun_inicio=@mi, uf_inicio=@ufi, " +
                "cod_mun_fim=@cmf, mun_fim=@mf, uf_fim=@uff, valor_prestacao=@vprest, valor_receber=@vrec, cst_icms=@cst, " +
                "base_icms=@vbc, aliquota_icms=@picms, valor_icms=@vicms, produto_predominante=@propred, valor_carga=@vcarga, " +
                "peso_kg=@peso, chaves_nfe=@nfes, observacoes=@obs " +
                "WHERE id=@id AND status IN ('DIGITACAO','REJEITADO')", Parametros(c));
            if (n == 0) throw new ApplicationException("CT-e já autorizado/cancelado não pode ser alterado.");
        }

        public static void GravarAssinado(int id, string chave, string cnum, DateTime emissao, string xml)
        {
            Db.Executar("UPDATE ctes SET chave=@ch, codigo_numerico=@cn, data_emissao=@dt, xml_assinado=@x, status='DIGITACAO' WHERE id=@id",
                Db.P("@ch", chave), Db.P("@cn", cnum), Db.P("@dt", emissao), Db.P("@x", xml), Db.P("@id", id));
        }

        public static void GravarRetorno(int id, string status, string cstat, string xmotivo, string protocolo,
                                         DateTime? dataAut, string xmlAutorizado)
        {
            Db.Executar(
                "UPDATE ctes SET status=@st, cstat=@cs, xmotivo=@xm, protocolo=coalesce(@pr, protocolo), " +
                "data_autorizacao=coalesce(@da, data_autorizacao), xml_autorizado=coalesce(@xa, xml_autorizado) WHERE id=@id",
                Db.P("@st", status), Db.P("@cs", cstat), Db.P("@xm", Util.Texto(xmotivo, 500)), Db.P("@pr", protocolo),
                Db.P("@da", dataAut), Db.P("@xa", xmlAutorizado), Db.P("@id", id));
        }

        public static void GravarCancelamento(int id, string protocolo, string xmlEvento, string cstat, string xmotivo)
        {
            Db.Executar(
                "UPDATE ctes SET status='CANCELADO', protocolo_cancel=@pr, xml_cancelamento=@x, cstat=@cs, xmotivo=@xm WHERE id=@id",
                Db.P("@pr", protocolo), Db.P("@x", xmlEvento), Db.P("@cs", cstat), Db.P("@xm", Util.Texto(xmotivo, 500)), Db.P("@id", id));
        }

        public static void ExcluirDigitacao(int id)
        {
            int n = Db.Executar("DELETE FROM ctes WHERE id=@id AND status='DIGITACAO' AND xml_assinado IS NULL", Db.P("@id", id));
            if (n == 0) throw new ApplicationException("Só é possível excluir CT-e em digitação que ainda não foi enviado à SEFAZ.");
        }

        public static void Log(int? cteId, string servico, string envio, string retorno)
        {
            try
            {
                Db.Executar("INSERT INTO sefaz_log (cte_id, servico, envio, retorno) VALUES (@c, @s, @e, @r)",
                    Db.P("@c", cteId), Db.P("@s", servico), Db.P("@e", envio), Db.P("@r", retorno));
            }
            catch { /* log nunca deve derrubar a operacao */ }
        }
    }
}
