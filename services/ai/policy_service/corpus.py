"""
Regulation corpus: loading and clause-aware chunking.

Layout: <corpus>/<JURISDICTION>/<document>.(txt|md|pdf), JURISDICTION one of
GLOBAL, IN, EU, US. A text document may start with header lines such as
    # code: GDPR
    # title: General Data Protection Regulation (EU) 2016/679
    # authority: official | summary
Chunks are split on legal headings (Article 5, Section 16, Recommendation 10,
"3.2 Heading") so each chunk has a citable id like "GDPR:Article 5".
"""

import re
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Dict, List

JURISDICTIONS = ("GLOBAL", "IN", "EU", "US")
MAX_CHUNK_CHARS = 1500

HEADING_RE = re.compile(
    r"^\s*(?:(?P<kind>Article|Art\.|Section|Sec\.|Chapter|Paragraph|Para\.?|Recommendation|Rule|Regulation|Clause|Requirement)"
    r"\s+(?P<num>[0-9]+[A-Za-z]?(?:\.[0-9]+)*)"
    r"|(?P<plain>[0-9]+(?:\.[0-9]+)*)[.)]\s+(?=[A-Z]))",
)
HEADER_RE = re.compile(r"^#\s*(code|title|authority|url)\s*:\s*(.+)$", re.I)


@dataclass
class Chunk:
    id: str
    jurisdiction: str
    code: str
    title: str
    authority: str
    label: str
    text: str
    source: str

    def to_dict(self) -> dict:
        return asdict(self)


def _read(path: Path) -> str:
    if path.suffix.lower() == ".pdf":
        from pypdf import PdfReader

        return "\n".join(page.extract_text() or "" for page in PdfReader(str(path)).pages)
    return path.read_text(encoding="utf-8", errors="ignore")


def _split_long(label: str, text: str) -> List[tuple]:
    if len(text) <= MAX_CHUNK_CHARS:
        return [(label, text)]
    parts, buf = [], ""
    for para in re.split(r"\n\s*\n", text):
        if buf and len(buf) + len(para) > MAX_CHUNK_CHARS:
            parts.append(buf)
            buf = ""
        buf = f"{buf}\n\n{para}" if buf else para
    if buf:
        parts.append(buf)
    return [(label if i == 0 else f"{label} (part {i + 1})", p) for i, p in enumerate(parts)]


def chunk_document(text: str, jurisdiction: str, source: str) -> List[Chunk]:
    meta: Dict[str, str] = {}
    body_lines = []
    for line in text.splitlines():
        m = HEADER_RE.match(line)
        if m and not body_lines:
            meta[m.group(1).lower()] = m.group(2).strip()
        else:
            body_lines.append(line)
    stem = Path(source).stem
    code = meta.get("code") or re.sub(r"[^A-Z0-9]+", "_", stem.upper()).strip("_")[:24]
    title = meta.get("title") or stem.replace("_", " ")
    authority = meta.get("authority", "official")

    sections: List[tuple] = []
    label, buf = "Preamble", []
    in_legal_unit = False
    for line in body_lines:
        m = HEADING_RE.match(line)
        # Numbered paragraphs inside an Article/Section stay with it ("Article 5" keeps its "1. ...").
        if m and m.group("plain") and in_legal_unit:
            m = None
        if m:
            in_legal_unit = bool(m.group("kind"))
            if "".join(buf).strip():
                sections.append((label, "\n".join(buf).strip()))
            kind = (m.group("kind") or "Section").rstrip(".")
            kind = {"Art": "Article", "Sec": "Section", "Para": "Paragraph"}.get(kind, kind)
            label = f"{kind} {m.group('num') or m.group('plain')}"
            buf = [line]
        else:
            buf.append(line)
    if "".join(buf).strip():
        sections.append((label, "\n".join(buf).strip()))

    chunks: List[Chunk] = []
    seen: Dict[str, int] = {}
    for label, section in sections:
        for sub_label, sub_text in _split_long(label, section):
            cid = f"{code}:{sub_label}"
            if cid in seen:
                seen[cid] += 1
                cid = f"{cid} [{seen[cid]}]"
            else:
                seen[cid] = 1
            chunks.append(Chunk(cid, jurisdiction, code, title, authority, sub_label, sub_text, source))
    return chunks


def load_corpus(root: Path) -> List[Chunk]:
    chunks: List[Chunk] = []
    for jurisdiction in JURISDICTIONS:
        folder = root / jurisdiction
        if not folder.is_dir():
            continue
        for path in sorted(folder.iterdir()):
            if path.suffix.lower() in (".txt", ".md", ".pdf"):
                chunks.extend(chunk_document(_read(path), jurisdiction, f"{jurisdiction}/{path.name}"))
    return chunks
