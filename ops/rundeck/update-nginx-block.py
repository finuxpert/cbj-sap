#!/usr/bin/env python3
"""Safely replace one SPHERE managed Nginx block without touching sibling environments."""
from __future__ import annotations

import argparse
from pathlib import Path


def managed_block(name: str, snippet: str) -> str:
    key = name.upper()
    return (
        f"    # BEGIN SPHERE {key} ROUTING\n"
        f"{snippet.rstrip()}\n"
        f"    # END SPHERE {key} ROUTING\n"
    )


def replace_block(text: str, *, name: str, snippet: str, anchor: str, legacy_marker: str = "", protected_markers: tuple[str, ...] = ()) -> str:
    key = name.upper()
    begin = f"    # BEGIN SPHERE {key} ROUTING\n"
    end = f"    # END SPHERE {key} ROUTING\n"
    block = managed_block(key, snippet)

    has_begin = begin in text
    has_end = end in text
    if has_begin != has_end:
        raise ValueError(f"Unbalanced managed markers for {key}")

    if has_begin:
        start = text.index(begin)
        finish = text.index(end, start) + len(end)
        segment = text[start:finish]
        for protected in protected_markers:
            if protected and protected in segment:
                raise ValueError(f"Refusing to replace {key}: protected marker found inside managed block: {protected.strip()}")
        return text[:start] + block + text[finish:]

    if legacy_marker and legacy_marker in text:
        start = text.index(legacy_marker)
        if anchor not in text[start:]:
            raise ValueError(f"Legacy {key} marker found but safe anchor is missing")
        finish = text.index(anchor, start)
        segment = text[start:finish]
        for protected in protected_markers:
            if protected and protected in segment:
                raise ValueError(f"Refusing legacy {key} migration: protected marker would be removed: {protected.strip()}")
        return text[:start] + block + "\n" + text[finish:]

    if anchor not in text:
        raise ValueError(f"Safe Nginx anchor not found for {key}: {anchor.strip()}")
    return text.replace(anchor, block + "\n" + anchor, 1)


def main() -> int:
    parser = argparse.ArgumentParser(description="Safely update one SPHERE Nginx managed block")
    parser.add_argument("--site", required=True)
    parser.add_argument("--snippet", required=True)
    parser.add_argument("--name", required=True, choices=["DEV", "PROD"])
    parser.add_argument("--anchor", required=True)
    parser.add_argument("--legacy-marker", default="")
    parser.add_argument("--protect", action="append", default=[])
    args = parser.parse_args()

    site = Path(args.site)
    snippet = Path(args.snippet)
    original = site.read_text()
    updated = replace_block(
        original,
        name=args.name,
        snippet=snippet.read_text(),
        anchor=args.anchor,
        legacy_marker=args.legacy_marker,
        protected_markers=tuple(args.protect),
    )
    site.write_text(updated)
    print(f"SPHERE {args.name} Nginx managed block updated safely")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
