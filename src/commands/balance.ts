import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { Command } from '../types';
import { Database } from '../database';

const balanceCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('balance')
    .setDescription('あなたのRu_men残高を確認します'),
  
  async execute(interaction: ChatInputCommandInteraction) {
    const database = new Database();
    
    try {
      // ユーザーを取得または作成
      let user = await database.getUser(interaction.user.id);
      if (!user) {
        user = await database.createUser(interaction.user.id);
      }

      const embed = new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle('💰 Ru_men残高')
        .setDescription(`**${user.balance.toLocaleString()} Ru**`)
        .setThumbnail(interaction.user.displayAvatarURL())
        .setTimestamp()
        .setFooter({ text: 'Elysion Bot Currency System' });

      await interaction.reply({ embeds: [embed], ephemeral: true });
    } catch (error) {
      console.error('Error in balance command:', error);
      await interaction.reply({ 
        content: '❌ 残高の確認中にエラーが発生しました。', 
        ephemeral: true 
      });
    }
  },
};

export default balanceCommand;