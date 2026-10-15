use std::fmt;
use std::net::Ipv4Addr;
use std::str::FromStr;
use serde::{Deserialize, Serialize};
use crate::error::DeviceError;

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
pub struct Ipv4Cidr {
    pub ip: Ipv4Addr,
    pub prefix_len: u8,
}

impl Ipv4Cidr {
    pub fn new(ip: Ipv4Addr, prefix_len: u8) -> Result<Self, DeviceError> {
        if prefix_len > 32 {
            return Err(DeviceError::InvalidSubnetMask(format!("/{}", prefix_len)));
        }
        Ok(Self { ip, prefix_len })
    }

    pub fn from_ip_and_mask(ip: Ipv4Addr, mask: Ipv4Addr) -> Result<Self, DeviceError> {
        let prefix_len = mask_to_prefix_len(mask)?;
        Ok(Self { ip, prefix_len })
    }

    pub fn mask(&self) -> Ipv4Addr {
        prefix_len_to_mask(self.prefix_len)
    }

    pub fn network_address(&self) -> Ipv4Addr {
        let ip_u32 = u32::from(self.ip);
        let mask_u32 = u32::from(self.mask());
        Ipv4Addr::from(ip_u32 & mask_u32)
    }

    pub fn broadcast_address(&self) -> Ipv4Addr {
        let ip_u32 = u32::from(self.ip);
        let mask_u32 = u32::from(self.mask());
        Ipv4Addr::from(ip_u32 | (!mask_u32))
    }

    pub fn contains(&self, other_ip: Ipv4Addr) -> bool {
        let other_u32 = u32::from(other_ip);
        let mask_u32 = u32::from(self.mask());
        let net_u32 = u32::from(self.network_address());
        (other_u32 & mask_u32) == net_u32
    }
}

pub fn prefix_len_to_mask(prefix_len: u8) -> Ipv4Addr {
    if prefix_len == 0 {
        return Ipv4Addr::new(0, 0, 0, 0);
    }
    let mask_u32 = !0u32 << (32 - prefix_len);
    Ipv4Addr::from(mask_u32)
}

pub fn mask_to_prefix_len(mask: Ipv4Addr) -> Result<u8, DeviceError> {
    let mask_u32 = u32::from(mask);
    let leading_ones = mask_u32.leading_ones();
    let trailing_zeros = mask_u32.trailing_zeros();

    if leading_ones + trailing_zeros != 32 {
        return Err(DeviceError::InvalidSubnetMask(mask.to_string()));
    }

    Ok(leading_ones as u8)
}

impl fmt::Display for Ipv4Cidr {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}/{}", self.ip, self.prefix_len)
    }
}

impl FromStr for Ipv4Cidr {
    type Err = DeviceError;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        let parts: Vec<&str> = s.split('/').collect();
        if parts.len() != 2 {
            return Err(DeviceError::InvalidIpAddress(s.to_string()));
        }

        let ip = parts[0]
            .parse::<Ipv4Addr>()
            .map_err(|_| DeviceError::InvalidIpAddress(parts[0].to_string()))?;

        let prefix_len = parts[1]
            .parse::<u8>()
            .map_err(|_| DeviceError::InvalidSubnetMask(parts[1].to_string()))?;

        Ipv4Cidr::new(ip, prefix_len)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ipv4_cidr_and_mask() {
        let cidr = "192.168.1.50/24".parse::<Ipv4Cidr>().unwrap();
        assert_eq!(cidr.mask(), Ipv4Addr::new(255, 255, 255, 0));
        assert_eq!(cidr.network_address(), Ipv4Addr::new(192, 168, 1, 0));
        assert_eq!(cidr.broadcast_address(), Ipv4Addr::new(192, 168, 1, 255));
        assert!(cidr.contains(Ipv4Addr::new(192, 168, 1, 1)));
        assert!(!cidr.contains(Ipv4Addr::new(192, 168, 2, 1)));

        let from_mask = Ipv4Cidr::from_ip_and_mask(
            Ipv4Addr::new(10, 0, 0, 1),
            Ipv4Addr::new(255, 255, 0, 0),
        ).unwrap();
        assert_eq!(from_mask.prefix_len, 16);
    }
}
