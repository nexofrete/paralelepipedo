using System;
using System.Windows.Forms;
using TransportadoraCTe.Infra;
using TransportadoraCTe.Modelos;
using TransportadoraCTe.Repositorios;

namespace TransportadoraCTe.Telas
{
    public class FrmClientes : Form
    {
        private readonly DataGridView grade = UI.Grade();
        private readonly TextBox txtFiltro = UI.Texto(60);
        private readonly CheckBox chkAtivos = new CheckBox();

        public FrmClientes()
        {
            UI.PrepararForm(this, "Cadastro de clientes", 1000, 560);
            txtFiltro.Width = 260;
            txtFiltro.Margin = new Padding(4, 8, 4, 4);
            chkAtivos.Text = "Somente ativos";
            chkAtivos.Checked = true;
            chkAtivos.AutoSize = true;
            chkAtivos.Margin = new Padding(8, 10, 4, 4);
            Label l = new Label();
            l.Text = "Pesquisar (nome ou CPF/CNPJ):";
            l.AutoSize = true;
            l.Margin = new Padding(16, 11, 0, 0);

            bool podeEditar = Sessao.Usuario.PodeEmitir;
            Button novo = UI.Botao("Novo", delegate { Editar(0); });
            Button alterar = UI.Botao("Alterar", delegate { int id = UI.IdSelecionado(grade); if (id > 0) Editar(id); });
            Button excluir = UI.Botao("Excluir", Excluir);
            novo.Enabled = alterar.Enabled = excluir.Enabled = podeEditar;

            Controls.Add(grade);
            Controls.Add(UI.Topo(novo, alterar, excluir, l, txtFiltro, UI.Botao("Pesquisar", delegate { Carregar(); }), chkAtivos));

            txtFiltro.KeyDown += delegate(object s, KeyEventArgs e) { if (e.KeyCode == Keys.Enter) { Carregar(); e.SuppressKeyPress = true; } };
            grade.CellDoubleClick += delegate(object s, DataGridViewCellEventArgs e)
            {
                if (e.RowIndex >= 0 && podeEditar) Editar(UI.IdSelecionado(grade));
            };
            Load += delegate { Carregar(); };
        }

        private void Carregar()
        {
            UI.Executar(this, delegate { grade.DataSource = ClienteRepo.Pesquisar(txtFiltro.Text, chkAtivos.Checked); });
        }

        private void Editar(int id)
        {
            using (FrmClienteEdicao f = new FrmClienteEdicao(id))
                if (f.ShowDialog(this) == DialogResult.OK) Carregar();
        }

        private void Excluir(object sender, EventArgs e)
        {
            int id = UI.IdSelecionado(grade);
            if (id == 0 || !UI.Confirmar("Excluir o cliente selecionado?")) return;
            UI.Executar(this, delegate { ClienteRepo.Excluir(id); });
            Carregar();
        }
    }

    public class FrmClienteEdicao : Form
    {
        private readonly Cliente cliente;
        public int IdSalvo { get; private set; }

        private readonly ComboBox cboTipo = UI.Combo("J - Pessoa jurídica", "F - Pessoa física");
        private readonly TextBox txtDoc = UI.Texto(18);
        private readonly ComboBox cboContrib = UI.Combo("1 - Contribuinte ICMS", "2 - Contribuinte isento", "9 - Não contribuinte");
        private readonly TextBox txtIE = UI.Texto(14);
        private readonly TextBox txtRazao = UI.Texto(60);
        private readonly TextBox txtFantasia = UI.Texto(60);
        private readonly TextBox txtLogradouro = UI.Texto(255);
        private readonly TextBox txtNumero = UI.Texto(60);
        private readonly TextBox txtCompl = UI.Texto(60);
        private readonly TextBox txtBairro = UI.Texto(60);
        private readonly TextBox txtCodMun = UI.Numero(7);
        private readonly TextBox txtMunicipio = UI.Texto(60);
        private readonly ComboBox cboUF = UI.Combo(Util.UFs);
        private readonly TextBox txtCEP = UI.Texto(9);
        private readonly TextBox txtFone = UI.Texto(15);
        private readonly TextBox txtEmail = UI.Texto(60);
        private readonly CheckBox chkAtivo = new CheckBox();

        public FrmClienteEdicao(int id)
        {
            UI.PrepararDialogo(this, id == 0 ? "Novo cliente" : "Alterar cliente", 700, 420);
            cliente = id == 0 ? new Cliente() : ClienteRepo.Obter(id);
            if (cliente == null) cliente = new Cliente();

            chkAtivo.Text = "Cliente ativo";
            chkAtivo.AutoSize = true;
            chkAtivo.Margin = new Padding(6, 24, 4, 4);

            FlowLayoutPanel f = UI.Fluxo();
            UI.Secao(f, "Identificação");
            UI.Adicionar(f, "Tipo", cboTipo, 160, false);
            UI.Adicionar(f, "CPF / CNPJ", txtDoc, 160, false);
            UI.Adicionar(f, "Indicador IE", cboContrib, 180, false);
            UI.Adicionar(f, "Inscrição estadual", txtIE, 130, true);
            UI.Adicionar(f, "Razão social / Nome", txtRazao, 400, false);
            UI.Adicionar(f, "Nome fantasia", txtFantasia, 240, true);
            UI.Secao(f, "Endereço");
            UI.Adicionar(f, "Logradouro", txtLogradouro, 400, false);
            UI.Adicionar(f, "Número", txtNumero, 80, false);
            UI.Adicionar(f, "Complemento", txtCompl, 150, true);
            UI.Adicionar(f, "Bairro", txtBairro, 200, false);
            UI.Adicionar(f, "Cód. IBGE município", txtCodMun, 120, false);
            UI.Adicionar(f, "Município", txtMunicipio, 200, false);
            UI.Adicionar(f, "UF", cboUF, 60, false);
            UI.Adicionar(f, "CEP", txtCEP, 50, true);
            UI.Secao(f, "Contato");
            UI.Adicionar(f, "Telefone", txtFone, 140, false);
            UI.Adicionar(f, "E-mail", txtEmail, 300, false);
            f.Controls.Add(chkAtivo);

            Button salvar = UI.Botao("Salvar", Salvar);
            Controls.Add(f);
            Controls.Add(UI.Rodape(salvar, UI.Botao("Cancelar", delegate { Close(); })));
            AcceptButton = salvar;

            cboContrib.SelectedIndexChanged += delegate
            {
                txtIE.Enabled = UI.ItemCodigo(cboContrib) == "1";
                if (!txtIE.Enabled) txtIE.Text = UI.ItemCodigo(cboContrib) == "2" ? "ISENTO" : "";
            };
            cboTipo.SelectedIndexChanged += delegate
            {
                if (UI.ItemCodigo(cboTipo) == "F" && cliente.Id == 0) UI.SelecionarPorCodigo(cboContrib, "9");
            };

            Preencher();
        }

        private void Preencher()
        {
            Cliente c = cliente;
            UI.SelecionarPorCodigo(cboTipo, c.TipoPessoa);
            UI.SelecionarPorCodigo(cboContrib, c.Contribuinte.ToString());
            UI.SelecionarPorCodigo(cboUF, string.IsNullOrEmpty(c.Endereco.UF) ? "RJ" : c.Endereco.UF);
            chkAtivo.Checked = c.Ativo;
            if (c.Id == 0) return;
            txtDoc.Text = Util.FormatarDoc(c.CpfCnpj);
            txtIE.Text = c.IE;
            txtRazao.Text = c.RazaoSocial;
            txtFantasia.Text = c.NomeFantasia;
            txtLogradouro.Text = c.Endereco.Logradouro;
            txtNumero.Text = c.Endereco.Numero;
            txtCompl.Text = c.Endereco.Complemento;
            txtBairro.Text = c.Endereco.Bairro;
            txtCodMun.Text = c.Endereco.CodMunicipio;
            txtMunicipio.Text = c.Endereco.Municipio;
            txtCEP.Text = c.Endereco.CEP;
            txtFone.Text = c.Fone;
            txtEmail.Text = c.Email;
        }

        private void Salvar(object sender, EventArgs e)
        {
            Cliente c = cliente;
            c.TipoPessoa = UI.ItemCodigo(cboTipo);
            c.CpfCnpj = txtDoc.Text;
            c.Contribuinte = int.Parse(UI.ItemCodigo(cboContrib));
            c.IE = txtIE.Text;
            c.RazaoSocial = txtRazao.Text;
            c.NomeFantasia = txtFantasia.Text;
            c.Endereco.Logradouro = txtLogradouro.Text;
            c.Endereco.Numero = txtNumero.Text;
            c.Endereco.Complemento = txtCompl.Text;
            c.Endereco.Bairro = txtBairro.Text;
            c.Endereco.CodMunicipio = txtCodMun.Text;
            c.Endereco.Municipio = txtMunicipio.Text;
            c.Endereco.UF = cboUF.Text;
            c.Endereco.CEP = txtCEP.Text;
            c.Fone = txtFone.Text;
            c.Email = txtEmail.Text;
            c.Ativo = chkAtivo.Checked;
            if (UI.Executar(this, delegate { IdSalvo = ClienteRepo.Salvar(c); }))
                DialogResult = DialogResult.OK;
        }
    }
}
