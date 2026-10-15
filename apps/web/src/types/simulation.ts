export interface InterfaceModel {
  name: string;
  mac: string;
  ip: string | null;
  admin_status: string;
  oper_status: string;
  switchport_mode?: string;
  encapsulation_vlan?: number | null;
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

export interface VlanTagDetails {
  vlan_id: number;
  priority: number;
}

export interface EthernetDetails {
  src_mac: string;
  dst_mac: string;
  ethertype: string;
  vlan_tag?: VlanTagDetails | null;
}

export interface ArpDetails {
  operation: string;
  sender_mac: string;
  sender_ip: string;
  target_mac: string;
  target_ip: string;
}

export interface Ipv4Details {
  src_ip: string;
  dst_ip: string;
  protocol: string;
  ttl: number;
}

export interface IcmpDetails {
  icmp_type: string;
  code: number;
  identifier: number;
  sequence_number: number;
  data_len: number;
}

export interface PduDetails {
  ethernet: EthernetDetails;
  arp?: ArpDetails | null;
  ipv4?: Ipv4Details | null;
  icmp?: IcmpDetails | null;
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
  pdu?: PduDetails | null;
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

export interface VlanEntryModel {
  id: number;
  name: string;
}

export interface NodeTablesModel {
  mac_table: MacEntryModel[];
  arp_table: ArpEntryModel[];
  routing_table: RouteEntryModel[];
  vlans?: VlanEntryModel[];
}

export interface CliResultModel {
  output: string;
  prompt: string;
  is_exit: boolean;
}
