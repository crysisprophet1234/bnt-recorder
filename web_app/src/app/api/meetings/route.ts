// web-app/src/app/api/meetings/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import logger from '../../utils/logger'

export async function GET(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams;
        const page = parseInt(searchParams.get('page') || '1');
        const limit = parseInt(searchParams.get('limit') || '10');
        const status = searchParams.get('status');
        const guildId = searchParams.get('guildId');

        const skip = (page - 1) * limit;

        const where: any = {};
        if (status) where.status = status;
        if (guildId) where.guildId = guildId;

        const [meetings, total] = await Promise.all([
            prisma.meeting.findMany({
                where,
                include: {
                    participants: true,
                    recordings: true,
                    transcriptions: true
                },
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit
            }),
            prisma.meeting.count({ where })
        ]);

        return NextResponse.json({
            meetings,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        logger.error('Erro ao buscar reuniões:', error);
        return NextResponse.json(
            { error: 'Erro interno do servidor' },
            { status: 500 }
        );
    }
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { guildId, channelId, channelName, startedAt } = body;

        const meeting = await prisma.meeting.create({
            data: {
                guildId,
                channelId,
                channelName,
                startedAt: new Date(startedAt),
                status: 'RECORDING'
            }
        });

        return NextResponse.json(meeting, { status: 201 });
    } catch (error) {
        logger.error('Erro ao criar reunião:', error);
        return NextResponse.json(
            { error: 'Erro ao criar reunião' },
            { status: 500 }
        );
    }
}