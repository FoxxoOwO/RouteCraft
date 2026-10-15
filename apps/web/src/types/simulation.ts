export interface InterfaceModel {
  name: string;
  mac: string;
  ip: string | null;
  admin_status: string;
  oper_status: string;
}

export interface NodeModel {
  id: string;
  hostname: string;
  device_type: 'router' | 'switch' | 'host';
  interfaces: InterfaceModel[];
  x?: number;
  y?: number;
}

export interface LinkModel {
  id: string;
  node_a: string;
  port_a: string;
  node_b: string;
  port_b: string;
  latency_ms: number;
  is_connected: boolean;
}

export interface TopologyModel {
  nodes: NodeModel[];
  links: LinkModel[];
}

export interface SimEventModel {
  id: number;
  time: number;
  source_node: string;
  source_port: string;
  target_node: string;
  target_port: string;
  summary: string;
  protocol: 'ARP' | 'ICMP' | 'IPv4' | string;
  decision_log: string[];
}

export interface MacEntryModel {
  mac: string;
  port: string;
  vlan: number;
}

export interface ArpEntryModel {
  ip: string;
  mac: string;
  interface: string;
}

export interface RouteEntryModel {
  prefix: string;
  next_hop: string | null;
  interface: string;
  metric: number;
  route_type: string;
}

export interface NodeTablesModel {
  mac_table: MacEntryModel[];
  arp_table: ArpEntryModel[];
  routing_table: RouteEntryModel[];
}

export interface CliResultModel {
  output: string;
  prompt: string;
  is_exit: boolean;
}
