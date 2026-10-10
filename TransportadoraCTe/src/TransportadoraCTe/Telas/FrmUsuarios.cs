using System;
using System.Windows.Forms;
using TransportadoraCTe.Repositorios;

namespace TransportadoraCTe.Telas
{
    public partial class FrmUsuarios : Form
    {
        public FrmUsuarios()
        {
            InitializeComponent();
        }

        private void FrmUsuarios_Load(object sender, EventArgs e)
        {
            Carregar();
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

        private void btnNovo_Click(object sender, EventArgs e)
        {
            Editar(0);
        }

        private void btnAlterar_Click(object sender, EventArgs e)
        {
            int id = UI.IdSelecionado(grade);
            if (id > 0) Editar(id);
        }

        private void btnExcluir_Click(object sender, EventArgs e)
        {
            int id = UI.IdSelecionado(grade);
            if (id == 0) return;
            if (id == Sessao.Usuario.Id) { UI.Info("Você não pode excluir o próprio usuário."); return; }
            if (!UI.Confirmar("Excluir o usuário selecionado?")) return;
            UI.Executar(this, delegate { UsuarioRepo.Excluir(id); });
            Carregar();
        }

        private void btnAtualizar_Click(object sender, EventArgs e)
        {
            Carregar();
        }

        private void grade_CellDoubleClick(object sender, DataGridViewCellEventArgs e)
        {
            if (e.RowIndex >= 0) Editar(UI.IdSelecionado(grade));
        }

        private void grade_DataBindingComplete(object sender, DataGridViewBindingCompleteEventArgs e)
        {
            UI.FormatarNumeros(grade);
        }
    }
}
