import { Events, VoiceState } from 'discord.js';
import { Event } from '../types';
import { ProfileSearcher } from '../utils/profileSearcher';
import { getSpecialVCTracker } from '../utils/specialVCTracker';
import { getCloneVCManager } from '../utils/cloneVCManager';
import { globalDatabase } from '../index';

// MusicBotのユーザーID
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
];

const voiceStateUpdateEvent: Event = {
  name: Events.VoiceStateUpdate,
  execute: async (oldState: VoiceState, newState: VoiceState) => {
    try {
      const database = globalDatabase;
      const profileSearcher = new ProfileSearcher(newState.client);
      const specialVCTracker = getSpecialVCTracker();
      const cloneVCManager = getCloneVCManager();
      
      // チャンネルが一時VCかどうかをチェック
      const checkTempVC = async (channelId: string | null) => {
        if (!channelId) return null;
        return await database.getTempVC(channelId);
      };

      // 古いチャンネルと新しいチャンネルをチェック
      const oldTempVC = await checkTempVC(oldState.channelId);
      const newTempVC = await checkTempVC(newState.channelId);

      // MusicBotかどうかをチェック
      const isMusicBot = MUSIC_BOT_IDS.includes(newState.member?.user.id || '');
      // Botかどうかをチェック（プロフィール投稿の対象外）
      const isBot = newState.member?.user.bot || false;

      // 特別VC追跡処理（Bot以外）
      if (specialVCTracker && !isBot) {
        // VC参加の場合
        if (newState.channel && !oldState.channel) {
          await specialVCTracker.handleVoiceJoin(newState);
        }
        // VC退出の場合
        else if (!newState.channel && oldState.channel) {
          await specialVCTracker.handleVoiceLeave(oldState);
        }
        // VC移動の場合
        else if (newState.channel && oldState.channel && newState.channelId !== oldState.channelId) {
          await specialVCTracker.handleVoiceMove(oldState, newState);
        }
      }

      // 複製VC処理（Bot以外）
      if (cloneVCManager && !isBot) {
        // 複製用VCに参加した場合
        if (newState.channel && !oldState.channel) {
          await cloneVCManager.handleCloneVCJoin(newState);
        }
        // 作成されたVCから退出した場合
        else if (!newState.channel && oldState.channel) {
          await cloneVCManager.handleCreatedVCLeave(oldState);
        }
        // 作成されたVCに参加した場合
        else if (newState.channel && !oldState.channel) {
          await cloneVCManager.handleCreatedVCJoin(newState);
        }
      }

      // 新しいチャンネルに参加した場合
      if (newState.channel && newState.member) {
        console.log(`[VOICE] User ${newState.member.user.tag} joined VC: ${newState.channel.name}`);
        
        // Botでない場合、プロフィールを投稿
        if (!isBot) {
          await profileSearcher.postProfileToVC(newState.channel, newState.member.user.id);
        }

        // 一時VCの場合の処理
        if (newTempVC) {
          console.log(`[TEMP VC] User ${newState.member.user.tag} joined temp VC: ${newState.channel.name}`);
          
          if (isMusicBot) {
            console.log(`[TEMP VC] MusicBot detected! Adjusting user limit to 3`);
            try {
              await newState.channel.setUserLimit(3);
              console.log(`[TEMP VC] User limit set to 3 for ${newState.channel.name}`);
            } catch (error) {
              console.error(`[TEMP VC] Failed to update user limit:`, error);
            }
          }
        }
      }

      // 古いチャンネルから退出した場合
      if (oldTempVC && oldState.channel) {
        console.log(`[TEMP VC] User ${oldState.member?.user.tag} left temp VC: ${oldState.channel.name}`);
        
        if (isMusicBot) {
          console.log(`[TEMP VC] MusicBot left! Checking if user limit should be reset`);
          
          // チャンネルにMusicBotが残っているかチェック
          const members = oldState.channel.members;
          const remainingMusicBots = members.filter(member => 
            MUSIC_BOT_IDS.includes(member.user.id)
          );

          if (remainingMusicBots.size === 0) {
            console.log(`[TEMP VC] No MusicBots remaining, resetting user limit to 2`);
            try {
              await oldState.channel.setUserLimit(2);
              console.log(`[TEMP VC] User limit reset to 2 for ${oldState.channel.name}`);
            } catch (error) {
              console.error(`[TEMP VC] Failed to reset user limit:`, error);
            }
          }
        }
      }

    } catch (error) {
      console.error('[VOICE] Error in voiceStateUpdate event:', error);
    }
  },
};

export = voiceStateUpdateEvent;