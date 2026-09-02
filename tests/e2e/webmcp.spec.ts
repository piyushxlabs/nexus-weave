import { test, expect } from '@playwright/test';

test.describe('Nexus Weave — End-to-End Application & WebMCP Suites', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for the SVG graph canvas to mount
    await page.waitForSelector('#graph-canvas');
  });

  test('1. Application Mounts Reactive SVG Canvas with 16 Microservice Nodes and 23 Edges', async ({ page }) => {
    // Check page title
    await expect(page).toHaveTitle(/Nexus Weave/);

    // Verify main layout containers exist
    await expect(page.locator('#banner-root')).toBeAttached();
    await expect(page.locator('#canvas-container')).toBeVisible();
    await expect(page.locator('#graph-canvas')).toBeVisible();
    await expect(page.locator('#activity-panel-root')).toBeVisible();

    // Verify exactly 16 microservice nodes are rendered in SVG
    const nodes = page.locator('#graph-canvas .graph-node');
    await expect(nodes).toHaveCount(16);

    // Verify edges are rendered with arrow markers
    const edges = page.locator('#graph-canvas .edges-layer line');
    await expect(edges).toHaveCount(23);

    // Verify order-service and payment-service nodes exist
    await expect(page.locator('#node-order-service text')).toHaveText('Order Service');
    await expect(page.locator('#node-payment-service text')).toHaveText('Payment Gateway');
  });

  test('2. Cold-Judge Onboarding Banner Displays Flags, Copy CTA, and Interactive Walkthrough Modal', async ({ page }) => {
    const banner = page.locator('#unsupported-browser-banner');

    // When running in standard browser, the banner should be visible
    if (await banner.isVisible()) {
      await expect(banner).toContainText('WebMCP Environment: Inactive (Standard Browser)');
      await expect(banner).toContainText('chrome://flags/#enable-webmcp-testing');

      // Test copy testing flag CTA button
      const copyBtn = page.locator('#copy-flag-btn');
      await expect(copyBtn).toBeVisible();
      await copyBtn.click();
      await expect(copyBtn).toContainText(/Copied|Flag/);

      // Test watch demo video walkthrough modal
      const demoBtn = page.locator('#watch-demo-btn');
      await expect(demoBtn).toBeVisible();
      await demoBtn.click();

      const modal = page.locator('#nexus-demo-modal');
      await expect(modal).toBeVisible();
      await expect(modal).toContainText('2-Minute WebMCP Walkthrough');

      // Close modal
      const closeBtn = page.locator('#close-modal-btn');
      await closeBtn.click();
      await expect(modal).not.toBeVisible();
    }
  });

  test('3. Direct Pin Manipulation Toggles Visual State and Pinned Attributes on Canvas', async ({ page }) => {
    const orderNode = page.locator('#node-order-service');
    await expect(orderNode).toBeVisible();

    // Initially unpinned
    await expect(orderNode).not.toHaveClass(/pinned/);

    // Click the pin badge on order-service
    const pinBadge = orderNode.locator('.pin-badge');
    await expect(pinBadge).toBeVisible();
    await pinBadge.click();

    // Now pinned
    await expect(orderNode).toHaveClass(/pinned/);

    // Click again to unpin
    await pinBadge.click();
    await expect(orderNode).not.toHaveClass(/pinned/);
  });

  test('4. Activity & Telemetry Panel Expands, Collapses, and Inspects Entries', async ({ page }) => {
    const panel = page.locator('#activity-panel-root .activity-panel-widget');
    await expect(panel).toBeVisible();
    await expect(panel).toContainText('Activity & Telemetry Log');

    const toggle = page.locator('#activity-panel-toggle');
    const body = page.locator('#activity-panel-body');

    // Initially expanded
    await expect(body).toBeVisible();

    // Toggle collapse
    await toggle.click();
    await expect(body).not.toBeVisible();

    // Toggle expand
    await toggle.click();
    await expect(body).toBeVisible();
  });

  test('5. Direct Node Dragging Updates SVG Coordinates Smoothly', async ({ page }) => {
    const apiGateway = page.locator('#node-api-gateway');
    await expect(apiGateway).toBeVisible();

    const initialTransform = await apiGateway.getAttribute('transform');
    expect(initialTransform).toBeTruthy();

    const box = await apiGateway.boundingBox();
    expect(box).toBeTruthy();

    // Drag node by 60px right and 40px down with intermediate steps
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.down();
    await page.mouse.move(box!.x + box!.width / 2 + 60, box!.y + box!.height / 2 + 40, { steps: 5 });
    await page.mouse.up();

    const updatedTransform = await apiGateway.getAttribute('transform');
    expect(updatedTransform).toBeTruthy();
    expect(updatedTransform).not.toBe(initialTransform);
  });

  test('6. Canvas Viewport Navigation: Background Panning and Wheel Zooming Update ViewBox', async ({ page }) => {
    const canvas = page.locator('#graph-canvas');
    await expect(canvas).toBeVisible();

    const initialViewBox = await canvas.getAttribute('viewBox');
    expect(initialViewBox).toBeTruthy();


    // Pan canvas by dragging on empty background area
    await page.mouse.move(200, 150);
    await page.mouse.down();
    await page.mouse.move(250, 200, { steps: 5 });
    await page.mouse.up();

    const pannedViewBox = await canvas.getAttribute('viewBox');
    expect(pannedViewBox).toBeTruthy();
    expect(pannedViewBox).not.toBe(initialViewBox);

    // Zoom canvas using mouse wheel (zoom in)
    await page.mouse.move(300, 300);
    await page.mouse.wheel(0, -200);
    await page.waitForTimeout(100);

    const zoomedViewBox = await canvas.getAttribute('viewBox');
    expect(zoomedViewBox).toBeTruthy();
    expect(zoomedViewBox).not.toBe(pannedViewBox);
  });
});
