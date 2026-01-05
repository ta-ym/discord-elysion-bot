import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { railwayLogger } from '../utils/railwayLogger';
import { hasAdminPermission, getAdminPermissionErrorMessage } from '../utils/permissions';

module.exports = {
    data: new SlashCommandBuilder()
        .setName('railway-logs')
        .setDescription('【管理者専用】Railway ログ管理')
        .addSubcommand(subcommand =>
            subcommand
                .setName('status')
                .setDescription('Railway ログ機能の状態を確認'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('start')
                .setDescription('Railway ログのポーリングを開始')
                .addIntegerOption(option =>
                    option
                        .setName('interval')
                        .setDescription('ポーリング間隔（秒）')
                        .setRequired(false)
                        .setMinValue(10)
                        .setMaxValue(300)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('stop')
                .setDescription('Railway ログのポーリングを停止'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('fetch')
                .setDescription('最新のRailway ログを手動取得')
                .addIntegerOption(option =>
                    option
                        .setName('limit')
                        .setDescription('取得するログ数')
                        .setRequired(false)
                        .setMinValue(1)
                        .setMaxValue(50)))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction: ChatInputCommandInteraction) {
        // 権限チェック（特定ユーザーのみ）
        if (!hasAdminPermission(interaction.user.id)) {
            await interaction.reply({
                content: getAdminPermissionErrorMessage(),
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        try {
            const subcommand = interaction.options.getSubcommand();

            switch (subcommand) {
                case 'status': {
                    const status = railwayLogger.getStatus();
                    const statusMessage = `**Railway Logger Status**
                    
🔧 **設定状況**: ${status.isConfigured ? '✅ 完了' : '❌ 未完了'}
🔄 **ポーリング状況**: ${status.isPolling ? '✅ 実行中' : '❌ 停止中'}
🤖 **Discord連携**: ${status.hasClient ? '✅ 接続済み' : '❌ 未接続'}
📢 **ログチャンネル**: ${status.channelId || '未設定'}
📊 **処理済みログ数**: ${status.seenLogsCount}

${!status.isConfigured ? '⚠️ Railway API設定が必要です (.envファイルを確認してください)' : ''}`;

                    await interaction.reply({
                        content: statusMessage,
                        flags: MessageFlags.Ephemeral
                    });
                    break;
                }

                case 'start': {
                    const status = railwayLogger.getStatus();
                    
                    if (!status.isConfigured) {
                        await interaction.reply({
                            content: '❌ Railway API設定が完了していません。\n.envファイルでRAILWAY_TOKEN、RAILWAY_PROJECT_ID、RAILWAY_SERVICE_IDを設定してください。',
                            flags: MessageFlags.Ephemeral
                        });
                        return;
                    }

                    if (status.isPolling) {
                        await interaction.reply({
                            content: '⚠️ Railway ログポーリングは既に実行中です。',
                            flags: MessageFlags.Ephemeral
                        });
                        return;
                    }

                    const interval = interaction.options.getInteger('interval') || 30;
                    railwayLogger.startPolling(interval * 1000);

                    await interaction.reply({
                        content: `✅ Railway ログポーリングを開始しました。\n📡 間隔: ${interval}秒`,
                        flags: MessageFlags.Ephemeral
                    });
                    break;
                }

                case 'stop': {
                    const status = railwayLogger.getStatus();
                    
                    if (!status.isPolling) {
                        await interaction.reply({
                            content: '⚠️ Railway ログポーリングは停止中です。',
                            flags: MessageFlags.Ephemeral
                        });
                        return;
                    }

                    railwayLogger.stopPolling();

                    await interaction.reply({
                        content: '✅ Railway ログポーリングを停止しました。',
                        flags: MessageFlags.Ephemeral
                    });
                    break;
                }

                case 'fetch': {
                    const status = railwayLogger.getStatus();
                    
                    if (!status.isConfigured) {
                        await interaction.reply({
                            content: '❌ Railway API設定が完了していません。',
                            flags: MessageFlags.Ephemeral
                        });
                        return;
                    }

                    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

                    const limit = interaction.options.getInteger('limit') || 10;
                    
                    try {
                        await railwayLogger.fetchAndSendLogs(limit);
                        await interaction.editReply({
                            content: `✅ 最新 ${limit} 件のRailway ログを取得・送信しました。`
                        });
                    } catch (error) {
                        console.error('[RAILWAY LOGS COMMAND] Error:', error);
                        await interaction.editReply({
                            content: '❌ Railway ログの取得に失敗しました。設定を確認してください。'
                        });
                    }
                    break;
                }

                default:
                    await interaction.reply({
                        content: '❌ 不明なサブコマンドです。',
                        flags: MessageFlags.Ephemeral
                    });
            }
        } catch (error) {
            console.error('[RAILWAY LOGS COMMAND] Error:', error);
            
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: '❌ コマンドの実行中にエラーが発生しました。',
                    flags: MessageFlags.Ephemeral
                });
            }
        }
    }
};