import { ICredentialType, INodeProperties } from 'n8n-workflow';

const DISPLAY_NAME = 'ContentStudio API';
export const BASE_URL = 'http://localhost:8000/api';

export class ContentStudioApi implements ICredentialType {
  name = 'contentStudioApi';
  displayName = DISPLAY_NAME;
  documentationUrl = 'https://qa-api.contentstudio.io/api-docs';

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
