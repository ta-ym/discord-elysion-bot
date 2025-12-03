import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, PermissionFlagsBits, ChannelType } from 'discord.js';
import { Command } from '../types';
import { getCloneVCManager } from '../utils/cloneVCManager';

const cloneVCCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('clone-vc')
    .setDescription('【管理者専用】複製VC管理システムの状態を確認')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(subcommand =>
      subcommand
        .setName('status')
        .setDescription('現在のアクティブな複製VCの状態を表示')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('cleanup-empty')
        .setDescription('夢見の庭園カテゴリ内の空VCを即座に削除（月影の扉は除く）')
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

      const stats = cloneVCManager.getStats();
      
      const embed = new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle('🔄 複製VC管理システム - 状況')
        .addFields(
          { name: '📊 アクティブな複製VC', value: `${stats.activeChannels}個`, inline: true },
          { name: '⏰ 複製VC削除予定', value: `${stats.scheduledDeletions}個`, inline: true },
          { name: '🗑️ カテゴリVC削除予定', value: `${stats.categoryScheduledDeletions}個`, inline: true },
          { name: '🆔 複製用VC ID', value: '1439275955481870357', inline: true },
          { name: '📁 カテゴリ ID', value: '1425044725865648148', inline: true },
          { name: '🛡️ 保護対象', value: '月影の扉 (複製用VC)', inline: true }
        )
        .setFooter({ text: 'カテゴリ内のVCは3分間空室になると自動削除されます（月影の扉は除く）' })
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

      if (subcommand === 'status') {
        await interaction.reply({ embeds: [embed], ephemeral: true });
      } else if (subcommand === 'cleanup-empty') {
        await interaction.deferReply({ ephemeral: true });
        
        try {
          const guild = interaction.guild;
          if (!guild) {
            await interaction.editReply('❌ サーバー情報の取得に失敗しました。');
            return;
          }

          // 夢見の庭園カテゴリを取得
          const category = guild.channels.cache.get('1425044725865648148');
          if (!category || category.type !== ChannelType.GuildCategory) {
            await interaction.editReply('❌ 夢見の庭園カテゴリが見つかりません。');
            return;
          }

          // カテゴリ内のVCを取得
          const voiceChannels = guild.channels.cache.filter(channel => 
            channel.parentId === category.id && 
            channel.type === ChannelType.GuildVoice &&
            channel.id !== '1439275955481870357' // 月影の扉を除外
          );

          let deletedCount = 0;
          const deletedChannels: string[] = [];

          for (const [, channel] of voiceChannels) {
            const voiceChannel = channel as any;
            if (voiceChannel.members.size === 0) {
              try {
                const channelName = voiceChannel.name;
                await voiceChannel.delete();
                deletedCount++;
                deletedChannels.push(channelName);
                console.log(`[CLONE VC] Manual cleanup: Deleted empty VC: ${channelName}`);
              } catch (deleteError) {
                console.error(`[CLONE VC] Failed to delete VC ${voiceChannel.name}:`, deleteError);
              }
            }
          }

          const resultEmbed = new EmbedBuilder()
            .setColor(deletedCount > 0 ? '#00ff00' : '#ffaa00')
            .setTitle('🧹 カテゴリ内空VC清掃完了')
            .setDescription(`夢見の庭園カテゴリ内の空VCを清掃しました。`)
            .addFields(
              { name: '🗑️ 削除されたVC数', value: `${deletedCount}個`, inline: true },
              { name: '🛡️ 保護されたVC', value: '月影の扉', inline: true }
            )
            .setTimestamp();

          if (deletedChannels.length > 0) {
            const channelList = deletedChannels.slice(0, 10).join('\n');
            const moreText = deletedChannels.length > 10 ? `\n... および他 ${deletedChannels.length - 10} 個` : '';
            resultEmbed.addFields({
              name: '📋 削除されたチャンネル',
              value: channelList + moreText,
              inline: false
            });
          }

          await interaction.editReply({ embeds: [resultEmbed] });
          
        } catch (cleanupError) {
          console.error('[CLONE VC COMMAND] Cleanup error:', cleanupError);
          
          const errorEmbed = new EmbedBuilder()
            .setColor('#ff0000')
            .setTitle('❌ 清掃エラー')
            .setDescription('カテゴリ内空VC清掃中にエラーが発生しました。')
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