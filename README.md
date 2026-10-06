# n8n ContentStudio Nodes

This package provides n8n community nodes for integrating with ContentStudio API, enabling workflow automation for social media management.

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

This node requires a ContentStudio API key:

1. **API Key**: Your ContentStudio X-API-Key

The API base URL is built into the node, so users only need to provide their API key.

> **Upgrading from 2.0.x:** the credential type was renamed from `contentStudio` to
> `contentStudioApi` to follow n8n's naming convention. Existing workflows need the
> ContentStudio credential re-selected on each node after the upgrade.

## Operations

### Resources

- **Auth**: Validate API key
- **Workspace**: List, create, update, and delete workspaces
- **Social Account**: List social accounts
- **Post**: List, get, create, update, delete, and approve/reject posts (including repeat schedules)
- **Scheduling**: Get the best times to post
- **Content Category**: List, get, create, update, delete, and shuffle content categories
- **Content Category Slot**: List, create, update, delete slots, and look up the next slot
- **Approval Workflow**: List, get, create, update, delete, duplicate, set/remove default, and poll cascade jobs
- **Share Link**: List, get, create, update, delete share links, send approval invitations, and read activity
- **Limit**: Get plan limits and current usage for a workspace

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

### Scheduling Operations

#### Best Times to Post
- **Workspace**: Select workspace
- **Accounts**: Optional — leave empty to analyse every connected account
- **Output**: Ranked slots (pooled, or pooled + per account) or the full API response
- **Pooled Slots / Per Account Slots**: How many recommended times to return (1–24)

Each ranked slot includes a `scheduled_at` value in `YYYY-MM-DD HH:MM:SS` format that
can be wired straight into the **Scheduled At** field of a later Create Post operation.
Times are always in the workspace timezone, returned on each slot as `timezone`.

### Limit Operations

#### Get Plan Limits and Usage
- **Workspace**: Select workspace

Returns `plan`, `limits` and `usage_reset` (passed through unchanged from the API):

- `plan` — `slug`, `name`, `is_annually`.
- `limits` — always the same 14 entries, in a stable order: `workspaces`,
  `social_accounts`, `team_members`, `x_posting_credits`, `listening_topics`,
  `listening_mentions`, `ai_text_credits`, `ai_image_credits`, `ai_video_credits`,
  `video_clip_credits`, `ai_auto_reply_credits`, `automations`, `media_storage`,
  `api_credits`. Each entry has `key`, `label`, `used`, `limit`, `remaining`,
  `scope`, `is_unlimited`, `is_on_plan`, `unit`, `period`, `resets_at` and `note`.
- `usage_reset` — `last_reset_at`, `next_reset_at` (ISO 8601 with offset, e.g.
  `2026-10-01T00:00:00+00:00`) and `note`.

Reading the entries:

- `scope` is `account` or `workspace` and says what `used` counts. The six
  account-wide entries (`workspaces`, `social_accounts`, `team_members`,
  `listening_topics`, `automations`, `media_storage`) report room left across the
  whole account — `social_accounts.remaining: 3` means three more anywhere on the
  account, not three more in this workspace. The eight credit counters are
  workspace-scoped.
- `limit: null` alone cannot distinguish "unlimited" from "not on this plan" —
  branch on `is_unlimited` and `is_on_plan` instead.
- `unit` is `bytes` for `media_storage` and `count` for everything else.
- `period` is `monthly` or `lifetime`; `resets_at` is `null` when `period` is
  `lifetime`.

The request-rate ceiling is **not** in this response. It is published on every API
call as the `X-RateLimit-Limit` / `X-RateLimit-Remaining` response headers. The
endpoint is not cached — it is built live on every request.

## Features

- **Dynamic Dropdowns**: Auto-populated workspace and account selections
- **User-Friendly Media Input**: Easy image and video URL management
- **Content Validation**: Ensures at least one content type is provided
- **Date Validation**: Proper scheduling format enforcement
- **Error Handling**: Comprehensive error messages and validation

## API Compatibility

This node works with ContentStudio API v1 and supports:
- Multiple API response formats
- Various entity identifier fields (`id`, `_id`, `uuid`)
- Robust error handling and fallbacks

## Example Workflow

1. **List Workspaces** → Get available workspaces
2. **List Social Accounts** → Get connected social media accounts
3. **Create Post** → Schedule content across multiple platforms
4. **List Posts** → Monitor created posts
5. **Delete Post** → Remove posts when needed

## Support

- **Issues**: [GitHub Issues](https://github.com/contentstudio/n8n-nodes-contentstudio/issues)
- **Documentation**: [ContentStudio API Docs](https://docs.contentstudio.io/)
- **n8n Community**: [n8n Community Forum](https://community.n8n.io/)

## Releasing

Publishing to npm is automated via [.github/workflows/publish.yml](.github/workflows/publish.yml) using npm Trusted Publishing (OIDC) — no tokens required.

**The workflow does NOT run on PR merges** (to `main` or any other branch). It runs only when:

1. A tag matching `v*` is pushed — e.g. `v2.0.8`, `v2.1.0`. This is the normal release path.
2. It is triggered manually from the **Actions** tab on GitHub (workflow_dispatch).

### Release steps

1. Merge your changes into `main` as normal — nothing publishes yet.
2. Bump `version` in `package.json` and merge that commit.
3. Tag the commit and push the tag:

   ```bash
   git tag v2.0.8
   git push origin v2.0.8
   ```

4. The tag push triggers the workflow → builds, publishes `n8n-nodes-contentstudio@<version>` to npm with provenance.
5. Watch progress at: https://github.com/contentstudioio/n8n-nodes/actions

## License

MIT

## Keywords

n8n, workflow, contentstudio, social media, automation, api, content management
