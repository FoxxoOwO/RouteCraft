use std::collections::HashMap;
use std::net::Ipv4Addr;
use wasm_bindgen::prelude::*;
use serde::{Deserialize, Serialize};

use routecraft_core::{
    AdminStatus, DeviceState, DeviceType, Interface, MacAddress,
};
use routecraft_protocols::PacketPayload;
use routecraft_engine::NetworkSimulation;
use routecraft_cli::{CiscoCliEngine, CliEngine, MikroTikCliEngine};

#[derive(Serialize, Deserialize)]
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
}

#[derive(Serialize, Deserialize)]
pub struct JsInterface {
    pub name: String,
    pub mac: String,
    pub ip: Option<String>,
    pub admin_status: String,
    pub oper_status: String,
}

#[derive(Serialize, Deserialize)]
pub struct JsNode {
    pub id: String,
    pub hostname: String,
    pub device_type: String,
    pub interfaces: Vec<JsInterface>,
}

#[derive(Serialize, Deserialize)]
pub struct JsLink {
    pub id: String,
    pub node_a: String,
    pub port_a: String,
    pub node_b: String,
    pub port_b: String,
    pub latency_ms: u32,
    pub is_connected: bool,
}

#[derive(Serialize, Deserialize)]
pub struct JsTopology {
    pub nodes: Vec<JsNode>,
    pub links: Vec<JsLink>,
}

#[derive(Serialize, Deserialize)]
pub struct JsMacEntry {
    pub mac: String,
    pub port: String,
    pub vlan: u16,
}

#[derive(Serialize, Deserialize)]
pub struct JsArpEntry {
    pub ip: String,
    pub mac: String,
    pub interface: String,
}

#[derive(Serialize, Deserialize)]
pub struct JsRouteEntry {
    pub prefix: String,
    pub next_hop: Option<String>,
    pub interface: String,
    pub metric: u32,
    pub route_type: String,
}

#[derive(Serialize, Deserialize)]
pub struct JsNodeTables {
    pub mac_table: Vec<JsMacEntry>,
    pub arp_table: Vec<JsArpEntry>,
    pub routing_table: Vec<JsRouteEntry>,
}

#[derive(Serialize, Deserialize)]
pub struct JsCliResult {
    pub output: String,
    pub prompt: String,
    pub is_exit: bool,
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
            // Generate deterministic pseudo-MAC based on node and name
            let hash = (node_id.len() as u8) * 17 + (name.len() as u8);
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

    pub fn toggle_link(&mut self, link_id: &str, connected: bool) -> Result<bool, JsValue> {
        for link in &mut self.sim.links {
            if link.id == link_id {
                link.is_connected = connected;
                return Ok(true);
            }
        }
        Err(JsValue::from_str("Link not found"))
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
                ifaces.push(JsInterface {
                    name: iface.name.clone(),
                    mac: iface.mac_address.to_string(),
                    ip: iface.ipv4_address.map(|c| c.to_string()),
                    admin_status: iface.admin_status.to_string(),
                    oper_status: iface.oper_status.to_string(),
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

        let tables = JsNodeTables {
            mac_table,
            arp_table,
            routing_table,
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
}
