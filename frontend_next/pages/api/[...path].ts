import type { NextApiRequest, NextApiResponse } from 'next';

const backendUrl = process.env.BACKEND_URL || 'http://backend:5000';

function buildTargetUrl(req: NextApiRequest) {
  const parts = Array.isArray(req.query.path) ? req.query.path : [String(req.query.path || '')];
  const params = new URLSearchParams();
  Object.entries(req.query).forEach(([key, value]) => {
    if (key === 'path') return;
    if (Array.isArray(value)) value.forEach((item) => params.append(key, item));
    else if (value !== undefined) params.set(key, String(value));
  });
  const search = params.toString();
  return `${backendUrl.replace(/\/$/, '')}/api/${parts.map(encodeURIComponent).join('/')}${search ? `?${search}` : ''}`;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const headers: Record<string, string> = { accept: 'application/json' };
  if (req.headers.authorization) headers.authorization = req.headers.authorization;
  if (req.headers['content-type']) headers['content-type'] = String(req.headers['content-type']);

  const options: RequestInit = { method: req.method, headers };
  if (req.method && !['GET', 'HEAD'].includes(req.method)) {
    options.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {});
    if (!headers['content-type']) headers['content-type'] = 'application/json';
  }

  const response = await fetch(buildTargetUrl(req), options);
  const body = await response.text();
  res.status(response.status);
  const contentType = response.headers.get('content-type');
  if (contentType) res.setHeader('content-type', contentType);
  res.send(body);
}