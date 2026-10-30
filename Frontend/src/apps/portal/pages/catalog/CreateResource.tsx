import {
  ActionGroup,
  Alert,
  Breadcrumb,
  BreadcrumbItem,
  Button,
  Card,
  CardBody,
  CardTitle,
  Content,
  Form,
  FormGroup,
  FormHelperText,
  HelperText,
  HelperTextItem,
  Label,
  LabelGroup,
  PageSection,
  TextInput,
  Title,
} from '@patternfly/react-core';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { LIST_PATH, OBJECT_RATE_PER_GB, REGIONS, demandFor, describe, inr, itemOf, monthlyPrice, needsApproval as policyNeedsApproval, regionName } from '@/shared/catalog/catalog';
import { ProblemError, type CatalogItem, type Problem, type Quota, type RegionId } from '@/shared/api/types';
import { SchemaFields, sectionsOf } from '../../components/SchemaForm';
import { ChoiceCards } from '@/shared/ui/ChoiceCards';
import { defaults, validate, type Errors, type Values } from '../../components/schema';
import { newIdempotencyKey, useLive, useSession } from '../../session';

const QUOTA_NAMES: Record<keyof Quota, string> = { vcpu: 'vCPUs', ramGb: 'Memory (GB)', volumeGb: 'Block and file storage (GB)', gpus: 'GPUs', publicIps: 'Public IPs' };

export function CreateResource() {
  const { t } = useTranslation();
  const { itemId } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { api, user, project, region: consoleRegion, setRegion: setConsoleRegion } = useSession();
  const [item, setItem] = useState<CatalogItem>();
  const [values, setValues] = useState<Values>({});
  const [errors, setErrors] = useState<Errors>({});
  const [problem, setProblem] = useState<Problem>();
  const [busy, setBusy] = useState(false);
  const [region, setRegion] = useState<RegionId>(consoleRegion);
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState<Record<string, string>>({});
  const [tagText, setTagText] = useState('');
  const [tagError, setTagError] = useState<string>();
  const quota = useLive(() => (project ? api.getQuota(project.id) : Promise.resolve(undefined)), [project?.id]);
  // One key per form: a double-click or retry can never create two resources.
  const key = useRef(newIdempotencyKey());
  const preset = itemOf(params.get('preset') ?? '');

  useEffect(() => {
    void api.getCatalog().then((items) => {
      const found = items.find((i) => i.id === itemId);
      setItem(found);
      if (found?.schema) setValues({ ...defaults(found.schema), ...(preset?.preset?.values ?? {}) });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, itemId]);

  const needsApproval = item ? policyNeedsApproval(item.id, values) : false;
  const demand = useMemo(() => (item ? demandFor(item.id, values) : undefined), [item, values]);
  const price = item ? monthlyPrice(item.id, values) : undefined;

  if (!item?.schema || !user || !project) return null;
  const schema = item.schema;
  const sections = sectionsOf(schema);
  const ident = sections.find(([n]) => n === 'Identification')?.[1] ?? [];
  const rest = sections.filter(([n]) => n !== 'Identification');
  const title = preset ? preset.name : item.name;

  function addTag() {
    const m = /^\s*([a-z][a-z0-9._-]{0,62})\s*[:=]\s*(.+?)\s*$/.exec(tagText);
    if (!m) {
      setTagError('Use key:value, for example environment:production. Keys are lowercase.');
      return;
    }
    setTags({ ...tags, [m[1]!]: m[2]! });
    setTagText('');
    setTagError(undefined);
  }

  async function submit() {
    const errs = validate(schema, values);
    setErrors(errs);
    setProblem(undefined);
    if (Object.keys(errs).length) {
      document.getElementById(`field-${Object.keys(errs)[0]}`)?.focus();
      return;
    }
    setBusy(true);
    try {
      await api.createResource(user!, project!.id, item!.id, values, key.current, { region, description: description.trim(), tags });
      if (region !== consoleRegion) setConsoleRegion(region);
      navigate(item!.kind ? LIST_PATH[item!.kind] : '/');
    } catch (e) {
      if (e instanceof ProblemError) setProblem(e.problem);
      else throw e;
    } finally {
      setBusy(false);
    }
  }

  let n = 0;
  const step = (label: string) => `${++n}. ${label}`;

  return (
    <>
      <PageSection>
        <Breadcrumb>
          <BreadcrumbItem>
            <Link to="/catalog">{t('nav.catalog')}</Link>
          </BreadcrumbItem>
          <BreadcrumbItem isActive>{title}</BreadcrumbItem>
        </Breadcrumb>
        <div className="page-head">
          <div>
            <Title headingLevel="h1" size="2xl">
              Create: {title}
            </Title>
            <Content component="p" className="muted">
              {preset?.description ?? item.description}
            </Content>
          </div>
          <Label color="blue" className="price-pill">
            {price === undefined ? 'Pay per use' : `Estimated ${inr(price)}/month`}
          </Label>
        </div>
      </PageSection>
      <PageSection className="tight-top">
        <div className="create-grid">
          <Form
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
            className="create-form"
          >
            {problem && (
              <Alert variant="danger" isInline title={problem.title}>
                {problem.detail}
              </Alert>
            )}

            <Card>
              <CardTitle component="h2">{step('Identification')}</CardTitle>
              <CardBody className="form-card-body">
                <div className="two-col">
                  <SchemaFields schema={schema} values={values} errors={errors} only={ident} onChange={(k, v) => setValues((p) => ({ ...p, [k]: v }))} />
                  <FormGroup label="Description" fieldId="field-description">
                    <TextInput id="field-description" value={description} onChange={(_e, v) => setDescription(v)} placeholder="What this is for" />
                    <FormHelperText>
                      <HelperText>
                        <HelperTextItem>Optional; shown on the resource page.</HelperTextItem>
                      </HelperText>
                    </FormHelperText>
                  </FormGroup>
                </div>
                <FormGroup label="Tags" fieldId="field-tags">
                  <div className="tag-entry">
                    <TextInput
                      id="field-tags"
                      value={tagText}
                      placeholder="environment:production"
                      onChange={(_e, v) => setTagText(v)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addTag();
                        }
                      }}
                      validated={tagError ? 'error' : 'default'}
                    />
                    <Button variant="secondary" onClick={addTag} isDisabled={!tagText.trim()}>
                      Add
                    </Button>
                  </div>
                  <FormHelperText>
                    <HelperText>
                      <HelperTextItem variant={tagError ? 'error' : 'default'}>{tagError ?? 'Tags appear on invoices for cost attribution and can be used in filters.'}</HelperTextItem>
                    </HelperText>
                  </FormHelperText>
                  {Object.keys(tags).length > 0 && (
                    <LabelGroup numLabels={10} className="para-gap">
                      {Object.entries(tags).map(([k, v]) => (
                        <Label
                          key={k}
                          variant="outline"
                          onClose={() => {
                            const next = { ...tags };
                            delete next[k];
                            setTags(next);
                          }}
                        >
                          {k}: {v}
                        </Label>
                      ))}
                    </LabelGroup>
                  )}
                </FormGroup>
              </CardBody>
            </Card>

            <Card>
              <CardTitle component="h2">{step('Region')}</CardTitle>
              <CardBody className="form-card-body">
                <ChoiceCards
                  name="Region"
                  value={region}
                  onChange={(v) => setRegion(v as RegionId)}
                  options={REGIONS.map((r) => ({ value: r.id, title: r.name, hint: r.description }))}
                />
                <Content component="small" className="muted">
                  Data stays in India in both regions. The platform places the workload in an availability zone automatically.
                </Content>
              </CardBody>
            </Card>

            {rest.map(([section, keys]) => (
              <Card key={section}>
                <CardTitle component="h2">{step(section)}</CardTitle>
                <CardBody className="form-card-body">
                  <SchemaFields schema={schema} values={values} errors={errors} only={keys} onChange={(k, v) => setValues((p) => ({ ...p, [k]: v }))} />
                </CardBody>
              </Card>
            ))}

            <ActionGroup>
              <Button type="submit" variant="primary" isLoading={busy} isDisabled={busy}>
                {needsApproval ? 'Submit for approval' : t('common.create')}
              </Button>
              <Button variant="link" onClick={() => navigate('/catalog')}>
                {t('common.cancel')}
              </Button>
            </ActionGroup>
          </Form>

          <aside className="create-summary" aria-label="Summary">
            <Card>
              <CardTitle component="h2">Summary</CardTitle>
              <CardBody>
                <div className="big-number">{price === undefined ? 'Pay per use' : `${inr(price)}/mo`}</div>
                <Content component="small" className="muted">
                  {price === undefined ? `${inr(OBJECT_RATE_PER_GB, true)} per GB stored per month, plus requests.` : `≈ ${inr(price / 730, true)}/hr while running.`} Indicative, excluding GST.
                </Content>
                <dl className="summary-list">
                  <dt>Configuration</dt>
                  <dd>{describe(item.id, values) || '—'}</dd>
                  <dt>Region</dt>
                  <dd>{regionName(region)}</dd>
                  <dt>Project</dt>
                  <dd>{project.name}</dd>
                </dl>
                {demand && quota && (
                  <>
                    <div className="summary-sub">Quota after this request</div>
                    <ul className="quota-impact">
                      {(Object.keys(demand) as (keyof Quota)[])
                        .filter((k) => demand[k] > 0)
                        .map((k) => {
                          const q = quota[k];
                          const after = q.used + q.reserved + demand[k];
                          return (
                            <li key={k} className={after > q.limit ? 'is-over' : ''}>
                              <span>{QUOTA_NAMES[k]}</span>
                              <span>
                                +{demand[k].toLocaleString('en-IN')} → {after.toLocaleString('en-IN')} of {q.limit.toLocaleString('en-IN')}
                              </span>
                            </li>
                          );
                        })}
                      {Object.values(demand).every((v) => v === 0) && <li>No fixed capacity is reserved.</li>}
                    </ul>
                  </>
                )}
                {needsApproval && (
                  <Alert variant="warning" isInline isPlain title="Needs approval" className="para-gap">
                    {item.approvalRule} Quota is reserved now and released if the request is rejected.
                  </Alert>
                )}
                <Button variant="primary" isBlock className="para-gap" isLoading={busy} isDisabled={busy} onClick={() => void submit()}>
                  {needsApproval ? 'Submit for approval' : t('common.create')}
                </Button>
              </CardBody>
            </Card>
          </aside>
        </div>
      </PageSection>
    </>
  );
}
