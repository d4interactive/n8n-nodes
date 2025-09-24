import type { IExecuteFunctions, INodeExecutionData, INodeType, INodeTypeDescription } from 'n8n-workflow';
import { getWorkspaces, getPosts, getAccounts } from './loadOptions';
export declare class ContentStudio implements INodeType {
    description: INodeTypeDescription;
    methods: {
        loadOptions: {
            getWorkspaces: typeof getWorkspaces;
            getPosts: typeof getPosts;
            getAccounts: typeof getAccounts;
        };
    };
    execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]>;
}
