const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const { DisTube } = require('distube');
const { YtDlpPlugin } = require('@distube/yt-dlp');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

const distube = new DisTube(client, {
  plugins: [new YtDlpPlugin()],
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
    if (!query) return message.reply('❌ Podaj URL lub nazwę!');
    distube.play(message.member.voice.channel, query, {
      message,
      textChannel: message.channel,
      member: message.member,
    });
  }
  if (command === 'skip') distube.skip(message.guild);
  if (command === 'stop') distube.stop(message.guild);
  if (command === 'pause') distube.pause(message.guild);
  if (command === 'resume') distube.resume(message.guild);
  if (command === 'loop') {
    const queue = distube.getQueue(message.guild);
    if (!queue) return message.reply('❌ Nic nie gram!');
    const mode = queue.repeatMode === 0 ? 1 : 0;
    distube.setRepeatMode(message.guild, mode);
    message.reply(mode === 1 ? '🔁 Pętla włączona.' : '🔁 Pętla wyłączona.');
  }
  if (command === 'queue' || command === 'q') {
    const queue = distube.getQueue(message.guild);
    if (!queue) return message.reply('📭 Kolejka pusta!');
    const list = queue.songs.slice(1, 11).map((s, i) => `**${i + 1}.** ${s.name} — \`${s.formattedDuration}\``).join('\n') || 'Brak';
    const embed = new EmbedBuilder()
      .setColor('#FF0000')
      .setTitle('📋 Kolejka')
      .addFields(
        { name: '🎵 Teraz gra', value: `${queue.songs[0].name}` },
        { name: 'Następne', value: list }
      );
    message.channel.send({ embeds: [embed] });
  }
});

distube.on('playSong', (queue, song) => {
  queue.textChannel.send(`▶️ Gram: **${song.name}** \`${song.formattedDuration}\``);
});

distube.on('addSong', (queue, song) => {
  queue.textChannel.send(`➕ Dodano do kolejki: **${song.name}**`);
});

distube.on('error', (channel, error) => {
  console.error(error);
  channel.send('❌ Błąd: ' + error.message);
});

client.login(process.env.DISCORD_TOKEN);
