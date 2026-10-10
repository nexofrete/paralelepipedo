using System;
using System.Security.Cryptography.X509Certificates;
using System.Security.Cryptography.Xml;
using System.Xml;

namespace TransportadoraCTe.CTe
{
    /// <summary>
    /// Assinatura XMLDSig exigida pelo CT-e: RSA-SHA1, digest SHA1,
    /// transformacoes enveloped + C14N, referencia ao atributo Id.
    /// A assinatura e incluida como ultimo filho do elemento raiz.
    /// </summary>
    public static class Assinador
    {
        public static void Assinar(XmlDocument doc, string nomeElementoAssinado, X509Certificate2 cert)
        {
            XmlNodeList lista = doc.GetElementsByTagName(nomeElementoAssinado, CteXml.NS);
            if (lista.Count != 1)
                throw new ApplicationException("Elemento " + nomeElementoAssinado + " não encontrado para assinatura.");
            XmlElement alvo = (XmlElement)lista[0];
            string id = alvo.GetAttribute("Id");
            if (string.IsNullOrEmpty(id)) throw new ApplicationException("Elemento " + nomeElementoAssinado + " sem atributo Id.");

            SignedXml signed = new SignedXml(doc);
            signed.SigningKey = cert.PrivateKey;
            signed.SignedInfo.CanonicalizationMethod = SignedXml.XmlDsigCanonicalizationUrl;
            signed.SignedInfo.SignatureMethod = SignedXml.XmlDsigRSASHA1Url;

            Reference reference = new Reference("#" + id);
            reference.DigestMethod = SignedXml.XmlDsigSHA1Url;
            reference.AddTransform(new XmlDsigEnvelopedSignatureTransform());
            reference.AddTransform(new XmlDsigC14NTransform());
            signed.AddReference(reference);

            KeyInfo ki = new KeyInfo();
            ki.AddClause(new KeyInfoX509Data(cert));
            signed.KeyInfo = ki;

            signed.ComputeSignature();
            XmlElement assinatura = signed.GetXml();
            doc.DocumentElement.AppendChild(doc.ImportNode(assinatura, true));
        }

        /// <summary>Confere a assinatura de um XML (util para diagnostico).</summary>
        public static bool Verificar(XmlDocument doc)
        {
            XmlNodeList sigs = doc.GetElementsByTagName("Signature", SignedXml.XmlDsigNamespaceUrl);
            if (sigs.Count == 0) return false;
            SignedXml signed = new SignedXml(doc);
            signed.LoadXml((XmlElement)sigs[0]);
            return signed.CheckSignature();
        }
    }
}
