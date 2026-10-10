using System;
using System.Windows.Forms;
using TransportadoraCTe.Repositorios;

namespace TransportadoraCTe.Telas
{
    public partial class FrmClientes : Form
    {
        private readonly bool podeEditar;

        public FrmClientes()
        {
            InitializeComponent();
            podeEditar = Sessao.Usuario.PodeEmitir;
            btnNovo.Enabled = btnAlterar.Enabled = btnExcluir.Enabled = podeEditar;
        }

        private void FrmClientes_Load(object sender, EventArgs e)
        {
            Carregar();
        }

        private void Carregar()
        {
            UI.Executar(this, delegate { grade.DataSource = ClienteRepo.Pesquisar(txtFiltro.Text, chkAtivos.Checked); });
        }

        private void Editar(int id)
        {
            using (FrmClienteEdicao f = new FrmClienteEdicao(id))
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
            if (id == 0 || !UI.Confirmar("Excluir o cliente selecionado?")) return;
            UI.Executar(this, delegate { ClienteRepo.Excluir(id); });
            Carregar();
        }

        private void btnPesquisar_Click(object sender, EventArgs e)
        {
            Carregar();
        }

        private void txtFiltro_KeyDown(object sender, KeyEventArgs e)
        {
            if (e.KeyCode == Keys.Enter) { Carregar(); e.SuppressKeyPress = true; }
        }

        private void grade_CellDoubleClick(object sender, DataGridViewCellEventArgs e)
        {
            if (e.RowIndex >= 0 && podeEditar) Editar(UI.IdSelecionado(grade));
        }

        private void grade_DataBindingComplete(object sender, DataGridViewBindingCompleteEventArgs e)
        {
            UI.FormatarNumeros(grade);
        }
    }
}
