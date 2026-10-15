use std::cmp::Ordering;
use std::net::Ipv4Addr;
use serde::{Deserialize, Serialize};
use crate::ip::Ipv4Cidr;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum RouteType {
    Connected,
    Static,
    Ospf,
    Rip,
    Bgp,
}

impl RouteType {
    pub fn default_admin_distance(&self) -> u8 {
        match self {
            RouteType::Connected => 0,
            RouteType::Static => 1,
            RouteType::Ospf => 110,
            RouteType::Rip => 120,
            RouteType::Bgp => 20, // eBGP
        }
    }

    pub fn cisco_code(&self) -> &'static str {
        match self {
            RouteType::Connected => "C",
            RouteType::Static => "S",
            RouteType::Ospf => "O",
            RouteType::Rip => "R",
            RouteType::Bgp => "B",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Route {
    pub destination: Ipv4Cidr,
    pub next_hop: Option<Ipv4Addr>,
    pub interface: String,
    pub admin_distance: u8,
    pub metric: u32,
    pub route_type: RouteType,
}

impl Route {
    pub fn new_connected(destination: Ipv4Cidr, interface: impl Into<String>) -> Self {
        Self {
            destination,
            next_hop: None,
            interface: interface.into(),
            admin_distance: RouteType::Connected.default_admin_distance(),
            metric: 0,
            route_type: RouteType::Connected,
        }
    }

    pub fn new_static(
        destination: Ipv4Cidr,
        next_hop: Option<Ipv4Addr>,
        interface: impl Into<String>,
        metric: u32,
    ) -> Self {
        Self {
            destination,
            next_hop,
            interface: interface.into(),
            admin_distance: RouteType::Static.default_admin_distance(),
            metric,
            route_type: RouteType::Static,
        }
    }
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct RoutingTable {
    routes: Vec<Route>,
}

impl RoutingTable {
    pub fn new() -> Self {
        Self { routes: Vec::new() }
    }

    pub fn add_route(&mut self, route: Route) {
        // If exact destination exists with same route_type, replace it
        if let Some(pos) = self.routes.iter().position(|r| r.destination == route.destination && r.route_type == route.route_type) {
            self.routes[pos] = route;
        } else {
            self.routes.push(route);
        }
    }

    pub fn remove_route(&mut self, destination: &Ipv4Cidr) -> Option<Route> {
        if let Some(pos) = self.routes.iter().position(|r| &r.destination == destination) {
            Some(self.routes.remove(pos))
        } else {
            None
        }
    }

    pub fn clear_connected_routes(&mut self) {
        self.routes.retain(|r| r.route_type != RouteType::Connected);
    }

    /// Longest Prefix Match (LPM)
    pub fn lookup(&self, ip: Ipv4Addr) -> Option<&Route> {
        self.routes
            .iter()
            .filter(|r| r.destination.contains(ip))
            .max_by(|a, b| {
                // 1. Longest prefix length wins
                match a.destination.prefix_len.cmp(&b.destination.prefix_len) {
                    Ordering::Equal => {
                        // 2. Lower administrative distance wins
                        match b.admin_distance.cmp(&a.admin_distance) {
                            Ordering::Equal => {
                                // 3. Lower metric wins
                                b.metric.cmp(&a.metric)
                            }
                            other => other,
                        }
                    }
                    other => other,
                }
            })
    }

    pub fn iter(&self) -> impl Iterator<Item = &Route> {
        self.routes.iter()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_longest_prefix_match() {
        let mut table = RoutingTable::new();

        // Default route 0.0.0.0/0
        table.add_route(Route::new_static(
            "0.0.0.0/0".parse().unwrap(),
            Some(Ipv4Addr::new(192, 168, 1, 254)),
            "gi0/0",
            1,
        ));

        // 10.0.0.0/8
        table.add_route(Route::new_static(
            "10.0.0.0/8".parse().unwrap(),
            Some(Ipv4Addr::new(10, 0, 0, 1)),
            "gi0/1",
            1,
        ));

        // 10.1.0.0/16
        table.add_route(Route::new_static(
            "10.1.0.0/16".parse().unwrap(),
            Some(Ipv4Addr::new(10, 1, 0, 1)),
            "gi0/2",
            1,
        ));

        // Should match 10.1.0.0/16 (longest prefix)
        let r1 = table.lookup(Ipv4Addr::new(10, 1, 2, 3)).unwrap();
        assert_eq!(r1.interface, "gi0/2");

        // Should match 10.0.0.0/8
        let r2 = table.lookup(Ipv4Addr::new(10, 2, 2, 3)).unwrap();
        assert_eq!(r2.interface, "gi0/1");

        // Should match default route
        let r3 = table.lookup(Ipv4Addr::new(8, 8, 8, 8)).unwrap();
        assert_eq!(r3.interface, "gi0/0");
    }
}
