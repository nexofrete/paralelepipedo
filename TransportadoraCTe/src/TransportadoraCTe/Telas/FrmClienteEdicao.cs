using System;
using System.Windows.Forms;
using TransportadoraCTe.Infra;
using TransportadoraCTe.Modelos;
using TransportadoraCTe.Repositorios;

namespace TransportadoraCTe.Telas
{
    public partial class FrmClienteEdicao : Form
    {
        private readonly Cliente cliente;
        private string cnpjConsultado;
        public int IdSalvo { get; private set; }

        public FrmClienteEdicao(int id)
        {
            InitializeComponent();
            Text = id == 0 ? "Novo cliente" : "Alterar cliente";
            cliente = id == 0 ? new Cliente() : ClienteRepo.Obter(id);
            if (cliente == null) cliente = new Cliente();
            UI.SelecionarPrimeiro(this);
            Preencher();
            cnpjConsultado = Util.SoNumeros(cliente.CpfCnpj);
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

        private void cboContrib_SelectedIndexChanged(object sender, EventArgs e)
        {
            txtIE.Enabled = UI.ItemCodigo(cboContrib) == "1";
            if (!txtIE.Enabled) txtIE.Text = UI.ItemCodigo(cboContrib) == "2" ? "ISENTO" : "";
        }

        private void cboTipo_SelectedIndexChanged(object sender, EventArgs e)
        {
            if (cliente != null && UI.ItemCodigo(cboTipo) == "F" && cliente.Id == 0) UI.SelecionarPorCodigo(cboContrib, "9");
        }

        /// <summary>Ao sair do campo CPF/CNPJ, consulta o CNPJ e preenche os dados da empresa.</summary>
        private void txtDoc_Leave(object sender, EventArgs e)
        {
            string cnpj = Util.SoNumeros(txtDoc.Text);
            if (cnpj.Length != 14 || cnpj == cnpjConsultado || !Util.CnpjValido(cnpj)) return;
            cnpjConsultado = cnpj;
            if (txtRazao.Text.Trim().Length > 0 &&
                !UI.Confirmar("Consultar o CNPJ e substituir os dados preenchidos pelos da Receita Federal?")) return;

            DadosCnpj d = null;
            if (!UI.Executar(this, delegate { d = ConsultaCnpj.Consultar(cnpj); })) return;

            UI.SelecionarPorCodigo(cboTipo, "J");
            txtDoc.Text = Util.FormatarDoc(cnpj);
            txtRazao.Text = Util.Texto(d.RazaoSocial, 60);
            txtFantasia.Text = Util.Texto(d.NomeFantasia, 60);
            txtLogradouro.Text = d.Endereco.Logradouro;
            txtNumero.Text = d.Endereco.Numero;
            txtCompl.Text = d.Endereco.Complemento;
            txtBairro.Text = d.Endereco.Bairro;
            txtCodMun.Text = d.Endereco.CodMunicipio;
            txtMunicipio.Text = d.Endereco.Municipio;
            UI.SelecionarPorCodigo(cboUF, d.Endereco.UF);
            txtCEP.Text = d.Endereco.CEP;
            if (!string.IsNullOrEmpty(d.Fone)) txtFone.Text = d.Fone;
            if (!string.IsNullOrEmpty(d.Email)) txtEmail.Text = d.Email;

            string aviso = "";
            if (!string.IsNullOrEmpty(d.IE))
            {
                UI.SelecionarPorCodigo(cboContrib, "1");
                txtIE.Text = d.IE;
            }
            else if (d.ConsultouIE)
            {
                UI.SelecionarPorCodigo(cboContrib, "9");
                aviso = "Nenhuma inscrição estadual ativa encontrada em " + d.Endereco.UF +
                        ". O indicador foi marcado como \"Não contribuinte\" - confira.";
            }
            else
                aviso = "A consulta não trouxe a inscrição estadual (fonte: " + d.Fonte + "). Preencha manualmente.";

            if (!string.IsNullOrEmpty(d.Situacao) && !d.Situacao.StartsWith("Ativa", StringComparison.OrdinalIgnoreCase))
                aviso = "Situação na Receita: " + d.Situacao + "\r\n\r\n" + aviso;
            if (aviso.Length > 0) UI.Info(aviso.Trim());
        }

        private void btnSalvar_Click(object sender, EventArgs e)
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

        private void btnCancelar_Click(object sender, EventArgs e)
        {
            Close();
        }
    }
}
