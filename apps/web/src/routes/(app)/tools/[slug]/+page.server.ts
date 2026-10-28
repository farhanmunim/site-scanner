import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { toolBySlug } from '$lib/ui/tools';

export const load: PageServerLoad = ({ params, url }) => {
  const tool = toolBySlug(params.slug);
  if (!tool) error(404, { message: 'Tool not found' });
  return { tool, prefill: url.searchParams.get('url')?.slice(0, 2048) ?? '' };
};
