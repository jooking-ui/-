require('dotenv').config();
const express = require('express');
const cors = require('cors');
const Parser = require('rss-parser');

const app = express();
app.use(cors());

const parser = new Parser();

// 서버 확인용
app.get('/', (req, res) => {
  res.send('OK');
});

async function getNews() {
  const globalFeeds = [
    'https://www.reuters.com/technology/rss',
    'https://www.theverge.com/rss/index.xml',
    'https://venturebeat.com/category/ai/feed/',
    'https://www.artificialintelligence-news.com/feed/',
    'https://feeds.arstechnica.com/arstechnica/technology-lab', // 🔥 추가 (좋음)
  ];

  const koreaFeeds = [
    'https://rss.etnews.com/Section901.xml',
    'https://feeds.feedburner.com/etnews/all',
  ];

  const [globalResults, koreaResults] = await Promise.all([
    Promise.allSettled(globalFeeds.map(url => parser.parseURL(url))),
    Promise.allSettled(koreaFeeds.map(url => parser.parseURL(url))),
  ]);

  // 글로벌
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

  // 국내
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

  // 🔥 핵심: 날짜 없어도 살리고 정렬
  const allNews = [...globalItems, ...koreaItems];

  allNews.sort((a, b) => {
    const dateA = a.date ? new Date(a.date).getTime() : 0;
    const dateB = b.date ? new Date(b.date).getTime() : 0;
    return dateB - dateA;
  });

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