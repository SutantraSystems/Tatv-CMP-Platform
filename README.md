# Tatv Cloud — tenant portal and operator console prototypes

First frontend slice of the Sutantra Cloud Management Platform (CMP): the tenant portal, branded **Tatv Cloud**, built with the stack frozen in the architecture blueprint (Rev 0.4, section 12):

- React 18 + TypeScript (strict), built with Vite
- PatternFly 6, themed through brand tokens (`src/brand.css`, `src/brand.ts`)
- react-i18next with English and Hindi
- Runs against an **in-browser mock of the CMP API** (`src/api/mock.ts`) with demo data, so no backend is needed yet

Layouts follow the CloudConsole wireframes (dashboard, all services, VM list, VM detail, create VM), adapted to the platform's decisions: tenants and projects, India-West and India-South regions, INR pricing, generic names only, quota and approvals.

## What works

| Area | Behaviour |
|---|---|
| Sign-in | Demo users stand in for Keycloak single sign-on |
| Header | Region selector (India-West, India-South) that scopes every list; search over resources, tags and services; approvals bell; account menu with English/हिन्दी and sign-out |
| Sidebar | User, tenant (organisation) and project switcher; navigation |
| Dashboard | Counts for VMs, clusters, databases, storage, GPUs; monthly cost estimate in ₹; quota bars showing used and reserved; approvals waiting; recent activity; quick actions; *This project* / *Whole tenant* toggle |
| All services | Search and categories: VPC (network and security), Compute (VMs and Kubernetes), Storage (block, file, object), Databases (SQL and NoSQL), AI and GPU, Backup; Marketplace tab |
| Lists | VMs, Kubernetes, Storage, Databases: summary cards, filters (text, status, type, `key:value` tag chips), bulk toolbar, row menu, link to detail |
| Detail page | Status, configuration, networking and month-to-date cost cards; metrics (CPU, network); tags you can add and remove; Storage, Networking and Actions-and-history tabs; Connect (SSH or RDP instructions) |
| Create | One page of numbered sections built from the catalog item's JSON Schema; selectable cards for region, image and size; tags; sticky summary with ₹ estimate, quota impact and approval notice |
| Workload lifecycle | **Shut down / Start** (compute billing stops). **Decommission** needs approval from a tenant admin other than the requester, then holds the workload for 7 days (compute and IP quota released, data kept, restorable). **Delete permanently** only after decommissioning, also needs that approval, then crypto-erases and issues a sanitisation certificate |
| IAM | Users with roles, scope, sign-in source, MFA and last sign-in; role and permission matrix; admins invite users |
| VPC | Default network, subnets and security-group rules per project and region |
| Activity and approvals | Every request as an operation; admins approve or reject others' requests; own requests cannot be approved |
| Monitoring and logs | KPIs (resources monitored, alerts firing, errors, log storage); **Metrics** per resource with 1h/6h/24h/7d ranges, hover read-out, thresholds and a table view, plus a CPU table for all compute; **Logs** from the activity trail, workload agent, Kubernetes events and database engines with search, severity and source filters, volume histogram, expandable JSON lines and live tail; **Alerts** firing and resolved, rules you can enable, disable and create. Each resource page also has Metrics and Logs tabs |

The mock reproduces control-plane guarantees the UI must handle: writes return `202` with an operation; quota is reserved at request time and released on rejection; large and GPU sizes need approval; **nobody can approve their own request**; the same `Idempotency-Key` never creates two resources; errors are RFC 9457 problem details. Prices are indicative and exclude GST.

Try it: sign in as **Ravi** (project operator) and decommission a VM; sign out, sign in as **Meera** (tenant admin) and approve it under *Activity and approvals*. Meera can then request permanent deletion, which **Asha** must approve.


## Operator console (`operator.html`)

The internal console for Sutantra managed services and the partner's business team. Same design system and code base, **separate app**: in production it is served at an internal-only hostname (for example `ops.tatvcloud.internal`) on the management network, reached through PAM, signed in through the separate operator Keycloak, and calls the operator API (`/operator/v1`), which is never published on the public gateway. It visibly differs from the tenant portal (dark header, "Internal" badge, "powered by Sutantra").

| Area | Behaviour |
|---|---|
| Overview | Tenants enrolled (active, suspended, onboarding), new in 30 days, monthly run rate, GPUs in use, open issues, pending changes; billing and enrolment trends; capacity and health snapshots; top tenants |
| Tenants | Search and filter by type, status (including KYC needing attention) and region; usage against quota; spend; GSTIN |
| Tenant page | Account (GSTIN, admin, identity realm, KYC), usage meters, projects, six-month spend, run rate by service, invoices, change requests, audit events; **change quota, suspend, reactivate** as requests |
| Capacity | Per region: vCPU (4:1 overcommit), RAM, block, object, GPUs allocated against installed; forecast of weeks until 80 % |
| Revenue and billing | Run rate, month to date, invoices due and overdue, trend, by service, by tenant type, top tenants |
| Operations | Service health for the control plane and each region; failed and stuck workflows with retry |
| Approvals | **Four-eyes rule**: every change is approved by a platform admin other than the requester |
| Audit log | Append-only, hash-chained record of every operator action, with chain verification |
| Onboard tenant | Assisted onboarding (type, identity realm, GSTIN, admin, region) as a request for approval |
| Monitoring and logs | Platform metrics per region (vCPU allocated and used, API latency and error-rate SLOs, provisioning workflows, storage pools, fabric throughput); platform and security logs (OpenStack, RHOCP, CMP, storage, network, firewall, Keycloak) with live tail; platform alerts with acknowledge; **tenant telemetry usage** as aggregates only (API volume, log ingestion and storage, metric series). Platform admins and operators only |

Draft roles (final split follows the RACI): **Platform admin** (Sutantra; everything, approves), **Platform operator** (Sutantra L2/L3; no revenue or onboarding; requests changes, retries workflows), **Partner business admin** (tenants, revenue, onboarding; no capacity, operations or audit). Operators see metadata and usage only — never data inside tenants' workloads.

Try it: sign in as **Priya** and request a quota change on a tenant, then as **Vikram** or **Anita** to approve it. **Rahul** onboards a tenant; a platform admin approves.

## Run

```bash
npm install
npm run dev            # http://localhost:5173
npm test               # unit tests (mock API behaviours, schema validation)
npm run typecheck
npm run build          # production build in dist/
npm run build:preview           # tenant portal as one HTML file in dist-preview/
npm run build:preview:operator  # operator console as one HTML file in dist-preview-operator/
# npm run dev serves the portal at / and the console at /operator.html
```

## Run on GitHub Pages

The workflow in `.github/workflows/pages.yml` type-checks, tests and builds the single-file preview on every push to `main`, then publishes it to GitHub Pages. One-time set-up: in the repository go to **Settings → Pages → Build and deployment → Source** and choose **GitHub Actions**. The site appears at `https://<owner>.github.io/<repo>/`.

Pages sites are public unless your GitHub plan supports private Pages, so use it for demos only.

## Layout

```
src/
  api/types.ts        API contract types (generated from OpenAPI in the real platform)
  api/catalog.ts      catalog items with JSON Schema parameters
  api/mock.ts         in-browser mock implementing CmpApi
  components/         layout, schema-driven form, status labels
  observability/      seeded dummy metrics and logs, line chart, log viewer (shared by both apps)
  pages/              sign-in, dashboard, catalog, create, lists, detail, IAM, VPC, search, activity
  i18n/               English and Hindi strings
  session.tsx         signed-in user, organisation and project context
```

## Next steps

- Replace the mock with the generated TypeScript client once the FastAPI service publishes its OpenAPI spec (`CmpApi` is the seam).
- Real Keycloak OIDC sign-in; role-aware navigation.
- Wire VPC self-service, Backup as a Service (Trilio), NoSQL engines and the inference API.
- Billing page from the wireframes; wire Monitoring to VictoriaMetrics and OpenSearch per tenant plane.
- Bundle Noto Devanagari locally; automated WCAG 2.1 AA checks (axe) in CI for GIGW 3.0.
