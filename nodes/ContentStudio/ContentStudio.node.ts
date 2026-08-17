import type { IExecuteFunctions, IHttpRequestOptions, INodeExecutionData, INodeType, INodeTypeDescription, INodeProperties } from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes } from 'n8n-workflow';
import { getWorkspaces, getPosts, getAccounts, getFirstCommentAccounts, getCarouselAccounts, getContentCategories, getTeamMembers, getFacebookBackgrounds, getApprovalWorkflows, getSchedulingAccounts } from './loadOptions';
import { normalizeBase, parseAccounts, parseMediaImages, parseMediaVideo, parseCommaSeparated, parseJsonObject, parseSchedulingEntityRefs, flattenOptimalTimes } from './utils';
import { BASE_URL } from '../../credentials/ContentStudio.credentials';

const CREDENTIALS_TYPE = 'contentStudio';

type ThreadItemPayload = {
  message: string;
  image?: string[];
  media?: string[];
  video?: string;
};

function createThreadOptionsSection(
  enableName: string,
  displayName: string,
  optionsName: string,
  collectionName: string,
  useMediaList = false,
): INodeProperties[] {
  return [
    {
      displayName: `Enable ${displayName}`,
      name: enableName,
      type: 'boolean',
      default: false,
      description: `Whether to include ${displayName.toLowerCase()} in the post.`,
      displayOptions: { show: { resource: ['post'], operation: ['create', 'update'] } },
    },
    {
      displayName,
      name: optionsName,
      type: 'fixedCollection',
      placeholder: 'Add Thread Item',
      default: {
        [collectionName]: [
          {
            message: '',
            ...(useMediaList ? { media: {} } : { image: {}, video: {} }),
          },
        ],
      },
      typeOptions: {
        multipleValues: true,
      },
      options: [
        {
          name: collectionName,
          displayName: 'Thread Item',
          values: [
            {
              displayName: 'Message',
              name: 'message',
              type: 'string',
              default: '',
              description: 'Thread message text',
            },
            {
              displayName: useMediaList ? 'Media' : 'Image',
              name: useMediaList ? 'media' : 'image',
              type: 'fixedCollection',
              placeholder: useMediaList ? 'Add Media URL' : 'Add Image URL',
              default: {},
              typeOptions: {
                multipleValues: true,
              },
              options: [
                {
                  name: useMediaList ? 'media' : 'images',
                  displayName: useMediaList ? 'Media' : 'Images',
                  values: [
                    {
                      displayName: useMediaList ? 'Media URL' : 'Image URL',
                      name: 'url',
                      type: 'string',
                      default: '',
                      placeholder: useMediaList ? 'https://example.com/media.jpg' : 'https://example.com/image.jpg',
                      description: useMediaList ? 'URL of the media to include in this thread item' : 'URL of the image to include in this thread item',
                    },
                  ],
                },
              ],
            },
            ...((useMediaList ? [] : [
              {
                displayName: 'Video',
                name: 'video',
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
                        description: 'URL of the video to include in this thread item',
                      },
                    ],
                  },
                ],
              },
            ]) as INodeProperties[]),
          ],
        },
      ],
      displayOptions: { show: { resource: ['post'], operation: ['create', 'update'], [enableName]: [true] } },
    },
  ];
}

function parseThreadOptions(value: unknown, collectionName: string): ThreadItemPayload[] {
  if (!value || typeof value !== 'object') {
    return [];
  }

  const items = (value as Record<string, unknown>)[collectionName];

  if (!Array.isArray(items)) {
    return [];
  }

  const parsedItems: ThreadItemPayload[] = [];

  for (const item of items) {
    if (!item || typeof item !== 'object') {
      continue;
    }

    const threadItem = item as Record<string, unknown>;
    const message = typeof threadItem.message === 'string' ? threadItem.message.trim() : '';
    const media = parseThreadMediaList(threadItem);

    if (media.length > 0) {
      parsedItems.push({ message, media });
      continue;
    }

    const video = parseMediaVideo(threadItem.video);
    parsedItems.push({
      message,
      image: parseMediaImages(threadItem.image),
      ...(video ? { video } : {}),
    });
  }

  return parsedItems;
}

function parseThreadMediaList(threadItem: Record<string, unknown>): string[] {
  const media = threadItem.media;

  if (media && typeof media === 'object' && 'media' in (media as any)) {
    const values = (media as any).media;
    if (Array.isArray(values)) {
      return values.map((item: any) => item?.url).filter(Boolean);
    }
  }

  const legacyImages = parseMediaImages(threadItem.image);
  const legacyVideo = parseMediaVideo(threadItem.video);
  const legacyMediaIds = Array.isArray(threadItem.media_ids)
    ? threadItem.media_ids.filter((item): item is string => typeof item === 'string' && item.trim() !== '').map((item) => item.trim())
    : [];

  return [...legacyImages, ...legacyMediaIds, ...(legacyVideo ? [legacyVideo] : [])];
}

export class ContentStudio implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'ContentStudio',
    name: 'contentStudio',
    group: ['transform'],
    version: [4, 5],
    description: 'Integrate with ContentStudio API',
    defaults: { name: 'ContentStudio' },
    icon: 'file:contentstudio.png',
    subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
    inputs: [NodeConnectionTypes.Main],
    outputs: [NodeConnectionTypes.Main],
    credentials: [{ name: 'contentStudio', required: true }],
    properties: [
      // Resource selector
      {
        displayName: 'Resource',
        name: 'resource',
        type: 'options',
        noDataExpression: true,
        options: [
          { name: 'Approval Workflow', value: 'approvalWorkflow' },
          { name: 'Auth', value: 'auth' },
          { name: 'Campaign', value: 'campaign' },
          { name: 'Comment', value: 'comment' },
          { name: 'Content Category', value: 'contentCategory' },
          { name: 'Label', value: 'label' },
          { name: 'Media', value: 'media' },
          { name: 'Post', value: 'post' },
          { name: 'Scheduling', value: 'scheduling' },
          { name: 'Social Account', value: 'socialAccount' },
          { name: 'Team Member', value: 'teamMember' },
          { name: 'Workspace', value: 'workspace' },
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
        displayOptions: { show: { resource: ['approvalWorkflow'] } },
        options: [
          { name: 'List', value: 'list', action: 'List Approval Workflows' },
        ],
        default: 'list',
      },
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        displayOptions: { show: { resource: ['workspace'] } },
        options: [
          { name: 'List', value: 'list', action: 'List workspaces' },
          { name: 'Create', value: 'create', action: 'Create a workspace' },
          { name: 'Update', value: 'update', action: 'Update a workspace' },
          { name: 'Delete', value: 'delete', action: 'Delete a workspace' },
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
          { name: 'Remove', value: 'remove', action: 'Remove a Social Account' },
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
        displayOptions: { show: { resource: ['label'] } },
        options: [
          { name: 'List', value: 'list', action: 'List Labels' },
          { name: 'Create', value: 'create', action: 'Create a label' },
          { name: 'Update', value: 'update', action: 'Update a label' },
          { name: 'Delete', value: 'delete', action: 'Delete a label' },
        ],
        default: 'list',
      },
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        displayOptions: { show: { resource: ['campaign'] } },
        options: [
          { name: 'List', value: 'list', action: 'List Campaigns' },
          { name: 'Create', value: 'create', action: 'Create a campaign' },
          { name: 'Update', value: 'update', action: 'Update a campaign' },
          { name: 'Delete', value: 'delete', action: 'Delete a campaign' },
        ],
        default: 'list',
      },
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        displayOptions: { show: { resource: ['media'] } },
        options: [
          { name: 'List', value: 'list', action: 'List Media' },
          { name: 'Upload', value: 'upload', action: 'Upload Media' },
        ],
        default: 'list',
      },
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        displayOptions: { show: { resource: ['teamMember'] } },
        options: [
          { name: 'List', value: 'list', action: 'List Team Members' },
          { name: 'Create', value: 'create', action: 'Invite a team member' },
          { name: 'Update', value: 'update', action: 'Update a team member' },
          { name: 'Delete', value: 'delete', action: 'Remove a team member' },
        ],
        default: 'list',
      },
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        displayOptions: { show: { resource: ['comment'] } },
        options: [
          { name: 'List', value: 'list', action: 'List Comments' },
          { name: 'Create', value: 'create', action: 'Add Comment' },
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
          { name: 'Update', value: 'update', action: 'Update Social Post' },
          { name: 'Delete', value: 'delete', action: 'Delete Post' },
          { name: 'Approve/Reject', value: 'approve', action: 'Approve or Reject Post' },
        ],
        default: 'list',
      },
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        displayOptions: { show: { resource: ['scheduling'] } },
        options: [
          { name: 'Best Times to Post', value: 'bestTimes', action: 'Get the best times to post' },
        ],
        default: 'bestTimes',
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
            resource: ['socialAccount', 'contentCategory', 'label', 'campaign', 'media', 'teamMember', 'post', 'comment', 'approvalWorkflow', 'scheduling'],
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
          show: { resource: ['workspace', 'socialAccount', 'contentCategory', 'label', 'campaign', 'media', 'teamMember', 'post', 'comment', 'approvalWorkflow'], operation: ['list'] },
        },
      },
      {
        displayName: 'Per Page',
        name: 'perPage',
        type: 'number',
        default: 10,
        typeOptions: { minValue: 1, maxValue: 100 },
        displayOptions: {
          show: { resource: ['workspace', 'socialAccount', 'contentCategory', 'label', 'campaign', 'media', 'teamMember', 'post', 'comment', 'approvalWorkflow'], operation: ['list'] },
        },
      },

      // Workspace create/update/delete
      {
        displayName: 'Workspace ID',
        name: 'workspaceTargetId',
        type: 'options',
        typeOptions: { loadOptionsMethod: 'getWorkspaces' },
        default: '',
        required: true,
        description: 'The workspace to update or delete',
        displayOptions: { show: { resource: ['workspace'], operation: ['update', 'delete'] } },
      },
      {
        displayName: 'Name',
        name: 'wsName',
        type: 'string',
        default: '',
        description: 'Workspace name (max 35 characters). Required when creating.',
        displayOptions: { show: { resource: ['workspace'], operation: ['create', 'update'] } },
      },
      {
        displayName: 'Logo URL',
        name: 'wsLogo',
        type: 'string',
        default: '',
        description: 'Workspace logo URL. Required when creating.',
        displayOptions: { show: { resource: ['workspace'], operation: ['create', 'update'] } },
      },
      {
        displayName: 'Timezone',
        name: 'wsTimezone',
        type: 'string',
        default: '',
        description: 'IANA timezone, e.g. Asia/Karachi. Required when creating.',
        displayOptions: { show: { resource: ['workspace'], operation: ['create', 'update'] } },
      },
      {
        displayName: 'Super Admin ID',
        name: 'wsSuperAdminId',
        type: 'string',
        default: '',
        description:
          'Account owner to create the workspace under. Optional when you are the account owner or are linked to exactly one super admin; required when you manage multiple super admins.',
        displayOptions: { show: { resource: ['workspace'], operation: ['create'] } },
      },
      {
        displayName: 'Note',
        name: 'wsNote',
        type: 'string',
        default: '',
        displayOptions: { show: { resource: ['workspace'], operation: ['create', 'update'] } },
      },
      {
        displayName: 'Instagram Posting Method',
        name: 'wsInstagramPostingMethod',
        type: 'options',
        options: [
          { name: '— Not set —', value: '' },
          { name: 'API', value: 'api' },
          { name: 'Mobile', value: 'mobile' },
        ],
        default: '',
        displayOptions: { show: { resource: ['workspace'], operation: ['create', 'update'] } },
      },
      {
        displayName: 'First Day of Week',
        name: 'wsFirstDay',
        type: 'options',
        options: [
          { name: '— Not set —', value: '' },
          { name: 'Sunday', value: 'Sunday' },
          { name: 'Monday', value: 'Monday' },
          { name: 'Tuesday', value: 'Tuesday' },
          { name: 'Wednesday', value: 'Wednesday' },
          { name: 'Thursday', value: 'Thursday' },
          { name: 'Friday', value: 'Friday' },
          { name: 'Saturday', value: 'Saturday' },
        ],
        default: '',
        displayOptions: { show: { resource: ['workspace'], operation: ['create', 'update'] } },
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
      {
        displayName: 'Account',
        name: 'accountId',
        type: 'options',
        typeOptions: { loadOptionsMethod: 'getAccounts', loadOptionsDependsOn: ['workspaceId'] },
        default: '',
        required: true,
        description: 'The social account to remove (disconnect). This is the account _id returned by List Social Accounts.',
        displayOptions: {
          show: { resource: ['socialAccount'], operation: ['remove'] },
        },
      },

      // Label search
      {
        displayName: 'Search',
        name: 'labelSearch',
        type: 'string',
        default: '',
        description: 'Optional search term to filter labels by name',
        displayOptions: {
          show: { resource: ['label'], operation: ['list'] },
        },
      },

      // Label create/update/delete
      {
        displayName: 'Label ID',
        name: 'labelId',
        type: 'string',
        default: '',
        required: true,
        description: 'The _id of the label to update or delete (returned by List Labels)',
        displayOptions: {
          show: { resource: ['label'], operation: ['update', 'delete'] },
        },
      },
      {
        displayName: 'Name',
        name: 'labelName',
        type: 'string',
        default: '',
        required: true,
        description: 'Label name (max 100 characters)',
        displayOptions: {
          show: { resource: ['label'], operation: ['create'] },
        },
      },
      {
        displayName: 'Name',
        name: 'labelName',
        type: 'string',
        default: '',
        description: 'Label name (max 100 characters). Leave blank to keep the current value.',
        displayOptions: {
          show: { resource: ['label'], operation: ['update'] },
        },
      },
      {
        displayName: 'Color',
        name: 'labelColor',
        type: 'options',
        options: [
          { name: 'color_1  (#69c366)', value: 'color_1' },
          { name: 'color_2  (#5cc6ff)', value: 'color_2' },
          { name: 'color_3  (#ff6462)', value: 'color_3' },
          { name: 'color_4  (#fea28b)', value: 'color_4' },
          { name: 'color_5  (#ff5f31)', value: 'color_5' },
          { name: 'color_6  (#864de9)', value: 'color_6' },
          { name: 'color_7  (#e7af4d)', value: 'color_7' },
          { name: 'color_8  (#fa6ab6)', value: 'color_8' },
          { name: 'color_9  (#0095f3)', value: 'color_9' },
          { name: 'color_10 (#dc70ea)', value: 'color_10' },
          { name: 'color_11 (#456990)', value: 'color_11' },
          { name: 'color_12 (#028090)', value: 'color_12' },
          { name: 'color_13 (#ffa13f)', value: 'color_13' },
          { name: 'color_14 (#231942)', value: 'color_14' },
          { name: 'color_15 (#544c72)', value: 'color_15' },
          { name: 'color_16 (#975816)', value: 'color_16' },
          { name: 'color_17 (#0e4749)', value: 'color_17' },
          { name: 'color_18 (#a5be00)', value: 'color_18' },
          { name: 'color_19 (#fc1100)', value: 'color_19' },
          { name: 'color_20 (#000000)', value: 'color_20' },
        ],
        default: 'color_1',
        required: true,
        description: 'Color token for the label. The backend stores the token (e.g. color_1); the hex is shown for reference only.',
        displayOptions: {
          show: { resource: ['label'], operation: ['create'] },
        },
      },
      {
        displayName: 'Color',
        name: 'labelColor',
        type: 'options',
        options: [
          { name: '(keep current)', value: '' },
          { name: 'color_1  (#69c366)', value: 'color_1' },
          { name: 'color_2  (#5cc6ff)', value: 'color_2' },
          { name: 'color_3  (#ff6462)', value: 'color_3' },
          { name: 'color_4  (#fea28b)', value: 'color_4' },
          { name: 'color_5  (#ff5f31)', value: 'color_5' },
          { name: 'color_6  (#864de9)', value: 'color_6' },
          { name: 'color_7  (#e7af4d)', value: 'color_7' },
          { name: 'color_8  (#fa6ab6)', value: 'color_8' },
          { name: 'color_9  (#0095f3)', value: 'color_9' },
          { name: 'color_10 (#dc70ea)', value: 'color_10' },
          { name: 'color_11 (#456990)', value: 'color_11' },
          { name: 'color_12 (#028090)', value: 'color_12' },
          { name: 'color_13 (#ffa13f)', value: 'color_13' },
          { name: 'color_14 (#231942)', value: 'color_14' },
          { name: 'color_15 (#544c72)', value: 'color_15' },
          { name: 'color_16 (#975816)', value: 'color_16' },
          { name: 'color_17 (#0e4749)', value: 'color_17' },
          { name: 'color_18 (#a5be00)', value: 'color_18' },
          { name: 'color_19 (#fc1100)', value: 'color_19' },
          { name: 'color_20 (#000000)', value: 'color_20' },
        ],
        default: '',
        description: 'Color token for the label. Leave as "(keep current)" to leave color unchanged.',
        displayOptions: {
          show: { resource: ['label'], operation: ['update'] },
        },
      },

      // Campaign search
      {
        displayName: 'Search',
        name: 'campaignSearch',
        type: 'string',
        default: '',
        description: 'Optional search term to filter campaigns by name',
        displayOptions: {
          show: { resource: ['campaign'], operation: ['list'] },
        },
      },

      // Campaign create/update/delete
      {
        displayName: 'Campaign ID',
        name: 'campaignId',
        type: 'string',
        default: '',
        required: true,
        description: 'The _id of the campaign to update or delete (returned by List Campaigns)',
        displayOptions: {
          show: { resource: ['campaign'], operation: ['update', 'delete'] },
        },
      },
      {
        displayName: 'Name',
        name: 'campaignName',
        type: 'string',
        default: '',
        required: true,
        description: 'Campaign name (max 100 characters)',
        displayOptions: {
          show: { resource: ['campaign'], operation: ['create'] },
        },
      },
      {
        displayName: 'Name',
        name: 'campaignName',
        type: 'string',
        default: '',
        description: 'Campaign name (max 100 characters). Leave blank to keep the current value.',
        displayOptions: {
          show: { resource: ['campaign'], operation: ['update'] },
        },
      },
      {
        displayName: 'Color',
        name: 'campaignColor',
        type: 'options',
        options: [
          { name: 'color_1  (#69c366)', value: 'color_1' },
          { name: 'color_2  (#5cc6ff)', value: 'color_2' },
          { name: 'color_3  (#ff6462)', value: 'color_3' },
          { name: 'color_4  (#fea28b)', value: 'color_4' },
          { name: 'color_5  (#ff5f31)', value: 'color_5' },
          { name: 'color_6  (#864de9)', value: 'color_6' },
          { name: 'color_7  (#e7af4d)', value: 'color_7' },
          { name: 'color_8  (#fa6ab6)', value: 'color_8' },
          { name: 'color_9  (#0095f3)', value: 'color_9' },
          { name: 'color_10 (#dc70ea)', value: 'color_10' },
          { name: 'color_11 (#456990)', value: 'color_11' },
          { name: 'color_12 (#028090)', value: 'color_12' },
          { name: 'color_13 (#ffa13f)', value: 'color_13' },
          { name: 'color_14 (#231942)', value: 'color_14' },
          { name: 'color_15 (#544c72)', value: 'color_15' },
          { name: 'color_16 (#975816)', value: 'color_16' },
          { name: 'color_17 (#0e4749)', value: 'color_17' },
          { name: 'color_18 (#a5be00)', value: 'color_18' },
          { name: 'color_19 (#fc1100)', value: 'color_19' },
          { name: 'color_20 (#000000)', value: 'color_20' },
        ],
        default: 'color_1',
        required: true,
        description: 'Color token for the campaign. The backend stores the token (e.g. color_1); the hex is shown for reference only.',
        displayOptions: {
          show: { resource: ['campaign'], operation: ['create'] },
        },
      },
      {
        displayName: 'Color',
        name: 'campaignColor',
        type: 'options',
        options: [
          { name: '(keep current)', value: '' },
          { name: 'color_1  (#69c366)', value: 'color_1' },
          { name: 'color_2  (#5cc6ff)', value: 'color_2' },
          { name: 'color_3  (#ff6462)', value: 'color_3' },
          { name: 'color_4  (#fea28b)', value: 'color_4' },
          { name: 'color_5  (#ff5f31)', value: 'color_5' },
          { name: 'color_6  (#864de9)', value: 'color_6' },
          { name: 'color_7  (#e7af4d)', value: 'color_7' },
          { name: 'color_8  (#fa6ab6)', value: 'color_8' },
          { name: 'color_9  (#0095f3)', value: 'color_9' },
          { name: 'color_10 (#dc70ea)', value: 'color_10' },
          { name: 'color_11 (#456990)', value: 'color_11' },
          { name: 'color_12 (#028090)', value: 'color_12' },
          { name: 'color_13 (#ffa13f)', value: 'color_13' },
          { name: 'color_14 (#231942)', value: 'color_14' },
          { name: 'color_15 (#544c72)', value: 'color_15' },
          { name: 'color_16 (#975816)', value: 'color_16' },
          { name: 'color_17 (#0e4749)', value: 'color_17' },
          { name: 'color_18 (#a5be00)', value: 'color_18' },
          { name: 'color_19 (#fc1100)', value: 'color_19' },
          { name: 'color_20 (#000000)', value: 'color_20' },
        ],
        default: '',
        description: 'Color token for the campaign. Leave as "(keep current)" to leave color unchanged.',
        displayOptions: {
          show: { resource: ['campaign'], operation: ['update'] },
        },
      },

      // Media list filters
      {
        displayName: 'Media Type',
        name: 'mediaType',
        type: 'options',
        options: [
          { name: 'All', value: '' },
          { name: 'Images', value: 'images' },
          { name: 'Videos', value: 'videos' },
        ],
        default: '',
        description: 'Filter by media type',
        displayOptions: {
          show: { resource: ['media'], operation: ['list'] },
        },
      },
      {
        displayName: 'Search',
        name: 'mediaSearch',
        type: 'string',
        default: '',
        description: 'Search media by name',
        displayOptions: {
          show: { resource: ['media'], operation: ['list'] },
        },
      },
      {
        displayName: 'Sort',
        name: 'mediaSort',
        type: 'options',
        options: [
          { name: 'Recent', value: 'recent' },
          { name: 'Oldest', value: 'oldest' },
          { name: 'Size', value: 'size' },
          { name: 'A-Z', value: 'a2z' },
          { name: 'Z-A', value: 'z2a' },
        ],
        default: 'recent',
        description: 'Sort media results',
        displayOptions: {
          show: { resource: ['media'], operation: ['list'] },
        },
      },

      // Media upload fields
      {
        displayName: 'Media URL',
        name: 'mediaUrl',
        type: 'string',
        default: '',
        required: true,
        description: 'URL of the image or video to import into the media library',
        displayOptions: {
          show: { resource: ['media'], operation: ['upload'] },
        },
      },
      {
        displayName: 'Folder ID',
        name: 'mediaFolderId',
        type: 'string',
        default: '',
        description: 'Optional folder ID to upload the media into',
        displayOptions: {
          show: { resource: ['media'], operation: ['upload'] },
        },
      },

      // Team member search
      {
        displayName: 'Search',
        name: 'teamSearch',
        type: 'string',
        default: '',
        description: 'Optional search term to filter team members by name or email',
        displayOptions: {
          show: { resource: ['teamMember'], operation: ['list'] },
        },
      },

      // Team member create/update/delete
      {
        displayName: 'Member ID',
        name: 'teamMemberId',
        type: 'string',
        default: '',
        required: true,
        description: 'Membership id (the member_id field returned by List Team Members)',
        displayOptions: {
          show: { resource: ['teamMember'], operation: ['update', 'delete'] },
        },
      },
      {
        displayName: 'Role',
        name: 'teamRole',
        type: 'options',
        options: [
          { name: 'Admin', value: 'admin' },
          { name: 'Approver', value: 'approver' },
          { name: 'Collaborator', value: 'collaborator' },
        ],
        default: 'collaborator',
        required: true,
        displayOptions: {
          show: { resource: ['teamMember'], operation: ['create', 'update'] },
        },
      },
      {
        displayName: 'Membership',
        name: 'teamMembership',
        type: 'options',
        options: [
          { name: 'Team', value: 'team' },
          { name: 'Client', value: 'client' },
        ],
        default: 'team',
        displayOptions: {
          show: { resource: ['teamMember'], operation: ['create', 'update'] },
        },
      },
      {
        displayName: 'Email',
        name: 'teamEmail',
        type: 'string',
        default: '',
        required: true,
        placeholder: 'name@example.com',
        description: 'Email address of the member to invite',
        displayOptions: {
          show: { resource: ['teamMember'], operation: ['create'] },
        },
      },
      {
        displayName: 'Permissions (JSON)',
        name: 'teamPermissions',
        type: 'json',
        default: '{}',
        description:
          'Permission object — ROLE-AWARE: pass only booleans valid for the chosen role, else the API returns 422. ' +
          'Shared (any role): accessSharedFolder, allow_workflow_management. ' +
          'collaborator: addBlog, addSocial, addSource, addTopic, viewTeam, rescheduleQueue, postsReview, changeFBGroupPublishAs, hasListeningAccess. ' +
          'approver: approverCanEditPost, approverCanAddNotes, approverCanCreatePost. admin: hasBillingAccess. ' +
          'Account-access arrays of IDs (any role): facebook, instagram, threads, twitter, linkedin, pinterest, telegram, youtube, tiktok, tumblr, tumblr_blogs, tumblr_profiles, bluesky, gmb, wordpress, medium, shopify, webflow; plus content_categories[].',
        displayOptions: {
          show: { resource: ['teamMember'], operation: ['create', 'update'] },
        },
      },
      {
        displayName: 'Confirm Removal',
        name: 'teamConfirmed',
        type: 'boolean',
        default: false,
        description:
          'Whether to confirm removal when the member is part of approval workflows or in-flight posts (otherwise the API returns REQUIRES_REMOVAL_CONFIRMATION)',
        displayOptions: {
          show: { resource: ['teamMember'], operation: ['delete'] },
        },
      },

      // Comment fields
      {
        displayName: 'Post ID',
        name: 'commentPostId',
        type: 'string',
        default: '',
        required: true,
        description: 'The post ID to fetch comments for or add a comment to',
        displayOptions: {
          show: { resource: ['comment'] },
        },
      },
      {
        displayName: 'Comment Text',
        name: 'commentText',
        type: 'string',
        default: '',
        required: true,
        description: 'The comment text to add',
        displayOptions: {
          show: { resource: ['comment'], operation: ['create'] },
        },
      },
      {
        displayName: 'Internal Note',
        name: 'commentIsNote',
        type: 'boolean',
        default: false,
        description: 'Whether this is an internal note (private, not visible to clients)',
        displayOptions: {
          show: { resource: ['comment'], operation: ['create'] },
        },
      },
      {
        displayName: 'Mentioned User IDs',
        name: 'commentMentionedUsers',
        type: 'string',
        default: '',
        description: 'Comma-separated user IDs to mention in the comment',
        displayOptions: {
          show: { resource: ['comment'], operation: ['create'] },
        },
      },

      // Posts list filters
      {
        displayName: 'Statuses',
        name: 'statusesCsv',
        type: 'multiOptions',
        default: [],
        description: 'Filter posts by their publishing status. Leave empty to return posts with any status.',
        options: [
          { name: 'Published', value: 'published' },
          { name: 'Scheduled', value: 'scheduled' },
          { name: 'Draft', value: 'draft' },
          { name: 'Failed', value: 'failed' },
          { name: 'Partially Failed', value: 'partially_failed' },
          { name: 'In Review', value: 'under_review' },
          { name: 'Missed Review', value: 'missed_review' },
          { name: 'Rejected', value: 'rejected' },
          { name: 'In Progress', value: 'in_progress' },
          { name: 'Notification Sent', value: 'notification_sent' },
          { name: 'Notification Declined', value: 'notification_declined' },
        ],
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

      {
        displayName: 'Approval Assigned To',
        name: 'approvalAssignedTo',
        type: 'string',
        default: '',
        description: 'Filter by approver user IDs (comma-separated). Get IDs from the Team Member resource.',
        displayOptions: {
          show: { resource: ['post'], operation: ['list'] },
        },
      },
      {
        displayName: 'Approval Requested By',
        name: 'approvalRequestedBy',
        type: 'string',
        default: '',
        description: 'Filter by users who requested approval (comma-separated). Get IDs from the Team Member resource.',
        displayOptions: {
          show: { resource: ['post'], operation: ['list'] },
        },
      },
      {
        displayName: 'Labels',
        name: 'labelsCsv',
        type: 'string',
        default: '',
        description: 'Filter by label IDs (comma-separated).',
        displayOptions: {
          show: { resource: ['post'], operation: ['list'] },
        },
      },
      {
        displayName: 'Campaigns',
        name: 'campaignsCsv',
        type: 'string',
        default: '',
        description: 'Filter by campaign IDs (comma-separated).',
        displayOptions: {
          show: { resource: ['post'], operation: ['list'] },
        },
      },
      {
        displayName: 'Content Categories',
        name: 'contentCategoryCsv',
        type: 'string',
        default: '',
        description: 'Filter by content category IDs (comma-separated).',
        displayOptions: {
          show: { resource: ['post'], operation: ['list'] },
        },
      },
      {
        displayName: 'Created By',
        name: 'createdByCsv',
        type: 'string',
        default: '',
        description: 'Filter by user IDs who created the posts (comma-separated). Get IDs from the Team Member resource.',
        displayOptions: {
          show: { resource: ['post'], operation: ['list'] },
        },
      },
      {
        displayName: 'Comment Status',
        name: 'commentStatus',
        type: 'options',
        options: [
          { name: 'All', value: 'all' },
          { name: 'Resolved', value: 'resolved' },
          { name: 'Unresolved', value: 'unresolved' },
        ],
        default: 'all',
        description: 'Filter posts by comment resolution status. "All" returns all posts regardless of comment state.',
        displayOptions: {
          show: { resource: ['post'], operation: ['list'] },
        },
      },

      // Posts approve fields
      {
        displayName: 'Post/Plan ID',
        name: 'planId',
        type: 'string',
        default: '',
        required: true,
        description: 'The ID of the post (plan) to approve or reject. Get this from the Post List operation.',
        displayOptions: { show: { resource: ['post'], operation: ['approve'] } },
      },
      {
        displayName: 'Action',
        name: 'approvalAction',
        type: 'options',
        options: [
          { name: 'Approve', value: 'approve' },
          { name: 'Reject', value: 'reject' },
        ],
        default: 'approve',
        required: true,
        description: 'Choose whether to approve or reject the post',
        displayOptions: { show: { resource: ['post'], operation: ['approve'] } },
      },
      {
        displayName: 'Comment',
        name: 'approvalComment',
        type: 'string',
        default: '',
        description: 'Optional comment for the approval or rejection',
        displayOptions: { show: { resource: ['post'], operation: ['approve'] } },
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
        displayName: 'Post ID',
        name: 'updatePostId',
        type: 'string',
        default: '',
        required: true,
        placeholder: 'Enter post ID',
        description: 'The ID of the post to update. Get this from the Post List operation. Update is rejected (422) when the post status is already "published" or "processing".',
        displayOptions: { show: { resource: ['post'], operation: ['update'] } },
      },
      {
        displayName: 'Accounts',
        name: 'accounts',
        type: 'multiOptions',
        typeOptions: { loadOptionsMethod: 'getAccounts', loadOptionsDependsOn: ['workspaceId'] },
        default: [],
        required: false,
        description: 'Select one or more social accounts to publish to. Optional if using Content Category (accounts will be merged from category).',
        displayOptions: { show: { resource: ['post'], operation: ['create', 'update'] } },
      },
      {
        displayName: 'Content Text',
        name: 'contentText',
        type: 'string',
        default: '',
        displayOptions: { show: { resource: ['post'], operation: ['create', 'update'] } },
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
        displayOptions: { show: { resource: ['post'], operation: ['create', 'update'] } },
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
        displayOptions: { show: { resource: ['post'], operation: ['create', 'update'] } },
      },
      ...createThreadOptionsSection('hasTwitterOptions', 'Twitter Options', 'twitterOptions', 'threadedTweets', true),
      ...createThreadOptionsSection('hasThreadsOptions', 'Threads Options', 'threadsOptions', 'multiThreads', true),
      {
        displayName: 'Enable Facebook Options',
        name: 'hasFacebookBackground',
        type: 'boolean',
        default: false,
        description: 'Whether to add Facebook-specific options (e.g. a colored/gradient/image background for a plain-text Facebook post). Only applies to Facebook accounts on text-only posts.',
        displayOptions: { show: { resource: ['post'], operation: ['create', 'update'] } },
      },
      {
        displayName: 'Facebook Text-Post Background',
        name: 'facebookBackgroundId',
        type: 'options',
        typeOptions: { loadOptionsMethod: 'getFacebookBackgrounds' },
        default: '',
        required: false,
        description: 'Pick a background preset. The backend rejects the post if images or video are attached.',
        displayOptions: { show: { resource: ['post'], operation: ['create', 'update'], hasFacebookBackground: [true] } },
      },
      {
        displayName: 'Enable Facebook Carousel',
        name: 'hasFacebookCarousel',
        type: 'boolean',
        default: false,
        description: 'Whether to publish as a Facebook multi-card carousel post (2-10 link cards). Requires at least one Facebook account selected above. Carousel is image-only — video is not allowed.',
        displayOptions: { show: { resource: ['post'], operation: ['create', 'update'] } },
      },
      {
        displayName: 'Carousel Cards',
        name: 'carouselCards',
        type: 'fixedCollection',
        placeholder: 'Add Card',
        default: { card: [{ image: '', title: '', description: '', link: '' }, { image: '', title: '', description: '', link: '' }] },
        typeOptions: { multipleValues: true, minValue: 2, maxValue: 10 },
        description: 'Between 2 and 10 carousel cards. Each card needs an image URL and a destination link.',
        displayOptions: { show: { resource: ['post'], operation: ['create', 'update'], hasFacebookCarousel: [true] } },
        options: [
          {
            name: 'card',
            displayName: 'Card',
            values: [
              { displayName: 'Image URL', name: 'image', type: 'string', default: '', required: true, placeholder: 'https://example.com/card.jpg', description: 'Card image URL. External URLs are uploaded to the media library.' },
              { displayName: 'Title', name: 'title', type: 'string', default: '', description: 'Optional card title (max 255 chars).' },
              { displayName: 'Description', name: 'description', type: 'string', default: '', description: 'Optional card description (max 1000 chars).' },
              { displayName: 'Destination URL', name: 'link', type: 'string', default: '', required: true, placeholder: 'https://example.com/landing', description: 'Destination URL when this card is tapped.' },
            ],
          },
        ],
      },
      {
        displayName: 'Call To Action Button',
        name: 'carouselCallToAction',
        type: 'options',
        default: 'NO_BUTTON',
        description: 'CTA button shown on every card.',
        displayOptions: { show: { resource: ['post'], operation: ['create', 'update'], hasFacebookCarousel: [true] } },
        options: [
          { name: 'No Button', value: 'NO_BUTTON' },
          { name: 'Add To Cart', value: 'ADD_TO_CART' },
          { name: 'Apply Now', value: 'APPLY_NOW' },
          { name: 'Bet Now', value: 'BET_NOW' },
          { name: 'Book Now', value: 'BOOK_TRAVEL' },
          { name: 'Buy Now', value: 'BUY_NOW' },
          { name: 'Buy Tickets', value: 'BUY_TICKETS' },
          { name: 'Call Now', value: 'CALL_NOW' },
          { name: 'Contact Us', value: 'CONTACT_US' },
          { name: 'Download', value: 'DOWNLOAD' },
          { name: 'Get Directions', value: 'GET_DIRECTIONS' },
          { name: 'Get Offer', value: 'GET_OFFER' },
          { name: 'Get Quote', value: 'GET_QUOTE' },
          { name: 'Go Live', value: 'GO_LIVE' },
          { name: 'Install Now', value: 'INSTALL_MOBILE_APP' },
          { name: 'Learn More', value: 'LEARN_MORE' },
          { name: 'Like Page', value: 'LIKE_PAGE' },
          { name: 'Listen Now', value: 'LISTEN_MUSIC' },
          { name: 'Open Link', value: 'OPEN_LINK' },
          { name: 'Order Now', value: 'ORDER_NOW' },
          { name: 'Play Game', value: 'PLAY_GAME' },
          { name: 'Register Now', value: 'REGISTER_NOW' },
          { name: 'Request Time', value: 'REQUEST_TIME' },
          { name: 'Save', value: 'SAVE' },
          { name: 'Send Message', value: 'MESSAGE_PAGE' },
          { name: 'Send Message to WhatsApp', value: 'WHATSAPP_MESSAGE' },
          { name: 'Shop Now', value: 'SHOP_NOW' },
          { name: 'Sign Up', value: 'SIGN_UP' },
          { name: 'Subscribe', value: 'SUBSCRIBE' },
          { name: 'Use App', value: 'USE_APP' },
          { name: 'Watch More', value: 'WATCH_MORE' },
          { name: 'Watch Video', value: 'WATCH_VIDEO' },
        ],
      },
      {
        displayName: 'Include End Card',
        name: 'carouselEndCard',
        type: 'boolean',
        default: false,
        description: 'Whether to include the Facebook end card after the last card.',
        displayOptions: { show: { resource: ['post'], operation: ['create', 'update'], hasFacebookCarousel: [true] } },
      },
      {
        displayName: 'End Card URL',
        name: 'carouselEndCardUrl',
        type: 'string',
        default: '',
        placeholder: 'https://example.com',
        description: 'Destination URL for the end card. Falls back to the first card\'s link when omitted.',
        displayOptions: { show: { resource: ['post'], operation: ['create', 'update'], hasFacebookCarousel: [true] } },
      },
      {
        displayName: 'Carousel Target Accounts',
        name: 'carouselAccounts',
        type: 'multiOptions',
        typeOptions: { loadOptionsMethod: 'getCarouselAccounts', loadOptionsDependsOn: ['workspaceId', 'accounts'] },
        default: [],
        description: 'Restrict carousel mode to a subset of your selected Facebook accounts. Leave empty to apply carousel to ALL Facebook accounts in this post. Only Facebook accounts from the selected accounts above are shown.',
        displayOptions: { show: { resource: ['post'], operation: ['create', 'update'], hasFacebookCarousel: [true] } },
      },
      {
        displayName: 'Facebook Reel Collaborators',
        name: 'facebookCollaborators',
        type: 'string',
        default: '',
        placeholder: '1234567890, @mypage, https://facebook.com/mypage',
        description: 'Comma-separated Facebook Page identifiers to invite as Reel collaborators (max 10). Each item is a Facebook Page: a numeric Page ID (recommended), an @username, or a Page URL. Applied server-side only when the post resolves to a Facebook reel (post type "Reel" or "Reel + Story" with a video); ignored otherwise. Facebook allows up to 10 invites per Page per 24h.',
        displayOptions: { show: { resource: ['post'], operation: ['create', 'update'], hasFacebookBackground: [true] } },
      },
      {
        displayName: 'Enable Instagram Options',
        name: 'hasInstagramOptions',
        type: 'boolean',
        default: false,
        description: 'Whether to add Instagram-specific options (e.g. collaborators/co-authors). Only applies to Instagram accounts.',
        displayOptions: { show: { resource: ['post'], operation: ['create', 'update'] } },
      },
      {
        displayName: 'Instagram Collaborators',
        name: 'instagramCollaborators',
        type: 'string',
        default: '',
        placeholder: 'username1, username2, username3',
        description: 'Comma-separated Instagram usernames to invite as collaborators/co-authors (max 3). Applied to any non-story Instagram post.',
        displayOptions: { show: { resource: ['post'], operation: ['create', 'update'], hasInstagramOptions: [true] } },
      },
      {
        displayName: 'Enable LinkedIn Options',
        name: 'hasLinkedinOptions',
        type: 'boolean',
        default: false,
        description: 'Whether to add LinkedIn-specific options (a document/post title and/or a poll). Only applies to LinkedIn accounts.',
        displayOptions: { show: { resource: ['post'], operation: ['create', 'update'] } },
      },
      {
        displayName: 'LinkedIn Title',
        name: 'linkedinTitle',
        type: 'string',
        default: '',
        description: 'Optional LinkedIn post/document title (max 255 characters).',
        displayOptions: { show: { resource: ['post'], operation: ['create', 'update'], hasLinkedinOptions: [true] } },
      },
      {
        displayName: 'Enable LinkedIn Poll',
        name: 'linkedinEnablePoll',
        type: 'boolean',
        default: false,
        description: 'Whether to attach a LinkedIn poll. A poll requires Post Type = "Poll" and a text-only post (no images or video).',
        displayOptions: { show: { resource: ['post'], operation: ['create', 'update'], hasLinkedinOptions: [true] } },
      },
      {
        displayName: 'Poll Question',
        name: 'linkedinPollQuestion',
        type: 'string',
        default: '',
        required: true,
        description: 'The poll question (max 140 characters).',
        displayOptions: { show: { resource: ['post'], operation: ['create', 'update'], hasLinkedinOptions: [true], linkedinEnablePoll: [true] } },
      },
      {
        displayName: 'Poll Options',
        name: 'linkedinPollOptions',
        type: 'string',
        default: '',
        required: true,
        placeholder: 'Option A, Option B',
        description: 'Comma-separated poll options: between 2 and 4 options, each max 30 characters.',
        displayOptions: { show: { resource: ['post'], operation: ['create', 'update'], hasLinkedinOptions: [true], linkedinEnablePoll: [true] } },
      },
      {
        displayName: 'Poll Duration',
        name: 'linkedinPollDuration',
        type: 'options',
        options: [
          { name: '1 Day', value: 'ONE_DAY' },
          { name: '3 Days', value: 'THREE_DAYS' },
          { name: '7 Days', value: 'SEVEN_DAYS' },
          { name: '14 Days', value: 'FOURTEEN_DAYS' },
        ],
        default: 'ONE_DAY',
        required: true,
        description: 'How long the poll stays open.',
        displayOptions: { show: { resource: ['post'], operation: ['create', 'update'], hasLinkedinOptions: [true], linkedinEnablePoll: [true] } },
      },
      {
        displayName: 'Post Type',
        name: 'postType',
        type: 'options',
        default: 'feed',
        description: 'Optional post type. Platform-specific. For Facebook carousel posts you may set "Carousel" here, but you must also enable Facebook Carousel above with at least 2 cards. For a LinkedIn poll set "Poll" here and enable LinkedIn Options → Poll below (poll posts must be text-only — no images or video).',
        options: [
          { name: 'Feed', value: 'feed' },
          { name: 'Feed + Reel', value: 'feed+reel' },
          { name: 'Reel', value: 'reel' },
          { name: 'Carousel', value: 'carousel' },
          { name: 'Story', value: 'story' },
          { name: 'Feed + Story', value: 'feed+story' },
          { name: 'Feed + Reel + Story', value: 'feed+reel+story' },
          { name: 'Reel + Story', value: 'reel+story' },
          { name: 'Carousel + Story', value: 'carousel+story' },
          { name: 'Video', value: 'video' },
          { name: 'Shorts', value: 'shorts' },
          { name: 'Poll', value: 'poll' },
        ],
        displayOptions: { show: { resource: ['post'], operation: ['create', 'update'] } },
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
        displayOptions: { show: { resource: ['post'], operation: ['create', 'update'] } },
      },
      {
        displayName: 'Content Category',
        name: 'contentCategoryId',
        type: 'options',
        typeOptions: { loadOptionsMethod: 'getContentCategories', loadOptionsDependsOn: ['workspaceId'] },
        default: '',
        required: true,
        description: 'Select a content category. Accounts from the category will be used if no accounts are selected.',
        displayOptions: { show: { resource: ['post'], operation: ['create', 'update'], publishType: ['content_category'] } },
      },
      {
        displayName: 'Scheduled At',
        name: 'scheduledAt',
        type: 'string',
        required: true,
        default: '',
        placeholder: '2025-10-11 11:15:00',
        description: 'Schedule date and time in format: YYYY-MM-DD HH:MM:SS',
        displayOptions: { show: { resource: ['post'], operation: ['create', 'update'], publishType: ['scheduled'] } },
      },
      {
        displayName: 'Enable First Comment',
        name: 'hasFirstComment',
        type: 'boolean',
        default: false,
        description: 'Whether to add a first comment to the post',
        displayOptions: { show: { resource: ['post'], operation: ['create', 'update'] } },
      },
      {
        displayName: 'Comment Message',
        name: 'firstCommentMessage',
        type: 'string',
        required: true,
        default: '',
        placeholder: 'Enter your first comment...',
        description: 'The message to post as the first comment',
        displayOptions: { show: { resource: ['post'], operation: ['create', 'update'], hasFirstComment: [true] } },
      },
      {
        displayName: 'Comment Accounts',
        name: 'firstCommentAccounts',
        type: 'multiOptions',
        typeOptions: { loadOptionsMethod: 'getFirstCommentAccounts', loadOptionsDependsOn: ['workspaceId', 'accounts'] },
        required: false,
        default: [],
        description: 'Select accounts to add the first comment. Optional if using Content Category (accounts will be merged from category).',
        displayOptions: { show: { resource: ['post'], operation: ['create', 'update'], hasFirstComment: [true] } },
      },

      // Post create — approval fields
      {
        displayName: 'Send for Approval',
        name: 'sendForApproval',
        type: 'boolean',
        default: false,
        description: 'Whether to send this post for approval before publishing',
        displayOptions: { show: { resource: ['post'], operation: ['create', 'update'] } },
      },
      {
        displayName: 'Approver IDs',
        name: 'approvers',
        type: 'string',
        default: '',
        required: true,
        description: 'Comma-separated user IDs of team members who can approve. Get IDs from the Team Member resource.',
        displayOptions: { show: { resource: ['post'], operation: ['create', 'update'], sendForApproval: [true] } },
      },
      {
        displayName: 'Approval Mode',
        name: 'approveOption',
        type: 'options',
        options: [
          { name: 'Anyone', value: 'anyone' },
          { name: 'Everyone', value: 'everyone' },
        ],
        default: 'anyone',
        description: '"Anyone" = any single approver can approve. "Everyone" = all approvers must approve.',
        displayOptions: { show: { resource: ['post'], operation: ['create', 'update'], sendForApproval: [true] } },
      },
      {
        displayName: 'Notes for Approvers',
        name: 'approvalNotes',
        type: 'string',
        default: '',
        description: 'Optional notes for the approvers',
        displayOptions: { show: { resource: ['post'], operation: ['create', 'update'], sendForApproval: [true] } },
      },

      // Post create/update — multi-level approval workflow (mutually exclusive with the legacy approval above)
      {
        displayName: 'Use Approval Workflow',
        name: 'useApprovalWorkflow',
        type: 'boolean',
        default: false,
        description: 'Whether to attach a multi-level approval workflow to this post. Mutually exclusive with "Send for Approval" above — enable only one. Use the Approval Workflow resource to list available workflows.',
        displayOptions: { show: { resource: ['post'], operation: ['create', 'update'] } },
      },
      {
        displayName: 'Approval Workflow',
        name: 'approvalWorkflowId',
        type: 'options',
        typeOptions: { loadOptionsMethod: 'getApprovalWorkflows', loadOptionsDependsOn: ['workspaceId'] },
        default: '',
        description: 'The workflow to attach to the post (its _id). On create this is required to attach a workflow. On update, set this to (re)attach a workflow, OR leave it empty and choose a Workflow Action instead — provide exactly one of the two.',
        displayOptions: { show: { resource: ['post'], operation: ['create', 'update'], useApprovalWorkflow: [true] } },
      },
      {
        displayName: 'Workflow Action',
        name: 'approvalWorkflowAction',
        type: 'options',
        options: [
          { name: '— None (attach via Approval Workflow above) —', value: '' },
          { name: 'Restart', value: 'restart' },
          { name: 'Resume', value: 'resume' },
          { name: 'Renotify Current', value: 'renotify_current' },
          { name: 'Keep', value: 'keep' },
          { name: 'Remove', value: 'remove' },
        ],
        default: '',
        description: 'Update-only action on the already-attached workflow. Provide exactly one of Approval Workflow (attach) or Workflow Action — not both.',
        displayOptions: { show: { resource: ['post'], operation: ['update'], useApprovalWorkflow: [true] } },
      },
      {
        displayName: 'Workflow Notes',
        name: 'approvalWorkflowNotes',
        type: 'string',
        default: '',
        description: 'Optional notes for the approval workflow.',
        displayOptions: { show: { resource: ['post'], operation: ['create', 'update'], useApprovalWorkflow: [true] } },
      },

      // Post create — labels & campaign
      {
        displayName: 'Label IDs',
        name: 'labels',
        type: 'string',
        default: '',
        description: 'Comma-separated label IDs to assign to the post. Get IDs from the Label resource. Max 20.',
        displayOptions: { show: { resource: ['post'], operation: ['create', 'update'] } },
      },
      {
        displayName: 'Campaign ID',
        name: 'campaignId',
        type: 'string',
        default: '',
        description: 'Campaign ID to assign the post to. Get the ID from the Campaign resource.',
        displayOptions: { show: { resource: ['post'], operation: ['create', 'update'] } },
      },

      // Scheduling — best times to post
      {
        displayName:
          'Recommended times are always returned in the workspace timezone (echoed as "timezone" on every slot). The API has no period or timezone parameter — it analyses the accounts\' full available publishing history.',
        name: 'bestTimesNotice',
        type: 'notice',
        default: '',
        displayOptions: { show: { resource: ['scheduling'], operation: ['bestTimes'] } },
      },
      {
        displayName: 'Accounts',
        name: 'bestTimesAccounts',
        type: 'multiOptions',
        typeOptions: { loadOptionsMethod: 'getSchedulingAccounts', loadOptionsDependsOn: ['workspaceId'] },
        default: [],
        description: 'Accounts to analyse. Leave empty to analyse every account connected to the workspace.',
        displayOptions: { show: { resource: ['scheduling'], operation: ['bestTimes'] } },
      },
      {
        displayName: 'Output',
        name: 'bestTimesOutput',
        type: 'options',
        options: [
          { name: 'Ranked Slots (Pooled)', value: 'global' },
          { name: 'Ranked Slots (Pooled + Per Account)', value: 'all' },
          { name: 'Full Response', value: 'raw' },
        ],
        default: 'global',
        description:
          'Ranked Slots returns one item per recommended time, best-first, each with a "scheduled_at" value (YYYY-MM-DD HH:MM:SS) you can feed straight into Post → Create. Full Response returns the raw API payload including the heatmap matrix.',
        displayOptions: { show: { resource: ['scheduling'], operation: ['bestTimes'] } },
      },
      {
        displayName: 'Pooled Slots',
        name: 'bestTimesGlobalSlots',
        type: 'number',
        default: 5,
        typeOptions: { minValue: 1, maxValue: 24 },
        description: 'How many recommended times to return in the pooled view across all analysed accounts',
        displayOptions: { show: { resource: ['scheduling'], operation: ['bestTimes'] } },
      },
      {
        displayName: 'Per Account Slots',
        name: 'bestTimesPerAccountSlots',
        type: 'number',
        default: 3,
        typeOptions: { minValue: 1, maxValue: 24 },
        description: 'How many recommended times to return for each analysed account',
        displayOptions: { show: { resource: ['scheduling'], operation: ['bestTimes'] } },
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
      getCarouselAccounts,
      getContentCategories,
      getTeamMembers,
      getFacebookBackgrounds,
      getApprovalWorkflows,
      getSchedulingAccounts,
    },
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const returnData: INodeExecutionData[] = [];

    const WEEK_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    for (let i = 0; i < items.length; i++) {
      try {
      const resource = this.getNodeParameter('resource', i) as string;
      const operation = this.getNodeParameter('operation', i) as string;

      const baseRoot = normalizeBase(BASE_URL);

      // Set by operations that reshape the API payload into multiple output items
      let transformResponse: ((response: any) => Array<Record<string, any>>) | undefined;

      // Base request options
      const options: IHttpRequestOptions = {
        method: 'GET',
        url: '',
        qs: {},
        body: {},
        json: true,
        headers: { accept: 'application/json' },
        timeout: 60000,
      };

      // Routes
      if (resource === 'auth' && operation === 'validateKey') {
        options.method = 'GET';
        options.url = `${baseRoot}/v1/me`;
      }

      if (resource === 'approvalWorkflow' && operation === 'list') {
        const workspaceId = this.getNodeParameter('workspaceId', i) as string;
        const page = this.getNodeParameter('page', i) as number;
        const perPage = this.getNodeParameter('perPage', i) as number;
        options.method = 'GET';
        options.url = `${baseRoot}/v1/workspaces/${workspaceId}/approval-workflows`;
        options.qs = { page, per_page: perPage };
      }

      if (resource === 'workspace' && operation === 'list') {
        const page = this.getNodeParameter('page', i) as number;
        const perPage = this.getNodeParameter('perPage', i) as number;
        options.method = 'GET';
        options.url = `${baseRoot}/v1/workspaces`;
        options.qs = { page, per_page: perPage };
      }

      if (resource === 'workspace' && operation === 'create') {
        const name = this.getNodeParameter('wsName', i) as string;
        const logo = this.getNodeParameter('wsLogo', i) as string;
        const timezone = this.getNodeParameter('wsTimezone', i) as string;
        if (!name || !logo || !timezone) {
          throw new Error('Name, Logo URL and Timezone are required to create a workspace');
        }
        const body: Record<string, any> = { name, logo, timezone };
        const superAdminId = this.getNodeParameter('wsSuperAdminId', i) as string;
        if (superAdminId) body.super_admin_id = superAdminId;
        const note = this.getNodeParameter('wsNote', i) as string;
        if (note) body.note = note;
        const ig = this.getNodeParameter('wsInstagramPostingMethod', i) as string;
        if (ig) body.instagram_posting_method = ig;
        const firstDay = this.getNodeParameter('wsFirstDay', i) as string;
        if (firstDay) {
          body.first_day = { day: firstDay, key: WEEK_DAYS.indexOf(firstDay) };
        }
        options.method = 'POST';
        options.url = `${baseRoot}/v1/workspaces`;
        options.body = body;
      }

      if (resource === 'workspace' && operation === 'update') {
        const workspaceId = this.getNodeParameter('workspaceTargetId', i) as string;
        const body: Record<string, any> = {};
        const name = this.getNodeParameter('wsName', i) as string;
        if (name) body.name = name;
        const logo = this.getNodeParameter('wsLogo', i) as string;
        if (logo) body.logo = logo;
        const timezone = this.getNodeParameter('wsTimezone', i) as string;
        if (timezone) body.timezone = timezone;
        const note = this.getNodeParameter('wsNote', i) as string;
        if (note) body.note = note;
        const ig = this.getNodeParameter('wsInstagramPostingMethod', i) as string;
        if (ig) body.instagram_posting_method = ig;
        const firstDay = this.getNodeParameter('wsFirstDay', i) as string;
        if (firstDay) {
          body.first_day = { day: firstDay, key: WEEK_DAYS.indexOf(firstDay) };
        }
        if (Object.keys(body).length === 0) {
          throw new Error('Provide at least one field to update');
        }
        options.method = 'PUT';
        options.url = `${baseRoot}/v1/workspaces/${workspaceId}`;
        options.body = body;
      }

      if (resource === 'workspace' && operation === 'delete') {
        const workspaceId = this.getNodeParameter('workspaceTargetId', i) as string;
        options.method = 'DELETE';
        options.url = `${baseRoot}/v1/workspaces/${workspaceId}`;
      }

      if (resource === 'socialAccount' && operation === 'list') {
        const workspaceId = this.getNodeParameter('workspaceId', i) as string;
        const page = this.getNodeParameter('page', i) as number;
        const perPage = this.getNodeParameter('perPage', i) as number;
        const platform = (this.getNodeParameter('platform', i) as string) || undefined;
        options.method = 'GET';
        options.url = `${baseRoot}/v1/workspaces/${workspaceId}/accounts`;
        options.qs = { page, per_page: perPage } as any;
        if (platform) (options.qs as any).platform = platform;
      }

      if (resource === 'socialAccount' && operation === 'remove') {
        const workspaceId = this.getNodeParameter('workspaceId', i) as string;
        const accountId = this.getNodeParameter('accountId', i) as string;
        if (!accountId) throw new Error('Account is required');
        options.method = 'DELETE';
        options.url = `${baseRoot}/v1/workspaces/${workspaceId}/accounts/${accountId}`;
      }

      if (resource === 'contentCategory' && operation === 'list') {
        const workspaceId = this.getNodeParameter('workspaceId', i) as string;
        const page = this.getNodeParameter('page', i) as number;
        const perPage = this.getNodeParameter('perPage', i) as number;
        options.method = 'GET';
        options.url = `${baseRoot}/v1/workspaces/${workspaceId}/content-categories`;
        options.qs = { page, per_page: perPage };
      }

      if (resource === 'label' && operation === 'list') {
        const workspaceId = this.getNodeParameter('workspaceId', i) as string;
        const page = this.getNodeParameter('page', i) as number;
        const perPage = this.getNodeParameter('perPage', i) as number;
        const search = (this.getNodeParameter('labelSearch', i) as string) || '';
        options.method = 'GET';
        options.url = `${baseRoot}/v1/workspaces/${workspaceId}/labels`;
        const qs: Record<string, any> = { page, per_page: perPage };
        if (search) qs.search = search;
        options.qs = qs;
      }

      if (resource === 'label' && operation === 'create') {
        const workspaceId = this.getNodeParameter('workspaceId', i) as string;
        const name = (this.getNodeParameter('labelName', i) as string).trim();
        const color = this.getNodeParameter('labelColor', i) as string;
        if (!name) throw new Error('Name is required');
        if (!color) throw new Error('Color is required');
        options.method = 'POST';
        options.url = `${baseRoot}/v1/workspaces/${workspaceId}/labels`;
        options.body = { name, color };
      }

      if (resource === 'label' && operation === 'update') {
        const workspaceId = this.getNodeParameter('workspaceId', i) as string;
        const labelId = (this.getNodeParameter('labelId', i) as string).trim();
        if (!labelId) throw new Error('Label ID is required');
        const name = (this.getNodeParameter('labelName', i) as string).trim();
        const color = (this.getNodeParameter('labelColor', i) as string).trim();
        const body: Record<string, any> = {};
        if (name) body.name = name;
        if (color) body.color = color;
        options.method = 'PUT';
        options.url = `${baseRoot}/v1/workspaces/${workspaceId}/labels/${labelId}`;
        options.body = body;
      }

      if (resource === 'label' && operation === 'delete') {
        const workspaceId = this.getNodeParameter('workspaceId', i) as string;
        const labelId = (this.getNodeParameter('labelId', i) as string).trim();
        if (!labelId) throw new Error('Label ID is required');
        options.method = 'DELETE';
        options.url = `${baseRoot}/v1/workspaces/${workspaceId}/labels/${labelId}`;
      }

      if (resource === 'campaign' && operation === 'list') {
        const workspaceId = this.getNodeParameter('workspaceId', i) as string;
        const page = this.getNodeParameter('page', i) as number;
        const perPage = this.getNodeParameter('perPage', i) as number;
        const search = (this.getNodeParameter('campaignSearch', i) as string) || '';
        options.method = 'GET';
        options.url = `${baseRoot}/v1/workspaces/${workspaceId}/campaigns`;
        const qs: Record<string, any> = { page, per_page: perPage };
        if (search) qs.search = search;
        options.qs = qs;
      }

      if (resource === 'campaign' && operation === 'create') {
        const workspaceId = this.getNodeParameter('workspaceId', i) as string;
        const name = (this.getNodeParameter('campaignName', i) as string).trim();
        const color = this.getNodeParameter('campaignColor', i) as string;
        if (!name) throw new Error('Name is required');
        if (!color) throw new Error('Color is required');
        options.method = 'POST';
        options.url = `${baseRoot}/v1/workspaces/${workspaceId}/campaigns`;
        options.body = { name, color };
      }

      if (resource === 'campaign' && operation === 'update') {
        const workspaceId = this.getNodeParameter('workspaceId', i) as string;
        const campaignId = (this.getNodeParameter('campaignId', i) as string).trim();
        if (!campaignId) throw new Error('Campaign ID is required');
        const name = (this.getNodeParameter('campaignName', i) as string).trim();
        const color = (this.getNodeParameter('campaignColor', i) as string).trim();
        const body: Record<string, any> = {};
        if (name) body.name = name;
        if (color) body.color = color;
        options.method = 'PUT';
        options.url = `${baseRoot}/v1/workspaces/${workspaceId}/campaigns/${campaignId}`;
        options.body = body;
      }

      if (resource === 'campaign' && operation === 'delete') {
        const workspaceId = this.getNodeParameter('workspaceId', i) as string;
        const campaignId = (this.getNodeParameter('campaignId', i) as string).trim();
        if (!campaignId) throw new Error('Campaign ID is required');
        options.method = 'DELETE';
        options.url = `${baseRoot}/v1/workspaces/${workspaceId}/campaigns/${campaignId}`;
      }

      if (resource === 'media' && operation === 'list') {
        const workspaceId = this.getNodeParameter('workspaceId', i) as string;
        const page = this.getNodeParameter('page', i) as number;
        const perPage = this.getNodeParameter('perPage', i) as number;
        const mediaType = (this.getNodeParameter('mediaType', i) as string) || '';
        const search = (this.getNodeParameter('mediaSearch', i) as string) || '';
        const sort = (this.getNodeParameter('mediaSort', i) as string) || 'recent';
        options.method = 'GET';
        options.url = `${baseRoot}/v1/workspaces/${workspaceId}/media`;
        const qs: Record<string, any> = { page, per_page: perPage };
        if (mediaType) qs.type = mediaType;
        if (search) qs.search = search;
        if (sort) qs.sort = sort;
        options.qs = qs;
      }

      if (resource === 'media' && operation === 'upload') {
        const workspaceId = this.getNodeParameter('workspaceId', i) as string;
        const mediaUrl = this.getNodeParameter('mediaUrl', i) as string;
        const folderId = (this.getNodeParameter('mediaFolderId', i) as string) || '';
        if (!mediaUrl) throw new Error('Media URL is required');
        options.method = 'POST';
        options.url = `${baseRoot}/v1/workspaces/${workspaceId}/media`;
        options.body = { url: mediaUrl } as any;
        if (folderId) (options.body as any).folder_id = folderId;
      }

      if (resource === 'teamMember' && operation === 'list') {
        const workspaceId = this.getNodeParameter('workspaceId', i) as string;
        const page = this.getNodeParameter('page', i) as number;
        const perPage = this.getNodeParameter('perPage', i) as number;
        const search = (this.getNodeParameter('teamSearch', i) as string) || '';
        options.method = 'GET';
        options.url = `${baseRoot}/v1/workspaces/${workspaceId}/team-members`;
        const qs: Record<string, any> = { page, per_page: perPage };
        if (search) qs.search = search;
        options.qs = qs;
      }

      if (resource === 'teamMember' && operation === 'create') {
        const workspaceId = this.getNodeParameter('workspaceId', i) as string;
        const role = this.getNodeParameter('teamRole', i) as string;
        const membership = this.getNodeParameter('teamMembership', i) as string;
        const email = (this.getNodeParameter('teamEmail', i) as string).trim();
        if (!email) throw new Error('Email is required');
        const permissions = parseJsonObject(this.getNodeParameter('teamPermissions', i));
        const body: Record<string, any> = { role, membership, email };
        if (permissions && Object.keys(permissions).length) body.permissions = permissions;
        options.method = 'POST';
        options.url = `${baseRoot}/v1/workspaces/${workspaceId}/team-members`;
        options.body = body;
      }

      if (resource === 'teamMember' && operation === 'update') {
        const workspaceId = this.getNodeParameter('workspaceId', i) as string;
        const memberId = this.getNodeParameter('teamMemberId', i) as string;
        if (!memberId) throw new Error('Member ID is required');
        const role = this.getNodeParameter('teamRole', i) as string;
        const membership = this.getNodeParameter('teamMembership', i) as string;
        const permissions = parseJsonObject(this.getNodeParameter('teamPermissions', i));
        options.method = 'PUT';
        options.url = `${baseRoot}/v1/workspaces/${workspaceId}/team-members/${memberId}`;
        options.body = { role, membership, permissions: permissions || {} };
      }

      if (resource === 'teamMember' && operation === 'delete') {
        const workspaceId = this.getNodeParameter('workspaceId', i) as string;
        const memberId = this.getNodeParameter('teamMemberId', i) as string;
        if (!memberId) throw new Error('Member ID is required');
        const confirmed = this.getNodeParameter('teamConfirmed', i) as boolean;
        options.method = 'DELETE';
        options.url = `${baseRoot}/v1/workspaces/${workspaceId}/team-members/${memberId}`;
        if (confirmed) options.qs = { confirmed: 'true' };
      }

      if (resource === 'comment' && operation === 'list') {
        const workspaceId = this.getNodeParameter('workspaceId', i) as string;
        const postId = this.getNodeParameter('commentPostId', i) as string;
        const page = this.getNodeParameter('page', i) as number;
        const perPage = this.getNodeParameter('perPage', i) as number;
        if (!postId) throw new Error('Post ID is required');
        options.method = 'GET';
        options.url = `${baseRoot}/v1/workspaces/${workspaceId}/posts/${postId}/comments`;
        options.qs = { page, per_page: perPage };
      }

      if (resource === 'comment' && operation === 'create') {
        const workspaceId = this.getNodeParameter('workspaceId', i) as string;
        const postId = this.getNodeParameter('commentPostId', i) as string;
        const commentText = this.getNodeParameter('commentText', i) as string;
        const isNote = this.getNodeParameter('commentIsNote', i, false) as boolean;
        const mentionedUsersRaw = (this.getNodeParameter('commentMentionedUsers', i) as string) || '';
        if (!postId) throw new Error('Post ID is required');
        if (!commentText) throw new Error('Comment text is required');
        options.method = 'POST';
        options.url = `${baseRoot}/v1/workspaces/${workspaceId}/posts/${postId}/comments`;
        const body: any = { comment: commentText };
        if (isNote) body.is_note = true;
        if (mentionedUsersRaw.trim()) {
          body.mentioned_users = mentionedUsersRaw.split(',').map(s => s.trim()).filter(Boolean);
        }
        options.body = body;
      }

      if (resource === 'post' && operation === 'list') {
        const workspaceId = this.getNodeParameter('workspaceId', i) as string;
        const page = this.getNodeParameter('page', i) as number;
        const perPage = this.getNodeParameter('perPage', i) as number;
        const statusesRaw = this.getNodeParameter('statusesCsv', i, []) as string | string[];
        const dateFrom = (this.getNodeParameter('dateFrom', i) as string) || '';
        const dateTo = (this.getNodeParameter('dateTo', i) as string) || '';
        const approvalAssignedTo = (this.getNodeParameter('approvalAssignedTo', i, '') as string) || '';
        const approvalRequestedBy = (this.getNodeParameter('approvalRequestedBy', i, '') as string) || '';
        const labelsCsv = (this.getNodeParameter('labelsCsv', i, '') as string) || '';
        const campaignsCsv = (this.getNodeParameter('campaignsCsv', i, '') as string) || '';
        const contentCategoryCsv = (this.getNodeParameter('contentCategoryCsv', i, '') as string) || '';
        const createdByCsv = (this.getNodeParameter('createdByCsv', i, '') as string) || '';
        const commentStatus = (this.getNodeParameter('commentStatus', i, 'all') as string) || 'all';

        // Build query string manually to ensure proper array format
        const qsParts: string[] = [`page=${page}`, `per_page=${perPage}`];
        const statusesArr = Array.isArray(statusesRaw)
          ? statusesRaw
          : String(statusesRaw).split(',').map(s => s.trim()).filter(Boolean);
        Array.from(new Set(statusesArr)).forEach((s) => qsParts.push(`status[]=${encodeURIComponent(s)}`));
        if (dateFrom) qsParts.push(`date_from=${encodeURIComponent(dateFrom)}`);
        if (dateTo) qsParts.push(`date_to=${encodeURIComponent(dateTo)}`);

        const appendCsvAsArray = (name: string, raw: string) => {
          if (!raw.trim()) return;
          raw.split(',')
            .map(s => s.trim().replace(/^["']+|["']+$/g, '').trim())
            .filter(Boolean)
            .forEach((id) => qsParts.push(`${name}[]=${encodeURIComponent(id)}`));
        };

        appendCsvAsArray('approval_assigned_to', approvalAssignedTo);
        appendCsvAsArray('approval_requested_by', approvalRequestedBy);
        appendCsvAsArray('labels', labelsCsv);
        appendCsvAsArray('campaigns', campaignsCsv);
        appendCsvAsArray('content_category', contentCategoryCsv);
        appendCsvAsArray('created_by', createdByCsv);

        if (commentStatus && commentStatus !== 'all') {
          qsParts.push(`comment_status=${encodeURIComponent(commentStatus)}`);
        }

        options.method = 'GET';
        options.url = `${baseRoot}/v1/workspaces/${workspaceId}/posts?${qsParts.join('&')}`;
      }

      if (resource === 'post' && (operation === 'create' || operation === 'update')) {
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
        const hasTwitterOptions = this.getNodeParameter('hasTwitterOptions', i, false) as boolean;
        const hasThreadsOptions = this.getNodeParameter('hasThreadsOptions', i, false) as boolean;
        const twitterOptionsParam = this.getNodeParameter('twitterOptions', i, {}) as unknown;
        const threadsOptionsParam = this.getNodeParameter('threadsOptions', i, {}) as unknown;
        const twitterThreadItems = hasTwitterOptions ? parseThreadOptions(twitterOptionsParam, 'threadedTweets') : [];
        const threadsThreadItems = hasThreadsOptions ? parseThreadOptions(threadsOptionsParam, 'multiThreads') : [];

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

        const postType = (this.getNodeParameter('postType', i, 'feed') as string) || 'feed';

        if (operation === 'update') {
          const updatePostId = (this.getNodeParameter('updatePostId', i) as string).trim();
          if (!updatePostId) throw new Error('Post ID is required to update a post');
          options.method = 'PUT';
          options.url = `${baseRoot}/v1/workspaces/${workspaceId}/posts/${updatePostId}`;
        } else {
          options.method = 'POST';
          options.url = `${baseRoot}/v1/workspaces/${workspaceId}/posts`;
        }
        options.body = {
          content: {
            text: contentText,
            media: {
              images: mediaImages,
              video: mediaVideo,
            },
          },
          accounts,
          post_type: postType,
          scheduling: {
            publish_type: publishType,
            scheduled_at: scheduledAt,
          },
        };

        if (hasTwitterOptions) {
          (options.body as any).twitter_options = {
            has_threaded_tweets: true,
            threaded_tweets: twitterThreadItems,
          };
        }

        if (hasThreadsOptions) {
          (options.body as any).threads_options = {
            has_multi_threads: true,
            multi_threads: threadsThreadItems.map((threadItem) => ({
              message: threadItem.message,
              media: threadItem.media ?? [],
            })),
          };
        }

        // Facebook text-post colored background (Facebook plain text posts only)
        const hasFacebookBackground = this.getNodeParameter('hasFacebookBackground', i, false) as boolean;
        if (hasFacebookBackground) {
          const facebookBackgroundId = (this.getNodeParameter('facebookBackgroundId', i, '') as string) || '';
          if (facebookBackgroundId.trim()) {
            (options.body as any).facebook_options = {
              facebook_background_id: facebookBackgroundId.trim(),
            };
          }
        }

        // Facebook carousel post (2-10 link cards on Facebook Pages)
        const hasFacebookCarousel = this.getNodeParameter('hasFacebookCarousel', i, false) as boolean;
        if (hasFacebookCarousel) {
          const carouselCardsRaw = this.getNodeParameter('carouselCards', i, {}) as any;
          const rawCards: any[] = Array.isArray(carouselCardsRaw?.card) ? carouselCardsRaw.card : [];

          const cards = rawCards.map((c, idx) => {
            const image = String(c?.image ?? '').trim();
            const link = String(c?.link ?? '').trim();
            if (!image || !link) {
              throw new Error(`Carousel card ${idx + 1} requires both Image URL and Destination URL`);
            }
            return {
              image,
              title: String(c?.title ?? '').trim(),
              description: String(c?.description ?? '').trim(),
              link,
            };
          });

          if (cards.length < 2 || cards.length > 10) {
            throw new Error(`Facebook carousel requires between 2 and 10 cards (got ${cards.length})`);
          }

          const carouselAccountsRaw = this.getNodeParameter('carouselAccounts', i, []) as string | string[];
          const carouselAccounts = Array.isArray(carouselAccountsRaw)
            ? carouselAccountsRaw.map((v) => String(v).trim()).filter(Boolean)
            : parseCommaSeparated(carouselAccountsRaw);
          const carouselCallToAction = (this.getNodeParameter('carouselCallToAction', i, 'NO_BUTTON') as string) || 'NO_BUTTON';
          const carouselEndCard = this.getNodeParameter('carouselEndCard', i, false) as boolean;
          const carouselEndCardUrl = (this.getNodeParameter('carouselEndCardUrl', i, '') as string).trim();

          (options.body as any).facebook_options = (options.body as any).facebook_options || {};
          (options.body as any).facebook_options.carousel = {
            is_carousel_post: true,
            cards,
            call_to_action: carouselCallToAction,
            end_card: carouselEndCard,
            ...(carouselEndCardUrl ? { end_card_url: carouselEndCardUrl } : {}),
            ...(carouselAccounts.length ? { accounts: carouselAccounts } : {}),
          };
        }

        // Facebook Reel collaborators (facebook_options.collaborators, max 10) — gated by the Facebook options toggle
        if (hasFacebookBackground) {
          const facebookCollaborators = parseCommaSeparated(this.getNodeParameter('facebookCollaborators', i, '') as unknown);
          if (facebookCollaborators.length > 0) {
            if (facebookCollaborators.length > 10) {
              throw new Error(`Facebook reel collaborators supports at most 10 (got ${facebookCollaborators.length})`);
            }
            (options.body as any).facebook_options = (options.body as any).facebook_options || {};
            (options.body as any).facebook_options.collaborators = facebookCollaborators;
          }
        }

        // Instagram collaborators (instagram_options.collaborators, max 3) — gated by the Instagram options toggle
        const hasInstagramOptions = this.getNodeParameter('hasInstagramOptions', i, false) as boolean;
        if (hasInstagramOptions) {
          const instagramCollaborators = parseCommaSeparated(this.getNodeParameter('instagramCollaborators', i, '') as unknown);
          if (instagramCollaborators.length > 0) {
            if (instagramCollaborators.length > 3) {
              throw new Error(`Instagram collaborators supports at most 3 (got ${instagramCollaborators.length})`);
            }
            (options.body as any).instagram_options = { collaborators: instagramCollaborators };
          }
        }

        // LinkedIn options (title and/or poll) — gated by the LinkedIn options toggle
        const hasLinkedinOptions = this.getNodeParameter('hasLinkedinOptions', i, false) as boolean;
        if (hasLinkedinOptions) {
          const linkedinOptions: Record<string, any> = {};
          const linkedinTitle = ((this.getNodeParameter('linkedinTitle', i, '') as string) || '').trim();
          if (linkedinTitle) {
            if (linkedinTitle.length > 255) {
              throw new Error('LinkedIn Title supports at most 255 characters');
            }
            linkedinOptions.title = linkedinTitle;
          }

          const linkedinEnablePoll = this.getNodeParameter('linkedinEnablePoll', i, false) as boolean;
          if (linkedinEnablePoll) {
            const pollQuestion = ((this.getNodeParameter('linkedinPollQuestion', i, '') as string) || '').trim();
            if (!pollQuestion) {
              throw new Error('Poll Question is required when LinkedIn Poll is enabled');
            }
            if (pollQuestion.length > 140) {
              throw new Error('Poll Question supports at most 140 characters');
            }
            const pollOptions = parseCommaSeparated(this.getNodeParameter('linkedinPollOptions', i, '') as unknown);
            if (pollOptions.length < 2 || pollOptions.length > 4) {
              throw new Error(`LinkedIn poll requires between 2 and 4 options (got ${pollOptions.length})`);
            }
            if (pollOptions.some((opt) => opt.length > 30)) {
              throw new Error('Each LinkedIn poll option supports at most 30 characters');
            }
            const pollDuration = (this.getNodeParameter('linkedinPollDuration', i, 'ONE_DAY') as string) || 'ONE_DAY';
            linkedinOptions.poll = {
              question: pollQuestion,
              options: pollOptions,
              duration: pollDuration,
            };
          }

          if (Object.keys(linkedinOptions).length > 0) {
            (options.body as any).linkedin_options = linkedinOptions;
          }
        }

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

        // Add approval if enabled
        const sendForApproval = this.getNodeParameter('sendForApproval', i, false) as boolean;
        if (sendForApproval) {
          const approversParam = this.getNodeParameter('approvers', i, '') as unknown;
          const approvers = parseCommaSeparated(approversParam);
          if (approvers.length === 0) {
            throw new Error('At least one Approver ID is required when Send for Approval is enabled');
          }
          const approveOption = (this.getNodeParameter('approveOption', i) as string) || 'anyone';
          const approvalNotes = (this.getNodeParameter('approvalNotes', i) as string) || '';

          (options.body as any).approval = {
            approvers,
            approve_option: approveOption,
          };
          if (approvalNotes) {
            (options.body as any).approval.notes = approvalNotes;
          }
        }

        // Approval workflow (multi-level) — mutually exclusive with the legacy approval above
        const useApprovalWorkflow = this.getNodeParameter('useApprovalWorkflow', i, false) as boolean;
        if (useApprovalWorkflow) {
          if (sendForApproval) {
            throw new Error('Use either "Send for Approval" (legacy) or "Use Approval Workflow" — they are mutually exclusive');
          }
          const workflowId = ((this.getNodeParameter('approvalWorkflowId', i, '') as string) || '').trim();
          const workflowAction = operation === 'update'
            ? ((this.getNodeParameter('approvalWorkflowAction', i, '') as string) || '').trim()
            : '';
          const workflowNotes = ((this.getNodeParameter('approvalWorkflowNotes', i, '') as string) || '').trim();

          if (workflowId && workflowAction) {
            throw new Error('Provide exactly one of Approval Workflow (attach) or Workflow Action — not both');
          }
          if (!workflowId && !workflowAction) {
            throw new Error('Approval Workflow requires either a workflow to attach or a Workflow Action');
          }

          const approvalWorkflow: Record<string, any> = workflowId
            ? { workflow_id: workflowId }
            : { workflow_action: workflowAction };
          if (workflowNotes) {
            approvalWorkflow.notes = workflowNotes;
          }
          (options.body as any).approval_workflow = approvalWorkflow;
        }

        // Labels (handles string, array, JSON string from n8n expressions)
        const labelsParam = this.getNodeParameter('labels', i, '') as unknown;
        const labels = parseCommaSeparated(labelsParam);
        if (labels.length > 0) {
          (options.body as any).labels = labels;
        }

        // Campaign
        const campaignParam = this.getNodeParameter('campaignId', i, '') as unknown;
        const campaignId = Array.isArray(campaignParam) ? String(campaignParam[0] || '') : String(campaignParam || '');
        if (campaignId.trim()) {
          (options.body as any).campaign_id = campaignId.trim();
        }
      }

      if (resource === 'post' && operation === 'delete') {
        const workspaceId = this.getNodeParameter('workspaceId', i) as string;
        const postId = this.getNodeParameter('postId', i) as string;
        options.method = 'DELETE';
        options.url = `${baseRoot}/v1/workspaces/${workspaceId}/posts/${postId}`;
      }

      if (resource === 'post' && operation === 'approve') {
        const workspaceId = this.getNodeParameter('workspaceId', i) as string;
        const planId = this.getNodeParameter('planId', i) as string;
        const approvalAction = this.getNodeParameter('approvalAction', i) as string;
        const comment = (this.getNodeParameter('approvalComment', i) as string) || '';

        if (!planId) throw new Error('Post/Plan ID is required');
        if (!approvalAction) throw new Error('Action is required (approve or reject)');

        options.method = 'POST';
        options.url = `${baseRoot}/v1/workspaces/${workspaceId}/posts/${planId}/approval`;
        const approvalBody: Record<string, unknown> = { action: approvalAction };
        if (comment) {
          approvalBody.comment = comment;
        }
        options.body = approvalBody;
      }

      if (resource === 'scheduling' && operation === 'bestTimes') {
        const workspaceId = this.getNodeParameter('workspaceId', i) as string;
        const globalSlots = this.getNodeParameter('bestTimesGlobalSlots', i, 5) as number;
        const perAccountSlots = this.getNodeParameter('bestTimesPerAccountSlots', i, 3) as number;
        const output = (this.getNodeParameter('bestTimesOutput', i, 'global') as string) || 'global';

        const entities = parseSchedulingEntityRefs(this.getNodeParameter('bestTimesAccounts', i, []) as unknown);

        // Account ids typed by hand or supplied by an expression arrive without a
        // platform; resolve those against the workspace's connected accounts.
        const unresolved = entities.filter((entity) => !entity.type);
        if (unresolved.length > 0) {
          const accountsResponse = await this.helpers.httpRequestWithAuthentication.call(this, CREDENTIALS_TYPE, {
            method: 'GET',
            url: `${baseRoot}/v1/workspaces/${workspaceId}/accounts`,
            qs: { page: 1, per_page: 100 },
            json: true,
            headers: { accept: 'application/json' },
            timeout: 60000,
          });
          const accountList: any[] = Array.isArray(accountsResponse) ? accountsResponse : (accountsResponse?.data || []);
          const platformById = new Map<string, string>();
          for (const account of accountList) {
            const id = account?._id;
            const platform = String(account?.platform || account?.provider || '').toLowerCase();
            if (id && platform) platformById.set(String(id), platform);
          }
          for (const entity of unresolved) {
            const platform = platformById.get(entity.id);
            if (!platform) {
              throw new Error(
                `Account "${entity.id}" is not connected to workspace ${workspaceId}. Select accounts from the dropdown, or pass account IDs returned by Social Account → List.`,
              );
            }
            entity.type = platform;
          }
        }

        options.method = 'POST';
        options.url = `${baseRoot}/v1/workspaces/${workspaceId}/scheduling/optimal-times`;
        options.body = {
          global_slots: globalSlots,
          per_account_slots: perAccountSlots,
          // Omitting entities makes the API analyse every connected account
          ...(entities.length > 0 ? { entities: entities.map(({ id, type }) => ({ id, type })) } : {}),
        };

        if (output !== 'raw') {
          transformResponse = (body) => flattenOptimalTimes(body, output === 'all');
        }
      }

      const response = await this.helpers.httpRequestWithAuthentication.call(
        this,
        CREDENTIALS_TYPE,
        options,
      );
      if (transformResponse) {
        for (const json of transformResponse(response)) {
          returnData.push({ json, pairedItem: { item: i } });
        }
      } else {
        returnData.push({ json: response, pairedItem: { item: i } });
      }
      } catch (error) {
        if (this.continueOnFail()) {
          const message = (error as any)?.message || String(error);
          returnData.push({ json: { error: message }, pairedItem: { item: i } });
          continue;
        }
        if (error instanceof NodeApiError) {
          throw error;
        }
        throw new NodeApiError(this.getNode(), error as any, { itemIndex: i });
      }
    }

    return [returnData];
  }
}
