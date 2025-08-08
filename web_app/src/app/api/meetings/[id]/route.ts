// web-app/src/app/api/meetings/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import logger from '../../../utils/logger'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const meeting = await prisma.meeting.findUnique({
      where: { id: params.id },
      include: {
        participants: {
          orderBy: { joinedAt: 'asc' }
        },
        recordings: {
          orderBy: { createdAt: 'asc' }
        },
        transcriptions: {
          orderBy: { createdAt: 'desc' }
        }
      }
    });

    if (!meeting) {
      return NextResponse.json(
        { error: 'Reunião não encontrada' },
        { status: 404 }
      );
    }

    return NextResponse.json(meeting);
  } catch (error) {
    logger.error('Erro ao buscar reunião:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const { endedAt, duration, status } = body;

    const updateData: any = {};
    if (endedAt) updateData.endedAt = new Date(endedAt);
    if (duration !== undefined) updateData.duration = duration;
    if (status) updateData.status = status;

    const meeting = await prisma.meeting.update({
      where: { id: params.id },
      data: updateData
    });

    return NextResponse.json(meeting);
  } catch (error) {
    logger.error('Erro ao atualizar reunião:', error);
    return NextResponse.json(
      { error: 'Erro ao atualizar reunião' },
      { status: 500 }
    );
  }
}