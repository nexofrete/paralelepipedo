namespace TransportadoraCTe.Telas
{
    partial class FrmPergunta
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
            this.pnlCampos = new System.Windows.Forms.Panel();
            this.lblPergunta = new System.Windows.Forms.Label();
            this.txtResposta = new System.Windows.Forms.TextBox();
            this.pnlRodape = new System.Windows.Forms.FlowLayoutPanel();
            this.btnCancelar = new System.Windows.Forms.Button();
            this.btnOk = new System.Windows.Forms.Button();
            this.pnlCampos.SuspendLayout();
            this.pnlRodape.SuspendLayout();
            this.SuspendLayout();
            // 
            // pnlCampos
            // 
            this.pnlCampos.Controls.Add(this.lblPergunta);
            this.pnlCampos.Controls.Add(this.txtResposta);
            this.pnlCampos.AutoScroll = true;
            this.pnlCampos.Dock = System.Windows.Forms.DockStyle.Fill;
            this.pnlCampos.Location = new System.Drawing.Point(0, 0);
            this.pnlCampos.Name = "pnlCampos";
            this.pnlCampos.Size = new System.Drawing.Size(460, 124);
            // 
            // lblPergunta
            // 
            this.lblPergunta.AutoSize = true;
            this.lblPergunta.ForeColor = System.Drawing.Color.FromArgb(((int)(((byte)(70)))), ((int)(((byte)(70)))), ((int)(((byte)(70)))));
            this.lblPergunta.Location = new System.Drawing.Point(12, 10);
            this.lblPergunta.Name = "lblPergunta";
            this.lblPergunta.TabIndex = 0;
            this.lblPergunta.Text = "Pergunta:";
            // 
            // txtResposta
            // 
            this.txtResposta.Location = new System.Drawing.Point(12, 28);
            this.txtResposta.MaxLength = 255;
            this.txtResposta.Multiline = true;
            this.txtResposta.Name = "txtResposta";
            this.txtResposta.ScrollBars = System.Windows.Forms.ScrollBars.Vertical;
            this.txtResposta.Size = new System.Drawing.Size(418, 60);
            this.txtResposta.TabIndex = 1;
            // 
            // pnlRodape
            // 
            this.pnlRodape.Controls.Add(this.btnCancelar);
            this.pnlRodape.Controls.Add(this.btnOk);
            this.pnlRodape.BackColor = System.Drawing.Color.FromArgb(((int)(((byte)(230)))), ((int)(((byte)(234)))), ((int)(((byte)(238)))));
            this.pnlRodape.Dock = System.Windows.Forms.DockStyle.Bottom;
            this.pnlRodape.FlowDirection = System.Windows.Forms.FlowDirection.RightToLeft;
            this.pnlRodape.Location = new System.Drawing.Point(0, 124);
            this.pnlRodape.Name = "pnlRodape";
            this.pnlRodape.Padding = new System.Windows.Forms.Padding(6);
            this.pnlRodape.Size = new System.Drawing.Size(460, 46);
            // 
            // btnCancelar
            // 
            this.btnCancelar.AutoSize = true;
            this.btnCancelar.FlatStyle = System.Windows.Forms.FlatStyle.System;
            this.btnCancelar.Margin = new System.Windows.Forms.Padding(4);
            this.btnCancelar.MinimumSize = new System.Drawing.Size(90, 30);
            this.btnCancelar.Name = "btnCancelar";
            this.btnCancelar.Padding = new System.Windows.Forms.Padding(6, 0, 6, 0);
            this.btnCancelar.Size = new System.Drawing.Size(90, 30);
            this.btnCancelar.TabIndex = 0;
            this.btnCancelar.Text = "Cancelar";
            this.btnCancelar.UseVisualStyleBackColor = true;
            this.btnCancelar.Click += new System.EventHandler(this.btnCancelar_Click);
            // 
            // btnOk
            // 
            this.btnOk.AutoSize = true;
            this.btnOk.FlatStyle = System.Windows.Forms.FlatStyle.System;
            this.btnOk.Margin = new System.Windows.Forms.Padding(4);
            this.btnOk.MinimumSize = new System.Drawing.Size(90, 30);
            this.btnOk.Name = "btnOk";
            this.btnOk.Padding = new System.Windows.Forms.Padding(6, 0, 6, 0);
            this.btnOk.Size = new System.Drawing.Size(90, 30);
            this.btnOk.TabIndex = 1;
            this.btnOk.Text = "OK";
            this.btnOk.UseVisualStyleBackColor = true;
            this.btnOk.Click += new System.EventHandler(this.btnOk_Click);
            // 
            // FrmPergunta
            // 
            this.AutoScaleDimensions = new System.Drawing.SizeF(7F, 15F);
            this.AutoScaleMode = System.Windows.Forms.AutoScaleMode.Font;
            this.BackColor = System.Drawing.Color.FromArgb(((int)(((byte)(244)))), ((int)(((byte)(246)))), ((int)(((byte)(248)))));
            this.ClientSize = new System.Drawing.Size(460, 170);
            this.Controls.Add(this.pnlCampos);
            this.Controls.Add(this.pnlRodape);
            this.Font = new System.Drawing.Font("Segoe UI", 9F, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, ((byte)(0)));
            this.FormBorderStyle = System.Windows.Forms.FormBorderStyle.FixedDialog;
            this.KeyPreview = true;
            this.MaximizeBox = false;
            this.MinimizeBox = false;
            this.Name = "FrmPergunta";
            this.ShowInTaskbar = false;
            this.StartPosition = System.Windows.Forms.FormStartPosition.CenterParent;
            this.Text = "Pergunta";
            this.pnlRodape.ResumeLayout(false);
            this.pnlRodape.PerformLayout();
            this.pnlCampos.ResumeLayout(false);
            this.pnlCampos.PerformLayout();
            this.ResumeLayout(false);
            this.PerformLayout();
        }

        #endregion

        private System.Windows.Forms.Panel pnlCampos;
        private System.Windows.Forms.Label lblPergunta;
        private System.Windows.Forms.TextBox txtResposta;
        private System.Windows.Forms.FlowLayoutPanel pnlRodape;
        private System.Windows.Forms.Button btnCancelar;
        private System.Windows.Forms.Button btnOk;
    }
}
