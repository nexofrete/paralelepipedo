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
    public class FrmEmpresa : Form
    {
        private Empresa emp;
        private readonly TextBox txtCNPJ = UI.Texto(18);
        private readonly TextBox txtIE = UI.Texto(14);
        private readonly TextBox txtRazao = UI.Texto(60);
        private readonly TextBox txtFantasia = UI.Texto(60);
        private readonly TextBox txtRNTRC = UI.Texto(8);
        private readonly ComboBox cboCRT = UI.Combo("1 - Simples Nacional", "2 - Simples Nacional, excesso sublimite", "3 - Regime normal", "4 - MEI");
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
        private readonly ComboBox cboAmbiente = UI.Combo("2 - Homologação (testes)", "1 - Produção");
        private readonly NumericUpDown numSerie = new NumericUpDown();
        private readonly NumericUpDown numProximo = new NumericUpDown();
        private readonly TextBox txtCert = UI.Texto(200);
        private readonly TextBox txtRtCNPJ = UI.Texto(18);
        private readonly TextBox txtRtContato = UI.Texto(60);
        private readonly TextBox txtRtEmail = UI.Texto(60);
        private readonly TextBox txtRtFone = UI.Texto(15);
        private string thumbprint;

        public FrmEmpresa()
        {
            UI.PrepararDialogo(this, "Empresa emitente e certificado digital", 760, 600);
            numSerie.Maximum = 889;
            numProximo.Maximum = 999999999;
            numProximo.Minimum = 1;
            txtCert.ReadOnly = true;

            FlowLayoutPanel f = UI.Fluxo();
            UI.Secao(f, "Dados da transportadora");
            UI.Adicionar(f, "CNPJ", txtCNPJ, 160, false);
            UI.Adicionar(f, "Inscrição estadual", txtIE, 130, false);
            UI.Adicionar(f, "RNTRC (ANTT)", txtRNTRC, 110, false);
            UI.Adicionar(f, "Regime tributário (CRT)", cboCRT, 260, true);
            UI.Adicionar(f, "Razão social", txtRazao, 400, false);
            UI.Adicionar(f, "Nome fantasia", txtFantasia, 300, true);
            UI.Adicionar(f, "Logradouro", txtLogradouro, 400, false);
            UI.Adicionar(f, "Número", txtNumero, 80, false);
            UI.Adicionar(f, "Complemento", txtCompl, 210, true);
            UI.Adicionar(f, "Bairro", txtBairro, 200, false);
            UI.Adicionar(f, "Cód. IBGE município", txtCodMun, 120, false);
            UI.Adicionar(f, "Município", txtMunicipio, 210, false);
            UI.Adicionar(f, "UF", cboUF, 60, false);
            UI.Adicionar(f, "CEP", txtCEP, 80, true);
            UI.Adicionar(f, "Telefone", txtFone, 140, false);
            UI.Adicionar(f, "E-mail", txtEmail, 300, true);

            UI.Secao(f, "Parâmetros do CT-e");
            UI.Adicionar(f, "Ambiente SEFAZ", cboAmbiente, 200, false);
            UI.Adicionar(f, "Série", numSerie, 80, false);
            UI.Adicionar(f, "Próximo número", numProximo, 120, true);
            UI.Adicionar(f, "Certificado digital (A1 ou A3 instalado no Windows)", txtCert, 520, false);
            Button selCert = UI.Botao("Selecionar...", SelecionarCertificado);
            selCert.Margin = new Padding(4, 20, 4, 4);
            f.Controls.Add(selCert);
            f.SetFlowBreak(selCert, true);

            UI.Secao(f, "Responsável técnico pelo sistema (opcional - exigido por algumas UFs)");
            UI.Adicionar(f, "CNPJ", txtRtCNPJ, 160, false);
            UI.Adicionar(f, "Contato", txtRtContato, 200, false);
            UI.Adicionar(f, "E-mail", txtRtEmail, 200, false);
            UI.Adicionar(f, "Telefone", txtRtFone, 110, true);

            Button salvar = UI.Botao("Salvar", Salvar);
            Controls.Add(f);
            Controls.Add(UI.Rodape(salvar, UI.Botao("Testar SEFAZ", TestarSefaz), UI.Botao("Fechar", delegate { Close(); })));

            Load += delegate { Carregar(); };
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

        private void SelecionarCertificado(object sender, EventArgs e)
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

        private void Salvar(object sender, EventArgs e)
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

        private void TestarSefaz(object sender, EventArgs e)
        {
            ResultadoSefaz r = null;
            if (UI.Executar(this, delegate { r = CteServico.StatusServico(); }))
                MessageBox.Show(r.ToString(), "Status SEFAZ", MessageBoxButtons.OK,
                    r.Sucesso ? MessageBoxIcon.Information : MessageBoxIcon.Warning);
        }
    }
}
