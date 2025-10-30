import { 
  ButtonInteraction, 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  ModalBuilder, 
  TextInputBuilder, 
  TextInputStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ChatInputCommandInteraction,
  MessageComponentInteraction,
  ChannelType,
  PermissionFlagsBits,
  GuildMember
} from 'discord.js';
import { Database } from '../database';
import { SALARY_AUTHORIZED_ROLES } from '../utils/permissions';
import { getCurrencyLogger } from '../utils/currencyLogger';

// シークレットVC作成用のカテゴリID
const SECRET_VC_CATEGORY_ID = '1425044725865648148';
// VC内チャットのスレッドID
const VC_CHAT_THREAD_ID = '1432297223647133839';

/**
 * VC内チャットにVC作成ボタンを送信
 */
export async function sendVCCreationPanel(interaction: ChatInputCommandInteraction | ButtonInteraction): Promise<void> {
  const embed = new EmbedBuilder()
    .setColor('#9b59b6')
    .setTitle('🎪 シークレットVC作成パネル')
    .setDescription('下のボタンをクリックしてシークレットVCを作成できます。')
    .addFields(
      { name: '💰 作成費用', value: '500 Ru', inline: true },
      { name: '⏰ 時間制限', value: '6時間/12時間/24時間から選択', inline: true },
      { name: '👥 パートナー', value: '一緒に使う相手を指定可能', inline: true }
    )
    .setFooter({ text: '作成後、指定した時間経過で自動削除されます' });

  const button = new ActionRowBuilder<ButtonBuilder>()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('create_secret_vc')
        .setLabel('シークレットVC作成')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('🎪')
    );

  try {
    const channel = await interaction.client.channels.fetch(VC_CHAT_THREAD_ID);
    if (channel && 'send' in channel) {
      await channel.send({ embeds: [embed], components: [button] });
      
      if (interaction.isRepliable()) {
        await interaction.reply({ 
          content: '✅ VC作成パネルをVC内チャットに送信しました。', 
          ephemeral: true 
        });
      }
    } else {
      if (interaction.isRepliable()) {
        await interaction.reply({ 
          content: '❌ VC内チャットが見つかりません。', 
          ephemeral: true 
        });
      }
    }
  } catch (error) {
    console.error('VC作成パネル送信エラー:', error);
    if (interaction.isRepliable()) {
      await interaction.reply({ 
        content: '❌ VC作成パネルの送信に失敗しました。', 
        ephemeral: true 
      });
    }
  }
}

/**
 * VC作成プロセスを開始
 */
export async function startVCCreation(interaction: ButtonInteraction): Promise<void> {
  const database = new Database();
  
  try {
    // ユーザーの残高確認
    let user = await database.getUser(interaction.user.id);
    if (!user) {
      user = await database.createUser(interaction.user.id);
    }

    if (user.balance < 500) {
      await interaction.reply({ 
        content: `❌ 残高が不足しています。\n必要額: 500 Ru\n現在の残高: ${user.balance.toLocaleString()} Ru`, 
        ephemeral: true 
      });
      return;
    }

    // 時間制限選択画面
    const timeEmbed = new EmbedBuilder()
      .setColor('#e74c3c')
      .setTitle('⏰ VC継続時間を選択')
      .setDescription('シークレットVCの継続時間を選択してください。\n指定時間経過後、自動的に削除されます。')
      .addFields(
        { name: '6時間', value: '500 Ru', inline: true },
        { name: '12時間', value: '500 Ru', inline: true },
        { name: '24時間', value: '500 Ru', inline: true }
      );

    const timeSelect = new ActionRowBuilder<StringSelectMenuBuilder>()
      .addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('vc_duration_select')
          .setPlaceholder('継続時間を選択してください')
          .addOptions(
            new StringSelectMenuOptionBuilder()
              .setLabel('6時間')
              .setDescription('6時間後に自動削除')
              .setValue('6')
              .setEmoji('⏰'),
            new StringSelectMenuOptionBuilder()
              .setLabel('12時間')
              .setDescription('12時間後に自動削除')
              .setValue('12')
              .setEmoji('🕐'),
            new StringSelectMenuOptionBuilder()
              .setLabel('24時間')
              .setDescription('24時間後に自動削除')
              .setValue('24')
              .setEmoji('📅')
          )
      );

    await interaction.reply({
      embeds: [timeEmbed],
      components: [timeSelect],
      ephemeral: true
    });

  } catch (error) {
    console.error('VC作成開始エラー:', error);
    await interaction.reply({ 
      content: '❌ エラーが発生しました。', 
      ephemeral: true 
    });
  }
}

/**
 * 時間選択後のパートナー選択画面
 */
export async function handleDurationSelection(interaction: MessageComponentInteraction): Promise<void> {
  if (!interaction.isStringSelectMenu()) return;
  
  const duration = parseInt(interaction.values[0]);
  
  const partnerEmbed = new EmbedBuilder()
    .setColor('#3498db')
    .setTitle('👥 パートナー選択')
    .setDescription(`継続時間: **${duration}時間**\n\n一緒にVCを使う相手を選択してください。`)
    .addFields(
      { name: '選択方法', value: '• メンバー一覧から選択\n• ユーザー名/IDで検索', inline: false }
    );

  const partnerButtons = new ActionRowBuilder<ButtonBuilder>()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(`vc_partner_list_${duration}`)
        .setLabel('メンバー一覧から選択')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('📋'),
      new ButtonBuilder()
        .setCustomId(`vc_partner_search_${duration}`)
        .setLabel('ユーザー名/IDで検索')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('🔍'),
      new ButtonBuilder()
        .setCustomId(`vc_no_partner_${duration}`)
        .setLabel('パートナーなしで作成')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('👤')
    );

  await interaction.update({
    embeds: [partnerEmbed],
    components: [partnerButtons]
  });
}

/**
 * メンバー一覧からパートナーを選択
 */
export async function showPartnerList(interaction: ButtonInteraction, duration: number): Promise<void> {
  const guild = interaction.guild;
  if (!guild) return;

  try {
    // アクティブなメンバーを取得（最近オンラインだったメンバー）
    const members = await guild.members.fetch({ limit: 25 });
    const activeMembers = members
      .filter(member => 
        !member.user.bot && 
        member.user.id !== interaction.user.id &&
        member.presence?.status !== 'offline'
      )
      .first(20); // 最大20人まで

    if (activeMembers.length === 0) {
      await interaction.reply({
        content: '❌ アクティブなメンバーが見つかりませんでした。検索機能をお使いください。',
        ephemeral: true
      });
      return;
    }

    const memberSelect = new ActionRowBuilder<StringSelectMenuBuilder>()
      .addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`vc_member_select_${duration}`)
          .setPlaceholder('パートナーを選択してください')
          .addOptions(
            activeMembers.map(member => 
              new StringSelectMenuOptionBuilder()
                .setLabel(member.displayName)
                .setDescription(`@${member.user.username}`)
                .setValue(member.user.id)
                .setEmoji('👤')
            )
          )
      );

    const embed = new EmbedBuilder()
      .setColor('#2ecc71')
      .setTitle('👥 メンバー一覧')
      .setDescription('パートナーとして追加したいメンバーを選択してください。');

    await interaction.update({
      embeds: [embed],
      components: [memberSelect]
    });

  } catch (error) {
    console.error('メンバー一覧取得エラー:', error);
    await interaction.reply({
      content: '❌ メンバー一覧の取得に失敗しました。',
      ephemeral: true
    });
  }
}

/**
 * ユーザー検索モーダルを表示
 */
export async function showPartnerSearchModal(interaction: ButtonInteraction, duration: number): Promise<void> {
  const modal = new ModalBuilder()
    .setCustomId(`vc_partner_modal_${duration}`)
    .setTitle('👥 パートナー検索');

  const userInput = new TextInputBuilder()
    .setCustomId('partner_input')
    .setLabel('ユーザー名またはユーザーID')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('例: username または 123456789012345678')
    .setRequired(true)
    .setMaxLength(100);

  const actionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(userInput);
  modal.addComponents(actionRow);

  await interaction.showModal(modal);
}

/**
 * 最終的なVC作成処理
 */
export async function createSecretVC(
  interaction: MessageComponentInteraction, 
  duration: number, 
  partnerId?: string
): Promise<void> {
  const database = new Database();
  const cost = 500;

  try {
    const guild = interaction.guild;
    if (!guild) return;

    // 再度残高確認
    let user = await database.getUser(interaction.user.id);
    if (!user || user.balance < cost) {
      await interaction.update({
        content: '❌ 残高が不足しています。',
        embeds: [],
        components: []
      });
      return;
    }

    // パートナーの確認
    let partner: GuildMember | undefined;
    if (partnerId) {
      try {
        partner = await guild.members.fetch(partnerId);
      } catch {
        await interaction.update({
          content: '❌ 指定されたユーザーが見つかりません。',
          embeds: [],
          components: []
        });
        return;
      }
    }

    // チャンネル名生成
    const channelName = partner 
      ? `${interaction.user.username}＆${partner.displayName}のVC`
      : `${interaction.user.username}のVC`;

    // VCを作成
    const channel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildVoice,
      parent: SECRET_VC_CATEGORY_ID,
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
            PermissionFlagsBits.Speak,
            PermissionFlagsBits.ManageChannels
          ]
        },
        ...(partner ? [{
          id: partner.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.Connect,
            PermissionFlagsBits.Speak
          ]
        }] : []),
        // 管理者権限
        ...SALARY_AUTHORIZED_ROLES.map(roleId => ({
          id: roleId,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.Connect,
            PermissionFlagsBits.Speak,
            PermissionFlagsBits.ManageChannels
          ]
        }))
      ]
    });

    // 料金支払い
    await database.updateUserBalance(interaction.user.id, user.balance - cost);
    
    // 取引履歴を記録
    await database.addTransaction(
      interaction.user.id,
      interaction.user.id,
      cost,
      'vc_purchase',
      `シークレットVC作成(${duration}h): ${channel.name}`
    );

    // 通貨ログに記録
    const logger = getCurrencyLogger();
    if (logger) {
      await logger.logTransaction({
        fromUserId: interaction.user.id,
        toUserId: interaction.user.id,
        amount: cost,
        type: 'vc_purchase',
        description: `シークレットVC作成(${duration}h): ${channel.name}`
      });
    }

    // DBにVC情報を記録（削除時刻付き）
    const expiresAt = new Date(Date.now() + duration * 60 * 60 * 1000);
    await database.addSecretVCWithExpiry(channel.id, interaction.user.id, channel.name, expiresAt);

    // 削除タイマーを設定
    setTimeout(async () => {
      await deleteExpiredVC(channel.id, database);
    }, duration * 60 * 60 * 1000);

    // 成功メッセージ
    const successEmbed = new EmbedBuilder()
      .setColor('#00ff00')
      .setTitle('🎪 シークレットVC作成完了')
      .addFields(
        { name: 'チャンネル名', value: channel.name, inline: true },
        { name: '継続時間', value: `${duration}時間`, inline: true },
        { name: '削除予定', value: `<t:${Math.floor(expiresAt.getTime() / 1000)}:F>`, inline: false },
        { name: 'パートナー', value: partner ? `<@${partner.id}>` : 'なし', inline: true },
        { name: '作成費用', value: `${cost.toLocaleString()} Ru`, inline: true }
      )
      .setDescription(`<#${channel.id}> が作成されました！`)
      .setFooter({ text: '指定時間経過後、自動的に削除されます' });

    const controlRow = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`delete_vc_${channel.id}`)
          .setLabel('VCを削除')
          .setStyle(ButtonStyle.Danger)
          .setEmoji('🗑️')
      );

    await interaction.update({
      embeds: [successEmbed],
      components: [controlRow]
    });

  } catch (error) {
    console.error('VC作成エラー:', error);
    await interaction.update({
      content: '❌ VC作成中にエラーが発生しました。',
      embeds: [],
      components: []
    });
  }
}

/**
 * 期限切れVCの削除
 */
async function deleteExpiredVC(channelId: string, database: Database): Promise<void> {
  try {
    const vcInfo = await database.getSecretVC(channelId);
    if (!vcInfo) return;

    // DBから削除
    await database.removeSecretVC(channelId);
    
    console.log(`[VC EXPIRED] Deleted expired VC: ${vcInfo.channel_name}`);
  } catch (error) {
    console.error('期限切れVC削除エラー:', error);
  }
}

/**
 * VCの手動削除
 */
export async function deleteSecretVC(interaction: ButtonInteraction, channelId: string): Promise<void> {
  const database = new Database();

  try {
    const vcInfo = await database.getSecretVC(channelId);
    if (!vcInfo) {
      await interaction.update({
        content: '❌ VCが見つかりません。',
        embeds: [],
        components: []
      });
      return;
    }

    // 作成者または管理者のみ削除可能
    const member = interaction.member as GuildMember;
    const isCreator = vcInfo.creator_id === interaction.user.id;
    const isAdmin = member.roles.cache.some(role => SALARY_AUTHORIZED_ROLES.includes(role.id));

    if (!isCreator && !isAdmin) {
      await interaction.reply({
        content: '❌ このVCを削除する権限がありません。',
        ephemeral: true
      });
      return;
    }

    // チャンネルを削除
    const channel = await interaction.guild?.channels.fetch(channelId);
    if (channel && 'delete' in channel) {
      await channel.delete('手動削除');
    }

    // DBから削除
    await database.removeSecretVC(channelId);

    await interaction.update({
      content: '✅ シークレットVCを削除しました。',
      embeds: [],
      components: []
    });

    console.log(`[VC DELETED] Manually deleted VC: ${vcInfo.channel_name} by ${interaction.user.username}`);

  } catch (error) {
    console.error('VC削除エラー:', error);
    await interaction.update({
      content: '❌ VC削除中にエラーが発生しました。',
      embeds: [],
      components: []
    });
  }
}