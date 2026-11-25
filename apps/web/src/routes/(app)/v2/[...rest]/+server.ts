import { redirect, type RequestHandler } from '@sveltejs/kit';

/** The new design used to live under /v2; keep those links working. */
// Strip leading slashes and backslashes: `/v2//evil.example` must not become the protocol-relative `//evil.example`.
export const GET: RequestHandler = ({ params, url }) => redirect(308, `/${(params.rest ?? '').replace(/^[\\/]+/, '')}${url.search}`);
