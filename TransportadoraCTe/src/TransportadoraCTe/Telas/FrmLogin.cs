using System;
using System.Drawing;
using System.Windows.Forms;
using TransportadoraCTe.Modelos;
using TransportadoraCTe.Repositorios;

namespace TransportadoraCTe.Telas
{
    public class FrmLogin : Form
    {
        private readonly TextBox txtLogin = UI.Texto(40);
        private readonly TextBox txtSenha = UI.Texto(60);

        public FrmLogin()
        {
            UI.PrepararDialogo(this, "Acesso ao sistema", 360, 250);
            StartPosition = FormStartPosition.CenterScreen;
            ShowInTaskbar = true;

            Label titulo = new Label();
            titulo.Text = "TransportadoraCTe";
            titulo.Font = UI.FonteTitulo;
            titulo.ForeColor = Color.White;
            titulo.BackColor = UI.CorPrimaria;
            titulo.Dock = DockStyle.Top;
            titulo.Height = 48;
            titulo.TextAlign = ContentAlignment.MiddleCenter;

            txtSenha.UseSystemPasswordChar = true;
            FlowLayoutPanel f = UI.Fluxo();
            f.Padding = new Padding(40, 14, 20, 0);
            UI.Adicionar(f, "Usuário", txtLogin, 260, true);
            UI.Adicionar(f, "Senha", txtSenha, 260, true);

            Button entrar = UI.Botao("Entrar", Entrar);
            Button conexao = UI.Botao("Conexão...", delegate
            {
                using (FrmConexao fc = new FrmConexao()) fc.ShowDialog(this);
            });
            Button sair = UI.Botao("Sair", delegate { DialogResult = DialogResult.Cancel; });
            AcceptButton = entrar;
            CancelButton = sair;

            Controls.Add(f);
            Controls.Add(UI.Rodape(entrar, sair, conexao));
            Controls.Add(titulo);
            Shown += delegate { txtLogin.Focus(); };
        }

        private void Entrar(object sender, EventArgs e)
        {
            Usuario u = null;
            bool ok = UI.Executar(this, delegate { u = UsuarioRepo.Autenticar(txtLogin.Text, txtSenha.Text); });
            if (!ok) return;
            if (u == null)
            {
                MessageBox.Show("Usuário ou senha inválidos.", "Acesso negado", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                txtSenha.SelectAll();
                txtSenha.Focus();
                return;
            }
            Sessao.Usuario = u;
            DialogResult = DialogResult.OK;
        }
    }
}
