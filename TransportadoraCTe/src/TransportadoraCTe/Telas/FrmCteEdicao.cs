using System;
using System.Collections.Generic;
using System.Windows.Forms;
using TransportadoraCTe.CTe;
using TransportadoraCTe.Infra;
using TransportadoraCTe.Modelos;
using TransportadoraCTe.Repositorios;

namespace TransportadoraCTe.Telas
{
    /// <summary>Digitacao e envio do CT-e (modal rodoviario).</summary>
    public class FrmCteEdicao : Form
    {
        private Cte cte;
        private Empresa emp;
        private bool carregando;

        private readonly ComboBox cboRem = new ComboBox();
        private readonly ComboBox cboDest = new ComboBox();
        private readonly ComboBox cboTomador = UI.Combo("0 - Remetente (CIF)", "3 - Destinatário (FOB)");
        private readonly ComboBox cboCFOP = new ComboBox();
        private readonly TextBox txtNatOp = UI.Texto(60);
        private readonly TextBox txtCodMunIni = UI.Numero(7);
        private readonly TextBox txtMunIni = UI.Texto(60);
        private readonly ComboBox cboUFIni = UI.Combo(Util.UFs);
        private readonly TextBox txtCodMunFim = UI.Numero(7);
        private readonly TextBox txtMunFim = UI.Texto(60);
        private readonly ComboBox cboUFFim = UI.Combo(Util.UFs);
        private readonly TextBox txtVPrest = UI.Numero(15);
        private readonly TextBox txtVRec = UI.Numero(15);
        private readonly ComboBox cboCST = UI.Combo("00 - Tributação normal", "40 - Isenta", "41 - Não tributada",
                                                     "51 - Diferida", "90 - Outros", "SN - Simples Nacional");
        private readonly TextBox txtBC = UI.Numero(15);
        private readonly TextBox txtAliq = UI.Numero(6);
        private readonly TextBox txtVICMS = UI.Numero(15);
        private readonly TextBox txtProduto = UI.Texto(60);
        private readonly TextBox txtVCarga = UI.Numero(15);
        private readonly TextBox txtPeso = UI.Numero(15);
        private readonly TextBox txtNFes = UI.Multilinha(4000, 70);
        private readonly TextBox txtObs = UI.Multilinha(2000, 50);
        private readonly Label lblNumero = new Label();

        private static readonly string[] CFOPs = {
            "5351 - Transporte p/ mesma natureza", "5352 - Transporte p/ estab. industrial",
            "5353 - Transporte p/ estab. comercial", "5354 - Transporte p/ prest. comunicação",
            "5357 - Transporte p/ não contribuinte", "5932 - Transp. iniciado em outra UF",
            "6351 - Transporte p/ mesma natureza", "6352 - Transporte p/ estab. industrial",
            "6353 - Transporte p/ estab. comercial", "6354 - Transporte p/ prest. comunicação",
            "6357 - Transporte p/ não contribuinte", "6932 - Transp. iniciado em outra UF" };

        public FrmCteEdicao(int id)
        {
            UI.PrepararDialogo(this, id == 0 ? "Novo CT-e" : "Editar CT-e", 900, 680);
            FormBorderStyle = FormBorderStyle.Sizable;
            MaximizeBox = true;

            foreach (ComboBox c in new ComboBox[] { cboRem, cboDest })
            {
                c.DropDownStyle = ComboBoxStyle.DropDown;
                c.AutoCompleteMode = AutoCompleteMode.SuggestAppend;
                c.AutoCompleteSource = AutoCompleteSource.ListItems;
            }
            cboCFOP.DropDownStyle = ComboBoxStyle.DropDownList;
            cboCFOP.Items.AddRange(CFOPs);
            txtVICMS.ReadOnly = true;
            lblNumero.AutoSize = true;
            lblNumero.Font = UI.FonteTitulo;
            lblNumero.ForeColor = UI.CorPrimaria;
            lblNumero.Margin = new Padding(4, 6, 4, 2);

            FlowLayoutPanel f = UI.Fluxo();
            f.Controls.Add(lblNumero);
            f.SetFlowBreak(lblNumero, true);

            UI.Secao(f, "Participantes");
            UI.Adicionar(f, "Remetente", cboRem, 560, false);
            Button novoRem = UI.Botao("+ Cliente", delegate { NovoCliente(cboRem); });
            novoRem.Margin = new Padding(4, 20, 4, 4);
            f.Controls.Add(novoRem);
            f.SetFlowBreak(novoRem, true);
            UI.Adicionar(f, "Destinatário", cboDest, 560, false);
            Button novoDest = UI.Botao("+ Cliente", delegate { NovoCliente(cboDest); });
            novoDest.Margin = new Padding(4, 20, 4, 4);
            f.Controls.Add(novoDest);
            f.SetFlowBreak(novoDest, true);
            UI.Adicionar(f, "Tomador do serviço (quem paga)", cboTomador, 230, false);
            UI.Adicionar(f, "CFOP", cboCFOP, 300, false);
            UI.Adicionar(f, "Natureza da operação", txtNatOp, 290, true);

            UI.Secao(f, "Percurso");
            UI.Adicionar(f, "Início: cód. IBGE", txtCodMunIni, 110, false);
            UI.Adicionar(f, "Município de início", txtMunIni, 230, false);
            UI.Adicionar(f, "UF", cboUFIni, 60, false);
            UI.Adicionar(f, "Fim: cód. IBGE", txtCodMunFim, 110, false);
            UI.Adicionar(f, "Município de término", txtMunFim, 230, false);
            UI.Adicionar(f, "UF", cboUFFim, 60, true);

            UI.Secao(f, "Valores e ICMS");
            UI.Adicionar(f, "Valor da prestação (R$)", txtVPrest, 150, false);
            UI.Adicionar(f, "Valor a receber (R$)", txtVRec, 150, false);
            UI.Adicionar(f, "CST ICMS", cboCST, 200, false);
            UI.Adicionar(f, "Base ICMS", txtBC, 110, false);
            UI.Adicionar(f, "Alíquota %", txtAliq, 70, false);
            UI.Adicionar(f, "Valor ICMS", txtVICMS, 110, true);

            UI.Secao(f, "Carga");
            UI.Adicionar(f, "Produto predominante", txtProduto, 360, false);
            UI.Adicionar(f, "Valor da carga (R$)", txtVCarga, 150, false);
            UI.Adicionar(f, "Peso bruto (kg)", txtPeso, 130, true);
            UI.Adicionar(f, "Chaves das NF-e transportadas (uma por linha; em branco = declaração)", txtNFes, 840, true);
            UI.Adicionar(f, "Observações", txtObs, 840, true);

            Button salvar = UI.Botao("Salvar rascunho", delegate { Salvar(false); });
            Button enviar = UI.Botao("Salvar e enviar à SEFAZ", delegate { Salvar(true); });
            enviar.Font = new System.Drawing.Font(UI.Fonte, System.Drawing.FontStyle.Bold);
            Controls.Add(f);
            Controls.Add(UI.Rodape(enviar, salvar, UI.Botao("Fechar", delegate { Close(); })));

            // eventos de preenchimento automatico
            cboRem.SelectedIndexChanged += delegate { if (!carregando) PreencherPercurso(true); };
            cboDest.SelectedIndexChanged += delegate { if (!carregando) PreencherPercurso(false); };
            cboUFIni.SelectedIndexChanged += delegate { if (!carregando) AjustarCFOP(); };
            cboUFFim.SelectedIndexChanged += delegate { if (!carregando) AjustarCFOP(); };
            cboTomador.SelectedIndexChanged += delegate { if (!carregando) AjustarCFOP(); };
            txtVPrest.Leave += delegate
            {
                if (txtVRec.Text.Trim().Length == 0) txtVRec.Text = txtVPrest.Text;
                if (UI.ItemCodigo(cboCST) == "00" || UI.ItemCodigo(cboCST) == "90") txtBC.Text = txtVPrest.Text;
                CalcularIcms();
            };
            txtBC.Leave += delegate { CalcularIcms(); };
            txtAliq.Leave += delegate { CalcularIcms(); };
            cboCST.SelectedIndexChanged += delegate
            {
                bool trib = UI.ItemCodigo(cboCST) == "00" || UI.ItemCodigo(cboCST) == "90";
                txtBC.Enabled = txtAliq.Enabled = trib;
                if (!trib) { txtBC.Text = "0,00"; txtAliq.Text = "0,00"; }
                else if (Dec(txtBC) == 0) txtBC.Text = txtVPrest.Text;
                CalcularIcms();
            };

            Load += delegate { Carregar(id); };
        }

        private void Carregar(int id)
        {
            carregando = true;
            try
            {
                emp = EmpresaRepo.Obter();
                if (emp == null) throw new ApplicationException("Cadastre a empresa em Cadastros > Empresa e certificado.");
                List<Cliente> clientes = ClienteRepo.ListarAtivos();
                cboRem.Items.Clear(); cboDest.Items.Clear();
                foreach (Cliente c in clientes) { cboRem.Items.Add(c); cboDest.Items.Add(c); }

                if (id == 0)
                {
                    cte = new Cte();
                    cte.Serie = emp.SerieCTe;
                    cte.Ambiente = emp.Ambiente;
                    lblNumero.Text = "Novo CT-e  -  série " + emp.SerieCTe + "  (o número é definido ao salvar)";
                    UI.SelecionarPorCodigo(cboCFOP, "5353");
                    txtNatOp.Text = cte.NaturezaOperacao;
                    cboCST.SelectedIndex = emp.CRT == 1 || emp.CRT == 4 ? 5 : 0;
                    UI.SelecionarPorCodigo(cboUFIni, emp.Endereco.UF);
                    UI.SelecionarPorCodigo(cboUFFim, emp.Endereco.UF);
                }
                else
                {
                    cte = CteRepo.Obter(id);
                    if (cte == null) throw new ApplicationException("CT-e não encontrado.");
                    if (cte.Status != StatusCte.Digitacao && cte.Status != StatusCte.Rejeitado)
                        throw new ApplicationException("Somente CT-e em digitação ou rejeitado pode ser alterado.");
                    lblNumero.Text = "CT-e nº " + cte.Numero + "  -  série " + cte.Serie + "  -  " + cte.Status +
                                     (string.IsNullOrEmpty(cte.CStat) ? "" : "  (" + cte.CStat + " " + cte.XMotivo + ")");
                    SelecionarCliente(cboRem, cte.RemetenteId);
                    SelecionarCliente(cboDest, cte.DestinatarioId);
                    UI.SelecionarPorCodigo(cboTomador, cte.Tomador.ToString());
                    UI.SelecionarPorCodigo(cboCFOP, cte.CFOP);
                    txtNatOp.Text = cte.NaturezaOperacao;
                    txtCodMunIni.Text = cte.CodMunInicio; txtMunIni.Text = cte.MunInicio; UI.SelecionarPorCodigo(cboUFIni, cte.UFInicio);
                    txtCodMunFim.Text = cte.CodMunFim; txtMunFim.Text = cte.MunFim; UI.SelecionarPorCodigo(cboUFFim, cte.UFFim);
                    txtVPrest.Text = Util.Moeda(cte.ValorPrestacao);
                    txtVRec.Text = Util.Moeda(cte.ValorReceber);
                    UI.SelecionarPorCodigo(cboCST, cte.CstIcms);
                    txtBC.Text = Util.Moeda(cte.BaseIcms);
                    txtAliq.Text = Util.Moeda(cte.AliquotaIcms);
                    txtVICMS.Text = Util.Moeda(cte.ValorIcms);
                    txtProduto.Text = cte.ProdutoPredominante;
                    txtVCarga.Text = Util.Moeda(cte.ValorCarga);
                    txtPeso.Text = cte.PesoKg.ToString("N3", Util.BR);
                    txtNFes.Text = cte.ChavesNFe;
                    txtObs.Text = cte.Observacoes;
                }
            }
            catch (Exception ex)
            {
                UI.Erro(ex);
                BeginInvoke(new MethodInvoker(Close));
            }
            finally { carregando = false; }
        }

        private static void SelecionarCliente(ComboBox c, int id)
        {
            for (int i = 0; i < c.Items.Count; i++)
                if (((Cliente)c.Items[i]).Id == id) { c.SelectedIndex = i; return; }
        }

        private void NovoCliente(ComboBox destino)
        {
            using (FrmClienteEdicao f = new FrmClienteEdicao(0))
            {
                if (f.ShowDialog(this) != DialogResult.OK) return;
                Cliente c = ClienteRepo.Obter(f.IdSalvo);
                cboRem.Items.Add(c);
                cboDest.Items.Add(c);
                destino.SelectedItem = c;
            }
        }

        private void PreencherPercurso(bool inicio)
        {
            Cliente c = (inicio ? cboRem.SelectedItem : cboDest.SelectedItem) as Cliente;
            if (c == null) return;
            if (inicio)
            {
                txtCodMunIni.Text = c.Endereco.CodMunicipio;
                txtMunIni.Text = c.Endereco.Municipio;
                UI.SelecionarPorCodigo(cboUFIni, c.Endereco.UF);
            }
            else
            {
                txtCodMunFim.Text = c.Endereco.CodMunicipio;
                txtMunFim.Text = c.Endereco.Municipio;
                UI.SelecionarPorCodigo(cboUFFim, c.Endereco.UF);
            }
            AjustarCFOP();
        }

        /// <summary>Troca o primeiro digito do CFOP (5 ou 6) conforme o percurso e sugere 5357/6357 para nao contribuinte.</summary>
        private void AjustarCFOP()
        {
            string atual = UI.ItemCodigo(cboCFOP);
            if (atual.Length != 4) atual = "5353";
            string sufixo = atual.Substring(1);
            Cliente tom = (UI.ItemCodigo(cboTomador) == "3" ? cboDest.SelectedItem : cboRem.SelectedItem) as Cliente;
            if (tom != null && tom.Contribuinte == 9) sufixo = "357";
            else if (tom != null && sufixo == "357") sufixo = "353";
            string prefixo = cboUFIni.Text == cboUFFim.Text ? "5" : "6";
            UI.SelecionarPorCodigo(cboCFOP, prefixo + sufixo);
        }

        private static decimal Dec(TextBox t)
        {
            try { return Util.ParseDec(t.Text); }
            catch { return 0m; }
        }

        private void CalcularIcms()
        {
            decimal bc = Dec(txtBC), aliq = Dec(txtAliq);
            txtVICMS.Text = Util.Moeda(Math.Round(bc * aliq / 100m, 2, MidpointRounding.AwayFromZero));
            foreach (TextBox t in new TextBox[] { txtVPrest, txtVRec, txtBC, txtAliq, txtVCarga })
                if (t.Text.Trim().Length > 0) { decimal v = Dec(t); t.Text = Util.Moeda(v); }
        }

        private void LerTela()
        {
            Cliente rem = cboRem.SelectedItem as Cliente;
            Cliente dest = cboDest.SelectedItem as Cliente;
            if (rem == null) throw new ApplicationException("Selecione o remetente na lista.");
            if (dest == null) throw new ApplicationException("Selecione o destinatário na lista.");
            CalcularIcms();

            cte.RemetenteId = rem.Id;
            cte.DestinatarioId = dest.Id;
            cte.Tomador = int.Parse(UI.ItemCodigo(cboTomador));
            cte.CFOP = UI.ItemCodigo(cboCFOP);
            cte.NaturezaOperacao = Util.Texto(txtNatOp.Text, 60);
            if (cte.NaturezaOperacao.Length == 0) throw new ApplicationException("Informe a natureza da operação.");
            cte.CodMunInicio = Util.SoNumeros(txtCodMunIni.Text);
            cte.MunInicio = Util.Texto(txtMunIni.Text, 60);
            cte.UFInicio = cboUFIni.Text;
            cte.CodMunFim = Util.SoNumeros(txtCodMunFim.Text);
            cte.MunFim = Util.Texto(txtMunFim.Text, 60);
            cte.UFFim = cboUFFim.Text;
            if (cte.CodMunInicio.Length != 7 || cte.CodMunFim.Length != 7)
                throw new ApplicationException("Informe os códigos IBGE (7 dígitos) dos municípios de início e fim.");
            cte.ValorPrestacao = Util.ParseDec(txtVPrest.Text);
            cte.ValorReceber = Util.ParseDec(txtVRec.Text);
            cte.CstIcms = UI.ItemCodigo(cboCST);
            cte.BaseIcms = Util.ParseDec(txtBC.Text);
            cte.AliquotaIcms = Util.ParseDec(txtAliq.Text);
            cte.ValorIcms = Util.ParseDec(txtVICMS.Text);
            cte.ProdutoPredominante = Util.Texto(txtProduto.Text, 60);
            cte.ValorCarga = Util.ParseDec(txtVCarga.Text);
            cte.PesoKg = Util.ParseDec(txtPeso.Text);
            cte.ChavesNFe = txtNFes.Text.Trim();
            cte.Observacoes = Util.Texto(txtObs.Text, 2000);
            cte.UsuarioId = Sessao.Usuario.Id;
            cte.Remetente = rem;
            cte.Destinatario = dest;
            CteServico.Validar(cte, emp);
        }

        private void Salvar(bool enviar)
        {
            bool ok = UI.Executar(this, delegate
            {
                LerTela();
                if (cte.Id == 0) CteRepo.Inserir(cte);
                else CteRepo.Atualizar(cte);
            });
            if (!ok) return;
            lblNumero.Text = "CT-e nº " + cte.Numero + "  -  série " + cte.Serie;
            Text = "Editar CT-e nº " + cte.Numero;

            if (!enviar)
            {
                UI.Info("CT-e nº " + cte.Numero + " salvo em digitação.");
                return;
            }

            ResultadoSefaz r = null;
            if (!UI.Executar(this, delegate { r = CteServico.Emitir(cte.Id); }))
            {
                cte = CteRepo.Obter(cte.Id) ?? cte;
                return;
            }

            if (r.Sucesso)
            {
                if (UI.Confirmar("CT-e nº " + cte.Numero + " AUTORIZADO!\r\n\r\n" + r + "\r\n\r\nDeseja visualizar/imprimir o DACTE?"))
                    FrmDacte.Mostrar(this, cte.Id);
                DialogResult = DialogResult.OK;
            }
            else
            {
                MessageBox.Show("CT-e não autorizado:\r\n\r\n" + r + "\r\n\r\nCorrija os dados e envie novamente.",
                    "Retorno da SEFAZ", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                cte = CteRepo.Obter(cte.Id);
                lblNumero.Text = "CT-e nº " + cte.Numero + "  -  " + cte.Status + "  (" + r.CStat + " " + r.XMotivo + ")";
            }
        }
    }
}
