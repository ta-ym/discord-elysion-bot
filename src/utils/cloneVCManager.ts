import { VoiceState, ChannelType, PermissionFlagsBits } from 'discord.js';
import { Database } from '../database';

// 複製用VCのチャンネルID
const CLONE_VC_CHANNEL_ID = '1439275955481870357';

// 夢見の庭園カテゴリID
const YUMEMI_CATEGORY_ID = '1425044725865648148';

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

      // 新しいVCを作成
      const newChannelName = `${user.displayName}の部屋`;
      const newChannel = await guild.channels.create({
        name: newChannelName,
        type: ChannelType.GuildVoice,
        parent: category.id,
        userLimit: 2, // 2人制限
        permissionOverwrites: [
          {
            id: guild.id, // @everyone
            allow: [PermissionFlagsBits.Connect, PermissionFlagsBits.Speak, PermissionFlagsBits.ViewChannel],
          },
          {
            id: user.id, // VC作成者
            allow: [
              PermissionFlagsBits.Connect, 
              PermissionFlagsBits.Speak, 
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.ManageChannels, // チャンネル管理権限
              PermissionFlagsBits.MoveMembers, // メンバー移動権限
            ],
          },
        ],
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
      if (tempVC) {
        console.log(`[CLONE VC] User ${voiceState.member.user.tag} joined temp VC: ${voiceState.channel.name}`);
      }
    } catch (error) {
      console.error('[CLONE VC] Error checking temp VC:', error);
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