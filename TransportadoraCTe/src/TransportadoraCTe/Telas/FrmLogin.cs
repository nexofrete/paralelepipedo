using System;
using System.Windows.Forms;
using TransportadoraCTe.Modelos;
using TransportadoraCTe.Repositorios;

namespace TransportadoraCTe.Telas
{
    public partial class FrmLogin : Form
    {
        public FrmLogin()
        {
            InitializeComponent();
        }

        private void FrmLogin_Shown(object sender, EventArgs e)
        {
            txtLogin.Focus();
        }

        private void btnEntrar_Click(object sender, EventArgs e)
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

        private void btnSair_Click(object sender, EventArgs e)
        {
            DialogResult = DialogResult.Cancel;
        }

        private void btnConexao_Click(object sender, EventArgs e)
        {
            using (FrmConexao fc = new FrmConexao()) fc.ShowDialog(this);
        }
    }
}
