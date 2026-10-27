from __future__ import annotations
from episode_paths import EPISODE_ROOT, OSINT_ROOT
import math
import subprocess
from pathlib import Path
from functools import lru_cache
from PIL import Image, ImageDraw, ImageFont

OUT = EPISODE_ROOT
FONTS = OUT / 'fonts'

@lru_cache(maxsize=32)
def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(FONTS / ('IBMPlexSansKR-SemiBold.ttf' if bold else 'IBMPlexSansKR-Regular.ttf')), size)

def ease(t: float) -> float:
    return 1 - (1-max(0,min(1,t)))**3

def frame(t: float) -> Image.Image:
    im=Image.new('RGB',(1920,1080),'#efeee7')
    d=ImageDraw.Draw(im)
    d.text((110,65),'매출의 성장, 영업손익의 전환',font=font(60,True),fill='#202d33')
    d.text((112,150),'2026년 1분기 → 2분기  |  단위: 십억 달러',font=font(31),fill='#56666e')
    d.text((1615,61),'2026.10.26',font=font(26),fill='#56666e')
    d.rounded_rectangle((110,245,1050,850),radius=22,fill='#ffffff')
    d.rounded_rectangle((1090,245,1810,850),radius=22,fill='#ffffff')
    d.text((150,280),'매출',font=font(38,True),fill='#203137')
    for val in (0,4,8,12):
        y=770-val/12*380
        d.line((220,y,970,y),fill='#dce3e2',width=2)
        d.text((150,y-18),str(val),font=font(27),fill='#68787c')
    for i,(name,val) in enumerate([('1분기',4.731),('2분기',11.555)]):
        x=350+340*i
        h=val/12*380*ease((t-.4-i*.9)/2)
        d.rounded_rectangle((x-75,770-h,x+75,770),radius=10,fill=('#719798' if i==0 else '#286c72'))
        if t>1+i*.9:
            d.text((x-75,770-h-50),f'{val:.3f}',font=font(37,True),fill='#25464d')
        d.text((x-48,790),name,font=font(30),fill='#354e53')
    d.text((1130,280),'영업손익',font=font(38,True),fill='#203137')
    baseline=560
    d.line((1160,baseline,1750,baseline),fill='#9babad',width=3)
    d.text((1160,baseline-34),'0',font=font(25),fill='#68787c')
    for i,(name,val) in enumerate([('1분기',-1.667),('2분기',.974)]):
        x=1320+280*i
        h=abs(val)/2*180*ease((t-3-i*.7)/1.7)
        a,b=(baseline,baseline+h) if val<0 else (baseline-h,baseline)
        d.rectangle((x-65,a,x+65,b),fill=('#bc735a' if val<0 else '#286c72'))
        if t>3.4+i*.7:
            d.text((x-76,b+20 if val<0 else a-53),f'{val:+.3f}',font=font(35,True),fill='#354e53')
        d.text((x-48,790),name,font=font(30),fill='#354e53')
    d.text((112,850),'매출·영업손익은 서로 다른 척도입니다. 각 패널의 단위와 기준선을 확인하세요.',font=font(29),fill='#435c63')
    d.text((112,976),'출처: Anthropic S-1 (2026-10-26), pp.147·157·160 · SEC 원문 직접 대조',font=font(23),fill='#596b70')
    d.text((112,1016),'내부 차트 모션 검수 · 최종 영상 아님 · 내레이션 및 원문 독립 대조 대기',font=font(23),fill='#68787c')
    return im

def main() -> None:
    p=subprocess.Popen(['ffmpeg','-v','error','-y','-f','rawvideo','-pix_fmt','rgb24','-s','1920x1080','-r','24','-i','-','-an','-c:v','libx264','-preset','fast','-crf','19','-pix_fmt','yuv420p',str(OUT/'internal_chart_motion.mp4')],stdin=subprocess.PIPE)
    for n in range(192):
        im=frame(n/24)
        if n==168:
            im.save(OUT/'internal_chart_frame.png')
        p.stdin.write(im.tobytes())
    p.stdin.close()
    assert p.wait()==0

if __name__=='__main__':
    main()
