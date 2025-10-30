import { SlashCommandBuilder, ChatInputCommandInteraction, GuildMember } from 'discord.js';
import { Command } from '../types';
import { sendVCCreationPanel } from '../utils/secretVCManager';
import { hasSalaryPermission, getSalaryPermissionErrorMessage } from '../utils/permissions';

const vcPanelCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('vc-panel')
    .setDescription('VC内チャットにシークレットVC作成パネルを送信します（管理者専用）'),

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
      await sendVCCreationPanel(interaction);
    } catch (error) {
      console.error('VC panel command error:', error);
      await interaction.reply({
        content: '❌ エラーが発生しました。',
        ephemeral: true
      });
    }
  },
};

export default vcPanelCommand;