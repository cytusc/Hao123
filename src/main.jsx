import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Search, Settings2, Plus, X, ArrowUpRight, ChevronRight, Grid2X2, Bookmark, Check, ShieldCheck, Sparkles, Newspaper, Clapperboard, ShoppingBag, MessagesSquare, Mail, GraduationCap, Wrench, SlidersHorizontal, RotateCcw, Heart, CloudSun, TrainFront, Package, Languages, MapPin, FileText, Pin, ExternalLink } from 'lucide-react';
import { categories, allSites, defaultIds, engines } from './data';
import './styles.css';

const icons = { Newspaper, Clapperboard, ShoppingBag, MessagesSquare, Mail, Sparkles, GraduationCap, Wrench };
const initial = { pinned: [], hidden: [], custom: [], history: {}, personalized: true, largeText: false, showSearch: true, engine: 'baidu' };
function restore() {
  try {
    const p = JSON.parse(localStorage.getItem('hao123-prefs-v1'));
    if (!p || !Array.isArray(p.pinned) || !Array.isArray(p.hidden) || !Array.isArray(p.custom) || !p.history || typeof p.history !== 'object') return initial;
    return { ...initial, ...p, engine: engines[p.engine] ? p.engine : 'baidu' };
  } catch { return initial; }
}
function Mark({ site, small = false }) { return <span className={`site-mark ${small ? 'small' : ''}`} style={{ '--site-color': site.color }}>{site.mark}</span>; }
function Modal({ title, children, onClose }) {
  const ref = useRef();
  useEffect(() => { const dialog = ref.current; dialog.showModal(); return () => dialog.close(); }, []);
  return <dialog ref={ref} className="modal" onCancel={onClose} onClick={e => { if (e.target === ref.current) onClose(); }}><div className="modal-heading"><h2>{title}</h2><button className="icon-button" aria-label="关闭" onClick={onClose}><X size={21}/></button></div>{children}</dialog>;
}
function App() {
  const [prefs, setPrefs] = useState(restore);
  const [saveFailed, setSaveFailed] = useState(false);
  const [active, setActive] = useState('all');
  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState(null);
  const [modal, setModal] = useState(null);
  const [editing, setEditing] = useState(false);
  const [toast, setToast] = useState('');
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [formError, setFormError] = useState('');
  const contentRef = useRef();
  useEffect(() => { try { localStorage.setItem('hao123-prefs-v1', JSON.stringify(prefs)); setSaveFailed(false); } catch { setSaveFailed(true); } }, [prefs]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(''), 2600); return () => clearTimeout(t); }, [toast]);
  const sites = [...allSites, ...prefs.custom];
  const find = id => sites.find(s => s.id === id);
  const record = id => {
    if (!prefs.personalized) return;
    setPrefs(p => { const old = p.history[id]; const score = old ? old.score * Math.pow(.5, (Date.now() - old.time) / (7 * 86400000)) : 0; return { ...p, history: { ...p.history, [id]: { score: score + 1, time: Date.now() } } }; });
  };
  const learned = prefs.personalized ? Object.entries(prefs.history).sort((a,b) => (b[1].score * Math.pow(.5,(Date.now()-b[1].time)/604800000)) - (a[1].score * Math.pow(.5,(Date.now()-a[1].time)/604800000))).map(([id]) => id) : [];
  const common = [...new Set([...prefs.pinned, ...learned, ...defaultIds])].filter(id => !prefs.hidden.includes(id) && find(id)).slice(0,9).map(find);
  const togglePin = site => {
    const pinned = prefs.pinned.includes(site.id);
    if (!pinned && prefs.pinned.length >= 9) { setToast('最多置顶 9 个网站，请先取消一个置顶'); return; }
    setPrefs(p => ({ ...p, pinned: pinned ? p.pinned.filter(id => id !== site.id) : [...p.pinned, site.id], hidden: p.hidden.filter(id => id !== site.id) }));
    setToast(pinned ? `已取消置顶${site.name}` : `已置顶${site.name}`);
  };
  const link = (site, className = '', children = null) => <a href={site.url} target="_blank" rel="noopener noreferrer" className={className} onClick={() => record(site.id)}>{children || site.name}</a>;
  const chooseCategory = id => { setActive(id); setSubmitted(null); };
  const search = e => { e.preventDefault(); if (!query.trim()) return; setSubmitted(query.trim()); requestAnimationFrame(() => contentRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })); };
  const results = submitted === null ? [] : sites.filter(s => `${s.name} ${s.description || ''} ${s.category || ''} ${s.url}`.toLowerCase().includes(submitted.toLowerCase()));
  const addCustom = e => {
    e.preventDefault();
    let parsed;
    try { parsed = new URL(url.includes('://') ? url : `https://${url}`); if (!['http:','https:'].includes(parsed.protocol) || !parsed.hostname.includes('.')) throw new Error(); } catch { setFormError('请输入有效的网站地址，例如 https://www.example.com'); return; }
    if (!name.trim()) { setFormError('请填写网站名称'); return; }
    if (prefs.pinned.length >= 9) { setFormError('最多置顶 9 个网站，请先取消一个置顶'); return; }
    const existing = sites.find(s => new URL(s.url).hostname === parsed.hostname);
    if (existing) { if (!prefs.pinned.includes(existing.id)) togglePin(existing); setModal(null); return; }
    const site = { id: `custom-${Date.now()}`, name: name.trim(), url: parsed.href, mark: name.trim()[0], color: '#5577ba' };
    setPrefs(p => ({ ...p, custom: [...p.custom, site], pinned: [...p.pinned, site.id] })); setModal(null); setToast(`已添加${site.name}`);
  };
  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 6 ? '夜深了' : hour < 11 ? '早上好' : hour < 14 ? '中午好' : hour < 18 ? '下午好' : '晚上好';
  const visibleCategories = active === 'all' ? categories : categories.filter(c => c.id === active);
  return <div className={prefs.largeText ? 'app large-text' : 'app'}>
    <header className="header"><div className="header-inner">
      <a href="#" className="brand" aria-label="好123轻导航首页" onClick={() => { chooseCategory('all'); setQuery(''); }}><span className="brand-symbol"><Grid2X2 size={23} strokeWidth={2.5}/></span><span className="brand-name">好<span>123</span></span><span className="brand-divider"/><span className="brand-caption">轻导航</span></a>
      <nav className="top-nav" aria-label="主导航"><button className={active === 'all' && submitted === null ? 'selected' : ''} onClick={() => chooseCategory('all')}>网址导航</button><button className={active === 'ai' && submitted === null ? 'selected' : ''} onClick={() => chooseCategory('ai')}>AI 工具<span className="new-dot"/></button><button onClick={() => { setEditing(true); document.getElementById('common').scrollIntoView({ behavior:'smooth' }); }}>我的常用</button></nav>
      <button className="settings-button" aria-label="首页设置" onClick={() => setModal('settings')}><Settings2 size={17}/><span>首页设置</span></button>
    </div></header>

    <section className="search-stage"><div className="stage-inner">
      <div className="date-line"><span>{now.getMonth()+1}月{now.getDate()}日</span><span>{['星期日','星期一','星期二','星期三','星期四','星期五','星期六'][now.getDay()]}</span><span className="date-separator"/><span>今天，也从这里开始</span></div>
      <h1>{greeting}，上网简单一点。</h1>
      {prefs.showSearch ? <div className="search-area"><div className="engine-tabs" aria-label="搜索引擎">{Object.entries(engines).map(([id, engine]) => <button key={id} aria-pressed={prefs.engine === id} className={prefs.engine === id ? 'active' : ''} onClick={() => setPrefs(p => ({ ...p, engine: id }))}>{engine.name}</button>)}</div>
      <form className="search-box" onSubmit={search}><Search size={22}/><input aria-label="搜索网站或关键词" value={query} onChange={e => setQuery(e.target.value)} placeholder="搜网站，或搜你想知道的"/><kbd aria-hidden="true">↵</kbd><button type="submit">搜索一下</button></form>
      <div className="search-suggestions"><span>便捷入口</span>{['铁路12306','中国天气网','快递100','百度翻译'].map(n => { const site = allSites.find(s => s.name === n); return <React.Fragment key={n}>{link(site)}</React.Fragment>; })}</div></div> : <button className="restore-search" onClick={() => setPrefs(p => ({ ...p, showSearch:true }))}><Search size={18}/>显示搜索框</button>}

    </div></section>

    <main className="main-container">
      <section className="common-section" id="common" aria-labelledby="common-title"><div className="section-heading"><div className="title-group"><Bookmark size={19}/><h2 id="common-title">我的常用</h2><span className="section-note">{prefs.personalized ? '常去的网站，就在手边' : '已关闭自动排序'}</span></div><button className="text-button" onClick={() => setEditing(v => !v)}>{editing ? <Check size={15}/> : <SlidersHorizontal size={15}/>} {editing ? '完成' : '管理'}</button></div>
        <div className="common-grid">{common.map(site => <div className="common-item" key={site.id}>{link(site,'common-link',<><Mark site={site}/><span>{site.name}</span>{prefs.pinned.includes(site.id) && <Pin className="pinned-mark" size={11}/>}</>)}{editing && <div className="edit-controls"><button aria-label={`${prefs.pinned.includes(site.id) ? '取消置顶' : '置顶'}${site.name}`} className={prefs.pinned.includes(site.id) ? 'is-pinned' : ''} onClick={() => togglePin(site)}><Pin size={12}/></button><button aria-label={`移除${site.name}`} onClick={() => { setPrefs(p => ({ ...p, hidden:[...p.hidden,site.id], pinned:p.pinned.filter(id => id !== site.id) })); setToast(`已从常用移除${site.name}`); }}><X size={13}/></button></div>}</div>)}<button className="add-common" onClick={() => { setName('');setUrl('');setFormError('');setModal('add'); }}><span><Plus size={23}/></span>添加网站</button></div>
      </section>

      <div className="directory-layout" ref={contentRef}><section className="directory" aria-labelledby="directory-title">
        <div className="directory-heading"><div className="title-group"><Grid2X2 size={19}/><h2 id="directory-title">{submitted !== null ? '搜索结果' : '发现好网站'}</h2></div><span className="directory-caption">精选网站，放心直达</span></div>
        {submitted === null ? <><nav className="category-tabs" aria-label="网站分类"><button className={active === 'all' ? 'active' : ''} aria-pressed={active === 'all'} onClick={() => chooseCategory('all')}>全部分类</button>{categories.map(c => <button key={c.id} className={active === c.id ? 'active' : ''} aria-pressed={active === c.id} onClick={() => chooseCategory(c.id)}>{c.name.replace('新闻资讯','新闻').replace('视频娱乐','视频').replace('购物生活','购物').replace('社交社区','社交').replace('邮箱办公','办公').replace('学习成长','学习').replace('实用工具','工具')}</button>)}</nav>
        <div className="category-list">{visibleCategories.map(c => { const Icon = icons[c.icon]; return <div className="category-row" key={c.id}><button className="category-label" onClick={() => chooseCategory(c.id)}><Icon size={17}/><span>{c.name}</span></button><div className="category-sites">{c.sites.map((site,i) => <React.Fragment key={site.id}>{link(site, i === 0 ? 'featured-site' : '', <>{site.name}{site.id === 'deepseek' && <span className="tiny-tag">热门</span>}</>)}</React.Fragment>)}</div></div>; })}</div>
        {active !== 'all' && <div className="channel-details"><h3>{categories.find(c => c.id === active)?.name}精选</h3><div className="channel-grid">{visibleCategories[0]?.sites.map(site => <div className="channel-site" key={site.id}>{link(site,'channel-link',<><Mark site={site} small/><span>{site.name}</span><ArrowUpRight size={15}/></>)}<button className="icon-button" aria-label={`置顶${site.name}`} onClick={() => togglePin(site)}>{prefs.pinned.includes(site.id) ? <Check size={16}/> : <Plus size={16}/>}</button></div>)}</div></div>}</> : <div className="search-results"><div className="results-summary"><span>“{submitted}” 找到 {results.length} 个网站</span><button className="text-button" onClick={() => setSubmitted(null)}>返回分类</button></div>{results.length ? results.map(site => <div className="result-item" key={site.id}><Mark site={site} small/><div>{link(site,'result-name')}<p>{site.description || site.category || '自定义网站'} <span>{new URL(site.url).hostname}</span></p></div><button className="icon-button" onClick={() => togglePin(site)} aria-label={`置顶${site.name}`}><Bookmark size={17}/></button>{link(site,'result-visit',<>访问<ArrowUpRight size={15}/></>)}</div>) : <div className="empty-state"><Search size={28}/><h3>还没有找到这个网站</h3><p>试试更短的名称，或用{engines[prefs.engine].name}搜索。</p></div>}<a className="web-search" href={`${engines[prefs.engine].url}${encodeURIComponent(submitted)}`} target="_blank" rel="noopener noreferrer"><Search size={17}/>用{engines[prefs.engine].name}搜索“{submitted}”<ExternalLink size={15}/></a></div>}
        <div className="directory-bottom"><ShieldCheck size={15}/><span>外链在新窗口打开，首页始终在这里</span><button onClick={() => setModal('about')}>关于收录<ChevronRight size={13}/></button></div>
      </section>

      <aside className="sidebar"><section className="daily-tools"><div className="side-heading"><h2>日常小帮手</h2><Wrench size={17}/></div><div className="tool-grid">{[['weather','查天气',CloudSun],['12306','买车票',TrainFront],['kuaidi','查快递',Package],['translate','翻译',Languages],['amap','看地图',MapPin],['ilovepdf','转 PDF',FileText]].map(([id,label,ToolIcon]) => <React.Fragment key={id}>{link(find(id),'tool-link',<><span className={`tool-symbol tool-${id}`}><ToolIcon size={24} strokeWidth={1.6}/></span><span>{label}</span></>)}</React.Fragment>)}</div></section>
      <section className="ai-discovery"><div className="side-heading"><h2><Sparkles size={17}/>试试 AI 新工具</h2><button aria-label="查看全部AI工具" onClick={() => chooseCategory('ai')}><ChevronRight size={17}/></button></div><p className="side-description">写点东西，找点灵感，省点时间。</p>{['deepseek','doubao','kimi'].map(id => { const site = find(id); return <div className="ai-site" key={id}>{link(site,'ai-site-link',<><Mark site={site} small/><div><strong>{site.name}</strong><p>{site.description}</p></div><ArrowUpRight size={15}/></>)}</div>; })}<button className="explore-ai" onClick={() => chooseCategory('ai')}>发现更多 AI 工具<ChevronRight size={14}/></button></section>
      <div className="quiet-note"><span className="note-icon"><Heart size={18}/></span><div><strong>清清爽爽，刚刚好。</strong><p>少一点打扰，多一点顺手。<br/>让首页回到上网的起点。</p></div></div></aside></div>
      {saveFailed && <p className="storage-warning">浏览器未允许保存数据，当前设置仅在本次打开时有效。</p>}
      <footer className="footer"><div><span className="footer-brand">好123</span><span>一个简单好用的上网起点</span></div><div><button onClick={() => setModal('about')}>关于轻导航</button><button onClick={() => setModal('settings')}>隐私与设置</button><span>前端体验版</span></div></footer>
    </main>

    {modal === 'add' && <Modal title="添加常用网站" onClose={() => setModal(null)}><p className="modal-description">选一个常用网站，或添加你自己的网址。</p><div className="pick-sites">{defaultIds.map(id => { const site = find(id); return <button key={id} className={prefs.pinned.includes(id) ? 'picked' : ''} onClick={() => togglePin(site)}><Mark site={site} small/>{site.name}{prefs.pinned.includes(id) ? <Check size={14}/> : <Plus size={14}/>}</button>; })}</div><form className="add-form" onSubmit={addCustom}><h3>自定义网站</h3><label>网站名称<input value={name} onChange={e => setName(e.target.value)} placeholder="例如：我的博客" maxLength={16} required/></label><label>网站地址<input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://www.example.com" required/></label>{formError && <p className="form-error" role="alert">{formError}</p>}<button className="primary-button" type="submit"><Plus size={16}/>添加到常用</button></form></Modal>}
    {modal === 'settings' && <Modal title="让首页更顺手" onClose={() => setModal(null)}><p className="modal-description">设置保存在当前浏览器，无需登录。</p>{[['personalized','自动整理常用','根据你在这里的点击，把常去的网站排在前面。'],['largeText','大字模式','放大网站名称，阅读更轻松。'],['showSearch','显示搜索框','在首页保留搜索框和搜索引擎选择。']].map(([key,title,description]) => <div className="setting-row" key={key}><div><strong>{title}</strong><p>{description}</p></div><button role="switch" aria-checked={prefs[key]} aria-label={title} className={`switch ${prefs[key] ? 'on' : ''}`} onClick={() => setPrefs(p => ({ ...p, [key]:!p[key] }))}><span/></button></div>)}<div className="setting-row"><div><strong>默认搜索引擎</strong><p>联网搜索时使用的搜索引擎。</p></div><select aria-label="默认搜索引擎" value={prefs.engine} onChange={e => setPrefs(p => ({ ...p, engine:e.target.value }))}>{Object.entries(engines).map(([id,e]) => <option key={id} value={id}>{e.name}</option>)}</select></div><div className="privacy-note"><ShieldCheck size={18}/><p>点击记录仅保存在你的浏览器，不会上传。关闭自动整理后不再记录点击，手动置顶仍保留。</p></div><button className="reset-button" onClick={() => { setPrefs(p => ({ ...p, history:{} })); setToast('已清空点击记录'); }}><RotateCcw size={15}/>清空点击记录</button><button className="reset-button" onClick={() => { setPrefs(p => ({ ...p, hidden:[] })); setToast('已恢复移除的常用网站'); }}><Bookmark size={15}/>恢复移除的常用网站</button><button className="primary-button settings-done" onClick={() => setModal(null)}>完成设置</button></Modal>}
    {modal === 'about' && <Modal title="关于好123轻导航" onClose={() => setModal(null)}><div className="about-body"><span className="brand-symbol"><Grid2X2 size={26}/></span><h3>一个简单好用的上网起点。</h3><p>精选新闻、视频、购物、办公和学习等常用网站，让你少翻找、快一步。</p><p>这是第一版前端原型。目录使用精选公开网址，常用管理与设置保存在本地；账号同步、自动巡检和投稿审核将在后续接入。</p><p>搜索会先查找站内网站，也可以继续使用你选择的搜索引擎。外部网站的服务与内容由其运营方提供。</p></div></Modal>}
    {toast && <div className="toast" role="status"><Check size={17}/>{toast}</div>}
  </div>;
}
createRoot(document.getElementById('root')).render(<App/>);
