using System;
using System.Threading;
using System.Windows.Forms;
using TransportadoraCTe.Modelos;
using TransportadoraCTe.Telas;

namespace TransportadoraCTe
{
    /// <summary>Usuario logado na sessao atual.</summary>
    public static class Sessao
    {
        public static Usuario Usuario { get; set; }
    }

    internal static class Program
    {
        [STAThread]
        private static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.SetUnhandledExceptionMode(UnhandledExceptionMode.CatchException);
            Application.ThreadException += delegate(object s, ThreadExceptionEventArgs e) { UI.Erro(e.Exception); };

            Thread.CurrentThread.CurrentCulture = Infra.Util.BR;
            Thread.CurrentThread.CurrentUICulture = Infra.Util.BR;

            using (FrmLogin login = new FrmLogin())
            {
                if (login.ShowDialog() != DialogResult.OK) return;
            }
            Application.Run(new FrmPrincipal());
        }
    }
}
