import { Events, Client } from 'discord.js';
import { Event } from '../types';

const readyEvent: Event = {
  name: Events.ClientReady,
  once: true,
  execute(client: Client) {
    console.log(`✅ Ready! Logged in as ${client.user?.tag}`);
    console.log(`🤖 Bot is online and ready to serve!`);
  },
};

export = readyEvent;