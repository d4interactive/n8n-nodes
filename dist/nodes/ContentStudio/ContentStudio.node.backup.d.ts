import type { IExecuteFunctions, INodeExecutionData, INodeType, INodeTypeDescription, ILoadOptionsFunctions, INodePropertyOptions } from 'n8n-workflow';
export declare class ContentStudio implements INodeType {
    description: INodeTypeDescription;
    methods: {
        loadOptions: {
            getWorkspaces(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]>;
            getPosts(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]>;
            getAccounts(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]>;
        };
    };
    execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]>;
}
