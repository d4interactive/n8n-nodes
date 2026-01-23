import type { IExecuteFunctions, INodeExecutionData, INodeType, INodeTypeDescription, ILoadOptionsFunctions, INodePropertyOptions } from 'n8n-workflow';
import { getWorkspaces, getPosts, getAccounts, getFirstCommentAccounts, getContentCategories } from './loadOptions';
import { normalizeBase, parseAccounts, parseMediaImages, parseMediaVideo } from './utils';
import { BASE_URL } from '../../credentials/ContentStudioApi.credentials';

export class ContentStudio implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'ContentStudio',
    name: 'contentStudio',
    group: ['transform'],
    version: [4, 5],
    description: 'Integrate with ContentStudio API',
    defaults: { name: 'ContentStudio' },
    iconUrl: '//app.contentstudio.io/favicons/favicon.ico',
    inputs: [NodeConnectionType.Main],
    outputs: [NodeConnectionType.Main],
    credentials: [{ name: 'contentStudioApi', required: true }],
    properties: [
      // Resource selector
      {
        displayName: 'Resource',
        name: 'resource',
        type: 'options',
        noDataExpression: true,
        options: [
          { name: 'Auth', value: 'auth' },
          { name: 'Workspace', value: 'workspace' },
          { name: 'Social Account', value: 'socialAccount' },
          { name: 'Content Category', value: 'contentCategory' },
          { name: 'Post', value: 'post' },
        ],
        default: 'auth',
        required: true,
      },

      // Operation by resource
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        displayOptions: { show: { resource: ['auth'] } },
        options: [{ name: 'Validate Key', value: 'validateKey', action: 'Validate API key' }],
        default: 'validateKey',
      },
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        displayOptions: { show: { resource: ['workspace'] } },
        options: [
          { name: 'List', value: 'list', action: 'List workspaces' },
        ],
        default: 'list',
      },
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        displayOptions: { show: { resource: ['socialAccount'] } },
        options: [
          { name: 'List', value: 'list', action: 'List Social Accounts' },
        ],
        default: 'list',
      },
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        displayOptions: { show: { resource: ['contentCategory'] } },
        options: [
          { name: 'List', value: 'list', action: 'List Content Categories' },
        ],
        default: 'list',
      },
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        displayOptions: { show: { resource: ['post'] } },
        options: [
          { name: 'List', value: 'list', action: 'List Posts' },
          { name: 'Create', value: 'create', action: 'Create Social Post' },
          { name: 'Delete', value: 'delete', action: 'Delete Post' },
        ],
        default: 'list',
      },

      // Common params
      {
        displayName: 'Workspace ID',
        name: 'workspaceId',
        type: 'options',
        typeOptions: { loadOptionsMethod: 'getWorkspaces' },
        default: '',
        required: true,
        description: 'Workspace ID',
        displayOptions: {
          show: {
            resource: ['socialAccount', 'contentCategory', 'post'],
          },
        },
      },
      {
        displayName: 'Page',
        name: 'page',
        type: 'number',
        default: 1,
        typeOptions: { minValue: 1 },
        displayOptions: {
          show: { resource: ['workspace', 'socialAccount', 'contentCategory', 'post'], operation: ['list'] },
        },
      },
      {
        displayName: 'Per Page',
        name: 'perPage',
        type: 'number',
        default: 10,
        typeOptions: { minValue: 1, maxValue: 100 },
        displayOptions: {
          show: { resource: ['workspace', 'socialAccount', 'contentCategory', 'post'], operation: ['list'] },
        },
      },

      // Social accounts
      {
        displayName: 'Platform',
        name: 'platform',
        type: 'string',
        default: '',
        description: 'Optional platform filter',
        displayOptions: {
          show: { resource: ['socialAccount'], operation: ['list'] },
        },
      },

      // Posts list filters
      {
        displayName: 'Statuses (CSV)',
        name: 'statusesCsv',
        type: 'string',
        default: '',
        description: 'Comma-separated statuses to filter by (e.g. scheduled,published,queued)',
        displayOptions: {
          show: { resource: ['post'], operation: ['list'] },
        },
      },
      {
        displayName: 'Date From',
        name: 'dateFrom',
        type: 'string',
        default: '',
        placeholder: 'YYYY-MM-DD',
        displayOptions: {
          show: { resource: ['post'], operation: ['list'] },
        },
      },
      {
        displayName: 'Date To',
        name: 'dateTo',
        type: 'string',
        default: '',
        placeholder: 'YYYY-MM-DD',
        displayOptions: {
          show: { resource: ['post'], operation: ['list'] },
        },
      },

      // Posts create/delete
      {
        displayName: 'Post ID',
        name: 'postId',
        type: 'string',
        default: '',
        required: true,
        placeholder: 'Enter post ID',
        description: 'The ID of the post to delete',
        displayOptions: { show: { resource: ['post'], operation: ['delete'] } },
      },
      {
        displayName: 'Accounts',
        name: 'accounts',
        type: 'multiOptions',
        typeOptions: { loadOptionsMethod: 'getAccounts', loadOptionsDependsOn: ['workspaceId'] },
        default: [],
        required: false,
        description: 'Select one or more social accounts to publish to. Optional if using Content Category (accounts will be merged from category).',
        displayOptions: { show: { resource: ['post'], operation: ['create'] } },
      },
      {
        displayName: 'Content Text',
        name: 'contentText',
        type: 'string',
        default: '',
        displayOptions: { show: { resource: ['post'], operation: ['create'] } },
      },
      {
        displayName: 'Media Images',
        name: 'mediaImages',
        type: 'fixedCollection',
        placeholder: 'Add Image URL',
        default: {},
        typeOptions: {
          multipleValues: true,
        },
        options: [
          {
            name: 'images',
            displayName: 'Images',
            values: [
              {
                displayName: 'Image URL',
                name: 'url',
                type: 'string',
                default: '',
                placeholder: 'https://example.com/image.jpg',
                description: 'URL of the image to include in the post',
              },
            ],
          },
        ],
        displayOptions: { show: { resource: ['post'], operation: ['create'] } },
      },
      {
        displayName: 'Media Video',
        name: 'mediaVideo',
        type: 'fixedCollection',
        placeholder: 'Add Video URL',
        default: {},
        typeOptions: {
          multipleValues: false,
        },
        options: [
          {
            name: 'video',
            displayName: 'Video',
            values: [
              {
                displayName: 'Video URL',
                name: 'url',
                type: 'string',
                default: '',
                placeholder: 'https://example.com/video.mp4',
                description: 'URL of the video to include in the post',
              },
            ],
          },
        ],
        displayOptions: { show: { resource: ['post'], operation: ['create'] } },
      },
      {
        displayName: 'Accounts',
        name: 'accounts',
        type: 'multiOptions',
        typeOptions: { loadOptionsMethod: 'getAccounts', loadOptionsDependsOn: ['workspaceId'] },
        default: [],
        description: 'Select one or more social accounts to publish to',
        displayOptions: { show: { resource: ['post'], operation: ['create'] } },
      },
      {
        displayName: 'Publish Type',
        name: 'publishType',
        type: 'options',
        options: [
          { name: 'Scheduled', value: 'scheduled' },
          { name: 'Queued', value: 'queued' },
          { name: 'Draft', value: 'draft' },
          { name: 'Content Category', value: 'content_category' },
        ],
        default: 'scheduled',
        displayOptions: { show: { resource: ['post'], operation: ['create'] } },
      },
      {
        displayName: 'Content Category',
        name: 'contentCategoryId',
        type: 'options',
        typeOptions: { loadOptionsMethod: 'getContentCategories', loadOptionsDependsOn: ['workspaceId'] },
        default: '',
        required: true,
        description: 'Select a content category. Accounts from the category will be used if no accounts are selected.',
        displayOptions: { show: { resource: ['post'], operation: ['create'], publishType: ['content_category'] } },
      },
      {
        displayName: 'Scheduled At',
        name: 'scheduledAt',
        type: 'string',
        required: true,
        default: '',
        placeholder: '2025-10-11 11:15:00',
        description: 'Schedule date and time in format: YYYY-MM-DD HH:MM:SS',
        displayOptions: { show: { resource: ['post'], operation: ['create'] } },
      },
      {
        displayName: 'Comment Message',
        name: 'firstCommentMessage',
        type: 'string',
        required: true,
        default: '',
        placeholder: 'Enter your first comment...',
        description: 'The message to post as the first comment',
        displayOptions: { show: { resource: ['post'], operation: ['create'], hasFirstComment: [true] } },
      },
      {
        displayName: 'Comment Accounts',
        name: 'firstCommentAccounts',
        type: 'multiOptions',
        typeOptions: { loadOptionsMethod: 'getFirstCommentAccounts', loadOptionsDependsOn: ['workspaceId', 'accounts'] },
        required: false,
        default: [],
        description: 'Select accounts to add the first comment. Optional if using Content Category (accounts will be merged from category).',
        displayOptions: { show: { resource: ['post'], operation: ['create'], hasFirstComment: [true] } },
      },
    ],
  };

  // Dynamic dropdowns
  methods = {
    loadOptions: {
      getWorkspaces,
      getPosts,
      getAccounts,
      getFirstCommentAccounts,
      getContentCategories,
    },
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const returnData: INodeExecutionData[] = [];

    for (let i = 0; i < items.length; i++) {
      const resource = this.getNodeParameter('resource', i) as string;
      const operation = this.getNodeParameter('operation', i) as string;

      const credentials = await this.getCredentials('contentStudioApi');
      const baseRoot = normalizeBase(BASE_URL);
      const apiKey = credentials.apiKey as string;

      // Base request options
      const options: any = {
        method: 'GET',
        uri: '',
        qs: {},
        body: {},
        json: true,
        headers: {
          accept: 'application/json',
          'X-API-Key': apiKey,
        },
        timeout: 60000,
      };

      // Routes
      if (resource === 'auth' && operation === 'validateKey') {
        options.method = 'GET';
        options.uri = `${baseRoot}/v1/me`;
      }

      if (resource === 'workspace' && operation === 'list') {
        const page = this.getNodeParameter('page', i) as number;
        const perPage = this.getNodeParameter('perPage', i) as number;
        options.method = 'GET';
        options.uri = `${baseRoot}/v1/workspaces`;
        options.qs = { page, per_page: perPage };
      }

      if (resource === 'socialAccount' && operation === 'list') {
        const workspaceId = this.getNodeParameter('workspaceId', i) as string;
        const page = this.getNodeParameter('page', i) as number;
        const perPage = this.getNodeParameter('perPage', i) as number;
        const platform = (this.getNodeParameter('platform', i) as string) || undefined;
        options.method = 'GET';
        options.uri = `${baseRoot}/v1/workspaces/${workspaceId}/accounts`;
        options.qs = { page, per_page: perPage } as any;
        if (platform) (options.qs as any).platform = platform;
      }

      if (resource === 'contentCategory' && operation === 'list') {
        const workspaceId = this.getNodeParameter('workspaceId', i) as string;
        const page = this.getNodeParameter('page', i) as number;
        const perPage = this.getNodeParameter('perPage', i) as number;
        options.method = 'GET';
        options.url = `${baseRoot}/v1/workspaces/${workspaceId}/content-categories`;
        options.qs = { page, per_page: perPage };
      }

      if (resource === 'post' && operation === 'list') {
        const workspaceId = this.getNodeParameter('workspaceId', i) as string;
        const page = this.getNodeParameter('page', i) as number;
        const perPage = this.getNodeParameter('perPage', i) as number;
        const statusesCsv = (this.getNodeParameter('statusesCsv', i) as string) || '';
        const dateFrom = (this.getNodeParameter('dateFrom', i) as string) || '';
        const dateTo = (this.getNodeParameter('dateTo', i) as string) || '';
        const qs: Record<string, any> = { page, per_page: perPage };
        const statuses = Array.from(new Set(statusesCsv.split(',').map(s => s.trim()).filter(Boolean)));
        statuses.forEach((s) => {
          if (!qs['status[]']) qs['status[]'] = [];
          qs['status[]'].push(s);
        });
        if (dateFrom) qs.date_from = dateFrom;
        if (dateTo) qs.date_to = dateTo;
        options.method = 'GET';
        options.uri = `${baseRoot}/v1/workspaces/${workspaceId}/posts`;
        options.qs = qs;
      }

      if (resource === 'post' && operation === 'create') {
        const workspaceId = this.getNodeParameter('workspaceId', i) as string;
        const contentText = (this.getNodeParameter('contentText', i) as string) || '';
        const mediaImagesParam = this.getNodeParameter('mediaImages', i) as unknown;
        const mediaVideoParam = (this.getNodeParameter('mediaVideo', i) as string) || '';
        const accountsParam = this.getNodeParameter('accounts', i) as unknown;
        const publishType = (this.getNodeParameter('publishType', i) as string) || 'scheduled';

        // Get contentCategoryId when publish type is content_category
        let contentCategoryId = '';
        if (publishType === 'content_category') {
          contentCategoryId = (this.getNodeParameter('contentCategoryId', i) as string) || '';
        }

        // Get scheduled_at only if publish_type is 'scheduled'
        let scheduledAt = '';
        if (publishType === 'scheduled') {
          scheduledAt = (this.getNodeParameter('scheduledAt', i) as string) || '';
        } else {
          // Auto-generate scheduled_at as now + 90 minutes for queued/draft/content_category
          const futureDate = new Date(Date.now() + 90 * 60 * 1000);
          const year = futureDate.getFullYear();
          const month = String(futureDate.getMonth() + 1).padStart(2, '0');
          const day = String(futureDate.getDate()).padStart(2, '0');
          const hours = String(futureDate.getHours()).padStart(2, '0');
          const minutes = String(futureDate.getMinutes()).padStart(2, '0');
          const seconds = String(futureDate.getSeconds()).padStart(2, '0');
          scheduledAt = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
        }

        // First comment fields
        const hasFirstComment = this.getNodeParameter('hasFirstComment', i, false) as boolean;
        let firstCommentMessage = '';
        let firstCommentAccountIds: string[] = [];

        if (hasFirstComment) {
          firstCommentMessage = (this.getNodeParameter('firstCommentMessage', i) as string) || '';
          const firstCommentAccountsParam = this.getNodeParameter('firstCommentAccounts', i) as unknown;
          firstCommentAccountIds = parseAccounts(firstCommentAccountsParam);

          if (!firstCommentMessage.trim()) {
            throw new Error('First Comment Message is required when Enable First Comment is true');
          }

          // First comment accounts required only when content_category is NOT used
          if (firstCommentAccountIds.length === 0 && !contentCategoryId) {
            throw new Error('First Comment Accounts is required when Enable First Comment is true and no Content Category is selected');
          }
        }

        const mediaImages = parseMediaImages(mediaImagesParam);
        const mediaVideo = parseMediaVideo(mediaVideoParam);
        const accounts = parseAccounts(accountsParam);

        // Validate: either accounts or content_category_id must be provided
        if (accounts.length === 0 && !contentCategoryId) {
          throw new Error('Either Accounts or Content Category must be selected');
        }

        // Content validation - ensure at least one content type is present
        const hasText = contentText && contentText.trim().length > 0;
        const hasImages = mediaImages && mediaImages.length > 0;
        const hasVideo = mediaVideo && mediaVideo.trim().length > 0;

        if (!hasText && !hasImages && !hasVideo) {
          throw new Error('At least one of the following must be provided: Content Text, Media Images, or Media Video');
        }

        // Validate scheduled date format
        if (scheduledAt && !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(scheduledAt)) {
          throw new Error('Scheduled At must be in format: YYYY-MM-DD HH:MM:SS (e.g., 2025-10-11 11:15:00)');
        }

        // Validate first comment accounts overlap with main accounts (only if accounts provided)
        if (hasFirstComment && firstCommentAccountIds.length > 0 && accounts.length > 0) {
          const mainAccountSet = new Set(accounts);
          const validCommentAccounts = firstCommentAccountIds.filter(id => mainAccountSet.has(id));

          if (validCommentAccounts.length === 0) {
            throw new Error('First Comment Accounts must include at least one account from the selected main Accounts');
          }

          // Use only valid overlapping accounts
          firstCommentAccountIds = validCommentAccounts;
        }

        options.method = 'POST';
        options.uri = `${baseRoot}/v1/workspaces/${workspaceId}/posts`;
        options.body = {
          content: {
            text: contentText,
            media: {
              images: mediaImages,
              video: mediaVideo,
            },
          },
          accounts,
          scheduling: {
            publish_type: publishType,
            scheduled_at: scheduledAt,
          },
        };

        // Add content_category_id when publish type is content_category
        if (publishType === 'content_category' && contentCategoryId) {
          (options.body as any).content_category_id = contentCategoryId;
        }

        // Add first comment to body if enabled
        if (hasFirstComment && firstCommentMessage) {
          (options.body as any).first_comment = {
            message: firstCommentMessage,
            accounts: firstCommentAccountIds,
          };
        }
      }

      if (resource === 'post' && operation === 'delete') {
        const workspaceId = this.getNodeParameter('workspaceId', i) as string;
        const postId = this.getNodeParameter('postId', i) as string;
        options.method = 'DELETE';
        options.uri = `${baseRoot}/v1/workspaces/${workspaceId}/posts/${postId}`;
      }

      const response = await this.helpers.request!(options);
      returnData.push({ json: response });
    }

    return [returnData];
  }
}