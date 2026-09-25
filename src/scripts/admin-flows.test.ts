import { describe, expect, it } from 'vitest';

import {
  buildPayload,
  defaultDefinition,
  defaultOption,
  nodeKindLabel,
  normalizeTarget,
  slugify,
  uniqueNodeId,
} from './admin-flows';
import type { EventPolicy, FlowDefinition, FlowNode, FlowOption } from './admin-flows';

const node = (id: string, type = 'text'): FlowNode => ({ id, type, body: '', terminal: true });

const policy = (overrides: Partial<EventPolicy> = {}): EventPolicy => ({
  event_key: 'confirmar',
  variables: [],
  actions: [],
  terminal_only: false,
  ...overrides,
});

describe('slugify', () => {
  it('pasa a minúsculas y separa palabras con guiones', () => {
    expect(slugify('Confirmar Categoría')).toBe('confirmar-categoria');
  });

  it('quita diacríticos', () => {
    expect(slugify('Ñandú Café')).toBe('nandu-cafe');
    expect(slugify('¡Ñoño & Cía.!')).toBe('nono-cia');
  });

  it('colapsa símbolos y espacios sobrantes en un solo guión', () => {
    expect(slugify('  Hola   Mundo  ')).toBe('hola-mundo');
    expect(slugify('--A--B--')).toBe('a-b');
    expect(slugify('Café_2026')).toBe('cafe-2026');
  });

  it('devuelve cadena vacía si no queda nada utilizable', () => {
    expect(slugify('')).toBe('');
    expect(slugify('¡!?')).toBe('');
  });
});

describe('nodeKindLabel', () => {
  it('traduce los tipos conocidos', () => {
    expect(nodeKindLabel('text')).toBe('Texto');
    expect(nodeKindLabel('reply_button')).toBe('Botones');
    expect(nodeKindLabel('list')).toBe('Lista');
  });

  it('deja pasar los tipos desconocidos', () => {
    expect(nodeKindLabel('desconocido')).toBe('desconocido');
  });
});

describe('uniqueNodeId', () => {
  it('usa prefijo según el tipo', () => {
    expect(uniqueNodeId([], 'text')).toBe('mensaje-1');
    expect(uniqueNodeId([], 'list')).toBe('lista-1');
    expect(uniqueNodeId([], 'reply_button')).toBe('opciones-1');
    expect(uniqueNodeId([], 'otro')).toBe('opciones-1');
  });

  it('arranca en length + 1', () => {
    expect(uniqueNodeId([node('mensaje-1'), node('mensaje-2')], 'text')).toBe('mensaje-3');
  });

  it('esquiva los ids ya usados', () => {
    expect(uniqueNodeId([node('mensaje-2')], 'text')).toBe('mensaje-3');
    expect(uniqueNodeId([node('lista-2', 'list')], 'list')).toBe('lista-3');
    expect(uniqueNodeId([node('opciones-1', 'reply_button')], 'reply_button')).toBe('opciones-2');
  });
});

describe('defaultOption', () => {
  it('con más de un nodo apunta al primer nodo aunque haya acciones', () => {
    const nodes = [node('mensaje-1'), node('opciones-2', 'reply_button')];
    expect(defaultOption(policy({ actions: ['confirmar'] }), nodes)).toEqual({
      id: 'opcion-1',
      title: 'Opción 1',
      next_node: 'mensaje-1',
    });
  });

  it('con un solo nodo y acciones disponibles usa la primera acción', () => {
    expect(defaultOption(policy({ actions: ['confirmar', 'cancelar'] }), [node('mensaje-1')])).toEqual({
      id: 'opcion-1',
      title: 'Opción 1',
      action: 'confirmar',
    });
  });

  it('con un solo nodo y sin acciones avanza al nodo existente', () => {
    expect(defaultOption(policy(), [node('mensaje-1')])).toEqual({
      id: 'opcion-1',
      title: 'Opción 1',
      next_node: 'mensaje-1',
    });
  });

  it('sin nodos cae al id por defecto del recorrido', () => {
    expect(defaultOption(policy(), [])).toEqual({
      id: 'opcion-1',
      title: 'Opción 1',
      next_node: 'mensaje-inicial',
    });
  });

  it('usa el índice recibido', () => {
    const option = defaultOption(policy(), [node('mensaje-1')], 4);
    expect(option.id).toBe('opcion-4');
    expect(option.title).toBe('Opción 4');
  });
});

describe('normalizeTarget', () => {
  const nodes = [node('mensaje-1'), node('mensaje-2')];

  it('modo action borra next_node y toma la primera acción', () => {
    const option: FlowOption = { id: 'opcion-1', title: 'Opción 1', next_node: 'mensaje-2' };
    normalizeTarget(option, 'action', policy({ actions: ['confirmar'] }), nodes);
    expect(option.action).toBe('confirmar');
    expect('next_node' in option).toBe(false);
  });

  it('modo action sin acciones disponibles deja action vacía', () => {
    const option: FlowOption = { id: 'opcion-1', title: 'Opción 1', next_node: 'mensaje-2' };
    normalizeTarget(option, 'action', policy(), nodes);
    expect(option.action).toBe('');
    expect('next_node' in option).toBe(false);
  });

  it('modo next borra action y apunta al primer nodo', () => {
    const option: FlowOption = { id: 'opcion-1', title: 'Opción 1', action: 'confirmar' };
    normalizeTarget(option, 'next', policy({ actions: ['confirmar'] }), nodes);
    expect(option.next_node).toBe('mensaje-1');
    expect('action' in option).toBe(false);
  });

  it('modo next sin nodos apunta a cadena vacía', () => {
    const option: FlowOption = { id: 'opcion-1', title: 'Opción 1', action: 'confirmar' };
    normalizeTarget(option, 'next', policy(), []);
    expect(option.next_node).toBe('');
  });
});

describe('buildPayload', () => {
  const definition: FlowDefinition = {
    start_node: 'mensaje-1',
    nodes: [
      { id: 'mensaje-1', type: 'text', body: '', terminal: true },
      {
        id: 'opciones-2',
        type: 'reply_button',
        body: 'Hola',
        terminal: false,
        options: [{ id: 'opcion-1', title: 'Opción 1', next_node: 'mensaje-1' }],
      },
    ],
  };

  it('recorta el nombre y copia la definición', () => {
    const result = buildPayload('  Mi flujo  ', definition);
    expect(result.name).toBe('Mi flujo');
    expect(result.definition).toEqual(definition);
    expect(result.definition).not.toBe(definition);
  });

  it('clona en profundidad: mutar el resultado no toca el original', () => {
    const result = buildPayload('flujo', definition);
    result.definition.nodes[0].body = 'mutado';
    result.definition.nodes[1].options![0].title = 'mutado';
    result.definition.start_node = 'otro';
    expect(definition.nodes[0].body).toBe('');
    expect(definition.nodes[1].options![0].title).toBe('Opción 1');
    expect(definition.start_node).toBe('mensaje-1');
  });
});

describe('defaultDefinition', () => {
  it('devuelve el mensaje inicial terminal', () => {
    expect(defaultDefinition()).toEqual({
      start_node: 'mensaje-inicial',
      nodes: [{ id: 'mensaje-inicial', type: 'text', body: '', terminal: true }],
    });
  });
});
