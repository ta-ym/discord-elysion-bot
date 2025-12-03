import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { Command } from '../types';
import { getVoiceTimeTracker } from '../utils/voiceTimeTracker';
import { getAngelRoleConfig, calculateVoiceReward } from '../config/angelRole';
import { hasAdminPermission, getAdminPermissionErrorMessage } from '../utils/permissions';

const voiceStatsCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('voice-stats')
    .setDescription('【管理者専用】天使ロールの通話時間統計を表示')
    .addSubcommand(subcommand =>
      subcommand
        .setName('user')
        .setDescription('指定ユーザーの通話時間を表示')
        .addUserOption(option =>
          option
            .setName('target')
            .setDescription('統計を表示するユーザー')
            .setRequired(false)
        )
        .addStringOption(option =>
          option
            .setName('period')
            .setDescription('期間を選択')
            .setRequired(false)
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
        .setName('ranking')
        .setDescription('天使ロール通話時間ランキングを表示')
        .addStringOption(option =>
          option
            .setName('period')
            .setDescription('期間を選択')
            .setRequired(false)
            .addChoices(
              { name: '7日間', value: '7days' },
              { name: '30日間', value: '30days' },
              { name: '今月', value: 'thismonth' },
              { name: '先月', value: 'lastmonth' }
            )
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('reward')
        .setDescription('通話時間に基づく報酬を計算')
        .addUserOption(option =>
          option
            .setName('target')
            .setDescription('報酬計算対象ユーザー')
            .setRequired(false)
        )
        .addStringOption(option =>
          option
            .setName('period')
            .setDescription('期間を選択')
            .setRequired(false)
            .addChoices(
              { name: '今日', value: 'today' },
              { name: '7日間', value: '7days' },
              { name: '30日間', value: '30days' },
              { name: '今月', value: 'thismonth' },
              { name: '先月', value: 'lastmonth' }
            )
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
        case 'user':
          await handleUserStats(interaction, tracker);
          break;
        case 'ranking':
          await handleRanking(interaction, tracker);
          break;
        case 'reward':
          await handleRewardCalculation(interaction, tracker);
          break;
        default:
          await interaction.reply({
            content: '❌ 不明なサブコマンドです。',
            ephemeral: true
          });
      }
    } catch (error) {
      console.error('Voice stats command error:', error);
      await interaction.reply({
        content: '❌ エラーが発生しました。',
        ephemeral: true
      });
    }
  }
};

/**
 * ユーザー統計表示
 */
async function handleUserStats(interaction: ChatInputCommandInteraction, tracker: any): Promise<void> {
  const targetUser = interaction.options.getUser('target') || interaction.user;
  const period = interaction.options.getString('period') || '7days';

  const dateRange = getDateRange(period);
  const stats = await tracker.getUserVoiceStats(targetUser.id, dateRange.startDate, dateRange.endDate);

  const embed = new EmbedBuilder()
    .setColor('#0099ff')
    .setTitle('📊 通話時間統計')
    .setThumbnail(targetUser.displayAvatarURL())
    .addFields(
      { name: '👤 ユーザー', value: `<@${targetUser.id}>`, inline: true },
      { name: '📅 期間', value: getPeriodLabel(period), inline: true },
      { name: '⏱️ 総通話時間', value: formatMinutes(stats.totalMinutes), inline: true },
      { name: '👼 天使ロール時間', value: formatMinutes(stats.angelRoleMinutes), inline: true },
      { name: '🔢 セッション数', value: `${stats.totalSessions}回`, inline: true },
      { name: '⭐ 効率', value: stats.totalMinutes > 0 ? `${Math.round((stats.angelRoleMinutes / stats.totalMinutes) * 100)}%` : '0%', inline: true }
    )
    .setFooter({ text: '天使ロール時間のみが報酬対象です' })
    .setTimestamp();

  // 日別詳細（最新5日分）
  if (stats.dailyStats.length > 0) {
    const recentStats = stats.dailyStats.slice(0, 5);
    const dailyDetails = recentStats.map((stat: any) => 
      `**${stat.date}**: ${formatMinutes(stat.angel_role_minutes)} (${stat.sessions_count}回)`
    ).join('\n');

    embed.addFields({ name: '📈 最近の記録', value: dailyDetails || 'データなし', inline: false });
  }

  await interaction.reply({ embeds: [embed] });
}

/**
 * ランキング表示
 */
async function handleRanking(interaction: ChatInputCommandInteraction, tracker: any): Promise<void> {
  const period = interaction.options.getString('period') || '7days';
  const dateRange = getDateRange(period);

  const ranking = await tracker.getAngelRoleStats(dateRange.startDate, dateRange.endDate);

  if (ranking.length === 0) {
    await interaction.reply({
      content: '📭 指定期間に天使ロールでの通話記録がありません。',
      ephemeral: true
    });
    return;
  }

  const embed = new EmbedBuilder()
    .setColor('#ffaa00')
    .setTitle('🏆 天使ロール通話時間ランキング')
    .addFields(
      { name: '📅 期間', value: getPeriodLabel(period), inline: true },
      { name: '👑 参加者数', value: `${ranking.length}人`, inline: true }
    )
    .setTimestamp();

  // トップ10のランキング
  const topRanking = ranking.slice(0, 10);
  let rankingText = '';

  for (let i = 0; i < topRanking.length; i++) {
    const rank = i + 1;
    const stat = topRanking[i];
    const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}.`;
    
    rankingText += `${medal} <@${stat.user_id}>\n`;
    rankingText += `   ⏱️ ${formatMinutes(stat.total_angel_minutes)} (${stat.total_sessions}回)\n\n`;
  }

  embed.addFields({ name: '🏅 ランキング', value: rankingText.trim(), inline: false });

  await interaction.reply({ embeds: [embed] });
}

/**
 * 報酬計算表示
 */
async function handleRewardCalculation(interaction: ChatInputCommandInteraction, tracker: any): Promise<void> {
  const targetUser = interaction.options.getUser('target') || interaction.user;
  const period = interaction.options.getString('period') || '7days';

  const dateRange = getDateRange(period);
  const stats = await tracker.getUserVoiceStats(targetUser.id, dateRange.startDate, dateRange.endDate);

  const angelConfig = getAngelRoleConfig();
  const rewardCalc = calculateVoiceReward(stats.angelRoleMinutes);

  const embed = new EmbedBuilder()
    .setColor('#00ff00')
    .setTitle('💰 通話報酬計算')
    .setThumbnail(targetUser.displayAvatarURL())
    .addFields(
      { name: '👤 ユーザー', value: `<@${targetUser.id}>`, inline: true },
      { name: '📅 期間', value: getPeriodLabel(period), inline: true },
      { name: '👼 天使ロール時間', value: formatMinutes(stats.angelRoleMinutes), inline: true },
      { name: '💵 基本報酬', value: `${rewardCalc.baseReward}通貨`, inline: true },
      { name: '🎁 ボーナス報酬', value: `${rewardCalc.bonusReward}通貨`, inline: true },
      { name: '💎 総報酬', value: `**${rewardCalc.totalReward}通貨**`, inline: true }
    )
    .setFooter({ text: `レート: ${angelConfig.rewardRates.perMinute}通貨/分` })
    .setTimestamp();

  // 報酬詳細
  if (rewardCalc.details.length > 0) {
    embed.addFields({ 
      name: '📋 計算詳細', 
      value: rewardCalc.details.join('\n'), 
      inline: false 
    });
  }

  await interaction.reply({ embeds: [embed] });
}

/**
 * 期間から日付範囲を取得
 */
function getDateRange(period: string): { startDate: string; endDate: string } {
  const now = new Date();
  const tracker = getVoiceTimeTracker();

  switch (period) {
    case 'today':
      const today = now.toISOString().split('T')[0];
      return { startDate: today, endDate: today };
    
    case '7days':
      return tracker!.formatDateRange(7);
    
    case '30days':
      return tracker!.formatDateRange(30);
    
    case 'thismonth':
      return tracker!.getMonthRange(now.getFullYear(), now.getMonth() + 1);
    
    case 'lastmonth':
      const lastMonth = now.getMonth() === 0 ? 12 : now.getMonth();
      const lastMonthYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
      return tracker!.getMonthRange(lastMonthYear, lastMonth);
    
    default:
      return tracker!.formatDateRange(7);
  }
}

/**
 * 期間ラベルを取得
 */
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

/**
 * 分を時間:分形式にフォーマット
 */
function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  
  if (hours === 0) {
    return `${mins}分`;
  } else {
    return `${hours}時間${mins}分`;
  }
}

export default voiceStatsCommand;