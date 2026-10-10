using System;
using System.Windows.Forms;

namespace TransportadoraCTe.Telas
{
    /// <summary>Pede um texto ao usuario (ex.: justificativa do cancelamento).</summary>
    public partial class FrmPergunta : Form
    {
        public FrmPergunta()
        {
            InitializeComponent();
        }

        /// <summary>Mostra a pergunta e devolve o texto digitado, ou null se o usuario cancelar.</summary>
        public static string Perguntar(string titulo, string pergunta)
        {
            using (FrmPergunta f = new FrmPergunta())
            {
                f.Text = titulo;
                f.lblPergunta.Text = pergunta;
                return f.ShowDialog() == DialogResult.OK ? f.txtResposta.Text.Trim() : null;
            }
        }

        private void btnOk_Click(object sender, EventArgs e)
        {
            DialogResult = DialogResult.OK;
        }

        private void btnCancelar_Click(object sender, EventArgs e)
        {
            DialogResult = DialogResult.Cancel;
        }
    }
}
