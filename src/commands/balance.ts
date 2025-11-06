import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { Command } from '../types';
import { globalDatabase } from '../index';

const balanceCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('balance')
    .setDescription('あなたのRu_men残高を確認します'),
  
  async execute(interaction: ChatInputCommandInteraction) {
    // 最初に応答を延期（3秒のタイムアウト防止）
    await interaction.deferReply({ ephemeral: true });
    
    const database = globalDatabase;
    
    try {
      console.log(`[BALANCE] Processing balance request for user ${interaction.user.id}`);
      
      // ユーザーを取得または作成
      let user = await database.getUser(interaction.user.id);
      console.log(`[BALANCE] User lookup result:`, user ? 'found' : 'not found');
      
      if (!user) {
        console.log(`[BALANCE] Creating new user ${interaction.user.id}`);
        user = await database.createUser(interaction.user.id);
        console.log(`[BALANCE] User created with balance: ${user.balance}`);
      }

      const embed = new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle('💰 Ru_men残高')
        .setDescription(`**${user.balance.toLocaleString()} Ru**`)
        .setThumbnail(interaction.user.displayAvatarURL())
        .setTimestamp()
        .setFooter({ text: 'Elysion Bot Currency System' });

      console.log(`[BALANCE] Sending balance response for user ${interaction.user.id}: ${user.balance} Ru`);
      await interaction.editReply({ embeds: [embed] });
      
    } catch (error) {
      console.error('[BALANCE] Error in balance command:', error);
      
      try {
        await interaction.editReply({ 
          content: '❌ 残高の確認中にエラーが発生しました。しばらく時間をおいて再度お試しください。' 
        });
      } catch (replyError) {
        console.error('[BALANCE] Failed to send error reply:', replyError);
      }
    }
  },
};

export default balanceCommand;