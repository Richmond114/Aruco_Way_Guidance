// 一楼建筑原图为唯一地点来源。80 mm 是布点草案，实物尺寸仍使用工具中的实量输入。
window.GUIDE_LOCATIONS=Object.fromEntries(window.GUIDE_PLAN.markers.map(m=>[m.id,{
  name:m.name,message:'识别到'+m.name+'，ID '+m.id+'。'
}]));
