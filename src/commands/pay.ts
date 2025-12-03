import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } from 'discord.js';
import { Command } from '../types';
import { hasAdminPermission, getAdminPermissionErrorMessage } from '../utils/permissions';

const payCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('pay')
    .setDescription('【管理者専用】特定のメンバーに任意の金額を支払う')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('支払い対象のユーザー')
        .setRequired(true))
    .addIntegerOption(option =>
      option.setName('amount')
        .setDescription('支払い金額（1〜1,000,000 Ru）')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(1000000))
    .addStringOption(option =>
      option.setName('reason')
        .setDescription('支払い理由・備考')
        .setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  
  async execute(interaction: ChatInputCommandInteraction) {
    // 権限チェック（特定ユーザーのみ）
    if (!hasAdminPermission(interaction.user.id)) {
      await interaction.reply({
        content: getAdminPermissionErrorMessage(),
        ephemeral: true
      });
      return;
    }

    const targetUser = interaction.options.getUser('user', true);
    const amount = interaction.options.getInteger('amount', true);
    const reason = interaction.options.getString('reason') || '特別支給';

    try {
      // サーバーメンバー情報を取得
      const targetMember = await interaction.guild?.members.fetch(targetUser.id);
      if (!targetMember) {
        await interaction.reply({
          content: '❌ 対象ユーザーがサーバーに見つかりません。',
          ephemeral: true
        });
        return;
      }

      // 自分への支払いをチェック
      if (targetUser.id === interaction.user.id) {
        await interaction.reply({
          content: '❌ 自分に支払うことはできません。',
          ephemeral: true
        });
        return;
      }

      // ボットへの支払いをチェック
      if (targetUser.bot) {
        await interaction.reply({
          content: '❌ ボットに支払うことはできません。',
          ephemeral: true
        });
        return;
      }

      // 確認埋め込みメッセージを作成
      const confirmEmbed = new EmbedBuilder()
        .setColor(0x00AE86)
        .setTitle('💰 支払い確認')
        .setDescription('以下の内容で支払いを実行しますか？')
        .addFields(
          { 
            name: '👤 支払い対象', 
            value: `${targetUser.displayName} (${targetUser.tag})`, 
            inline: true 
          },
          { 
            name: '💴 金額', 
            value: `${amount.toLocaleString()} Ru`, 
            inline: true 
          },
          { 
            name: '📝 理由', 
            value: reason, 
            inline: false 
          },
          { 
            name: '👨‍💼 支払い者', 
            value: `${interaction.user.displayName}`, 
            inline: true 
          }
        )
        .setFooter({ text: '⚠️ 実行後の取り消しはできません' })
        .setTimestamp();

      // ボタンを作成
      const confirmButton = new ButtonBuilder()
        .setCustomId(`pay_confirm_${targetUser.id}_${amount}_${Date.now()}`)
        .setLabel('✅ 支払い実行')
        .setStyle(ButtonStyle.Success);

      const cancelButton = new ButtonBuilder()
        .setCustomId('pay_cancel')
        .setLabel('❌ キャンセル')
        .setStyle(ButtonStyle.Secondary);

      const row = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(confirmButton, cancelButton);

      await interaction.reply({
        embeds: [confirmEmbed],
        components: [row],
        ephemeral: true
      });

    } catch (error) {
      console.error('Pay command error:', error);
      await interaction.reply({
        content: '❌ 支払い処理中にエラーが発生しました。',
        ephemeral: true
      });
    }
  },
};

export default payCommand;