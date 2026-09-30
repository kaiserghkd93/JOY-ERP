"""실제 업무 데이터 일괄 등록 스크립트"""
import urllib.request, json

BASE = "http://localhost:8000"

def post(path, data):
    body = json.dumps(data, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(f"{BASE}{path}", data=body,
                                  headers={"Content-Type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(req) as r:
            return True, json.loads(r.read())
    except urllib.error.HTTPError as e:
        msg = e.read().decode("utf-8", "ignore")
        return False, msg

def put(path, data):
    body = json.dumps(data, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(f"{BASE}{path}", data=body,
                                  headers={"Content-Type": "application/json"}, method="PUT")
    try:
        with urllib.request.urlopen(req) as r:
            return True, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return False, e.read().decode("utf-8", "ignore")

# ── 거래처 등록 ──────────────────────────────────────────────
suppliers = [
    "마이더스시스템", "상원인더스", "금호하이테크", "성일플라스틱", "유한",
]
customers = [
    "AND", "성신산전", "신현기전", "HD ELEC", "대양기업", "케이엠데이타",
    "MCM", "노바스이지", "영진전자", "HR TECH", "대만", "대화정밀",
    "큐비테크", "나라엠텍", "승림전자", "신웅이엠씨", "LS ELEC",
]

print("=== 외주처 등록 ===")
for name in suppliers:
    ok, _ = post("/master/partners", {"partner_id": name, "name": name, "partner_type": "외주처"})
    print(f"  {'OK' if ok else 'DUP'} {name}")

print("=== 고객사 등록 ===")
for name in customers:
    ok, _ = post("/master/partners", {"partner_id": name, "name": name, "partner_type": "고객"})
    print(f"  {'OK' if ok else 'DUP'} {name}")

# ── 품목 데이터 ─────────────────────────────────────────────
# (고객사, 외주처, 품번, 품명, 입고가, 판매가)
items_raw = [
    ("AND",    "마이더스시스템", "1064020147B",        "RUBBER KET TOP",                      95,    115),
    ("성신산전","마이더스시스템", "55211176301",        "HANDLE.EHU.UTS1200 GRAY",            3300,  3812),
    ("성신산전","마이더스시스템", "55211176302",        "HANDLE.EHU.UTS1200 BLACK",           3300,  4063),
    ("성신산전","마이더스시스템", "55211138101",        "HANDLE.V.E-70U/80U - Gray",          1500,  1678),
    ("성신산전","마이더스시스템", "55211138102",        "HANDLE,V EHX,E-70U/80U - BLACk",    2100,  2610),
    ("신현기전","마이더스시스템", "3AT-04604",          "PIPE, G-HANDLE",                      110,   155),
    ("신현기전","마이더스시스템", "3AT-04623",          "CAP,G-HANDLE",                         70,    91),
    ("HD ELEC","마이더스시스템", "GC1-AS-0063",        "ADJ KNOB ASSY(HGM 100/125/250)",      110,   130),
    ("HD ELEC","마이더스시스템", "GC4-AS-0042",        "ADJ KNOB ASSY(HGM 400)",              240,   349),
    ("HD ELEC","마이더스시스템", "GC5-AS-0042",        "ADJ KNOB ASSY(HGM 630/800)",          270,   363),
    ("대양기업","마이더스시스템", "GC1-MO-0060",        "GRID LEFT CAP",                        36,    44),
    ("대양기업","마이더스시스템", "GC1-MO-0061",        "GRID RIGHT CAP",                       36,    44),
    ("케이엠데이타","마이더스시스템","3AT-04360",       "UPPER CASE",                          950,  1150),
    ("케이엠데이타","마이더스시스템","3AT-03462",       "REAR CASE (UANS TYPE)",              1400,  1790),
    ("케이엠데이타","마이더스시스템","3CE-21210",       "CONTROLLER CASE(7.2KV VCS CASE)",    650,   500),
    ("케이엠데이타","마이더스시스템","4AT-06513",       "LOW CAP",                              85,   110),
    ("케이엠데이타","마이더스시스템","3AT-04361",       "BOTTOM CASE",                         600,   760),
    ("MCM",    "마이더스시스템", "A14-119-0",          "BRACKET-L3",                          250,   295),
    ("대양기업","상원인더스",     "GC3-MO-0052",        "HGM250 GRID LEFT",                     36,    50),
    ("MCM",    "마이더스시스템", "A14-166-2",          "BACK -BASE BKT",                      430,   464),
    ("MCM",    "마이더스시스템", "A13-031-1",          "DISC-CB",                              45,    55),
    ("대양기업","상원인더스",     "GC3-MO-0053",        "HGM250 GRID Right",                    36,    50),
    ("노바스이지","마이더스시스템","GTP-MO-0026",       "CT CASE COVER",                       250,   308),
    ("MCM",    "마이더스시스템", "A14-167-1",          "FRONT-COVER",                         125,   140),
    ("성신산전","마이더스시스템", "55211147101",        "Handle,V(60)",                        980,  1362),
    ("MCM",    "마이더스시스템", "A14-168-1",          "BACK -BASE BKT_2STAGE",               350,   370),
    ("MCM",    "마이더스시스템", "A11-613-1",          "HANDLE",                               95,   125),
    ("MCM",    "마이더스시스템", "A13-030-0",          "STEM-CB",                              55,    55),
    ("영진전자","마이더스시스템", "GD1-MO-0201",        "FRAME. DC",                           650,   710),
    ("대양기업","상원인더스",     "GC2-MO-0040",        "HGM125 GRID Left",                     30,    42),
    ("대양기업","상원인더스",     "GC2-MO-0047",        "HGM125 GRID Right",                    30,    42),
    (None,     "금호하이테크",   "4ME-07036",          "TRIP LEVER",                          120,     0),
    ("HR TECH","금호하이테크",   "3ME-02335",          "PCB CASE",                            370,   454),
    ("대만",   "금호하이테크",   "GC6-MO-0002",        "MHT Guide",                           230,   273),
    ("대만",   "금호하이테크",   "GC1-MO-5006",        "Trip Shaft",                           90,    96),
    ("HD ELEC","금호하이테크",   "GC1-MO-0031",        "ADJ SUB TRIP_SHAFT HGM100",            75,    86),
    ("HD ELEC","금호하이테크",   "GC1-MO-0038",        "ADJ SUB TRIP 2P_SHAFT HGM100",         90,   110),
    ("HD ELEC","금호하이테크",   "GC1-MO-0057",        "ADJ SUB TRIP_SHAFT(40-100A HGM100",    75,    98),
    ("HD ELEC","금호하이테크",   "GC3-MO-0021-001",    "ADJ SUB TRIP_SHAFT HGM250",           100,   180),
    ("HD ELEC","금호하이테크",   "GC2-MO-0026",        "ADJ SUB TRIP_SHAFT HGM125",            85,    98),
    ("큐비테크","금호하이테크",  "4ME-09614",          "Line Barrier",                         30,    73),
    ("대화정밀","금호하이테크",  "GC1-MO-5007",        "Insulation Cover HGE100",              55,    96),
    ("큐비테크","금호하이테크",  "4ME-09621",          "INTERPOLE BARRIER",                    90,   135),
    ("큐비테크","금호하이테크",  "1ME-11142",          "Mold Base (2P 50A)",                  650,   880),
    ("큐비테크","금호하이테크",  "1ME-11140",          "Mold Cover(MCCB)",                    300,   360),
    ("큐비테크","금호하이테크",  "1ME-11136(ELCB)",    "MOLD COVER HM-S (ELCB)",              200,   279),
    ("큐비테크","금호하이테크",  "1ME-11136(MCCB)",    "MOLD COVER HM-S (MCCB)",              200,   279),
    ("큐비테크","금호하이테크",  "1ME-11146",          "Mold Cover(ELCB)",                    280,   352),
    ("HR TECH","금호하이테크",   "GC4-MO-0033",        "Select S/W Cap",                      120,   214),
    ("HD ELEC","금호하이테크",   "4ME-09530",          "INTERPOLE BARRIER(16GP)",              80,   140),
    ("HD ELEC","금호하이테크",   "4ME-09531",          "INTERPOLE BARRIER(25GP)",              80,   130),
    ("HD ELEC","금호하이테크",   "GC3-MO-0017",        "HGM250 INTERPOLE BARRIER",             80,   130),
    ("큐비테크","금호하이테크",  "3ME-08114",          "Front Door ELCB 2P",                   95,     0),
    ("큐비테크","금호하이테크",  "3ME-08115",          "Front Door 3P ELCB",                  110,     0),
    ("성신산전","금호하이테크",  "64261147106",        "Base Handle",                        1700,  2228),
    ("성신산전","마이더스시스템", "55211147102",        "Handle,V(60) BLACK",                 1150,  1814),
    ("성신산전","금호하이테크",  "64261147107",        "Base Back(BLACK)",                    600,   897),
    ("성신산전","금호하이테크",  "64261147102",        "Base Handle",                        1350,  1702),
    ("성신산전","금호하이테크",  "64261147101",        "Base Back",                           500,   735),
    ("MCM",    "금호하이테크",   "A12-085-1",          "HF End CAP",                           25,    37),
    ("노바스이지","금호하이테크","GI1-MO-0013",        "HG CAM S FRONT COVER",               1400,  1790),
    ("노바스이지","금호하이테크","GI1-MO-0014-002",    "HG CAM A MAIN CASE(통신형)",           55,    62),
    ("노바스이지","금호하이테크","GI1-MO-0011",        "HG CAM A FRONT COVER",               2500,  3000),
    (None,     "성일플라스틱",   "55611147102",        "HOLDER SHAFT EHX,E-60U -Black",       190,     0),
    ("성신산전","성일플라스틱",  "65011171851",        "LEVER,RELEASE,EHU1",                  108,   116),
    ("승림전자","성일플라스틱",  "GM1_MO_0501",        "HGC18 CONTACT BRIDGE AC",             150,   172),
    ("승림전자","성일플라스틱",  "GD1_MO_0501",        "HGC18 CONTACT BRIDGE DC",             150,   250),
    ("신웅이엠씨","성일플라스틱","3AT-04053",          "U DR DEVICE COVER",                   420,   720),
    ("신현기전","성일플라스틱",  "3AT-03632",          "SC-ARC RUNNER BASE40",                225,   292),
    ("승림전자","성일플라스틱",  "GM1-MO-0402",        "HGC18 MAIN-TERMINAL BLOCK LINE",       80,   102),
    ("승림전자","성일플라스틱",  "GM1-MO-0903",        "HGC18 MAIN-PROTECTION COVER",          50,    67),
    ("HD ELEC","성일플라스틱",  "GC1-MO-0026",        "HGM100 INTERPOLE BARRIER(제품)",        70,   120),
    ("MCM",    "성일플라스틱",   "A12-110-0",          "Cap_Filter_N",                        140,   163),
    ("MCM",    "유한",           "A11-148-0",          "FILTER BODY TZ",                      425,   442),
    ("MCM",    "유한",           "A11-036",            "FILTER BODY GEN1",                    400,   450),
    ("나라엠텍","유한",           "MPL02871AA",         "U PLATE TERMINAL BARRIER",           1300,  1435),
    ("MCM",    "유한",           "A11-614-0",          "Body_Filter (ATCR)",                  370,   418),
    ("승림전자","상원인더스",    "GM1-MO-0401",        "HGC18 ARC-CHAMBER LOAD",              195,   214),
    ("승림전자","상원인더스",    "GM1-MO-0451",        "HGC18 ARC-CHAMBER LINE",              195,   214),
    ("HR TECH","마이더스시스템", "GA2-AE-0008",        "UL-CT-BOBBIN",                        350,   500),
    ("LS ELEC","마이더스시스템", "70/MM",              "LS BRAKET",                           160,   500),
    ("영진전자","마이더스시스템", "GM1-MO-0301",        "COIL FRAME AC HGC18A",               200,   480),
]

print(f"\n=== 품목 등록 ({len(items_raw)}개) ===")
ok_cnt = dup_cnt = 0
for cust, supp, part_no, name, buy, sell in items_raw:
    payload = {
        "part_no": part_no,
        "name": name,
        "unit": "EA",
        "item_type": "외주품",
        "std_buy_price": buy if buy else None,
        "std_sell_price": sell if sell else None,
    }
    ok, resp = post("/master/items", payload)
    if ok:
        ok_cnt += 1
    else:
        # 이미 있으면 단가만 업데이트
        ok2, _ = put(f"/master/items/{part_no}", payload)
        if ok2:
            dup_cnt += 1
            ok_cnt += 1

print(f"  완료: {ok_cnt}개 등록 (신규+업데이트), 중복처리: {dup_cnt}개")
print("\n=== 완료 ===")
print(f"거래처: 외주처 {len(suppliers)}개 / 고객사 {len(customers)}개")
print(f"품목: {len(items_raw)}개")
