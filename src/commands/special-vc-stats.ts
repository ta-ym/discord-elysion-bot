import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { Command } from '../types';
import { getSpecialVCTracker } from '../utils/specialVCTracker';
import { hasAdminPermission, getAdminPermissionErrorMessage } from '../utils/permissions';

const specialVCStatsCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('special-vc-stats')
    .setDescription('【管理者専用】回廊・評価VC統計を表示')
    .addSubcommand(subcommand =>
      subcommand
        .setName('user')
        .setDescription('指定ユーザーの回廊・評価VC時間を表示')
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
        .setDescription('回廊・評価VC時間ランキングを表示')
        .addStringOption(option =>
          option
            .setName('type')
            .setDescription('ランキングの種類')
            .setRequired(false)
            .addChoices(
              { name: '回廊のみ', value: 'corridor' },
              { name: '評価のみ', value: 'evaluation' },
              { name: '合計', value: 'both' }
            )
        )
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
    const tracker = getSpecialVCTracker();

    if (!tracker) {
      await interaction.reply({
        content: '❌ 特別VC追跡システムが初期化されていません。',
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
        default:
          await interaction.reply({
            content: '❌ 不明なサブコマンドです。',
            ephemeral: true
          });
      }
    } catch (error) {
      console.error('Special VC stats command error:', error);
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
  const stats = await tracker.getUserSpecialVCStats(targetUser.id, dateRange.startDate, dateRange.endDate);

  const embed = new EmbedBuilder()
    .setColor('#9966ff')
    .setTitle('🏛️ 回廊・評価VC統計')
    .setThumbnail(targetUser.displayAvatarURL())
    .addFields(
      { name: '👤 ユーザー', value: `<@${targetUser.id}>`, inline: true },
      { name: '📅 期間', value: getPeriodLabel(period), inline: true },
      { name: '🏛️ 回廊時間', value: formatMinutes(stats.totalCorridorMinutes), inline: true },
      { name: '📊 評価VC時間', value: formatMinutes(stats.totalEvaluationMinutes), inline: true },
      { name: '⏱️ 合計時間', value: formatMinutes(stats.totalMinutes), inline: true },
      { name: '🔢 セッション数', value: `回廊:${stats.corridorSessions}回 評価:${stats.evaluationSessions}回`, inline: true }
    )
    .setFooter({ text: '天界カテゴリ内の回廊1-5と評価VCの統計' })
    .setTimestamp();

  // 天使ロール時間
  if (stats.angelCorridorMinutes > 0 || stats.angelEvaluationMinutes > 0) {
    embed.addFields({
      name: '👼 天使ロール時間',
      value: `回廊: ${formatMinutes(stats.angelCorridorMinutes)}\n評価: ${formatMinutes(stats.angelEvaluationMinutes)}`,
      inline: true
    });
  }

  // 日別詳細（最新5日分）
  if (stats.dailyStats.length > 0) {
    const recentStats = stats.dailyStats.slice(0, 5);
    const dailyDetails = recentStats.map((stat: any) => 
      `**${stat.date}**: 回廊${formatMinutes(stat.corridor_minutes)} 評価${formatMinutes(stat.evaluation_minutes)}`
    ).join('\n');

    embed.addFields({ name: '📈 最近の記録', value: dailyDetails || 'データなし', inline: false });
  }

  await interaction.reply({ embeds: [embed] });
}

/**
 * ランキング表示
 */
async function handleRanking(interaction: ChatInputCommandInteraction, tracker: any): Promise<void> {
  const type = interaction.options.getString('type') as 'corridor' | 'evaluation' | 'both' || 'both';
  const period = interaction.options.getString('period') || '7days';
  const dateRange = getDateRange(period);

  const ranking = await tracker.getSpecialVCRanking(type, dateRange.startDate, dateRange.endDate);

  if (ranking.length === 0) {
    await interaction.reply({
      content: '📭 指定期間に回廊・評価VCの記録がありません。',
      ephemeral: true
    });
    return;
  }

  const typeLabel = type === 'corridor' ? '🏛️ 回廊' : type === 'evaluation' ? '📊 評価VC' : '🏛️ 回廊・評価VC合計';

  const embed = new EmbedBuilder()
    .setColor('#ff6600')
    .setTitle(`🏆 ${typeLabel}時間ランキング`)
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
    
    if (type === 'corridor') {
      rankingText += `   🏛️ ${formatMinutes(stat.corridor_minutes)} (${stat.corridor_sessions}回)\n\n`;
    } else if (type === 'evaluation') {
      rankingText += `   📊 ${formatMinutes(stat.evaluation_minutes)} (${stat.evaluation_sessions}回)\n\n`;
    } else {
      rankingText += `   ⏱️ ${formatMinutes(stat.total_minutes)}\n`;
      rankingText += `   🏛️ 回廊: ${formatMinutes(stat.corridor_minutes)} 📊 評価: ${formatMinutes(stat.evaluation_minutes)}\n\n`;
    }
  }

  embed.addFields({ name: '🏅 ランキング', value: rankingText.trim(), inline: false });

  await interaction.reply({ embeds: [embed] });
}

/**
 * 期間から日付範囲を取得
 */
function getDateRange(period: string): { startDate: string; endDate: string } {
  const now = new Date();

  switch (period) {
    case 'today':
      const today = now.toISOString().split('T')[0];
      return { startDate: today, endDate: today };
    
    case '7days':
      const start7 = new Date();
      start7.setDate(now.getDate() - 6);
      return {
        startDate: start7.toISOString().split('T')[0],
        endDate: now.toISOString().split('T')[0]
      };
    
    case '30days':
      const start30 = new Date();
      start30.setDate(now.getDate() - 29);
      return {
        startDate: start30.toISOString().split('T')[0],
        endDate: now.toISOString().split('T')[0]
      };
    
    case 'thismonth':
      const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      return {
        startDate: thisMonthStart.toISOString().split('T')[0],
        endDate: now.toISOString().split('T')[0]
      };
    
    case 'lastmonth':
      const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
      return {
        startDate: lastMonthStart.toISOString().split('T')[0],
        endDate: lastMonthEnd.toISOString().split('T')[0]
      };
    
    default:
      const defaultStart = new Date();
      defaultStart.setDate(now.getDate() - 6);
      return {
        startDate: defaultStart.toISOString().split('T')[0],
        endDate: now.toISOString().split('T')[0]
      };
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

export default specialVCStatsCommand;