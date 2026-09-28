import { describe, expect, it } from 'vitest';
import { projectJourney } from './admin-flow-graph';
import { buildPayload, defaultOption, nodeKindLabel, uniqueNodeId } from './admin-flows';
import type { EventPolicy, FlowDefinition } from '../lib/flow-contract';

const dataOutcomes = [{ event: 'category.confirmation_required', label: 'Categoría nueva' }, { event: 'limit.created', label: 'Guardado' }];
const cancelled = [{ event: 'limit.cancelled', label: 'Salir' }];
const definition: FlowDefinition = {
  start_node: 'listed',
  event_nodes: { 'limit.listed': 'listed', 'limit.started': 'started', 'limit.created': 'created', 'limit.cancelled': 'cancelled' },
  response_examples: { datos: 'Viajes, 50000 pesos, noviembre' },
  nodes: [
    { id: 'listed', type: 'reply_button', body: '{summary}', options: [{ id: 'start', title: 'Crear límite', action: 'start_limit' }] },
    { id: 'started', type: 'reply_button', body: 'Indicá categoría, monto y mes', options: [{ id: 'cancel', title: 'Cancelar', action: 'cancel_pending_operation' }] },
    { id: 'created', type: 'text', body: 'Guardado {category}', terminal: true },
    { id: 'cancelled', type: 'text', body: 'Operación cancelada', terminal: true },
  ],
};
const policy: EventPolicy = {
  event_key: 'limit.creation', variables: [], actions: [], terminal_only: false,
  stages: { 'limit.listed': 'Tus límites', 'limit.started': 'Indicar datos', 'limit.created': 'Creado', 'limit.cancelled': 'Cancelado' },
  text_responses: { 'limit.started': [
    { id: 'datos', label: 'Indica datos', example: 'Comida, 80000 pesos, octubre', outcomes: dataOutcomes },
    { id: 'cancelar', label: 'Cancela por texto', example: 'Cancelar', outcomes: cancelled },
  ] },
  action_outcomes: { start_limit: [{ event: 'limit.started', label: 'Iniciar' }], cancel_pending_operation: cancelled },
  subflows: { 'category.confirmation_required': { label: 'Crear categoría', description: 'Subflujo compartido', outcomes: [{ event: 'limit.created', label: 'Continuar' }] } },
};

describe('mapa del recorrido de límites', () => {
  it('muestra respuestas independientes y una referencia externa, sin duplicar categorías ni cancelaciones', () => {
    const graph = projectJourney(definition, policy);
    expect(graph.nodes.filter((node) => node._speaker === 'Luka')).toHaveLength(3);
    expect(graph.nodes.filter((node) => node._speaker === 'Usuario')).toHaveLength(2);
    expect(graph.nodes.find((node) => node.id === 'cancelled')).toBeUndefined();
    expect(graph.nodes.some((node) => node.body === 'Cancelar')).toBe(false);
    const ids = new Set(graph.nodes.map((node) => node.id));
    for (const node of graph.nodes) for (const option of node.options || []) expect(ids.has(option.next_node!)).toBe(true);
    expect(graph.nodes.find((node) => node.id === 'started')?._exits).toEqual(['Cancelar']);
    const subflow = graph.nodes.filter((node) => node._externalEvent);
    expect(subflow).toHaveLength(1);
    expect(subflow[0]._externalEvent).toBe('category.confirmation_required');
    expect(subflow[0].options?.[0].next_node).toBe('created');
  });

  it('usa los ejemplos guardados y conserva el índice del mensaje editable', () => {
    const graph = projectJourney(definition, policy);
    const response = graph.nodes.find((node) => node._responseId === 'datos')!;
    expect(response.body).toBe('“Viajes, 50000 pesos, noviembre”');
    expect(response._index).toBe(1);
  });

  it('dibujar y armar el payload conserva etapas, ejemplos y contenido del recurso guardado', () => {
    const snapshot = structuredClone(definition);
    projectJourney(definition, policy);
    expect(definition).toEqual(snapshot);
    const payload = buildPayload(' Límites ', definition);
    expect(payload.definition.event_nodes).toEqual(definition.event_nodes);
    expect(payload.definition.response_examples).toEqual(definition.response_examples);
    payload.definition.response_examples!.datos = 'otro';
    expect(definition).toEqual(snapshot);
  });

  it('las opciones de una etapa ejecutan acciones aunque haya otros mensajes', () => {
    const stagePolicy = { ...policy, actions: ['cancel_pending_operation'] };
    expect(defaultOption(stagePolicy, definition.nodes, 2, definition.nodes[1])).toEqual({ id: 'started-opcion-2', title: 'Opción 2', action: 'cancel_pending_operation' });
  });

  it('permite representar y editar botones de enlace', () => {
    expect(nodeKindLabel('url_button')).toBe('Botón de enlace');
    expect(uniqueNodeId([], 'url_button')).toBe('enlace-1');
  });
});
