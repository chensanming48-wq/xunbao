"""Shared, local-only face masking. Models/components are acquired by the native host.
Detection caches are independent of the selected artwork; source audio is stream-copied.
"""
import sys, os, json, math, time, hashlib, subprocess, threading, traceback
from pathlib import Path
# Windows embedded Python ignores the script directory when its ._pth is active.
# Bootstrap shared helpers before importing them, including native-host launches.
sys.path.insert(0,str(Path(__file__).resolve().parent))
from tracking_guard import POLICY, check_gap, protected_box

def emit(**value):
    print(json.dumps(value, ensure_ascii=True), flush=True)

def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True).encode()).hexdigest()

def save(path, value):
    temp = str(path) + '.new'
    Path(temp).write_text(json.dumps(value, separators=(',', ':')), encoding='utf8')
    os.replace(temp, path)

def fingerprint(path):
    p = Path(path).resolve(); s = p.stat()
    return [str(p).lower(), s.st_size, s.st_mtime_ns]

def file_hash(path, job):
    value=hashlib.sha256()
    with open(path,'rb') as stream:
        while True:
            check(job);chunk=stream.read(1024*1024)
            if not chunk:break
            value.update(chunk)
    return value.hexdigest()

def cached_json(path):
    try:
        value=json.loads(Path(path).read_text('utf8'))
        return value if isinstance(value,dict) else None
    except (FileNotFoundError,ValueError,UnicodeError):return None

def check(job):
    if Path(job['cancel']).exists():
        raise InterruptedError('任务已取消')
    if job.get('managedCacheRoot') and time.monotonic()-job.get('_budgetChecked',-10)>1:
        from cache_budget import check_budget
        check_budget(job['managedCacheRoot'],job['cacheLimitBytes'])
        job['_budgetChecked']=time.monotonic()

def process(args, **kwargs):
    return subprocess.Popen(args, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0), **kwargs)

def stop(p):
    if p and p.poll() is None:
        p.kill(); p.wait()
    if p:
        for stream in (p.stdin,p.stdout,p.stderr):
            if stream and not stream.closed:
                try:stream.close()
                except OSError:pass

def frame(pipe, width, height):
    size = width * height * 3
    data = pipe.read(size)
    if not data: return None
    if len(data) != size: raise RuntimeError('视频解码输出不完整')
    return np.frombuffer(data, np.uint8).reshape(height, width, 3).copy()

class YuNet:
    def __init__(self, model):
        self.cpu_net = None
        try:
            self._init_ort(model)
        except Exception:
            # ORT's CPU provider still needs the same native DLL to import.
            # OpenCV is already loaded by this worker and can run the same model
            # without that DLL. Never treat a failed detector as an empty frame.
            try:
                # OpenCV's Windows filename overload cannot read all Unicode paths.
                self.cpu_net = cv.dnn.readNetFromONNX(np.fromfile(model, dtype=np.uint8))
                self.cpu_net.setPreferableBackend(cv.dnn.DNN_BACKEND_OPENCV)
                self.cpu_net.setPreferableTarget(cv.dnn.DNN_TARGET_CPU)
                self.provider = 'OpenCVExecutionProvider'
            except Exception as ex:
                raise RuntimeError('人脸识别组件加载失败：ONNX Runtime 与 OpenCV CPU 均不可用，请检查运行组件和模型完整性') from ex
            emit(phase='人脸识别已切换至 OpenCV CPU 兼容模式', provider=self.provider)

    def _init_ort(self, model):
        import onnxruntime as ort
        options = ort.SessionOptions(); options.intra_op_num_threads = 2
        options.enable_mem_pattern = False
        providers = ['DmlExecutionProvider', 'CPUExecutionProvider'] if 'DmlExecutionProvider' in ort.get_available_providers() else ['CPUExecutionProvider']
        try: self.session = ort.InferenceSession(model, sess_options=options, providers=providers)
        except Exception:
            self.session = ort.InferenceSession(model, sess_options=options, providers=['CPUExecutionProvider'])
        self.provider = self.session.get_providers()[0]
    def detect(self, image, confidence):
        h,w = image.shape[:2]; pw = ph = 640
        padded = cv.copyMakeBorder(image,0,ph-h,0,pw-w,cv.BORDER_CONSTANT)
        tensor = padded.transpose(2,0,1)[None].astype(np.float32)
        if self.cpu_net is not None:
            self.cpu_net.setInput(tensor)
            names = self.cpu_net.getUnconnectedOutLayersNames()
            by_name = dict(zip(names, self.cpu_net.forward(names)))
        else:
            output = self.session.run(None,{self.session.get_inputs()[0].name:tensor})
            by_name = {x.name:y for x,y in zip(self.session.get_outputs(), output)}
        boxes=[]; scores=[]
        for stride in (8,16,32):
            cls=by_name['cls_'+str(stride)].reshape(-1); obj=by_name['obj_'+str(stride)].reshape(-1)
            bbox=by_name['bbox_'+str(stride)].reshape(-1,4)
            score=np.sqrt(np.clip(cls,0,1)*np.clip(obj,0,1))
            for i in np.flatnonzero(score >= confidence):
                cx=(i%(pw//stride)+bbox[i,0])*stride; cy=(i//(pw//stride)+bbox[i,1])*stride
                bw=math.exp(min(10,float(bbox[i,2])))*stride; bh=math.exp(min(10,float(bbox[i,3])))*stride
                boxes.append([float(cx-bw/2),float(cy-bh/2),float(bw),float(bh)]); scores.append(float(score[i]))
        indices=cv.dnn.NMSBoxes(boxes,scores,confidence,.3)
        return [boxes[int(i)] for i in np.asarray(indices).reshape(-1)] if len(indices) else []

def iou(a,b):
    l=max(a[0],b[0]); t=max(a[1],b[1]); r=min(a[0]+a[2],b[0]+b[2]); bot=min(a[1]+a[3],b[1]+b[3])
    area=max(0,r-l)*max(0,bot-t)
    return area/max(1,a[2]*a[3]+b[2]*b[3]-area)

class Track:
    def __init__(self, ident, box, now):
        self.id=ident; self.last=now; self.box=np.array(box,np.float32); self.lost=False
        self.kalman=cv.KalmanFilter(8,4)
        self.kalman.measurementMatrix=np.eye(4,8,dtype=np.float32)
        self.kalman.processNoiseCov=np.eye(8,dtype=np.float32)*.08
        self.kalman.measurementNoiseCov=np.eye(4,dtype=np.float32)*.5
        self.kalman.errorCovPost=np.eye(8,dtype=np.float32)
        self.kalman.statePost=np.array(list(box)+[0]*4,np.float32).reshape(8,1)
    def predict(self, dt):
        self.kalman.transitionMatrix=np.eye(8,dtype=np.float32)
        for i in range(4): self.kalman.transitionMatrix[i,i+4]=dt
        return self.kalman.predict()[:4,0]
    def update(self, box, now):
        corrected=self.kalman.correct(np.array(box,np.float32).reshape(4,1))[:4,0]
        self.box=.65*np.array(box,np.float32)+.35*corrected
        self.last=now; self.lost=False

def detect(job, cache, meta):
    w,h=meta['width'],meta['height']; scale=min(1,640/max(w,h)); dw=max(2,round(w*scale)//2*2); dh=max(2,round(h*scale)//2*2)
    fps=meta['fps']; step=1; options=job['options']; net=YuNet(job['model'])
    args=[job['ffmpeg'],'-v','error','-nostdin','-threads','2','-i',job['input'],*(['-t',str(meta['duration'])] if job.get('preview') else []),'-an','-sn','-vf',meta.get('normalize','null')+f',scale={dw}:{dh},setsar=1,fps={fps}', '-threads','2','-f','rawvideo','-pix_fmt','bgr24','pipe:1']
    p=process(args,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL)
    tracks=[]; ident=0; frames=[]; previous=None; lost=0; covered=0; guarded=0; cuts=0; shot_start=0; started=time.monotonic()
    try:
        n=0
        while True:
            check(job); img=frame(p.stdout,dw,dh)
            if img is None: break
            now=n/fps; gray=cv.resize(cv.cvtColor(img,cv.COLOR_BGR2GRAY),(64,36))
            cut=previous is not None and float(np.mean(cv.absdiff(gray,previous)))>42
            previous=gray
            if cut: tracks=[]; cuts+=1;shot_start=n
            predicted={t.id:t.predict(1/fps) for t in tracks}
            if n%step==0 or cut:
                boxes=[b for b in net.detect(img,options['confidence']) if b[3]/dh>=options['minFace']]
                pairs=sorted([(iou(predicted[t.id],b),ti,bi) for ti,t in enumerate(tracks) for bi,b in enumerate(boxes)], reverse=True)
                used_t=set(); used_b=set()
                for score,ti,bi in pairs:
                    if score<.12: break
                    if ti in used_t or bi in used_b: continue
                    tracks[ti].update(boxes[bi],now);used_t.add(ti);used_b.add(bi)
                for ti,t in enumerate(tracks):
                    if ti not in used_t and not t.lost: t.lost=True;lost+=1
                for bi,b in enumerate(boxes):
                    if bi not in used_b:
                        ident+=1; tracks.append(Track(ident,b,now))
                        # Offline processing can backfill the interval before the
                        # first detection; newly entering faces must not remain
                        # exposed for the two intervening 30fps frames.
                        for previous_frame in range(max(shot_start,n-step+1),n):
                            if not frames[previous_frame]:covered+=1
                            frames[previous_frame].append([ident,float(b[0]/dw),float(b[1]/dh),float(b[2]/dw),float(b[3]/dh),1.0])
            shown=[]
            for t in tracks:
                age=now-t.last
                b=t.box if age<1/fps else predicted.get(t.id,t.box)
                if t.lost:
                    b=protected_box(t.box,b,age)
                shown.append([t.id,float(b[0]/dw),float(b[1]/dh),float(b[2]/dw),float(b[3]/dh),1.0,t.lost])
            if not shown or any(t.lost for t in tracks):
                shown=[[-1,0.,0.,1.,1.,1.,True,True]]
                guarded+=1
            frames.append(shown);covered+=bool(shown);n+=1
            if n%step==0: emit(phase='检测人脸',progress=min(.99,now/meta['duration']),provider=net.provider)
        if p.wait()!=0: raise RuntimeError('人脸检测时视频解码失败')
        if not frames: raise RuntimeError('素材没有可解码视频帧')
        data={'version':POLICY,'meta':meta,'frames':frames,'stats':{'tracks':ident,'coveredFrames':covered,'frames':len(frames),'coverage':covered/len(frames),'trackingLosses':lost,'conservativeFrames':guarded,'sceneCuts':cuts,'provider':net.provider,'seconds':time.monotonic()-started}}
        check(job); save(cache,data); return data
    finally: stop(p)

def strong_blur(roi):
    # Work at a bounded size: large faces otherwise make per-frame Gaussian
    # convolution dominate the entire export without improving privacy.
    h,w=roi.shape[:2];scale=min(1,48/max(w,h))
    small=cv.resize(roi,(max(1,round(w*scale)),max(1,round(h*scale))),interpolation=cv.INTER_AREA)
    blurred=cv.GaussianBlur(small,(0,0),max(2,small.shape[1]/4))
    return cv.resize(blurred,(w,h),interpolation=cv.INTER_LINEAR)

def privacy_blur(roi, alpha):
    rh,rw=roi.shape[:2];effect=strong_blur(roi);mask=np.zeros((rh,rw),np.uint8)
    cv.ellipse(mask,(rw//2,rh//2),(max(1,rw//2),max(1,rh//2)),0,0,360,255,-1)
    mask=cv.GaussianBlur(mask,(0,0),max(1,min(rw,rh)*.025)).astype(np.float32)[:,:,None]/255*alpha
    roi[:]=np.uint8(effect*mask+roi*(1-mask))

def paint_guard_box(img, box):
    """Opaque rectangular cover for uncertain positions; no feathered/fading edge."""
    h,w=img.shape[:2];x,y,bw,bh=box
    l=max(0,int(math.floor(x*w)));t=max(0,int(math.floor(y*h)))
    r=min(w,int(math.ceil((x+bw)*w)));b=min(h,int(math.ceil((y+bh)*h)))
    if r<=l or b<=t:return
    roi=img[t:b,l:r]
    small=cv.resize(roi,(min(6,r-l),min(6,b-t)),interpolation=cv.INTER_AREA)
    roi[:]=cv.resize(small,(r-l,b-t),interpolation=cv.INTER_NEAREST)


def paint(img, row, options, avatars, boxes=False):
    h,w=img.shape[:2]
    if not row or any(len(face)>7 and face[7] for face in row):
        img[:]=32
        return
    for face in row:
        ident,x,y,bw,bh,alpha=face[:6]
        if len(face)>6 and face[6]:
            paint_guard_box(img,[x,y,bw,bh])
            continue
        expand=options['expansion']; l=max(0,int((x-bw*expand)*w));t=max(0,int((y-bh*expand)*h));r=min(w,int((x+bw*(1+expand))*w));b=min(h,int((y+bh*(1+expand))*h))
        if r<=l or b<=t: continue
        roi=img[t:b,l:r]; rw=r-l;rh=b-t
        if options['style']=='avatar':
            avatar=avatars[(ident-1)%len(avatars)]
            # A strong blur underlay also covers transparent holes/custom shapes.
            privacy_blur(roi,alpha)
            ah,aw=avatar.shape[:2]; k=max(rw/aw,rh/ah);sw=max(1,round(aw*k));sh=max(1,round(ah*k))
            art=cv.resize(avatar,(sw,sh),interpolation=cv.INTER_AREA)
            al=int((l+r-sw)/2);at=int((t+b-sh)/2);ax=max(0,al);ay=max(0,at);ar=min(w,al+sw);ab=min(h,at+sh)
            if ar>ax and ab>ay:
                art=art[ay-at:ab-at,ax-al:ar-al]; mask=art[:,:,3:4].astype(np.float32)/255*alpha
                img[ay:ab,ax:ar]=np.uint8(art[:,:,:3]*mask+img[ay:ab,ax:ar]*(1-mask))
        elif options['style']=='pixel':
            block=max(8,rw//10);small=cv.resize(roi,(max(1,rw//block),max(1,rh//block)),interpolation=cv.INTER_AREA)
            effect=cv.resize(small,(rw,rh),interpolation=cv.INTER_NEAREST);roi[:]=np.uint8(roi*(1-alpha)+effect*alpha)
        else:
            privacy_blur(roi,alpha)
        if boxes: cv.rectangle(img,(l,t),(r,b),(70,230,80),max(1,w//480))

def render(job, data, target, length):
    meta=data['meta'];w,h=meta['width'],meta['height'];fps=meta['fps']; options=job['options']; avatars=[]
    dynamic = options['style']=='avatar'
    renderer = None
    if dynamic:
        import dynamic_avatar
        renderer = dynamic_avatar.Renderer(job)
    for path in job.get('avatars',[]):
        a=cv.imdecode(np.fromfile(path,np.uint8),cv.IMREAD_UNCHANGED)
        if a is None or a.ndim!=3 or a.shape[2]!=4: raise ValueError('头像必须是透明PNG')
        avatars.append(a)
    if options['style']=='avatar' and not avatars: raise ValueError('请至少选择一个头像')
    reader=None;writer=None;temp=str(target)+'.partial.mp4';errors=str(target)+'.ffmpeg.log'
    try:
        reader=process([job['ffmpeg'],'-v','error','-nostdin','-threads','2','-i',job['input'],'-an','-sn','-vf',meta.get('normalize',f'scale={w}:{h},setsar=1')+f',fps={fps}','-threads','2','-f','rawvideo','-pix_fmt','bgr24','pipe:1'],stdout=subprocess.PIPE,stderr=subprocess.DEVNULL)
        with open(errors,'wb') as err:
            writer=process([job['ffmpeg'],'-v','error','-nostdin','-y','-f','rawvideo','-pixel_format','bgr24','-video_size',f'{w}x{h}','-framerate',str(fps),'-i','pipe:0','-i',job['input'],'-map','0:v:0','-map','1:a?','-map_metadata','-1','-c:v','libx264','-crf','14','-preset','veryfast','-threads','2','-pix_fmt','yuv420p','-c:a','copy',*(['-t',str(length)] if job.get('preview') else []),'-movflags','+faststart',temp],stdin=subprocess.PIPE,stdout=subprocess.DEVNULL,stderr=err)
            total=min(data['stats']['frames'] if dynamic else len(data['frames']),math.ceil(length*fps));n=0
            mesh_rows = iter(dynamic_avatar.rows(data)) if dynamic else None
            for n in range(total):
                check(job);img=frame(reader.stdout,w,h)
                if img is None: raise RuntimeError('遮挡渲染源视频提前结束')
                if dynamic:
                    try: row=next(mesh_rows)
                    except StopIteration: raise RuntimeError('动态头像轨迹缓存提前结束')
                    renderer.paint(img,row,sys.modules[__name__])
                else: paint(img,data['frames'][n],options,avatars,job.get('boxes',False))
                writer.stdin.write(img.tobytes())
                if n%max(1,round(fps/5))==0:emit(phase='生成遮挡副本',progress=n/total)
            writer.stdin.close()
            while writer.poll() is None: check(job);time.sleep(.05)
            if writer.returncode: raise RuntimeError(Path(errors).read_text('utf8',errors='replace')[-1500:])
        check(job);os.replace(temp,target)
    except BrokenPipeError as ex:
        stop(writer)
        details=Path(errors).read_text('utf8',errors='replace')[-1500:] if Path(errors).exists() else str(ex)
        raise RuntimeError('遮挡视频编码失败：'+details) from ex
    finally:
        stop(reader);stop(writer)
        if Path(temp).exists(): Path(temp).unlink()

def run(job):
    timing_started=time.monotonic()
    check(job)
    dynamic = job['options']['style']=='avatar'
    if dynamic:
        import dynamic_component
        component=dynamic_component.ensure(job['dynamicRoot'],lambda:check(job),emit,job.get('dynamicStageRoot'))
        job['dynamicModel']=str(component/'face_landmarker.task')
        if job.get('prepareOnly'):
            save(job['result'],{'ready':True});return
    source=fingerprint(job['input']);root=Path(job['cache']);root.mkdir(parents=True,exist_ok=True)
    probe=subprocess.check_output([job['ffprobe'],'-v','error','-show_streams','-show_format','-of','json',job['input']],creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0),timeout=30)
    info=json.loads(probe);v=next(s for s in info['streams'] if s['codec_type']=='video')
    num,den=map(float,v.get('avg_frame_rate','0/1').split('/'));fps=num/den if den else 0
    if not 1<=fps<=120: raise ValueError('不支持此素材帧率')
    w,h=v['width'],v['height'];rotation=float(v.get('tags',{}).get('rotate',0))
    sar=v.get('sample_aspect_ratio','1:1')
    try:
        a,b=map(float,sar.split(':'));sar=a/b
        if not math.isfinite(sar) or sar<=0:sar=1
    except (ValueError,ZeroDivisionError,AttributeError):sar=1
    w=max(2,round(w*sar))
    for sd in v.get('side_data_list',[]): rotation=sd.get('rotation',rotation)
    if round(abs(rotation)/90)%2:w,h=h,w
    ew,eh=w+w%2,h+h%2
    meta={'width':ew,'height':eh,'normalize':f'scale={w}:{h},setsar=1,pad={ew}:{eh}:0:0','fps':fps,'duration':float(v.get('duration',info['format'].get('duration',0)))}
    if meta['duration']<=0:raise ValueError('素材时长无效')
    o=job['options']
    if o['style'] not in ('blur','pixel','avatar') or not .4<=o['confidence']<=.9 or not 0<=o['expansion']<=.6 or not 0<=o['minFace']<=.2:raise ValueError('遮挡参数无效')
    length=meta['duration']
    if job.get('preview'):
        requested=float(job.get('previewSeconds',5))
        if not math.isfinite(requested) or not 0<requested<=120:raise ValueError('预览时长无效')
        length=min(requested,length)
    key=digest([POLICY,'mesh-identity-v2' if dynamic else 3,source,fingerprint(job['dynamicModel'] if dynamic else job['model']),o['confidence'],o['minFace'],len(job.get('avatars',[]))>1 if dynamic else False]);faces=root/(key+'.faces.json')
    if job.get('preview') and not faces.exists():
        # Include the next detection interval: tracking backfills newly seen faces.
        # Prefix caches must never be accepted as whole-video detection results.
        detection_length=min(meta['duration'],length+(max(1,round(fps/10))+1)/fps)
        if detection_length<meta['duration']:
            key=digest(['preview-prefix-v1',key,detection_length])
            faces=root/(key+'.faces.json');meta={**meta,'duration':detection_length}
    setup_seconds=time.monotonic()-timing_started;stage_started=time.monotonic()
    data=cached_json(faces)
    if data is not None and (data.get('integrity')!=digest({k:v for k,v in data.items() if k!='integrity'}) or data.get('version')!=POLICY):data=None
    detection_hit=data is not None
    if dynamic:
        import dynamic_avatar
        expected_mesh=Path(str(faces)+'.jsonl')
        if data and (data.get('meshPath')!=str(expected_mesh) or not expected_mesh.is_file() or expected_mesh.stat().st_size!=data.get('meshBytes') or data.get('meshSha256')!=file_hash(expected_mesh,job)):
            detection_hit=False;data=None
        if data is None:data=dynamic_avatar.detect(job,faces,meta,sys.modules[__name__])
    elif data is None:data=detect(job,faces,meta)
    if not detection_hit:
        if dynamic:
            data['stats']['fullFrameProtectedFrames']=sum(not row or any(f.get('solid') for f in row) for row in dynamic_avatar.rows(data))
        else:
            data['stats']['fullFrameProtectedFrames']=sum(not row or any(len(f)>7 and f[7] for f in row) for row in data['frames'])
        if dynamic:data['meshSha256']=file_hash(data['meshPath'],job)
        data['integrity']=digest(data);save(faces,data)
    detection_seconds=time.monotonic()-stage_started;stage_started=time.monotonic()
    render_key=digest([POLICY,'mesh-render-v3' if dynamic else (4 if o['style']=='avatar' else 3),key,o,[fingerprint(p) for p in job.get('avatars',[])],length,job.get('boxes',False)])
    target=root/(render_key+'.mp4');record=root/(render_key+'.result.json')
    hit=target.exists() and record.exists()
    if hit:
        old=cached_json(record);hit=bool(old and old.get('bytes')==target.stat().st_size and old.get('sha256')==file_hash(target,job))
    if not hit: render(job,data,target,length)
    if fingerprint(job['input'])!=source:raise RuntimeError('处理期间素材发生变化，请重新添加')
    protected=data['stats'].get('fullFrameProtectedFrames',0)
    review=('本次预览范围内' if job.get('preview') else '全程')+'未检测到人脸：已使用整帧保护画面，请复核原素材与识别设置。' if data['stats']['tracks']==0 else (f'有 {protected} 帧无法确认人脸位置，已使用整帧保护画面，请复核成片。' if protected else '')
    render_seconds=time.monotonic()-stage_started;stage_started=time.monotonic()
    output_hash=file_hash(target,job);hash_seconds=time.monotonic()-stage_started
    result={'maskedPath':str(target),'facesJsonPath':str(faces),'stats':data['stats'],'needsReview':bool(review),'reviewMessage':review,'detectionCacheHit':detection_hit,'renderCacheHit':hit,'bytes':target.stat().st_size,'duration':length,'sha256':output_hash,'timings':{'setupSeconds':setup_seconds,'detectionSeconds':detection_seconds,'renderSeconds':render_seconds,'hashSeconds':hash_seconds,'workerSeconds':time.monotonic()-timing_started}}
    save(record,result);save(job['result'],result);emit(phase='遮挡完成',progress=1)

if __name__=='__main__':
    sys.dont_write_bytecode=True
    sys.path.insert(0,str(Path(__file__).resolve().parent))
    job=json.loads(Path(sys.argv[1]).read_text('utf-8-sig'))
    sys.path.insert(0,job['library'])
    import numpy as np
    import cv2 as cv
    cv.setNumThreads(2)
    try:run(job)
    except Exception as ex:
        emit(error=str(ex));traceback.print_exc(file=sys.stderr);sys.exit(2)
