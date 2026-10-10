using System;
using System.Configuration;
using System.Windows.Forms;
using Npgsql;
using TransportadoraCTe.Infra;

namespace TransportadoraCTe.Telas
{
    /// <summary>Configura a conexao com o PostgreSQL e grava no arquivo .config do programa.</summary>
    public class FrmConexao : Form
    {
        private readonly TextBox txtServidor = UI.Texto(100);
        private readonly TextBox txtPorta = UI.Numero(5);
        private readonly TextBox txtBanco = UI.Texto(60);
        private readonly TextBox txtUsuario = UI.Texto(60);
        private readonly TextBox txtSenha = UI.Texto(100);

        public FrmConexao()
        {
            UI.PrepararDialogo(this, "Conexão com o banco PostgreSQL", 420, 250);
            txtSenha.UseSystemPasswordChar = true;

            FlowLayoutPanel f = UI.Fluxo();
            UI.Adicionar(f, "Servidor", txtServidor, 280, false);
            UI.Adicionar(f, "Porta", txtPorta, 80, true);
            UI.Adicionar(f, "Banco de dados", txtBanco, 180, false);
            UI.Adicionar(f, "Usuário", txtUsuario, 180, true);
            UI.Adicionar(f, "Senha", txtSenha, 180, true);

            Controls.Add(f);
            Controls.Add(UI.Rodape(
                UI.Botao("Testar", delegate { Testar(true); }),
                UI.Botao("Salvar", Salvar),
                UI.Botao("Cancelar", delegate { Close(); })));

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

        private void Salvar(object sender, EventArgs e)
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
    }
}
