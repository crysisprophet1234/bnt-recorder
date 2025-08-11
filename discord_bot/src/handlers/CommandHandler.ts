// discord-bot/src/handlers/CommandHandler.ts
import {
    ChatInputCommandInteraction,
    VoiceChannel,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ButtonInteraction,
    Client
} from 'discord.js';
import { RecordingService } from '../services/RecordingService';
import { APIService } from '../services/APIService';
import logger from '../utils/logger';

// URL de exemplo para o dashboard. Substitua por sua URL real.
const DASHBOARD_URL = 'https://localhost.com:3003';

export class CommandHandler {
    private updateIntervals: Map<string, NodeJS.Timeout> = new Map();

    constructor(
        private recordingService: RecordingService,
        private apiService: APIService,
        private client: Client
    ) { }

    async handleCommand(interaction: ChatInputCommandInteraction) {
        const { commandName } = interaction;

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

    async handleButton(interaction: ButtonInteraction) {
        try {
            if (interaction.customId === 'stop_recording') {
                await this.handleStop(interaction);
            } else {
                await interaction.reply({ content: 'Botão não reconhecido!', ephemeral: true });
            }
        } catch (error) {
            logger.error(`Erro no botão ${interaction.customId}:`, error);
            const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: `Erro: ${errorMessage}`, ephemeral: true });
            } else {
                await interaction.followUp({ content: `Erro: ${errorMessage}`, ephemeral: true });
            }
        }
    }

    private async handleStart(interaction: ChatInputCommandInteraction) {
        await interaction.deferReply();

        const guildId = interaction.guildId!;
        const channelName = interaction.options.getString('canal');

        if (this.recordingService.hasActiveRecording(guildId)) {
            const embed = new EmbedBuilder()
                .setColor('Red')
                .setTitle('❌ Já existe uma gravação ativa neste servidor!');
            await interaction.editReply({ embeds: [embed] });
            return;
        }

        let targetChannel: VoiceChannel;
        if (channelName) {
            const channel = interaction.guild?.channels.cache
                .find(ch => ch.name === channelName && ch.isVoiceBased()) as VoiceChannel;
            if (!channel) {
                const embed = new EmbedBuilder()
                    .setColor('Red')
                    .setTitle(`❌ Canal de voz "${channelName}" não encontrado!`);
                await interaction.editReply({ embeds: [embed] });
                return;
            }
            targetChannel = channel;
        } else {
            const member = interaction.member as any;
            const voiceChannel = member?.voice?.channel;
            if (!voiceChannel) {
                const embed = new EmbedBuilder()
                    .setColor('Red')
                    .setTitle('❌ Você precisa estar em um canal de voz ou especificar um canal!');
                await interaction.editReply({ embeds: [embed] });
                return;
            }
            targetChannel = voiceChannel;
        }

        try {
            // Mostrar status de carregamento
            const loadingEmbed = new EmbedBuilder()
                .setColor('Yellow')
                .setTitle('🔄 Conectando ao canal de voz...')
                .setDescription('Por favor, aguarde enquanto estabelecemos a conexão.');
            
            await interaction.editReply({ embeds: [loadingEmbed] });

            const meetingId = await this.recordingService.startRecording(targetChannel);
            const recording = this.recordingService.getActiveRecording(guildId);
            if (!recording) {
                throw new Error('Gravação não foi iniciada corretamente.');
            }

            const stopButton = new ButtonBuilder()
                .setCustomId('stop_recording')
                .setLabel('Parar Gravação')
                .setStyle(ButtonStyle.Danger);
            const row = new ActionRowBuilder<ButtonBuilder>().addComponents(stopButton);

            const initialEmbed = new EmbedBuilder()
                .setColor('Green')
                .setTitle('🎙️ Gravação Iniciada!')
                .setDescription(
                    `**Canal:** <#${targetChannel.id}>\n` +
                    `**Duração:** \`00:00\`\n` +
                    `**Reunião ID:** \`${meetingId}\`\n\n` +
                    `**Participantes:**\n- Carregando...`
                )
                .setTimestamp();

            const replyMessage = await interaction.editReply({ embeds: [initialEmbed], components: [row] });
            
            const updateInterval = setInterval(async () => {
                try {
                    const updatedRecording = this.recordingService.getActiveRecording(guildId);
                    if (!updatedRecording) {
                        clearInterval(updateInterval);
                        this.updateIntervals.delete(guildId);
                        return;
                    }

                    const duration = Math.floor((Date.now() - updatedRecording.startTime.getTime()) / 1000);
                    
                    // Buscar participantes atuais do canal
                    const currentChannel = await interaction.guild?.channels.fetch(targetChannel.id) as VoiceChannel;
                    if (!currentChannel) return;

                    const participantsList = currentChannel.members
                        .filter(m => !m.user.bot)
                        .map(member => `- <@${member.id}>`)
                        .join('\n');
                    const participantsDescription = participantsList ? `\n**Participantes:**\n${participantsList}` : '\n**Participantes:**\n- Nenhum';
                    
                    const updatedEmbed = new EmbedBuilder()
                        .setColor('Blue')
                        .setTitle('🎙️ Gravação Ativa')
                        .setDescription(
                            `**Canal:** <#${targetChannel.id}>\n` +
                            `**Duração:** \`${this.formatDuration(duration)}\`\n` +
                            `**Reunião ID:** \`${meetingId}\`` +
                            participantsDescription
                        )
                        .setTimestamp();
                    
                    await replyMessage.edit({ embeds: [updatedEmbed], components: [row] }).catch(() => {
                        // Se falhar ao editar, limpar o intervalo
                        clearInterval(updateInterval);
                        this.updateIntervals.delete(guildId);
                    });
                } catch (error) {
                    logger.error("Erro ao atualizar embed:", error);
                }
            }, 3000); // Aumentar intervalo para 3 segundos para reduzir carga

            this.updateIntervals.set(guildId, updateInterval);

        } catch (error) {
            logger.error('Erro ao iniciar gravação:', error);
            throw error;
        }
    }

    private async handleStop(interaction: ChatInputCommandInteraction | ButtonInteraction) {
        const guildId = interaction.guildId!;

        // Defer a interação imediatamente.
        if (interaction.isButton()) {
            await interaction.deferUpdate();
        } else {
            await interaction.deferReply();
        }

        const recording = this.recordingService.getActiveRecording(guildId);

        if (!recording) {
            const embed = new EmbedBuilder()
                .setColor('Red')
                .setTitle('❌ Nenhuma gravação ativa para parar.');
            
            // Sempre edita a mensagem para informar que não há gravação, removendo os botões.
            await interaction.editReply({ embeds: [embed], components: [] });
            return;
        }

        // Mostrar status de processamento IMEDIATAMENTE após o deferimento
        // para que o Discord saiba que a requisição está sendo processada.
        const processingEmbed = new EmbedBuilder()
            .setColor('Yellow')
            .setTitle('🔄 Finalizando gravação...')
            .setDescription('Por favor, aguarde enquanto processamos o áudio e finalizamos a gravação.');

        await interaction.editReply({ embeds: [processingEmbed], components: [] });

        // Salvar dados antes de parar a gravação
        const oldRecording = { ...recording };
        const startTime = recording.startTime.getTime();

        try {
            await this.recordingService.stopRecording(guildId);

            // Limpar intervalo de atualização
            const intervalId = this.updateIntervals.get(guildId);
            if (intervalId) {
                clearInterval(intervalId);
                this.updateIntervals.delete(guildId);
            }

            const duration = Math.floor((Date.now() - startTime) / 1000);
            const participantsList = Array.from(oldRecording.participants.values())
                .map(p => `- <@${p.userId}>`)
                .join('\n');
            const participantsDescription = participantsList ? `\n\n**Participantes:**\n${participantsList}` : '\n\n**Participantes:**\n- Nenhum';

            const dashboardLink = `${DASHBOARD_URL}?meetingId=${oldRecording.meetingId}`;
            const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder()
                    .setLabel('Abrir Dashboard')
                    .setStyle(ButtonStyle.Link)
                    .setURL(dashboardLink)
            );

            const finalEmbed = new EmbedBuilder()
                .setColor('Green')
                .setTitle('✅ Gravação Finalizada!')
                .setDescription(
                    `**Canal:** ${oldRecording.channelName}\n` +
                    `**Duração:** \`${this.formatDuration(duration)}\`\n` +
                    `**Reunião ID:** \`${oldRecording.meetingId}\`` +
                    participantsDescription
                )
                .setTimestamp();

            await interaction.editReply({ embeds: [finalEmbed], components: [row] });

        } catch (error) {
            logger.error('Erro ao parar gravação:', error);
            
            const errorEmbed = new EmbedBuilder()
                .setColor('Red')
                .setTitle('❌ Erro ao finalizar gravação')
                .setDescription(`Ocorreu um erro: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);

            // Garante que a mensagem de erro também edita a resposta
            // para que a interação não falhe.
            await interaction.editReply({ embeds: [errorEmbed], components: [] });
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
        
        const participantsList = Array.from(recording.participants.values())
            .map(p => `- <@${p.userId}>`)
            .join('\n');
        
        const participantsDescription = participantsList ? `\n**Participantes:**\n${participantsList}` : '\n**Participantes:**\n- Nenhum';

        const embed = new EmbedBuilder()
            .setColor('Blue')
            .setTitle('📊 Status da Gravação')
            .setDescription(
                `**Canal:** ${recording.channelName}\n` +
                `**Duração:** ${this.formatDuration(duration)}\n` +
                `**Reunião ID:** \`${recording.meetingId}\`` +
                participantsDescription
            )
            .setTimestamp();

        await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    private async handleCheck(interaction: ChatInputCommandInteraction) {
        await interaction.deferReply({ ephemeral: true });
        try {
            await this.apiService.checkPendingMeetings();
            const embed = new EmbedBuilder()
                .setColor('Aqua')
                .setTitle('✅ Verificação de reuniões pendentes concluída!');
            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            throw error;
        }
    }

    private formatDuration(seconds: number): string {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
}