import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { Command } from '../types';
import { Database } from '../database';

const historyCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('history')
    .setDescription('あなたのRu_men取引履歴を確認します')
    .addIntegerOption(option =>
      option.setName('limit')
        .setDescription('表示する履歴の件数（デフォルト: 10件）')
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(20)),
  
  async execute(interaction: ChatInputCommandInteraction) {
    const limit = interaction.options.getInteger('limit') || 10;
    const database = new Database();
    
    try {
      // ユーザーを取得または作成
      let user = await database.getUser(interaction.user.id);
      if (!user) {
        user = await database.createUser(interaction.user.id);
      }

      // 取引履歴を取得
      const transactions = await database.getUserTransactions(interaction.user.id, limit);

      if (transactions.length === 0) {
        await interaction.reply({ 
          content: '📋 取引履歴はありません。', 
          ephemeral: true 
        });
        return;
      }

      const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle('📋 Ru_men取引履歴')
        .setDescription(`最新${transactions.length}件の取引履歴`)
        .setThumbnail(interaction.user.displayAvatarURL())
        .setTimestamp()
        .setFooter({ text: `現在の残高: ${user.balance.toLocaleString()} Ru` });

      // 取引履歴をフィールドとして追加
      for (const transaction of transactions) {
        let title = '';
        let description = '';
        let emoji = '';

        switch (transaction.type) {
          case 'admin_give':
            emoji = '🎁';
            title = '管理者からの付与';
            description = `+${transaction.amount.toLocaleString()} Ru`;
            break;
          case 'transfer':
            if (transaction.from_user_id === interaction.user.id) {
              emoji = '📤';
              title = `送金 → <@${transaction.to_user_id}>`;
              description = `-${transaction.amount.toLocaleString()} Ru`;
            } else {
              emoji = '📥';
              title = `受取 ← <@${transaction.from_user_id}>`;
              description = `+${transaction.amount.toLocaleString()} Ru`;
            }
            break;
        }

        const date = new Date(transaction.created_at).toLocaleString('ja-JP', {
          timeZone: 'Asia/Tokyo',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit'
        });

        embed.addFields({
          name: `${emoji} ${title}`,
          value: `${description}\n**理由:** ${transaction.description}\n**日時:** ${date}`,
          inline: false
        });
      }

      await interaction.reply({ embeds: [embed], ephemeral: true });
      
    } catch (error) {
      console.error('Error in history command:', error);
      await interaction.reply({ 
        content: '❌ 取引履歴の取得中にエラーが発生しました。', 
        ephemeral: true 
      });
    }
  },
};

export default historyCommand;