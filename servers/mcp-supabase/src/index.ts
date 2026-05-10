import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import express from 'express';
import cors from 'cors';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const PORT = 3004;

function getSupabase(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.');
  return createClient(url, key, { auth: { persistSession: false } });
}

const app = express();
app.use(cors());
app.use(express.json());

const server = new Server(
  { name: 'mcp-supabase', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'supabase_query',
      description: 'Run a raw SQL query via Supabase RPC (requires a sql_query function in the DB, or use the pg_meta approach).',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'SQL query to execute' },
        },
        required: ['query'],
      },
    },
    {
      name: 'supabase_list_tables',
      description: 'List all user tables in the public schema.',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'supabase_select',
      description: 'Select rows from a table with optional filters.',
      inputSchema: {
        type: 'object',
        properties: {
          table: { type: 'string' },
          filters: { type: 'object', description: 'Key-value pairs for equality filters (optional)' },
          limit: { type: 'number', description: 'Max rows to return (default 100)' },
        },
        required: ['table'],
      },
    },
    {
      name: 'supabase_insert',
      description: 'Insert one or more rows into a table.',
      inputSchema: {
        type: 'object',
        properties: {
          table: { type: 'string' },
          data: { description: 'Row object or array of row objects to insert' },
        },
        required: ['table', 'data'],
      },
    },
    {
      name: 'supabase_update',
      description: 'Update rows in a table matching given criteria.',
      inputSchema: {
        type: 'object',
        properties: {
          table: { type: 'string' },
          match: { type: 'object', description: 'Key-value pairs to identify rows to update' },
          data: { type: 'object', description: 'Fields to update' },
        },
        required: ['table', 'match', 'data'],
      },
    },
    {
      name: 'supabase_delete',
      description: 'Delete rows from a table matching given criteria.',
      inputSchema: {
        type: 'object',
        properties: {
          table: { type: 'string' },
          match: { type: 'object', description: 'Key-value pairs to identify rows to delete' },
        },
        required: ['table', 'match'],
      },
    },
    {
      name: 'supabase_list_users',
      description: 'List Supabase auth users.',
      inputSchema: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Max users to return (default 50)' },
        },
      },
    },
    {
      name: 'storage_list_buckets',
      description: 'List all Supabase storage buckets.',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'storage_list_files',
      description: 'List files in a storage bucket.',
      inputSchema: {
        type: 'object',
        properties: {
          bucket: { type: 'string' },
          path: { type: 'string', description: 'Folder path within bucket (optional)' },
        },
        required: ['bucket'],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    const sb = getSupabase();

    switch (name) {
      case 'supabase_query': {
        const { query } = args as { query: string };
        const { data, error } = await sb.rpc('exec_sql', { query });
        if (error) throw new Error(error.message);
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      }

      case 'supabase_list_tables': {
        const { data, error } = await sb
          .from('information_schema.tables')
          .select('table_name, table_type')
          .eq('table_schema', 'public')
          .order('table_name');
        if (error) throw new Error(error.message);
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      }

      case 'supabase_select': {
        const { table, filters, limit = 100 } = args as {
          table: string;
          filters?: Record<string, unknown>;
          limit?: number;
        };
        let q = sb.from(table).select('*').limit(limit);
        if (filters) {
          for (const [key, value] of Object.entries(filters)) {
            q = q.eq(key, value as string);
          }
        }
        const { data, error } = await q;
        if (error) throw new Error(error.message);
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      }

      case 'supabase_insert': {
        const { table, data: rows } = args as { table: string; data: Record<string, unknown> | Record<string, unknown>[] };
        const { data, error } = await sb.from(table).insert(rows).select();
        if (error) throw new Error(error.message);
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      }

      case 'supabase_update': {
        const { table, match, data: updates } = args as {
          table: string;
          match: Record<string, unknown>;
          data: Record<string, unknown>;
        };
        let q = sb.from(table).update(updates);
        for (const [key, value] of Object.entries(match)) {
          q = q.eq(key, value as string);
        }
        const { data, error } = await q.select();
        if (error) throw new Error(error.message);
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      }

      case 'supabase_delete': {
        const { table, match } = args as { table: string; match: Record<string, unknown> };
        let q = sb.from(table).delete();
        for (const [key, value] of Object.entries(match)) {
          q = q.eq(key, value as string);
        }
        const { data, error } = await q.select();
        if (error) throw new Error(error.message);
        return { content: [{ type: 'text', text: `Deleted rows: ${JSON.stringify(data, null, 2)}` }] };
      }

      case 'supabase_list_users': {
        const { limit = 50 } = (args ?? {}) as { limit?: number };
        const { data, error } = await sb.auth.admin.listUsers({ perPage: limit });
        if (error) throw new Error(error.message);
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      }

      case 'storage_list_buckets': {
        const { data, error } = await sb.storage.listBuckets();
        if (error) throw new Error(error.message);
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      }

      case 'storage_list_files': {
        const { bucket, path = '' } = args as { bucket: string; path?: string };
        const { data, error } = await sb.storage.from(bucket).list(path);
        if (error) throw new Error(error.message);
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      }

      default:
        return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { content: [{ type: 'text', text: message }], isError: true };
  }
});

const transport = new StreamableHTTPServerTransport({
  sessionIdGenerator: () => Math.random().toString(36).slice(2),
});

app.post('/mcp', (req, res) => transport.handleRequest(req, res, req.body));
app.get('/mcp', (req, res) => transport.handleRequest(req, res));
app.delete('/mcp', (req, res) => transport.handleRequest(req, res));

await server.connect(transport);

app.listen(PORT, () => console.log(`mcp-supabase running on :${PORT}`));
