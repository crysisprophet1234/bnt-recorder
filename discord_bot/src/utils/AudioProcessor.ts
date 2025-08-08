// discord-bot/src/utils/AudioProcessor.ts
import { spawn } from 'child_process';
import { join, basename } from 'path';
import { readdir, unlink, mkdir, copyFile } from 'fs/promises';
import { existsSync } from 'fs';
import logger from '../utils/logger'

interface ParticipantData {
    userId: string;
    username: string;
}

export class AudioProcessor {
    private readonly ffmpegPath: string;

    constructor() {
        // Use ffmpeg-static package to get bundled ffmpeg binary
        this.ffmpegPath = require('ffmpeg-static') || 'ffmpeg';
    }

    async processRecording(meetingId: string, participants: ParticipantData[]): Promise<string[]> {
        // Validate and sanitize meetingId
        const sanitizedMeetingId = this.sanitizeFilename(meetingId);
        
        const recordingsDir = join(process.cwd(), 'recordings', sanitizedMeetingId);
        const outputDir = join(process.cwd(), 'output', sanitizedMeetingId);

        // Create output directory safely
        await this.ensureDirectoryExists(outputDir);

        const processedFiles: string[] = [];

        try {
            // Process audio for each participant
            for (const participant of participants) {
                const participantFiles = await this.getParticipantFiles(recordingsDir, participant.userId);

                if (participantFiles.length === 0) continue;

                const outputFile = await this.mergeParticipantAudio(
                    participantFiles,
                    outputDir,
                    participant
                );

                if (outputFile) {
                    processedFiles.push(outputFile);
                }
            }

            // Create complete meeting audio
            const fullMeetingFile = await this.createFullMeetingAudio(processedFiles, outputDir, sanitizedMeetingId);
            if (fullMeetingFile) {
                processedFiles.push(fullMeetingFile);
            }

            // Clean up temporary files
            await this.cleanupTempFiles(recordingsDir);

            return processedFiles;

        } catch (error) {
            logger.error('Erro no processamento de áudio:', error);
            throw error;
        }
    }

    private async getParticipantFiles(recordingsDir: string, userId: string): Promise<string[]> {
        try {
            if (!existsSync(recordingsDir)) {
                return [];
            }

            const files = await readdir(recordingsDir);
            const sanitizedUserId = this.sanitizeFilename(userId);
            
            return files
                .filter(file => {
                    // More strict filtering to prevent path traversal
                    const filename = basename(file);
                    return filename.startsWith(sanitizedUserId) && 
                           filename.endsWith('.pcm') &&
                           !filename.includes('..') &&
                           !filename.includes('/') &&
                           !filename.includes('\\');
                })
                .map(file => join(recordingsDir, file))
                .sort();
        } catch (error) {
            logger.error(`Erro ao buscar arquivos do participante ${userId}:`, error);
            return [];
        }
    }

    private async mergeParticipantAudio(
        files: string[],
        outputDir: string,
        participant: ParticipantData
    ): Promise<string | null> {
        if (files.length === 0) return null;

        // Sanitize filename components
        const sanitizedUserId = this.sanitizeFilename(participant.userId);
        const sanitizedUsername = this.sanitizeFilename(participant.username);
        const outputFile = join(outputDir, `${sanitizedUserId}-${sanitizedUsername}.ogg`);

        try {
            if (files.length === 1) {
                // Single file conversion
                await this.runFFmpeg([
                    '-f', 's16le',
                    '-ar', '48000',
                    '-ac', '2',
                    '-i', files[0],
                    '-c:a', 'libopus',
                    '-y', // Overwrite output file
                    outputFile
                ]);
            } else {
                // Multiple files concatenation
                const args = [];
                
                // Add input files
                for (const file of files) {
                    args.push('-f', 's16le', '-ar', '48000', '-ac', '2', '-i', file);
                }
                
                // Add filter complex for concatenation
                const filterComplex = files.map((_, index) => `[${index}:0]`).join('') + 
                                    `concat=n=${files.length}:v=0:a=1[out]`;
                
                args.push('-filter_complex', filterComplex);
                args.push('-map', '[out]');
                args.push('-c:a', 'libopus');
                args.push('-y');
                args.push(outputFile);

                await this.runFFmpeg(args);
            }

            logger.info(`Áudio processado para ${participant.username}: ${outputFile}`);
            return outputFile;

        } catch (error) {
            logger.error(`Erro ao processar áudio do participante ${participant.username}:`, error);
            return null;
        }
    }

    private async createFullMeetingAudio(participantFiles: string[], outputDir: string, meetingId: string): Promise<string | null> {
        if (participantFiles.length === 0) return null;

        const sanitizedMeetingId = this.sanitizeFilename(meetingId);
        const outputFile = join(outputDir, `${sanitizedMeetingId}-complete.ogg`);

        try {
            if (participantFiles.length === 1) {
                // Single participant, copy file
                await copyFile(participantFiles[0], outputFile);
            } else {
                // Multiple participants, mix audio
                const args = [];
                
                // Add input files
                for (const file of participantFiles) {
                    args.push('-i', file);
                }
                
                // Add filter complex for mixing
                const filterComplex = participantFiles.map((_, index) => `[${index}:0]`).join('') + 
                                    `amix=inputs=${participantFiles.length}:duration=longest[out]`;
                
                args.push('-filter_complex', filterComplex);
                args.push('-map', '[out]');
                args.push('-c:a', 'libopus');
                args.push('-y');
                args.push(outputFile);

                await this.runFFmpeg(args);
            }

            logger.info(`Áudio completo da reunião criado: ${outputFile}`);
            return outputFile;

        } catch (error) {
            logger.error('Erro ao criar áudio completo da reunião:', error);
            return null;
        }
    }

    private async cleanupTempFiles(recordingsDir: string): Promise<void> {
        try {
            if (!existsSync(recordingsDir)) {
                return;
            }

            const files = await readdir(recordingsDir);
            const pcmFiles = files.filter(file => {
                const filename = basename(file);
                return filename.endsWith('.pcm') && 
                       !filename.includes('..') &&
                       !filename.includes('/') &&
                       !filename.includes('\\');
            });

            for (const file of pcmFiles) {
                await unlink(join(recordingsDir, file));
            }

            logger.info(`${pcmFiles.length} arquivos temporários removidos`);
        } catch (error) {
            logger.error('Erro ao limpar arquivos temporários:', error);
        }
    }

    private async ensureDirectoryExists(dirPath: string): Promise<void> {
        try {
            await mkdir(dirPath, { recursive: true });
        } catch (error) {
            if ((error as any).code !== 'EEXIST') {
                throw error;
            }
        }
    }

    private sanitizeFilename(filename: string): string {
        // Remove or replace dangerous characters
        return filename
            .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_') // Replace dangerous chars with underscore
            .replace(/^\.+/, '_') // Replace leading dots
            .replace(/\.+$/, '_') // Replace trailing dots
            .substring(0, 255); // Limit length
    }

    private async runFFmpeg(args: string[]): Promise<void> {
        return new Promise((resolve, reject) => {
            const ffmpeg = spawn(this.ffmpegPath, args, {
                stdio: ['ignore', 'pipe', 'pipe']
            });

            let stderr = '';

            ffmpeg.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            ffmpeg.on('close', (code) => {
                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error(`FFmpeg exited with code ${code}: ${stderr}`));
                }
            });

            ffmpeg.on('error', (error) => {
                reject(new Error(`Failed to start FFmpeg: ${error.message}`));
            });
        });
    }
}