from pathlib import Path
from PIL import Image, ImageDraw
# A4 landscape: 10 x 7 squares, 9 x 6 INTERNAL corners, squares 20 mm.
p=lambda mm:round(mm*300/25.4)
im=Image.new('L',(p(297),p(210)),255);d=ImageDraw.Draw(im)
for y in range(7):
 for x in range(10):
  if (x+y)%2==0:d.rectangle((p(48+x*20),p(30+y*20),p(48+(x+1)*20)-1,p(30+(y+1)*20)-1),fill=0)
out=Path(__file__).parent/'calibration_board.png';im.save(out,dpi=(300,300));print(out)
