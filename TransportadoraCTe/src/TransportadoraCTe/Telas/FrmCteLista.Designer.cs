namespace TransportadoraCTe.Telas
{
    partial class FrmCteLista
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
            this.pnlAcoes = new System.Windows.Forms.FlowLayoutPanel();
            this.btnNovo = new System.Windows.Forms.Button();
            this.btnEditar = new System.Windows.Forms.Button();
            this.btnEnviar = new System.Windows.Forms.Button();
            this.btnConsultar = new System.Windows.Forms.Button();
            this.btnCancelar = new System.Windows.Forms.Button();
            this.btnExcluir = new System.Windows.Forms.Button();
            this.btnDacte = new System.Windows.Forms.Button();
            this.btnSalvarXml = new System.Windows.Forms.Button();
            this.pnlFiltros = new System.Windows.Forms.FlowLayoutPanel();
            this.lblDe = new System.Windows.Forms.Label();
            this.dtDe = new System.Windows.Forms.DateTimePicker();
            this.lblAte = new System.Windows.Forms.Label();
            this.dtAte = new System.Windows.Forms.DateTimePicker();
            this.lblStatus = new System.Windows.Forms.Label();
            this.cboStatus = new System.Windows.Forms.ComboBox();
            this.lblTexto = new System.Windows.Forms.Label();
            this.txtTexto = new System.Windows.Forms.TextBox();
            this.btnPesquisar = new System.Windows.Forms.Button();
            this.pnlAcoes.SuspendLayout();
            this.pnlFiltros.SuspendLayout();
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
            this.grade.Size = new System.Drawing.Size(1100, 512);
            this.grade.DataBindingComplete += new System.Windows.Forms.DataGridViewBindingCompleteEventHandler(this.grade_DataBindingComplete);
            this.grade.CellDoubleClick += new System.Windows.Forms.DataGridViewCellEventHandler(this.grade_CellDoubleClick);
            this.grade.CellFormatting += new System.Windows.Forms.DataGridViewCellFormattingEventHandler(this.grade_CellFormatting);
            // 
            // pnlAcoes
            // 
            this.pnlAcoes.Controls.Add(this.btnNovo);
            this.pnlAcoes.Controls.Add(this.btnEditar);
            this.pnlAcoes.Controls.Add(this.btnEnviar);
            this.pnlAcoes.Controls.Add(this.btnConsultar);
            this.pnlAcoes.Controls.Add(this.btnCancelar);
            this.pnlAcoes.Controls.Add(this.btnExcluir);
            this.pnlAcoes.Controls.Add(this.btnDacte);
            this.pnlAcoes.Controls.Add(this.btnSalvarXml);
            this.pnlAcoes.Dock = System.Windows.Forms.DockStyle.Top;
            this.pnlAcoes.Location = new System.Drawing.Point(0, 44);
            this.pnlAcoes.Name = "pnlAcoes";
            this.pnlAcoes.Padding = new System.Windows.Forms.Padding(4);
            this.pnlAcoes.Size = new System.Drawing.Size(1100, 44);
            this.pnlAcoes.WrapContents = false;
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
            // btnEditar
            // 
            this.btnEditar.AutoSize = true;
            this.btnEditar.FlatStyle = System.Windows.Forms.FlatStyle.System;
            this.btnEditar.Margin = new System.Windows.Forms.Padding(4);
            this.btnEditar.MinimumSize = new System.Drawing.Size(90, 30);
            this.btnEditar.Name = "btnEditar";
            this.btnEditar.Padding = new System.Windows.Forms.Padding(6, 0, 6, 0);
            this.btnEditar.Size = new System.Drawing.Size(90, 30);
            this.btnEditar.TabIndex = 1;
            this.btnEditar.Text = "Editar";
            this.btnEditar.UseVisualStyleBackColor = true;
            this.btnEditar.Click += new System.EventHandler(this.btnEditar_Click);
            // 
            // btnEnviar
            // 
            this.btnEnviar.AutoSize = true;
            this.btnEnviar.FlatStyle = System.Windows.Forms.FlatStyle.System;
            this.btnEnviar.Margin = new System.Windows.Forms.Padding(4);
            this.btnEnviar.MinimumSize = new System.Drawing.Size(90, 30);
            this.btnEnviar.Name = "btnEnviar";
            this.btnEnviar.Padding = new System.Windows.Forms.Padding(6, 0, 6, 0);
            this.btnEnviar.Size = new System.Drawing.Size(90, 30);
            this.btnEnviar.TabIndex = 2;
            this.btnEnviar.Text = "Enviar à SEFAZ";
            this.btnEnviar.UseVisualStyleBackColor = true;
            this.btnEnviar.Click += new System.EventHandler(this.btnEnviar_Click);
            // 
            // btnConsultar
            // 
            this.btnConsultar.AutoSize = true;
            this.btnConsultar.FlatStyle = System.Windows.Forms.FlatStyle.System;
            this.btnConsultar.Margin = new System.Windows.Forms.Padding(4);
            this.btnConsultar.MinimumSize = new System.Drawing.Size(90, 30);
            this.btnConsultar.Name = "btnConsultar";
            this.btnConsultar.Padding = new System.Windows.Forms.Padding(6, 0, 6, 0);
            this.btnConsultar.Size = new System.Drawing.Size(90, 30);
            this.btnConsultar.TabIndex = 3;
            this.btnConsultar.Text = "Consultar SEFAZ";
            this.btnConsultar.UseVisualStyleBackColor = true;
            this.btnConsultar.Click += new System.EventHandler(this.btnConsultar_Click);
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
            this.btnCancelar.TabIndex = 4;
            this.btnCancelar.Text = "Cancelar CT-e";
            this.btnCancelar.UseVisualStyleBackColor = true;
            this.btnCancelar.Click += new System.EventHandler(this.btnCancelar_Click);
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
            this.btnExcluir.TabIndex = 5;
            this.btnExcluir.Text = "Excluir rascunho";
            this.btnExcluir.UseVisualStyleBackColor = true;
            this.btnExcluir.Click += new System.EventHandler(this.btnExcluir_Click);
            // 
            // btnDacte
            // 
            this.btnDacte.AutoSize = true;
            this.btnDacte.FlatStyle = System.Windows.Forms.FlatStyle.System;
            this.btnDacte.Margin = new System.Windows.Forms.Padding(4);
            this.btnDacte.MinimumSize = new System.Drawing.Size(90, 30);
            this.btnDacte.Name = "btnDacte";
            this.btnDacte.Padding = new System.Windows.Forms.Padding(6, 0, 6, 0);
            this.btnDacte.Size = new System.Drawing.Size(90, 30);
            this.btnDacte.TabIndex = 6;
            this.btnDacte.Text = "DACTE";
            this.btnDacte.UseVisualStyleBackColor = true;
            this.btnDacte.Click += new System.EventHandler(this.btnDacte_Click);
            // 
            // btnSalvarXml
            // 
            this.btnSalvarXml.AutoSize = true;
            this.btnSalvarXml.FlatStyle = System.Windows.Forms.FlatStyle.System;
            this.btnSalvarXml.Margin = new System.Windows.Forms.Padding(4);
            this.btnSalvarXml.MinimumSize = new System.Drawing.Size(90, 30);
            this.btnSalvarXml.Name = "btnSalvarXml";
            this.btnSalvarXml.Padding = new System.Windows.Forms.Padding(6, 0, 6, 0);
            this.btnSalvarXml.Size = new System.Drawing.Size(90, 30);
            this.btnSalvarXml.TabIndex = 7;
            this.btnSalvarXml.Text = "Salvar XML";
            this.btnSalvarXml.UseVisualStyleBackColor = true;
            this.btnSalvarXml.Click += new System.EventHandler(this.btnSalvarXml_Click);
            // 
            // pnlFiltros
            // 
            this.pnlFiltros.Controls.Add(this.lblDe);
            this.pnlFiltros.Controls.Add(this.dtDe);
            this.pnlFiltros.Controls.Add(this.lblAte);
            this.pnlFiltros.Controls.Add(this.dtAte);
            this.pnlFiltros.Controls.Add(this.lblStatus);
            this.pnlFiltros.Controls.Add(this.cboStatus);
            this.pnlFiltros.Controls.Add(this.lblTexto);
            this.pnlFiltros.Controls.Add(this.txtTexto);
            this.pnlFiltros.Controls.Add(this.btnPesquisar);
            this.pnlFiltros.Dock = System.Windows.Forms.DockStyle.Top;
            this.pnlFiltros.Location = new System.Drawing.Point(0, 0);
            this.pnlFiltros.Name = "pnlFiltros";
            this.pnlFiltros.Padding = new System.Windows.Forms.Padding(4);
            this.pnlFiltros.Size = new System.Drawing.Size(1100, 44);
            this.pnlFiltros.WrapContents = false;
            // 
            // lblDe
            // 
            this.lblDe.AutoSize = true;
            this.lblDe.Margin = new System.Windows.Forms.Padding(4, 10, 2, 2);
            this.lblDe.Name = "lblDe";
            this.lblDe.TabIndex = 0;
            this.lblDe.Text = "De:";
            // 
            // dtDe
            // 
            this.dtDe.Format = System.Windows.Forms.DateTimePickerFormat.Short;
            this.dtDe.Margin = new System.Windows.Forms.Padding(4, 10, 2, 2);
            this.dtDe.Name = "dtDe";
            this.dtDe.Size = new System.Drawing.Size(110, 23);
            this.dtDe.TabIndex = 1;
            // 
            // lblAte
            // 
            this.lblAte.AutoSize = true;
            this.lblAte.Margin = new System.Windows.Forms.Padding(4, 10, 2, 2);
            this.lblAte.Name = "lblAte";
            this.lblAte.TabIndex = 2;
            this.lblAte.Text = "Até:";
            // 
            // dtAte
            // 
            this.dtAte.Format = System.Windows.Forms.DateTimePickerFormat.Short;
            this.dtAte.Margin = new System.Windows.Forms.Padding(4, 10, 2, 2);
            this.dtAte.Name = "dtAte";
            this.dtAte.Size = new System.Drawing.Size(110, 23);
            this.dtAte.TabIndex = 3;
            // 
            // lblStatus
            // 
            this.lblStatus.AutoSize = true;
            this.lblStatus.Margin = new System.Windows.Forms.Padding(4, 10, 2, 2);
            this.lblStatus.Name = "lblStatus";
            this.lblStatus.TabIndex = 4;
            this.lblStatus.Text = "Status:";
            // 
            // cboStatus
            // 
            this.cboStatus.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
            this.cboStatus.FormattingEnabled = true;
            this.cboStatus.Items.AddRange(new object[] {
            "(todos)",
            "DIGITACAO",
            "AUTORIZADO",
            "REJEITADO",
            "CANCELADO",
            "DENEGADO"});
            this.cboStatus.Margin = new System.Windows.Forms.Padding(4, 10, 2, 2);
            this.cboStatus.Name = "cboStatus";
            this.cboStatus.Size = new System.Drawing.Size(120, 23);
            this.cboStatus.TabIndex = 5;
            // 
            // lblTexto
            // 
            this.lblTexto.AutoSize = true;
            this.lblTexto.Margin = new System.Windows.Forms.Padding(4, 10, 2, 2);
            this.lblTexto.Name = "lblTexto";
            this.lblTexto.TabIndex = 6;
            this.lblTexto.Text = "Cliente/nº/chave:";
            // 
            // txtTexto
            // 
            this.txtTexto.Margin = new System.Windows.Forms.Padding(4, 10, 2, 2);
            this.txtTexto.MaxLength = 60;
            this.txtTexto.Name = "txtTexto";
            this.txtTexto.Size = new System.Drawing.Size(200, 23);
            this.txtTexto.TabIndex = 7;
            this.txtTexto.KeyDown += new System.Windows.Forms.KeyEventHandler(this.txtTexto_KeyDown);
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
            this.btnPesquisar.TabIndex = 8;
            this.btnPesquisar.Text = "Pesquisar";
            this.btnPesquisar.UseVisualStyleBackColor = true;
            this.btnPesquisar.Click += new System.EventHandler(this.btnPesquisar_Click);
            // 
            // FrmCteLista
            // 
            this.AutoScaleDimensions = new System.Drawing.SizeF(7F, 15F);
            this.AutoScaleMode = System.Windows.Forms.AutoScaleMode.Font;
            this.BackColor = System.Drawing.Color.FromArgb(((int)(((byte)(244)))), ((int)(((byte)(246)))), ((int)(((byte)(248)))));
            this.ClientSize = new System.Drawing.Size(1100, 600);
            this.Controls.Add(this.grade);
            this.Controls.Add(this.pnlAcoes);
            this.Controls.Add(this.pnlFiltros);
            this.Font = new System.Drawing.Font("Segoe UI", 9F, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, ((byte)(0)));
            this.KeyPreview = true;
            this.Name = "FrmCteLista";
            this.StartPosition = System.Windows.Forms.FormStartPosition.CenterParent;
            this.Text = "Gerenciar CT-es";
            this.Load += new System.EventHandler(this.FrmCteLista_Load);
            ((System.ComponentModel.ISupportInitialize)(this.grade)).EndInit();
            this.pnlFiltros.ResumeLayout(false);
            this.pnlFiltros.PerformLayout();
            this.pnlAcoes.ResumeLayout(false);
            this.pnlAcoes.PerformLayout();
            this.ResumeLayout(false);
            this.PerformLayout();
        }

        #endregion

        private System.Windows.Forms.DataGridView grade;
        private System.Windows.Forms.FlowLayoutPanel pnlAcoes;
        private System.Windows.Forms.Button btnNovo;
        private System.Windows.Forms.Button btnEditar;
        private System.Windows.Forms.Button btnEnviar;
        private System.Windows.Forms.Button btnConsultar;
        private System.Windows.Forms.Button btnCancelar;
        private System.Windows.Forms.Button btnExcluir;
        private System.Windows.Forms.Button btnDacte;
        private System.Windows.Forms.Button btnSalvarXml;
        private System.Windows.Forms.FlowLayoutPanel pnlFiltros;
        private System.Windows.Forms.Label lblDe;
        private System.Windows.Forms.DateTimePicker dtDe;
        private System.Windows.Forms.Label lblAte;
        private System.Windows.Forms.DateTimePicker dtAte;
        private System.Windows.Forms.Label lblStatus;
        private System.Windows.Forms.ComboBox cboStatus;
        private System.Windows.Forms.Label lblTexto;
        private System.Windows.Forms.TextBox txtTexto;
        private System.Windows.Forms.Button btnPesquisar;
    }
}
