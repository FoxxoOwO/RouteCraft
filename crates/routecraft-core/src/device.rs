use std::collections::BTreeMap;
use serde::{Deserialize, Serialize};
use crate::arp_table::ArpTable;
use crate::error::DeviceError;
use crate::interface::{AdminStatus, Interface, OperStatus};
use crate::ip::Ipv4Cidr;
use crate::mac_table::MacTable;
use crate::routing_table::{Route, RoutingTable};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum DeviceType {
    Router,
    Switch,
    Host,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DeviceState {
    pub id: String,
    pub hostname: String,
    pub device_type: DeviceType,
    pub interfaces: BTreeMap<String, Interface>,
    pub mac_table: MacTable,
    pub arp_table: ArpTable,
    pub routing_table: RoutingTable,
}

impl DeviceState {
    pub fn new(id: impl Into<String>, hostname: impl Into<String>, device_type: DeviceType) -> Self {
        Self {
            id: id.into(),
            hostname: hostname.into(),
            device_type,
            interfaces: BTreeMap::new(),
            mac_table: MacTable::new(),
            arp_table: ArpTable::new(),
            routing_table: RoutingTable::new(),
        }
    }

    pub fn add_interface(&mut self, interface: Interface) {
        self.interfaces.insert(interface.name.clone(), interface);
        self.recalculate_connected_routes();
    }

    /// Fuzzy matching for interface names across Cisco, MikroTik, Linux:
    /// e.g. "gi0/0", "g0/0", "GigabitEthernet0/0"
    /// "fa0/1", "FastEthernet0/1"
    /// "eth0", "ether1"
    pub fn find_interface_name(&self, query: &str) -> Option<String> {
        let q = query.trim().to_lowercase();

        // 1. Exact case-insensitive match
        for name in self.interfaces.keys() {
            if name.to_lowercase() == q {
                return Some(name.clone());
            }
        }

        // 2. Cisco abbreviations:
        // gi0/0 -> GigabitEthernet0/0
        // fa0/1 -> FastEthernet0/1
        // lo0   -> Loopback0
        for name in self.interfaces.keys() {
            let lower = name.to_lowercase();
            if (q.starts_with("gi") && lower.starts_with("gigabitethernet"))
                || (q.starts_with("fa") && lower.starts_with("fastethernet"))
                || (q.starts_with("eth") && lower.starts_with("ethernet"))
                || (q.starts_with("lo") && lower.starts_with("loopback"))
            {
                // Compare trailing port numbers (e.g. "0/0" or "1")
                let q_suffix: String = q.chars().skip_while(|c| c.is_alphabetic()).collect();
                let lower_suffix: String = lower.chars().skip_while(|c| c.is_alphabetic()).collect();
                if q_suffix == lower_suffix {
                    return Some(name.clone());
                }
            }
        }

        None
    }

    pub fn get_interface(&self, name: &str) -> Option<&Interface> {
        self.find_interface_name(name).and_then(|canonical| self.interfaces.get(&canonical))
    }

    pub fn get_interface_mut(&mut self, name: &str) -> Option<&mut Interface> {
        if let Some(canonical) = self.find_interface_name(name) {
            self.interfaces.get_mut(&canonical)
        } else {
            None
        }
    }

    pub fn set_interface_ip(&mut self, name: &str, ip: Option<Ipv4Cidr>) -> Result<(), DeviceError> {
        let canonical = self
            .find_interface_name(name)
            .ok_or_else(|| DeviceError::InterfaceNotFound(name.to_string()))?;

        if let Some(iface) = self.interfaces.get_mut(&canonical) {
            iface.ipv4_address = ip;
        }

        self.recalculate_connected_routes();
        Ok(())
    }

    pub fn set_interface_admin_status(&mut self, name: &str, status: AdminStatus) -> Result<(), DeviceError> {
        let canonical = self
            .find_interface_name(name)
            .ok_or_else(|| DeviceError::InterfaceNotFound(name.to_string()))?;

        if let Some(iface) = self.interfaces.get_mut(&canonical) {
            iface.set_admin_status(status);
        }

        self.recalculate_connected_routes();
        Ok(())
    }

    pub fn set_interface_oper_status(&mut self, name: &str, status: OperStatus) -> Result<(), DeviceError> {
        let canonical = self
            .find_interface_name(name)
            .ok_or_else(|| DeviceError::InterfaceNotFound(name.to_string()))?;

        if let Some(iface) = self.interfaces.get_mut(&canonical) {
            // Can only be oper up if admin is up
            if iface.admin_status == AdminStatus::Up {
                iface.oper_status = status;
            } else {
                iface.oper_status = OperStatus::Down;
            }
        }

        self.recalculate_connected_routes();
        Ok(())
    }

    pub fn recalculate_connected_routes(&mut self) {
        // Clear all connected routes and re-add for all interfaces that are up and have an IP
        self.routing_table.clear_connected_routes();

        for iface in self.interfaces.values() {
            if iface.is_up() {
                if let Some(cidr) = iface.ipv4_address {
                    let network_cidr = Ipv4Cidr {
                        ip: cidr.network_address(),
                        prefix_len: cidr.prefix_len,
                    };
                    self.routing_table.add_route(Route::new_connected(network_cidr, iface.name.clone()));
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use std::net::Ipv4Addr;
    use crate::mac::MacAddress;
    use super::*;

    #[test]
    fn test_device_interface_and_connected_routes() {
        let mut router = DeviceState::new("r1", "Router1", DeviceType::Router);
        let iface = Interface::new("GigabitEthernet0/0", MacAddress([0x52, 0x54, 0x00, 0x12, 0x34, 0x56]));
        router.add_interface(iface);

        // Abbreviated lookup should work
        assert!(router.get_interface("gi0/0").is_some());
        assert!(router.get_interface("Gi0/0").is_some());

        // Configure IP
        let cidr = "192.168.10.1/24".parse::<Ipv4Cidr>().unwrap();
        router.set_interface_ip("gi0/0", Some(cidr)).unwrap();

        // While admin down, no connected route should exist
        assert!(router.routing_table.lookup(Ipv4Addr::new(192, 168, 10, 5)).is_none());

        // Bring interface admin up and oper up (cable plugged in)
        router.set_interface_admin_status("gi0/0", AdminStatus::Up).unwrap();
        router.set_interface_oper_status("gi0/0", OperStatus::Up).unwrap();

        // Now connected route should exist!
        let route = router.routing_table.lookup(Ipv4Addr::new(192, 168, 10, 5)).unwrap();
        assert_eq!(route.destination.to_string(), "192.168.10.0/24");
        assert_eq!(route.interface, "GigabitEthernet0/0");
    }
}
