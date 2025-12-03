import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { Command } from '../types';
import { sendPublicVCPanel } from '../utils/publicVCManager';
import { hasAdminPermission, getAdminPermissionErrorMessage } from '../utils/permissions';

const rainbowPanelCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('rainbow-panel')
    .setDescription('【管理者専用】虹色の楽園に公開VC管理パネルを送信します'),

  async execute(interaction: ChatInputCommandInteraction) {
    // 権限チェック（特定ユーザーのみ）
    if (!hasAdminPermission(interaction.user.id)) {
      await interaction.reply({
        content: getAdminPermissionErrorMessage(),
        ephemeral: true
      });
      return;
    }

    try {
      await sendPublicVCPanel(interaction);
    } catch (error) {
      console.error('Rainbow panel command error:', error);
      await interaction.reply({
        content: '❌ エラーが発生しました。',
        ephemeral: true
      });
    }
  },
};

export default rainbowPanelCommand;