use std::collections::BTreeMap;
use std::net::Ipv4Addr;
use serde::{Deserialize, Serialize};
use crate::mac::MacAddress;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ArpEntry {
    pub ip: Ipv4Addr,
    pub mac: MacAddress,
    pub interface: String,
    pub is_static: bool,
    pub age_seconds: u32,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct ArpTable {
    entries: BTreeMap<Ipv4Addr, ArpEntry>,
}

impl ArpTable {
    pub fn new() -> Self {
        Self {
            entries: BTreeMap::new(),
        }
    }

    pub fn insert(&mut self, ip: Ipv4Addr, mac: MacAddress, interface: impl Into<String>, is_static: bool) {
        self.entries.insert(
            ip,
            ArpEntry {
                ip,
                mac,
                interface: interface.into(),
                is_static,
                age_seconds: 0,
            },
        );
    }

    pub fn lookup(&self, ip: &Ipv4Addr) -> Option<&MacAddress> {
        self.entries.get(ip).map(|e| &e.mac)
    }

    pub fn remove(&mut self, ip: &Ipv4Addr) -> Option<ArpEntry> {
        self.entries.remove(ip)
    }

    pub fn clear(&mut self) {
        self.entries.clear();
    }

    pub fn iter(&self) -> impl Iterator<Item = &ArpEntry> {
        self.entries.values()
    }
}
