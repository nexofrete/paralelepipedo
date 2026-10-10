using System;
using System.Windows.Forms;
using TransportadoraCTe.Modelos;
using TransportadoraCTe.Repositorios;

namespace TransportadoraCTe.Telas
{
    public partial class FrmUsuarioEdicao : Form
    {
        private readonly Usuario usuario;

        public FrmUsuarioEdicao(int id)
        {
            InitializeComponent();
            Text = id == 0 ? "Novo usuário" : "Alterar usuário";
            lblSenha.Text = id == 0 ? "Senha" : "Nova senha (vazio = manter)";
            usuario = id == 0 ? new Usuario() : UsuarioRepo.Obter(id);
            if (usuario == null) usuario = new Usuario();

            if (usuario.Id > 0)
            {
                txtNome.Text = usuario.Nome;
                txtLogin.Text = usuario.Login;
                UI.SelecionarPorCodigo(cboPerfil, usuario.Perfil);
                chkAtivo.Checked = usuario.Ativo;
            }
            else
            {
                cboPerfil.SelectedIndex = 1;
                chkAtivo.Checked = true;
            }
            UI.SelecionarPrimeiro(this);
        }

        private void btnSalvar_Click(object sender, EventArgs e)
        {
            if (txtSenha.Text != txtSenha2.Text) { UI.Info("As senhas não conferem."); return; }
            usuario.Nome = txtNome.Text;
            usuario.Login = txtLogin.Text;
            usuario.Perfil = UI.ItemCodigo(cboPerfil);
            usuario.Ativo = chkAtivo.Checked;
            if (usuario.Id == Sessao.Usuario.Id && (!usuario.Ativo || usuario.Perfil != "ADMIN"))
            {
                UI.Info("Você não pode inativar nem rebaixar o próprio usuário.");
                return;
            }
            if (UI.Executar(this, delegate { UsuarioRepo.Salvar(usuario, txtSenha.Text); }))
                DialogResult = DialogResult.OK;
        }

        private void btnCancelar_Click(object sender, EventArgs e)
        {
            Close();
        }
    }
}
