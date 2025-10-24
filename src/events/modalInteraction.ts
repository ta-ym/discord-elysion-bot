import { Events, EmbedBuilder } from 'discord.js';
import { Event } from '../types';
import { Database } from '../database';

const modalInteractionEvent: Event = {
  name: Events.InteractionCreate,
  execute: async (interaction) => {
    if (!interaction.isModalSubmit()) return;

    const database = new Database();

    try {
      // VCリネームモーダル
      if (interaction.customId.startsWith('vc_rename_modal_')) {
        const channelId = interaction.customId.split('_')[3];
        const newName = interaction.fields.getTextInputValue('channel_name');
        
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

        try {
          // チャンネル名を変更
          await channel.setName(newName);
          
          const successEmbed = new EmbedBuilder()
            .setColor('#00ff00')
            .setTitle('✅ チャンネル名変更完了')
            .addFields(
              { name: '変更前', value: vcInfo.channel_name, inline: true },
              { name: '変更後', value: newName, inline: true }
            )
            .setTimestamp();

          await interaction.reply({ embeds: [successEmbed], ephemeral: true });
          
          console.log(`[VC RENAME] ${interaction.user.tag} renamed VC from "${vcInfo.channel_name}" to "${newName}"`);
        } catch (error) {
          console.error('Error renaming VC:', error);
          await interaction.reply({ content: '❌ チャンネル名の変更中にエラーが発生しました。', ephemeral: true });
        }
      }

      // VCユーザー招待モーダル
      else if (interaction.customId.startsWith('vc_invite_modal_')) {
        const channelId = interaction.customId.split('_')[3];
        const userId = interaction.fields.getTextInputValue('user_id');
        
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

        try {
          // ユーザーを取得
          const targetUser = await interaction.guild?.members.fetch(userId);
          if (!targetUser) {
            await interaction.reply({ content: '❌ ユーザーが見つかりません。', ephemeral: true });
            return;
          }

          // 権限を付与
          await channel.permissionOverwrites.create(targetUser.user, {
            ViewChannel: true,
            Connect: true,
            Speak: true
          });

          const successEmbed = new EmbedBuilder()
            .setColor('#00ff00')
            .setTitle('✅ ユーザー招待完了')
            .addFields(
              { name: '招待されたユーザー', value: `<@${targetUser.id}>`, inline: true },
              { name: 'チャンネル', value: `<#${channelId}>`, inline: true }
            )
            .setDescription('ユーザーがVCに参加できるようになりました。')
            .setTimestamp();

          await interaction.reply({ embeds: [successEmbed], ephemeral: true });

          // 招待されたユーザーにDMで通知
          try {
            const inviteEmbed = new EmbedBuilder()
              .setColor('#0099ff')
              .setTitle('🎪 シークレットVCに招待されました')
              .addFields(
                { name: '招待者', value: `<@${interaction.user.id}>`, inline: true },
                { name: 'チャンネル', value: `<#${channelId}>`, inline: true },
                { name: 'サーバー', value: interaction.guild?.name || 'Unknown', inline: true }
              )
              .setDescription('上記のVCに参加できるようになりました。')
              .setTimestamp();

            await targetUser.send({ embeds: [inviteEmbed] });
          } catch (dmError) {
            console.log('Could not send DM to invited user:', dmError);
          }
          
          console.log(`[VC INVITE] ${interaction.user.tag} invited ${targetUser.user.tag} to VC: ${channel.name}`);
        } catch (error) {
          console.error('Error inviting user to VC:', error);
          await interaction.reply({ content: '❌ ユーザー招待中にエラーが発生しました。', ephemeral: true });
        }
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