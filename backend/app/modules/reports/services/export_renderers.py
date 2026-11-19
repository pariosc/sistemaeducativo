from datetime import date, datetime
from html import escape
from io import BytesIO
from zipfile import ZIP_DEFLATED, ZipFile


def _text(value: object) -> str:
    if value is None:
        return "—"
    if isinstance(value, datetime):
        return (
            value.astimezone().strftime("%Y-%m-%d %H:%M")
            if value.tzinfo
            else value.strftime("%Y-%m-%d %H:%M")
        )
    if isinstance(value, date):
        return value.isoformat()
    return str(value)


def _column_name(number: int) -> str:
    result = ""
    while number:
        number, remainder = divmod(number - 1, 26)
        result = chr(65 + remainder) + result
    return result


def render_xlsx(title: str, headers: list[str], rows: list[list[object]]) -> bytes:
    output = BytesIO()
    now = datetime.now().astimezone().strftime("Generado: %Y-%m-%d %H:%M %Z")
    all_rows = [headers, *rows]
    final_col = _column_name(max(1, len(headers)))
    final_row = max(3, len(rows) + 3)
    worksheet_rows: list[str] = []

    def cell(ref: str, value: object, style: int = 0) -> str:
        style_attr = f' s="{style}"' if style else ""
        if isinstance(value, bool):
            return f'<c r="{ref}"{style_attr} t="b"><v>{1 if value else 0}</v></c>'
        if isinstance(value, (int, float)):
            return f'<c r="{ref}"{style_attr}><v>{value}</v></c>'
        value_text = escape(_text(value))
        return (
            f'<c r="{ref}"{style_attr} t="inlineStr"><is>'
            f'<t xml:space="preserve">{value_text}</t></is></c>'
        )

    worksheet_rows.append(f'<row r="1" ht="28" customHeight="1">{cell("A1", title, 1)}</row>')
    worksheet_rows.append(f'<row r="2" ht="20" customHeight="1">{cell("A2", now, 2)}</row>')
    for row_number, row in enumerate(all_rows, start=3):
        cells = []
        for column_number, value in enumerate(row, start=1):
            style = 3 if row_number == 3 else (4 if row_number % 2 == 0 else 0)
            cells.append(cell(f"{_column_name(column_number)}{row_number}", value, style))
        worksheet_rows.append(f'<row r="{row_number}">{"".join(cells)}</row>')

    col_defs = []
    for column_number, header in enumerate(headers, start=1):
        values = [_text(row[column_number - 1]) for row in rows if len(row) >= column_number]
        width = min(max(max([len(header), *(len(value) for value in values[:100])]) + 2, 12), 48)
        col_defs.append(
            f'<col min="{column_number}" max="{column_number}" width="{width}" customWidth="1"/>'
        )

    worksheet = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        f'<dimension ref="A1:{final_col}{final_row}"/>'
        '<sheetViews><sheetView workbookViewId="0"><pane ySplit="3" topLeftCell="A4" '
        'activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
        f"<cols>{''.join(col_defs)}</cols>"
        f"<sheetData>{''.join(worksheet_rows)}</sheetData>"
        f'<autoFilter ref="A3:{final_col}{final_row}"/>'
        f'<mergeCells count="1"><mergeCell ref="A1:{final_col}1"/></mergeCells>'
        '<pageMargins left="0.3" right="0.3" top="0.5" bottom="0.5" header="0.2" footer="0.2"/>'
        "</worksheet>"
    )
    styles = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        '<fonts count="4"><font><sz val="10"/><name val="Arial"/></font>'
        '<font><b/><sz val="16"/><color rgb="FF173B5E"/><name val="Arial"/></font>'
        '<font><i/><sz val="9"/><color rgb="FF667085"/><name val="Arial"/></font>'
        '<font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Arial"/></font></fonts>'
        '<fills count="4"><fill><patternFill patternType="none"/></fill>'
        '<fill><patternFill patternType="gray125"/></fill>'
        '<fill><patternFill patternType="solid"><fgColor rgb="FF173B5E"/></patternFill></fill>'
        '<fill><patternFill patternType="solid"><fgColor rgb="FFF2F5F8"/></patternFill></fill>'
        "</fills>"
        '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
        '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>'
        "</cellStyleXfs>"
        '<cellXfs count="5"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
        '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>'
        '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>'
        '<xf numFmtId="0" fontId="3" fillId="2" borderId="0" xfId="0" '
        'applyFont="1" applyFill="1" applyAlignment="1">'
        '<alignment vertical="center" wrapText="1"/></xf>'
        '<xf numFmtId="0" fontId="0" fillId="3" borderId="0" xfId="0" applyFill="1"/></cellXfs>'
        '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
        "</styleSheet>"
    )
    content_types = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.'
        'relationships+xml"/>'
        '<Default Extension="xml" ContentType="application/xml"/>'
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-'
        'officedocument.spreadsheetml.sheet.main+xml"/>'
        '<Override PartName="/xl/worksheets/sheet1.xml" '
        'ContentType="application/vnd.openxmlformats-'
        'officedocument.spreadsheetml.worksheet+xml"/>'
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-'
        'officedocument.spreadsheetml.styles+xml"/>'
        "</Types>"
    )
    root_rels = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/'
        '2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
        "</Relationships>"
    )
    workbook = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        "<bookViews><workbookView/></bookViews><sheets>"
        '<sheet name="Reporte" sheetId="1" r:id="rId1"/></sheets>'
        '<calcPr calcId="191029"/></workbook>'
    )
    workbook_rels = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/'
        '2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/'
        '2006/relationships/styles" Target="styles.xml"/>'
        "</Relationships>"
    )
    del all_rows
    with ZipFile(output, "w", ZIP_DEFLATED) as archive:
        archive.writestr("[Content_Types].xml", content_types)
        archive.writestr("_rels/.rels", root_rels)
        archive.writestr("xl/workbook.xml", workbook)
        archive.writestr("xl/_rels/workbook.xml.rels", workbook_rels)
        archive.writestr("xl/worksheets/sheet1.xml", worksheet)
        archive.writestr("xl/styles.xml", styles)
    return output.getvalue()


def _pdf_text(value: object) -> str:
    return _text(value).encode("cp1252", "replace").hex().upper()


def _wrap(value: object, max_chars: int) -> list[str]:
    words = _text(value).split()
    if not words:
        return [""]
    lines: list[str] = []
    current = words[0]
    for word in words[1:]:
        if len(current) + len(word) + 1 <= max_chars:
            current += f" {word}"
        else:
            lines.append(current)
            current = word
    lines.append(current)
    return lines[:4]


def render_pdf(title: str, headers: list[str], rows: list[list[object]]) -> bytes:
    page_width, page_height = 842, 595
    left, available_width, font_size = 32, 778, 7
    weights = [
        min(
            max(max([len(header), *(len(_text(row[i])) for row in rows[:60] if len(row) > i)]), 8),
            42,
        )
        for i, header in enumerate(headers)
    ]
    total_weight = sum(weights) or 1
    widths = [available_width * weight / total_weight for weight in weights]
    pages: list[bytearray] = []

    def draw_page_heading(content: bytearray, page_num: int) -> float:
        content.extend(b"q 0.09 0.23 0.37 rg 0 565 842 30 re f Q\n")
        content.extend(b"BT /F1 15 Tf 32 574 Td <" + _pdf_text(title).encode() + b"> Tj ET\n")
        content.extend(
            b"BT /F1 8 Tf 32 548 Td <"
            + _pdf_text("Sistema Web de Gestión Académica").encode()
            + b"> Tj ET\n"
        )
        content.extend(
            b"BT /F1 8 Tf 650 548 Td <" + _pdf_text(f"Página {page_num}").encode() + b"> Tj ET\n"
        )
        y_top = 525
        x = left
        header_height = 24
        content.extend(b"q 0.09 0.23 0.37 rg\n")
        rectangle = f"{left:.2f} {y_top - header_height:.2f} "
        rectangle += f"{available_width:.2f} {header_height:.2f} re f Q\n"
        content.extend(rectangle.encode())
        for index, header in enumerate(headers):
            max_chars = max(6, int((widths[index] - 8) / (font_size * 0.54)))
            line = _wrap(header, max_chars)[0]
            content.extend(
                f"BT /F1 7 Tf {x + 4:.2f} {y_top - 15:.2f} Td <{_pdf_text(line)}> Tj ET\n".encode()
            )
            x += widths[index]
        return y_top - header_height

    current = bytearray()
    y = draw_page_heading(current, 1)
    pages.append(current)
    for row_index, row in enumerate(rows):
        wrapped = [
            _wrap(value, max(6, int((widths[index] - 8) / (font_size * 0.54))))
            for index, value in enumerate(row)
        ]
        row_height = max(20, max(len(lines) for lines in wrapped) * 9 + 8)
        if y - row_height < 38:
            current = bytearray()
            pages.append(current)
            y = draw_page_heading(current, len(pages))
        if row_index % 2 == 1:
            current.extend(b"q 0.95 0.97 0.98 rg\n")
            rectangle = f"{left:.2f} {y - row_height:.2f} "
            rectangle += f"{available_width:.2f} {row_height:.2f} re f Q\n"
            current.extend(rectangle.encode())
        current.extend(b"q 0.80 0.84 0.88 RG 0.4 w\n")
        rectangle = f"{left:.2f} {y - row_height:.2f} "
        rectangle += f"{available_width:.2f} {row_height:.2f} re S Q\n"
        current.extend(rectangle.encode())
        x = left
        for index, lines in enumerate(wrapped):
            for line_index, line in enumerate(lines):
                baseline = y - 12 - (line_index * 9)
                text_command = f"BT /F1 {font_size} Tf {x + 4:.2f} "
                text_command += f"{baseline:.2f} Td <{_pdf_text(line)}> Tj ET\n"
                current.extend(text_command.encode())
            x += widths[index]
        y -= row_height
    for page_num, content in enumerate(pages, start=1):
        generated = datetime.now().astimezone().strftime("%Y-%m-%d %H:%M")
        footer = f"Generado {generated} · Página {page_num}"
        content.extend(f"BT /F1 7 Tf 32 22 Td <{_pdf_text(footer)}> Tj ET\n".encode())

    objects: list[bytes] = [b""]
    objects.append(b"<< /Type /Catalog /Pages 2 0 R >>")
    page_object_ids = [4 + index * 2 for index in range(len(pages))]
    kids = " ".join(f"{identifier} 0 R" for identifier in page_object_ids)
    objects.append(f"<< /Type /Pages /Kids [{kids}] /Count {len(pages)} >>".encode())
    objects.append(
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"
    )
    for index, content in enumerate(pages):
        page_id = page_object_ids[index]
        stream_id = page_id + 1
        objects.append(
            f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {page_width} {page_height}] "
            f"/Resources << /Font << /F1 3 0 R >> >> /Contents {stream_id} 0 R >>".encode()
        )
        stream = bytes(content)
        objects.append(
            b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"endstream"
        )

    pdf = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    offsets = [0]
    for object_id, payload in enumerate(objects[1:], start=1):
        offsets.append(len(pdf))
        pdf.extend(f"{object_id} 0 obj\n".encode() + payload + b"\nendobj\n")
    xref_offset = len(pdf)
    pdf.extend(f"xref\n0 {len(objects)}\n0000000000 65535 f \n".encode())
    for offset in offsets[1:]:
        pdf.extend(f"{offset:010d} 00000 n \n".encode())
    pdf.extend(
        f"trailer\n<< /Size {len(objects)} /Root 1 0 R >>\nstartxref\n{xref_offset}\n%%EOF".encode()
    )
    return bytes(pdf)
