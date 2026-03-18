const play = require('play-dl');

async function setup() {
  await play.setToken({
    youtube: {
      cookie: ''
    }
  });
}

setup();
