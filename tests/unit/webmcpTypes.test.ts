import { describe, it, expect } from 'vitest';
import type { ModelContext, WebMCPToolDefinition } from '../../src/webmcp/webmcp.js';

describe('WebMCP Ambient Types', () => {
  it('defines ModelContext interface correctly', () => {
    const mockContext: ModelContext = {
      registerTool: (_tool: WebMCPToolDefinition) => {},
      getTools: () => [],
    };
    expect(mockContext).toBeDefined();
    expect(typeof mockContext.registerTool).toBe('function');
  });

  it('recognizes document.modelContext and navigator.modelContext', () => {
    const hasDoc = typeof document !== 'undefined';
    if (hasDoc) {
      expect(document.modelContext).toBeUndefined();
    }
    const hasNav = typeof navigator !== 'undefined';
    if (hasNav) {
      expect(navigator.modelContext).toBeUndefined();
    }
  });
});
