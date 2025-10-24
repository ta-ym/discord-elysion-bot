import { Client, GatewayIntentBits, Collection, Events } from 'discord.js';
import { Command, Event } from './types';
import { Database } from './database';
import { VCManager } from './vcManager';
import * as dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// 環境変数を読み込み
dotenv.config();

class ElysionBot {
  public client: Client;
  public commands: Collection<string, Command>;
  public database: Database;
  public vcManager: VCManager;

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
    this.vcManager = new VCManager(this.client, this.database);
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
      
      console.log(`[INFO] Event loaded: ${event.name}`);
    }
  }

  public async start(): Promise<void> {
    try {
      if (!process.env.DISCORD_TOKEN) {
        throw new Error('DISCORD_TOKEN is not defined in environment variables');
      }

      await this.client.login(process.env.DISCORD_TOKEN);
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