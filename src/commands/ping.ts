import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { Command } from '../types';

const pingCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Replies with Pong!'),
  
  async execute(interaction: ChatInputCommandInteraction) {
    const sent = await interaction.reply({ content: 'Pinging...', fetchReply: true });
    const timeDiff = sent.createdTimestamp - interaction.createdTimestamp;
    
    await interaction.editReply(
      `🏓 Pong!\n` +
      `📡 Latency: ${timeDiff}ms\n` +
      `💓 API Latency: ${Math.round(interaction.client.ws.ping)}ms`
    );
  },
};

export default pingCommand;