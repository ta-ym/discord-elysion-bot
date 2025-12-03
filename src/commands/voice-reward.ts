import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { Command } from '../types';
import { Database } from '../database';
import { getVoiceTimeTracker } from '../utils/voiceTimeTracker';
import { calculateVoiceReward } from '../config/angelRole';
import { getCurrencyLogger } from '../utils/currencyLogger';
import { hasAdminPermission, getAdminPermissionErrorMessage } from '../utils/permissions';

const voiceRewardCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('voice-reward')
    .setDescription('【管理者専用】通話時間に基づく報酬支払いシステム')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(subcommand =>
      subcommand
        .setName('pay')
        .setDescription('指定ユーザーに通話報酬を支払う')
        .addUserOption(option =>
          option
            .setName('target')
            .setDescription('報酬支払い対象ユーザー')
            .setRequired(true)
        )
        .addStringOption(option =>
          option
            .setName('period')
            .setDescription('支払い対象期間')
            .setRequired(true)
            .addChoices(
              { name: '今日', value: 'today' },
              { name: '7日間', value: '7days' },
              { name: '30日間', value: '30days' },
              { name: '今月', value: 'thismonth' },
              { name: '先月', value: 'lastmonth' }
            )
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('preview')
        .setDescription('報酬支払いプレビューを表示')
        .addStringOption(option =>
          option
            .setName('period')
            .setDescription('支払い対象期間')
            .setRequired(true)
            .addChoices(
              { name: '今日', value: 'today' },
              { name: '7日間', value: '7days' },
              { name: '30日間', value: '30days' },
              { name: '今月', value: 'thismonth' },
              { name: '先月', value: 'lastmonth' }
            )
        )
        .addIntegerOption(option =>
          option
            .setName('min-minutes')
            .setDescription('最低通話時間（分）')
            .setRequired(false)
            .setMinValue(1)
        )
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    // 権限チェック（特定ユーザーのみ）
    if (!hasAdminPermission(interaction.user.id)) {
      await interaction.reply({
        content: getAdminPermissionErrorMessage(),
        ephemeral: true
      });
      return;
    }

    const subcommand = interaction.options.getSubcommand();
    const database = new Database();
    const tracker = getVoiceTimeTracker();

    if (!tracker) {
      await interaction.reply({
        content: '❌ 通話時間追跡システムが初期化されていません。',
        ephemeral: true
      });
      return;
    }

    try {
      switch (subcommand) {
        case 'pay':
          await handleIndividualPay(interaction, database, tracker);
          break;
        case 'preview':
          await handlePreview(interaction, tracker);
          break;
        default:
          await interaction.reply({
            content: '❌ 不明なサブコマンドです。',
            ephemeral: true
          });
      }
    } catch (error) {
      console.error('Voice reward command error:', error);
      await interaction.reply({
        content: '❌ エラーが発生しました。',
        ephemeral: true
      });
    }
  }
};

/**
 * 個人への報酬支払い
 */
async function handleIndividualPay(interaction: ChatInputCommandInteraction, database: Database, tracker: any): Promise<void> {
  const targetUser = interaction.options.getUser('target', true);
  const period = interaction.options.getString('period', true);

  const dateRange = getDateRange(period, tracker);
  const stats = await tracker.getUserVoiceStats(targetUser.id, dateRange.startDate, dateRange.endDate);

  if (stats.angelRoleMinutes === 0) {
    await interaction.reply({
      content: `❌ ${targetUser.displayName}は指定期間に天使ロールでの通話記録がありません。`,
      ephemeral: true
    });
    return;
  }

  const rewardCalc = calculateVoiceReward(stats.angelRoleMinutes);

  // 報酬支払い実行
  try {
    await database.createUser(targetUser.id);
    await database.giveMoney(targetUser.id, rewardCalc.totalReward, `通話報酬 (${getPeriodLabel(period)})`);

    // 通貨ログに記録
    const currencyLogger = getCurrencyLogger();
    if (currencyLogger) {
      await currencyLogger.logTransaction({
        fromUserId: null,
        toUserId: targetUser.id,
        amount: rewardCalc.totalReward,
        type: 'admin_give',
        description: `通話報酬 - ${getPeriodLabel(period)} (${formatMinutes(stats.angelRoleMinutes)})`,
        executedBy: interaction.user.id
      });
    }

    const successEmbed = new EmbedBuilder()
      .setColor('#00ff00')
      .setTitle('✅ 通話報酬支払い完了')
      .addFields(
        { name: '👤 支払い対象', value: `<@${targetUser.id}>`, inline: true },
        { name: '📅 期間', value: getPeriodLabel(period), inline: true },
        { name: '💰 支払い金額', value: `${rewardCalc.totalReward}通貨`, inline: true },
        { name: '📊 通話時間', value: formatMinutes(stats.angelRoleMinutes), inline: true }
      )
      .setTimestamp();

    await interaction.reply({ embeds: [successEmbed] });

  } catch (error) {
    console.error('Payment error:', error);
    await interaction.reply({
      content: '❌ 支払い処理中にエラーが発生しました。',
      ephemeral: true
    });
  }
}

/**
 * 報酬支払いプレビュー
 */
async function handlePreview(interaction: ChatInputCommandInteraction, tracker: any): Promise<void> {
  const period = interaction.options.getString('period', true);
  const minMinutes = interaction.options.getInteger('min-minutes') || 30;

  const dateRange = getDateRange(period, tracker);
  const angelStats = await tracker.getAngelRoleStats(dateRange.startDate, dateRange.endDate);

  // 最低時間を満たすユーザーをフィルター
  const eligibleUsers = angelStats.filter((stat: any) => stat.total_angel_minutes >= minMinutes);

  if (eligibleUsers.length === 0) {
    await interaction.reply({
      content: `📭 指定期間に${minMinutes}分以上通話した天使ロールユーザーが見つかりません。`,
      ephemeral: true
    });
    return;
  }

  // 報酬計算
  let totalPayment = 0;
  const paymentDetails: any[] = [];

  for (const userStat of eligibleUsers) {
    const rewardCalc = calculateVoiceReward(userStat.total_angel_minutes);
    totalPayment += rewardCalc.totalReward;
    paymentDetails.push({
      userId: userStat.user_id,
      minutes: userStat.total_angel_minutes,
      reward: rewardCalc.totalReward
    });
  }

  const previewEmbed = new EmbedBuilder()
    .setColor('#0099ff')
    .setTitle('📋 通話報酬支払いプレビュー')
    .addFields(
      { name: '📅 期間', value: getPeriodLabel(period), inline: true },
      { name: '👥 対象ユーザー数', value: `${eligibleUsers.length}人`, inline: true },
      { name: '⏱️ 最低通話時間', value: `${minMinutes}分`, inline: true },
      { name: '💎 総支払い金額', value: `**${totalPayment}通貨**`, inline: true }
    )
    .setTimestamp();

  // 詳細リスト（上位15名）
  const topUsers = paymentDetails.slice(0, 15);
  const detailText = topUsers.map((detail: any, index: number) => 
    `${index + 1}. <@${detail.userId}>: ${formatMinutes(detail.minutes)} → ${detail.reward}通貨`
  ).join('\n');

  if (detailText) {
    previewEmbed.addFields({ name: '📊 支払い詳細', value: detailText, inline: false });
  }

  await interaction.reply({ embeds: [previewEmbed], ephemeral: true });
}

// ユーティリティ関数
function getDateRange(period: string, tracker: any): { startDate: string; endDate: string } {
  const now = new Date();

  switch (period) {
    case 'today':
      const today = now.toISOString().split('T')[0];
      return { startDate: today, endDate: today };
    
    case '7days':
      return tracker.formatDateRange(7);
    
    case '30days':
      return tracker.formatDateRange(30);
    
    case 'thismonth':
      return tracker.getMonthRange(now.getFullYear(), now.getMonth() + 1);
    
    case 'lastmonth':
      const lastMonth = now.getMonth() === 0 ? 12 : now.getMonth();
      const lastMonthYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
      return tracker.getMonthRange(lastMonthYear, lastMonth);
    
    default:
      return tracker.formatDateRange(7);
  }
}

function getPeriodLabel(period: string): string {
  switch (period) {
    case 'today': return '今日';
    case '7days': return '7日間';
    case '30days': return '30日間';
    case 'thismonth': return '今月';
    case 'lastmonth': return '先月';
    default: return '7日間';
  }
}

function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  
  if (hours === 0) {
    return `${mins}分`;
  } else {
    return `${hours}時間${mins}分`;
  }
}

export default voiceRewardCommand;