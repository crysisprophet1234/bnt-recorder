// web-app/src/app/api/recordings/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { N8NService } from '@/lib/n8n';
import { StorageService } from '@/lib/storage';
import logger from '../../utils/logger'

const n8nService = new N8NService();
const storageService = new StorageService();

export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData();
        
        const meetingId = formData.get('meetingId') as string;
        const file = formData.get('file') as File;

        if (!file || !meetingId) {
            return NextResponse.json(
                { error: 'Arquivo ou ID da reunião não fornecido' },
                { status: 400 }
            );
        }

        // Get meeting to retrieve guildId
        const meeting = await prisma.meeting.findUnique({
            where: { id: meetingId },
            select: { guildId: true }
        });

        if (!meeting) {
            return NextResponse.json(
                { error: 'Reunião não encontrada' },
                { status: 404 }
            );
        }

        // Upload file using storage service
        const uploadResult = await storageService.uploadFile(file, meeting.guildId, meetingId);

        // Determine recording type based on filename
        const isComplete = file.name?.includes('complete');
        const participantId = isComplete ? null : file.name?.split('-')[0];

        const recording = await prisma.recording.create({
            data: {
                meetingId: meetingId,
                filename: file.name,
                filepath: uploadResult.filepath,
                filesize: uploadResult.filesize,
                format: 'ogg',
                recordingType: isComplete ? 'COMPLETE' : 'PARTICIPANT',
                participantId,
                storageType: uploadResult.storageType,
                storagePath: uploadResult.storagePath
            }
        });

        // If it's a complete recording, send for transcription
        if (isComplete) {
            try {
                // Get the appropriate file URL/path for transcription
                const transcriptionFileUrl = storageService.getFileUrlForTranscription(
                    uploadResult.storageType, 
                    uploadResult.storagePath
                );

                const taskId = await n8nService.sendForTranscription(
                    meetingId, 
                    transcriptionFileUrl,
                    uploadResult.storageType,
                    uploadResult.storagePath
                );

                await prisma.transcription.create({
                    data: {
                        meetingId: meetingId,
                        n8nTaskId: taskId,
                        status: 'IN_PROGRESS'
                    }
                });

                // Start background polling
                processTranscriptionTask(meetingId, taskId);
            } catch (error) {
                logger.error('Erro ao enviar para transcrição:', error);

                await prisma.transcription.create({
                    data: {
                        meetingId: meetingId,
                        status: 'ERROR',
                        errorMessage: error instanceof Error ? error.message : 'Erro ao enviar para N8N'
                    }
                });
            }
        }

        return NextResponse.json(recording, { status: 201 });
    } catch (error) {
        logger.error('Erro ao fazer upload:', error);
        return NextResponse.json(
            { error: 'Erro interno do servidor' },
            { status: 500 }
        );
    }
}

async function processTranscriptionTask(meetingId: string, taskId: string) {
    logger.info('meeting id: ' + meetingId)
    try {
        const result = await n8nService.pollTask(taskId);

        logger.info('result for task id ' + taskId + ' = ' + JSON.stringify(result))

        if (result.status === 'completed' && result.result) {
            await prisma.transcription.updateMany({
                where: {
                    meetingId: meetingId,
                    n8nTaskId: taskId
                },
                data: {
                    status: 'COMPLETED',
                    content: result.result.transcription,
                    summary: result.result.summary
                }
            });
        } else if (result.status === 'error') {
            await prisma.transcription.updateMany({
                where: {
                    meetingId: meetingId,
                    n8nTaskId: taskId
                },
                data: {
                    status: 'ERROR',
                    errorMessage: result.error || 'Erro desconhecido na transcrição'
                }
            });
        }
    } catch (error) {
        logger.error('Erro no processamento da transcrição:', error);

        await prisma.transcription.updateMany({
            where: {
                meetingId,
                n8nTaskId: taskId
            },
            data: {
                status: 'ERROR',
                errorMessage: 'Timeout ou erro no polling'
            }
        });
    }
}