"""Local watermark detector and renderer. JSON jobs only; no network at runtime."""
import sys, os, json, math, time, subprocess, tempfile, traceback, re
from pathlib import Path


def emit(**data):
    print(json.dumps(data, ensure_ascii=True), flush=True)


class Cancelled(Exception):
    pass


def check(job):
    if Path(job['cancel']).exists():
        raise Cancelled('任务已取消')


def proc(args, **kwargs):
    return subprocess.Popen(args, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0), **kwargs)


def kill(p):
    if p is not None and p.poll() is None:
        p.kill()
        p.wait()


def reader(job, start, length, fps=None):
    rate = fps or job['fps']
    return proc([job['ffmpeg'], '-nostdin', '-hide_banner', '-loglevel', 'error',
                 '-threads', '2', '-ss', str(start), '-i', job['input'], '-t', str(length),
                 '-an', '-sn', '-vf', f"scale={job['width']}:{job['height']},setsar=1,fps={rate}",
                 '-threads', '2', '-f', 'rawvideo', '-pix_fmt', 'bgr24', 'pipe:1'],
                stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)


def readframe(pipe, w, h):
    count = w * h * 3
    data = pipe.read(count)
    if len(data) != count:
        return None
    return np.frombuffer(data, dtype=np.uint8).reshape(h, w, 3).copy()


def area(box):
    return max(0, box[2]-box[0]) * max(0, box[3]-box[1])


def overlap(a, b):
    return area((max(a[0],b[0]),max(a[1],b[1]),min(a[2],b[2]),min(a[3],b[3])))


def union(a, b):
    return [min(a[0],b[0]),min(a[1],b[1]),max(a[2],b[2]),max(a[3],b[3])]


def bounded(box, w, h):
    return [max(0,float(box[0])),max(0,float(box[1])),min(w,float(box[2])),min(h,float(box[3]))]


def platform_groups(words, w, h):
    """Use recognized platform text as an anchor, including the adjacent icon.

    Never identify a logo from a particular input filename, account or fixed
    screen coordinate. The account line and platform label supply its geometry.
    """
    groups=[]
    for word in words:
        text=re.sub(r'\s+', '', word['text']); b=word['box']; bh=b[3]-b[1]
        account='抖音号' in text
        logo=text in ('抖音','Douyin','douyin')
        cy=(b[1]+b[3])/2/h
        if word['score'] < .7 or not (account or logo) or bh > h*.09 or b[2]-b[0] > w*.65:
            continue
        # A centered account number on an outro is not a corner watermark.
        if account and not (cy < .24 or cy > .82):
            continue
        if logo and not (cy < .24 or cy > .82):
            continue
        if account:
            box=[b[0]-bh*.35,b[1]-bh*3.4,b[2]+bh*.35,b[3]+bh*.35]
        else:
            box=[b[0]-bh*1.8,b[1]-bh*.4,b[2]+bh*.25,b[3]+bh*.3]
        # Join the short nearby account/search lines, excluding tall scene text.
        for other in words:
            o=other['box']; oh=o[3]-o[1]
            if oh > bh*1.9 or oh < bh*.32 or o[2]-o[0] > w*.65:
                continue
            center_y=(o[1]+o[3])/2
            if center_y < b[1]-bh*(2.8 if account else .6) or center_y > b[3]+bh*2.5:
                continue
            horizontal=min(box[2],o[2])-max(box[0],o[0])
            gap=max(box[1]-o[3],o[1]-box[3],0)
            if horizontal > 0 and gap <= bh*1.7:
                pad=max(3,oh*.3)
                box=union(box,[o[0]-pad,o[1]-pad,o[2]+pad,o[3]+pad])
        box=bounded(box,w,h)
        # No inferred region may grow across a large part of the picture.
        if box[2]-box[0] > w*.67 or box[3]-box[1] > h*.25:
            continue
        for index,prior in enumerate(groups):
            if overlap(box,prior) > min(area(box),area(prior))*.25:
                groups[index]=union(prior,box);break
        else:
            groups.append(box)
    return groups


def tracked_regions(records, w, h, duration):
    """Keep adjacent samples stable; do not bridge absent/changed positions."""
    tracks=[]; active=[]
    for record in records:
        i=record['index']; box=record['box']; kind=record['kind']; chosen=None
        active=[t for t in active if i-t['last']<=(3 if t['kind']=='watermark' else 2)]
        for track in reversed(active):
            if track['kind'] != kind or i-track['last'] > (3 if kind=='watermark' else 2) or i <= track['last']:
                continue
            prev=track['latest']; ov=overlap(prev,box)
            if ov/max(1,min(area(prev),area(box))) < .6:
                continue
            if kind=='subtitle' and abs((prev[1]+prev[3]-box[1]-box[3])/2) > h*.018:
                continue
            chosen=track;break
        if chosen is None:
            chosen=dict(first=i,last=i,box=list(box),latest=list(box),kind=kind,samples=1)
            tracks.append(chosen);active.append(chosen)
        else:
            chosen.update(last=i,box=union(chosen['box'],box),latest=list(box),samples=chosen['samples']+1)
    output=[]
    for t in tracks:
        b=bounded(t['box'],w,h)
        # Isolated lower-screen scene labels are not promoted to subtitles.
        if t['kind']=='subtitle' and t['samples']<2:
            continue
        output.append(dict(x=b[0]/w,y=b[1]/h,w=(b[2]-b[0])/w,h=(b[3]-b[1])/h,
            start=0 if t['kind']=='watermark' and t['first']<=1 else max(0,t['first']/4-.125),end=min(duration,(t['last']+1)/4+.125),
            protect=False,enabled=True,kind=t['kind']))
    return output


def select_regions(samples, w, h, duration):
    # Target platform overlays only when repeatedly confirmed. Other videos
    # retain general text detection and the existing manual/protection controls.
    # An end card is a separate shot, not an overlay on the original picture.
    # Leave it intact rather than synthesizing a blank card or leaking its masks
    # backwards over the final product frames. The UI explains separate trimming.
    outros=[any('抖音号' in x['text'] and .25*h<(x['box'][1]+x['box'][3])/2<.65*h for x in s['words']) and
            any('抖音搜索' in x['text'] or '发现更多创作者' in x['text'] for x in s['words']) for s in samples]
    groups=[[] if outros[i] else platform_groups(s['words'],w,h) for i,s in enumerate(samples)]
    confirmed=sum(bool(g) for g in groups)>=2
    selected=[]
    for i,s in enumerate(samples):
        if not confirmed:
            for word in s['words']:
                b=word['box']; pad=max(3,(b[3]-b[1])*.13)
                selected.append(dict(index=i,box=bounded([b[0]-pad,b[1]-pad,b[2]+pad,b[3]+pad],w,h),kind='text'))
            continue
        if outros[i]:
            continue
        for b in groups[i]:
            selected.append(dict(index=i,box=b,kind='watermark'))
        for word in s['words']:
            b=word['box']; bw=b[2]-b[0]; bh=b[3]-b[1]; text=word['text']
            if any(overlap(b,g)>area(b)*.25 for g in groups[i]):
                continue
            # Horizontal, centered lower-screen text, at a legible caption size.
            # Scene text elsewhere (calendar digits, packaging) stays untouched.
            if (word['score']>=.65 and len(re.sub(r'\W','',text))>=2 and
                .55*h <= (b[1]+b[3])/2 <= .88*h and .015*h <= bh <= .075*h and
                bw >= bh*2.4 and .2*w <= (b[0]+b[2])/2 <= .8*w and word['slope']<=.2):
                pad=max(4,bh*.22)
                selected.append(dict(index=i,box=bounded([b[0]-pad,b[1]-pad,b[2]+pad,b[3]+pad],w,h),kind='subtitle'))
    if not confirmed:
        return [dict(x=r['box'][0]/w,y=r['box'][1]/h,w=(r['box'][2]-r['box'][0])/w,h=(r['box'][3]-r['box'][1])/h,
                     start=max(0,r['index']/4-.125),end=min(duration,(r['index']+1)/4+.125),
                     protect=False,enabled=True,kind='text') for r in selected],False
    return tracked_regions(selected,w,h,duration),True


def create_detector(job):
    # All packaged model paths are supplied, preventing implicit model downloads.
    from rapidocr import RapidOCR
    base = Path(job['component']) / 'lib/rapidocr/models'
    return RapidOCR(params={
        'Global.use_cls': False, 'Global.use_rec': True, 'Global.log_level': 'error',
        'Det.model_path': str(base / 'ch_PP-OCRv4_det_infer.onnx'),
        'Cls.model_path': str(base / 'ch_ppocr_mobile_v2.0_cls_infer.onnx'),
        'Rec.model_path': str(base / 'ch_PP-OCRv4_rec_infer.onnx'),
        'EngineConfig.onnxruntime.intra_op_num_threads': 2,
        'EngineConfig.onnxruntime.inter_op_num_threads': 1,
    })


def preflight(job):
    """Exercise the required graphs before a batch, without opening user media."""
    check(job)
    image = np.full((128, 512, 3), 220, np.uint8)
    cv2.putText(image, 'TEST 123', (25, 78), cv2.FONT_HERSHEY_SIMPLEX, 1.4, (20, 20, 20), 3)
    if job.get('needsDetection'):
        detector = create_detector(job)
        result = detector(image, use_cls=False, use_rec=True)
        if result.boxes is None or not len(result.boxes):
            raise RuntimeError('OCR_PREFLIGHT：识别组件自检未通过，尚未开始处理视频')
        del detector
        check(job)
    if job.get('needsAi'):
        mask = np.zeros(image.shape[:2], np.uint8)
        mask[30:90, 30:260] = 255
        output = Repair(dict(job, settings={'Quality': 'ai'}))(image, mask)
        if output.shape != image.shape or not np.any(output[mask > 0] != image[mask > 0]):
            raise RuntimeError('AI_PREFLIGHT：修复组件自检未通过，尚未开始处理视频')
        check(job)
    emit(status='视频处理组件检查通过', preflight=True)


def detect(job):
    detector = create_detector(job)
    original_w, original_h = job['width'], job['height']
    factor = min(1, 1280 / max(original_w, original_h))
    j = dict(job, width=max(2, round(original_w * factor / 2) * 2), height=max(2, round(original_h * factor / 2) * 2))
    w, h = j['width'], j['height']
    p = reader(j, 0, job['duration'], 4)
    samples, index = [], 0
    try:
        while True:
            check(job)
            frame = readframe(p.stdout, w, h)
            if frame is None:
                break
            result = detector(frame, use_cls=False, use_rec=True)
            words=[]
            if result.boxes is not None:
                for b,text,score in zip(result.boxes,result.txts,result.scores):
                    x1, y1 = np.min(b, axis=0); x2, y2 = np.max(b, axis=0)
                    words.append(dict(box=[float(x1),float(y1),float(x2),float(y2)],text=str(text),score=float(score),
                                      slope=float(abs(b[1][1]-b[0][1])/max(1,y2-y1))))
            samples.append(dict(words=words))
            index += 1
            if index % 4 == 0:
                emit(progress=min(.99, index/4/job['duration']), status='正在定位水印与字幕')
        if p.wait() != 0 or not index:
            raise RuntimeError('无法读取视频进行检测')
        boxes,smart=select_regions(samples,w,h,job['duration'])
        Path(job['result']).write_text(json.dumps(boxes), encoding='utf-8')
        Path(job['result']+'.count').write_text(str(len(boxes)), encoding='ascii')
        emit(progress=1, status=f'检测完成：{len(boxes)} 段'+('水印/字幕区域' if smart else '文字区域'))
    finally:
        kill(p)


def mask_for(regions, w, h, t, protect=False):
    mask = np.zeros((h, w), np.uint8)
    for r in regions:
        if r.get('enabled', True) and bool(r.get('protect', False)) == protect and r.get('start', 0) <= t < r.get('end', 1e10):
            x1 = max(0, min(w, round(r['x']*w))); y1 = max(0, min(h, round(r['y']*h)))
            x2 = max(x1, min(w, round((r['x']+r['w'])*w))); y2 = max(y1, min(h, round((r['y']+r['h'])*h)))
            mask[y1:y2, x1:x2] = 255
    return mask


class Repair:
    def __init__(self, job):
        self.session = None
        if job['settings']['Quality'] == 'ai':
            import onnxruntime as ort
            options = ort.SessionOptions(); options.intra_op_num_threads = min(8,max(1,(os.cpu_count() or 2)//2)); options.inter_op_num_threads = 1
            self.session = ort.InferenceSession(str(Path(job['component'])/'models/lama_fp32.onnx'), options, providers=['CPUExecutionProvider'])

    def __call__(self, frame, mask):
        if not np.any(mask):
            return frame
        if self.session is None:
            return cv2.inpaint(frame, mask, 3, cv2.INPAINT_TELEA)
        # Repair individual connected regions with their surrounding context. Only
        # masked pixels are replaced, so protected text and source detail survive.
        result = frame.copy()
        count, labels, stats, _ = cv2.connectedComponentsWithStats(mask)
        for label in range(1, count):
            x, y, w, h, area = stats[label]
            margin = max(64, round(max(w, h)*.5))
            x1, y1 = max(0,x-margin), max(0,y-margin)
            x2, y2 = min(frame.shape[1],x+w+margin), min(frame.shape[0],y+h+margin)
            crop = frame[y1:y2,x1:x2]
            local = ((labels[y1:y2,x1:x2] == label)*255).astype(np.uint8)
            ch, cw = crop.shape[:2]; scale = min(512/cw,512/ch)
            sw, sh = max(1,round(cw*scale)), max(1,round(ch*scale))
            rgb = cv2.cvtColor(cv2.resize(crop,(sw,sh)),cv2.COLOR_BGR2RGB)
            rgb = cv2.copyMakeBorder(rgb,0,512-sh,0,512-sw,cv2.BORDER_REFLECT_101)
            m = cv2.resize(local,(sw,sh),interpolation=cv2.INTER_NEAREST)
            m = cv2.copyMakeBorder(m,0,512-sh,0,512-sw,cv2.BORDER_CONSTANT)
            values = {'image':rgb.transpose(2,0,1)[None].astype(np.float32)/255, 'mask':(m[None,None]>0).astype(np.float32)}
            output = self.session.run(None,values)[0][0].transpose(1,2,0)[:sh,:sw]
            # This pinned Carve FP32 graph returns RGB values in [0,255].
            output = cv2.cvtColor(np.clip(output,0,255).astype(np.uint8),cv2.COLOR_RGB2BGR)
            output = cv2.resize(output,(cw,ch))
            target = result[y1:y2,x1:x2]
            target[local>0] = output[local>0]
        return result


def stamp(job):
    s = job['settings']; width = job['width']; height = job['height']
    if s['Kind'] == 'image':
        image = Image.open(s['ImagePath']).convert('RGBA')
        iw = max(2,round(width*s['Size']))
        image.thumbnail((iw, max(2, round(height*.9))), Image.Resampling.LANCZOS)
        # thumbnail never enlarges; preserve intentional requested scale.
        iw = min(iw, round(height*.9*image.width/image.height))
        image = image.resize((max(2,iw),max(2,round(iw*image.height/image.width))),Image.Resampling.LANCZOS)
    else:
        font = ImageFont.truetype(job['font'], max(8,round(s['FontSize']*width/1080)))
        stroke = max(1,round(width/1080))
        bbox = font.getbbox(s['Text'],stroke_width=stroke)
        image = Image.new('RGBA',(max(1,bbox[2]-bbox[0]+8),max(1,bbox[3]-bbox[1]+8)))
        ImageDraw.Draw(image).text((4-bbox[0],4-bbox[1]),s['Text'],font=font,fill=s['Color'],stroke_width=stroke,stroke_fill='#242a35')
        image.thumbnail((max(2,round(width*.95)),max(2,round(height*.9))),Image.Resampling.LANCZOS)
    array = np.asarray(image).copy()
    array[:,:,3] = np.round(array[:,:,3]*s['Opacity']).astype(np.uint8)
    return array


def add_stamp(frame, overlay, s, t):
    if t < s['Start'] or (s['End'] > 0 and t >= s['End']):
        return frame
    ih, iw = overlay.shape[:2]; h,w = frame.shape[:2]
    x = min(w-iw,max(0,round(s['X']*w))); y = min(h-ih,max(0,round(s['Y']*h)))
    alpha = overlay[:,:,3:4].astype(np.float32)/255
    frame[y:y+ih,x:x+iw] = np.round(overlay[:,:,:3][:,:,::-1]*alpha+frame[y:y+ih,x:x+iw]*(1-alpha)).astype(np.uint8)
    return frame


def render(job):
    s = job['settings']; w,h = job['width'],job['height']; fps=job['fps']
    start=job.get('start',0); length=job.get('length',job['duration']); length=min(length,job['duration']-start)
    regions=list(s['Regions'])
    if s['Method']=='auto' and s.get('AutoEnabled',True) and job.get('detections'):
        regions += json.loads(Path(job['detections']).read_text(encoding='utf-8-sig'))
    # Index detected boxes by their short active intervals, avoiding scans of an
    # entire long-video detection list on every rendered frame.
    manual=list(s['Regions']); dynamic={}
    for r in regions[len(manual):]:
        for tick in range(int(r['start']*4),int(r['end']*4)+1):
            dynamic.setdefault(tick,[]).append(r)
    remover = Repair(job) if s['Mode']!='add' and regions else None
    overlay = stamp(job) if s['Mode']!='remove' else None
    decoder=encoder=None
    tmp=job['output']+'.partial.mp4'
    error_path=tmp+'.log'
    try:
        decoder=reader(job,start,length)
        args=[job['ffmpeg'],'-nostdin','-hide_banner','-loglevel','error','-y',
              '-f','rawvideo','-pix_fmt','bgr24','-s',f'{w}x{h}','-r',str(fps),'-i','pipe:0',
              '-ss',str(start),'-i',job['input'],'-map','0:v:0','-map','1:a:0?',
              '-c:v','libx264','-preset','fast','-crf','19','-threads','2','-pix_fmt','yuv420p',
              '-c:a','aac','-b:a','192k','-af','asetpts=PTS-STARTPTS',
              '-t',str(length),'-map_metadata','-1','-metadata:s:v:0','rotate=0','-movflags','+faststart',tmp]
        with open(error_path,'wb') as err:
            encoder=proc(args,stdin=subprocess.PIPE,stdout=subprocess.DEVNULL,stderr=err)
            index=0
            while True:
                check(job)
                frame=readframe(decoder.stdout,w,h)
                if frame is None: break
                t=start+index/fps
                if remover is not None:
                    active=manual+dynamic.get(int(t*4),[])
                    mask=mask_for(active,w,h,t)
                    mask[mask_for(manual,w,h,t,True)>0]=0
                    frame=remover(frame,mask)
                if overlay is not None: frame=add_stamp(frame,overlay,s,t)
                encoder.stdin.write(frame.tobytes());index+=1
                if index==1 or index % max(1,round(fps/2))==0:
                    emit(progress=min(.99,index/fps/length),status='正在修复并合成' if remover else '正在合成水印')
            encoder.stdin.close()
            while encoder.poll() is None:
                check(job);time.sleep(.1)
            if decoder.wait()!=0 or encoder.returncode!=0 or index==0:
                raise RuntimeError(Path(error_path).read_text(encoding='utf-8',errors='replace')[-2500:] or '视频解码失败')
        check(job)
        if Path(job['output']).exists(): raise RuntimeError('目标文件已存在，拒绝覆盖')
        os.rename(tmp,job['output'])
        emit(progress=1,status='处理完成',frames=index)
    finally:
        kill(decoder);kill(encoder)
        Path(tmp).unlink(missing_ok=True)
        Path(error_path).unlink(missing_ok=True)


def main():
    global np,cv2,Image,ImageDraw,ImageFont
    sys.dont_write_bytecode=True
    sys.path.insert(0,str(Path(__file__).resolve().parent))
    job=json.loads(Path(sys.argv[1]).read_text(encoding='utf-8-sig'))
    check(job)
    sys.path.insert(0,str(Path(job['component'])/'lib'))
    import ort_compat
    delegated=ort_compat.bootstrap(job,sys.argv[1],__file__,emit,lambda:check(job))
    if delegated is not None:
        sys.exit(delegated)
    import numpy as np
    import cv2
    from PIL import Image,ImageDraw,ImageFont
    cv2.setNumThreads(2)
    if job['action']=='detect': detect(job)
    elif job['action']=='render': render(job)
    elif job['action']=='preflight': preflight(job)
    else: raise ValueError('未知处理操作')


if __name__=='__main__':
    try: main()
    except Cancelled:
        emit(error='任务已取消');sys.exit(2)
    except Exception as exc:
        emit(error=str(exc));traceback.print_exc(file=sys.stderr);sys.exit(1)
