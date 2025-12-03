import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { Command, SalaryDetail } from '../types';
import { Database } from '../database';
import { getRoleDisplayName } from '../config/salaryRoles';
import { hasAdminPermission, getAdminPermissionErrorMessage } from '../utils/permissions';

const salaryDetailsCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('salary-details')
    .setDescription('ユーザーの給与内訳を確認します')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('給与内訳を確認するユーザー（省略時は自分）')
        .setRequired(false))
    .addStringOption(option =>
      option.setName('month')
        .setDescription('確認する月（YYYY-MM形式、省略時は今月）')
        .setRequired(false)
        .setMaxLength(7))
    .setDefaultMemberPermissions(PermissionFlagsBits.SendMessages),
  
  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();

    try {
      const database = new Database();
      const targetUser = interaction.options.getUser('user') || interaction.user;
      const targetMonth = interaction.options.getString('month') || new Date().toISOString().slice(0, 7);

      // 権限チェック（他人の給与を見る場合は管理者権限が必要）
      if (targetUser.id !== interaction.user.id) {
        if (!hasAdminPermission(interaction.user.id)) {
          await interaction.editReply({
            content: getAdminPermissionErrorMessage()
          });
          return;
        }
      }

      // 月形式のバリデーション
      if (!/^\d{4}-\d{2}$/.test(targetMonth)) {
        await interaction.editReply({
          content: '❌ 月の形式が正しくありません。YYYY-MM形式で入力してください。（例: 2024-11）'
        });
        return;
      }

      // 給与詳細を取得
      const salaryDetails: SalaryDetail[] = await database.getSalaryDetails(targetUser.id, targetMonth);
      
      if (!salaryDetails || salaryDetails.length === 0) {
        const monthDisplay = new Date(targetMonth + '-01').toLocaleDateString('ja-JP', { 
          year: 'numeric', 
          month: 'long' 
        });
        
        await interaction.editReply({
          content: `${targetUser.displayName || targetUser.username} の ${monthDisplay} の給与支給記録が見つかりませんでした。`
        });
        return;
      }

      // 給与内訳を集計
      const totalAmount = salaryDetails.reduce((sum: number, detail: SalaryDetail) => sum + detail.amount, 0);
      const paymentCount = salaryDetails.length;
      
      // ロール別の集計
      const roleAmounts = new Map<string, number>();
      salaryDetails.forEach((detail: SalaryDetail) => {
        const roleName = getRoleDisplayName(detail.role_id);
        roleAmounts.set(roleName, (roleAmounts.get(roleName) || 0) + detail.amount);
      });

      // 詳細な支給履歴（最新5件まで表示）
      const recentPayments = salaryDetails
        .sort((a: SalaryDetail, b: SalaryDetail) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 5);

      // Embed作成
      const monthDisplay = new Date(targetMonth + '-01').toLocaleDateString('ja-JP', { 
        year: 'numeric', 
        month: 'long' 
      });

      const embed = new EmbedBuilder()
        .setColor(0x4ECDC4)
        .setTitle('💰 給与詳細')
        .setDescription(`**${targetUser.displayName || targetUser.username}** の ${monthDisplay} 給与内訳`)
        .addFields(
          { 
            name: '📊 集計情報', 
            value: `**総支給額**: ${totalAmount.toLocaleString()} Ru\n**支給回数**: ${paymentCount}回`, 
            inline: false 
          }
        );

      // ロール別内訳を追加
      if (roleAmounts.size > 0) {
        const roleBreakdown = Array.from(roleAmounts.entries())
          .sort((a, b) => b[1] - a[1]) // 金額の多い順
          .map(([role, amount]) => `**${role}**: ${amount.toLocaleString()} Ru`)
          .join('\n');
        
        embed.addFields({
          name: '🎭 ロール別内訳',
          value: roleBreakdown,
          inline: false
        });
      }

      // 最新の支給履歴を追加
      if (recentPayments.length > 0) {
        const paymentHistory = recentPayments
          .map((payment: SalaryDetail) => {
            const date = new Date(payment.created_at).toLocaleDateString('ja-JP', {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            });
            const roleName = getRoleDisplayName(payment.role_id);
            return `\`${date}\` **${payment.amount.toLocaleString()} Ru** - ${roleName}`;
          })
          .join('\n');

        embed.addFields({
          name: `📅 最新の支給履歴 (最新${recentPayments.length}件)`,
          value: paymentHistory,
          inline: false
        });
      }

      // 説明文を追加
      if (paymentCount > 5) {
        embed.addFields({
          name: 'ℹ️ 補足',
          value: `支給履歴は最新5件のみ表示しています。全${paymentCount}件の支給記録があります。`,
          inline: false
        });
      }

      embed.setTimestamp()
        .setFooter({ 
          text: targetUser.id === interaction.user.id 
            ? `${interaction.user.username} の給与詳細` 
            : `確認者: ${interaction.user.username}` 
        });

      await interaction.editReply({ embeds: [embed] });

    } catch (error) {
      console.error('Error in salary-details command:', error);
      await interaction.editReply({
        content: '❌ 給与詳細の取得中にエラーが発生しました。'
      });
    }
  },
};

export default salaryDetailsCommand;