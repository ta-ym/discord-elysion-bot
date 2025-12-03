import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { Command } from '../types';
import { Database } from '../database';
import { getCurrencyLogger } from '../utils/currencyLogger';
import { hasAdminPermission, getAdminPermissionErrorMessage } from '../utils/permissions';

const currencyLogCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('currency-log')
    .setDescription('【管理者専用】通貨取引履歴をログチャンネルに表示します')
    .addSubcommand(subcommand =>
      subcommand
        .setName('user')
        .setDescription('特定のユーザーの取引履歴を表示')
        .addUserOption(option =>
          option.setName('user')
            .setDescription('対象ユーザー')
            .setRequired(true))
        .addIntegerOption(option =>
          option.setName('limit')
            .setDescription('表示する取引数（1-20）')
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(20)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('manual')
        .setDescription('手動でログチャンネルにメッセージを送信')
        .addStringOption(option =>
          option.setName('message')
            .setDescription('送信するメッセージ')
            .setRequired(true))),

  async execute(interaction: ChatInputCommandInteraction) {
    const database = new Database();
    const logger = getCurrencyLogger();
    
    // 権限チェック（特定ユーザーのみ）
    if (!hasAdminPermission(interaction.user.id)) {
      await interaction.reply({
        content: getAdminPermissionErrorMessage(),
        ephemeral: true
      });
      return;
    }

    if (!logger) {
      await interaction.reply({
        content: '❌ 通貨ログシステムが初期化されていません。',
        ephemeral: true
      });
      return;
    }

    await interaction.deferReply();

    try {
      const subcommand = interaction.options.getSubcommand();

      switch (subcommand) {
        case 'user':
          await handleUserTransactions(interaction, database, logger);
          break;
        case 'manual':
          await handleManualMessage(interaction);
          break;
        default:
          await interaction.editReply('❌ 不明なサブコマンドです。');
      }
    } catch (error) {
      console.error('Currency log command error:', error);
      await interaction.editReply('❌ エラーが発生しました。');
    }
  },
};

/**
 * 特定ユーザーの取引履歴を表示
 */
async function handleUserTransactions(
  interaction: ChatInputCommandInteraction,
  database: Database,
  logger: any
): Promise<void> {
  const user = interaction.options.getUser('user', true);
  const limit = interaction.options.getInteger('limit') || 10;

  const transactions = await database.getUserTransactions(user.id, limit);
  
  await logger.displayTransactionHistory(
    transactions,
    `👤 ${user.username} の取引履歴 (${limit}件)`,
    limit
  );

  await interaction.editReply(
    `✅ ${user.username} の取引履歴 ${limit} 件をログチャンネルに表示しました。`
  );
}

/**
 * 手動でログチャンネルにメッセージを送信
 */
async function handleManualMessage(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  const message = interaction.options.getString('message', true);

  const embed = new EmbedBuilder()
    .setColor('#95a5a6')
    .setTitle('📝 管理者メッセージ')
    .setDescription(message)
    .addFields(
      { name: '送信者', value: `<@${interaction.user.id}>`, inline: true },
      { name: '送信時刻', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
    )
    .setTimestamp();

  // ログチャンネルにメッセージを送信
  const channelId = '1432371639319789648'; // 固定のログチャンネルID
  try {
    const channel = await interaction.client.channels.fetch(channelId);
    if (channel && 'send' in channel) {
      await channel.send({ embeds: [embed] });
      await interaction.editReply('✅ メッセージをログチャンネルに送信しました。');
    } else {
      await interaction.editReply('❌ ログチャンネルが見つかりません。');
    }
  } catch (error) {
    console.error('メッセージ送信エラー:', error);
    await interaction.editReply('❌ メッセージの送信に失敗しました。');
  }
}

export default currencyLogCommand;