"""Funcoes de apoio para desenhar o esquema com schemdraw."""
import schemdraw
import schemdraw.elements as elm

schemdraw.config(fontsize=9, lw=1.1)
d = None


def nova(titulo, sub):
    global d
    d = schemdraw.Drawing(show=False)
    d.config(fontsize=9, unit=2)
    d.titulo = (titulo, sub)
    return d


def two(cls, a, b, ref, val="", lado="top", **kw):
    e = cls(**kw).endpoints(a, b)
    txt = ref + ("\n" + val if val else "")
    e.label(txt, loc=lado, fontsize=8.5)
    d.add(e)
    return e


def R(a, b, ref, val, lado="top"):
    return two(elm.Resistor, a, b, ref, val, lado)


def C(a, b, ref, val, lado="top"):
    return two(elm.Capacitor, a, b, ref, val, lado)


def CP(a, b, ref, val, lado="top"):
    """eletrolitico: + no ponto a"""
    return two(elm.Capacitor2, a, b, ref, val, lado, polar=True)


def W(*pts):
    for p, q in zip(pts, pts[1:]):
        d.add(elm.Line().endpoints(p, q))


def dot(p):
    d.add(elm.Dot().at(p))


def gnd(p, potencia=False):
    if potencia:
        d.add(elm.GroundChassis().at(p))
    else:
        d.add(elm.Ground().at(p))


def tag(p, nome, lado="right"):
    """rotulo de net (liga com o mesmo nome em outro ponto/folha)"""
    ang = {"right": 0, "left": 180, "up": 90, "down": 270}[lado]
    t = elm.Tag().at(p).theta(ang).label(nome, fontsize=8)
    d.add(t)


def rail(p, nome, up=True):
    d.add((elm.Vdd() if up else elm.Vss()).at(p).label(nome, fontsize=8.5))


def texto(p, s, size=9, **kw):
    d.add(elm.Label().at(p).label(s, fontsize=size, **kw))


def npn(base, ref, val, rev=False):
    q = elm.BjtNpn(circle=True).theta(0)
    if rev:
        q = q.reverse()
    q = q.anchor("base").at(base).label(ref + "\n" + val, loc="right" if not rev else "left", fontsize=8.5)
    d.add(q)
    return q


def pnp(base, ref, val, rev=False):
    q = elm.BjtPnp(circle=True).theta(0)
    if rev:
        q = q.reverse()
    q = q.anchor("base").at(base).label(ref + "\n" + val, loc="right" if not rev else "left", fontsize=8.5)
    d.add(q)
    return q


def salvar(arq):
    d.save(arq)
