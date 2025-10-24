import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionFlagsBits } from 'discord.js';
import { Command } from '../types';
import { Database } from '../database';

const createVcCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('create-vc')
    .setDescription('シークレットボイスチャンネルを作成します（500 Ru）')
    .addStringOption(option =>
      option.setName('name')
        .setDescription('チャンネル名（オプション）')
        .setRequired(false)
        .setMaxLength(100)),
  
  async execute(interaction: ChatInputCommandInteraction) {
    const defaultName = interaction.options.getString('name') || `${interaction.user.username}のVC`;
    const database = new Database();
    const cost = 500;
    
    try {
      // ユーザーの残高確認
      let user = await database.getUser(interaction.user.id);
      if (!user) {
        user = await database.createUser(interaction.user.id);
      }

      if (user.balance < cost) {
        await interaction.reply({ 
          content: `❌ 残高が不足しています。\n必要額: ${cost.toLocaleString()} Ru\n現在の残高: ${user.balance.toLocaleString()} Ru`, 
          ephemeral: true 
        });
        return;
      }

      // 確認メッセージ
      const confirmEmbed = new EmbedBuilder()
        .setColor('#ffff00')
        .setTitle('🎪 シークレットVC作成確認')
        .addFields(
          { name: 'チャンネル名', value: defaultName, inline: true },
          { name: '作成費用', value: `${cost.toLocaleString()} Ru`, inline: true },
          { name: '利用後残高', value: `${(user.balance - cost).toLocaleString()} Ru`, inline: true },
          { name: '仕様', value: '• 最大2人まで参加可能\n• 5分間無人で自動削除\n• チャンネル名はボタンで変更可能', inline: false }
        )
        .setDescription('シークレットVCを作成しますか？')
        .setTimestamp();

      const confirmRow = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('vc_create_confirm')
            .setLabel('作成する')
            .setStyle(ButtonStyle.Success)
            .setEmoji('✅'),
          new ButtonBuilder()
            .setCustomId('vc_create_cancel')
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
        if (i.customId === 'vc_create_cancel') {
          await i.update({ 
            content: '❌ VC作成をキャンセルしました。', 
            embeds: [], 
            components: [] 
          });
          return;
        }

        if (i.customId === 'vc_create_confirm') {
          try {
            // VCを作成
            const guild = interaction.guild;
            if (!guild) {
              await i.update({ 
                content: '❌ サーバー情報の取得に失敗しました。', 
                embeds: [], 
                components: [] 
              });
              return;
            }

            // VC作成
            const channel = await guild.channels.create({
              name: defaultName,
              type: ChannelType.GuildVoice,
              userLimit: 2,
              permissionOverwrites: [
                {
                  id: guild.roles.everyone,
                  deny: [PermissionFlagsBits.ViewChannel]
                },
                {
                  id: interaction.user.id,
                  allow: [
                    PermissionFlagsBits.ViewChannel,
                    PermissionFlagsBits.Connect,
                    PermissionFlagsBits.Speak
                  ]
                }
              ]
            });

            // 料金を支払い
            await database.updateUserBalance(interaction.user.id, user.balance - cost);
            
            // 取引履歴を記録
            await database.addTransaction(
              interaction.user.id,
              interaction.user.id,
              cost,
              'vc_purchase',
              `シークレットVC作成: ${channel.name}`
            );

            // DBにVC情報を記録
            await database.addSecretVC(channel.id, interaction.user.id, channel.name);

            // VCコントロールパネル作成
            const controlEmbed = new EmbedBuilder()
              .setColor('#00ff00')
              .setTitle('🎪 シークレットVC作成完了')
              .addFields(
                { name: 'チャンネル', value: `<#${channel.id}>`, inline: true },
                { name: '作成者', value: `<@${interaction.user.id}>`, inline: true },
                { name: '参加制限', value: '2人まで', inline: true }
              )
              .setDescription('以下のボタンからVCの設定を変更できます。')
              .setTimestamp();

            const controlRow = new ActionRowBuilder<ButtonBuilder>()
              .addComponents(
                new ButtonBuilder()
                  .setCustomId(`vc_rename_${channel.id}`)
                  .setLabel('チャンネル名変更')
                  .setStyle(ButtonStyle.Primary)
                  .setEmoji('✏️'),
                new ButtonBuilder()
                  .setCustomId(`vc_invite_${channel.id}`)
                  .setLabel('ユーザー招待')
                  .setStyle(ButtonStyle.Secondary)
                  .setEmoji('👥'),
                new ButtonBuilder()
                  .setCustomId(`vc_delete_${channel.id}`)
                  .setLabel('VC削除')
                  .setStyle(ButtonStyle.Danger)
                  .setEmoji('🗑️')
              );

            await i.update({ 
              embeds: [controlEmbed], 
              components: [controlRow]
            });

            console.log(`[VC CREATED] ${interaction.user.tag} created secret VC: ${channel.name} (${channel.id})`);

          } catch (createError) {
            console.error('Error creating VC:', createError);
            await i.update({ 
              content: '❌ VC作成中にエラーが発生しました。', 
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
              content: '⏰ 時間切れです。VC作成をキャンセルしました。', 
              embeds: [], 
              components: [] 
            });
          } catch (error) {
            // メッセージが既に削除されている場合などは無視
          }
        }
      });
      
    } catch (error) {
      console.error('Error in create-vc command:', error);
      await interaction.reply({ 
        content: '❌ VC作成処理中にエラーが発生しました。', 
        ephemeral: true 
      });
    }
  },
};

export default createVcCommand;