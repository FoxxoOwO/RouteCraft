use serde::{Deserialize, Serialize};
use crate::ip::Ipv4Cidr;
use crate::mac::MacAddress;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum AdminStatus {
    Up,
    Down,
}

impl std::fmt::Display for AdminStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AdminStatus::Up => write!(f, "up"),
            AdminStatus::Down => write!(f, "administratively down"),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum OperStatus {
    Up,
    Down,
}

impl std::fmt::Display for OperStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            OperStatus::Up => write!(f, "up"),
            OperStatus::Down => write!(f, "down"),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Duplex {
    Auto,
    Full,
    Half,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum SwitchportMode {
    Routed,
    Access(u16),
    Trunk {
        native_vlan: u16,
        allowed_vlans: Vec<u16>,
    },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Interface {
    pub name: String,
    pub mac_address: MacAddress,
    pub ipv4_address: Option<Ipv4Cidr>,
    pub admin_status: AdminStatus,
    pub oper_status: OperStatus,
    pub mtu: u32,
    pub switchport_mode: SwitchportMode,
    pub encapsulation_vlan: Option<u16>,
    pub parent_interface: Option<String>,
    pub speed_mbps: u32,
    pub duplex: Duplex,
    pub description: Option<String>,
}

impl Interface {
    pub fn new(name: impl Into<String>, mac_address: MacAddress) -> Self {
        let name_str = name.into();
        let is_sub = name_str.contains('.');
        let parent = if is_sub {
            name_str.split('.').next().map(|s| s.to_string())
        } else {
            None
        };

        Self {
            name: name_str,
            mac_address,
            ipv4_address: None,
            admin_status: AdminStatus::Down,
            oper_status: OperStatus::Down,
            mtu: 1500,
            switchport_mode: SwitchportMode::Access(1),
            encapsulation_vlan: None,
            parent_interface: parent,
            speed_mbps: 1000,
            duplex: Duplex::Auto,
            description: None,
        }
    }

    pub fn new_switchport(name: impl Into<String>, mac_address: MacAddress) -> Self {
        let mut iface = Self::new(name, mac_address);
        iface.admin_status = AdminStatus::Up;
        iface.oper_status = OperStatus::Up;
        iface.switchport_mode = SwitchportMode::Access(1);
        iface
    }

    pub fn is_up(&self) -> bool {
        self.admin_status == AdminStatus::Up && self.oper_status == OperStatus::Up
    }

    pub fn set_admin_status(&mut self, status: AdminStatus) {
        self.admin_status = status;
        // If admin down, oper status is always down
        if status == AdminStatus::Down {
            self.oper_status = OperStatus::Down;
        }
    }
}
