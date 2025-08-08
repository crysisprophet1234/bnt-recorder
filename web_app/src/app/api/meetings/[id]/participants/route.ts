// web-app/src/app/api/meetings/[id]/participants/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import logger from '../../../../utils/logger'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const { userId, username, joinedAt } = body;

    const participant = await prisma.participant.create({
      data: {
        userId,
        username,
        meetingId: params.id,
        joinedAt: new Date(joinedAt)
      }
    });

    return NextResponse.json(participant, { status: 201 });
  } catch (error) {
    logger.error('Erro ao adicionar participante:', error);
    return NextResponse.json(
      { error: 'Erro ao adicionar participante' },
      { status: 500 }
    );
  }
}