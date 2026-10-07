# -*- coding: utf-8 -*-
"""Genera el manual de administración para el admin del cliente (Word)."""
from pathlib import Path

from docx import Document
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_LINE_SPACING
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor

OUT = Path(__file__).with_name("manual-admin-optick-crm.docx")

NAVY = RGBColor(0x1E, 0x3A, 0x5F)
TEAL = RGBColor(0x0F, 0x4C, 0x5C)
DARK = RGBColor(0x1F, 0x29, 0x37)
MUTED = RGBColor(0x4B, 0x55, 0x63)
WHITE = RGBColor(0xFF, 0xFF, 0xFF)
HEADER_BG = "1E3A5F"
ROW_ALT = "F1F5F9"


def set_run_font(run, *, size=11, bold=False, color=DARK, name="Calibri"):
    run.font.name = name
    run.font.size = Pt(size)
    run.font.bold = bold
    run.font.color.rgb = color
    r = run._element
    rPr = r.get_or_add_rPr()
    rFonts = rPr.get_or_add_rFonts()
    rFonts.set(qn("w:eastAsia"), name)


def shade_cell(cell, hex_color):
    tc = cell._tc
    tcPr = tc.get_or_add_tcPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:fill"), hex_color)
    shd.set(qn("w:val"), "clear")
    tcPr.append(shd)


def set_cell_border(cell):
    tc = cell._tc
    tcPr = tc.get_or_add_tcPr()
    tcBorders = OxmlElement("w:tcBorders")
    for edge in ("top", "left", "bottom", "right"):
        el = OxmlElement(f"w:{edge}")
        el.set(qn("w:val"), "single")
        el.set(qn("w:sz"), "4")
        el.set(qn("w:space"), "0")
        el.set(qn("w:color"), "CBD5E1")
        tcBorders.append(el)
    tcPr.append(tcBorders)


def cell_text(cell, text, *, bold=False, size=10, color=DARK, center=False):
    cell.text = ""
    p = cell.paragraphs[0]
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER if center else WD_ALIGN_PARAGRAPH.LEFT
    p.paragraph_format.space_before = Pt(2)
    p.paragraph_format.space_after = Pt(2)
    run = p.add_run(text)
    set_run_font(run, size=size, bold=bold, color=color)
    set_cell_border(cell)


def add_page_number(paragraph):
    run = paragraph.add_run()
    fld1 = OxmlElement("w:fldChar")
    fld1.set(qn("w:fldCharType"), "begin")
    instr = OxmlElement("w:instrText")
    instr.set(qn("xml:space"), "preserve")
    instr.text = " PAGE "
    fld2 = OxmlElement("w:fldChar")
    fld2.set(qn("w:fldCharType"), "end")
    run._r.append(fld1)
    run._r.append(instr)
    run._r.append(fld2)


def prevent_row_split(row):
    tr = row._tr
    trPr = tr.get_or_add_trPr()
    cant = OxmlElement("w:cantSplit")
    trPr.append(cant)


def add_heading_styled(doc, text, level=1):
    h = doc.add_heading(text, level=level)
    for run in h.runs:
        set_run_font(run, size=16 if level == 1 else 13, bold=True, color=NAVY if level == 1 else TEAL)
    h.paragraph_format.space_before = Pt(16 if level == 1 else 10)
    h.paragraph_format.space_after = Pt(6)
    return h


def p(doc, text, *, size=11, bold=False, space_after=8):
    para = doc.add_paragraph()
    para.paragraph_format.space_after = Pt(space_after)
    para.paragraph_format.space_before = Pt(0)
    para.paragraph_format.line_spacing_rule = WD_LINE_SPACING.SINGLE
    parts = text.split("**")
    for i, part in enumerate(parts):
        if not part:
            continue
        run = para.add_run(part)
        set_run_font(run, size=size, bold=bold or (i % 2 == 1), color=DARK)
    return para


def bullet(doc, text):
    para = doc.add_paragraph(style="List Bullet")
    para.paragraph_format.space_after = Pt(3)
    para.paragraph_format.left_indent = Cm(1.0)
    if para.runs:
        para.runs[0].text = ""
    parts = text.split("**")
    for i, part in enumerate(parts):
        if not part:
            continue
        run = para.add_run(part)
        set_run_font(run, size=11, bold=(i % 2 == 1), color=DARK)
    return para


def add_table(doc, headers, rows, col_widths=None):
    table = doc.add_table(rows=1 + len(rows), cols=len(headers))
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = True
    for i, h in enumerate(headers):
        cell = table.rows[0].cells[i]
        cell_text(cell, h, bold=True, size=10, color=WHITE)
        shade_cell(cell, HEADER_BG)
    for r_i, row in enumerate(rows):
        for c_i, val in enumerate(row):
            cell = table.rows[r_i + 1].cells[c_i]
            cell_text(cell, val, size=10, bold=c_i == 0)
            if r_i % 2 == 1:
                shade_cell(cell, ROW_ALT)
        prevent_row_split(table.rows[r_i + 1])
    prevent_row_split(table.rows[0])
    if col_widths:
        for row in table.rows:
            for i, w in enumerate(col_widths):
                row.cells[i].width = Cm(w)
    doc.add_paragraph().paragraph_format.space_after = Pt(4)
    return table


def add_toc_field(doc):
    toc_p = doc.add_paragraph()
    toc_p.paragraph_format.space_before = Pt(12)
    run = toc_p.add_run()
    fld_begin = OxmlElement("w:fldChar")
    fld_begin.set(qn("w:fldCharType"), "begin")
    instr = OxmlElement("w:instrText")
    instr.set(qn("xml:space"), "preserve")
    instr.text = r' TOC \o "1-2" \h \z \u '
    fld_sep = OxmlElement("w:fldChar")
    fld_sep.set(qn("w:fldCharType"), "separate")
    hint = OxmlElement("w:t")
    hint.text = "(Campo de índice de Word: clic derecho → Actualizar campos)"
    fld_end = OxmlElement("w:fldChar")
    fld_end.set(qn("w:fldCharType"), "end")
    r = run._r
    r.append(fld_begin)
    r.append(instr)
    r.append(fld_sep)
    r.append(hint)
    r.append(fld_end)


def build():
    doc = Document()
    section = doc.sections[0]
    section.page_width = Cm(21.0)
    section.page_height = Cm(29.7)
    section.left_margin = Cm(2.0)
    section.right_margin = Cm(2.0)
    section.top_margin = Cm(1.8)
    section.bottom_margin = Cm(1.8)

    footer = section.footer
    footer.is_linked_to_previous = False
    fp = footer.paragraphs[0]
    fp.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r1 = fp.add_run("Manual de administración — Optick CRM  ·  Confidencial interno  ·  Pág. ")
    set_run_font(r1, size=8, color=MUTED)
    add_page_number(fp)

    header = section.header
    header.is_linked_to_previous = False
    hp = header.paragraphs[0]
    hp.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    hr = hp.add_run("Capacitación de administradores  ·  octubre 2026")
    set_run_font(hr, size=8, color=MUTED)

    for _ in range(3):
        doc.add_paragraph()
    kicker = doc.add_paragraph()
    kicker.alignment = WD_ALIGN_PARAGRAPH.CENTER
    kr = kicker.add_run("OPTICK CRM")
    set_run_font(kr, size=13, bold=True, color=TEAL)

    title = doc.add_paragraph()
    title.alignment = WD_ALIGN_PARAGRAPH.CENTER
    tr = title.add_run("Manual de administración")
    set_run_font(tr, size=28, bold=True, color=NAVY)

    sub = doc.add_paragraph()
    sub.alignment = WD_ALIGN_PARAGRAPH.CENTER
    sr = sub.add_run("Guía para el administrador del cliente")
    set_run_font(sr, size=14, color=MUTED)

    meta = doc.add_paragraph()
    meta.alignment = WD_ALIGN_PARAGRAPH.CENTER
    mr = meta.add_run("Octubre 2026")
    set_run_font(mr, size=12, bold=True, color=TEAL)

    box = doc.add_paragraph()
    box.alignment = WD_ALIGN_PARAGRAPH.CENTER
    box.paragraph_format.space_before = Pt(24)
    br = box.add_run(
        "Este documento es para quien administra el CRM de su empresa:\n"
        "usuarios, importaciones, asignaciones y seguimiento de la cola.\n"
        "No es el manual del agente. Léalo con el sistema abierto."
    )
    set_run_font(br, size=11, color=DARK)

    doc.add_page_break()

    add_heading_styled(doc, "Índice", 1)
    p(
        doc,
        "Use este índice para ubicar el tema. En Word también puede actualizar un campo de tabla de contenido (clic derecho → Actualizar campos) si lo agrega al documento.",
        size=10,
    )
    index_items = [
        ("1.", "Para quién es este manual"),
        ("2.", "Roles: agente, admin, super admin, dueño Optick"),
        ("3.", "Usuarios y Plan de usuarios"),
        ("4.", "Alta y baja de agentes"),
        ("5.", "Importaciones (Entel vs Movistar)"),
        ("6.", "Asignaciones y FIFO de lote"),
        ("7.", "Mis clientes (vista de supervisión)"),
        ("8.", "Clientes, Agenda y Dashboard"),
        ("9.", "Exportar No contesta — depurado"),
        ("10.", "Qué no hacer"),
        ("11.", "Preguntas frecuentes"),
    ]
    for num, label in index_items:
        para = doc.add_paragraph()
        para.paragraph_format.space_after = Pt(4)
        para.paragraph_format.space_before = Pt(0)
        r_n = para.add_run(f"{num}  ")
        set_run_font(r_n, size=12, bold=True, color=TEAL)
        r_l = para.add_run(label)
        set_run_font(r_l, size=12, color=DARK)

    add_toc_field(doc)
    doc.add_page_break()

    add_heading_styled(doc, "1. Para quién es este manual", 1)
    p(
        doc,
        "Usted es **administrador del cliente**: la persona de su empresa que da de alta agentes, importa bases, asigna colas y mira el avance. No es el dueño de la plataforma Optick.",
    )
    bullet(doc, "Menú típico: **Dashboard**, **Importar Datos**, **Clientes**, **Asignaciones**, **Agentes**, **Agenda Callbacks**, **Reportes**.")
    bullet(doc, "También puede abrir **Mis clientes** para ver la cola como supervisión (más filtros que el agente).")
    bullet(doc, "El menú **Tenants** / plataforma no es suyo. Si lo ve, ignore esa parte.")

    add_heading_styled(doc, "2. Roles: agente, admin, super admin, dueño Optick", 1)
    p(doc, "Hay cuatro figuras. Usted trabaja con las tres primeras de su empresa.")
    add_table(
        doc,
        ["Rol", "Qué hace", "Qué no hace"],
        [
            [
                "Agente",
                "Llama y registra en Mis clientes. Ve su cola y sus callbacks.",
                "No importa, no asigna, no crea usuarios.",
            ],
            [
                "Admin",
                "Gestiona agentes, importa, asigna, mira Dashboard / Clientes / Agenda / Reportes.",
                "No cambia el cupo del plan. No toca al dueño Optick.",
            ],
            [
                "Super admin (cliente)",
                "Lo mismo que admin, y además puede activar, desactivar o cambiar el rol de otros administradores.",
                "No es el dueño de la plataforma. No ajusta el Plan Optick.",
            ],
            [
                "Dueño Optick",
                "Asiento de la plataforma, no de su cupo. Puede ver Plan Optick (subir o bajar el máximo).",
                "Usted no es ese asiento. No profundice en secretos de plataforma.",
            ],
        ],
        col_widths=[4.2, 7.0, 5.8],
    )
    p(
        doc,
        "Al crear un usuario elige **Agente** o **Administrador**. El super admin del cliente no se crea desde ese selector: es un privilegio especial de su espacio.",
    )

    add_heading_styled(doc, "3. Usuarios y Plan de usuarios", 1)
    p(
        doc,
        "En **Agentes** verá **Plan de usuarios**: ocupados / máximo (por defecto **25**). El cupo cuenta **agentes + administradores + super admin del cliente** que estén **activos**.",
    )
    bullet(doc, "**Desactivar** libera una plaza. El usuario inactivo no ocupa cupo.")
    bullet(doc, "Los **inactivos** se listan aparte. Puede reactivarlos si hay plaza.")
    bullet(doc, "**No hay tope de 2 administradores.** Puede haber más de un admin, mientras quepa en el cupo de 25.")
    bullet(doc, "El dueño Optick **no** cuenta en su cupo.")
    bullet(doc, "**Plan Optick** (cambiar el número máximo) es solo del dueño de la plataforma. Usted no lo usa. Si no hay plazas: desactive a quien ya no trabaja o pida más cupos a Optick.")
    p(
        doc,
        "Sin plazas libres, el botón **Nuevo usuario** se bloquea. No intente “esconder” gente: desactive o pida cupo.",
    )

    add_heading_styled(doc, "4. Alta y baja de agentes", 1)
    p(doc, "Tres acciones distintas. No las mezcle.")
    add_table(
        doc,
        ["Acción", "Qué ocurre", "Cuándo usarla"],
        [
            [
                "Resetear cola",
                "El agente queda activo pero sin cola. Las empresas pendientes vuelven al pool. El historial comercial pasa a Agente borrado (no se borran clientes ni llamadas). En reportes las llamadas de ese agente vuelven a 0.",
                "Fin de campaña o reasignar cartera sin sacar al usuario.",
            ],
            [
                "Desactivar",
                "No puede entrar. Libera plaza del Plan de usuarios. El historial se conserva.",
                "Ya no trabaja aquí, pero puede volver. Es la baja habitual.",
            ],
            [
                "Eliminar",
                "Borra la cuenta. El sistema lo impide si tiene historial (asignaciones, llamadas, callbacks o importaciones).",
                "Solo si nunca usó el sistema. Si tiene historial: desactive.",
            ],
        ],
        col_widths=[3.8, 8.2, 5.0],
    )
    p(
        doc,
        "Al crear o editar un agente puede elegir cómo ve los lotes: **Más antiguo primero** (FIFO, defecto), **Más reciente primero** o **Todos los lotes**. El valor por defecto es terminar el lote actual.",
    )

    add_heading_styled(doc, "5. Importaciones (Entel vs Movistar)", 1)
    p(
        doc,
        "En **Importar Datos** elige el operador **antes** de subir. Entel y Movistar **no se mezclan**: cada archivo, cada lote y cada plantilla son de un solo operador.",
    )
    bullet(
        doc,
        "El **nombre del archivo** debe incluir **entel** o **movistar** como segmento separado por _ - . (ejemplo: PLANTILLA_movistar_20260928.xlsx). «aclaracion.xlsx» no vale.",
    )
    bullet(doc, "Si el nombre menciona los dos operadores, o no coincide con el que eligió, el sistema bloquea la importación.")
    bullet(doc, "No mezcle filas de Entel y Movistar en el mismo Excel.")
    bullet(
        doc,
        "**Bloquear lote:** impide nuevas asignaciones desde ese archivo. No borra asignaciones ni llamadas ya hechas. Puede desbloquearlo después.",
    )
    bullet(
        doc,
        "**Eliminar importación:** solo si nadie usó el lote (sin asignaciones ni llamadas). Si ya hay trabajo, bloquee; no borre.",
    )
    p(
        doc,
        "Puede poner una etiqueta de lote (nombre visible). Si el archivo parece el mismo que uno anterior, el sistema avisa y usted decide si crea un lote nuevo.",
    )

    add_heading_styled(doc, "6. Asignaciones y FIFO de lote", 1)
    p(
        doc,
        "En **Asignaciones** reparte empresas de un lote a uno o varios agentes. Filtre por operador: no mezcle Entel y Movistar en la misma tanda de trabajo.",
    )
    bullet(doc, "Elija lote, agentes y cantidad. El sistema respeta el orden del lote (FIFO: lo más antiguo primero, salvo que el agente tenga otro modo de cola).")
    bullet(doc, "Puede ver corridas (asignaciones) por agente, empresas pendientes y registradas, y liberar el resto de una corrida si hace falta.")
    bullet(doc, "Reasignar no borra el historial de llamadas. Resetear la cola del agente sí archiva su historial comercial.")
    p(
        doc,
        "Regla de oro: termine de asignar y de trabajar un lote antes de abrir otro, salvo que supervisión pida **Más reciente primero** o **Todos los lotes**.",
    )

    add_heading_styled(doc, "7. Mis clientes (vista de supervisión)", 1)
    p(
        doc,
        "El agente trabaja en **Mis clientes**. Usted puede abrir la misma pantalla: ve más (todas las asignadas, no solo la cola activa) y puede filtrar colas.",
    )
    add_table(
        doc,
        ["Cola / filtro", "Qué entra", "Nota"],
        [
            [
                "Detalle (cola 1/N)",
                "Pendientes, No contesta (1), Sin llegada, Volver a llamar, embudo, venta cerrada.",
                "Cierres 0% (No interesado, cliente actual, RUC suspendido) no están aquí.",
            ],
            [
                "Lista · Todos",
                "En agente: la cola activa. En admin: todas las asignadas.",
                "El # es el puesto en Detalle. Si es — está fuera de la cola de trabajo.",
            ],
            [
                "No contesta",
                "Última respuesta No contesta y menos de 2 No contesta en la empresa.",
                "Un No contesta no saca la ficha de Detalle.",
            ],
            [
                "No contesta — depurado",
                "Última respuesta No contesta y 2 o más No contesta en la empresa.",
                "Cuenta solo No contesta, no dos llamadas cualesquiera. El agente necesita contraseña de un admin para verla.",
            ],
            [
                "Otros",
                "Respuestas 0% que no son No contesta: Sin llegada, No interesado, cliente actual, RUC suspendido.",
                "Sin llegada está en Detalle y también en Otros. Cierres 0% solo en Otros.",
            ],
        ],
        col_widths=[4.4, 7.2, 5.4],
    )
    p(
        doc,
        "**Sin llegada** + luego **No contesta** = un No contesta: sigue en Detalle. Depurado = dos **No contesta** en esa **empresa** (del agente), no dos registros de cualquier tipo.",
    )

    add_heading_styled(doc, "8. Clientes, Agenda y Dashboard", 1)
    p(
        doc,
        "Las tres pantallas filtran por **operador** (Todos / Entel / Movistar). Use el filtro: no mezcle campañas al leer números.",
    )
    add_table(
        doc,
        ["Pantalla", "Para qué", "Filtro de operador"],
        [
            [
                "Dashboard",
                "Avance del equipo, lotes, KPIs. Enlaces a Agenda y Asignaciones respetan el operador elegido.",
                "Sí. El lote seleccionado debe ser de ese operador.",
            ],
            [
                "Clientes",
                "Listado de empresas (RUC, respuesta, agente, lote). Búsqueda y filtros de embudo, fechas, lote.",
                "Sí. También puede filtrar por lote de ese operador.",
            ],
            [
                "Agenda Callbacks",
                "Citas pendientes y completadas de los agentes.",
                "Sí. Ve solo las del operador elegido.",
            ],
            [
                "Reportes",
                "Corridas y métricas por agente.",
                "Sí. Cada corrida pertenece a un operador.",
            ],
        ],
        col_widths=[4.0, 8.0, 5.0],
    )

    add_heading_styled(doc, "9. Exportar No contesta — depurado", 1)
    p(
        doc,
        "En **Importar Datos** hay **Exportar No contesta — depurado**. Recupera empresas de esa cola para un Excel de reimportación, **un archivo por agente y por operador**.",
    )
    bullet(doc, "Entel y Movistar **nunca** van en el mismo Excel (plantillas distintas). Si hay más de un archivo, se descarga un ZIP.")
    bullet(doc, "El filtro de operador deja al otro operador en cola.")
    bullet(doc, "Tras exportar, esas empresas se recuperan: no quedan para asignar en el lote original. Las llamadas y métricas del agente no se borran.")
    bullet(doc, "Depurado, otra vez: última respuesta No contesta y **2 o más No contesta** en la empresa. Sin llegada + un No contesta no entra.")

    add_heading_styled(doc, "10. Qué no hacer", 1)
    bullet(doc, "**No resetee la campaña** (Zona peligrosa en Agentes). Borra clientes, importaciones, asignaciones, llamadas y callbacks. Los usuarios se conservan, pero el trabajo se pierde. Es irreversible.")
    bullet(doc, "**No elimine** a quien tiene historial. Desactívelo.")
    bullet(doc, "**No mezcle Entel y Movistar** en un archivo, ni en el nombre (los dos tokens), ni en una exportación depurado.")
    bullet(doc, "**No borre un lote** que los agentes ya usaron. Bloquéelo si no quiere más asignaciones.")
    bullet(doc, "**No pida Plan Optick** ni cambie el cupo máximo: eso es del dueño de la plataforma. Usted desactiva o pide más plazas.")
    bullet(doc, "**No asigne** un lote nuevo si el actual todavía tiene pendientes, salvo acuerdo de supervisión.")

    add_heading_styled(doc, "11. Preguntas frecuentes", 1)

    add_heading_styled(doc, "¿Puedo tener tres administradores?", 2)
    p(
        doc,
        "Sí. No hay tope de 2 admins. Cuentan en el cupo de 25 junto con los agentes activos.",
    )

    add_heading_styled(doc, "Se fue un agente y no hay plaza para el reemplazo. ¿Qué hago?", 2)
    p(
        doc,
        "Desactive al que se fue. Eso libera la plaza. Luego cree el usuario nuevo. Si el que se fue tiene historial, no lo elimine.",
    )

    add_heading_styled(doc, "¿Resetear cola borra las llamadas?", 2)
    p(
        doc,
        "No. Archiva el historial comercial (pasa a Agente borrado) y libera pendientes. Los clientes y las llamadas siguen en el sistema. En reportes, las llamadas de ese agente vuelven a 0.",
    )

    add_heading_styled(doc, "El Excel no sube. Dice que falta entel o movistar.", 2)
    p(
        doc,
        "Renombre el archivo con un segmento claro: `..._entel_...xlsx` o `..._movistar_...xlsx`. Elija el mismo operador en la pantalla. No ponga los dos nombres en el archivo.",
    )

    add_heading_styled(doc, "¿Por qué una empresa con Sin llegada y No contesta no salió en el Excel depurado?", 2)
    p(
        doc,
        "Porque depurado exige **dos No contesta** en la empresa. Sin llegada no cuenta. Esa ficha sigue en Detalle y en la cola No contesta.",
    )

    add_heading_styled(doc, "¿Puedo ver la cola depurado del agente?", 2)
    p(
        doc,
        "Sí, en **Mis clientes** → **Lista** → **No contesta — depurado**. El agente necesita la contraseña de un administrador activo de este espacio para abrirla.",
    )

    add_heading_styled(doc, "Cierre para quien capacita", 2)
    p(
        doc,
        "Pida al admin que, con el sistema abierto: 1) lea el Plan de usuarios, 2) distinga desactivar / resetear cola / eliminar, 3) importe un archivo con token de operador, 4) asigne un lote FIFO, 5) filtre Dashboard y Clientes por operador, 6) explique depurado = dos No contesta. Si cubre eso, ya puede operar el día a día.",
    )

    note = doc.add_paragraph()
    note.paragraph_format.space_before = Pt(16)
    nr = note.add_run(
        "Documento interno · Optick CRM · Manual de administración · octubre 2026. "
        "Pensado para imprimir y para capacitación en sala. No sustituye las Novedades del sistema. "
        "No es el manual del dueño de la plataforma."
    )
    set_run_font(nr, size=9, color=MUTED)

    doc.save(OUT)
    print(OUT.resolve())


if __name__ == "__main__":
    build()
