using System;
using System.Windows.Forms;
using TransportadoraCTe.Repositorios;

namespace TransportadoraCTe.Telas
{
    public partial class FrmTrocarSenha : Form
    {
        public FrmTrocarSenha()
        {
            InitializeComponent();
        }

        private void btnSalvar_Click(object sender, EventArgs e)
        {
            if (txtSenha.Text != txtSenha2.Text) { UI.Info("As senhas não conferem."); return; }
            if (UI.Executar(this, delegate { UsuarioRepo.AlterarSenha(Sessao.Usuario.Id, txtSenha.Text); }))
            {
                UI.Info("Senha alterada.");
                DialogResult = DialogResult.OK;
            }
        }

        private void btnCancelar_Click(object sender, EventArgs e)
        {
            Close();
        }
    }
}
