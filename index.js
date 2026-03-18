process.on('uncaughtException', (err) => {
  console.error('BŁĄD:', err);
});
process.on('unhandledRejection', (err) => {
  console.error('BŁĄD PROMISE:', err);
});

const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const { DisTube } = require('distube');
const { YouTubePlugin } = require('@distube/youtube');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

const ffmpegPath = require('ffmpeg-static');
const distube = new DisTube(client, {
  ffmpeg: {
    path: ffmpegPath,
  },
  plugins: [new YouTubePlugin()],
});

const prefix = '!';

client.on('ready', () => {
  console.log(`✅ Bot zalogowany jako ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
  if (!message.content.startsWith(prefix) || message.author.bot) return;

  const args = message.content.slice(prefix.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  if (command === 'play' || command === 'p') {
    const query = args.join(' ');
    if (!query) return message.reply('❌ Podaj URL lub nazwę piosenki!');
    if (!message.member?.voice.channel) return message.reply('❌ Musisz być na kanale głosowym!');
    try {
      await distube.play(message.member.voice.channel, query, {
        message,
        textChannel: message.channel,
        member: message.member,
      });
    } catch (err) {
      console.error(err);
      message.reply('❌ Błąd: ' + err.message);
    }
  }

  if (command === 'skip' || command === 'sk') {
    try {
      await distube.skip(message.guild);
      message.reply('⏭️ Pominięto!');
    } catch (err) {
      message.reply('❌ Nic nie gram!');
    }
  }

  if (command === 'stop') {
    try {
      await distube.stop(message.guild);
      message.reply('⏹️ Zatrzymano!');
    } catch (err) {
      message.reply('❌ Nic nie gram!');
    }
  }

  if (command === 'pause') {
    try {
      distube.pause(message.guild);
      message.reply('⏸️ Pauza.');
    } catch (err) {
      message.reply('❌ Błąd!');
    }
  }

  if (command === 'resume' || command === 'r') {
    try {
      distube.resume(message.guild);
      message.reply('▶️ Wznowiono.');
    } catch (err) {
      message.reply('❌ Błąd!');
    }
  }

  if (command === 'loop') {
    try {
      const queue = distube.getQueue(message.guild);
      if (!queue) return message.reply('❌ Nic nie gram!');
      const mode = queue.repeatMode === 0 ? 1 : 0;
      distube.setRepeatMode(message.guild, mode);
      message.reply(mode === 1 ? '🔁 Pętla włączona.' : '🔁 Pętla wyłączona.');
    } catch (err) {
      message.reply('❌ Błąd!');
    }
  }

  if (command === 'queue' || command === 'q') {
    const queue = distube.getQueue(message.guild);
    if (!queue) return message.reply('📭 Kolejka jest pusta!');
    const list = queue.songs.slice(1, 11).map((s, i) => `**${i + 1}.** ${s.name} — \`${s.formattedDuration}\``).join('\n') || 'Brak następnych piosenek';
    const embed = new EmbedBuilder()
      .setColor('#FF0000')
      .setTitle('📋 Kolejka')
      .addFields(
        { name: '🎵 Teraz gra', value: queue.songs[0].name },
        { name: `Następne (${queue.songs.length - 1})`, value: list }
      );
    message.channel.send({ embeds: [embed] });
  }

  if (command === 'np' || command === 'nowplaying') {
    const queue = distube.getQueue(message.guild);
    if (!queue) return message.reply('❌ Nic nie gram!');
    const song = queue.songs[0];
    const embed = new EmbedBuilder()
      .setColor('#FF0000')
      .setTitle('🎵 Teraz gra')
      .setDescription(`**[${song.name}](${song.url})**`)
      .addFields(
        { name: '⏱️ Długość', value: song.formattedDuration, inline: true },
        { name: '👤 Dodał', value: song.member?.displayName || 'Nieznany', inline: true }
      )
      .setThumbnail(song.thumbnail);
    message.channel.send({ embeds: [embed] });
  }

  if (command === 'help') {
    const embed = new EmbedBuilder()
      .setColor('#FF0000')
      .setTitle('🎵 Music Bot — Komendy')
      .addFields(
        { name: '`!play <url/nazwa>`', value: 'Odtwórz piosenkę lub dodaj do kolejki' },
        { name: '`!skip`', value: 'Pomiń bieżącą piosenkę' },
        { name: '`!stop`', value: 'Zatrzymaj i rozłącz' },
        { name: '`!pause` / `!resume`', value: 'Pauza / Wznów' },
        { name: '`!loop`', value: 'Włącz/wyłącz pętlę' },
        { name: '`!queue`', value: 'Pokaż kolejkę' },
        { name: '`!nowplaying`', value: 'Pokaż co teraz gra' },
      );
    message.channel.send({ embeds: [embed] });
  }
});

distube.on('playSong', (queue, song) => {
  queue.textChannel?.send({
    embeds: [
      new EmbedBuilder()
        .setColor('#FF0000')
        .setTitle('▶️ Teraz gram')
        .setDescription(`**[${song.name}](${song.url})**`)
        .addFields(
          { name: '⏱️ Długość', value: song.formattedDuration, inline: true },
          { name: '📋 W kolejce', value: `${queue.songs.length - 1} piosenek`, inline: true }
        )
        .setThumbnail(song.thumbnail)
    ]
  });
});

distube.on('addSong', (queue, song) => {
  queue.textChannel?.send(`➕ Dodano do kolejki: **${song.name}** \`${song.formattedDuration}\``);
});

distube.on('error', (error, queue) => {
  console.error(error);
  queue.textChannel?.send('❌ Błąd: ' + error.message);
});

client.login(process.env.DISCORD_TOKEN);
