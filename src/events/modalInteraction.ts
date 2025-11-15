import { Events } from 'discord.js';
import { Event } from '../types';
import { createTempVC } from '../utils/tempVCManager';

const modalInteractionEvent: Event = {
  name: Events.InteractionCreate,
  execute: async (interaction) => {
    if (!interaction.isModalSubmit()) return;

    try {
      // 一時VC作成モーダル（プラン別）
      if (interaction.customId.startsWith('temp_vc_creation_modal_')) {
        const planType = interaction.customId.split('_')[4]; // 6h, 12h, 24h
        console.log(`[TEMP VC] Modal submitted by ${interaction.user.tag} for ${planType} plan`);
        await createTempVC(interaction, planType);
        console.log(`[TEMP VC] VC creation completed for ${interaction.user.tag} with ${planType} plan`);
        return;
      }

      // 既存の一時VC作成モーダル（互換性のため保持）
      if (interaction.customId === 'temp_vc_creation_modal') {
        console.log(`[TEMP VC] Legacy modal submitted by ${interaction.user.tag}`);
        await createTempVC(interaction, '12h'); // デフォルトで12時間プラン
        console.log(`[TEMP VC] Legacy VC creation completed for ${interaction.user.tag}`);
        return;
      }

      // 複製VC名前変更モーダル
      if (interaction.customId.startsWith('clone_vc_rename_modal_')) {
        const channelId = interaction.customId.split('_')[4];
        const newChannelName = interaction.fields.getTextInputValue('new_channel_name');
        
        console.log(`[CLONE VC] Name change requested by ${interaction.user.tag} for channel ${channelId}: "${newChannelName}"`);
        
        // チャンネルを取得
        const channel = interaction.guild?.channels.cache.get(channelId);
        if (!channel || channel.type !== 2) { // GuildVoice = 2
          await interaction.reply({
            content: '❌ チャンネルが見つからないか、音声チャンネルではありません。',
            ephemeral: true
          });
          return;
        }

        // 権限チェック：特権ロールまたはチャンネル作成者
        const { getCloneVCManager } = await import('../utils/cloneVCManager');
        const cloneVCManager = getCloneVCManager();
        
        if (!cloneVCManager) {
          await interaction.reply({
            content: '❌ 複製VC管理システムが利用できません。',
            ephemeral: true
          });
          return;
        }

        const stats = cloneVCManager.getStats();
        const isCreator = stats.createdChannels.get(interaction.user.id) === channelId;
        
        // 特権ロールチェック
        const PRIVILEGED_ROLES = [
          '1424768596726251651', // 最高神
          '1428737130271871147', // 女神
          '1425862683521191937', // 神徒
        ];
        
        const member = interaction.member;
        const hasPrivilegedRole = member && 'roles' in member && member.roles && 
          ('cache' in member.roles ? 
            member.roles.cache.some((role: any) => PRIVILEGED_ROLES.includes(role.id)) :
            Array.isArray(member.roles) && member.roles.some((roleId: string) => PRIVILEGED_ROLES.includes(roleId))
          );

        if (!isCreator && !hasPrivilegedRole) {
          await interaction.reply({
            content: '❌ チャンネル名を変更する権限がありません。（作成者または特権ロールが必要）',
            ephemeral: true
          });
          return;
        }

        try {
          // チャンネル名を変更
          await channel.setName(newChannelName);
          
          const successEmbed = new (await import('discord.js')).EmbedBuilder()
            .setColor('#00ff00')
            .setTitle('✅ チャンネル名変更完了')
            .setDescription(`チャンネル名を **${newChannelName}** に変更しました。`)
            .setTimestamp();

          await interaction.reply({
            embeds: [successEmbed],
            ephemeral: true
          });

          console.log(`[CLONE VC] Successfully renamed channel ${channelId} to "${newChannelName}" by ${interaction.user.tag}`);

        } catch (renameError) {
          console.error(`[CLONE VC] Failed to rename channel:`, renameError);
          
          const errorEmbed = new (await import('discord.js')).EmbedBuilder()  
            .setColor('#ff0000')
            .setTitle('❌ 名前変更エラー')
            .setDescription('チャンネル名の変更に失敗しました。文字数制限や禁止文字が含まれていないか確認してください。')
            .setTimestamp();

          await interaction.reply({
            embeds: [errorEmbed],
            ephemeral: true
          });
        }
        return;
      }

      // 複製VCステータス変更モーダル
      if (interaction.customId.startsWith('clone_vc_status_modal_')) {
        const channelId = interaction.customId.split('_')[4];
        const newChannelStatus = interaction.fields.getTextInputValue('new_channel_status');
        
        console.log(`[CLONE VC] Status change requested by ${interaction.user.tag} for channel ${channelId}: "${newChannelStatus}"`);
        
        // チャンネルを取得
        const channel = interaction.guild?.channels.cache.get(channelId);
        if (!channel || channel.type !== 2) { // GuildVoice = 2
          await interaction.reply({
            content: '❌ チャンネルが見つからないか、音声チャンネルではありません。',
            ephemeral: true
          });
          return;
        }

        // 権限チェック：特権ロールまたはチャンネル作成者
        const { getCloneVCManager } = await import('../utils/cloneVCManager');
        const cloneVCManager = getCloneVCManager();
        
        if (!cloneVCManager) {
          await interaction.reply({
            content: '❌ 複製VC管理システムが利用できません。',
            ephemeral: true
          });
          return;
        }

        const stats = cloneVCManager.getStats();
        const isCreator = stats.createdChannels.get(interaction.user.id) === channelId;
        
        // 特権ロールチェック
        const PRIVILEGED_ROLES = [
          '1424768596726251651', // 最高神
          '1428737130271871147', // 女神
          '1425862683521191937', // 神徒
        ];
        
        const member = interaction.member;
        const hasPrivilegedRole = member && 'roles' in member && member.roles && 
          ('cache' in member.roles ? 
            member.roles.cache.some((role: any) => PRIVILEGED_ROLES.includes(role.id)) :
            Array.isArray(member.roles) && member.roles.some((roleId: string) => PRIVILEGED_ROLES.includes(roleId))
          );

        if (!isCreator && !hasPrivilegedRole) {
          await interaction.reply({
            content: '❌ チャンネルステータスを変更する権限がありません。（作成者または特権ロールが必要）',
            ephemeral: true
          });
          return;
        }

        try {
          // チャンネルステータス（トピック）を変更
          await channel.setTopic(newChannelStatus || null);
          
          const successEmbed = new (await import('discord.js')).EmbedBuilder()
            .setColor('#00ff00')
            .setTitle('✅ チャンネルステータス変更完了')
            .setDescription(newChannelStatus ? 
              `チャンネルステータスを **${newChannelStatus}** に変更しました。` :
              'チャンネルステータスをクリアしました。'
            )
            .setTimestamp();

          await interaction.reply({
            embeds: [successEmbed],
            ephemeral: true
          });

          console.log(`[CLONE VC] Successfully changed channel status ${channelId} to "${newChannelStatus}" by ${interaction.user.tag}`);

        } catch (statusError) {
          console.error(`[CLONE VC] Failed to change channel status:`, statusError);
          
          const errorEmbed = new (await import('discord.js')).EmbedBuilder()  
            .setColor('#ff0000')
            .setTitle('❌ ステータス変更エラー')
            .setDescription('チャンネルステータスの変更に失敗しました。文字数制限を確認してください。')
            .setTimestamp();

          await interaction.reply({
            embeds: [errorEmbed],
            ephemeral: true
          });
        }
        return;
      }

    } catch (error) {
      console.error('Error in modal interaction:', error);
      try {
        await interaction.reply({ content: '❌ 処理中にエラーが発生しました。', ephemeral: true });
      } catch (replyError) {
        console.error('Error sending error reply:', replyError);
      }
    }
  },
};

export = modalInteractionEvent;