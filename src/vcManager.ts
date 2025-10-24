import { VoiceState, Client } from 'discord.js';
import { Database } from './database';

export class VCManager {
  private client: Client;
  private database: Database;
  private cleanupInterval: NodeJS.Timeout;

  constructor(client: Client, database: Database) {
    this.client = client;
    this.database = database;
    
    // 5分ごとに非アクティブなVCをチェック
    this.cleanupInterval = setInterval(() => {
      this.cleanupInactiveVCs();
    }, 5 * 60 * 1000); // 5分

    // ボイスチャンネルの状態変更を監視
    this.client.on('voiceStateUpdate', this.handleVoiceStateUpdate.bind(this));
    
    console.log('VCManager initialized');
  }

  private async handleVoiceStateUpdate(oldState: VoiceState, newState: VoiceState): Promise<void> {
    try {
      // VCに参加した場合
      if (newState.channel) {
        const vcInfo = await this.database.getSecretVC(newState.channel.id);
        if (vcInfo) {
          // アクティビティを更新
          await this.database.updateVCActivity(newState.channel.id);
          console.log(`[VC ACTIVITY] Updated activity for VC: ${newState.channel.name}`);
        }
      }

      // VCから退出した場合
      if (oldState.channel) {
        const vcInfo = await this.database.getSecretVC(oldState.channel.id);
        if (vcInfo) {
          // チャンネルが空になったかチェック
          const remainingMembers = oldState.channel.members.filter(member => !member.user.bot);
          
          if (remainingMembers.size === 0) {
            console.log(`[VC EMPTY] VC became empty: ${oldState.channel.name}`);
            // 5分後に削除をスケジュール
            setTimeout(async () => {
              await this.checkAndDeleteVC(oldState.channel!.id);
            }, 5 * 60 * 1000); // 5分
          }
        }
      }
    } catch (error) {
      console.error('Error handling voice state update:', error);
    }
  }

  private async checkAndDeleteVC(channelId: string): Promise<void> {
    try {
      const channel = this.client.channels.cache.get(channelId);
      if (!channel || !channel.isVoiceBased()) return;

      const vcInfo = await this.database.getSecretVC(channelId);
      if (!vcInfo) return;

      // まだ誰もいないかチェック
      const members = channel.members.filter(member => !member.user.bot);
      if (members.size === 0) {
        console.log(`[VC DELETE] Deleting inactive VC: ${channel.name}`);
        
        // DBから削除
        await this.database.removeSecretVC(channelId);
        
        // チャンネルを削除
        await channel.delete('5分間非アクティブのため自動削除');
      }
    } catch (error) {
      console.error('Error checking and deleting VC:', error);
    }
  }

  private async cleanupInactiveVCs(): Promise<void> {
    try {
      const inactiveVCs = await this.database.getInactiveVCs(5);
      
      for (const vcInfo of inactiveVCs) {
        const channel = this.client.channels.cache.get(vcInfo.channel_id);
        if (!channel || !channel.isVoiceBased()) {
          // チャンネルが存在しない場合はDBから削除
          await this.database.removeSecretVC(vcInfo.channel_id);
          continue;
        }

        // チャンネルに誰もいない場合は削除
        const members = channel.members.filter(member => !member.user.bot);
        if (members.size === 0) {
          console.log(`[VC CLEANUP] Deleting inactive VC: ${channel.name}`);
          
          await this.database.removeSecretVC(vcInfo.channel_id);
          await channel.delete('5分間非アクティブのため自動削除');
        }
      }
    } catch (error) {
      console.error('Error in VC cleanup:', error);
    }
  }

  public destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }
}