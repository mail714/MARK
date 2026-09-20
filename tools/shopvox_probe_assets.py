#!/usr/bin/env python3
"""
shopVOX asset probe — where does shopVOX keep the attachments?
==============================================================
Point this at ONE transaction you know has a PDF on it and it will tell
you, definitively, which endpoint serves the attachments and what the
fields are called.

Self-contained on purpose: it needs nothing but Python, so it does not
care which version of shopvox_export_all.py you have, or what folder you
run it from. The detection code below is a straight copy of the
exporter's, so a "found it" here means the exporter will find it too.

HOW TO USE
  1. python shopvox_probe_assets.py
  2. Paste your cookie, type a transaction number you KNOW has a PDF
     attached — "SO51172", "QT 58232", or the raw id — and hit Probe.

WHAT YOU GET, in the folder you pick
  asset-probe-<number>-FULL.json
        The whole payload. Your data — keep it.
  asset-probe-<number>-STRUCTURE.txt
        The same thing with every value stripped out: field names and
        value *shapes* only, no customer names, no addresses, no prices,
        no file names. This is the one to send me — it is all I need to
        wire the exporter up, and it carries nothing private.
"""

import json
import os
import queue
import re
import threading
import time
import tkinter as tk
import urllib.error
import urllib.parse
import urllib.request
from tkinter import filedialog, messagebox, scrolledtext, ttk

# ---------------------------------------------------------------------------
# Copied verbatim from shopvox_export_all.py so this file stands alone.
# ---------------------------------------------------------------------------

BASE = "https://api.shopvox.com/edge"

TARGETS = {
    "companies":   ["companies"],
    "contacts":    ["contacts"],
    "quotes":      ["transactions/quotes", "transactions?type=quote", "quotes"],
    "salesOrders": ["transactions/work_orders", "transactions?type=work_order",
                    "work_orders", "sales_orders"],
    "invoices":    ["transactions/invoices", "transactions?type=invoice",
                    "invoices"],
}

DETAIL_PATHS_BY_KIND = {
    "quotes":      ["transactions/quotes/{id}"],
    "salesOrders": ["transactions/work_orders/{id}"],
    "invoices":    ["transactions/invoices/{id}"],
}

TIMEOUT = 30

class AuthExpired(Exception):
    """Cookie no longer valid — stop cleanly so progress is kept."""

def make_get(cookie):
    cookie = " ".join(cookie.split())

    def get(path):
        req = urllib.request.Request(f"{BASE}/{path}", headers={
            "Cookie": cookie,
            "Accept": "application/json, text/plain, */*",
            "Origin": "https://express.shopvox.com",
            "Referer": "https://express.shopvox.com/",
            "User-Agent": "Mozilla/5.0",
            # Required. Without it the API 403s even on paths that exist —
            # this is what made an earlier address probe look like a dead
            # endpoint when it was only a missing header.
            "x-shopvox-client": "web",
        })
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            return json.loads(r.read().decode("utf-8", "replace"))
    return get

def get_with_retry(get, path, tries=3):
    """One GET, retried on transient failures. 401/403 aborts the run."""
    for attempt in range(tries):
        try:
            return get(path)
        except urllib.error.HTTPError as e:
            if e.code in (401, 403):
                raise AuthExpired(f"HTTP {e.code} on /{path}")
            if e.code in (429, 500, 502, 503, 504) and attempt < tries - 1:
                time.sleep(2 ** attempt)
                continue
            raise
        except Exception:
            if attempt < tries - 1:
                time.sleep(2 ** attempt)
                continue
            raise
    return None

def arr_key(obj):
    """The array in a list response, whatever it happens to be called."""
    best_k, best_n = None, -1
    for k, v in obj.items():
        if k == "meta":
            continue
        if isinstance(v, list) and len(v) > best_n:
            best_k, best_n = k, len(v)
    return best_k

KIND_PATH = {"quotes": "quotes", "salesOrders": "work_orders",
             "invoices": "invoices"}

KIND_ASSETABLE = {"quotes": "Quote", "salesOrders": "WorkOrder",
                  "invoices": "Invoice"}

NUMBER_KEYS = ("txnNumber", "transactionNumber", "number", "quoteNumber",
               "salesOrderNumber", "workOrderNumber", "invoiceNumber",
               "orderNumber", "docNumber", "name", "title")

NUM_RE = re.compile(r"^(?:(?:QT|SO|WO|IN|INV|EST)[\s\-_#]*)?(\d{2,})$", re.I)

def core_number(value):
    """'QT 58232' / 'SO51172' / 58232  ->  '58232'. None if it isn't one."""
    if value is None:
        return None
    m = NUM_RE.match(str(value).strip())
    return m.group(1) if m else None

def txn_number(rec):
    if not isinstance(rec, dict):
        return None
    for k in NUMBER_KEYS:
        n = core_number(rec.get(k))
        if n:
            return n
    return None

NAME_KEYS = ("fileFileName", "fileName", "filename", "originalFilename",
             "originalName", "assetFileName", "displayName", "name", "title")

URL_KEYS = ("url", "fileUrl", "assetUrl", "downloadUrl", "publicUrl",
            "originalUrl", "viewUrl", "s3Url", "link", "href", "file",
            "attachment", "asset", "document", "path")

NESTED_URL_KEYS = ("url", "original", "originalUrl", "downloadUrl", "href",
                   "large", "public")

CTYPE_KEYS = ("fileContentType", "contentType", "mimeType", "mime", "type")

SIZE_KEYS = ("fileFileSize", "fileSize", "size", "byteSize", "bytes")

SKIP_KEYS = {"logo", "companyLogo", "avatar", "profileImage", "signature",
             "thumbnail", "thumb", "icon", "favicon"}

def _url_of(node):
    for k in URL_KEYS:
        v = node.get(k)
        if isinstance(v, str) and (v.startswith("http") or v.startswith("/")):
            return v.strip()
        if isinstance(v, dict):
            for kk in NESTED_URL_KEYS:
                vv = v.get(kk)
                if isinstance(vv, str) and (vv.startswith("http")
                                            or vv.startswith("/")):
                    return vv.strip()
    return None

def _str_of(node, keys):
    for k in keys:
        v = node.get(k)
        if isinstance(v, str) and v.strip():
            return v.strip()
    return None

def _ctype_of(node):
    """A content type, not a record type — 'application/pdf' has the slash,
    'type': 'Quote' doesn't, which keeps ordinary records out of the way."""
    for k in CTYPE_KEYS:
        v = node.get(k)
        if isinstance(v, str) and "/" in v:
            return v.strip()
    return None

def _size_of(node):
    for k in SIZE_KEYS:
        v = node.get(k)
        if isinstance(v, (int, float)) and v >= 0:
            return int(v)
        if isinstance(v, str) and v.isdigit():
            return int(v)
    return ""

def _name_of(node, url):
    name = _str_of(node, NAME_KEYS)
    if name:
        return name
    if url:
        base = urllib.parse.unquote(
            os.path.basename(urllib.parse.urlsplit(url).path))
        if base:
            return base
    return ""

def looks_like_asset(node):
    url = _url_of(node)
    if not url:
        return False
    if _ctype_of(node):
        return True
    ext = os.path.splitext(urllib.parse.urlsplit(url).path)[1]
    if 1 < len(ext) <= 6 and ext[1:].isalnum():
        return True
    name = _str_of(node, NAME_KEYS)
    return bool(name and "." in name)

def is_pdf(name, url, ctype):
    if ctype and "pdf" in ctype.lower():
        return True
    if name and name.lower().rstrip().endswith(".pdf"):
        return True
    if url and urllib.parse.urlsplit(url).path.lower().endswith(".pdf"):
        return True
    return False

def collect_assets(payload):
    """Every asset-shaped node anywhere in a payload, line items included.

    Walking the whole thing rather than reading one known key is deliberate:
    it survives the attachments being filed under 'assets', 'attachments',
    'files', or hung off each line item, which is the bit I can't check
    from here."""
    found, seen = [], set()

    def walk(node, path, depth, root=False):
        if depth > 12:
            return
        if isinstance(node, dict):
            if not root and looks_like_asset(node):
                url = _url_of(node)
                name = _name_of(node, url)
                key = str(node.get("id") or "") or url
                if key not in seen:
                    seen.add(key)
                    found.append({
                        "asset_id": str(node.get("id") or ""),
                        "name": name,
                        "url": url,
                        "content_type": _ctype_of(node) or "",
                        "size": _size_of(node),
                        "found_at": path or "(root)",
                    })
                return                      # an asset has no assets inside it
            for k, v in node.items():
                if k in SKIP_KEYS:
                    continue
                walk(v, f"{path}.{k}" if path else k, depth + 1)
        elif isinstance(node, list):
            for i, v in enumerate(node):
                walk(v, f"{path}[{i}]", depth + 1)

    walk(payload, "", 0, root=True)
    return found

def fetch_detail(get, kind, rid):
    for tpl in DETAIL_PATHS_BY_KIND.get(kind, []):
        d = get_with_retry(get, tpl.format(id=rid))
        if isinstance(d, dict):
            if d.get("status") == 404:
                continue              # this API wraps 404 in a 200
            return d.get("data") if isinstance(d.get("data"), dict) else d
        if isinstance(d, list):
            return d
    return None

# ---------------------------------------------------------------------------
# The probe itself
# ---------------------------------------------------------------------------

# A wider net than the exporter uses — this is the one place worth being
# exhaustive, because whatever answers here becomes the exporter's setting.
PROBE_PATHS = [
    "transactions/{kp}/{id}/assets",
    "transactions/{kp}/{id}/attachments",
    "transactions/{kp}/{id}/files",
    "transactions/{kp}/{id}/documents",
    "transactions/{kp}/{id}/proofs",
    "{kp}/{id}/assets",
    "assets?assetableType={at}&assetableId={id}",
    "assets?assetable_type={at}&assetable_id={id}",
    "assets?transactionId={id}",
    "assets?txnId={id}",
]

PREFIX_KIND = {"QT": "quotes", "EST": "quotes", "SO": "salesOrders",
               "WO": "salesOrders", "IN": "invoices", "INV": "invoices"}

# Values safe to keep in the shareable structure file — these are enums and
# content types, never customer data.
KEEP_VALUES = {"status", "state", "type", "kind", "stage", "workflowState",
               "contentType", "fileContentType", "mimeType", "mime"}


def describe(s):
    """A string, reduced to its shape."""
    if s.startswith("http") or s.startswith("/"):
        u = urllib.parse.urlsplit(s)
        ext = os.path.splitext(u.path)[1].lower()
        host = u.hostname or "(relative)"
        return f"<url host={host}{' ext=' + ext if ext else ''}>"
    ext = os.path.splitext(s)[1].lower()
    if 1 < len(ext) <= 6 and ext[1:].isalnum() and " " not in ext:
        return f"<filename ext={ext}>"
    return f"<str len={len(s)}>"


def skeleton(node, key=None, depth=0):
    """Field names and value shapes. No values, bar a few safe enums."""
    if depth > 10:
        return "..."
    if isinstance(node, dict):
        return {k: skeleton(v, k, depth + 1) for k, v in node.items()}
    if isinstance(node, list):
        if not node:
            return []
        out = [skeleton(node[0], key, depth + 1)]
        if len(node) > 1:
            out.append(f"<...{len(node) - 1} more of the same>")
        return out
    if isinstance(node, str):
        if key in KEEP_VALUES and len(node) <= 40:
            return node
        return describe(node)
    if node is None:
        return None
    return type(node).__name__


def find_transaction(get, folder, wanted, log):
    """The (kind, id) for a transaction number. Uses the .json files from a
    previous export if they're in the folder, otherwise pages the lists."""
    core = core_number(wanted) or wanted.strip()
    prefix = "".join(c for c in wanted.strip()[:3] if c.isalpha()).upper()
    kinds = ([PREFIX_KIND[prefix]] if prefix in PREFIX_KIND
             else ["salesOrders", "invoices", "quotes"])
    kinds += [k for k in ("quotes", "salesOrders", "invoices")
              if k not in kinds]

    for kind in kinds:
        cached = os.path.join(folder, f"{kind}.json")
        if os.path.exists(cached):
            try:
                with open(cached, encoding="utf-8") as f:
                    rows = json.load(f)
            except Exception:
                rows = []
            for r in rows:
                if str(r.get("id")) == wanted.strip() or \
                        txn_number(r) == core:
                    log(f"   found it in {kind}.json")
                    return kind, str(r["id"]), r
    log("   no export files here to search — paging the lists instead")
    for kind in kinds:
        for path in TARGETS[kind]:
            page = 1
            try:
                while page <= 40:
                    sep = "&" if "?" in path else "?"
                    d = get_with_retry(
                        get, f"{path}{sep}page={page}&perPage=500")
                    if not isinstance(d, dict):
                        break
                    key = arr_key(d)
                    if key is None:
                        break
                    for r in d.get(key, []):
                        if str(r.get("id")) == wanted.strip() or \
                                txn_number(r) == core:
                            log(f"   found it in {kind} (page {page})")
                            return kind, str(r["id"]), r
                    if not (d.get("meta") or {}).get("hasNextPage"):
                        break
                    page += 1
                    log(f"   ...{kind} page {page}")
            except AuthExpired:
                raise
            except Exception:
                continue
    return None, None, None


def probe(cookie, folder, wanted, log):
    get = make_get(cookie)
    log(f">  looking for {wanted}")
    kind, rid, rec = find_transaction(get, folder, wanted, log)
    if not rid:
        log("X  couldn't find that transaction. Check the number, or run the "
            "main exporter once into this folder first so the lists are here.")
        return
    log(f"   {kind}  id={rid}  number={txn_number(rec)}")

    # 1. does it ride along in the detail payload?
    log("")
    log(">  1. the detail payload (the call the exporter already makes)")
    body = fetch_detail(get, kind, rid)
    detail_hits = []
    if not body:
        log("   X  no detail payload came back")
    else:
        detail_hits = collect_assets(body)
        if detail_hits:
            log(f"   OK {len(detail_hits)} asset(s) in the detail payload:")
            for a in detail_hits:
                log(f"      {a['found_at']}  {a['name']}  "
                    f"[{a['content_type'] or 'no content type'}]")
        else:
            top = (", ".join(sorted(body.keys())[:24])
                   if isinstance(body, dict) else "?")
            log("   -  nothing asset-shaped in it")
            log(f"      its top-level fields: {top}")

    # 2. the sub-endpoints
    log("")
    log(">  2. the candidate endpoints")
    kp = KIND_PATH[kind]
    at = KIND_ASSETABLE[kind]
    winners, raw = [], {}
    for tpl in PROBE_PATHS:
        path = tpl.format(kp=kp, at=at, id=rid)
        try:
            d = get_with_retry(get, path, tries=1)
        except urllib.error.HTTPError as e:
            log(f"   {e.code:>3}  /edge/{path}")
            continue
        except AuthExpired:
            raise
        except Exception as e:                               # noqa: BLE001
            log(f"   err  /edge/{path}  ({type(e).__name__})")
            continue
        if isinstance(d, dict) and d.get("status") == 404:
            log(f"   404  /edge/{path}  (wrapped in a 200)")
            continue
        found = collect_assets(d if isinstance(d, (dict, list)) else {})
        raw[path] = d
        if found:
            log(f"   OK   /edge/{path}  -> {len(found)} asset(s)")
            for a in found:
                log(f"          {a['name']}  [{a['content_type'] or '?'}]")
            winners.append(tpl)          # the template, not this one id
        else:
            shape = (", ".join(sorted(d.keys())[:12])
                     if isinstance(d, dict) else f"list of {len(d)}")
            log(f"   200  /edge/{path}  but nothing asset-shaped ({shape})")

    # 3. the verdict, and the two files
    log("")
    if detail_hits:
        log("=> The attachments ride along in the detail payload. The "
            "exporter's default setting is already right.")
    elif winners:
        log(f"=> Use this one: {winners[0]}")
        log("   Put it at the top of ASSET_SUBPATHS in "
            "shopvox_export_all.py, or just delete assetsMode.json and "
            "re-run — discovery will find it now.")
    else:
        log("=> Nothing found anywhere. Two possibilities: this transaction "
            "genuinely has no attachments (try another one you can SEE a PDF "
            "on in shopVOX), or they're somewhere none of these paths reach.")
        log("   Send me the STRUCTURE file either way.")

    base = os.path.join(folder, f"asset-probe-{core_number(wanted) or 'txn'}")
    dump = {"kind": kind, "id": rid, "detail": body, "endpoints": raw}
    with open(base + "-FULL.json", "w", encoding="utf-8") as f:
        json.dump(dump, f, indent=2, ensure_ascii=False)
    with open(base + "-STRUCTURE.txt", "w", encoding="utf-8") as f:
        f.write("shopVOX asset probe — field names and value shapes only.\n")
        f.write("No names, addresses, prices or file names are in this file.\n")
        f.write(f"transaction kind: {kind}\n")
        f.write(f"assets found in the detail payload: {len(detail_hits)}\n")
        f.write("endpoint templates that answered with assets: "
                f"{winners or 'none'}\n\n")
        f.write("=== detail payload ===\n")
        f.write(json.dumps(skeleton(body), indent=2))
        f.write("\n\n=== endpoints that returned something ===\n")
        f.write(json.dumps({k: skeleton(v) for k, v in raw.items()}, indent=2))
    log("")
    log(f"OK wrote {os.path.basename(base)}-FULL.json  (yours — keep it)")
    log(f"OK wrote {os.path.basename(base)}-STRUCTURE.txt  (safe to send me)")


class App:
    def __init__(self, root):
        self.root = root
        self.q = queue.Queue()
        root.title("shopVOX asset probe")
        root.geometry("760x620")
        pad = {"padx": 10, "pady": 6}
        frm = ttk.Frame(root)
        frm.pack(fill="both", expand=True)

        ttk.Label(frm, text="1.  Paste your shopVOX cookie:").pack(
            anchor="w", **pad)
        self.cookie = scrolledtext.ScrolledText(frm, height=5, wrap="char")
        self.cookie.pack(fill="x", padx=10)

        row = ttk.Frame(frm); row.pack(fill="x", **pad)
        ttk.Label(row, text="2.  Folder:").pack(side="left")
        self.out = tk.StringVar(value=os.path.expanduser("~"))
        ttk.Entry(row, textvariable=self.out).pack(
            side="left", fill="x", expand=True, padx=6)
        ttk.Button(row, text="Browse...", command=self.browse).pack(side="left")

        row2 = ttk.Frame(frm); row2.pack(fill="x", **pad)
        ttk.Label(row2, text="3.  A transaction you KNOW has a PDF on it:"
                  ).pack(side="left")
        self.num = tk.StringVar(value="")
        ttk.Entry(row2, textvariable=self.num, width=16).pack(
            side="left", padx=6)
        self.btn = ttk.Button(row2, text="Probe", command=self.start)
        self.btn.pack(side="left", padx=10)

        self.log = scrolledtext.ScrolledText(frm, height=24, state="disabled",
                                             font=("Consolas", 9))
        self.log.pack(fill="both", expand=True, padx=10, pady=(0, 10))
        self.root.after(100, self.drain)

    def browse(self):
        d = filedialog.askdirectory(initialdir=self.out.get())
        if d:
            self.out.set(d)

    def put(self, m):
        self.q.put(m)

    def drain(self):
        try:
            while True:
                m = self.q.get_nowait()
                if m == "__DONE__":
                    self.btn.config(state="normal", text="Probe")
                else:
                    self.log.config(state="normal")
                    self.log.insert("end", m + "\n")
                    self.log.see("end")
                    self.log.config(state="disabled")
        except queue.Empty:
            pass
        self.root.after(100, self.drain)

    def start(self):
        cookie = self.cookie.get("1.0", "end").strip()
        num = self.num.get().strip()
        folder = self.out.get().strip()
        if not cookie or not num:
            messagebox.showwarning(
                "Need both", "Paste the cookie and type a transaction number.")
            return
        if not os.path.isdir(folder):
            messagebox.showwarning("Folder", "Choose a valid folder.")
            return
        self.log.config(state="normal"); self.log.delete("1.0", "end")
        self.log.config(state="disabled")
        self.btn.config(state="disabled", text="Probing...")

        def worker():
            try:
                probe(" ".join(cookie.split()), folder, num, self.put)
            except AuthExpired as e:
                self.put(f"X  Auth failed ({e}) — grab a fresh cookie.")
            except Exception as e:                           # noqa: BLE001
                self.put(f"X  Unexpected error: {e}")
            finally:
                self.put("__DONE__")

        threading.Thread(target=worker, daemon=True).start()


if __name__ == "__main__":
    root = tk.Tk()
    App(root)
    root.mainloop()
