using System;
using System.Windows.Forms;
using TransportadoraCTe.CTe;
using TransportadoraCTe.Modelos;
using TransportadoraCTe.Repositorios;

namespace TransportadoraCTe.Telas
{
    /// <summary>Visualizacao e impressao do DACTE.</summary>
    public partial class FrmDacte : Form
    {
        public static void Mostrar(IWin32Window dono, int cteId)
        {
            string arquivo = null;
            Cursor.Current = Cursors.WaitCursor;
            try
            {
                Cte c = CteRepo.Obter(cteId);
                if (c == null) throw new ApplicationException("CT-e não encontrado.");
                if (c.Status != StatusCte.Autorizado && c.Status != StatusCte.Cancelado)
                    throw new ApplicationException("O DACTE só pode ser impresso para CT-e autorizado.");
                Empresa emp = EmpresaRepo.Obter();
                arquivo = Dacte.Gerar(c, emp);
            }
            catch (Exception ex)
            {
                Cursor.Current = Cursors.Default;
                UI.Erro(ex);
                return;
            }
            Cursor.Current = Cursors.Default;
            using (FrmDacte f = new FrmDacte(arquivo)) f.ShowDialog(dono);
        }

        public FrmDacte()
        {
            InitializeComponent();
        }

        public FrmDacte(string arquivo)
            : this()
        {
            navegador.Navigate(new Uri(arquivo));
        }

        private void btnImprimir_Click(object sender, EventArgs e)
        {
            navegador.ShowPrintDialog();
        }

        private void btnVisualizar_Click(object sender, EventArgs e)
        {
            navegador.ShowPrintPreviewDialog();
        }

        private void btnConfigurar_Click(object sender, EventArgs e)
        {
            navegador.ShowPageSetupDialog();
        }

        private void btnFechar_Click(object sender, EventArgs e)
        {
            Close();
        }
    }
}
