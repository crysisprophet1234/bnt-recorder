# API Refactoring Summary

## Overview

The `POST /api/recordings` endpoint has been successfully refactored to support both local and S3 storage backends while maintaining full transcription functionality for both storage types.

## Key Changes

### 1. Database Schema Updates
- Added `storageType` enum field (`LOCAL` | `S3`) to the `recordings` table
- Added `storagePath` field to store the relative path within the storage system
- Applied migration that handles existing data without data loss

### 2. Storage Service (`src/lib/storage.ts`)
- **Unified Storage Interface**: Single service handles both local and S3 storage
- **Structured File Organization**: Files organized as `/guild-id/YYYY-MM-DD/meeting-id/filename`
- **S3 Integration**: Full AWS SDK v3 support with configurable endpoints (supports MinIO and other S3-compatible services)
- **Download Support**: Unified file retrieval for both storage types

### 3. Enhanced N8N Integration (`src/lib/n8n.ts`)
- **Storage-Aware Transcription**: N8N service now handles both local and S3 files
- **Flexible Payload Structure**: Different payload formats for different storage types
- **Full Transcription Support**: Transcription works regardless of storage backend

### 4. Environment Configuration
New environment variables added:
```env
# Storage Configuration
STORAGE_TYPE="local"  # or "s3"
LOCAL_STORAGE_PATH="./uploads"

# S3 Configuration
S3_ENDPOINT="https://s3.amazonaws.com"
S3_ACCESS_KEY_ID="your-access-key-id"
S3_SECRET_ACCESS_KEY="your-secret-access-key"
S3_BUCKET_NAME="your-bucket-name"

# N8N Configuration
N8N_WEBHOOK_URL="http://localhost:5678/webhook"
```

### 5. API Endpoint Updates

#### POST /api/recordings
- Now retrieves `guildId` from the meeting to organize files properly
- Uses storage service for file uploads
- Saves storage metadata in the database
- Sends appropriate payload to N8N based on storage type

#### GET /api/recordings/[id]/download
- Updated to work with both storage types
- Uses storage service for file retrieval

## File Organization Structure

All files are now organized consistently regardless of storage backend:

```
/guild-id/date/meeting-id/audio-files
```

Example:
```
/123456789012345678/2024-01-15/meeting-abc123/1704123456789-complete-recording.ogg
/123456789012345678/2024-01-15/meeting-abc123/1704123456790-user123-recording.ogg
```

## N8N Integration Details

### Local Storage Payload
```json
{
  "meetingId": "meeting-abc123",
  "audioFilePath": "/path/to/uploads/guild-id/date/meeting-id/filename.ogg",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "storageType": "LOCAL"
}
```

### S3 Storage Payload
```json
{
  "meetingId": "meeting-abc123",
  "audioFileUrl": "s3://bucket-name/guild-id/date/meeting-id/filename.ogg",
  "storagePath": "guild-id/date/meeting-id/filename.ogg",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "storageType": "S3"
}
```

## Backward Compatibility

- Existing recordings are automatically migrated to use local storage
- No breaking changes to existing API contracts
- All existing functionality preserved

## Benefits

1. **Scalability**: S3 storage supports unlimited file storage
2. **Flexibility**: Easy switching between storage backends via configuration
3. **Cost Optimization**: S3 can be more cost-effective for large-scale deployments
4. **Reliability**: S3 provides built-in redundancy and durability
5. **Integration**: Works with AWS S3, MinIO, and other S3-compatible services
6. **Full Feature Support**: Transcription works with both storage types

## Migration Process

1. Update environment variables in `.env`
2. Run `npx prisma migrate dev` to apply database changes
3. Restart the application
4. New recordings will use the configured storage backend
5. Existing recordings continue to work without modification

## Testing

The refactoring has been tested and builds successfully. All TypeScript compilation passes without errors.