using System;
using System.Collections.Generic;
using System.Data;
using TransportadoraCTe.Infra;
using TransportadoraCTe.Modelos;

namespace TransportadoraCTe.Repositorios
{
    public static class ClienteRepo
    {
        public static DataTable Pesquisar(string filtro, bool somenteAtivos)
        {
            string sql =
                "SELECT id AS \"Código\", razao_social AS \"Razão social\", cpf_cnpj AS \"CPF/CNPJ\", ie AS \"IE\", " +
                "municipio AS \"Município\", uf AS \"UF\", fone AS \"Telefone\", " +
                "CASE WHEN ativo THEN 'Sim' ELSE 'Não' END AS \"Ativo\" FROM clientes WHERE 1=1 ";
            if (somenteAtivos) sql += "AND ativo ";
            if (!string.IsNullOrWhiteSpace(filtro))
                sql += "AND (razao_social ILIKE @f OR nome_fantasia ILIKE @f OR cpf_cnpj LIKE @d) ";
            sql += "ORDER BY razao_social LIMIT 500";
            string d = Util.SoNumeros(filtro);
            return Db.Tabela(sql, Db.P("@f", "%" + (filtro ?? "").Trim() + "%"),
                                  Db.P("@d", (d.Length == 0 ? "#" : d) + "%"));
        }

        public static List<Cliente> ListarAtivos()
        {
            List<Cliente> l = new List<Cliente>();
            foreach (DataRow r in Db.Tabela("SELECT * FROM clientes WHERE ativo ORDER BY razao_social").Rows)
                l.Add(Mapear(r));
            return l;
        }

        public static Cliente Obter(int id)
        {
            DataTable dt = Db.Tabela("SELECT * FROM clientes WHERE id = @id", Db.P("@id", id));
            return dt.Rows.Count == 0 ? null : Mapear(dt.Rows[0]);
        }

        private static Cliente Mapear(DataRow r)
        {
            Cliente c = new Cliente();
            c.Id = Db.I(r, "id");
            c.TipoPessoa = Db.S(r, "tipo_pessoa");
            c.CpfCnpj = Db.S(r, "cpf_cnpj");
            c.IE = Db.S(r, "ie");
            c.Contribuinte = Db.I(r, "contribuinte");
            c.RazaoSocial = Db.S(r, "razao_social");
            c.NomeFantasia = Db.S(r, "nome_fantasia");
            c.Endereco.Logradouro = Db.S(r, "logradouro");
            c.Endereco.Numero = Db.S(r, "numero");
            c.Endereco.Complemento = Db.S(r, "complemento");
            c.Endereco.Bairro = Db.S(r, "bairro");
            c.Endereco.CodMunicipio = Db.S(r, "cod_municipio");
            c.Endereco.Municipio = Db.S(r, "municipio");
            c.Endereco.UF = Db.S(r, "uf");
            c.Endereco.CEP = Db.S(r, "cep");
            c.Fone = Db.S(r, "fone");
            c.Email = Db.S(r, "email");
            c.Ativo = Db.B(r, "ativo");
            return c;
        }

        public static void Validar(Cliente c)
        {
            c.CpfCnpj = Util.SoNumeros(c.CpfCnpj);
            if (c.TipoPessoa == "J" && !Util.CnpjValido(c.CpfCnpj)) throw new ApplicationException("CNPJ inválido.");
            if (c.TipoPessoa == "F" && !Util.CpfValido(c.CpfCnpj)) throw new ApplicationException("CPF inválido.");
            if (string.IsNullOrWhiteSpace(c.RazaoSocial)) throw new ApplicationException("Informe a razão social / nome.");
            if (string.IsNullOrWhiteSpace(c.Endereco.Logradouro)) throw new ApplicationException("Informe o logradouro.");
            if (string.IsNullOrWhiteSpace(c.Endereco.Numero)) c.Endereco.Numero = "SN";
            if (string.IsNullOrWhiteSpace(c.Endereco.Bairro)) throw new ApplicationException("Informe o bairro.");
            if (Util.SoNumeros(c.Endereco.CodMunicipio).Length != 7) throw new ApplicationException("Código IBGE do município deve ter 7 dígitos.");
            if (string.IsNullOrWhiteSpace(c.Endereco.Municipio)) throw new ApplicationException("Informe o município.");
            if (Array.IndexOf(Util.UFs, c.Endereco.UF) < 0) throw new ApplicationException("UF inválida.");
            c.Endereco.CEP = Util.SoNumeros(c.Endereco.CEP);
            if (c.Endereco.CEP.Length > 0 && c.Endereco.CEP.Length != 8) throw new ApplicationException("CEP deve ter 8 dígitos.");
            c.Fone = Util.SoNumeros(c.Fone);

            string ie = (c.IE ?? "").Trim().ToUpperInvariant();
            if (ie != "ISENTO") ie = Util.SoNumeros(ie);
            c.IE = ie;
            if (c.Contribuinte == 1 && (ie.Length == 0 || ie == "ISENTO"))
                throw new ApplicationException("Cliente contribuinte precisa de Inscrição Estadual.");
            if (c.Contribuinte == 2) c.IE = "ISENTO";
            if (c.Contribuinte == 9) c.IE = "";
        }

        public static int Salvar(Cliente c)
        {
            Validar(c);
            object dup = Db.Escalar("SELECT id FROM clientes WHERE cpf_cnpj = @d AND id <> @id",
                Db.P("@d", c.CpfCnpj), Db.P("@id", c.Id));
            if (dup != null) throw new ApplicationException("Já existe cliente com este CPF/CNPJ (código " + dup + ").");

            Npgsql.NpgsqlParameter[] ps = {
                Db.P("@tp", c.TipoPessoa), Db.P("@doc", c.CpfCnpj), Db.P("@ie", c.IE), Db.P("@contr", (short)c.Contribuinte),
                Db.P("@rs", c.RazaoSocial.Trim()), Db.P("@nf", (c.NomeFantasia ?? "").Trim()),
                Db.P("@lg", c.Endereco.Logradouro.Trim()), Db.P("@nr", c.Endereco.Numero.Trim()),
                Db.P("@cp", (c.Endereco.Complemento ?? "").Trim()), Db.P("@ba", c.Endereco.Bairro.Trim()),
                Db.P("@cm", Util.SoNumeros(c.Endereco.CodMunicipio)), Db.P("@mu", c.Endereco.Municipio.Trim()),
                Db.P("@uf", c.Endereco.UF), Db.P("@cep", c.Endereco.CEP), Db.P("@fo", c.Fone),
                Db.P("@em", (c.Email ?? "").Trim()), Db.P("@at", c.Ativo), Db.P("@id", c.Id) };

            if (c.Id == 0)
            {
                c.Id = Convert.ToInt32(Db.Escalar(
                    "INSERT INTO clientes (tipo_pessoa, cpf_cnpj, ie, contribuinte, razao_social, nome_fantasia, logradouro, numero, " +
                    "complemento, bairro, cod_municipio, municipio, uf, cep, fone, email, ativo) VALUES " +
                    "(@tp, @doc, @ie, @contr, @rs, @nf, @lg, @nr, @cp, @ba, @cm, @mu, @uf, @cep, @fo, @em, @at) RETURNING id", ps));
            }
            else
            {
                Db.Executar(
                    "UPDATE clientes SET tipo_pessoa=@tp, cpf_cnpj=@doc, ie=@ie, contribuinte=@contr, razao_social=@rs, " +
                    "nome_fantasia=@nf, logradouro=@lg, numero=@nr, complemento=@cp, bairro=@ba, cod_municipio=@cm, " +
                    "municipio=@mu, uf=@uf, cep=@cep, fone=@fo, email=@em, ativo=@at WHERE id=@id", ps);
            }
            return c.Id;
        }

        public static void Excluir(int id)
        {
            object usado = Db.Escalar("SELECT 1 FROM ctes WHERE remetente_id = @id OR destinatario_id = @id LIMIT 1", Db.P("@id", id));
            if (usado != null)
            {
                Db.Executar("UPDATE clientes SET ativo = FALSE WHERE id = @id", Db.P("@id", id));
                throw new ApplicationException("Cliente possui CT-es e foi apenas inativado.");
            }
            Db.Executar("DELETE FROM clientes WHERE id = @id", Db.P("@id", id));
        }
    }
}
