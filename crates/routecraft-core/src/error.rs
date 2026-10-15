use thiserror::Error;

#[derive(Error, Debug, Clone, PartialEq, Eq)]
pub enum DeviceError {
    #[error("Interface not found: {0}")]
    InterfaceNotFound(String),

    #[error("Invalid IP address: {0}")]
    InvalidIpAddress(String),

    #[error("Invalid subnet mask: {0}")]
    InvalidSubnetMask(String),

    #[error("Invalid MAC address: {0}")]
    InvalidMacAddress(String),

    #[error("Invalid route: {0}")]
    InvalidRoute(String),

    #[error("Command execution error: {0}")]
    ExecutionError(String),
}
