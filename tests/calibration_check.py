import sys, tempfile
from pathlib import Path
import cv2, numpy as np
sys.path.insert(0,str(Path('demo').resolve()))
from calibrate_camera import calibrate
rng=np.random.default_rng(42)
K=np.array([[900.,0,640],[0,910,360],[0,0,1]])
# Rasterize a physical 10 x 7 board from known camera poses.
with tempfile.TemporaryDirectory(dir='.cache') as directory:
 root=Path(directory)
 for i in range(16):
  image=np.full((720,1280),200,np.uint8)
  r=np.array([rng.uniform(-.4,.4),rng.uniform(-.4,.4),rng.uniform(-.15,.15)])
  t=np.array([rng.uniform(-.15,-.05),rng.uniform(-.1,-.03),rng.uniform(.45,.75)])
  for y in range(7):
   for x in range(10):
    obj=np.array([[x*.02,y*.02,0],[(x+1)*.02,y*.02,0],[(x+1)*.02,(y+1)*.02,0],[x*.02,(y+1)*.02,0]],np.float64)
    projected,_=cv2.projectPoints(obj,r,t,K,np.zeros(5))
    cv2.fillConvexPoly(image,np.round(projected.reshape(-1,2)).astype(np.int32),0 if (x+y)%2==0 else 255)
  cv2.imwrite(str(root/f'capture_{i:02}.png'),image)
 cv2.imwrite(str(root/'blank.png'),np.full((720,1280),255,np.uint8))
 result=calibrate(root,9,6,20)
 assert len(result['images'])>=10
 assert result['rejected'][0]['file']=='blank.png'
 assert abs(result['cameraMatrix'][0][0]-900)/900<.05
 assert result['rmsPx']<1
 Path('.cache/synthetic-calibration.json').write_text(__import__('json').dumps(result),encoding='utf8')
 print('PASS calibration pipeline:',len(result['images']),'accepted;',len(result['rejected']),'rejected; RMS',result['rmsPx'])
