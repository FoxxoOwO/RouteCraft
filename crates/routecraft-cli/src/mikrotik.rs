use std::net::Ipv4Addr;
use routecraft_core::{AdminStatus, DeviceState, Ipv4Cidr, Route};
use crate::traits::{CliEngine, CliResponse};

#[derive(Debug, Clone, Default)]
pub struct MikroTikCliEngine {
    pub current_path: Vec<String>,
}

impl MikroTikCliEngine {
    pub fn new() -> Self {
        Self::default()
    }

    fn render_interface_print(&self, state: &DeviceState) -> String {
        let mut out = String::new();
        out.push_str("Flags: D - dynamic, X - disabled, R - running, S - slave\n");
        out.push_str(" #     NAME                                TYPE       ACTUAL-MTU  MAC-ADDRESS\n");
        for (i, iface) in state.interfaces.values().enumerate() {
            let disabled_flag = if iface.admin_status == AdminStatus::Down { "X" } else { " " };
            let running_flag = if iface.oper_status == routecraft_core::OperStatus::Up { "R" } else { " " };
            let flags = format!("{}{}", disabled_flag, running_flag);

            out.push_str(&format!(
                " {:<2} {:<4} {:<35} {:<10} {:<11} {}\n",
                i, flags, iface.name, "ether", iface.mtu, iface.mac_address
            ));
        }
        out
    }

    fn render_ip_address_print(&self, state: &DeviceState) -> String {
        let mut out = String::new();
        out.push_str("Flags: X - disabled, I - invalid, D - dynamic\n");
        out.push_str(" #   ADDRESS            NETWORK         INTERFACE\n");
        let mut idx = 0;
        for iface in state.interfaces.values() {
            if let Some(cidr) = iface.ipv4_address {
                let disabled_flag = if iface.admin_status == AdminStatus::Down { "X" } else { " " };
                out.push_str(&format!(
                    " {:<2} {:<2} {:<18} {:<15} {}\n",
                    idx, disabled_flag, cidr.to_string(), cidr.network_address(), iface.name
                ));
                idx += 1;
            }
        }
        out
    }

    fn render_ip_route_print(&self, state: &DeviceState) -> String {
        let mut out = String::new();
        out.push_str("Flags: X - disabled, A - active, D - dynamic, C - connect, S - static\n");
        out.push_str(" #      DST-ADDRESS        GATEWAY         DISTANCE\n");
        for (i, route) in state.routing_table.iter().enumerate() {
            let type_flag = match route.route_type {
                routecraft_core::RouteType::Connected => "ADC",
                routecraft_core::RouteType::Static => "A S",
                _ => "   ",
            };
            let gw = route
                .next_hop
                .map(|ip| ip.to_string())
                .unwrap_or_else(|| route.interface.clone());

            out.push_str(&format!(
                " {:<2} {:<4} {:<18} {:<15} {}\n",
                i, type_flag, route.destination.to_string(), gw, route.admin_distance
            ));
        }
        out
    }

    fn render_export(&self, state: &DeviceState) -> String {
        let mut out = String::new();
        out.push_str("# RouterOS 7.15\n# model = RouteCraft Virtual\n");
        out.push_str(&format!("/system identity set name={}\n", state.hostname));

        let mut ip_addrs = Vec::new();
        for iface in state.interfaces.values() {
            if let Some(cidr) = iface.ipv4_address {
                let disabled_str = if iface.admin_status == AdminStatus::Down { " disabled=yes" } else { "" };
                ip_addrs.push(format!(
                    "/ip address add address={} interface={}{}\n",
                    cidr, iface.name, disabled_str
                ));
            }
        }

        if !ip_addrs.is_empty() {
            out.push_str(&ip_addrs.join(""));
        }

        for route in state.routing_table.iter() {
            if route.route_type == routecraft_core::RouteType::Static {
                if let Some(next_hop) = route.next_hop {
                    out.push_str(&format!(
                        "/ip route add dst-address={} gateway={}\n",
                        route.destination, next_hop
                    ));
                }
            }
        }

        out
    }
}

impl CliEngine for MikroTikCliEngine {
    fn prompt(&self, state: &DeviceState) -> String {
        if self.current_path.is_empty() {
            format!("[admin@{}] > ", state.hostname)
        } else {
            format!("[admin@{}] /{}> ", state.hostname, self.current_path.join("/"))
        }
    }

    fn execute(&mut self, state: &mut DeviceState, command: &str) -> CliResponse {
        let trimmed = command.trim();
        if trimmed.is_empty() {
            return CliResponse::empty();
        }

        if trimmed == ".." {
            self.current_path.pop();
            return CliResponse::empty();
        }

        if trimmed == "/" {
            self.current_path.clear();
            return CliResponse::empty();
        }

        let full_cmd = if trimmed.starts_with('/') {
            trimmed.to_string()
        } else if !self.current_path.is_empty() {
            format!("/{} {}", self.current_path.join("/"), trimmed)
        } else {
            format!("/{}", trimmed)
        };

        let mut path_tokens = Vec::new();
        let mut kv_tokens = Vec::new();

        for part in full_cmd.split_whitespace() {
            if part.contains('=') {
                kv_tokens.push(part);
            } else {
                path_tokens.push(part);
            }
        }

        if path_tokens.is_empty() {
            return CliResponse::empty();
        }

        // Normalize path: e.g. ["/ip", "address", "print"] -> "/ip address print"
        // Also support slash-separated: "/ip/address/print"
        let raw_path = path_tokens.join(" ");
        let normalized = raw_path
            .replace('/', " ")
            .split_whitespace()
            .collect::<Vec<_>>()
            .join(" ");

        match normalized.as_str() {
            "system identity print" => {
                CliResponse::ok(format!("  name: \"{}\"\n", state.hostname))
            }
            "system identity set" => {
                for part in kv_tokens {
                    if let Some(val) = part.strip_prefix("name=") {
                        state.hostname = val.trim_matches('"').to_string();
                    }
                }
                CliResponse::empty()
            }
            "interface print" => {
                CliResponse::ok(self.render_interface_print(state))
            }
            "ip address print" => {
                CliResponse::ok(self.render_ip_address_print(state))
            }
            "ip address add" => {
                let mut target_addr: Option<Ipv4Cidr> = None;
                let mut target_iface: Option<String> = None;

                for part in kv_tokens {
                    if let Some(val) = part.strip_prefix("address=") {
                        if let Ok(cidr) = val.parse::<Ipv4Cidr>() {
                            target_addr = Some(cidr);
                        }
                    } else if let Some(val) = part.strip_prefix("interface=") {
                        target_iface = Some(val.to_string());
                    }
                }

                if let (Some(addr), Some(iface_name)) = (target_addr, target_iface) {
                    if let Some(canonical) = state.find_interface_name(&iface_name) {
                        let _ = state.set_interface_ip(&canonical, Some(addr));
                        // In RouterOS, adding an address enables the interface by default
                        let _ = state.set_interface_admin_status(&canonical, AdminStatus::Up);
                        CliResponse::empty()
                    } else {
                        CliResponse::ok(format!("failure: interface <{}> not found\n", iface_name))
                    }
                } else {
                    CliResponse::ok("failure: address and interface required\n")
                }
            }
            "ip route print" => {
                CliResponse::ok(self.render_ip_route_print(state))
            }
            "ip route add" => {
                let mut dst: Option<Ipv4Cidr> = None;
                let mut gateway: Option<Ipv4Addr> = None;

                for part in kv_tokens {
                    if let Some(val) = part.strip_prefix("dst-address=") {
                        if let Ok(cidr) = val.parse::<Ipv4Cidr>() {
                            dst = Some(cidr);
                        }
                    } else if let Some(val) = part.strip_prefix("gateway=") {
                        if let Ok(ip) = val.parse::<Ipv4Addr>() {
                            gateway = Some(ip);
                        }
                    }
                }

                if let (Some(dest), Some(gw)) = (dst, gateway) {
                    let route = Route::new_static(dest, Some(gw), "", 1);
                    state.routing_table.add_route(route);
                    CliResponse::empty()
                } else {
                    CliResponse::ok("failure: dst-address and gateway required\n")
                }
            }
            "export" => CliResponse::ok(self.render_export(state)),
            "quit" => CliResponse::exit(),
            // Navigation into submenus
            "ip" => {
                self.current_path = vec!["ip".to_string()];
                CliResponse::empty()
            }
            "ip address" => {
                self.current_path = vec!["ip".to_string(), "address".to_string()];
                CliResponse::empty()
            }
            "ip route" => {
                self.current_path = vec!["ip".to_string(), "route".to_string()];
                CliResponse::empty()
            }
            "interface" => {
                self.current_path = vec!["interface".to_string()];
                CliResponse::empty()
            }
            _ => CliResponse::ok(format!("bad command name {}\n", trimmed)),
        }
    }

    fn complete(&self, _state: &DeviceState, input: &str) -> Vec<String> {
        let commands = vec![
            "/interface print",
            "/ip address print",
            "/ip address add",
            "/ip route print",
            "/ip route add",
            "/system identity set",
            "/system identity print",
            "/export",
            "/quit",
        ];

        commands
            .into_iter()
            .filter(|c| c.starts_with(input))
            .map(|s| s.to_string())
            .collect()
    }

    fn help(&self, _state: &DeviceState, _input: &str) -> String {
        ".. -- go up one level\n/  -- go to root\nprint -- show configuration table\nset -- change parameter\nadd -- add new item\nexport -- display configuration script\n".to_string()
    }
}
