import argparse, json, uuid
from pathlib import Path
from datetime import datetime, timezone
import cv2
import numpy as np

def calibrate(folder, cols, rows, square_mm):
    if cols < 3 or rows < 3 or not np.isfinite(square_mm) or square_mm <= 0:
        raise ValueError('Invalid board dimensions')
    obj=np.zeros((cols*rows,3),np.float32)
    obj[:,:2]=np.mgrid[0:cols,0:rows].T.reshape(-1,2)*square_mm/1000
    objects=[]; points=[]; accepted=[]; rejected=[]; size=None
    for p in sorted(Path(folder).glob('*.png')):
        gray=cv2.imread(str(p),0)
        if gray is None: rejected.append({'file':p.name,'reason':'unreadable'}); continue
        shape=(gray.shape[1],gray.shape[0])
        ok,corners=cv2.findChessboardCornersSB(gray,(cols,rows))
        if not ok: rejected.append({'file':p.name,'reason':'board not detected'}); continue
        if size is not None and size!=shape: raise ValueError('Mixed resolutions; split images by camera session')
        size=shape; objects.append(obj.copy()); points.append(corners); accepted.append(p.name)
    if len(points)<10: raise ValueError(f'Need at least 10 detectable diverse images; accepted {len(points)}; rejected {rejected}')
    rms,K,D,rv,tv=cv2.calibrateCamera(objects,points,size,None,None)
    errors=[]
    for o,p,r,t in zip(objects,points,rv,tv):
        predicted,_=cv2.projectPoints(o,r,t,K,D)
        errors.append(float(np.sqrt(np.mean(np.sum((predicted-p)**2,axis=2)))))
    return dict(schemaVersion=1,id=str(uuid.uuid4()),createdAt=datetime.now(timezone.utc).isoformat(),
      width=size[0],height=size[1],cameraMatrix=K.tolist(),distCoeffs=D.ravel().tolist(),
      board=dict(innerCols=cols,innerRows=rows,squareMm=square_mm),rmsPx=float(rms),
      images=[dict(file=f,rmsPx=e) for f,e in zip(accepted,errors)],rejected=rejected,
      note='Coverage must be checked manually; repeated poses are not independent coverage.')

def main():
    p=argparse.ArgumentParser(); p.add_argument('images',type=Path)
    p.add_argument('--cols',type=int,default=9);p.add_argument('--rows',type=int,default=6)
    p.add_argument('--square-mm',type=float,default=20);p.add_argument('--output',type=Path,default=Path('calibration.json'))
    a=p.parse_args()
    try: result=calibrate(a.images,a.cols,a.rows,a.square_mm)
    except ValueError as e:p.error(str(e))
    a.output.write_text(json.dumps(result,indent=2),encoding='utf8')
    print(f'Saved {a.output}; RMS {result["rmsPx"]:.3f} px; rejected: {result["rejected"]}')
if __name__=='__main__':main()
