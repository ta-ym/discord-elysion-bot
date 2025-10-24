import { SlashCommandBuilder, SlashCommandOptionsOnlyBuilder } from 'discord.js';
import { ChatInputCommandInteraction, ClientEvents } from 'discord.js';

export interface Command {
  data: SlashCommandBuilder | SlashCommandOptionsOnlyBuilder;
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
}

export interface Event {
  name: keyof ClientEvents;
  once?: boolean;
  execute: (...args: any[]) => void;
}

export interface BotConfig {
  token: string;
  clientId: string;
  guildId?: string;
}