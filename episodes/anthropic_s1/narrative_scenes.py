from __future__ import annotations
from episode_paths import EPISODE_ROOT, OSINT_ROOT
import math
from PIL import Image,ImageDraw,ImageFont
from pathlib import Path
from functools import lru_cache
from fontTools.ttLib import TTFont
from explainer_scenes import base,font,center,arrow,ease,INK,MUTED,TEAL,RED,GOLD


@lru_cache(maxsize=1)
def display_font():
    path=EPISODE_ROOT/'fonts/GmarketSansBold.otf'
    return ImageFont.truetype(str(path),49),frozenset(TTFont(path).getBestCmap())

def card(d:ImageDraw.ImageDraw,box:tuple[int,int,int,int],title:str,value:str,note:str,col:str=TEAL)->None:
    x,y,r,b=box
    d.rounded_rectangle((x+8,y+11,r+8,b+11),radius=22,fill='#d9ddd6')
    d.rounded_rectangle(box,radius=22,fill='#ffffff')
    d.rectangle((x+25,y+30,x+31,b-30),fill=col)
    d.text((x+53,y+34),title,font=font(31,True),fill=INK)
    display,cmap=display_font()
    tx=float(x+53)
    for char in value:
        if char==' ':tx+=49*.3
        else:
            face=display if ord(char) in cmap else font(49,True)
            d.text((tx,y+102),char,font=face,fill=col);tx+=d.textlength(char,font=face)
    d.text((x+53,b-64),note,font=font(26),fill=MUTED)


def scene(t:float,kind:str)->Image.Image:
    if kind=='opening':
        im,d=base('성장, 회계, 현금, 그리고 통제권','ANTHROPIC · 2026년 10월 26일 S-1 공시','출처: Anthropic S-1, p.147·157·168 / F-12 · 기간과 개념이 서로 다름')
        rows=[('영업이익','+0.974','2026년 2분기',TEAL),('순손실','-80.748','2026년 상반기',RED),('영업현금흐름','+3.929','2026년 상반기',TEAL)]
        d.text((100,235),'단위: 십억 달러',font=font(28),fill=MUTED)
        for i,(label,value,note,col) in enumerate(rows):
            if t>i*.7:card(d,(100+580*i,350,640+580*i,720),label,value,note,col)
        d.text((100,830),'서로 다른 질문에 답하는 세 숫자',font=font(39,True),fill=INK)
    elif kind=='filing':
        im,d=base('공모 조건은 아직 비어 있습니다','예비 IPO 등록서 · 나스닥 Global Select / ANT 신청','출처: Anthropic S-1 표지·p.124–125 · 제출은 SEC의 투자 가치 보증이 아님')
        for i,(a,b,c) in enumerate([('2023–2025','연간 재무제표','감사'),('2026.06.30','상반기·분기','미감사'),('2026.09.30','일부 사업 지표','기간 주의')]):
            if t>i*.6:card(d,(100+580*i,270,640+580*i,570),a,b,c)
        for i,label in enumerate(['공모 가격 범위','주식 수','조달액','일정']):
            x=100+i*435;d.rounded_rectangle((x,680,x+400,825),radius=16,fill='#e0e6df');center(d,(x+200,700),label,29);center(d,(x+200,752),'미기재',32,MUTED,True)
    elif kind=='business':
        im,d=base('모델에서 업무 도구까지','사업 구조 개념도 · 실제 데이터/금액 흐름을 뜻하지 않음','출처: Anthropic S-1 p.9–11·138–141')
        levels=[('Claude','기반 모델',250),('Platform','개발자 도구와 기본 기능',440),('Code · Cowork','업무 응용 제품',630)]
        for i,(a,b,y) in enumerate(levels):
            if t>i*.8:
                d.rounded_rectangle((200+i*80,y,1040+i*80,y+135),radius=20,fill=['#d7e5df','#a4c4bf','#6b9f99'][i]);d.text((240+i*80,y+26),a,font=font(40,True),fill=INK);d.text((600+i*80,y+38),b,font=font(29),fill=INK)
                if i:arrow(d,(1170,y-55),(1170,y-5),TEAL,t-i*.8)
        d.text((1370,350),'고객 접점',font=font(37,True),fill=INK)
        for i,a in enumerate(['직접 판매','AWS','GCP','Azure']):d.text((1370,440+i*70),a,font=font(32),fill=MUTED)
    elif kind=='mix':
        im,d=base('매출의 대부분은 사용량 기반','2026년 상반기 · 반올림 비중 · 정확한 금액 배분이 아님','출처: Anthropic S-1 p.138·144')
        p=ease(t/2);x=150;y=400;w=1600
        d.rectangle((x,y,x+1280*p,y+190),fill=TEAL)
        if t>1.5:d.rectangle((x+1280,y,x+1280+320*ease((t-1.5)/1.5),y+190),fill=GOLD)
        center(d,(790,450),'사용량 기반 약 80%',48,'#ffffff',True)
        if t>2.5:center(d,(1590,450),'구독 약 20%',35,'#ffffff',True)
        d.text((150,665),'토큰 소비에 연결',font=font(36,True),fill=TEAL)
        d.text((1120,665),'구독 기간 일반적으로 ≤12개월',font=font(31,True),fill=GOLD)
        d.text((150,770),'기업 사용량 계약에는 연간·다년 최소 지출 약정도 있습니다.',font=font(29),fill=MUTED)
    elif kind=='loop':
        im,d=base('회사가 제시하는 성장 논리','경영진의 사업 설명 · 성장이 보장된다는 의미는 아님','출처: Anthropic S-1 p.9–11·138–141')
        pts=[(280,365),(970,365),(970,680),(280,680)]
        labels=['고객 사용·피드백','모델·제품 개선','매출','연구·인프라 투자']
        for i,((x,y),label) in enumerate(zip(pts,labels)):
            d.rounded_rectangle((x-150,y-65,x+330,y+65),radius=20,fill='#ffffff');d.text((x-110,y-25),label,font=font(34,True),fill=INK)
        for i,(a,b) in enumerate([((610,365),(820,365)),((1210,430),(1210,615)),((820,680),(610,680)),((220,615),(220,430))]):
            arrow(d,a,b,TEAL,t-i*.7)
        d.text((1320,450),'회사 주장',font=font(36,True),fill=GOLD)
        d.text((1320,520),'모든 고객 데이터의',font=font(28),fill=MUTED);d.text((1320,565),'학습 사용을 뜻하지 않음',font=font(28),fill=MUTED)
    elif kind=='nrr':
        im,d=base('NRR: 같은 고객 집단의 매출을 비교','Q3 2026 / Q3 2025 · Pro/Max 구독자 제외','출처: Anthropic S-1 p.2–3·135 · 약 900%는 약 9배, +900% 성장률이 아님')
        card(d,(120,290,820,620),'고정 기준 고객','Q3 2025','당시 최소 $1 매출 고객',TEAL)
        card(d,(1090,290,1790,620),'같은 고객의 매출','Q3 2026','신규 고객 추가하지 않음',TEAL)
        arrow(d,(840,460),(1070,460),TEAL,t-.5)
        if t>1.5:center(d,(960,710),'이번 분기 매출 ÷ 당시 매출 ≈ 900%',46,TEAL,True)
        d.text((120,815),'이탈·사용 감소도 반영하는 매출 비율입니다.',font=font(32),fill=MUTED)
    elif kind=='runrate':
        im,d=base('런레이트는 최근 수준을 연간으로 환산','실현 연매출이나 확정 전망과 구분','출처: Anthropic S-1 지표 정의 p.2–3')
        card(d,(140,320,850,690),'최근 28일 소비형 매출','×13','최근 사용량 수준의 연환산',TEAL)
        card(d,(1070,320,1780,690),'월 구독 매출','×12','월 구독 수준의 연환산',GOLD)
        center(d,(960,445),'+',70,INK,True)
        d.text((140,805),'최근의 높은 속도가 앞으로도 유지된다는 보장은 없습니다.',font=font(33),fill=MUTED)
    elif kind=='adjusted':
        im,d=base('조정 영업이익은 별도 지표입니다','2026년 상반기 · 단위: 십억 달러 · 경영진 정의 NON-GAAP','출처: Anthropic S-1 p.160 · 주식보상 비용은 경제적으로 중요')
        rows=[('GAAP 영업손익','-0.693','출발점',RED),('제외 비용','+2.311','주식보상 2.185 + 기부 0.126',GOLD),('조정 영업이익','+1.618','NON-GAAP',TEAL)]
        for i,(a,b,c,col) in enumerate(rows):
            if t>i*.8:card(d,(100+580*i,350,640+580*i,720),a,b,c,col)
        d.text((100,820),'비용을 제외한 지표와 일반회계기준 손익을 함께 봅니다.',font=font(34),fill=INK)
    elif kind=='fairvalue':
        im,d=base('기업가치 상승이 회계 손실을 늘릴 수 있습니다','일부 금융상품의 평가 메커니즘 · 개념도, 현금 흐름 아님','출처: Anthropic S-1 p.147 / F-7·F-12')
        rows=[('기업가치','상승','평가의 입력값',TEAL),('금융상품 평가액','증가 가능','회계상 측정 의무',GOLD),('손익계산서','평가손실','같은 금액 현금 지출 아님',RED)]
        for i,(a,b,c,col) in enumerate(rows):
            if t>i*.8:card(d,(100+580*i,350,640+580*i,700),a,b,c,col)
        d.text((100,820),'계약 권리·전환·희석의 영향은 별도로 살펴봐야 합니다.',font=font(34),fill=INK)
    elif kind=='liquidity':
        im,d=base('현금 잔액과 자금의 출처','2026년 상반기 · 단위: 십억 달러 · 잔액과 기간 흐름을 구분','출처: Anthropic S-1 p.168–169 / F-12')
        rows=[('6월 말 현금+단기투자','131.651','잔액',TEAL),('상반기 재무현금흐름','+110.774','주로 우선주 발행',GOLD),('상반기 투자현금흐름','-17.181','전부 설비투자는 아님',RED)]
        for i,(a,b,c,col) in enumerate(rows):
            if t>i*.7:card(d,(100+580*i,350,640+580*i,730),a,b,c,col)
        d.text((100,825),'현재 자금이 전부 영업으로 번 돈이라는 뜻은 아닙니다.',font=font(32),fill=INK)
    elif kind=='risk':
        im,d=base('수요와 약정 사이의 위험','개념적 인과 관계 · 숫자 흐름이나 예측이 아님','출처: Anthropic S-1 p.16–17·56·137·142·170–172')
        rows=[('경쟁·가격·수요','사용량','매출의 불확실성',TEAL),('칩·전력·시설','가동 용량','공급·인도·수출 위험',GOLD),('장기 약정','지급 일정','수요보다 먼저 비용 발생',RED)]
        for i,(a,b,c,col) in enumerate(rows):
            if t>i*.7:card(d,(100+580*i,330,640+580*i,720),a,b,c,col)
        d.text((100,825),'공급자·투자자·유통사·경쟁자의 역할이 겹칠 수 있습니다.',font=font(32),fill=INK)
    elif kind=='concentration':
        im,d=base('집중도: 기간과 분모가 다릅니다','서로 다른 기준의 비율을 합치지 않습니다','출처: Anthropic S-1 p.56·145 / F-16')
        rows=[('상위 5고객','약 25%','2026년 첫 9개월 매출',TEAL),('CSP 마켓플레이스','48%','2026년 상반기 매출',GOLD),('이후 조건위반 판단 고객','추정 5–7%','2026년 첫 9개월 매출',RED)]
        for i,(a,b,c,col) in enumerate(rows):
            if t>i*.8:card(d,(100+580*i,350,640+580*i,720),a,b,c,col)
        d.text((100,820),'개별 고객 >10% 없음 · 조건위반 고객이 모두 범죄자라는 뜻은 아님',font=font(30),fill=INK)
    elif kind=='safety':
        im,d=base('안전·법률·규제도 사업 결과에 연결됩니다','위험요인 개념도','출처: Anthropic S-1 p.16–17·142·145 / p.147')
        labels=['오용·사이버','개인정보·저작권','규제·수출 제한','제품 제한·출시 지연']
        for i,label in enumerate(labels):
            x=110+(i%2)*900;y=300+(i//2)*230
            if t>i*.5:d.rounded_rectangle((x,y,x+800,y+160),radius=20,fill='#ffffff');d.text((x+45,y+52),label,font=font(38,True),fill=INK)
        d.text((110,830),'2025 Bartz 합의 비용 1.5B ≠ 모든 법적 위험의 종료',font=font(33),fill=RED)
    elif kind=='pbc':
        im,d=base('공익기업은 영리회사입니다','공모 후 예정 지배구조와 함께 읽기','출처: Anthropic S-1 표지·p.12–15·243–250')
        labels=['주주의 금전적 이익','이해관계자','인류의 장기적 AI 이익']
        for i,a in enumerate(labels):
            if t>i*.7:card(d,(100+580*i,350,640+580*i,720),a,'함께 고려','비영리단체가 아님',TEAL)
    elif kind=='ending':
        im,d=base('다음 공시에서 확인할 세 가지','성장과 흑자 전환을 보되, 약정·희석·통제권도 함께','출처: Anthropic S-1 (2026-10-26) · 공모 조건 미확정')
        rows=[('사용량과 매출','비용을 앞서는가'),('확보한 용량','현금으로 돌아오는가'),('공익 목적과 투자자','어떻게 조정되는가')]
        for i,(a,b) in enumerate(rows):
            if t>i*.8:
                y=280+i*185;d.rounded_rectangle((110,y,1800,y+145),radius=20,fill='#ffffff');d.text((150,y+45),a,font=font(39,True),fill=TEAL);d.text((850,y+45),b,font=font(39),fill=INK)
    elif kind=='credits':
        im,d=base('출처와 제작 기록','Anthropic, PBC — S-1 (Q2) · 2026년 10월 26일 제출','원문: SEC EDGAR · accession 000162828026067168')
        lines=[
          '재무제표: 2026년 6월 30일까지 · 일부 사업 지표: 9월 30일',
          'sec.gov/Archives/edgar/data/2130357/000162828026067168/anthropicpbc-sx1.htm',
          'Music: The Life and Death of a Certain K. Zabriskie, Patriarch',
          'Chris Zabriskie · Album: Vendaface · CC BY 4.0',
          'creative commons: creativecommons.org/licenses/by/4.0/ · chriszabriskie.com',
          '내레이션은 AI 합성 음성입니다 · Supertonic 3 M3 · 속도 0.95',
          'Fonts: IBM Plex Sans KR / IBM Plex Mono / GmarketSans',
          '계산·차트: 공시의 기간·분류·반올림·조건을 유지'
        ]
        for i,line in enumerate(lines):
            d.text((110,285+i*70),line,font=font(27 if i in (1,4) else 32),fill=MUTED if i in (1,4) else INK)
    else:raise ValueError(kind)
    return im
