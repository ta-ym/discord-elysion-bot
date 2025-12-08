import { 
  ButtonInteraction, 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  ModalBuilder, 
  TextInputBuilder, 
  TextInputStyle,
  ChatInputCommandInteraction,
  ChannelType,
  PermissionFlagsBits,
  GuildMember
} from 'discord.js';
import { Database } from '../database';

// 虹色の楽園スレッドID
const RAINBOW_PARADISE_THREAD_ID = '1431727691207413780';
// 公開VCカテゴリID
const PUBLIC_VC_CATEGORY_ID = '1425044725865648148';

/**
 * 虹色の楽園スレッドに公開VC管理パネルを送信
 */
export async function sendPublicVCPanel(interaction: ChatInputCommandInteraction | ButtonInteraction): Promise<void> {
  const embed = new EmbedBuilder()
    .setColor('#ff69b4') // ピンク色
    .setTitle('🌈 虹色の楽園 - 公開VC管理')
    .setDescription('誰でも参加できる公開ボイスチャンネルを作成・管理できます。')
    .addFields(
      { name: '💰 作成費用', value: '無料', inline: true },
      { name: '👥 参加制限', value: 'なし（公開）', inline: true },
      { name: '⏰ 削除条件', value: '手動削除のみ', inline: true },
      { name: '📝 使い方', value: '• VC作成: 下のボタンをクリック\n• VC削除: 作成者または管理者が削除可能', inline: false }
    )
    .setFooter({ text: '公開VCは誰でも参加できます' });

  const buttons = new ActionRowBuilder<ButtonBuilder>()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('create_public_vc')
        .setLabel('公開VC作成')
        .setStyle(ButtonStyle.Success)
        .setEmoji('🎤'),
      new ButtonBuilder()
        .setCustomId('list_public_vcs')
        .setLabel('VC一覧表示')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('📋')
    );

  try {
    const channel = await interaction.client.channels.fetch(RAINBOW_PARADISE_THREAD_ID);
    if (channel && 'send' in channel) {
      await channel.send({ embeds: [embed], components: [buttons] });
      
      if (interaction.isRepliable()) {
        await interaction.reply({ 
          content: '✅ 公開VC管理パネルを虹色の楽園に送信しました。', 
          ephemeral: true 
        });
      }
    } else {
      if (interaction.isRepliable()) {
        await interaction.reply({ 
          content: '❌ 虹色の楽園スレッドが見つかりません。', 
          ephemeral: true 
        });
      }
    }
  } catch (error) {
    console.error('公開VC管理パネル送信エラー:', error);
    if (interaction.isRepliable()) {
      await interaction.reply({ 
        content: '❌ 公開VC管理パネルの送信に失敗しました。', 
        ephemeral: true 
      });
    }
  }
}

/**
 * 公開VC作成モーダルを表示
 */
export async function showPublicVCCreationModal(interaction: ButtonInteraction): Promise<void> {
  try {
    const modal = new ModalBuilder()
      .setCustomId('public_vc_creation_modal')
      .setTitle('🌈 公開VC作成');

    const nameInput = new TextInputBuilder()
      .setCustomId('vc_name')
      .setLabel('チャンネル名')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('例: 雑談ルーム、ゲーム部屋、作業通話')
      .setRequired(true)
      .setMaxLength(50);

    const descriptionInput = new TextInputBuilder()
      .setCustomId('vc_description')
      .setLabel('説明（オプション）')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('例: みんなで楽しく雑談しましょう！')
      .setRequired(false)
      .setMaxLength(200);

    const actionRow1 = new ActionRowBuilder<TextInputBuilder>().addComponents(nameInput);
    const actionRow2 = new ActionRowBuilder<TextInputBuilder>().addComponents(descriptionInput);
    
    modal.addComponents(actionRow1, actionRow2);

    await interaction.showModal(modal);
    console.log(`[PUBLIC VC] Modal shown to ${interaction.user.tag}`);
    
  } catch (error) {
    console.error('公開VC作成モーダル表示エラー:', error);
    
    try {
      await interaction.reply({
        content: '❌ モーダル表示中にエラーが発生しました。もう一度お試しください。',
        ephemeral: true
      });
    } catch (replyError) {
      console.error('エラー応答に失敗:', replyError);
    }
  }
}

/**
 * 公開VCを作成
 */
export async function createPublicVC(interaction: any, vcName: string, vcDescription?: string): Promise<void> {
  const database = new Database();

  try {
    const guild = interaction.guild;
    if (!guild) return;

    // チャンネル名のサニタイズ
    const sanitizedName = vcName.replace(/[^a-zA-Z0-9\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF\-_]/g, '');
    const channelName = sanitizedName || `${interaction.user.username}の部屋`;

    // 公開VCを作成
    const channel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildVoice,
      parent: PUBLIC_VC_CATEGORY_ID,
      permissionOverwrites: [
        // 全員が参加可能
        {
          id: guild.roles.everyone,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.Connect,
            PermissionFlagsBits.Speak
          ]
        },
        // 作成者に管理権限
        {
          id: interaction.user.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.Connect,
            PermissionFlagsBits.Speak,
            PermissionFlagsBits.ManageChannels,
            PermissionFlagsBits.MoveMembers,
            PermissionFlagsBits.MuteMembers,
            PermissionFlagsBits.DeafenMembers
          ]
        }
      ]
    });

    // DBに公開VC情報を記録
    await database.addPublicVC(channel.id, interaction.user.id, channel.name, vcDescription);

    // 成功メッセージ
    const successEmbed = new EmbedBuilder()
      .setColor('#00ff00')
      .setTitle('🎤 公開VC作成完了')
      .addFields(
        { name: 'チャンネル名', value: channel.name, inline: true },
        { name: '作成者', value: `<@${interaction.user.id}>`, inline: true },
        { name: '参加制限', value: 'なし（公開）', inline: true },
        { name: '説明', value: vcDescription || 'なし', inline: false }
      )
      .setDescription(`<#${channel.id}> が作成されました！\n誰でも自由に参加できます。`)
      .setFooter({ text: '削除は作成者または管理者が可能です' });

    const controlButtons = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`delete_public_vc_${channel.id}`)
          .setLabel('VCを削除')
          .setStyle(ButtonStyle.Danger)
          .setEmoji('🗑️'),
        new ButtonBuilder()
          .setCustomId(`edit_public_vc_${channel.id}`)
          .setLabel('VC設定変更')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('⚙️')
      );

    await interaction.reply({
      embeds: [successEmbed],
      components: [controlButtons],
      ephemeral: true
    });

    // 虹色の楽園スレッドにも通知
    try {
      const thread = await interaction.client.channels.fetch(RAINBOW_PARADISE_THREAD_ID);
      if (thread && 'send' in thread) {
        const notificationEmbed = new EmbedBuilder()
          .setColor('#ff69b4')
          .setTitle('🌈 新しい公開VC作成')
          .addFields(
            { name: '🎤 チャンネル', value: `<#${channel.id}>`, inline: true },
            { name: '👤 作成者', value: `<@${interaction.user.id}>`, inline: true },
            { name: '📝 説明', value: vcDescription || 'なし', inline: false }
          )
          .setTimestamp();

        await thread.send({ embeds: [notificationEmbed] });
      }
    } catch (error) {
      console.error('スレッド通知エラー:', error);
    }

  } catch (error) {
    console.error('公開VC作成エラー:', error);
    
    // インタラクション応答のエラーハンドリング
    const errorMessage = '❌ 公開VC作成中にエラーが発生しました。';
    
    try {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: errorMessage,
          ephemeral: true
        });
      } else if (interaction.deferred) {
        await interaction.editReply({
          content: errorMessage
        });
      }
    } catch (interactionError) {
      console.error('インタラクション応答エラー:', interactionError);
    }
  }
}

/**
 * 現在の公開VC一覧を表示
 */
export async function showPublicVCList(interaction: ButtonInteraction): Promise<void> {
  const database = new Database();

  try {
    const publicVCs = await database.getActivePublicVCs();

    if (publicVCs.length === 0) {
      await interaction.reply({
        content: '📭 現在、公開VCはありません。',
        ephemeral: true
      });
      return;
    }

    const listEmbed = new EmbedBuilder()
      .setColor('#9b59b6')
      .setTitle('📋 公開VC一覧')
      .setDescription('現在利用可能な公開ボイスチャンネルです。')
      .setFooter({ text: `全 ${publicVCs.length} 個のVC` });

    publicVCs.forEach((vc: any, index: number) => {
      const createdDate = new Date(vc.created_at).toLocaleDateString('ja-JP');
      listEmbed.addFields({
        name: `${index + 1}. ${vc.channel_name}`,
        value: `<#${vc.channel_id}>\n👤 作成者: <@${vc.creator_id}>\n📅 作成日: ${createdDate}\n📝 ${vc.description || '説明なし'}`,
        inline: false
      });
    });

    await interaction.reply({
      embeds: [listEmbed],
      ephemeral: true
    });

  } catch (error) {
    console.error('公開VC一覧取得エラー:', error);
    
    const errorMessage = '❌ 公開VC一覧の取得に失敗しました。';
    
    try {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: errorMessage,
          ephemeral: true
        });
      }
    } catch (interactionError) {
      console.error('インタラクション応答エラー:', interactionError);
    }
  }
}

/**
 * 公開VCを削除
 */
export async function deletePublicVC(interaction: ButtonInteraction, channelId: string): Promise<void> {
  const database = new Database();

  try {
    const vcInfo = await database.getPublicVC(channelId);
    if (!vcInfo) {
      await interaction.reply({
        content: '❌ 指定された公開VCが見つかりません。',
        ephemeral: true
      });
      return;
    }

    // 作成者または管理者のみ削除可能
    const member = interaction.member as GuildMember;
    const isCreator = vcInfo.creator_id === interaction.user.id;
    const isAdmin = member.permissions.has(PermissionFlagsBits.ManageChannels);

    if (!isCreator && !isAdmin) {
      await interaction.reply({
        content: '❌ この公開VCを削除する権限がありません。作成者または管理者のみ削除できます。',
        ephemeral: true
      });
      return;
    }

    // チャンネルを削除
    const channel = await interaction.guild?.channels.fetch(channelId);
    if (channel && 'delete' in channel) {
      await channel.delete('公開VC手動削除');
    }

    // DBから削除
    await database.removePublicVC(channelId);

    await interaction.reply({
      content: '✅ 公開VCを削除しました。',
      ephemeral: true
    });

    // 虹色の楽園スレッドに削除通知
    try {
      const thread = await interaction.client.channels.fetch(RAINBOW_PARADISE_THREAD_ID);
      if (thread && 'send' in thread) {
        const deleteEmbed = new EmbedBuilder()
          .setColor('#ff0000')
          .setTitle('🗑️ 公開VC削除')
          .addFields(
            { name: '🎤 チャンネル名', value: vcInfo.channel_name, inline: true },
            { name: '👤 削除実行者', value: `<@${interaction.user.id}>`, inline: true }
          )
          .setTimestamp();

        await thread.send({ embeds: [deleteEmbed] });
      }
    } catch (error) {
      console.error('削除通知エラー:', error);
    }

    console.log(`[PUBLIC VC DELETED] ${vcInfo.channel_name} deleted by ${interaction.user.username}`);

  } catch (error) {
    console.error('公開VC削除エラー:', error);
    
    const errorMessage = '❌ 公開VC削除中にエラーが発生しました。';
    
    try {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: errorMessage,
          ephemeral: true
        });
      } else if (interaction.deferred || interaction.replied) {
        await interaction.followUp({
          content: errorMessage,
          ephemeral: true
        });
      }
    } catch (interactionError) {
      console.error('インタラクション応答エラー:', interactionError);
    }
  }
}

/**
 * 公開VC設定変更モーダルを表示
 */
export async function showPublicVCEditModal(interaction: ButtonInteraction, channelId: string): Promise<void> {
  const database = new Database();

  try {
    const vcInfo = await database.getPublicVC(channelId);
    if (!vcInfo) {
      await interaction.reply({
        content: '❌ 指定された公開VCが見つかりません。',
        ephemeral: true
      });
      return;
    }

    // 作成者のみ編集可能
    if (vcInfo.creator_id !== interaction.user.id) {
      await interaction.reply({
        content: '❌ この公開VCの設定を変更する権限がありません。作成者のみ変更できます。',
        ephemeral: true
      });
      return;
    }

    const modal = new ModalBuilder()
      .setCustomId(`public_vc_edit_modal_${channelId}`)
      .setTitle('⚙️ 公開VC設定変更');

    const nameInput = new TextInputBuilder()
      .setCustomId('vc_name')
      .setLabel('チャンネル名')
      .setStyle(TextInputStyle.Short)
      .setValue(vcInfo.channel_name)
      .setRequired(true)
      .setMaxLength(50);

    const descriptionInput = new TextInputBuilder()
      .setCustomId('vc_description')
      .setLabel('説明')
      .setStyle(TextInputStyle.Paragraph)
      .setValue(vcInfo.description || '')
      .setRequired(false)
      .setMaxLength(200);

    const actionRow1 = new ActionRowBuilder<TextInputBuilder>().addComponents(nameInput);
    const actionRow2 = new ActionRowBuilder<TextInputBuilder>().addComponents(descriptionInput);
    
    modal.addComponents(actionRow1, actionRow2);

    await interaction.showModal(modal);

  } catch (error) {
    console.error('公開VC編集モーダル表示エラー:', error);
    
    const errorMessage = '❌ 設定変更画面の表示に失敗しました。';
    
    try {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: errorMessage,
          ephemeral: true
        });
      }
    } catch (interactionError) {
      console.error('インタラクション応答エラー:', interactionError);
    }
  }
}