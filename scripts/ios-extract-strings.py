#!/usr/bin/env python3
"""Keep ios/HighPriestess/Resources/Localizable.xcstrings in step with the Swift sources (English only).

Finds user-facing literals: SwiftUI Text/Button/Toggle/Section/Label/LabeledContent/NavigationLink/
Picker/Link/.navigationTitle/.confirmationDialog/.alert/.accessibility*, LocalizedStringKey(...) and
String(localized:). Interpolations become %@ / %lld. Existing translations are preserved; plural
variations for `%lld quests done` are kept. Xcode's own extraction (Product > Export Localizations)
refines argument types when a language is actually added.

  python3 scripts/ios-extract-strings.py          # rewrite the catalog
  python3 scripts/ios-extract-strings.py --check  # exit 1 when the catalog is out of date
"""
import json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "ios/HighPriestess")
OUT = os.path.join(SRC, "Resources/Localizable.xcstrings")

LIT = r'"((?:[^"\\]|\\.|\\\((?:[^()]|\([^()]*\))*\))*)"'
OPENERS = [r'\b(?:Text|Button|Toggle|Section|Label|LabeledContent|NavigationLink|Picker|Link)\(',
           r'\.(?:navigationTitle|confirmationDialog|alert|accessibilityLabel|accessibilityHint)\(',
           r'\bbadge\(', r'\bString\(localized:\s*', r'\bLocalizedStringKey\(']
OPEN_RE = re.compile('|'.join(OPENERS))
NUMERIC = re.compile(r'\b(count|chapter|Int\(|questsDone|\+ 1|\.scale|Steps?)\b|\+ 1')
SKIP = {"", " "}

def to_key(lit):
    def sub(m):
        inner = m.group(1)
        return "%lld" if NUMERIC.search(inner) else "%@"
    out, i = "", 0
    while i < len(lit):
        if lit.startswith("\\(", i):
            depth, j = 1, i + 2
            while j < len(lit) and depth:
                depth += (lit[j] == "(") - (lit[j] == ")")
                j += 1
            out += sub(re.match(r"(.*)", lit[i + 2:j - 1]))
            i = j
        else:
            out += lit[i]; i += 1
    return out.replace('\\"', '"').replace("\\n", "\n").replace("\\'", "'")

def scan():
    keys = {}
    for dp, _, fs in os.walk(SRC):
        for f in fs:
            if not f.endswith(".swift"):
                continue
            text = open(os.path.join(dp, f), encoding="utf8").read()
            text = re.sub(r"^\s*///?.*$", "", text, flags=re.M)  # comments
            for m in OPEN_RE.finditer(text):
                is_key = "LocalizedStringKey" in m.group(0)
                # first literal right after the opener (or, for LocalizedStringKey(, every literal in the call)
                rest = text[m.end():m.end() + 400]
                if is_key:
                    depth, end = 1, 0
                    for i, ch in enumerate(rest):
                        depth += (ch == "(") - (ch == ")")
                        if depth == 0:
                            end = i; break
                    lits = re.findall(LIT, rest[:end])
                else:
                    lm = re.match(r'\s*' + LIT, rest)
                    lits = [lm.group(1)] if lm else []
                for lit in lits:
                    k = to_key(lit)
                    if k not in SKIP and not k.startswith("http") and re.search(r"[A-Za-z]", k):
                        keys[k] = True
    return sorted(keys)

PLURAL = {"%lld quests done": {"variations": {"plural": {
    "one": {"stringUnit": {"state": "translated", "value": "%lld quest done"}},
    "other": {"stringUnit": {"state": "translated", "value": "%lld quests done"}}}}}}

def build(existing):
    strings = {}
    for k in scan():
        e = existing.get(k, {})
        entry = {"extractionState": "manual"}
        if k in PLURAL:
            entry["localizations"] = {"en": PLURAL[k]}
        elif e.get("localizations"):
            entry["localizations"] = e["localizations"]
        strings[k] = entry
    return {"sourceLanguage": "en", "strings": strings, "version": "1.0"}

def main():
    existing = {}
    if os.path.exists(OUT):
        existing = json.load(open(OUT, encoding="utf8")).get("strings", {})
    want = json.dumps(build(existing), indent=2, ensure_ascii=False, sort_keys=True) + "\n"
    if "--check" in sys.argv:
        have = open(OUT, encoding="utf8").read() if os.path.exists(OUT) else ""
        if have != want:
            print("Localizable.xcstrings is out of date: run python3 scripts/ios-extract-strings.py")
            sys.exit(1)
        print("Localizable.xcstrings is up to date")
        return
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    open(OUT, "w", encoding="utf8").write(want)
    print("wrote", OUT, len(json.loads(want)["strings"]), "strings")

main()
