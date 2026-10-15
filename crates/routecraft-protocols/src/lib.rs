use std::fmt;
use std::net::Ipv4Addr;
use serde::{Deserialize, Serialize};
use routecraft_core::MacAddress;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[repr(u16)]
pub enum EtherType {
    Ipv4 = 0x0800,
    Arp = 0x0806,
    Dot1Q = 0x8100,
    Ipv6 = 0x86DD,
}

impl TryFrom<u16> for EtherType {
    type Error = u16;

    fn try_from(val: u16) -> Result<Self, Self::Error> {
        match val {
            0x0800 => Ok(EtherType::Ipv4),
            0x0806 => Ok(EtherType::Arp),
            0x8100 => Ok(EtherType::Dot1Q),
            0x86DD => Ok(EtherType::Ipv6),
            other => Err(other),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct EthernetFrame {
    pub dst_mac: MacAddress,
    pub src_mac: MacAddress,
    pub ethertype: EtherType,
    pub payload: PacketPayload,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum PacketPayload {
    Arp(ArpPacket),
    Ipv4(Ipv4Packet),
    Raw(Vec<u8>),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[repr(u16)]
pub enum ArpOperation {
    Request = 1,
    Reply = 2,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ArpPacket {
    pub operation: ArpOperation,
    pub sender_mac: MacAddress,
    pub sender_ip: Ipv4Addr,
    pub target_mac: MacAddress,
    pub target_ip: Ipv4Addr,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[repr(u8)]
pub enum IpProtocol {
    Icmp = 1,
    Tcp = 6,
    Udp = 17,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Ipv4Packet {
    pub src_ip: Ipv4Addr,
    pub dst_ip: Ipv4Addr,
    pub protocol: IpProtocol,
    pub ttl: u8,
    pub payload: Ipv4Payload,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum Ipv4Payload {
    Icmp(IcmpPacket),
    Raw(Vec<u8>),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum IcmpType {
    EchoReply,
    DestinationUnreachable,
    EchoRequest,
    TimeExceeded,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct IcmpPacket {
    pub icmp_type: IcmpType,
    pub code: u8,
    pub identifier: u16,
    pub sequence_number: u16,
    pub data: Vec<u8>,
}

impl EthernetFrame {
    pub fn new_arp_request(src_mac: MacAddress, sender_ip: Ipv4Addr, target_ip: Ipv4Addr) -> Self {
        Self {
            dst_mac: MacAddress::BROADCAST,
            src_mac,
            ethertype: EtherType::Arp,
            payload: PacketPayload::Arp(ArpPacket {
                operation: ArpOperation::Request,
                sender_mac: src_mac,
                sender_ip,
                target_mac: MacAddress::ZERO,
                target_ip,
            }),
        }
    }

    pub fn new_arp_reply(
        src_mac: MacAddress,
        sender_ip: Ipv4Addr,
        dst_mac: MacAddress,
        target_ip: Ipv4Addr,
    ) -> Self {
        Self {
            dst_mac,
            src_mac,
            ethertype: EtherType::Arp,
            payload: PacketPayload::Arp(ArpPacket {
                operation: ArpOperation::Reply,
                sender_mac: src_mac,
                sender_ip,
                target_mac: dst_mac,
                target_ip,
            }),
        }
    }

    pub fn new_icmp_echo_request(
        src_mac: MacAddress,
        dst_mac: MacAddress,
        src_ip: Ipv4Addr,
        dst_ip: Ipv4Addr,
        seq: u16,
        id: u16,
    ) -> Self {
        Self {
            dst_mac,
            src_mac,
            ethertype: EtherType::Ipv4,
            payload: PacketPayload::Ipv4(Ipv4Packet {
                src_ip,
                dst_ip,
                protocol: IpProtocol::Icmp,
                ttl: 64,
                payload: Ipv4Payload::Icmp(IcmpPacket {
                    icmp_type: IcmpType::EchoRequest,
                    code: 0,
                    identifier: id,
                    sequence_number: seq,
                    data: b"RouteCraft-Ping".to_vec(),
                }),
            }),
        }
    }

    pub fn new_icmp_echo_reply(
        src_mac: MacAddress,
        dst_mac: MacAddress,
        src_ip: Ipv4Addr,
        dst_ip: Ipv4Addr,
        seq: u16,
        id: u16,
        ttl: u8,
    ) -> Self {
        Self {
            dst_mac,
            src_mac,
            ethertype: EtherType::Ipv4,
            payload: PacketPayload::Ipv4(Ipv4Packet {
                src_ip,
                dst_ip,
                protocol: IpProtocol::Icmp,
                ttl,
                payload: Ipv4Payload::Icmp(IcmpPacket {
                    icmp_type: IcmpType::EchoReply,
                    code: 0,
                    identifier: id,
                    sequence_number: seq,
                    data: b"RouteCraft-Ping".to_vec(),
                }),
            }),
        }
    }
}

impl fmt::Display for EthernetFrame {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "Eth [{} -> {} | {:?}]",
            self.src_mac, self.dst_mac, self.ethertype
        )?;
        match &self.payload {
            PacketPayload::Arp(arp) => write!(
                f,
                " ARP: {:?} Who has {}? Tell {}",
                arp.operation, arp.target_ip, arp.sender_ip
            ),
            PacketPayload::Ipv4(ip) => {
                write!(f, " IPv4: {} -> {} [{:?}]", ip.src_ip, ip.dst_ip, ip.protocol)?;
                if let Ipv4Payload::Icmp(icmp) = &ip.payload {
                    write!(f, " ICMP: {:?} (seq={})", icmp.icmp_type, icmp.sequence_number)?;
                }
                Ok(())
            }
            PacketPayload::Raw(raw) => write!(f, " Raw: {} bytes", raw.len()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ethernet_and_arp_creation() {
        let mac1 = MacAddress([0x00, 0x11, 0x22, 0x33, 0x44, 0x55]);
        let ip1 = Ipv4Addr::new(192, 168, 1, 10);
        let ip2 = Ipv4Addr::new(192, 168, 1, 20);

        let frame = EthernetFrame::new_arp_request(mac1, ip1, ip2);
        assert!(frame.dst_mac.is_broadcast());
        assert_eq!(frame.ethertype, EtherType::Arp);

        if let PacketPayload::Arp(arp) = &frame.payload {
            assert_eq!(arp.operation, ArpOperation::Request);
            assert_eq!(arp.target_ip, ip2);
        } else {
            panic!("Expected ARP payload");
        }
    }
}
