import { SlashCommandBuilder, SlashCommandOptionsOnlyBuilder, SlashCommandSubcommandsOnlyBuilder } from 'discord.js';
import { ChatInputCommandInteraction, ClientEvents } from 'discord.js';

export interface Command {
  data: SlashCommandBuilder | SlashCommandOptionsOnlyBuilder | SlashCommandSubcommandsOnlyBuilder;
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

export interface SalaryDetail {
  id: number;
  user_id: string;
  role_id: string;
  amount: number;
  claim_month: string;
  paid_by: string;
  description: string;
  created_at: string;
}

export interface BulkSalaryResult {
  id: number;
  user_id: string;
  status: 'success' | 'skipped' | 'error';
  amount?: number;
  reason?: string;
  processed_by: string;
  created_at: string;
}