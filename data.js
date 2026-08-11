/**
 * 基金持仓 / A股·美股·港股·韩股涨跌榜观察数据
 * 可直接被页面或其他脚本引用：<script src="data.js"></script>
 *
 * market（东方财富 secid 前缀）:
 *   A股: 1=上交所, 0=深交所 / 北交所（含 920 新代码）
 *   港股: 116
 *   美股: 105=纳斯达克, 106=纽交所
 *   日股: 176
 *   韩股: 177
 *
 * cnSemi / usSemi 的 holdings 由实时涨跌幅榜动态填充，本地仅保留自选。
 */
window.FUND_HOLDINGS = {
  dongfang: {
    id: "dongfang",
    name: "东方",
    fundName: "东方人工智能主题混合C",
    fundCode: "017811",
    market: "CN",
    top10Total: 86.1,
    holdings: [
      { name: "中科飞测", code: "688361", market: 1, ratio: 9.55 },
      { name: "芯源微", code: "688037", market: 1, ratio: 9.19 },
      { name: "中微公司", code: "688012", market: 1, ratio: 9.12 },
      { name: "华海清科", code: "688120", market: 1, ratio: 9.08 },
      { name: "北方华创", code: "002371", market: 0, ratio: 8.92 },
      { name: "精测电子", code: "300567", market: 0, ratio: 8.69 },
      { name: "富创精密", code: "688409", market: 1, ratio: 7.57 },
      { name: "拓荆科技", code: "688072", market: 1, ratio: 7.44 },
      { name: "寒武纪", code: "688256", market: 1, ratio: 7.04 },
      { name: "盛美上海", code: "688082", market: 1, ratio: 6.87 }
    ]
  },
  caitong: {
    id: "caitong",
    name: "财通",
    fundName: "财通集成电路产业股票C",
    fundCode: "006503",
    market: "CN",
    top10Total: 69.46,
    holdings: [
      { name: "新易盛", code: "300502", market: 0, ratio: 9.47 },
      { name: "源杰科技", code: "688498", market: 1, ratio: 8.69 },
      { name: "南亚新材", code: "688519", market: 1, ratio: 8.27 },
      { name: "德福科技", code: "301511", market: 0, ratio: 7.95 },
      { name: "鼎泰高科", code: "301377", market: 0, ratio: 7.87 },
      { name: "三环集团", code: "300408", market: 0, ratio: 7.84 },
      { name: "风华高科", code: "000636", market: 0, ratio: 6.29 },
      { name: "博迁新材", code: "605376", market: 1, ratio: 4.73 },
      { name: "方邦股份", code: "688020", market: 1, ratio: 4.6 },
      { name: "昀冢科技", code: "688260", market: 1, ratio: 3.75 }
    ]
  },
  huaxia: {
    id: "huaxia",
    name: "华夏",
    fundName: "华夏全球科技先锋混合(QDII)C",
    fundCode: "024239",
    market: "CN",
    top10Total: 17.85,
    holdings: [
      { name: "闪迪", code: "SNDK", market: 105, ratio: 3.11 },
      { name: "美光科技", code: "MU", market: 105, ratio: 2.85 },
      { name: "迈威尔科技", code: "MRVL", market: 105, ratio: 1.6 },
      { name: "台积电", code: "TSM", market: 106, ratio: 1.57 },
      { name: "联华电子", code: "UMC", market: 106, ratio: 1.51 },
      { name: "Lumentum", code: "LITE", market: 105, ratio: 1.51 },
      { name: "希捷科技", code: "STX", market: 105, ratio: 1.49 },
      { name: "西部数据", code: "WDC", market: 105, ratio: 1.46 },
      { name: "建滔积层板", code: "01888", market: 116, ratio: 1.38 },
      { name: "ASMPT", code: "00522", market: 116, ratio: 1.37 }
    ]
  },
  guangfa: {
    id: "guangfa",
    name: "广发",
    fundName: "广发全球精选股票(QDII)C",
    fundCode: "021277",
    market: "CN",
    top10Total: 48.69,
    holdings: [
      { name: "智谱", code: "02513", market: 116, ratio: 9.01 },
      { name: "美光科技", code: "MU", market: 105, ratio: 6.16 },
      { name: "拉姆研究", code: "LRCX", market: 105, ratio: 4.5 },
      { name: "阿斯麦", code: "ASML", market: 105, ratio: 4.35 },
      { name: "铠侠", code: "285A", market: 176, ratio: 4.07 },
      { name: "闪迪", code: "SNDK", market: 105, ratio: 3.89 },
      { name: "超威半导体", code: "AMD", market: 105, ratio: 3.74 },
      { name: "应用材料", code: "AMAT", market: 105, ratio: 3.5 },
      { name: "谷歌-C", code: "GOOG", market: 105, ratio: 3.37 },
      { name: "三环集团", code: "300408", market: 0, ratio: 3.1 }
    ]
  },
  jianxin: {
    id: "jianxin",
    name: "建信",
    fundName: "建信新兴市场优选混合(QDII)C",
    fundCode: "018147",
    market: "CN",
    top10Total: 62.22,
    holdings: [
      { name: "台积电", code: "TSM", market: 106, ratio: 9.68 },
      { name: "英伟达", code: "NVDA", market: 105, ratio: 9.38 },
      { name: "海力士", code: "000660", market: 177, ratio: 8.94 },
      { name: "三星电子", code: "005930", market: 177, ratio: 7.8 },
      { name: "闪迪", code: "SNDK", market: 105, ratio: 7.16 },
      { name: "博通", code: "AVGO", market: 105, ratio: 4.18 },
      { name: "西部数据", code: "WDC", market: 105, ratio: 4.18 },
      { name: "美光科技", code: "MU", market: 105, ratio: 3.99 },
      { name: "Lumentum", code: "LITE", market: 105, ratio: 3.56 },
      { name: "康宁", code: "GLW", market: 106, ratio: 3.35 }
    ]
  },
  huabao: {
    id: "huabao",
    name: "华宝",
    fundName: "华宝致远混合(QDII)C",
    fundCode: "008254",
    market: "CN",
    top10Total: 42.72,
    holdings: [
      { name: "闪迪", code: "SNDK", market: 105, ratio: 9.12 },
      { name: "美光科技", code: "MU", market: 105, ratio: 8.46 },
      { name: "拉姆研究", code: "LRCX", market: 105, ratio: 3.67 },
      { name: "台积电", code: "TSM", market: 106, ratio: 3.65 },
      { name: "MKS", code: "MKSI", market: 105, ratio: 3.61 },
      { name: "应用材料", code: "AMAT", market: 105, ratio: 3.53 },
      { name: "阿斯麦", code: "ASML", market: 105, ratio: 3.47 },
      { name: "超威半导体", code: "AMD", market: 105, ratio: 2.43 },
      { name: "Nebius", code: "NBIS", market: 105, ratio: 2.41 },
      { name: "英伟达", code: "NVDA", market: 105, ratio: 2.37 }
    ]
  },
  fuguo: {
    id: "fuguo",
    name: "富国",
    fundName: "富国全球科技互联网股票(QDII)C",
    fundCode: "022184",
    market: "CN",
    top10Total: 47.46,
    holdings: [
      { name: "ASMPT", code: "00522", market: 116, ratio: 5.62 },
      { name: "兆易创新", code: "603986", market: 1, ratio: 5.51 },
      { name: "闪迪", code: "SNDK", market: 105, ratio: 5.04 },
      { name: "生益科技", code: "600183", market: 1, ratio: 4.7 },
      { name: "海力士", code: "000660", market: 177, ratio: 4.62 },
      { name: "三星电子", code: "005930", market: 177, ratio: 4.58 },
      { name: "铠侠", code: "285A", market: 176, ratio: 4.58 },
      { name: "美光科技", code: "MU", market: 105, ratio: 4.31 },
      { name: "希捷科技", code: "STX", market: 105, ratio: 4.28 },
      { name: "西部数据", code: "WDC", market: 105, ratio: 4.22 }
    ]
  },
  cnSemi: {
    id: "cnSemi",
    name: "A股",
    fundName: "A股涨跌榜",
    fundCode: "CN-RANK",
    market: "CN",
    viewOnly: true,
    top10Total: 100,
    holdings: []
  },
  usSemi: {
    id: "usSemi",
    name: "美股",
    fundName: "美股涨跌榜",
    fundCode: "US-RANK",
    market: "US",
    viewOnly: true,
    top10Total: 100,
    holdings: []
  }
};
