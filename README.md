# 寻径 · 设计学院一楼导览

这是用于 GitHub Pages 发布的静态网站，入口为根目录 `index.html`。

当前版本：2026-11-15。固定 12 段环线，路线语音仅说明当前位置和前往下一站的走法。

## 发布

在仓库 Settings → Pages 中，将 Source 设为 Deploy from a branch，选择 main 与 /(root)，保存。发布完成后使用 Pages 中的 Visit site 链接。

打开首页可先体验路线；现场扫码需允许相机权限。手机请使用 HTTPS 链接。无需安装 Python 或运行服务器脚本。

## 目录

ESP32 姿态接收与阶段 3 相对朝向测试已接入“工具与设置”的 IMU 面板；手机验收步骤及共享接口见 [IMU 接收与朝向说明](imu/README.md)。当前等待相对朝向的手机与硬件测试，再进入动态空间音频阶段。

- assets：首页插画。
- spatial：一楼地图、路线数据与来源及重建脚本。
- vendor：浏览器识别与 OpenCV 依赖、许可文件。
- imu：外置传感器蓝牙面板。
- markers / print_sheets：12 个 ArUco 标记和打印页。
- lab.html：标定与测距实验。

讲解文案与参观记录保存在各设备的浏览器中，不会随这些静态文件同步。

## 来源

初代原型：https://richmond114.github.io/Aruco_Way_Guidance/

空间导览：https://cinq929.github.io/college-1f-lab/

空间数据与路径来源详见 spatial/SOURCES.md；识别库许可保留于 vendor/LICENSE.txt，OpenCV.js 保留其原文件声明。
