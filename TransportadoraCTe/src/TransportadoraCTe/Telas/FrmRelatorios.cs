using System;
using System.Data;
using System.IO;
using System.Text;
using System.Windows.Forms;
using TransportadoraCTe.Infra;
using TransportadoraCTe.Modelos;
using TransportadoraCTe.Repositorios;

namespace TransportadoraCTe.Telas
{
    /// <summary>Relatorios gerenciais com totais, exportacao CSV (Excel) e impressao.</summary>
    public class FrmRelatorios : Form
    {
        private readonly DataGridView grade = UI.Grade();
        private readonly ComboBox cboTipo = UI.Combo(RelatorioRepo.Tipos);
        private readonly DateTimePicker dtDe = new DateTimePicker();
        private readonly DateTimePicker dtAte = new DateTimePicker();
        private readonly ComboBox cboCliente = new ComboBox();
        private readonly ComboBox cboAmbiente = UI.Combo("1 - Produção", "2 - Homologação");
        private readonly Label lblTotais = new Label();
        private DataTable atual;

        public FrmRelatorios()
        {
            UI.PrepararForm(this, "Relatórios gerenciais", 1100, 600);
            cboTipo.Width = 260;
            dtDe.Format = dtAte.Format = DateTimePickerFormat.Short;
            dtDe.Width = dtAte.Width = 110;
            dtDe.Value = new DateTime(DateTime.Today.Year, DateTime.Today.Month, 1);
            dtAte.Value = DateTime.Today;
            cboCliente.DropDownStyle = ComboBoxStyle.DropDownList;
            cboCliente.Width = 260;
            cboAmbiente.Width = 130;

            FlowLayoutPanel topo = UI.Topo(cboTipo, Rot("De:"), dtDe, Rot("Até:"), dtAte, Rot("Tomador:"), cboCliente,
                cboAmbiente, UI.Botao("Gerar", delegate { Gerar(); }));
            foreach (Control c in topo.Controls) if (!(c is Button)) c.Margin = new Padding(4, 10, 2, 2);
            FlowLayoutPanel acoes = UI.Topo(
                UI.Botao("Exportar CSV (Excel)", Exportar),
                UI.Botao("Imprimir", Imprimir));

            lblTotais.Dock = DockStyle.Bottom;
            lblTotais.Height = 28;
            lblTotais.TextAlign = System.Drawing.ContentAlignment.MiddleLeft;
            lblTotais.Padding = new Padding(8, 0, 0, 0);
            lblTotais.Font = new System.Drawing.Font(UI.Fonte, System.Drawing.FontStyle.Bold);
            lblTotais.BackColor = System.Drawing.Color.FromArgb(230, 234, 238);

            Controls.Add(grade);
            Controls.Add(lblTotais);
            Controls.Add(acoes);
            Controls.Add(topo);
            Load += delegate { CarregarFiltros(); };
        }

        private static Label Rot(string t)
        {
            Label l = new Label();
            l.Text = t;
            l.AutoSize = true;
            return l;
        }

        private void CarregarFiltros()
        {
            UI.Executar(this, delegate
            {
                cboCliente.Items.Clear();
                cboCliente.Items.Add("(todos)");
                foreach (Cliente c in ClienteRepo.ListarAtivos()) cboCliente.Items.Add(c);
                cboCliente.SelectedIndex = 0;
                Empresa e = EmpresaRepo.Obter();
                if (e != null) UI.SelecionarPorCodigo(cboAmbiente, e.Ambiente.ToString());
            });
        }

        private void Gerar()
        {
            Cliente cli = cboCliente.SelectedItem as Cliente;
            int amb = int.Parse(UI.ItemCodigo(cboAmbiente));
            if (!UI.Executar(this, delegate
            {
                atual = RelatorioRepo.Gerar(cboTipo.Text, dtDe.Value, dtAte.Value, amb, cli == null ? 0 : cli.Id);
            })) return;
            grade.DataSource = atual;
            lblTotais.Text = Totais(atual);
        }

        private static string Totais(DataTable dt)
        {
            StringBuilder sb = new StringBuilder("Registros: " + dt.Rows.Count);
            foreach (string col in new string[] { "Qtd CT-e", "Autorizados", "Cancelados", "Peso (kg)", "Frete", "ICMS" })
            {
                if (!dt.Columns.Contains(col)) continue;
                decimal soma = 0;
                foreach (DataRow r in dt.Rows)
                {
                    if (dt.Columns.Contains("Status") && Convert.ToString(r["Status"]) == StatusCte.Cancelado) continue;
                    if (r[col] != DBNull.Value) soma += Convert.ToDecimal(r[col]);
                }
                sb.Append("     ").Append(col).Append(": ").Append(col == "Peso (kg)" ? soma.ToString("N3", Util.BR) :
                    (col == "Frete" || col == "ICMS") ? "R$ " + Util.Moeda(soma) : soma.ToString("N0", Util.BR));
            }
            if (dt.Columns.Contains("Status")) sb.Append("     (cancelados não somam)");
            return sb.ToString();
        }

        private void Exportar(object sender, EventArgs e)
        {
            if (atual == null) { UI.Info("Gere o relatório primeiro."); return; }
            using (SaveFileDialog d = new SaveFileDialog())
            {
                d.Filter = "CSV (*.csv)|*.csv";
                d.FileName = cboTipo.Text.Split(' ')[0] + "_" + dtDe.Value.ToString("yyyyMMdd") + "_" + dtAte.Value.ToString("yyyyMMdd") + ".csv";
                if (d.ShowDialog(this) != DialogResult.OK) return;
                File.WriteAllText(d.FileName, UI.ParaCsv(atual), new UTF8Encoding(true));
                UI.Info("Arquivo exportado.");
            }
        }

        private void Imprimir(object sender, EventArgs e)
        {
            if (atual == null) { UI.Info("Gere o relatório primeiro."); return; }
            StringBuilder h = new StringBuilder();
            h.Append("<!DOCTYPE html><html><head><meta http-equiv=\"X-UA-Compatible\" content=\"IE=edge\"><meta charset=\"utf-8\">");
            h.Append("<style>body{font-family:Arial;font-size:11px}table{border-collapse:collapse;width:100%}");
            h.Append("th,td{border:1px solid #999;padding:3px 5px}th{background:#ddd}td.n{text-align:right}</style></head><body>");
            Empresa emp = null;
            try { emp = EmpresaRepo.Obter(); } catch { }
            if (emp != null) h.Append("<b>").Append(Util.Html(emp.RazaoSocial)).Append("</b><br>");
            h.Append("<h3>").Append(Util.Html(cboTipo.Text)).Append("</h3>Período: ").Append(dtDe.Value.ToString("dd/MM/yyyy"))
             .Append(" a ").Append(dtAte.Value.ToString("dd/MM/yyyy")).Append(" &nbsp; Emitido em ").Append(DateTime.Now.ToString("dd/MM/yyyy HH:mm"))
             .Append("<br><br><table><tr>");
            foreach (DataColumn c in atual.Columns) h.Append("<th>").Append(Util.Html(c.ColumnName)).Append("</th>");
            h.Append("</tr>");
            foreach (DataRow r in atual.Rows)
            {
                h.Append("<tr>");
                foreach (DataColumn c in atual.Columns)
                {
                    object v = r[c];
                    if (v is decimal) h.Append("<td class=\"n\">").Append(((decimal)v).ToString("N2", Util.BR)).Append("</td>");
                    else if (v is int || v is long) h.Append("<td class=\"n\">").Append(v).Append("</td>");
                    else h.Append("<td>").Append(Util.Html(Convert.ToString(v))).Append("</td>");
                }
                h.Append("</tr>");
            }
            h.Append("</table><p><b>").Append(Util.Html(lblTotais.Text)).Append("</b></p></body></html>");

            string arq = Path.Combine(Path.GetTempPath(), "relatorio_cte.html");
            File.WriteAllText(arq, h.ToString(), new UTF8Encoding(true));
            WebBrowser wb = new WebBrowser();
            wb.ScriptErrorsSuppressed = true;
            wb.DocumentCompleted += delegate { wb.ShowPrintPreviewDialog(); };
            wb.Navigate(new Uri(arq));
        }
    }
}
