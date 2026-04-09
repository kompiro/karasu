import { describe, it, expect } from "vitest";
import { K8sTranslator } from "./k8s.js";
import type { TranslatorContext } from "./translator.js";

const ctx: TranslatorContext = {
  inputPath: "/project/manifests/deployment.yaml",
};

describe("K8sTranslator", () => {
  const translator = new K8sTranslator();

  it("translates a Deployment to an oci unit", async () => {
    const input = `
apiVersion: apps/v1
kind: Deployment
metadata:
  name: order-service
  namespace: production
spec:
  template:
    spec:
      containers:
        - name: app
          image: order-service:1.0.0
`;
    const result = await translator.translate(input, ctx);
    expect(result).toContain('deploy "production" {');
    expect(result).toContain('  oci "order-service" {');
    expect(result).toContain('    image "order-service:1.0.0"');
    expect(result).toContain("    realizes OrderService");
  });

  it("uses karasu/realizes label for realizes resolution", async () => {
    const input = `
apiVersion: apps/v1
kind: Deployment
metadata:
  name: monolith
  namespace: default
  labels:
    karasu/realizes: "OrderService,InventoryService"
spec:
  template:
    spec:
      containers:
        - name: app
          image: monolith:1.0.0
`;
    const result = await translator.translate(input, ctx);
    expect(result).toContain("    realizes OrderService");
    expect(result).toContain("    realizes InventoryService");
  });

  it("translates a CronJob to a job unit with schedule", async () => {
    const input = `
apiVersion: batch/v1
kind: CronJob
metadata:
  name: billing-job
  namespace: default
spec:
  schedule: "0 0 1 * *"
  jobTemplate:
    spec:
      template:
        spec:
          containers:
            - name: job
              image: billing-job:latest
`;
    const result = await translator.translate(input, ctx);
    expect(result).toContain('  job "billing-job" {');
    expect(result).toContain('    schedule "0 0 1 * *"');
    expect(result).toContain('    image "billing-job:latest"');
  });

  it("translates a Job to a job unit", async () => {
    const input = `
apiVersion: batch/v1
kind: Job
metadata:
  name: migration
  namespace: default
spec:
  template:
    spec:
      containers:
        - name: job
          image: migration:latest
`;
    const result = await translator.translate(input, ctx);
    expect(result).toContain('  job "migration" {');
  });

  it("skips non-workload resources (Service, ConfigMap)", async () => {
    const input = `
apiVersion: v1
kind: Service
metadata:
  name: order-service
  namespace: default
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: order-service
  namespace: default
spec:
  template:
    spec:
      containers:
        - name: app
          image: order-service:1.0.0
`;
    const result = await translator.translate(input, ctx);
    // Only one unit (the Deployment)
    const ociCount = (result.match(/oci "/g) ?? []).length;
    expect(ociCount).toBe(1);
  });

  it("returns empty string when no workloads found", async () => {
    const input = `
apiVersion: v1
kind: ConfigMap
metadata:
  name: config
`;
    const result = await translator.translate(input, ctx);
    expect(result).toBe("");
  });

  it("uses default namespace when not specified", async () => {
    const input = `
apiVersion: apps/v1
kind: Deployment
metadata:
  name: order-service
spec:
  template:
    spec:
      containers:
        - name: app
          image: order-service:latest
`;
    const result = await translator.translate(input, ctx);
    expect(result).toContain('deploy "default" {');
  });

  it("handles multi-document YAML with multiple workloads", async () => {
    const input = `
apiVersion: apps/v1
kind: Deployment
metadata:
  name: order-service
  namespace: production
spec:
  template:
    spec:
      containers:
        - name: app
          image: order-service:1.0.0
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: payment-svc
  namespace: production
spec:
  template:
    spec:
      containers:
        - name: app
          image: payment-svc:1.0.0
`;
    const result = await translator.translate(input, ctx);
    expect(result).toContain('  oci "order-service" {');
    expect(result).toContain('  oci "payment-svc" {');
  });
});
