using System;
using System.Security.Cryptography.X509Certificates;
using System.Windows.Forms;
using TransportadoraCTe.CTe;
using TransportadoraCTe.Infra;
using TransportadoraCTe.Modelos;
using TransportadoraCTe.Repositorios;

namespace TransportadoraCTe.Telas
{
    /// <summary>Dados do emitente (transportadora), parametros do CT-e e certificado digital.</summary>
    public partial class FrmEmpresa : Form
    {
        private Empresa emp;
        private string thumbprint;

        public FrmEmpresa()
        {
            InitializeComponent();
            UI.SelecionarPrimeiro(this);
        }

        private void FrmEmpresa_Load(object sender, EventArgs e)
        {
            Carregar();
        }

        private void Carregar()
        {
            UI.Executar(this, delegate { emp = EmpresaRepo.Obter(); });
            if (emp == null)
            {
                emp = new Empresa();
                emp.Endereco.UF = "RJ";
            }
            txtCNPJ.Text = Util.FormatarDoc(emp.CNPJ);
            txtIE.Text = emp.IE;
            txtRazao.Text = emp.RazaoSocial;
            txtFantasia.Text = emp.NomeFantasia;
            txtRNTRC.Text = emp.RNTRC;
            UI.SelecionarPorCodigo(cboCRT, emp.CRT.ToString());
            txtLogradouro.Text = emp.Endereco.Logradouro;
            txtNumero.Text = emp.Endereco.Numero;
            txtCompl.Text = emp.Endereco.Complemento;
            txtBairro.Text = emp.Endereco.Bairro;
            txtCodMun.Text = emp.Endereco.CodMunicipio;
            txtMunicipio.Text = emp.Endereco.Municipio;
            UI.SelecionarPorCodigo(cboUF, emp.Endereco.UF ?? "RJ");
            txtCEP.Text = emp.Endereco.CEP;
            txtFone.Text = emp.Fone;
            txtEmail.Text = emp.Email;
            UI.SelecionarPorCodigo(cboAmbiente, emp.Ambiente.ToString());
            numSerie.Value = emp.SerieCTe;
            numProximo.Value = Math.Max(1, emp.ProximoNumero);
            thumbprint = emp.CertThumbprint;
            txtRtCNPJ.Text = emp.RespTecCNPJ;
            txtRtContato.Text = emp.RespTecContato;
            txtRtEmail.Text = emp.RespTecEmail;
            txtRtFone.Text = emp.RespTecFone;
            MostrarCertificado();
        }

        private void MostrarCertificado()
        {
            if (string.IsNullOrEmpty(thumbprint)) { txtCert.Text = "(nenhum certificado selecionado)"; return; }
            try { txtCert.Text = Certificado.Descrever(Certificado.Obter(thumbprint)); }
            catch (Exception ex) { txtCert.Text = ex.Message; }
        }

        private void btnSelecionarCert_Click(object sender, EventArgs e)
        {
            X509Certificate2 c = null;
            if (!UI.Executar(this, delegate { c = Certificado.Selecionar(); }) || c == null) return;
            thumbprint = c.Thumbprint;
            MostrarCertificado();
            string cnpjTela = Util.SoNumeros(txtCNPJ.Text);
            if (cnpjTela.Length == 14 && c.Subject.IndexOf(cnpjTela) < 0)
                UI.Info("Atenção: o CNPJ " + Util.FormatarDoc(cnpjTela) + " não aparece no certificado selecionado.\r\n" +
                        "O certificado deve ser da própria empresa emitente (mesma raiz de CNPJ).");
        }

        private void btnSalvar_Click(object sender, EventArgs e)
        {
            emp.CNPJ = txtCNPJ.Text;
            emp.IE = txtIE.Text;
            emp.RazaoSocial = txtRazao.Text;
            emp.NomeFantasia = txtFantasia.Text;
            emp.RNTRC = txtRNTRC.Text;
            emp.CRT = int.Parse(UI.ItemCodigo(cboCRT));
            emp.Endereco.Logradouro = txtLogradouro.Text;
            emp.Endereco.Numero = txtNumero.Text;
            emp.Endereco.Complemento = txtCompl.Text;
            emp.Endereco.Bairro = txtBairro.Text;
            emp.Endereco.CodMunicipio = txtCodMun.Text;
            emp.Endereco.Municipio = txtMunicipio.Text;
            emp.Endereco.UF = cboUF.Text;
            emp.Endereco.CEP = txtCEP.Text;
            emp.Fone = txtFone.Text;
            emp.Email = txtEmail.Text;
            int ambienteAntes = emp.Ambiente;
            emp.Ambiente = int.Parse(UI.ItemCodigo(cboAmbiente));
            emp.SerieCTe = (int)numSerie.Value;
            emp.ProximoNumero = (int)numProximo.Value;
            emp.CertThumbprint = thumbprint;
            emp.RespTecCNPJ = txtRtCNPJ.Text;
            emp.RespTecContato = txtRtContato.Text;
            emp.RespTecEmail = txtRtEmail.Text;
            emp.RespTecFone = txtRtFone.Text;

            if (emp.Ambiente == 1 && ambienteAntes != 1 &&
                !UI.Confirmar("Você está mudando para PRODUÇÃO. Os CT-es emitidos terão valor fiscal.\r\n" +
                              "Confira também o próximo número da série. Confirmar?"))
                return;

            if (UI.Executar(this, delegate { EmpresaRepo.Salvar(emp); }))
                UI.Info("Dados da empresa salvos.");
        }

        private void btnTestarSefaz_Click(object sender, EventArgs e)
        {
            ResultadoSefaz r = null;
            if (UI.Executar(this, delegate { r = CteServico.StatusServico(); }))
                MessageBox.Show(r.ToString(), "Status SEFAZ", MessageBoxButtons.OK,
                    r.Sucesso ? MessageBoxIcon.Information : MessageBoxIcon.Warning);
        }

        private void btnFechar_Click(object sender, EventArgs e)
        {
            Close();
        }
    }
}
