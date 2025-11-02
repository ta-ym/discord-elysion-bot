import { SlashCommandBuilder, ChatInputCommandInteraction, GuildMember } from 'discord.js';
import { Command } from '../types';
import { hasSalaryPermission, getSalaryPermissionErrorMessage } from '../utils/permissions';
import { resendTempVCPanel } from '../utils/tempVCManager';

const tempVcPanelCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('temp-vc-panel')
    .setDescription('一時VC作成パネルを再送信します（管理者専用）'),

  async execute(interaction: ChatInputCommandInteraction) {
    const member = interaction.member as GuildMember;
    
    // 権限チェック（管理者のみ）
    if (!hasSalaryPermission(member)) {
      await interaction.reply({
        content: getSalaryPermissionErrorMessage(),
        ephemeral: true
      });
      return;
    }

    try {
      const success = await resendTempVCPanel(interaction.client);
      
      if (success) {
        await interaction.reply({
          content: '✅ 一時VC作成パネルを再送信しました。\n（古いパネルがあれば削除されました）',
          ephemeral: true
        });
      } else {
        await interaction.reply({
          content: '❌ パネルの送信に失敗しました。チャンネルが見つからない可能性があります。',
          ephemeral: true
        });
      }

    } catch (error) {
      console.error('Temp VC panel command error:', error);
      await interaction.reply({
        content: '❌ エラーが発生しました。',
        ephemeral: true
      });
    }
  },
};

export default tempVcPanelCommand;