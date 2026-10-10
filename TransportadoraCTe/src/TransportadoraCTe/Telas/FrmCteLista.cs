using System;
using System.Drawing;
using System.IO;
using System.Text;
using System.Windows.Forms;
using TransportadoraCTe.CTe;
using TransportadoraCTe.Modelos;
using TransportadoraCTe.Repositorios;

namespace TransportadoraCTe.Telas
{
    /// <summary>Consulta e gerenciamento dos CT-es: enviar, consultar, cancelar, DACTE e XML.</summary>
    public partial class FrmCteLista : Form
    {
        private readonly bool emite;

        public FrmCteLista()
        {
            InitializeComponent();
            UI.SelecionarPrimeiro(this);
            dtDe.Value = DateTime.Today.AddDays(-30);
            dtAte.Value = DateTime.Today;
            emite = Sessao.Usuario.PodeEmitir;
            btnNovo.Enabled = btnEditar.Enabled = btnEnviar.Enabled = btnCancelar.Enabled = btnExcluir.Enabled = emite;
        }

        private void FrmCteLista_Load(object sender, EventArgs e)
        {
            Pesquisar();
        }

        private void btnPesquisar_Click(object sender, EventArgs e)
        {
            Pesquisar();
        }

        private void txtTexto_KeyDown(object sender, KeyEventArgs e)
        {
            if (e.KeyCode == Keys.Enter) { Pesquisar(); e.SuppressKeyPress = true; }
        }

        private void grade_CellDoubleClick(object sender, DataGridViewCellEventArgs e)
        {
            if (e.RowIndex < 0) return;
            string st = Convert.ToString(grade.Rows[e.RowIndex].Cells["Status"].Value);
            if (st == StatusCte.Autorizado || st == StatusCte.Cancelado) FrmDacte.Mostrar(this, UI.IdSelecionado(grade));
            else if (emite) Editar(UI.IdSelecionado(grade));
        }

        private void grade_CellFormatting(object sender, DataGridViewCellFormattingEventArgs e)
        {
            if (e.ColumnIndex < 0 || grade.Columns[e.ColumnIndex].Name != "Status" || e.Value == null) return;
            switch (e.Value.ToString())
            {
                case StatusCte.Autorizado: e.CellStyle.ForeColor = Color.DarkGreen; break;
                case StatusCte.Rejeitado: e.CellStyle.ForeColor = Color.DarkRed; break;
                case StatusCte.Cancelado: e.CellStyle.ForeColor = Color.Gray; break;
                case StatusCte.Denegado: e.CellStyle.ForeColor = Color.Purple; break;
                default: e.CellStyle.ForeColor = Color.DarkOrange; break;
            }
            e.CellStyle.Font = new Font(UI.Fonte, FontStyle.Bold);
        }

        private void grade_DataBindingComplete(object sender, DataGridViewBindingCompleteEventArgs e)
        {
            UI.FormatarNumeros(grade);
        }

        private void btnNovo_Click(object sender, EventArgs e)
        {
            Editar(0);
        }

        private void btnEditar_Click(object sender, EventArgs e)
        {
            int id = UI.IdSelecionado(grade);
            if (id > 0) Editar(id);
        }

        private void btnDacte_Click(object sender, EventArgs e)
        {
            int id = UI.IdSelecionado(grade);
            if (id > 0) FrmDacte.Mostrar(this, id);
        }

        public void Pesquisar()
        {
            string st = cboStatus.SelectedIndex <= 0 ? "" : cboStatus.Text;
            UI.Executar(this, delegate { grade.DataSource = CteRepo.Pesquisar(dtDe.Value, dtAte.Value, st, txtTexto.Text); });
            if (grade.Columns.Contains("Id")) grade.Columns["Id"].Visible = false;
        }

        private void Editar(int id)
        {
            if (id > 0)
            {
                string st = Convert.ToString(grade.CurrentRow.Cells["Status"].Value);
                if (st != StatusCte.Digitacao && st != StatusCte.Rejeitado)
                {
                    UI.Info("Somente CT-e em digitação ou rejeitado pode ser editado.");
                    return;
                }
            }
            using (FrmCteEdicao f = new FrmCteEdicao(id)) f.ShowDialog(this);
            Pesquisar();
        }

        private void btnEnviar_Click(object sender, EventArgs e)
        {
            int id = UI.IdSelecionado(grade);
            if (id == 0) return;
            ResultadoSefaz r = null;
            if (UI.Executar(this, delegate { r = CteServico.Emitir(id); }))
            {
                MessageBox.Show(r.ToString(), r.Sucesso ? "CT-e autorizado" : "CT-e não autorizado", MessageBoxButtons.OK,
                    r.Sucesso ? MessageBoxIcon.Information : MessageBoxIcon.Warning);
            }
            Pesquisar();
        }

        private void btnConsultar_Click(object sender, EventArgs e)
        {
            int id = UI.IdSelecionado(grade);
            if (id == 0) return;
            ResultadoSefaz r = null;
            if (UI.Executar(this, delegate { r = CteServico.Consultar(id); }))
                UI.Info("Situação na SEFAZ:\r\n\r\n" + r);
            Pesquisar();
        }

        private void btnCancelar_Click(object sender, EventArgs e)
        {
            int id = UI.IdSelecionado(grade);
            if (id == 0) return;
            string just = Perguntar("Cancelar CT-e", "Justificativa do cancelamento (mínimo 15 caracteres):");
            if (just == null) return;
            if (!UI.Confirmar("Confirma o CANCELAMENTO do CT-e selecionado? Esta operação não pode ser desfeita.")) return;
            ResultadoSefaz r = null;
            if (UI.Executar(this, delegate { r = CteServico.Cancelar(id, just); }))
                MessageBox.Show(r.ToString(), r.Sucesso ? "Cancelamento homologado" : "Cancelamento rejeitado",
                    MessageBoxButtons.OK, r.Sucesso ? MessageBoxIcon.Information : MessageBoxIcon.Warning);
            Pesquisar();
        }

        private void btnExcluir_Click(object sender, EventArgs e)
        {
            int id = UI.IdSelecionado(grade);
            if (id == 0 || !UI.Confirmar("Excluir o rascunho selecionado?")) return;
            UI.Executar(this, delegate { CteRepo.ExcluirDigitacao(id); });
            Pesquisar();
        }

        private void btnSalvarXml_Click(object sender, EventArgs e)
        {
            int id = UI.IdSelecionado(grade);
            if (id == 0) return;
            Cte c = null;
            if (!UI.Executar(this, delegate { c = CteRepo.Obter(id); })) return;

            string xml = !string.IsNullOrEmpty(c.XmlAutorizado) ? c.XmlAutorizado : c.XmlAssinado;
            if (string.IsNullOrEmpty(xml)) { UI.Info("Este CT-e ainda não possui XML."); return; }
            using (SaveFileDialog d = new SaveFileDialog())
            {
                d.Filter = "XML (*.xml)|*.xml";
                d.FileName = c.Chave + (string.IsNullOrEmpty(c.XmlAutorizado) ? "-assinado" : "-procCTe") + ".xml";
                if (d.ShowDialog(this) != DialogResult.OK) return;
                File.WriteAllText(d.FileName, "<?xml version=\"1.0\" encoding=\"UTF-8\"?>" + xml, new UTF8Encoding(false));
                if (!string.IsNullOrEmpty(c.XmlCancelamento))
                {
                    string canc = Path.Combine(Path.GetDirectoryName(d.FileName), c.Chave + "-procEventoCancelamento.xml");
                    File.WriteAllText(canc, "<?xml version=\"1.0\" encoding=\"UTF-8\"?>" + c.XmlCancelamento, new UTF8Encoding(false));
                }
                UI.Info("XML salvo.");
            }
        }

        public static string Perguntar(string titulo, string pergunta)
        {
            return FrmPergunta.Perguntar(titulo, pergunta);
        }
    }
}
