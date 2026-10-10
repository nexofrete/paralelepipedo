using System;
using System.Windows.Forms;
using TransportadoraCTe.CTe;
using TransportadoraCTe.Modelos;
using TransportadoraCTe.Repositorios;

namespace TransportadoraCTe.Telas
{
    /// <summary>Visualizacao e impressao do DACTE.</summary>
    public class FrmDacte : Form
    {
        private readonly WebBrowser navegador = new WebBrowser();

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

        public FrmDacte(string arquivo)
        {
            UI.PrepararForm(this, "DACTE", 860, 700);
            WindowState = FormWindowState.Maximized;
            navegador.Dock = DockStyle.Fill;
            navegador.ScriptErrorsSuppressed = true;
            navegador.IsWebBrowserContextMenuEnabled = false;

            Controls.Add(navegador);
            Controls.Add(UI.Topo(
                UI.Botao("Imprimir...", delegate { navegador.ShowPrintDialog(); }),
                UI.Botao("Visualizar impressão", delegate { navegador.ShowPrintPreviewDialog(); }),
                UI.Botao("Configurar página", delegate { navegador.ShowPageSetupDialog(); }),
                UI.Botao("Fechar", delegate { Close(); })));

            navegador.Navigate(new Uri(arquivo));
        }
    }
}
