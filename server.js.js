require('dotenv').config();
const express = require('express');
const cors = require('cors');
const Parser = require('rss-parser');
const app = express();
app.use(cors());
const parser = new Parser();

app.get('/', (req, res) => {
  res.send('OK');
});

async function getNews() {
  const globalFeeds = [
    'https://techcrunch.com/tag/artificial-intelligence/feed/',
    'https://venturebeat.com/category/ai/feed/',
    'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml',
    'https://www.hdfgroup.org/feed/',
  ];
  const koreaFeeds = [
    'https://rss.etnews.com/Section901.xml',
    'https://feeds.feedburner.com/etnews/all',
  ];
  const [globalResults, koreaResults] = await Promise.all([
    Promise.allSettled(globalFeeds.map(url => parser.parseURL(url))),
    Promise.allSettled(koreaFeeds.map(url => parser.parseURL(url))),
  ]);
  const globalItems = globalResults
    .filter(r => r.status === 'fulfilled')
    .flatMap(r => r.value.items)
    .slice(0, 10)
    .map(item => ({
      title: item.title,
      link: item.link,
      content: item.contentSnippet || item.summary || '내용 없음',
      tag: '🌐 글로벌 AI',
    }));
  const koreaItems = koreaResults
    .filter(r => r.status === 'fulfilled')
    .flatMap(r => r.value.items)
    .slice(0, 10)
    .map(item => ({
      title: item.title,
      link: item.link,
      content: item.contentSnippet || item.summary || '내용 없음',
      tag: '🇰🇷 국내 AI',
    }));
  return [...globalItems, ...koreaItems];
}

app.get('/news', async (req, res) => {
  const news = await getNews();
  res.json(news);
});

app.listen(process.env.PORT || 3000, '0.0.0.0', () => {
  console.log('🔥 서버 실행중');
});