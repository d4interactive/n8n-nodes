import type { IHttpRequestOptions, ILoadOptionsFunctions, INodePropertyOptions } from 'n8n-workflow';
import { normalizeBase } from './utils';
import { BASE_URL } from '../../credentials/ContentStudioApi.credentials';

const CREDENTIALS_TYPE = 'contentStudioApi';

async function apiRequest(this: ILoadOptionsFunctions, options: IHttpRequestOptions): Promise<any> {
  return this.helpers.httpRequestWithAuthentication.call(this, CREDENTIALS_TYPE, {
    headers: { accept: 'application/json' },
    json: true,
    timeout: 60000,
    ...options,
  });
}

export async function getWorkspaces(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
  try {
    const baseRoot = normalizeBase(BASE_URL);
    const res: any = await apiRequest.call(this, {
      method: 'GET',
      url: `https://${baseRoot}/v1/workspaces`,
      qs: { page: 1, per_page: 100 },
    });
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
    const baseRoot = normalizeBase(BASE_URL);
    const workspaceId = (this.getCurrentNodeParameter('workspaceId') as string) || '';
    if (!workspaceId) return [];
    const res: any = await apiRequest.call(this, {
      method: 'GET',
      url: `https://${baseRoot}/v1/workspaces/${workspaceId}/posts`,
      qs: { page: 1, per_page: 50 },
    });
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
    const baseRoot = normalizeBase(BASE_URL);
    const workspaceId = (this.getCurrentNodeParameter('workspaceId') as string) || '';
    if (!workspaceId) return [];
    const res: any = await apiRequest.call(this, {
      method: 'GET',
      url: `https://${baseRoot}/v1/workspaces/${workspaceId}/accounts`,
      qs: { page: 1, per_page: 100 },
    });
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

export async function getFirstCommentAccounts(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
  try {
    const baseRoot = normalizeBase(BASE_URL);
    const workspaceId = (this.getCurrentNodeParameter('workspaceId') as string) || '';
    if (!workspaceId) return [];

    let selectedAccounts: string[] = [];
    try {
      const accountsParam = this.getCurrentNodeParameter('accounts') as unknown;
      if (Array.isArray(accountsParam)) {
        selectedAccounts = accountsParam.map(String);
      }
    } catch (_e) {
      // ignore
    }

    const res: any = await apiRequest.call(this, {
      method: 'GET',
      url: `https://${baseRoot}/v1/workspaces/${workspaceId}/accounts`,
      qs: { page: 1, per_page: 200 },
    });
    let list: any[] = res?.data || [];

    if (selectedAccounts.length > 0) {
      const selectedSet = new Set(selectedAccounts);
      list = list.filter((a: any) => selectedSet.has(a?._id));
    }

    return list
      .map((a: any) => {
        const id = a?._id;
        if (!id) return null;
        const platform = a?.platform || '';
        const accountName = a?.account_name || a?.username || a?.name || '';
        const label = [platform, accountName].filter(Boolean).join(' - ') || String(id);
        return { name: label, value: id } as INodePropertyOptions;
      })
      .filter((o): o is INodePropertyOptions => !!o);
  } catch (error) {
    const msg = (error as any)?.message || String(error);
    throw new Error(`Failed to load First Comment Accounts: ${msg}`);
  }
}

export async function getContentCategories(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
  try {
    const baseRoot = normalizeBase(BASE_URL);
    const workspaceId = (this.getCurrentNodeParameter('workspaceId') as string) || '';
    if (!workspaceId) return [];
    const res: any = await apiRequest.call(this, {
      method: 'GET',
      url: `https://${baseRoot}/v1/workspaces/${workspaceId}/content-categories`,
      qs: { page: 1, per_page: 100 },
    });
    const list: any[] = res?.data || [];
    return list
      .map((c: any) => {
        const id = c?._id;
        if (!id) return null;
        const name = c?.name || String(id);
        return { name, value: id } as INodePropertyOptions;
      })
      .filter((o): o is INodePropertyOptions => !!o);
  } catch (error) {
    const msg = (error as any)?.message || String(error);
    throw new Error(`Failed to load Content Categories: ${msg}`);
  }
}

export async function getFacebookBackgrounds(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
  try {
    const baseRoot = normalizeBase(BASE_URL);
    const res: any = await apiRequest.call(this, {
      method: 'GET',
      url: `https://${baseRoot}/v1/facebook/text-backgrounds`,
    });
    const list: any[] = res?.data || [];

    const out: INodePropertyOptions[] = [];

    for (const p of list) {
      const id = p?.id;
      if (!id) continue;
      const desc = p?.description || String(id);
      const type = p?.type || '';
      const bg = p?.background_color || '';
      const label = type === 'image'
        ? `${desc} (image)`
        : (bg ? `${desc} — ${bg}` : desc);
      const hoverParts = [type, p?.category].filter(Boolean).join(' · ');
      out.push({ name: label, value: String(id), description: hoverParts });
    }

    return out;
  } catch (error) {
    const msg = (error as any)?.message || String(error);
    throw new Error(`Failed to load Facebook Text Backgrounds: ${msg}`);
  }
}

export async function getTeamMembers(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
  try {
    const baseRoot = normalizeBase(BASE_URL);
    const workspaceId = (this.getCurrentNodeParameter('workspaceId') as string) || '';
    if (!workspaceId) return [];
    const res: any = await apiRequest.call(this, {
      method: 'GET',
      url: `https://${baseRoot}/v1/workspaces/${workspaceId}/team-members`,
      qs: { page: 1, per_page: 100 },
    });
    const list: any[] = res?.data || [];
    return list
      .map((m: any) => {
        const id = m?._id;
        if (!id) return null;
        const name = m?.name || m?.email || String(id);
        const role = m?.role || '';
        const label = role ? `${name} (${role})` : name;
        return { name: label, value: id } as INodePropertyOptions;
      })
      .filter((o): o is INodePropertyOptions => !!o);
  } catch (error) {
    const msg = (error as any)?.message || String(error);
    throw new Error(`Failed to load Team Members: ${msg}`);
  }
}
