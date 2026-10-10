using System;
using System.Data;
using System.Drawing;
using System.Windows.Forms;

namespace TransportadoraCTe.Telas
{
    /// <summary>
    /// Ajudantes comuns das telas (mensagens, grade, combos).
    /// O layout de cada tela fica no seu arquivo .Designer.cs.
    /// </summary>
    public static class UI
    {
        public static readonly Font Fonte = new Font("Segoe UI", 9F);
        public static readonly Font FonteTitulo = new Font("Segoe UI", 12F, FontStyle.Bold);
        public static readonly Color CorPrimaria = Color.FromArgb(24, 78, 119);
        public static readonly Color CorFundo = Color.FromArgb(244, 246, 248);

        /// <summary>Formata as colunas decimais da grade (chamar no DataBindingComplete).</summary>
        public static void FormatarNumeros(DataGridView g)
        {
            foreach (DataGridViewColumn col in g.Columns)
            {
                if (col.ValueType == typeof(decimal) || col.ValueType == typeof(double))
                {
                    col.DefaultCellStyle.Format = "N2";
                    col.DefaultCellStyle.Alignment = DataGridViewContentAlignment.MiddleRight;
                }
            }
        }

        /// <summary>Seleciona o primeiro item das listas (DropDownList) que ainda estao sem selecao.</summary>
        public static void SelecionarPrimeiro(Control raiz)
        {
            foreach (Control c in raiz.Controls)
            {
                ComboBox cbo = c as ComboBox;
                if (cbo != null && cbo.DropDownStyle == ComboBoxStyle.DropDownList && cbo.Items.Count > 0 && cbo.SelectedIndex < 0)
                    cbo.SelectedIndex = 0;
                SelecionarPrimeiro(c);
            }
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
