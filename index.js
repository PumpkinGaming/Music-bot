const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  getVoiceConnection,
  StreamType,
} = require('@discordjs/voice');
const play = require('play-dl');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

const prefix = '!';

// Struktura na serwer: { queue: [], player, connection, currentSong }
const servers = new Map();

function getServerData(guildId) {
  if (!servers.has(guildId)) {
    servers.set(guildId, {
      queue: [],
      player: null,
      connection: null,
      currentSong: null,
      looping: false,
    });
  }
  return servers.get(guildId);
}

async function playSong(message, data) {
  if (data.queue.length === 0) {
    data.currentSong = null;
    if (data.connection) {
      setTimeout(() => {
        // Rozłącz po 30s bezczynności
        const conn = getVoiceConnection(message.guild.id);
        if (conn && (!data.currentSong)) {
          conn.destroy();
          servers.delete(message.guild.id);
        }
      }, 30000);
    }
    return;
  }

  const song = data.looping && data.currentSong ? data.currentSong : data.queue.shift();
  data.currentSong = song;

  try {
    const stream = await play.stream(song.url, { quality: 2 });
    const resource = createAudioResource(stream.stream, {
      inputType: stream.type,
    });

    data.player.play(resource);

    const embed = new EmbedBuilder()
      .setColor('#FF0000')
      .setTitle('▶️ Teraz gram')
      .setDescription(`**[${song.title}](${song.url})**`)
      .addFields(
        { name: '⏱️ Długość', value: song.duration, inline: true },
        { name: '👤 Dodał', value: song.requestedBy, inline: true },
        { name: '📋 W kolejce', value: `${data.queue.length} piosenek`, inline: true }
      )
      .setThumbnail(song.thumbnail);

    message.channel.send({ embeds: [embed] });
  } catch (err) {
    console.error(err);
    message.channel.send(`❌ Błąd odtwarzania: **${song.title}**. Pomijam...`);
    playSong(message, data);
  }
}

client.on('ready', () => {
  console.log(`✅ Bot zalogowany jako ${client.user.tag}`);
  client.user.setActivity('!help | 🎵', { type: 2 }); // type 2 = Listening
});

client.on('messageCreate', async (message) => {
  if (!message.content.startsWith(prefix) || message.author.bot) return;

  const args = message.content.slice(prefix.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();
  const data = getServerData(message.guild.id);

  // ───────────────── !play ─────────────────
  if (command === 'play' || command === 'p') {
    const voiceChannel = message.member?.voice.channel;
    if (!voiceChannel) {
      return message.reply('❌ Musisz być na kanale głosowym!');
    }

    const query = args.join(' ');
    if (!query) return message.reply('❌ Podaj URL lub nazwę piosenki!');

    await message.channel.sendTyping();

    try {
      let songInfo;

      // Sprawdź czy to URL YouTube
      if (play.yt_validate(query) === 'video') {
        const info = await play.video_info(query);
        songInfo = {
          title: info.video_details.title,
          url: info.video_details.url,
          duration: info.video_details.durationRaw,
          thumbnail: info.video_details.thumbnails[0]?.url || '',
          requestedBy: message.author.username,
        };
      } else if (play.yt_validate(query) === 'playlist') {
        // Obsługa playlisty
        const playlist = await play.playlist_info(query, { incomplete: true });
        const videos = await playlist.all_videos();
        let added = 0;
        for (const video of videos) {
          data.queue.push({
            title: video.title,
            url: video.url,
            duration: video.durationRaw,
            thumbnail: video.thumbnails[0]?.url || '',
            requestedBy: message.author.username,
          });
          added++;
        }

        const embed = new EmbedBuilder()
          .setColor('#FF0000')
          .setTitle('📋 Playlista dodana do kolejki')
          .setDescription(`Dodano **${added}** piosenek z playlisty **${playlist.title}**`);

        message.channel.send({ embeds: [embed] });

        if (!data.player || data.player.state.status === AudioPlayerStatus.Idle) {
          setupPlayer(message, data, voiceChannel);
          playSong(message, data);
        }
        return;

      } else {
        // Wyszukaj po nazwie
        const results = await play.search(query, { source: { youtube: 'video' }, limit: 1 });
        if (!results || results.length === 0) {
          return message.reply('❌ Nie znaleziono wyników!');
        }
        const video = results[0];
        songInfo = {
          title: video.title,
          url: video.url,
          duration: video.durationRaw,
          thumbnail: video.thumbnails[0]?.url || '',
          requestedBy: message.author.username,
        };
      }

      data.queue.push(songInfo);

      // Jeśli już gra — pokaż info o dodaniu do kolejki
      if (data.player && data.player.state.status === AudioPlayerStatus.Playing) {
        const embed = new EmbedBuilder()
          .setColor('#FFA500')
          .setTitle('➕ Dodano do kolejki')
          .setDescription(`**[${songInfo.title}](${songInfo.url})**`)
          .addFields(
            { name: '⏱️ Długość', value: songInfo.duration, inline: true },
            { name: '📋 Pozycja', value: `#${data.queue.length}`, inline: true }
          )
          .setThumbnail(songInfo.thumbnail);

        return message.channel.send({ embeds: [embed] });
      }

      // Nie gra — podłącz i zacznij
      setupPlayer(message, data, voiceChannel);
      playSong(message, data);

    } catch (err) {
      console.error(err);
      message.reply('❌ Wystąpił błąd podczas wyszukiwania!');
    }
  }

  // ───────────────── !search ─────────────────
  if (command === 'search' || command === 's') {
    const query = args.join(' ');
    if (!query) return message.reply('❌ Podaj czego szukać!');

    await message.channel.sendTyping();

    try {
      const results = await play.search(query, { source: { youtube: 'video' }, limit: 5 });
      if (!results.length) return message.reply('❌ Brak wyników!');

      const list = results.map((v, i) => `**${i + 1}.** [${v.title}](${v.url}) — \`${v.durationRaw}\``).join('\n');

      const embed = new EmbedBuilder()
        .setColor('#FF0000')
        .setTitle(`🔍 Wyniki dla: "${query}"`)
        .setDescription(list + '\n\nOdpisz numerem (1-5) w ciągu 30s');

      message.channel.send({ embeds: [embed] });

      const filter = (m) => m.author.id === message.author.id && ['1','2','3','4','5'].includes(m.content.trim());
      const collected = await message.channel.awaitMessages({ filter, max: 1, time: 30000, errors: ['time'] }).catch(() => null);

      if (!collected) return message.channel.send('⏰ Czas minął.');

      const choice = parseInt(collected.first().content.trim()) - 1;
      const chosen = results[choice];

      const voiceChannel = message.member?.voice.channel;
      if (!voiceChannel) return message.reply('❌ Musisz być na kanale głosowym!');

      const songInfo = {
        title: chosen.title,
        url: chosen.url,
        duration: chosen.durationRaw,
        thumbnail: chosen.thumbnails[0]?.url || '',
        requestedBy: message.author.username,
      };

      data.queue.push(songInfo);

      if (data.player && data.player.state.status === AudioPlayerStatus.Playing) {
        return message.channel.send(`➕ Dodano do kolejki: **${chosen.title}**`);
      }

      setupPlayer(message, data, voiceChannel);
      playSong(message, data);

    } catch (err) {
      console.error(err);
      message.reply('❌ Błąd wyszukiwania!');
    }
  }

  // ───────────────── !queue ─────────────────
  if (command === 'queue' || command === 'q') {
    if (!data.currentSong && data.queue.length === 0) {
      return message.reply('📭 Kolejka jest pusta!');
    }

    const queueList = data.queue.slice(0, 10).map((s, i) => `**${i + 1}.** ${s.title} — \`${s.duration}\``).join('\n') || 'Brak następnych piosenek';

    const embed = new EmbedBuilder()
      .setColor('#FF0000')
      .setTitle('📋 Kolejka')
      .addFields(
        { name: '🎵 Teraz gra', value: data.currentSong ? `[${data.currentSong.title}](${data.currentSong.url})` : 'Nic' },
        { name: `Następne (${data.queue.length})`, value: queueList }
      );

    if (data.queue.length > 10) {
      embed.setFooter({ text: `...i ${data.queue.length - 10} więcej` });
    }

    message.channel.send({ embeds: [embed] });
  }

  // ───────────────── !skip ─────────────────
  if (command === 'skip' || command === 'sk') {
    if (!data.player) return message.reply('❌ Nic nie gram!');
    data.looping = false;
    data.player.stop();
    message.reply('⏭️ Pominięto!');
  }

  // ───────────────── !stop ─────────────────
  if (command === 'stop') {
    data.queue = [];
    data.currentSong = null;
    data.looping = false;
    if (data.player) data.player.stop();
    const conn = getVoiceConnection(message.guild.id);
    if (conn) conn.destroy();
    servers.delete(message.guild.id);
    message.reply('⏹️ Zatrzymano i wyczyszczono kolejkę.');
  }

  // ───────────────── !pause ─────────────────
  if (command === 'pause') {
    if (data.player?.state.status === AudioPlayerStatus.Playing) {
      data.player.pause();
      message.reply('⏸️ Pauza.');
    } else {
      message.reply('❌ Nie gram nic lub już jest pauza!');
    }
  }

  // ───────────────── !resume ─────────────────
  if (command === 'resume' || command === 'r') {
    if (data.player?.state.status === AudioPlayerStatus.Paused) {
      data.player.unpause();
      message.reply('▶️ Wznowiono.');
    } else {
      message.reply('❌ Muzyka nie jest na pauzie!');
    }
  }

  // ───────────────── !loop ─────────────────
  if (command === 'loop') {
    data.looping = !data.looping;
    message.reply(data.looping ? '🔁 Pętla włączona.' : '🔁 Pętla wyłączona.');
  }

  // ───────────────── !clear ─────────────────
  if (command === 'clear') {
    data.queue = [];
    message.reply('🗑️ Kolejka wyczyszczona.');
  }

  // ───────────────── !nowplaying ─────────────────
  if (command === 'nowplaying' || command === 'np') {
    if (!data.currentSong) return message.reply('❌ Nic nie gram!');
    const song = data.currentSong;
    const embed = new EmbedBuilder()
      .setColor('#FF0000')
      .setTitle('🎵 Teraz gra')
      .setDescription(`**[${song.title}](${song.url})**`)
      .addFields(
        { name: '⏱️ Długość', value: song.duration, inline: true },
        { name: '👤 Dodał', value: song.requestedBy, inline: true },
        { name: '🔁 Pętla', value: data.looping ? 'Tak' : 'Nie', inline: true }
      )
      .setThumbnail(song.thumbnail);
    message.channel.send({ embeds: [embed] });
  }

  // ───────────────── !help ─────────────────
  if (command === 'help') {
    const embed = new EmbedBuilder()
      .setColor('#FF0000')
      .setTitle('🎵 Music Bot — Komendy')
      .addFields(
        { name: '`!play <url/nazwa>`', value: 'Odtwórz piosenkę lub dodaj do kolejki', inline: false },
        { name: '`!search <nazwa>`', value: 'Wyszukaj i wybierz spośród 5 wyników', inline: false },
        { name: '`!queue`', value: 'Pokaż kolejkę', inline: false },
        { name: '`!skip`', value: 'Pomiń bieżącą piosenkę', inline: false },
        { name: '`!stop`', value: 'Zatrzymaj i wyczyść kolejkę', inline: false },
        { name: '`!pause` / `!resume`', value: 'Pauza / Wznów', inline: false },
        { name: '`!loop`', value: 'Włącz/wyłącz pętlę bieżącej piosenki', inline: false },
        { name: '`!nowplaying`', value: 'Pokaż co teraz gra', inline: false },
        { name: '`!clear`', value: 'Wyczyść kolejkę', inline: false },
      );
    message.channel.send({ embeds: [embed] });
  }
});

// ─── Helper: setup playera dla serwera ───
function setupPlayer(message, data, voiceChannel) {
  const connection = joinVoiceChannel({
    channelId: voiceChannel.id,
    guildId: message.guild.id,
    adapterCreator: message.guild.voiceAdapterCreator,
  });

  const player = createAudioPlayer();
  connection.subscribe(player);

  player.on(AudioPlayerStatus.Idle, () => {
    playSong(message, data);
  });

  player.on('error', (err) => {
    console.error('Player error:', err);
    message.channel.send('❌ Błąd odtwarzacza, pomijam...');
    playSong(message, data);
  });

  data.player = player;
  data.connection = connection;
}

client.login(process.env.DISCORD_TOKEN || 'TWÓJ_TOKEN_TUTAJ');
