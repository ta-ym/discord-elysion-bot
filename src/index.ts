import { Client, GatewayIntentBits, Collection, Events } from 'discord.js';
import { Command, Event } from './types';
import { Database } from './database';
import { TempVCManager } from './utils/tempVCManagerClass';
import { initializeTempVCPanel } from './utils/tempVCManager';
import { initializeCurrencyLogger } from './utils/currencyLogger';
import { initializeVoiceTimeTracker } from './utils/voiceTimeTracker';

import * as dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// 環境変数を読み込み
dotenv.config();

class ElysionBot {
  public client: Client;
  public commands: Collection<string, Command>;
  public database: Database;
  public tempVCManager?: TempVCManager;

  constructor() {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildVoiceStates,
      ],
    });

    this.commands = new Collection();
    this.database = new Database();
    this.loadCommands();
    this.loadEvents();
  }

  private async loadCommands(): Promise<void> {
    const commandsPath = path.join(__dirname, 'commands');
    
    // commandsディレクトリが存在しない場合は作成
    if (!fs.existsSync(commandsPath)) {
      fs.mkdirSync(commandsPath, { recursive: true });
      console.log('Commands directory created');
      return;
    }

    const commandFiles = fs
      .readdirSync(commandsPath)
      .filter(file => file.endsWith('.js') || file.endsWith('.ts'));

    for (const file of commandFiles) {
      const filePath = path.join(commandsPath, file);
      const command = await import(filePath);
      
      if ('data' in command.default && 'execute' in command.default) {
        this.commands.set(command.default.data.name, command.default);
        console.log(`[INFO] Command loaded: ${command.default.data.name}`);
      } else {
        console.log(
          `[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`
        );
      }
    }
  }

  private async loadEvents(): Promise<void> {
    const eventsPath = path.join(__dirname, 'events');
    
    // eventsディレクトリが存在しない場合は作成
    if (!fs.existsSync(eventsPath)) {
      fs.mkdirSync(eventsPath, { recursive: true });
      console.log('Events directory created');
      return;
    }

    const eventFiles = fs
      .readdirSync(eventsPath)
      .filter(file => file.endsWith('.js') || file.endsWith('.ts'));

    for (const file of eventFiles) {
      const filePath = path.join(eventsPath, file);
      const event: Event = await import(filePath);
      
      if (event.once) {
        this.client.once(event.name, (...args) => event.execute(...args));
      } else {
        this.client.on(event.name, (...args) => event.execute(...args));
      }
      
      console.log(`[INFO] Event loaded: ${event.name} from ${file}`);
    }
  }

  public async start(): Promise<void> {
    try {
      if (!process.env['DISCORD_TOKEN']) {
        throw new Error('DISCORD_TOKEN is not defined in environment variables');
      }

      // ボットログイン
      await this.client.login(process.env['DISCORD_TOKEN']);
      
      // Ready イベントで通貨ロガー初期化
      this.client.once(Events.ClientReady, async () => {
        console.log('Bot is ready!');
        
        // 一時VC管理システムを初期化
        this.tempVCManager = new TempVCManager(this.client);
        console.log('TempVC manager initialized');
        
        // 一時VCパネルを初期化
        await initializeTempVCPanel(this.client);
        console.log('Temp VC panel initialized');
        
        // 通貨ロガーを初期化
        initializeCurrencyLogger(this.client);
        console.log('Currency logger initialized');
        
        // 通話時間追跡システムを初期化
        initializeVoiceTimeTracker(this.client, this.database);
        console.log('Voice time tracker initialized');
      });

      console.log('Bot started successfully!');
    } catch (error) {
      console.error('Error starting bot:', error);
      process.exit(1);
    }
  }
}

// ボットを初期化して開始
const bot = new ElysionBot();

// グレースフルシャットダウン
process.on('SIGINT', () => {
  console.log('Bot is shutting down...');
  bot.client.destroy();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('Bot is shutting down...');
  bot.client.destroy();
  process.exit(0);
});

// インタラクション処理
bot.client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const command = bot.commands.get(interaction.commandName);

  if (!command) {
    console.error(`No command matching ${interaction.commandName} was found.`);
    return;
  }

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error('Error executing command:', error);
    
    const errorMessage = { content: 'There was an error while executing this command!', ephemeral: true };
    
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(errorMessage);
    } else {
      await interaction.reply(errorMessage);
    }
  }
});

bot.start();