"""
ISO 2859-1 단순 샘플링 검사 (Single Sampling Plans for Normal Inspection)
Level I / II / III 지원, AQL 0.065 ~ 6.5
"""

# ── 로트크기 → 코드문자 (Normal 기준, Level I/II/III) ─────────────
# 각 튜플: (최소 로트크기, Level-I 코드, Level-II 코드, Level-III 코드)
_LOT_CODE_TABLE = [
    (2,       "A", "A", "B"),
    (9,       "A", "B", "C"),
    (16,      "A", "C", "D"),
    (26,      "B", "D", "E"),
    (51,      "C", "E", "F"),
    (91,      "C", "F", "G"),
    (151,     "D", "G", "H"),
    (281,     "E", "H", "J"),
    (501,     "F", "J", "K"),
    (1201,    "G", "K", "L"),
    (3201,    "H", "L", "M"),
    (10001,   "J", "M", "N"),
    (35001,   "K", "N", "P"),
    (150001,  "L", "P", "Q"),
    (500001,  "M", "Q", "R"),
]

_SAMPLE_SIZE = {
    "A": 2,   "B": 3,   "C": 5,   "D": 8,   "E": 13,
    "F": 20,  "G": 32,  "H": 50,  "J": 80,  "K": 125,
    "L": 200, "M": 315, "N": 500, "P": 800, "Q": 1250, "R": 2000,
}

# ── 단순 샘플링 수락/기각 수 (코드문자, AQL) → (Ac, Re) ───────────
# None = 해당 조합 없음 (전수검사 or 적용불가)
_AC_RE: dict[tuple[str, float], tuple[int, int] | None] = {
    # AQL 0.065
    ("J", 0.065): (0, 1), ("K", 0.065): (0, 1), ("L", 0.065): (0, 1),
    ("M", 0.065): (1, 2), ("N", 0.065): (1, 2), ("P", 0.065): (2, 3),
    # AQL 0.1
    ("H", 0.1): (0, 1), ("J", 0.1): (0, 1), ("K", 0.1): (0, 1),
    ("L", 0.1): (1, 2), ("M", 0.1): (1, 2), ("N", 0.1): (2, 3),
    ("P", 0.1): (3, 4),
    # AQL 0.15
    ("G", 0.15): (0, 1), ("H", 0.15): (0, 1), ("J", 0.15): (0, 1),
    ("K", 0.15): (1, 2), ("L", 0.15): (1, 2), ("M", 0.15): (2, 3),
    ("N", 0.15): (3, 4), ("P", 0.15): (5, 6),
    # AQL 0.25
    ("F", 0.25): (0, 1), ("G", 0.25): (0, 1), ("H", 0.25): (0, 1),
    ("J", 0.25): (1, 2), ("K", 0.25): (1, 2), ("L", 0.25): (2, 3),
    ("M", 0.25): (3, 4), ("N", 0.25): (5, 6), ("P", 0.25): (7, 8),
    # AQL 0.4
    ("E", 0.4): (0, 1), ("F", 0.4): (0, 1), ("G", 0.4): (0, 1),
    ("H", 0.4): (1, 2), ("J", 0.4): (1, 2), ("K", 0.4): (2, 3),
    ("L", 0.4): (3, 4), ("M", 0.4): (5, 6), ("N", 0.4): (7, 8),
    ("P", 0.4): (10, 11),
    # AQL 0.65
    ("D", 0.65): (0, 1), ("E", 0.65): (0, 1), ("F", 0.65): (0, 1),
    ("G", 0.65): (1, 2), ("H", 0.65): (1, 2), ("J", 0.65): (2, 3),
    ("K", 0.65): (3, 4), ("L", 0.65): (5, 6), ("M", 0.65): (7, 8),
    ("N", 0.65): (10, 11), ("P", 0.65): (14, 15),
    # AQL 1.0
    ("C", 1.0): (0, 1), ("D", 1.0): (0, 1), ("E", 1.0): (0, 1),
    ("F", 1.0): (1, 2), ("G", 1.0): (1, 2), ("H", 1.0): (2, 3),
    ("J", 1.0): (3, 4), ("K", 1.0): (5, 6), ("L", 1.0): (7, 8),
    ("M", 1.0): (10, 11), ("N", 1.0): (14, 15), ("P", 1.0): (21, 22),
    # AQL 1.5
    ("B", 1.5): (0, 1), ("C", 1.5): (0, 1), ("D", 1.5): (0, 1),
    ("E", 1.5): (1, 2), ("F", 1.5): (1, 2), ("G", 1.5): (2, 3),
    ("H", 1.5): (3, 4), ("J", 1.5): (5, 6), ("K", 1.5): (7, 8),
    ("L", 1.5): (10, 11), ("M", 1.5): (14, 15), ("N", 1.5): (21, 22),
    # AQL 2.5
    ("A", 2.5): (0, 1), ("B", 2.5): (0, 1), ("C", 2.5): (0, 1),
    ("D", 2.5): (1, 2), ("E", 2.5): (1, 2), ("F", 2.5): (2, 3),
    ("G", 2.5): (3, 4), ("H", 2.5): (5, 6), ("J", 2.5): (7, 8),
    ("K", 2.5): (10, 11), ("L", 2.5): (14, 15), ("M", 2.5): (21, 22),
    # AQL 4.0
    ("A", 4.0): (0, 1), ("B", 4.0): (0, 1), ("C", 4.0): (1, 2),
    ("D", 4.0): (1, 2), ("E", 4.0): (2, 3), ("F", 4.0): (3, 4),
    ("G", 4.0): (5, 6), ("H", 4.0): (7, 8), ("J", 4.0): (10, 11),
    ("K", 4.0): (14, 15), ("L", 4.0): (21, 22),
    # AQL 6.5
    ("A", 6.5): (0, 1), ("B", 6.5): (1, 2), ("C", 6.5): (1, 2),
    ("D", 6.5): (2, 3), ("E", 6.5): (3, 4), ("F", 6.5): (5, 6),
    ("G", 6.5): (7, 8), ("H", 6.5): (10, 11), ("J", 6.5): (14, 15),
    ("K", 6.5): (21, 22),
}

LEVEL_IDX = {"I": 1, "II": 2, "III": 3}


def get_code_letter(lot_size: int, level: str = "II") -> str:
    idx = LEVEL_IDX.get(level, 2)
    code = "A"
    for min_lot, l1, l2, l3 in _LOT_CODE_TABLE:
        if lot_size >= min_lot:
            code = [l1, l2, l3][idx - 1]
        else:
            break
    return code


def get_sample_size(lot_size: int, level: str = "II") -> int:
    code = get_code_letter(lot_size, level)
    n = _SAMPLE_SIZE.get(code, 2)
    return min(n, lot_size)


def get_ac_re(lot_size: int, level: str = "II", aql: float = 1.0) -> dict:
    """
    Returns: {code_letter, sample_size, ac, re, aql_used}
    ac/re = None 이면 해당 조합이 표준 테이블에 없음 (더 큰 샘플 적용 권장)
    """
    code = get_code_letter(lot_size, level)
    n = min(_SAMPLE_SIZE.get(code, 2), lot_size)

    # AQL을 테이블에 있는 가장 가까운 값으로 조정
    aql_options = [0.065, 0.1, 0.15, 0.25, 0.4, 0.65, 1.0, 1.5, 2.5, 4.0, 6.5]
    closest_aql = min(aql_options, key=lambda x: abs(x - aql))

    ac_re = _AC_RE.get((code, closest_aql))

    # 테이블에 없으면 다음 코드로 상향 시도
    if ac_re is None:
        code_list = list(_SAMPLE_SIZE.keys())
        ci = code_list.index(code) if code in code_list else 0
        for c in code_list[ci:]:
            ac_re = _AC_RE.get((c, closest_aql))
            if ac_re:
                n = min(_SAMPLE_SIZE[c], lot_size)
                code = c
                break

    return {
        "code_letter": code,
        "sample_size": n,
        "ac": ac_re[0] if ac_re else None,
        "re": ac_re[1] if ac_re else None,
        "aql_used": closest_aql,
    }


def auto_judge(fail_qty: int, ac: int | None, re: int | None) -> str:
    """불량수량 + Ac/Re → 합격/불합격/부분합격"""
    if ac is None or re is None:
        return "부분합격"
    if fail_qty <= ac:
        return "합격"
    if fail_qty >= re:
        return "불합격"
    return "부분합격"
