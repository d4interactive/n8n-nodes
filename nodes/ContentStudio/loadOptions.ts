import type { IHttpRequestOptions, ILoadOptionsFunctions, INodePropertyOptions } from 'n8n-workflow';
import { normalizeBase } from './utils';
import { BASE_URL } from '../../credentials/ContentStudio.credentials';

const CREDENTIALS_TYPE = 'contentStudio';

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function extractApiErrorMessage(body: unknown): string {
  if (!body) return '';
  if (typeof body === 'string') return body;
  if (typeof body === 'object') {
    const b: any = body;
    return b.message || b.error || b.errors || safeStringify(b);
  }
  return String(body);
}

function extractHttpErrorDetails(error: any): { statusCode: string | number; apiMessage: string } {
  const statusCode = error?.statusCode || error?.response?.statusCode || error?.response?.status || 'unknown';
  const body = error?.response?.body ?? error?.response?.data ?? error?.cause?.response?.data;
  const apiMessage = extractApiErrorMessage(body) || error?.message || String(error);
  return { statusCode, apiMessage };
}

async function apiRequest(
  ctx: ILoadOptionsFunctions,
  options: IHttpRequestOptions,
): Promise<any> {
  return ctx.helpers.httpRequestWithAuthentication.call(ctx, CREDENTIALS_TYPE, {
    headers: { accept: 'application/json' },
    json: true,
    timeout: 60000,
    ...options,
  });
}

function extractListFromBody(body: any): any[] {
  return Array.isArray(body) ? body : (body?.data || []);
}

function formatAccountOption(a: any): INodePropertyOptions | null {
  const id = a?._id;
  if (!id) return null;
  const platform = a?.platform || a?.provider || '';
  const accountName = a?.account_name || a?.username || a?.handle || a?.name || '';
  const label = [platform, accountName]
    .filter(Boolean)
    .join(' - ') || String(id);
  return { name: label, value: String(id) } as INodePropertyOptions;
}

function parseSelectedAccountIds(val: unknown): string[] {
  if (Array.isArray(val)) {
    return val.map((v) => String(v)).filter(Boolean);
  }
  if (typeof val === 'string') {
    const t = val.trim();
    if (!t) return [];
    try {
      const parsed = JSON.parse(t);
      if (Array.isArray(parsed)) return parsed.map((v) => String(v)).filter(Boolean);
    } catch {
      // ignore
    }
    return [t];
  }
  return [];
}

export async function getCarouselAccounts(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
  try {
    const baseRoot = normalizeBase(BASE_URL);
    const workspaceId = (this.getCurrentNodeParameter('workspaceId') as string) || '';
    if (!workspaceId) return [];

    const selectedRaw = this.getCurrentNodeParameter('accounts');
    const selectedIds = Array.from(new Set(parseSelectedAccountIds(selectedRaw)));
    if (selectedIds.length === 0) return [];
    const selectedSet = new Set(selectedIds);

    const url = `${baseRoot}/v1/workspaces/${workspaceId}/accounts`;
    let body: any;
    try {
      body = await apiRequest(this, {
        method: 'GET',
        url,
        qs: {
          page: 1,
          per_page: Math.min(Math.max(selectedIds.length, 1), 100),
          ids: selectedIds.join(','),
        },
      });
    } catch (error: any) {
      const code = error?.statusCode || error?.response?.statusCode || error?.response?.status;
      if (code === 400 || code === 404 || code === 422) {
        body = await apiRequest(this, {
          method: 'GET',
          url,
          qs: { page: 1, per_page: 100 },
        });
      } else {
        throw error;
      }
    }

    const list: any[] = extractListFromBody(body);
    return list
      .filter((a: any) => {
        const id = a?._id;
        const platform = (a?.platform || a?.provider || '').toLowerCase();
        return id && selectedSet.has(String(id)) && platform === 'facebook';
      })
      .map(formatAccountOption)
      .filter((o): o is INodePropertyOptions => !!o);
  } catch (error) {
    const { statusCode, apiMessage } = extractHttpErrorDetails(error);
    throw new Error(`Failed to load Carousel Accounts: (${statusCode}) ${apiMessage}`);
  }
}

export async function getFirstCommentAccounts(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
  try {
    const baseRoot = normalizeBase(BASE_URL);
    const workspaceId = (this.getCurrentNodeParameter('workspaceId') as string) || '';
    if (!workspaceId) return [];

    const selectedRaw = this.getCurrentNodeParameter('accounts');
    const selectedIds = Array.from(new Set(parseSelectedAccountIds(selectedRaw)));
    if (selectedIds.length === 0) return [];
    const selectedSet = new Set(selectedIds);

    const url = `${baseRoot}/v1/workspaces/${workspaceId}/accounts`;
    let body: any;
    try {
      body = await apiRequest(this, {
        method: 'GET',
        url,
        qs: {
          page: 1,
          per_page: Math.min(Math.max(selectedIds.length, 1), 100),
          ids: selectedIds.join(','),
        },
      });
    } catch (error: any) {
      const code = error?.statusCode || error?.response?.statusCode || error?.response?.status;
      if (code === 400 || code === 404 || code === 422) {
        body = await apiRequest(this, {
          method: 'GET',
          url,
          qs: { page: 1, per_page: 100 },
        });
      } else {
        throw error;
      }
    }

    const list: any[] = extractListFromBody(body);
    return list
      .filter((a: any) => {
        const id = a?._id;
        return id && selectedSet.has(String(id));
      })
      .map(formatAccountOption)
      .filter((o): o is INodePropertyOptions => !!o);
  } catch (error) {
    const { statusCode, apiMessage } = extractHttpErrorDetails(error);
    throw new Error(`Failed to load First Comment Accounts: (${statusCode}) ${apiMessage}`);
  }
}

export async function getWorkspaces(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
  try {
    const baseRoot = normalizeBase(BASE_URL);
    const body: any = await apiRequest(this, {
      method: 'GET',
      url: `${baseRoot}/v1/workspaces`,
      qs: { page: 1, per_page: 100 },
    });
    const list: any[] = body?.data || [];
    return list
      .map((w: any) => {
        const id = w?._id;
        if (!id) return null;
        const name = w?.name || w?.title || id;
        return { name, value: id } as INodePropertyOptions;
      })
      .filter((o): o is INodePropertyOptions => !!o);
  } catch (error) {
    const { statusCode, apiMessage } = extractHttpErrorDetails(error);
    throw new Error(`Failed to load Workspaces: (${statusCode}) ${apiMessage}`);
  }
}

export async function getPosts(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
  try {
    const baseRoot = normalizeBase(BASE_URL);
    const workspaceId = (this.getCurrentNodeParameter('workspaceId') as string) || '';
    if (!workspaceId) return [];
    const body: any = await apiRequest(this, {
      method: 'GET',
      url: `${baseRoot}/v1/workspaces/${workspaceId}/posts`,
      qs: { page: 1, per_page: 50 },
    });
    const list: any[] = body?.data || [];
    return list
      .map((p: any) => {
        const id = p?._id;
        if (!id) return null;
        const text: string = (p?.content?.text || p?.title || '') as string;
        const labelBase = `${(text || '').slice(0, 60)}${text && text.length > 60 ? '…' : ''}`.trim();
        const label = `${labelBase}${p?.status ? ` (${p.status})` : ''}` || String(id);
        return { name: label, value: id } as INodePropertyOptions;
      })
      .filter((o): o is INodePropertyOptions => !!o);
  } catch (error) {
    const { statusCode, apiMessage } = extractHttpErrorDetails(error);
    throw new Error(`Failed to load Posts: (${statusCode}) ${apiMessage}`);
  }
}

export async function getAccounts(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
  let workspaceId = '';
  try {
    const baseRoot = normalizeBase(BASE_URL);
    workspaceId = (this.getCurrentNodeParameter('workspaceId') as string) || '';
    if (!workspaceId) return [];
    const body: any = await apiRequest(this, {
      method: 'GET',
      url: `${baseRoot}/v1/workspaces/${workspaceId}/accounts`,
      qs: { page: 1, per_page: 100 },
    });
    const list: any[] = body?.data || [];
    return list
      .map(formatAccountOption)
      .filter((o): o is INodePropertyOptions => !!o);
  } catch (error) {
    const { statusCode, apiMessage } = extractHttpErrorDetails(error);
    const hint = statusCode === 403
      ? ' Forbidden: this API key user likely does not have access to Social Accounts in this workspace. Try a different workspaceId or adjust workspace/team permissions.'
      : '';
    throw new Error(`Failed to load Accounts for workspace ${workspaceId}: (${statusCode}) ${apiMessage}${hint}`);
  }
}

export async function getContentCategories(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
  try {
    const baseRoot = normalizeBase(BASE_URL);
    const workspaceId = (this.getCurrentNodeParameter('workspaceId') as string) || '';
    if (!workspaceId) return [];
    const body: any = await apiRequest(this, {
      method: 'GET',
      url: `${baseRoot}/v1/workspaces/${workspaceId}/content-categories`,
      qs: { page: 1, per_page: 100 },
    });
    const list: any[] = extractListFromBody(body);
    return list
      .map((c: any) => {
        const id = c?._id;
        if (!id) return null;
        const name = c?.name || String(id);
        return { name, value: id } as INodePropertyOptions;
      })
      .filter((o): o is INodePropertyOptions => !!o);
  } catch (error) {
    const { statusCode, apiMessage } = extractHttpErrorDetails(error);
    throw new Error(`Failed to load Content Categories: (${statusCode}) ${apiMessage}`);
  }
}

export async function getFacebookBackgrounds(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
  try {
    const baseRoot = normalizeBase(BASE_URL);
    const body: any = await apiRequest(this, {
      method: 'GET',
      url: `${baseRoot}/v1/facebook/text-backgrounds`,
    });
    const list: any[] = extractListFromBody(body);
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
    const { statusCode, apiMessage } = extractHttpErrorDetails(error);
    throw new Error(`Failed to load Facebook Text Backgrounds: (${statusCode}) ${apiMessage}`);
  }
}

export async function getTeamMembers(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
  try {
    const baseRoot = normalizeBase(BASE_URL);
    const workspaceId = (this.getCurrentNodeParameter('workspaceId') as string) || '';
    if (!workspaceId) return [];
    const body: any = await apiRequest(this, {
      method: 'GET',
      url: `${baseRoot}/v1/workspaces/${workspaceId}/team-members`,
      qs: { page: 1, per_page: 100 },
    });
    const list: any[] = extractListFromBody(body);
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
    const { statusCode, apiMessage } = extractHttpErrorDetails(error);
    throw new Error(`Failed to load Team Members: (${statusCode}) ${apiMessage}`);
  }
}
