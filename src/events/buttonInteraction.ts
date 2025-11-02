import { Events } from 'discord.js';
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

    try {
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
      console.error('Button interaction error:', error);
      
      try {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({
            content: '❌ エラーが発生しました。',
            ephemeral: true
          });
        }
      } catch (replyError) {
        console.error('Failed to send error reply:', replyError);
      }
    }
  },
};

export default buttonInteractionEvent;