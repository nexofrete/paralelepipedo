using System;
using System.Drawing;
using System.Windows.Forms;
using TransportadoraCTe.CTe;
using TransportadoraCTe.Modelos;
using TransportadoraCTe.Repositorios;

namespace TransportadoraCTe.Telas
{
    public partial class FrmPrincipal : Form
    {
        public FrmPrincipal()
        {
            InitializeComponent();

            Usuario u = Sessao.Usuario;
            lblUsuario.Text = "Usuário: " + u.Nome + " (" + u.Perfil + ")";
            // itens escondidos tambem sao desabilitados para o atalho de teclado nao funcionar
            mnuUsuarios.Visible = mnuUsuarios.Enabled = u.EhAdmin;
            sepCadastros.Visible = u.EhAdmin;
            mnuEmpresa.Visible = mnuEmpresa.Enabled = u.EhAdmin;
            mnuNovoCte.Visible = mnuNovoCte.Enabled = u.PodeEmitir;
            btnNovoCte.Visible = btnNovoCte.Enabled = u.PodeEmitir;
        }

        private void FrmPrincipal_Shown(object sender, EventArgs e)
        {
            AtualizarStatus();
        }

        private void mnuClientes_Click(object sender, EventArgs e)
        {
            Abrir(new FrmClientes());
        }

        private void mnuUsuarios_Click(object sender, EventArgs e)
        {
            Abrir(new FrmUsuarios());
        }

        private void mnuEmpresa_Click(object sender, EventArgs e)
        {
            using (FrmEmpresa f = new FrmEmpresa()) f.ShowDialog(this);
            AtualizarStatus();
        }

        private void NovoCte_Click(object sender, EventArgs e)
        {
            NovoCte();
        }

        private void CteLista_Click(object sender, EventArgs e)
        {
            Abrir(new FrmCteLista());
        }

        private void StatusSefaz_Click(object sender, EventArgs e)
        {
            StatusSefaz();
        }

        private void Relatorios_Click(object sender, EventArgs e)
        {
            Abrir(new FrmRelatorios());
        }

        private void mnuTrocarSenha_Click(object sender, EventArgs e)
        {
            using (FrmTrocarSenha f = new FrmTrocarSenha()) f.ShowDialog(this);
        }

        private void mnuConexao_Click(object sender, EventArgs e)
        {
            using (FrmConexao f = new FrmConexao()) f.ShowDialog(this);
        }

        private void mnuSair_Click(object sender, EventArgs e)
        {
            Close();
        }

        /// <summary>Abre um formulario filho; se ja houver um do mesmo tipo, ativa o existente.</summary>
        public void Abrir(Form f)
        {
            foreach (Form aberto in MdiChildren)
            {
                if (aberto.GetType() == f.GetType())
                {
                    f.Dispose();
                    aberto.WindowState = FormWindowState.Maximized;
                    aberto.Activate();
                    return;
                }
            }
            f.MdiParent = this;
            f.WindowState = FormWindowState.Maximized;
            f.Show();
        }

        private void NovoCte()
        {
            using (FrmCteEdicao f = new FrmCteEdicao(0)) f.ShowDialog(this);
            foreach (Form aberto in MdiChildren)
                if (aberto is FrmCteLista) ((FrmCteLista)aberto).Pesquisar();
        }

        private void AtualizarStatus()
        {
            try
            {
                Empresa e = EmpresaRepo.Obter();
                if (e == null)
                {
                    lblAmbiente.Text = "Empresa não cadastrada - vá em Cadastros > Empresa e certificado";
                    lblAmbiente.ForeColor = Color.DarkRed;
                }
                else
                {
                    lblAmbiente.Text = e.RazaoSocial + "  |  Ambiente: " + (e.Ambiente == 1 ? "PRODUÇÃO" : "HOMOLOGAÇÃO (sem valor fiscal)") +
                                       "  |  Série " + e.SerieCTe + "  |  Próximo nº " + e.ProximoNumero;
                    lblAmbiente.ForeColor = e.Ambiente == 1 ? Color.DarkGreen : Color.DarkOrange;
                }
            }
            catch (Exception ex) { lblAmbiente.Text = "Erro: " + ex.Message; }
        }

        private void StatusSefaz()
        {
            ResultadoSefaz r = null;
            if (UI.Executar(this, delegate { r = CteServico.StatusServico(); }))
                MessageBox.Show(r.ToString(), "Status do serviço CT-e", MessageBoxButtons.OK,
                    r.Sucesso ? MessageBoxIcon.Information : MessageBoxIcon.Warning);
        }
    }
}
