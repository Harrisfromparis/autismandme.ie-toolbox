#!/usr/bin/env python3
"""Export a teacher-approved iLEARN pathway as a short, accessible EPUB 3."""
import argparse
import html
import json
import re
import uuid
import zipfile
from pathlib import Path


def escape(value):
    return html.escape(str(value or ""), quote=True)


def paragraphs(value):
    return "".join(f"<p>{escape(line)}</p>" for line in str(value or "").splitlines() if line.strip())


def create(pathway, resources, destination):
    if pathway.get("approvalStatus") != "approved" or pathway.get("status") not in ("approved", "published"):
        raise ValueError("A teacher must approve this pathway before ebook export")
    blocks = pathway.get("blocks", [])
    if len(blocks) != 8 or sorted(b.get("order") for b in blocks) != list(range(1, 9)):
        raise ValueError("An ebook needs all eight ordered learning stages")
    title = str(pathway.get("title") or "iLEARN lesson")
    aim = str(pathway.get("learningAim") or "")
    if not aim: raise ValueError("A learning aim is required")
    resource_by_id = {str(r.get("resourceId")): r for r in resources if r.get("resourceId")}
    chapters = []
    for block in sorted(blocks, key=lambda b: b["order"]):
        links = []
        for identifier in block.get("resourceIds", []):
            item = resource_by_id.get(str(identifier))
            if item and item.get("approved") is True and item.get("reviewStatus") == "Verified":
                url = str(item.get("sourceUrl") or "")
                if re.fullmatch(r"https://[^\s<>\"]+", url):
                    links.append(f'<li><a href="{escape(url)}">{escape(item.get("title") or "Source")}</a> — {escape(item.get("sourceOrganisation") or "")}</li>')
        heading = escape(block.get("heading") or f"Step {block['order']}")
        chapters.append(f'<section id="step-{block["order"]}"><h2>{block["order"]}. {heading}</h2>{paragraphs(block.get("content"))}{"<h3>Approved sources</h3><ul>" + "".join(links) + "</ul>" if links else ""}</section>')
    xhtml = f'''<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="en"><head><title>{escape(title)}</title><link rel="stylesheet" href="style.css" type="text/css"/></head>
<body><main><h1>{escape(title)}</h1><p><strong>Learning aim:</strong> {escape(aim)}</p><p>Read one step at a time. You may pause and return. Choose a response format agreed with your teacher.</p>{''.join(chapters)}</main></body></html>'''
    nav = f'''<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="en"><head><title>Contents</title></head><body><nav epub:type="toc" id="toc"><h1>Contents</h1><ol>{''.join(f'<li><a href="lesson.xhtml#step-{b["order"]}">{escape(b.get("heading") or "Step")}</a></li>' for b in sorted(blocks, key=lambda b:b["order"]))}</ol></nav></body></html>'''
    uid = str(uuid.uuid5(uuid.NAMESPACE_URL, str(pathway.get("pathwayId") or title)))
    package = f'''<?xml version="1.0" encoding="utf-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="bookid">urn:uuid:{uid}</dc:identifier><dc:title>{escape(title)}</dc:title><dc:language>en</dc:language><dc:creator>iLEARN teacher-approved lesson</dc:creator></metadata><manifest><item id="lesson" href="lesson.xhtml" media-type="application/xhtml+xml"/><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="style" href="style.css" media-type="text/css"/></manifest><spine><itemref idref="lesson"/></spine></package>'''
    container = '''<?xml version="1.0" encoding="utf-8"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/package.opf" media-type="application/oebps-package+xml"/></rootfiles></container>'''
    css = "body{font-family:system-ui,sans-serif;line-height:1.65;max-width:42em;margin:auto;color:#16283a}section{break-before:page;margin-block:2em}a{color:#16466d}p{margin-block:0.8em}@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important}}"
    with zipfile.ZipFile(destination, "w") as book:
        book.writestr("mimetype", "application/epub+zip", compress_type=zipfile.ZIP_STORED)
        for name, content in (("META-INF/container.xml", container), ("OEBPS/package.opf", package), ("OEBPS/nav.xhtml", nav), ("OEBPS/lesson.xhtml", xhtml), ("OEBPS/style.css", css)):
            book.writestr(name, content, compress_type=zipfile.ZIP_DEFLATED)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pathway", required=True, help="Teacher-approved pathway JSON")
    parser.add_argument("--resources", required=True, help="Verified resource JSON array")
    parser.add_argument("--output", required=True, help="Destination .epub")
    args = parser.parse_args()
    pathway = json.loads(Path(args.pathway).read_text(encoding="utf8"))
    resources = json.loads(Path(args.resources).read_text(encoding="utf8"))
    create(pathway, resources, args.output)
    print(f"Created {args.output}")


if __name__ == "__main__": main()
