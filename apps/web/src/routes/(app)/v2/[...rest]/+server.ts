import { redirect, type RequestHandler } from '@sveltejs/kit';

/** The new design used to live under /v2; keep those links working. */
export const GET: RequestHandler = ({ params, url }) => redirect(308, `/${params.rest ?? ''}${url.search}`);
