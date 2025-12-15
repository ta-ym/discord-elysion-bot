import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { Command } from '../types';
import { hasAdminPermission, getAdminPermissionErrorMessage } from '../utils/permissions';
import { resendTempVCPanel } from '../utils/tempVCManager';

const tempVcPanelCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('temp-vc-panel')
    .setDescription('【管理者専用】一時VC作成パネルを送信する'),

  async execute(interaction: ChatInputCommandInteraction) {
    // 権限チェック（特定ユーザーのみ）
    if (!hasAdminPermission(interaction.user.id)) {
      await interaction.reply({
        content: getAdminPermissionErrorMessage(),
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    try {
      const success = await resendTempVCPanel(interaction.client);
      
      if (success) {
        await interaction.reply({
          content: '✅ 一時VC作成パネルを再送信しました。\n（古いパネルがあれば削除されました）',
          flags: MessageFlags.Ephemeral
        });
      } else {
        await interaction.reply({
          content: '❌ パネルの送信に失敗しました。チャンネルが見つからない可能性があります。',
          flags: MessageFlags.Ephemeral
        });
      }

    } catch (error) {
      console.error('Temp VC panel command error:', error);
      await interaction.reply({
        content: '❌ エラーが発生しました。',
        flags: MessageFlags.Ephemeral
      });
    }
  },
};

export default tempVcPanelCommand;