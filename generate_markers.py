"""Generate markers for js-aruco2's ARUCO dictionary (OpenCV DICT_ARUCO_ORIGINAL)."""
import cv2
from pathlib import Path

LOCATIONS = {
    0: '一楼入口',
    1: '一楼电梯',
    2: '一楼楼梯口',
    3: '二楼主走廊',
    4: '二楼教室',
}

dictionary = cv2.aruco.getPredefinedDictionary(cv2.aruco.DICT_ARUCO_ORIGINAL)
out = Path(__file__).parent / 'markers'
out.mkdir(exist_ok=True)
for marker_id, name in LOCATIONS.items():
    marker = cv2.aruco.generateImageMarker(dictionary, marker_id, 800, borderBits=1)
    marker = cv2.copyMakeBorder(marker, 100, 100, 100, 100,
                                cv2.BORDER_CONSTANT, value=255)
    path = out / f'marker_{marker_id}.png'
    cv2.imwrite(str(path), marker)
    print(f'{path.name} -> {name}')
