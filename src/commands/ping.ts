import { SlashCommandBuilder, ChatInputCommandInteraction, MessageFlags } from 'discord.js';
import { Command } from '../types';
import { hasAdminPermission, getAdminPermissionErrorMessage } from '../utils/permissions';

const pingCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('【管理者専用】Replies with Pong!'),
  
  async execute(interaction: ChatInputCommandInteraction) {
    // 権限チェック（特定ユーザーのみ）
    if (!hasAdminPermission(interaction.user.id)) {
      await interaction.reply({
        content: getAdminPermissionErrorMessage(),
        flags: MessageFlags.Ephemeral
      });
      return;
    }

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