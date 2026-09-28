export interface EventPolicy {
  event_key: string;
  variables: string[];
  actions: string[];
  terminal_only: boolean;
  label?: string;
  url_variables?: string[];
  url_button?: { default_label: string; url_variable: string; max_label_length: number; max_body_length: number };
  default_definition?: FlowDefinition;
  stages?: Record<string, string>;
  text_responses?: Record<string, UserResponse[]>;
  action_outcomes?: Record<string, FlowOutcome[]>;
  subflows?: Record<string, { label: string; description: string; outcomes: FlowOutcome[] }>;
  used_by?: string[];
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
  terminal?: boolean;
  header?: string;
  footer?: string;
  url?: string;
  url_button_label?: string;
  button?: string;
  options?: FlowOption[];
  sections?: { title?: string; options: FlowOption[] }[];
}

export interface FlowDefinition {
  start_node: string;
  nodes: FlowNode[];
  event_nodes?: Record<string, string>;
  response_examples?: Record<string, string>;
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

export interface FlowOutcome { event: string; label: string }
export interface UserResponse { id: string; label: string; example: string; outcomes: FlowOutcome[] }
