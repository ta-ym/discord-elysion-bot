declare global {
  namespace NodeJS {
    interface ProcessEnv {
      DISCORD_TOKEN: string;
      DISCORD_CLIENT_ID: string;
      DISCORD_GUILD_ID?: string;
      NODE_ENV: 'development' | 'production';
      DATABASE_URL?: string;
      SYSTEM_LOG_CHANNEL_ID?: string;
      RAILWAY_TOKEN?: string;
      RAILWAY_PROJECT_ID?: string;
      RAILWAY_SERVICE_ID?: string;
      DISABLE_POSTGRESQL?: string;
    }
  }
}

export {};