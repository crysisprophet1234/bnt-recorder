// web-app/src/lib/storage.ts
import { writeFile, mkdir, stat } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';

export interface StorageConfig {
  type: 'local' | 's3';
  localPath?: string;
  s3Config?: {
    endpoint: string;
    accessKeyId: string;
    secretAccessKey: string;
    bucketName: string;
  };
}

export interface UploadResult {
  storageType: 'LOCAL' | 'S3';
  storagePath: string;
  filepath: string;
  filesize: number;
}

export class StorageService {
  private config: StorageConfig;
  private s3Client?: S3Client;

  constructor() {
    this.config = {
      type: (process.env.STORAGE_TYPE as 'local' | 's3') || 'local',
      localPath: process.env.LOCAL_STORAGE_PATH || './uploads',
    };

    if (this.config.type === 's3') {
      this.config.s3Config = {
        endpoint: process.env.S3_ENDPOINT || '',
        accessKeyId: process.env.S3_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || '',
        bucketName: process.env.S3_BUCKET_NAME || '',
      };

      this.s3Client = new S3Client({
        endpoint: this.config.s3Config.endpoint,
        region: 'us-east-1', // Default region
        credentials: {
          accessKeyId: this.config.s3Config.accessKeyId,
          secretAccessKey: this.config.s3Config.secretAccessKey,
        },
        forcePathStyle: true, // Required for MinIO and some S3-compatible services
      });
    }
  }

  /**
   * Generates the storage path based on guild ID, date, and meeting ID
   */
  private generateStoragePath(guildId: string, meetingId: string, filename: string): string {
    const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
    return `${guildId}/${date}/${meetingId}/${filename}`;
  }

  /**
   * Uploads a file to the configured storage
   */
  async uploadFile(
    file: File,
    guildId: string,
    meetingId: string
  ): Promise<UploadResult> {
    const timestamp = Date.now();
    const filename = `${timestamp}-${file.name}`;
    const storagePath = this.generateStoragePath(guildId, meetingId, filename);
    
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    if (this.config.type === 'local') {
      return this.uploadToLocal(buffer, storagePath, filename);
    } else {
      return this.uploadToS3(buffer, storagePath);
    }
  }

  /**
   * Uploads file to local storage
   */
  private async uploadToLocal(
    buffer: Buffer,
    storagePath: string,
    filename: string
  ): Promise<UploadResult> {
    const baseDir = this.config.localPath || './uploads';
    const fullPath = join(process.cwd(), baseDir, storagePath);
    const dirPath = join(process.cwd(), baseDir, storagePath.split('/').slice(0, -1).join('/'));

    // Create directory structure if it doesn't exist
    if (!existsSync(dirPath)) {
      await mkdir(dirPath, { recursive: true });
    }

    // Write file
    await writeFile(fullPath, buffer);

    // Get file stats
    const stats = await stat(fullPath);

    return {
      storageType: 'LOCAL',
      storagePath,
      filepath: fullPath,
      filesize: stats.size,
    };
  }

  /**
   * Uploads file to S3
   */
  private async uploadToS3(buffer: Buffer, storagePath: string): Promise<UploadResult> {
    if (!this.s3Client || !this.config.s3Config) {
      throw new Error('S3 client not configured');
    }

    const command = new PutObjectCommand({
      Bucket: this.config.s3Config.bucketName,
      Key: storagePath,
      Body: buffer,
      ContentType: 'audio/ogg',
    });

    await this.s3Client.send(command);

    return {
      storageType: 'S3',
      storagePath,
      filepath: `s3://${this.config.s3Config.bucketName}/${storagePath}`,
      filesize: buffer.length,
    };
  }

  /**
   * Gets a file from storage (for download)
   */
  async getFile(storageType: 'LOCAL' | 'S3', storagePath: string): Promise<Buffer> {
    if (storageType === 'LOCAL') {
      const baseDir = this.config.localPath || './uploads';
      const fullPath = join(process.cwd(), baseDir, storagePath);
      const fs = await import('fs/promises');
      return fs.readFile(fullPath);
    } else {
      if (!this.s3Client || !this.config.s3Config) {
        throw new Error('S3 client not configured');
      }

      const command = new GetObjectCommand({
        Bucket: this.config.s3Config.bucketName,
        Key: storagePath,
      });

      const response = await this.s3Client.send(command);
      
      if (!response.Body) {
        throw new Error('File not found');
      }

      // Convert stream to buffer
      const chunks: Uint8Array[] = [];
      const reader = response.Body.transformToWebStream().getReader();
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }

      return Buffer.concat(chunks);
    }
  }

  /**
   * Gets the file path for local files (used for N8N transcription)
   */
  getLocalFilePath(storagePath: string): string {
    if (this.config.type !== 'local') {
      throw new Error('Local file path only available for local storage');
    }
    
    const baseDir = this.config.localPath || './uploads';
    return join(process.cwd(), baseDir, storagePath);
  }

  /**
   * Gets the file URL/path for transcription based on storage type
   */
  getFileUrlForTranscription(storageType: 'LOCAL' | 'S3', storagePath: string): string {
    if (storageType === 'LOCAL') {
      const baseDir = this.config.localPath || './uploads';
      return join(process.cwd(), baseDir, storagePath);
    } else {
      // For S3, return the S3 URL
      if (!this.config.s3Config) {
        throw new Error('S3 configuration not available');
      }
      return `s3://${this.config.s3Config.bucketName}/${storagePath}`;
    }
  }

  /**
   * Gets the current storage configuration
   */
  getStorageConfig() {
    return {
      type: this.config.type,
      localPath: this.config.localPath,
      s3Config: this.config.s3Config
    };
  }
}