// web-app/src/app/api/meetings/check-pending/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import logger from '../../../utils/logger'

export async function GET(request: NextRequest) {
    try {
        // Find meetings that are still in RECORDING status but might need cleanup
        const pendingMeetings = await prisma.meeting.findMany({
            where: {
                status: 'RECORDING',
                // Find meetings that have been recording for more than 24 hours
                startedAt: {
                    lt: new Date(Date.now() - 24 * 60 * 60 * 1000)
                }
            },
            include: {
                participants: true,
                recordings: true
            }
        });

        // Also find meetings that ended but don't have recordings processed
        const unprocessedMeetings = await prisma.meeting.findMany({
            where: {
                status: 'COMPLETED',
                recordings: {
                    none: {}
                },
                endedAt: {
                    not: null,
                    lt: new Date(Date.now() - 60 * 60 * 1000) // 1 hour ago
                }
            },
            include: {
                participants: true,
                recordings: true
            }
        });

        const result = {
            staleMeetings: pendingMeetings,
            unprocessedMeetings: unprocessedMeetings,
            totalPending: pendingMeetings.length + unprocessedMeetings.length
        };

        return NextResponse.json(result);
    } catch (error) {
        logger.error('Erro ao verificar reuniões pendentes:', error);
        return NextResponse.json(
            { error: 'Erro ao verificar reuniões pendentes' },
            { status: 500 }
        );
    }
}