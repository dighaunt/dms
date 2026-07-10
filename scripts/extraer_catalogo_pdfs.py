#!/usr/bin/env python3
"""Extrae el contrato AcroForm de los formatos oficiales.

El resultado es un artefacto versionado que la aplicacion consume en runtime.
No ejecuta JavaScript de Acrobat: solo inventaria sus acciones para que el
motor de reglas del servidor pueda reproducirlas de forma determinista.
"""

from __future__ import annotations

import json
import re
import unicodedata
from pathlib import Path
from typing import Any

import pdfplumber
from pypdf import PdfReader


ROOT = Path(__file__).resolve().parents[1]
PDF_DIR = ROOT / "public" / "formatos"
OUTPUT = ROOT / "src" / "lib" / "formularios" / "catalogo-generado.json"

PUSHBUTTON_FLAG = 1 << 16
RADIO_FLAG = 1 << 15
MULTILINE_FLAG = 1 << 12


def clean(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip(" ·:-")


def slug(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    ascii_value = "".join(c for c in normalized if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", "_", ascii_value.lower()).strip("_")


def lines(words: list[dict[str, Any]]) -> list[dict[str, Any]]:
    grouped: list[list[dict[str, Any]]] = []
    for word in sorted(words, key=lambda item: (item["top"], item["x0"])):
        center = (word["top"] + word["bottom"]) / 2
        target = next(
            (
                group
                for group in grouped
                if abs(
                    center
                    - sum((w["top"] + w["bottom"]) / 2 for w in group) / len(group)
                )
                <= 2.2
            ),
            None,
        )
        if target is None:
            target = []
            grouped.append(target)
        target.append(word)

    result = []
    for group in grouped:
        ordered = sorted(group, key=lambda item: item["x0"])
        result.append(
            {
                "top": min(w["top"] for w in ordered),
                "bottom": max(w["bottom"] for w in ordered),
                "x0": min(w["x0"] for w in ordered),
                "x1": max(w["x1"] for w in ordered),
                "text": clean(" ".join(w["text"] for w in ordered)),
                "words": ordered,
            }
        )
    return result


def label_above(page_lines: list[dict[str, Any]], rect: tuple[float, ...]) -> str:
    x0, top, x1, _ = rect
    candidates = []
    for line in page_lines:
        distance = top - line["bottom"]
        if not (0 <= distance <= 25):
            continue
        selected = [
            word["text"]
            for word in line["words"]
            if x0 - 2 <= (word["x0"] + word["x1"]) / 2 <= x1 + 2
        ]
        if selected:
            candidates.append((distance, clean(" ".join(selected))))
    return min(candidates, default=(999, ""), key=lambda item: item[0])[1]


def column_above(page_lines: list[dict[str, Any]], rect: tuple[float, ...]) -> str:
    """Busca el encabezado de columna para celdas de tablas repetitivas."""
    x0, top, x1, _ = rect
    candidates = []
    for line in page_lines:
        distance = top - line["bottom"]
        if not (0 <= distance <= 150):
            continue
        selected = [
            word["text"]
            for word in line["words"]
            if x0 - 2 <= (word["x0"] + word["x1"]) / 2 <= x1 + 2
            and (word["text"].isupper() or any(char.isdigit() for char in word["text"]))
        ]
        if selected:
            candidates.append((distance, clean(" ".join(selected))))
    return min(candidates, default=(999, ""), key=lambda item: item[0])[1]


def label_left(page_lines: list[dict[str, Any]], rect: tuple[float, ...]) -> str:
    x0, top, _, bottom = rect
    center = (top + bottom) / 2
    candidates = []
    for line in page_lines:
        line_center = (line["top"] + line["bottom"]) / 2
        if abs(center - line_center) > 4 or line["x1"] > x0 + 2:
            continue
        distance = x0 - line["x1"]
        if 0 <= distance <= 260:
            candidates.append((distance, line["text"]))
    return min(candidates, default=(999, ""), key=lambda item: item[0])[1]


def label_right(page_lines: list[dict[str, Any]], rect: tuple[float, ...]) -> str:
    _, top, x1, bottom = rect
    center = (top + bottom) / 2
    candidates = []
    for line in page_lines:
        line_center = (line["top"] + line["bottom"]) / 2
        if abs(center - line_center) > 4:
            continue
        text_words = [w for w in line["words"] if x1 - 1 <= w["x0"] <= x1 + 160]
        if text_words:
            candidates.append((line["x0"] - x1, clean(" ".join(w["text"] for w in text_words))))
    return min(candidates, default=(999, ""), key=lambda item: item[0])[1]


def section_for(page_lines: list[dict[str, Any]], top: float, page: int) -> tuple[str, str]:
    candidates = [
        line
        for line in page_lines
        if line["bottom"] <= top and re.match(r"^PARTE\s+[IVX]+\b", line["text"])
    ]
    if not candidates:
        return f"pagina_{page + 1}", f"Pagina {page + 1}"
    line = max(candidates, key=lambda item: item["bottom"])
    text = clean(line["text"])
    return slug(text), text.title()


def action_scripts(field: dict[str, Any]) -> dict[str, str]:
    result: dict[str, str] = {}
    for event, action in (field.get("/AA") or {}).items():
        value = action.get_object().get("/JS")
        if value:
            result[str(event).lstrip("/")] = str(value)
    return result


def input_type(label: str, field_type: str, flags: int, scripts: dict[str, str]) -> str:
    upper = label.upper()
    script = " ".join(scripts.values())
    if field_type == "/Btn":
        return "radio" if flags & RADIO_FLAG else "boolean"
    if flags & MULTILINE_FLAG:
        return "textarea"
    if "CORREO" in upper:
        return "email"
    if "TELÉFONO" in upper or "TELEFONO" in upper:
        return "tel"
    if "FECHA" in upper and not any(word in upper for word in ("FIRMA", "OBSERV")):
        return "date"
    if "util.printf" in script or any(
        word in upper
        for word in ("MONTO ($)", "PRECIO", "COSTO", "KILOMETRAJE", "DÍAS", "DIAS")
    ):
        return "number"
    return "text"


def options(field: dict[str, Any], field_type: str, flags: int) -> list[str]:
    if field_type != "/Btn":
        return []
    states = [str(value).lstrip("/") for value in field.get("/_States_", [])]
    values = [value for value in states if value not in {"Off", "Type", "Subtype", "BBox", "Resources"}]
    if flags & RADIO_FLAG:
        return list(dict.fromkeys(values))
    return ["SI", "NO"]


def widgets(reader: PdfReader) -> dict[str, list[dict[str, Any]]]:
    result: dict[str, list[dict[str, Any]]] = {}
    for page_index, page in enumerate(reader.pages):
        height = float(page.mediabox.height)
        for reference in page.get("/Annots", []):
            widget = reference.get_object()
            if widget.get("/Subtype") != "/Widget":
                continue
            parent_ref = widget.get("/Parent")
            parent = parent_ref.get_object() if parent_ref else widget
            name = parent.get("/T") or widget.get("/T")
            if not name:
                continue
            raw = [float(value) for value in widget["/Rect"]]
            rect = (raw[0], height - raw[3], raw[2], height - raw[1])
            result.setdefault(str(name), []).append(
                {
                    "page": page_index,
                    "rect": [round(value, 2) for value in rect],
                }
            )
    return result


def extract(pdf_path: Path) -> dict[str, Any]:
    reader = PdfReader(str(pdf_path))
    form_fields = reader.get_fields() or {}
    widget_map = widgets(reader)

    with pdfplumber.open(pdf_path) as document:
        page_lines = [lines(page.extract_words()) for page in document.pages]

    fields = []
    section_order: list[tuple[str, str]] = []
    for order, (name, field) in enumerate(form_fields.items()):
        field_type = str(field.get("/FT", ""))
        flags = int(field.get("/Ff", 0))
        if field_type == "/Btn" and flags & PUSHBUTTON_FLAG:
            continue
        field_widgets = widget_map.get(name, [])
        if not field_widgets:
            continue
        first = field_widgets[0]
        page = first["page"]
        rect = tuple(first["rect"])
        section_id, section_label = section_for(page_lines[page], rect[1], page)
        if (section_id, section_label) not in section_order:
            section_order.append((section_id, section_label))

        above = label_above(page_lines[page], rect)
        column = column_above(page_lines[page], rect)
        left = label_left(page_lines[page], rect)
        right = label_right(page_lines[page], rect)
        if field_type == "/Btn":
            inferred = right or above or left
        elif left and rect[2] - rect[0] < 190 and rect[3] - rect[1] <= 11:
            inferred = clean(f"{left} - {above or column}") if above or column else left
        else:
            inferred = above or left or column
        scripts = action_scripts(field)
        label = inferred or f"Campo {order + 1}"
        resolved_input = input_type(label, field_type, flags, scripts)
        if resolved_input == "textarea" and rect[3] - rect[1] < 20:
            resolved_input = "text"
        fields.append(
            {
                "name": name,
                "label": label,
                "section": section_id,
                "page": page + 1,
                "acroType": field_type.lstrip("/"),
                "inputType": resolved_input,
                "required": True,
                "multiline": bool(flags & MULTILINE_FLAG),
                "options": options(field, field_type, flags),
                "scripts": scripts,
                "widgets": field_widgets,
                "order": order,
            }
        )

    return {
        "code": pdf_path.stem,
        "pages": len(reader.pages),
        "fieldCount": len(fields),
        "sections": [{"id": key, "label": label} for key, label in section_order],
        "fields": fields,
    }


def main() -> None:
    templates = {pdf.stem: extract(pdf) for pdf in sorted(PDF_DIR.glob("*.pdf"))}
    payload = {"schemaVersion": 1, "templates": templates}
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(
        f"{OUTPUT.relative_to(ROOT)}: "
        f"{len(templates)} formatos, "
        f"{sum(template['fieldCount'] for template in templates.values())} campos operativos"
    )


if __name__ == "__main__":
    main()
