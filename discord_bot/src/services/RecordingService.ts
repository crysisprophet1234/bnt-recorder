// discord-bot/src/services/RecordingService.ts
import {
  VoiceConnection,
  joinVoiceChannel,
  VoiceConnectionStatus,
  EndBehaviorType,
  VoiceReceiver,
  entersState
} from '@discordjs/voice';
import { VoiceState, VoiceChannel } from 'discord.js';
import { createWriteStream, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import * as prism from 'prism-media';
import { APIService } from './APIService';
import { AudioProcessor } from '../utils/AudioProcessor';
import logger from '../utils/logger';

interface ActiveRecording {
  meetingId: string;
  guildId: string;
  channelId: string;
  channelName: string;
  connection: VoiceConnection;
  receiver: VoiceReceiver;
  participants: Map<string, ParticipantRecording>;
  startTime: Date;
}

interface ParticipantRecording {
  userId: string;
  username: string;
  streams: NodeJS.WritableStream[];
  joinedAt: Date;
  leftAt?: Date;
}

export class RecordingService {
  private recordings = new Map<string, ActiveRecording>();
  private audioProcessor: AudioProcessor;

  constructor(private apiService: APIService) {
    this.audioProcessor = new AudioProcessor();
  }

  async startRecording(channel: VoiceChannel): Promise<string> {
    const guildId = channel.guildId;

    if (this.recordings.has(guildId)) {
      throw new Error('Já existe uma gravação ativa neste servidor');
    }

    try {
      // Criar reunião na API
      const meeting = await this.apiService.createMeeting({
        guildId,
        channelId: channel.id,
        channelName: channel.name
      });

      // Conectar ao canal de voz
      const connection = joinVoiceChannel({
        channelId: channel.id,
        guildId: channel.guildId,
        adapterCreator: channel.guild.voiceAdapterCreator,
        selfDeaf: false,
        selfMute: true
      });

      // Aguardar conexão
      await this.waitForConnection(connection);

      const receiver = connection.receiver;
      const participants = new Map<string, ParticipantRecording>();

      // Registrar participantes já presentes
      for (const [userId, member] of channel.members) {
        if (member.user.bot) continue;

        participants.set(userId, {
          userId,
          username: member.user.username,
          streams: [],
          joinedAt: new Date()
        });

        await this.apiService.addParticipant(meeting.id, {
          userId,
          username: member.user.username
        });
      }

      const recording: ActiveRecording = {
        meetingId: meeting.id,
        guildId,
        channelId: channel.id,
        channelName: channel.name,
        connection,
        receiver,
        participants,
        startTime: new Date()
      };

      this.recordings.set(guildId, recording);
      this.setupRecording(recording);

      logger.info(`Iniciada gravação no canal ${channel.name} (Guild: ${guildId})`);
      return meeting.id;

    } catch (error) {
      logger.error(`Erro ao iniciar gravação: ${error}`);
      throw error;
    }
  }

  private async waitForConnection(connection: VoiceConnection): Promise<void> {
    try {
      await entersState(connection, VoiceConnectionStatus.Ready, 30_000);
    } catch (error) {
      connection.destroy();
      throw new Error('Falha ao conectar ao canal de voz');
    }
  }

  private setupRecording(recording: ActiveRecording) {
    const { receiver, meetingId } = recording;

    receiver.speaking.on('start', (userId) => {
      const participant = recording.participants.get(userId);
      if (!participant) return;

      const audioStream = receiver.subscribe(userId, {
        end: {
          behavior: EndBehaviorType.AfterSilence,
          duration: 100
        }
      });

      const decoder = new prism.opus.Decoder({
        frameSize: 960,
        channels: 2,
        rate: 48000
      });

      const recordingsDir = join(process.cwd(), 'recordings', meetingId);
      if (!existsSync(recordingsDir)) {
        mkdirSync(recordingsDir, { recursive: true });
      }

      const filename = `${userId}-${Date.now()}.pcm`;
      const filepath = join(recordingsDir, filename);
      const writeStream = createWriteStream(filepath);

      audioStream.pipe(decoder).pipe(writeStream);
      participant.streams.push(writeStream);

      writeStream.on('finish', () => {
        logger.info(`Segmento de áudio salvo: ${filename}`);
      });
    });
  }

  handleVoiceStateUpdate(oldState: VoiceState, newState: VoiceState) {
    const guildId = newState.guild.id;
    const recording = this.recordings.get(guildId);

    if (!recording) return;

    // Usuário entrou no canal
    if (!oldState.channelId && newState.channelId === recording.channelId) {
      this.addParticipant(recording, newState);
    }

    // Usuário saiu do canal
    if (oldState.channelId === recording.channelId && !newState.channelId) {
      this.removeParticipant(recording, oldState);
    }
  }

  private async addParticipant(recording: ActiveRecording, voiceState: VoiceState) {
    const { user } = voiceState.member!;
    if (user.bot) return;

    const participant: ParticipantRecording = {
      userId: user.id,
      username: user.username,
      streams: [],
      joinedAt: new Date()
    };

    recording.participants.set(user.id, participant);

    try {
      await this.apiService.addParticipant(recording.meetingId, {
        userId: user.id,
        username: user.username
      });

      logger.info(`Participante ${user.username} entrou na reunião`);
    } catch (error) {
      logger.error(`Erro ao adicionar participante: ${error}`);
    }
  }

  private async removeParticipant(recording: ActiveRecording, voiceState: VoiceState) {
    const { user } = voiceState.member!;
    if (user.bot) return;

    const participant = recording.participants.get(user.id);
    if (!participant) return;

    participant.leftAt = new Date();

    // Fechar streams do participante
    participant.streams.forEach(stream => stream.end());

    try {
      await this.apiService.updateParticipant(recording.meetingId, user.id, {
        leftAt: participant.leftAt
      });

      logger.info(`Participante ${user.username} saiu da reunião`);
    } catch (error) {
      logger.error(`Erro ao atualizar participante: ${error}`);
    }
  }

  async stopRecording(guildId: string): Promise<void> {
    const recording = this.recordings.get(guildId);
    if (!recording) {
      throw new Error('Nenhuma gravação ativa encontrada');
    }

    try {
      // Finalizar todas as streams
      for (const participant of recording.participants.values()) {
        participant.streams.forEach(stream => stream.end());
      }

      // Desconectar do canal
      recording.connection.destroy();

      // Processar áudio
      await this.processRecording(recording);

      // Remover da lista de gravações ativas
      this.recordings.delete(guildId);

      logger.info(`Gravação finalizada: ${recording.meetingId}`);

    } catch (error) {
      logger.error(`Erro ao finalizar gravação: ${error}`);
      throw error;
    }
  }

  private async processRecording(recording: ActiveRecording) {
    const endTime = new Date();
    const duration = Math.floor((endTime.getTime() - recording.startTime.getTime()) / 1000);

    try {
      // Processar arquivos de áudio
      const processedFiles = await this.audioProcessor.processRecording(
        recording.meetingId,
        Array.from(recording.participants.values())
      );

      // Atualizar reunião na API
      await this.apiService.updateMeeting(recording.meetingId, {
        endedAt: endTime,
        duration,
        status: 'PROCESSING'
      });

      // Enviar arquivos para processamento
      for (const file of processedFiles) {
        await this.apiService.uploadRecording(recording.meetingId, file);
      }

      // Marcar como concluída
      await this.apiService.updateMeeting(recording.meetingId, {
        status: 'COMPLETED'
      });

    } catch (error) {
      logger.error(`Erro no processamento: ${error}`);

      await this.apiService.updateMeeting(recording.meetingId, {
        status: 'ERROR'
      });

      throw error;
    }
  }

  getActiveRecording(guildId: string): ActiveRecording | undefined {
    return this.recordings.get(guildId);
  }

  hasActiveRecording(guildId: string): boolean {
    return this.recordings.has(guildId);
  }
}