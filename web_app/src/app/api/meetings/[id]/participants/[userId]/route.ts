// web-app/src/app/api/meetings/[id]/participants/[userId]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import logger from '../../../../../utils/logger'

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string; userId: string } }
) {
  try {
    const body = await request.json();
    const { leftAt } = body;

    const participant = await prisma.participant.updateMany({
      where: {
        meetingId: params.id,
        userId: params.userId
      },
      data: {
        leftAt: leftAt ? new Date(leftAt) : null
      }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Erro ao atualizar participante:', error);
    return NextResponse.json(
      { error: 'Erro ao atualizar participante' },
      { status: 500 }
    );
  }
}