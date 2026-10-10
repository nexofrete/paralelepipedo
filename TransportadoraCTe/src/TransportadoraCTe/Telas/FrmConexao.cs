using System;
using System.Configuration;
using System.Windows.Forms;
using Npgsql;
using TransportadoraCTe.Infra;

namespace TransportadoraCTe.Telas
{
    /// <summary>Configura a conexao com o PostgreSQL e grava no arquivo .config do programa.</summary>
    public partial class FrmConexao : Form
    {
        public FrmConexao()
        {
            InitializeComponent();
            Carregar();
        }

        private void Carregar()
        {
            try
            {
                NpgsqlConnectionStringBuilder b = new NpgsqlConnectionStringBuilder(Db.StringConexao);
                txtServidor.Text = b.Host;
                txtPorta.Text = b.Port.ToString();
                txtBanco.Text = b.Database;
                txtUsuario.Text = b.UserName;
                txtSenha.Text = b.Password;
            }
            catch
            {
                txtServidor.Text = "localhost"; txtPorta.Text = "5432"; txtBanco.Text = "transportadora"; txtUsuario.Text = "postgres";
            }
        }

        private string Montar()
        {
            return "Server=" + txtServidor.Text.Trim() + ";Port=" + txtPorta.Text.Trim() + ";Database=" + txtBanco.Text.Trim() +
                   ";User Id=" + txtUsuario.Text.Trim() + ";Password=" + txtSenha.Text + ";Timeout=15;CommandTimeout=60;";
        }

        private bool Testar(bool avisar)
        {
            string versao = null;
            bool ok = UI.Executar(this, delegate
            {
                using (NpgsqlConnection cn = new NpgsqlConnection(Montar()))
                {
                    cn.Open();
                    using (NpgsqlCommand cmd = new NpgsqlCommand("SELECT version()", cn))
                        versao = Convert.ToString(cmd.ExecuteScalar());
                }
            });
            if (ok && avisar) UI.Info("Conexão OK!\r\n\r\n" + versao);
            return ok;
        }

        private void btnTestar_Click(object sender, EventArgs e)
        {
            Testar(true);
        }

        private void btnSalvar_Click(object sender, EventArgs e)
        {
            if (!Testar(false)) return;
            try
            {
                Configuration cfg = ConfigurationManager.OpenExeConfiguration(ConfigurationUserLevel.None);
                ConnectionStringSettings cs = cfg.ConnectionStrings.ConnectionStrings["Postgres"];
                if (cs == null)
                    cfg.ConnectionStrings.ConnectionStrings.Add(new ConnectionStringSettings("Postgres", Montar()));
                else
                    cs.ConnectionString = Montar();
                cfg.Save(ConfigurationSaveMode.Modified);
                ConfigurationManager.RefreshSection("connectionStrings");
                UI.Info("Conexão salva.");
                Close();
            }
            catch (Exception ex)
            {
                UI.Erro(new ApplicationException("Não foi possível gravar o arquivo de configuração (execute como administrador " +
                    "ou instale fora de Arquivos de Programas).\r\n" + ex.Message));
            }
        }

        private void btnCancelar_Click(object sender, EventArgs e)
        {
            Close();
        }
    }
}
