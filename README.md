# n8n ContentStudio Nodes

This package provides n8n community nodes for integrating with ContentStudio API, enabling workflow automation for social media management.

[![npm version](https://badge.fury.io/js/n8n-nodes-contentstudio.svg)](https://badge.fury.io/js/n8n-nodes-contentstudio)

## Installation

### In n8n (Recommended)
1. Go to **Settings** > **Community Nodes**
2. Click **Install**
3. Enter package name: `n8n-nodes-contentstudio`
4. Click **Install**

### Via npm
```bash
npm install n8n-nodes-contentstudio
```

## Prerequisites

- n8n version 0.187.0 or later
- ContentStudio account with API access
- ContentStudio API key

## Credentials

This node requires ContentStudio API credentials:

1. **API Key**: Your ContentStudio API key
2. **Base URL**: Fixed to `https://api-prod.contentstudio.io/api` (no input required)

## Operations

### Resources

- **Auth**: Validate API key
- **Workspace**: List workspaces
- **Social Account**: List social accounts
- **Post**: Create, list, and delete posts

### Post Operations

#### Create Post
- **Content Text**: Post content/caption
- **Media Images**: Add multiple image URLs
- **Media Video**: Add video URL
- **Accounts**: Select social media accounts
- **Publish Type**: Scheduled (with date/time)

#### List Posts
- **Workspace**: Select workspace
- **Date filters**: Optional date range filtering

#### Delete Post
- **Workspace**: Select workspace
- **Post ID**: Enter post ID to delete

## Features

- **Dynamic Dropdowns**: Auto-populated workspace and account selections
- **User-Friendly Media Input**: Easy image and video URL management
- **Content Validation**: Ensures at least one content type is provided
- **Date Validation**: Proper scheduling format enforcement
- **Error Handling**: Comprehensive error messages and validation

## API Compatibility

This node works with ContentStudio API v1 and supports:
- Multiple API response formats
- Robust error handling and fallbacks

## Example Workflow

1. **List Workspaces** → Get available workspaces
2. **List Social Accounts** → Get connected social media accounts
3. **Create Post** → Schedule content across multiple platforms
4. **List Posts** → Monitor created posts
5. **Delete Post** → Remove posts when needed

## Support

- **Issues**: [GitHub Issues](https://github.com/d4interactive/n8n-nodes/issues)
- **Documentation**: [ContentStudio API Docs](https://docs.contentstudio.io/)
- **n8n Community**: [n8n Community Forum](https://community.n8n.io/)

## Development

### File structure
```
credentials/
  ContentStudio.credentials.ts
nodes/
  ContentStudio/
    ContentStudio.node.ts
    loadOptions.ts
    utils.ts
```

## License

MIT

## Keywords

n8n, workflow, contentstudio, social media, automation, api, content management
