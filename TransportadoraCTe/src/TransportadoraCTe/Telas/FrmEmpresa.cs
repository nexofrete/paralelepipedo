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
        private string cnpjConsultado;

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
            cnpjConsultado = Util.SoNumeros(emp.CNPJ);
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

        /// <summary>Ao sair do campo CNPJ, consulta o CNPJ e preenche os dados da transportadora.</summary>
        private void txtCNPJ_Leave(object sender, EventArgs e)
        {
            string cnpj = Util.SoNumeros(txtCNPJ.Text);
            if (cnpj.Length != 14 || cnpj == cnpjConsultado || !Util.CnpjValido(cnpj)) return;
            cnpjConsultado = cnpj;
            if (txtRazao.Text.Trim().Length > 0 &&
                !UI.Confirmar("Consultar o CNPJ e substituir os dados preenchidos pelos da Receita Federal?")) return;

            DadosCnpj d = null;
            if (!UI.Executar(this, delegate { d = ConsultaCnpj.Consultar(cnpj); })) return;

            txtCNPJ.Text = Util.FormatarDoc(cnpj);
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
            if (d.Mei == true) UI.SelecionarPorCodigo(cboCRT, "4");
            else if (d.SimplesNacional == true) UI.SelecionarPorCodigo(cboCRT, "1");
            else if (d.SimplesNacional == false) UI.SelecionarPorCodigo(cboCRT, "3");

            string aviso = "";
            if (!string.IsNullOrEmpty(d.IE)) txtIE.Text = d.IE;
            else if (d.ConsultouIE) aviso = "Nenhuma inscrição estadual ativa encontrada em " + d.Endereco.UF + ". Preencha manualmente.";
            else aviso = "A consulta não trouxe a inscrição estadual (fonte: " + d.Fonte + "). Preencha manualmente.";
            if (!string.IsNullOrEmpty(d.Situacao) && !d.Situacao.StartsWith("Ativa", StringComparison.OrdinalIgnoreCase))
                aviso = "Situação na Receita: " + d.Situacao + "\r\n\r\n" + aviso;
            aviso += (aviso.Length > 0 ? "\r\n\r\n" : "") + "Confira o regime tributário (CRT) e o RNTRC antes de salvar.";
            UI.Info(aviso);
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
