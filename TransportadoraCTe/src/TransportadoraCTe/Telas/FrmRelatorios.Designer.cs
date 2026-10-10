namespace TransportadoraCTe.Telas
{
    partial class FrmRelatorios
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
            System.Windows.Forms.DataGridViewCellStyle dataGridViewCellStyle1 = new System.Windows.Forms.DataGridViewCellStyle();
            System.Windows.Forms.DataGridViewCellStyle dataGridViewCellStyle2 = new System.Windows.Forms.DataGridViewCellStyle();
            this.grade = new System.Windows.Forms.DataGridView();
            this.lblTotais = new System.Windows.Forms.Label();
            this.pnlAcoes = new System.Windows.Forms.FlowLayoutPanel();
            this.btnExportar = new System.Windows.Forms.Button();
            this.btnImprimir = new System.Windows.Forms.Button();
            this.pnlTopo = new System.Windows.Forms.FlowLayoutPanel();
            this.cboTipo = new System.Windows.Forms.ComboBox();
            this.lblDe = new System.Windows.Forms.Label();
            this.dtDe = new System.Windows.Forms.DateTimePicker();
            this.lblAte = new System.Windows.Forms.Label();
            this.dtAte = new System.Windows.Forms.DateTimePicker();
            this.lblTomador = new System.Windows.Forms.Label();
            this.cboCliente = new System.Windows.Forms.ComboBox();
            this.cboAmbiente = new System.Windows.Forms.ComboBox();
            this.btnGerar = new System.Windows.Forms.Button();
            this.pnlAcoes.SuspendLayout();
            this.pnlTopo.SuspendLayout();
            ((System.ComponentModel.ISupportInitialize)(this.grade)).BeginInit();
            this.SuspendLayout();
            // 
            // grade
            // 
            dataGridViewCellStyle1.BackColor = System.Drawing.Color.FromArgb(((int)(((byte)(247)))), ((int)(((byte)(249)))), ((int)(((byte)(251)))));
            dataGridViewCellStyle2.Alignment = System.Windows.Forms.DataGridViewContentAlignment.MiddleLeft;
            dataGridViewCellStyle2.BackColor = System.Drawing.Color.FromArgb(((int)(((byte)(24)))), ((int)(((byte)(78)))), ((int)(((byte)(119)))));
            dataGridViewCellStyle2.Font = new System.Drawing.Font("Segoe UI", 9F, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, ((byte)(0)));
            dataGridViewCellStyle2.ForeColor = System.Drawing.Color.White;
            dataGridViewCellStyle2.SelectionBackColor = System.Drawing.SystemColors.Highlight;
            dataGridViewCellStyle2.SelectionForeColor = System.Drawing.SystemColors.HighlightText;
            dataGridViewCellStyle2.WrapMode = System.Windows.Forms.DataGridViewTriState.True;
            this.grade.AllowUserToAddRows = false;
            this.grade.AllowUserToDeleteRows = false;
            this.grade.AllowUserToResizeRows = false;
            this.grade.AlternatingRowsDefaultCellStyle = dataGridViewCellStyle1;
            this.grade.AutoSizeColumnsMode = System.Windows.Forms.DataGridViewAutoSizeColumnsMode.DisplayedCells;
            this.grade.BackgroundColor = System.Drawing.Color.White;
            this.grade.BorderStyle = System.Windows.Forms.BorderStyle.None;
            this.grade.ColumnHeadersDefaultCellStyle = dataGridViewCellStyle2;
            this.grade.ColumnHeadersHeight = 28;
            this.grade.Dock = System.Windows.Forms.DockStyle.Fill;
            this.grade.EnableHeadersVisualStyles = false;
            this.grade.Location = new System.Drawing.Point(0, 88);
            this.grade.MultiSelect = false;
            this.grade.Name = "grade";
            this.grade.ReadOnly = true;
            this.grade.RowHeadersVisible = false;
            this.grade.SelectionMode = System.Windows.Forms.DataGridViewSelectionMode.FullRowSelect;
            this.grade.Size = new System.Drawing.Size(1100, 484);
            this.grade.DataBindingComplete += new System.Windows.Forms.DataGridViewBindingCompleteEventHandler(this.grade_DataBindingComplete);
            // 
            // lblTotais
            // 
            this.lblTotais.BackColor = System.Drawing.Color.FromArgb(((int)(((byte)(230)))), ((int)(((byte)(234)))), ((int)(((byte)(238)))));
            this.lblTotais.Dock = System.Windows.Forms.DockStyle.Bottom;
            this.lblTotais.Font = new System.Drawing.Font("Segoe UI", 9F, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, ((byte)(0)));
            this.lblTotais.Location = new System.Drawing.Point(0, 572);
            this.lblTotais.Name = "lblTotais";
            this.lblTotais.Padding = new System.Windows.Forms.Padding(8, 0, 0, 0);
            this.lblTotais.Size = new System.Drawing.Size(1100, 28);
            this.lblTotais.TextAlign = System.Drawing.ContentAlignment.MiddleLeft;
            // 
            // pnlAcoes
            // 
            this.pnlAcoes.Controls.Add(this.btnExportar);
            this.pnlAcoes.Controls.Add(this.btnImprimir);
            this.pnlAcoes.Dock = System.Windows.Forms.DockStyle.Top;
            this.pnlAcoes.Location = new System.Drawing.Point(0, 44);
            this.pnlAcoes.Name = "pnlAcoes";
            this.pnlAcoes.Padding = new System.Windows.Forms.Padding(4);
            this.pnlAcoes.Size = new System.Drawing.Size(1100, 44);
            this.pnlAcoes.WrapContents = false;
            // 
            // btnExportar
            // 
            this.btnExportar.AutoSize = true;
            this.btnExportar.FlatStyle = System.Windows.Forms.FlatStyle.System;
            this.btnExportar.Margin = new System.Windows.Forms.Padding(4);
            this.btnExportar.MinimumSize = new System.Drawing.Size(90, 30);
            this.btnExportar.Name = "btnExportar";
            this.btnExportar.Padding = new System.Windows.Forms.Padding(6, 0, 6, 0);
            this.btnExportar.Size = new System.Drawing.Size(90, 30);
            this.btnExportar.TabIndex = 0;
            this.btnExportar.Text = "Exportar CSV (Excel)";
            this.btnExportar.UseVisualStyleBackColor = true;
            this.btnExportar.Click += new System.EventHandler(this.btnExportar_Click);
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
            this.btnImprimir.TabIndex = 1;
            this.btnImprimir.Text = "Imprimir";
            this.btnImprimir.UseVisualStyleBackColor = true;
            this.btnImprimir.Click += new System.EventHandler(this.btnImprimir_Click);
            // 
            // pnlTopo
            // 
            this.pnlTopo.Controls.Add(this.cboTipo);
            this.pnlTopo.Controls.Add(this.lblDe);
            this.pnlTopo.Controls.Add(this.dtDe);
            this.pnlTopo.Controls.Add(this.lblAte);
            this.pnlTopo.Controls.Add(this.dtAte);
            this.pnlTopo.Controls.Add(this.lblTomador);
            this.pnlTopo.Controls.Add(this.cboCliente);
            this.pnlTopo.Controls.Add(this.cboAmbiente);
            this.pnlTopo.Controls.Add(this.btnGerar);
            this.pnlTopo.Dock = System.Windows.Forms.DockStyle.Top;
            this.pnlTopo.Location = new System.Drawing.Point(0, 0);
            this.pnlTopo.Name = "pnlTopo";
            this.pnlTopo.Padding = new System.Windows.Forms.Padding(4);
            this.pnlTopo.Size = new System.Drawing.Size(1100, 44);
            this.pnlTopo.WrapContents = false;
            // 
            // cboTipo
            // 
            this.cboTipo.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
            this.cboTipo.FormattingEnabled = true;
            this.cboTipo.Items.AddRange(new object[] {
});
            this.cboTipo.Margin = new System.Windows.Forms.Padding(4, 10, 2, 2);
            this.cboTipo.Name = "cboTipo";
            this.cboTipo.Size = new System.Drawing.Size(260, 23);
            this.cboTipo.TabIndex = 0;
            // 
            // lblDe
            // 
            this.lblDe.AutoSize = true;
            this.lblDe.Margin = new System.Windows.Forms.Padding(4, 10, 2, 2);
            this.lblDe.Name = "lblDe";
            this.lblDe.TabIndex = 1;
            this.lblDe.Text = "De:";
            // 
            // dtDe
            // 
            this.dtDe.Format = System.Windows.Forms.DateTimePickerFormat.Short;
            this.dtDe.Margin = new System.Windows.Forms.Padding(4, 10, 2, 2);
            this.dtDe.Name = "dtDe";
            this.dtDe.Size = new System.Drawing.Size(110, 23);
            this.dtDe.TabIndex = 2;
            // 
            // lblAte
            // 
            this.lblAte.AutoSize = true;
            this.lblAte.Margin = new System.Windows.Forms.Padding(4, 10, 2, 2);
            this.lblAte.Name = "lblAte";
            this.lblAte.TabIndex = 3;
            this.lblAte.Text = "Até:";
            // 
            // dtAte
            // 
            this.dtAte.Format = System.Windows.Forms.DateTimePickerFormat.Short;
            this.dtAte.Margin = new System.Windows.Forms.Padding(4, 10, 2, 2);
            this.dtAte.Name = "dtAte";
            this.dtAte.Size = new System.Drawing.Size(110, 23);
            this.dtAte.TabIndex = 4;
            // 
            // lblTomador
            // 
            this.lblTomador.AutoSize = true;
            this.lblTomador.Margin = new System.Windows.Forms.Padding(4, 10, 2, 2);
            this.lblTomador.Name = "lblTomador";
            this.lblTomador.TabIndex = 5;
            this.lblTomador.Text = "Tomador:";
            // 
            // cboCliente
            // 
            this.cboCliente.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
            this.cboCliente.FormattingEnabled = true;
            this.cboCliente.Items.AddRange(new object[] {
});
            this.cboCliente.Margin = new System.Windows.Forms.Padding(4, 10, 2, 2);
            this.cboCliente.Name = "cboCliente";
            this.cboCliente.Size = new System.Drawing.Size(260, 23);
            this.cboCliente.TabIndex = 6;
            // 
            // cboAmbiente
            // 
            this.cboAmbiente.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
            this.cboAmbiente.FormattingEnabled = true;
            this.cboAmbiente.Items.AddRange(new object[] {
            "1 - Produção",
            "2 - Homologação"});
            this.cboAmbiente.Margin = new System.Windows.Forms.Padding(4, 10, 2, 2);
            this.cboAmbiente.Name = "cboAmbiente";
            this.cboAmbiente.Size = new System.Drawing.Size(130, 23);
            this.cboAmbiente.TabIndex = 7;
            // 
            // btnGerar
            // 
            this.btnGerar.AutoSize = true;
            this.btnGerar.FlatStyle = System.Windows.Forms.FlatStyle.System;
            this.btnGerar.Margin = new System.Windows.Forms.Padding(4);
            this.btnGerar.MinimumSize = new System.Drawing.Size(90, 30);
            this.btnGerar.Name = "btnGerar";
            this.btnGerar.Padding = new System.Windows.Forms.Padding(6, 0, 6, 0);
            this.btnGerar.Size = new System.Drawing.Size(90, 30);
            this.btnGerar.TabIndex = 8;
            this.btnGerar.Text = "Gerar";
            this.btnGerar.UseVisualStyleBackColor = true;
            this.btnGerar.Click += new System.EventHandler(this.btnGerar_Click);
            // 
            // FrmRelatorios
            // 
            this.AutoScaleDimensions = new System.Drawing.SizeF(7F, 15F);
            this.AutoScaleMode = System.Windows.Forms.AutoScaleMode.Font;
            this.BackColor = System.Drawing.Color.FromArgb(((int)(((byte)(244)))), ((int)(((byte)(246)))), ((int)(((byte)(248)))));
            this.ClientSize = new System.Drawing.Size(1100, 600);
            this.Controls.Add(this.grade);
            this.Controls.Add(this.lblTotais);
            this.Controls.Add(this.pnlAcoes);
            this.Controls.Add(this.pnlTopo);
            this.Font = new System.Drawing.Font("Segoe UI", 9F, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, ((byte)(0)));
            this.KeyPreview = true;
            this.Name = "FrmRelatorios";
            this.StartPosition = System.Windows.Forms.FormStartPosition.CenterParent;
            this.Text = "Relatórios gerenciais";
            this.Load += new System.EventHandler(this.FrmRelatorios_Load);
            ((System.ComponentModel.ISupportInitialize)(this.grade)).EndInit();
            this.pnlTopo.ResumeLayout(false);
            this.pnlTopo.PerformLayout();
            this.pnlAcoes.ResumeLayout(false);
            this.pnlAcoes.PerformLayout();
            this.ResumeLayout(false);
            this.PerformLayout();
        }

        #endregion

        private System.Windows.Forms.DataGridView grade;
        private System.Windows.Forms.Label lblTotais;
        private System.Windows.Forms.FlowLayoutPanel pnlAcoes;
        private System.Windows.Forms.Button btnExportar;
        private System.Windows.Forms.Button btnImprimir;
        private System.Windows.Forms.FlowLayoutPanel pnlTopo;
        private System.Windows.Forms.ComboBox cboTipo;
        private System.Windows.Forms.Label lblDe;
        private System.Windows.Forms.DateTimePicker dtDe;
        private System.Windows.Forms.Label lblAte;
        private System.Windows.Forms.DateTimePicker dtAte;
        private System.Windows.Forms.Label lblTomador;
        private System.Windows.Forms.ComboBox cboCliente;
        private System.Windows.Forms.ComboBox cboAmbiente;
        private System.Windows.Forms.Button btnGerar;
    }
}
