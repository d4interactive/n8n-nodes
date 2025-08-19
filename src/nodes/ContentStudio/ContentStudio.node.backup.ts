import type { IExecuteFunctions, INodeExecutionData, INodeType, INodeTypeDescription, ILoadOptionsFunctions, INodePropertyOptions } from 'n8n-workflow';
import { NodeConnectionType } from 'n8n-workflow';

export class ContentStudio implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'ContentStudio',
    name: 'contentStudio',
    group: ['transform'],
    version: [4, 5],
    description: 'Integrate with ContentStudio API',
    defaults: { name: 'ContentStudio' },
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
          { name: 'List', value: 'list', action: 'List social accounts' },
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
          { name: 'List', value: 'list', action: 'List posts' },
          { name: 'Create', value: 'create', action: 'Create post' },
          { name: 'Delete', value: 'delete', action: 'Delete post' },
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
            resource: ['socialAccount', 'post'],
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
          show: { resource: ['workspace', 'socialAccount', 'post'], operation: ['list'] },
        },
      },
      {
        displayName: 'Per Page',
        name: 'perPage',
        type: 'number',
        default: 10,
        typeOptions: { minValue: 1, maxValue: 100 },
        displayOptions: {
          show: { resource: ['workspace', 'socialAccount', 'post'], operation: ['list'] },
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
        ],
        default: 'scheduled',
        displayOptions: { show: { resource: ['post'], operation: ['create'] } },
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
    ],
  };

  // Dynamic dropdowns
  methods = {
    loadOptions: {
      async getWorkspaces(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
        try {
          const credentials = await this.getCredentials('contentStudioApi');
          const normalizeBase = (u: string) => u.replace(/\/$/, '').replace(/\/v1$/, '');
          const baseRoot = normalizeBase(credentials.baseUrl as string);
          const apiKey = credentials.apiKey as string;
          const options: any = {
            method: 'GET',
            uri: `${baseRoot}/v1/workspaces`,
            qs: { page: 1, per_page: 100 },
            json: true,
            headers: { accept: 'application/json', 'X-API-Key': apiKey },
            timeout: 60000,
          };
          const res: any = await this.helpers.request!(options);
          const candidates = [
            res?.data?.data,
            res?.data?.items,
            res?.data?.results,
            res?.data?.workspaces,
            res?.data,
            res?.workspaces,
            res?.items,
            res?.results,
            res,
          ];
          const list: any[] = candidates.find((v) => Array.isArray(v)) || [];
          const out = list
            .map((w: any) => {
              const id = w?._id;
              if (!id) return null;
              const name = w?.name || w?.title || id;
              return { name, value: id } as INodePropertyOptions;
            })
            .filter((o): o is INodePropertyOptions => !!o);
          return out;
        } catch (error) {
          const msg = (error as any)?.message || String(error);
          throw new Error(`Failed to load Workspaces: ${msg}`);
        }
      },

      async getPosts(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
        try {
          const credentials = await this.getCredentials('contentStudioApi');
          const normalizeBase = (u: string) => u.replace(/\/$/, '').replace(/\/v1$/, '');
          const baseRoot = normalizeBase(credentials.baseUrl as string);
          const apiKey = credentials.apiKey as string;
          const workspaceId = (this.getCurrentNodeParameter('workspaceId') as string) || '';
          if (!workspaceId) return [];
          const options: any = {
            method: 'GET',
            uri: `${baseRoot}/v1/workspaces/${workspaceId}/posts`,
            qs: { page: 1, per_page: 50 },
            json: true,
            headers: { accept: 'application/json', 'X-API-Key': apiKey },
            timeout: 60000,
          };
          const res: any = await this.helpers.request!(options);
          const candidates = [
            res?.data?.data,
            res?.data?.items,
            res?.data?.results,
            res?.data?.posts,
            res?.data,
            res?.posts,
            res?.items,
            res?.results,
            res,
          ];
          const list: any[] = candidates.find((v) => Array.isArray(v)) || [];
          const out = list
            .map((p: any) => {
              const id = p?._id;
              if (!id) return null;
              const text: string = (p?.content?.text || p?.title || '') as string;
              const labelBase = `${(text || '').slice(0, 60)}${text && text.length > 60 ? '…' : ''}`.trim();
              const label = `${labelBase}${p?.status ? ` (${p.status})` : ''}` || String(id);
              return { name: label, value: id } as INodePropertyOptions;
            })
            .filter((o): o is INodePropertyOptions => !!o);
          return out;
        } catch (error) {
          const msg = (error as any)?.message || String(error);
          throw new Error(`Failed to load Posts: ${msg}`);
        }
      },

      async getAccounts(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
        try {
          const credentials = await this.getCredentials('contentStudioApi');
          const normalizeBase = (u: string) => u.replace(/\/$/, '').replace(/\/v1$/, '');
          const baseRoot = normalizeBase(credentials.baseUrl as string);
          const apiKey = credentials.apiKey as string;
          const workspaceId = (this.getCurrentNodeParameter('workspaceId') as string) || '';
          if (!workspaceId) return [];
          const options: any = {
            method: 'GET',
            uri: `${baseRoot}/v1/workspaces/${workspaceId}/accounts`,
            qs: { page: 1, per_page: 100 },
            json: true,
            headers: { accept: 'application/json', 'X-API-Key': apiKey },
            timeout: 60000,
          };
          const res: any = await this.helpers.request!(options);
          const candidates = [
            res?.data?.data,
            res?.data?.items,
            res?.data?.results,
            res?.data?.accounts,
            res?.data,
            res?.accounts,
            res?.items,
            res?.results,
            res,
          ];
          const list: any[] = candidates.find((v) => Array.isArray(v)) || [];
          const out = list
            .map((a: any) => {
              const id = a?._id;
              if (!id) return null;
              const platform = a?.platform || a?.provider || '';
              const accountName = a?.account_name || a?.username || a?.handle || a?.name || '';
              const label = [platform, accountName]
                .filter(Boolean)
                .join(' - ') || String(id);
              return { name: label, value: id } as INodePropertyOptions;
            })
            .filter((o): o is INodePropertyOptions => !!o);
          return out;
        } catch (error) {
          const msg = (error as any)?.message || String(error);
          throw new Error(`Failed to load Accounts: ${msg}`);
        }
      },
    },
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const returnData: INodeExecutionData[] = [];

    for (let i = 0; i < items.length; i++) {
      const resource = this.getNodeParameter('resource', i) as string;
      const operation = this.getNodeParameter('operation', i) as string;

      const credentials = await this.getCredentials('contentStudioApi');
      const normalizeBase = (u: string) => u.replace(/\/$/, '').replace(/\/v1$/, '');
      const baseRoot = normalizeBase(credentials.baseUrl as string);
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
        const scheduledAt = (this.getNodeParameter('scheduledAt', i) as string) || '';

        const parseArray = (val: unknown): any[] => {
          if (Array.isArray(val)) return val;
          if (typeof val === 'string') {
            const t = val.trim();
            if (!t) return [];
            try {
              const parsed = JSON.parse(t);
              return Array.isArray(parsed) ? parsed : (t ? [t] : []);
            } catch {
              return t ? [t] : [];
            }
          }
          return [];
        };

        const parseAccounts = (val: unknown): any[] => {
          // Handle multiOptions dropdown (already an array)
          if (Array.isArray(val)) {
            return val.filter(Boolean); // Remove any null/undefined values
          }
          // Fallback to parseArray for backward compatibility with JSON strings
          return parseArray(val);
        };

        const parseMaybeObject = (val: string): any => {
          const t = (val || '').trim();
          if (!t) return undefined;
          if (t.startsWith('{') || t.startsWith('[')) {
            try { return JSON.parse(t); } catch { /* fallthrough */ }
          }
          return t;
        };

        const parseMediaImages = (val: unknown): string[] => {
          // Handle new simplified collection format
          if (val && typeof val === 'object' && 'images' in val) {
            const images = (val as any).images;
            if (Array.isArray(images)) {
              return images.map((img: any) => img?.url).filter(Boolean);
            }
          }
          // Fallback to old JSON string format for backward compatibility
          return parseArray(val);
        };

        const parseMediaVideo = (val: unknown): string | undefined => {
          // Handle new collection format
          if (val && typeof val === 'object' && 'video' in val) {
            const video = (val as any).video;
            // Check if video is an object with url property
            if (video && typeof video === 'object' && 'url' in video) {
              return video.url || undefined;
            }
            // Check if video is an array (fallback)
            if (Array.isArray(video) && video.length > 0) {
              return video[0]?.url || undefined;
            }
          }
          // Fallback to old string format for backward compatibility
          if (typeof val === 'string') {
            return parseMaybeObject(val);
          }
          return undefined;
        };

        const mediaImages = parseMediaImages(mediaImagesParam);
        const mediaVideo = parseMediaVideo(mediaVideoParam);
        const accounts = parseAccounts(accountsParam);

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
            scheduled_at: scheduledAt || undefined,
          },
        };
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
