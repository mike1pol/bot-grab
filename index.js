const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
const Telegraf = require('telegraf');
const express = require('express');

const server = express();
const port = process.env.NODE_PORT || 3000;
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
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    })
      .then((_browser) => {
        browser = _browser;
        return browser.newPage();
      })
      .then((page) => {
        let content = null;
        page.on('request', (request) => {
          const url = request.url();
          if (url.includes('get-mp3') || url.includes('/get/')) {
            send = true;
            track_url = url;
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
            return page.evaluate(() => document.querySelector('div.d-track.typo-track:first-child').click());
          })
          .then(() => page.evaluate(() => document.querySelector('div.d-track.typo-track:first-child .d-track__play').style.display = 'block'))
          .then(() => page.evaluate(() => document.querySelector('button.button_round.button_action.button-play').click()))
          .then(() => page.bringToFront());
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

server.get('/search', ({query: {query}}, res) => {
    search(query)
    .then((track) => {
      res.json(track);
    })
    .catch((error) => {
      console.log(error);
      res.json({status: 400, message: error.message || 'not found'});
    });

});

server.listen(port, () => {
  console.log(`server started http://localhost:${port}`);
});
