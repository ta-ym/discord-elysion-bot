import { 
  CommandInteraction, 
  SlashCommandBuilder, 
  EmbedBuilder, 
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags
} from 'discord.js';
import { Database } from '../database';
import { hasAdminPermission, getAdminPermissionErrorMessage } from '../utils/permissions';

const database = new Database();

export const data = new SlashCommandBuilder()
  .setName('salary-rollback-all')
  .setDescription('【管理者専用】指定した月の全員の月給支給をロールバックします')
  .addStringOption(option =>
    option.setName('confirmation')
      .setDescription('確認用：この操作を実行するには "CONFIRM_ROLLBACK_ALL" と入力してください')
      .setRequired(true))
  .addStringOption(option =>
    option.setName('month')
      .setDescription('ロールバック対象の月（YYYY-MM形式、省略時は今月）')
      .setRequired(false));
  // 一時的に管理者権限制限を無効化してテスト
  // .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction: CommandInteraction) {
  if (!interaction.isChatInputCommand()) return;

  // 権限チェック（特定ユーザーのみ）
  if (!hasAdminPermission(interaction.user.id)) {
    await interaction.reply({
      content: getAdminPermissionErrorMessage(),
      ephemeral: true
    });
    return;
  }

  try {
    const targetMonth = interaction.options.getString('month');
    const confirmation = interaction.options.getString('confirmation');
    
    // 確認文字列のチェック
    if (confirmation !== 'CONFIRM_ROLLBACK_ALL') {
      const errorEmbed = new EmbedBuilder()
        .setColor('#ff0000')
        .setTitle('❌ 確認エラー')
        .setDescription('この危険な操作を実行するには、確認用フィールドに `CONFIRM_ROLLBACK_ALL` と正確に入力してください。')
        .setTimestamp();

      await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
      return;
    }

    // 月の形式をチェック・設定
    let monthToRollback: string;
    if (targetMonth) {
      if (!/^\d{4}-\d{2}$/.test(targetMonth)) {
        const errorEmbed = new EmbedBuilder()
          .setColor('#ff0000')
          .setTitle('❌ 形式エラー')
          .setDescription('月の形式が正しくありません。YYYY-MM形式で入力してください。\n例: 2024-11')
          .setTimestamp();

        await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
        return;
      }
      monthToRollback = targetMonth;
    } else {
      const now = new Date();
      monthToRollback = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    }

    // 対象月の月給履歴を取得
    const salaryHistory = await database.getMonthlySalaryHistory(monthToRollback);
    
    if (salaryHistory.length === 0) {
      const noDataEmbed = new EmbedBuilder()
        .setColor('#ffaa00')
        .setTitle('⚠️ データなし')
        .setDescription(`${monthToRollback}月の月給支給記録が見つかりませんでした。`)
        .setTimestamp();

      await interaction.reply({ embeds: [noDataEmbed], flags: MessageFlags.Ephemeral });
      return;
    }

    // 影響を受けるユーザーとロールバック可能な記録を分析（全ての記録がロールバック対象）
    const rollbackableRecords = salaryHistory; // MonthlySalaryClaimにはstatusがないため、全てがロールバック対象
    const totalAmount = rollbackableRecords.reduce((sum, record) => sum + record.amount, 0);

    if (rollbackableRecords.length === 0) {
      const noRollbackEmbed = new EmbedBuilder()
        .setColor('#ffaa00')
        .setTitle('⚠️ ロールバック対象なし')
        .setDescription(`${monthToRollback}月にロールバック可能な月給記録がありません。`)
        .setTimestamp();

      await interaction.reply({ embeds: [noRollbackEmbed], flags: MessageFlags.Ephemeral });
      return;
    }

    // 確認用Embed
    const confirmEmbed = new EmbedBuilder()
      .setColor('#ff6600')
      .setTitle('🚨 【危険な操作】全員月給ロールバック確認')
      .setDescription(`**この操作は非常に危険です。慎重に確認してください。**`)
      .addFields(
        { name: '📅 対象月', value: monthToRollback, inline: true },
        { name: '👥 影響ユーザー数', value: `${rollbackableRecords.length}人`, inline: true },
        { name: '💰 総回収金額', value: `${totalAmount.toLocaleString()}Ru`, inline: true },
        { name: '⚠️ 重要な注意', value: 
          '• この操作は**全員の月給を一括でロールバック**します\n' +
          '• 各ユーザーの残高から月給分が**差し引かれます**\n' +
          '• 残高不足のユーザーは**マイナス残高**になります\n' +
          '• この操作は**取り消すことができません**', inline: false },
        { name: '📋 影響を受けるユーザー', value: 
          rollbackableRecords.slice(0, 10).map(record => 
            `<@${record.user_id}> - ${record.amount.toLocaleString()}Ru`
          ).join('\n') + 
          (rollbackableRecords.length > 10 ? `\n...他${rollbackableRecords.length - 10}人` : ''), 
          inline: false }
      )
      .setFooter({ text: '本当に実行しますか？この操作を元に戻すことはできません。' })
      .setTimestamp();

    // 確認ボタン
    const confirmRow = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`salary_rollback_all_confirm_${monthToRollback}`)
          .setLabel('🚨 実行する（取り消し不可）')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId(`salary_rollback_all_cancel_${monthToRollback}`)
          .setLabel('❌ キャンセル')
          .setStyle(ButtonStyle.Secondary)
      );

    await interaction.reply({ 
      embeds: [confirmEmbed], 
      components: [confirmRow],
      flags: MessageFlags.Ephemeral 
    });

  } catch (error) {
    console.error('Salary rollback all command error:', error);
    
    const errorEmbed = new EmbedBuilder()
      .setColor('#ff0000')
      .setTitle('❌ エラー')
      .setDescription('コマンドの実行中にエラーが発生しました。')
      .setTimestamp();

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
    } else {
      await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
    }
  }
}

// 全員ロールバック実行関数
export async function executeSalaryRollbackAll(interaction: any, month: string) {
  try {
    // 再度対象月の記録を取得
    const salaryHistory = await database.getMonthlySalaryHistory(month);
    const rollbackableRecords = salaryHistory; // 全ての記録がロールバック対象

    if (rollbackableRecords.length === 0) {
      const errorEmbed = new EmbedBuilder()
        .setColor('#ff0000')
        .setTitle('❌ ロールバック失敗')
        .setDescription('ロールバック可能な記録が見つかりませんでした。')
        .setTimestamp();

      await interaction.update({ embeds: [errorEmbed], components: [] });
      return;
    }

    // プログレス表示
    const progressEmbed = new EmbedBuilder()
      .setColor('#ffaa00')
      .setTitle('⏳ 全員ロールバック実行中...')
      .setDescription(`${rollbackableRecords.length}人の月給をロールバックしています...`)
      .setTimestamp();

    await interaction.update({ embeds: [progressEmbed], components: [] });

    let successCount = 0;
    let errorCount = 0;
    const errorUsers: string[] = [];

    // 各ユーザーの月給をロールバック
    for (const record of rollbackableRecords) {
      try {
        // ユーザーの現在残高を取得
        const user = await database.getUser(record.user_id);
        if (!user) {
          console.error(`[SALARY ROLLBACK ALL ERROR] User ${record.user_id} not found`);
          errorCount++;
          errorUsers.push(`<@${record.user_id}>`);
          continue;
        }
        
        const currentBalance = user.balance;
        
        // 月給をロールバック（残高から差し引き）
        const newBalance = currentBalance - record.amount;
        await database.updateUserBalance(record.user_id, newBalance);
        
        // 月給記録を削除
        await database.deleteMonthlySalaryClaim(record.user_id, month);
        
        successCount++;
        
        // システムログに記録
        console.log(`[SALARY ROLLBACK ALL] User ${record.user_id}: ${record.amount} Ruをロールバック（${currentBalance} → ${newBalance}）`);
        
      } catch (error) {
        console.error(`[SALARY ROLLBACK ALL ERROR] User ${record.user_id}:`, error);
        errorCount++;
        errorUsers.push(`<@${record.user_id}>`);
      }
    }

    // 結果表示
    const resultEmbed = new EmbedBuilder()
      .setColor(errorCount > 0 ? '#ffaa00' : '#00ff00')
      .setTitle(errorCount > 0 ? '⚠️ 全員ロールバック完了（一部エラー）' : '✅ 全員ロールバック完了')
      .addFields(
        { name: '📅 対象月', value: month, inline: true },
        { name: '✅ 成功', value: `${successCount}人`, inline: true },
        { name: '❌ エラー', value: `${errorCount}人`, inline: true }
      )
      .setTimestamp();

    if (errorCount > 0 && errorUsers.length > 0) {
      resultEmbed.addFields({
        name: '❌ エラーが発生したユーザー',
        value: errorUsers.slice(0, 10).join(', ') + (errorUsers.length > 10 ? `\n...他${errorUsers.length - 10}人` : ''),
        inline: false
      });
    }

    resultEmbed.addFields({
      name: '📝 注意',
      value: '• ロールバックされたユーザーの残高から月給分が差し引かれました\n• 一部のユーザーは残高がマイナスになっている可能性があります\n• 詳細はログを確認してください',
      inline: false
    });

    await interaction.editReply({ embeds: [resultEmbed], components: [] });

  } catch (error) {
    console.error('Execute salary rollback all error:', error);
    
    const errorEmbed = new EmbedBuilder()
      .setColor('#ff0000')
      .setTitle('❌ 全員ロールバック失敗')
      .setDescription('ロールバック処理中にエラーが発生しました。\n管理者に連絡してください。')
      .setTimestamp();

    await interaction.editReply({ embeds: [errorEmbed], components: [] });
  }
}