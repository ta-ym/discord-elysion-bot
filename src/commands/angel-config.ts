import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { Command } from '../types';
import { getAngelRoleConfig, ANGEL_ROLE_CONFIG } from '../config/angelRole';
import { hasAdminPermission, getAdminPermissionErrorMessage } from '../utils/permissions';

const angelConfigCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('angel-config')
    .setDescription('【管理者専用】天使ロールの設定管理')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(subcommand =>
      subcommand
        .setName('show')
        .setDescription('現在の天使ロール設定を表示')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('test-reward')
        .setDescription('指定時間の報酬計算をテスト')
        .addIntegerOption(option =>
          option
            .setName('minutes')
            .setDescription('通話時間（分）')
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(1440) // 24時間
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

    try {
      switch (subcommand) {
        case 'show':
          await handleShowConfig(interaction);
          break;
        case 'test-reward':
          await handleTestReward(interaction);
          break;
        default:
          await interaction.reply({
            content: '❌ 不明なサブコマンドです。',
            ephemeral: true
          });
      }
    } catch (error) {
      console.error('Angel config command error:', error);
      await interaction.reply({
        content: '❌ エラーが発生しました。',
        ephemeral: true
      });
    }
  }
};

/**
 * 設定表示
 */
async function handleShowConfig(interaction: ChatInputCommandInteraction): Promise<void> {
  const config = getAngelRoleConfig();

  const configEmbed = new EmbedBuilder()
    .setColor('#ff69b4')
    .setTitle('👼 天使ロール設定')
    .addFields(
      { name: '🆔 ロールID', value: `\`${config.roleId}\``, inline: true },
      { name: '📛 ロール名', value: config.name, inline: true },
      { name: '⚡ 追跡有効', value: config.trackingEnabled ? '✅ 有効' : '❌ 無効', inline: true },
      { name: '💰 基本報酬レート', value: `${config.rewardRates.perMinute}通貨/分`, inline: false }
    )
    .setTimestamp();

  // ボーナス閾値の詳細
  const bonusText = config.rewardRates.bonusThresholds
    .map(threshold => `⏱️ **${threshold.minutes}分**: +${threshold.bonus}通貨`)
    .join('\n');

  if (bonusText) {
    configEmbed.addFields({ name: '🎁 ボーナス閾値', value: bonusText, inline: false });
  }

  // 報酬例
  const exampleMinutes = [30, 60, 180, 360];
  const examples = exampleMinutes.map(minutes => {
    const { totalReward } = calculateReward(minutes, config);
    return `**${minutes}分**: ${totalReward}通貨`;
  }).join(' | ');

  configEmbed.addFields({ name: '📊 報酬例', value: examples, inline: false });

  await interaction.reply({ embeds: [configEmbed], ephemeral: true });
}

/**
 * 報酬計算テスト
 */
async function handleTestReward(interaction: ChatInputCommandInteraction): Promise<void> {
  const minutes = interaction.options.getInteger('minutes', true);
  const config = getAngelRoleConfig();
  
  const rewardCalc = calculateReward(minutes, config);

  const testEmbed = new EmbedBuilder()
    .setColor('#00ff00')
    .setTitle('💰 報酬計算テスト')
    .addFields(
      { name: '⏱️ 通話時間', value: formatMinutes(minutes), inline: true },
      { name: '💵 基本報酬', value: `${rewardCalc.baseReward}通貨`, inline: true },
      { name: '🎁 ボーナス報酬', value: `${rewardCalc.bonusReward}通貨`, inline: true },
      { name: '💎 総報酬', value: `**${rewardCalc.totalReward}通貨**`, inline: false }
    )
    .setFooter({ text: `レート: ${config.rewardRates.perMinute}通貨/分` })
    .setTimestamp();

  // 計算詳細
  if (rewardCalc.details.length > 0) {
    testEmbed.addFields({ 
      name: '📋 計算詳細', 
      value: rewardCalc.details.join('\n'), 
      inline: false 
    });
  }

  await interaction.reply({ embeds: [testEmbed], ephemeral: true });
}

/**
 * 報酬計算（設定から）
 */
function calculateReward(minutes: number, config: typeof ANGEL_ROLE_CONFIG): {
  baseReward: number;
  bonusReward: number;
  totalReward: number;
  details: string[];
} {
  const baseReward = Math.floor(minutes * config.rewardRates.perMinute);
  let bonusReward = 0;
  const details: string[] = [];

  // ボーナス計算
  for (const threshold of config.rewardRates.bonusThresholds) {
    if (minutes >= threshold.minutes) {
      bonusReward += threshold.bonus;
      details.push(`${threshold.minutes}分達成ボーナス: ${threshold.bonus}通貨`);
    }
  }

  const totalReward = baseReward + bonusReward;

  details.unshift(`基本報酬: ${minutes}分 × ${config.rewardRates.perMinute} = ${baseReward}通貨`);

  return {
    baseReward,
    bonusReward,
    totalReward,
    details
  };
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

export default angelConfigCommand;