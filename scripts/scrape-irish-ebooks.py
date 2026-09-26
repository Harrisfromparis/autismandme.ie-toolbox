#!/usr/bin/env python3
"""Index public Irish schoolbook catalogue metadata. No ebook text or account access."""
import argparse
import csv
import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request
import urllib.robotparser
import xml.etree.ElementTree as ET
from html.parser import HTMLParser

USER_AGENT = "iLEARN public catalogue indexer/1.0 (metadata only)"
SITES = {
    "Folens": ("https://folens.ie", "https://folens.ie/sitemap.xml"),
    "Gill Education": ("https://www.gilleducation.ie", "https://www.gilleducation.ie/sitemap.xml"),
    "Educate.ie": ("https://educate.ie", "https://educate.ie/wp-sitemap.xml"),
}
EXTRA_PAGES = {
    "Folens": ["https://folens.ie/pages/dive-in", "https://folens.ie/pages/dive-in-and-take-the-plunge", "https://folens.ie/pages/post-primary-english"],
}
SUBJECTS = ("English", "Irish", "Mathematics", "Maths", "Science", "Biology", "Chemistry", "Physics", "History", "Geography", "Business", "French", "Spanish", "German", "Home Economics", "Religion", "Art", "Music", "Engineering", "Technology", "Computer Science", "Accounting", "Economics")


class MetaParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.meta, self.jsonld, self.capture, self.page_text = {}, [], False, []

    def handle_starttag(self, tag, attrs):
        fields = dict(attrs)
        if tag == "meta":
            key = fields.get("property") or fields.get("name")
            if key: self.meta[key.lower()] = fields.get("content", "")
        if tag == "script" and fields.get("type") == "application/ld+json":
            self.capture = True
            self.jsonld.append("")

    def handle_data(self, data):
        if self.capture: self.jsonld[-1] += data
        else: self.page_text.append(data)

    def handle_endtag(self, tag):
        if tag == "script": self.capture = False


def get(url):
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=25) as response:
        if response.url.split("/")[2] != url.split("/")[2]:
            raise ValueError(f"Cross-host redirect refused: {response.url}")
        return response.read(4_000_000).decode("utf-8", errors="replace")


def sitemap_urls(root, sitemap, robot, seen=None, depth=0):
    seen = seen or set()
    if depth > 3 or sitemap in seen or not robot.can_fetch(USER_AGENT, sitemap): return []
    seen.add(sitemap)
    try: tree = ET.fromstring(get(sitemap))
    except (ValueError, ET.ParseError, urllib.error.URLError) as exc:
        print(f"Skipped sitemap {sitemap}: {exc}")
        return []
    locs = [node.text.strip() for node in tree.iter() if node.tag.endswith("}loc") and node.text]
    locs = [url for url in locs if urllib.parse.urlparse(url).netloc == urllib.parse.urlparse(root).netloc]
    if tree.tag.endswith("}sitemapindex"):
        result = []
        for url in locs:
            if "folens.ie" in root and "sitemap_pages" not in url: continue
            if "educate.ie" in root and "sitemap-posts-product" not in url: continue
            result.extend(sitemap_urls(root, url, robot, seen, depth + 1))
        return result
    return locs


def product_json(parser):
    def walk(value):
        if isinstance(value, list):
            for child in value: yield from walk(child)
        elif isinstance(value, dict):
            if "Product" in str(value.get("@type", "")): yield value
            for child in value.get("@graph", []): yield from walk(child)
    for script in parser.jsonld:
        try:
            for item in walk(json.loads(script)): return item
        except json.JSONDecodeError: pass
    return {}


def classify(publisher, url, parser):
    product = product_json(parser)
    title = str(product.get("name") or parser.meta.get("og:title") or "").strip()
    description = str(product.get("description") or parser.meta.get("og:description") or parser.meta.get("description") or "").strip()
    text = f"{title} {description} {url}".lower()
    ebook_named = re.search(r"ebook|e-book|digital edition", f"{title} {url}", re.I)
    publisher_programme = publisher == "Folens" and "/pages/" in url and re.search(r"ebook|e-book", " ".join(parser.page_text), re.I)
    if not title or not (ebook_named or publisher_programme):
        return None
    if "junior cycle" in text or "junior cert" in text: cycle = "JC"
    elif "leaving cert" in text or "senior cycle" in text: cycle = "LC"
    else: cycle = ""
    subject = next((name for name in SUBJECTS if re.search(r"\b" + re.escape(name.lower()) + r"\b", title.lower())), "")
    if not subject:
        subject = next((name for name in SUBJECTS if re.search(r"\b" + re.escape(name.lower()) + r"\b", description.lower())), "")
    if not cycle and not subject and "post-primary" not in text and "post primary" not in text: return None
    return {
        "publisher": publisher, "title": title[:250], "description": re.sub(r"\s+", " ", description)[:500],
        "sourceUrl": url, "cycle": cycle, "subject": subject, "chapter": "", "licence": "Check publisher terms",
        "access": "Publisher ebook access may require a licence", "outcomeIds": "",
        "verified": "false", "approved": "false", "resourceType": "DigitalTextbook",
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", default="irish-ebook-candidates.csv")
    parser.add_argument("--max-pages", type=int, default=100, help="Maximum candidate pages per publisher; 0 means all")
    parser.add_argument("--delay", type=float, default=1.0)
    parser.add_argument("--publisher", choices=list(SITES), help="Run one publisher only")
    args = parser.parse_args()
    if args.delay < 0.5: parser.error("Use a delay of at least 0.5 seconds")
    records = []
    for publisher, (root, sitemap) in SITES.items():
        if args.publisher and args.publisher != publisher: continue
        robots = urllib.robotparser.RobotFileParser()
        robots.set_url(root + "/robots.txt")
        try: robots.read()
        except Exception as exc:
            print(f"Skipping {publisher}: could not read robots.txt ({exc})")
            continue
        urls = sitemap_urls(root, sitemap, robots)
        # Prioritise ebook/product pages over publisher news and general content.
        candidates = [url for url in urls if re.search(r"ebook|e-book|/product/|/products/|/post-primary/", url, re.I)]
        candidates = list(dict.fromkeys(EXTRA_PAGES.get(publisher, []) + candidates))
        candidates.sort(key=lambda url: (not bool(re.search(r"ebook|e-book", url, re.I)), url))
        if args.max_pages: candidates = candidates[:args.max_pages]
        print(f"{publisher}: checking {len(candidates)} public catalogue pages")
        for url in candidates:
            if not robots.can_fetch(USER_AGENT, url): continue
            try:
                page = MetaParser(); page.feed(get(url))
                item = classify(publisher, url, page)
                if item: records.append(item)
            except urllib.error.HTTPError as exc:
                if exc.code in (403, 429):
                    print(f"Stopping {publisher}: access restricted ({exc.code})")
                    break
                print(f"Skipped {url}: HTTP {exc.code}")
            except (urllib.error.URLError, ValueError) as exc:
                print(f"Skipped {url}: {exc}")
            time.sleep(args.delay)
    fields = ["publisher", "title", "description", "sourceUrl", "cycle", "subject", "chapter", "licence", "access", "outcomeIds", "verified", "approved", "resourceType"]
    with open(args.output, "w", newline="", encoding="utf-8-sig") as output:
        writer = csv.DictWriter(output, fields); writer.writeheader(); writer.writerows(records)
    print(f"Wrote {len(records)} unapproved catalogue candidates to {args.output}")


if __name__ == "__main__": main()
