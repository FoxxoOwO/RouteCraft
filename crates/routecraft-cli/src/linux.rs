use routecraft_core::{AdminStatus, DeviceState, Ipv4Cidr, Route, RouteType};
use std::net::Ipv4Addr;
use crate::traits::{CliEngine, CliResponse};

#[derive(Default, Clone)]
pub struct LinuxCliEngine {
    pub current_directory: String,
}

impl LinuxCliEngine {
    pub fn new() -> Self {
        Self {
            current_directory: "~".to_string(),
        }
    }

    fn handle_ip_command(&mut self, state: &mut DeviceState, args: &[&str]) -> CliResponse {
        if args.is_empty() {
            return CliResponse::ok(
                "Usage: ip [ address | link | route | neigh ] { COMMAND | help }",
            );
        }

        match args[0] {
            "a" | "addr" | "address" => self.handle_ip_address(state, &args[1..]),
            "l" | "link" => self.handle_ip_link(state, &args[1..]),
            "r" | "route" => self.handle_ip_route(state, &args[1..]),
            "n" | "neigh" | "neighbor" => self.handle_ip_neighbor(state),
            _ => CliResponse::ok(format!("Object \"{}\" is unknown, try \"ip help\".", args[0])),
        }
    }

    fn handle_ip_address(&mut self, state: &mut DeviceState, args: &[&str]) -> CliResponse {
        if args.is_empty() || args[0] == "show" || args[0] == "list" {
            let mut out = String::new();
            out.push_str("1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 qdisc noqueue state UNKNOWN\n");
            out.push_str("    link/loopback 00:00:00:00:00:00 brd 00:00:00:00:00:00\n");
            out.push_str("    inet 127.0.0.1/8 scope host lo\n");

            for (idx, iface) in (2..).zip(state.interfaces.values()) {
                let state_str = if iface.is_up() { "UP" } else { "DOWN" };
                let flags = if iface.is_up() {
                    "<BROADCAST,MULTICAST,UP,LOWER_UP>"
                } else {
                    "<BROADCAST,MULTICAST>"
                };

                out.push_str(&format!(
                    "{}: {}: {} mtu {} state {}\n",
                    idx, iface.name, flags, iface.mtu, state_str
                ));
                out.push_str(&format!(
                    "    link/ether {} brd ff:ff:ff:ff:ff:ff\n",
                    iface.mac_address
                ));

                if let Some(ip) = iface.ipv4_address {
                    out.push_str(&format!("    inet {} scope global {}\n", ip, iface.name));
                }
            }
            CliResponse::ok(out.trim_end())
        } else if args[0] == "add" {
            // ip addr add 192.168.1.10/24 dev eth0
            if args.len() < 4 || args[2] != "dev" {
                return CliResponse::ok("Usage: ip addr add <IP/NETMASK> dev <IFNAME>");
            }
            let cidr_str = args[1];
            let ifname = args[3];

            let cidr = match cidr_str.parse::<Ipv4Cidr>() {
                Ok(c) => c,
                Err(e) => return CliResponse::ok(format!("Error: Invalid CIDR address: {}", e)),
            };

            match state.set_interface_ip(ifname, Some(cidr)) {
                Ok(_) => CliResponse::empty(),
                Err(e) => CliResponse::ok(format!("Error: {}", e)),
            }
        } else if args[0] == "del" || args[0] == "delete" {
            // ip addr del 192.168.1.10/24 dev eth0
            if args.len() < 4 || args[2] != "dev" {
                return CliResponse::ok("Usage: ip addr del <IP/NETMASK> dev <IFNAME>");
            }
            let ifname = args[3];
            match state.set_interface_ip(ifname, None) {
                Ok(_) => CliResponse::empty(),
                Err(e) => CliResponse::ok(format!("Error: {}", e)),
            }
        } else {
            CliResponse::ok("Command not recognized, try \"ip addr help\".")
        }
    }

    fn handle_ip_link(&mut self, state: &mut DeviceState, args: &[&str]) -> CliResponse {
        // ip link set eth0 up/down
        if args.len() >= 3 && args[0] == "set" {
            let ifname = args[1];
            let action = args[2];
            match action {
                "up" => match state.set_interface_admin_status(ifname, AdminStatus::Up) {
                    Ok(_) => CliResponse::empty(),
                    Err(e) => CliResponse::ok(format!("Cannot set link up: {}", e)),
                },
                "down" => match state.set_interface_admin_status(ifname, AdminStatus::Down) {
                    Ok(_) => CliResponse::empty(),
                    Err(e) => CliResponse::ok(format!("Cannot set link down: {}", e)),
                },
                _ => CliResponse::ok("Usage: ip link set <IFNAME> { up | down }"),
            }
        } else {
            CliResponse::ok("Usage: ip link set <IFNAME> { up | down }")
        }
    }

    fn handle_ip_route(&mut self, state: &mut DeviceState, args: &[&str]) -> CliResponse {
        if args.is_empty() || args[0] == "show" || args[0] == "list" {
            let mut out = String::new();
            for r in state.routing_table.iter() {
                if r.destination.prefix_len == 0 {
                    if let Some(gw) = r.next_hop {
                        out.push_str(&format!(
                            "default via {} dev {} proto static metric {}\n",
                            gw, r.interface, r.metric
                        ));
                    }
                } else if r.route_type == RouteType::Connected {
                    out.push_str(&format!(
                        "{} dev {} proto kernel scope link\n",
                        r.destination, r.interface
                    ));
                } else if let Some(gw) = r.next_hop {
                    out.push_str(&format!(
                        "{} via {} dev {} proto static metric {}\n",
                        r.destination, gw, r.interface, r.metric
                    ));
                }
            }
            CliResponse::ok(out.trim_end())
        } else if args[0] == "add" {
            // ip route add default via 192.168.1.1
            // ip route add 10.0.0.0/8 via 192.168.1.1
            if args.len() >= 4 && args[1] == "default" && args[2] == "via" {
                let gw_ip = match args[3].parse::<Ipv4Addr>() {
                    Ok(ip) => ip,
                    Err(_) => return CliResponse::ok("Error: Invalid gateway IP address"),
                };

                // Find interface that matches gateway subnet
                let target_iface = state.interfaces.values().find_map(|iface| {
                    if let Some(ip) = iface.ipv4_address {
                        if ip.contains(gw_ip) {
                            return Some(iface.name.clone());
                        }
                    }
                    None
                });

                let ifname = target_iface.unwrap_or_else(|| {
                    state
                        .interfaces
                        .keys()
                        .next()
                        .cloned()
                        .unwrap_or_else(|| "eth0".to_string())
                });

                let default_route = Route::new_static(
                    Ipv4Cidr::new(Ipv4Addr::UNSPECIFIED, 0).unwrap(),
                    Some(gw_ip),
                    ifname,
                    100,
                );
                state.routing_table.add_route(default_route);
                CliResponse::empty()
            } else if args.len() >= 4 && args[2] == "via" {
                let dest = match args[1].parse::<Ipv4Cidr>() {
                    Ok(c) => c,
                    Err(e) => return CliResponse::ok(format!("Error: Invalid CIDR: {}", e)),
                };
                let gw_ip = match args[3].parse::<Ipv4Addr>() {
                    Ok(ip) => ip,
                    Err(_) => return CliResponse::ok("Error: Invalid gateway IP address"),
                };

                let target_iface = state.interfaces.values().find_map(|iface| {
                    if let Some(ip) = iface.ipv4_address {
                        if ip.contains(gw_ip) {
                            return Some(iface.name.clone());
                        }
                    }
                    None
                });

                let ifname = target_iface.unwrap_or_else(|| "eth0".to_string());
                let route = Route::new_static(dest, Some(gw_ip), ifname, 100);
                state.routing_table.add_route(route);
                CliResponse::empty()
            } else {
                CliResponse::ok("Usage: ip route add { default | <CIDR> } via <GW_IP>")
            }
        } else {
            CliResponse::ok("Usage: ip route { show | add | del }")
        }
    }

    fn handle_ip_neighbor(&self, state: &DeviceState) -> CliResponse {
        let mut out = String::new();
        for entry in state.arp_table.iter() {
            out.push_str(&format!(
                "{} dev {} lladdr {} REACHABLE\n",
                entry.ip, entry.interface, entry.mac
            ));
        }
        if out.is_empty() {
            CliResponse::ok("No ARP neighbor entries found.")
        } else {
            CliResponse::ok(out.trim_end())
        }
    }
}

impl CliEngine for LinuxCliEngine {
    fn prompt(&self, state: &DeviceState) -> String {
        format!("root@{}:{}{}# ", state.hostname, self.current_directory, "")
    }

    fn execute(&mut self, state: &mut DeviceState, command: &str) -> CliResponse {
        let trimmed = command.trim();
        if trimmed.is_empty() {
            return CliResponse::empty();
        }

        let parts: Vec<&str> = trimmed.split_whitespace().collect();
        let cmd = parts[0];

        match cmd {
            "ip" => self.handle_ip_command(state, &parts[1..]),
            "ifconfig" => self.handle_ip_address(state, &[]),
            "route" => self.handle_ip_route(state, &[]),
            "arp" => self.handle_ip_neighbor(state),
            "hostname" => {
                if parts.len() > 1 {
                    state.hostname = parts[1].to_string();
                    CliResponse::empty()
                } else {
                    CliResponse::ok(&state.hostname)
                }
            }
            "uname" => {
                CliResponse::ok("Linux routecraft-kernel 6.8.0-net #1 SMP PREEMPT_DYNAMIC x86_64 GNU/Linux")
            }
            "clear" => CliResponse::ok("\x1b[2J\x1b[H"),
            "exit" => CliResponse::exit(),
            "help" => CliResponse::ok(
                "Linux Networking CLI commands:\n\
                 - ip addr [show | add <IP/CIDR> dev <IF> | del <IP/CIDR> dev <IF>]\n\
                 - ip link set <IF> [up | down]\n\
                 - ip route [show | add default via <IP> | add <CIDR> via <IP>]\n\
                 - ip neigh (or arp -n)\n\
                 - hostname [new_name]\n\
                 - ifconfig\n\
                 - uname -a",
            ),
            _ => CliResponse::ok(format!("{}: command not found", cmd)),
        }
    }

    fn complete(&self, state: &DeviceState, input: &str) -> Vec<String> {
        let candidates = vec![
            "ip addr show",
            "ip addr add",
            "ip addr del",
            "ip link set",
            "ip route show",
            "ip route add default via",
            "ip neigh",
            "ifconfig",
            "hostname",
            "uname -a",
            "help",
        ];

        let mut results: Vec<String> = candidates
            .into_iter()
            .filter(|c| c.starts_with(input))
            .map(|s| s.to_string())
            .collect();

        // Also suggest interface names
        for iface_name in state.interfaces.keys() {
            if iface_name.starts_with(input) {
                results.push(iface_name.clone());
            }
        }

        results
    }

    fn help(&self, _state: &DeviceState, _input: &str) -> String {
        "Available commands:\n\
         ip addr { show | add <CIDR> dev <IF> | del <CIDR> dev <IF> }\n\
         ip link set <IF> { up | down }\n\
         ip route { show | add default via <IP> | add <CIDR> via <IP> }\n\
         ip neigh\n\
         ifconfig\n\
         hostname [name]\n\
         clear\n\
         exit\n".to_string()
    }
}

