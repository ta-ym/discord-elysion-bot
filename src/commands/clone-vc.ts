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
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    try {
      const cloneVCManager = getCloneVCManager();
      
      if (!cloneVCManager) {
        await interaction.reply({
          content: '❌ 複製VC管理システムが初期化されていません。',
          ephemeral: true
        });
        return;
      }

      const stats = cloneVCManager.getStats();
      
      const embed = new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle('🔄 複製VC管理システム - 状況')
        .addFields(
          { name: '📊 アクティブな複製VC', value: `${stats.activeChannels}個`, inline: true },
          { name: '⏰ 削除予定VC', value: `${stats.scheduledDeletions}個`, inline: true },
          { name: '🆔 複製用VC ID', value: '1439275955481870357', inline: true },
          { name: '📁 カテゴリ ID', value: '1425044725865648148', inline: true }
        )
        .setFooter({ text: '複製VCは3分間空室になると自動削除されます' })
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