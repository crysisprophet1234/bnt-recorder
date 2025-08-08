// web-app/src/lib/n8n.ts
import axios from 'axios';
import logger from '../app/utils/logger'

interface N8NTaskResponse {
  taskId: string;
  status: 'pending' | 'in_progress' | 'completed' | 'error';
  result?: {
    transcription?: string;
    summary?: string;
  };
  error?: string;
}

export class N8NService {
  private baseURL: string;

  constructor() {
    this.baseURL = process.env.N8N_WEBHOOK_URL || '';
  }

  async sendForTranscription(
    meetingId: string, 
    audioFilePath: string, 
    storageType: 'LOCAL' | 'S3' = 'LOCAL',
    storagePath?: string
  ): Promise<string> {
    try {
      const payload: any = {
        meetingId,
        timestamp: new Date().toISOString(),
        storageType
      };

      if (storageType === 'LOCAL') {
        payload.audioFilePath = audioFilePath;
      } else {
        // For S3, send both the S3 URL and the storage path
        payload.audioFileUrl = audioFilePath;
        payload.storagePath = storagePath;
      }

      const response = await axios.post(`${this.baseURL}/reunioes/transcribe`, payload);

      if (response.status === 202 && response.data.taskId) {
        return response.data.taskId;
      }

      throw new Error('N8N não retornou task ID válido');
    } catch (error) {
      logger.error('Erro ao enviar para N8N:', error);
      throw error;
    }
  }

  async checkTaskStatus(taskId: string): Promise<N8NTaskResponse> {
    try {
      const response = await axios.get(`${this.baseURL}/18f202e4-7a21-421b-ac12-6a09f7a13b7d/reunioes/task/${taskId}`);
      return response.data;
    } catch (error) {
      logger.error('Erro ao verificar status da task:', error);
      throw error;
    }
  }

  async pollTask(taskId: string, maxAttempts: number = 60, intervalMs: number = 5000): Promise<N8NTaskResponse> {
    let attempts = 0;

    while (attempts < maxAttempts) {
      const status = await this.checkTaskStatus(taskId);

      if (status.status === 'completed' || status.status === 'error') {
        return status;
      }

      await new Promise(resolve => setTimeout(resolve, intervalMs));
      attempts++;
    }

    throw new Error('Timeout ao aguardar conclusão da task');
  }
}