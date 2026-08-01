#!/usr/bin/env python3
"""ShopVox archive schema audit against Supabase.

Introspects everything the PostgREST API exposes for the anon/publishable
role, then writes a raw JSON dump that shopvox-schema-notes.md is written
from. Read-only: only GET/HEAD requests are made.

Usage:
    SUPABASE_URL=https://<ref>.supabase.co \
    SUPABASE_KEY=sb_publishable_... \
    python3 scripts/shopvox-schema-audit.py [output.json]

For each exposed table/view it records:
  - columns with types, from the OpenAPI spec (definitions)
  - exact row count (HEAD request with count=exact)
  - first 5 rows as a sample (to judge whether dates/money imported as
    text, spot embedded JSON line items, and find linking ID columns)
"""

import json
import os
import ssl
import sys
import urllib.request


def main() -> int:
    base = os.environ.get("SUPABASE_URL", "").rstrip("/")
    key = os.environ.get("SUPABASE_KEY", "")
    if not base or not key:
        print("Set SUPABASE_URL and SUPABASE_KEY", file=sys.stderr)
        return 2
    out_path = sys.argv[1] if len(sys.argv) > 1 else "shopvox-schema-raw.json"

    headers = {"apikey": key, "Authorization": f"Bearer {key}"}
    ca = os.environ.get("SSL_CERT_FILE") or None
    ctx = ssl.create_default_context(cafile=ca)

    def get(path: str, extra: dict | None = None, method: str = "GET"):
        req = urllib.request.Request(
            f"{base}{path}", headers={**headers, **(extra or {})}, method=method
        )
        with urllib.request.urlopen(req, context=ctx, timeout=60) as resp:
            body = resp.read().decode()
            return resp.headers, (json.loads(body) if body else None)

    _, spec = get("/rest/v1/")
    tables = sorted(p.strip("/") for p in spec.get("paths", {}) if p != "/")
    print(f"{len(tables)} exposed tables/views: {', '.join(tables)}")

    report = {"base_url": base, "definitions": spec.get("definitions", {}), "tables": {}}
    for t in tables:
        entry: dict = {}
        try:
            h, _ = get(f"/rest/v1/{t}?select=*", {"Prefer": "count=exact", "Range": "0-0"})
            entry["row_count"] = int(h.get("Content-Range", "/-1").split("/")[-1])
        except Exception as e:  # noqa: BLE001 - record and continue
            entry["row_count_error"] = str(e)
        try:
            _, rows = get(f"/rest/v1/{t}?select=*&limit=5")
            entry["sample_rows"] = rows
        except Exception as e:  # noqa: BLE001
            entry["sample_error"] = str(e)
        report["tables"][t] = entry
        print(f"  {t}: rows={entry.get('row_count', '?')}")

    with open(out_path, "w") as f:
        json.dump(report, f, indent=2, default=str)
    print(f"Wrote {out_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
