using System;
using System.Drawing;
using System.Windows.Forms;
using TransportadoraCTe.CTe;
using TransportadoraCTe.Modelos;
using TransportadoraCTe.Repositorios;

namespace TransportadoraCTe.Telas
{
    public class FrmPrincipal : Form
    {
        private readonly ToolStripStatusLabel lblAmbiente = new ToolStripStatusLabel();

        public FrmPrincipal()
        {
            Text = "TransportadoraCTe - Emissão de CT-e";
            Font = UI.Fonte;
            IsMdiContainer = true;
            WindowState = FormWindowState.Maximized;
            MinimumSize = new Size(1000, 650);

            Usuario u = Sessao.Usuario;
            MenuStrip menu = new MenuStrip();

            ToolStripMenuItem cad = new ToolStripMenuItem("&Cadastros");
            cad.DropDownItems.Add(Item("&Clientes", Keys.F2, delegate { Abrir(new FrmClientes()); }));
            if (u.EhAdmin)
            {
                cad.DropDownItems.Add(Item("&Usuários", Keys.None, delegate { Abrir(new FrmUsuarios()); }));
                cad.DropDownItems.Add(new ToolStripSeparator());
                cad.DropDownItems.Add(Item("&Empresa e certificado", Keys.None, delegate
                {
                    using (FrmEmpresa f = new FrmEmpresa()) f.ShowDialog(this);
                    AtualizarStatus();
                }));
            }
            menu.Items.Add(cad);

            ToolStripMenuItem cte = new ToolStripMenuItem("C&T-e");
            if (u.PodeEmitir)
                cte.DropDownItems.Add(Item("&Novo CT-e", Keys.F3, delegate { NovoCte(); }));
            cte.DropDownItems.Add(Item("&Gerenciar CT-es", Keys.F4, delegate { Abrir(new FrmCteLista()); }));
            cte.DropDownItems.Add(new ToolStripSeparator());
            cte.DropDownItems.Add(Item("&Status do serviço SEFAZ", Keys.None, delegate { StatusSefaz(); }));
            menu.Items.Add(cte);

            ToolStripMenuItem rel = new ToolStripMenuItem("&Relatórios");
            rel.DropDownItems.Add(Item("&Relatórios gerenciais", Keys.F6, delegate { Abrir(new FrmRelatorios()); }));
            menu.Items.Add(rel);

            ToolStripMenuItem sis = new ToolStripMenuItem("&Sistema");
            sis.DropDownItems.Add(Item("&Trocar minha senha", Keys.None, delegate { TrocarSenha(); }));
            sis.DropDownItems.Add(Item("&Conexão com o banco", Keys.None, delegate
            {
                using (FrmConexao f = new FrmConexao()) f.ShowDialog(this);
            }));
            sis.DropDownItems.Add(new ToolStripSeparator());
            sis.DropDownItems.Add(Item("Sai&r", Keys.None, delegate { Close(); }));
            menu.Items.Add(sis);

            ToolStripMenuItem jan = new ToolStripMenuItem("&Janelas");
            menu.MdiWindowListItem = jan;
            menu.Items.Add(jan);

            MainMenuStrip = menu;

            // atalhos rapidos
            ToolStrip barra = new ToolStrip();
            barra.ImageScalingSize = new Size(16, 16);
            barra.GripStyle = ToolStripGripStyle.Hidden;
            barra.Padding = new Padding(4);
            if (u.PodeEmitir) barra.Items.Add(Atalho("Novo CT-e (F3)", delegate { NovoCte(); }));
            barra.Items.Add(Atalho("CT-es (F4)", delegate { Abrir(new FrmCteLista()); }));
            barra.Items.Add(Atalho("Clientes (F2)", delegate { Abrir(new FrmClientes()); }));
            barra.Items.Add(Atalho("Relatórios (F6)", delegate { Abrir(new FrmRelatorios()); }));
            barra.Items.Add(new ToolStripSeparator());
            barra.Items.Add(Atalho("Status SEFAZ", delegate { StatusSefaz(); }));

            StatusStrip status = new StatusStrip();
            status.Items.Add(new ToolStripStatusLabel("Usuário: " + u.Nome + " (" + u.Perfil + ")"));
            status.Items.Add(new ToolStripStatusLabel("   |   "));
            status.Items.Add(lblAmbiente);

            Controls.Add(barra);
            Controls.Add(menu);
            Controls.Add(status);

            Shown += delegate { AtualizarStatus(); };
        }

        private static ToolStripMenuItem Item(string texto, Keys atalho, EventHandler acao)
        {
            ToolStripMenuItem i = new ToolStripMenuItem(texto, null, acao);
            if (atalho != Keys.None) i.ShortcutKeys = atalho;
            return i;
        }

        private static ToolStripButton Atalho(string texto, EventHandler acao)
        {
            ToolStripButton b = new ToolStripButton(texto, null, acao);
            b.DisplayStyle = ToolStripItemDisplayStyle.Text;
            b.Padding = new Padding(6, 2, 6, 2);
            return b;
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

        private void TrocarSenha()
        {
            using (Form f = new Form())
            {
                UI.PrepararDialogo(f, "Trocar senha", 300, 170);
                TextBox s1 = UI.Texto(60); s1.UseSystemPasswordChar = true;
                TextBox s2 = UI.Texto(60); s2.UseSystemPasswordChar = true;
                FlowLayoutPanel fl = UI.Fluxo();
                UI.Adicionar(fl, "Nova senha", s1, 260, true);
                UI.Adicionar(fl, "Confirme a nova senha", s2, 260, true);
                Button ok = UI.Botao("Salvar", delegate
                {
                    if (s1.Text != s2.Text) { UI.Info("As senhas não conferem."); return; }
                    if (UI.Executar(f, delegate { UsuarioRepo.AlterarSenha(Sessao.Usuario.Id, s1.Text); }))
                    {
                        UI.Info("Senha alterada.");
                        f.DialogResult = DialogResult.OK;
                    }
                });
                f.Controls.Add(fl);
                f.Controls.Add(UI.Rodape(ok, UI.Botao("Cancelar", delegate { f.Close(); })));
                f.AcceptButton = ok;
                f.ShowDialog(this);
            }
        }
    }
}
