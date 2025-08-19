import { ICredentialType, INodeProperties } from 'n8n-workflow';

export class ContentStudioApi implements ICredentialType {
  name = 'contentStudioApi';
  displayName = 'ContentStudio API';
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
    {
      displayName: 'Base URL',
      name: 'baseUrl',
      type: 'string',
      default: 'https://qa-api.contentstudio.io/api',
      required: true,
      description: 'Base URL of the ContentStudio API',
    },
  ];
}
