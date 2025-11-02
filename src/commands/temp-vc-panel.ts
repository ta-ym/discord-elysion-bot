import { SlashCommandBuilder, ChatInputCommandInteraction, GuildMember, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { Command } from '../types';
import { hasSalaryPermission, getSalaryPermissionErrorMessage } from '../utils/permissions';

const tempVcPanelCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('temp-vc-panel')
    .setDescription('一時VC作成パネルを送信します（管理者専用）')
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

      // パネルエンベッドを作成
      const panelEmbed = new EmbedBuilder()
        .setColor('#00aaff')
        .setTitle('⏰ 一時VC作成パネル')
        .setDescription('12時間後に自動削除される一時的なボイスチャンネルを作成できます。')
        .addFields(
          { name: '⏳ 持続時間', value: '12時間', inline: true },
          { name: '🏷️ チャンネル名', value: '自由に設定可能', inline: true },
          { name: '👥 利用制限', value: 'なし（誰でも参加可能）', inline: true },
          { name: '🎯 用途', value: '• 一時的な会議やディスカッション\n• イベントや作業用の専用チャンネル\n• プライベートな通話空間', inline: false }
        )
        .setFooter({ text: '作成から12時間後に自動的に削除されます' })
        .setTimestamp();

      const panelButton = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('create_temp_vc')
            .setLabel('一時VC作成')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('⏰')
        );

      await targetChannel.send({ embeds: [panelEmbed], components: [panelButton] });

      await interaction.reply({
        content: `✅ 一時VC作成パネルを ${targetChannel} に送信しました。`,
        ephemeral: true
      });

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