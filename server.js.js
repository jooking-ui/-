require('dotenv').config();
const express = require('express');
const cors = require('cors');
const Parser = require('rss-parser');

const app = express();
app.use(cors());

const parser = new Parser();

// 기본 확인용
app.get('/', (req, res) => {
  res.send('OK');
});

async function getNews() {
  const globalFeeds = [
    'https://www.reuters.com/technology/rss', // 🔥 최신 강함
    'https://www.theverge.com/rss/index.xml',
    'https://venturebeat.com/category/ai/feed/',
    'https://www.artificialintelligence-news.com/feed/',
  ];

  const koreaFeeds = [
    'https://rss.etnews.com/Section901.xml',
    'https://feeds.feedburner.com/etnews/all',
  ];

  // 병렬 요청
  const [globalResults, koreaResults] = await Promise.all([
    Promise.allSettled(globalFeeds.map(url => parser.parseURL(url))),
    Promise.allSettled(koreaFeeds.map(url => parser.parseURL(url))),
  ]);

  // 글로벌 뉴스
  const globalItems = globalResults
    .filter(r => r.status === 'fulfilled')
    .flatMap(r => r.value.items)
    .map(item => ({
      title: item.title,
      link: item.link,
      content: item.contentSnippet || item.summary || '내용 없음',
      tag: '🌐 글로벌 AI',
      date: item.pubDate || item.isoDate || null,
    }));

  // 국내 뉴스
  const koreaItems = koreaResults
    .filter(r => r.status === 'fulfilled')
    .flatMap(r => r.value.items)
    .map(item => ({
      title: item.title,
      link: item.link,
      content: item.contentSnippet || item.summary || '내용 없음',
      tag: '🇰🇷 국내 AI',
      date: item.pubDate || item.isoDate || null,
    }));

  // 🔥 합치고 최신순 정렬 (핵심)
  const allNews = [...globalItems, ...koreaItems]
    .filter(item => item.date) // 날짜 없는거 제거
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  // 🔥 최신 20개만
  return allNews.slice(0, 20);
}

// 뉴스 API
app.get('/news', async (req, res) => {
  try {
    const news = await getNews();
    res.json(news);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '뉴스 가져오기 실패' });
  }
});

// 서버 실행
app.listen(process.env.PORT || 3000, '0.0.0.0', () => {
  console.log('🔥 서버 실행중');
});