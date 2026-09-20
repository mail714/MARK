#!/usr/bin/env python3
"""
shopVOX Export — everything, one run
====================================
Merges the original list exporter with the line-items downloader, and adds
a per-company detail pass for the addresses the list export doesn't carry.

WHAT IT PULLS
  companies / contacts / quotes / salesOrders / invoices
        The list endpoints. Same as the original tool.
  lineItems
        One request per quote / sales order / invoice. This is the slow
        one — tens of thousands of requests — so it runs in parallel and
        is resumable: stop it and re-run, it picks up where it left off.
  assets
        Every file attached to a quote / sales order / invoice, filed by
        transaction number: PDFs land in <out>/assets/SO51172/ or
        <out>/assets/QT 58232/. A quote that became a sales order or an
        invoice follows that order's number, so a job's paperwork ends up
        in one folder. Resumable like the line items, and it will not
        re-download a file it already has.

        NOTE: where shopVOX hangs the attachments is discovered at run
        time, not hard-coded — see Stage 4. If the probe finds nothing,
        it says so and leaves a sample payload in _asset_probe/.

  companyAddresses
        One request per company. The list export only carries
        primaryAddress, so any company whose address is filed as BILLING
        looks address-less. This fetches the full record.

        NOTE: this pass is UNTESTED against the live API — the machine I
        was written on can't reach shopvox.com. If it 403s, don't fight
        it: shopVOX Pro's own Customers > Export > To CSV gives the same
        addresses in one click, and JASPER imports that file directly.

HOW TO USE
  1. python shopvox_export_all.py
  2. Log into shopVOX. F12 -> Network -> click any api.shopvox.com
     request -> copy the whole "cookie:" header value.
  3. Paste it in, choose a folder, tick what you want, Run.

Everything lands as .csv (plus .json for the list pulls). Feed the whole
folder to JASPER's "Import from ShopVox".
"""

import csv
import json
import os
import queue
import re
import shutil
import subprocess
import sys
import threading
import time
import tkinter as tk
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from tkinter import filedialog, messagebox, scrolledtext, ttk

BASE = "https://api.shopvox.com/edge"

# List endpoints. Several spellings per target: the first that answers
# with an array wins, so a rename upstream doesn't kill the run.
TARGETS = {
    "companies":   ["companies"],
    "contacts":    ["contacts"],
    "quotes":      ["transactions/quotes", "transactions?type=quote", "quotes"],
    "salesOrders": ["transactions/work_orders", "transactions?type=work_order",
                    "work_orders", "sales_orders"],
    "invoices":    ["transactions/invoices", "transactions?type=invoice",
                    "invoices"],
}

# Per-transaction detail, for line items.
DETAIL_PATHS_BY_KIND = {
    "quotes":      ["transactions/quotes/{id}"],
    "salesOrders": ["transactions/work_orders/{id}"],
    "invoices":    ["transactions/invoices/{id}"],
}
LINES_PER_PAGE = 200

# Per-company detail, for the addresses the list export omits.
COMPANY_DETAIL_PATHS = ["companies/{id}"]

WORKERS = 6                 # requests in flight at once; set from the GUI
WORKERS_MAX = 16            # past this the API starts answering 429
TIMEOUT = 30


# ---------------------------------------------------------------------------
# Networking
# ---------------------------------------------------------------------------

class AuthExpired(Exception):
    """Cookie no longer valid — stop cleanly so progress is kept."""


def shutdown_now(pool):
    """Drop queued work instead of waiting for it.

    Leaving a ThreadPoolExecutor by its 'with' block waits for every job
    already submitted, so breaking out of the loop on Stop still sat
    through all thirty-odd thousand of them. That is what made the Stop
    button look dead."""
    try:
        pool.shutdown(wait=False, cancel_futures=True)
    except TypeError:                     # Python 3.8 and older
        pool.shutdown(wait=False)


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


def unwrap(payload):
    if isinstance(payload, list):
        return payload
    if isinstance(payload, dict):
        for k in ("data", "results", "records", "items"):
            if isinstance(payload.get(k), list):
                return payload[k]
        return [payload]
    return []


# ---------------------------------------------------------------------------
# CSV
# ---------------------------------------------------------------------------

def flatten(obj, prefix="", out=None):
    if out is None:
        out = {}
    for key, val in obj.items():
        col = f"{prefix}.{key}" if prefix else key
        if val is None:
            out[col] = ""
        elif isinstance(val, list):
            if not val:
                out[col] = ""
            elif all(not isinstance(x, dict) for x in val):
                out[col] = "; ".join(str(x) for x in val)
            elif all(isinstance(x, dict) and "name" in x for x in val):
                out[col] = "; ".join(x["name"] for x in val)
            else:
                out[col] = json.dumps(val)
        elif isinstance(val, dict):
            flatten(val, col, out)
        else:
            out[col] = val
    return out


def write_csv(path, rows):
    """Union of every column seen, in first-seen order — so a field that
    only some records carry still gets its own column rather than being
    dropped."""
    flat = [flatten(r) for r in rows]
    cols, seen = [], set()
    for r in flat:
        for c in r:
            if c not in seen:
                seen.add(c)
                cols.append(c)
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=cols, extrasaction="ignore")
        w.writeheader()
        w.writerows(flat)
    return len(cols)


def csv_from_jsonl(jsonl_path, csv_path):
    """Rebuild a CSV from the resumable JSONL log."""
    rows = []
    with open(jsonl_path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                try:
                    rows.append(json.loads(line))
                except json.JSONDecodeError:
                    continue
    if rows:
        write_csv(csv_path, rows)
    return len(rows)


# ---------------------------------------------------------------------------
# Stage 1 — the list endpoints
# ---------------------------------------------------------------------------

def pull_lists(get, out_dir, chosen, per, gap, log, stop=None):
    """Returns {target: [records]} for whatever was pulled."""
    pulled = {}
    for label in chosen:
        path = key = None
        for p in TARGETS[label]:
            try:
                d = get_with_retry(get, f"{p}{'&' if '?' in p else '?'}page=1&perPage=1")
                k = arr_key(d)
                if k is not None:
                    path, key = p, k
                    break
            except AuthExpired:
                raise
            except Exception:
                continue
        if not path:
            log(f"X  {label}: no endpoint found")
            continue

        log(f">  {label}  (/edge/{path}, key '{key}')")
        page, rows = 1, []
        while True:
            sep = "&" if "?" in path else "?"
            d = get_with_retry(get, f"{path}{sep}page={page}&perPage={per}")
            meta = d.get("meta", {}) if isinstance(d, dict) else {}
            rows += d.get(key, []) if isinstance(d, dict) else []
            log(f"     page {page}/{meta.get('totalPages', '?')}  "
                f"({len(rows)}/{meta.get('totalCount', '?')})")
            if not meta.get("hasNextPage"):
                break
            if stop is not None and stop.is_set():
                log("   stopped")
                break
            page += 1
            time.sleep(gap)

        if not rows:
            log(f"X  {label}: 0 records")
            continue
        with open(os.path.join(out_dir, f"{label}.json"), "w",
                  encoding="utf-8") as f:
            json.dump(rows, f, indent=2, ensure_ascii=False)
        ncols = write_csv(os.path.join(out_dir, f"{label}.csv"), rows)
        log(f"OK {label}: {len(rows):,} records, {ncols} columns")
        pulled[label] = rows
    return pulled


# ---------------------------------------------------------------------------
# Stage 2 — line items, one request per transaction
# ---------------------------------------------------------------------------

def fetch_lines(get, kind, rid):
    """Every line item on one transaction. Returns (rows, status).

    The API pages line items — the default is 10 per page, which silently
    truncates anything bigger — so this follows hasNextPage to the end.
    """
    out, page = [], 1
    for tpl in DETAIL_PATHS_BY_KIND.get(kind, []):
        try:
            while True:
                base = tpl.format(id=rid)
                sep = "&" if "?" in base else "?"
                d = get_with_retry(
                    get, f"{base}{sep}page={page}&perPage={LINES_PER_PAGE}")
                if not isinstance(d, dict):
                    break
                # {"workOrder": {...}}, not {"data": {...}} — reading only
                # the latter found no lineItems and called that a clean run.
                body = unwrap_detail(d)
                lines = (body.get("lineItems") or []) if isinstance(
                    body, dict) else []
                for i, ln in enumerate(lines):
                    if isinstance(ln, dict):
                        ln = dict(ln)
                        ln["parent_id"] = rid
                        ln["parent_kind"] = kind
                        ln["line_position"] = ln.get("position", i + 1)
                        out.append(ln)
                meta = ((body.get("meta") if isinstance(body, dict) else None)
                        or d.get("meta") or {})
                if not meta.get("hasNextPage"):
                    return out, "ok"
                page += 1
        except AuthExpired:
            raise
        except Exception:
            return out, "partial" if out else "failed"
    return out, "ok" if out else "failed"


def pull_line_items(get, out_dir, pulled, log, stop):
    jsonl = os.path.join(out_dir, "lineItems.jsonl")
    done = set()
    if os.path.exists(jsonl):
        with open(jsonl, encoding="utf-8") as f:
            for line in f:
                try:
                    done.add(json.loads(line).get("parent_id"))
                except json.JSONDecodeError:
                    continue
        log(f"   resuming — {len(done):,} transactions already fetched")

    jobs = []
    for kind in ("quotes", "salesOrders", "invoices"):
        for rec in pulled.get(kind, []):
            rid = rec.get("id")
            if rid and rid not in done:
                jobs.append((kind, rid))
    if not jobs:
        log("   nothing new to fetch")
    else:
        log(f">  line items for {len(jobs):,} transactions "
            f"({WORKERS} at a time)")
        written = failed = 0
        lock = threading.Lock()
        def one_lines(kind, rid):
            if stop.is_set():
                return [], "stopped"      # queued work exits without calling
            return fetch_lines(get, kind, rid)

        with open(jsonl, "a", encoding="utf-8") as fh:
            pool = ThreadPoolExecutor(max_workers=WORKERS)
            try:
                futures = {pool.submit(one_lines, k, i): (k, i)
                           for k, i in jobs}
                for n, fut in enumerate(as_completed(futures), 1):
                    if stop.is_set():
                        log("   stopped — progress kept, re-run to continue")
                        break
                    kind, rid = futures[fut]
                    try:
                        lines, status = fut.result()
                    except AuthExpired:
                        log("X  cookie expired — stopping cleanly, "
                            "progress kept")
                        break
                    except Exception:
                        failed += 1
                        continue
                    # Only a clean fetch counts as done, so a partial one
                    # is retried on the next run rather than left short.
                    if status == "ok":
                        with lock:
                            for ln in lines:
                                fh.write(json.dumps(ln, ensure_ascii=False) + "\n")
                            fh.flush()    # survive a force-quit
                            written += len(lines)
                    elif status != "stopped":
                        failed += 1
                    if n % 100 == 0:
                        log(f"     {n:,}/{len(jobs):,}  "
                            f"({written:,} lines, {failed} failed)")
            finally:
                shutdown_now(pool)
                fh.flush()
        log(f"   {written:,} lines written, {failed} transactions failed")

    if os.path.exists(jsonl):
        n = csv_from_jsonl(jsonl, os.path.join(out_dir, "lineItems.csv"))
        log(f"OK lineItems.csv: {n:,} rows")


# ---------------------------------------------------------------------------
# Stage 3 — company detail, for the addresses the list export omits
# ---------------------------------------------------------------------------

def pull_company_addresses(get, out_dir, pulled, log, stop):
    companies = pulled.get("companies") or []
    if not companies:
        log("X  need the companies pull for this — tick it too")
        return
    jsonl = os.path.join(out_dir, "companyAddresses.jsonl")
    done = set()
    if os.path.exists(jsonl):
        with open(jsonl, encoding="utf-8") as f:
            for line in f:
                try:
                    done.add(json.loads(line).get("company_id"))
                except json.JSONDecodeError:
                    continue
        log(f"   resuming — {len(done):,} companies already fetched")

    jobs = [c["id"] for c in companies if c.get("id") and c["id"] not in done]
    if not jobs:
        log("   nothing new to fetch")
    else:
        log(f">  addresses for {len(jobs):,} companies")

        def one(cid):
            if stop.is_set():
                return []
            for tpl in COMPANY_DETAIL_PATHS:
                d = get_with_retry(get, tpl.format(id=cid))
                if isinstance(d, dict) and d.get("status") == 404:
                    continue          # this API wraps 404 in a 200
                body = d.get("data") if isinstance(d, dict) and isinstance(
                    d.get("data"), dict) else d
                rows = []
                for a in (body.get("addresses") or []) if isinstance(body, dict) else []:
                    if isinstance(a, dict):
                        a = dict(a)
                        a["company_id"] = cid
                        a["company_name"] = (body.get("name") or "")
                        rows.append(a)
                if rows:
                    return rows
            return []

        written = failed = 0
        lock = threading.Lock()
        with open(jsonl, "a", encoding="utf-8") as fh:
            pool = ThreadPoolExecutor(max_workers=WORKERS)
            try:
                futures = {pool.submit(one, cid): cid for cid in jobs}
                for n, fut in enumerate(as_completed(futures), 1):
                    if stop.is_set():
                        log("   stopped — progress kept")
                        break
                    try:
                        rows = fut.result()
                    except AuthExpired:
                        log("X  cookie expired — stopping cleanly")
                        break
                    except Exception:
                        failed += 1
                        continue
                    if rows:
                        with lock:
                            for r in rows:
                                fh.write(json.dumps(r, ensure_ascii=False) + "\n")
                            fh.flush()
                            written += len(rows)
                    if n % 100 == 0:
                        log(f"     {n:,}/{len(jobs):,}  ({written:,} addresses)")
            finally:
                shutdown_now(pool)
                fh.flush()
        log(f"   {written:,} addresses, {failed} companies failed")
        if not written:
            log("!  Nothing came back. Use shopVOX Pro's own")
            log("!  Customers > Export > To CSV instead — JASPER reads it.")

    if os.path.exists(jsonl):
        n = csv_from_jsonl(jsonl, os.path.join(out_dir, "companyAddresses.csv"))
        log(f"OK companyAddresses.csv: {n:,} rows")


# ---------------------------------------------------------------------------
# Stage 4 — transaction assets, filed by QT / SO number
# ---------------------------------------------------------------------------
#
# Folder rule (what the brief asked for):
#   quote that never became anything   ->  assets/QT 58232/
#   sales order, or a quote that became one  ->  assets/SO51172/
#   invoice                            ->  assets/SO<same number>/
#
# How shopVOX numbers these, which the rules below depend on:
#   * quotes run their own sequence          QT62495
#   * sales orders and invoices SHARE one    SO60008 -> IN60008
#   * converting a quote to a sales order issues a NEW number
#     (QT62495 becomes SO60008 — the numbers are unrelated)
#   * invoicing a sales order keeps the number and swaps the prefix
#
# Two consequences. An invoice needs no lookup: its own number IS the sales
# order number. And a quote can NEVER be matched to its sales order by
# number — the sequences overlap, so QT60008 and SO60008 are different jobs.
# That link has to come from an id on one of the records.
# Change ASSET_FOLDER_QT / ASSET_FOLDER_SO below to restyle those names.

ASSETS_DIRNAME = "assets"
ASSET_FOLDER_QT = "QT {num}"      # matches the "QT 58232" in the brief
ASSET_FOLDER_SO = "SO{num}"       # matches the "SO51172" in the brief

KIND_PATH = {"quotes": "quotes", "salesOrders": "work_orders",
             "invoices": "invoices"}
KIND_ASSETABLE = {"quotes": "Quote", "salesOrders": "WorkOrder",
                  "invoices": "Invoice"}

# Where the assets live is the one thing I couldn't verify from here — this
# machine can't reach shopvox.com. So the run *discovers* it: it reads a
# sample of transactions, and if the detail payload already carries the
# attachments (it usually does, same call the line items come from) it uses
# that. Otherwise it tries these sub-endpoints and keeps the first that
# answers with something asset-shaped. The answer is cached in
# assetsMode.json so later runs skip the probe.
ASSET_SUBPATHS = [
    "{kp}/{id}/assets",
    "transactions/{kp}/{id}/assets",
    "transactions/{kp}/{id}/attachments",
    # These LOOK like they work and do not: /edge/assets ignores the filter
    # and hands back the first page of every asset in the account, so each
    # transaction appears to have the same ten files. They stay in the list
    # only because endpoint_filters() below now catches that; never promote
    # one above the per-transaction collections.
    "assets?assetableType={at}&assetableId={id}",
    "assets?assetable_type={at}&assetable_id={id}",
]

# An id that cannot exist. If an endpoint returns assets for THIS, it is not
# filtering by id at all and anything it returns is the wrong transaction's.
BOGUS_ID = "00000000-0000-0000-0000-000000000000"
ASSET_SAMPLES = 40          # transactions read during discovery
ASSETS_PER_PAGE = 200       # the default is 10, which silently truncates

# A response that carries one of these lists is the assets collection, even
# when the list is empty — which is how we tell "this endpoint exists and
# this transaction has no files" from "wrong endpoint".
ASSET_COLLECTION_KEYS = ("assets", "attachments", "files", "documents", "data")
DOWNLOAD_TIMEOUT = 180      # seconds per file — proofs can be fat

# --- reading a transaction number off a record -----------------------------

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


# --- working out which folder a transaction belongs in ---------------------

QUOTE_REF_KEYS = ("quoteId", "quote_id", "sourceQuoteId", "fromQuoteId",
                  "quoteTxnId", "originalQuoteId")
QUOTE_OBJ_KEYS = ("quote", "sourceQuote", "fromQuote", "originalQuote")
SO_REF_KEYS = ("salesOrderId", "sales_order_id", "workOrderId",
               "work_order_id", "soId", "orderId", "convertedToId",
               "transactionId")
SO_OBJ_KEYS = ("salesOrder", "workOrder", "order", "convertedTo",
               "transaction")
CONVERTED_HINTS = ("convert", "won", "ordered", "sales order", "work order")
STATUS_KEYS = ("status", "state", "quoteStatus", "workflowState", "stage")
# THE link, confirmed against the live API: a quote's LIST record carries an
# array of the sales orders it became. It is not in the detail payload, and
# no field on the sales order points back, so this is the only route.
QUOTE_CHILD_KEYS = ("salesOrders", "workOrders", "orders", "invoices")


def ref_id(rec, id_keys, obj_keys):
    """The id of a linked transaction, however the record spells it."""
    for k in id_keys:
        v = rec.get(k)
        if isinstance(v, (str, int)) and str(v).strip():
            return str(v)
    for k in obj_keys:
        v = rec.get(k)
        if isinstance(v, dict) and v.get("id"):
            return str(v["id"])
    return None


def ref_number(rec, obj_keys):
    """A number carried on the linked object itself, if it's embedded."""
    for k in obj_keys:
        v = rec.get(k)
        if isinstance(v, dict):
            n = txn_number(v)
            if n:
                return n
    return None


def child_numbers(rec, so_num_by_id, inv_num_by_id):
    """The numbers of the sales orders / invoices a quote turned into."""
    out = []
    for k in QUOTE_CHILD_KEYS:
        for item in (rec.get(k) or []) if isinstance(rec.get(k), list) else []:
            if not isinstance(item, dict):
                continue
            iid = str(item.get("id") or "")
            num = (so_num_by_id.get(iid) or inv_num_by_id.get(iid)
                   or txn_number(item))
            if num and num not in out:
                out.append(num)
    return out


def looks_converted(rec):
    if rec.get("ordered") is True or rec.get("invoiced") is True:
        return True
    for k in STATUS_KEYS:
        v = rec.get(k)
        if isinstance(v, str) and any(h in v.lower() for h in CONVERTED_HINTS):
            return True
    return False


def build_folder_index(pulled, log):
    """{(kind, id): folder name} for every transaction we know about."""
    quotes = pulled.get("quotes") or []
    sos = pulled.get("salesOrders") or []
    invoices = pulled.get("invoices") or []

    so_num_by_id = {}
    for r in sos:
        rid, num = str(r.get("id") or ""), txn_number(r)
        if rid and num:
            so_num_by_id[rid] = num

    # An invoice shares its sales order's number, so its own number is the
    # answer. Links are only a fallback for a record with no number on it.
    inv_num_by_id = {}
    for r in invoices:
        rid = str(r.get("id") or "")
        if not rid:
            continue
        num = (txn_number(r)
               or so_num_by_id.get(ref_id(r, SO_REF_KEYS, SO_OBJ_KEYS) or "")
               or ref_number(r, SO_OBJ_KEYS)
               or so_num_by_id.get(rid))
        if num:
            inv_num_by_id[rid] = num

    # Reverse links: a sales order / invoice pointing back at its quote.
    so_num_by_quote = {}
    for r in sos:
        q, num = ref_id(r, QUOTE_REF_KEYS, QUOTE_OBJ_KEYS), txn_number(r)
        if q and num:
            so_num_by_quote.setdefault(q, num)
    for r in invoices:
        q = ref_id(r, QUOTE_REF_KEYS, QUOTE_OBJ_KEYS)
        num = inv_num_by_id.get(str(r.get("id") or ""))
        if q and num:
            so_num_by_quote.setdefault(q, num)

    # Each transaction maps to a LIST of folders: normally one, but a quote
    # that became two sales orders belongs in both, so its paperwork is
    # complete in each.
    folders, how = {}, {}
    for r in sos:
        rid = str(r.get("id") or "")
        if rid:
            num = so_num_by_id.get(rid)
            folders[("salesOrders", rid)] = [
                ASSET_FOLDER_SO.format(num=num) if num
                else f"UNKNOWN-SO-{rid[:8]}"]
    for r in invoices:
        rid = str(r.get("id") or "")
        if rid:
            num = inv_num_by_id.get(rid)
            folders[("invoices", rid)] = [
                ASSET_FOLDER_SO.format(num=num) if num
                else f"UNKNOWN-INV-{rid[:8]}"]

    to_so = to_qt = multi = 0
    orphans = []
    for r in quotes:
        rid = str(r.get("id") or "")
        if not rid:
            continue
        # The confirmed route first: the orders listed on the quote itself.
        nums = child_numbers(r, so_num_by_id, inv_num_by_id)
        if nums:
            folders[("quotes", rid)] = [ASSET_FOLDER_SO.format(num=n)
                                        for n in nums]
            to_so += 1
            multi += 1 if len(nums) > 1 else 0
            how["the orders listed on the quote"] = how.get(
                "the orders listed on the quote", 0) + 1
            continue

        num = why = None
        if rid in so_num_by_id:
            num, why = so_num_by_id[rid], "same id as a sales order"
        elif rid in inv_num_by_id:
            num, why = inv_num_by_id[rid], "same id as an invoice"
        else:
            linked = ref_id(r, SO_REF_KEYS, SO_OBJ_KEYS)
            if linked and linked in so_num_by_id:
                num, why = so_num_by_id[linked], "link held on the quote"
            if not num:
                embedded = ref_number(r, SO_OBJ_KEYS)
                if embedded:
                    num, why = embedded, "sales order embedded on the quote"
            if not num and rid in so_num_by_quote:
                num, why = so_num_by_quote[rid], "link back from the order"
            # Deliberately NOT matched by number: a quote's number comes from
            # a different sequence than a sales order's, so equal numbers
            # mean two unrelated jobs, not a conversion.
        if num:
            folders[("quotes", rid)] = [ASSET_FOLDER_SO.format(num=num)]
            to_so += 1
            how[why] = how.get(why, 0) + 1
        else:
            qn = txn_number(r)
            folders[("quotes", rid)] = [ASSET_FOLDER_QT.format(num=qn) if qn
                                        else f"UNKNOWN-QT-{rid[:8]}"]
            to_qt += 1
            if looks_converted(r):
                orphans.append(qn or rid[:8])

    log(f"   folders: {len(so_num_by_id):,} sales orders, "
        f"{len(inv_num_by_id):,} invoices, "
        f"{to_qt:,} quotes stay QT, {to_so:,} quotes follow their SO")
    for why, n in sorted(how.items(), key=lambda kv: -kv[1]):
        log(f"     quote->SO by {why}: {n:,}")
    if multi:
        log(f"   {multi:,} quotes became more than one sales order — their "
            f"files go into each of those folders")
    if orphans:
        log(f"   !  {len(orphans):,} quotes are marked converted but name no "
            f"sales order, so their files stay under QT:")
        shown = ", ".join(orphans[:20])
        log(f"        {shown}{' ...' if len(orphans) > 20 else ''}")
        log("        Look these up in shopVOX — usually the order was voided "
            "or deleted, leaving the flag behind. Move the folder by hand if "
            "one of them does have a live order.")
    return folders


# --- spotting an asset in whatever shape the payload arrives in ------------

NAME_KEYS = ("fileFileName", "fileName", "filename", "originalFilename",
             "originalName", "assetFileName", "displayName", "name", "title")
URL_KEYS = ("url", "fileUrl", "assetUrl", "downloadUrl", "publicUrl",
            "originalUrl", "viewUrl", "s3Url", "link", "href", "file",
            "attachment", "asset", "document", "path")
NESTED_URL_KEYS = ("url", "original", "originalUrl", "downloadUrl", "href",
                   "large", "public")
CTYPE_KEYS = ("fileMimetype", "fileContentType", "contentType", "mimeType",
               "mime", "type")
SIZE_KEYS = ("fileFileSize", "fileSize", "size", "byteSize", "bytes")
# Branding and UI chrome — never the customer's artwork.
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


# --- fetching ---------------------------------------------------------------

# The detail call answers {"workOrder": {...}} / {"quote": {...}} rather than
# the {"data": {...}} the rest of the API uses.
DETAIL_WRAPPERS = ("data", "workOrder", "quote", "invoice", "salesOrder",
                   "transaction")


def unwrap_detail(d):
    if isinstance(d, dict) and len(d) == 1:
        for k in DETAIL_WRAPPERS:
            if isinstance(d.get(k), dict):
                return d[k]
    if isinstance(d, dict) and isinstance(d.get("data"), dict):
        return d["data"]
    return d


def fetch_detail(get, kind, rid):
    for tpl in DETAIL_PATHS_BY_KIND.get(kind, []):
        d = get_with_retry(get, tpl.format(id=rid))
        if isinstance(d, dict):
            if d.get("status") == 404:
                continue              # this API wraps 404 in a 200
            return unwrap_detail(d)
        if isinstance(d, list):
            return d
    return None


def endpoint_filters(get, tpl, kind):
    """Does this endpoint actually filter by transaction id?

    Asking for an id that cannot exist must come back empty. If assets come
    back anyway, the endpoint is serving the whole account and every folder
    would get the same files — so it is rejected outright."""
    path = tpl.format(kp=KIND_PATH[kind], at=KIND_ASSETABLE[kind],
                      id=BOGUS_ID)
    try:
        d = get_with_retry(get, path, tries=1)
    except Exception:                                        # noqa: BLE001
        return True                   # 404 on a bogus id is correct behaviour
    if isinstance(d, dict) and d.get("status") == 404:
        return True
    return not collect_assets(d if isinstance(d, (dict, list)) else {})


def is_asset_collection(d):
    if isinstance(d, list):
        return True
    return isinstance(d, dict) and any(
        isinstance(d.get(k), list) for k in ASSET_COLLECTION_KEYS)


def fetch_assets_page(get, mode, kind, rid, page):
    base = mode.format(kp=KIND_PATH[kind], at=KIND_ASSETABLE[kind], id=rid)
    sep = "&" if "?" in base else "?"
    return get_with_retry(get, f"{base}{sep}page={page}"
                               f"&perPage={ASSETS_PER_PAGE}")


def fetch_assets(get, mode, kind, rid):
    """Every asset on one transaction, following the pages to the end.

    The collection is paged — ten per page by default — so a transaction
    with more attachments than that would otherwise come back short."""
    if mode == "detail":
        return collect_assets(fetch_detail(get, kind, rid) or {})
    out, seen, page = [], set(), 1
    while page <= 50:
        d = fetch_assets_page(get, mode, kind, rid, page)
        if isinstance(d, dict) and d.get("status") == 404:
            break
        for a in collect_assets(d if isinstance(d, (dict, list)) else {}):
            key = a["asset_id"] or a["url"]
            if key not in seen:
                seen.add(key)
                out.append(a)
        meta = d.get("meta") if isinstance(d, dict) else None
        if not (isinstance(meta, dict) and meta.get("hasNextPage")):
            break
        page += 1
    return out


def sample_jobs(pulled, n):
    """A spread of transactions across all three kinds, for the probe."""
    picks = []
    kinds = [k for k in ("quotes", "salesOrders", "invoices") if pulled.get(k)]
    if not kinds:
        return picks
    per = max(1, n // len(kinds))
    for kind in kinds:
        recs = [r for r in pulled[kind] if r.get("id")]
        if not recs:
            continue
        step = max(1, len(recs) // per)
        picks += [(kind, str(r["id"])) for r in recs[::step][:per]]
    return picks


def discover_asset_mode(get, out_dir, pulled, log, stop):
    """Find where the assets hang, once, and remember it."""
    cache = os.path.join(out_dir, "assetsMode.json")
    if os.path.exists(cache):
        try:
            with open(cache, encoding="utf-8") as f:
                mode = json.load(f).get("mode")
            if mode:
                log(f"   asset source (cached): {mode}")
                return mode
        except Exception:
            pass

    probes = sample_jobs(pulled, ASSET_SAMPLES)
    if not probes:
        return "detail"
    log(f">  probing {len(probes)} transactions to find where assets hang")

    probe_dir = os.path.join(out_dir, "_asset_probe")
    os.makedirs(probe_dir, exist_ok=True)
    hits, dumped = 0, set()
    pool = ThreadPoolExecutor(max_workers=WORKERS)
    try:
        futures = {pool.submit(fetch_detail, get, k, i): (k, i)
                   for k, i in probes}
        for fut in as_completed(futures):
            if stop.is_set():
                break
            kind, rid = futures[fut]
            try:
                body = fut.result()
            except AuthExpired:
                raise
            except Exception:
                continue
            if not body:
                continue
            if kind not in dumped:
                dumped.add(kind)
                with open(os.path.join(probe_dir, f"{kind}.json"), "w",
                          encoding="utf-8") as f:
                    json.dump(body, f, indent=2, ensure_ascii=False)
            hits += len(collect_assets(body))
    finally:
        shutdown_now(pool)
    if stop.is_set():
        return "detail"
    if hits:
        log(f"   assets ride along in the transaction detail "
            f"({hits} in the sample) — one call per transaction")
        mode = "detail"
    else:
        mode = None
        for tpl in ASSET_SUBPATHS:
            found, shaped, kinds_tried = 0, False, set()
            for kind, rid in probes[:10]:
                if stop.is_set():
                    break
                try:
                    d = fetch_assets_page(get, tpl, kind, rid, 1)
                    if isinstance(d, dict) and d.get("status") == 404:
                        continue
                    # An empty collection still proves the endpoint is real;
                    # plenty of transactions simply have no files on them.
                    if is_asset_collection(d):
                        shaped = True
                        kinds_tried.add(kind)
                    found += len(collect_assets(
                        d if isinstance(d, (dict, list)) else {}))
                except AuthExpired:
                    raise
                except Exception:
                    break
            if not shaped:
                continue
            if not all(endpoint_filters(get, tpl, k) for k in kinds_tried):
                log(f"   !  /edge/{tpl} answers, but returns the same files "
                    f"for an id that does not exist — it is not filtering by "
                    f"transaction. Ignoring it.")
                continue
            log(f"   assets live at /edge/{tpl} "
                f"({found} in the sample of {len(probes[:10])})")
            mode = tpl
            break
        if not mode:
            log("!  No assets found in the sample, by any route. Carrying on "
                "with the detail payload in case the sample was just thin.")
            log(f"!  One sample payload per kind is in {probe_dir} — send me "
                f"one that you know has a PDF on it and I'll wire it up.")
            mode = "detail"
    try:
        with open(cache, "w", encoding="utf-8") as f:
            json.dump({"mode": mode}, f)
    except Exception:
        pass
    return mode


# --- downloading ------------------------------------------------------------

def _is_shopvox(url):
    host = (urllib.parse.urlsplit(url).hostname or "").lower()
    return host == "shopvox.com" or host.endswith(".shopvox.com")


class _DropCookieOffSite(urllib.request.HTTPRedirectHandler):
    """Asset URLs usually bounce to S3. Your session cookie has no business
    going there, so it gets dropped the moment we leave shopvox.com."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        new = super().redirect_request(req, fp, code, msg, headers, newurl)
        if new is not None and not _is_shopvox(newurl):
            for h in list(new.headers):
                if h.lower() in ("cookie", "cookie2", "x-shopvox-client"):
                    del new.headers[h]
        return new


_OPENER = urllib.request.build_opener(_DropCookieOffSite)

BAD_CHARS = re.compile(r'[<>:"/\\|?*\x00-\x1f]')


def safe_filename(name, want_pdf):
    name = BAD_CHARS.sub("_", (name or "").strip()).strip(". ")
    if len(name) > 120:
        stem, ext = os.path.splitext(name)
        name = stem[:120 - len(ext)] + ext
    if not name:
        name = "asset.pdf" if want_pdf else "asset"
    if want_pdf and not name.lower().endswith(".pdf"):
        name += ".pdf"
    return name


def unique_path(folder, filename):
    dest = os.path.join(folder, filename)
    if not os.path.exists(dest):
        return dest
    stem, ext = os.path.splitext(filename)
    for n in range(2, 500):
        dest = os.path.join(folder, f"{stem} ({n}){ext}")
        if not os.path.exists(dest):
            return dest
    return os.path.join(folder, f"{stem} ({os.getpid()}){ext}")


def download_asset(cookie, url, dest, want_pdf, tries=3):
    """One file to disk. Returns its size. Written to .part first so a
    half-finished download never looks like a good one."""
    url = urllib.parse.urljoin(BASE + "/", url)
    headers = {"Accept": "*/*", "User-Agent": "Mozilla/5.0",
               "Referer": "https://express.shopvox.com/"}
    if _is_shopvox(url):
        headers["Cookie"] = cookie
        headers["Origin"] = "https://express.shopvox.com"
        headers["x-shopvox-client"] = "web"

    last = None
    for attempt in range(tries):
        tmp = dest + ".part"
        try:
            req = urllib.request.Request(url, headers=headers)
            with _OPENER.open(req, timeout=DOWNLOAD_TIMEOUT) as r:
                head = r.read(1024)
                ctype = (r.headers.get("Content-Type") or "").lower()
                # A cookie that has just died returns the login page with a
                # cheerful 200. Catch it here rather than saving HTML as .pdf.
                if want_pdf and b"%PDF" not in head:
                    if "html" in ctype or head.lstrip()[:1] == b"<":
                        raise AuthExpired(
                            "got a web page instead of a PDF — cookie expired?")
                    raise ValueError(f"not a PDF (server sent "
                                     f"{ctype or 'no content type'})")
                with open(tmp, "wb") as f:
                    f.write(head)
                    shutil.copyfileobj(r, f, 1 << 20)
            os.replace(tmp, dest)
            return os.path.getsize(dest)
        except AuthExpired:
            raise
        except urllib.error.HTTPError as e:
            if e.code in (401, 403):
                raise AuthExpired(f"HTTP {e.code} on the asset URL")
            last = e
            if e.code not in (429, 500, 502, 503, 504) or attempt == tries - 1:
                break
            time.sleep(2 ** attempt)
        except Exception as e:                               # noqa: BLE001
            last = e
            if attempt == tries - 1:
                break
            time.sleep(2 ** attempt)
        finally:
            if os.path.exists(tmp):
                try:
                    os.remove(tmp)
                except OSError:
                    pass
    raise last if last else RuntimeError("download failed")


# --- the stage itself -------------------------------------------------------

def load_saved_lists(out_dir, pulled, log):
    """Fall back to the .json files from an earlier run, so the assets pass
    works on its own without re-pulling every list."""
    out = dict(pulled)
    for kind in ("quotes", "salesOrders", "invoices"):
        if out.get(kind):
            continue
        path = os.path.join(out_dir, f"{kind}.json")
        if os.path.exists(path):
            try:
                with open(path, encoding="utf-8") as f:
                    rows = json.load(f)
                if isinstance(rows, list) and rows:
                    out[kind] = rows
                    log(f"   read {len(rows):,} {kind} from {kind}.json")
            except Exception:
                continue
    return out


def audit_links(out_dir, log):
    """Will every converted quote reach its sales order's folder?

    Reads the .json files a previous run wrote — no cookie, no network,
    nothing downloaded. Worth a few seconds before a long asset run."""
    pulled = load_saved_lists(out_dir, {}, log)
    if not pulled.get("quotes"):
        log("X  no quotes.json in this folder. Tick the list pulls and run "
            "the export once first, or choose the folder that has them.")
        return
    log(f">  {len(pulled.get('quotes') or []):,} quotes, "
        f"{len(pulled.get('salesOrders') or []):,} sales orders, "
        f"{len(pulled.get('invoices') or []):,} invoices")
    build_folder_index(pulled, log)
    log("")
    log("   Nothing was downloaded — this only checks where files WOULD go.")


def pull_assets(get, cookie, out_dir, pulled, log, stop, pdf_only=True):
    pulled = load_saved_lists(out_dir, pulled, log)
    kinds = [k for k in ("quotes", "salesOrders", "invoices") if pulled.get(k)]
    if not kinds:
        log("X  need the quotes / sales orders / invoices lists for this — "
            "tick them too, or run this in a folder that already has them")
        return

    folders = build_folder_index(pulled, log)
    root = os.path.join(out_dir, ASSETS_DIRNAME)
    os.makedirs(root, exist_ok=True)
    mode = discover_asset_mode(get, out_dir, pulled, log, stop)
    if stop.is_set():
        return

    manifest = os.path.join(out_dir, "assets.jsonl")
    scanned_log = os.path.join(out_dir, "assetsScanned.jsonl")

    scanned = set()
    if os.path.exists(scanned_log):
        with open(scanned_log, encoding="utf-8") as f:
            for line in f:
                try:
                    scanned.add(json.loads(line).get("parent_id"))
                except json.JSONDecodeError:
                    continue
        log(f"   resuming — {len(scanned):,} transactions already checked")

    # What the manifest already accounts for, so retrying a half-done
    # transaction neither re-downloads nor double-logs. 'have' keeps each
    # file's path, not just its key, so a file deleted off disk since the
    # last run is fetched again rather than assumed present.
    have, noted = {}, set()
    if os.path.exists(manifest):
        with open(manifest, encoding="utf-8") as f:
            for line in f:
                try:
                    row = json.loads(line)
                except json.JSONDecodeError:
                    continue
                key = f"{row.get('folder')}|{row.get('asset_key')}"
                if row.get("status") == "ok":
                    have[key] = row.get("saved_as") or ""
                elif row.get("status") == "skipped":
                    noted.add(key)

    if have or noted:
        log(f"   {len(have):,} files already downloaded, {len(noted):,} "
            f"skipped previously — these are not fetched again")

    jobs = [(k, str(r["id"])) for k in kinds for r in pulled[k]
            if r.get("id") and str(r["id"]) not in scanned]
    if not jobs:
        log("   nothing new to check")
    else:
        what = "PDFs only" if pdf_only else "every file type"
        log(f">  assets for {len(jobs):,} transactions ({what}, "
            f"{WORKERS} at a time)")

        def one(kind, rid):
            """Returns (manifest rows, complete?, cookie dead?) for one
            transaction. A dead cookie is reported rather than raised, so the
            rows for files that did come down are still written."""
            if stop.is_set():
                return [], False, False   # queued work exits without calling
            folder_names = folders.get((kind, rid)) or [f"UNKNOWN-{rid[:8]}"]
            rows, complete, auth_dead = [], True, False
            for a in fetch_assets(get, mode, kind, rid):
                if stop.is_set():
                    complete = False      # unfinished, so it is retried
                    break
                key = a["asset_id"] or a["url"]
                want_pdf = is_pdf(a["name"], a["url"], a["content_type"])
                # A quote that fed two sales orders belongs in both folders.
                # Fetch it once, then copy — no second trip for the same file.
                first_copy = None
                for folder_name in folder_names:
                    row = dict(a, parent_kind=kind, parent_id=rid,
                               folder=folder_name, asset_key=key,
                               saved_as="", status="", note="")
                    if pdf_only and not want_pdf:
                        if f"{folder_name}|{key}" not in noted:
                            row["status"] = "skipped"
                            row["note"] = "not a PDF"
                            rows.append(row)
                        continue
                    prev = have.get(f"{folder_name}|{key}")
                    if prev and os.path.exists(os.path.join(out_dir, prev)):
                        continue      # already on disk, and in the manifest
                    folder = os.path.join(root, folder_name)
                    os.makedirs(folder, exist_ok=True)
                    dest = unique_path(folder,
                                       safe_filename(a["name"], want_pdf))
                    try:
                        if first_copy and os.path.exists(first_copy):
                            shutil.copy2(first_copy, dest)
                            size = os.path.getsize(dest)
                        else:
                            size = download_asset(cookie, a["url"], dest,
                                                  want_pdf)
                            first_copy = dest
                        row["status"] = "ok"
                        row["saved_as"] = os.path.relpath(dest, out_dir)
                        row["size"] = size or row.get("size", "")
                    except AuthExpired as e:
                        row["status"] = "failed"
                        row["note"] = str(e)[:200]
                        complete, auth_dead = False, True
                        rows.append(row)
                        break
                    except Exception as e:                   # noqa: BLE001
                        row["status"] = "failed"
                        row["note"] = str(e)[:200]
                        complete = False
                    rows.append(row)
                if auth_dead:
                    break
            return rows, complete, auth_dead

        saved = skipped = failed = 0
        seen_folders = set()
        total_bytes = 0
        lock = threading.Lock()
        with open(manifest, "a", encoding="utf-8") as mf, \
                open(scanned_log, "a", encoding="utf-8") as sf:
            pool = ThreadPoolExecutor(max_workers=WORKERS)
            try:
                futures = {pool.submit(one, k, i): (k, i) for k, i in jobs}
                for n, fut in enumerate(as_completed(futures), 1):
                    if stop.is_set():
                        log("   stopped — progress kept, re-run to continue")
                        break
                    kind, rid = futures[fut]
                    try:
                        rows, complete, auth_dead = fut.result()
                    except AuthExpired as e:
                        log(f"X  {e} — stopping cleanly, progress kept")
                        break
                    except Exception:
                        failed += 1
                        continue
                    with lock:
                        for row in rows:
                            mf.write(json.dumps(row, ensure_ascii=False) + "\n")
                            if row["status"] == "ok":
                                if row["saved_as"]:
                                    saved += 1
                                    seen_folders.add(row["folder"])
                                    if isinstance(row.get("size"), int):
                                        total_bytes += row["size"]
                                have[f"{row['folder']}|"
                                     f"{row['asset_key']}"] = row["saved_as"]
                            elif row["status"] == "skipped":
                                noted.add(
                                    f"{row['folder']}|{row['asset_key']}")
                                skipped += 1
                            else:
                                failed += 1
                        # Only a clean transaction counts as checked, so a
                        # failed download is retried on the next run.
                        if complete:
                            sf.write(json.dumps({"parent_id": rid,
                                                 "parent_kind": kind}) + "\n")
                        # Flushed per transaction, not per fifty: a force-quit
                        # must not cost work that is already on disk.
                        mf.flush()
                        sf.flush()
                    if auth_dead:
                        log("X  a download came back as a login page — the "
                            "cookie has expired. Stopped cleanly, progress "
                            "kept: grab a fresh one and re-run.")
                        break
                    if n % 50 == 0:
                        log(f"     {n:,}/{len(jobs):,}  ({saved:,} files into "
                            f"{len(seen_folders):,} folders, {failed} failed)")
            finally:
                shutdown_now(pool)
                mf.flush()
                sf.flush()
        log(f"   {saved:,} files saved ({total_bytes / 1e6:,.1f} MB) into "
            f"{len(seen_folders):,} folders, {skipped:,} skipped, "
            f"{failed} failed")

    if os.path.exists(manifest):
        n = csv_from_jsonl(manifest, os.path.join(out_dir, "assets.csv"))
        log(f"OK assets.csv: {n:,} rows  (every asset seen, downloaded or not)")
        log(f"OK files are in {root}")


# ---------------------------------------------------------------------------
# The manual, shown by the "How this works" button
# ---------------------------------------------------------------------------

MANUAL = """\
shopVOX Export — how this works

This pulls your shopVOX data out through the same API the web app uses,
and saves every PDF attached to a transaction into a folder named after
that job.

## Quick start

1.  Paste your shopVOX cookie into the box at the top.
2.  Choose the folder to save into.
3.  Leave the tick boxes as they are and press Run export.

That is the whole job. It will take a while — there are tens of
thousands of transactions — but you can stop it and pick it up later.
See "Stopping and starting again" below, which is the part worth
reading properly.

## Getting the cookie

The cookie is how shopVOX knows it is you. It is not your password, and
it expires after a while.

1.  Log into shopVOX in your browser.
2.  Press F12 to open the developer tools, and click the Network tab.
3.  Click anything in shopVOX so a request appears in the list. Click a
    request that goes to api.shopvox.com.
4.  Find the "cookie:" line under Request Headers and copy the WHOLE
    value, however long it is.
5.  Paste it into the box at the top of this program.

!! Treat it like a password. Anyone who has it can act as you in
!! shopVOX until it expires. Do not paste it into emails or share
!! screenshots of it.

If the run stops and says the cookie has expired, just fetch a fresh
one the same way and run it again. Nothing is lost.

## What gets pulled

The tick boxes on the "Pull:" row are the list exports — companies,
contacts, quotes, sales orders, invoices. Each lands as a .csv and a
.json in your folder.

Below them:

    line items          one request per transaction. Slow.
    transaction assets  the PDFs. This is the one you probably want.
    company addresses   the addresses the list export leaves out.

Under "transaction assets" there is a "PDFs only" box. Leave it ticked
to take just the PDFs. Untick it to take every attachment — JPEGs,
Word documents, everything.

!! Leave the quotes, salesOrders and invoices boxes ticked when you run
!! the assets. It needs those lists to work out which folder each file
!! belongs in. If they are already in the folder from an earlier run it
!! will read them from there instead.

## Where the PDFs go

Everything lands under a folder called "assets" inside the folder you
chose, one sub-folder per job:

    assets/QT 62600/    a quote that never went any further
    assets/SO60008/     a sales order, and everything leading to it

The rule is that a folder is named after the most recent transaction
number in the chain.

A job usually starts as a quote, becomes a sales order, and then gets
invoiced. Quotes have their own numbering, but a sales order and its
invoice share a number — SO60008 becomes IN60008. So:

    QT62495  ->  SO60008  ->  IN60008     all files go to  assets/SO60008/

That includes files attached to the QUOTE. If the proof was uploaded at
quote stage and the sales order itself has nothing on it, the proof
still ends up in the sales order's folder. This is the same thing
shopVOX shows you under "Related Assets" on the sales order.

A quote that never became anything keeps its own folder, "QT 62600".

If one quote became two sales orders, its files go into both folders,
so neither job is missing paperwork. It is only downloaded once.

## Stopping and starting again

You can close this program at any time. Nothing is wasted.

It keeps a record of what it has done in two files in your folder:

    assetsScanned.jsonl    transactions it has finished
    assets.jsonl           every file it has seen, and what happened

Next time you run it, pointing at the SAME folder, it reads those and
carries on where it stopped. Files already downloaded are not fetched
again.

!! Keep those .jsonl files. They are the memory. If you delete them it
!! will download everything a second time, and because the PDFs are
!! still there you will end up with "Proof (2).pdf" duplicates.

If you delete a PDF yourself, it notices the file has gone and fetches
that one again on the next run. The folder repairs itself.

A transaction only counts as finished when every one of its files came
down cleanly. If a download fails, that transaction is left for next
time, and the files that did arrive are not re-fetched.

The same applies to line items and company addresses, which keep their
own .jsonl files.

## The two settings

    per page    how many records per request on the list pulls.
                500 is fine. Lower it if the lists time out.

    at once     how many requests run at the same time. 6 by default,
                up to 16.

Turning "at once" up makes it faster, to a point. Past about 16 the API
starts refusing requests and the program has to wait and retry, which
loses more time than the extra speed gains. If you see the failure
count climbing in the progress lines, turn it down.

Remember each one of those also downloads files, so 12 at once can mean
12 PDFs downloading together. That is bandwidth as much as anything.

## Check links (no cookie)

This button answers one question: will every converted quote's files
end up in its sales order's folder?

It reads the .json files already in your folder. No cookie, no
internet, nothing downloaded, a couple of seconds.

It tells you how many quotes became sales orders, how many say which
one, and names any that do not. A quote that has been marked as ordered
but names no sales order cannot be followed, so its files stay in a QT
folder. That is usually because the sales order was voided or deleted
and the flag was left behind. Look the number up in shopVOX and move
the folder by hand if it turns out to matter.

## What it writes

    companies.csv / .json          the list exports
    contacts.csv / .json
    quotes.csv / .json
    salesOrders.csv / .json
    invoices.csv / .json
    lineItems.csv / .jsonl
    companyAddresses.csv / .jsonl

    assets/                        the PDFs, in job folders
    assets.csv                     every attachment found, downloaded
                                   or skipped, and why
    assets.jsonl                   the record that makes resuming work
    assetsScanned.jsonl            which transactions are finished
    assetsMode.json                remembers where the assets live, so
                                   restarts skip the discovery step

assets.csv is worth a look when it finishes. It lists everything it
saw, including the files it skipped for not being PDFs, so you can see
what else is there before deciding whether to fetch the lot.

## When something goes wrong

    "Auth failed" or "cookie expired"
        Fetch a fresh cookie and run it again. Progress is kept.

    A lot of failures in the progress lines
        Turn "at once" down and run it again. It will retry whatever
        did not come down.

    "no endpoint found" on a list
        shopVOX has renamed something. Tell me which one.

    Nothing found in the sample during the asset probe
        It leaves example payloads in a folder called _asset_probe.
        Send me one and I will wire it up.

    It seems to have done nothing
        Check you picked the right folder, and that the quotes, sales
        orders and invoices boxes are ticked.
"""


def show_manual(root):
    """The manual, in its own window. One at a time — clicking again
    raises the window that is already open rather than stacking another."""
    existing = getattr(root, "_manual_win", None)
    try:
        if existing is not None and existing.winfo_exists():
            existing.lift()
            existing.focus_force()
            return
    except tk.TclError:
        pass

    win = tk.Toplevel(root)
    root._manual_win = win
    win.title("shopVOX Export — how this works")
    win.geometry("820x720")
    win.minsize(560, 400)

    txt = scrolledtext.ScrolledText(win, wrap="word", padx=18, pady=14,
                                    font=("Segoe UI", 10), background="white")
    txt.pack(fill="both", expand=True)
    txt.tag_configure("h", font=("Segoe UI", 13, "bold"),
                      spacing1=16, spacing3=6)
    txt.tag_configure("title", font=("Segoe UI", 15, "bold"), spacing3=8)
    txt.tag_configure("code", font=("Consolas", 9), lmargin1=20, lmargin2=20)
    txt.tag_configure("warn", font=("Segoe UI", 10, "bold"),
                      foreground="#9a3412")

    for i, line in enumerate(MANUAL.splitlines()):
        if i == 0:
            txt.insert("end", line + "\n", "title")
        elif line.startswith("## "):
            txt.insert("end", line[3:] + "\n", "h")
        elif line.startswith("!! "):
            txt.insert("end", line[3:] + "\n", "warn")
        elif line.startswith("    "):
            txt.insert("end", line + "\n", "code")
        else:
            txt.insert("end", line + "\n")
    txt.config(state="disabled")          # still selectable, just not typable

    ttk.Button(win, text="Close", command=win.destroy).pack(pady=(0, 10))
    win.bind("<Escape>", lambda e: win.destroy())


# ---------------------------------------------------------------------------
# GUI
# ---------------------------------------------------------------------------

class App:
    def __init__(self, root):
        self.root = root
        self.q = queue.Queue()
        self.stop = threading.Event()
        root.title("shopVOX Export — everything")
        root.geometry("820x760")

        pad = {"padx": 10, "pady": 6}
        frm = ttk.Frame(root)
        frm.pack(fill="both", expand=True)

        ttk.Label(frm, text=(
            "1.  Paste your shopVOX cookie  (F12 -> Network -> any "
            "api.shopvox.com request -> the 'cookie:' header):")
        ).pack(anchor="w", **pad)
        self.cookie = scrolledtext.ScrolledText(frm, height=5, wrap="char")
        self.cookie.pack(fill="x", padx=10)

        row = ttk.Frame(frm); row.pack(fill="x", **pad)
        ttk.Label(row, text="2.  Save to:").pack(side="left")
        self.out_var = tk.StringVar(value=os.path.expanduser("~"))
        ttk.Entry(row, textvariable=self.out_var).pack(
            side="left", fill="x", expand=True, padx=6)
        ttk.Button(row, text="Browse...", command=self.browse).pack(side="left")

        ttk.Label(frm, text="3.  Pull:").pack(anchor="w", padx=10)
        row2 = ttk.Frame(frm); row2.pack(fill="x", padx=20)
        self.checks = {}
        for label in TARGETS:
            v = tk.BooleanVar(value=True)
            ttk.Checkbutton(row2, text=label, variable=v).pack(side="left", padx=4)
            self.checks[label] = v

        row3 = ttk.Frame(frm); row3.pack(fill="x", padx=20, pady=(4, 0))
        self.want_lines = tk.BooleanVar(value=True)
        ttk.Checkbutton(row3, text="line items  (slow — one call per "
                        "transaction, resumable)",
                        variable=self.want_lines).pack(anchor="w")
        self.want_assets = tk.BooleanVar(value=True)
        ttk.Checkbutton(row3, text="transaction assets  (saves files into "
                        "assets/SO51172, assets/QT 58232 — resumable)",
                        variable=self.want_assets,
                        command=self.sync_assets).pack(anchor="w")
        self.pdf_only = tk.BooleanVar(value=True)
        self.pdf_chk = ttk.Checkbutton(
            row3, text="        PDFs only  (untick to take every attachment)",
            variable=self.pdf_only)
        self.pdf_chk.pack(anchor="w")
        self.want_addr = tk.BooleanVar(value=False)
        ttk.Checkbutton(row3, text="company addresses  (untested — if it "
                        "fails, use Pro's Customers > Export > To CSV)",
                        variable=self.want_addr).pack(anchor="w")

        row4 = ttk.Frame(frm); row4.pack(fill="x", **pad)
        ttk.Label(row4, text="per page:").pack(side="left")
        self.per = tk.StringVar(value="500")
        ttk.Entry(row4, textvariable=self.per, width=6).pack(side="left", padx=4)
        ttk.Label(row4, text="at once:").pack(side="left", padx=(8, 0))
        self.workers_var = tk.StringVar(value=str(WORKERS))
        ttk.Spinbox(row4, from_=1, to=WORKERS_MAX, width=4,
                    textvariable=self.workers_var).pack(side="left", padx=4)
        self.run_btn = ttk.Button(row4, text="Run export", command=self.start)
        self.run_btn.pack(side="left", padx=10)
        self.stop_btn = ttk.Button(row4, text="Stop",
                                   command=self.request_stop,
                                   state="disabled")
        self.stop_btn.pack(side="left")
        ttk.Button(row4, text="Check links (no cookie)",
                   command=self.audit).pack(side="left", padx=10)
        ttk.Button(row4, text="How this works",
                   command=lambda: show_manual(self.root)).pack(side="right")

        ttk.Label(frm, text="Progress:").pack(anchor="w", padx=10)
        self.log = scrolledtext.ScrolledText(frm, height=20, state="disabled",
                                             font=("Consolas", 9))
        self.log.pack(fill="both", expand=True, padx=10, pady=(0, 6))

        self.open_btn = ttk.Button(frm, text="Open output folder",
                                   command=self.open_folder)
        self.open_btn.pack(pady=(0, 8)); self.open_btn.pack_forget()
        self.root.after(100, self.drain)

    def sync_assets(self):
        self.pdf_chk.config(
            state="normal" if self.want_assets.get() else "disabled")

    def browse(self):
        d = filedialog.askdirectory(initialdir=self.out_var.get())
        if d:
            self.out_var.set(d)

    def open_folder(self):
        d = self.out_var.get()
        try:
            if sys.platform.startswith("win"):
                os.startfile(d)                              # noqa
            elif sys.platform == "darwin":
                subprocess.run(["open", d])
            else:
                subprocess.run(["xdg-open", d])
        except Exception:
            pass

    def put(self, msg):
        self.q.put(msg)

    def drain(self):
        try:
            while True:
                msg = self.q.get_nowait()
                if msg == "__DONE__":
                    self.run_btn.config(state="normal", text="Run export")
                    self.stop_btn.config(state="disabled", text="Stop")
                    self.open_btn.pack(pady=(0, 8))
                else:
                    self.log.config(state="normal")
                    self.log.insert("end", msg + "\n")
                    self.log.see("end")
                    self.log.config(state="disabled")
        except queue.Empty:
            pass
        self.root.after(100, self.drain)

    def request_stop(self):
        """Stop finishes what is already in flight, then bails out — a few
        seconds, not the whole queue."""
        self.stop.set()
        self.stop_btn.config(state="disabled", text="Stopping...")

    def audit(self):
        """The link check on its own — no cookie, no network."""
        out_dir = self.out_var.get().strip()
        if not os.path.isdir(out_dir):
            messagebox.showwarning("Folder needed", "Choose a valid folder.")
            return
        self.log.config(state="normal"); self.log.delete("1.0", "end")
        self.log.config(state="disabled")

        def worker():
            try:
                audit_links(out_dir, self.put)
            except Exception as e:                           # noqa: BLE001
                self.put(f"X  {e}")
            finally:
                self.put("__DONE__")

        threading.Thread(target=worker, daemon=True).start()

    def start(self):
        global WORKERS
        cookie = self.cookie.get("1.0", "end").strip()
        if not cookie:
            messagebox.showwarning("Cookie needed", "Paste your cookie first.")
            return
        out_dir = self.out_var.get().strip()
        if not os.path.isdir(out_dir):
            messagebox.showwarning("Folder needed", "Choose a valid folder.")
            return
        chosen = [l for l, v in self.checks.items() if v.get()]
        try:
            per = max(1, int(self.per.get()))
        except ValueError:
            per = 500
        try:
            WORKERS = max(1, min(WORKERS_MAX, int(self.workers_var.get())))
        except ValueError:
            pass
        self.workers_var.set(str(WORKERS))

        self.stop.clear()
        self.log.config(state="normal"); self.log.delete("1.0", "end")
        self.log.config(state="disabled")
        self.open_btn.pack_forget()
        self.run_btn.config(state="disabled", text="Running...")
        self.stop_btn.config(state="normal")

        def worker():
            try:
                get = make_get(cookie)
                pulled = {}
                if chosen:
                    pulled = pull_lists(get, out_dir, chosen, per, 0.3,
                                        self.put, self.stop)
                if self.want_lines.get() and not self.stop.is_set():
                    self.put("")
                    pull_line_items(get, out_dir, pulled, self.put, self.stop)
                if self.want_assets.get() and not self.stop.is_set():
                    self.put("")
                    pull_assets(get, " ".join(cookie.split()), out_dir,
                                pulled, self.put, self.stop,
                                pdf_only=self.pdf_only.get())
                if self.want_addr.get() and not self.stop.is_set():
                    self.put("")
                    pull_company_addresses(get, out_dir, pulled, self.put,
                                           self.stop)
                self.put("")
                self.put("Done. Feed the folder to JASPER's Import from ShopVox.")
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
