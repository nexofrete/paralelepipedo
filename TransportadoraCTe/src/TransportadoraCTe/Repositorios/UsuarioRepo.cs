using System;
using System.Data;
using TransportadoraCTe.Infra;
using TransportadoraCTe.Modelos;

namespace TransportadoraCTe.Repositorios
{
    public static class UsuarioRepo
    {
        /// <summary>Valida login e senha. Retorna null se invalido ou inativo.</summary>
        public static Usuario Autenticar(string login, string senha)
        {
            DataTable dt = Db.Tabela(
                "SELECT id, nome, login, perfil, ativo, senha_hash, senha_salt FROM usuarios WHERE lower(login) = lower(@login)",
                Db.P("@login", (login ?? "").Trim()));
            if (dt.Rows.Count == 0) return null;
            DataRow r = dt.Rows[0];
            if (!Db.B(r, "ativo")) return null;
            if (!Seguranca.Conferir(senha, Db.S(r, "senha_salt"), Db.S(r, "senha_hash"))) return null;

            Db.Executar("UPDATE usuarios SET ultimo_acesso = now() WHERE id = @id", Db.P("@id", Db.I(r, "id")));
            return Mapear(r);
        }

        private static Usuario Mapear(DataRow r)
        {
            Usuario u = new Usuario();
            u.Id = Db.I(r, "id");
            u.Nome = Db.S(r, "nome");
            u.Login = Db.S(r, "login");
            u.Perfil = Db.S(r, "perfil");
            u.Ativo = Db.B(r, "ativo");
            return u;
        }

        public static DataTable Listar()
        {
            return Db.Tabela(
                "SELECT id AS \"Código\", nome AS \"Nome\", login AS \"Login\", perfil AS \"Perfil\", " +
                "CASE WHEN ativo THEN 'Sim' ELSE 'Não' END AS \"Ativo\", " +
                "to_char(ultimo_acesso,'DD/MM/YYYY HH24:MI') AS \"Último acesso\" FROM usuarios ORDER BY nome");
        }

        public static Usuario Obter(int id)
        {
            DataTable dt = Db.Tabela("SELECT * FROM usuarios WHERE id = @id", Db.P("@id", id));
            return dt.Rows.Count == 0 ? null : Mapear(dt.Rows[0]);
        }

        /// <summary>Insere ou altera. Se senha vier vazia na alteracao, mantem a atual.</summary>
        public static int Salvar(Usuario u, string senha)
        {
            if (string.IsNullOrWhiteSpace(u.Nome)) throw new ApplicationException("Informe o nome.");
            if (string.IsNullOrWhiteSpace(u.Login)) throw new ApplicationException("Informe o login.");

            object existe = Db.Escalar("SELECT id FROM usuarios WHERE lower(login) = lower(@l) AND id <> @id",
                Db.P("@l", u.Login.Trim()), Db.P("@id", u.Id));
            if (existe != null) throw new ApplicationException("Já existe um usuário com este login.");

            if (u.Id == 0)
            {
                if (string.IsNullOrEmpty(senha) || senha.Length < 4)
                    throw new ApplicationException("A senha deve ter pelo menos 4 caracteres.");
                string salt = Seguranca.GerarSalt();
                object id = Db.Escalar(
                    "INSERT INTO usuarios (nome, login, senha_hash, senha_salt, perfil, ativo) " +
                    "VALUES (@n, @l, @h, @s, @p, @a) RETURNING id",
                    Db.P("@n", u.Nome.Trim()), Db.P("@l", u.Login.Trim()), Db.P("@h", Seguranca.Hash(senha, salt)),
                    Db.P("@s", salt), Db.P("@p", u.Perfil), Db.P("@a", u.Ativo));
                u.Id = Convert.ToInt32(id);
            }
            else
            {
                Db.Executar("UPDATE usuarios SET nome=@n, login=@l, perfil=@p, ativo=@a WHERE id=@id",
                    Db.P("@n", u.Nome.Trim()), Db.P("@l", u.Login.Trim()), Db.P("@p", u.Perfil),
                    Db.P("@a", u.Ativo), Db.P("@id", u.Id));
                if (!string.IsNullOrEmpty(senha))
                    AlterarSenha(u.Id, senha);
            }
            return u.Id;
        }

        public static void AlterarSenha(int id, string senha)
        {
            if (string.IsNullOrEmpty(senha) || senha.Length < 4)
                throw new ApplicationException("A senha deve ter pelo menos 4 caracteres.");
            string salt = Seguranca.GerarSalt();
            Db.Executar("UPDATE usuarios SET senha_hash=@h, senha_salt=@s WHERE id=@id",
                Db.P("@h", Seguranca.Hash(senha, salt)), Db.P("@s", salt), Db.P("@id", id));
        }

        public static void Excluir(int id)
        {
            object usado = Db.Escalar("SELECT 1 FROM ctes WHERE usuario_id = @id LIMIT 1", Db.P("@id", id));
            if (usado != null)
            {
                Db.Executar("UPDATE usuarios SET ativo = FALSE WHERE id = @id", Db.P("@id", id));
                throw new ApplicationException("Usuário possui CT-es emitidos e foi apenas inativado.");
            }
            Db.Executar("DELETE FROM usuarios WHERE id = @id", Db.P("@id", id));
        }
    }
}
