import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { Command } from '../types';
import { getCloneVCManager } from '../utils/cloneVCManager';

const cloneVCCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('clone-vc')
    .setDescription('複製VC管理システムの状態を確認')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(subcommand =>
      subcommand
        .setName('status')
        .setDescription('現在のアクティブな複製VCの状態を表示')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('cleanup')
        .setDescription('期限切れの複製VCを手動で清掃')
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const subcommand = interaction.options.getSubcommand();
    
    try {
      const cloneVCManager = getCloneVCManager();
      
      if (!cloneVCManager) {
        await interaction.reply({
          content: '❌ 複製VC管理システムが初期化されていません。',
          ephemeral: true
        });
        return;
      }

      if (subcommand === 'status') {
        const stats = cloneVCManager.getStats();
        
        const embed = new EmbedBuilder()
          .setColor('#00ff00')
          .setTitle('🔄 複製VC管理システム - 状況')
          .addFields(
            { name: '📊 アクティブな複製VC', value: `${stats.activeChannels}個`, inline: true },
            { name: '🆔 複製用VC ID', value: '1439275955481870357', inline: true },
            { name: '📁 カテゴリ ID', value: '1425044725865648148', inline: true }
          )
          .setFooter({ text: 'アクティブな複製VCは1時間後に自動削除されます' })
          .setTimestamp();

        // アクティブなチャンネルの詳細
        if (stats.activeChannels > 0) {
          let channelDetails = '';
          let count = 0;
          
          for (const [userId, channelId] of stats.createdChannels.entries()) {
            if (count >= 10) { // 最大10個まで表示
              channelDetails += `... および他 ${stats.activeChannels - 10} 個`;
              break;
            }
            
            const user = interaction.client.users.cache.get(userId);
            const channel = interaction.guild?.channels.cache.get(channelId);
            
            if (user && channel) {
              channelDetails += `• ${user.displayName}: ${channel.name} (${channelId})\n`;
            } else {
              channelDetails += `• 不明: ${channelId}\n`;
            }
            count++;
          }
          
          if (channelDetails) {
            embed.addFields({ 
              name: '🎤 アクティブなチャンネル', 
              value: channelDetails.trim(),
              inline: false 
            });
          }
        }

        await interaction.reply({ embeds: [embed], ephemeral: true });
        
      } else if (subcommand === 'cleanup') {
        await interaction.deferReply({ ephemeral: true });
        
        try {
          const guild = interaction.guild;
          if (!guild) {
            await interaction.editReply('❌ サーバー情報の取得に失敗しました。');
            return;
          }
          
          await cloneVCManager.cleanupExpiredVCs(guild);
          
          const embed = new EmbedBuilder()
            .setColor('#00ff00')
            .setTitle('🧹 複製VC清掃完了')
            .setDescription('期限切れの複製VCの清掃処理を実行しました。')
            .setTimestamp();
            
          await interaction.editReply({ embeds: [embed] });
          
        } catch (cleanupError) {
          console.error('[CLONE VC COMMAND] Cleanup error:', cleanupError);
          
          const errorEmbed = new EmbedBuilder()
            .setColor('#ff0000')
            .setTitle('❌ 清掃エラー')
            .setDescription('複製VCの清掃中にエラーが発生しました。')
            .setTimestamp();
            
          await interaction.editReply({ embeds: [errorEmbed] });
        }
      }
      
    } catch (error) { 
      console.error('[CLONE VC COMMAND] Error:', error);
      
      const errorEmbed = new EmbedBuilder()
        .setColor('#ff0000')
        .setTitle('❌ コマンドエラー')
        .setDescription('複製VC管理コマンドの実行中にエラーが発生しました。')
        .setTimestamp();
      
      if (interaction.deferred) {
        await interaction.editReply({ embeds: [errorEmbed] });
      } else {
        await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
      }
    }
  },
};

export default cloneVCCommand;