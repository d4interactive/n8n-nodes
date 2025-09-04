import type { ILoadOptionsFunctions, INodePropertyOptions } from 'n8n-workflow';
import { normalizeBase } from './utils';
import { BASE_URL } from '../../credentials/ContentStudioApi.credentials';

export async function getWorkspaces(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
  try {
    const credentials = await this.getCredentials('contentStudioApi');
    const baseRoot = normalizeBase(BASE_URL);
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
    const list: any[] = res?.data || [];
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
}

export async function getPosts(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
  try {
    const credentials = await this.getCredentials('contentStudioApi');
    const baseRoot = normalizeBase(BASE_URL);
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
    const list: any[] = res?.data || [];
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
}

export async function getAccounts(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
  try {
    const credentials = await this.getCredentials('contentStudioApi');
    const baseRoot = normalizeBase(BASE_URL);
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
    const list: any[] = res?.data || [];
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
}
