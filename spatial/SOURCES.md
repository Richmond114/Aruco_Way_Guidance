# 空间导览数据来源

来源为用户指定的 [学院空间实验室](https://cinq929.github.io/college-1f-lab/) 及其 [组员说明](https://cinq929.github.io/college-1f-lab/guide.html)，读取日期 2026-11-14。

- `floorplan.json` 是建筑原图一层 `architecture/floorplan.json` 的原始副本，坐标版本为 `architecture-1f-2026-11-09`。
- `source/floorplan.json` 留存同一下载内容；`source/navigation.js`、`source/position.js`、`source/planning.js` 是原站点同名脚本，保持原内容。
- `guide-data.js` 由本目录 `build-data.mjs` 生成。它调用原始 A* 和通道检查，不把相邻标记中心直接连成一条可能穿墙的线。

在“导盲软件”目录执行 `node spatial/build-data.mjs` 可重新生成数据。生成文件记录原图文件 SHA-256；无随机数或运行时生成日期。

输出只保留原图已登记的 12 个关键标记。原实验中的 P 补码候选没有可识别的 ID，不自动加入。新旧底图重复使用 ID 数字，含义不同，不能混用。

路线及比例尺均未现场核验。预设转向依据顺序经过前一站后进入当前站的路径方向，不是从手机 IMU、码在画面中的位置或扫码结果中推断的人体朝向。`interiorTurns` 记录中途的几何转折，但这些拐点并未自动成为已贴码的站点。距离为图纸估算，不是实时剩余距离。
