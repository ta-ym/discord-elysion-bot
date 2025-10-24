import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { Command } from '../types';
import { Database } from '../database';
import { SecurityUtils, ErrorHandler } from '../utils/security';

const transferCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('transfer')
    .setDescription('他のユーザーにRu_menを送金します')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('送金先のユーザー')
        .setRequired(true))
    .addIntegerOption(option =>
      option.setName('amount')
        .setDescription('送金するRu_menの量')
        .setRequired(true)
        .setMinValue(1))
    .addStringOption(option =>
      option.setName('message')
        .setDescription('送金メッセージ（オプション）')
        .setRequired(false)),
  
  async execute(interaction: ChatInputCommandInteraction) {
    try {
      // レート制限チェック
      if (!SecurityUtils.checkRateLimit(interaction.user.id, 3, 60000)) {
        await interaction.reply({ 
          content: '❌ 送金回数が制限を超えています。1分後に再度お試しください。', 
          ephemeral: true 
        });
        return;
      }

      const targetUser = interaction.options.getUser('user', true);
      const amount = interaction.options.getInteger('amount', true);
      const message = interaction.options.getString('message') || '送金';

      // 金額検証
      const amountValidation = SecurityUtils.validateAmount(amount);
      if (!amountValidation.valid) {
        await interaction.reply({ 
          content: `❌ ${amountValidation.error}`, 
          ephemeral: true 
        });
        return;
      }

      const database = new Database();
      
      // 自分に送金しようとしている場合
      if (targetUser.id === interaction.user.id) {
        await interaction.reply({ 
          content: '❌ 自分自身には送金できません。', 
          ephemeral: true 
        });
        return;
      }

      // ボットに送金しようとしている場合
      if (targetUser.bot) {
        await interaction.reply({ 
          content: '❌ ボットには送金できません。', 
          ephemeral: true 
        });
        return;
      }
      
      // 送金者の残高を確認
      let sender = await database.getUser(interaction.user.id);
      if (!sender) {
        sender = await database.createUser(interaction.user.id);
      }

      if (sender.balance < amount) {
        await interaction.reply({ 
          content: `❌ 残高が不足しています。\n現在の残高: ${sender.balance.toLocaleString()} Ru`, 
          ephemeral: true 
        });
        return;
      }

      // 確認メッセージを作成
      const confirmEmbed = new EmbedBuilder()
        .setColor('#ffff00')
        .setTitle('💸 送金確認')
        .addFields(
          { name: '送金先', value: `<@${targetUser.id}>`, inline: true },
          { name: '送金額', value: `${amount.toLocaleString()} Ru`, inline: true },
          { name: '送金後残高', value: `${(sender.balance - amount).toLocaleString()} Ru`, inline: true },
          { name: 'メッセージ', value: message, inline: false }
        )
        .setDescription('以下の内容で送金しますか？')
        .setTimestamp();

      const confirmRow = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`transfer_confirm_${targetUser.id}_${amount}_${Date.now()}`)
            .setLabel('送金する')
            .setStyle(ButtonStyle.Success)
            .setEmoji('✅'),
          new ButtonBuilder()
            .setCustomId('transfer_cancel')
            .setLabel('キャンセル')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('❌')
        );

      await interaction.reply({ 
        embeds: [confirmEmbed], 
        components: [confirmRow], 
        ephemeral: true 
      });

      // ボタンインタラクションを待機
      const filter = (i: any) => i.user.id === interaction.user.id;
      const collector = interaction.channel?.createMessageComponentCollector({ 
        filter, 
        time: 30000 
      });

      collector?.on('collect', async (i) => {
        if (i.customId === 'transfer_cancel') {
          await i.update({ 
            content: '❌ 送金をキャンセルしました。', 
            embeds: [], 
            components: [] 
          });
          return;
        }

        if (i.customId.startsWith('transfer_confirm_')) {
          // 実際の送金処理
          const success = await database.transferMoney(
            interaction.user.id,
            targetUser.id,
            amount,
            message
          );

          if (success) {
            // セキュリティログ
            SecurityUtils.logSensitiveAction('TRANSFER', interaction.user.id, {
              to: targetUser.id,
              amount,
              message
            });

            const successEmbed = new EmbedBuilder()
              .setColor('#00ff00')
              .setTitle('✅ 送金完了')
              .addFields(
                { name: '送金先', value: `<@${targetUser.id}>`, inline: true },
                { name: '送金額', value: `${amount.toLocaleString()} Ru`, inline: true },
                { name: 'メッセージ', value: message, inline: false }
              )
              .setTimestamp()
              .setFooter({ text: '送金が正常に完了しました' });

            await i.update({ 
              embeds: [successEmbed], 
              components: [] 
            });

            // 送金先にDMで通知（オプション）
            try {
              const dmEmbed = new EmbedBuilder()
                .setColor('#00ff00')
                .setTitle('💰 Ru_men受取通知')
                .addFields(
                  { name: '送金者', value: `<@${interaction.user.id}>`, inline: true },
                  { name: '受取額', value: `${amount.toLocaleString()} Ru`, inline: true },
                  { name: 'メッセージ', value: message, inline: false }
                )
                .setTimestamp();

              await targetUser.send({ embeds: [dmEmbed] });
            } catch (dmError) {
              // DM送信失敗は無視
              console.log('Could not send DM to user:', dmError);
            }
          } else {
            await i.update({ 
              content: '❌ 送金に失敗しました。残高が不足している可能性があります。', 
              embeds: [], 
              components: [] 
            });
          }
        }
      });

      collector?.on('end', async (collected) => {
        if (collected.size === 0) {
          try {
            await interaction.editReply({ 
              content: '⏰ 時間切れです。送金をキャンセルしました。', 
              embeds: [], 
              components: [] 
            });
          } catch (error) {
            // メッセージが既に削除されている場合などは無視
          }
        }
      });
      
    } catch (error) {
      await ErrorHandler.handleCommandError(interaction, error as Error, 'transfer command');
    }
  },
};

export default transferCommand;