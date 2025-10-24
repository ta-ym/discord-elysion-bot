import { Events, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { Event } from '../types';
import { Database } from '../database';

const buttonInteractionEvent: Event = {
  name: Events.InteractionCreate,
  execute: async (interaction) => {
    if (!interaction.isButton()) return;

    const database = new Database();

    try {
      // VCリネームボタン
      if (interaction.customId.startsWith('vc_rename_')) {
        const channelId = interaction.customId.split('_')[2];
        const channel = interaction.guild?.channels.cache.get(channelId);
        
        if (!channel || !channel.isVoiceBased()) {
          await interaction.reply({ content: '❌ チャンネルが見つかりません。', ephemeral: true });
          return;
        }

        const vcInfo = await database.getSecretVC(channelId);
        if (!vcInfo || vcInfo.creator_id !== interaction.user.id) {
          await interaction.reply({ content: '❌ このVCの作成者のみが名前を変更できます。', ephemeral: true });
          return;
        }

        // モーダルを表示
        const modal = new ModalBuilder()
          .setCustomId(`vc_rename_modal_${channelId}`)
          .setTitle('チャンネル名変更');

        const nameInput = new TextInputBuilder()
          .setCustomId('channel_name')
          .setLabel('新しいチャンネル名')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('新しい名前を入力してください')
          .setRequired(true)
          .setMaxLength(100)
          .setValue(channel.name);

        const actionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(nameInput);
        modal.addComponents(actionRow);

        await interaction.showModal(modal);
      }

      // VCユーザー招待ボタン
      else if (interaction.customId.startsWith('vc_invite_')) {
        const channelId = interaction.customId.split('_')[2];
        const channel = interaction.guild?.channels.cache.get(channelId);
        
        if (!channel || !channel.isVoiceBased()) {
          await interaction.reply({ content: '❌ チャンネルが見つかりません。', ephemeral: true });
          return;
        }

        const vcInfo = await database.getSecretVC(channelId);
        if (!vcInfo || vcInfo.creator_id !== interaction.user.id) {
          await interaction.reply({ content: '❌ このVCの作成者のみがユーザーを招待できます。', ephemeral: true });
          return;
        }

        // ユーザー選択モーダル
        const modal = new ModalBuilder()
          .setCustomId(`vc_invite_modal_${channelId}`)
          .setTitle('ユーザー招待');

        const userInput = new TextInputBuilder()
          .setCustomId('user_id')
          .setLabel('招待するユーザーのID')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('ユーザーIDを入力してください')
          .setRequired(true);

        const actionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(userInput);
        modal.addComponents(actionRow);

        await interaction.showModal(modal);
      }

      // VC削除ボタン
      else if (interaction.customId.startsWith('vc_delete_')) {
        const channelId = interaction.customId.split('_')[2];
        const channel = interaction.guild?.channels.cache.get(channelId);
        
        if (!channel || !channel.isVoiceBased()) {
          await interaction.reply({ content: '❌ チャンネルが見つかりません。', ephemeral: true });
          return;
        }

        const vcInfo = await database.getSecretVC(channelId);
        if (!vcInfo || vcInfo.creator_id !== interaction.user.id) {
          await interaction.reply({ content: '❌ このVCの作成者のみが削除できます。', ephemeral: true });
          return;
        }

        // 確認ボタン
        const confirmEmbed = new EmbedBuilder()
          .setColor('#ff0000')
          .setTitle('🗑️ VC削除確認')
          .setDescription(`**${channel.name}** を削除しますか？\nこの操作は取り消せません。`)
          .setTimestamp();

        const confirmRow = new ActionRowBuilder<ButtonBuilder>()
          .addComponents(
            new ButtonBuilder()
              .setCustomId(`vc_delete_confirm_${channelId}`)
              .setLabel('削除する')
              .setStyle(ButtonStyle.Danger)
              .setEmoji('✅'),
            new ButtonBuilder()
              .setCustomId('vc_delete_cancel')
              .setLabel('キャンセル')
              .setStyle(ButtonStyle.Secondary)
              .setEmoji('❌')
          );

        await interaction.reply({ embeds: [confirmEmbed], components: [confirmRow], ephemeral: true });
      }

      // VC削除確認
      else if (interaction.customId.startsWith('vc_delete_confirm_')) {
        const channelId = interaction.customId.split('_')[3];
        const channel = interaction.guild?.channels.cache.get(channelId);
        
        if (!channel) {
          await interaction.update({ content: '❌ チャンネルが見つかりません。', embeds: [], components: [] });
          return;
        }

        const vcInfo = await database.getSecretVC(channelId);
        if (!vcInfo || vcInfo.creator_id !== interaction.user.id) {
          await interaction.update({ content: '❌ このVCの作成者のみが削除できます。', embeds: [], components: [] });
          return;
        }

        try {
          // DBから削除
          await database.removeSecretVC(channelId);
          
          // チャンネルを削除
          await channel.delete('作成者による手動削除');
          
          await interaction.update({ 
            content: '✅ VCを削除しました。', 
            embeds: [], 
            components: [] 
          });

          console.log(`[VC DELETE] ${interaction.user.tag} manually deleted VC: ${channel.name}`);
        } catch (error) {
          console.error('Error deleting VC:', error);
          await interaction.update({ 
            content: '❌ VC削除中にエラーが発生しました。', 
            embeds: [], 
            components: [] 
          });
        }
      }

      // VC削除キャンセル
      else if (interaction.customId === 'vc_delete_cancel') {
        await interaction.update({ 
          content: '❌ VC削除をキャンセルしました。', 
          embeds: [], 
          components: [] 
        });
      }

    } catch (error) {
      console.error('Error in button interaction:', error);
      try {
        await interaction.reply({ content: '❌ 処理中にエラーが発生しました。', ephemeral: true });
      } catch (replyError) {
        console.error('Error sending error reply:', replyError);
      }
    }
  },
};

export = buttonInteractionEvent;