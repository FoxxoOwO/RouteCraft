use std::collections::HashMap;
use std::net::Ipv4Addr;
use wasm_bindgen::prelude::*;
use serde::{Deserialize, Serialize};

use routecraft_core::{
    AdminStatus, DeviceState, DeviceType, Interface, MacAddress, SwitchportMode,
};
use routecraft_protocols::{EthernetFrame, Ipv4Payload, PacketPayload};
use routecraft_engine::{NetworkSimulation, SimLink};
use routecraft_cli::{CiscoCliEngine, CliEngine, MikroTikCliEngine};

#[derive(Serialize, Deserialize, Clone)]
pub struct JsVlanTagDetails {
    pub vlan_id: u16,
    pub priority: u8,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct JsEthernetDetails {
    pub src_mac: String,
    pub dst_mac: String,
    pub ethertype: String,
    pub vlan_tag: Option<JsVlanTagDetails>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct JsArpDetails {
    pub operation: String,
    pub sender_mac: String,
    pub sender_ip: String,
    pub target_mac: String,
    pub target_ip: String,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct JsIpv4Details {
    pub src_ip: String,
    pub dst_ip: String,
    pub protocol: String,
    pub ttl: u8,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct JsIcmpDetails {
    pub icmp_type: String,
    pub code: u8,
    pub identifier: u16,
    pub sequence_number: u16,
    pub data_len: usize,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct JsPduDetails {
    pub ethernet: JsEthernetDetails,
    pub arp: Option<JsArpDetails>,
    pub ipv4: Option<JsIpv4Details>,
    pub icmp: Option<JsIcmpDetails>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct JsSimEvent {
    pub id: u64,
    pub time: u64,
    pub source_node: String,
    pub source_port: String,
    pub target_node: String,
    pub target_port: String,
    pub summary: String,
    pub protocol: String,
    pub decision_log: Vec<String>,
    pub pdu: Option<JsPduDetails>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct JsInterface {
    pub name: String,
    pub mac: String,
    pub ip: Option<String>,
    pub admin_status: String,
    pub oper_status: String,
    pub switchport_mode: String,
    pub encapsulation_vlan: Option<u16>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct JsNode {
    pub id: String,
    pub hostname: String,
    pub device_type: String,
    pub interfaces: Vec<JsInterface>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct JsLink {
    pub id: String,
    pub node_a: String,
    pub port_a: String,
    pub node_b: String,
    pub port_b: String,
    pub latency_ms: u32,
    pub is_connected: bool,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct JsTopology {
    pub nodes: Vec<JsNode>,
    pub links: Vec<JsLink>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct JsMacEntry {
    pub mac: String,
    pub port: String,
    pub vlan: u16,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct JsArpEntry {
    pub ip: String,
    pub mac: String,
    pub interface: String,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct JsRouteEntry {
    pub prefix: String,
    pub next_hop: Option<String>,
    pub interface: String,
    pub metric: u32,
    pub route_type: String,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct JsVlanEntry {
    pub id: u16,
    pub name: String,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct JsNodeTables {
    pub mac_table: Vec<JsMacEntry>,
    pub arp_table: Vec<JsArpEntry>,
    pub routing_table: Vec<JsRouteEntry>,
    pub vlans: Vec<JsVlanEntry>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct JsCliResult {
    pub output: String,
    pub prompt: String,
    pub is_exit: bool,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct LabExportData {
    pub version: String,
    pub title: Option<String>,
    pub description: Option<String>,
    pub nodes: Vec<DeviceState>,
    pub links: Vec<SimLink>,
}

fn build_pdu_details(frame: &EthernetFrame) -> JsPduDetails {
    let eth = JsEthernetDetails {
        src_mac: frame.src_mac.to_string(),
        dst_mac: frame.dst_mac.to_string(),
        ethertype: format!("{:?} (0x{:04X})", frame.ethertype, frame.ethertype as u16),
        vlan_tag: frame.vlan_tag.as_ref().map(|tag| JsVlanTagDetails {
            vlan_id: tag.vlan_id,
            priority: tag.priority,
        }),
    };

    let mut arp_details = None;
    let mut ipv4_details = None;
    let mut icmp_details = None;

    match &frame.payload {
        PacketPayload::Arp(arp) => {
            arp_details = Some(JsArpDetails {
                operation: format!("{:?}", arp.operation),
                sender_mac: arp.sender_mac.to_string(),
                sender_ip: arp.sender_ip.to_string(),
                target_mac: arp.target_mac.to_string(),
                target_ip: arp.target_ip.to_string(),
            });
        }
        PacketPayload::Ipv4(ip) => {
            ipv4_details = Some(JsIpv4Details {
                src_ip: ip.src_ip.to_string(),
                dst_ip: ip.dst_ip.to_string(),
                protocol: format!("{:?} ({})", ip.protocol, ip.protocol as u8),
                ttl: ip.ttl,
            });

            if let Ipv4Payload::Icmp(icmp) = &ip.payload {
                icmp_details = Some(JsIcmpDetails {
                    icmp_type: format!("{:?}", icmp.icmp_type),
                    code: icmp.code,
                    identifier: icmp.identifier,
                    sequence_number: icmp.sequence_number,
                    data_len: icmp.data.len(),
                });
            }
        }
        PacketPayload::Raw(_) => {}
    }

    JsPduDetails {
        ethernet: eth,
        arp: arp_details,
        ipv4: ipv4_details,
        icmp: icmp_details,
    }
}

#[wasm_bindgen]
pub struct WasmSimulation {
    sim: NetworkSimulation,
    cisco_sessions: HashMap<String, CiscoCliEngine>,
    mikrotik_sessions: HashMap<String, MikroTikCliEngine>,
}

#[wasm_bindgen]
impl WasmSimulation {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self {
            sim: NetworkSimulation::new(),
            cisco_sessions: HashMap::new(),
            mikrotik_sessions: HashMap::new(),
        }
    }

    pub fn add_node(&mut self, id: &str, hostname: &str, device_type: &str) -> Result<(), JsValue> {
        let dtype = match device_type.to_lowercase().as_str() {
            "router" => DeviceType::Router,
            "switch" => DeviceType::Switch,
            "host" | "pc" => DeviceType::Host,
            _ => return Err(JsValue::from_str("Invalid device type")),
        };

        let state = DeviceState::new(id, hostname, dtype);
        self.sim.add_node(state);
        self.cisco_sessions.insert(id.to_string(), CiscoCliEngine::new());
        self.mikrotik_sessions.insert(id.to_string(), MikroTikCliEngine::new());
        Ok(())
    }

    pub fn remove_node(&mut self, node_id: &str) -> bool {
        self.cisco_sessions.remove(node_id);
        self.mikrotik_sessions.remove(node_id);
        self.sim.remove_node(node_id)
    }

    pub fn add_interface(
        &mut self,
        node_id: &str,
        name: &str,
        mac_str: Option<String>,
    ) -> Result<(), JsValue> {
        let node = self
            .sim
            .nodes
            .get_mut(node_id)
            .ok_or_else(|| JsValue::from_str("Node not found"))?;

        let mac = if let Some(m) = mac_str {
            m.parse::<MacAddress>()
                .map_err(|e| JsValue::from_str(&e.to_string()))?
        } else {
            let hash = (node_id.len() as u8).wrapping_mul(17).wrapping_add(name.len() as u8);
            MacAddress([0x52, 0x54, 0x00, 0x12, hash, 0x01])
        };

        let mut iface = Interface::new(name, mac);
        if node.state.device_type == DeviceType::Switch || node.state.device_type == DeviceType::Host {
            iface.set_admin_status(AdminStatus::Up);
        }
        node.state.add_interface(iface);
        Ok(())
    }

    pub fn set_interface_ip(
        &mut self,
        node_id: &str,
        name: &str,
        cidr_str: &str,
    ) -> Result<(), JsValue> {
        let node = self
            .sim
            .nodes
            .get_mut(node_id)
            .ok_or_else(|| JsValue::from_str("Node not found"))?;

        let cidr = cidr_str
            .parse::<routecraft_core::Ipv4Cidr>()
            .map_err(|e| JsValue::from_str(&e.to_string()))?;

        node.state
            .set_interface_ip(name, Some(cidr))
            .map_err(|e| JsValue::from_str(&e.to_string()))
    }

    pub fn set_interface_admin_status(
        &mut self,
        node_id: &str,
        name: &str,
        up: bool,
    ) -> Result<(), JsValue> {
        let node = self
            .sim
            .nodes
            .get_mut(node_id)
            .ok_or_else(|| JsValue::from_str("Node not found"))?;

        let status = if up { AdminStatus::Up } else { AdminStatus::Down };
        node.state
            .set_interface_admin_status(name, status)
            .map_err(|e| JsValue::from_str(&e.to_string()))
    }

    pub fn add_link(
        &mut self,
        id: &str,
        node_a: &str,
        port_a: &str,
        node_b: &str,
        port_b: &str,
        latency_ms: u32,
    ) -> Result<(), JsValue> {
        self.sim
            .add_link(id, node_a, port_a, node_b, port_b, latency_ms as u64);
        Ok(())
    }

    pub fn remove_link(&mut self, link_id: &str) -> bool {
        self.sim.remove_link(link_id)
    }

    pub fn toggle_link(&mut self, link_id: &str, connected: bool) -> Result<bool, JsValue> {
        for link in &mut self.sim.links {
            if link.id == link_id {
                link.is_connected = connected;
                return Ok(true);
            }
        }
        Err(JsValue::from_str("Link not found"))
    }

    pub fn clear(&mut self) {
        self.cisco_sessions.clear();
        self.mikrotik_sessions.clear();
        self.sim.clear();
    }

    pub fn trigger_ping(&mut self, source_node: &str, target_ip_str: &str) -> Result<(), JsValue> {
        let ip = target_ip_str
            .parse::<Ipv4Addr>()
            .map_err(|_| JsValue::from_str("Invalid IPv4 address"))?;

        self.sim.trigger_ping(source_node, ip);
        Ok(())
    }

    pub fn has_events(&self) -> bool {
        !self.sim.event_queue.is_empty()
    }

    pub fn pending_event_count(&self) -> usize {
        self.sim.event_queue.len()
    }

    pub fn step(&mut self) -> Result<JsValue, JsValue> {
        if let Some(event) = self.sim.step() {
            let (summary, proto) = match &event.frame.payload {
                PacketPayload::Arp(arp) => {
                    let s = format!("ARP {:?}: Who has {}? Tell {}", arp.operation, arp.target_ip, arp.sender_ip);
                    (s, "ARP".to_string())
                }
                PacketPayload::Ipv4(ip) => {
                    let s = format!("IPv4: {} -> {} ({:?})", ip.src_ip, ip.dst_ip, ip.protocol);
                    (s, "IPv4".to_string())
                }
                PacketPayload::Raw(raw) => (format!("Raw frame: {} bytes", raw.len()), "RAW".to_string()),
            };

            let pdu = Some(build_pdu_details(&event.frame));

            let js_ev = JsSimEvent {
                id: event.id,
                time: event.time,
                source_node: event.source_node,
                source_port: event.source_port,
                target_node: event.target_node,
                target_port: event.target_port,
                summary,
                protocol: proto,
                decision_log: event.decision_log,
                pdu,
            };

            serde_wasm_bindgen::to_value(&js_ev)
                .map_err(|e| JsValue::from_str(&e.to_string()))
        } else {
            Ok(JsValue::NULL)
        }
    }

    pub fn get_topology(&self) -> Result<JsValue, JsValue> {
        let mut js_nodes = Vec::new();
        for node in self.sim.nodes.values() {
            let mut ifaces = Vec::new();
            for iface in node.state.interfaces.values() {
                let sw_mode = match &iface.switchport_mode {
                    SwitchportMode::Access(v) => format!("access (vlan {})", v),
                    SwitchportMode::Trunk { native_vlan, allowed_vlans } => {
                        if allowed_vlans.is_empty() {
                            format!("trunk (native {})", native_vlan)
                        } else {
                            let allowed = allowed_vlans.iter().map(|v| v.to_string()).collect::<Vec<_>>().join(",");
                            format!("trunk (native {}, allowed {})", native_vlan, allowed)
                        }
                    }
                    SwitchportMode::Routed => "routed".to_string(),
                };

                ifaces.push(JsInterface {
                    name: iface.name.clone(),
                    mac: iface.mac_address.to_string(),
                    ip: iface.ipv4_address.map(|c| c.to_string()),
                    admin_status: iface.admin_status.to_string(),
                    oper_status: iface.oper_status.to_string(),
                    switchport_mode: sw_mode,
                    encapsulation_vlan: iface.encapsulation_vlan,
                });
            }

            let type_str = match node.state.device_type {
                DeviceType::Router => "router",
                DeviceType::Switch => "switch",
                DeviceType::Host => "host",
            };

            js_nodes.push(JsNode {
                id: node.state.id.clone(),
                hostname: node.state.hostname.clone(),
                device_type: type_str.to_string(),
                interfaces: ifaces,
            });
        }

        let mut js_links = Vec::new();
        for link in &self.sim.links {
            js_links.push(JsLink {
                id: link.id.clone(),
                node_a: link.node_a.clone(),
                port_a: link.port_a.clone(),
                node_b: link.node_b.clone(),
                port_b: link.port_b.clone(),
                latency_ms: link.latency_ms as u32,
                is_connected: link.is_connected,
            });
        }

        let topo = JsTopology {
            nodes: js_nodes,
            links: js_links,
        };

        serde_wasm_bindgen::to_value(&topo).map_err(|e| JsValue::from_str(&e.to_string()))
    }

    pub fn get_node_tables(&self, node_id: &str) -> Result<JsValue, JsValue> {
        let node = self
            .sim
            .nodes
            .get(node_id)
            .ok_or_else(|| JsValue::from_str("Node not found"))?;

        let mac_table: Vec<JsMacEntry> = node
            .state
            .mac_table
            .iter()
            .map(|e| JsMacEntry {
                mac: e.mac.to_string(),
                port: e.port.clone(),
                vlan: e.vlan,
            })
            .collect();

        let arp_table: Vec<JsArpEntry> = node
            .state
            .arp_table
            .iter()
            .map(|e| JsArpEntry {
                ip: e.ip.to_string(),
                mac: e.mac.to_string(),
                interface: e.interface.clone(),
            })
            .collect();

        let routing_table: Vec<JsRouteEntry> = node
            .state
            .routing_table
            .iter()
            .map(|r| JsRouteEntry {
                prefix: r.destination.to_string(),
                next_hop: r.next_hop.map(|ip| ip.to_string()),
                interface: r.interface.clone(),
                metric: r.metric,
                route_type: format!("{:?}", r.route_type),
            })
            .collect();

        let vlans: Vec<JsVlanEntry> = node
            .state
            .vlans
            .values()
            .map(|v| JsVlanEntry {
                id: v.id,
                name: v.name.clone(),
            })
            .collect();

        let tables = JsNodeTables {
            mac_table,
            arp_table,
            routing_table,
            vlans,
        };

        serde_wasm_bindgen::to_value(&tables).map_err(|e| JsValue::from_str(&e.to_string()))
    }

    pub fn execute_cli(
        &mut self,
        node_id: &str,
        vendor: &str,
        command: &str,
    ) -> Result<JsValue, JsValue> {
        let node = self
            .sim
            .nodes
            .get_mut(node_id)
            .ok_or_else(|| JsValue::from_str("Node not found"))?;

        let (resp, prompt) = match vendor.to_lowercase().as_str() {
            "cisco" => {
                let session = self
                    .cisco_sessions
                    .entry(node_id.to_string())
                    .or_insert_with(CiscoCliEngine::new);
                let res = session.execute(&mut node.state, command);
                let p = session.prompt(&node.state);
                (res, p)
            }
            "mikrotik" => {
                let session = self
                    .mikrotik_sessions
                    .entry(node_id.to_string())
                    .or_insert_with(MikroTikCliEngine::new);
                let res = session.execute(&mut node.state, command);
                let p = session.prompt(&node.state);
                (res, p)
            }
            _ => return Err(JsValue::from_str("Unsupported vendor")),
        };

        let result = JsCliResult {
            output: resp.output,
            prompt,
            is_exit: resp.is_exit,
        };

        serde_wasm_bindgen::to_value(&result).map_err(|e| JsValue::from_str(&e.to_string()))
    }

    pub fn get_cli_prompt(&self, node_id: &str, vendor: &str) -> String {
        let node = match self.sim.nodes.get(node_id) {
            Some(n) => n,
            None => return "> ".to_string(),
        };

        match vendor.to_lowercase().as_str() {
            "cisco" => {
                if let Some(session) = self.cisco_sessions.get(node_id) {
                    session.prompt(&node.state)
                } else {
                    format!("{}> ", node.state.hostname)
                }
            }
            "mikrotik" => {
                if let Some(session) = self.mikrotik_sessions.get(node_id) {
                    session.prompt(&node.state)
                } else {
                    format!("[admin@{}] > ", node.state.hostname)
                }
            }
            _ => "> ".to_string(),
        }
    }

    pub fn export_topology_json(&self) -> Result<String, JsValue> {
        let nodes: Vec<DeviceState> = self.sim.nodes.values().map(|n| n.state.clone()).collect();
        let export = LabExportData {
            version: "1.0.0".to_string(),
            title: Some("RouteCraft Network Topology".to_string()),
            description: Some("Exported network lab configuration".to_string()),
            nodes,
            links: self.sim.links.clone(),
        };
        serde_json::to_string_pretty(&export).map_err(|e| JsValue::from_str(&e.to_string()))
    }

    pub fn import_topology_json(&mut self, json_str: &str) -> Result<(), JsValue> {
        let import: LabExportData = serde_json::from_str(json_str)
            .map_err(|e| JsValue::from_str(&format!("Invalid topology JSON: {}", e)))?;

        self.sim.clear();
        self.cisco_sessions.clear();
        self.mikrotik_sessions.clear();

        for node_state in import.nodes {
            let id = node_state.id.clone();
            self.sim.add_node(node_state);
            self.cisco_sessions.insert(id.clone(), CiscoCliEngine::new());
            self.mikrotik_sessions.insert(id, MikroTikCliEngine::new());
        }

        for link in import.links {
            self.sim.add_link(
                link.id,
                link.node_a,
                link.port_a,
                link.node_b,
                link.port_b,
                link.latency_ms,
            );
        }

        Ok(())
    }
}
