---
id: AT-0050
title: CLI translate command
type: manual
---

# AT-0050: CLI translate command

## Prerequisites

- `karasu` CLI is built and available (`pnpm build` in `packages/cli`)
- Sample files are available (see below)

## Test cases

> 🟡 Partially automated — `packages/cli/src/translate/translate.e2e.test.ts` covers the docker-compose / OpenAPI / DB heuristic paths, the `--from` / `--out` flags, and exit codes. Per-test-case `[x]` flips deferred to phase B (#920).

### AT-0050-01: Translate docker-compose.yml to deploy.krs (heuristic)

**Input** `docker-compose.yml`:

```yaml
name: production
services:
  order-service:
    image: order-service:1.0.0
  payment-svc:
    image: payment-svc:latest
```

**Command:**

```bash
karasu translate --from compose docker-compose.yml
```

**Expected output** (stdout):

```krs
deploy "production" {
  oci "order-service" {
    image "order-service:1.0.0"
    realizes OrderService
  }
  oci "payment-svc" {
    image "payment-svc:latest"
    realizes PaymentSvc
  }
}
```

---

### AT-0050-02: karasu/realizes label takes priority (stage 1)

**Input** `docker-compose.yml`:

```yaml
name: production
services:
  monolith:
    image: monolith:1.0.0
    labels:
      karasu/realizes: "OrderService,InventoryService"
```

**Command:**

```bash
karasu translate --from compose docker-compose.yml
```

**Expected output**:

```krs
deploy "production" {
  oci "monolith" {
    image "monolith:1.0.0"
    realizes OrderService
    realizes InventoryService
  }
}
```

---

### AT-0050-03: karasu.map.yaml is used (stage 2)

**Input** `docker-compose.yml`:

```yaml
name: production
services:
  app:
    image: app:1.0.0
```

**Input** `karasu.map.yaml` (in same directory):

```yaml
app: ECommerce
```

**Command:**

```bash
karasu translate --from compose docker-compose.yml
```

**Expected output**:

```krs
deploy "production" {
  oci "app" {
    image "app:1.0.0"
    realizes ECommerce
  }
}
```

---

### AT-0050-04: --map flag for explicit map path

**Setup**: `karasu.map.yaml` placed in a different directory.

**Command:**

```bash
karasu translate --from compose docker-compose.yml --map /path/to/karasu.map.yaml
```

**Expected**: Same output as AT-0050-03 but using the explicitly specified map file.

---

### AT-0050-05: TODO comment for unresolvable unit

**Input** `docker-compose.yml`:

```yaml
name: production
services:
  app:
    image: app:latest
```

(No `karasu.map.yaml`, no labels)

**Command:**

```bash
karasu translate --from compose docker-compose.yml
```

**Expected output**:

```krs
deploy "production" {
  oci "app" {
    image "app:latest"
    // TODO: realizes ? — could not resolve from naming convention
    // Add karasu/realizes label or karasu.map.yaml entry
  }
}
```

**Expected stderr**:

```
Warning: Could not resolve realizes for "app"
```

---

### AT-0050-06: Translate k8s Deployment manifest

**Input** `deployment.yaml`:

```yaml
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
```

**Command:**

```bash
karasu translate --from k8s deployment.yaml
```

**Expected output**:

```krs
deploy "production" {
  oci "order-service" {
    image "order-service:1.0.0"
    realizes OrderService
  }
}
```

---

### AT-0050-07: Translate k8s CronJob with schedule

**Input** `cronjob.yaml`:

```yaml
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
```

**Command:**

```bash
karasu translate --from k8s cronjob.yaml
```

**Expected output**:

```krs
deploy "default" {
  job "billing-job" {
    image "billing-job:latest"
    schedule "0 0 1 * *"
    realizes BillingJob
  }
}
```

---

### AT-0050-08: --output flag writes to file

**Command:**

```bash
karasu translate --from compose docker-compose.yml --output deploy.krs
```

**Expected**: File `deploy.krs` is created with the same content that would have been printed to stdout.

---

### AT-0050-09: Multiple k8s files concatenated via shell

**Command:**

```bash
for f in manifests/*.yaml; do karasu translate --from k8s "$f"; done > deploy.krs
```

**Expected**: `deploy.krs` contains one `deploy` block per YAML file, concatenated.

---

### AT-0050-10: Error on missing file

**Command:**

```bash
karasu translate --from compose nonexistent.yml
```

**Expected stderr**: `Error: File not found: nonexistent.yml`  
**Expected exit code**: `1`
