#!/usr/bin/env python3
"""
shopVOX link audit — will every converted quote reach its sales order?
======================================================================
A converted quote's files belong in its sales order's folder. That
depends on the quote's record listing the sales orders it became. This
counts how many quotes carry that list and how many don't, so you know
before a long export run whether any job would be filed in the wrong
place.

Runs entirely off the .json files a previous export wrote. No cookie,
no network, a couple of seconds.

  python shopvox_audit_links.py   ->  pick the folder  ->  Audit
"""

import json
import os
import queue
import re
import threading
import tkinter as tk
from tkinter import filedialog, messagebox, scrolledtext, ttk

NUM_RE = re.compile(r"^(?:(?:QT|SO|WO|IN|INV|EST)[\s\-_#]*)?(\d{2,})$", re.I)
NUMBER_KEYS = ("txnNumber", "transactionNumber", "number", "quoteNumber",
               "salesOrderNumber", "workOrderNumber", "invoiceNumber")
CHILD_KEYS = ("salesOrders", "workOrders", "orders", "invoices")


def number(rec):
    for k in NUMBER_KEYS:
        v = rec.get(k)
        if v is None:
            continue
        m = NUM_RE.match(str(v).strip())
        if m:
            return m.group(1)
    return None


def converted(rec):
    if rec.get("ordered") is True or rec.get("invoiced") is True:
        return True
    for k in ("status", "state", "workflowState", "quoteStatus"):
        v = rec.get(k)
        if isinstance(v, str) and any(h in v.lower() for h in
                                      ("convert", "ordered", "won",
                                       "invoice")):
            return True
    return False


def children(rec):
    out = []
    for k in CHILD_KEYS:
        v = rec.get(k)
        if isinstance(v, list):
            out += [x for x in v if isinstance(x, dict)]
    return out


def load(folder, name):
    path = os.path.join(folder, f"{name}.json")
    if not os.path.exists(path):
        return None
    with open(path, encoding="utf-8") as f:
        rows = json.load(f)
    return rows if isinstance(rows, list) else None


def audit(folder, log):
    quotes = load(folder, "quotes")
    sos = load(folder, "salesOrders")
    if quotes is None:
        log("X  no quotes.json in that folder. Run the exporter's list pull "
            "first, or pick the folder that has it.")
        return
    log(f"   quotes.json      {len(quotes):,} records")
    log(f"   salesOrders.json {len(sos):,} records" if sos is not None
        else "   salesOrders.json missing — candidate matching is off")
    log("")

    conv = [q for q in quotes if converted(q)]
    linked = [q for q in conv if children(q)]
    gap = [q for q in conv if not children(q)]
    multi = [q for q in linked if len(children(q)) > 1]

    log(f">  {len(quotes):,} quotes")
    log(f"   {len(conv):,} became a sales order or invoice")
    log(f"   {len(linked):,} of those say which one  ->  filed under SO")
    log(f"   {len(multi):,} became more than one  ->  filed under each")
    log("")

    if not gap:
        log("OK Every converted quote names its sales order.")
        log("   Nothing can be misfiled. Run the export.")
        return

    pct = 100.0 * len(gap) / max(1, len(conv))
    log(f"!  {len(gap):,} converted quotes ({pct:.1f}%) do NOT say which "
        f"sales order they became.")
    log("   As it stands their files would go under QT, not SO.")
    log("")

    # Would company + title identify the sales order for them?
    if sos is None:
        return
    by_key = {}
    for s in sos:
        comp = ((s.get("company") or {}).get("id")
                if isinstance(s.get("company"), dict) else None)
        title = (s.get("title") or "").strip().lower()
        if comp and title:
            by_key.setdefault((comp, title), []).append(s)

    one = several = none = 0
    examples = []
    for q in gap:
        comp = ((q.get("company") or {}).get("id")
                if isinstance(q.get("company"), dict) else None)
        title = (q.get("title") or "").strip().lower()
        hits = by_key.get((comp, title), []) if comp and title else []
        if len(hits) == 1:
            one += 1
            if len(examples) < 5:
                examples.append(f"QT{number(q)} -> SO{number(hits[0])}")
        elif len(hits) > 1:
            several += 1
        else:
            none += 1

    log(">  could company + title identify them instead?")
    log(f"   {one:,} match exactly one sales order   (safe to place)")
    log(f"   {several:,} match several               (ambiguous)")
    log(f"   {none:,} match none                     (no candidate)")
    for e in examples:
        log(f"     e.g. {e}")
    log("")
    log("   Send me these numbers and I'll wire up whichever fallback "
        "the shape of your data justifies.")


class App:
    def __init__(self, root):
        self.root = root
        self.q = queue.Queue()
        root.title("shopVOX link audit")
        root.geometry("720x520")
        frm = ttk.Frame(root)
        frm.pack(fill="both", expand=True)
        row = ttk.Frame(frm)
        row.pack(fill="x", padx=10, pady=10)
        ttk.Label(row, text="Export folder:").pack(side="left")
        self.out = tk.StringVar(value=os.path.expanduser("~"))
        ttk.Entry(row, textvariable=self.out).pack(
            side="left", fill="x", expand=True, padx=6)
        ttk.Button(row, text="Browse...", command=self.browse).pack(side="left")
        ttk.Button(row, text="Audit", command=self.start).pack(
            side="left", padx=8)
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
                self.log.config(state="normal")
                self.log.insert("end", m + "\n")
                self.log.see("end")
                self.log.config(state="disabled")
        except queue.Empty:
            pass
        self.root.after(100, self.drain)

    def start(self):
        folder = self.out.get().strip()
        if not os.path.isdir(folder):
            messagebox.showwarning("Folder", "Choose a valid folder.")
            return
        self.log.config(state="normal")
        self.log.delete("1.0", "end")
        self.log.config(state="disabled")

        def worker():
            try:
                audit(folder, self.put)
            except Exception as e:                            # noqa: BLE001
                self.put(f"X  {e}")

        threading.Thread(target=worker, daemon=True).start()


if __name__ == "__main__":
    root = tk.Tk()
    App(root)
    root.mainloop()
