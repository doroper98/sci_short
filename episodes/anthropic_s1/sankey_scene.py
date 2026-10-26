from __future__ import annotations
from episode_paths import EPISODE_ROOT, OSINT_ROOT
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import yaml

OUT=EPISODE_ROOT

def font(size:int,bold:bool=False)->ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(OUT/'fonts'/('IBMPlexSansKR-SemiBold.ttf' if bold else 'IBMPlexSansKR-Regular.ttf')),size)

def curve(x0:float,y0:float,x1:float,y1:float,n:int=100)->list[tuple[float,float]]:
    pts=[]
    for k in range(n+1):
        t=k/n; u=1-t
        pts.append((u*u*u*x0+3*u*u*t*(x0+330)+3*u*t*t*(x1-330)+t*t*t*x1,u*u*u*y0+3*u*u*t*y0+3*u*t*t*y1+t*t*t*y1))
    return pts

def frame(t:float)->Image.Image:
    facts=yaml.safe_load((OUT/'source/verified_financials.yaml').read_text())['annual_halfyear']
    entries=[('컴퓨트·인프라','compute_infrastructure','#3c7880'),('인건비','personnel','#698a65'),('판매·마케팅·파트너십','sales_marketing_partnerships','#bc9060'),('기타 운영·관리','other_operating_admin','#8a84a3')]
    total=facts['operating_expense'][-1]
    im=Image.new('RGB',(1920,1080),'#f0eee7'); d=ImageDraw.Draw(im)
    d.text((100,60),'영업비용의 구성',font=font(60,True),fill='#203239')
    d.text((103,150),'2026년 상반기 · 비용 성격별 분류 · 단위: 십억 달러',font=font(31),fill='#5d7074')
    d.text((100,245),'총 영업비용',font=font(36,True),fill='#203239')
    d.text((100,295),'16.979',font=font(55,True),fill='#203239')
    src_y=390.; target_y=250.; scale=480/total
    for i,(label,key,color) in enumerate(entries):
        val=facts[key][-1]; h=val*scale
        p=max(0,min(1,(t-.5-i*.9)/1.5))
        top=curve(460,src_y,1320,target_y)
        bottom=curve(460,src_y+h,1320,target_y+h)
        poly=top+list(reversed(bottom))
        layer=Image.new('RGBA',im.size); ld=ImageDraw.Draw(layer)
        ld.polygon(poly,fill=color+'ad')
        cutoff=460+int(860*p)
        layer.putalpha(layer.getchannel('A').point(lambda a:int(a*.9)))
        if cutoff<1320: ImageDraw.Draw(layer).rectangle((cutoff,0,1920,1080),fill=(0,0,0,0))
        im.paste(layer,(0,0),layer)
        d=ImageDraw.Draw(im)
        d.rectangle((440,src_y,460,src_y+h),fill=color)
        if p>.98:
            d.rectangle((1320,target_y,1342,target_y+h),fill=color)
            d.text((1370,target_y+h/2-38),label,font=font(29,True),fill='#203239')
            d.text((1370,target_y+h/2+2),f'{val/1000:.3f}',font=font(37,True),fill=color)
        src_y+=h; target_y+=h+45
    d.text((100,930),'띠의 두께는 금액에 비례합니다. 비용의 구성이지 현금 지출의 흐름은 아닙니다.',font=font(29),fill='#435c63')
    d.text((100,990),'출처: Anthropic S-1 (2026-10-26), p.147 표30 / F-7 · 합계 대사 완료 · 내부 모션 검수',font=font(24),fill='#66797d')
    return im

if __name__=='__main__':
    frame(8).save(OUT/'internal_sankey_frame.png')
