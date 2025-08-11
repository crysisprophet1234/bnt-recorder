import { spawn } from 'child_process';
import { join, basename } from 'path';
import { readdir, unlink, mkdir, copyFile, stat, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import logger from '../utils/logger'

interface ParticipantData {
    userId: string;
    username: string;
}

interface PcmSegment {
    userId: string;
    username: string;
    path: string;
    mtimeMs: number;
    durationSec: number;
}

// PCM: s16le (16-bit) * 2 canais * 48000 amostras/seg = 192000 bytes/seg
const BYTES_PER_SECOND = 48000 * 2 * 2;
const SILENCE_REMOVE_FILTER = 'silenceremove=stop_periods=-1:stop_duration=3:stop_threshold=-50dB';

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
            // 1) Por usuário: gerar OGG já SEM silêncio
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

            // 2) Construir segments.json (timeline sequencial)
            const segments = await this.buildSegmentsJson(recordingsDir, participants, outputDir);

            // 3) Criar o "complete" sequencial (sem sobreposição e sem silêncio)
            const fullMeetingFile = await this.createFullMeetingAudioSequential(segments, outputDir, sanitizedMeetingId);
            if (fullMeetingFile) {
                processedFiles.push(fullMeetingFile);
            }

            // 4) Clean up temporary files
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
                // Single file conversion + remove silêncio
                await this.runFFmpeg([
                    '-f', 's16le',
                    '-ar', '48000',
                    '-ac', '2',
                    '-i', files[0],
                    '-af', SILENCE_REMOVE_FILTER,
                    '-c:a', 'libopus',
                    '-y', // Overwrite output file
                    outputFile
                ]);
            } else {
                // Múltiplos arquivos: concat + remove silêncio
                const args: string[] = [];
                
                // Add input files
                for (const file of files) {
                    args.push('-f', 's16le', '-ar', '48000', '-ac', '2', '-i', file);
                }
                
                // Concatena e aplica silenceremove
                const filterComplex =
                    files.map((_, index) => `[${index}:0]`).join('') + 
                    `concat=n=${files.length}:v=0:a=1,${SILENCE_REMOVE_FILTER}[out]`;
                
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

    private async buildSegmentsJson(recordingsDir: string, participants: ParticipantData[], outDir: string): Promise<PcmSegment[]> {
        const all: PcmSegment[] = [];
        for (const p of participants) {
            const files = await this.getParticipantFiles(recordingsDir, p.userId);
            for (const f of files) {
                try {
                    const s = await stat(f);
                    const durationSec = await this.fileDurationSec(f);
                    all.push({
                        userId: this.sanitizeFilename(p.userId),
                        username: this.sanitizeFilename(p.username),
                        path: f,
                        mtimeMs: s.mtimeMs,
                        durationSec
                    });
                } catch (e) {
                    logger.warn(`Falha ao coletar stats de ${f}:`, e);
                }
            }
        }

        // Ordena por "quando foi gravado" (mtime). Se tiver timestamp no nome, adapte aqui.
        all.sort((a, b) => a.mtimeMs - b.mtimeMs);

        // Constroi timeline sequencial (sem sobreposição)
        let cursor = 0;
        const timeline = all.map(seg => {
            const start = cursor;
            const end = start + seg.durationSec;
            cursor = end;
            return {
                userId: seg.userId,
                username: seg.username,
                source: seg.path,
                start,
                end,
                duration: seg.durationSec
            };
        });

        try {
            await writeFile(
                join(outDir, 'segments.json'),
                JSON.stringify({
                    sampleRate: 48000,
                    channels: 2,
                    format: 's16le',
                    silenceRemoved: { threshold: '-50dB', minDurationSec: 3 },
                    segments: timeline
                }, null, 2),
                'utf8'
            );
            logger.info(`segments.json criado em ${join(outDir, 'segments.json')}`);
        } catch (e) {
            logger.error('Erro ao escrever segments.json:', e);
        }

        return all;
    }

    private async createFullMeetingAudioSequential(segments: PcmSegment[], outputDir: string, meetingId: string): Promise<string | null> {
        if (segments.length === 0) return null;

        const sanitizedMeetingId = this.sanitizeFilename(meetingId);
        const tmpDir = join(outputDir, '_tmp');
        await this.ensureDirectoryExists(tmpDir);

        try {
            // 1) Converte cada segmento PCM -> OGG aplicando remoção de silêncio
            const chunkPaths: string[] = [];
            for (let i = 0; i < segments.length; i++) {
                const seg = segments[i];
                const chunk = join(tmpDir, `${i.toString().padStart(6, '0')}-${seg.userId}.ogg`);
                await this.runFFmpeg([
                    '-f','s16le','-ar','48000','-ac','2','-i', seg.path,
                    '-af', SILENCE_REMOVE_FILTER,
                    '-c:a','libopus','-y', chunk
                ]);
                chunkPaths.push(chunk);
            }

            // 2) Concatena os chunks já em OGG/Opus (concat demuxer)
            const concatListPath = join(tmpDir, 'list.txt');
            const listFile = chunkPaths.map(p => `file '${p.replace(/'/g,"'\\''")}'`).join('\n');
            await writeFile(concatListPath, listFile, 'utf8');

            const outputFile = join(outputDir, `${sanitizedMeetingId}-complete.ogg`);
            await this.runFFmpeg([
                '-f','concat','-safe','0','-i', concatListPath,
                '-c:a','copy', // sem reencode extra
                '-y', outputFile
            ]);

            // Limpa temporários
            try {
                for (const p of chunkPaths) await unlink(p);
                await unlink(concatListPath);
            } catch {}

            logger.info(`Áudio completo da reunião (sequencial) criado: ${outputFile}`);
            return outputFile;

        } catch (error) {
            logger.error('Erro ao criar áudio completo da reunião (sequencial):', error);
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

    private async fileDurationSec(filePath: string): Promise<number> {
        const s = await stat(filePath);
        return s.size / BYTES_PER_SECOND;
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
                    reject(new Error(`FFmpeg saiu com código ${code}: ${stderr}`));
                }
            });

            ffmpeg.on('error', (error) => {
                reject(new Error(`Falha ao iniciar FFmpeg: ${error.message}`));
            });
        });
    }
}