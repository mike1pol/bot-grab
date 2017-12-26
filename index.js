const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
const Telegraf = require('telegraf');

const TELEGRAM_API = process.env.TELEGRAM_API;

const app = new Telegraf(TELEGRAM_API);
function scrape(search) {
  return new Promise((resolve, reject) => {
    let browser = null;
    let track_url = null;
    let send = false;
    setTimeout(() => {
      if (!send) {
        if (browser) {
          browser.close();
        }
        reject('timeout');
      }
    }, 10000);
    puppeteer.launch({
      headless: true,
      executablePath: 'google-chrome-unstable',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    })
      .then((_browser) => {
        browser = _browser;
        return browser.newPage();
      })
      .then((page) => {
        let content = null;
        page.on('request', (request) => {
          if (request.url.includes('get-mp3') || request.url.includes('/get/')) {
            send = true;
            track_url = request.url;
            resolve({content, track_url});
            browser.close();
          }
          request.continue();
        });
        return page.setRequestInterception(true)
          .then(() => page.goto(`https://music.yandex.ru/search?text=${search}&type=tracks`, {waitUntil: 'domcontentloaded'}))
          .then(() => page.content())
          .then((_content) => {
            content = cheerio.load(_content);
            return Promise.resolve();
          })
          .then(() => page.click('.d-track.typo-track'))
          .then(() => page.click('button.button-play'));
      })
      .catch((error) => {
        if (browser) {
          browser.close();
        }
        send = true;
        reject(error);
      });
  });
}

function search(search) {
  return scrape(search)
    .then((data) => {
      if (data) {
        const {content, track_url} = data;
        const track = content(content('.d-track.typo-track').eq(0));
        const track_id = track.find('button.button_round.button_action.button-play').attr('data-idx');
        const cover = `https:${track.find('img.album-cover').attr('src').replace('50x50', '400x400')}`;
        const artist = track.find('.d-track__artists').text();
        const title = track.find('.d-track__title').text();
        const duration = track.find('.typo-track.deco-typo-secondary').text();
        return {
          id: track_id,
          url: track_url,
          cover,
          artist,
          title,
          duration
        };
      } else {
        throw new Error('not found');
      }
    });
}

app.on('message', ({reply, message: {text}}) => {
  search(text)
    .then((track) => {
      reply(JSON.stringify(track));
    })
    .catch((error) => {
      console.log(error);
      reply({status: 404, message: 'not found'});
    });
});


app.startPolling();
