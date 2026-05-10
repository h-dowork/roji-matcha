import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import express from 'express';
import cors from 'cors';
import { chromium, Browser, Page } from 'playwright';

const PORT = 3001;

let browser: Browser | null = null;
let page: Page | null = null;

async function ensureBrowser(): Promise<Page> {
  if (!browser || !browser.isConnected()) {
    browser = await chromium.launch({ headless: true });
  }
  if (!page || page.isClosed()) {
    page = await browser.newPage();
  }
  return page;
}

const app = express();
app.use(cors());
app.use(express.json());

const server = new Server(
  { name: 'mcp-playwright', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'browser_navigate',
      description: 'Navigate to a URL. Launches the browser if not already running.',
      inputSchema: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'URL to navigate to' },
        },
        required: ['url'],
      },
    },
    {
      name: 'browser_screenshot',
      description: 'Take a screenshot of the current page or a specific element.',
      inputSchema: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'CSS selector to screenshot (optional, defaults to full page)' },
        },
      },
    },
    {
      name: 'browser_click',
      description: 'Click an element on the page.',
      inputSchema: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'CSS selector of element to click' },
        },
        required: ['selector'],
      },
    },
    {
      name: 'browser_type',
      description: 'Type text into an element.',
      inputSchema: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'CSS selector of element to type into' },
          text: { type: 'string', description: 'Text to type' },
        },
        required: ['selector', 'text'],
      },
    },
    {
      name: 'browser_evaluate',
      description: 'Evaluate JavaScript in the page context and return the result.',
      inputSchema: {
        type: 'object',
        properties: {
          script: { type: 'string', description: 'JavaScript expression to evaluate' },
        },
        required: ['script'],
      },
    },
    {
      name: 'browser_close',
      description: 'Close the browser.',
      inputSchema: { type: 'object', properties: {} },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'browser_navigate': {
        const { url } = args as { url: string };
        const p = await ensureBrowser();
        await p.goto(url, { waitUntil: 'domcontentloaded' });
        const title = await p.title();
        return {
          content: [{ type: 'text', text: `Navigated to ${url}\nTitle: ${title}\nURL: ${p.url()}` }],
        };
      }

      case 'browser_screenshot': {
        const { selector } = (args ?? {}) as { selector?: string };
        const p = await ensureBrowser();
        let buffer: Buffer;
        if (selector) {
          const el = await p.locator(selector).first();
          buffer = await el.screenshot({ type: 'png' });
        } else {
          buffer = await p.screenshot({ type: 'png', fullPage: true });
        }
        const base64 = buffer.toString('base64');
        return {
          content: [{ type: 'image', data: base64, mimeType: 'image/png' }],
        };
      }

      case 'browser_click': {
        const { selector } = args as { selector: string };
        const p = await ensureBrowser();
        await p.locator(selector).first().click();
        return {
          content: [{ type: 'text', text: `Clicked element: ${selector}` }],
        };
      }

      case 'browser_type': {
        const { selector, text } = args as { selector: string; text: string };
        const p = await ensureBrowser();
        await p.locator(selector).first().fill(text);
        return {
          content: [{ type: 'text', text: `Typed "${text}" into ${selector}` }],
        };
      }

      case 'browser_evaluate': {
        const { script } = args as { script: string };
        const p = await ensureBrowser();
        const result = await p.evaluate(script);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      case 'browser_close': {
        if (page && !page.isClosed()) {
          await page.close();
          page = null;
        }
        if (browser && browser.isConnected()) {
          await browser.close();
          browser = null;
        }
        return {
          content: [{ type: 'text', text: 'Browser closed.' }],
        };
      }

      default:
        return {
          content: [{ type: 'text', text: `Unknown tool: ${name}` }],
          isError: true,
        };
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

app.listen(PORT, () => console.log(`mcp-playwright running on :${PORT}`));
