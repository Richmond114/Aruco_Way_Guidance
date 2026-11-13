// 与组员 demo 的 DICT_ARUCO_ORIGINAL / ARUCO 字典兼容。
// 未提供实地测量路线，因此已登记标记仅播报其原始地点，不推断方向。
window.GUIDE_LOCATIONS={
  0:{name:'一楼入口',message:'您已到达教学楼一楼入口。'},
  1:{name:'一楼电梯',message:'您目前位于一楼电梯附近。'},
  2:{name:'一楼楼梯口',message:'您已到达一楼楼梯口，请注意台阶。'},
  3:{name:'二楼主走廊',message:'您目前位于二楼主走廊。'},
  4:{name:'二楼教室',message:'您已到达二楼教室门口。'}
};
// 部署前，可为地点添加 route:{first:'直行50米',next:'50米后右拐',arrival:'到达卫生间',speech:'…'}。
