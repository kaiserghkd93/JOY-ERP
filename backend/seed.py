"""시드 스크립트 — 기존 82개 품목 + 거래처 마스터 초기 적재"""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))

from app.database import SessionLocal, engine, Base
from app.models.master import Item, Partner, ItemType, PartnerType

Base.metadata.create_all(bind=engine)

PARTNERS_RAW = [
    ("마이더스시스템", PartnerType.supplier),
    ("상원인더스", PartnerType.supplier),
    ("금호하이테크", PartnerType.supplier),
    ("성일플라스틱", PartnerType.supplier),
    ("유한", PartnerType.supplier),
    ("HD현대일렉트릭", PartnerType.both),
    ("AND", PartnerType.customer),
    ("성신산전", PartnerType.customer),
    ("신현기전", PartnerType.customer),
    ("HD ELEC", PartnerType.customer),
    ("대양기업", PartnerType.customer),
    ("케이엠데이타", PartnerType.customer),
    ("MCM", PartnerType.customer),
    ("노바스이지", PartnerType.customer),
    ("영진전자", PartnerType.customer),
    ("HR TECH", PartnerType.customer),
    ("대만", PartnerType.customer),
    ("큐비테크", PartnerType.customer),
    ("대화정밀", PartnerType.customer),
    ("승림전자", PartnerType.customer),
    ("신웅이엠씨", PartnerType.customer),
    ("나라엠텍", PartnerType.customer),
    ("LS ELEC", PartnerType.customer),
]

ITEMS_RAW = [
    ("1064020147B","RUBBER KET TOP","외주품","마이더스시스템",95,115),
    ("55211176301","HANDLE.EHU.UTS1200 GRAY","외주품","마이더스시스템",3300,3812),
    ("55211176302","HANDLE.EHU.UTS1200 BLACK","외주품","마이더스시스템",3300,4063),
    ("55211138101","HANDLE.V.E-70U/80U - Gray","외주품","마이더스시스템",1500,1678),
    ("55211138102","HANDLE,V EHX,E-70U/80U - BLACK","외주품","마이더스시스템",2100,2610),
    ("3AT-04604","PIPE, G-HANDLE","외주품","마이더스시스템",110,155),
    ("3AT-04623","CAP,G-HANDLE","외주품","마이더스시스템",70,91),
    ("GC1-AS-0063","ADJ KNOB ASSY(HGM 100/125/250)","외주품","마이더스시스템",110,130),
    ("GC4-AS-0042","ADJ KNOB ASSY(HGM 400)","외주품","마이더스시스템",240,349),
    ("GC5-AS-0042","ADJ KNOB ASSY(HGM 630/800)","외주품","마이더스시스템",270,363),
    ("GC1-MO-0060","GRID LEFT CAP","외주품","마이더스시스템",36,44),
    ("GC1-MO-0061","GRID RIGHT CAP","외주품","마이더스시스템",36,44),
    ("3AT-04360","UPPER CASE","외주품","마이더스시스템",950,1150),
    ("3AT-03462","REAR CASE (UANS TYPE)","외주품","마이더스시스템",1400,1790),
    ("3CE-21210","CONTROLLER CASE(7.2KV VCS CASE)","외주품","마이더스시스템",650,500),
    ("4AT-06513","LOW CAP","외주품","마이더스시스템",85,110),
    ("3AT-04361","BOTTOM CASE","외주품","마이더스시스템",600,760),
    ("A14-119-0","BRACKET-L3","외주품","마이더스시스템",250,295),
    ("GC3-MO-0052","HGM250 GRID LEFT","외주품","상원인더스",36,50),
    ("A14-166-2","BACK-BASE BKT","외주품","마이더스시스템",430,464),
    ("A13-031-1","DISC-CB","외주품","마이더스시스템",45,55),
    ("GC3-MO-0053","HGM250 GRID Right","외주품","상원인더스",36,50),
    ("GTP-MO-0026","CT CASE COVER","외주품","마이더스시스템",250,308),
    ("A14-167-1","FRONT-COVER","외주품","마이더스시스템",125,140),
    ("55211147101","Handle,V(60)","외주품","마이더스시스템",980,1362),
    ("A14-168-1","BACK-BASE BKT_2STAGE","외주품","마이더스시스템",350,370),
    ("A11-613-1","HANDLE","외주품","마이더스시스템",95,125),
    ("A13-030-0","STEM-CB","외주품","마이더스시스템",55,55),
    ("GD1-MO-0201","FRAME. DC","외주품","마이더스시스템",650,710),
    ("GC2-MO-0040","HGM125 GRID Left","외주품","상원인더스",30,42),
    ("GC2-MO-0047","HGM125 GRID Right","외주품","상원인더스",30,42),
    ("3ME-02335","PCB CASE","외주품","금호하이테크",370,454),
    ("GC6-MO-0002","MHT Guide","외주품","금호하이테크",230,273),
    ("GC1-MO-5006","Trip Shaft","외주품","금호하이테크",90,96),
    ("GC1-MO-0031","ADJ SUB TRIP_SHAFT HGM100","외주품","금호하이테크",75,86),
    ("GC1-MO-0038","ADJ SUB TRIP 2P_SHAFT HGM100","외주품","금호하이테크",90,110),
    ("GC1-MO-0057","ADJ SUB TRIP_SHAFT(40-100A HGM100","외주품","금호하이테크",75,98),
    ("GC3-MO-0021-001","ADJ SUB TRIP_SHAFT HGM250","외주품","금호하이테크",100,180),
    ("GC2-MO-0026","ADJ SUB TRIP_SHAFT HGM125","외주품","금호하이테크",85,98),
    ("4ME-09614","Line Barrier","외주품","금호하이테크",30,73),
    ("GC1-MO-5007","Insulation Cover HGE100","외주품","금호하이테크",55,96),
    ("4ME-09621","INTERPOLE BARRIER","외주품","금호하이테크",90,135),
    ("1ME-11142","Mold Base (2P 50A)","외주품","금호하이테크",650,880),
    ("1ME-11140","Mold Cover(MCCB)","외주품","금호하이테크",300,360),
    ("1ME-11136E","MOLD COVER HM-S (ELCB)","외주품","금호하이테크",200,279),
    ("1ME-11136M","MOLD COVER HM-S (MCCB)","외주품","금호하이테크",200,279),
    ("1ME-11146","Mold Cover(ELCB)","외주품","금호하이테크",280,352),
    ("GC4-MO-0033","Select S/W Cap","외주품","금호하이테크",120,214),
    ("4ME-09530","INTERPOLE BARRIER(16GP)","외주품","금호하이테크",80,140),
    ("4ME-09531","INTERPOLE BARRIER(25GP)","외주품","금호하이테크",80,130),
    ("GC3-MO-0017","HGM250 INTERPOLE BARRIER","외주품","금호하이테크",80,130),
    ("64261147106","Base Handle","외주품","금호하이테크",1700,2228),
    ("55211147102","Handle,V(60) BLACK","외주품","마이더스시스템",1150,1814),
    ("64261147107","Base Back(BLACK)","외주품","금호하이테크",600,897),
    ("64261147102","Base Handle-2","외주품","금호하이테크",1350,1702),
    ("64261147101","Base Back","외주품","금호하이테크",500,735),
    ("A12-085-1","HF End CAP","외주품","금호하이테크",25,37),
    ("GI1-MO-0013","HG CAM S FRONT COVER","외주품","금호하이테크",1400,1790),
    ("GI1-MO-0014-002","HG CAM A MAIN CASE(통신형)","외주품","금호하이테크",55,62),
    ("GI1-MO-0011","HG CAM A FRONT COVER","외주품","금호하이테크",2500,3000),
    ("65011171851","LEVER,RELEASE,EHU1","외주품","성일플라스틱",108,116),
    ("GM1_MO_0501","HGC18 CONTACT BRIDGE AC","외주품","성일플라스틱",150,172),
    ("GD1_MO_0501","HGC18 CONTACT BRIDGE DC","외주품","성일플라스틱",150,250),
    ("3AT-04053","U DR DEVICE COVER","외주품","성일플라스틱",420,720),
    ("3AT-03632","SC-ARC RUNNER BASE40","외주품","성일플라스틱",225,292),
    ("GM1-MO-0402","HGC18 MAIN-TERMINAL BLOCK LINE","외주품","성일플라스틱",80,102),
    ("GM1-MO-0903","HGC18 MAIN-PROTECTION COVER","외주품","성일플라스틱",50,67),
    ("GC1-MO-0026","HGM100 INTERPOLE BARRIER(제품)","외주품","성일플라스틱",70,120),
    ("A12-110-0","Cap_Filter_N","외주품","성일플라스틱",140,163),
    ("A11-148-0","FILTER BODY TZ","외주품","유한",425,442),
    ("A11-036","FILTER BODY GEN1","외주품","유한",400,450),
    ("MPL02871AA","U PLATE TERMINAL BARRIER","외주품","유한",1300,1435),
    ("A11-614-0","Body_Filter (ATCR)","외주품","유한",370,418),
    ("GM1-MO-0401","HGC18 ARC-CHAMBER LOAD","외주품","상원인더스",195,214),
    ("GM1-MO-0451","HGC18 ARC-CHAMBER LINE","외주품","상원인더스",195,214),
    ("GA2-AE-0008","UL-CT-BOBBIN","외주품","마이더스시스템",350,500),
    ("70/MM","LS BRAKET","외주품","마이더스시스템",160,500),
    ("GM1-MO-0301","COIL FRAME AC HGC18A","외주품","마이더스시스템",200,480),
    # HD현대일렉트릭 자체생산품
    ("3AT-03432","U OCR PROTECTION COVER ACB","완제품","HD현대일렉트릭",197,0),
    ("3AT-03473-004","SC MAIN F COVER 20N (A-TYPE, HGN) ACB","완제품","HD현대일렉트릭",2638,0),
    ("3AT-03959-004","U ADDITIONAL COVER50 (C-TYPE, HGN) ACB","완제품","HD현대일렉트릭",5230,0),
    ("3AT-03962-004","SC MAIN F COVER 40N (B-TYPE, HGN) ACB","완제품","HD현대일렉트릭",3228,0),
    ("3AT-04684","CAP, G-FRONT COVER ACB","완제품","HD현대일렉트릭",77,0),
    ("3AT-04830-002","U ADDITIONAL COVER63 (D-TYPE, HGN) ACB","완제품","HD현대일렉트릭",7600,0),
    ("3AT-05603-001","HG FRONT COVER 20 (A-TYPE, HG) ACB","완제품","HD현대일렉트릭",7209,0),
    ("3AT-05604-001","HG FRONT COVER 40 (B-TYPE, HG) ACB","완제품","HD현대일렉트릭",7654,0),
    ("3AT-06249","DC HG FRONT COVER/40","완제품","HD현대일렉트릭",8504,0),
]

TYPE_MAP = {"원자재": ItemType.raw, "외주품": ItemType.outsourced, "반제품": ItemType.semi, "완제품": ItemType.finished}

def run():
    db = SessionLocal()
    try:
        # 거래처
        for name, ptype in PARTNERS_RAW:
            pid = name.replace(" ", "_")
            if not db.get(Partner, pid):
                db.add(Partner(partner_id=pid, name=name, partner_type=ptype))
        # 품목
        for row in ITEMS_RAW:
            part_no, name, itype, supplier, buy, sell = row
            if not db.get(Item, part_no):
                db.add(Item(
                    part_no=part_no, name=name,
                    item_type=TYPE_MAP.get(itype, ItemType.outsourced),
                    std_buy_price=buy, std_sell_price=sell,
                ))
        db.commit()
        print(f"시드 완료: 거래처 {len(PARTNERS_RAW)}개, 품목 {len(ITEMS_RAW)}개")
    finally:
        db.close()

if __name__ == "__main__":
    run()
