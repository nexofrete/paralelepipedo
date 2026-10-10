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
    public class FrmCteLista : Form
    {
        private readonly DataGridView grade = UI.Grade();
        private readonly DateTimePicker dtDe = new DateTimePicker();
        private readonly DateTimePicker dtAte = new DateTimePicker();
        private readonly ComboBox cboStatus = UI.Combo("(todos)", "DIGITACAO", "AUTORIZADO", "REJEITADO", "CANCELADO", "DENEGADO");
        private readonly TextBox txtTexto = UI.Texto(60);

        public FrmCteLista()
        {
            UI.PrepararForm(this, "Gerenciar CT-es", 1100, 600);
            dtDe.Format = dtAte.Format = DateTimePickerFormat.Short;
            dtDe.Width = dtAte.Width = 110;
            dtDe.Value = DateTime.Today.AddDays(-30);
            dtAte.Value = DateTime.Today;
            cboStatus.Width = 120;
            txtTexto.Width = 200;

            FlowLayoutPanel filtros = UI.Topo(
                Rot("De:"), dtDe, Rot("Até:"), dtAte, Rot("Status:"), cboStatus,
                Rot("Cliente/nº/chave:"), txtTexto, UI.Botao("Pesquisar", delegate { Pesquisar(); }));
            foreach (Control c in filtros.Controls) if (!(c is Button)) c.Margin = new Padding(4, 10, 2, 2);

            bool emite = Sessao.Usuario.PodeEmitir;
            Button novo = UI.Botao("Novo", delegate { Editar(0); });
            Button editar = UI.Botao("Editar", delegate { int id = UI.IdSelecionado(grade); if (id > 0) Editar(id); });
            Button enviar = UI.Botao("Enviar à SEFAZ", Enviar);
            Button consultar = UI.Botao("Consultar SEFAZ", Consultar);
            Button cancelar = UI.Botao("Cancelar CT-e", Cancelar);
            Button excluir = UI.Botao("Excluir rascunho", Excluir);
            novo.Enabled = editar.Enabled = enviar.Enabled = cancelar.Enabled = excluir.Enabled = emite;
            FlowLayoutPanel acoes = UI.Topo(novo, editar, enviar, consultar, cancelar, excluir,
                UI.Botao("DACTE", delegate { int id = UI.IdSelecionado(grade); if (id > 0) FrmDacte.Mostrar(this, id); }),
                UI.Botao("Salvar XML", SalvarXml));

            Controls.Add(grade);
            Controls.Add(acoes);
            Controls.Add(filtros);

            txtTexto.KeyDown += delegate(object s, KeyEventArgs e) { if (e.KeyCode == Keys.Enter) { Pesquisar(); e.SuppressKeyPress = true; } };
            grade.CellDoubleClick += delegate(object s, DataGridViewCellEventArgs e)
            {
                if (e.RowIndex < 0) return;
                string st = Convert.ToString(grade.Rows[e.RowIndex].Cells["Status"].Value);
                if (st == StatusCte.Autorizado || st == StatusCte.Cancelado) FrmDacte.Mostrar(this, UI.IdSelecionado(grade));
                else if (emite) Editar(UI.IdSelecionado(grade));
            };
            grade.CellFormatting += delegate(object s, DataGridViewCellFormattingEventArgs e)
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
            };
            Load += delegate { Pesquisar(); };
        }

        private static Label Rot(string t)
        {
            Label l = new Label();
            l.Text = t;
            l.AutoSize = true;
            return l;
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

        private void Enviar(object sender, EventArgs e)
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

        private void Consultar(object sender, EventArgs e)
        {
            int id = UI.IdSelecionado(grade);
            if (id == 0) return;
            ResultadoSefaz r = null;
            if (UI.Executar(this, delegate { r = CteServico.Consultar(id); }))
                UI.Info("Situação na SEFAZ:\r\n\r\n" + r);
            Pesquisar();
        }

        private void Cancelar(object sender, EventArgs e)
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

        private void Excluir(object sender, EventArgs e)
        {
            int id = UI.IdSelecionado(grade);
            if (id == 0 || !UI.Confirmar("Excluir o rascunho selecionado?")) return;
            UI.Executar(this, delegate { CteRepo.ExcluirDigitacao(id); });
            Pesquisar();
        }

        private void SalvarXml(object sender, EventArgs e)
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
            using (Form f = new Form())
            {
                UI.PrepararDialogo(f, titulo, 460, 170);
                TextBox t = UI.Multilinha(255, 60);
                FlowLayoutPanel fl = UI.Fluxo();
                UI.Adicionar(fl, pergunta, t, 420, true);
                Button ok = UI.Botao("OK", delegate { f.DialogResult = DialogResult.OK; });
                f.Controls.Add(fl);
                f.Controls.Add(UI.Rodape(ok, UI.Botao("Cancelar", delegate { f.DialogResult = DialogResult.Cancel; })));
                return f.ShowDialog() == DialogResult.OK ? t.Text.Trim() : null;
            }
        }
    }
}
