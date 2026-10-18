#!/usr/bin/env python3
"""Check the App Store listing copy for Temple of the High Priestess: Apple limits + keyword hygiene for
docs/asc/metadata/en-US (upload-ready, fastlane deliver layout). Also: the LISTING.md fenced blocks must equal
metadata/en-US, banned / competitor / unshipped phrases must not appear, URLs and review contact are the agreed ones,
the reviewer note covers the required points, and the screenshot set is the right size and count. Exit 1 on any failure.
Same checks as the ProTune script in yishengjiang99/photo-recipes (char limits, banned words, keyword hygiene).
Usage: python3 docs/asc/check_copy.py        (screenshot sizes need only the stdlib)
"""
from __future__ import annotations
import re, struct, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
META = HERE / "metadata"
LOC = META / "en-US"
SHOTS = HERE / "screenshots" / "en-US"
FIELDS = [("name", "Name", 30), ("subtitle", "Subtitle", 30), ("keywords", "Keywords", 100),
          ("promotional_text", "Promotional text", 170), ("description", "Description", 4000)]
# Phrases that describe unshipped features; must never reach the upload-ready files.
PENDING = [r"coming soon", r"unreleased", r"beta feature", r"game center", r"achievement", r"leaderboard",
           r"subscription required", r"multiplayer", r"ipad"]
# Banned anywhere in the upload-ready listing: Apple rejected "Grok" on a sister app, and no competitor trademarks.
BANNED = ["grok", "final fantasy", "fate/stay", "stay night", "pokemon", "pokémon", "zelda", "nintendo", "genshin",
          "persona", "dragon quest", "chrono", "square enix", "lina", "linahua", "elevenlabs", "chatgpt", "openai",
          "best app", "#1", "number one"]
EXPECT = {"support_url": "https://grepawk.com/high-priestess/support",
          "privacy_url": "https://grepawk.com/high-priestess/privacy",
          "marketing_url": "https://grepawk.com/high-priestess/"}
REVIEW = {"first_name": "Yisheng", "last_name": "Jiang", "phone_number": "+1 669 251 7789",
          "email_address": "yisheng.jiang@gmail.com", "demo_required": "false"}
NOTES_MUST = ["free download", "prologue", "region 1", "non-consumable", "$4.99", "data only", "executable code",
              "anonymous", "device-bound", "delete"]
SHOT_SPECS = {"iphone-69": ((2868, 1320), 5, 10, True), "ipad-13": ((2752, 2064), 5, 10, False)}  # size, min, max, required
errors: list[str] = []


def blocks(md: Path, pat: str) -> dict[str, str]:
    return {m.group(1).strip(): m.group(2).strip()
            for m in re.finditer(pat, md.read_text(), re.S | re.M)}


def words(s: str) -> set[str]:
    return {w for w in re.findall(r"[a-z0-9]+", s.lower())}


def check_keywords(tag: str, kw: str, name: str, subtitle: str) -> None:
    if ", " in kw or kw != kw.strip():
        errors.append(f"{tag} keywords: space after comma / padding")
    items = kw.split(",")
    low = [k.lower() for k in items]
    if any(not k for k in low):
        errors.append(f"{tag} keywords: empty item")
    if len(set(low)) != len(low):
        errors.append(f"{tag} keywords: duplicate item")
    taken = words(name) | words(subtitle)
    for k in low:
        dup = words(k) & taken
        if dup:
            errors.append(f"{tag} keywords: {k!r} repeats name/subtitle word {sorted(dup)}")
        if " " in k:
            errors.append(f"{tag} keywords: {k!r} contains a space (Apple splits on spaces; wastes characters)")
        if k.endswith("s") and k[:-1] in low:
            errors.append(f"{tag} keywords: plural {k!r} duplicates singular")


def table(tag: str, vals: dict[str, str]) -> None:
    print(f"{tag}")
    print(f"  {'field':<18}{'chars':>6}{'limit':>7}  ok")
    for key, label, lim in FIELDS:
        n = len(vals[key])
        ok = 0 < n <= lim
        if not ok:
            errors.append(f"{tag} {label}: {n} chars (limit {lim})")
        print(f"  {label:<18}{n:>6}{lim:>7}  {'yes' if ok else 'NO'}")
    blob = " ".join(vals.values()).lower()
    for b in BANNED:
        if re.search(r"(?<![a-z0-9])" + re.escape(b) + r"(?![a-z0-9])", blob):
            errors.append(f"{tag}: contains banned / competitor term {b!r}")
    check_keywords(tag, vals["keywords"], vals["name"], vals["subtitle"])


def png_size(p: Path) -> tuple[int, int]:
    b = p.read_bytes()[:24]
    if b[:8] != b"\x89PNG\r\n\x1a\n":
        errors.append(f"{p.name}: not a PNG")
        return (0, 0)
    return struct.unpack(">II", b[16:24])


def main() -> int:
    up = {k: (LOC / f"{k}.txt").read_text().strip() for k, _, _ in FIELDS}
    table("upload-ready (metadata/en-US)", up)
    blob = " ".join(up.values()).lower()
    for p in PENDING:
        if re.search(p, blob):
            errors.append(f"upload-ready: unshipped / out-of-scope phrase {p!r}")
    if "http" in up["subtitle"] or "http" in up["name"]:
        errors.append("name/subtitle must not contain URLs")

    for k, want in EXPECT.items():
        got = (LOC / f"{k}.txt").read_text().strip()
        if got != want:
            errors.append(f"{k}.txt is {got!r}, want {want!r}")
    for k, want in REVIEW.items():
        got = (META / "review_information" / f"{k}.txt").read_text().strip()
        if got != want:
            errors.append(f"review_information/{k}.txt is {got!r}, want {want!r}")
    notes = (META / "review_information" / "notes.txt").read_text()
    for m in NOTES_MUST:
        if m not in notes.lower():
            errors.append(f"review_information/notes.txt does not mention {m!r}")
    if len(notes) > 4000:
        errors.append(f"review notes are {len(notes)} chars (limit 4000)")
    if (LOC / "whatsnew.txt").exists():
        errors.append("whatsnew.txt must not exist for the first version (1.0): ASC rejects What's New on a first release")
    for k, want in (("primary_category", "GAMES"), ("primary_subcategory_one", "GAMES_ROLE_PLAYING"),
                    ("primary_subcategory_two", "GAMES_ADVENTURE")):
        got = (META / f"{k}.txt").read_text().strip()
        if got != want:
            errors.append(f"{k}.txt is {got!r}, want {want!r}")
    if not re.fullmatch(r"20\d\d .+", (META / "copyright.txt").read_text().strip()):
        errors.append("copyright.txt should look like '2026 Name'")

    listing = blocks(HERE / "LISTING.md", r"^## ([^\n(]+?)(?: \(\d+.*?\))?\n```\n(.*?)```")
    for key, label, _ in FIELDS:
        if listing.get(label) != up[key]:
            errors.append(f"LISTING.md {label} != metadata/en-US/{key}.txt")

    print("\nscreenshots (docs/asc/screenshots/en-US)")
    for prefix, (size, lo, hi, required) in SHOT_SPECS.items():
        files = sorted(SHOTS.glob(f"{prefix}-*.png"))
        print(f"  {prefix}: {len(files)} file(s), want {size[0]}x{size[1]}")
        if required and not (lo <= len(files) <= hi):
            errors.append(f"{prefix}: {len(files)} screenshots, want {lo}-{hi}")
        for f in files:
            sz = png_size(f)
            print(f"    {f.name} {sz[0]}x{sz[1]} {f.stat().st_size // 1024} KB")
            if sz != size:
                errors.append(f"{f.name} is {sz[0]}x{sz[1]}, want {size[0]}x{size[1]} (landscape-only app)")
            if f.stat().st_size > 10 * 1024 * 1024:
                errors.append(f"{f.name} is over 10 MB")

    print()
    for e in errors:
        print("FAIL", e)
    print("OK" if not errors else f"{len(errors)} failure(s)")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
