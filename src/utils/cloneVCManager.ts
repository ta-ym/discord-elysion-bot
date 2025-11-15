import { VoiceState, ChannelType, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { Database } from '../database';

// 複製用VCのチャンネルID
const CLONE_VC_CHANNEL_ID = '1439275955481870357';

// 夢見の庭園カテゴリID
const YUMEMI_CATEGORY_ID = '1425044725865648148';

// 音楽BotのユーザーID
const MUSIC_BOT_IDS = [
  '1424994565252714590',
  '1424994682735431743', 
  '1424994753422037083',
  '1424994828541890672',
  // 一般的なMusicBotも含める
  '235088799074484224', // Rythm
  '184405311681912832', // Hydra
  '155149108183695360', // Dyno
  '159985870458322944', // Mee6
  '252128902418268161', // Jockie Music
  '472911936951156740', // FredBoat
  '506710045115121675', // Groovy
  '412500843584741389', // Vexera
  '249218508288016394', // NadekoBot
];

/**
 * 複製用VC管理システム
 * ユーザーが複製用VCに参加すると、夢見の庭園カテゴリに新しい2人用VCを作成し、ユーザーを転送する
 */
export class CloneVCManager {
  private database: Database;
  private createdChannels: Map<string, string> = new Map(); // userId -> channelId
  private emptyChannelTimers: Map<string, NodeJS.Timeout> = new Map(); // channelId -> timer

  constructor(database: Database) {
    this.database = database;
    console.log('CloneVCManager initialized');
  }

  /**
   * 複製用VCへの参加処理
   */
  async handleCloneVCJoin(voiceState: VoiceState): Promise<void> {
    if (!voiceState.member || !voiceState.channel) return;

    // 複製用VCかどうかチェック
    if (voiceState.channel.id !== CLONE_VC_CHANNEL_ID) return;

    const user = voiceState.member.user;
    const guild = voiceState.guild;
    
    console.log(`[CLONE VC] ${user.tag} joined clone VC, creating new temporary VC...`);

    try {
      // カテゴリを取得
      const category = guild.channels.cache.get(YUMEMI_CATEGORY_ID);
      if (!category || category.type !== ChannelType.GuildCategory) {
        console.error('[CLONE VC] Category not found or invalid type');
        return;
      }

      // 特権ロールID
      const PRIVILEGED_ROLES = [
        '1424768596726251651', // 最高神
        '1428737130271871147', // 女神
        '1425862683521191937', // 神徒
      ];

      // 新しいVCを作成
      const newChannelName = `${user.displayName}の部屋`;
      const permissionOverwrites = [
        {
          id: guild.id, // @everyone
          allow: [
            PermissionFlagsBits.Connect, 
            PermissionFlagsBits.Speak, 
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.UseVAD, // 音声検出
            PermissionFlagsBits.Stream, // 画面共有
            PermissionFlagsBits.UseEmbeddedActivities, // アクティビティ
            PermissionFlagsBits.UseApplicationCommands, // アプリコマンド
            PermissionFlagsBits.AttachFiles, // ファイル添付
            PermissionFlagsBits.EmbedLinks, // リンク埋め込み
            PermissionFlagsBits.SendMessages, // メッセージ送信（VC内チャット用）
          ],
          deny: [
            PermissionFlagsBits.ManageChannels, // チャンネル管理を拒否
          ],
        },
        {
          id: user.id, // VC作成者
          allow: [
            PermissionFlagsBits.Connect, 
            PermissionFlagsBits.Speak, 
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.UseVAD,
            PermissionFlagsBits.Stream,
            PermissionFlagsBits.UseEmbeddedActivities,
            PermissionFlagsBits.UseApplicationCommands,
            PermissionFlagsBits.AttachFiles,
            PermissionFlagsBits.EmbedLinks,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.MoveMembers, // メンバー移動権限のみ
          ],
          deny: [
            PermissionFlagsBits.ManageChannels, // チャンネル管理は拒否
          ],
        },
      ];

      // 特権ロールには完全な管理権権を付与
      for (const roleId of PRIVILEGED_ROLES) {
        const role = guild.roles.cache.get(roleId);
        if (role) {
          permissionOverwrites.push({
            id: roleId,
            allow: [
              PermissionFlagsBits.Connect,
              PermissionFlagsBits.Speak,
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.ManageChannels, // 特権ロールのみ管理可能
              PermissionFlagsBits.MoveMembers,
              PermissionFlagsBits.UseVAD,
              PermissionFlagsBits.Stream,
              PermissionFlagsBits.UseEmbeddedActivities,
              PermissionFlagsBits.UseApplicationCommands,
              PermissionFlagsBits.AttachFiles,
              PermissionFlagsBits.EmbedLinks,
              PermissionFlagsBits.SendMessages,
            ],
            deny: [], // 明示的に空配列を指定
          });
        }
      }

      const newChannel = await guild.channels.create({
        name: newChannelName,
        type: ChannelType.GuildVoice,
        parent: category.id,
        userLimit: 2, // 2人制限
        permissionOverwrites,
      });

      console.log(`[CLONE VC] Created new VC: ${newChannelName} (${newChannel.id})`);

      // 作成されたチャンネルをマップに保存
      this.createdChannels.set(user.id, newChannel.id);

      // ユーザーを新しいVCに移動
      try {
        await voiceState.member.voice.setChannel(newChannel);
        console.log(`[CLONE VC] Moved ${user.tag} to new VC: ${newChannelName}`);
      } catch (moveError) {
        console.error(`[CLONE VC] Failed to move user to new VC:`, moveError);
        // 移動に失敗した場合、作成したチャンネルを削除
        try {
          await newChannel.delete();
          this.createdChannels.delete(user.id);
          console.log(`[CLONE VC] Cleaned up unused VC: ${newChannelName}`);
        } catch (deleteError) {
          console.error(`[CLONE VC] Failed to cleanup unused VC:`, deleteError);
        }
        return;
      }

      // チャンネル名変更ボタンを送信
      await this.sendChannelNameChangeButton(newChannel, user.id);

    } catch (error) {
      console.error('[CLONE VC] Error creating new VC:', error);
    }
  }

  /**
   * 作成されたVCからの退出処理
   */
  async handleCreatedVCLeave(voiceState: VoiceState): Promise<void> {
    if (!voiceState.member || !voiceState.channel) return;

    const user = voiceState.member.user;
    const channelId = voiceState.channel.id;

    // このユーザーが作成したVCかどうかチェック
    const createdChannelId = this.createdChannels.get(user.id);
    if (createdChannelId !== channelId) return;

    console.log(`[CLONE VC] Creator ${user.tag} left their created VC: ${voiceState.channel.name}`);

    // チャンネルが空になったかチェック
    this.checkAndScheduleEmptyChannelDeletion(voiceState.channel);
  }

  /**
   * 作成されたVCへの参加処理
   */
  async handleCreatedVCJoin(voiceState: VoiceState): Promise<void> {
    if (!voiceState.member || !voiceState.channel) return;

    // 複製VCかどうかチェック（データベースまたは作成チャンネルマップで）
    const isCloneVC = Array.from(this.createdChannels.values()).includes(voiceState.channel.id);
    
    if (isCloneVC && voiceState.channel.type === ChannelType.GuildVoice) {
      const voiceChannel = voiceState.channel;
      console.log(`[CLONE VC] User ${voiceState.member.user.tag} joined clone VC: ${voiceChannel.name}`);

      // 削除タイマーをキャンセル（チャンネルが再び使用されている）
      this.checkAndScheduleEmptyChannelDeletion(voiceChannel);

      // 音楽Bot参加チェック
      const isMusicBot = MUSIC_BOT_IDS.includes(voiceState.member.user.id);
      if (isMusicBot) {
        console.log(`[CLONE VC] Music Bot detected! Adjusting user limit to 3`);
        try {
          await voiceChannel.setUserLimit(3);
          console.log(`[CLONE VC] User limit set to 3 for ${voiceChannel.name}`);
        } catch (error) {
          console.error(`[CLONE VC] Failed to update user limit:`, error);
        }
      }
    }
  }

  /**
   * 作成されたVCからの退出処理（音楽Bot用）
   */
  async handleCreatedVCLeaveMusicBot(voiceState: VoiceState): Promise<void> {
    if (!voiceState.member || !voiceState.channel) return;

    // 音楽Botの退出かチェック
    const isMusicBot = MUSIC_BOT_IDS.includes(voiceState.member.user.id);
    if (!isMusicBot) return;

    // データベースで一時VCかどうかチェック
    try {
      const tempVC = await this.database.getTempVC(voiceState.channel.id);
      if (tempVC && voiceState.channel.type === ChannelType.GuildVoice) {
        const voiceChannel = voiceState.channel;
        console.log(`[CLONE VC] Music Bot left temp VC! Checking if user limit should be reset`);
        
        // チャンネルにMusicBotが残っているかチェック
        const remainingMusicBots = voiceChannel.members.filter(member => 
          MUSIC_BOT_IDS.includes(member.user.id)
        );

        if (remainingMusicBots.size === 0) {
          console.log(`[CLONE VC] No Music Bots remaining, resetting user limit to 2`);
          try {
            await voiceChannel.setUserLimit(2);
            console.log(`[CLONE VC] User limit reset to 2 for ${voiceChannel.name}`);
          } catch (error) {
            console.error(`[CLONE VC] Failed to reset user limit:`, error);
          }
        }

        // チャンネルが空になったかチェック
        this.checkAndScheduleEmptyChannelDeletion(voiceChannel);
      }
    } catch (error) {
      console.error('[CLONE VC] Error processing music bot leave:', error);
    }
  }



  /**
   * 空室チェックと3分後削除のスケジューリング
   */
  private checkAndScheduleEmptyChannelDeletion(channel: any): void {
    if (!channel || channel.type !== ChannelType.GuildVoice) return;

    const channelId = channel.id;
    const membersCount = channel.members.size;

    if (membersCount === 0) {
      console.log(`[CLONE VC] VC is now empty, scheduling deletion in 3 minutes: ${channel.name}`);
      
      // 既存のタイマーがあればクリア
      const existingTimer = this.emptyChannelTimers.get(channelId);
      if (existingTimer) {
        clearTimeout(existingTimer);
      }

      // 3分後にチャンネルを削除
      const timer = setTimeout(async () => {
        try {
          // 削除前に再度空室チェック
          const currentChannel = channel.guild.channels.cache.get(channelId);
          if (currentChannel && currentChannel.type === ChannelType.GuildVoice) {
            const voiceChannel = currentChannel;
            if (voiceChannel.members.size === 0) {
              const channelName = voiceChannel.name;
              await voiceChannel.delete();
              
              // 作成チャンネルマップから削除
              for (const [userId, storedChannelId] of this.createdChannels.entries()) {
                if (storedChannelId === channelId) {
                  this.createdChannels.delete(userId);
                  break;
                }
              }

              // タイマーマップから削除
              this.emptyChannelTimers.delete(channelId);
              
              console.log(`[CLONE VC] Deleted empty VC after 3 minutes: ${channelName}`);
            } else {
              console.log(`[CLONE VC] VC is no longer empty, canceling deletion: ${voiceChannel.name}`);
              this.emptyChannelTimers.delete(channelId);
            }
          }
        } catch (deleteError) {
          console.error(`[CLONE VC] Failed to delete empty VC:`, deleteError);
          this.emptyChannelTimers.delete(channelId);
        }
      }, 3 * 60 * 1000); // 3分

      this.emptyChannelTimers.set(channelId, timer);
    } else {
      // チャンネルが再び使用されている場合、削除タイマーをクリア
      const existingTimer = this.emptyChannelTimers.get(channelId);
      if (existingTimer) {
        console.log(`[CLONE VC] VC is no longer empty, canceling scheduled deletion: ${channel.name}`);
        clearTimeout(existingTimer);
        this.emptyChannelTimers.delete(channelId);
      }
    }
  }

  /**
   * チャンネル名変更ボタンを送信
   */
  private async sendChannelNameChangeButton(channel: any, creatorUserId: string): Promise<void> {
    try {
      const embed = new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle('🎤 個人VC作成完了')
        .setDescription(`**${channel.name}** へようこそ！\n\n**機能:**`)
        .addFields(
          { name: '👥', value: '最大2人まで利用可能', inline: true },
          { name: '⏰', value: '3分間空室で自動削除', inline: true },
          { name: '🤖', value: '音楽Bot参加時は3人まで', inline: true },
          { name: '📝', value: 'チャンネル名・ステータスは下のボタンで変更可能', inline: false }
        )
        .setFooter({ text: 'このメッセージは3分後に自動削除されます' })
        .setTimestamp();

      const nameChangeButton = new ButtonBuilder()
        .setCustomId(`clone_vc_rename_${channel.id}`)
        .setLabel('📝 チャンネル名変更')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('✏️');

      const statusChangeButton = new ButtonBuilder()
        .setCustomId(`clone_vc_status_${channel.id}`)
        .setLabel('💬 ステータス変更')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('📝');

      const row = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(nameChangeButton, statusChangeButton);

      const message = await channel.send({
        content: `<@${creatorUserId}>`,
        embeds: [embed],
        components: [row]
      });

      // 3分後にメッセージを削除
      setTimeout(async () => {
        try {
          await message.delete();
        } catch (deleteError) {
          console.warn(`[CLONE VC] Failed to delete info message:`, deleteError);
        }
      }, 3 * 60 * 1000); // 3分

    } catch (error) {
      console.error('[CLONE VC] Failed to send channel name change button:', error);
    }
  }

  /**
   * 統計情報を取得
   */
  getStats(): {
    activeChannels: number;
    createdChannels: Map<string, string>;
    scheduledDeletions: number;
  } {
    return {
      activeChannels: this.createdChannels.size,
      createdChannels: new Map(this.createdChannels),
      scheduledDeletions: this.emptyChannelTimers.size
    };
  }
}

// グローバルインスタンス
let cloneVCManager: CloneVCManager | null = null;

/**
 * 複製VC管理システムを初期化
 */
export function initializeCloneVCManager(database: Database): void {
  if (cloneVCManager) {
    cloneVCManager = null;
  }
  cloneVCManager = new CloneVCManager(database);
}

/**
 * 複製VC管理システムのインスタンスを取得
 */
export function getCloneVCManager(): CloneVCManager | null {
  return cloneVCManager;
}