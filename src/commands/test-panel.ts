import { SlashCommandBuilder, ChatInputCommandInteraction, GuildMember } from 'discord.js';
import { Command } from '../types';
import { hasSalaryPermission, getSalaryPermissionErrorMessage } from '../utils/permissions';
import { createSecretVCPanel } from '../utils/panelManager';

const testPanelCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('test-panel')
    .setDescription('指定されたチャンネルにシークレットVCパネルを送信（管理者専用）')
    .addChannelOption(option =>
      option.setName('channel')
        .setDescription('パネルを送信するチャンネル')
        .setRequired(false)
    ),

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
      const targetChannel = interaction.options.getChannel('channel') || interaction.channel;
      
      if (!targetChannel || !('send' in targetChannel)) {
        await interaction.reply({
          content: '❌ 指定されたチャンネルにメッセージを送信できません。',
          ephemeral: true
        });
        return;
      }

      // パネルを作成して送信
      const panelData = createSecretVCPanel();
      await targetChannel.send(panelData);

      await interaction.reply({
        content: `✅ シークレットVC作成パネルを ${targetChannel} に送信しました。`,
        ephemeral: true
      });

    } catch (error) {
      console.error('Test panel command error:', error);
      await interaction.reply({
        content: '❌ エラーが発生しました。',
        ephemeral: true
      });
    }
  },
};

export default testPanelCommand;