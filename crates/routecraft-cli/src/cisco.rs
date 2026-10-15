use std::net::Ipv4Addr;
use routecraft_core::{AdminStatus, DeviceState, Ipv4Cidr, Route};
use crate::traits::{CliEngine, CliResponse};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CiscoMode {
    UserExec,
    PrivilegedExec,
    GlobalConfig,
    InterfaceConfig(String),
}

#[derive(Debug, Clone)]
pub struct CiscoCliEngine {
    pub mode: CiscoMode,
}

impl Default for CiscoCliEngine {
    fn default() -> Self {
        Self {
            mode: CiscoMode::UserExec,
        }
    }
}

impl CiscoCliEngine {
    pub fn new() -> Self {
        Self::default()
    }

    fn render_show_ip_interface_brief(&self, state: &DeviceState) -> String {
        let mut out = String::new();
        out.push_str(
            "Interface                  IP-Address      OK? Method Status                Protocol\n",
        );
        for iface in state.interfaces.values() {
            let ip_str = iface
                .ipv4_address
                .map(|c| c.ip.to_string())
                .unwrap_or_else(|| "unassigned".to_string());

            let method = if iface.ipv4_address.is_some() {
                "manual"
            } else {
                "unset"
            };

            let status_str = match iface.admin_status {
                AdminStatus::Up => "up",
                AdminStatus::Down => "administratively down",
            };

            let proto_str = match iface.oper_status {
                routecraft_core::OperStatus::Up => "up",
                routecraft_core::OperStatus::Down => "down",
            };

            out.push_str(&format!(
                "{:<26} {:<15} {:<3} {:<6} {:<21} {:<8}\n",
                iface.name, ip_str, "YES", method, status_str, proto_str
            ));
        }
        out
    }

    fn render_show_ip_route(&self, state: &DeviceState) -> String {
        let mut out = String::new();
        out.push_str("Codes: L - local, C - connected, S - static, R - RIP, M - mobile, B - BGP\n");
        out.push_str("       D - EIGRP, EX - EIGRP external, O - OSPF, IA - OSPF inter area\n\n");
        out.push_str("Gateway of last resort is not set\n\n");

        for route in state.routing_table.iter() {
            let code = route.route_type.cisco_code();
            let net = route.destination.network_address();
            let mask = route.destination.mask();

            if let Some(next_hop) = route.next_hop {
                out.push_str(&format!(
                    "{}    {} {} [1/{}] via {}\n",
                    code, net, mask, route.metric, next_hop
                ));
            } else {
                out.push_str(&format!(
                    "{}    {} {} is directly connected, {}\n",
                    code, net, mask, route.interface
                ));
            }
        }
        out
    }

    fn render_show_running_config(&self, state: &DeviceState) -> String {
        let mut out = String::new();
        out.push_str("Building configuration...\n\n");
        out.push_str("Current configuration : 1024 bytes\n");
        out.push_str("!\n");
        out.push_str("version 15.2\n");
        out.push_str("no service timestamps log datetime msec\n");
        out.push_str("no service password-encryption\n");
        out.push_str("!\n");
        out.push_str(&format!("hostname {}\n", state.hostname));
        out.push_str("!\n");
        out.push_str("ip cef\n");
        out.push_str("no ipv6 cef\n");
        out.push_str("!\n");

        for iface in state.interfaces.values() {
            out.push_str(&format!("interface {}\n", iface.name));
            if let Some(desc) = &iface.description {
                out.push_str(&format!(" description {}\n", desc));
            }
            if let Some(cidr) = iface.ipv4_address {
                out.push_str(&format!(" ip address {} {}\n", cidr.ip, cidr.mask()));
            } else {
                out.push_str(" no ip address\n");
            }

            match iface.admin_status {
                AdminStatus::Up => out.push_str(" no shutdown\n"),
                AdminStatus::Down => out.push_str(" shutdown\n"),
            }
            out.push_str("!\n");
        }

        // Static routes
        for route in state.routing_table.iter() {
            if route.route_type == routecraft_core::RouteType::Static {
                if let Some(next_hop) = route.next_hop {
                    out.push_str(&format!(
                        "ip route {} {} {}\n",
                        route.destination.network_address(),
                        route.destination.mask(),
                        next_hop
                    ));
                }
            }
        }

        out.push_str("end\n");
        out
    }
}

impl CliEngine for CiscoCliEngine {
    fn prompt(&self, state: &DeviceState) -> String {
        let h = &state.hostname;
        match &self.mode {
            CiscoMode::UserExec => format!("{}> ", h),
            CiscoMode::PrivilegedExec => format!("{}# ", h),
            CiscoMode::GlobalConfig => format!("{}(config)# ", h),
            CiscoMode::InterfaceConfig(_) => format!("{}(config-if)# ", h),
        }
    }

    fn execute(&mut self, state: &mut DeviceState, command: &str) -> CliResponse {
        let trimmed = command.trim();
        if trimmed.is_empty() {
            return CliResponse::empty();
        }

        let words: Vec<&str> = trimmed.split_whitespace().collect();
        let cmd = words[0].to_lowercase();

        match &self.mode {
            CiscoMode::UserExec => match cmd.as_str() {
                "en" | "enable" => {
                    self.mode = CiscoMode::PrivilegedExec;
                    CliResponse::empty()
                }
                "exit" | "quit" => CliResponse::exit(),
                "ping" => {
                    if words.len() > 1 {
                        CliResponse::ok(format!(
                            "Type escape sequence to abort.\nSending 5, 100-byte ICMP Echos to {}, timeout is 2 seconds:\n.....\nSuccess rate is 0 percent (0/5)\n",
                            words[1]
                        ))
                    } else {
                        CliResponse::ok("% Incomplete command.\n")
                    }
                }
                "sh" | "show" => {
                    if words.len() >= 4 && words[1..4] == ["ip", "int", "br"]
                        || words.len() >= 4 && words[1..4] == ["ip", "interface", "brief"]
                    {
                        CliResponse::ok(self.render_show_ip_interface_brief(state))
                    } else if words.len() >= 3 && words[1..3] == ["ip", "route"]
                        || words.len() >= 3 && words[1..3] == ["ip", "ro"]
                    {
                        CliResponse::ok(self.render_show_ip_route(state))
                    } else {
                        CliResponse::ok("% Incomplete command.\n")
                    }
                }
                _ => CliResponse::ok(format!("% Unknown command or computer name, or unable to find computer address\n")),
            },

            CiscoMode::PrivilegedExec => match cmd.as_str() {
                "disable" => {
                    self.mode = CiscoMode::UserExec;
                    CliResponse::empty()
                }
                "conf" | "configure" => {
                    if words.len() > 1 && (words[1] == "t" || words[1] == "terminal") {
                        self.mode = CiscoMode::GlobalConfig;
                        CliResponse::ok("Enter configuration commands, one per line.  End with CNTL/Z.\n")
                    } else {
                        CliResponse::ok("% Incomplete command.\n")
                    }
                }
                "sh" | "show" => {
                    if words.len() >= 2 && (words[1] == "run" || words[1] == "running-config") {
                        CliResponse::ok(self.render_show_running_config(state))
                    } else if words.len() >= 4
                        && (words[1..4] == ["ip", "int", "br"]
                            || words[1..4] == ["ip", "interface", "brief"])
                    {
                        CliResponse::ok(self.render_show_ip_interface_brief(state))
                    } else if words.len() >= 3
                        && (words[1..3] == ["ip", "route"] || words[1..3] == ["ip", "ro"])
                    {
                        CliResponse::ok(self.render_show_ip_route(state))
                    } else {
                        CliResponse::ok("% Incomplete command.\n")
                    }
                }
                "exit" | "quit" => {
                    self.mode = CiscoMode::UserExec;
                    CliResponse::empty()
                }
                _ => CliResponse::ok("% Invalid input detected at '^' marker.\n"),
            },

            CiscoMode::GlobalConfig => match cmd.as_str() {
                "exit" => {
                    self.mode = CiscoMode::PrivilegedExec;
                    CliResponse::empty()
                }
                "end" => {
                    self.mode = CiscoMode::PrivilegedExec;
                    CliResponse::empty()
                }
                "hostname" => {
                    if words.len() > 1 {
                        state.hostname = words[1].to_string();
                        CliResponse::empty()
                    } else {
                        CliResponse::ok("% Incomplete command.\n")
                    }
                }
                "int" | "interface" => {
                    if words.len() > 1 {
                        let query = words[1];
                        if let Some(canonical) = state.find_interface_name(query) {
                            self.mode = CiscoMode::InterfaceConfig(canonical);
                            CliResponse::empty()
                        } else {
                            CliResponse::ok(format!("% Invalid interface {}\n", query))
                        }
                    } else {
                        CliResponse::ok("% Incomplete command.\n")
                    }
                }
                "ip" => {
                    if words.len() >= 5 && words[1] == "route" {
                        let net_res = words[2].parse::<Ipv4Addr>();
                        let mask_res = words[3].parse::<Ipv4Addr>();
                        let next_hop_res = words[4].parse::<Ipv4Addr>();

                        match (net_res, mask_res, next_hop_res) {
                            (Ok(net), Ok(mask), Ok(next_hop)) => {
                                match Ipv4Cidr::from_ip_and_mask(net, mask) {
                                    Ok(dest) => {
                                        let route = Route::new_static(dest, Some(next_hop), "", 1);
                                        state.routing_table.add_route(route);
                                        CliResponse::empty()
                                    }
                                    Err(_) => CliResponse::ok("% Invalid subnet mask\n"),
                                }
                            }
                            _ => CliResponse::ok("% Invalid route parameters\n"),
                        }
                    } else {
                        CliResponse::ok("% Incomplete command.\n")
                    }
                }
                "no" => {
                    if words.len() >= 5 && words[1..3] == ["ip", "route"] {
                        if let (Ok(net), Ok(mask)) = (words[3].parse::<Ipv4Addr>(), words[4].parse::<Ipv4Addr>()) {
                            if let Ok(dest) = Ipv4Cidr::from_ip_and_mask(net, mask) {
                                state.routing_table.remove_route(&dest);
                                return CliResponse::empty();
                            }
                        }
                        CliResponse::ok("% Invalid route parameters\n")
                    } else {
                        CliResponse::ok("% Incomplete command.\n")
                    }
                }
                "do" => {
                    if words.len() > 1 {
                        let subcmd = words[1..].join(" ");
                        let prev_mode = self.mode.clone();
                        self.mode = CiscoMode::PrivilegedExec;
                        let res = self.execute(state, &subcmd);
                        self.mode = prev_mode;
                        res
                    } else {
                        CliResponse::ok("% Incomplete command.\n")
                    }
                }
                _ => CliResponse::ok("% Invalid input detected at '^' marker.\n"),
            },

            CiscoMode::InterfaceConfig(iface_name) => {
                let current_iface = iface_name.clone();
                match cmd.as_str() {
                    "exit" => {
                        self.mode = CiscoMode::GlobalConfig;
                        CliResponse::empty()
                    }
                    "end" => {
                        self.mode = CiscoMode::PrivilegedExec;
                        CliResponse::empty()
                    }
                    "ip" => {
                        if words.len() >= 4 && words[1] == "address" {
                            let ip_res = words[2].parse::<Ipv4Addr>();
                            let mask_res = words[3].parse::<Ipv4Addr>();
                            match (ip_res, mask_res) {
                                (Ok(ip), Ok(mask)) => {
                                    match Ipv4Cidr::from_ip_and_mask(ip, mask) {
                                        Ok(cidr) => {
                                            let _ = state.set_interface_ip(&current_iface, Some(cidr));
                                            CliResponse::empty()
                                        }
                                        Err(_) => CliResponse::ok("% Bad mask for IP address\n"),
                                    }
                                }
                                _ => CliResponse::ok("% Invalid IP address or mask\n"),
                            }
                        } else {
                            CliResponse::ok("% Incomplete command.\n")
                        }
                    }
                    "no" => {
                        if words.len() >= 2 && (words[1] == "shut" || words[1] == "shutdown") {
                            let _ = state.set_interface_admin_status(&current_iface, AdminStatus::Up);
                            CliResponse::ok(format!(
                                "%LINK-3-UPDOWN: Interface {}, changed state to up\n",
                                current_iface
                            ))
                        } else if words.len() >= 3 && words[1..3] == ["ip", "address"] {
                            let _ = state.set_interface_ip(&current_iface, None);
                            CliResponse::empty()
                        } else {
                            CliResponse::ok("% Incomplete command.\n")
                        }
                    }
                    "shutdown" | "shut" => {
                        let _ = state.set_interface_admin_status(&current_iface, AdminStatus::Down);
                        CliResponse::ok(format!(
                            "%LINK-5-CHANGED: Interface {}, changed state to administratively down\n",
                            current_iface
                        ))
                    }
                    "do" => {
                        if words.len() > 1 {
                            let subcmd = words[1..].join(" ");
                            let prev_mode = self.mode.clone();
                            self.mode = CiscoMode::PrivilegedExec;
                            let res = self.execute(state, &subcmd);
                            self.mode = prev_mode;
                            res
                        } else {
                            CliResponse::ok("% Incomplete command.\n")
                        }
                    }
                    _ => CliResponse::ok("% Invalid input detected at '^' marker.\n"),
                }
            }
        }
    }

    fn complete(&self, _state: &DeviceState, input: &str) -> Vec<String> {
        let commands = match &self.mode {
            CiscoMode::UserExec => vec!["enable", "exit", "ping", "show"],
            CiscoMode::PrivilegedExec => vec!["configure", "disable", "exit", "ping", "show"],
            CiscoMode::GlobalConfig => vec!["do", "end", "exit", "hostname", "interface", "ip", "no"],
            CiscoMode::InterfaceConfig(_) => vec!["description", "do", "end", "exit", "ip", "no", "shutdown"],
        };

        commands
            .into_iter()
            .filter(|c| c.starts_with(input))
            .map(|s| s.to_string())
            .collect()
    }

    fn help(&self, _state: &DeviceState, _input: &str) -> String {
        match &self.mode {
            CiscoMode::UserExec => "  enable    Turn on privileged commands\n  exit      Exit from the EXEC\n  ping      Send echo messages\n  show      Show running system information\n".to_string(),
            CiscoMode::PrivilegedExec => "  configure Enter configuration mode\n  disable   Turn off privileged commands\n  exit      Exit from the EXEC\n  show      Show running system information\n".to_string(),
            CiscoMode::GlobalConfig => "  hostname  Set system's network name\n  interface Select an interface to configure\n  ip        Global IP configuration subcommands\n  no        Negate a command or set its defaults\n  exit      Exit from configure mode\n".to_string(),
            CiscoMode::InterfaceConfig(_) => "  ip        Interface Internet Protocol config commands\n  shutdown  Shutdown the selected interface\n  no        Negate a command or set its defaults\n  exit      Exit from interface configuration mode\n".to_string(),
        }
    }
}
