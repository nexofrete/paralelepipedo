using System;

namespace TransportadoraCTe.Modelos
{
    public class Usuario
    {
        public int Id { get; set; }
        public string Nome { get; set; }
        public string Login { get; set; }
        public string Perfil { get; set; }   // ADMIN, OPERADOR, CONSULTA
        public bool Ativo { get; set; }

        public bool EhAdmin { get { return Perfil == "ADMIN"; } }
        public bool PodeEmitir { get { return Perfil == "ADMIN" || Perfil == "OPERADOR"; } }
    }

    public class Endereco
    {
        public string Logradouro { get; set; }
        public string Numero { get; set; }
        public string Complemento { get; set; }
        public string Bairro { get; set; }
        public string CodMunicipio { get; set; }
        public string Municipio { get; set; }
        public string UF { get; set; }
        public string CEP { get; set; }
    }

    public class Empresa
    {
        public string CNPJ { get; set; }
        public string IE { get; set; }
        public string RazaoSocial { get; set; }
        public string NomeFantasia { get; set; }
        public string RNTRC { get; set; }
        public int CRT { get; set; }
        public Endereco Endereco { get; set; }
        public string Fone { get; set; }
        public string Email { get; set; }
        public int SerieCTe { get; set; }
        public int ProximoNumero { get; set; }
        public int Ambiente { get; set; }           // 1 producao, 2 homologacao
        public string CertThumbprint { get; set; }
        public string RespTecCNPJ { get; set; }
        public string RespTecContato { get; set; }
        public string RespTecEmail { get; set; }
        public string RespTecFone { get; set; }

        public Empresa()
        {
            Endereco = new Endereco();
            CRT = 3; SerieCTe = 1; ProximoNumero = 1; Ambiente = 2;
        }
    }

    public class Cliente
    {
        public int Id { get; set; }
        public string TipoPessoa { get; set; }      // J ou F
        public string CpfCnpj { get; set; }
        public string IE { get; set; }
        public int Contribuinte { get; set; }       // 1, 2 ou 9 (indIEToma)
        public string RazaoSocial { get; set; }
        public string NomeFantasia { get; set; }
        public Endereco Endereco { get; set; }
        public string Fone { get; set; }
        public string Email { get; set; }
        public bool Ativo { get; set; }

        public Cliente()
        {
            Endereco = new Endereco();
            TipoPessoa = "J"; Contribuinte = 1; Ativo = true;
        }

        public override string ToString()
        {
            return RazaoSocial + " - " + Infra.Util.FormatarDoc(CpfCnpj);
        }
    }

    public static class StatusCte
    {
        public const string Digitacao = "DIGITACAO";
        public const string Autorizado = "AUTORIZADO";
        public const string Rejeitado = "REJEITADO";
        public const string Cancelado = "CANCELADO";
        public const string Denegado = "DENEGADO";
    }

    public class Cte
    {
        public int Id { get; set; }
        public int Serie { get; set; }
        public int Numero { get; set; }
        public string Chave { get; set; }
        public string CodigoNumerico { get; set; }
        public int Ambiente { get; set; }
        public DateTime DataEmissao { get; set; }
        public string CFOP { get; set; }
        public string NaturezaOperacao { get; set; }
        public int RemetenteId { get; set; }
        public int DestinatarioId { get; set; }
        public int Tomador { get; set; }            // 0 remetente, 3 destinatario
        public string CodMunInicio { get; set; }
        public string MunInicio { get; set; }
        public string UFInicio { get; set; }
        public string CodMunFim { get; set; }
        public string MunFim { get; set; }
        public string UFFim { get; set; }
        public decimal ValorPrestacao { get; set; }
        public decimal ValorReceber { get; set; }
        public string CstIcms { get; set; }         // 00, 40, 41, 51, SN
        public decimal BaseIcms { get; set; }
        public decimal AliquotaIcms { get; set; }
        public decimal ValorIcms { get; set; }
        public string ProdutoPredominante { get; set; }
        public decimal ValorCarga { get; set; }
        public decimal PesoKg { get; set; }
        public string ChavesNFe { get; set; }
        public string Observacoes { get; set; }
        public string Status { get; set; }
        public string CStat { get; set; }
        public string XMotivo { get; set; }
        public string Protocolo { get; set; }
        public DateTime? DataAutorizacao { get; set; }
        public string ProtocoloCancel { get; set; }
        public string XmlAssinado { get; set; }
        public string XmlAutorizado { get; set; }
        public string XmlCancelamento { get; set; }
        public int? UsuarioId { get; set; }

        // carregados para emissao/DACTE
        public Cliente Remetente { get; set; }
        public Cliente Destinatario { get; set; }

        public Cliente ClienteTomador
        {
            get { return Tomador == 3 ? Destinatario : Remetente; }
        }

        public string[] ListaChavesNFe()
        {
            if (string.IsNullOrEmpty(ChavesNFe)) return new string[0];
            System.Collections.Generic.List<string> l = new System.Collections.Generic.List<string>();
            foreach (string linha in ChavesNFe.Split(new char[] { '\r', '\n', ';', ',', ' ' }, StringSplitOptions.RemoveEmptyEntries))
            {
                string c = Infra.Util.SoNumeros(linha);
                if (c.Length == 44 && !l.Contains(c)) l.Add(c);
            }
            return l.ToArray();
        }

        public Cte()
        {
            DataEmissao = DateTime.Now;
            CFOP = "5353";
            NaturezaOperacao = "PRESTACAO DE SERVICO DE TRANSPORTE";
            CstIcms = "00";
            Status = StatusCte.Digitacao;
        }
    }
}
