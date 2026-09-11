#!/usr/bin/env python3
"""Kiểm tra mọi FR ưu tiên M đều có test mang đúng mã.

Chạy: python scripts/check_traceability.py
Exit 1 nếu có FR ưu tiên M chưa có test tương ứng.
"""
import re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SPEC_DOC = ROOT / "docs" / "FR_NFR_SCENTSTATION.md"
TESTS = ROOT / "tests"

FR_ROW = re.compile(r"^\|\s*(FR-[A-Z]+-\d+[a-z]?)\s*\|.*\|\s*([MSW])\s*\|")
TEST_FN = re.compile(r"def\s+(test_FR_[A-Z]+_\d+[a-z]?_\w+)")

def collect_required():
    if not SPEC_DOC.exists():
        sys.exit(f"Khong tim thay {SPEC_DOC}")
    out = {}
    for line in SPEC_DOC.read_text(encoding="utf-8").splitlines():
        m = FR_ROW.match(line.strip())
        if m and m.group(2) == "M":
            out[m.group(1)] = line.strip()
    return out

def collect_covered():
    covered = set()
    if not TESTS.exists():
        return covered
    for f in TESTS.rglob("*.py"):
        for name in TEST_FN.findall(f.read_text(encoding="utf-8", errors="ignore")):
            parts = name.split("_")           # test FR ORD 15 ...
            covered.add(f"FR-{parts[2]}-{parts[3]}")
    return covered

def main():
    required = collect_required()
    covered = collect_covered()
    missing = sorted(set(required) - covered)

    print(f"FR uu tien M : {len(required)}")
    print(f"Da co test   : {len(required) - len(missing)}")
    print(f"Con thieu    : {len(missing)}")

    if missing:
        print("\nChua co test:")
        for fr in missing:
            print("  -", fr)
        sys.exit(1)
    print("\nOK - moi FR uu tien M deu co test.")

if __name__ == "__main__":
    main()
