import {
  IAuthenticateGeneric,
  ICredentialTestRequest,
  ICredentialType,
  INodeProperties,
  Icon,
} from 'n8n-workflow';

const DISPLAY_NAME = 'ContentStudio API';
export const BASE_URL = 'api.contentstudio.io/api';

export class ContentStudioApi implements ICredentialType {
  name = 'contentStudioApi';
  displayName = DISPLAY_NAME;
  documentationUrl = 'https://api.contentstudio.io/api-docs';
  icon: Icon = 'file:contentstudio.png';

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

  authenticate: IAuthenticateGeneric = {
    type: 'generic',
    properties: {
      headers: {
        'X-API-Key': '={{$credentials.apiKey}}',
      },
    },
  };

  test: ICredentialTestRequest = {
    request: {
      baseURL: `https://${BASE_URL}`,
      url: '/v1/me',
      method: 'GET',
      headers: { accept: 'application/json' },
    },
  };
}
