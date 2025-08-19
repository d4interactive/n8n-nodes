# ContentStudio n8n Node - Technical Documentation

## Overview
This is a custom n8n node for integrating with the ContentStudio API. The node supports workspace management, social account listing, and post operations (list, create, delete).

## Architecture

### File Structure
```
src/nodes/ContentStudio/
├── ContentStudio.node.ts     # Main node class and configuration
├── loadOptions.ts            # Dynamic dropdown data loaders
└── utils.ts                  # Utility functions and parsers
```

### Modular Design
The codebase follows a modular approach for better maintainability:

- **Main Node** (`ContentStudio.node.ts`): Contains the node definition, properties schema, and execution logic
- **Load Options** (`loadOptions.ts`): Handles dynamic dropdown population for workspaces, posts, and accounts
- **Utils** (`utils.ts`): Provides parsing utilities and helper functions

## Node Configuration

### Basic Properties
- **Display Name**: ContentStudio
- **Name**: contentStudio
- **Group**: transform
- **Version**: [4, 5]
- **Credentials**: contentStudioApi (required)

### Resources and Operations

#### Auth Resource
- **validateKey**: Validates the API key

#### Workspace Resource
- **list**: Lists all workspaces with pagination

#### Social Account Resource
- **list**: Lists social accounts for a workspace with optional platform filtering

#### Post Resource
- **list**: Lists posts with status and date filtering
- **create**: Creates new posts with content, media, accounts, and scheduling
- **delete**: Deletes existing posts by ID

## API Integration

### Authentication
Uses X-API-Key header authentication:
```typescript
headers: { 
  accept: 'application/json', 
  'X-API-Key': apiKey 
}
```

### Base URL Normalization
The `normalizeBase()` function ensures consistent API endpoint formatting:
- Removes trailing slashes
- Removes `/v1` suffix if present

### API Response Structure
All ContentStudio API responses follow this format:
```json
{
  "status": true,
  "message": "Success message",
  "current_page": 1,
  "per_page": 10,
  "total": 25,
  "data": [...]
}
```

## Dynamic Dropdowns

### Workspace Loader (`getWorkspaces`)
- **Endpoint**: `GET /v1/workspaces`
- **Parameters**: `page=1, per_page=100`
- **Returns**: Array of `{name, value}` options where value is workspace `_id`

### Posts Loader (`getPosts`)
- **Endpoint**: `GET /v1/workspaces/{workspaceId}/posts`
- **Dependencies**: Requires `workspaceId` parameter
- **Parameters**: `page=1, per_page=50`
- **Returns**: Post titles (truncated to 60 chars) with status indicators

### Accounts Loader (`getAccounts`)
- **Endpoint**: `GET /v1/workspaces/{workspaceId}/accounts`
- **Dependencies**: Requires `workspaceId` parameter
- **Parameters**: `page=1, per_page=100`
- **Returns**: Platform and account name combinations

## Post Creation

### Content Types
Supports multiple content types:
- **Text Content**: Plain text posts
- **Media Images**: Array of image URLs via fixedCollection
- **Media Video**: Single video URL via fixedCollection

### Content Validation
At least one content type must be provided:
```typescript
const hasText = contentText && contentText.trim().length > 0;
const hasImages = mediaImages && mediaImages.length > 0;
const hasVideo = mediaVideo && mediaVideo.trim().length > 0;

if (!hasText && !hasImages && !hasVideo) {
  throw new Error('At least one content type required');
}
```

### Publishing Options
- **Scheduled**: Requires `scheduled_at` in format `YYYY-MM-DD HH:MM:SS`
- **Draft**: No scheduling required

### Request Payload Structure
```json
{
  "content": {
    "text": "Post content",
    "media": {
      "images": ["url1", "url2"],
      "video": "video_url"
    }
  },
  "accounts": ["account_id1", "account_id2"],
  "scheduling": {
    "publish_type": "scheduled|draft",
    "scheduled_at": "2025-10-11 11:15:00"
  }
}
```

## Utility Functions

### Media Parsers
- **parseMediaImages**: Handles fixedCollection format and legacy JSON strings
- **parseMediaVideo**: Extracts video URL from collection or string format
- **parseAccounts**: Processes multiOptions arrays and legacy formats

### Data Parsers
- **parseArray**: Generic array parser with JSON fallback
- **parseMaybeObject**: Attempts JSON parsing with string fallback

## Error Handling

### Load Options Errors
All load option functions wrap API calls in try-catch blocks:
```typescript
try {
  // API call
} catch (error) {
  const msg = (error as any)?.message || String(error);
  throw new Error(`Failed to load {Resource}: ${msg}`);
}
```

### Validation Errors
- **Content Validation**: Ensures at least one content type is provided
- **Date Format Validation**: Validates scheduled date format for scheduled posts
- **Required Fields**: Enforces required parameters based on operation type

## Development Setup

### Building
```bash
npm run build
```

### Development Workflow
1. Make changes to TypeScript source files
2. Run `npm run build` to compile
3. Restart n8n to pick up changes
4. Test in n8n workflow editor

### Symlink Configuration
For development, ensure proper symlink:
```bash
ln -sfn /var/www/html/n8n-nodes-contentstudio ~/.n8n/nodes/n8n-nodes-contentstudio
```

## API Endpoints Reference

### Workspaces
- `GET /v1/workspaces` - List workspaces

### Posts
- `GET /v1/workspaces/{id}/posts` - List posts
- `POST /v1/workspaces/{id}/posts` - Create post
- `DELETE /v1/workspaces/{id}/posts/{postId}` - Delete post

### Social Accounts
- `GET /v1/workspaces/{id}/accounts` - List social accounts

### Authentication
- `GET /v1/auth/validate` - Validate API key

## Version History

### Version 4-5
- Initial implementation with all resources and operations
- Modular file structure
- Support for scheduled and draft posts
- Dynamic dropdown loading
- Media content support (images and video)
- Comprehensive error handling

## Best Practices

### Code Organization
- Keep main node file focused on configuration and orchestration
- Extract reusable utilities to separate modules
- Use TypeScript for better type safety and IDE support

### API Integration
- Always handle API errors gracefully
- Use consistent request timeout values (60 seconds)
- Normalize base URLs to prevent endpoint issues

### User Experience
- Provide clear error messages
- Use conditional field display for better UX
- Implement proper validation with helpful feedback

## Troubleshooting

### Common Issues
1. **Dropdown not loading**: Check API credentials and workspace permissions
2. **Draft option not showing**: Ensure node version is current and browser cache is cleared
3. **Symlink issues**: Verify symlink points to correct workspace directory
4. **Build errors**: Check TypeScript compilation and import paths

### Debug Steps
1. Check n8n console logs for API errors
2. Verify API responses match expected structure
3. Test API endpoints directly with curl/Postman
4. Ensure all required parameters are provided
