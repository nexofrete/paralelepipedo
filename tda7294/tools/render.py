"""Geração dos SVG (escala 1:1 em mm) a partir da placa."""
import math


def _pad(p, fill, grow=0.0):
    w = p.size + 2 * grow
    if p.h > p.size:
        h = p.h + 2 * grow
        return (f'<rect x="{p.x - w / 2:.3f}" y="{p.y - h / 2:.3f}" width="{w:.3f}" height="{h:.3f}" '
                f'rx="{w / 2:.3f}" fill="{fill}"/>\n')
    if p.square:
        return (f'<rect x="{p.x - w / 2:.3f}" y="{p.y - w / 2:.3f}" width="{w:.3f}" height="{w:.3f}" '
                f'fill="{fill}"/>\n')
    return f'<circle cx="{p.x:.3f}" cy="{p.y:.3f}" r="{w / 2:.3f}" fill="{fill}"/>\n'


def _hdr(w, h, margin=0.0, title=''):
    W, H = w + 2 * margin, h + 2 * margin
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}mm" height="{H}mm" '
            f'viewBox="{-margin} {-margin} {W} {H}">\n<title>{title}</title>\n')


def _path(pts):
    return 'M' + ' L'.join(f'{x:.3f},{y:.3f}' for x, y in pts)


def copper_layer(b, fg, hole_fill, mirror=False, margin=0.0, title='', drill_scale=0.6,
                 outline=True, frame=None):
    s = _hdr(b.w, b.h, margin, title)
    if frame:
        s += f'<rect x="{-margin}" y="{-margin}" width="{b.w + 2 * margin}" height="{b.h + 2 * margin}" fill="{frame}"/>\n'
    g = f'<g transform="translate({b.w},0) scale(-1,1)">' if mirror else '<g>'
    s += g + '\n'
    if outline:
        s += (f'<rect x="0" y="0" width="{b.w}" height="{b.h}" fill="none" '
              f'stroke="{fg}" stroke-width="0.15"/>\n')
    for t in b.tracks:
        s += (f'<path d="{_path(t.pts)}" fill="none" stroke="{fg}" '
              f'stroke-width="{t.width}" stroke-linecap="round" stroke-linejoin="round"/>\n')
    for p in b.pads:
        s += _pad(p, fg)
    # furos (marca de broca menor que o furo real, ajuda a centralizar)
    for p in b.pads:
        s += f'<circle cx="{p.x:.3f}" cy="{p.y:.3f}" r="{p.drill / 2 * drill_scale:.3f}" fill="{hole_fill}"/>\n'
    for (x, y, d) in b.holes:
        s += (f'<circle cx="{x}" cy="{y}" r="{d / 2}" fill="none" stroke="{fg}" stroke-width="0.2"/>\n'
              f'<circle cx="{x}" cy="{y}" r="0.4" fill="{fg}"/>\n')
    s += '</g>\n</svg>\n'
    return s


def _silk_items(b, color, sw=0.2, text_color=None, font='Arial, Helvetica, sans-serif'):
    tc = text_color or color
    s = ''
    for it in b.silk:
        k, d = it.kind, it.data
        if k == 'line':
            s += (f'<line x1="{d[0]}" y1="{d[1]}" x2="{d[2]}" y2="{d[3]}" stroke="{color}" '
                  f'stroke-width="{sw if it.size == 1.0 else it.size}" stroke-linecap="round"/>\n')
        elif k == 'rect':
            s += (f'<rect x="{d[0]:.3f}" y="{d[1]:.3f}" width="{d[2]:.3f}" height="{d[3]:.3f}" '
                  f'fill="none" stroke="{color}" stroke-width="{sw}"/>\n')
        elif k == 'circle':
            s += (f'<circle cx="{d[0]}" cy="{d[1]}" r="{d[2]}" fill="none" stroke="{color}" '
                  f'stroke-width="{sw}"/>\n')
        elif k == 'text':
            txt, x, y = d
            txt = txt.replace('&', '&amp;').replace('<', '&lt;')
            s += (f'<text x="{x:.3f}" y="{y:.3f}" font-family="{font}" font-size="{it.size}" '
                  f'font-weight="bold" fill="{tc}" text-anchor="middle" '
                  f'dominant-baseline="central">{txt}</text>\n')
    return s


def silk_layer(b, mirror=False, title=''):
    s = _hdr(b.w, b.h, 0, title)
    s += '<g transform="translate({},0) scale(-1,1)">\n'.format(b.w) if mirror else '<g>\n'
    s += f'<rect x="0" y="0" width="{b.w}" height="{b.h}" fill="none" stroke="#000" stroke-width="0.15"/>\n'
    s += _silk_items(b, '#000')
    for p in b.pads:
        s += _pad(p, '#fff', 0.25)
        s += f'<circle cx="{p.x:.3f}" cy="{p.y:.3f}" r="{p.drill / 2}" fill="none" stroke="#000" stroke-width="0.15"/>\n'
    for (x, y, d) in b.holes:
        s += f'<circle cx="{x}" cy="{y}" r="{d / 2}" fill="none" stroke="#000" stroke-width="0.2"/>\n'
    s += '</g>\n</svg>\n'
    return s


def preview(b, title='', scale_note=True):
    """Vista do lado dos componentes com o cobre 'visto através' da placa."""
    m = 3.0
    s = _hdr(b.w, b.h, m, title)
    s += f'<rect x="{-m}" y="{-m}" width="{b.w + 2 * m}" height="{b.h + 2 * m}" fill="#1b1b1b"/>\n'
    s += f'<rect x="0" y="0" width="{b.w}" height="{b.h}" rx="1" fill="#2f5d3a"/>\n'
    for t in b.tracks:
        s += (f'<path d="{_path(t.pts)}" fill="none" stroke="#d9a05b" stroke-opacity="0.85" '
              f'stroke-width="{t.width}" stroke-linecap="round" stroke-linejoin="round"/>\n')
    for p in b.pads:
        s += _pad(p, '#e8b46c')
        s += f'<circle cx="{p.x:.3f}" cy="{p.y:.3f}" r="{p.drill / 2}" fill="#111"/>\n'
    for (x, y, d) in b.holes:
        s += f'<circle cx="{x}" cy="{y}" r="{d / 2}" fill="#111" stroke="#bbb" stroke-width="0.2"/>\n'
    s += _silk_items(b, '#f4f4f4', sw=0.18)
    # jumpers em destaque
    for (ref, a, c) in b.jumpers:
        pa = b.pad(*a.split('.'))
        pc = b.pad(*c.split('.'))
        s += (f'<line x1="{pa.x}" y1="{pa.y}" x2="{pc.x}" y2="{pc.y}" stroke="#4fc3f7" '
              f'stroke-width="0.7" stroke-linecap="round" stroke-dasharray="1.2 0.8"/>\n')
    s += '</svg>\n'
    return s
