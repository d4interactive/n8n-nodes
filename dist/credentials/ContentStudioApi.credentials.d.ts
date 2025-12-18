import { ICredentialType, INodeProperties } from 'n8n-workflow';
export declare const BASE_URL = "https://api-prod.contentstudio.io/api";
export declare class ContentStudioApi implements ICredentialType {
    name: string;
    displayName: string;
    documentationUrl: string;
    properties: INodeProperties[];
}
