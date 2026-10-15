pub mod cisco;
pub mod mikrotik;
pub mod traits;

pub use cisco::{CiscoCliEngine, CiscoMode};
pub use mikrotik::MikroTikCliEngine;
pub use traits::{CliEngine, CliResponse};

#[cfg(test)]
mod tests {
    use routecraft_core::{AdminStatus, DeviceState, DeviceType, Interface, MacAddress};
    use super::*;

    #[test]
    fn test_cross_vendor_cisco_and_mikrotik_cli_sync() {
        // Create a neutral device state
        let mut device = DeviceState::new("router-1", "Router1", DeviceType::Router);
        device.add_interface(Interface::new(
            "GigabitEthernet0/0",
            MacAddress([0x52, 0x54, 0x00, 0x01, 0x02, 0x03]),
        ));
        device.add_interface(Interface::new(
            "GigabitEthernet0/1",
            MacAddress([0x52, 0x54, 0x00, 0x01, 0x02, 0x04]),
        ));

        let mut cisco = CiscoCliEngine::new();
        let mut mikrotik = MikroTikCliEngine::new();

        // 1. Initial prompts
        assert_eq!(cisco.prompt(&device), "Router1> ");
        assert_eq!(mikrotik.prompt(&device), "[admin@Router1] > ");

        // 2. Cisco session: enable -> conf t -> change hostname -> configure Gi0/0 IP -> no shut
        cisco.execute(&mut device, "enable");
        assert_eq!(cisco.prompt(&device), "Router1# ");

        cisco.execute(&mut device, "conf t");
        assert_eq!(cisco.prompt(&device), "Router1(config)# ");

        cisco.execute(&mut device, "hostname Core-Router");
        assert_eq!(device.hostname, "Core-Router");
        assert_eq!(cisco.prompt(&device), "Core-Router(config)# ");
        // Notice MikroTik prompt immediately updates to the new hostname!
        assert_eq!(mikrotik.prompt(&device), "[admin@Core-Router] > ");

        cisco.execute(&mut device, "interface gi0/0");
        assert_eq!(cisco.prompt(&device), "Core-Router(config-if)# ");

        cisco.execute(&mut device, "ip address 192.168.10.1 255.255.255.0");
        cisco.execute(&mut device, "no shutdown");

        // Verify state
        let iface = device.get_interface("gi0/0").unwrap();
        assert_eq!(iface.admin_status, AdminStatus::Up);
        assert_eq!(iface.ipv4_address.unwrap().to_string(), "192.168.10.1/24");

        // 3. Now let's query the device using MikroTik CLI!
        let mt_ip_print = mikrotik.execute(&mut device, "/ip address print");
        assert!(mt_ip_print.output.contains("192.168.10.1/24"));
        assert!(mt_ip_print.output.contains("GigabitEthernet0/0"));

        // 4. Configure Gi0/1 from the MikroTik CLI!
        mikrotik.execute(
            &mut device,
            "/ip address add address=10.0.0.1/24 interface=gi0/1",
        );

        // Verify Gi0/1 in state
        let iface1 = device.get_interface("gi0/1").unwrap();
        assert_eq!(iface1.admin_status, AdminStatus::Up);
        assert_eq!(iface1.ipv4_address.unwrap().to_string(), "10.0.0.1/24");

        // 5. Query the device using Cisco CLI (show ip interface brief)
        cisco.execute(&mut device, "end");
        let cisco_sh_int = cisco.execute(&mut device, "show ip int br");
        assert!(cisco_sh_int.output.contains("192.168.10.1"));
        assert!(cisco_sh_int.output.contains("10.0.0.1"));

        // 6. Test configuration export from both vendors
        let cisco_run = cisco.execute(&mut device, "show run");
        assert!(cisco_run.output.contains("hostname Core-Router"));
        assert!(cisco_run.output.contains("ip address 192.168.10.1 255.255.255.0"));
        assert!(cisco_run.output.contains("ip address 10.0.0.1 255.255.255.0"));

        let mt_export = mikrotik.execute(&mut device, "/export");
        assert!(mt_export.output.contains("/system identity set name=Core-Router"));
        assert!(mt_export.output.contains("/ip address add address=192.168.10.1/24"));
        assert!(mt_export.output.contains("/ip address add address=10.0.0.1/24"));
    }
}
