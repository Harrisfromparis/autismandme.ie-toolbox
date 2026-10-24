"""Deterministic cutout episode renderer. Does not claim generative articulation."""
import json, math, os, subprocess, sys, wave
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageOps, ImageFilter

manifest_path=Path(sys.argv[1]); p=json.loads(manifest_path.read_text(encoding='utf-8'))
directory=Path(p['directory']); status_path=directory/'status.json'
W,H=(1920,1080) if p.get('resolution')=='1080' else (1280,720)
FPS=24; scale=W/1280; SR=22050
font_path='C:/Windows/Fonts/segoeui.ttf'; bold_path='C:/Windows/Fonts/segoeuib.ttf'
def font(size,bold=False): return ImageFont.truetype(bold_path if bold else font_path,round(size*scale))
def status(progress,message):
    tmp=status_path.with_suffix('.tmp');tmp.write_text(json.dumps({'status':'running','progress':progress,'message':message}),encoding='utf-8');os.replace(tmp,status_path)
def wrap(text,f,maxwidth,draw):
    lines=[];line=''
    for word in text.split():
        attempt=(line+' '+word).strip()
        if draw.textlength(attempt,font=f)>maxwidth and line:lines.append(line);line=word
        else:line=attempt
    if line:lines.append(line)
    return lines
def load_image(file):
    if not file:return None
    image=Image.open(file);image.load()
    if image.width*image.height>40000000:raise ValueError('Image is too large; use an image below 40 megapixels.')
    return image.convert('RGBA')
characters=[]
for c in p['characters']:
    image=load_image(c.get('file'))
    if image is None:raise ValueError('A character image is missing. Upload the character again.')
    if c.get('removeWhite'):
        import numpy as np
        pixels=np.array(image);white=(pixels[:,:,:3].min(axis=2)>238);pixels[white,3]=0;image=Image.fromarray(pixels)
    characters.append({**c,'image':image})
backgrounds={s.get('background'):load_image(s.get('background')) for s in p['shots']}
palette={'comedy':('#1b233c','#68407a','#ffb86b'),'cinematic':('#071a2b','#244a53','#d3b784'),'gentle':('#263f4b','#527b75','#e5cd98')}
colors=palette.get(p.get('style'),palette['comedy'])
def color(s):return tuple(int(s[i:i+2],16) for i in (1,3,5))
base=Image.new('RGB',(W,H));d=ImageDraw.Draw(base)
top,bottom=color(colors[0]),color(colors[1])
for y in range(H):
    t=y/H;d.line((0,y,W,y),fill=tuple(round(a*(1-t)+b*t) for a,b in zip(top,bottom)))
d.ellipse((int(-W*.15),int(H*.55),int(W*1.15),int(H*1.8)),fill=color(colors[0]))
for x,y,r in [(0.16,0.22,.05),(.82,.18,.09),(.68,.45,.018)]:
    d.ellipse((int((x-r)*W),int((y-r)*H),int((x+r)*W),int((y+r)*H)),outline=colors[2],width=max(1,round(scale)))
prepared_backgrounds={key:ImageOps.fit(img.convert('RGB'),(W,H)) if img else base for key,img in backgrounds.items()}
audio_segments=[];timings=[];cursor=2.0
for s in p['shots']:
    wav=Path(s['wav']);samples=b''
    if wav.exists():
        with wave.open(str(wav),'rb') as f:
            if (f.getnchannels(),f.getsampwidth(),f.getframerate())!=(1,2,SR):raise ValueError('Unexpected speech audio format')
            samples=f.readframes(f.getnframes())
    speech_duration=len(samples)/(SR*2);duration=max(float(s.get('duration',3)),speech_duration+.65)
    frame_count=math.ceil(duration*FPS);duration=frame_count/FPS
    audio_segments.append(samples+b'\0'*max(0,round(duration*SR)*2-len(samples)))
    timings.append((cursor,cursor+duration,s));cursor+=duration
if cursor>1802:raise ValueError('Spoken dialogue exceeds the 30-minute episode limit.')
with wave.open(str(directory/'dialogue.wav'),'wb') as f:
    f.setnchannels(1);f.setsampwidth(2);f.setframerate(SR);f.writeframes(b'\0'*round(2*SR)*2)
    for segment in audio_segments:f.writeframes(segment)
    f.writeframes(b'\0'*round(1.5*SR)*2)
def stamp(t):
    ms=round(t*1000);return f'{ms//3600000:02}:{ms//60000%60:02}:{ms//1000%60:02},{ms%1000:03}'
captions=[]
for i,(start,end,s) in enumerate(timings):
    captions.append(f'{i+1}\n{stamp(start)} --> {stamp(end)}\n{s["speaker"]}: {s["dialogue"]}\n')
(directory/'captions.srt').write_text('\n'.join(captions),encoding='utf-8')
ffmpeg=p['ffmpeg'];raw=directory/'picture.mp4'
log=open(directory/'encoder.log','w',encoding='utf-8')
command=[ffmpeg,'-y','-f','rawvideo','-vcodec','rawvideo','-pix_fmt','rgb24','-s',f'{W}x{H}','-r',str(FPS),'-i','-','-an','-c:v','libx264','-preset','veryfast','-crf','20','-pix_fmt','yuv420p',str(raw)]
encoder=subprocess.Popen(command,stdin=subprocess.PIPE,stderr=log,stdout=subprocess.DEVNULL)
def write_frame(frame):
    encoder.stdin.write(frame.convert('RGB').tobytes())
def title_frame(title,subtitle):
    image=base.copy();draw=ImageDraw.Draw(image);tf=font(58,True);lines=wrap(title,tf,W*.8,draw)
    y=H*.36
    for line in lines:
        draw.text((W/2,y),line,font=tf,fill='#fff7e8',anchor='mt');y+=round(72*scale)
    draw.text((W/2,y+30*scale),subtitle,font=font(22),fill='#e3c899',anchor='mt')
    return image
try:
    frame=title_frame(p.get('title') or 'An animated story',p.get('series') or 'Autism & Me • Director Studio')
    for _ in range(FPS*2):write_frame(frame)
    total=sum(round((end-start)*FPS) for start,end,s in timings);done=0
    for shot_index,(start,end,s) in enumerate(timings):
        status(14+round(done/max(1,total)*75),f'Rendering shot {shot_index+1} of {len(timings)}')
        speaking=next((c for c in characters if c['name'].casefold()==s['speaker'].casefold()),None)
        cast=[speaking]+[c for c in characters if c is not speaking][:1] if speaking else characters[:2]
        nframes=round((end-start)*FPS);duration=end-start
        prepared=[]
        for c in cast:
            im=c['image'];factor=min(W*.38/im.width,H*.67/im.height)
            if s.get('camera')=='close':factor*=1.33
            elif s.get('camera')=='wide':factor*=.85
            resized=im.resize((max(1,round(im.width*factor)),max(1,round(im.height*factor))),Image.Resampling.LANCZOS)
            prepared.append((c,resized))
        for f in range(nframes):
            t=f/FPS;progress=t/max(.1,duration);frame=prepared_backgrounds[s.get('background')].copy().convert('RGBA')
            draw=ImageDraw.Draw(frame)
            for j,(c,im) in enumerate(prepared):
                active=c is speaking;moving=not p.get('reducedMotion',False)
                bob=math.sin(t*3.3+j)*4*scale if moving else 0
                drift=math.sin(progress*math.pi)*14*scale if moving else 0
                cx=W*(.5 if len(prepared)==1 else (.32 if j==0 else .72))+drift
                x=round(cx-im.width/2);y=round(H*.83-im.height+bob)
                draw.ellipse((cx-im.width*.32,H*.81,cx+im.width*.32,H*.86),fill=(0,0,0,65))
                frame.alpha_composite(im,(x,y))
                # Optional authored mouth anchor; never infer anatomy from whole-image motion.
                if c.get('mouth') and active and p.get('speech'):
                    mx=x+im.width*float(c.get('mouthX',.5));my=y+im.height*float(c.get('mouthY',.38))
                    opening=(3+abs(math.sin(t*12))*7)*scale
                    draw=ImageDraw.Draw(frame);draw.ellipse((mx-9*scale,my-opening/2,mx+9*scale,my+opening/2),fill='#291b31')
            draw=ImageDraw.Draw(frame)
            scene=s.get('scene','');draw.rounded_rectangle((30*scale,24*scale,min(W-30*scale,30*scale+draw.textlength(scene[:90],font=font(17))+30*scale),65*scale),radius=12*scale,fill=(9,14,28,170))
            draw.text((45*scale,35*scale),scene[:90],font=font(17),fill='#f3e8db')
            if p.get('captions',True) and s.get('dialogue'):
                cf=font(27,True);lines=wrap(s['dialogue'],cf,W*.82,draw)
                # Page long dialogue instead of drawing beyond the canvas.
                pages=[lines[k:k+3] for k in range(0,len(lines),3)];page=pages[min(len(pages)-1,int(progress*len(pages)))] if pages else []
                boxheight=(len(page)*36+50)*scale;top=H-boxheight-20*scale
                draw.rounded_rectangle((W*.06,top,W*.94,H-15*scale),radius=16*scale,fill=(7,12,25,225))
                draw.text((W/2,top+10*scale),s['speaker'].upper(),font=font(14,True),fill=colors[2],anchor='mt')
                for k,line in enumerate(page):draw.text((W/2,top+(33+k*36)*scale),line,font=cf,fill='#ffffff',anchor='mt')
            fade=min(1,f/6,(nframes-1-f)/6) if nframes>12 else 1
            if fade<1:frame=Image.blend(Image.new('RGBA',(W,H),'#0c101d'),frame,max(0,fade))
            write_frame(frame);done+=1
            if f%48==0:status(14+round(done/max(1,total)*75),f'Rendering shot {shot_index+1} of {len(timings)}')
    frame=title_frame('The end',p.get('series') or 'Created with Director Studio')
    for _ in range(round(FPS*1.5)):write_frame(frame)
    encoder.stdin.close();code=encoder.wait()
    if code:raise RuntimeError('Video encoding failed; see encoder.log')
finally:
    if encoder.poll() is None:encoder.kill();encoder.wait()
    log.close()
status(93,'Mixing dialogue and preparing your MP4')
cmd=[ffmpeg,'-y','-i',str(raw),'-i',str(directory/'dialogue.wav')]
if p.get('music'):
    cmd+=['-stream_loop','-1','-i',p['music'],'-filter_complex','[1:a]apad[voice];[2:a]volume=0.12[music];[voice][music]amix=inputs=2:duration=first:normalize=0[a]','-map','0:v','-map','[a]']
else:cmd+=['-map','0:v','-map','1:a']
cmd+=['-c:v','copy','-c:a','aac','-b:a','192k','-shortest','-movflags','+faststart',str(directory/'episode.mp4')]
completed=subprocess.run(cmd,capture_output=True)
if completed.returncode:raise RuntimeError(completed.stderr.decode(errors='replace')[-2500:])
raw.unlink(missing_ok=True)
