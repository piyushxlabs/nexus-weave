/**
 * Pre-loaded tangled Microservices Architecture seed graph.
 * Features 16 realistic service nodes, crossing dependencies, and 1 intentional circular cycle
 * (order-service -> payment-service -> notification-service -> order-service).
 */

import type { NodeRecord, EdgeRecord } from './schema.js';

export const SEED_NODES: Record<string, NodeRecord> = {
  'api-gateway': {
    id: 'api-gateway',
    label: 'API Gateway',
    x: 100,
    y: 300,
    pinned: false,
    duration: 15,
  },
  'auth-service': {
    id: 'auth-service',
    label: 'Auth Service',
    x: 260,
    y: 140,
    pinned: false,
    duration: 25,
  },
  'user-service': {
    id: 'user-service',
    label: 'User Service',
    x: 260,
    y: 460,
    pinned: false,
    duration: 30,
  },
  'catalog-service': {
    id: 'catalog-service',
    label: 'Catalog Service',
    x: 260,
    y: 300,
    pinned: false,
    duration: 20,
  },
  'pricing-service': {
    id: 'pricing-service',
    label: 'Pricing Engine',
    x: 420,
    y: 160,
    pinned: false,
    duration: 20,
  },
  'order-service': {
    id: 'order-service',
    label: 'Order Service',
    x: 420,
    y: 320,
    pinned: false,
    duration: 45,
  },
  'inventory-service': {
    id: 'inventory-service',
    label: 'Inventory Service',
    x: 420,
    y: 460,
    pinned: false,
    duration: 35,
  },
  'payment-service': {
    id: 'payment-service',
    label: 'Payment Gateway',
    x: 580,
    y: 180,
    pinned: false,
    duration: 60,
  },
  'notification-service': {
    id: 'notification-service',
    label: 'Notification Service',
    x: 500,
    y: 80,
    pinned: false,
    duration: 20,
  },
  'fraud-detection': {
    id: 'fraud-detection',
    label: 'Fraud Detection',
    x: 580,
    y: 320,
    pinned: false,
    duration: 30,
  },
  'shipping-service': {
    id: 'shipping-service',
    label: 'Shipping Service',
    x: 740,
    y: 320,
    pinned: false,
    duration: 50,
  },
  'billing-service': {
    id: 'billing-service',
    label: 'Billing Service',
    x: 740,
    y: 180,
    pinned: false,
    duration: 35,
  },
  'analytics-service': {
    id: 'analytics-service',
    label: 'Analytics Service',
    x: 740,
    y: 460,
    pinned: false,
    duration: 40,
  },
  'email-worker': {
    id: 'email-worker',
    label: 'Email Dispatcher',
    x: 380,
    y: 40,
    pinned: false,
    duration: 15,
  },
  'sms-worker': {
    id: 'sms-worker',
    label: 'SMS Dispatcher',
    x: 620,
    y: 40,
    pinned: false,
    duration: 15,
  },
  'audit-logger': {
    id: 'audit-logger',
    label: 'Audit Vault',
    x: 900,
    y: 300,
    pinned: false,
    duration: 10,
  },
};

export const SEED_EDGES: Record<string, EdgeRecord> = {
  // Intentional circular dependency: order-service -> payment-service -> notification-service -> order-service
  e_order_payment: {
    id: 'e_order_payment',
    source_id: 'order-service',
    target_id: 'payment-service',
    is_cyclic: null,
    is_critical: null,
  },
  e_payment_notif: {
    id: 'e_payment_notif',
    source_id: 'payment-service',
    target_id: 'notification-service',
    is_cyclic: null,
    is_critical: null,
  },
  e_notif_order: {
    id: 'e_notif_order',
    source_id: 'notification-service',
    target_id: 'order-service',
    is_cyclic: null,
    is_critical: null,
  },

  // Gateway ingress edges
  e_gateway_auth: {
    id: 'e_gateway_auth',
    source_id: 'api-gateway',
    target_id: 'auth-service',
    is_cyclic: null,
    is_critical: null,
  },
  e_gateway_catalog: {
    id: 'e_gateway_catalog',
    source_id: 'api-gateway',
    target_id: 'catalog-service',
    is_cyclic: null,
    is_critical: null,
  },
  e_gateway_user: {
    id: 'e_gateway_user',
    source_id: 'api-gateway',
    target_id: 'user-service',
    is_cyclic: null,
    is_critical: null,
  },
  e_gateway_order: {
    id: 'e_gateway_order',
    source_id: 'api-gateway',
    target_id: 'order-service',
    is_cyclic: null,
    is_critical: null,
  },

  // Tangled crossing edges
  e_auth_user: {
    id: 'e_auth_user',
    source_id: 'auth-service',
    target_id: 'user-service',
    is_cyclic: null,
    is_critical: null,
  },
  e_catalog_pricing: {
    id: 'e_catalog_pricing',
    source_id: 'catalog-service',
    target_id: 'pricing-service',
    is_cyclic: null,
    is_critical: null,
  },
  e_pricing_order: {
    id: 'e_pricing_order',
    source_id: 'pricing-service',
    target_id: 'order-service',
    is_cyclic: null,
    is_critical: null,
  },
  e_user_order: {
    id: 'e_user_order',
    source_id: 'user-service',
    target_id: 'order-service',
    is_cyclic: null,
    is_critical: null,
  },
  e_order_inventory: {
    id: 'e_order_inventory',
    source_id: 'order-service',
    target_id: 'inventory-service',
    is_cyclic: null,
    is_critical: null,
  },
  e_inventory_shipping: {
    id: 'e_inventory_shipping',
    source_id: 'inventory-service',
    target_id: 'shipping-service',
    is_cyclic: null,
    is_critical: null,
  },
  e_payment_fraud: {
    id: 'e_payment_fraud',
    source_id: 'payment-service',
    target_id: 'fraud-detection',
    is_cyclic: null,
    is_critical: null,
  },
  e_fraud_order: {
    id: 'e_fraud_order',
    source_id: 'fraud-detection',
    target_id: 'order-service',
    is_cyclic: null,
    is_critical: null,
  },
  e_order_shipping: {
    id: 'e_order_shipping',
    source_id: 'order-service',
    target_id: 'shipping-service',
    is_cyclic: null,
    is_critical: null,
  },
  e_payment_billing: {
    id: 'e_payment_billing',
    source_id: 'payment-service',
    target_id: 'billing-service',
    is_cyclic: null,
    is_critical: null,
  },
  e_notification_email: {
    id: 'e_notification_email',
    source_id: 'notification-service',
    target_id: 'email-worker',
    is_cyclic: null,
    is_critical: null,
  },
  e_notification_sms: {
    id: 'e_notification_sms',
    source_id: 'notification-service',
    target_id: 'sms-worker',
    is_cyclic: null,
    is_critical: null,
  },
  e_shipping_analytics: {
    id: 'e_shipping_analytics',
    source_id: 'shipping-service',
    target_id: 'analytics-service',
    is_cyclic: null,
    is_critical: null,
  },
  e_billing_audit: {
    id: 'e_billing_audit',
    source_id: 'billing-service',
    target_id: 'audit-logger',
    is_cyclic: null,
    is_critical: null,
  },
  e_shipping_audit: {
    id: 'e_shipping_audit',
    source_id: 'shipping-service',
    target_id: 'audit-logger',
    is_cyclic: null,
    is_critical: null,
  },
  e_analytics_audit: {
    id: 'e_analytics_audit',
    source_id: 'analytics-service',
    target_id: 'audit-logger',
    is_cyclic: null,
    is_critical: null,
  },
};

export function createSeedGraph(): {
  nodes: Record<string, NodeRecord>;
  edges: Record<string, EdgeRecord>;
} {
  // Return fresh deep copies to prevent reference leakage
  return {
    nodes: JSON.parse(JSON.stringify(SEED_NODES)),
    edges: JSON.parse(JSON.stringify(SEED_EDGES)),
  };
}
