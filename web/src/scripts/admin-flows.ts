/**
 * Port 1:1 de `static/js/admin_flows.js` (editor de flujos del panel admin).
 * El JS original sigue en `static/` para FastAPI hasta F5.
 */

export interface EventPolicy {
  event_key: string;
  variables: string[];
  actions: string[];
  terminal_only: boolean;
}

export interface Contract {
  events: EventPolicy[];
  node_types: string[];
}

export interface FlowOption {
  id: string;
  title: string;
  action?: string;
  next_node?: string;
  description?: string;
}

export interface FlowNode {
  id: string;
  type: string;
  body: string;
  terminal: boolean;
  header?: string;
  footer?: string;
  button?: string;
  options?: FlowOption[];
  sections?: { title?: string; options: FlowOption[] }[];
}

export interface FlowDefinition {
  start_node: string;
  nodes: FlowNode[];
}

export interface FlowRecord {
  id: string;
  slug: string;
  name: string;
  event_key: string;
  status: string;
  draft?: { version_number: number; definition: FlowDefinition } | null;
  published?: { version_number: number; definition: FlowDefinition } | null;
}

interface ValidationError {
  path: string;
  message: string;
}

interface FlowApiError extends Error {
  validationErrors: ValidationError[];
}

interface ApiData {
  message?: string;
  errors?: ValidationError[];
}

interface ApiOptions {
  method?: string;
  body?: string;
  headers?: Record<string, string>;
}

interface SelectItem {
  value: string;
  label: string;
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function nodeKindLabel(type: string): string {
  const labels: Record<string, string> = { text: 'Texto', reply_button: 'Botones', list: 'Lista' };
  return labels[type] ?? type;
}

export function defaultDefinition(): FlowDefinition {
  return {
    start_node: 'mensaje-inicial',
    nodes: [{ id: 'mensaje-inicial', type: 'text', body: '', terminal: true }],
  };
}

export function uniqueNodeId(nodes: FlowNode[], type: string): string {
  const prefix = type === 'text' ? 'mensaje' : type === 'list' ? 'lista' : 'opciones';
  let counter = nodes.length + 1;
  while (nodes.some((node) => node.id === `${prefix}-${counter}`)) counter += 1;
  return `${prefix}-${counter}`;
}

export function defaultOption(policy: EventPolicy, nodes: FlowNode[], index = 1): FlowOption {
  if (nodes.length > 1) {
    return { id: `opcion-${index}`, title: `Opción ${index}`, next_node: nodes[0].id };
  }
  if (policy.actions.length) {
    return { id: `opcion-${index}`, title: `Opción ${index}`, action: policy.actions[0] };
  }
  return { id: `opcion-${index}`, title: `Opción ${index}`, next_node: nodes[0]?.id || 'mensaje-inicial' };
}

export function normalizeTarget(
  option: FlowOption,
  mode: 'next' | 'action',
  policy: EventPolicy,
  nodes: FlowNode[],
): void {
  if (mode === 'action') {
    delete option.next_node;
    option.action = policy.actions[0] || '';
  } else {
    delete option.action;
    option.next_node = nodes[0]?.id || '';
  }
}

export function buildPayload(
  name: string,
  definition: FlowDefinition,
): { name: string; definition: FlowDefinition } {
  return { name: name.trim(), definition: structuredClone(definition) };
}

function byId<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

function readJson<T>(id: string): T {
  return JSON.parse(document.getElementById(id)?.textContent ?? 'null') as T;
}

function init(): void {
  const editor = byId<HTMLElement>('flow-editor');
  if (!editor) return;

  const contract = readJson<Contract>('flow-contract-data');
  let flow = readJson<FlowRecord | null>('flow-record-data');
  const events = new Map(contract.events.map((event): [string, EventPolicy] => [event.event_key, event]));
  const nameInput = byId<HTMLInputElement>('flow-name');
  const slugInput = byId<HTMLInputElement>('flow-slug');
  const eventSelect = byId<HTMLSelectElement>('flow-event');
  const eventHelp = byId<HTMLElement>('event-help');
  const startSelect = byId<HTMLSelectElement>('flow-start-node');
  const nodesRoot = byId<HTMLElement>('flow-nodes');
  const notice = byId<HTMLElement>('flow-notice');
  const addNodeActions = byId<HTMLElement>('add-node-actions');

  const initialDefinition = flow?.draft?.definition ?? flow?.published?.definition ?? defaultDefinition();
  let definition: FlowDefinition = structuredClone(initialDefinition);
  let slugTouched = Boolean(flow);

  function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function field(label: string, control: HTMLElement, className = ''): HTMLLabelElement {
    const wrapper = element('label', `flow-field ${className}`.trim());
    wrapper.append(element('span', '', label), control);
    return wrapper;
  }

  function input(
    value: string | undefined,
    maxLength: number,
    onInput: (value: string) => void,
    placeholder = '',
  ): HTMLInputElement {
    const control = document.createElement('input');
    control.value = value || '';
    control.maxLength = maxLength;
    control.placeholder = placeholder;
    control.addEventListener('input', () => onInput(control.value));
    return control;
  }

  function textarea(value: string, maxLength: number, onInput: (value: string) => void): HTMLTextAreaElement {
    const control = document.createElement('textarea');
    control.value = value || '';
    control.maxLength = maxLength;
    control.addEventListener('input', () => onInput(control.value));
    return control;
  }

  function select(items: SelectItem[], value: string | undefined, onChange: (value: string) => void): HTMLSelectElement {
    const control = document.createElement('select');
    items.forEach(({ value: optionValue, label }) => {
      const option = document.createElement('option');
      option.value = optionValue;
      option.textContent = label;
      control.append(option);
    });
    control.value = value || items[0]?.value || '';
    control.addEventListener('change', () => onChange(control.value));
    return control;
  }

  function currentPolicy(): EventPolicy {
    return events.get(eventSelect.value) ?? { event_key: '', variables: [], actions: [], terminal_only: false };
  }

  function showNotice(kind: 'success' | 'error', message: string, errors: ValidationError[] = []): void {
    notice.hidden = false;
    notice.className = `flow-alert flow-alert-${kind}`;
    notice.replaceChildren(element('strong', '', message));
    if (errors.length) {
      const list = element('ul', 'flow-error-list');
      errors.forEach((error) => {
        list.append(element('li', '', `${error.path}: ${error.message}`));
      });
      notice.append(list);
    }
    notice.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function hideNotice(): void {
    notice.hidden = true;
    notice.replaceChildren();
  }

  function configureEventSelect(): void {
    contract.events.forEach((event) => {
      const option = document.createElement('option');
      option.value = event.event_key;
      option.textContent = event.event_key;
      eventSelect.append(option);
    });
    eventSelect.value = flow?.event_key || contract.events[0]?.event_key || '';
    eventSelect.addEventListener('change', () => {
      const policy = currentPolicy();
      if (policy.terminal_only) {
        definition = defaultDefinition();
      }
      render();
    });
  }

  function updateEventHelp(): void {
    const policy = currentPolicy();
    const variables = policy.variables.length
      ? `Variables: ${policy.variables.map((value) => `{${value}}`).join(', ')}.`
      : 'Este evento no expone variables.';
    eventHelp.textContent = policy.terminal_only
      ? `${variables} Respuesta terminal: no deja opciones pendientes.`
      : `${variables} Acciones disponibles: ${policy.actions.join(', ') || 'ninguna'}.`;
    addNodeActions.querySelectorAll<HTMLButtonElement>('[data-add-node]').forEach((button) => {
      button.disabled = policy.terminal_only && button.dataset.addNode !== 'text';
    });
  }

  function addNode(type: string): void {
    if (currentPolicy().terminal_only && type !== 'text') return;
    const id = uniqueNodeId(definition.nodes, type);
    if (type === 'text') {
      definition.nodes.push({ id, type, body: '', terminal: true });
    } else if (type === 'reply_button') {
      definition.nodes.push({ id, type, body: '', terminal: false, options: [defaultOption(currentPolicy(), definition.nodes)] });
    } else {
      definition.nodes.push({
        id, type, body: '', button: 'Ver opciones', terminal: false,
        sections: [{ title: 'Opciones', options: [defaultOption(currentPolicy(), definition.nodes)] }],
      });
    }
    render();
  }

  function removeNode(index: number): void {
    if (definition.nodes.length === 1) {
      showNotice('error', 'El recorrido necesita al menos un mensaje.');
      return;
    }
    const removedId = definition.nodes[index].id;
    definition.nodes.splice(index, 1);
    if (definition.start_node === removedId) definition.start_node = definition.nodes[0].id;
    render();
  }

  function changeNodeId(node: FlowNode, nextId: string): void {
    const previousId = node.id;
    node.id = nextId;
    if (definition.start_node === previousId) definition.start_node = nextId;
    definition.nodes.forEach((candidate) => {
      const options = candidate.type === 'reply_button'
        ? candidate.options ?? []
        : candidate.type === 'list'
          ? (candidate.sections ?? []).flatMap((section) => section.options)
          : [];
      options.forEach((option) => {
        if (option.next_node === previousId) option.next_node = nextId;
      });
    });
    renderStartOptions();
  }

  function changeNodeType(index: number, type: string): void {
    const old = definition.nodes[index];
    const base = { id: old.id, type, body: old.body || '' };
    if (type === 'text') definition.nodes[index] = { ...base, terminal: true };
    if (type === 'reply_button') definition.nodes[index] = { ...base, terminal: false, options: [defaultOption(currentPolicy(), definition.nodes)] };
    if (type === 'list') {
      definition.nodes[index] = {
        ...base, button: 'Ver opciones', terminal: false,
        sections: [{ title: 'Opciones', options: [defaultOption(currentPolicy(), definition.nodes)] }],
      };
    }
    render();
  }

  function renderStartOptions(): void {
    startSelect.replaceChildren();
    definition.nodes.forEach((node) => {
      const option = document.createElement('option');
      option.value = node.id;
      option.textContent = node.id || 'Sin identificador';
      startSelect.append(option);
    });
    startSelect.value = definition.start_node;
  }

  function renderVariables(container: HTMLElement): void {
    const variables = currentPolicy().variables;
    const help = element('div', 'flow-variable-help');
    help.textContent = variables.length
      ? `Podés insertar: ${variables.map((value) => `{${value}}`).join(' · ')}`
      : 'Este evento no ofrece variables dinámicas.';
    container.append(help);
  }

  function renderOption(option: FlowOption, onRemove: () => void, allowDescription = false): HTMLDivElement {
    const wrapper = element('div', 'flow-option');
    const grid = element('div', 'flow-option-grid');
    grid.append(
      field('ID estable', input(option.id, 200, (value) => { option.id = value; })),
      field('Texto visible', input(option.title, allowDescription ? 24 : 20, (value) => { option.title = value; })),
    );

    const policy = currentPolicy();
    const targetModes: SelectItem[] = [{ value: 'next', label: 'Siguiente mensaje' }];
    if (policy.actions.length) targetModes.push({ value: 'action', label: 'Acción permitida' });
    const mode = option.action ? 'action' : 'next';
    const modeSelect = select(targetModes, mode, (value) => {
      normalizeTarget(option, value === 'action' ? 'action' : 'next', policy, definition.nodes);
      render();
    });
    grid.append(field('Destino', modeSelect));

    const destination = option.action
      ? select(
          policy.actions.map((action) => ({ value: action, label: action })),
          option.action,
          (value) => { option.action = value; },
        )
      : select(
          definition.nodes.map((node) => ({ value: node.id, label: node.id || 'Sin ID' })),
          option.next_node,
          (value) => { option.next_node = value; },
        );
    grid.append(field(option.action ? 'Acción' : 'Mensaje', destination));

    const remove = element('button', 'flow-icon-button', 'Eliminar');
    remove.type = 'button';
    remove.addEventListener('click', onRemove);
    grid.append(remove);
    if (allowDescription) {
      grid.append(field('Descripción opcional', input(option.description || '', 72, (value) => {
        if (value) option.description = value;
        else delete option.description;
      }), 'flow-field-wide'));
    }
    wrapper.append(grid);
    return wrapper;
  }

  function renderButtonOptions(node: FlowNode, container: HTMLElement): void {
    if (!node.options) node.options = [];
    const nodeOptions = node.options;
    const options = element('div', 'flow-options');
    const header = element('div', 'flow-options-header');
    header.append(element('strong', '', `Botones (${nodeOptions.length}/3)`));
    const add = element('button', 'flow-button flow-button-secondary', '+ Botón');
    add.type = 'button';
    add.disabled = nodeOptions.length >= 3;
    add.addEventListener('click', () => {
      nodeOptions.push(defaultOption(currentPolicy(), definition.nodes, nodeOptions.length + 1));
      render();
    });
    header.append(add);
    options.append(header);
    nodeOptions.forEach((option, index) => {
      options.append(renderOption(option, () => {
        nodeOptions.splice(index, 1);
        render();
      }));
    });
    container.append(options);
  }

  function renderListSections(node: FlowNode, container: HTMLElement): void {
    if (!node.sections) node.sections = [];
    const sections = node.sections;
    const options = element('div', 'flow-options');
    const header = element('div', 'flow-options-header');
    header.append(element('strong', '', `Secciones (${sections.length}/10)`));
    const addSection = element('button', 'flow-button flow-button-secondary', '+ Sección');
    addSection.type = 'button';
    addSection.disabled = sections.length >= 10;
    addSection.addEventListener('click', () => {
      sections.push({ title: `Sección ${sections.length + 1}`, options: [defaultOption(currentPolicy(), definition.nodes)] });
      render();
    });
    header.append(addSection);
    options.append(header);

    sections.forEach((section, sectionIndex) => {
      const sectionRoot = element('div', 'flow-section');
      const sectionHeader = element('div', 'flow-section-header');
      sectionHeader.append(field('Título de sección', input(section.title || '', 24, (value) => {
        if (value) section.title = value;
        else delete section.title;
      })));
      const actions = element('div', 'flow-section-actions');
      const addRow = element('button', 'flow-button flow-button-secondary', '+ Fila');
      addRow.type = 'button';
      const rowCount = sections.reduce((count, current) => count + current.options.length, 0);
      addRow.disabled = rowCount >= 10;
      addRow.addEventListener('click', () => {
        section.options.push(defaultOption(currentPolicy(), definition.nodes, rowCount + 1));
        render();
      });
      const removeSection = element('button', 'flow-icon-button', 'Eliminar sección');
      removeSection.type = 'button';
      removeSection.addEventListener('click', () => {
        sections.splice(sectionIndex, 1);
        render();
      });
      actions.append(addRow, removeSection);
      sectionHeader.append(actions);
      sectionRoot.append(sectionHeader);
      section.options.forEach((option, optionIndex) => {
        sectionRoot.append(renderOption(option, () => {
          section.options.splice(optionIndex, 1);
          render();
        }, true));
      });
      options.append(sectionRoot);
    });
    container.append(options);
  }

  function renderNode(node: FlowNode, index: number): HTMLElement {
    const root = element('article', 'flow-node');
    const header = element('div', 'flow-node-header');
    const title = element('div', 'flow-node-title');
    title.append(
      element('span', 'flow-node-kind', nodeKindLabel(node.type)),
      element('strong', '', node.id || 'Mensaje sin ID'),
    );
    const remove = element('button', 'flow-icon-button', 'Eliminar mensaje');
    remove.type = 'button';
    remove.addEventListener('click', () => removeNode(index));
    header.append(title, remove);

    const content = element('div', 'flow-node-content');
    const allowedNodeTypes = currentPolicy().terminal_only ? ['text'] : contract.node_types;
    content.append(
      field('ID del mensaje', input(node.id, 100, (value) => { changeNodeId(node, value); })),
      field('Tipo', select(
        allowedNodeTypes.map((type) => ({ value: type, label: nodeKindLabel(type) })),
        node.type,
        (value) => { changeNodeType(index, value); },
      )),
      field('Contenido', textarea(node.body, node.type === 'text' ? 4096 : 1024, (value) => { node.body = value; }), 'flow-field-body'),
    );
    renderVariables(content);

    if (node.type !== 'text') {
      content.append(
        field('Encabezado opcional', input(node.header || '', 60, (value) => {
          if (value) node.header = value;
          else delete node.header;
        })),
        field('Pie opcional', input(node.footer || '', 60, (value) => {
          if (value) node.footer = value;
          else delete node.footer;
        })),
      );
    }
    if (node.type === 'reply_button') renderButtonOptions(node, content);
    if (node.type === 'list') {
      content.append(field('Texto del botón', input(node.button, 20, (value) => { node.button = value; })));
      renderListSections(node, content);
    }
    root.append(header, content);
    return root;
  }

  function render(): void {
    updateEventHelp();
    renderStartOptions();
    nodesRoot.replaceChildren(...definition.nodes.map((node, index) => renderNode(node, index)));
  }

  function payload(): { name: string; definition: FlowDefinition } {
    return buildPayload(nameInput.value, definition);
  }

  async function api<T extends object = ApiData>(path: string, options: ApiOptions = {}): Promise<T> {
    const response = await fetch(path, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...(options.headers ?? {}) },
    });
    const data = (await response.json().catch(() => ({}))) as T & ApiData;
    if (!response.ok) {
      const error = new Error(data.message || 'No se pudo completar la operación.') as FlowApiError;
      error.validationErrors = data.errors || [];
      throw error;
    }
    return data;
  }

  function setBusy(busy: boolean): void {
    editor.querySelectorAll<HTMLButtonElement>('button').forEach((button) => { button.disabled = busy; });
  }

  async function validateFlow(): Promise<void> {
    hideNotice();
    const result = await api<{ definition?: FlowDefinition }>('/admin/flujos/api/validar', {
      method: 'POST',
      body: JSON.stringify({ event_key: eventSelect.value, definition }),
    });
    definition = result.definition ?? definition;
    showNotice('success', 'El recorrido es válido y compatible con WhatsApp.');
  }

  async function saveFlow({ redirect = true }: { redirect?: boolean } = {}): Promise<FlowRecord> {
    await validateFlow();
    let saved: FlowRecord;
    if (flow) {
      saved = await api<FlowRecord>(`/admin/flujos/api/${flow.id}/borrador`, {
        method: 'PUT',
        body: JSON.stringify(payload()),
      });
    } else {
      saved = await api<FlowRecord>('/admin/flujos/api', {
        method: 'POST',
        body: JSON.stringify({
          slug: slugInput.value.trim(),
          event_key: eventSelect.value,
          ...payload(),
        }),
      });
      flow = saved;
    }
    if (redirect) window.location.assign(`/admin/flujos/${saved.id}`);
    return saved;
  }

  async function run(action: () => Promise<unknown>, successMessage?: string | null): Promise<void> {
    setBusy(true);
    hideNotice();
    try {
      await action();
      if (successMessage) showNotice('success', successMessage);
    } catch (error) {
      const failure = error as Partial<FlowApiError>;
      showNotice('error', failure.message ?? '', failure.validationErrors ?? []);
    } finally {
      setBusy(false);
      render();
    }
  }

  nameInput.value = flow?.name || '';
  slugInput.value = flow?.slug || '';
  nameInput.addEventListener('input', () => {
    if (!slugTouched) slugInput.value = slugify(nameInput.value);
  });
  slugInput.addEventListener('input', () => { slugTouched = true; });
  startSelect.addEventListener('change', () => { definition.start_node = startSelect.value; });
  addNodeActions.addEventListener('click', (event) => {
    const type = event.target instanceof HTMLElement ? event.target.dataset.addNode : undefined;
    if (type) addNode(type);
  });
  editor.addEventListener('submit', (event) => {
    event.preventDefault();
    run(() => saveFlow(), null);
  });
  document.getElementById('validate-flow')?.addEventListener('click', () => run(validateFlow));
  document.getElementById('publish-flow')?.addEventListener('click', () => run(async () => {
    const saved = await saveFlow({ redirect: false });
    await api(`/admin/flujos/api/${saved.id}/publicar`, { method: 'POST', body: '{}' });
    window.location.assign(`/admin/flujos/${saved.id}`);
  }));
  document.getElementById('discard-flow')?.addEventListener('click', () => {
    if (!flow) return;
    const flowId = flow.id;
    if (!window.confirm('¿Descartar el borrador actual? La versión publicada seguirá activa.')) return;
    run(async () => {
      await api(`/admin/flujos/api/${flowId}/borrador`, { method: 'DELETE' });
      window.location.reload();
    });
  });
  document.getElementById('archive-flow')?.addEventListener('click', () => {
    if (!flow) return;
    const flowId = flow.id;
    if (!window.confirm('¿Retirar este flujo? Dejará de usarse para conversaciones nuevas.')) return;
    run(async () => {
      await api(`/admin/flujos/api/${flowId}/retirar`, { method: 'POST', body: '{}' });
      window.location.assign('/admin/flujos');
    });
  });

  configureEventSelect();
  render();
}

if (typeof document !== 'undefined') init();
