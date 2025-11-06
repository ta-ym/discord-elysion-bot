import { REST, Routes } from 'discord.js';
import * as dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

const commands: any[] = [];

// コマンドディレクトリからコマンドを読み込み
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command = require(filePath);
  
  // module.exportsの場合とdefault exportの場合に対応
  const commandModule = command.default || command;
  
  if (commandModule && 'data' in commandModule && 'execute' in commandModule) {
    commands.push(commandModule.data.toJSON());
    console.log(`[INFO] Loaded command: ${commandModule.data.name}`);
  } else {
    console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
  }
}

// Discord APIにコマンドを登録
const rest = new REST().setToken(process.env['DISCORD_TOKEN']!);

(async () => {
  try {
    console.log(`Started refreshing ${commands.length} application (/) commands.`);

    const data = await rest.put(
      Routes.applicationGuildCommands(process.env['DISCORD_CLIENT_ID']!, process.env['DISCORD_GUILD_ID']!),
      { body: commands },
    );

    console.log(`Successfully reloaded ${(data as any[]).length} application (/) commands.`);
  } catch (error) {
    console.error(error);
  }
})();