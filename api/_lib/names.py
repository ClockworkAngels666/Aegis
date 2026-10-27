"""Name normalisation for sanctions screening: transliteration, legal-form stripping."""

from __future__ import annotations

import re
import unicodedata

# Cyrillic -> Latin (BGN/PCGN-style, simplified so variant spellings converge).
_CYRILLIC = {
    "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e", "ё": "e", "ж": "zh",
    "з": "z", "и": "i", "й": "y", "к": "k", "л": "l", "м": "m", "н": "n", "о": "o",
    "п": "p", "р": "r", "с": "s", "т": "t", "у": "u", "ф": "f", "х": "kh", "ц": "ts",
    "ч": "ch", "ш": "sh", "щ": "shch", "ъ": "", "ы": "y", "ь": "", "э": "e", "ю": "yu",
    "я": "ya", "і": "i", "ї": "yi", "є": "ye", "ґ": "g", "ў": "u", "қ": "k", "ғ": "g",
    "ң": "n", "ү": "u", "ұ": "u", "һ": "h", "ә": "a", "ө": "o",
}

# Legal forms and filler words that carry no identifying information.
LEGAL_FORMS = {
    "llc", "ltd", "limited", "inc", "incorporated", "corp", "corporation", "co", "company",
    "gmbh", "ag", "kg", "se", "sa", "sas", "sarl", "srl", "spa", "bv", "nv", "plc", "lp", "llp",
    "ooo", "oao", "zao", "pao", "ao", "jsc", "ojsc", "cjsc", "pjsc", "ip", "tov", "too", "chp",
    "fze", "fzco", "fz", "fzc", "fzllc", "dmcc", "dwc", "pte", "pvt", "sdn", "bhd", "kft", "zrt",
    "sp", "zoo", "doo", "as", "ab", "oy", "sole", "proprietorship", "the", "of", "and",
    "obshchestvo", "ogranichennoy", "otvetstvennostyu", "aktsionernoe", "obshchestva",
    "publichnoe", "zakrytoe", "otkrytoe", "tovarishchestvo", "liability", "joint", "stock",
}

# Common descriptive words; matching on these alone is not evidence of identity.
GENERIC = {
    "trading", "trade", "technology", "technologies", "tech", "electronics", "electronic",
    "group", "international", "industrial", "industries", "import", "export", "service",
    "services", "systems", "system", "engineering", "general", "global", "holding",
    "holdings", "logistics", "solutions", "components", "supply", "investment", "investments",
    "enterprise", "enterprises", "management", "development", "center", "centre", "plant",
    "factory", "research", "institute", "scientific", "production", "commercial", "partners",
    "hk", "uae", "russia", "russian", "asia", "euro", "europe", "east", "west", "north", "south",
    "npc", "npo", "npp", "nii", "kompaniya", "firma", "fgup", "gup", "concern", "corporation",
    "firm", "agency", "bureau", "office", "works", "products", "product", "manufacturing", "machinery",
    "equipment", "materials", "parts", "industry", "distribution", "wholesale", "consulting", "ventures",
}

_NON_ALNUM = re.compile(r"[^0-9a-z]+")


def transliterate(text: str) -> str:
    out = []
    for ch in text:
        low = ch.lower()
        out.append(_CYRILLIC.get(low, low))
    return "".join(out)


def tokens(name: str) -> list[str]:
    """Normalised tokens with legal forms removed."""
    text = transliterate(name.casefold())
    text = unicodedata.normalize("NFKD", text)
    text = "".join(c for c in text if not unicodedata.combining(c))
    toks: list[str] = []
    in_initials = False
    for t in _NON_ALNUM.split(text):
        if not t:
            continue
        single = len(t) == 1 and t.isalpha()
        if single and in_initials:
            toks[-1] += t  # "L.L.C." -> "llc", "O.O.O." -> "ooo"
        else:
            toks.append(t)
        in_initials = single or (in_initials and single)
    kept = [t for t in toks if t not in LEGAL_FORMS]
    return kept or toks


def normalize(name: str) -> str:
    return " ".join(tokens(name))


def distinctive(toks: list[str]) -> set[str]:
    return {t for t in toks if t not in GENERIC and len(t) > 1}
