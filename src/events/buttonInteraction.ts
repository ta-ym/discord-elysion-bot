import { Events, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { Event } from '../types';
import {
  showPublicVCCreationModal,
  showPublicVCList,
  deletePublicVC,
  showPublicVCEditModal
} from '../utils/publicVCManager';
import { changeVCLimit } from '../utils/tempVCManager';

const buttonInteractionEvent: Event = {
  name: Events.InteractionCreate,
  execute: async (interaction) => {
    if (!interaction.isButton()) return;

    console.log(`[BUTTON] Button interaction received: ${interaction.customId} by ${interaction.user.tag}`);

    try {
      // 一時VC作成プラン選択
      if (interaction.customId === 'create_temp_vc') {
        console.log(`[TEMP VC] Processing plan selection button click by ${interaction.user.tag}`);
        
        try {
          const planEmbed = {
            color: 0x00ff00,
            title: '🔒 プライベート一時VC作成',
            description: '作成する一時VCの料金プランを選択してください\n\n**特徴:**\n• 権限のある人以外からは見えません\n• 最大2人まで参加可能\n• 時間経過で自動削除',
            fields: [
              {
                name: '⏰ 6時間プラン',
                value: '料金: **5,000 Ru**\n有効期限: 6時間',
                inline: true
              },
              {
                name: '⏰ 12時間プラン',
                value: '料金: **10,000 Ru**\n有効期限: 12時間',
                inline: true
              },
              {
                name: '⏰ 24時間プラン',
                value: '料金: **30,000 Ru**\n有効期限: 24時間',
                inline: true
              }
            ],
            footer: {
              text: '料金は作成時に自動で引き落とされます'
            }
          };

          const planButtons = new ActionRowBuilder()
            .addComponents(
              new ButtonBuilder()
                .setCustomId('temp_vc_6h')
                .setLabel('6時間 (5,000 Ru)')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('⏰'),
              new ButtonBuilder()
                .setCustomId('temp_vc_12h')
                .setLabel('12時間 (10,000 Ru)')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('⏰'),
              new ButtonBuilder()
                .setCustomId('temp_vc_24h')
                .setLabel('24時間 (30,000 Ru)')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('⏰')
            );

          console.log(`[TEMP VC] About to show plan selection to ${interaction.user.tag}`);
          await interaction.reply({
            embeds: [planEmbed],
            components: [planButtons],
            ephemeral: true
          });
          console.log(`[TEMP VC] Plan selection shown to ${interaction.user.tag}`);
          return;
        } catch (planError) {
          console.error(`[TEMP VC] Error showing plan selection:`, planError);
          throw planError;
        }
      }

      // 一時VC料金プラン選択後のモーダル表示
      if (interaction.customId.startsWith('temp_vc_')) {
        const planType = interaction.customId.split('_')[2]; // 6h, 12h, 24h
        console.log(`[TEMP VC] Processing ${planType} plan selection by ${interaction.user.tag}`);
        
        try {
          const modal = new ModalBuilder()
            .setCustomId(`temp_vc_creation_modal_${planType}`)
            .setTitle(`一時VC作成 (${planType === '6h' ? '6時間' : planType === '12h' ? '12時間' : '24時間'}プラン)`);

          const channelNameInput = new TextInputBuilder()
            .setCustomId('channel_name')
            .setLabel('チャンネル名')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('チャンネル名を入力してください（30文字以内）')
            .setRequired(true)
            .setMaxLength(30);

          const nameRow = new ActionRowBuilder<TextInputBuilder>()
            .addComponents(channelNameInput);

          modal.addComponents(nameRow);

          console.log(`[TEMP VC] About to show modal for ${planType} plan to ${interaction.user.tag}`);
          await interaction.showModal(modal);
          console.log(`[TEMP VC] Modal successfully shown for ${planType} plan to ${interaction.user.tag}`);
          return;
        } catch (modalError) {
          console.error(`[TEMP VC] Error creating/showing modal for ${planType} plan:`, modalError);
          throw modalError;
        }
      }

      // 公開VC作成・管理
      if (interaction.customId === 'create_public_vc') {
        await showPublicVCCreationModal(interaction);
        return;
      }

      if (interaction.customId === 'list_public_vcs') {
        await showPublicVCList(interaction);
        return;
      }

      // 公開VC削除
      if (interaction.customId.startsWith('delete_public_vc_')) {
        const channelId = interaction.customId.split('_')[3];
        await deletePublicVC(interaction, channelId);
        return;
      }

      // 公開VC設定変更
      if (interaction.customId.startsWith('edit_public_vc_')) {
        const channelId = interaction.customId.split('_')[3];
        await showPublicVCEditModal(interaction, channelId);
        return;
      }

      // VC人数制限設定
      if (interaction.customId.startsWith('vc_limit_')) {
        const limitType = interaction.customId.split('_')[2];
        let newLimit: number;
        
        switch (limitType) {
          case '2':
            newLimit = 2;
            break;
          case '3':
            newLimit = 3;
            break;
          case '5':
            newLimit = 5;
            break;
          case '10':
            newLimit = 10;
            break;
          case 'unlimited':
            newLimit = 0;
            break;
          default:
            await interaction.reply({
              content: '❌ 無効な人数設定です。',
              ephemeral: true
            });
            return;
        }

        await changeVCLimit(interaction, newLimit);
        return;
      }

    } catch (error) {
      console.error(`[BUTTON] Button interaction error for ${interaction.customId}:`, error);
      console.error(`[BUTTON] Error details:`, {
        customId: interaction.customId,
        user: interaction.user.tag,
        guild: interaction.guild?.name,
        channel: interaction.channel?.id,
        replied: interaction.replied,
        deferred: interaction.deferred
      });
      
      try {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({
            content: '❌ エラーが発生しました。しばらく待ってから再度お試しください。',
            ephemeral: true
          });
        } else if (interaction.deferred) {
          await interaction.editReply({
            content: '❌ エラーが発生しました。しばらく待ってから再度お試しください。'
          });
        }
      } catch (replyError) {
        console.error('[BUTTON] Failed to send error reply:', replyError);
      }
    }
  },
};

export default buttonInteractionEvent;