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
  ModalSubmitInteraction,
  StringSelectMenuInteraction,
  ChannelType,
  PermissionFlagsBits,
  GuildMember,
  Guild,
  PresenceStatus
} from 'discord.js';
import { Database } from '../database';
import { SALARY_AUTHORIZED_ROLES } from '../utils/permissions';
import { getCurrencyLogger } from '../utils/currencyLogger';

// シークレットVC作成用のカテゴリID
const SECRET_VC_CATEGORY_ID = '1425044725865648148';

// 料金設定
const DURATION_COSTS = {
  6: 5000,
  12: 10000,
  24: 30000
} as const;

type Duration = keyof typeof DURATION_COSTS;

/**
 * VC作成プロセスを開始
 */
export async function startVCCreation(interaction: ButtonInteraction): Promise<void> {
  try {
    await interaction.deferReply({ ephemeral: true });
    
    const database = new Database();
    
    // ユーザーの残高確認
    let user = await database.getUser(interaction.user.id);
    if (!user) {
      user = await database.createUser(interaction.user.id);
    }

    if (user.balance < DURATION_COSTS[6]) {
      await interaction.editReply({
        content: `❌ 残高が不足しています。\n最低必要額: ${DURATION_COSTS[6].toLocaleString()} Ru\n現在の残高: ${user.balance.toLocaleString()} Ru`
      });
      return;
    }

    // 時間選択画面
    const timeEmbed = new EmbedBuilder()
      .setColor('#e74c3c')
      .setTitle('⏰ VC継続時間を選択')
      .setDescription('シークレットVCの継続時間を選択してください。\n指定時間経過後、自動的に削除されます。')
      .addFields(
        { name: '6時間', value: `${DURATION_COSTS[6].toLocaleString()} Ru`, inline: true },
        { name: '12時間', value: `${DURATION_COSTS[12].toLocaleString()} Ru`, inline: true },
        { name: '24時間', value: `${DURATION_COSTS[24].toLocaleString()} Ru`, inline: true }
      )
      .setFooter({ text: `現在の残高: ${user.balance.toLocaleString()} Ru` });

    const timeButtons = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('vc_duration_6')
          .setLabel(`6時間 (${DURATION_COSTS[6].toLocaleString()} Ru)`)
          .setStyle(ButtonStyle.Primary)
          .setEmoji('⏰'),
        new ButtonBuilder()
          .setCustomId('vc_duration_12')
          .setLabel(`12時間 (${DURATION_COSTS[12].toLocaleString()} Ru)`)
          .setStyle(ButtonStyle.Primary)
          .setEmoji('🕛'),
        new ButtonBuilder()
          .setCustomId('vc_duration_24')
          .setLabel(`24時間 (${DURATION_COSTS[24].toLocaleString()} Ru)`)
          .setStyle(ButtonStyle.Primary)
          .setEmoji('📅')
      );

    await interaction.editReply({
      embeds: [timeEmbed],
      components: [timeButtons]
    });

  } catch (error) {
    console.error('VC作成開始エラー:', error);
    
    try {
      await interaction.editReply({
        content: '❌ エラーが発生しました。再度お試しください。'
      });
    } catch {
      // エラー応答に失敗した場合は無視
    }
  }
}

/**
 * 時間選択後のパートナー検索
 */
export async function handleDurationSelection(interaction: ButtonInteraction, duration: Duration): Promise<void> {
  try {
    // 残高再確認
    const database = new Database();
    const user = await database.getUser(interaction.user.id);
    const cost = DURATION_COSTS[duration];

    if (!user || user.balance < cost) {
      await interaction.update({
        content: `❌ 残高が不足しています。\n必要額: ${cost.toLocaleString()} Ru\n現在の残高: ${user?.balance?.toLocaleString() || 0} Ru`,
        embeds: [],
        components: []
      });
      return;
    }

    // パートナー検索モーダルを表示
    const modal = new ModalBuilder()
      .setCustomId(`partner_search_modal_${duration}`)
      .setTitle('👥 パートナー検索');

    const searchInput = new TextInputBuilder()
      .setCustomId('search_query')
      .setLabel('パートナーのユーザー名を入力')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('例: username, 太郎, taro')
      .setRequired(true)
      .setMinLength(1)
      .setMaxLength(50);

    const actionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(searchInput);
    modal.addComponents(actionRow);

    await interaction.showModal(modal);

  } catch (error) {
    console.error('時間選択処理エラー:', error);
    
    try {
      await interaction.update({
        content: '❌ エラーが発生しました。再度お試しください。',
        embeds: [],
        components: []
      });
    } catch {
      // エラー応答に失敗した場合は無視
    }
  }
}

/**
 * パートナー検索処理
 */
export async function handlePartnerSearch(interaction: ModalSubmitInteraction, duration: Duration): Promise<void> {
  try {
    await interaction.deferReply({ ephemeral: true });

    const searchQuery = interaction.fields.getTextInputValue('search_query').trim().toLowerCase();
    const guild = interaction.guild!;

    // メンバー検索
    const members = await searchMembers(guild, searchQuery, interaction.user.id);

    if (members.length === 0) {
      // 検索結果なし
      const noResultEmbed = new EmbedBuilder()
        .setColor('#ff9900')
        .setTitle('🔍 検索結果なし')
        .setDescription(`「${searchQuery}」に一致するユーザーが見つかりませんでした。`)
        .addFields(
          { name: '検索のヒント', value: '• ユーザー名の一部を入力してください\n• 表示名（ニックネーム）でも検索できます\n• 英数字は半角で入力してください', inline: false }
        );

      const retryButton = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`vc_duration_${duration}`)
            .setLabel('再検索')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('🔄')
        );

      await interaction.editReply({
        embeds: [noResultEmbed],
        components: [retryButton]
      });
      return;
    }

    // 検索結果表示
    const resultEmbed = new EmbedBuilder()
      .setColor('#3498db')
      .setTitle('👥 パートナー選択')
      .setDescription(`「${searchQuery}」の検索結果から選択してください。`)
      .addFields(
        { name: '継続時間', value: `${duration}時間 (${DURATION_COSTS[duration].toLocaleString()} Ru)`, inline: true },
        { name: '検索結果', value: `${members.length}人見つかりました`, inline: true }
      );

    const selectMenu = new ActionRowBuilder<StringSelectMenuBuilder>()
      .addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`partner_select_${duration}`)
          .setPlaceholder('パートナーを選択してください')
          .addOptions(
            members.map(member => {
              const statusEmoji = getStatusEmoji(member.presence?.status);
              return new StringSelectMenuOptionBuilder()
                .setLabel(`${statusEmoji} ${member.displayName}`)
                .setDescription(`@${member.user.username}`)
                .setValue(member.user.id)
                .setEmoji('👤');
            })
          )
      );

    const actionButtons = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`vc_duration_${duration}`)
          .setLabel('再検索')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('🔄'),
        new ButtonBuilder()
          .setCustomId(`manual_id_input_${duration}`)
          .setLabel('手動でID入力')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('✏️')
      );

    await interaction.editReply({
      embeds: [resultEmbed],
      components: [selectMenu, actionButtons]
    });

  } catch (error) {
    console.error('パートナー検索エラー:', error);
    
    try {
      await interaction.editReply({
        content: '❌ 検索中にエラーが発生しました。再度お試しください。'
      });
    } catch {
      // エラー応答に失敗した場合は無視
    }
  }
}

/**
 * パートナー選択後のVC作成
 */
export async function handlePartnerSelection(interaction: StringSelectMenuInteraction, duration: Duration): Promise<void> {
  try {
    await interaction.deferUpdate();

    const partnerId = interaction.values[0];
    await createSecretVC(interaction, duration, partnerId);

  } catch (error) {
    console.error('パートナー選択エラー:', error);
    
    try {
      await interaction.editReply({
        content: '❌ パートナー選択中にエラーが発生しました。',
        embeds: [],
        components: []
      });
    } catch {
      // エラー応答に失敗した場合は無視
    }
  }
}

/**
 * 手動ID入力モーダル
 */
export async function showManualIdInput(interaction: ButtonInteraction, duration: Duration): Promise<void> {
  try {
    const modal = new ModalBuilder()
      .setCustomId(`manual_id_modal_${duration}`)
      .setTitle('✏️ ユーザーID入力');

    const idInput = new TextInputBuilder()
      .setCustomId('user_id')
      .setLabel('パートナーのユーザーID')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('例: 123456789012345678')
      .setRequired(true)
      .setMinLength(17)
      .setMaxLength(19);

    const helpText = new TextInputBuilder()
      .setCustomId('help_text')
      .setLabel('ヒント')
      .setStyle(TextInputStyle.Paragraph)
      .setValue('1. Discordで対象ユーザーを右クリック\n2. "ユーザーIDをコピー"を選択\n3. ここに貼り付け')
      .setRequired(false);

    const actionRow1 = new ActionRowBuilder<TextInputBuilder>().addComponents(idInput);
    const actionRow2 = new ActionRowBuilder<TextInputBuilder>().addComponents(helpText);
    modal.addComponents(actionRow1, actionRow2);

    await interaction.showModal(modal);

  } catch (error) {
    console.error('手動ID入力モーダル表示エラー:', error);
  }
}

/**
 * 手動ID入力処理
 */
export async function handleManualIdInput(interaction: ModalSubmitInteraction, duration: Duration): Promise<void> {
  try {
    await interaction.deferReply({ ephemeral: true });

    const userId = interaction.fields.getTextInputValue('user_id').trim();
    
    // ユーザーIDの形式チェック
    if (!/^\d{17,19}$/.test(userId)) {
      await interaction.editReply({
        content: `❌ 無効なユーザーID形式です。\n入力値: \`${userId}\`\n\n正しい形式: 17〜19桁の数字`
      });
      return;
    }

    // ユーザーの存在確認
    try {
      await interaction.guild!.members.fetch(userId);
      await createSecretVC(interaction, duration, userId);
    } catch {
      await interaction.editReply({
        content: `❌ 指定されたユーザーIDのユーザーがこのサーバーに見つかりません。\nユーザーID: \`${userId}\``
      });
    }

  } catch (error) {
    console.error('手動ID入力処理エラー:', error);
    
    try {
      await interaction.editReply({
        content: '❌ ID処理中にエラーが発生しました。'
      });
    } catch {
      // エラー応答に失敗した場合は無視
    }
  }
}

/**
 * シークレットVC作成
 */
async function createSecretVC(
  interaction: StringSelectMenuInteraction | ModalSubmitInteraction, 
  duration: Duration, 
  partnerId: string
): Promise<void> {
  try {
    const database = new Database();
    const cost = DURATION_COSTS[duration];
    const guild = interaction.guild!;
    
    // 進行状況表示
    const progressEmbed = new EmbedBuilder()
      .setColor('#ffff00')
      .setTitle('🔄 シークレットVC作成中...')
      .setDescription('しばらくお待ちください。')
      .addFields(
        { name: '継続時間', value: `${duration}時間`, inline: true },
        { name: '費用', value: `${cost.toLocaleString()} Ru`, inline: true }
      );
      
    await interaction.editReply({
      embeds: [progressEmbed],
      components: []
    });

    // 最終残高確認
    const user = await database.getUser(interaction.user.id);
    if (!user || user.balance < cost) {
      await interaction.editReply({
        content: `❌ 残高が不足しています。\n必要額: ${cost.toLocaleString()} Ru\n現在の残高: ${user?.balance?.toLocaleString() || 0} Ru`,
        embeds: [],
        components: []
      });
      return;
    }

    // パートナーの確認
    const partner = await guild.members.fetch(partnerId);
    
    // チャンネル名生成
    const channelName = await generateSecretVCName(guild);

    // VC作成
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
        {
          id: partner.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.Connect,
            PermissionFlagsBits.Speak
          ]
        },
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
    
    // 取引履歴記録
    await database.addTransaction(
      interaction.user.id,
      interaction.user.id,
      cost,
      'vc_purchase',
      `シークレットVC作成(${duration}h): ${channel.name}`
    );

    // 通貨ログ記録
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

    // DBにVC情報記録
    const expiresAt = new Date(Date.now() + duration * 60 * 60 * 1000);
    await database.addSecretVCWithExpiry(channel.id, interaction.user.id, channel.name, expiresAt);

    // 自動削除タイマー設定
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
        { name: 'パートナー', value: `<@${partner.id}>`, inline: true },
        { name: '削除予定', value: `<t:${Math.floor(expiresAt.getTime() / 1000)}:F>`, inline: false },
        { name: '作成費用', value: `${cost.toLocaleString()} Ru`, inline: true },
        { name: '残高', value: `${(user.balance - cost).toLocaleString()} Ru`, inline: true }
      )
      .setDescription(`<#${channel.id}> が作成されました！`)
      .setFooter({ text: '指定時間経過後、自動的に削除されます' });

    const controlButton = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`delete_vc_${channel.id}`)
          .setLabel('VCを削除')
          .setStyle(ButtonStyle.Danger)
          .setEmoji('🗑️')
      );

    await interaction.editReply({
      embeds: [successEmbed],
      components: [controlButton]
    });

  } catch (error) {
    console.error('VC作成エラー:', error);
    
    try {
      await interaction.editReply({
        content: '❌ VC作成中にエラーが発生しました。',
        embeds: [],
        components: []
      });
    } catch {
      // エラー応答に失敗した場合は無視
    }
  }
}

/**
 * メンバー検索
 */
async function searchMembers(guild: Guild, query: string, excludeUserId: string): Promise<GuildMember[]> {
  try {
    const members = await guild.members.fetch();
    
    const filtered = Array.from(members.values())
      .filter(member => {
        // 自分自身とボットを除外
        if (member.user.id === excludeUserId || member.user.bot) {
          return false;
        }
        
        const username = member.user.username.toLowerCase();
        const displayName = member.displayName.toLowerCase();
        
        // 完全一致、前方一致、部分一致で検索
        return username === query || 
               displayName === query ||
               username.startsWith(query) ||
               displayName.startsWith(query) ||
               username.includes(query) ||
               displayName.includes(query);
      })
      .sort((a, b) => {
        // オンライン状態でソート
        const statusPriority: Record<string, number> = {
          'online': 1,
          'idle': 2,
          'dnd': 3,
          'offline': 4,
          'invisible': 5
        };
        
        const aStatus = a.presence?.status || 'offline';
        const bStatus = b.presence?.status || 'offline';
        
        return (statusPriority[aStatus] || 5) - (statusPriority[bStatus] || 5);
      })
      .slice(0, 10); // 最大10人まで

    return filtered;
  } catch (error) {
    console.error('メンバー検索エラー:', error);
    return [];
  }
}

/**
 * ステータス絵文字取得
 */
function getStatusEmoji(status?: PresenceStatus): string {
  switch (status) {
    case 'online': return '🟢';
    case 'idle': return '🟡';
    case 'dnd': return '🔴';
    case 'offline':
    default: return '⚫';
  }
}

/**
 * シークレットVC名生成
 */
async function generateSecretVCName(guild: Guild): Promise<string> {
  try {
    const category = await guild.channels.fetch(SECRET_VC_CATEGORY_ID);
    if (!category || category.type !== ChannelType.GuildCategory) {
      return 'シークレットA';
    }

    const channels = category.children.cache.filter((ch: any) => 
      ch.type === ChannelType.GuildVoice && ch.name.startsWith('シークレット')
    );

    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    for (let i = 0; i < alphabet.length; i++) {
      const letter = alphabet[i];
      const testName = `シークレット${letter}`;
      
      const exists = channels.some((ch: any) => ch.name === testName);
      if (!exists) {
        return testName;
      }
    }

    return `シークレット${channels.size + 1}`;
  } catch (error) {
    console.error('VC名生成エラー:', error);
    return 'シークレットA';
  }
}

/**
 * 期限切れVC削除
 */
async function deleteExpiredVC(channelId: string, database: Database): Promise<void> {
  try {
    const vcInfo = await database.getSecretVC(channelId);
    if (!vcInfo) return;

    await database.removeSecretVC(channelId);
    console.log(`[VC EXPIRED] Deleted expired VC: ${vcInfo.channel_name}`);
  } catch (error) {
    console.error('期限切れVC削除エラー:', error);
  }
}

/**
 * VC手動削除
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

    // チャンネル削除
    const channel = await interaction.guild?.channels.fetch(channelId);
    if (channel && 'delete' in channel) {
      await channel.delete('手動削除');
    }

    // DB削除
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