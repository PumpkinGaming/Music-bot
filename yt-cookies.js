const play = require('youtube-dl-exec');

async function setup() {
  await play.setToken({
    youtube: {
      cookie: ''
    }
  });
}

setup();
