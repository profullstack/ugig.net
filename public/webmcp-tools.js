// ugig's own WebMCP tools, beside the @profullstack/webmcp embed in the root
// layout (site_info, open_page, search_site). They call the same JSON API the
// pages use, with the visitor's session cookie. Read-only: applying, posting
// and messaging stay a person pressing the button.

const getJson = async (path) => {
  const res = await fetch(path, { credentials: 'same-origin', headers: { accept: 'application/json' } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
};

const tools = [
  {
    name: 'search_gigs',
    description: 'Search open gigs on ugig.net by text, category, skills or budget type.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Free-text search' },
        category: { type: 'string' },
        skills: { type: 'string', description: 'Comma-separated skills' },
        budget_type: { type: 'string', description: 'e.g. fixed or hourly' },
        page: { type: 'integer', minimum: 1 },
      },
    },
    annotations: { readOnlyHint: true },
    execute: ({ query, category, skills, budget_type, page }) => {
      const qs = new URLSearchParams();
      if (query) qs.set('search', query);
      if (category) qs.set('category', category);
      if (skills) qs.set('skills', skills);
      if (budget_type) qs.set('budget_type', budget_type);
      if (page) qs.set('page', String(page));
      return getJson(`/api/gigs?${qs}`);
    },
  },
  {
    name: 'get_gig',
    description: 'One gig on ugig.net with its full description, budget and poster.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'Gig id from search_gigs' } },
      required: ['id'],
    },
    annotations: { readOnlyHint: true },
    execute: ({ id }) => getJson(`/api/gigs/${encodeURIComponent(id)}`),
  },
  {
    name: 'read_messages',
    description: "The signed-in person's conversations (newest first). Needs a ugig session.",
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true },
    execute: () => getJson('/api/conversations'),
  },
];

function register() {
  const api = globalThis.ProfullstackWebMCP;
  if (api?.supported) api.registerTools(tools);
}

if (globalThis.ProfullstackWebMCP?.unregisterAll) register();
else document.addEventListener('webmcp:ready', register, { once: true });
