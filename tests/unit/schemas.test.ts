import { describe, it, expect } from 'vitest';
import {
  getGraphTopologyMetadata,
  validateGetGraphTopologyArgs,
} from '../../src/tools/schemas/getGraphTopology.schema.js';
import {
  detectCyclesAndBottlenecksMetadata,
  validateDetectCyclesAndBottlenecksArgs,
} from '../../src/tools/schemas/detectCyclesAndBottlenecks.schema.js';
import {
  computeCriticalPathMetadata,
  validateComputeCriticalPathArgs,
} from '../../src/tools/schemas/computeCriticalPath.schema.js';
import {
  minimizeEdgeCrossingsMetadata,
  validateMinimizeEdgeCrossingsArgs,
} from '../../src/tools/schemas/minimizeEdgeCrossings.schema.js';
import {
  pinAndGroupRegionMetadata,
  validatePinAndGroupRegionArgs,
} from '../../src/tools/schemas/pinAndGroupRegion.schema.js';

describe('Tool Schema Validation (ajv)', () => {
  describe('get_graph_topology', () => {
    it('has compliant WebMCP metadata and annotations', () => {
      expect(getGraphTopologyMetadata.name).toBe('get_graph_topology');
      expect(getGraphTopologyMetadata.annotations.readOnlyHint).toBe(true);
      expect(getGraphTopologyMetadata.annotations.untrustedContentHint).toBe(true);
      expect(getGraphTopologyMetadata.inputSchema.type).toBe('object');
    });

    it('accepts valid empty arguments', () => {
      const res = validateGetGraphTopologyArgs({});
      expect(res.valid).toBe(true);
      expect(res.errors).toHaveLength(0);
    });

    it('rejects unexpected properties', () => {
      const res = validateGetGraphTopologyArgs({ unexpected: true });
      expect(res.valid).toBe(false);
      expect(res.errors.length).toBeGreaterThan(0);
    });
  });

  describe('detect_cycles_and_bottlenecks', () => {
    it('has compliant WebMCP metadata and annotations', () => {
      expect(detectCyclesAndBottlenecksMetadata.name).toBe('detect_cycles_and_bottlenecks');
      expect(detectCyclesAndBottlenecksMetadata.annotations.readOnlyHint).toBe(true);
    });

    it('accepts valid empty arguments', () => {
      const res = validateDetectCyclesAndBottlenecksArgs({});
      expect(res.valid).toBe(true);
      expect(res.errors).toHaveLength(0);
    });

    it('rejects unexpected properties', () => {
      const res = validateDetectCyclesAndBottlenecksArgs({ bad_field: 123 });
      expect(res.valid).toBe(false);
    });
  });

  describe('compute_critical_path', () => {
    it('accepts valid duration_field arguments', () => {
      const res1 = validateComputeCriticalPathArgs({ duration_field: 'duration' });
      expect(res1.valid).toBe(true);
      const res2 = validateComputeCriticalPathArgs({ duration_field: 'estimated_time_ms' });
      expect(res2.valid).toBe(true);
    });

    it('rejects missing duration_field', () => {
      const res = validateComputeCriticalPathArgs({});
      expect(res.valid).toBe(false);
      expect(res.errors.length).toBeGreaterThan(0);
    });

    it('rejects empty duration_field string', () => {
      const res = validateComputeCriticalPathArgs({ duration_field: '' });
      expect(res.valid).toBe(false);
    });

    it('rejects non-string duration_field', () => {
      const res = validateComputeCriticalPathArgs({ duration_field: 100 });
      expect(res.valid).toBe(false);
    });

    it('rejects prototype-pollution reserved keys (__proto__, constructor, prototype)', () => {
      const protoRes = validateComputeCriticalPathArgs({ duration_field: '__proto__' });
      expect(protoRes.valid).toBe(false);
      expect(protoRes.errors[0]).toContain('prohibited reserved JavaScript property');

      const ctorRes = validateComputeCriticalPathArgs({ duration_field: 'constructor' });
      expect(ctorRes.valid).toBe(false);

      const prototypeRes = validateComputeCriticalPathArgs({ duration_field: 'prototype' });
      expect(prototypeRes.valid).toBe(false);
    });
  });

  describe('minimize_edge_crossings', () => {
    it('accepts arguments with ONLY region_node_ids (confirm_pending is optional)', () => {
      const res = validateMinimizeEdgeCrossingsArgs({
        region_node_ids: ['service-a', 'service-b'],
      });
      expect(res.valid).toBe(true);
      expect(res.errors).toHaveLength(0);
    });

    it('accepts arguments with explicit confirm_pending boolean', () => {
      const resTrue = validateMinimizeEdgeCrossingsArgs({
        region_node_ids: ['service-a'],
        confirm_pending: true,
      });
      expect(resTrue.valid).toBe(true);

      const resFalse = validateMinimizeEdgeCrossingsArgs({
        region_node_ids: ['service-a'],
        confirm_pending: false,
      });
      expect(resFalse.valid).toBe(true);
    });

    it('rejects missing region_node_ids', () => {
      const res = validateMinimizeEdgeCrossingsArgs({});
      expect(res.valid).toBe(false);
    });

    it('rejects empty region_node_ids array', () => {
      const res = validateMinimizeEdgeCrossingsArgs({
        region_node_ids: [],
      });
      expect(res.valid).toBe(false);
    });

    it('rejects non-boolean confirm_pending', () => {
      const res = validateMinimizeEdgeCrossingsArgs({
        region_node_ids: ['service-a'],
        confirm_pending: 'true',
      });
      expect(res.valid).toBe(false);
    });

    it('rejects extra properties', () => {
      const res = validateMinimizeEdgeCrossingsArgs({
        region_node_ids: ['service-a'],
        unauthorized: 1,
      });
      expect(res.valid).toBe(false);
    });
  });

  describe('pin_and_group_region', () => {
    it('accepts valid node_ids array and pinned boolean', () => {
      const res1 = validatePinAndGroupRegionArgs({
        node_ids: ['service-a', 'service-b'],
        pinned: true,
      });
      expect(res1.valid).toBe(true);

      const res2 = validatePinAndGroupRegionArgs({
        node_ids: ['service-a'],
        pinned: false,
      });
      expect(res2.valid).toBe(true);
    });

    it('rejects missing node_ids', () => {
      const res = validatePinAndGroupRegionArgs({
        pinned: true,
      });
      expect(res.valid).toBe(false);
    });

    it('rejects missing pinned flag', () => {
      const res = validatePinAndGroupRegionArgs({
        node_ids: ['service-a'],
      });
      expect(res.valid).toBe(false);
    });

    it('rejects empty node_ids array', () => {
      const res = validatePinAndGroupRegionArgs({
        node_ids: [],
        pinned: true,
      });
      expect(res.valid).toBe(false);
    });

    it('rejects non-boolean pinned flag', () => {
      const res = validatePinAndGroupRegionArgs({
        node_ids: ['service-a'],
        pinned: 'yes',
      });
      expect(res.valid).toBe(false);
    });

    it('rejects unexpected properties', () => {
      const res = validatePinAndGroupRegionArgs({
        node_ids: ['service-a'],
        pinned: true,
        extra: true,
      });
      expect(res.valid).toBe(false);
    });
  });
});
