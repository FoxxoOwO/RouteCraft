use std::fmt;
use std::str::FromStr;
use serde::{Deserialize, Serialize};
use crate::error::DeviceError;

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
pub struct MacAddress(pub [u8; 6]);

impl MacAddress {
    pub const ZERO: Self = MacAddress([0, 0, 0, 0, 0, 0]);
    pub const BROADCAST: Self = MacAddress([0xff, 0xff, 0xff, 0xff, 0xff, 0xff]);

    pub fn new(bytes: [u8; 6]) -> Self {
        MacAddress(bytes)
    }

    pub fn is_broadcast(&self) -> bool {
        self.0 == [0xff, 0xff, 0xff, 0xff, 0xff, 0xff]
    }

    pub fn is_multicast(&self) -> bool {
        (self.0[0] & 0x01) == 0x01 && !self.is_broadcast()
    }

    pub fn is_unicast(&self) -> bool {
        (self.0[0] & 0x01) == 0x00 && *self != Self::ZERO
    }

    pub fn to_cisco_string(&self) -> String {
        format!(
            "{:02x}{:02x}.{:02x}{:02x}.{:02x}{:02x}",
            self.0[0], self.0[1], self.0[2], self.0[3], self.0[4], self.0[5]
        )
    }
}

impl fmt::Display for MacAddress {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "{:02x}:{:02x}:{:02x}:{:02x}:{:02x}:{:02x}",
            self.0[0], self.0[1], self.0[2], self.0[3], self.0[4], self.0[5]
        )
    }
}

impl FromStr for MacAddress {
    type Err = DeviceError;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        let clean = s.trim();

        // Check if Cisco dot notation: "001a.2b3c.4d5e"
        if clean.contains('.') {
            let parts: Vec<&str> = clean.split('.').collect();
            if parts.len() == 3 && parts.iter().all(|p| p.len() == 4) {
                let mut bytes = [0u8; 6];
                for (i, part) in parts.iter().enumerate() {
                    let hex_val = u16::from_str_radix(part, 16)
                        .map_err(|_| DeviceError::InvalidMacAddress(s.to_string()))?;
                    bytes[i * 2] = (hex_val >> 8) as u8;
                    bytes[i * 2 + 1] = (hex_val & 0xff) as u8;
                }
                return Ok(MacAddress(bytes));
            }
        }

        // Check colon or dash notation
        let delimiter = if clean.contains(':') {
            ':'
        } else if clean.contains('-') {
            '-'
        } else {
            return Err(DeviceError::InvalidMacAddress(s.to_string()));
        };

        let parts: Vec<&str> = clean.split(delimiter).collect();
        if parts.len() != 6 {
            return Err(DeviceError::InvalidMacAddress(s.to_string()));
        }

        let mut bytes = [0u8; 6];
        for (i, part) in parts.iter().enumerate() {
            bytes[i] = u8::from_str_radix(part, 16)
                .map_err(|_| DeviceError::InvalidMacAddress(s.to_string()))?;
        }

        Ok(MacAddress(bytes))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_mac_parsing_and_formats() {
        let mac1 = "00:1a:2b:3c:4d:5e".parse::<MacAddress>().unwrap();
        let mac2 = "001a.2b3c.4d5e".parse::<MacAddress>().unwrap();
        let mac3 = "00-1A-2B-3C-4D-5E".parse::<MacAddress>().unwrap();

        assert_eq!(mac1, mac2);
        assert_eq!(mac2, mac3);
        assert_eq!(mac1.to_string(), "00:1a:2b:3c:4d:5e");
        assert_eq!(mac1.to_cisco_string(), "001a.2b3c.4d5e");
        assert!(mac1.is_unicast());
        assert!(!mac1.is_broadcast());

        let bcast = "ff:ff:ff:ff:ff:ff".parse::<MacAddress>().unwrap();
        assert!(bcast.is_broadcast());
    }
}
