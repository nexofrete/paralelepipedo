namespace TransportadoraCTe.Telas
{
    partial class FrmPrincipal
    {
        /// <summary>
        /// Required designer variable.
        /// </summary>
        private System.ComponentModel.IContainer components = null;

        /// <summary>
        /// Clean up any resources being used.
        /// </summary>
        /// <param name="disposing">true if managed resources should be disposed; otherwise, false.</param>
        protected override void Dispose(bool disposing)
        {
            if (disposing && (components != null))
            {
                components.Dispose();
            }
            base.Dispose(disposing);
        }

        #region Windows Form Designer generated code

        /// <summary>
        /// Required method for Designer support - do not modify
        /// the contents of this method with the code editor.
        /// </summary>
        private void InitializeComponent()
        {
            this.barra = new System.Windows.Forms.ToolStrip();
            this.btnNovoCte = new System.Windows.Forms.ToolStripButton();
            this.btnCtes = new System.Windows.Forms.ToolStripButton();
            this.btnClientes = new System.Windows.Forms.ToolStripButton();
            this.btnRelatorios = new System.Windows.Forms.ToolStripButton();
            this.sepBarra = new System.Windows.Forms.ToolStripSeparator();
            this.btnStatusSefaz = new System.Windows.Forms.ToolStripButton();
            this.menu = new System.Windows.Forms.MenuStrip();
            this.mnuCadastros = new System.Windows.Forms.ToolStripMenuItem();
            this.mnuClientes = new System.Windows.Forms.ToolStripMenuItem();
            this.mnuUsuarios = new System.Windows.Forms.ToolStripMenuItem();
            this.sepCadastros = new System.Windows.Forms.ToolStripSeparator();
            this.mnuEmpresa = new System.Windows.Forms.ToolStripMenuItem();
            this.mnuCte = new System.Windows.Forms.ToolStripMenuItem();
            this.mnuNovoCte = new System.Windows.Forms.ToolStripMenuItem();
            this.mnuGerenciarCtes = new System.Windows.Forms.ToolStripMenuItem();
            this.sepCte = new System.Windows.Forms.ToolStripSeparator();
            this.mnuStatusSefaz = new System.Windows.Forms.ToolStripMenuItem();
            this.mnuRelatorios = new System.Windows.Forms.ToolStripMenuItem();
            this.mnuRelatoriosGerenciais = new System.Windows.Forms.ToolStripMenuItem();
            this.mnuSistema = new System.Windows.Forms.ToolStripMenuItem();
            this.mnuTrocarSenha = new System.Windows.Forms.ToolStripMenuItem();
            this.mnuConexao = new System.Windows.Forms.ToolStripMenuItem();
            this.sepSistema = new System.Windows.Forms.ToolStripSeparator();
            this.mnuSair = new System.Windows.Forms.ToolStripMenuItem();
            this.mnuJanelas = new System.Windows.Forms.ToolStripMenuItem();
            this.status = new System.Windows.Forms.StatusStrip();
            this.lblUsuario = new System.Windows.Forms.ToolStripStatusLabel();
            this.lblSeparador = new System.Windows.Forms.ToolStripStatusLabel();
            this.lblAmbiente = new System.Windows.Forms.ToolStripStatusLabel();
            this.barra.SuspendLayout();
            this.menu.SuspendLayout();
            this.status.SuspendLayout();
            this.SuspendLayout();
            // 
            // barra
            // 
            this.barra.Items.AddRange(new System.Windows.Forms.ToolStripItem[] {
            this.btnNovoCte,
            this.btnCtes,
            this.btnClientes,
            this.btnRelatorios,
            this.sepBarra,
            this.btnStatusSefaz});
            this.barra.GripStyle = System.Windows.Forms.ToolStripGripStyle.Hidden;
            this.barra.ImageScalingSize = new System.Drawing.Size(16, 16);
            this.barra.Location = new System.Drawing.Point(0, 24);
            this.barra.Name = "barra";
            this.barra.Padding = new System.Windows.Forms.Padding(4);
            this.barra.Size = new System.Drawing.Size(1000, 30);
            this.barra.TabIndex = 1;
            // 
            // btnNovoCte
            // 
            this.btnNovoCte.DisplayStyle = System.Windows.Forms.ToolStripItemDisplayStyle.Text;
            this.btnNovoCte.Name = "btnNovoCte";
            this.btnNovoCte.Padding = new System.Windows.Forms.Padding(6, 2, 6, 2);
            this.btnNovoCte.Text = "Novo CT-e (F3)";
            this.btnNovoCte.Click += new System.EventHandler(this.NovoCte_Click);
            // 
            // btnCtes
            // 
            this.btnCtes.DisplayStyle = System.Windows.Forms.ToolStripItemDisplayStyle.Text;
            this.btnCtes.Name = "btnCtes";
            this.btnCtes.Padding = new System.Windows.Forms.Padding(6, 2, 6, 2);
            this.btnCtes.Text = "CT-es (F4)";
            this.btnCtes.Click += new System.EventHandler(this.CteLista_Click);
            // 
            // btnClientes
            // 
            this.btnClientes.DisplayStyle = System.Windows.Forms.ToolStripItemDisplayStyle.Text;
            this.btnClientes.Name = "btnClientes";
            this.btnClientes.Padding = new System.Windows.Forms.Padding(6, 2, 6, 2);
            this.btnClientes.Text = "Clientes (F2)";
            this.btnClientes.Click += new System.EventHandler(this.mnuClientes_Click);
            // 
            // btnRelatorios
            // 
            this.btnRelatorios.DisplayStyle = System.Windows.Forms.ToolStripItemDisplayStyle.Text;
            this.btnRelatorios.Name = "btnRelatorios";
            this.btnRelatorios.Padding = new System.Windows.Forms.Padding(6, 2, 6, 2);
            this.btnRelatorios.Text = "Relatórios (F6)";
            this.btnRelatorios.Click += new System.EventHandler(this.Relatorios_Click);
            // 
            // sepBarra
            // 
            this.sepBarra.Name = "sepBarra";
            // 
            // btnStatusSefaz
            // 
            this.btnStatusSefaz.DisplayStyle = System.Windows.Forms.ToolStripItemDisplayStyle.Text;
            this.btnStatusSefaz.Name = "btnStatusSefaz";
            this.btnStatusSefaz.Padding = new System.Windows.Forms.Padding(6, 2, 6, 2);
            this.btnStatusSefaz.Text = "Status SEFAZ";
            this.btnStatusSefaz.Click += new System.EventHandler(this.StatusSefaz_Click);
            // 
            // menu
            // 
            this.menu.Items.AddRange(new System.Windows.Forms.ToolStripItem[] {
            this.mnuCadastros,
            this.mnuCte,
            this.mnuRelatorios,
            this.mnuSistema,
            this.mnuJanelas});
            this.menu.Location = new System.Drawing.Point(0, 0);
            this.menu.MdiWindowListItem = this.mnuJanelas;
            this.menu.Name = "menu";
            this.menu.Size = new System.Drawing.Size(1000, 24);
            this.menu.TabIndex = 0;
            // 
            // mnuCadastros
            // 
            this.mnuCadastros.DropDownItems.AddRange(new System.Windows.Forms.ToolStripItem[] {
            this.mnuClientes,
            this.mnuUsuarios,
            this.sepCadastros,
            this.mnuEmpresa});
            this.mnuCadastros.Name = "mnuCadastros";
            this.mnuCadastros.Text = "&Cadastros";
            // 
            // mnuClientes
            // 
            this.mnuClientes.Name = "mnuClientes";
            this.mnuClientes.ShortcutKeys = System.Windows.Forms.Keys.F2;
            this.mnuClientes.Text = "&Clientes";
            this.mnuClientes.Click += new System.EventHandler(this.mnuClientes_Click);
            // 
            // mnuUsuarios
            // 
            this.mnuUsuarios.Name = "mnuUsuarios";
            this.mnuUsuarios.Text = "&Usuários";
            this.mnuUsuarios.Click += new System.EventHandler(this.mnuUsuarios_Click);
            // 
            // sepCadastros
            // 
            this.sepCadastros.Name = "sepCadastros";
            // 
            // mnuEmpresa
            // 
            this.mnuEmpresa.Name = "mnuEmpresa";
            this.mnuEmpresa.Text = "&Empresa e certificado";
            this.mnuEmpresa.Click += new System.EventHandler(this.mnuEmpresa_Click);
            // 
            // mnuCte
            // 
            this.mnuCte.DropDownItems.AddRange(new System.Windows.Forms.ToolStripItem[] {
            this.mnuNovoCte,
            this.mnuGerenciarCtes,
            this.sepCte,
            this.mnuStatusSefaz});
            this.mnuCte.Name = "mnuCte";
            this.mnuCte.Text = "C&T-e";
            // 
            // mnuNovoCte
            // 
            this.mnuNovoCte.Name = "mnuNovoCte";
            this.mnuNovoCte.ShortcutKeys = System.Windows.Forms.Keys.F3;
            this.mnuNovoCte.Text = "&Novo CT-e";
            this.mnuNovoCte.Click += new System.EventHandler(this.NovoCte_Click);
            // 
            // mnuGerenciarCtes
            // 
            this.mnuGerenciarCtes.Name = "mnuGerenciarCtes";
            this.mnuGerenciarCtes.ShortcutKeys = System.Windows.Forms.Keys.F4;
            this.mnuGerenciarCtes.Text = "&Gerenciar CT-es";
            this.mnuGerenciarCtes.Click += new System.EventHandler(this.CteLista_Click);
            // 
            // sepCte
            // 
            this.sepCte.Name = "sepCte";
            // 
            // mnuStatusSefaz
            // 
            this.mnuStatusSefaz.Name = "mnuStatusSefaz";
            this.mnuStatusSefaz.Text = "&Status do serviço SEFAZ";
            this.mnuStatusSefaz.Click += new System.EventHandler(this.StatusSefaz_Click);
            // 
            // mnuRelatorios
            // 
            this.mnuRelatorios.DropDownItems.AddRange(new System.Windows.Forms.ToolStripItem[] {
            this.mnuRelatoriosGerenciais});
            this.mnuRelatorios.Name = "mnuRelatorios";
            this.mnuRelatorios.Text = "&Relatórios";
            // 
            // mnuRelatoriosGerenciais
            // 
            this.mnuRelatoriosGerenciais.Name = "mnuRelatoriosGerenciais";
            this.mnuRelatoriosGerenciais.ShortcutKeys = System.Windows.Forms.Keys.F6;
            this.mnuRelatoriosGerenciais.Text = "&Relatórios gerenciais";
            this.mnuRelatoriosGerenciais.Click += new System.EventHandler(this.Relatorios_Click);
            // 
            // mnuSistema
            // 
            this.mnuSistema.DropDownItems.AddRange(new System.Windows.Forms.ToolStripItem[] {
            this.mnuTrocarSenha,
            this.mnuConexao,
            this.sepSistema,
            this.mnuSair});
            this.mnuSistema.Name = "mnuSistema";
            this.mnuSistema.Text = "&Sistema";
            // 
            // mnuTrocarSenha
            // 
            this.mnuTrocarSenha.Name = "mnuTrocarSenha";
            this.mnuTrocarSenha.Text = "&Trocar minha senha";
            this.mnuTrocarSenha.Click += new System.EventHandler(this.mnuTrocarSenha_Click);
            // 
            // mnuConexao
            // 
            this.mnuConexao.Name = "mnuConexao";
            this.mnuConexao.Text = "&Conexão com o banco";
            this.mnuConexao.Click += new System.EventHandler(this.mnuConexao_Click);
            // 
            // sepSistema
            // 
            this.sepSistema.Name = "sepSistema";
            // 
            // mnuSair
            // 
            this.mnuSair.Name = "mnuSair";
            this.mnuSair.Text = "Sai&r";
            this.mnuSair.Click += new System.EventHandler(this.mnuSair_Click);
            // 
            // mnuJanelas
            // 
            this.mnuJanelas.Name = "mnuJanelas";
            this.mnuJanelas.Text = "&Janelas";
            // 
            // status
            // 
            this.status.Items.AddRange(new System.Windows.Forms.ToolStripItem[] {
            this.lblUsuario,
            this.lblSeparador,
            this.lblAmbiente});
            this.status.Location = new System.Drawing.Point(0, 628);
            this.status.Name = "status";
            this.status.Size = new System.Drawing.Size(1000, 22);
            this.status.TabIndex = 2;
            // 
            // lblUsuario
            // 
            this.lblUsuario.Name = "lblUsuario";
            this.lblUsuario.Text = "Usuário:";
            // 
            // lblSeparador
            // 
            this.lblSeparador.Name = "lblSeparador";
            this.lblSeparador.Text = "   |   ";
            // 
            // lblAmbiente
            // 
            this.lblAmbiente.Name = "lblAmbiente";
            // 
            // FrmPrincipal
            // 
            this.AutoScaleDimensions = new System.Drawing.SizeF(7F, 15F);
            this.AutoScaleMode = System.Windows.Forms.AutoScaleMode.Font;
            this.ClientSize = new System.Drawing.Size(1000, 650);
            this.Controls.Add(this.barra);
            this.Controls.Add(this.menu);
            this.Controls.Add(this.status);
            this.Font = new System.Drawing.Font("Segoe UI", 9F, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, ((byte)(0)));
            this.IsMdiContainer = true;
            this.MainMenuStrip = this.menu;
            this.MinimumSize = new System.Drawing.Size(1000, 650);
            this.Name = "FrmPrincipal";
            this.Text = "TransportadoraCTe - Emissão de CT-e";
            this.WindowState = System.Windows.Forms.FormWindowState.Maximized;
            this.Shown += new System.EventHandler(this.FrmPrincipal_Shown);
            this.status.ResumeLayout(false);
            this.status.PerformLayout();
            this.menu.ResumeLayout(false);
            this.menu.PerformLayout();
            this.barra.ResumeLayout(false);
            this.barra.PerformLayout();
            this.ResumeLayout(false);
            this.PerformLayout();
        }

        #endregion

        private System.Windows.Forms.ToolStrip barra;
        private System.Windows.Forms.ToolStripButton btnNovoCte;
        private System.Windows.Forms.ToolStripButton btnCtes;
        private System.Windows.Forms.ToolStripButton btnClientes;
        private System.Windows.Forms.ToolStripButton btnRelatorios;
        private System.Windows.Forms.ToolStripSeparator sepBarra;
        private System.Windows.Forms.ToolStripButton btnStatusSefaz;
        private System.Windows.Forms.MenuStrip menu;
        private System.Windows.Forms.ToolStripMenuItem mnuCadastros;
        private System.Windows.Forms.ToolStripMenuItem mnuClientes;
        private System.Windows.Forms.ToolStripMenuItem mnuUsuarios;
        private System.Windows.Forms.ToolStripSeparator sepCadastros;
        private System.Windows.Forms.ToolStripMenuItem mnuEmpresa;
        private System.Windows.Forms.ToolStripMenuItem mnuCte;
        private System.Windows.Forms.ToolStripMenuItem mnuNovoCte;
        private System.Windows.Forms.ToolStripMenuItem mnuGerenciarCtes;
        private System.Windows.Forms.ToolStripSeparator sepCte;
        private System.Windows.Forms.ToolStripMenuItem mnuStatusSefaz;
        private System.Windows.Forms.ToolStripMenuItem mnuRelatorios;
        private System.Windows.Forms.ToolStripMenuItem mnuRelatoriosGerenciais;
        private System.Windows.Forms.ToolStripMenuItem mnuSistema;
        private System.Windows.Forms.ToolStripMenuItem mnuTrocarSenha;
        private System.Windows.Forms.ToolStripMenuItem mnuConexao;
        private System.Windows.Forms.ToolStripSeparator sepSistema;
        private System.Windows.Forms.ToolStripMenuItem mnuSair;
        private System.Windows.Forms.ToolStripMenuItem mnuJanelas;
        private System.Windows.Forms.StatusStrip status;
        private System.Windows.Forms.ToolStripStatusLabel lblUsuario;
        private System.Windows.Forms.ToolStripStatusLabel lblSeparador;
        private System.Windows.Forms.ToolStripStatusLabel lblAmbiente;
    }
}
