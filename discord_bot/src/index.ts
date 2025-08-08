// discord-bot/src/index.ts
import { Client, GatewayIntentBits, Collection } from 'discord.js';
import { VoiceConnectionStatus, entersState } from '@discordjs/voice';
import { RecordingService } from './services/RecordingService';
import { APIService } from './services/APIService';
import { CommandHandler } from './handlers/CommandHandler';
import dotenv from 'dotenv';
import logger from './utils/logger'

dotenv.config();

export interface ExtendedClient extends Client {
  commands: Collection<string, any>;
  recordingService: RecordingService;
  apiService: APIService;
}

class DiscordBot {
  private client: ExtendedClient;
  private recordingService: RecordingService;
  private apiService: APIService;
  private commandHandler: CommandHandler;

  constructor() {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
      ]
    }) as ExtendedClient;

    this.apiService = new APIService(process.env.API_BASE_URL!);
    this.recordingService = new RecordingService(this.apiService);
    this.commandHandler = new CommandHandler(this.recordingService, this.apiService);

    this.client.commands = new Collection();
    this.client.recordingService = this.recordingService;
    this.client.apiService = this.apiService;

    this.setupEvents();
  }

  private setupEvents() {
    this.client.once('ready', () => {
      logger.info(`Bot is ready! Logged in as ${this.client.user?.tag}`);
      this.registerCommands();
      this.checkPendingMeetings();
    });

    this.client.on('interactionCreate', async (interaction) => {
      if (!interaction.isChatInputCommand()) return;
      await this.commandHandler.handleCommand(interaction);
    });

    this.client.on('voiceStateUpdate', (oldState, newState) => {
      this.recordingService.handleVoiceStateUpdate(oldState, newState);
    });
  }

  private async registerCommands() {
    const commands = [
      {
        name: 'iniciar',
        description: 'Inicia a gravação da reunião',
        options: [
          {
            name: 'canal',
            description: 'Nome do canal de voz (opcional)',
            type: 3, // STRING
            required: false
          }
        ]
      },
      {
        name: 'status',
        description: 'Mostra o status da gravação atual'
      },
      {
        name: 'parar',
        description: 'Para a gravação atual'
      },
      {
        name: 'verificar',
        description: 'Verifica e reprocessa reuniões pendentes'
      }
    ];

    try {
      await this.client.application?.commands.set(commands);
      logger.info('Comandos registrados com sucesso!');
    } catch (error) {
      logger.error('Erro ao registrar comandos:', error);
    }
  }

  private async checkPendingMeetings() {
    try {
      await this.apiService.checkPendingMeetings();
      logger.info('Verificação de reuniões pendentes concluída');
    } catch (error) {
      logger.error('Erro ao verificar reuniões pendentes:', error);
    }
  }

  public start() {
    this.client.login(process.env.DISCORD_TOKEN);
  }

}

// Instanciar e iniciar o bot
const bot = new DiscordBot();
bot.start();