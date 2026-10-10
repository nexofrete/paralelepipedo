using System;
using System.Data;
using System.Drawing;
using System.Windows.Forms;

namespace TransportadoraCTe.Telas
{
    /// <summary>
    /// Ajudantes para montar as telas em codigo (sem arquivos .Designer),
    /// mantendo o visual padronizado.
    /// </summary>
    public static class UI
    {
        public static readonly Font Fonte = new Font("Segoe UI", 9F);
        public static readonly Font FonteTitulo = new Font("Segoe UI", 12F, FontStyle.Bold);
        public static readonly Color CorPrimaria = Color.FromArgb(24, 78, 119);
        public static readonly Color CorFundo = Color.FromArgb(244, 246, 248);

        public static void PrepararForm(Form f, string titulo, int largura, int altura)
        {
            f.Text = titulo;
            f.Font = Fonte;
            f.BackColor = CorFundo;
            f.StartPosition = FormStartPosition.CenterParent;
            f.ClientSize = new Size(largura, altura);
            f.KeyPreview = true;
        }

        public static void PrepararDialogo(Form f, string titulo, int largura, int altura)
        {
            PrepararForm(f, titulo, largura, altura);
            f.FormBorderStyle = FormBorderStyle.FixedDialog;
            f.MaximizeBox = false;
            f.MinimizeBox = false;
            f.ShowInTaskbar = false;
        }

        /// <summary>Painel com fluxo horizontal que quebra linha automaticamente.</summary>
        public static FlowLayoutPanel Fluxo()
        {
            FlowLayoutPanel p = new FlowLayoutPanel();
            p.Dock = DockStyle.Fill;
            p.AutoScroll = true;
            p.Padding = new Padding(8);
            p.WrapContents = true;
            return p;
        }

        /// <summary>Rotulo em cima, controle embaixo.</summary>
        public static Panel Campo(string rotulo, Control c, int largura)
        {
            Panel p = new Panel();
            p.Width = largura;
            p.Margin = new Padding(4, 2, 4, 4);
            Label l = new Label();
            l.Text = rotulo;
            l.AutoSize = true;
            l.ForeColor = Color.FromArgb(70, 70, 70);
            l.Location = new Point(0, 0);
            c.Location = new Point(0, 18);
            c.Width = largura - 2;
            p.Controls.Add(l);
            p.Controls.Add(c);
            p.Height = 18 + c.Height + 4;
            return p;
        }

        public static Panel Adicionar(FlowLayoutPanel fluxo, string rotulo, Control c, int largura, bool quebraDepois)
        {
            Panel p = Campo(rotulo, c, largura);
            fluxo.Controls.Add(p);
            if (quebraDepois) fluxo.SetFlowBreak(p, true);
            return p;
        }

        public static Label Secao(FlowLayoutPanel fluxo, string texto)
        {
            Label l = new Label();
            l.Text = texto;
            l.Font = new Font("Segoe UI", 9.5F, FontStyle.Bold);
            l.ForeColor = CorPrimaria;
            l.AutoSize = false;
            l.Width = fluxo.ClientSize.Width > 100 ? fluxo.ClientSize.Width - 30 : 800;
            l.Height = 22;
            l.TextAlign = ContentAlignment.BottomLeft;
            l.Margin = new Padding(4, 8, 4, 2);
            fluxo.Controls.Add(l);
            fluxo.SetFlowBreak(l, true);
            return l;
        }

        public static TextBox Texto(int max)
        {
            TextBox t = new TextBox();
            t.MaxLength = max;
            return t;
        }

        public static TextBox Multilinha(int max, int altura)
        {
            TextBox t = Texto(max);
            t.Multiline = true;
            t.ScrollBars = ScrollBars.Vertical;
            t.Height = altura;
            return t;
        }

        public static TextBox Numero(int max)
        {
            TextBox t = Texto(max);
            t.TextAlign = HorizontalAlignment.Right;
            return t;
        }

        public static ComboBox Combo(params object[] itens)
        {
            ComboBox c = new ComboBox();
            c.DropDownStyle = ComboBoxStyle.DropDownList;
            c.Items.AddRange(itens);
            if (c.Items.Count > 0) c.SelectedIndex = 0;
            return c;
        }

        public static Button Botao(string texto, EventHandler clique)
        {
            Button b = new Button();
            b.Text = texto;
            b.AutoSize = true;
            b.MinimumSize = new Size(90, 30);
            b.Padding = new Padding(6, 0, 6, 0);
            b.Margin = new Padding(4);
            b.FlatStyle = FlatStyle.System;
            if (clique != null) b.Click += clique;
            return b;
        }

        /// <summary>Barra de botoes na parte de baixo do formulario.</summary>
        public static FlowLayoutPanel Rodape(params Button[] botoes)
        {
            FlowLayoutPanel p = new FlowLayoutPanel();
            p.Dock = DockStyle.Bottom;
            p.FlowDirection = FlowDirection.RightToLeft;
            p.Height = 46;
            p.Padding = new Padding(6);
            p.BackColor = Color.FromArgb(230, 234, 238);
            for (int i = botoes.Length - 1; i >= 0; i--) p.Controls.Add(botoes[i]);
            return p;
        }

        /// <summary>Barra de ferramentas no topo (botoes da esquerda para a direita).</summary>
        public static FlowLayoutPanel Topo(params Control[] itens)
        {
            FlowLayoutPanel p = new FlowLayoutPanel();
            p.Dock = DockStyle.Top;
            p.Height = 44;
            p.Padding = new Padding(4);
            p.WrapContents = false;
            p.Controls.AddRange(itens);
            return p;
        }

        public static DataGridView Grade()
        {
            DataGridView g = new DataGridView();
            g.Dock = DockStyle.Fill;
            g.ReadOnly = true;
            g.AllowUserToAddRows = false;
            g.AllowUserToDeleteRows = false;
            g.AllowUserToResizeRows = false;
            g.SelectionMode = DataGridViewSelectionMode.FullRowSelect;
            g.MultiSelect = false;
            g.RowHeadersVisible = false;
            g.BackgroundColor = Color.White;
            g.BorderStyle = BorderStyle.None;
            g.AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.DisplayedCells;
            g.AlternatingRowsDefaultCellStyle.BackColor = Color.FromArgb(247, 249, 251);
            g.EnableHeadersVisualStyles = false;
            g.ColumnHeadersDefaultCellStyle.BackColor = CorPrimaria;
            g.ColumnHeadersDefaultCellStyle.ForeColor = Color.White;
            g.ColumnHeadersDefaultCellStyle.Font = new Font("Segoe UI", 9F, FontStyle.Bold);
            g.ColumnHeadersHeight = 28;
            g.DataBindingComplete += delegate
            {
                foreach (DataGridViewColumn col in g.Columns)
                {
                    if (col.ValueType == typeof(decimal) || col.ValueType == typeof(double))
                    {
                        col.DefaultCellStyle.Format = "N2";
                        col.DefaultCellStyle.Alignment = DataGridViewContentAlignment.MiddleRight;
                    }
                }
            };
            return g;
        }

        /// <summary>Id (primeira coluna) da linha selecionada, ou 0.</summary>
        public static int IdSelecionado(DataGridView g)
        {
            if (g.CurrentRow == null || g.CurrentRow.Index < 0) return 0;
            object v = g.CurrentRow.Cells[0].Value;
            return v == null || v == DBNull.Value ? 0 : Convert.ToInt32(v);
        }

        public static void Erro(Exception ex)
        {
            string msg = ex is ApplicationException ? ex.Message : ex.Message + "\r\n\r\n(" + ex.GetType().Name + ")";
            MessageBox.Show(msg, "Atenção", MessageBoxButtons.OK,
                ex is ApplicationException ? MessageBoxIcon.Warning : MessageBoxIcon.Error);
        }

        public static void Info(string msg)
        {
            MessageBox.Show(msg, "Informação", MessageBoxButtons.OK, MessageBoxIcon.Information);
        }

        public static bool Confirmar(string msg)
        {
            return MessageBox.Show(msg, "Confirmação", MessageBoxButtons.YesNo, MessageBoxIcon.Question) == DialogResult.Yes;
        }

        /// <summary>Executa uma acao demorada mostrando cursor de espera e tratando erros.</summary>
        public static bool Executar(Form f, Action acao)
        {
            Cursor anterior = f.Cursor;
            try
            {
                f.Cursor = Cursors.WaitCursor;
                Application.DoEvents();
                acao();
                return true;
            }
            catch (Exception ex)
            {
                f.Cursor = anterior;
                Erro(ex);
                return false;
            }
            finally { f.Cursor = anterior; }
        }

        public static string ItemCodigo(ComboBox c)
        {
            if (c.SelectedItem == null) return "";
            string s = c.SelectedItem.ToString();
            int i = s.IndexOf(" - ");
            return i > 0 ? s.Substring(0, i) : s;
        }

        public static void SelecionarPorCodigo(ComboBox c, string codigo)
        {
            for (int i = 0; i < c.Items.Count; i++)
            {
                string s = c.Items[i].ToString();
                if (s == codigo || s.StartsWith(codigo + " - ")) { c.SelectedIndex = i; return; }
            }
        }

        public static string ParaCsv(DataTable dt)
        {
            System.Text.StringBuilder sb = new System.Text.StringBuilder();
            for (int i = 0; i < dt.Columns.Count; i++)
            {
                if (i > 0) sb.Append(';');
                sb.Append(dt.Columns[i].ColumnName);
            }
            sb.AppendLine();
            foreach (DataRow r in dt.Rows)
            {
                for (int i = 0; i < dt.Columns.Count; i++)
                {
                    if (i > 0) sb.Append(';');
                    object v = r[i];
                    string s;
                    if (v is decimal) s = ((decimal)v).ToString("0.00", Infra.Util.BR);
                    else s = Convert.ToString(v);
                    if (s.IndexOf(';') >= 0 || s.IndexOf('"') >= 0) s = "\"" + s.Replace("\"", "\"\"") + "\"";
                    sb.Append(s);
                }
                sb.AppendLine();
            }
            return sb.ToString();
        }
    }
}
