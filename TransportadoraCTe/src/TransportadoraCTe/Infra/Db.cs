using System;
using System.Configuration;
using System.Data;
using Npgsql;

namespace TransportadoraCTe.Infra
{
    /// <summary>
    /// Acesso simples ao PostgreSQL via Npgsql 2.2.x (compativel com .NET 4.0).
    /// A string de conexao fica no App.config, chave "Postgres".
    /// </summary>
    public static class Db
    {
        public static string StringConexao
        {
            get
            {
                ConnectionStringSettings cs = ConfigurationManager.ConnectionStrings["Postgres"];
                if (cs == null || string.IsNullOrEmpty(cs.ConnectionString))
                    throw new ConfigurationErrorsException("Connection string 'Postgres' nao encontrada no App.config.");
                return cs.ConnectionString;
            }
        }

        public static NpgsqlConnection Abrir()
        {
            NpgsqlConnection cn = new NpgsqlConnection(StringConexao);
            cn.Open();
            return cn;
        }

        public static NpgsqlParameter P(string nome, object valor)
        {
            NpgsqlParameter p = new NpgsqlParameter(nome, valor ?? DBNull.Value);
            if (valor is string && ((string)valor).Length == 0)
                p.Value = DBNull.Value;
            return p;
        }

        private static NpgsqlCommand Comando(NpgsqlConnection cn, NpgsqlTransaction tx, string sql, NpgsqlParameter[] ps)
        {
            NpgsqlCommand cmd = new NpgsqlCommand(sql, cn);
            if (tx != null) cmd.Transaction = tx;
            cmd.CommandTimeout = 60;
            if (ps != null)
                foreach (NpgsqlParameter p in ps) cmd.Parameters.Add(p);
            return cmd;
        }

        // ---------- sem transacao (abre e fecha conexao) ----------
        public static int Executar(string sql, params NpgsqlParameter[] ps)
        {
            using (NpgsqlConnection cn = Abrir())
                return Executar(cn, null, sql, ps);
        }

        public static object Escalar(string sql, params NpgsqlParameter[] ps)
        {
            using (NpgsqlConnection cn = Abrir())
                return Escalar(cn, null, sql, ps);
        }

        public static DataTable Tabela(string sql, params NpgsqlParameter[] ps)
        {
            using (NpgsqlConnection cn = Abrir())
                return Tabela(cn, null, sql, ps);
        }

        // ---------- com conexao/transacao do chamador ----------
        public static int Executar(NpgsqlConnection cn, NpgsqlTransaction tx, string sql, params NpgsqlParameter[] ps)
        {
            using (NpgsqlCommand cmd = Comando(cn, tx, sql, ps))
                return cmd.ExecuteNonQuery();
        }

        public static object Escalar(NpgsqlConnection cn, NpgsqlTransaction tx, string sql, params NpgsqlParameter[] ps)
        {
            using (NpgsqlCommand cmd = Comando(cn, tx, sql, ps))
            {
                object o = cmd.ExecuteScalar();
                return o == DBNull.Value ? null : o;
            }
        }

        public static DataTable Tabela(NpgsqlConnection cn, NpgsqlTransaction tx, string sql, params NpgsqlParameter[] ps)
        {
            using (NpgsqlCommand cmd = Comando(cn, tx, sql, ps))
            using (NpgsqlDataAdapter da = new NpgsqlDataAdapter(cmd))
            {
                DataTable dt = new DataTable();
                da.Fill(dt);
                return dt;
            }
        }

        // ---------- leitura segura de DataRow ----------
        public static string S(DataRow r, string col)
        {
            object o = r[col];
            return o == DBNull.Value || o == null ? "" : Convert.ToString(o);
        }

        public static int I(DataRow r, string col)
        {
            object o = r[col];
            return o == DBNull.Value || o == null ? 0 : Convert.ToInt32(o);
        }

        public static decimal D(DataRow r, string col)
        {
            object o = r[col];
            return o == DBNull.Value || o == null ? 0m : Convert.ToDecimal(o);
        }

        public static bool B(DataRow r, string col)
        {
            object o = r[col];
            return o != DBNull.Value && o != null && Convert.ToBoolean(o);
        }

        public static DateTime? Dt(DataRow r, string col)
        {
            object o = r[col];
            if (o == DBNull.Value || o == null) return null;
            return Convert.ToDateTime(o);
        }

        /// <summary>Testa a conexao e devolve a versao do servidor.</summary>
        public static string Testar()
        {
            object v = Escalar("SELECT version()");
            return v == null ? "" : v.ToString();
        }
    }
}
