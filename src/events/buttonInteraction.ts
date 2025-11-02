import { Events, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from 'discord.js';
import { Event } from '../types';
import {
  showPublicVCCreationModal,
  showPublicVCList,
  deletePublicVC,
  showPublicVCEditModal
} from '../utils/publicVCManager';

const buttonInteractionEvent: Event = {
  name: Events.InteractionCreate,
  execute: async (interaction) => {
    if (!interaction.isButton()) return;

    console.log(`[BUTTON] Button interaction received: ${interaction.customId} by ${interaction.user.tag}`);

    try {
      // 一時VC作成
      if (interaction.customId === 'create_temp_vc') {
        console.log(`[TEMP VC] Processing button click by ${interaction.user.tag}`);
        
        try {
          const modal = new ModalBuilder()
            .setCustomId('temp_vc_creation_modal')
            .setTitle('一時VC作成');

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

          console.log(`[TEMP VC] About to show modal to ${interaction.user.tag}`);
          await interaction.showModal(modal);
          console.log(`[TEMP VC] Modal successfully shown to ${interaction.user.tag}`);
          return;
        } catch (modalError) {
          console.error(`[TEMP VC] Error creating/showing modal:`, modalError);
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