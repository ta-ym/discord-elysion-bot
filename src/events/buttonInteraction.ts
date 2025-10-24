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

      // 月給支給確認ボタン
      else if (interaction.customId.startsWith('confirm_salary_')) {
        const parts = interaction.customId.split('_');
        const userId = parts[2];
        const roleId = parts[3];
        const amount = parseInt(parts[4]);
        const paidBy = parts[5];

        try {
          // 支給を実行
          await database.payMonthlySalary(userId, roleId, amount, paidBy);

          const successEmbed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('✅ 月給支給完了')
            .setDescription('月給の支給が完了しました！')
            .addFields(
              { name: '対象ユーザー', value: `<@${userId}>`, inline: true },
              { name: 'ロール', value: `<@&${roleId}>`, inline: true },
              { name: '支給額', value: `${amount.toLocaleString()} Ru`, inline: true },
              { name: '支給者', value: `<@${paidBy}>`, inline: true },
              { name: '支給月', value: new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: 'long' }), inline: true }
            )
            .setTimestamp();

          await interaction.update({ 
            embeds: [successEmbed], 
            components: [] 
          });

          console.log(`[MONTHLY SALARY] ${interaction.user.tag} paid ${amount} Ru to ${userId} as role ${roleId}`);
        } catch (error) {
          console.error('Error paying monthly salary:', error);
          
          const errorEmbed = new EmbedBuilder()
            .setColor(0xFF0000)
            .setTitle('❌ 支給エラー')
            .setDescription(error instanceof Error ? error.message : '月給支給中にエラーが発生しました。');

          await interaction.update({ 
            embeds: [errorEmbed], 
            components: [] 
          });
        }
      }

      // 月給支給キャンセルボタン
      else if (interaction.customId === 'cancel_salary') {
        await interaction.update({ 
          content: '❌ 月給支給をキャンセルしました。', 
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