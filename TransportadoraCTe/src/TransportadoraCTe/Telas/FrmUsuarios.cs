using System;
using System.Windows.Forms;
using TransportadoraCTe.Modelos;
using TransportadoraCTe.Repositorios;

namespace TransportadoraCTe.Telas
{
    public class FrmUsuarios : Form
    {
        private readonly DataGridView grade = UI.Grade();

        public FrmUsuarios()
        {
            UI.PrepararForm(this, "Cadastro de usuários", 800, 500);
            Controls.Add(grade);
            Controls.Add(UI.Topo(
                UI.Botao("Novo", delegate { Editar(0); }),
                UI.Botao("Alterar", delegate { int id = UI.IdSelecionado(grade); if (id > 0) Editar(id); }),
                UI.Botao("Excluir", Excluir),
                UI.Botao("Atualizar", delegate { Carregar(); })));
            grade.CellDoubleClick += delegate(object s, DataGridViewCellEventArgs e)
            {
                if (e.RowIndex >= 0) Editar(UI.IdSelecionado(grade));
            };
            Load += delegate { Carregar(); };
        }

        private void Carregar()
        {
            UI.Executar(this, delegate { grade.DataSource = UsuarioRepo.Listar(); });
        }

        private void Editar(int id)
        {
            using (FrmUsuarioEdicao f = new FrmUsuarioEdicao(id))
                if (f.ShowDialog(this) == DialogResult.OK) Carregar();
        }

        private void Excluir(object sender, EventArgs e)
        {
            int id = UI.IdSelecionado(grade);
            if (id == 0) return;
            if (id == Sessao.Usuario.Id) { UI.Info("Você não pode excluir o próprio usuário."); return; }
            if (!UI.Confirmar("Excluir o usuário selecionado?")) return;
            UI.Executar(this, delegate { UsuarioRepo.Excluir(id); });
            Carregar();
        }
    }

    public class FrmUsuarioEdicao : Form
    {
        private readonly Usuario usuario;
        private readonly TextBox txtNome = UI.Texto(100);
        private readonly TextBox txtLogin = UI.Texto(40);
        private readonly TextBox txtSenha = UI.Texto(60);
        private readonly TextBox txtSenha2 = UI.Texto(60);
        private readonly ComboBox cboPerfil = UI.Combo("ADMIN - Administrador", "OPERADOR - Emite CT-e", "CONSULTA - Apenas consulta");
        private readonly CheckBox chkAtivo = new CheckBox();

        public FrmUsuarioEdicao(int id)
        {
            UI.PrepararDialogo(this, id == 0 ? "Novo usuário" : "Alterar usuário", 440, 260);
            usuario = id == 0 ? new Usuario() : UsuarioRepo.Obter(id);
            if (usuario == null) usuario = new Usuario();

            txtSenha.UseSystemPasswordChar = true;
            txtSenha2.UseSystemPasswordChar = true;
            chkAtivo.Text = "Usuário ativo";
            chkAtivo.AutoSize = true;

            FlowLayoutPanel f = UI.Fluxo();
            UI.Adicionar(f, "Nome", txtNome, 400, true);
            UI.Adicionar(f, "Login", txtLogin, 190, false);
            UI.Adicionar(f, "Perfil", cboPerfil, 200, true);
            UI.Adicionar(f, id == 0 ? "Senha" : "Nova senha (vazio = manter)", txtSenha, 190, false);
            UI.Adicionar(f, "Confirme a senha", txtSenha2, 200, true);
            f.Controls.Add(chkAtivo);

            Button salvar = UI.Botao("Salvar", Salvar);
            Controls.Add(f);
            Controls.Add(UI.Rodape(salvar, UI.Botao("Cancelar", delegate { Close(); })));
            AcceptButton = salvar;

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
        }

        private void Salvar(object sender, EventArgs e)
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
    }
}
