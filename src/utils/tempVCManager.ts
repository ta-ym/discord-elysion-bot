import { 
  ModalSubmitInteraction, 
  ChannelType, 
  EmbedBuilder, 
  Client,
  VoiceChannel
} from 'discord.js';
import { Database } from '../database';

// 一時VCカテゴリID
const TEMP_VC_CATEGORY_ID = '1425044725865648148';

/**
 * 一時VC作成
 */
export async function createTempVC(interaction: ModalSubmitInteraction): Promise<void> {
  const database = new Database();
  
  try {
    const channelName = interaction.fields.getTextInputValue('channel_name');
    
    if (!channelName || channelName.trim().length === 0) {
      await interaction.reply({
        content: '❌ チャンネル名を入力してください。',
        ephemeral: true
      });
      return;
    }

    if (channelName.length > 30) {
      await interaction.reply({
        content: '❌ チャンネル名は30文字以内で入力してください。',
        ephemeral: true
      });
      return;
    }

    const guild = interaction.guild;
    if (!guild) {
      await interaction.reply({
        content: '❌ サーバー情報を取得できませんでした。',
        ephemeral: true
      });
      return;
    }

    // 作成中メッセージを表示
    const creatingEmbed = new EmbedBuilder()
      .setColor('#ffaa00')
      .setTitle('🔄 一時VC作成中...')
      .setDescription('チャンネルを作成しています。しばらくお待ちください。')
      .setTimestamp();

    await interaction.reply({ embeds: [creatingEmbed], ephemeral: true });

    try {
      // VCを作成
      const channel = await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildVoice,
        parent: TEMP_VC_CATEGORY_ID,
        permissionOverwrites: [
          {
            id: guild.id, // @everyone
            allow: ['ViewChannel', 'Connect', 'Speak'],
          },
        ],
      });

      // 12時間後の削除時刻を計算
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 12);

      // データベースに記録
      await database.addTempVC(channel.id, interaction.user.id, channel.name, expiresAt);

      // 完了メッセージ
      const successEmbed = new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle('✅ 一時VC作成完了')
        .setDescription(`<#${channel.id}> が作成されました！`)
        .addFields(
          { name: '🏷️ チャンネル名', value: channel.name, inline: true },
          { name: '👤 作成者', value: `<@${interaction.user.id}>`, inline: true },
          { name: '⏰ 削除予定', value: `<t:${Math.floor(expiresAt.getTime() / 1000)}:R>`, inline: true }
        )
        .setFooter({ text: '12時間後に自動削除されます' })
        .setTimestamp();

      await interaction.editReply({ embeds: [successEmbed] });

      console.log(`[TEMP VC] Created: ${channel.name} by ${interaction.user.tag}, expires at ${expiresAt.toISOString()}`);

    } catch (error) {
      console.error('Error creating temp VC:', error);
      
      const errorEmbed = new EmbedBuilder()
        .setColor('#ff0000')
        .setTitle('❌ エラー')
        .setDescription('一時VCの作成中にエラーが発生しました。')
        .setTimestamp();

      await interaction.editReply({ embeds: [errorEmbed] });
    }

  } catch (error) {
    console.error('Error in createTempVC:', error);
    try {
      await interaction.reply({
        content: '❌ 処理中にエラーが発生しました。',
        ephemeral: true
      });
    } catch (replyError) {
      console.error('Error sending error reply:', replyError);
    }
  }
}

/**
 * 期限切れの一時VCを削除
 */
export async function cleanupExpiredTempVCs(client: Client): Promise<void> {
  const database = new Database();
  
  try {
    const expiredVCs = await database.getExpiredTempVCs();
    
    for (const vcInfo of expiredVCs) {
      try {
        const channel = client.channels.cache.get(vcInfo.channel_id) as VoiceChannel;
        
        if (channel) {
          console.log(`[TEMP VC CLEANUP] Deleting expired VC: ${channel.name}`);
          await channel.delete('12時間経過による自動削除');
        }
        
        // データベースから削除
        await database.removeTempVC(vcInfo.channel_id);
        
      } catch (error) {
        console.error(`Error deleting expired temp VC ${vcInfo.channel_id}:`, error);
        // チャンネルが既に削除されている場合は、データベースからのみ削除
        await database.removeTempVC(vcInfo.channel_id);
      }
    }
    
    if (expiredVCs.length > 0) {
      console.log(`[TEMP VC CLEANUP] Cleaned up ${expiredVCs.length} expired VCs`);
    }
    
  } catch (error) {
    console.error('Error in cleanup expired temp VCs:', error);
  }
}

/**
 * 一時VC削除（手動）
 */
export async function deleteTempVC(channelId: string, client: Client): Promise<boolean> {
  const database = new Database();
  
  try {
    const vcInfo = await database.getTempVC(channelId);
    if (!vcInfo) {
      return false;
    }
    
    const channel = client.channels.cache.get(channelId) as VoiceChannel;
    if (channel) {
      await channel.delete('手動削除');
    }
    
    await database.removeTempVC(channelId);
    console.log(`[TEMP VC] Manually deleted: ${vcInfo.channel_name}`);
    
    return true;
  } catch (error) {
    console.error('Error deleting temp VC:', error);
    return false;
  }
}