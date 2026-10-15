use std::cmp::Ordering;
use std::collections::{BTreeMap, BinaryHeap};
use std::net::Ipv4Addr;
use routecraft_core::{AdminStatus, DeviceState, DeviceType, MacAddress, OperStatus};
use routecraft_protocols::{
    ArpOperation, EthernetFrame, IcmpType, Ipv4Payload, PacketPayload,
};

pub type SimTime = u64; // Time in milliseconds

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SimLink {
    pub id: String,
    pub node_a: String,
    pub port_a: String,
    pub node_b: String,
    pub port_b: String,
    pub latency_ms: SimTime,
    pub is_connected: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SimEvent {
    pub id: u64,
    pub time: SimTime,
    pub source_node: String,
    pub source_port: String,
    pub target_node: String,
    pub target_port: String,
    pub frame: EthernetFrame,
    pub decision_log: Vec<String>,
}

impl Ord for SimEvent {
    fn cmp(&self, other: &Self) -> Ordering {
        // Earlier timestamp comes first in Min-Heap
        other
            .time
            .cmp(&self.time)
            .then_with(|| other.id.cmp(&self.id))
    }
}

impl PartialOrd for SimEvent {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

pub struct SimNode {
    pub state: DeviceState,
    pub pending_arp: BTreeMap<Ipv4Addr, Vec<EthernetFrame>>,
}

impl SimNode {
    pub fn new(state: DeviceState) -> Self {
        Self {
            state,
            pending_arp: BTreeMap::new(),
        }
    }

    /// Process incoming frame and produce outgoing frames: (egress_port, frame)
    pub fn receive_frame(
        &mut self,
        ingress_port: &str,
        frame: EthernetFrame,
    ) -> (Vec<String>, Vec<(String, EthernetFrame)>) {
        let mut log = Vec::new();
        let mut outgoing = Vec::new();

        let iface = match self.state.get_interface(ingress_port) {
            Some(i) => i.clone(),
            None => {
                log.push(format!(
                    "[{}] Port {} not found on device.",
                    self.state.hostname, ingress_port
                ));
                return (log, outgoing);
            }
        };

        if iface.admin_status != AdminStatus::Up || iface.oper_status != OperStatus::Up {
            log.push(format!(
                "[{}] Port {} is down. Frame dropped.",
                self.state.hostname, ingress_port
            ));
            return (log, outgoing);
        }

        // ================= SWITCH LOGIC =================
        if self.state.device_type == DeviceType::Switch {
            log.push(format!(
                "[{}] Switch received frame on {} [{} -> {}]",
                self.state.hostname, ingress_port, frame.src_mac, frame.dst_mac
            ));

            // 1. MAC Learning
            self.state
                .mac_table
                .learn(frame.src_mac, ingress_port.to_string(), 1);
            log.push(format!(
                "[{}] CAM: Learned MAC {} on port {}",
                self.state.hostname, frame.src_mac, ingress_port
            ));

            // 2. Forwarding Decision
            if frame.dst_mac.is_broadcast() || frame.dst_mac.is_multicast() {
                log.push(format!(
                    "[{}] Broadcast/Multicast frame. Flooding to all other active ports.",
                    self.state.hostname
                ));
                for (name, port) in &self.state.interfaces {
                    if name != ingress_port && port.is_up() {
                        outgoing.push((name.clone(), frame.clone()));
                    }
                }
            } else if let Some(target_port) = self.state.mac_table.lookup(&frame.dst_mac, 1) {
                if target_port != ingress_port {
                    log.push(format!(
                        "[{}] CAM hit: MAC {} found on port {}. Forwarding unicast.",
                        self.state.hostname, frame.dst_mac, target_port
                    ));
                    outgoing.push((target_port.to_string(), frame));
                } else {
                    log.push(format!(
                        "[{}] Destination port is ingress port. Frame dropped (filtering).",
                        self.state.hostname
                    ));
                }
            } else {
                log.push(format!(
                    "[{}] CAM miss: Unknown destination MAC {}. Flooding to all other active ports.",
                    self.state.hostname, frame.dst_mac
                ));
                for (name, port) in &self.state.interfaces {
                    if name != ingress_port && port.is_up() {
                        outgoing.push((name.clone(), frame.clone()));
                    }
                }
            }

            return (log, outgoing);
        }

        // ================= ROUTER / HOST LOGIC =================
        // L2 filter: frame must be addressed to our interface MAC or broadcast
        if frame.dst_mac != iface.mac_address && !frame.dst_mac.is_broadcast() {
            log.push(format!(
                "[{}] Frame destination MAC {} does not match interface MAC {}. Dropped.",
                self.state.hostname, frame.dst_mac, iface.mac_address
            ));
            return (log, outgoing);
        }

        match &frame.payload {
            PacketPayload::Arp(arp) => {
                match arp.operation {
                    ArpOperation::Request => {
                        log.push(format!(
                            "[{}] ARP Request received on {}: Who has {}? Tell {}",
                            self.state.hostname, ingress_port, arp.target_ip, arp.sender_ip
                        ));

                        // Learn sender IP -> MAC in ARP table
                        self.state.arp_table.insert(
                            arp.sender_ip,
                            arp.sender_mac,
                            ingress_port.to_string(),
                            false,
                        );

                        // Check if request is for our interface IP
                        if let Some(our_cidr) = iface.ipv4_address {
                            if our_cidr.ip == arp.target_ip {
                                log.push(format!(
                                    "[{}] ARP Request is for us ({}). Sending ARP Reply.",
                                    self.state.hostname, our_cidr.ip
                                ));
                                let reply_frame = EthernetFrame::new_arp_reply(
                                    iface.mac_address,
                                    our_cidr.ip,
                                    arp.sender_mac,
                                    arp.sender_ip,
                                );
                                outgoing.push((ingress_port.to_string(), reply_frame));
                            }
                        }
                    }
                    ArpOperation::Reply => {
                        log.push(format!(
                            "[{}] ARP Reply received on {}: {} is at {}",
                            self.state.hostname, ingress_port, arp.sender_ip, arp.sender_mac
                        ));
                        self.state.arp_table.insert(
                            arp.sender_ip,
                            arp.sender_mac,
                            ingress_port.to_string(),
                            false,
                        );

                        // Flush any queued packets waiting for this ARP!
                        if let Some(queued) = self.pending_arp.remove(&arp.sender_ip) {
                            log.push(format!(
                                "[{}] Flushing {} queued packets for {}",
                                self.state.hostname,
                                queued.len(),
                                arp.sender_ip
                            ));
                            for mut pending_frame in queued {
                                // Update destination MAC to the resolved ARP MAC
                                pending_frame.dst_mac = arp.sender_mac;
                                outgoing.push((ingress_port.to_string(), pending_frame));
                            }
                        }
                    }
                }
            }

            PacketPayload::Ipv4(ip_pkt) => {
                log.push(format!(
                    "[{}] IPv4 packet received on {}: {} -> {} (TTL={})",
                    self.state.hostname, ingress_port, ip_pkt.src_ip, ip_pkt.dst_ip, ip_pkt.ttl
                ));

                // Check if packet is destined for one of our own interfaces
                let is_for_us = self
                    .state
                    .interfaces
                    .values()
                    .any(|i| i.ipv4_address.map(|c| c.ip) == Some(ip_pkt.dst_ip));

                if is_for_us {
                    if let Ipv4Payload::Icmp(ref icmp) = ip_pkt.payload {
                        if icmp.icmp_type == IcmpType::EchoRequest {
                            log.push(format!(
                                "[{}] ICMP Echo Request received from {}. Sending Echo Reply.",
                                self.state.hostname, ip_pkt.src_ip
                            ));
                            let reply_frame = EthernetFrame::new_icmp_echo_reply(
                                iface.mac_address,
                                frame.src_mac,
                                ip_pkt.dst_ip,
                                ip_pkt.src_ip,
                                icmp.sequence_number,
                                icmp.identifier,
                                64,
                            );
                            outgoing.push((ingress_port.to_string(), reply_frame));
                        } else if icmp.icmp_type == IcmpType::EchoReply {
                            log.push(format!(
                                "[{}] ICMP Echo Reply received from {} (seq={})! PING SUCCESSFUL!",
                                self.state.hostname, ip_pkt.src_ip, icmp.sequence_number
                            ));
                        }
                    }
                } else if self.state.device_type == DeviceType::Router {
                    // Routing logic (L3 Forwarding)
                    if ip_pkt.ttl <= 1 {
                        log.push(format!(
                            "[{}] IPv4 TTL expired in transit. Dropping packet.",
                            self.state.hostname
                        ));
                        return (log, outgoing);
                    }

                    if let Some(route) = self.state.routing_table.lookup(ip_pkt.dst_ip) {
                        let egress_port = route.interface.clone();
                        let target_ip = route.next_hop.unwrap_or(ip_pkt.dst_ip);

                        log.push(format!(
                            "[{}] Routing table match: {} via {} (next hop: {})",
                            self.state.hostname, route.destination, egress_port, target_ip
                        ));

                        if let Some(egress_iface) = self.state.get_interface(&egress_port) {
                            let mut forwarded_frame = frame.clone();
                            if let PacketPayload::Ipv4(ref mut f_ip) = forwarded_frame.payload {
                                f_ip.ttl -= 1;
                            }
                            forwarded_frame.src_mac = egress_iface.mac_address;

                            // Resolve L2 next-hop MAC via ARP
                            if let Some(next_mac) = self.state.arp_table.lookup(&target_ip) {
                                forwarded_frame.dst_mac = *next_mac;
                                outgoing.push((egress_port, forwarded_frame));
                            } else {
                                log.push(format!(
                                    "[{}] ARP cache miss for next hop {}. Enqueuing packet and sending ARP Request.",
                                    self.state.hostname, target_ip
                                ));
                                self.pending_arp
                                    .entry(target_ip)
                                    .or_default()
                                    .push(forwarded_frame);

                                if let Some(egress_ip) = egress_iface.ipv4_address {
                                    let arp_req = EthernetFrame::new_arp_request(
                                        egress_iface.mac_address,
                                        egress_ip.ip,
                                        target_ip,
                                    );
                                    outgoing.push((egress_port, arp_req));
                                }
                            }
                        }
                    } else {
                        log.push(format!(
                            "[{}] No route to host {}. Packet dropped.",
                            self.state.hostname, ip_pkt.dst_ip
                        ));
                    }
                }
            }

            PacketPayload::Raw(_) => {}
        }

        (log, outgoing)
    }

    /// Triggers sending an ICMP Echo Request (Ping) from this node
    pub fn initiate_ping(&mut self, target_ip: Ipv4Addr) -> (Vec<String>, Vec<(String, EthernetFrame)>) {
        let mut log = Vec::new();
        let mut outgoing = Vec::new();

        // 1. Look up routing table for target IP
        let route = match self.state.routing_table.lookup(target_ip) {
            Some(r) => r.clone(),
            None => {
                log.push(format!(
                    "[{}] Cannot ping {}: No route to host in routing table.",
                    self.state.hostname, target_ip
                ));
                return (log, outgoing);
            }
        };

        let egress_port = route.interface.clone();
        let iface = match self.state.get_interface(&egress_port) {
            Some(i) => i.clone(),
            None => return (log, outgoing),
        };

        let src_ip = match iface.ipv4_address {
            Some(c) => c.ip,
            None => {
                log.push(format!(
                    "[{}] Egress interface {} has no IP address assigned.",
                    self.state.hostname, egress_port
                ));
                return (log, outgoing);
            }
        };

        let l3_target = route.next_hop.unwrap_or(target_ip);

        // Check ARP table
        if let Some(target_mac) = self.state.arp_table.lookup(&l3_target) {
            log.push(format!(
                "[{}] ARP hit for {}. Sending ICMP Echo Request directly.",
                self.state.hostname, l3_target
            ));
            let frame = EthernetFrame::new_icmp_echo_request(
                iface.mac_address,
                *target_mac,
                src_ip,
                target_ip,
                1,
                100,
            );
            outgoing.push((egress_port, frame));
        } else {
            log.push(format!(
                "[{}] ARP miss for {}. Enqueuing ICMP Echo and sending ARP Request.",
                self.state.hostname, l3_target
            ));
            let icmp_frame = EthernetFrame::new_icmp_echo_request(
                iface.mac_address,
                MacAddress::ZERO, // will be updated when ARP reply arrives
                src_ip,
                target_ip,
                1,
                100,
            );
            self.pending_arp.entry(l3_target).or_default().push(icmp_frame);

            let arp_frame = EthernetFrame::new_arp_request(iface.mac_address, src_ip, l3_target);
            outgoing.push((egress_port, arp_frame));
        }

        (log, outgoing)
    }
}

pub struct NetworkSimulation {
    pub current_time: SimTime,
    pub nodes: BTreeMap<String, SimNode>,
    pub links: Vec<SimLink>,
    pub event_queue: BinaryHeap<SimEvent>,
    pub event_counter: u64,
}

impl Default for NetworkSimulation {
    fn default() -> Self {
        Self {
            current_time: 0,
            nodes: BTreeMap::new(),
            links: Vec::new(),
            event_queue: BinaryHeap::new(),
            event_counter: 0,
        }
    }
}

impl NetworkSimulation {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn add_node(&mut self, state: DeviceState) {
        self.nodes.insert(state.id.clone(), SimNode::new(state));
    }

    pub fn add_link(
        &mut self,
        id: impl Into<String>,
        node_a: impl Into<String>,
        port_a: impl Into<String>,
        node_b: impl Into<String>,
        port_b: impl Into<String>,
        latency_ms: SimTime,
    ) {
        let na = node_a.into();
        let pa = port_a.into();
        let nb = node_b.into();
        let pb = port_b.into();

        // Bring operational status up on both ends
        if let Some(node) = self.nodes.get_mut(&na) {
            let _ = node.state.set_interface_oper_status(&pa, OperStatus::Up);
        }
        if let Some(node) = self.nodes.get_mut(&nb) {
            let _ = node.state.set_interface_oper_status(&pb, OperStatus::Up);
        }

        self.links.push(SimLink {
            id: id.into(),
            node_a: na,
            port_a: pa,
            node_b: nb,
            port_b: pb,
            latency_ms,
            is_connected: true,
        });
    }

    fn find_connected_peer(&self, node_id: &str, port: &str) -> Option<(String, String, SimTime)> {
        for link in &self.links {
            if !link.is_connected {
                continue;
            }
            if link.node_a == node_id && link.port_a == port {
                return Some((link.node_b.clone(), link.port_b.clone(), link.latency_ms));
            } else if link.node_b == node_id && link.port_b == port {
                return Some((link.node_a.clone(), link.port_a.clone(), link.latency_ms));
            }
        }
        None
    }

    pub fn trigger_ping(&mut self, source_node_id: &str, target_ip: Ipv4Addr) {
        if let Some(node) = self.nodes.get_mut(source_node_id) {
            let (_logs, outgoing) = node.initiate_ping(target_ip);
            for (port, frame) in outgoing {
                if let Some((target_node, target_port, latency)) =
                    self.find_connected_peer(source_node_id, &port)
                {
                    self.event_counter += 1;
                    self.event_queue.push(SimEvent {
                        id: self.event_counter,
                        time: self.current_time + latency,
                        source_node: source_node_id.to_string(),
                        source_port: port,
                        target_node,
                        target_port,
                        frame,
                        decision_log: Vec::new(),
                    });
                }
            }
        }
    }

    /// Advances simulation by processing the next discrete event in the queue
    pub fn step(&mut self) -> Option<SimEvent> {
        let mut event = self.event_queue.pop()?;
        self.current_time = event.time;

        if let Some(target_node) = self.nodes.get_mut(&event.target_node) {
            let (logs, outgoing) =
                target_node.receive_frame(&event.target_port, event.frame.clone());
            event.decision_log = logs;

            for (out_port, out_frame) in outgoing {
                if let Some((peer_node, peer_port, latency)) =
                    self.find_connected_peer(&event.target_node, &out_port)
                {
                    self.event_counter += 1;
                    self.event_queue.push(SimEvent {
                        id: self.event_counter,
                        time: self.current_time + latency,
                        source_node: event.target_node.clone(),
                        source_port: out_port,
                        target_node: peer_node,
                        target_port: peer_port,
                        frame: out_frame,
                        decision_log: Vec::new(),
                    });
                }
            }
        }

        Some(event)
    }

    /// Runs all events in the queue until empty or max_steps reached
    pub fn run_until_idle(&mut self, max_steps: usize) -> Vec<SimEvent> {
        let mut processed = Vec::new();
        while processed.len() < max_steps && !self.event_queue.is_empty() {
            if let Some(ev) = self.step() {
                processed.push(ev);
            }
        }
        processed
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use routecraft_core::Interface;

    #[test]
    fn test_end_to_end_ping_through_switch_with_arp_resolution() {
        let mut sim = NetworkSimulation::new();

        // PC1
        let mut pc1 = DeviceState::new("pc1", "PC1", DeviceType::Host);
        let mut iface1 = Interface::new("eth0", MacAddress([0x00, 0x11, 0x22, 0x33, 0x44, 0x01]));
        iface1.set_admin_status(AdminStatus::Up);
        pc1.add_interface(iface1);
        pc1.set_interface_ip("eth0", Some("192.168.1.10/24".parse().unwrap())).unwrap();
        sim.add_node(pc1);

        // Switch SW1
        let mut sw1 = DeviceState::new("sw1", "Switch1", DeviceType::Switch);
        let mut sw_p1 = Interface::new("FastEthernet0/1", MacAddress([0x00, 0xaa, 0xbb, 0xcc, 0xdd, 0x01]));
        sw_p1.set_admin_status(AdminStatus::Up);
        let mut sw_p2 = Interface::new("FastEthernet0/2", MacAddress([0x00, 0xaa, 0xbb, 0xcc, 0xdd, 0x02]));
        sw_p2.set_admin_status(AdminStatus::Up);
        sw1.add_interface(sw_p1);
        sw1.add_interface(sw_p2);
        sim.add_node(sw1);

        // PC2
        let mut pc2 = DeviceState::new("pc2", "PC2", DeviceType::Host);
        let mut iface2 = Interface::new("eth0", MacAddress([0x00, 0x11, 0x22, 0x33, 0x44, 0x02]));
        iface2.set_admin_status(AdminStatus::Up);
        pc2.add_interface(iface2);
        pc2.set_interface_ip("eth0", Some("192.168.1.20/24".parse().unwrap())).unwrap();
        sim.add_node(pc2);

        // Cabling: PC1:eth0 <-> SW1:Fa0/1, SW1:Fa0/2 <-> PC2:eth0
        sim.add_link("link1", "pc1", "eth0", "sw1", "FastEthernet0/1", 5);
        sim.add_link("link2", "sw1", "FastEthernet0/2", "pc2", "eth0", 5);

        // Trigger ping from PC1 (192.168.1.10) to PC2 (192.168.1.20)
        sim.trigger_ping("pc1", Ipv4Addr::new(192, 168, 1, 20));

        // Run simulation until queue is idle
        let processed_events = sim.run_until_idle(50);

        // Let's verify the discrete event sequence:
        // 1. ARP Request arrives at SW1 from PC1
        // 2. SW1 floods ARP Request to PC2
        // 3. PC2 receives ARP Request, replies with ARP Reply
        // 4. ARP Reply arrives at SW1 from PC2
        // 5. SW1 forwards ARP Reply unicast to PC1
        // 6. PC1 receives ARP Reply, flushes pending ICMP Echo Request!
        // 7. ICMP Echo Request arrives at SW1
        // 8. SW1 forwards ICMP Echo Request to PC2
        // 9. PC2 receives ICMP Echo Request, replies with ICMP Echo Reply!
        // 10. ICMP Echo Reply arrives at SW1
        // 11. SW1 forwards ICMP Echo Reply to PC1
        // 12. PC1 receives ICMP Echo Reply!
        assert!(processed_events.len() >= 6, "Expected at least 6 events, got {}", processed_events.len());

        let last_event = processed_events.last().unwrap();
        assert_eq!(last_event.target_node, "pc1");
        assert!(last_event.decision_log.iter().any(|msg| msg.contains("PING SUCCESSFUL")));

        // Verify CAM table on SW1 learned both MACs!
        let sw1_node = sim.nodes.get("sw1").unwrap();
        assert_eq!(
            sw1_node.state.mac_table.lookup(&MacAddress([0x00, 0x11, 0x22, 0x33, 0x44, 0x01]), 1),
            Some("FastEthernet0/1")
        );
        assert_eq!(
            sw1_node.state.mac_table.lookup(&MacAddress([0x00, 0x11, 0x22, 0x33, 0x44, 0x02]), 1),
            Some("FastEthernet0/2")
        );

        // Verify ARP tables on PC1 and PC2
        let pc1_node = sim.nodes.get("pc1").unwrap();
        assert_eq!(
            pc1_node.state.arp_table.lookup(&Ipv4Addr::new(192, 168, 1, 20)),
            Some(&MacAddress([0x00, 0x11, 0x22, 0x33, 0x44, 0x02]))
        );
    }

    #[test]
    fn test_routed_ping_through_router() {
        let mut sim = NetworkSimulation::new();

        // PC1 on Subnet 1: 192.168.1.10/24, default route via 192.168.1.1
        let mut pc1 = DeviceState::new("pc1", "PC1", DeviceType::Host);
        let mut iface1 = Interface::new("eth0", MacAddress([0x00, 0x11, 0x22, 0x33, 0x44, 0x10]));
        iface1.set_admin_status(AdminStatus::Up);
        pc1.add_interface(iface1);
        pc1.set_interface_ip("eth0", Some("192.168.1.10/24".parse().unwrap())).unwrap();
        pc1.routing_table.add_route(routecraft_core::Route::new_static(
            "0.0.0.0/0".parse().unwrap(),
            Some(Ipv4Addr::new(192, 168, 1, 1)),
            "eth0",
            1,
        ));
        sim.add_node(pc1);

        // Router R1: Gi0/0 = 192.168.1.1/24, Gi0/1 = 192.168.2.1/24
        let mut r1 = DeviceState::new("r1", "Router1", DeviceType::Router);
        let mut r_g0 = Interface::new("GigabitEthernet0/0", MacAddress([0x00, 0xaa, 0xbb, 0xcc, 0x00, 0x01]));
        r_g0.set_admin_status(AdminStatus::Up);
        let mut r_g1 = Interface::new("GigabitEthernet0/1", MacAddress([0x00, 0xaa, 0xbb, 0xcc, 0x00, 0x02]));
        r_g1.set_admin_status(AdminStatus::Up);
        r1.add_interface(r_g0);
        r1.add_interface(r_g1);
        r1.set_interface_ip("gi0/0", Some("192.168.1.1/24".parse().unwrap())).unwrap();
        r1.set_interface_ip("gi0/1", Some("192.168.2.1/24".parse().unwrap())).unwrap();
        sim.add_node(r1);

        // PC2 on Subnet 2: 192.168.2.20/24, default route via 192.168.2.1
        let mut pc2 = DeviceState::new("pc2", "PC2", DeviceType::Host);
        let mut iface2 = Interface::new("eth0", MacAddress([0x00, 0x11, 0x22, 0x33, 0x44, 0x20]));
        iface2.set_admin_status(AdminStatus::Up);
        pc2.add_interface(iface2);
        pc2.set_interface_ip("eth0", Some("192.168.2.20/24".parse().unwrap())).unwrap();
        pc2.routing_table.add_route(routecraft_core::Route::new_static(
            "0.0.0.0/0".parse().unwrap(),
            Some(Ipv4Addr::new(192, 168, 2, 1)),
            "eth0",
            1,
        ));
        sim.add_node(pc2);

        // Cable links
        sim.add_link("link1", "pc1", "eth0", "r1", "GigabitEthernet0/0", 5);
        sim.add_link("link2", "r1", "GigabitEthernet0/1", "pc2", "eth0", 5);

        // Trigger ping across subnets from PC1 (192.168.1.10) to PC2 (192.168.2.20)
        sim.trigger_ping("pc1", Ipv4Addr::new(192, 168, 2, 20));

        let processed = sim.run_until_idle(50);
        assert!(processed.len() >= 8, "Expected at least 8 events for routed ping, got {}", processed.len());

        let last_event = processed.last().unwrap();
        assert_eq!(last_event.target_node, "pc1");
        assert!(last_event.decision_log.iter().any(|msg| msg.contains("PING SUCCESSFUL")));
    }
}
