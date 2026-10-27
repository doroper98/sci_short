from __future__ import annotations
from episode_paths import EPISODE_ROOT, OSINT_ROOT

import math
from pathlib import Path
from typing import Callable
from functools import lru_cache

import yaml
from PIL import Image, ImageDraw, ImageFont

OUT = EPISODE_ROOT
F = yaml.safe_load((OUT / 'source/verified_financials.yaml').read_text())
BG, INK, MUTED, TEAL, RED, GOLD = '#f0eee7', '#22343b', '#60747a', '#347b83', '#b96f57', '#a6804d'


@lru_cache(maxsize=64)
def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(OUT / 'fonts' / ('IBMPlexSansKR-SemiBold.ttf' if bold else 'IBMPlexSansKR-Regular.ttf')), size)


def ease(t: float) -> float:
    return 1-(1-min(1,max(0,t)))**3


def base(title: str, sub: str, source: str) -> tuple[Image.Image, ImageDraw.ImageDraw]:
    im=Image.new('RGB',(1920,1080),BG); d=ImageDraw.Draw(im)
    d.text((100,55),title,font=font(57,True),fill=INK)
    mono=ImageFont.truetype(str(OUT/'fonts/IBMPlexMono-Medium.ttf'),26)
    d.text((1615,61),'2026.10.26',font=mono,fill=MUTED)
    d.text((103,142),sub,font=font(30),fill=MUTED)
    d.text((100,976),source,font=font(23),fill=MUTED)
    d.text((100,1016),'내부 장면 검수 · 최종 영상 아님 · 음성 및 최종 자막 타이밍 대기',font=font(22),fill=MUTED)
    return im,d


def center(d: ImageDraw.ImageDraw, xy: tuple[float,float], text: str, size: int = 30, color: str = INK, bold: bool = False) -> None:
    ft=font(size,bold); w=d.textlength(text,font=ft)
    d.text((xy[0]-w/2,xy[1]),text,font=ft,fill=color)


def arrow(d: ImageDraw.ImageDraw, a: tuple[float,float], b: tuple[float,float], color: str, progress: float, width: int = 5) -> None:
    p=ease(progress); x=a[0]+(b[0]-a[0])*p; y=a[1]+(b[1]-a[1])*p
    d.line((a,(x,y)),fill=color,width=width)
    if p>.98:
        theta=math.atan2(b[1]-a[1],b[0]-a[0]); r=15
        d.polygon([b,(b[0]-r*math.cos(theta-.55),b[1]-r*math.sin(theta-.55)),(b[0]-r*math.cos(theta+.55),b[1]-r*math.sin(theta+.55))],fill=color)


def revenue(t: float) -> Image.Image:
    im,d=base('매출의 여섯 분기','단위: 십억 달러 · 동일한 분기 길이, 동일한 눈금','출처: Anthropic S-1 (2026-10-26), p.157 표62')
    vals=[v/1000 for v in F['quarterly']['revenue']]
    y0=810; scale=43
    for v in (0,3,6,9,12):
        y=y0-v*scale; d.line((180,y,1790,y),fill='#d2dbd7',width=2)
        d.text((108,y-18),str(v),font=font(28),fill=MUTED)
    for i,(label,v) in enumerate(zip(['25 Q1','25 Q2','25 Q3','25 Q4','26 Q1','26 Q2'],vals)):
        x=310+270*i; p=ease((t-.4*i)/1.5); h=v*scale*p
        d.rectangle((x-70,y0-h,x+70,y0),fill=TEAL if i==5 else '#83a5a6')
        if p>.98: center(d,(x,y0-h-54),f'{v:.3f}',34,TEAL,True)
        center(d,(x,835),label,29)
    if t>3.7:
        d.rounded_rectangle((220,245,850,330),radius=18,fill='#ffffff')
        d.text((245,265),'26 Q2 전년 동기 대비 +1,368%',font=font(34,True),fill=TEAL)
    return im


def waterfall(t: float, cash: bool = False) -> Image.Image:
    if cash:
        labels=['순손실','비현금 조정','운전자본','영업현금흐름']
        values=[-80.748,83.509,1.168,3.929]; totals={0,3}
        title='회계상 손실에서 영업현금흐름으로'; sub='2026년 상반기 · 단위: 십억 달러 · 조정액은 그 자체가 현금 유입은 아닙니다'
        src='출처: Anthropic S-1 (2026-10-26), F-12 / p.168 · 합계 대사 완료'
    else:
        labels=['영업손실','이자수익','전환상품 평가','기타 영업외','세금','순손실']
        values=[-.693,1.111,-72.388,-8.757,-.021,-80.748]; totals={0,5}
        title='영업손익과 순손익 사이'; sub='2026년 상반기 · 단위: 십억 달러 · 회계 연결표이며 현금 이동 그림이 아닙니다'
        src='출처: Anthropic S-1 (2026-10-26), p.147 / F-7 · 합계 대사 완료'
    im,d=base(title,sub,src); zero=335; scale=5.5
    for v in (0,-20,-40,-60,-80):
        y=zero-v*scale; d.line((170,y,1790,y),fill='#d4ddda',width=2)
        d.text((100,y-17),str(v),font=font(26),fill=MUTED)
    d.text((100,230),'+10',font=font(25),fill=MUTED)
    d.line((170,280,1790,280),fill='#d4ddda',width=2)
    prior=0.; dx=1600/len(values)
    for i,(label,v) in enumerate(zip(labels,values)):
        x=235+dx*i; p=ease((t-.7*i)/1.5)
        start=0 if i in totals else prior; end=v if i in totals else prior+v
        if i and i not in totals and t>.7*i:
            d.line((x-dx+60,zero-start*scale,x-60,zero-start*scale),fill='#91a4a6',width=2)
        ya,yb=zero-start*scale,zero-(start+(end-start)*p)*scale
        col=TEAL if end>=start else RED
        if i==len(values)-1: col=TEAL if v>=0 else INK
        if p>0:
            d.rectangle((x-60,min(ya,yb),x+60,max(ya,yb)),fill=col)
            if abs(yb-ya)<2: d.line((x-60,yb,x+60,yb),fill=col,width=2)
        if p>.98:
            # direct label prevents thin bars from becoming unreadable; no artificial bar height
            center(d,(x,855),f'{v:+.3f}',31,col,True)
        center(d,(x,815),label,27)
        if p>.98 and abs(end-start)<2:
            d.line((x,yb,x,yb-26),fill=col,width=2)
        prior=end
    if not cash and t>5:
        d.rounded_rectangle((850,215,1790,275),radius=10,fill='#ffffff')
        d.text((872,230),'기타 영업외 8.757 중 다른 금융상품 평가손실 8.720',font=font(25),fill=MUTED)
    return im


def customer(t: float) -> Image.Image:
    im,d=base('큰 고객 수: 중복되는 문턱','2026-09-30 · 최근 12개월 앤트로픽 매출 기여 · 조직별 계정 합산 · 면적 비례 아님','출처: Anthropic S-1 (2026-10-26), p.142 · 수치는 초과/근사치')
    boxes=[((160,250,1760,850),'$100k 이상  >11,900 조직','#d9e6df'),((410,405,1710,820),'$1m 이상  >1,900 조직','#accac1'),((800,575,1660,790),'$10m 이상  약 250 조직','#609a91')]
    for i,(b,label,col) in enumerate(boxes):
        p=ease((t-i*.9)/1.2)
        if p>0:
            y=b[1]+20*(1-p); d.rounded_rectangle((b[0],y,b[2],b[3]),radius=24,fill=col)
            d.text((b[0]+34,y+25),label,font=font(38,True),fill=INK)
    d.text((160,858),'세 집단을 더하지 않습니다. 더 큰 고객은 앞의 집단에 이미 포함됩니다.',font=font(28),fill=INK)
    return im


def commitments(t: float) -> Image.Image:
    im,d=base('약정은 같은 성격의 숫자가 아닙니다','단위: 십억 달러 · 선의 길이는 기간이며 금액에 비례하지 않음 · 목록은 비포괄적','출처: Anthropic S-1 (2026-10-26), p.170–172 · 합산하지 않음')
    x0,x1=480,1770
    def xpos(year:float)->float: return x0+(year-2026)/(2036.5-2026)*(x1-x0)
    for y in (2026,2028,2030,2032,2034,2036):
        x=xpos(y); d.line((x,230,x,610),fill='#d4ddda',width=2); center(d,(x,195),str(y),26)
    rows=[('Microsoft','최소 44.9',2026+10/12,2033+4/12,TEAL),('Google','최소 약 114.5',2026+3/12,2033+6/12,'#688b65'),('Amazon','최소 110',2026+4/12,2036+3/12,GOLD)]
    for i,(name,val,start,end,col) in enumerate(rows):
        y=295+130*i; p=ease((t-.7*i)/1.4)
        d.text((100,y-34),name,font=font(32,True),fill=INK); d.text((100,y+10),val,font=font(31),fill=col)
        d.line((xpos(start),y,xpos(start)+(xpos(end)-xpos(start))*p,y),fill=col,width=15)
        if p>.98:
            d.ellipse((xpos(start)-9,y-9,xpos(start)+9,y+9),fill=col)
            center(d,((xpos(start)+xpos(end))/2,y+20),f'{int(start)}.{round((start%1)*12)+1:02d} → {int(end)}.{round((end%1)*12)+1:02d}',24)
    if t>2:
        d.rounded_rectangle((100,655,1810,735),radius=14,fill='#ffffff')
        d.text((125,674),'Google 추가 TPU 지급 추정 125–150: 위 최소 약정과 별도, 표 밖의 추정치',font=font(29),fill=INK)
    if t>3:
        d.text((110,775),'Broadcom  약 161.2',font=font(34,True),fill=INK)
        d.text((110,825),'리스 · 이자 제외 · 같은 기간의 고정채무 총액으로 합산 금지',font=font(27),fill=MUTED)
    if t>4:
        d.text((1020,775),'SpaceXAI  최대 120.5',font=font(34,True),fill=INK)
        d.text((1020,825),'초기 취소 불가 기간: 2027년 1월/3월까지',font=font(25),fill=MUTED)
        d.text((1020,866),'이후 양측 90일 전 통지로 취소 가능',font=font(25),fill=MUTED)
    return im


def governance(t: float) -> Image.Image:
    im,d=base('상장 후 예정 구조: 지분과 통제권','Class F는 상장 완료 직전 발행 예정 · 현재 이사회 구성과 구분','출처: Anthropic S-1 (2026-10-26), p.256·294 / 표지·p.12–15')
    nodes=[((100,250,720,425),'장기이익신탁 · Class T','정원 7자리 중 4자리 선임·해임','#dce8df'),((100,590,720,765),'창업자 LLC · Class F 한 주','일반 의결권 50.1%','#e9dfd0'),((1110,365,1810,655),'상장 후 이사회 · 정원 7자리','LTBT 4자리(1공석) / A+F 3자리','#ffffff')]
    for b,title,desc,col in nodes:
        d.rounded_rectangle(b,radius=22,fill=col)
        d.text((b[0]+30,b[1]+25),title,font=font(35,True),fill=INK)
        d.text((b[0]+30,b[1]+90),desc,font=font(27),fill=MUTED)
    arrow(d,(720,335),(1110,425),TEAL,t-.5)
    arrow(d,(720,675),(1110,595),GOLD,t-1.7)
    if t>2:
        center(d,(910,290),'4자리 · 1공석 포함',27,TEAL,True)
        center(d,(910,705),'A+F가 나머지 3자리 선출',25,GOLD,True)
    if t>3:
        d.rounded_rectangle((100,835,1810,891),radius=16,fill='#ffffff')
        d.text((125,855),'Class A: 1주 1표 · 통제력 제한   |   T/F는 경제적 권리 없음 · 신탁은 일상 경영자가 아님',font=font(29),fill=INK)
    return im


SCENES: dict[str,Callable[[float],Image.Image]]={'revenue':revenue,'accounting':lambda t:waterfall(t,False),'cash':lambda t:waterfall(t,True),'customers':customer,'commitments':commitments,'governance':governance}


def main() -> None:
    dest=OUT/'scene_checks'; dest.mkdir(exist_ok=True)
    thumbs=[]
    for name,fn in SCENES.items():
        im=fn(8); im.save(dest/(name+'.png'))
        for t in (0.5,2.0,4.0): fn(t).save(dest/(name+f'_{t:.1f}.png'))
        thumbs.append(im.resize((640,360)))
    sheet=Image.new('RGB',(1280,1080),BG)
    for i,im in enumerate(thumbs): sheet.paste(im,((i%2)*640,(i//2)*360))
    sheet.save(dest/'contact_sheet.png')
    print('Rendered 24 scene frames and contact sheet')


if __name__=='__main__': main()
