// web-app/src/app/api/recordings/[id]/download/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { StorageService } from '@/lib/storage';
import logger from '../../../../utils/logger'

const storageService = new StorageService();

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const recording = await prisma.recording.findUnique({
      where: { id: params.id }
    });

    if (!recording) {
      return NextResponse.json(
        { error: 'Gravação não encontrada' },
        { status: 404 }
      );
    }

    // Get file from storage service
    const fileBuffer = await storageService.getFile(recording.storageType, recording.storagePath);
    
    const response = new NextResponse(fileBuffer as any);
    
    response.headers.set('Content-Type', 'audio/ogg');
    response.headers.set('Content-Disposition', `attachment; filename="${recording.filename}"`);
    response.headers.set('Content-Length', fileBuffer.length.toString());
    
    return response;
  } catch (error) {
    logger.error('Erro ao fazer download:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}