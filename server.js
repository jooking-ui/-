require('dotenv').config();
const express = require('express');
const cors = require('cors');
const Parser = require('rss-parser');

const app = express();
app.use(cors());
app.use(express.json());
const parser = new Parser({
  headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RSSReader/1.0)' },
  timeout: 10000,
});

app.get('/', (req, res) => res.send('OK'));

// ─── 번역 함수 (MyMemory API) ───
async function translate(text) {
  if (!text || text.trim() === '') return text;
  if (/[\uAC00-\uD7A3]/.test(text)) return text;
  const truncated = text.slice(0, 500);
  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(truncated)}&langpair=en|ko`;
    const res = await fetch(url, { signal: AbortSignal.timeout(7000) });
    const data = await res.json();
    if (data.responseStatus === 200 && data.responseData?.translatedText) {
      const result = data.responseData.translatedText;
      if (result.includes('MYMEMORY WARNING')) return text;
      return result;
    }
  } catch (e) {
    console.log('⚠️ 번역 실패:', e.message);
  }
  return text;
}


// ─── TOP 5 중요도 점수 ───
function calcScore(item) {
  const text = ((item.title || '') + ' ' + (item.content || '')).toLowerCase();
  let score = 0;

  const keywords = [
    // HBF 최우선
    { kw: 'hbf',                  s: 100 },
    { kw: 'high bandwidth flash', s: 100 },
    // HBM
    { kw: 'hbm4',    s: 60 }, { kw: 'hbm3e', s: 55 },
    { kw: 'hbm',     s: 50 },
    // 반도체 회사
    { kw: 'sk hynix', s: 45 }, { kw: 'tsmc',    s: 40 },
    { kw: 'micron',   s: 38 }, { kw: 'nvidia',  s: 35 },
    { kw: '삼성',     s: 35 }, { kw: 'samsung', s: 30 },
    { kw: 'intel',    s: 28 }, { kw: 'amd',     s: 28 },
    // AI 키워드
    { kw: 'gpt-5',    s: 40 }, { kw: 'claude',  s: 38 },
    { kw: 'gemini',   s: 35 }, { kw: 'llm',     s: 28 },
    { kw: 'agent',    s: 25 }, { kw: 'humanoid',s: 30 },
    { kw: 'robot',    s: 25 }, { kw: 'funding', s: 18 },
  ];

  keywords.forEach(({ kw, s }) => { if (text.includes(kw)) score += s; });

  // 최신 기사 가산점
  if (item.date) {
    const h = (Date.now() - new Date(item.date).getTime()) / 3600000;
    if (h < 24)  score += 25;
    else if (h < 48) score += 15;
    else if (h < 72) score += 5;
  }
  return score;
}

// ─── 회사명 키워드 매핑 ───
const COMPANY_FILTERS = [
  { keywords: ['nvidia', 'nvda'],              tag: '🟢 Nvidia' },
  { keywords: ['intel'],                        tag: '🔵 Intel' },
  { keywords: ['amd', 'advanced micro'],        tag: '🔴 AMD' },
  { keywords: ['qualcomm'],                     tag: '🟣 Qualcomm' },
  { keywords: ['tsmc', 'taiwan semiconductor'], tag: '🟡 TSMC' },
  { keywords: ['broadcom'],                     tag: '🟠 Broadcom' },
  { keywords: ['micron'],                       tag: '🔵 Micron' },
  { keywords: ['google', 'alphabet', 'gemini', 'deepmind'], tag: '🔵 Google' },
  { keywords: ['tesla', 'optimus robot'],       tag: '⚫ Tesla' },
  { keywords: ['microsoft', 'copilot', 'azure ai'], tag: '🔵 Microsoft' },
  { keywords: ['apple', 'siri'],                tag: '⚪ Apple' },
  { keywords: ['hbf', 'high bandwidth flash'],  tag: '🔴 HBF' },
  { keywords: ['hbm', 'hbm4', 'hbm3'],         tag: '💾 HBM' },
  { keywords: ['openai', 'gpt', 'chatgpt'],     tag: '🤖 OpenAI' },
  { keywords: ['anthropic', 'claude'],          tag: '🟣 Anthropic' },
];

function getCompanyTag(title, content) {
  const text = ((title || '') + ' ' + (content || '')).toLowerCase();
  for (const { keywords, tag } of COMPANY_FILTERS) {
    if (keywords.some(kw => text.includes(kw))) return tag;
  }
  return '🌐 글로벌 AI';
}

// ─── 뉴스 수집 ───
async function fetchAllNews() {
  // 클라우드에서도 막히지 않는 직접 RSS 피드
  const globalFeeds = [
    'https://venturebeat.com/category/ai/feed/',
    'https://the-decoder.com/feed/',
    'https://www.unite.ai/feed/',
    'https://www.artificialintelligence-news.com/feed/',
    'https://feeds.arstechnica.com/arstechnica/technology-lab',
    'https://semianalysis.com/feed/',
    'https://blocksandfiles.com/feed/',
    'https://www.anandtech.com/rss/',
    'https://thenextweb.com/feed/',
  ];

  const koreaFeeds = [
    'https://rss.etnews.com/Section901.xml',
    'https://www.aitimes.com/rss/allArticle.xml',
    'https://www.aitimes.kr/rss/allArticle.xml',
    'https://rss.zdnet.co.kr/zdnet/category/news',
  ];

  // 관련 키워드 (이 중 하나라도 있으면 포함)
  const INCLUDE_KEYWORDS = [
    'ai', 'artificial intelligence', 'llm', 'gpu', 'chip',
    'semiconductor', 'hbm', 'hbf', 'nvidia', 'intel', 'amd',
    'qualcomm', 'tsmc', 'broadcom', 'micron', 'google', 'tesla',
    'microsoft', 'apple', 'openai', 'anthropic', 'robot', 'memory',
    '인공지능', '반도체', '삼성', 'sk하이닉스', '네이버', '카카오',
  ];

  const [globalResults, koreaResults] = await Promise.allSettled([
    Promise.allSettled(globalFeeds.map(url => parser.parseURL(url))),
    Promise.allSettled(koreaFeeds.map(url => parser.parseURL(url))),
  ]);

  const seen = new Set();
  const items = [];

  // 글로벌 피드 처리
  const gResults = globalResults.status === 'fulfilled' ? globalResults.value : [];
  gResults.forEach((result, i) => {
    if (result.status !== 'fulfilled') {
      console.log(`⚠️ 글로벌 피드 실패 [${globalFeeds[i]}]:`, result.reason?.message);
      return;
    }
    result.value.items.forEach(item => {
      const title = item.title || '';
      const content = (item.contentSnippet || item.summary || '').slice(0, 300);
      const text = (title + ' ' + content).toLowerCase();

      if (seen.has(title)) return;
      if (!INCLUDE_KEYWORDS.some(kw => text.includes(kw))) return;
      seen.add(title);

      items.push({
        title,
        titleKo: null,
        link: item.link || '',
        content,
        contentKo: null,
        tag: getCompanyTag(title, content),
        region: '글로벌',
        date: item.pubDate || item.isoDate || null,
        translated: false,
      });
    });
  });

  // 국내 피드 처리
  const kResults = koreaResults.status === 'fulfilled' ? koreaResults.value : [];
  kResults.forEach((result, i) => {
    if (result.status !== 'fulfilled') {
      console.log(`⚠️ 국내 피드 실패 [${koreaFeeds[i]}]:`, result.reason?.message);
      return;
    }
    result.value.items.forEach(item => {
      const title = item.title || '';
      if (seen.has(title)) return;
      seen.add(title);
      items.push({
        title,
        titleKo: title,
        link: item.link || '',
        content: (item.contentSnippet || item.summary || '').slice(0, 300),
        contentKo: (item.contentSnippet || item.summary || '').slice(0, 300),
        tag: getCompanyTag(title, item.contentSnippet || '') || '🇰🇷 국내 AI',
        region: '한국',
        date: item.pubDate || item.isoDate || null,
        translated: true,
      });
    });
  });

  items.sort((a, b) => {
    const da = a.date ? new Date(a.date).getTime() : 0;
    const db = b.date ? new Date(b.date).getTime() : 0;
    return db - da;
  });

  console.log(`✅ 총 ${items.length}개 수집 (글로벌 + 국내)`);
  return items.slice(0, 40);
}

// ─── 캐시 ───
let cache = { news: [], top5: [], timestamp: 0 };
const CACHE_TTL = 10 * 60 * 1000;

async function getOrFetch() {
  if (cache.news.length && Date.now() - cache.timestamp < CACHE_TTL) {
    console.log('📦 캐시 사용');
    return cache;
  }

  const news = await fetchAllNews();

  // TOP 5 선정
  const top5 = [...news]
    .map(n => ({ ...n, _score: calcScore(n) }))
    .sort((a, b) => b._score - a._score)
    .slice(0, 5);

  console.log('🏆 TOP 5:');
  top5.forEach((n, i) => console.log(`  ${i+1}. [${n._score}점] ${n.title?.slice(0, 55)}`));

  // TOP 5 번역 (우선)
  await Promise.all(top5.map(async n => {
    if (!n.translated) {
      n.titleKo   = await translate(n.title);
      n.contentKo = await translate(n.content.slice(0, 300));
      n.translated = true;
    }
  }));

  // 나머지 백그라운드 번역
  ;(async () => {
    for (const n of news) {
      if (!n.translated) {
        n.titleKo   = await translate(n.title);
        n.contentKo = await translate(n.content.slice(0, 200));
        n.translated = true;
        await new Promise(r => setTimeout(r, 400));
      }
    }
    console.log('✅ 전체 번역 완료');
  })();

  cache = { news, top5, timestamp: Date.now() };
  return cache;
}

// ─── 엔드포인트 ───
const toDisplay = n => ({
  ...n,
  displayTitle:   n.titleKo   || n.title,
  displayContent: n.contentKo || n.content,
});

app.get('/news', async (req, res) => {
  try {
    const { news } = await getOrFetch();
    res.json(news.map(toDisplay));
  } catch (err) {
    console.error('❌ /news:', err);
    res.status(500).json({ error: '뉴스 가져오기 실패' });
  }
});

app.get('/top5', async (req, res) => {
  try {
    const { top5 } = await getOrFetch();
    res.json(top5.map(toDisplay));
  } catch (err) {
    console.error('❌ /top5:', err);
    res.status(500).json({ error: 'TOP5 실패' });
  }
});

app.post('/refresh', (req, res) => {
  cache = { news: [], top5: [], timestamp: 0 };
  res.json({ ok: true });
});

app.listen(3000, '0.0.0.0', async () => {
  console.log('🔥 서버 실행중 http://0.0.0.0:3000');
  console.log('📡 뉴스 사전 수집 시작...');
  try {
    await getOrFetch();
    console.log('✅ 사전 수집 완료 — 앱 연결 준비됨');
  } catch(e) {
    console.log('❌ 사전 수집 실패:', e.message);
  }
});