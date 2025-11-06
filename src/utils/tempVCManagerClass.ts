import { Client } from 'discord.js';
import { cleanupExpiredTempVCs } from './tempVCManager';

export class TempVCManager {
  private client: Client;
  private cleanupInterval: NodeJS.Timeout;

  constructor(client: Client) {
    this.client = client;
    
    // 5分ごとに期限切れの一時VCをチェック
    this.cleanupInterval = setInterval(() => {
      this.performCleanup();
    }, 5 * 60 * 1000); // 5分

    console.log('TempVCManager initialized - checking for expired VCs every 5 minutes');
  }

  private async performCleanup(): Promise<void> {
    try {
      await cleanupExpiredTempVCs(this.client);
    } catch (error) {
      console.error('Error in TempVC cleanup:', error);
    }
  }

  public destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      console.log('TempVCManager destroyed');
    }
  }
}