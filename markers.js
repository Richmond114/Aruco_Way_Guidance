(() => {
  'use strict';
  const list = document.getElementById('marker-list');
  const plan = window.GUIDE_PLAN;
  if (!plan || !Array.isArray(plan.markers)) {
    list.textContent = '路线数据未加载，请检查 spatial/guide-data.js 后刷新。';
    document.getElementById('print-markers').disabled = true;
    return;
  }
  document.getElementById('plan-version').textContent = `坐标版本：${plan.planId} · ${plan.markers.length} 个关键标记`;
  for (const marker of plan.markers) {
    const card = document.createElement('article');
    const title = document.createElement('h2');
    title.textContent = `ID ${marker.id} · ${marker.name}`;
    const image = document.createElement('img');
    image.src = `markers/marker_${marker.id}.png`;
    image.alt = `ArUco 标记 ${marker.id}，${marker.name}`;
    image.width = 1000;
    image.height = 1000;
    const caption = document.createElement('p');
    caption.className = 'sheet-caption';
    caption.textContent = '黑色码体 80 × 80 mm；含白边图片 100 × 100 mm。打印后实量，并在工具与设置填写实际黑框边长。';
    const picture = document.createElement('a');
    picture.href = image.src;
    picture.textContent = `单独查看 ID ${marker.id}`;
    const download = document.createElement('a');
    download.href = `print_sheets/marker_${marker.id}_A4.png`;
    download.download = `marker_${marker.id}_A4.png`;
    download.textContent = '下载 A4 打印页（五种尺寸）';
    card.append(title, image, caption, picture, download);
    list.append(card);
  }
  document.getElementById('print-markers').addEventListener('click', () => window.print());
})();
