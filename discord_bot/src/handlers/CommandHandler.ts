// discord-bot/src/handlers/CommandHandler.ts
import { ChatInputCommandInteraction, VoiceChannel } from 'discord.js';
import { RecordingService } from '../services/RecordingService';
import { APIService } from '../services/APIService';
import logger from '../utils/logger'

export class CommandHandler {
    constructor(
        private recordingService: RecordingService,
        private apiService: APIService
    ) { }

    async handleCommand(interaction: ChatInputCommandInteraction) {
        const { commandName, guildId } = interaction;

        try {
            switch (commandName) {
                case 'iniciar':
                    await this.handleStart(interaction);
                    break;
                case 'status':
                    await this.handleStatus(interaction);
                    break;
                case 'parar':
                    await this.handleStop(interaction);
                    break;
                case 'verificar':
                    await this.handleCheck(interaction);
                    break;
                default:
                    await interaction.reply({ content: 'Comando não reconhecido!', ephemeral: true });
            }
        } catch (error) {
            logger.error(`Erro no comando ${commandName}:`, error);

            const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';

            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ content: `Erro: ${errorMessage}`, ephemeral: true });
            } else {
                await interaction.reply({ content: `Erro: ${errorMessage}`, ephemeral: true });
            }
        }
    }

    private async handleStart(interaction: ChatInputCommandInteraction) {
        await interaction.deferReply();

        const guildId = interaction.guildId!;
        const channelName = interaction.options.getString('canal');

        // Verificar se já há gravação ativa
        if (this.recordingService.hasActiveRecording(guildId)) {
            await interaction.editReply('❌ Já existe uma gravação ativa neste servidor!');
            return;
        }

        let targetChannel: VoiceChannel;

        if (channelName) {
            // Buscar canal por nome
            const channel = interaction.guild?.channels.cache
                .find(ch => ch.name === channelName && ch.isVoiceBased()) as VoiceChannel;

            if (!channel) {
                await interaction.editReply(`❌ Canal de voz "${channelName}" não encontrado!`);
                return;
            }
            targetChannel = channel;
        } else {
            // Usar canal atual do usuário
            const member = interaction.member as any;
            const voiceChannel = member?.voice?.channel;

            if (!voiceChannel) {
                await interaction.editReply('❌ Você precisa estar em um canal de voz ou especificar um canal!');
                return;
            }
            targetChannel = voiceChannel;
        }

        try {
            const meetingId = await this.recordingService.startRecording(targetChannel);

            await interaction.editReply(
                `✅ **Gravação iniciada!**\n` +
                `📍 Canal: ${targetChannel.name}\n` +
                `🆔 ID da Reunião: \`${meetingId}\`\n` +
                `👥 Participantes: ${targetChannel.members.filter(m => !m.user.bot).size}`
            );
        } catch (error) {
            throw error;
        }
    }

    private async handleStatus(interaction: ChatInputCommandInteraction) {
        const guildId = interaction.guildId!;
        const recording = this.recordingService.getActiveRecording(guildId);

        if (!recording) {
            await interaction.reply({ content: '❌ Nenhuma gravação ativa neste servidor.', ephemeral: true });
            return;
        }

        const duration = Math.floor((Date.now() - recording.startTime.getTime()) / 1000);
        const participants = Array.from(recording.participants.values())
            .map(p => p.username)
            .join(', ');

        await interaction.reply({
            content:
                `📊 **Status da Gravação**\n` +
                `📍 Canal: ${recording.channelName}\n` +
                `⏱️ Duração: ${this.formatDuration(duration)}\n` +
                `🆔 ID: \`${recording.meetingId}\`\n` +
                `👥 Participantes: ${participants || 'Nenhum'}`,
            ephemeral: true
        });
    }

    private async handleStop(interaction: ChatInputCommandInteraction) {
        await interaction.deferReply();

        const guildId = interaction.guildId!;

        if (!this.recordingService.hasActiveRecording(guildId)) {
            await interaction.editReply('❌ Nenhuma gravação ativa para parar.');
            return;
        }

        try {
            await this.recordingService.stopRecording(guildId);
            await interaction.editReply('✅ **Gravação finalizada!** Os arquivos estão sendo processados...');
        } catch (error) {
            throw error;
        }
    }

    private async handleCheck(interaction: ChatInputCommandInteraction) {
        await interaction.deferReply({ ephemeral: true });

        try {
            await this.apiService.checkPendingMeetings();
            await interaction.editReply('✅ Verificação de reuniões pendentes concluída!');
        } catch (error) {
            throw error;
        }
    }

    private formatDuration(seconds: number): string {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }
}