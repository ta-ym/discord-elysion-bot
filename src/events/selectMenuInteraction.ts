import { Events } from 'discord.js';
import { Event } from '../types';
import { 
  createSecretVC
} from '../utils/secretVCManager';
import { 
  createPublicVC
} from '../utils/publicVCManager';
import { Database } from '../database';

const selectMenuInteractionEvent: Event = {
  name: Events.InteractionCreate,
  execute: async (interaction) => {
    if (!interaction.isStringSelectMenu() && !interaction.isModalSubmit()) return;

    try {
      // 時間選択メニュー（廃止予定 - ボタン方式に変更）
      /*
      if (interaction.isStringSelectMenu() && interaction.customId === 'vc_duration_select') {
        console.log(`[DEBUG] vc_duration_select triggered by ${interaction.user.tag}, values: ${interaction.values}`);
        console.log(`[DEBUG] User ID: ${interaction.user.id}, Guild ID: ${interaction.guild?.id}`);
        console.log(`[DEBUG] Interaction details - deferred: ${interaction.deferred}, replied: ${interaction.replied}`);
        
        try {
          console.log(`[DEBUG] Starting handleDurationSelection...`);
          await handleDurationSelection(interaction);
          console.log(`[DEBUG] handleDurationSelection completed successfully`);
        } catch (error) {
          console.error(`[DEBUG] Error in handleDurationSelection:`, error);
          console.error(`[DEBUG] Error details:`, {
            name: error instanceof Error ? error.name : 'Unknown',
            message: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : 'No stack trace'
          });
          throw error; // Re-throw to be caught by outer try-catch
        }
        return;
      }
      */

      // メンバー選択メニュー
      if (interaction.isStringSelectMenu() && interaction.customId.startsWith('vc_member_select_')) {
        const duration = parseInt(interaction.customId.split('_')[3]);
        const partnerId = interaction.values[0];
        await createSecretVC(interaction, duration, partnerId);
        return;
      }

      // パートナー検索モーダル
      if (interaction.isModalSubmit() && interaction.customId.startsWith('vc_partner_modal_')) {
        const duration = parseInt(interaction.customId.split('_')[3]);
        const partnerInput = interaction.fields.getTextInputValue('partner_input');

        // ユーザーIDまたは名前で検索
        let partnerId: string | undefined;
        
        if (/^\d{17,19}$/.test(partnerInput)) {
          // ユーザーIDの場合
          partnerId = partnerInput;
        } else {
          // ユーザー名の場合、ギルドメンバーから検索
          const guild = interaction.guild;
          if (guild) {
            const members = await guild.members.fetch();
            const foundMember = members.find((member: any) => 
              member.user.username.toLowerCase().includes(partnerInput.toLowerCase()) ||
              member.displayName.toLowerCase().includes(partnerInput.toLowerCase())
            );
            if (foundMember) {
              partnerId = foundMember.id;
            }
          }
        }

        if (!partnerId) {
          await interaction.reply({
            content: '❌ 指定されたユーザーが見つかりませんでした。',
            ephemeral: true
          });
          return;
        }

        await createSecretVC(interaction, duration, partnerId);
        return;
      }

      // 公開VC作成モーダル
      if (interaction.isModalSubmit() && interaction.customId === 'public_vc_creation_modal') {
        const vcName = interaction.fields.getTextInputValue('vc_name');
        const vcDescription = interaction.fields.getTextInputValue('vc_description');
        
        await createPublicVC(interaction, vcName, vcDescription || undefined);
        return;
      }

      // 公開VC編集モーダル
      if (interaction.isModalSubmit() && interaction.customId.startsWith('public_vc_edit_modal_')) {
        const channelId = interaction.customId.split('_')[4];
        const vcName = interaction.fields.getTextInputValue('vc_name');
        const vcDescription = interaction.fields.getTextInputValue('vc_description');
        
        const database = new Database();
        try {
          // チャンネル名を更新
          const channel = await interaction.guild?.channels.fetch(channelId);
          if (channel && 'setName' in channel) {
            await channel.setName(vcName);
          }

          // データベースを更新
          await database.updatePublicVC(channelId, vcName, vcDescription || undefined);

          await interaction.reply({
            content: '✅ 公開VCの設定を更新しました。',
            ephemeral: true
          });
        } catch (error) {
          console.error('公開VC更新エラー:', error);
          await interaction.reply({
            content: '❌ 設定の更新に失敗しました。',
            ephemeral: true
          });
        }
        return;
      }

    } catch (error) {
      console.error('Select menu/modal interaction error:', error);
      console.error('[DEBUG] Full error details:', {
        errorType: error instanceof Error ? error.name : typeof error,
        errorMessage: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : 'No stack trace',
        userId: interaction.user.id,
        userTag: interaction.user.tag,
        customId: 'customId' in interaction ? interaction.customId : 'N/A',
        interactionType: interaction.type,
        guildId: interaction.guild?.id,
        channelId: interaction.channel?.id,
        deferred: interaction.deferred,
        replied: interaction.replied
      });
      
      try {
        if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
          await interaction.reply({
            content: '❌ エラーが発生しました。',
            flags: 64 // MessageFlags.Ephemeral
          });
        } else if (interaction.deferred && !interaction.replied) {
          await interaction.editReply({
            content: '❌ エラーが発生しました。'
          });
        }
      } catch (replyError) {
        console.error('[DEBUG] Failed to send error response:', replyError);
      }
    }
  },
};

export default selectMenuInteractionEvent;