import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { Command } from '../types';
import { globalDatabase } from '../index';
import { SecurityUtils, ErrorHandler } from '../utils/security';
import { getCurrencyLogger } from '../utils/currencyLogger';
import { sendTransferLog } from '../utils/ruLogger';

// 送金処理中のユーザーIDを管理（重複送金防止）
const processingTransfers = new Set<string>();

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
          flags: MessageFlags.Ephemeral 
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
          flags: MessageFlags.Ephemeral 
        });
        return;
      }

      const database = globalDatabase;
      
      // 自分に送金しようとしている場合
      if (targetUser.id === interaction.user.id) {
        await interaction.reply({ 
          content: '❌ 自分自身には送金できません。', 
          flags: MessageFlags.Ephemeral 
        });
        return;
      }

      // ボットに送金しようとしている場合
      if (targetUser.bot) {
        await interaction.reply({ 
          content: '❌ ボットには送金できません。', 
          flags: MessageFlags.Ephemeral 
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
          flags: MessageFlags.Ephemeral 
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
        flags: MessageFlags.Ephemeral 
      });

      // ボタンインタラクションを待機
      const filter = (i: any) => i.user.id === interaction.user.id;
      const collector = interaction.channel?.createMessageComponentCollector({ 
        filter, 
        time: 30000 
      });

      let isProcessing = false; // 処理中フラグで重複防止
      let transferKey: string | null = null; // 重複防止キーをスコープ外で管理

      collector?.on('collect', async (i) => {
        // 既に処理中の場合は無視
        if (isProcessing) {
          console.log('[TRANSFER] Already processing, ignoring duplicate interaction');
          return;
        }

        if (i.customId === 'transfer_cancel') {
          isProcessing = true;
          collector.stop(); // コレクターを停止
          await i.update({ 
            content: '❌ 送金をキャンセルしました。', 
            embeds: [], 
            components: [] 
          });
          return;
        }

        if (i.customId.startsWith('transfer_confirm_')) {
          isProcessing = true; // 処理開始をマーク
          collector.stop(); // 追加のクリックを防ぐためコレクターを停止
          
          // 重複送金防止チェック
          transferKey = `${interaction.user.id}_${targetUser.id}_${amount}`;
          if (processingTransfers.has(transferKey)) {
            console.log(`[TRANSFER] Duplicate transfer attempt blocked: ${transferKey}`);
            await i.update({ 
              content: '⚠️ この送金は既に処理中です。', 
              embeds: [], 
              components: [] 
            });
            return;
          }
          
          processingTransfers.add(transferKey);
          
          try {
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

            // 通貨ログに記録
            const logger = getCurrencyLogger();
            if (logger) {
              await logger.logTransaction({
                fromUserId: interaction.user.id,
                toUserId: targetUser.id,
                amount,
                type: 'transfer',
                description: message || 'ユーザー間送金'
              });
            }

            // 成功メッセージを先に送信（インタラクションエラーを防ぐ）
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

            // インタラクション応答（エラーハンドリング付き）
            try {
              if (!i.replied && !i.deferred) {
                await i.update({ 
                  embeds: [successEmbed], 
                  components: [] 
                });
              }
            } catch (interactionError) {
              console.error('[TRANSFER] Interaction update error:', interactionError);
              // インタラクションが失敗してもログは送信する
            }

            // 送金ログを送信（インタラクション処理後に実行）
            try {
              // 送金後の残高を取得
              const updatedSender = await database.getUser(interaction.user.id);
              const updatedReceiver = await database.getUser(targetUser.id);
              
              if (updatedSender && updatedReceiver) {
                await sendTransferLog(
                  interaction.client,
                  interaction.user.id,
                  interaction.user.username,
                  targetUser.id,
                  targetUser.username,
                  amount,
                  updatedSender.balance,
                  updatedReceiver.balance,
                  message
                );
              }
            } catch (logError) {
              console.error('[TRANSFER] Error sending transfer log:', logError);
              // ログエラーはアプリケーションを停止させない
            }

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
          
          } catch (transferError) {
            console.error('[TRANSFER] Error during transfer process:', transferError);
            await i.update({ 
              content: '❌ 送金処理中にエラーが発生しました。', 
              embeds: [], 
              components: [] 
            });
          } finally {
            // 重複防止キーを削除（処理完了時）
            processingTransfers.delete(transferKey);
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
        
        // タイムアウト時も重複防止キーをクリーンアップ
        if (transferKey && processingTransfers.has(transferKey)) {
          processingTransfers.delete(transferKey);
          console.log(`[TRANSFER] Cleaned up transfer key on timeout: ${transferKey}`);
        }
      });
      
    } catch (error) {
      await ErrorHandler.handleCommandError(interaction, error as Error, 'transfer command');
    }
  },
};

export default transferCommand;