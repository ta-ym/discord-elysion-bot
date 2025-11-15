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

      // データベースに一時VCとして登録（1時間後に期限切れ）
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 1);

      try {
        await this.database.addTempVC(
          newChannel.id,     // channelId
          user.id,           // creatorId  
          newChannelName,    // channelName
          1,                 // durationHours
          0,                 // cost (複製VCは無料)
          expiresAt          // expiresAt
        );
        console.log(`[CLONE VC] Registered temp VC in database: ${newChannelName}`);
      } catch (dbError) {
        console.error(`[CLONE VC] Failed to register temp VC in database:`, dbError);
      }

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
    const membersCount = voiceState.channel.members.size;
    if (membersCount === 0) {
      console.log(`[CLONE VC] VC is now empty, scheduling deletion: ${voiceState.channel.name}`);
      
      // 5秒後にチャンネルを削除（即座に削除すると不自然）
      setTimeout(async () => {
        try {
          const channel = voiceState.guild.channels.cache.get(channelId);
          if (channel && channel.type === ChannelType.GuildVoice) {
            const voiceChannel = channel;
            if (voiceChannel.members.size === 0) {
              const channelName = voiceChannel.name;
              await voiceChannel.delete();
              this.createdChannels.delete(user.id);
              
              // データベースからも削除
              try {
                await this.database.removeTempVC(channelId);
                console.log(`[CLONE VC] Deleted empty VC and removed from database: ${channelName}`);
              } catch (dbError) {
                console.error(`[CLONE VC] Failed to remove VC from database:`, dbError);
              }
            }
          }
        } catch (deleteError) {
          console.error(`[CLONE VC] Failed to delete empty VC:`, deleteError);
        }
      }, 5000);
    }
  }

  /**
   * 作成されたVCへの参加処理
   */
  async handleCreatedVCJoin(voiceState: VoiceState): Promise<void> {
    if (!voiceState.member || !voiceState.channel) return;

    // データベースで一時VCかどうかチェック
    try {
      const tempVC = await this.database.getTempVC(voiceState.channel.id);
      if (tempVC && voiceState.channel.type === ChannelType.GuildVoice) {
        const voiceChannel = voiceState.channel;
        console.log(`[CLONE VC] User ${voiceState.member.user.tag} joined temp VC: ${voiceChannel.name}`);

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
    } catch (error) {
      console.error('[CLONE VC] Error checking temp VC:', error);
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
      }
    } catch (error) {
      console.error('[CLONE VC] Error processing music bot leave:', error);
    }
  }

  /**
   * 定期的な期限切れVC清掃
   * @param guild - Discordサーバーのインスタンス
   */
  async cleanupExpiredVCs(guild: any): Promise<void> {
    try {
      const expiredVCs = await this.database.getExpiredTempVCs();
      
      for (const tempVC of expiredVCs) {
        try {
          const channel = guild.channels.cache.get(tempVC.channel_id);
          if (channel) {
            await channel.delete();
            console.log(`[CLONE VC] Deleted expired VC: ${tempVC.channel_name}`);
          }

          await this.database.removeTempVC(tempVC.channel_id);
          
          // 作成チャンネルマップからも削除
          for (const [userId, channelId] of this.createdChannels.entries()) {
            if (channelId === tempVC.channel_id) {
              this.createdChannels.delete(userId);
              break;
            }
          }
        } catch (cleanupError) {
          console.error(`[CLONE VC] Failed to cleanup expired VC ${tempVC.channel_id}:`, cleanupError);
        }
      }
    } catch (error) {
      console.error('[CLONE VC] Error during cleanup:', error);
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
          { name: '⏰', value: '1時間後に自動削除', inline: true },
          { name: '🤖', value: '音楽Bot参加時は3人まで', inline: true },
          { name: '📝', value: 'チャンネル名は下のボタンで変更可能', inline: false }
        )
        .setFooter({ text: 'このメッセージは3分後に自動削除されます' })
        .setTimestamp();

      const nameChangeButton = new ButtonBuilder()
        .setCustomId(`clone_vc_rename_${channel.id}`)
        .setLabel('📝 チャンネル名変更')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('✏️');

      const row = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(nameChangeButton);

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
  } {
    return {
      activeChannels: this.createdChannels.size,
      createdChannels: new Map(this.createdChannels)
    };
  }
}

// グローバルインスタンス
let cloneVCManager: CloneVCManager | null = null;

/**
 * 複製VC管理システムを初期化
 */
export function initializeCloneVCManager(database: Database, guild: any): void {
  if (cloneVCManager) {
    cloneVCManager = null;
  }
  cloneVCManager = new CloneVCManager(database);
  
  // 定期清掃を開始（10分毎）
  setInterval(() => {
    if (cloneVCManager && guild) {
      cloneVCManager.cleanupExpiredVCs(guild);
    }
  }, 10 * 60 * 1000); // 10分
}

/**
 * 複製VC管理システムのインスタンスを取得
 */
export function getCloneVCManager(): CloneVCManager | null {
  return cloneVCManager;
}