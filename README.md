# 寻径 · ArUco 室内语音定位原型

## 组成
- `generate_markers.py`：OpenCV 批量生成标记图片，字典为 `DICT_ARUCO_ORIGINAL`。
- `markers/`：示例标记，ID 0–4。
- `index.html`：手机网页识别、位置映射、语音播报。

## 生成标记
```bash
python -m pip install opencv-contrib-python
python generate_markers.py
```

## 在手机上打开
- 建议把 `index.html` 部署到 GitHub Pages、Netlify 等 HTTPS 站点。
- 电脑本地调试可在本目录运行 `python -m http.server 8000`，电脑访问 `http://localhost:8000`。
- 注意：**手机通过局域网 IP 访问电脑的 HTTP 页面通常无法使用摄像头**；手机请使用 HTTPS 地址。
- 首次点击「开始识别」授权摄像头和音频播放；将后置摄像头指向 `markers/marker_0.png` 等。
- JavaScript 检测库由 CDN 在线加载。首次使用需要网络；要脱机使用可以把依赖保存为本地文件后修改 script 路径。

## 修改位置
- 修改 `index.html` 的 `LOCATIONS`：标记 ID -> 地点名称/语音内容。
- 与之对应，修改 `generate_markers.py` 的 `LOCATIONS`（仅用于打印标记文件名和记录；识别逻辑只看 ID）。

## 字典一致性
- Python：`cv2.aruco.DICT_ARUCO_ORIGINAL`
- 浏览器：`new AR.Detector({dictionaryName:'ARUCO'})`
- **不要使用上一示例的 DICT_6X6_250 标记来测试此网页**；字典不同。

## 原型局限
- 识别成功只证明看到某个被登记的标记，不能自动提供连续位置/绝对朝向/距离/避障能力。
- 消息中的方位或危险提醒必须基于现场验证，不应随意使用“左转”“前方安全”等词语。
- 测试时应有陪同人员并保留盲杖等常规辅助方式。
