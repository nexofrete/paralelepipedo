using System;
using System.Data;
using Npgsql;
using TransportadoraCTe.Infra;
using TransportadoraCTe.Modelos;

namespace TransportadoraCTe.Repositorios
{
    public static class EmpresaRepo
    {
        public static Empresa Obter()
        {
            DataTable dt = Db.Tabela("SELECT * FROM empresa WHERE id = 1");
            if (dt.Rows.Count == 0) return null;
            DataRow r = dt.Rows[0];
            Empresa e = new Empresa();
            e.CNPJ = Db.S(r, "cnpj");
            e.IE = Db.S(r, "ie");
            e.RazaoSocial = Db.S(r, "razao_social");
            e.NomeFantasia = Db.S(r, "nome_fantasia");
            e.RNTRC = Db.S(r, "rntrc");
            e.CRT = Db.I(r, "crt");
            e.Endereco.Logradouro = Db.S(r, "logradouro");
            e.Endereco.Numero = Db.S(r, "numero");
            e.Endereco.Complemento = Db.S(r, "complemento");
            e.Endereco.Bairro = Db.S(r, "bairro");
            e.Endereco.CodMunicipio = Db.S(r, "cod_municipio");
            e.Endereco.Municipio = Db.S(r, "municipio");
            e.Endereco.UF = Db.S(r, "uf");
            e.Endereco.CEP = Db.S(r, "cep");
            e.Fone = Db.S(r, "fone");
            e.Email = Db.S(r, "email");
            e.SerieCTe = Db.I(r, "serie_cte");
            e.ProximoNumero = Db.I(r, "proximo_numero");
            e.Ambiente = Db.I(r, "ambiente");
            e.CertThumbprint = Db.S(r, "cert_thumbprint");
            e.RespTecCNPJ = Db.S(r, "resp_tec_cnpj");
            e.RespTecContato = Db.S(r, "resp_tec_contato");
            e.RespTecEmail = Db.S(r, "resp_tec_email");
            e.RespTecFone = Db.S(r, "resp_tec_fone");
            return e;
        }

        public static void Salvar(Empresa e)
        {
            e.CNPJ = Util.SoNumeros(e.CNPJ);
            if (!Util.CnpjValido(e.CNPJ)) throw new ApplicationException("CNPJ do emitente inválido.");
            e.IE = Util.SoNumeros(e.IE);
            if (e.IE.Length == 0) throw new ApplicationException("Informe a Inscrição Estadual do emitente.");
            if (string.IsNullOrWhiteSpace(e.RazaoSocial)) throw new ApplicationException("Informe a razão social.");
            e.RNTRC = Util.SoNumeros(e.RNTRC);
            if (e.RNTRC.Length != 8) throw new ApplicationException("RNTRC deve ter 8 dígitos.");
            if (Util.SoNumeros(e.Endereco.CodMunicipio).Length != 7) throw new ApplicationException("Código IBGE do município deve ter 7 dígitos.");
            if (Array.IndexOf(Util.UFs, e.Endereco.UF) < 0) throw new ApplicationException("UF inválida.");
            e.Endereco.CEP = Util.SoNumeros(e.Endereco.CEP);
            if (e.Endereco.CEP.Length != 8) throw new ApplicationException("CEP deve ter 8 dígitos.");
            if (e.SerieCTe < 0 || e.SerieCTe > 889) throw new ApplicationException("Série deve estar entre 0 e 889.");
            if (e.ProximoNumero < 1) throw new ApplicationException("Próximo número deve ser maior que zero.");

            NpgsqlParameter[] ps = {
                Db.P("@cnpj", e.CNPJ), Db.P("@ie", e.IE), Db.P("@rs", e.RazaoSocial.Trim()), Db.P("@nf", (e.NomeFantasia ?? "").Trim()),
                Db.P("@rntrc", e.RNTRC), Db.P("@crt", (short)e.CRT),
                Db.P("@lg", (e.Endereco.Logradouro ?? "").Trim()), Db.P("@nr", string.IsNullOrWhiteSpace(e.Endereco.Numero) ? "SN" : e.Endereco.Numero.Trim()),
                Db.P("@cp", (e.Endereco.Complemento ?? "").Trim()), Db.P("@ba", (e.Endereco.Bairro ?? "").Trim()),
                Db.P("@cm", Util.SoNumeros(e.Endereco.CodMunicipio)), Db.P("@mu", (e.Endereco.Municipio ?? "").Trim()),
                Db.P("@uf", e.Endereco.UF), Db.P("@cep", e.Endereco.CEP), Db.P("@fo", Util.SoNumeros(e.Fone)),
                Db.P("@em", (e.Email ?? "").Trim()), Db.P("@se", e.SerieCTe), Db.P("@pn", e.ProximoNumero),
                Db.P("@amb", (short)e.Ambiente), Db.P("@cert", e.CertThumbprint),
                Db.P("@rtc", Util.SoNumeros(e.RespTecCNPJ)), Db.P("@rtn", (e.RespTecContato ?? "").Trim()),
                Db.P("@rte", (e.RespTecEmail ?? "").Trim()), Db.P("@rtf", Util.SoNumeros(e.RespTecFone)) };

            const string campos = "cnpj=@cnpj, ie=@ie, razao_social=@rs, nome_fantasia=@nf, rntrc=@rntrc, crt=@crt, " +
                "logradouro=@lg, numero=@nr, complemento=@cp, bairro=@ba, cod_municipio=@cm, municipio=@mu, uf=@uf, cep=@cep, " +
                "fone=@fo, email=@em, serie_cte=@se, proximo_numero=@pn, ambiente=@amb, cert_thumbprint=@cert, " +
                "resp_tec_cnpj=@rtc, resp_tec_contato=@rtn, resp_tec_email=@rte, resp_tec_fone=@rtf";

            if (Db.Escalar("SELECT 1 FROM empresa WHERE id = 1") == null)
            {
                Db.Executar(
                    "INSERT INTO empresa (id, cnpj, ie, razao_social, nome_fantasia, rntrc, crt, logradouro, numero, complemento, bairro, " +
                    "cod_municipio, municipio, uf, cep, fone, email, serie_cte, proximo_numero, ambiente, cert_thumbprint, " +
                    "resp_tec_cnpj, resp_tec_contato, resp_tec_email, resp_tec_fone) VALUES (1, @cnpj, @ie, @rs, @nf, @rntrc, @crt, " +
                    "@lg, @nr, @cp, @ba, @cm, @mu, @uf, @cep, @fo, @em, @se, @pn, @amb, @cert, @rtc, @rtn, @rte, @rtf)", ps);
            }
            else
            {
                Db.Executar("UPDATE empresa SET " + campos + " WHERE id = 1", ps);
            }
        }

        /// <summary>
        /// Reserva o proximo numero de CT-e de forma atomica (FOR UPDATE),
        /// pulando numeros ja usados na mesma serie/ambiente.
        /// </summary>
        public static int ReservarNumero(NpgsqlConnection cn, NpgsqlTransaction tx, int serie, int ambiente)
        {
            object o = Db.Escalar(cn, tx, "SELECT proximo_numero FROM empresa WHERE id = 1 FOR UPDATE");
            if (o == null) throw new ApplicationException("Cadastre os dados da empresa antes de emitir.");
            int n = Convert.ToInt32(o);
            object max = Db.Escalar(cn, tx, "SELECT max(numero) FROM ctes WHERE serie = @s AND ambiente = @a",
                Db.P("@s", serie), Db.P("@a", (short)ambiente));
            if (max != null && Convert.ToInt32(max) >= n) n = Convert.ToInt32(max) + 1;
            Db.Executar(cn, tx, "UPDATE empresa SET proximo_numero = @n WHERE id = 1", Db.P("@n", n + 1));
            return n;
        }
    }
}
