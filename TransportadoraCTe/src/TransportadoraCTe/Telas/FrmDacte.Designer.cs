namespace TransportadoraCTe.Telas
{
    partial class FrmDacte
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
            this.navegador = new System.Windows.Forms.WebBrowser();
            this.pnlTopo = new System.Windows.Forms.FlowLayoutPanel();
            this.btnImprimir = new System.Windows.Forms.Button();
            this.btnVisualizar = new System.Windows.Forms.Button();
            this.btnConfigurar = new System.Windows.Forms.Button();
            this.btnFechar = new System.Windows.Forms.Button();
            this.pnlTopo.SuspendLayout();
            this.SuspendLayout();
            // 
            // navegador
            // 
            this.navegador.Dock = System.Windows.Forms.DockStyle.Fill;
            this.navegador.IsWebBrowserContextMenuEnabled = false;
            this.navegador.Location = new System.Drawing.Point(0, 44);
            this.navegador.MinimumSize = new System.Drawing.Size(20, 20);
            this.navegador.Name = "navegador";
            this.navegador.ScriptErrorsSuppressed = true;
            this.navegador.Size = new System.Drawing.Size(860, 656);
            // 
            // pnlTopo
            // 
            this.pnlTopo.Controls.Add(this.btnImprimir);
            this.pnlTopo.Controls.Add(this.btnVisualizar);
            this.pnlTopo.Controls.Add(this.btnConfigurar);
            this.pnlTopo.Controls.Add(this.btnFechar);
            this.pnlTopo.Dock = System.Windows.Forms.DockStyle.Top;
            this.pnlTopo.Location = new System.Drawing.Point(0, 0);
            this.pnlTopo.Name = "pnlTopo";
            this.pnlTopo.Padding = new System.Windows.Forms.Padding(4);
            this.pnlTopo.Size = new System.Drawing.Size(860, 44);
            this.pnlTopo.WrapContents = false;
            // 
            // btnImprimir
            // 
            this.btnImprimir.AutoSize = true;
            this.btnImprimir.FlatStyle = System.Windows.Forms.FlatStyle.System;
            this.btnImprimir.Margin = new System.Windows.Forms.Padding(4);
            this.btnImprimir.MinimumSize = new System.Drawing.Size(90, 30);
            this.btnImprimir.Name = "btnImprimir";
            this.btnImprimir.Padding = new System.Windows.Forms.Padding(6, 0, 6, 0);
            this.btnImprimir.Size = new System.Drawing.Size(90, 30);
            this.btnImprimir.TabIndex = 0;
            this.btnImprimir.Text = "Imprimir...";
            this.btnImprimir.UseVisualStyleBackColor = true;
            this.btnImprimir.Click += new System.EventHandler(this.btnImprimir_Click);
            // 
            // btnVisualizar
            // 
            this.btnVisualizar.AutoSize = true;
            this.btnVisualizar.FlatStyle = System.Windows.Forms.FlatStyle.System;
            this.btnVisualizar.Margin = new System.Windows.Forms.Padding(4);
            this.btnVisualizar.MinimumSize = new System.Drawing.Size(90, 30);
            this.btnVisualizar.Name = "btnVisualizar";
            this.btnVisualizar.Padding = new System.Windows.Forms.Padding(6, 0, 6, 0);
            this.btnVisualizar.Size = new System.Drawing.Size(90, 30);
            this.btnVisualizar.TabIndex = 1;
            this.btnVisualizar.Text = "Visualizar impressão";
            this.btnVisualizar.UseVisualStyleBackColor = true;
            this.btnVisualizar.Click += new System.EventHandler(this.btnVisualizar_Click);
            // 
            // btnConfigurar
            // 
            this.btnConfigurar.AutoSize = true;
            this.btnConfigurar.FlatStyle = System.Windows.Forms.FlatStyle.System;
            this.btnConfigurar.Margin = new System.Windows.Forms.Padding(4);
            this.btnConfigurar.MinimumSize = new System.Drawing.Size(90, 30);
            this.btnConfigurar.Name = "btnConfigurar";
            this.btnConfigurar.Padding = new System.Windows.Forms.Padding(6, 0, 6, 0);
            this.btnConfigurar.Size = new System.Drawing.Size(90, 30);
            this.btnConfigurar.TabIndex = 2;
            this.btnConfigurar.Text = "Configurar página";
            this.btnConfigurar.UseVisualStyleBackColor = true;
            this.btnConfigurar.Click += new System.EventHandler(this.btnConfigurar_Click);
            // 
            // btnFechar
            // 
            this.btnFechar.AutoSize = true;
            this.btnFechar.FlatStyle = System.Windows.Forms.FlatStyle.System;
            this.btnFechar.Margin = new System.Windows.Forms.Padding(4);
            this.btnFechar.MinimumSize = new System.Drawing.Size(90, 30);
            this.btnFechar.Name = "btnFechar";
            this.btnFechar.Padding = new System.Windows.Forms.Padding(6, 0, 6, 0);
            this.btnFechar.Size = new System.Drawing.Size(90, 30);
            this.btnFechar.TabIndex = 3;
            this.btnFechar.Text = "Fechar";
            this.btnFechar.UseVisualStyleBackColor = true;
            this.btnFechar.Click += new System.EventHandler(this.btnFechar_Click);
            // 
            // FrmDacte
            // 
            this.AutoScaleDimensions = new System.Drawing.SizeF(7F, 15F);
            this.AutoScaleMode = System.Windows.Forms.AutoScaleMode.Font;
            this.BackColor = System.Drawing.Color.FromArgb(((int)(((byte)(244)))), ((int)(((byte)(246)))), ((int)(((byte)(248)))));
            this.ClientSize = new System.Drawing.Size(860, 700);
            this.Controls.Add(this.navegador);
            this.Controls.Add(this.pnlTopo);
            this.Font = new System.Drawing.Font("Segoe UI", 9F, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, ((byte)(0)));
            this.KeyPreview = true;
            this.Name = "FrmDacte";
            this.StartPosition = System.Windows.Forms.FormStartPosition.CenterParent;
            this.Text = "DACTE";
            this.WindowState = System.Windows.Forms.FormWindowState.Maximized;
            this.pnlTopo.ResumeLayout(false);
            this.pnlTopo.PerformLayout();
            this.ResumeLayout(false);
            this.PerformLayout();
        }

        #endregion

        private System.Windows.Forms.WebBrowser navegador;
        private System.Windows.Forms.FlowLayoutPanel pnlTopo;
        private System.Windows.Forms.Button btnImprimir;
        private System.Windows.Forms.Button btnVisualizar;
        private System.Windows.Forms.Button btnConfigurar;
        private System.Windows.Forms.Button btnFechar;
    }
}
