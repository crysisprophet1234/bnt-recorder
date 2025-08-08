// discord-bot/src/services/APIService.ts
import axios, { AxiosInstance } from 'axios';

interface CreateMeetingData {
    guildId: string;
    channelId: string;
    channelName: string;
}

interface AddParticipantData {
    userId: string;
    username: string;
}

interface UpdateMeetingData {
    endedAt?: Date;
    duration?: number;
    status?: string;
}

interface UpdateParticipantData {
    leftAt?: Date;
}

export class APIService {
    private api: AxiosInstance;

    constructor(baseURL: string) {
        this.api = axios.create({
            baseURL,
            timeout: 30000,
            headers: {
                'Content-Type': 'application/json'
            }
        });
    }

    async createMeeting(data: CreateMeetingData) {
        const response = await this.api.post('/api/meetings', {
            ...data,
            startedAt: new Date()
        });
        return response.data;
    }

    async updateMeeting(meetingId: string, data: UpdateMeetingData) {
        const response = await this.api.put(`/api/meetings/${meetingId}`, data);
        return response.data;
    }

    async addParticipant(meetingId: string, data: AddParticipantData) {
        const response = await this.api.post(`/api/meetings/${meetingId}/participants`, {
            ...data,
            joinedAt: new Date()
        });
        return response.data;
    }

    async updateParticipant(meetingId: string, userId: string, data: UpdateParticipantData) {
        const response = await this.api.put(
            `/api/meetings/${meetingId}/participants/${userId}`,
            data
        );
        return response.data;
    }

    async uploadRecording(meetingId: string, filePath: string) {
        const FormData = require('form-data');
        const fs = require('fs');

        const form = new FormData();
        form.append('file', fs.createReadStream(filePath));
        form.append('meetingId', meetingId);

        const response = await this.api.post('/api/recordings', form, {
            headers: {
                ...form.getHeaders()
            },
            timeout: 120000, // 2 minutes for file uploads
            maxContentLength: Infinity,
            maxBodyLength: Infinity
        });

        return response.data;
    }

    async checkPendingMeetings() {
        const response = await this.api.get('/api/meetings/check-pending');
        return response.data;
    }
}