const s = (id, name, url, mark, color, description = '') => ({ id, name, url, mark, color, description });
export const categories = [
  { id: 'news', name: '新闻资讯', icon: 'Newspaper', sites: [
    s('people','人民网','https://www.people.com.cn','人','#c64343'), s('xinhuanet','新华网','https://www.news.cn','新','#3876b9'), s('sina','新浪新闻','https://news.sina.com.cn','新','#e84b41'), s('sohu','搜狐','https://www.sohu.com','狐','#e5a327'), s('netease','网易新闻','https://news.163.com','网','#d94d49'), s('qqnews','腾讯新闻','https://news.qq.com','腾','#4289dd'), s('thepaper','澎湃新闻','https://www.thepaper.cn','澎','#2d3443'), s('ifeng','凤凰网','https://www.ifeng.com','凤','#c34c48'), s('bbc','BBC中文','https://www.bbc.com/zhongwen','B','#303846'), s('zaobao','联合早报','https://www.zaobao.com','早','#bb4644')
  ]},
  { id: 'video', name: '视频娱乐', icon: 'Clapperboard', sites: [
    s('bilibili','哔哩哔哩','https://www.bilibili.com','哔','#eb7197'), s('iqiyi','爱奇艺','https://www.iqiyi.com','爱','#27ac5b'), s('qqvideo','腾讯视频','https://v.qq.com','▶','#efb128'), s('youku','优酷','https://www.youku.com','优','#249edf'), s('douyin','抖音','https://www.douyin.com','♪','#303341'), s('mango','芒果TV','https://www.mgtv.com','芒','#ee9a28'), s('kuaishou','快手','https://www.kuaishou.com','快','#ef7438'), s('douban','豆瓣电影','https://movie.douban.com','豆','#339767'), s('youtube','YouTube','https://www.youtube.com','▶','#e74d4d'), s('cctv','央视网','https://www.cctv.com','央','#b94843')
  ]},
  { id: 'shopping', name: '购物生活', icon: 'ShoppingBag', sites: [
    s('taobao','淘宝','https://www.taobao.com','淘','#f18b2c'), s('jd','京东','https://www.jd.com','京','#e24f4f'), s('tmall','天猫','https://www.tmall.com','猫','#c84248'), s('pdd','拼多多','https://www.pinduoduo.com','拼','#e95a4c'), s('meituan','美团','https://www.meituan.com','美','#d5a91e'), s('dianping','大众点评','https://www.dianping.com','评','#ed803b'), s('smzdm','什么值得买','https://www.smzdm.com','值','#d55152'), s('ctrip','携程旅行','https://www.ctrip.com','程','#3e84d3'), s('12306','铁路12306','https://www.12306.cn','铁','#4681c2'), s('amap','高德地图','https://www.amap.com','高','#478bd8')
  ]},
  { id: 'social', name: '社交社区', icon: 'MessagesSquare', sites: [
    s('zhihu','知乎','https://www.zhihu.com','知','#367ad7'), s('weibo','微博','https://weibo.com','微','#e45646'), s('xiaohongshu','小红书','https://www.xiaohongshu.com','红','#e65765'), s('doubanhome','豆瓣','https://www.douban.com','豆','#319461'), s('wechat','微信网页版','https://wx.qq.com','微','#30af6e'), s('tieba','百度贴吧','https://tieba.baidu.com','贴','#3f7ee0'), s('v2ex','V2EX','https://www.v2ex.com','V','#596474'), s('jike','即刻','https://web.okjike.com','即','#bd9c1d'), s('juejin','掘金','https://juejin.cn','掘','#397ced'), s('sspai','少数派','https://sspai.com','少','#cb5c58')
  ]},
  { id: 'work', name: '邮箱办公', icon: 'Mail', sites: [
    s('qqmail','QQ邮箱','https://mail.qq.com','邮','#4a8ec6'), s('163mail','网易邮箱','https://mail.163.com','邮','#cb4d4d'), s('gmail','Gmail','https://mail.google.com','M','#d35349'), s('outlook','Outlook','https://outlook.live.com','O','#327cbf'), s('feishu','飞书','https://www.feishu.cn','飞','#467ee1'), s('wps','WPS','https://www.wps.cn','W','#d75b59'), s('notion','Notion','https://www.notion.so','N','#3c4654'), s('tencentdocs','腾讯文档','https://docs.qq.com','文','#387be4'), s('yuque','语雀','https://www.yuque.com','雀','#36a37a'), s('dingtalk','钉钉','https://www.dingtalk.com','钉','#407bdb')
  ]},
  { id: 'ai', name: 'AI 工具', icon: 'Sparkles', sites: [
    s('deepseek','DeepSeek','https://chat.deepseek.com','D','#557be3','擅长推理与编程的 AI 助手'), s('doubao','豆包','https://www.doubao.com','豆','#7089d0','聊天、写作，日常问题随时问'), s('kimi','Kimi','https://www.kimi.com','K','#4a6381','长文阅读、资料整理好帮手'), s('chatgpt','ChatGPT','https://chatgpt.com','✳','#399c82','写作、学习与灵感探索'), s('tongyi','通义千问','https://www.qianwen.com','通','#8972d7'), s('yuanbao','腾讯元宝','https://yuanbao.tencent.com','元','#43a488'), s('claude','Claude','https://claude.ai','C','#b78168'), s('jimeng','即梦AI','https://jimeng.jianying.com','即','#8b67cf'), s('canva','Canva可画','https://www.canva.cn','C','#38a6b0'), s('perplexity','Perplexity','https://www.perplexity.ai','P','#43888d')
  ]},
  { id: 'study', name: '学习成长', icon: 'GraduationCap', sites: [
    s('mooc','中国大学MOOC','https://www.icourse163.org','学','#53a15e'), s('xuexi','学习强国','https://www.xuexi.cn','学','#c8524e'), s('wikipedia','维基百科','https://zh.wikipedia.org','W','#637081'), s('baike','百度百科','https://baike.baidu.com','百','#4485cf'), s('coursera','Coursera','https://www.coursera.org','C','#377bcc'), s('youdao','有道词典','https://dict.youdao.com','有','#d85951'), s('ted','TED','https://www.ted.com','T','#d64745'), s('duolingo','多邻国','https://www.duolingo.com','多','#67a939'), s('cnki','中国知网','https://www.cnki.net','知','#427eb8'), s('github','GitHub','https://github.com','G','#485568')
  ]},
  { id: 'tools', name: '实用工具', icon: 'Wrench', sites: [
    s('baidupan','百度网盘','https://pan.baidu.com','盘','#4c89d8'), s('aliyunpan','阿里云盘','https://www.alipan.com','盘','#a175cf'), s('translate','百度翻译','https://fanyi.baidu.com','译','#487bc7'), s('deepl','DeepL翻译','https://www.deepl.com','D','#3b617e'), s('ilovepdf','PDF工具','https://www.ilovepdf.com/zh-cn','P','#d96865'), s('photopea','在线修图','https://www.photopea.com','P','#429c8c'), s('kuaidi','快递100','https://www.kuaidi100.com','快','#d59335'), s('weather','中国天气网','https://www.weather.com.cn','晴','#4697c2'), s('speedtest','网络测速','https://www.speedtest.net','速','#6965a8'), s('removebg','图片去背景','https://www.remove.bg/zh','图','#687e99')
  ]}
];
export const allSites = categories.flatMap(c => c.sites.map(site => ({ ...site, category: c.name, categoryId: c.id })));
export const defaultIds = ['taobao','jd','bilibili','douyin','zhihu','weibo','qqmail','baidupan','deepseek'];
export const engines = {
  baidu: { name: '百度', url: 'https://www.baidu.com/s?wd=' },
  bing: { name: '必应', url: 'https://www.bing.com/search?q=' },
  google: { name: 'Google', url: 'https://www.google.com/search?q=' }
};
