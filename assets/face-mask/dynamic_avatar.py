"""MediaPipe video tracking and automatically aligned, expression-driven 2D avatar meshes.

No neural image generation: only landmark inference, temporal tracking and image warp.
"""
from collections import deque
import json
import math
import os
from pathlib import Path
import time

import cv2 as cv
import numpy as np
from tracking_guard import POLICY

# Face oval, brows, eyes, outer/inner lips and nose. Preserve landmark identities.
OVAL = [10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109]
EYES = [33,7,163,144,145,153,154,155,133,173,157,158,159,160,161,246,263,249,390,373,374,380,381,382,362,398,384,385,386,387,388,466]
LIPS = [61,146,91,181,84,17,314,405,321,375,291,409,270,269,267,0,37,39,40,185,78,95,88,178,87,14,317,402,318,324,308,415,310,311,312,13,82,81,80,191]
BROWS = [70,63,105,66,107,55,65,52,53,46,300,293,334,296,336,285,295,282,283,276]
IDS = sorted(set(OVAL + EYES + LIPS + BROWS + [1,2,4,5,6,19,94,98,168,195,197,327]))
INDEX = {n:i for i,n in enumerate(IDS)}
BOUNDARY = np.array([[0,0],[.5,0],[1,0],[1,.5],[1,1],[.5,1],[0,1],[0,.5]], np.float32)
MOUTH_TOP = [78,191,80,81,82,13,312,311,310,415,308]
MOUTH_BOTTOM = [78,95,88,178,87,14,317,402,318,324,308]


def paint_mouth(canvas, points):
    """Draw a local cartoon mouth interior inside the tracked inner lip contour.

    The layer is procedural (no model/download), follows head rotation, and never
    changes the avatar alpha or paints over the surrounding lips/background.
    """
    top=points[[INDEX[i] for i in MOUTH_TOP]]
    bottom=points[[INDEX[i] for i in MOUTH_BOTTOM]]
    axis=top[-1]-top[0];width=float(np.linalg.norm(axis))
    if not np.isfinite(width) or width<6:return
    horizontal=axis/width;vertical=np.array([-horizontal[1],horizontal[0]])
    gap=float(np.dot(points[INDEX[14]]-points[INDEX[13]],vertical))
    ratio=gap/width
    if not .025<ratio<1.2:return
    # Continuous activation prevents a white flash when closed lips jitter apart.
    activation=float(np.clip((ratio-.025)/.065,0,1))
    activation=activation*activation*(3-2*activation)
    ring=np.r_[top,bottom[-2:0:-1]]
    if not np.isfinite(ring).all():return
    h,w=canvas.shape[:2]
    x,y,rw,rh=cv.boundingRect(np.float32(ring))
    l,t=max(0,x-1),max(0,y-1);r,b=min(w,x+rw+1),min(h,y+rh+1)
    if r<=l or b<=t:return
    mask=np.zeros((b-t,r-l),np.uint8)
    cv.fillPoly(mask,[np.int32(np.round((ring-[l,t])*16))],255,lineType=cv.LINE_AA,shift=4)
    yy,xx=np.mgrid[t:b,l:r].astype(np.float32)
    dx=xx-top[0,0];dy=yy-top[0,1]
    u=(dx*horizontal[0]+dy*horizontal[1])/width
    v=dx*vertical[0]+dy*vertical[1]
    def curve(vertices):
        relative=vertices-top[0]
        xs=relative@horizontal/width;ys=relative@vertical
        xs,indices=np.unique(xs,return_index=True)
        return np.interp(u,xs,ys[indices]).astype(np.float32)
    upper=curve(top);lower=curve(bottom);opening=np.maximum(lower-upper,.1)
    depth=np.clip((v-upper)/opening,0,1)
    side=np.clip(1-(2*u-1)**2,0,1)
    # Dark warm cavity, with a softly shaded tongue at the lower centre (BGR).
    color=np.empty((b-t,r-l,3),np.float32)
    shade=(.55+.45*side)*(.8+.2*depth)
    color[:]=np.array([.075,.055,.17],np.float32)*shade[:,:,None]
    tongue_distance=((u-.5)/.34)**2+((depth-.93)/.30)**2
    tongue=np.clip((1-tongue_distance)*5,0,1)*np.clip((ratio-.08)/.1,0,1)
    tongue_color=np.stack([.20+.07*(1-depth),.25+.07*(1-depth),.51+.09*(1-depth)],axis=2)
    color=color*(1-tongue[:,:,None])+tongue_color*tongue[:,:,None]
    # Upper teeth share a curved edge, with subtle separators rather than a white bar.
    tooth_depth=min(width*.11,gap*.36)
    scallop=.94+.06*np.cos((u-.5)*12*np.pi)
    edge=upper+tooth_depth*(.82+.18*side)*scallop
    teeth=np.clip((edge-v)/max(.7,width*.008)+.5,0,1)
    teeth*=np.clip((u-.075)/.06,0,1)*np.clip((.925-u)/.06,0,1)
    separators=np.exp(-(np.sin((u-.5)*6*np.pi)/.10)**2)*.055
    brightness=np.clip(.85+.12*side-.10*np.clip((v-upper)/max(tooth_depth,.1),0,1)-separators,.65,1)
    tooth_color=brightness[:,:,None]*np.array([.87,.96,1.0],np.float32)
    color=color*(1-teeth[:,:,None])+tooth_color*teeth[:,:,None]
    roi=canvas[t:b,l:r];blend=mask[:,:,None].astype(np.float32)/255*activation
    roi[:,:,:3]=roi[:,:,:3]*(1-blend)+color*roi[:,:,3:4]*blend


def landmark_detector(model, video=True, confidence=.6):
    import mediapipe as mp
    from mediapipe.tasks.python import vision
    # model_asset_path is not Unicode-safe in the Windows native runtime.
    options = vision.FaceLandmarkerOptions(
        base_options=mp.tasks.BaseOptions(model_asset_buffer=Path(model).read_bytes()),
        running_mode=vision.RunningMode.VIDEO if video else vision.RunningMode.IMAGE,
        num_faces=5 if video else 1, min_face_detection_confidence=confidence,
        min_face_presence_confidence=.5, min_tracking_confidence=.5,
        output_face_blendshapes=False, output_facial_transformation_matrixes=False)
    return vision.FaceLandmarker.create_from_options(options)


def mp_image(bgr):
    import mediapipe as mp
    return mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(cv.cvtColor(bgr, cv.COLOR_BGR2RGB)))


def box_of(points):
    lo=points.min(axis=0); hi=points.max(axis=0)
    return np.r_[lo, np.maximum(hi-lo, .001)]


def overlap(a,b):
    lo=np.maximum(a[:2],b[:2]);hi=np.minimum(a[:2]+a[2:],b[:2]+b[2:])
    area=np.maximum(0,hi-lo).prod()
    return float(area/max(1e-8,a[2:].prod()+b[2:].prod()-area))


def appearance(image, box):
    h,w=image.shape[:2];x,y,bw,bh=box
    l,t=max(0,int(x*w)),max(0,int(y*h));r,b=min(w,int((x+bw)*w)),min(h,int((y+bh)*h))
    if r<=l or b<=t:return np.zeros(24,np.float32)
    hsv=cv.cvtColor(image[t:b,l:r],cv.COLOR_BGR2HSV)
    hist=cv.calcHist([hsv],[0,1],None,[8,3],[0,180,0,256]).reshape(-1)
    return hist/max(1,float(hist.sum()))


def identity_feature(image, pts):
    """Local appearance descriptor, kept only for this video's lifetime."""
    h,w=image.shape[:2]
    if len(pts)==len(IDS):
        anchors=np.float32([pts[INDEX[33]],pts[INDEX[263]],pts[INDEX[1]]])*[w,h]
        matrix=cv.getAffineTransform(np.float32(anchors),np.float32([[9,12],[23,12],[16,22]]))
        crop=cv.warpAffine(image,matrix,(32,32),borderMode=cv.BORDER_REFLECT_101)
    else:
        x,y,bw,bh=box_of(pts)
        crop=image[max(0,int(y*h)):min(h,int((y+bh)*h)),max(0,int(x*w)):min(w,int((x+bw)*w))]
        if not crop.size:return None
        crop=cv.resize(crop,(32,32))
    gray=cv.cvtColor(crop,cv.COLOR_BGR2GRAY).astype(np.float32)
    if gray.std()<5:return None  # Flat/occluded faces cannot support reassociation.
    gray=(gray-gray.mean())/max(1,float(gray.std()))
    return gray.ravel()/np.linalg.norm(gray)


class MeshTrack:
    def __init__(self, ident, pts, descriptor, now):
        self.id=ident;self.pts=pts.copy();self.velocity=np.zeros_like(pts)
        self.descriptor=descriptor;self.last=now;self.updated=now;self.missing=False

    def update(self, pts, descriptor, now):
        dt=max(.001,now-self.updated)
        # Strong smoothing at rest, faster response for expression/head movement.
        speed=np.linalg.norm(pts-self.pts,axis=1)/dt
        alpha=(1-np.exp(-2*math.pi*(2.2+speed*8)*dt))[:,None]
        smoothed=self.pts+alpha*(pts-self.pts)
        self.velocity=.7*self.velocity+.3*(smoothed-self.pts)/dt
        self.pts=smoothed;self.descriptor=.85*self.descriptor+.15*descriptor
        self.last=now;self.updated=now;self.missing=False


class Tracker:
    """Stable IDs inside a shot, bounded gap holding and reacquisition."""
    def __init__(self, strict_identity=False):
        self.tracks=[];self.ident=0;self.losses=0;self.held=0
        self.gallery={};self.strict_identity=strict_identity;self.reassociated=0

    def reset(self):
        self.tracks=[]

    def step(self, detections, image, now, previous_gray=None, gray=None):
        entries=[(pts,appearance(image,box_of(pts))) for pts in detections]
        features=[identity_feature(image,pts) for pts,_ in entries]
        pairs=[]
        for ti,t in enumerate(self.tracks):
            a=box_of(t.pts);center=a[:2]+a[2:]/2
            for di,(pts,desc) in enumerate(entries):
                b=box_of(pts);distance=float(np.linalg.norm(center-(b[:2]+b[2:]/2)))/max(.03,float(np.linalg.norm(a[2:])))
                iou=overlap(a,b);color=float(np.abs(t.descriptor-desc).sum())/2
                if distance<.65 and (iou>.08 or distance<.3) and color<.65:
                    identity_distance=0 if features[di] is None or t.id not in self.gallery else max(0,1-float(np.dot(self.gallery[t.id][0],features[di])))
                    pairs.append((iou-.35*distance-.25*color-identity_distance,ti,di))
                elif features[di] is not None and t.id in self.gallery and color<.2:
                    similarity=1-float(np.dot(self.gallery[t.id][0],features[di]))
                    alternatives=[1-float(np.dot(old,features[di])) for ident,(old,_) in self.gallery.items() if ident!=t.id]
                    if similarity<.08 and (not alternatives or min(alternatives)-similarity>.08):
                        pairs.append((.9-similarity,ti,di))
        used_t=set();used_d=set()
        for _,ti,di in sorted(pairs,reverse=True):
            if ti in used_t or di in used_d:continue
            self.tracks[ti].update(*entries[di],now);used_t.add(ti);used_d.add(di)
            if features[di] is not None:
                self.gallery[self.tracks[ti].id]=(features[di],entries[di][1])
        occupied={t.id for t in self.tracks}
        for di,(pts,desc) in enumerate(entries):
            if di not in used_d:
                feature=features[di];candidates=[]
                if feature is not None:
                    for ident,(old,color) in self.gallery.items():
                        if ident not in occupied:
                            distance=1-float(np.dot(old,feature))
                            color_distance=float(np.abs(color-desc).sum())/2
                            if color_distance<.35:candidates.append((distance,ident))
                candidates.sort()
                if candidates and candidates[0][0]<.16 and (len(candidates)==1 or candidates[1][0]-candidates[0][0]>.08):
                    ident=candidates[0][1];self.reassociated+=1
                else:
                    # Never silently rotate avatars when appearance is ambiguous.
                    if self.strict_identity and (feature is None or (candidates and candidates[0][0]<.35) or any(ident not in occupied for ident in self.gallery)):
                        raise RuntimeError('FACE_IDENTITY_UNCERTAIN：无法可靠区分重新入镜的人物，请改用单个头像或拆分此镜头后重试。')
                    self.ident+=1;ident=self.ident
                occupied.add(ident)
                if feature is not None:self.gallery[ident]=(feature,desc)
                self.tracks.append(MeshTrack(ident,pts,desc,now))
        shown=[]
        for t in self.tracks:
            age=now-t.last
            if age>0 and not t.missing:self.losses+=1;t.missing=True
            if age>0:
                # Absence is not proof of exit. Keep identity for reacquisition,
                # but cover the entire frame instead of aborting or guessing.
                self.held+=1
                shown.append({'id':t.id,'guardOnly':True,'solid':True,'held':True,'guardBox':[0,0,1,1]})
                continue
            shown.append({'id':t.id,'pts':np.round(t.pts,6).tolist(),'box':np.round(box_of(t.pts),6).tolist(),'held':False,'guardBox':None})
        return shown


def detect(job, cache, meta, worker):
    w,h=meta['width'],meta['height'];scale=min(1,640/max(w,h));dw=max(2,round(w*scale)//2*2);dh=max(2,round(h*scale)//2*2)
    fps=meta['fps'];mesh_path=Path(str(cache)+'.jsonl');partial=Path(str(mesh_path)+'.new')
    args=[job['ffmpeg'],'-v','error','-nostdin','-threads','2','-i',job['input'],*(['-t',str(meta['duration'])] if job.get('preview') else []),'-an','-sn','-vf',meta.get('normalize','null')+f',scale={dw}:{dh},setsar=1,fps={fps}','-threads','2','-f','rawvideo','-pix_fmt','bgr24','pipe:1']
    process=worker.process(args,stdout=worker.subprocess.PIPE,stderr=worker.subprocess.DEVNULL)
    tracker=Tracker(len(job.get('avatars',[]))>1);previous=None;previous_hist=None;previous_gray=None;cuts=0;covered=0;count=0;started=time.monotonic()
    # A bounded delayed buffer fills short missed intervals without changing completed shots.
    pending=deque();last_observed={};last_by_id={};prefix_guarded=0;shot_start=0
    try:
        with landmark_detector(job['dynamicModel'],confidence=job['options']['confidence']) as net, partial.open('w',encoding='utf8') as output:
            while True:
                worker.check(job);image=worker.frame(process.stdout,dw,dh)
                if image is None:break
                gray=cv.cvtColor(image,cv.COLOR_BGR2GRAY);small=cv.resize(gray,(64,36))
                hist=cv.calcHist([gray],[0],None,[32],[0,256]);cv.normalize(hist,hist)
                cut=previous is not None and float(np.mean(cv.absdiff(small,previous)))>45 and cv.compareHist(hist,previous_hist,cv.HISTCMP_BHATTACHARYYA)>.45
                if cut:
                    while pending:output.write(json.dumps(pending.popleft(),separators=(',',':'))+'\n')
                    tracker.reset();last_observed={};last_by_id={};cuts+=1;previous_gray=None;shot_start=count
                previous=small;previous_hist=hist
                result=net.detect_for_video(mp_image(image),round(count/fps*1000))
                if len(result.face_landmarks)>=5:
                    raise RuntimeError('FACE_COUNT_LIMIT：动态头像当前支持同屏最多4人，此镜头检测到更多人，请拆分画面或改用模糊／马赛克后重试。')
                points=[]
                for face in result.face_landmarks:
                    pts=np.array([[face[i].x,face[i].y] for i in IDS],np.float32)
                    if np.isfinite(pts).all() and box_of(pts)[3]>=job['options']['minFace']:points.append(pts)
                row=tracker.step(points,image,count/fps,previous_gray,gray);previous_gray=gray
                for face in row:
                    ident=face['id']
                    if not face['held']:
                        if ident not in last_observed:
                            # Before a face's first observation its old position is unknown.
                            # Protect the buffered same-shot frames, never paste a future
                            # face box backwards or cross a scene cut.
                            for _,pending_row in pending:
                                if not any(f.get('guardOnly') for f in pending_row):
                                    if not pending_row:covered+=1
                                    pending_row.insert(0,{'id':-1,'guardOnly':True,'solid':True,'held':True,'guardBox':[0,0,1,1]})
                                    prefix_guarded+=1
                        if ident in last_observed:
                            old_n=last_observed[ident];old=last_by_id[ident]
                            gap=count-old_n
                            if 1<gap<=max(2,round(fps*.35)):
                                for pending_n,pending_row in pending:
                                    if old_n<pending_n<count:
                                        for f in pending_row:
                                            if f['id']==ident and f['held']:
                                                a=(pending_n-old_n)/gap
                                                p=(1-a)*old+a*np.array(face['pts'])
                                                f['pts']=np.round(p,6).tolist();f['box']=np.round(box_of(p),6).tolist()
                        last_observed[ident]=count;last_by_id[ident]=np.array(face['pts'])
                if not row:
                    row=[{'id':-1,'guardOnly':True,'solid':True,'held':True,'guardBox':[0,0,1,1]}]
                    prefix_guarded+=1
                pending.append([count,row]);count+=1;covered+=bool(row)
                while len(pending)>max(1,math.ceil(fps*.4)):
                    output.write(json.dumps(pending.popleft(),separators=(',',':'))+'\n')
                if count%max(1,round(fps/5))==0:worker.emit(phase='跟踪人脸与表情',progress=min(.99,count/fps/meta['duration']))
            while pending:output.write(json.dumps(pending.popleft(),separators=(',',':'))+'\n')
        if process.wait()!=0:raise RuntimeError('动态头像检测时视频解码失败')
        if not count:raise RuntimeError('素材没有可解码视频帧')
        worker.check(job);os.replace(partial,mesh_path)
        data={'version':POLICY,'meta':meta,'meshPath':str(mesh_path),'meshBytes':mesh_path.stat().st_size,'stats':{'tracks':tracker.ident,'coveredFrames':covered,'frames':count,'coverage':covered/count,'trackingLosses':tracker.losses,'heldFrames':tracker.held,'conservativeFrames':tracker.held+prefix_guarded,'prefixGuardFrames':prefix_guarded,'sceneCuts':cuts,'provider':'MediaPipe CPU','seconds':time.monotonic()-started}}
        worker.save(cache,data);return data
    finally:
        worker.stop(process)
        if partial.exists():partial.unlink()


def triangles(points, width, height):
    # Pad the triangulation bounds: detected points may extend slightly past artwork.
    margin=max(width,height)*2
    sub=cv.Subdiv2D((-margin,-margin,width+margin*2+1,height+margin*2+1))
    for x,y in points:sub.insert((float(x),float(y)))
    result=[]
    for t in sub.getTriangleList():
        tri=np.array(t).reshape(3,2);ids=[]
        for v in tri:
            d=((points-v)**2).sum(axis=1);i=int(d.argmin())
            if d[i]>.05:break
            ids.append(i)
        if len(ids)==3 and len(set(ids))==3:result.append(ids)
    return result


class Artwork:
    def __init__(self,path,model):
        raw=cv.imdecode(np.fromfile(path,np.uint8),cv.IMREAD_UNCHANGED)
        if raw is None or raw.ndim!=3 or raw.shape[2]!=4:raise ValueError('动态头像需要透明PNG图片')
        h,w=raw.shape[:2];scale=min(1,768/max(w,h))
        self.image=cv.resize(raw,(max(1,round(w*scale)),max(1,round(h*scale))),interpolation=cv.INTER_AREA) if scale<1 else raw
        h,w=self.image.shape[:2]
        alpha=self.image[:,:,3:4].astype(np.float32)/255
        rgb=np.uint8(self.image[:,:,:3]*alpha+255*(1-alpha))
        with landmark_detector(model,False,.45) as detector:
            faces=detector.detect(mp_image(rgb)).face_landmarks
        if not faces:raise ValueError('这张头像未识别到清晰五官，请换用正面、眼睛和嘴巴清晰的头像')
        pts=np.array([[faces[0][i].x*w,faces[0][i].y*h] for i in IDS],np.float32)
        if not np.isfinite(pts).all() or (np.abs(pts)>max(w,h)*2).any():raise ValueError('头像五官识别异常，请换用清晰的正面头像')
        self.points=np.r_[pts,BOUNDARY*np.array([w-1,h-1])].astype(np.float32)
        self.triangles=triangles(self.points,w,h)
        self.anchor_indices=[INDEX[i] for i in [33,263,1,152,10]]
        # Premultiplied colors avoid dark seams around transparent PNG pixels.
        self.pixels=self.image.astype(np.float32)/255
        self.pixels[:,:,:3]*=self.pixels[:,:,3:4]

    def paint(self,image,face,expansion):
        h,w=image.shape[:2];target=np.array(face['pts'],np.float32)*np.array([w,h])
        anchors=self.anchor_indices
        matrix,_=cv.estimateAffinePartial2D(self.points[anchors],target[anchors],method=cv.LMEDS)
        if matrix is None or not np.isfinite(matrix).all():
            raise RuntimeError('FACE_AVATAR_RENDER：头像变形计算失败，已停止导出，未保留无遮挡的原脸。')
        outside=cv.transform(self.points[None,len(IDS):],matrix)[0]
        dst=np.r_[target,outside].astype(np.float32)
        # Expansion grows the final avatar while retaining relative facial movement.
        center=target[INDEX[1]];dst=np.float32(center+(dst-center)*(1+expansion*.4))
        lo=np.floor(dst.min(axis=0)).astype(int);hi=np.ceil(dst.max(axis=0)).astype(int)+1
        l,t=max(0,int(lo[0])),max(0,int(lo[1]));r,b=min(w,int(hi[0])),min(h,int(hi[1]))
        if r<=l or b<=t:
            raise RuntimeError('FACE_AVATAR_RENDER：头像绘制区域无效，已停止导出。')
        # Bounded ROI, never allocate an off-screen mesh bounding box.
        canvas=np.zeros((b-t,r-l,4),np.float32);weight=np.zeros((b-t,r-l,1),np.float32)
        local=dst-np.array([l,t],np.float32)
        for indices in self.triangles:
            source=self.points[indices];dest=local[indices]
            sa,sb=source[1]-source[0],source[2]-source[0];da,db=dest[1]-dest[0],dest[2]-dest[0]
            area_src=float(sa[0]*sb[1]-sa[1]*sb[0]);area_dst=float(da[0]*db[1]-da[1]*db[0])
            if abs(area_src)<.05 or abs(area_dst)<.05 or area_src*area_dst<0:continue
            x,y,tw,th=cv.boundingRect(dest)
            x1,y1=max(0,x),max(0,y);x2,y2=min(r-l,x+tw),min(b-t,y+th)
            if x2<=x1 or y2<=y1:continue
            transform=cv.getAffineTransform(source,np.float32(dest-[x1,y1]))
            warp=cv.warpAffine(self.pixels,transform,(x2-x1,y2-y1),flags=cv.INTER_LINEAR,borderMode=cv.BORDER_CONSTANT)
            mask=np.zeros((y2-y1,x2-x1),np.uint8)
            cv.fillConvexPoly(mask,np.int32(np.round((dest-[x1,y1])*16)),255,lineType=cv.LINE_AA,shift=4)
            m=mask[:,:,None].astype(np.float32)/255
            canvas[y1:y2,x1:x2]+=warp*m;weight[y1:y2,x1:x2]+=m
        canvas/=np.maximum(weight,1e-6)
        if not np.isfinite(canvas).all() or float(canvas[:,:,3].max())<.01:
            raise RuntimeError('FACE_AVATAR_RENDER：头像未能覆盖有效区域，已停止导出。')
        paint_mouth(canvas,local)
        roi=image[t:b,l:r].astype(np.float32)/255
        # Protect only the actual face interior. Hair/cheek exterior stays clear;
        # transparent PNG holes and skipped triangles must not reveal source pixels.
        oval=np.float32(target[[INDEX[i] for i in OVAL]]-[l,t])
        if not np.isfinite(oval).all() or abs(cv.contourArea(oval))<1:
            raise RuntimeError('FACE_AVATAR_RENDER：人脸覆盖轮廓无效，已停止导出。')
        interior=np.zeros((b-t,r-l),np.uint8)
        cv.fillPoly(interior,[np.int32(np.round(oval))],255)
        small=cv.resize(image[t:b,l:r],(min(6,r-l),min(6,b-t)),interpolation=cv.INTER_AREA)
        protected=cv.resize(small,(r-l,b-t),interpolation=cv.INTER_NEAREST).astype(np.float32)/255
        roi=np.where(interior[:,:,None]>0,protected,roi)
        image[t:b,l:r]=np.uint8(np.clip(canvas[:,:,:3]+roi*(1-canvas[:,:,3:4]),0,1)*255+.5)
        return True


class Renderer:
    def __init__(self,job):
        self.art=[];self.job=job
        for path in job['avatars']:
            self.art.append(Artwork(path,job['dynamicModel']))
        if not self.art:raise ValueError('请至少选择一个头像')

    def paint(self,image,row,worker):
        h,w=image.shape[:2]
        if not row or any(face.get('solid') for face in row):
            image[:]=32
            return
        for face in row:
            if face.get('guardOnly'):
                worker.paint_guard_box(image,face['guardBox']);continue
            if face['held']:
                worker.paint_guard_box(image,face['guardBox'])
            x,y,bw,bh=face['box'];expand=self.job['options']['expansion']
            l=max(0,int((x-bw*expand)*w));t=max(0,int((y-bh*expand)*h));r=min(w,int((x+bw*(1+expand))*w));b=min(h,int((y+bh*(1+expand))*h))
            # Composite the PNG directly: a blurred bounding rectangle leaks beyond
            # transparent hair/cheek edges and visibly smears the neck/background.
            if self.art[(face['id']-1)%len(self.art)].paint(image,face,expand) is not True:
                raise RuntimeError('FACE_AVATAR_RENDER：头像绘制未完成，已停止导出。')
            if self.job.get('boxes') and r>l and b>t:cv.rectangle(image,(l,t),(r,b),(70,230,80),2)


def rows(data):
    with open(data['meshPath'],encoding='utf8') as f:
        for expected,line in enumerate(f):
            n,row=json.loads(line)
            if n!=expected:raise ValueError('动态头像轨迹缓存不完整')
            yield row
