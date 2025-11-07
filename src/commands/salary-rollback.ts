import { 
  CommandInteraction, 
  SlashCommandBuilder, 
  EmbedBuilder, 
  PermissionFlagsBits,
  User,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} from 'discord.js';
import { Database } from '../database';

const database = new Database();

export const data = new SlashCommandBuilder()
  .setName('salary-rollback')
  .setDescription('指定したユーザーの最新の月給支給をロールバックします')
  .addUserOption(option =>
    option.setName('user')
      .setDescription('ロールバック対象のユーザー')
      .setRequired(true))
  .addStringOption(option =>
    option.setName('month')
      .setDescription('ロールバック対象の月（YYYY-MM形式、省略時は今月）')
      .setRequired(false))
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction: CommandInteraction) {
  if (!interaction.isChatInputCommand()) return;

  try {
    const targetUser = interaction.options.getUser('user', true) as User;
    const monthOption = interaction.options.getString('month');
    const currentMonth = new Date().toISOString().substring(0, 7); // YYYY-MM
    const targetMonth = monthOption || currentMonth;

    // 月の形式をチェック
    if (monthOption && !/^\d{4}-\d{2}$/.test(monthOption)) {
      await interaction.reply({
        content: '❌ 月の形式が正しくありません。YYYY-MM形式で入力してください。（例: 2024-01）',
        ephemeral: true
      });
      return;
    }

    console.log(`[SALARY-ROLLBACK] Checking salary for user ${targetUser.id} in month ${targetMonth}`);

    // 指定された月の給与支給記録を確認
    const salaryRecord = await database.checkMonthlySalaryStatus(targetUser.id, targetMonth);
    
    if (!salaryRecord) {
      await interaction.reply({
        content: `❌ ${targetUser.displayName} さんの ${targetMonth} の月給支給記録が見つかりません。`,
        ephemeral: true
      });
      return;
    }

    // 確認メッセージを作成
    const confirmEmbed = new EmbedBuilder()
      .setColor('#ff6b6b')
      .setTitle('⚠️ 月給ロールバック確認')
      .setDescription('以下の月給支給をロールバックしますか？\n**この操作は取り消すことができません。**')
      .addFields(
        { name: '👤 対象ユーザー', value: `<@${targetUser.id}>`, inline: true },
        { name: '📅 支給月', value: targetMonth, inline: true },
        { name: '💰 支給額', value: `${salaryRecord.amount?.toLocaleString() || 0} Ru`, inline: true },
        { name: '🏷️ ロールID', value: salaryRecord.role_id || 'Unknown', inline: true },
        { name: '👨‍💼 支給者', value: `<@${salaryRecord.paid_by}>`, inline: true },
        { name: '📝 説明', value: salaryRecord.description || 'なし', inline: false }
      )
      .setTimestamp();

    const confirmRow = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`salary_rollback_confirm_${targetUser.id}_${targetMonth}_${interaction.user.id}`)
          .setLabel('ロールバック実行')
          .setStyle(ButtonStyle.Danger)
          .setEmoji('⚠️'),
        new ButtonBuilder()
          .setCustomId(`salary_rollback_cancel_${targetUser.id}_${targetMonth}_${interaction.user.id}`)
          .setLabel('キャンセル')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('❌')
      );

    await interaction.reply({
      embeds: [confirmEmbed],
      components: [confirmRow],
      ephemeral: true
    });

  } catch (error) {
    console.error('[SALARY-ROLLBACK] Error in salary-rollback command:', error);
    
    try {
      await interaction.reply({
        content: '❌ 月給ロールバック処理中にエラーが発生しました。',
        ephemeral: true
      });
    } catch (replyError) {
      console.error('[SALARY-ROLLBACK] Failed to send error reply:', replyError);
    }
  }
}

/**
 * 月給ロールバックを実行する
 */
export async function executeSalaryRollback(
  targetUserId: string, 
  targetMonth: string, 
  adminId: string
): Promise<{ success: boolean; message: string; amount?: number }> {
  try {
    console.log(`[SALARY-ROLLBACK] Executing rollback for user ${targetUserId}, month ${targetMonth}`);

    // 再度給与記録を確認
    const salaryRecord = await database.checkMonthlySalaryStatus(targetUserId, targetMonth);
    
    if (!salaryRecord) {
      return {
        success: false,
        message: '給与支給記録が見つかりません。既にロールバックされている可能性があります。'
      };
    }

    // ユーザーの現在の残高を確認
    let user = await database.getUser(targetUserId);
    if (!user) {
      return {
        success: false,
        message: 'ユーザーが見つかりません。'
      };
    }

    const rollbackAmount = salaryRecord.amount || 0;

    // 残高が足りない場合の警告
    if (user.balance < rollbackAmount) {
      return {
        success: false,
        message: `ロールバック失敗: ユーザーの現在残高 (${user.balance.toLocaleString()} Ru) が給与額 (${rollbackAmount.toLocaleString()} Ru) を下回っています。`
      };
    }

    // トランザクション開始
    // 1. ユーザーの残高から給与分を減額
    const newBalance = user.balance - rollbackAmount;
    await database.updateUserBalance(targetUserId, newBalance);

    // 2. 給与支給記録を削除
    await database.deleteMonthlySalaryClaim(targetUserId, targetMonth);

    // 3. ロールバック記録をトランザクション履歴に追加
    await database.addTransaction(
      adminId,
      targetUserId,
      -rollbackAmount,
      'admin_give',
      `月給ロールバック (${targetMonth}) - 管理者: ${adminId}`
    );

    console.log(`[SALARY-ROLLBACK] Successfully rolled back salary: ${rollbackAmount} Ru for user ${targetUserId}`);

    return {
      success: true,
      message: `月給ロールバックが完了しました。${rollbackAmount.toLocaleString()} Ru を回収しました。`,
      amount: rollbackAmount
    };

  } catch (error) {
    console.error('[SALARY-ROLLBACK] Error executing salary rollback:', error);
    return {
      success: false,
      message: 'ロールバック処理中にエラーが発生しました。'
    };
  }
}