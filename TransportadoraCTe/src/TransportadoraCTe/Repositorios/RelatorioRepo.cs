using System;
using System.Data;
using TransportadoraCTe.Infra;

namespace TransportadoraCTe.Repositorios
{
    public static class RelatorioRepo
    {
        public const string CtesPeriodo = "CT-es emitidos no período";
        public const string FaturamentoCliente = "Faturamento por cliente (tomador)";
        public const string ResumoMensal = "Resumo mensal";
        public const string PorRota = "Fretes por rota (origem x destino)";
        public const string Cancelados = "CT-es cancelados";

        public static readonly string[] Tipos = { CtesPeriodo, FaturamentoCliente, ResumoMensal, PorRota, Cancelados };

        // tomador: 0 = remetente, 3 = destinatario
        private const string JoinTomador =
            "JOIN clientes t ON t.id = CASE c.tomador WHEN 3 THEN c.destinatario_id ELSE c.remetente_id END ";

        public static DataTable Gerar(string tipo, DateTime de, DateTime ate, int ambiente, int clienteId)
        {
            string filtro = "WHERE c.data_emissao >= @de AND c.data_emissao < @ate AND c.ambiente = @amb ";
            if (clienteId > 0) filtro += "AND t.id = @cli ";
            string autorizados = "AND c.status = 'AUTORIZADO' ";
            string sql;

            if (tipo == CtesPeriodo)
            {
                sql = "SELECT c.numero AS \"Número\", to_char(c.data_emissao,'DD/MM/YYYY') AS \"Emissão\", " +
                      "t.razao_social AS \"Tomador\", c.mun_inicio || '/' || c.uf_inicio AS \"Origem\", " +
                      "c.mun_fim || '/' || c.uf_fim AS \"Destino\", c.peso_kg AS \"Peso (kg)\", c.valor_carga AS \"Valor carga\", " +
                      "c.valor_prestacao AS \"Frete\", c.valor_icms AS \"ICMS\", c.status AS \"Status\" " +
                      "FROM ctes c " + JoinTomador + filtro + "AND c.status IN ('AUTORIZADO','CANCELADO') " +
                      "ORDER BY c.data_emissao, c.numero";
            }
            else if (tipo == FaturamentoCliente)
            {
                sql = "SELECT t.razao_social AS \"Tomador\", t.cpf_cnpj AS \"CPF/CNPJ\", count(*) AS \"Qtd CT-e\", " +
                      "sum(c.peso_kg) AS \"Peso (kg)\", sum(c.valor_prestacao) AS \"Frete\", sum(c.valor_icms) AS \"ICMS\", " +
                      "round(avg(c.valor_prestacao),2) AS \"Ticket médio\" " +
                      "FROM ctes c " + JoinTomador + filtro + autorizados +
                      "GROUP BY t.razao_social, t.cpf_cnpj ORDER BY sum(c.valor_prestacao) DESC";
            }
            else if (tipo == ResumoMensal)
            {
                sql = "SELECT to_char(date_trunc('month', c.data_emissao),'MM/YYYY') AS \"Mês\", " +
                      "count(*) FILTER (WHERE c.status='AUTORIZADO') AS \"Autorizados\", " +
                      "count(*) FILTER (WHERE c.status='CANCELADO') AS \"Cancelados\", " +
                      "coalesce(sum(c.valor_prestacao) FILTER (WHERE c.status='AUTORIZADO'),0) AS \"Frete\", " +
                      "coalesce(sum(c.valor_icms) FILTER (WHERE c.status='AUTORIZADO'),0) AS \"ICMS\", " +
                      "coalesce(sum(c.peso_kg) FILTER (WHERE c.status='AUTORIZADO'),0) AS \"Peso (kg)\" " +
                      "FROM ctes c " + JoinTomador + filtro +
                      "GROUP BY date_trunc('month', c.data_emissao) ORDER BY date_trunc('month', c.data_emissao)";
            }
            else if (tipo == PorRota)
            {
                sql = "SELECT c.mun_inicio || '/' || c.uf_inicio AS \"Origem\", c.mun_fim || '/' || c.uf_fim AS \"Destino\", " +
                      "count(*) AS \"Qtd CT-e\", sum(c.peso_kg) AS \"Peso (kg)\", sum(c.valor_prestacao) AS \"Frete\", " +
                      "round(sum(c.valor_prestacao) / nullif(sum(c.peso_kg),0) * 1000, 2) AS \"Frete por tonelada\" " +
                      "FROM ctes c " + JoinTomador + filtro + autorizados +
                      "GROUP BY c.mun_inicio, c.uf_inicio, c.mun_fim, c.uf_fim ORDER BY sum(c.valor_prestacao) DESC";
            }
            else if (tipo == Cancelados)
            {
                sql = "SELECT c.numero AS \"Número\", to_char(c.data_emissao,'DD/MM/YYYY') AS \"Emissão\", " +
                      "t.razao_social AS \"Tomador\", c.valor_prestacao AS \"Frete\", c.protocolo AS \"Prot. autorização\", " +
                      "c.protocolo_cancel AS \"Prot. cancelamento\", c.chave AS \"Chave\" " +
                      "FROM ctes c " + JoinTomador + filtro + "AND c.status = 'CANCELADO' ORDER BY c.numero";
            }
            else throw new ArgumentException("Relatório desconhecido: " + tipo);

            return Db.Tabela(sql, Db.P("@de", de.Date), Db.P("@ate", ate.Date.AddDays(1)),
                Db.P("@amb", (short)ambiente), Db.P("@cli", clienteId));
        }
    }
}
