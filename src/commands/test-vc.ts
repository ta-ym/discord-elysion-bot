import { SlashCommandBuilder, ChatInputCommandInteraction, GuildMember } from 'discord.js';
import { Command } from '../types';
import { hasSalaryPermission, getSalaryPermissionErrorMessage } from '../utils/permissions';
import { startVCCreation } from '../utils/secretVCManager';

const testVcCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('test-vc')
    .setDescription('シークレットVC作成のテスト（管理者専用）'),

  async execute(interaction: ChatInputCommandInteraction) {
    const member = interaction.member as GuildMember;
    
    // 権限チェック（管理者のみ）
    if (!hasSalaryPermission(member)) {
      await interaction.reply({
        content: getSalaryPermissionErrorMessage(),
        ephemeral: true
      });
      return;
    }

    try {
      console.log(`[TEST] test-vc command executed by ${interaction.user.tag}`);
      
      // ボタンインタラクションをシミュレートするため、defer して followUp で回答
      await interaction.deferReply({ ephemeral: true });
      
      // 手動でstartVCCreation関数をテスト
      console.log(`[TEST] Testing startVCCreation function...`);
      
      // ButtonInteractionのような動作をシミュレート
      const mockButtonInteraction = {
        ...interaction,
        isButton: () => true,
        customId: 'create_secret_vc',
        replied: false,
        deferred: false,
        reply: async (options: any) => {
          console.log(`[TEST] Mock reply called with:`, options);
          return await interaction.followUp(options);
        }
      } as any;

      await startVCCreation(mockButtonInteraction);
      
    } catch (error) {
      console.error('Test VC command error:', error);
      await interaction.followUp({
        content: '❌ テスト中にエラーが発生しました。',
        ephemeral: true
      });
    }
  },
};

export default testVcCommand;