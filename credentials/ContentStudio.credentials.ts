import { ICredentialType, INodeProperties } from 'n8n-workflow';

const DISPLAY_NAME = 'ContentStudio API';
export const BASE_URL = 'https://api-prod.contentstudio.io/api';

export class ContentStudio implements ICredentialType {
  name = 'contentStudio';
  displayName = DISPLAY_NAME;
  documentationUrl = 'https://api.contentstudio.io/guide';

  properties: INodeProperties[] = [
    {
      displayName: 'API Key',
      name: 'apiKey',
      type: 'string',
      typeOptions: { password: true },
      default: '',
      required: true,
      description: 'Your ContentStudio X-API-Key',
    },
  ];
}
