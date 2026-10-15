use std::collections::BTreeMap;
use serde::{Deserialize, Serialize};
use crate::mac::MacAddress;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct MacTableEntry {
    pub mac: MacAddress,
    pub port: String,
    pub vlan: u16,
    pub is_static: bool,
    pub age_seconds: u32,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct MacTable {
    entries: BTreeMap<MacAddress, MacTableEntry>,
}

impl MacTable {
    pub fn new() -> Self {
        Self {
            entries: BTreeMap::new(),
        }
    }

    pub fn learn(&mut self, mac: MacAddress, port: impl Into<String>, vlan: u16) {
        if mac.is_broadcast() || mac.is_multicast() {
            return;
        }

        let port = port.into();
        self.entries.insert(
            mac,
            MacTableEntry {
                mac,
                port,
                vlan,
                is_static: false,
                age_seconds: 0,
            },
        );
    }

    pub fn lookup(&self, mac: &MacAddress, vlan: u16) -> Option<&str> {
        self.entries
            .get(mac)
            .filter(|e| e.vlan == vlan)
            .map(|e| e.port.as_str())
    }

    pub fn clear(&mut self) {
        self.entries.clear();
    }

    pub fn iter(&self) -> impl Iterator<Item = &MacTableEntry> {
        self.entries.values()
    }
}
