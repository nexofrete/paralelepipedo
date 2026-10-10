namespace TransportadoraCTe.Telas
{
    partial class FrmClientes
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
            this.pnlTopo = new System.Windows.Forms.FlowLayoutPanel();
            this.btnNovo = new System.Windows.Forms.Button();
            this.btnAlterar = new System.Windows.Forms.Button();
            this.btnExcluir = new System.Windows.Forms.Button();
            this.lblPesquisar = new System.Windows.Forms.Label();
            this.txtFiltro = new System.Windows.Forms.TextBox();
            this.btnPesquisar = new System.Windows.Forms.Button();
            this.chkAtivos = new System.Windows.Forms.CheckBox();
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
            this.grade.Location = new System.Drawing.Point(0, 44);
            this.grade.MultiSelect = false;
            this.grade.Name = "grade";
            this.grade.ReadOnly = true;
            this.grade.RowHeadersVisible = false;
            this.grade.SelectionMode = System.Windows.Forms.DataGridViewSelectionMode.FullRowSelect;
            this.grade.Size = new System.Drawing.Size(1000, 516);
            this.grade.DataBindingComplete += new System.Windows.Forms.DataGridViewBindingCompleteEventHandler(this.grade_DataBindingComplete);
            this.grade.CellDoubleClick += new System.Windows.Forms.DataGridViewCellEventHandler(this.grade_CellDoubleClick);
            // 
            // pnlTopo
            // 
            this.pnlTopo.Controls.Add(this.btnNovo);
            this.pnlTopo.Controls.Add(this.btnAlterar);
            this.pnlTopo.Controls.Add(this.btnExcluir);
            this.pnlTopo.Controls.Add(this.lblPesquisar);
            this.pnlTopo.Controls.Add(this.txtFiltro);
            this.pnlTopo.Controls.Add(this.btnPesquisar);
            this.pnlTopo.Controls.Add(this.chkAtivos);
            this.pnlTopo.Dock = System.Windows.Forms.DockStyle.Top;
            this.pnlTopo.Location = new System.Drawing.Point(0, 0);
            this.pnlTopo.Name = "pnlTopo";
            this.pnlTopo.Padding = new System.Windows.Forms.Padding(4);
            this.pnlTopo.Size = new System.Drawing.Size(1000, 44);
            this.pnlTopo.WrapContents = false;
            // 
            // btnNovo
            // 
            this.btnNovo.AutoSize = true;
            this.btnNovo.FlatStyle = System.Windows.Forms.FlatStyle.System;
            this.btnNovo.Margin = new System.Windows.Forms.Padding(4);
            this.btnNovo.MinimumSize = new System.Drawing.Size(90, 30);
            this.btnNovo.Name = "btnNovo";
            this.btnNovo.Padding = new System.Windows.Forms.Padding(6, 0, 6, 0);
            this.btnNovo.Size = new System.Drawing.Size(90, 30);
            this.btnNovo.TabIndex = 0;
            this.btnNovo.Text = "Novo";
            this.btnNovo.UseVisualStyleBackColor = true;
            this.btnNovo.Click += new System.EventHandler(this.btnNovo_Click);
            // 
            // btnAlterar
            // 
            this.btnAlterar.AutoSize = true;
            this.btnAlterar.FlatStyle = System.Windows.Forms.FlatStyle.System;
            this.btnAlterar.Margin = new System.Windows.Forms.Padding(4);
            this.btnAlterar.MinimumSize = new System.Drawing.Size(90, 30);
            this.btnAlterar.Name = "btnAlterar";
            this.btnAlterar.Padding = new System.Windows.Forms.Padding(6, 0, 6, 0);
            this.btnAlterar.Size = new System.Drawing.Size(90, 30);
            this.btnAlterar.TabIndex = 1;
            this.btnAlterar.Text = "Alterar";
            this.btnAlterar.UseVisualStyleBackColor = true;
            this.btnAlterar.Click += new System.EventHandler(this.btnAlterar_Click);
            // 
            // btnExcluir
            // 
            this.btnExcluir.AutoSize = true;
            this.btnExcluir.FlatStyle = System.Windows.Forms.FlatStyle.System;
            this.btnExcluir.Margin = new System.Windows.Forms.Padding(4);
            this.btnExcluir.MinimumSize = new System.Drawing.Size(90, 30);
            this.btnExcluir.Name = "btnExcluir";
            this.btnExcluir.Padding = new System.Windows.Forms.Padding(6, 0, 6, 0);
            this.btnExcluir.Size = new System.Drawing.Size(90, 30);
            this.btnExcluir.TabIndex = 2;
            this.btnExcluir.Text = "Excluir";
            this.btnExcluir.UseVisualStyleBackColor = true;
            this.btnExcluir.Click += new System.EventHandler(this.btnExcluir_Click);
            // 
            // lblPesquisar
            // 
            this.lblPesquisar.AutoSize = true;
            this.lblPesquisar.Margin = new System.Windows.Forms.Padding(16, 11, 0, 0);
            this.lblPesquisar.Name = "lblPesquisar";
            this.lblPesquisar.TabIndex = 3;
            this.lblPesquisar.Text = "Pesquisar (nome ou CPF/CNPJ):";
            // 
            // txtFiltro
            // 
            this.txtFiltro.Margin = new System.Windows.Forms.Padding(4, 8, 4, 4);
            this.txtFiltro.MaxLength = 60;
            this.txtFiltro.Name = "txtFiltro";
            this.txtFiltro.Size = new System.Drawing.Size(260, 23);
            this.txtFiltro.TabIndex = 4;
            this.txtFiltro.KeyDown += new System.Windows.Forms.KeyEventHandler(this.txtFiltro_KeyDown);
            // 
            // btnPesquisar
            // 
            this.btnPesquisar.AutoSize = true;
            this.btnPesquisar.FlatStyle = System.Windows.Forms.FlatStyle.System;
            this.btnPesquisar.Margin = new System.Windows.Forms.Padding(4);
            this.btnPesquisar.MinimumSize = new System.Drawing.Size(90, 30);
            this.btnPesquisar.Name = "btnPesquisar";
            this.btnPesquisar.Padding = new System.Windows.Forms.Padding(6, 0, 6, 0);
            this.btnPesquisar.Size = new System.Drawing.Size(90, 30);
            this.btnPesquisar.TabIndex = 5;
            this.btnPesquisar.Text = "Pesquisar";
            this.btnPesquisar.UseVisualStyleBackColor = true;
            this.btnPesquisar.Click += new System.EventHandler(this.btnPesquisar_Click);
            // 
            // chkAtivos
            // 
            this.chkAtivos.AutoSize = true;
            this.chkAtivos.Checked = true;
            this.chkAtivos.CheckState = System.Windows.Forms.CheckState.Checked;
            this.chkAtivos.Margin = new System.Windows.Forms.Padding(8, 10, 4, 4);
            this.chkAtivos.Name = "chkAtivos";
            this.chkAtivos.TabIndex = 6;
            this.chkAtivos.Text = "Somente ativos";
            this.chkAtivos.UseVisualStyleBackColor = true;
            // 
            // FrmClientes
            // 
            this.AutoScaleDimensions = new System.Drawing.SizeF(7F, 15F);
            this.AutoScaleMode = System.Windows.Forms.AutoScaleMode.Font;
            this.BackColor = System.Drawing.Color.FromArgb(((int)(((byte)(244)))), ((int)(((byte)(246)))), ((int)(((byte)(248)))));
            this.ClientSize = new System.Drawing.Size(1000, 560);
            this.Controls.Add(this.grade);
            this.Controls.Add(this.pnlTopo);
            this.Font = new System.Drawing.Font("Segoe UI", 9F, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, ((byte)(0)));
            this.KeyPreview = true;
            this.Name = "FrmClientes";
            this.StartPosition = System.Windows.Forms.FormStartPosition.CenterParent;
            this.Text = "Cadastro de clientes";
            this.Load += new System.EventHandler(this.FrmClientes_Load);
            ((System.ComponentModel.ISupportInitialize)(this.grade)).EndInit();
            this.pnlTopo.ResumeLayout(false);
            this.pnlTopo.PerformLayout();
            this.ResumeLayout(false);
            this.PerformLayout();
        }

        #endregion

        private System.Windows.Forms.DataGridView grade;
        private System.Windows.Forms.FlowLayoutPanel pnlTopo;
        private System.Windows.Forms.Button btnNovo;
        private System.Windows.Forms.Button btnAlterar;
        private System.Windows.Forms.Button btnExcluir;
        private System.Windows.Forms.Label lblPesquisar;
        private System.Windows.Forms.TextBox txtFiltro;
        private System.Windows.Forms.Button btnPesquisar;
        private System.Windows.Forms.CheckBox chkAtivos;
    }
}
