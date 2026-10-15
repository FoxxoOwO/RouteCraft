use routecraft_core::DeviceState;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CliResponse {
    pub output: String,
    pub is_exit: bool,
}

impl CliResponse {
    pub fn ok(output: impl Into<String>) -> Self {
        Self {
            output: output.into(),
            is_exit: false,
        }
    }

    pub fn empty() -> Self {
        Self {
            output: String::new(),
            is_exit: false,
        }
    }

    pub fn exit() -> Self {
        Self {
            output: String::new(),
            is_exit: true,
        }
    }
}

pub trait CliEngine {
    /// Renders the current command prompt (e.g., "Router# " or "[admin@MikroTik] > ")
    fn prompt(&self, state: &DeviceState) -> String;

    /// Executes a single line of command input and mutates the device state accordingly
    fn execute(&mut self, state: &mut DeviceState, command: &str) -> CliResponse;

    /// Returns tab-completion suggestions for the given input
    fn complete(&self, state: &DeviceState, input: &str) -> Vec<String>;

    /// Returns contextual help ('?') for the given input
    fn help(&self, state: &DeviceState, input: &str) -> String;
}
