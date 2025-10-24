import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, PermissionFlagsBits, GuildMember } from 'discord.js';
import { Command } from '../types';
import { Database } from '../database';

const salaryHistoryCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('salary-history')
    .setDescription('月給受取履歴を表示します')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('履歴を確認するユーザー（管理者のみ他ユーザー指定可能）')
        .setRequired(false))
    .addIntegerOption(option =>
      option.setName('limit')
        .setDescription('表示する履歴の件数（デフォルト: 12件）')
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(50)),
  
  async execute(interaction: ChatInputCommandInteraction) {
    try {
      const database = new Database();
      const member = interaction.member as GuildMember;
      const targetUser = interaction.options.getUser('user');
      const limit = interaction.options.getInteger('limit') || 12;

      // 他ユーザーの履歴を見る場合は管理者権限が必要
      if (targetUser && targetUser.id !== interaction.user.id) {
        if (!member?.permissions.has(PermissionFlagsBits.Administrator)) {
          await interaction.reply({
            content: '❌ 他のユーザーの履歴を確認するには管理者権限が必要です。',
            ephemeral: true
          });
          return;
        }
      }

      const userId = targetUser?.id || interaction.user.id;
      const displayUser = targetUser || interaction.user;

      // 月給履歴を取得
      const salaryHistory = await database.getMonthlySalaryHistory(userId, limit);

      if (salaryHistory.length === 0) {
        const message = targetUser 
          ? `📋 ${displayUser.displayName} の月給受取履歴はありません。`
          : '📋 あなたの月給受取履歴はありません。\n管理者による月給支給をお待ちください。';
        
        await interaction.reply({ 
          content: message, 
          ephemeral: true 
        });
        return;
      }

      const embed = new EmbedBuilder()
        .setColor(0x4ECDC4)
        .setTitle('💼 月給受取履歴')
        .setDescription(`${displayUser.displayName} の最新${salaryHistory.length}件の月給受取履歴`)
        .setThumbnail(displayUser.displayAvatarURL())
        .setTimestamp()
        .setFooter({ text: 'Elysion Bot Monthly Salary History' });

      // 月給履歴をフィールドとして追加
      for (const salary of salaryHistory) {
        const date = new Date(salary.created_at).toLocaleDateString('ja-JP', {
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        });

        const time = new Date(salary.created_at).toLocaleTimeString('ja-JP', {
          hour: '2-digit',
          minute: '2-digit'
        });

        embed.addFields({
          name: `💰 ${salary.claim_month}`,
          value: `**受取額:** ${salary.amount.toLocaleString()} Ru\n**ロール:** ${salary.role_name}\n**支給者:** <@${salary.paid_by}>\n**支給日:** ${date} ${time}${salary.description ? `\n**備考:** ${salary.description}` : ''}`,
          inline: true
        });
      }

      // 統計情報を追加
      const totalReceived = salaryHistory.reduce((sum, salary) => sum + salary.amount, 0);
      const averageSalary = Math.round(totalReceived / salaryHistory.length);
      
      embed.addFields({
        name: '📊 統計情報',
        value: `**総受取額:** ${totalReceived.toLocaleString()} Ru\n**受取回数:** ${salaryHistory.length}回\n**平均月給:** ${averageSalary.toLocaleString()} Ru`,
        inline: false
      });

      // 管理者の場合は全体履歴も表示可能にする
      if (member?.permissions.has(PermissionFlagsBits.Administrator) && !targetUser) {
        embed.addFields({
          name: '👑 管理者機能',
          value: '他のユーザーの履歴を確認するには `/salary-history user:@ユーザー名` を使用してください',
          inline: false
        });
      }

      await interaction.reply({ embeds: [embed], ephemeral: true });

    } catch (error) {
      console.error('Error in salary-history command:', error);
      await interaction.reply({ 
        content: '❌ 月給履歴の取得中にエラーが発生しました。', 
        ephemeral: true 
      });
    }
  },
};

export default salaryHistoryCommand;